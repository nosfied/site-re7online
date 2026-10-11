"""Fixed read-only verifier of full prepared API and reused dependency inventory."""
import hashlib,json,os,subprocess
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-preventive-env-v2-20261011T002421Z');R=Path('/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z');M=P/'api-candidate-manifest.private.json'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert h(M)=='a002bb781e0cd654c6273bffc261c2ca3070baf970cc0137cabfd184a8cc29fa','api_manifest_drift'
v=json.loads(M.read_text());assert subprocess.check_output(['/usr/bin/node','--version'],text=True).strip()=='v20.20.0'
expected={f['path']for f in v['files']}|{f['path']for f in v['symlinks']};found=set()
for d,ds,ns in os.walk(R/'apps/whatsapp-agent',followlinks=False):
 for n in ds+ns:
  f=Path(d)/n
  if f.is_file()or f.is_symlink():found.add(str(f.relative_to(R)))
assert found==expected,'api_inventory_drift'
for f in v['files']:assert not(R/f['path']).is_symlink() and h(R/f['path'])==f['sha256'],'api_file_drift:'+f['path']
for f in v['symlinks']:assert (R/f['path']).is_symlink() and str((R/f['path']).readlink())==f['target'] and str((R/f['path']).resolve())==f['resolved'],'api_link_drift'
deps=Path(v['reusedDependencies']['path']);found=set()
for d,ds,ns in os.walk(deps,followlinks=False):
 for n in ds+ns:
  f=Path(d)/n
  if f.is_file()or f.is_symlink():found.add(str(f.relative_to(deps)))
assert found=={f['path']for f in v['reusedDependencies']['files']},'api_dependency_inventory_drift'
for f in v['reusedDependencies']['files']:
 p=deps/f['path']
 if 'target'in f:assert p.is_symlink() and str(p.readlink())==f['target'],'api_dependency_symlink_drift'
 else:assert not p.is_symlink() and h(p)==f['sha256'],'api_dependency_bytes_drift'
for f in v['overlay']['files']:
 assert h(Path(v['candidate'])/f['compiled'])==f['compiledSha256'];subprocess.run(['/usr/bin/node','--check',str(Path(v['candidate'])/f['compiled'])],check=True)
for n in ['prisma/schema.prisma','node_modules/.prisma/client/schema.prisma','package-lock.json','package.json']:
 assert h(Path(v['candidate'])/n)==h(Path(v['return'])/n),'api_compatibility_drift:'+n
print(json.dumps({'result':'API_PACKAGE_AND_RETURN_COMPATIBILITY_PASS','files':len(v['files']),'symlinks':len(v['symlinks']),'dependencyEntries':len(v['reusedDependencies']['files']),'workerChanged':False,'applicationStarted':False}))
