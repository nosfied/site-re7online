"""Strict new package verification, no application entrypoint/control action."""
import hashlib,json,os,stat,sys
from pathlib import Path
P=Path(__file__).resolve().parent;W=P/'window';sys.path.insert(0,str(W))
from locked_v4 import verify_configs
from sequencer import Bridge
m=json.loads((W/'sequencer-manifest.json').read_text())
for n,h in m['filesSha256'].items():
 p=W/n;s=p.lstat();assert p.parent==W and stat.S_ISREG(s.st_mode)and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600 and hashlib.sha256(p.read_bytes()).hexdigest()==h,'window_manifest_drift'
verify_configs(Bridge(P))
a=json.loads((P/'runtime-inventory.private.json').read_text());r=Path(a['runtimeRoot'])
for e in a['files']:
 p=r/e['path'];s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()and hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256'],'runtime_inventory_drift'
assert not(r/'.env').exists()and not(r/'.env').is_symlink(),'unexpected_runtime_env'
for e in a['links']:
 p=r/e['path'];assert p.is_symlink()and os.readlink(p)==e['target'],'runtime_dependency_link_drift'
from baseline_contract import validate_preparation
validate_preparation(P,['switch','return','return-partial','return-before-commit'])
print('LOCKED_CIPHER_FOUR_MODES_RUNTIME_REFERENCES_GATES_REVIEW_PASS')
