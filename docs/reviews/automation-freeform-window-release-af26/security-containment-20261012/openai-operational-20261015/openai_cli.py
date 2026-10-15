"""Future one-shot OpenAI sequence. No SQL mutation, credential generation or revocation."""
import datetime,fcntl,json,os,sys
from pathlib import Path
from openai_contract import check,read,write,require,sha,selected
from sequencer import Bridge,Sequencer,API,WORKER,FRONT
from check_current import check_current
from validate_provider import run as provider_validate

def gate_reset(p):
 for f,value in [(p/'window/execution-gates.private.json',{k:False for k in read(p/'window/execution-gates.private.json')}),(p/'execution-authorized',False)]:
  t=f.with_name(f.name+'.close.tmp');fd=os.open(t,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w')as out:out.write(json.dumps(value)+'\n'if isinstance(value,dict)else'false\n');out.flush();os.fsync(out.fileno())
  os.replace(t,f)
def inspect(p):
 p=Path(p);check(p,live=True);b=Bridge(p);apps=b.apps();before=b.expected_config('switch','return.config.private.json');after=b.expected_config('switch','candidate.config.private.json')
 require(FRONT in apps and b.app_matches(FRONT,before),'frontend_not_preserved')
 front=read(p/'window/privileged-policy.private.json')['sourceProcesses'][FRONT];identity=b.identity(front['pid']);require(apps[FRONT]['pid']==front['pid']and identity and identity['ticks']==front['ticks'],'frontend_source_identity_drift')
 phase='UNCERTAIN'
 try:s=selected(p)
 except RuntimeError:return {'result':'OPENAI_INSPECTION','classification':'UNCERTAIN_SELECTION','replayAuthorized':False}
 pair={n for n in (API,WORKER)if n in apps};old=all(b.app_matches(n,before)for n in pair);new=all(b.app_matches(n,after)for n in pair)
 # Worker has no changed variable; API is the discriminating consumer.
 if not s and pair=={API,WORKER}and old:phase='ORIGINAL_LIVE'
 elif not s and not pair:phase='ORIGINAL_STOPPED'
 elif s and pair=={API,WORKER}and new:phase='NEW_LIVE'
 elif s and pair=={API}and new:phase='NEW_PARTIAL'
 elif s and not pair:phase='NEW_STOPPED'
 for mode in ('switch','return','return-partial','return-before-commit'):
  for n in (API,WORKER):
   intent=p/mode/('start-intent-'+n+'.json');marker=p/mode/('started-'+n+'.json')
   if intent.exists()and not marker.exists():phase='UNCERTAIN_START'
 return {'result':'OPENAI_INSPECTION','classification':phase,'newKeySelected':s,'replayAuthorized':False,'sqlMutation':False}
def finish(s,mode):
 s.finish(mode);p=s.root
 result=check_current(p,'after'if selected(p)else'before');gate_reset(p)
 write(p/'window/openai-complete.receipt.private.json',{'result':'OPENAI_COMPLETE_NEW_KEY'if selected(p)else'OPENAI_ABORT_ORIGINAL_PRESERVED','mode':mode,'contractSha256':sha(p/'window/openai-contract.private.json'),'current':result,'providerAfterReceiptSha256':sha(p/'window/provider-after/receipt.private.json')if selected(p)else None,'gatesFalse':True,'oldKeyRevoked':False});print('OPENAI_COMPLETE_NEW_KEY'if selected(p)else'OPENAI_ABORT_ORIGINAL_PRESERVED')
def execute(p):
 p=Path(p);w=p/'window';check(p,live=True)
 with(p.parent/'.incident-6683-window.lock').open('a+')as overall,(w/'sequencer.lock').open('a+')as lock:
  fcntl.flock(overall.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  require(not(w/'openai-execution.intent.private.json').exists(),'execution_consumed_inspection_only')
  a=read(w/'openai-admission.receipt.private.json');require(a['result']=='FIVE_GATES_ADMITTED'and a['reviewSha256']==sha(p/'preparation-review.sha256'),'admission_absent')
  now=datetime.datetime.now(datetime.timezone.utc);require(0<=(now-datetime.datetime.fromisoformat(a['rootCapturedUtc'])).total_seconds()<600,'root_expired_before_B');require(0<=(now-datetime.datetime.fromisoformat(a['backupCapturedUtc'])).total_seconds()<3600,'RPO_expired_before_B')
  check_current(p);s=Sequencer(Bridge(p));s.eligible();s.capture_baseline();write(w/'openai-baseline.private.json',s.baseline)
  write(w/'openai-execution.intent.private.json',{'reviewSha256':a['reviewSha256'],'admissionSha256':sha(w/'openai-admission.receipt.private.json'),'automaticRetry':False})
  try:
   s.close_then_preflight();s.controls_enter();s.action('switch','stop-pair');s.verify_stopped('switch')
   write(w/'openai-selection.intent.private.json',{'contractSha256':sha(w/'openai-contract.private.json'),'automaticRetry':False})
   write(w/'openai-selection.receipt.private.json',{'result':'NEW_OPENAI_SELECTED','intentSha256':sha(w/'openai-selection.intent.private.json'),'contractSha256':sha(w/'openai-contract.private.json'),'targetProfileSha256':sha(w/'target.profile.private.json')})
   s.start_pair('switch');provider_validate(p,'after','--owner-authorized-synthetic-provider-validation');finish(s,'switch')
  except BaseException as e:
   s.journal('openai_failure_inspection_only',errorClass=type(e).__name__);print('OPENAI_DENY_INSPECT_ONLY_NO_REPLAY');raise

def recover(p,decision):
 p=Path(p);w=p/'window'
 with(p.parent/'.incident-6683-window.lock').open('a+')as overall,(w/'sequencer.lock').open('a+')as lock:
  fcntl.flock(overall.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  v=inspect(p);require(not(w/'openai-recovery.intent.private.json').exists(),'recovery_consumed')
  allowed={'ORIGINAL':{'ORIGINAL_LIVE','ORIGINAL_STOPPED'},'NEW':{'NEW_LIVE','NEW_PARTIAL','NEW_STOPPED'}};require(decision in allowed and v['classification']in allowed[decision],'recovery_decision_or_classification_denied')
  require((w/'openai-execution.intent.private.json').exists()and(w/'openai-baseline.private.json').exists(),'no_execution_baseline_to_recover')
  write(w/'openai-recovery.intent.private.json',{'operatorDecision':decision,'inspection':v,'contractSha256':sha(w/'openai-contract.private.json'),'automaticRetry':False})
  s=Sequencer(Bridge(p));s.baseline=read(w/'openai-baseline.private.json')
  if v['classification']=='ORIGINAL_LIVE':
   require(s.recovery_mode()=='prestop','prestop_state_disagrees');s.recover();s.b.scheduled_controls().verify('before');s.b.privileged('check-absent');check_current(p);gate_reset(p);write(w/'openai-complete.receipt.private.json',{'result':'OPENAI_ABORT_ORIGINAL_PRESERVED','mode':'prestop','gatesFalse':True});print('OPENAI_ABORT_ORIGINAL_PRESERVED');return
  # Fenced recovery only. Post-unfence return requires a NEW generation and policy.
  s.b.privileged('check-present')
  if decision=='ORIGINAL':
   require(not selected(p),'original_key_return_forbidden');mode='return-before-commit'
   # Canonical recovery creates its own target-bound certificate after proving
   # the original trees/sockets absent. It does not copy or relabel an exit proof.
   s.action(mode,'recover-partial');s.verify_stopped(mode)
  else:
   require(selected(p),'new_key_selection_unproven');mode='return'if v['classification']=='NEW_LIVE'else'return-partial';s.action(mode,'stop-pair'if mode=='return'else'recover-partial');s.verify_stopped(mode)
  s.start_pair(mode)
  if decision=='NEW':
   receipt=w/'provider-after/receipt.private.json'
   if receipt.exists():
    r=read(receipt);require(r['result']=='OPENAI_FUNCTIONAL_ENDPOINTS_PASS'and r['targetProfileSha256']==sha(w/'target.profile.private.json')and r['contractSha256']==sha(w/'openai-contract.private.json'),'provider_receipt_drift')
   else:provider_validate(p,'after','--owner-authorized-synthetic-provider-validation')
  finish(s,mode)
if __name__=='__main__':
 os.umask(0o077)
 try:
  if len(sys.argv)==2:execute(Path(sys.argv[1]))
  elif len(sys.argv)==3 and sys.argv[2]=='--inspect-readonly':print(json.dumps(inspect(Path(sys.argv[1]))))
  elif len(sys.argv)==4 and sys.argv[2]=='--operator-recover':recover(Path(sys.argv[1]),sys.argv[3])
  else:raise RuntimeError('exact_arguments_required')
 except BaseException as e:print(json.dumps({'result':'OPENAI_OPERATION_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));sys.exit(1)
