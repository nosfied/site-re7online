"""Verify approved installed observation; archive/update local binding explicitly.
Called only after owner policy installation. No start or privileged code.
"""
import hashlib,importlib.util,json,os,sys,time
from pathlib import Path
p=Path(sys.argv[1]);v=json.loads((p/'proposal.private.json').read_text());control=Path(v['control']);root=control.parent
require=lambda ok,msg: None if ok else (_ for _ in ()).throw(RuntimeError(msg))
digest=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
require(digest(control)==v['controlSha256'],'control_drift')
path=root/'socket-observer-binding.private.json';require(digest(path)==v['priorBindingSha256'],'prior_binding_drift')
spec=importlib.util.spec_from_file_location('fixed_gate',root/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
require(g.BOOT_ID.read_text().strip()==v['bootId'] and int(g.PM_PID.read_text())==v['daemon']['pid'] and g.proc(v['daemon']['pid'])['ticks']==v['daemon']['ticks'],'new_identity_drift')
o=json.loads((p/'installed-observation.private.json').read_text());b=json.loads((p/'binding.private.json').read_text())
require(o['policySha256']==v['policySha256']==b['policySha256'] and o['helperSha256']==v['helperSha256'],'installed_integrity')
require(o['bootId']==v['bootId'] and len(o['samples'])==2 and 0<=time.monotonic()-o['finishedMonotonic']<=10,'installed_observation_expired')
for sample in o['samples']:require(sample['daemon']==v['daemon'],'installed_daemon')
require((root/'execution-authorized').read_text().strip()=='false','window_open')
# Prior bytes are retained in the proposal; no certificate/intents are removed.
require((p/'prior-binding.private.json').read_bytes()==path.read_bytes(),'prior_archive_drift')
tmp=root/('binding-rebound-'+v['policySha256']+'.private.json');require(not tmp.exists() and not tmp.is_symlink(),'binding_already_written')
with tmp.open('x') as f:f.write((p/'binding.private.json').read_text())
tmp.chmod(0o600);os.replace(tmp,path)
(p/'local-binding-updated.private.json').write_text(json.dumps({'at':time.time(),'policySha256':v['policySha256']}));(p/'local-binding-updated.private.json').chmod(0o600)
print('EXPLICIT_REBINDING_PASS_NO_START')
