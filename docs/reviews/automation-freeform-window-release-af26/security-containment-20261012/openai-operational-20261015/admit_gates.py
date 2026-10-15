"""Future explicit admission: five proofs, canonical current predicates; no stop/start."""
import datetime,fcntl,json,os,re,subprocess,sys
from pathlib import Path
from openai_contract import check,read,write,require,sha
from check_current import check_current
GATES={'ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved'}
def admit(p,i,q,review,decision):
 p=Path(p);i=Path(i);q=Path(q);require(re.fullmatch('[0-9a-f]{40}',decision)is not None,'explicit_review_authorization_commit_required')
 with(p.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);check(p,live=True);require(sha(p/'preparation-review.sha256')==review,'review_changed')
  gates=read(p/'window/execution-gates.private.json');require(set(gates)==GATES and all(x is False for x in gates.values())and(p/'execution-authorized').read_text().strip()=='false','gates_consumed')
  require(not q.exists()and not list(p.glob('*/owner-request-*.json'))and not list(p.glob('*/start-intent-*.json'))and not(p/'window/openai-execution.intent.private.json').exists(),'generation_consumed')
  root=read(i/'root.private.json');require(root['result']=='OPENAI_ROOT_SOURCE_PASS'and len(root['files'])==3 and root['mutation']is False,'root_evidence')
  expected=read(p/'window/openai-contract.private.json')['sourcePolicySha256'];require(any(f['sha256']==expected and f['path']=='/usr/local/libexec/re7/incident-6683-window-policy.json'for f in root['files']),'root_source_drift')
  now=datetime.datetime.now(datetime.timezone.utc);require(0<=(now-datetime.datetime.fromisoformat(root['capturedUtc'])).total_seconds()<600,'root_expired')
  backup=read(i/'backup-result.private.json');custody=read(i/'custody-ack.private.json');lab=read(i/'lab-current.private.json')
  require(0<=(now-datetime.datetime.fromisoformat(backup['startedUtc'])).total_seconds()<3600,'actual_backup_RPO_expired')
  require(backup==read(p/'window/backup-compatibility.private.json')and backup['result']=='FRESH_READONLY_BACKUP_PASS'and backup['backupLockHeld']and not backup['newCipherPlanGenerated'],'backup_not_bound')
  require(sha(Path(backup['remoteDirectory'])/'database.dump')==backup['dumpSha256']and custody['result']=='OFFHOST_CUSTODY_VERIFIED'and custody['dumpSha256']==backup['dumpSha256']and custody['receiptSha256']==sha(i/'backup-result.private.json')and custody['labObservedSha256']==sha(i/'lab-current.private.json'),'custody_binding')
  require(lab['result']=='CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED'and lab['temporaryDatabaseRemoved']is False and lab['proofSha256']==sha(p/'window/original-restore-proof.private.json'),'lab_invalid')
  provider=read(p/'window/provider-before/receipt.private.json');require(provider['result']=='OPENAI_FUNCTIONAL_ENDPOINTS_PASS'and provider['phase']=='before'and provider['targetProfileSha256']==sha(p/'window/target.profile.private.json')and provider['contractSha256']==sha(p/'window/openai-contract.private.json'),'functional_validation_required')
  from sequencer import Bridge
  b=Bridge(p);observed=json.loads(b.privileged('inspect'));require(observed=={'policySha256':sha(p/'window/privileged-policy.private.json'),'phase':None,'sourceProcessesAlive':True},'installed_policy_not_ready');b.privileged('check-absent')
  current=check_current(p);q.mkdir(mode=0o700);proof={'reviewSha256':review,'authorizedCommit':decision,'rootCaptureSha256':sha(i/'root.private.json'),'rootCapturedUtc':root['capturedUtc'],'backupCapturedUtc':backup['startedUtc'],'backupReceiptSha256':sha(i/'backup-result.private.json'),'custodySha256':sha(i/'custody-ack.private.json'),'providerReceiptSha256':sha(p/'window/provider-before/receipt.private.json'),'current':current}
  write(q/'admission.intent.private.json',proof)
  for f,value in [(p/'window/execution-gates.private.json',{k:True for k in GATES}),(p/'execution-authorized',True)]:
   temp=f.with_name(f.name+'.admission.tmp');fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
   with os.fdopen(fd,'w')as stream:stream.write(json.dumps(value)+'\n'if isinstance(value,dict)else'true\n');stream.flush();os.fsync(stream.fileno())
   os.replace(temp,f)
  write(p/'window/openai-admission.receipt.private.json',{'result':'FIVE_GATES_ADMITTED',**proof});write(q/'admission.receipt.private.json',{'result':'FIVE_GATES_ADMITTED','intentSha256':sha(q/'admission.intent.private.json')});print('FIVE_GATES_ADMITTED')
if __name__=='__main__':
 os.umask(0o077)
 try:admit(*sys.argv[1:])
 except Exception as e:print(json.dumps({'result':'ADMISSION_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));sys.exit(1)
