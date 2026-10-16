"""Copy/transform only accepted code into a NEW offline kit. No profiles or transport.
Never invokes historical composers, operation entrypoints, builds or package tools.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

BASE = '6bcf122ca5e5992769e67c1158208408b9c0b15b'
HERE = Path(__file__).resolve().parent
REVIEW = HERE.parent
REPO = HERE.parents[3]
ACCEPTED = REVIEW / 'crm-csv-integrated-recovery-20261016'
SOURCE = REPO / 'local-evidence/crm-csv-operational-20261016/incident-csv-operational-review-v3-20261016'
MODES = ('switch', 'return', 'return-partial', 'return-before-commit')
MAX_CONTROL_BYTES = 8 * 1024 * 1024


def require(ok, why):
    if not ok:
        raise RuntimeError(why)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def raw(path):
    path = Path(path); meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and not path.is_symlink(), 'source_not_regular')
    return path.read_bytes()


def pure(text):
    tree = ast.parse(text)
    require(all(isinstance(n, (ast.Import, ast.FunctionDef)) or
                isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant)
                for n in tree.body), 'transform_not_pure_definitions')
    values = {}; exec(compile(tree, '<pure-code-transform>', 'exec'), values)
    return values


def ast_class(text, name):
    return next(n for n in ast.parse(text).body if isinstance(n, ast.ClassDef) and n.name == name)


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()


def compose(out):
    out = Path(out).absolute()
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() == BASE,
            'base_head_changed')
    meta = out.parent.lstat()
    require(stat.S_ISDIR(meta.st_mode) and meta.st_uid == os.getuid() and
            stat.S_IMODE(meta.st_mode) == 0o700 and not out.parent.is_symlink(), 'private_output_parent')
    require(not os.path.lexists(out), 'new_output_required')
    acceptance = json.loads(raw(ACCEPTED / 'local-acceptance-20261016/CHECKS.json'))
    require(acceptance['decision'] == 'ACCEPT LOCAL', 'local_acceptance_required')
    acceptance_manifest = (ACCEPTED / 'local-acceptance-20261016/MANIFEST.sha256').read_text()
    for line in acceptance_manifest.splitlines():
        digest, name = line.split('  ', 1)
        require(sha(raw(ACCEPTED / 'local-acceptance-20261016' / name)) == digest, 'acceptance_bytes_changed')
    for name, digest in acceptance['reviewedFilesSha256'].items():
        require(sha(raw(ACCEPTED / name)) == digest, 'accepted_file_changed')
    for name, digest in acceptance['artifactSha256'].items():
        require(sha(raw(ACCEPTED / name)) == digest, 'accepted_artifact_changed')
    spec = json.loads(raw(ACCEPTED / 'SOURCE_PROVENANCE.json'))
    provenance = {}; code = {}

    def versioned(name):
        entry = spec['versioned'][name]
        value = subprocess.check_output(['git', 'show', entry['commit'] + ':' + entry['path']], cwd=REPO)
        require(sha(value) == entry['sha256'], 'versioned_source_hash_drift')
        return value.decode()

    original_proof_path = str(REVIEW.relative_to(REPO) / 'crm-csv-operational-20261016/PROOFS_SANITIZED.json')
    historical_proof = json.loads(subprocess.check_output(['git', 'show', BASE + ':' + original_proof_path], cwd=REPO))
    index_bytes = raw(SOURCE.parent / 'csv-operational-controls-v3.index.private.json')
    require(sha(index_bytes) == historical_proof['controlIndexSha256'], 'template_index_not_pinned_to_git_proof')
    index = json.loads(index_bytes)
    require(index['reviewSha256'] == historical_proof['reviewSha256'], 'template_review_not_pinned_to_git_proof')
    require(sha(raw(SOURCE / 'preparation-review.sha256')) == index['reviewSha256'], 'unconsumed_template_review_drift')
    source_index = {e['path']: e['sha256'] for e in index['files']}
    # Only this explicitly unconsumed local code template is used. No generation
    # from the consumed VPS staging/recovery is read or copied.
    require(not any(f.name.endswith(('.json', '.jsonl')) and
                    any(tag in f.name for tag in ('intent', 'receipt', 'journal'))
                    for f in SOURCE.rglob('*') if f.is_file()), 'source_not_unconsumed_template')

    def template(name):
        value = raw(SOURCE / name)
        require(name in source_index and sha(value) == source_index[name], 'template_code_hash_drift')
        return value.decode()

    def add(name, text, origin, before=None):
        require(name not in code and not Path(name).is_absolute() and '..' not in Path(name).parts, 'code_path_collision')
        require(not re.search(r'\b(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}', text), 'secret_shaped_code_denied')
        require('/home/deifson-oliveira/' not in text, 'unnecessary_private_path')
        if name.endswith('.py'): ast.parse(text, filename=name)
        code[name] = text.encode()
        provenance[name] = {'origin': origin, 'outputSha256': sha(code[name]),
                            'sourceSha256': sha((before if before is not None else text).encode()),
                            'transformed': before is not None and before != text}

    future = pure(raw(ACCEPTED / 'future_sources.py').decode())
    prevention = pure(versioned('prevention_sources.py'))
    common_accepted = ('recovery.py', 'recovery_contract.py', 'recovery_bridge.py', 'recovery_start.py', 'original_checks.py')
    for name in common_accepted:
        add('code/window/' + name, raw(ACCEPTED / name).decode(), 'ACCEPT_LOCAL/' + name)
    add('proposal/policy_proposal.py', raw(ACCEPTED / 'policy_proposal.py').decode(), 'ACCEPT_LOCAL/policy_proposal.py')
    for name in ('baseline_contract.py', 'scheduled_controls.py', 'prestop_contract.py', 'csv_boundary.py', 'privileged_output.py'):
        # privileged_output is part of the verified unconsumed template, not one
        # of the pure source references recorded by the local test harness.
        text = template('window/' + name) if name == 'privileged_output.py' else versioned(name)
        add('code/window/' + name, text, 'PINNED_CANONICAL/' + name)
    text = versioned('ecosystem_contract.py')
    ecosystem = text.replace("MODES = ('switch', 'return', 'return-partial')", "MODES = ('switch', 'return', 'return-partial', 'return-before-commit')")
    require(text != ecosystem, 'ecosystem_mode_anchor_missing')
    add('code/window/ecosystem_contract.py', ecosystem, 'ACCEPT_LOCAL_FOUR_MODE_ECOSYSTEM', text)
    cli = versioned('csv_cli.py')
    add('code/window/csv_cli.py', future['csv_cli'](prevention['csv_cli'](cli)), 'ACCEPT_LOCAL_TRANSFORM/csv_cli', cli)
    seq = versioned('sequencer.py')
    add('code/window/sequencer.py', future['sequencer'](seq), 'ACCEPT_LOCAL_TRANSFORM/sequencer', seq)
    check = versioned('check_current_original.py')
    add('code/window/check_current.py', prevention['check_current'](check), 'PRESTOP_PREVENTION/check_current', check)
    event = versioned('event_overlay.py')
    add('code/window/event_overlay.py', prevention['event_overlay'](event), 'PRESTOP_PREVENTION/event_overlay', event)
    gate = next(n.args[0].value for n in ast.walk(ast.parse(versioned('compose.py'))) if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute) and n.func.attr == 'write_text' and n.args
                and isinstance(n.args[0], ast.Constant) and isinstance(n.args[0].value, str)
                and 'def authorize_start(d)' in n.args[0].value)
    add('code/window/csv_start_gate.py', future['start_gate'](gate), 'ACCEPT_LOCAL_TRANSFORM/start_gate', gate)
    already = {Path(n).name for n in code if n.startswith('code/window/')}
    for name in ('csv_contract.py', 'restore_contract.py', 'capture_imports.py', 'admit_gates.py',
                 'pre_install.py', 'root_readonly.py', 'automation-fence.nft', 'privileged.py', 'canonical_renew_proofs.py'):
        require(name not in already, 'common_source_overlap')
        add('code/window/' + name, template('window/' + name), 'UNCONSUMED_TEMPLATE_CODE/window/' + name)

    modes = json.loads(raw(SOURCE / 'window/mode-names.private.json'))
    op_reference = raw(ACCEPTED / 'reference_sources/operations_recovery_original.py').decode()
    required = {}; operations_exact = {}
    for mode in MODES:
        required[mode] = [n for n in modes[mode] if n.endswith('.json') or '.config.' in n]
        for name in modes[mode]:
            if name in required[mode]: continue  # No profiles, captures, proofs or production data copied.
            text = template(mode + '/' + name)
            if name == 'ops.py':
                require(ast.dump(ast_class(text, 'Operations'), include_attributes=False) ==
                        ast.dump(ast_class(op_reference, 'Operations'), include_attributes=False), 'canonical_operations_diverged')
                a = next(n for n in ast_class(text, 'Controls').body if isinstance(n, ast.FunctionDef) and n.name == 'unfence')
                b = next(n for n in ast_class(op_reference, 'Controls').body if isinstance(n, ast.FunctionDef) and n.name == 'unfence')
                require(ast.dump(a, include_attributes=False) == ast.dump(b, include_attributes=False), 'canonical_unfence_diverged')
                transformed = future['operations'](prevention['operations'](text), mode)
                operations_exact[mode] = True
            else: transformed = text
            add('code/' + mode + '/' + name, transformed, 'UNCONSUMED_TEMPLATE_CODE/' + mode + '/' + name, text)

    total = sum(len(value) for value in code.values())
    require(total <= MAX_CONTROL_BYTES, 'offline_control_budget_exceeded')
    st = os.statvfs(out.parent)
    require(st.f_bavail * st.f_frsize >= MAX_CONTROL_BYTES + 64 * 1024 * 1024, 'local_staging_capacity_denied')
    # All inputs/predicates are checked before writing the output root.
    out.mkdir(mode=0o700)
    def write(name, value):
        file = out / name
        file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(value); stream.flush(); os.fsync(stream.fileno())
    for name, value in code.items(): write(name, value)
    write('provenance.json', json_bytes(provenance))
    write('required-mode-inputs.json', json_bytes(required))
    write('mode-code-manifest.json', json_bytes({m: {n: sha(code['code/' + m + '/' + n]) for n in modes[m] if n not in required[m]} for m in MODES}))
    write('binding-status.json', json_bytes({'state': 'PREPARED_LOCALLY_UNBOUND_CODE_ONLY', 'executionAuthorized': False,
        'operationallyCertified': False, 'sourceIdentitiesPresent': False, 'policyInstalled': False,
        'missingOperationalInputs': 'required-mode-inputs.json + public binding/checklist specification',
        'noHistoricalObservationPromoted': True}))
    # No canonical runtime binding/intent/policy is fabricated. Missing values
    # remain missing; the real package verifiers must deny until a future seal.
    entries = {str(f.relative_to(out)): sha(raw(f)) for f in sorted(out.rglob('*')) if f.is_file()}
    manifest = {'version': 1, 'kind': 'OFFLINE_CODE_COMPOSITION', 'state': 'PREPARED LOCALLY',
        'baseCommit': BASE, 'acceptedReviewSha256': sha(raw(ACCEPTED / 'local-acceptance-20261016/REVIEW.md')),
        'sourceTemplateReviewSha256': index['reviewSha256'], 'filesSha256': entries,
        'operationsCanonicalAstExact': operations_exact, 'codeBytes': total, 'controlCopyBudgetBytes': MAX_CONTROL_BYTES,
        'newRuntimeCopyBytes': 0, 'runtimeBuilds': 0, 'newBackup': False, 'productionEffects': False,
        'requiredCurrentVpsObservations': True, 'executionAuthorized': False}
    write('COMPOSITION.json', json_bytes(manifest))
    return {'result': 'PREPARED_LOCALLY_NOT_DEPLOYED_NOT_WINDOW_READY', 'codeFiles': len(code),
        'manifestSha256': sha(raw(out / 'COMPOSITION.json')), 'codeBytes': total,
        'operationsCanonicalAstExact': operations_exact, 'outputWrittenOnce': True}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('--out', required=True)
    print(json.dumps(compose(parser.parse_args().out), sort_keys=True))
