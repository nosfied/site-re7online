"""Future preparation review, local only. Produces plans, never copies artifacts or deploys."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/reviews/automation-freeform-window-release-af26'
DEPENDENCIES = {
    'capacity': ('dynamic-integrated-prepared-20261012/capacity_budget.py', '58d621121124481b9d3040321a131511b8e88918f49c16175dad716fb4b10a83'),
    'saved': ('security-containment-20261012/saved_reference_capture.py', '36e29e431ebdb8afeea5f034c4e1291739e50ab887c02b17b5de250832f93aa8'),
    'references': ('security-containment-20261012/retention-audit-20261013/third-withdrawal/references.py', '07c14ea6db6fbe1e918128258a422e385690384b08eff9d5de0e62e9871b0683'),
}


def load(name, path, digest=None):
    if digest and hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('reused_component_hash_drift')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capacity, saved, references = [load(name, REVIEW / value[0], value[1])
                               for name, value in DEPENDENCIES.items()]
reporter = load('retention_report', ROOT / 'scripts/operational-retention-report.py')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(value):
    require(isinstance(value, str) and len(value) == 64 and
            all(c in '0123456789abcdef' for c in value), 'invalid_sha256')
    return value


def allocation(report):
    require(report['metadataCompleteWithinBudget'], 'inventory_incomplete')
    require(not report['errors'], 'inventory_errors')
    return report['uniqueAllocatedBytes']


def private_capture(path):
    first = saved.observe(path)
    require(stat.S_IMODE(first[1][4]) == 0o600, 'private_capture_mode_invalid')
    require(first == saved.observe(path), 'private_capture_changed')
    return first


def artifact_hash(path):
    p = Path(os.path.abspath(path))
    require(p.resolve() == p, 'artifact_symlink')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode), 'artifact_type_invalid')
        h = hashlib.sha256()
        with os.fdopen(fd, 'rb', closefd=False) as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                h.update(chunk)
        after, current = os.fstat(fd), p.lstat()
        stamp = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        require(stamp(before) == stamp(after) == stamp(current), 'artifact_changed')
        return h.hexdigest()
    finally:
        os.close(fd)


def context_review(observation, expected):
    require(observation['pm2CaptureUid'] == expected['uid'], 'pm2_capture_context_mismatch')
    require(len(observation['samples']) == 2, 'two_context_samples_required')
    for sample in observation['samples']:
        require(sample['complete'] is True and not sample['incomplete'], 'context_observation_incomplete')
        require(sample['processes'] == expected['processes'], 'process_identity_or_configuration_drift')
    return {'result': 'EXPORTED_CONTEXT_MATCH', 'productionCertified': False}


def reuse_decision(request):
    """Hashes plus runtime/dependencies/contract: byte equality alone is insufficient."""
    expected = request['expected']
    sha(expected['sha256']); sha(expected['dependenciesSha256'])
    require(not request.get('newLinks') or request.get('linkContractReviewed') is True,
            'new_links_contract_not_reviewed')
    for found in request['existing']:
        raw, _ = private_capture(found['dependenciesCapturePath'])
        require(hashlib.sha256(raw).hexdigest() == sha(found['dependenciesSha256']), 'dependencies_manifest_hash_drift')
        require(artifact_hash(found['path']) == sha(found['sha256']), 'existing_artifact_hash_drift')
        if all(found.get(k) == expected[k] for k in ('sha256', 'runtime', 'dependenciesSha256', 'contract')):
            if request['reusePermitted']:
                return {'action': 'REUSE', 'source': found['path'], 'newCopyBytes': 0}
    require(bool(request.get('justification', '').strip()), 'new_copy_justification_required')
    require(type(request['newCopyAllocatedBytes']) is int and request['newCopyAllocatedBytes'] >= 0,
            'copy_budget_invalid')
    require(not request.get('newLinks') or request.get('linkContractReviewed') is True,
            'new_links_contract_not_reviewed')
    return {'action': 'PREPARE_COPY_FOR_REVIEW', 'reason': request['justification'],
            'newCopyBytes': request['newCopyAllocatedBytes']}


def capacity_review(samples, budgets):
    # Budgets are explicit independent rubrics, not a historic phase's hardcoded floor.
    require(bool(samples) and bool(budgets), 'capacity_evidence_missing')
    by_fs = {}
    for s in samples:
        require(s['complete'] is True and s['freshForReview'] is True, 'capacity_capture_incomplete_or_stale')
        require(s['walAndGrowthReviewed'] is True and s['writeErrors'] == 0, 'wal_or_growth_not_reviewed')
        require(bool(s['atUtc']), 'capacity_time_missing')
        pair = (s['filesystem'], s['executor'])
        require(pair not in by_fs, 'capacity_sample_duplicate')
        require(s['executor'] in ('deploy', 'postgres'), 'unknown_executor')
        require(type(s['availableBytes']) is int and s['availableBytes'] >= 0, 'capacity_bytes_invalid')
        by_fs[pair] = s['availableBytes']
    results = []
    for fs, b in budgets.items():
        require(bool(b['reserveSource']) and bool(b['phase']), 'reserve_provenance_required')
        amounts = [b[k] for k in ('canonicalReserveBytes', 'stagingBytes', 'returnBytes',
                                  'backupBytes', 'walGrowthBytes', 'evidenceBytes')]
        require(all(type(n) is int and n >= 0 for n in amounts), 'budget_invalid')
        require(b['nonOverlappingRubrics'] is True, 'budget_overlap')
        require((fs, 'deploy') in by_fs and (fs, 'postgres') in by_fs, 'executor_capacity_missing')
        value = capacity.budget(sum(amounts), by_fs[(fs, 'deploy')], by_fs[(fs, 'postgres')])
        require(value['budgetFitsNow'], 'capacity_denied')
        results.append(dict(value, filesystem=fs, phase=b['phase'], reserveSource=b['reserveSource']))
    return results


def reference_review(nodes, sources, roots):
    resolver = references.Resolver(nodes)
    edges, provenance = {}, {}
    for source in sources:
        require(source['path'] not in edges, 'duplicate_reference_source')
        # Capture files are local private exports, not PM2 calls or application entrypoints.
        raw, stamp = private_capture(source['capturePath'])
        require(hashlib.sha256(raw).hexdigest() == sha(source['sha256']), 'reference_source_hash_drift')
        result = resolver.read(source['path'], raw.decode('utf-8'), source.get('link'))
        require(not result['relativeFileFields'], 'ambiguous_relative_binding')
        edges[source['path']] = result['targets']
        provenance[source['path']] = source['sha256']
    protected, pending = set(), list(roots)
    while pending:
        n = pending.pop()
        if n in protected:
            continue
        require(n in nodes, 'reference_root_missing')
        protected.add(n)
        require(n in edges, 'reachable_reference_source_missing')
        pending.extend(edges[n])
    return {'protected': sorted(protected), 'provenance': provenance,
            'scope': 'exact local exported sources only; no production observation certificate'}


def classify(state, materials, protected):
    require(state in ('ACTIVE', 'STANDBY', 'READY', 'REVIEW', 'CONSUMED', 'REFUSED', 'SUPERSEDED'), 'state_invalid')
    results = []
    for material in materials:
        path = material['path']
        keep = (path in protected or material['kind'] in ('control', 'manifest', 'journal', 'receipt', 'evidence')
                or material.get('neededOnHost') is True)
        custody = material.get('custody', {})
        if keep:
            status, reason = 'HOST_REQUIRED', 'explicit_dependency_or_protected_material'
        elif state in ('ACTIVE', 'STANDBY', 'READY', 'REVIEW'):
            status, reason = 'UNRESOLVED', 'generation_not_closed'
        elif custody.get('ownerAccessible') is True and custody.get('restoreVerified') is True:
            sha(custody['indexSha256']); sha(custody['contentSha256'])
            require(bool(custody['locator']), 'custody_locator_missing')
            status, reason = 'ARCHIVABLE_FOR_REVIEW', 'closed_generation_with_verified_custody'
        else:
            status, reason = 'UNRESOLVED', 'custody_or_restore_missing'
        results.append({'path': path, 'classification': status, 'reason': reason,
                        'withdrawalAuthorized': False})
    return results


def prepare(value):
    require(value['localOnly'] is True, 'local_only_required')
    require(bool(value['generation']) and bool(value['purpose']) and bool(value['responsible'])
            and bool(value['owner']), 'lifecycle_identity_missing')
    last = datetime.date.fromisoformat(value['lastReview'])
    next_review = datetime.date.fromisoformat(value['nextReview'])
    require(last < next_review <= last + datetime.timedelta(days=7), 'weekly_review_invalid')
    context = context_review(value['contextObservation'], value['expectedContext'])
    decisions = [reuse_decision(r) for r in value['artifacts']]
    capacities = capacity_review(value['capacitySamples'], value['budgets'])
    refs = reference_review(value['referenceNodes'], value['referenceSources'], value['referenceRoots'])
    inventory = reporter.inventory(value['inventoryRoots'])
    allocated = allocation(inventory)
    per_device = {}
    for item in inventory['objects']:
        key = str(item['device'])
        per_device[key] = per_device.get(key, 0) + item['allocatedBytes']
    copy_bytes = sum(d['newCopyBytes'] for d in decisions)
    require(copy_bytes <= sum(b['stagingBytes'] for b in value['budgets'].values()), 'copy_exceeds_staging_budget')
    return {'result': 'LOCAL_PREPARATION_REVIEW_PASS', 'productionCertified': False,
            'generation': value['generation'], 'purpose': value['purpose'], 'state': value['state'],
            'responsible': value['responsible'], 'owner': value['owner'],
            'lastReview': value['lastReview'], 'nextReview': value['nextReview'],
            'allocatedBytes': allocated, 'allocatedBytesByDevice': per_device, 'artifactDecisions': decisions, 'capacity': capacities,
            'context': context, 'references': refs, 'materials': classify(value['state'], value['materials'], refs['protected']),
            'inventory': inventory, 'executionAuthorized': False,
            'reusedComponents': {n: v[1] for n, v in DEPENDENCIES.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--input-sha256', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--dry-run', required=True, action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    output = Path(os.path.abspath(args.output))
    directory = reporter.private_output_directory(output.parent)
    try:
        reporter.ensure_new_output(directory, output.name)
        raw, stamp = private_capture(args.input)
        require(hashlib.sha256(raw).hexdigest() == sha(args.input_sha256), 'input_hash_drift')
        value = json.loads(raw)
        require(not any(output.is_relative_to(Path(os.path.abspath(r))) for r in value['inventoryRoots']),
                'output_inside_inventory')
        result = prepare(value)
        current = reporter.private_output_directory(output.parent)
        try:
            a, b = os.fstat(directory), os.fstat(current)
            require((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino), 'output_directory_drift')
        finally:
            os.close(current)
        fd = os.open(output.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, 'w') as f:
            json.dump(dict(result, inputSha256=args.input_sha256), f, sort_keys=True)
            f.write('\n')
    finally:
        os.close(directory)
    print(json.dumps({'result': result['result'], 'executionAuthorized': False, 'productionCertified': False}))


if __name__ == '__main__':
    main()
