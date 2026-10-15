"""Explicit owner-authorized gate admission. All five proofs checked before any gate changes.
Does not install, contain, stop, start, apply SQL or open guard. Failure is not retried.
"""
import datetime,fcntl,hashlib,json,os,stat,subprocess,sys
from pathlib import Path
from check_root_capture import check as root_check
POLICY='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'
REVIEW='a7b17b6a2218876b325da3b24e97b5264b7e19c5dc8adc3bb7d58c51dd6fc095'
REQUIRED={'complete_checker','source_readability_scope_historical147','consumer_before_and_contained_contract_only','active_config_identity','saved_fallback600','guard_supervision_false_gates','frozen_sql_baselines_four_proof_bindings','capacity_wal_sql_inventory','proxy_canonical_observer','health_db'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):
 s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_evidence_path_drift'
 return json.loads(p.read_text())
def write(p,v):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True);f.flush();os.fsync(f.fileno())
def main(p,inputs,output,decision):
 assert decision=='--owner-authorized-v13','explicit_owner_decision_required';p=Path(p);i=Path(inputs);q=Path(output);os.umask(0o077);q.mkdir(mode=0o700)
 sys.path[:0]=[str(p/'window'),str(p/'switch')]
 from sequencer import Bridge
 from locked_driver import Driver
 from restore_contract import validate
 with(p.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  assert sha(p/'preparation-review.sha256')==REVIEW,'review_hash_changed'
  gates=read(p/'window/execution-gates.private.json');expected={'ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved'}
  assert set(gates)==expected and all(v is False for v in gates.values())and(p/'execution-authorized').read_text().strip()=='false','gate_or_authorization_already_consumed'
  assert not any((p/'window/seal-current').iterdir())and not list(p.glob('*/owner-request-*.json'))and not list(p.glob('*/start-intent-*.json')),'generation_consumed'
  root=root_check(p,i/'root.private.json',i/'root-baseline.private.json')
  r=read(i/'backup-result.private.json');custody=read(i/'custody-ack.private.json');lab=read(i/'lab-current.private.json')
  now=datetime.datetime.now(datetime.timezone.utc);age=(now-datetime.datetime.fromisoformat(r['startedUtc'])).total_seconds();assert 0<=age<3600,'actual_backup_RPO_expired'
  assert r['result']=='FRESH_READONLY_BACKUP_PASS'and r['backupLockHeld']is True and r['newCipherPlanGenerated']is False,'backup_frontier_invalid'
  assert custody['result']=='OFFHOST_CUSTODY_VERIFIED'and custody['dumpSha256']==r['dumpSha256']and custody['receiptSha256']==sha(i/'backup-result.private.json')and custody['labObservedSha256']==sha(i/'lab-current.private.json'),'custody_not_bound'
  assert sha(Path(r['remoteDirectory'])/'database.dump')==r['dumpSha256'],'remote_backup_changed'
  assert lab['result']=='CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED'and lab['temporaryDatabaseRemoved']is False and lab['proofSha256']==sha(p/'window/original-restore-proof.private.json'),'certified_lab_not_preserved'
  restores=[validate(p/m)for m in ('switch','return','return-partial','return-before-commit')]
  assert read(p/'window/backup-compatibility.private.json')==r,'renewed_backup_not_bound'
  b=Bridge(p);inspection=json.loads(b.privileged('inspect'));assert inspection=={'policySha256':POLICY,'phase':None,'sourceProcessesAlive':True},'installed_policy_not_ready'
  b.privileged('check-absent')
  # Complete current canonical chain while gates are still false. Failure stops admission.
  run=q/'current-chain-private'
  with(q/'chain.stdout.private').open('x')as out,(q/'chain.stderr.private').open('x')as err:subprocess.run(['python3','-B',str(p/'read-preparatory.py'),str(p),str(run)],stdout=out,stderr=err,check=True,timeout=90)
  chain=read(run/'result.private.json');assert set(chain['gatesPassed'])==REQUIRED and chain['result']=='PREPARATORY_CHAIN_PASS_NOT_EXECUTION_AUTHORIZED'and chain['gatesRemainFalse']is True,'canonical_preflight_incomplete'
  assert chain['reviewManifestSha256']==REVIEW and chain['minimumAvailableBytes']>=8794603520 and chain['walBytes']>=0,'capacity_or_manifest_drift'
  # Actual source process identity, writer/readability/147 scope is rechecked by this chain.
  proof={'ownerAuthorized':{'approvedCommit':'9db555431999df4a0345c6d7b85f6a9472251f8c','explicitDecision':decision,'ownerSudoAvailable':True},'artifactsVerified':{'reviewSha256':REVIEW,'currentChainSha256':sha(run/'result.private.json')},'restoreVerified':{'fourModeResults':restores,'backupReceiptSha256':sha(i/'backup-result.private.json'),'custodySha256':sha(i/'custody-ack.private.json'),'labObservedSha256':sha(i/'lab-current.private.json')},'preflightReviewed':{'rootCaptureSha256':root['captureSha256'],'rootBaselineSha256':root['baselineSha256'],'installedPolicy':inspection,'currentChainSha256':sha(run/'result.private.json')},'discrepanciesResolved':{'unknownWriters':0,'rootIncomplete':0,'immutableSourcesAndFrozenInventory':'canonical chain PASS','freshExitAndCASStillRequiredDuringB':True}}
  assert set(proof)==expected
  write(q/'admission.intent.private.json',{'reviewSha256':REVIEW,'proofs':proof,'automaticRetry':False})
  for f,value in [(p/'window/execution-gates.private.json',{k:True for k in gates}),(p/'execution-authorized',True)]:
   temp=f.with_name(f.name+'.gate-admission.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'w')as stream:stream.write(json.dumps(value)+'\n'if isinstance(value,dict)else'true\n');stream.flush();os.fsync(stream.fileno())
   os.replace(temp,f)
  write(q/'admission.receipt.private.json',{'result':'FIVE_GATES_ADMITTED','proofs':proof,'intentSha256':sha(q/'admission.intent.private.json'),'reviewSha256':REVIEW,'backupCapturedUtc':r['startedUtc'],'currentChainSha256':sha(run/'result.private.json')})
  print(json.dumps({'result':'FIVE_GATES_ADMITTED','reviewSha256':REVIEW,'minimumAvailableBytes':chain['minimumAvailableBytes'],'walBytes':chain['walBytes'],'backupAgeSeconds':age,'noContainmentExecuted':True}))
if __name__=='__main__':main(*sys.argv[1:])
