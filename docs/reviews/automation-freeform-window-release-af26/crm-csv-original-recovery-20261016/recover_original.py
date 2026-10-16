"""Explicit original-only recovery. No CSV execution/overlay, no automatic recovery."""
import datetime,fcntl,hashlib,json,os,stat,subprocess,sys,traceback,time
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z')
Q=P.parent/'csv-original-recovery-20261016T111200Z'
MODE='return-before-commit'
REVIEW='56965c1249a5ff0dddf14df3dccefe8447c523c30a84b9b2a07b35786549faef'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
def dependencies():
 sys.path[:0]=[str(P/'window'),str(P/MODE)]
 from dispatch_original import configure
 configure()
 from csv_contract import check,read,require
 from csv_boundary import stage_boundary,exit_and_imports
 from sequencer import Bridge,Sequencer
 class OriginalBridge(Bridge):
  def run(self,args,*,input_text=None,cwd=None):
   if len(args)>1 and args[0]=='python3'and args[1]==str(P/MODE/'delegated.py'):
    args=[args[0],str(Q/'dispatch_original.py'),*args[2:]]
   return super().run(args,input_text=input_text,cwd=cwd)
 return check,read,require,stage_boundary,exit_and_imports,OriginalBridge,Sequencer
def inspect():
 check,read,require,stage,exit_imports,Bridge,Sequencer=dependencies()
 require(sha(P/'preparation-review.sha256')==REVIEW,'review_changed');check(P,live=True)
 stage(P,MODE)
 for name in ('event-overlay.intent.private.json','event-overlay.receipt.private.json','csv-selection.intent.private.json','csv-selection.receipt.private.json','csv-complete.receipt.private.json','csv-recovery.intent.private.json'):
  require(not os.path.lexists(P/'window'/name),'postselection_or_other_recovery')
 for mode in ('switch','return','return-partial',MODE):
  require(not list((P/mode).glob('start-intent-*.json'))and not list((P/mode).glob('started-*.json')),'prior_start_or_uncertain_start')
 original=read(P/'window/source.profile.private.json')
 require(read(P/MODE/'candidate.config.private.json')==original==read(P/MODE/'return.config.private.json'),'original_profile_mismatch')
 b=Bridge(P);s=Sequencer(b);s.baseline=read(P/'window/csv-baseline.private.json');s.verify_stopped('switch');b.privileged('check-present')
 from ops import Operations,System
 op=Operations(P/MODE,System());op.restore_proof();op.guard();op.d.validate_bindings(op.window,op.target)
 require(op.d.db_zero()=={'otherClientBackends':0,'advisoryLocks':0},'unknown_db_owner')
 op.old_absent(read(P/'switch/stop-start.json'))
 exit_imports({'oldExitConfirmed':True,'ownershipComplete':True,'sqlZero':True,'sha256':sha(P/'switch/old-exit-confirmed.json')},read(P/'window/csv-imports-switch-after-exit.private.json'))
 event=read(P/'window/event-consumer-binding.private.json');require(sha(event['path'])==event['beforeSha256'],'event_source_changed')
 sql="BEGIN READ ONLY;SET LOCAL statement_timeout=5000;SELECT count(*) FROM \"Event\" WHERE \"eventName\" IN ('crm.contact.import.started','crm.contact.import.classified','crm.contact.import.row','crm.contact.import.finished','crm.contact.import.uncertain');ROLLBACK;"
 count=subprocess.check_output(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,stderr=subprocess.PIPE,timeout=10).strip()
 require(count=='0','new_import_operation_evidence_exists')
 require(all(x is True for x in read(P/'window/execution-gates.private.json').values()),'admitted_gates_missing')
 b.scheduled_controls().verify('contained')
 return {'result':'ORIGINAL_RECOVERY_PRECONDITIONS_PASS','profileSha256':sha(P/'window/source.profile.private.json'),'noNewCodeAdmission':True,'mode':MODE},s
