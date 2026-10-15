"""Real recovery authorization + real Operations with complete candidate and sealed-plan evidence.
SQL classification/kernel/process effects simulated. Does not claim production recovery.
"""
import contextlib,hashlib,importlib.util,io,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent;sys.path[:0]=[str(P/'window'),str(P/'switch')]
import recovery_actions as recovery,sequencer,cipher_start_gate,locked_cli,ops
from credential_boundary import CredentialBoundary
from locked_plan import digest
os.environ['AF26_V4_PACKAGE']=str(P)
s=importlib.util.spec_from_file_location('process_model',HERE.parent.parent/'v4-tests/test-package-set.py');fx=importlib.util.module_from_spec(s);s.loader.exec_module(fx)
plan=json.loads(Path('local-evidence/cipher-snapshot-vps-20261014/channel-plan/channel-plan.private.json').read_text());cases=[]
def write(p,v):p.write_text(json.dumps(v,separators=(',',':'),ensure_ascii=False));p.chmod(0o600)
for classification in ('ORIGINAL_VERIFIED','VERIFIED','UNCERTAIN'):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p);w=p/'window';h=digest(plan);approved=json.loads((w/'approved-scope.private.json').read_text());spec=json.loads((w/'locked-hook.private.json').read_text());boundary=CredentialBoundary(w,h);seal=w/'seal-current'
  write(seal/'source.private.json',approved);write(seal/'plan.private.json',plan);write(seal/'intent.private.json',{'phaseId':spec['phaseId'],'planHash':h,'sourceHash':recovery.sha(seal/'source.private.json'),'scopeHash':digest(approved)})
  write(w/'credential-commit.intent.private.json',{'planSha256':h,'sealIntentSha256':recovery.sha(seal/'intent.private.json')})
  # Commit response/receipt is absent until explicit record-verified. No SQL replay method exists.
  assert not(w/'credential-commit.receipt.private.json').exists()
  class Reads:
   def __init__(self,*a):self.w=w;self.approved=approved;self.spec=spec
   def prior(self):return plan,h,boundary
   def classify(self,*a):return classification
   def verify_current_verified(self,*a):return 'VERIFIED_CURRENT_NEW_EPOCH'if classification=='VERIFIED'else'DENY'
  class Sim(fx.Fake):
   def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'audit':[]}
  # The stop report is emitted by the actual Operations implementation.
  switch=ops.Operations(p/'switch',None);prior=Sim({'apps':list(switch.source.values())});prior.live={};prior.proc={};prior.sockets=set();prior.pid=500
  for cfg in switch.source.values():prior.add(cfg)
  switch.d=prior;switch.stop()
  target='return-before-commit'if classification=='ORIGINAL_VERIFIED'else'return-partial';op=ops.Operations(p/target,None);d=Sim({'apps':list(op.source.values())})
  for name in (ops.API,ops.WORKER):
   a=d.live.pop(name);d.proc.pop(str(a['pid']));d.proc.pop(str(a['pid']+1));d.sockets.discard(str(a['pid']*10))
  op.d=d
  with patch.object(sequencer,'PREPARATIONS',p.parent):b=sequencer.Bridge(p)
  b.guard=d.guard;b.apps=lambda:{a['name']:a for a in d.apps()};b.identity=d.identity
  b.run=lambda args,**kw:subprocess.check_output(args,cwd=kw.get('cwd'),text=True,stderr=subprocess.PIPE)
  def privileged(action):
   assert action=='check-present';return '{}'
  b.privileged=privileged
  baseline={'guardGeneration':38,'apps':{n:{'pid':a['pid'],'identity':d.identity(a['pid'])}for n,a in d.live.items()}}
  # Preserve the complete pair identities in the saved full baseline, even when stopped.
  src=json.loads((w/'privileged-policy.private.json').read_text())['sourceProcesses']
  for n in (ops.API,ops.WORKER):baseline['apps'][n]={'pid':src[n]['pid'],'identity':{'ticks':src[n]['ticks'],'state':'S'}}
  write(w/'recovery-baseline.private.json',baseline);write(w/'execution-gates.private.json',{k:True for k in json.loads((w/'execution-gates.private.json').read_text())});(p/'execution-authorized').write_text('true\n')
  class Executor:
   baseline=None
   def recovery_mode(self):return 'return-partial'
   def recover(self):
    op.stop(recovery=True)
    with patch.object(cipher_start_gate,'Driver',Reads),patch.object(sequencer,'PREPARATIONS',p.parent):op.start(ops.API);op.start(ops.WORKER)
  e=Executor();driver=Reads()
  expected='ORIGINAL_VERIFIED'if classification=='ORIGINAL_VERIFIED'else'VERIFIED'
  suffix='original'if expected=='ORIGINAL_VERIFIED'else'verified'
  argv=[str(p),'--recovery-action','record-'+suffix,'--operator-decision',expected];args=locked_cli.parser().parse_args(argv)
  if classification=='UNCERTAIN':
   try:recovery.execute(b,driver,e,args.recovery_action,args.operator_decision);raise AssertionError('uncertainty accepted')
   except RuntimeError:pass
   assert not(w/'recovery.intent.private.json').exists()
  else:
   result=recovery.execute(b,driver,e,args.recovery_action,args.operator_decision);assert result['result']=='OBSERVATION_RECORDED'
   args=locked_cli.parser().parse_args([str(p),'--recovery-action','recover-'+suffix,'--operator-decision',expected])
   result=recovery.execute(b,driver,e,args.recovery_action,args.operator_decision);assert result['result']=='RECOVERY_COMPLETE'and result['mode']==target and result['sqlReplayed']is False
   try:recovery.execute(b,driver,e,args.recovery_action,args.operator_decision);raise AssertionError('recovery replay accepted')
   except RuntimeError:pass
   assert len([c for c in d.calls if isinstance(c,str)and c.startswith('start:')])==2
  cases.append({'classification':classification,'commitResponseLost':classification=='VERIFIED','planChanges':len(plan['changes']),'sqlReplayed':False,'recoveryExecutedLocally':classification!='UNCERTAIN'})
print(json.dumps({'result':'REAL_RECOVERY_BOUNDARY_OPERATIONS_PASS','cases':cases,'caseCount':len(cases),'completeCandidateAndPlan':True,'productionEffects':False,'notExercised':'canonical sequencer finish/root nonce exchange in production'}))
