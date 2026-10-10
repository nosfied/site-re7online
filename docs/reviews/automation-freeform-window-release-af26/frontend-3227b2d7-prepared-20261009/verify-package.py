"""Read-only package verifier. No application/provider/process starts."""
import hashlib
import json
import os
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve(strict=True)
manifest = root / 'manifest.json'
assert not manifest.is_symlink(), 'manifest_symlink'
assert hashlib.sha256(manifest.read_bytes()).hexdigest() == sys.argv[2], 'manifest_hash'
v = json.loads(manifest.read_text())
assert v['candidate'] == '3227b2d752110873f0eff4ee5253a6f06ca51549', 'candidate'
expected = {'manifest.json'}
for f in v['files']:
    rel = Path(f['path'])
    assert not rel.is_absolute() and '..' not in rel.parts, 'unsafe_path'
    p = root / rel
    assert not p.is_symlink() and p.is_file(), 'file_type:' + str(rel)
    assert hashlib.sha256(p.read_bytes()).hexdigest() == f['sha256'], 'hash:' + str(rel)
    assert oct(p.stat().st_mode & 0o777) == f['mode'], 'mode:' + str(rel)
    expected.add(str(rel))
for f in v['symlinks']:
    rel = Path(f['path'])
    assert not rel.is_absolute() and '..' not in rel.parts, 'unsafe_link_path'
    p = root / rel
    assert p.is_symlink() and os.readlink(p) == f['target'], 'link:' + str(rel)
    assert p.resolve(strict=True).is_relative_to(root), 'external_link:' + str(rel)
    expected.add(str(rel))
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() or p.is_symlink()}
assert actual == expected, 'package_inventory'
assert (root / '.next/BUILD_ID').read_text().strip() == v['buildId'], 'build_id'
print(json.dumps({'result': 'PASS', 'files': len(v['files']), 'symlinks': len(v['symlinks']), 'BUILD_ID': v['buildId']}))