def execute():
 check,read,require,stage,exit_imports,Bridge,Sequencer=dependencies()
 with(P.parent/'.incident-6683-window.lock').open('a+')as outer,(P/'window/sequencer.lock').open('a+')as inner:
  fcntl.flock(outer,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(inner,fcntl.LOCK_EX|fcntl.LOCK_NB)
  require(not os.path.lexists(Q/'recovery.intent.private.json'),'recovery_consumed_no_replay')
  proof,s=inspect()
  # The owner installs a SEPARATE, explicitly reviewed original-only return policy.
  permit=read(Q/'root-install.export.private.json')
  require(permit['result']=='ORIGINAL_RETURN_POLICY_INSTALLED_FENCED','root_policy_permit_missing')
  require(permit['policySha256']==sha(Q/'original-return-policy.private.json'),'root_policy_permit_mismatch')
  put(Q/'recovery.intent.private.json',{'proof':proof,'rootPermitSha256':sha(Q/'root-install.export.private.json'),'automaticRetry':False})
  s.mode=MODE
  s.action(MODE,'recover-partial');s.verify_stopped(MODE)
  s.start_pair(MODE)
  # Canonical checks under fence, save/fallback before release, root authorization,
  # worker ownership capture, HTTP/DB validation, system+deploy cron restoration.
  s.finish(MODE)
  cfg=s.b.expected_config(MODE,'candidate.config.private.json');apps=s.b.apps()
  require(set(apps)==set(cfg)and all(s.b.app_matches(n,cfg)for n in cfg),'original_pair_not_restored')
  for name in ('dump.pm2','dump.pm2.bak'):
   f=Path('/home/deploy/.pm2')/name;st=f.lstat()
   require(stat.S_ISREG(st.st_mode)and not f.is_symlink()and st.st_uid==os.getuid()and stat.S_IMODE(st.st_mode)==0o600,'saved600')
  s.b.scheduled_controls().verify('before');s.b.privileged('check-absent')
  from csv_cli import reset
  reset(P)
  require(all(v is False for v in read(P/'window/execution-gates.private.json').values()),'gates_not_false')
  put(Q/'recovery.receipt.private.json',{'result':'CSV_ORIGINAL_PAIR_RESTORED','mode':MODE,'gatesFalse':True,'bothCronsRestored':True,'sourceProfileSha256':proof['profileSha256'],'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
  print('CSV_ORIGINAL_PAIR_RESTORED')
def status():
 check,read,require,stage,exit_imports,Bridge,Sequencer=dependencies();check(P,live=True)
 b=Bridge(P);cfg=b.expected_config(MODE,'candidate.config.private.json');apps=b.apps();controls=b.scheduled_controls();actual=controls.known()
 phase={kind:next(k for k,v in controls.expected[kind].items()if v==actual[kind])for kind in actual}
 return {'result':'ORIGINAL_RECOVERY_STATUS_READONLY','processes':{n:{'pid':a['pid'],'originalConfig':b.app_matches(n,cfg)}for n,a in apps.items()},'crons':phase,'guardGeneration':b.guard()['generation'],'guardClosed':not b.guard()['open'],'gatesFalse':all(x is False for x in read(P/'window/execution-gates.private.json').values()),'intentExists':(Q/'recovery.intent.private.json').exists(),'receiptExists':(Q/'recovery.receipt.private.json').exists(),'replayAuthorized':False}
if __name__=='__main__':
 os.umask(0o077)
 try:
  if sys.argv[1:]==['--inspect-readonly']:print(json.dumps(inspect()[0]))
  elif sys.argv[1:]==['--status-readonly']:print(json.dumps(status()))
  elif sys.argv[1:]==['--operator-recover-original']:execute()
  else:raise RuntimeError('exact_operator_action_required')
 except BaseException as e:
  if Q.is_dir():
   fd=os.open(Q/('failure-'+str(time.time_ns())+'.private.txt'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'w')as out:out.write(traceback.format_exc())
  print(json.dumps({'result':'ORIGINAL_RECOVERY_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
