"""Full exact prepared/return inventory and shared dependency check; reads only."""
from pathlib import Path
import json,hashlib,os,subprocess
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert h(P/'api-candidate-manifest.private.json')==(P/'api-candidate-manifest.sha256').read_text().strip(),'manifest_drift'
v=json.loads((P/'api-candidate-manifest.private.json').read_text());app=Path(v['candidate']);base=Path(v['return'])
def entries(root):
 return {str((Path(d)/n).relative_to(root))for d,ds,ns in os.walk(root,followlinks=False)for n in ds+ns if(Path(d)/n).is_file()or(Path(d)/n).is_symlink()}
expected={f['path']for f in v['files']}|{f['path']for f in v['symlinks']};assert entries(app)==expected,'candidate_inventory_drift';assert entries(base)==expected,'return_inventory_drift'
changes=[]
for f in v['comparison']:
 assert not(app/f['path']).is_symlink()and h(app/f['path'])==f['candidateSha256'],'candidate_bytes_drift:'+f['path']
 assert not(base/f['path']).is_symlink()and h(base/f['path'])==f['originSha256'],'return_bytes_drift:'+f['path']
 if f['changed']:changes.append(f['path'])
assert sorted(changes)==['dist/http/routes.js','src/http/routes.ts']
for f in v['symlinks']:
 a=app/f['path'];b=base/f['path'];assert a.is_symlink()and str(a.readlink())==f['target']and str(a.resolve())==f['resolved']and a.exists(),'candidate_link_drift'
 assert b.is_symlink()and b.exists()and a.resolve()==b.resolve(),'return_shared_link_drift'
deps=Path(v['dependencies']['path']);assert entries(deps)=={f['path']for f in v['dependencies']['files']},'dependency_inventory_drift'
for f in v['dependencies']['files']:
 a=deps/f['path']
 if 'target'in f:assert a.is_symlink()and str(a.readlink())==f['target'],'dependency_link_drift'
 else:assert not a.is_symlink()and h(a)==f['sha256'],'dependency_bytes_drift'
for rel in ['package.json','package-lock.json','prisma/schema.prisma','node_modules/.prisma/client/schema.prisma']:assert h(app/rel)==h(base/rel)
assert h(P/'api-result-truth-overlay.tar')==v['overlay']['tarSha256']
assert subprocess.check_output(['/usr/bin/node','--version'],text=True).strip()=='v20.20.0';subprocess.run(['/usr/bin/node','--check',str(app/'dist/http/routes.js')],check=True)
print(json.dumps({'result':'EXACT_API_PACKAGE_RETURN_DEPENDENCIES_PASS','files':len(v['files']),'symlinks':len(v['symlinks']),'dependencyEntries':len(v['dependencies']['files']),'changedRuntime':['dist/http/routes.js'],'noApplicationStarted':True}))
