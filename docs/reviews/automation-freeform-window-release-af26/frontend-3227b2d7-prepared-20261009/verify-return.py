"""Verify immutable active-return files, allowing only runtime Next cache additions.
Usage: python3 verify-return.py ROOT EXPECTED_MANIFEST_SHA
No application/start/write. Unknown additions outside .next/cache deny.
"""
import hashlib,json,os,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve();manifest=root/'manifest.json'
assert not manifest.is_symlink() and hashlib.sha256(manifest.read_bytes()).hexdigest()==sys.argv[2],'return_manifest'
v=json.loads(manifest.read_text());assert v['candidate']=='fa60f0f6443f3e0a129dc707021cffdc408af817','return_version'
expected={'manifest.json'}
for row in v['files']:
 rel=Path(row['path']);assert not rel.is_absolute() and '..' not in rel.parts
 p=root/rel;assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'] and oct(p.stat().st_mode&0o777)==row['mode'],'return_file:'+str(rel);expected.add(str(rel))
for row in v['symlinks']:
 rel=Path(row['path']);assert not rel.is_absolute() and '..' not in rel.parts
 p=root/rel;assert p.is_symlink() and os.readlink(p)==row['target'] and p.resolve(strict=True).is_relative_to(root),'return_link';expected.add(str(rel))
extra=[str(p.relative_to(root)) for p in root.rglob('*') if (p.is_file() or p.is_symlink()) and str(p.relative_to(root)) not in expected]
assert all(name.startswith('.next/cache/') for name in extra),'unknown_return_addition'
assert (root/'.next/BUILD_ID').read_text().strip()==v['buildId']
print(json.dumps({'result':'PASS','files':len(v['files']),'symlinks':len(v['symlinks']),'runtimeCacheFiles':len(extra),'BUILD_ID':v['buildId']}))
