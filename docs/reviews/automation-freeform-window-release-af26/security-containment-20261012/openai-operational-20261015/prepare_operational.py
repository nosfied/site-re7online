"""New inactive OpenAI generation. Reuses runtime/restore, never installs or invokes apps."""
import argparse,copy,hashlib,importlib.util,json,os,re,shutil,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
GEN='incident-6683-v4-security-openai-v4-20261015T203000Z'
REMOTE='/opt/re7online/backups/converta-persistent/preparations/'+GEN
MODES=('switch','return','return-partial','return-before-commit')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n');p.chmod(0o600)
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def prepare(source,capture,profiles,out):
 source=Path(source);capture=Path(capture);profiles=Path(profiles);out=Path(out);os.umask(0o077)
 assert out.name==GEN and not out.exists()and not out.is_symlink(),'new_namespace_required'
 sys.path.insert(0,str(HERE.parent/'openai-restricted-preparation-20261015'))
 verifier=load('prior_profiles',HERE.parent/'openai-restricted-preparation-20261015/verify_profiles.py');verifier.verify(profiles)
 c=json.loads(capture.read_text());before=json.loads((profiles/'source-before.profile.private.json').read_text());after=json.loads((profiles/'candidate.profile.private.json').read_text())
 assert c['sourceProfile']==before and c['sourceProfileSha256']==verifier.SOURCE_SHA and c['newCipherVerified']is True,'source_config_or_cipher_drift'
 for mode in MODES:
  for line in(source/mode/'scripts.sha256').read_text().splitlines():
   h,n=line.split('  ',1);assert Path(n).name==n and sha(source/mode/n)==h,'source_mode_changed'
 names=json.loads((source/'window/mode-names.private.json').read_text())
 shared=['sequencer.py','baseline_contract.py','ecosystem_contract.py','privileged_output.py','scheduled_controls.py','restore_contract.py','restore-result.json','restore-contract.private.json','original-restore-proof.private.json','backup-compatibility.private.json','backup-manifest.private.json','automation-fence.nft','privileged.py','closure-verified.private.json','waiting-work.private.json','frontend-build-env.private.json','db-owner-bindings.private.json']
 source_hashes={str(f.relative_to(source)):sha(f)for mode in MODES for f in(source/mode).iterdir()if f.name in names[mode]}
 block=os.statvfs(out.parent).f_frsize
 dense=sum(((source/mode/n).stat().st_size+block-1)//block*block for mode in MODES for n in names[mode])+sum((source/'window'/n).stat().st_size for n in shared)+8*1024*1024
 assert os.statvfs(out.parent).f_bavail*block>dense+64*1024*1024,'local_staging_capacity'
 coordinator=load('retention_coordinator_openai',HERE.parents[4]/'scripts/operational_preparation_review.py')
 inventory=coordinator.reporter.inventory([str(source)]);allocated=coordinator.allocation(inventory)
 copy_review=coordinator.reuse_decision({'expected':{'sha256':sha(profiles/'candidate.profile.private.json'),'dependenciesSha256':sha(source/'runtime-inventory.private.json'),'runtime':'current-cipher-v14','contract':'restricted-key-only'},'existing':[],'reusePermitted':True,'newCopyAllocatedBytes':dense,'justification':'new path-bound V4 controls and changed key profiles; shared runtime, dump and dependencies reused','newLinks':False})
 classification=coordinator.classify('REVIEW',[{'path':str(source/'runtime-inventory.private.json'),'kind':'manifest','neededOnHost':True},{'path':str(out),'kind':'package','neededOnHost':False}],{str(source/'runtime-inventory.private.json')})

 out.mkdir(mode=0o700);w=out/'window';w.mkdir(mode=0o700)
 for n in shared:shutil.copyfile(source/'window'/n,w/n)
 old='/opt/re7online/backups/converta-persistent/preparations/'+source.name
 for f in w.iterdir():
  if f.suffix in ('.py','.json'):
   raw=f.read_bytes()
   # Only code paths are rebound; historical backup/restore proofs stay byte-identical.
   if f.suffix=='.py':f.write_bytes(raw.replace(old.encode(),REMOTE.encode()))
 f=w/'sequencer.py';text=f.read_text();text=text.replace("mode in {'switch', 'return', 'return-partial'}","mode in {'switch', 'return', 'return-partial', 'return-before-commit'}");f.write_text(text)
 for n in ['openai_contract.py','openai_start_gate.py','openai_cli.py','validate_provider.py','provider_probe.cjs','check_current.py','root_readonly.py','admit_gates.py']:
  shutil.copyfile(HERE/n,w/n)
 for n in ('deploy.crontab.before','re7-converta-backup.before'):
  putvalue=c['deployCron']if n.startswith('deploy')else c['systemCron'];(w/n).write_text(putvalue)
 for n in ('deploy.crontab.window','re7-converta-backup.window'):shutil.copyfile(source/'window'/n,w/n)
 put(w/'initial.private.json',c['initial']);put(w/'preserved-frontend-config.private.json',next(a for a in before['apps']if a['name']=='re7-admin-front'))
 for value,n in zip(c['saved'],['saved-dump.pm2.private.json','saved-dump.pm2.bak.private.json']):put(w/n,value['content'])
 put(w/'source.profile.private.json',before);put(w/'target.profile.private.json',after)
 for mode in MODES:
  d=out/mode;d.mkdir(mode=0o700)
  for n in names[mode]:
   if n.endswith('ecosystem.config.cjs'):continue
   raw=(source/mode/n).read_bytes()
   if n.endswith(('.py','.cjs')):raw=raw.replace(old.encode(),REMOTE.encode())
   (d/n).write_bytes(raw)
  ops=d/'ops.py';text=ops.read_text();assert text.count('from cipher_start_gate import authorize_start')==1;text=text.replace('from cipher_start_gate import authorize_start','from openai_start_gate import authorize_start');ops.write_text(text)
  plan=json.loads((d/'plan.private.json').read_text());plan['mode']=mode;put(d/'plan.private.json',plan)
  put(d/'baseline.private.json',c['functional'])
  put(d/'candidate.config.private.json',before if mode=='return-before-commit'else after)
  put(d/'return.config.private.json',before if mode in ('switch','return-before-commit')else after)
  eco=load('eco',w/'ecosystem_contract.py');eco.generate_mode(d)
 put(w/'mode-names.private.json',names)
 policy=json.loads((source/'window/privileged-policy.private.json').read_text());policy.update(preparation=REMOTE,sourceProcesses=c['identities'],pm2Daemon=c['pm2Daemon'])
 import base64
 for key,n in [('cronBeforeB64','re7-converta-backup.before'),('cronWindowB64','re7-converta-backup.window')]:policy[key]=base64.b64encode((w/n).read_bytes()).decode()
 for mode in ('switch','return'):
  policy['targetProcesses'][mode]={n:{'cwd':a['cwd'],'script':a['script'],'sha256':c['targets'][n]['sha256']}for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker')for a in after['apps']if a['name']==n}
 put(w/'privileged-policy.private.json',policy);(w/'privileged-policy.sha256').write_text(sha(w/'privileged-policy.private.json')+'\n')
 refs=copy.deepcopy(c['immutable']);refs.append({k:c['cipherReceipt'][k]for k in ('path','uid','mode','sha256')})
 put(w/'openai-contract.private.json',{'remotePreparation':REMOTE,'sourcePolicySha256':'fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251','sourceProfileSha256':sha(w/'source.profile.private.json'),'targetProfileSha256':sha(w/'target.profile.private.json'),'models':{'responses':'gpt-4.1-mini','audio':'gpt-4o-mini-transcribe'},'endpoints':['/v1/responses','/v1/audio/transcriptions'],'immutable':refs,'capturedUtc':c['capturedUtc'],'minimumCapacityBytes':8794603520+536870912+134217728+33554432+dense,'capacityRubrics':{'conservativePreservedFloorBytes':8794603520,'walGrowthReserveBytes':536870912,'newBackupReserveBytes':134217728,'evidenceReserveBytes':33554432,'stagingIncludingFourReturnProfilesBytes':dense,'extraReturnBytes':0},'profileStageMarginBytes':33554432,'newCipherVerifiedAtCapture':True,'sourceIdentities':c['identities'],'oldKeyRevocationAuthorized':False,'consoleLimitsObserved':False,'limitsRemainUnchanged':True})
 put(w/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']});(out/'execution-authorized').write_text('false\n')
 shutil.copyfile(source/'runtime-inventory.private.json',out/'runtime-inventory.private.json')
 (out/'verify-package.py').write_text("import json,sys\nfrom pathlib import Path\np=Path(__file__).resolve().parent;sys.path.insert(0,str(p/'window'))\nfrom openai_contract import check\nprint(json.dumps(check(p,live='--offline'not in sys.argv)))\n")
 # Only new source/target policy and archive name change; root helper/sudoers bytes remain fixed.
 text=(source/'install-api-window-policy.sh').read_text().replace(old,REMOTE)
 oldpolicy='fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251';priorpolicy='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'
 text=text.replace(oldpolicy,sha(w/'privileged-policy.private.json')).replace(priorpolicy,oldpolicy).replace('pre-security-cipher-controls-v14-20261015T130000Z','pre-security-openai-v4-20261015T203000Z')
 # Installer must check fresh owner-root evidence before changing policy.
 text=text.replace('python3 "$P/verify-package.py"', 'python3 "$P/verify-package.py"',1)
 (out/'install-api-window-policy.sh').write_text(text)
 # Reuse pure canonical backup-frontier update implementation; never its consumed apply CLI.
 shutil.copyfile(HERE.parent/'cipher-v13-execution-20261015/renew_proofs.py',w/'canonical_renew_proofs.py')
 shutil.copyfile(HERE/'refresh_proofs.py',out/'refresh_proofs.py')
 shutil.copyfile(HERE/'validation-speech.wav',out/'validation-speech.wav')
 put(out/'lifecycle.private.json',{'purpose':'restricted OPENAI_API_KEY replacement','generation':GEN,'state':'REVIEW_NOT_INSTALLED','responsible':'Deifson Oliveira','lastReview':'2026-10-15','nextReview':'2026-10-21','captureSha256':sha(capture),'originGeneration':source.name,'copyJustification':'new path-bound profiles, policies and complete four-mode contracts; runtime/dump/dependencies reused','denseLocalBudgetBytes':dense,'canonicalUniqueSourceAllocatedBytes':allocated,'copyReview':copy_review,'retentionClassification':classification,'sourceFilesUnchanged':all(sha(source/n)==h for n,h in source_hashes.items()),'hostRequired':['current active runtime','NEWauth+NEWDB+NEWcipher','historical reader','compatible returns','both crons','saved/fallback','backup evidence'],'archiveAfterClosure':['new generation static package and receipts in owner custody'],'runtimeBuilt':False,'executionAuthorized':False})
 for f in out.rglob('*'):f.chmod(0o700 if f.is_dir()else 0o600)
 seal(out)
 return {'result':'OPENAI_OPERATIONAL_PACKAGE_COMPOSED_NOT_INSTALLED','generation':GEN,'reviewSha256':sha(out/'preparation-review.sha256'),'policySha256':sha(w/'privileged-policy.private.json'),'installerSha256':sha(out/'install-api-window-policy.sh')}
def seal(p):
 p=Path(p);w=p/'window';names=json.loads((w/'mode-names.private.json').read_text())
 for mode in MODES:(p/mode/'scripts.sha256').write_text(''.join(sha(p/mode/n)+'  '+n+'\n'for n in names[mode]))
 put(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(p/m/n)for n in names[m]}for m in MODES},'modeManifests':{m:sha(p/m/'scripts.sha256')for m in MODES}})
 mutable={'execution-gates.private.json','sequencer-manifest.json'}
 put(w/'sequencer-manifest.json',{'preparation':REMOTE,'status':'OPENAI_NEW_PROFILES_REVIEW_NOT_INSTALLED','filesSha256':{f.name:sha(f)for f in w.iterdir()if f.is_file()and f.name not in mutable}})
 files=[f for f in p.rglob('*')if f.is_file()and f.name not in ('preparation-review.sha256','execution-authorized','execution-gates.private.json')]
 (p/'preparation-review.sha256').write_text(''.join(sha(f)+'  '+str(f.relative_to(p))+'\n'for f in sorted(files)))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--capture',required=True);a.add_argument('--profiles',required=True);a.add_argument('--out',required=True);v=a.parse_args();print(json.dumps(prepare(v.source,v.capture,v.profiles,v.out)))
