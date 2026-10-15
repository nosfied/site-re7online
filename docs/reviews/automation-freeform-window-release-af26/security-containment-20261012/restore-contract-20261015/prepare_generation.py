"""New inactive candidate only. Consumed source evidence is never overwritten."""
import hashlib,json,os,shutil,sys,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
GEN='incident-6683-v4-security-cipher-restore-v13-20261015T100500Z'
MODES=('switch','return','return-partial','return-before-commit')
B6='b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d'
OLD_POLICY='9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n');p.chmod(0o600)
def replace_once(s,a,b):
 if s.count(a)!=1:raise RuntimeError('producer_anchor_drift')
 return s.replace(a,b)
def prepare(source,out,renewal,backup):
 source=Path(source);out=Path(out);old='/opt/re7online/backups/converta-persistent/preparations/'+source.name;new='/opt/re7online/backups/converta-persistent/preparations/'+GEN
 if source.name!='incident-6683-v4-security-cipher-contract-v10-20261015T021500Z'or out.name!=GEN or out.exists()or out.is_symlink():raise RuntimeError('generation_namespace_denied')
 # Verify exact original source; no mutation of consumed original or its manifests.
 for n,h in json.loads((source/'window/sequencer-manifest.json').read_text())['filesSha256'].items():
  if sha(source/'window'/n)!=h:raise RuntimeError('source_manifest_drift')
 os.umask(0o077);shutil.copytree(source,out,symlinks=True,ignore=shutil.ignore_patterns("__pycache__","*.pyc"))
 for p in out.rglob('*'):
  if p.is_symlink():raise RuntimeError('candidate_symlink_denied')
  if p.is_file():p.chmod(0o600)
  else:p.chmod(0o700)
 # Renewed proof bytes copied from the custody archive, not new backup/restore.
 with tarfile.open(renewal)as t:
  for name in ['window/backup-manifest.private.json','window/restore-result.json']+[m+'/'+n for m in MODES for n in ('backup-manifest.json','proof-bindings.private.json')]:
   (out/name).write_bytes(t.extractfile(name).read())
 w=out/'window';r=json.loads((w/'restore-result.json').read_text())
 shutil.copyfile(source/'window/restore-result.json',w/'original-restore-proof.private.json')
 if sha(w/'original-restore-proof.private.json')!=r['originalRestoreProofSha256']:raise RuntimeError('original_proof_bytes_diverge')
 shutil.copyfile(backup,w/'backup-compatibility.private.json');(w/'backup-compatibility.private.json').chmod(0o600)
 contract={'version':1,'scope':'ISOLATED_RESTORE_EVIDENCE_NOT_FRESH_RPO','originalProofSha256':sha(w/'original-restore-proof.private.json'),'evidenceState':'CERTIFIED_RETAINED_STOPPED','ownershipAclRestored':False,'schemaFrontierSha256':r['schemaDigest'],'tooling':r['tooling'],'currentBackupManifestSha256':sha(out/'switch/backup-manifest.json'),'currentDumpSha256':r['dumpSha256'],'compatibilityEvidenceSha256':sha(w/'backup-compatibility.private.json')}
 write(w/'restore-contract.private.json',contract);shutil.copyfile(HERE/'restore_contract.py',w/'restore_contract.py')
 hook=json.loads((w/'locked-hook.private.json').read_text());hook['phaseId']=GEN+'-seal-current-under-lock';write(w/'locked-hook.private.json',hook)
 # Change namespace only in new structured files/code, not proof receipts or historical population.
 for p in out.rglob('*'):
  if p.is_file()and old.encode()in p.read_bytes():p.write_bytes(p.read_bytes().replace(old.encode(),new.encode()))
 for mode in MODES:
  d=out/mode;s=(d/'ops.py').read_text()
  s=replace_once(s,"        require(json.loads((self.window / 'restore-result.json').read_text())['temporaryDatabaseRemoved'], 'restore_not_verified')","        self.restore_proof()")
  s=replace_once(s,'    def start(self, name):\n','    def restore_proof(self):\n        sys.path.insert(0, str(self.window))\n        from restore_contract import validate\n        return validate(self.root)\n\n    def start(self, name):\n        self.restore_proof()\n')
  # Certify again before save/unfence and final controls; these are real consumers.
  s=replace_once(s,'    def finish(self):\n','    def finish(self):\n        Operations(self.root, self.d).restore_proof()\n')
  s=replace_once(s,'    def unfence(self):\n','    def unfence(self):\n        Operations(self.root, self.d).restore_proof()\n')
  (d/'ops.py').write_text(s)
  delegated=d/'delegated.py';s=delegated.read_text()
  s=replace_once(s,"root.name in {'switch', 'return', 'return-partial'}","root.name in {'switch', 'return', 'return-partial', 'return-before-commit'}")
  s=replace_once(s,'    op = ops.Operations(root, driver)\n','    op = ops.Operations(root, driver)\n    op.restore_proof()\n')
  s=replace_once(s,'def request(root, action, guard=None, now=None, driver=None):\n    root = Path(root)\n','def request(root, action, guard=None, now=None, driver=None):\n    root = Path(root)\n    ops.Operations(root, driver).restore_proof()\n')
  for method in ('prepare','enter','unfence','finish'):
   anchor='    def '+method+'(self):\n'
   s=replace_once(s,anchor,anchor+'        ops.Operations(self.root, self.d).restore_proof()\n')
  s=replace_once(s,'        op, control = ops.Operations(root, driver), DelegatedControls(root, driver)\n','        op, control = ops.Operations(root, driver), DelegatedControls(root, driver)\n        op.restore_proof()\n')
  s=replace_once(s,'import ops\n',"import ops\nBOUND_PREPARATION = Path("+repr(new)+")\n")
  check="str(root).startswith("+repr(new+'/')+")"
  if s.count(check)!=2:raise RuntimeError('delegated_namespace_anchor_drift')
  s=s.replace(check,'root.parent == BOUND_PREPARATION')
  delegated.write_text(s)
  f=d/'baseline_contract.py';f.write_text(f.read_text().replace("('switch', 'return', 'return-partial')","('switch', 'return', 'return-partial', 'return-before-commit')"))
  b=d/'preparation-bindings.cjs';s=b.read_text();start=s.index('    const b=JSON.parse',s.index('  proofs(dir)'));end=s.index('\n  }',start)
  s=s[:start]+"    const cp = require('child_process');\n    const receipt=JSON.parse(cp.execFileSync('/usr/bin/python3',['-B','-I','-S',path.join(dir,'../window/restore_contract.py'),dir],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}));\n    assert.equal(receipt.result,'RESTORE_CONTRACT_PASS');"+s[end:];b.write_text(s)
  v=json.loads((d/'proof-bindings.private.json').read_text());v['restoreContractSha256']=sha(w/'restore-contract.private.json');write(d/'proof-bindings.private.json',v)
 # Checker and sequencer preflight use the very same implementation, no copied predicates.
 f=out/'verify-package.py';s=f.read_text();s=replace_once(s,"from package_contract import check","from restore_contract import validate\nfor mode in ('switch','return','return-partial','return-before-commit'): validate(P/mode)\nfrom package_contract import check");f.write_text(s)
 f=w/'baseline_contract.py';f.write_text(f.read_text().replace("('switch', 'return', 'return-partial')","('switch', 'return', 'return-partial', 'return-before-commit')"))
 f=w/'sequencer.py';s=f.read_text().replace("for mode in ('switch', 'return', 'return-partial'):","for mode in ('switch', 'return', 'return-partial', 'return-before-commit'):");s=replace_once(s,'    def close_then_preflight(self):\n','    def close_then_preflight(self):\n        from restore_contract import validate\n        for mode in ("switch","return","return-partial","return-before-commit"): validate(self.root/mode)\n');s=replace_once(s,"self.b.guard()['open'] == validate_preparation(self.root)['guard']['open']","self.b.guard()['open'] == validate_preparation(self.root, [mode])['guard']['open']")
 s=replace_once(s,"        initial = validate_preparation(self.root)\n        if initial['guard']['open'] is False:","        initial = validate_preparation(self.root, [config_file[0]])\n        if initial['guard']['open'] is False:")
 s=replace_once(s,"        mode = 'return'\n        global_lock","        mode = 'return'\n        from restore_contract import validate\n        validate(self.root/mode)\n        global_lock")
 f.write_text(s)
 # Explicit recovery is guarded before inspection can become a recovery effect.
 f=w/'recovery_actions.py';s=f.read_text();s=replace_once(s,' verify_configs(b)\n',' verify_configs(b)\n from restore_contract import validate\n for mode in MODES:validate(b.root/mode)\n');f.write_text(s)
 # A fresh post-unfence return must carry proof artifacts and shared validator too.
 f=w/'prepare_compatible_post_return.py';s=f.read_text();s=replace_once(s,"'recovery_actions.py','package_contract.py']","'recovery_actions.py','package_contract.py','restore_contract.py','restore-contract.private.json','original-restore-proof.private.json','backup-compatibility.private.json']")
 s=s.replace(".replace('9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c',original_policy)",'.replace('+repr(B6)+',original_policy)')
 # Original source digest explicit; no replace-chain ambiguity when policy equals source.
 s=s.replace("installer=installer.replace(original_policy,policy).replace('"+B6+"',original_policy)","installer=installer.replace(original_policy,policy).replace('"+B6+"',original_policy)")
 lines=s.splitlines();anchors=[i for i,line in enumerate(lines)if line.startswith(' installer=re.sub(')]
 if len(anchors)!=1:raise RuntimeError('return_archive_anchor_drift')
 lines[anchors[0]:anchors[0]+1]=[" installer,count=re.subn(r'(?m)^A=.*$', 'A=/usr/local/libexec/re7/'+archive, installer)"," if count!=1:raise RuntimeError('return_archive_binding_missing')"]
 s='\n'.join(lines)+'\n'
 f.write_text(s)
 # Unique diagnostic channel allocated per connection; fixed one-use commit markers unchanged.
 f=w/'locked_driver.py';s=f.read_text();s=replace_once(s,"self.w/(tag+'.private.stderr')","self.w/(tag+'-'+__import__('uuid').uuid4().hex+'.private.stderr')");f.write_text(s)
 shutil.copyfile(HERE.parent/'cipher-package-contract-20261015/read_preparatory.py',out/'read-preparatory.py')
 f=out/'read-preparatory.py';s=f.read_text().replace("'complete-preparatory'","'complete-preparatory-'+__import__('uuid').uuid4().hex");f.write_text(s)
 # Derive all new hashes, maintaining complete explicit mode sets.
 names=json.loads((w/'mode-names.private.json').read_text())
 for mode in MODES:(out/mode/'scripts.sha256').write_text(''.join(sha(out/mode/n)+'  '+n+'\n'for n in names[mode]))
 write(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(out/m/n)for n in names[m]}for m in MODES},'modeManifests':{m:sha(out/m/'scripts.sha256')for m in MODES}})
 cp=json.loads((w/'cipher-consumers.private.json').read_text());cp['modeBindings']={m:sha(out/m/'candidate.config.private.json')for m in MODES}
 for phase in ('before','after'):
  for e in cp[phase]:e['sha256']=sha(w/e['name'])
 write(w/'cipher-consumers.private.json',cp)
 policy=sha(w/'privileged-policy.private.json');(w/'privileged-policy.sha256').write_text(policy+'\n')
 f=out/'install-api-window-policy.sh';s=f.read_text().replace(B6,policy).replace(OLD_POLICY,B6).replace('pre-security-cipher-contract-v10-20261015T021500Z','pre-security-cipher-restore-v13-20261015T100500Z');f.write_text(s)
 write(w/'sequencer-manifest.json',{'preparation':new,'status':'RESTORE_CONTRACT_CANDIDATE_NOT_INSTALLED','filesSha256':{p.name:sha(p)for p in w.iterdir()if p.is_file()and p.name not in ('sequencer-manifest.json','execution-gates.private.json','mode-names.private.json')}})
 review=['install-api-window-policy.sh','verify-package.py','read-preparatory.py','runtime-inventory.private.json','window/sequencer-manifest.json','window/mode-manifest-v4.json','window/privileged-policy.private.json','window/privileged-policy.sha256']+[m+'/scripts.sha256'for m in MODES]
 (out/'preparation-review.sha256').write_text(''.join(sha(out/n)+'  '+n+'\n'for n in review))
 life=json.loads((out/'lifecycle.private.json').read_text());life.update(state='UNPUBLISHED_AWAITING_CONCRETE_VALIDATION',purpose='shared real-consumer restore preconditions',originGeneration=source.name,runtimeCopied=False,originalsPreserved=True,installedSourcePolicySha256=B6);write(out/'lifecycle.private.json',life)
 for p in out.rglob('*'):
  if p.is_file():p.chmod(0o600)
 print(json.dumps({'result':'NEW_CANDIDATE_NOT_CERTIFIED','generation':GEN,'policySha256':policy,'installerSha256':sha(out/'install-api-window-policy.sh'),'reviewSha256':sha(out/'preparation-review.sha256'),'noProductionEffects':True}))
if __name__=='__main__':prepare(*sys.argv[1:])
