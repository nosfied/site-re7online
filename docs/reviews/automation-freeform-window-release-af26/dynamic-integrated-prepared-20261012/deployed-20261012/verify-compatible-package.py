from pathlib import Path
import json,hashlib,os
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z');v=json.loads((P/'compatible-artifact.private.json').read_text());h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def entries(root):return{str((Path(d)/n).relative_to(root))for d,ds,ns in os.walk(root,followlinks=False)for n in ds+ns if(Path(d)/n).is_file()or(Path(d)/n).is_symlink()}
expected={f['path']for f in v['files']}|{f['path']for f in v['symlinks']}
for root in v['roots']:
 root=Path(root);assert entries(root)==expected,'compatible_inventory_drift'
 for f in v['files']:assert not(root/f['path']).is_symlink()and h(root/f['path'])==f['sha256'],'compatible_bytes_drift'
 for f in v['symlinks']:assert(root/f['path']).is_symlink()and str((root/f['path']).resolve())==f['resolved'],'compatible_link_drift'
root=Path(v['dependencies']['path']);assert entries(root)=={f['path']for f in v['dependencies']['files']},'dependency_inventory_drift'
for f in v['dependencies']['files']:
 p=root/f['path']
 if 'target'in f:assert p.is_symlink()and str(p.readlink())==f['target'],'dependency_link_drift'
 else:assert not p.is_symlink()and h(p)==f['sha256'],'dependency_byte_drift'
print('EXACT_COMPATIBLE_SOURCE_TARGET_SHARED_DEPENDENCIES_PASS')
