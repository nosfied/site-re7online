"""Read-only integrity of an offline code kit, never operational certification.
No imports/evaluation of any composed consumer and no external subprocesses.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat


def require(ok, why):
    if not ok: raise RuntimeError(why)


def regular(path):
    meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and not path.is_symlink() and
            meta.st_uid == os.getuid() and stat.S_IMODE(meta.st_mode) == 0o600
            and meta.st_nlink == 1, 'offline_file_metadata')
    return path.read_bytes()


def verify(root, manifest_sha256, require_operational=False):
    root = Path(root).absolute(); meta = root.lstat()
    require(stat.S_ISDIR(meta.st_mode) and not root.is_symlink() and
            meta.st_uid == os.getuid() and stat.S_IMODE(meta.st_mode) == 0o700, 'offline_root_metadata')
    require(re.fullmatch('[0-9a-f]{64}', manifest_sha256 or '') is not None, 'reviewed_manifest_pin_required')
    value = regular(root / 'COMPOSITION.json')
    require(hashlib.sha256(value).hexdigest() == manifest_sha256, 'offline_manifest_drift')
    manifest = json.loads(value)
    require(manifest['kind'] == 'OFFLINE_CODE_COMPOSITION' and manifest['state'] == 'PREPARED LOCALLY'
            and manifest['executionAuthorized'] is False and manifest['productionEffects'] is False,
            'offline_kind_or_authority')
    entries = manifest['filesSha256']; require(bool(entries), 'offline_empty_manifest')
    observed = set()
    for file in root.rglob('*'):
        require(not file.is_symlink(), 'offline_symlink')
        if file.is_file(): observed.add(str(file.relative_to(root)))
    require(observed == set(entries) | {'COMPOSITION.json'}, 'offline_membership_drift')
    for name, digest in entries.items():
        relative = Path(name)
        require(not relative.is_absolute() and '..' not in relative.parts, 'offline_path_escape')
        raw = regular(root / relative)
        require(hashlib.sha256(raw).hexdigest() == digest, 'offline_file_hash_drift:' + name)
        if relative.suffix == '.py': ast.parse(raw, filename=name)
    required = json.loads(regular(root / 'required-mode-inputs.json'))
    modes = ('switch', 'return', 'return-partial', 'return-before-commit')
    require(set(required) == set(modes), 'offline_mode_population')
    require(all({'plan.private.json', 'baseline.private.json', 'candidate.config.private.json',
                 'return.config.private.json', 'proof-bindings.private.json'} <= set(required[m])
                for m in modes), 'offline_required_binding_coverage')
    mode_manifest = json.loads(regular(root / 'mode-code-manifest.json'))
    require(set(mode_manifest) == set(modes), 'offline_mode_manifest_population')
    for mode, files in mode_manifest.items():
        require('ops.py' in files, 'offline_operations_missing')
        for name, digest in files.items():
            require(entries['code/' + mode + '/' + name] == digest, 'offline_mode_code_drift')
    status = json.loads(regular(root / 'binding-status.json'))
    require(status['operationallyCertified'] is False and status['executionAuthorized'] is False
            and status['sourceIdentitiesPresent'] is False, 'offline_unbound_state')
    require(not require_operational, 'OPERATIONAL_CERTIFICATION_DENIED_CURRENT_OBSERVATIONS_AND_BINDINGS_MISSING')
    return {'result': 'OFFLINE_COMPOSITION_INTEGRITY_PASS', 'files': len(entries),
            'status': 'PREPARED LOCALLY / NOT DEPLOYED / NOT WINDOW READY',
            'operationallyCertified': False, 'consumersExecuted': False, 'productionEffects': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--root', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--require-operational', action='store_true')
    args = parser.parse_args()
    try: print(json.dumps(verify(args.root, args.manifest_sha256, args.require_operational), sort_keys=True))
    except Exception as error:
        print(json.dumps({'result': 'OFFLINE_COMPOSITION_DENY', 'reason': str(error), 'productionEffects': False}));raise SystemExit(1)
