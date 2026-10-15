"""Build a NEW complete operational review package from current captures.
Local assembly only. No SQL mutation, process control or privileged installation.
"""
import copy,datetime,hashlib,importlib.util,json,os,shutil,sys
from pathlib import Path
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent
BASE=ROOT/'docs/reviews/automation-freeform-window-release-af26/security-containment-20261012'
DONOR=ROOT/'local-evidence/database-authorized-window-20261013T200200Z/final-generation-extracted/incident-6683-v4-security-database-final-v4-20261013T140000Z'
CAPTURE=ROOT/'local-evidence/cipher-locked-preparation-v2-20261014T235000Z'
GEN='incident-6683-v4-security-cipher-locked-v7-20261015T011500Z'
P='/opt/re7online/backups/converta-persistent/preparations/'+GEN
R='/opt/re7online/releases/security-epoch-v3-36f51ebe-20261015T001500Z/apps/whatsapp-agent'
os.umask(0o077)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 with p.open('x')as f:json.dump(v,f,separators=(',',':'),ensure_ascii=False);f.write('\n')
 p.chmod(0o600)
def seal(out):
 out=Path(out);out.mkdir(mode=0o700);w=out/'window';w.mkdir(mode=0o700);(w/'seal-current').mkdir(mode=0o700)
 cap=json.loads((CAPTURE/'capture.private.json').read_text());root=json.loads((CAPTURE/'root.private.json').read_text());assert not root['incomplete'];assert cap['minimumAvailableBytes']>=8776581120
 before=copy.deepcopy(cap['configuration']);target=copy.deepcopy(before);original={a['name']:a for a in before['apps']};keys=json.loads((ROOT/'local-evidence/security-containment-20261012/package-v2/new-values.private.json').read_text())
 policy=ROOT/'local-evidence/security-v3-epoch-proof-20261014/historical-policy.proposed.private.json';assert sha(policy)=='95eda044e469fe458d07fbdf5ec416aea7861873550f7db2ec1c7f0127d43d62'
 dedicated=json.loads((ROOT/'local-evidence/security-remaining-composition-v3-20261014/seed-write-key.proposed.private.json').read_text());escrow=json.loads((ROOT/'local-evidence/security-remaining-composition-v3-20261014/seed-historical-escrow.private.json').read_text())
 for cfg in (target,):
  for a in cfg['apps']:
   if a['name']=='re7-whatsapp-agent':
    a.update(cwd=R,script=R+'/dist/index.js');a['env'].update(CAMPAIGN_BUILD_ID='seed-epoch-v3-36f51ebef7bf',CAMPAIGN_SEED_WRITE_EPOCH='seed-dedicated-20261014',CAMPAIGN_SEED_SECRET=dedicated['CAMPAIGN_SEED_SECRET'],CAMPAIGN_SEED_HISTORICAL_SECRET=escrow['CAMPAIGN_SEED_HISTORICAL_SECRET'],CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=P+'/window/historical-population.private.json',CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=sha(policy))
   if a['name']in ('re7-whatsapp-agent','re7-whatsapp-web-worker'):
    for k in ('CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY'):
     if k in a['env']:a['env'][k]=keys[k]
 pre=copy.deepcopy(target)
 for a in pre['apps']:
  for k in ('CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY'):
   if k in original[a['name']]['env']:a['env'][k]=original[a['name']]['env'][k]
 old_remote='/opt/re7online/backups/converta-persistent/preparations/'+DONOR.name
 skip={'backup-manifest.private.json','restore-result.json','privileged-policy.private.json','privileged-policy.sha256','initial.private.json','mode-manifest-v4.json','sequencer-manifest.json','saved-dump.pm2.private.json','saved-dump.pm2.bak.private.json','preserved-frontend-config.private.json','credential-hook.private.json','credential_sequencer.py','role-change.private.sql','database-original-observation.private.json','database-consumers.private.json','administrative-db.private.json','docker-recovery.private.json','prepare_post_unfence_return.py'}
 for n,h in json.loads((DONOR/'window/sequencer-manifest.json').read_text())['filesSha256'].items():
  assert sha(DONOR/'window'/n)==h,'donor_manifest_drift'
  if n not in skip:(w/n).write_bytes((DONOR/'window'/n).read_bytes().replace(old_remote.encode(),P.encode()))
 put(w/'source.config.private.json',before);put(w/'consumers-before.config.private.json',pre);put(w/'consumers-after.config.private.json',target)
 shutil.copyfile(policy,w/'historical-population.private.json');shutil.copyfile(CAPTURE/'approved-scope.private.json',w/'approved-scope.private.json')
 put(w/'initial.private.json',{'guard':{'open':False,'generation':38,'tasks':0,'ledgerFault':False},'observedGuardOpen':False,'supervision':'ActiveState=inactive\nUnitFileState=enabled\n','observedUtc':cap['utc']})
 put(w/'preserved-frontend-config.private.json',original['re7-admin-front'])
 for entry in cap['saved']:put(w/('saved-'+Path(entry['path']).name+'.private.json'),entry['rawPrivate'])
 backup=json.loads((DONOR/'window/backup-manifest.private.json').read_text());restore=json.loads((ROOT/'local-evidence/cipher-snapshot-vps-20261014/restore/result.sanitized.json').read_text());capture_receipt=json.loads((ROOT/'local-evidence/cipher-snapshot-vps-20261014/captured-paged/capture-receipt.private.json').read_text())
 dump=ROOT/'local-evidence/cipher-snapshot-vps-20261014/captured-paged/database.dump';assert sha(dump)==restore['dumpSha256']
 backup.update(atUtc='2026-10-14T21:40:36.589514+00:00',source='shared READ ONLY inventory/dump snapshot under backup.lock; ciphertext renewal final source is separate locked phase',captureDurationSeconds=20.556,guardGeneration=38)
 backup['files']['database.dump']={'sha256':sha(dump),'bytes':dump.stat().st_size};put(w/'backup-manifest.private.json',backup)
 restore.update(result='PASS',isolatedLocalOnly=True,temporaryDatabaseRemoved=False,migrationChecksumMismatches=[],snapshotCertified=True);put(w/'restore-result.json',restore)
 sys.path.insert(0,str(w));from ecosystem_contract import generate_mode
 modes={}
 for mode in ('switch','return','return-partial','return-before-commit'):
  d=out/mode;d.mkdir(mode=0o700);origin=DONOR/mode;names=[x.split('  ',1)[1]for x in(origin/'scripts.sha256').read_text().splitlines()]
  for n in names:
   if n not in ['candidate.config.private.json','return.config.private.json','candidate.ecosystem.config.cjs','return.ecosystem.config.cjs','baseline.private.json','backup-manifest.json','proof-bindings.private.json']:(d/n).write_bytes((origin/n).read_bytes().replace(old_remote.encode(),P.encode()))
  # All canonical starts, including direct delegated starts, enforce the epoch.
  op=d/'ops.py';text=op.read_text();anchor='    def start(self, name):\n';assert text.count(anchor)==1
  text=text.replace(anchor,anchor+"        import sys\n        sys.path.insert(0, str(self.window))\n        from cipher_start_gate import authorize_start\n        authorize_start(self.root)\n",1);op.write_text(text)
  # Only future generation gets the certified retained-restore contract.
  b=d/'preparation-bindings.cjs';b.write_text(b.read_text().replace('r.temporaryDatabaseRemoved && r.providerCalls === 0',"(r.temporaryDatabaseRemoved || (r.snapshotCertified === true && r.databaseRetainedStoppedForEvidence === true)) && r.providerCalls === 0"))
  cfg=pre if mode=='return-before-commit'else target;ret=before if mode=='switch'else target
  put(d/'candidate.config.private.json',cfg);put(d/'return.config.private.json',ret);generate_mode(d)
  put(d/'baseline.private.json',{k:cap['frozenSql'][k]for k in ('auth','connected','flags')}|{'frontendBuild':'dFvS6tFEaWQsSIIn3P702','observedAt':cap['utc']})
  shutil.copyfile(w/'backup-manifest.private.json',d/'backup-manifest.json');proof=json.loads((origin/'proof-bindings.private.json').read_text());proof.update(backupManifestSha256=sha(w/'backup-manifest.private.json'),restoreResultSha256=sha(w/'restore-result.json'),dumpSha256=sha(dump),dumpBytes=dump.stat().st_size,catalogObjects=backup['catalogObjects']);put(d/'proof-bindings.private.json',proof)
  modes[mode]=names;(d/'scripts.sha256').write_text(''.join(sha(d/n)+'  '+n+'\n'for n in names))
 put(w/'mode-names.private.json',modes);put(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(out/m/n)for n in ns}for m,ns in modes.items()},'modeManifests':{m:sha(out/m/'scripts.sha256')for m in modes}})
 put(w/'execution-gates.private.json',{k:False for k in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')});(out/'execution-authorized').write_text('false\n')
 for n in ['locked_phase.py','locked_v4.py','locked_driver.py','writer_coverage.py','pinned_transport.py','locked_transport.cjs','current_plan.cjs','locked_cli.py','prepare_compatible_post_return.py','cipher_start_gate.py']:
  shutil.copyfile(HERE/n,w/n)
 for directory,names in [(BASE/'cipher-volatile-protocol-20261014',['locked_plan.py']),(BASE/'remaining-v3-20261014',['cipher_verify.py','cipher_consumers.py']),(BASE/'remaining-v2-20261014',['channel_transaction.py'])]:
  for n in names:shutil.copyfile(directory/n,w/n)
 identity=json.loads((ROOT/'local-evidence/cipher-snapshot-vps-20261014/captured-paged/holder-ready.private.json').read_text())['identity'];identity['role']=identity.pop('user')
 population=json.loads((w/'approved-scope.private.json').read_text());op=json.loads((ROOT/'local-evidence/cipher-snapshot-vps-20261014/channel-plan/channel-plan.private.json').read_text())['retained'][0]
 shutil.copyfile(DONOR/'window/prepare_post_unfence_return.py',w/'canonical-post-unfence-return.py')
 put(w/'locked-hook.private.json',{'phaseId':GEN+'-seal-current-under-lock','node':'/usr/bin/node','databaseIdentity':identity,'approvedScopeHash':sha(w/'approved-scope.private.json'),'dispositionSeal':op['dispositionSeal'],'guardGeneration':38,'explicitSourceRenewalApproved':True,'executionAuthorized':False})
 immutable=[]
 for x in root['files']:
  if x['path']in ['/etc/systemd/system/pm2-deploy.service']:immutable.append({'path':x['path'],'uid':x['uid'],'sha256':x['sha256']})
 # Legacy files keep OLDDB: no mutation or re-enablement of dotenv consumers here.
 env_old=json.loads((ROOT/'local-evidence/cipher-snapshot-vps-20261014/logs-env.private.json').read_text())['environmentPaths']
 immutable +=[{'path':x['path'],'uid':x['uid'],'sha256':x['sha256']}for x in env_old if x.get('exists')]
 put(w/'writer-consumers.private.json',{'knownCipherWriters':['re7-whatsapp-agent','re7-whatsapp-web-worker'],'unknownScheduledCipherWriters':[],'immutable':immutable,'legacyDbCredentialRejectedAfterDatabaseVerified':True,'newAuthNewDbPreserved':True,'sourceRootEvidenceSha256':sha(CAPTURE/'root.private.json'),'cronCipherWriterAudit':'media cleanup files only; retention anonymization/deletion; backup trust-local read only; alerts SMTP; no ChannelAccountSecret write from current scheduled targets'})
 consumers={'immutable':immutable,'before':[{'name':'consumers-before.config.private.json','sha256':sha(w/'consumers-before.config.private.json')}],'after':[{'name':'consumers-after.config.private.json','sha256':sha(w/'consumers-after.config.private.json')}],'modeBindings':{m:sha(out/m/'candidate.config.private.json')for m in modes}};put(w/'cipher-consumers.private.json',consumers)
 # Policy fresh source identities/root bytes; helper and sudoers remain literal.
 oldpolicy=next(x for x in root['files']if x['path'].endswith('incident-6683-window-policy.json'));assert oldpolicy['sha256']=='9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c'
 policy=json.loads(oldpolicy['rawPrivate']);policy.update(preparation=P,sourceProcesses={n:{'pid':v['pid'],'ticks':v['ticks']}for n,v in cap['identities'].items()},pm2Daemon=cap['pm2Daemon'])
 for mode in ('switch','return'):
  for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker'):
   a=next(x for x in target['apps']if x['name']==n);policy['targetProcesses'][mode][n].update(cwd=a['cwd'],script=a['script'],sha256=sha(ROOT/'local-evidence/security-v3-runtime-20261014/candidate/dist/index.js')if n=='re7-whatsapp-agent'else cap['identities'][n]['scriptSha256'])
 put(w/'privileged-policy.private.json',policy);(w/'privileged-policy.sha256').write_text(sha(w/'privileged-policy.private.json')+'\n')
 oldinstall=(DONOR/'install-api-window-policy.sh').read_text();newinstall=oldinstall.replace(old_remote,P).replace(oldpolicy['sha256'],sha(w/'privileged-policy.private.json')).replace('093a04831663d5d348ea4d5546d3aedb7f37ba2d5b76a17352aef65e447310b7',oldpolicy['sha256']).replace('pre-security-database-final-v4-20261013T140000Z','pre-security-cipher-locked-v7-20261015T011500Z')
 (out/'install-api-window-policy.sh').write_text(newinstall.replace('for mode in switch return return-partial;', 'for mode in switch return return-partial return-before-commit;'))
 shutil.copyfile(HERE/'verify_package.py',out/'verify-package.py')
 put(w/'sequencer-manifest.json',{'preparation':P,'status':'CIPHER_LOCKED_PREPARED_GATES_FALSE','filesSha256':{p.name:sha(p)for p in w.iterdir()if p.is_file()and p.name not in ('execution-gates.private.json','mode-names.private.json')}})
 put(out/'lifecycle.private.json',{'purpose':'locked-current cipher V4 review preparation','state':'REVIEW','responsible':'Deifson Oliveira','lastReview':'2026-10-14','nextReview':'2026-10-21','dependencies':['existing NEWauth+NEWDB and shared dependencies','runtime36f51ebe','grant95eda','snapshot/restore d859','all writer exit+DB zero at execution'],'custodyPending':True,'copyJustification':'one staged runtime reused by all four modes; no duplicate build/dependencies/dump; static population scope only, final SQL source/plan generated under lock','executionAuthorized':False})
 for directory,_,files in os.walk(out):
  for n in files:Path(directory,n).chmod(0o600)
 print(json.dumps({'result':'NEW_FOUR_MODE_LOCKED_V4_ASSEMBLED_FOR_REVIEW','preparation':P,'policySha256':sha(w/'privileged-policy.private.json'),'installerSha256':sha(out/'install-api-window-policy.sh'),'fiveGatesFalse':True,'executionAuthorized':False,'finalLockedPlanGenerated':False,'noProductionExecution':True}))
if __name__=='__main__':seal(sys.argv[1])
