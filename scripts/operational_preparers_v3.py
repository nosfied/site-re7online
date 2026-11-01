"""New local API/frontend preparation adapters and auth/database closure adapters.
No production transport, entrypoint import, policy installation, cron or cleanup.
"""
import argparse
import copy
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tarfile


HERE = Path(__file__).resolve().parent
preparation_spec = importlib.util.spec_from_file_location(
    'preparation_artifact_lifecycle', HERE / 'preparation_artifact_lifecycle.py')
preparation_lifecycle = importlib.util.module_from_spec(preparation_spec)
preparation_spec.loader.exec_module(preparation_lifecycle)
COORDINATOR_SHA = 'cbcb7896adeb9a90504c78c4c043644486a311a4d0c7daa9b9bcfd3b1e7a2cbc'
p = HERE / 'operational_preparation_review.py'
if hashlib.sha256(p.read_bytes()).hexdigest() != COORDINATOR_SHA:
    raise ValueError('coordinator_version_drift')
spec = importlib.util.spec_from_file_location('coordinator_v2', p)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
require = c.require


def exclusive_json(directory, name, value):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f, sort_keys=True)
        f.write('\n'); f.flush(); os.fsync(f.fileno())


def pointer(value, path):
    require(path == '' or path.startswith('/'), 'capture_pointer_invalid')
    for part in path.split('/')[1:] if path else []:
        part = part.replace('~1', '/').replace('~0', '~')
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def read_source(source):
    raw, _ = c.private_capture(source['capturePath'])
    require(hashlib.sha256(raw).hexdigest() == c.sha(source['sha256']), 'canonical_capture_hash_drift')
    return raw


def timestamp(value):
    if type(value) in (int, float):
        return datetime.datetime.fromtimestamp(value, datetime.timezone.utc)
    require(isinstance(value, str), 'capture_time_invalid')
    dt = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(dt.tzinfo is not None, 'capture_timezone_missing')
    return dt


def captured_input(value, now):
    """No caller-authored normalized observation can replace its original hashed capture."""
    result = copy.deepcopy(value['review'])
    provenance = {}
    # Scalar bindings inside each captured field use JSON pointers; no configuration regeneration.
    expected_fields = {'contextObservation', 'capacitySamples'}
    require(set(value['captureBindings']) == expected_fields, 'required_capture_bindings_missing')
    ttl = value['maxCaptureAgeSeconds']
    require(type(ttl) is int and 0 < ttl <= 3600, 'capture_freshness_budget_invalid')
    for field, binding in value['captureBindings'].items():
        raw = read_source(binding); capture = json.loads(raw)
        at = timestamp(pointer(capture, binding['timePointer']))
        require(0 <= (now - at).total_seconds() <= ttl, 'canonical_capture_stale_or_future')
        result[field] = pointer(capture, binding['valuePointer'])
        provenance[field] = {'sha256': binding['sha256'], 'valuePointer': binding['valuePointer'],
                             'timePointer': binding['timePointer'], 'capturedAt': at.isoformat()}
    # Exact exported source bytes and canonical saved/fallback observations remain mandatory.
    require(bool(result['referenceRoots']) and bool(result['referenceSources']), 'reference_capture_missing')
    pair = value['savedFallback']
    require(len(pair) == 2 and {s['role'] for s in pair} == {'saved', 'fallback'}, 'saved_fallback_pair_required')
    for source in pair:
        raw = read_source(source)
        rows = json.loads(raw)
        require(isinstance(rows, list) and bool(rows), 'saved_fallback_format_invalid')
        original = '/home/deploy/.pm2/' + ('dump.pm2' if source['role'] == 'saved' else 'dump.pm2.bak')
        linked = [s for s in result['referenceSources'] if s['path'] == original]
        require(len(linked) == 1 and linked[0]['sha256'] == source['sha256'], 'saved_fallback_reference_not_bound')
        require(original in result['referenceRoots'], 'saved_fallback_root_missing')
        provenance[source['role']] = {'sha256': source['sha256'], 'bytes': len(raw)}
    return result, provenance


def evaluate(value, now):
    review, sources = captured_input(value, now)
    result = c.prepare(review)
    # Every material must exist in the captured graph's universe, even when not reached.
    require(all(m['path'] in review['referenceNodes'] for m in review['materials']), 'material_outside_reference_inventory')
    result['canonicalCaptures'] = sources
    return review, result


def local_generation(parent, name):
    require(name and Path(name).name == name and name not in ('.', '..'), 'generation_name_invalid')
    require(not os.path.lexists(parent / name), 'generation_already_exists')
    return parent / name


