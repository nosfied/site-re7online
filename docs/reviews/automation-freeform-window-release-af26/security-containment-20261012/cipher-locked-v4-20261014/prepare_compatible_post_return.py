"""Prepare-only fresh post-unfence return. No SQL mutation/stop/install/start.
Original VERIFIED receipt is a durable reference, not a reused exit certificate.
"""
import hashlib,importlib.util,json,os,sys
from pathlib import Path

def prepare(original,destination):
 original=Path(original).resolve();destination=Path(destination).resolve()
 sys.path.insert(0,str(original/'window'));from sequencer import Bridge
 from locked_driver import Driver
 driver=Driver(Bridge(original));prior=driver.prior()
 if prior is None or not prior[2].may_start_successor()or driver.verify_current_verified(prior[0],prior[1])!='VERIFIED_CURRENT_NEW_EPOCH':raise RuntimeError('verified_new_epoch_required_before_return_preparation')
 source=original/'window/canonical-post-unfence-return.py';text=source.read_text()
 before="target_config = (original / 'switch/return.config.private.json').read_bytes()"
 if text.count(before)!=1 or text.count('len(names) == 28')!=1:raise RuntimeError('canonical_return_template_drift')
 text=text.replace(before,"target_config = (original / 'return/candidate.config.private.json').read_bytes()").replace('len(names) == 28','len(names) == 29')
 spec=importlib.util.spec_from_loader('fresh_compatible_return',loader=None);module=importlib.util.module_from_spec(spec);module.__file__=str(source);exec(compile(text,str(source),'exec'),module.__dict__)
 module.main(original,destination)
 # Copy only new code; reference original durable SQL certificate by exact hash.
 import shutil
 window=destination/'window'
 for name in ['locked_cli.py','locked_driver.py','locked_v4.py','writer_coverage.py','pinned_transport.py','locked_transport.cjs','current_plan.cjs','locked_phase.py','locked_plan.py','channel_transaction.py','cipher_verify.py','cipher_consumers.py','credential_boundary.py','cipher_start_gate.py']:
  shutil.copyfile(original/'window'/name,window/name);(window/name).chmod(0o600)
 receipt=original/'window/credential-commit.receipt.private.json'
 value={'originalWindow':str(original/'window'),'receiptSha256':hashlib.sha256(receipt.read_bytes()).hexdigest(),'inspectionOnlyNoSqlReplay':True}
 (window/'cipher-origin.private.json').write_text(json.dumps(value));(window/'cipher-origin.private.json').chmod(0o600)
 # New return consumes its own mode/nonce. Cipher keys/readers are unchanged NEW.
 plan={'immutable':[],'before':[],'after':[],'modeBindings':{'return':hashlib.sha256((destination/'return/candidate.config.private.json').read_bytes()).hexdigest()}}
 (window/'cipher-consumers.private.json').write_text(json.dumps(plan));(window/'cipher-consumers.private.json').chmod(0o600)
 (destination/'execution-authorized').write_text('false\n');(destination/'execution-authorized').chmod(0o600)
 manifest=window/'sequencer-manifest.json';v=json.loads(manifest.read_text());v['filesSha256']={f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in window.iterdir()if f.is_file()and f.name not in ['sequencer-manifest.json','execution-gates.private.json','mode-names.private.json']};manifest.write_text(json.dumps(v));manifest.chmod(0o600)
 policy=(window/'privileged-policy.sha256').read_text().strip()
 original_policy=(original/'window/privileged-policy.sha256').read_text().strip()
 installer=(original/'install-api-window-policy.sh').read_text().replace(str(original),str(destination))
 installer=installer.replace(original_policy,policy).replace('9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c',original_policy)
 installer=installer.replace('python3 "$P/verify-package.py"','python3 "$P/window/baseline_contract.py" "$P" return').replace('validate "$P"','validate "$P" return')
 installer=installer.replace('for mode in switch return return-partial return-before-commit;', 'for mode in return;')
 archive='incident-6683-window-policy.pre-'+destination.name.removeprefix('incident-6683-v4-')+'.json'
 import re
 installer=re.sub(r'incident-6683-window-policy\.pre-security-cipher-locked-v[0-9]+-[0-9]+T[0-9]+Z\.json',archive,installer)
 path=destination/'install-compatible-return-policy.sh';path.write_text(installer);path.chmod(0o600)
 print(json.dumps({'result':'FRESH_NEW_CIPHER_COMPATIBLE_RETURN_PREPARED_GATES_FALSE','policySha256':(window/'privileged-policy.sha256').read_text().strip(),'installationRequired':True,'sqlReplayAuthorized':False}))
if __name__=='__main__':prepare(sys.argv[1],sys.argv[2])