def operation_guard(review, operations, decisions):
    """Seal the mutation recipe before the first step, not after a partial copy."""
    budget = sum(b['stagingBytes'] for b in review['budgets'].values())
    proposed = 0
    names = set()
    for op in operations:
        require(op['kind'] in ('copy', 'build', 'tar'), 'operation_kind_invalid')
        if op['kind'] in ('copy', 'tar'): literal_name(op['target'])
        if op['kind'] == 'tar':
            require(bool(op['members']) and len(op['members']) == len(set(op['members'])), 'tar_members_invalid')
            for name in op['members']:
                literal_name(name); c.sha(op['memberSha256'][name])
        index = op['artifactIndex']
        require(type(index) is int and 0 <= index < len(review['artifacts']), 'operation_artifact_binding_missing')
        request = review['artifacts'][index]
        require(decisions[index]['action'] != 'REUSE', 'mutation_of_reusable_artifact_denied')
        require(op['allocatedBudgetBytes'] <= request['newCopyAllocatedBytes'], 'operation_artifact_budget_exceeded')
        if op['kind'] == 'copy':
            source = Path(op['source'])
            require(source.resolve() == source and stat.S_ISREG(source.lstat().st_mode), 'copy_source_not_literal_regular')
            # New independent copies allocate their full length, even for a sparse source.
            block = os.statvfs(source).f_frsize
            dense_bytes = ((source.stat().st_size + block - 1) // block) * block
            require(dense_bytes <= op['allocatedBudgetBytes'], 'copy_dense_allocation_exceeds_budget')
            require(op['sourceSha256'] == request['expected']['sha256'], 'copy_not_bound_to_reviewed_artifact')
            require(op['source'] in [x['path'] for x in request['existing']], 'copy_source_not_reviewed')
        require(op['name'] not in names, 'duplicate_operation')
        names.add(op['name'])
        require(bool(op['reason']), 'operation_justification_missing')
        require(type(op['allocatedBudgetBytes']) is int and op['allocatedBudgetBytes'] >= 0, 'operation_budget_invalid')
        proposed += op['allocatedBudgetBytes']
        require(not op.get('newLinks') or op.get('linkContractReviewed') is True, 'operation_link_contract_missing')
    require(proposed <= budget, 'operations_exceed_staging_budget')


def preparation_adapter(kind, value, parent, runners, now=None):
    """Single future preparation entrypoint: each reviewed mutation is behind a fresh gate."""
    require(kind in ('api', 'frontend'), 'preparation_kind_invalid')
    now = now or datetime.datetime.now(datetime.timezone.utc)
    parent = Path(os.path.abspath(parent))
    directory = c.reporter.private_output_directory(parent)
    lock = None
    generation = None
    output = None
    lifecycle_contract = None
    lifecycle_path = None
    denial_name = None
    try:
        lock = os.open('.future-preparation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        z = os.fstat(lock)
        require(stat.S_ISREG(z.st_mode) and z.st_uid == os.geteuid() and stat.S_IMODE(z.st_mode) == 0o600, 'lock_owner_type_mode')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        name = literal_name(value['review']['generation'])
        denial_name = name + '.denial.private.json'
        c.reporter.ensure_new_output(directory, denial_name)
        review, result = evaluate(value, now)
        require(review['state'] in ('READY', 'REVIEW'), 'preparation_state_invalid')
        operations = value['operations']; operation_guard(review, operations, result['artifactDecisions'])
        reservation = {'reservedBytes': 0, 'reservedInodes': 0,
                       'requiredBytes': 0, 'requiredInodes': 0}
        if operations:
            binding = value.get('preparationArtifactContract')
            require(isinstance(binding, dict) and set(binding) == {'path', 'sha256'},
                    'preparation_artifact_contract_binding_missing')
            lifecycle_contract, _ = preparation_lifecycle.stable_contract(
                Path(binding['path']), binding['sha256'])
            require(lifecycle_contract['generationId'] == review['generation'],
                    'preparation_artifact_generation_drift')
            reservation = preparation_lifecycle.validate_existing_lifecycles(parent, lifecycle_contract)
        require(all(op['kind'] in runners for op in operations), 'operation_runner_missing')
        generation = local_generation(parent, review['generation'])
        if operations:
            preparation_lifecycle.authenticate_operations(lifecycle_contract, operations, generation)
        require(not any(generation.is_relative_to(Path(os.path.abspath(r))) for r in review['inventoryRoots']), 'generation_inside_inventory')
        os.mkdir(generation.name, mode=0o700, dir_fd=directory)
        output = c.reporter.private_output_directory(generation)
        if operations:
            lifecycle_path = generation / 'preparation-artifacts.lifecycle.private.json'
            exclusive_json(output, lifecycle_path.name,
                           preparation_lifecycle.lifecycle_value(lifecycle_contract, 'OPEN', 'CREATION_STARTED'))
        exclusive_json(output, 'before.private.json', dict(result, adapter=kind, coordinatorSha256=COORDINATOR_SHA))
        exclusive_json(output, 'preparation-capacity.private.json', reservation)
        exclusive_json(output, 'operations.intent.private.json', {'operations': operations, 'automaticRetry': False})
        for i, operation in enumerate(operations):
            # Reread exact sources and inputs, reject drift/staleness at every boundary.
            latest_review, latest = evaluate(value, datetime.datetime.now(datetime.timezone.utc) if value.get('clockMode') != 'synthetic-test' else now)
            require(latest['canonicalCaptures'] == result['canonicalCaptures'], 'capture_provenance_drift')
            operation_guard(latest_review, operations, latest['artifactDecisions'])
            exclusive_json(output, 'gate-%03d.private.json' % i, dict(latest, operation=operation['name']))
            current = c.reporter.private_output_directory(generation)
            try:
                a, b = os.fstat(output), os.fstat(current)
                require((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino), 'generation_directory_drift')
            finally: os.close(current)
            runners[operation['kind']](operation, generation)
        # Post-staging inventory uses the existing reader; no atomic/production PASS is inferred.
        inventory = c.reporter.inventory([generation])
        require(inventory['metadataCompleteWithinBudget'], 'post_inventory_incomplete')
        allocated = c.allocation(inventory)
        staging_budget = sum(b['stagingBytes'] + b['evidenceBytes'] for b in review['budgets'].values())
        require(allocated <= staging_budget, 'actual_staging_allocation_exceeds_budget')
        exclusive_json(output, 'prepared.private.json', {'result': 'LOCAL_PREPARED', 'adapter': kind,
                         'inventory': inventory, 'executionAuthorized': False, 'automaticRetry': False})
        return {'result': 'LOCAL_PREPARED', 'adapter': kind, 'executionAuthorized': False}
    except BaseException as e:
        if output is not None:
            if lifecycle_path is not None and lifecycle_contract is not None:
                preparation_lifecycle.replace_lifecycle(
                    lifecycle_path,
                    preparation_lifecycle.lifecycle_value(lifecycle_contract, 'RETENTION_DEBT',
                                                          'CREATION_INTERRUPTED', type(e).__name__))
            exclusive_json(output, 'denial.private.json', {'result': 'DENY', 'errorClass': type(e).__name__,
                           'automaticRetry': False, 'partialGenerationPreserved': True})
        elif denial_name is not None:
            try:
                exclusive_json(directory, denial_name, {'result': 'DENY', 'state': 'REFUSED',
                    'adapter': kind, 'errorClass': type(e).__name__, 'automaticRetry': False,
                    'noArtifactMutation': True, 'classification': 'KEEP_UNRESOLVED_NO_WITHDRAWAL'})
            except FileExistsError: pass  # Original refusal is never overwritten.
        raise
    finally:
        if output is not None: os.close(output)
        if lock is not None: os.close(lock)
        os.close(directory)


def prepare_api(value, parent, runners, now=None):
    return preparation_adapter('api', value, parent, runners, now)


def prepare_frontend(value, parent, runners, now=None):
    return preparation_adapter('frontend', value, parent, runners, now)


def closure_receipts(kind, value, review):
    closure = value['closure']
    original = Path(closure['generationPath'])
    require(original.is_absolute() and original.name == review['generation'], 'closure_generation_binding_drift')
    require(closure['journal']['originalPath'] == str(original / 'window/sequencer.journal.jsonl'), 'closure_journal_binding_drift')
    journal_raw = read_source(closure['journal'])
    journal = [json.loads(line) for line in journal_raw.splitlines() if line]
    require(bool(journal), 'journal_empty')
    events = [r.get('event') for r in journal]
    state = review['state']
    if state == 'CONSUMED':
        require('complete' in events, 'closure_not_completed')
        complete = max(i for i, r in enumerate(journal) if r.get('event') == 'complete')
        require(not any(e in ('failure', 'recovery_blocked', 'post_open_failure_no_automatic_return') for e in events[complete + 1:]), 'failure_after_complete')
        require(journal[complete].get('guardGeneration') == 38, 'closure_guard_generation_drift')
    else:
        require(state in ('REFUSED', 'SUPERSEDED'), 'closure_state_invalid')
        require(value['closure'].get('disposition') in ('refused', 'superseded'), 'closure_disposition_missing')
    if kind == 'database' and state == 'CONSUMED':
        require(closure['databaseReceipt']['originalPath'] == str(original / 'window/credential-commit.receipt.private.json'), 'closure_database_receipt_binding_drift')
        receipt = json.loads(read_source(closure['databaseReceipt']))
        require(receipt['verification'] == {'result': 'VERIFIED', 'usesNewCredentials': True,
                                            'oldCredentialReactivation': False}, 'database_not_verified')
        require(receipt['planSha256'] == c.sha(value['closure']['expectedPlanSha256']), 'database_plan_drift')
    return {'journalSha256': value['closure']['journal']['sha256'], 'state': state}


def closure_adapter(kind, value, output, now=None):
    """Record only: never run auth/DB sequencers, ALTER ROLE, recovery or process controls."""
    require(kind in ('auth', 'database'), 'closure_kind_invalid')
    output = Path(os.path.abspath(output))
    directory = c.reporter.private_output_directory(output.parent)
    try:
        c.reporter.ensure_new_output(directory, output.name)
        review, result = evaluate(value, now or datetime.datetime.now(datetime.timezone.utc))
        evidence = closure_receipts(kind, value, review)
        current = c.reporter.private_output_directory(output.parent)
        try:
            a, b = os.fstat(directory), os.fstat(current)
            require((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino), 'closure_directory_drift')
        finally: os.close(current)
        exclusive_json(directory, output.name, dict(result, adapter=kind, closure=evidence,
                       result='LOCAL_CLOSURE_RECORDED', executionAuthorized=False))
    finally:
        os.close(directory)
    return {'result': 'LOCAL_CLOSURE_RECORDED', 'adapter': kind, 'executionAuthorized': False}


def close_auth(value, output, now=None):
    return closure_adapter('auth', value, output, now)


def close_database(value, output, now=None):
    return closure_adapter('database', value, output, now)


def literal_name(name):
    require(isinstance(name, str) and name and Path(name).name == name and name not in ('.', '..'), 'literal_artifact_name_required')
    return name


def local_copy(op, generation):
    source = Path(op['source'])
    require(c.artifact_hash(source) == c.sha(op['sourceSha256']), 'copy_source_drift')
    target = generation / literal_name(op['target'])
    incoming_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(incoming_fd)
        require(stat.S_ISREG(before.st_mode), 'copy_source_type_drift')
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        digest = hashlib.sha256()
        with os.fdopen(fd, 'wb') as out, os.fdopen(incoming_fd, 'rb', closefd=False) as incoming:
            for data in iter(lambda: incoming.read(1024 * 1024), b''):
                digest.update(data); out.write(data)
            out.flush(); os.fsync(out.fileno())
        after = os.fstat(incoming_fd)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'copy_source_changed')
        require(digest.hexdigest() == op['sourceSha256'] == c.artifact_hash(target), 'copy_output_drift')
    finally: os.close(incoming_fd)


def local_tar(op, generation):
    names = [literal_name(n) for n in op['members']]
    require(names and len(names) == len(set(names)), 'tar_members_invalid')
    for name in names:
        require(c.artifact_hash(generation / name) == c.sha(op['memberSha256'][name]), 'tar_member_drift')
    target = generation / literal_name(op['target'])
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as out:
        with tarfile.open(fileobj=out, mode='w') as archive:
            for name in names: archive.add(generation / name, arcname=name, recursive=False)
        out.flush(); os.fsync(out.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adapter', choices=('api', 'frontend', 'auth', 'database'), required=True)
    parser.add_argument('--input', required=True); parser.add_argument('--input-sha256', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--local-only', action='store_true', required=True)
    args = parser.parse_args(); os.umask(0o077)
    raw, _ = c.private_capture(args.input)
    require(hashlib.sha256(raw).hexdigest() == c.sha(args.input_sha256), 'adapter_input_hash_drift')
    value = json.loads(raw)
    require(value.get('clockMode') != 'synthetic-test', 'synthetic_clock_not_allowed_in_cli')
    if args.adapter in ('api', 'frontend'):
        # Compiled artifacts are reused. No functional build runner is installed in this CLI.
        result = preparation_adapter(args.adapter, value, args.output, {'copy': local_copy, 'tar': local_tar})
    else: result = closure_adapter(args.adapter, value, args.output)
    print(json.dumps(result))


if __name__ == '__main__':
    try: main()
    except Exception as e:
        print(json.dumps({'result': 'DENY', 'errorClass': type(e).__name__, 'automaticRetry': False}))
        raise SystemExit(1)
