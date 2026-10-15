"""Additional real preconditions; complete profiles/certificates, system effects only simulated."""
import hashlib,importlib.util,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent
sys.path[:0]=[str(P/'window'),str(P/'switch')]
import sequencer,cipher_start_gate,locked_driver
from credential_boundary import CredentialBoundary,VERIFIED

def load(name,p):
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
os.environ['AF26_V4_PACKAGE']=str(P)
fx=load('simulator',HERE.parent.parent/'v4-tests/test-package-set.py')
plan=json.loads(Path('local-evidence/cipher-snapshot-vps-20261014/channel-plan/channel-plan.private.json').read_text());cases=[]
def system(op):
 class Sim(fx.Fake):
  def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'audit':[]}
 return Sim({'apps':list(op.source.values())})
def auth(p,kind):
 w=p/'window';h=hashlib.sha256(json.dumps(plan).encode()).hexdigest();b=CredentialBoundary(w,h);b.write(w/'credential-commit.intent.private.json',{'planSha256':h})
 if kind=='VERIFIED':b.record_verified_observation(lambda:VERIFIED)
 elif kind=='ORIGINAL_VERIFIED':b.record_original_observation(lambda:kind)
 class Reads:
  def __init__(self,*a):pass
  def prior(self):return plan,h,b
  def classify(self,*a):return kind
  def verify_current_verified(self,*a):return 'VERIFIED_CURRENT_NEW_EPOCH'if kind=='VERIFIED'else'DENY'
 return Reads
for mode in ('switch','return','return-partial','return-before-commit'):
 for kind in ('guard','containment','unknown_process','config','db_owner','survivor','socket_survivor','missing_front','recovery_binding'):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/P.name;shutil.copytree(P,p);ops=load('precondition_ops',p/mode/'ops.py');op=ops.Operations(p/mode,None);d=system(op);op.d=d
   if kind=='guard':d.guard=lambda:{'version':1,'open':True,'generation':38,'tasks':{},'audit':[]}
   elif kind=='containment':d.contained=False
   elif kind=='unknown_process':d.live['unknown']=dict(next(iter(d.live.values())),name='unknown')
   elif kind=='config':d.live[ops.API]['cfg']['cwd']='/divergent'
   elif kind=='db_owner':d.db={'otherClientBackends':1,'advisoryLocks':0}
   elif kind=='survivor':d.survive=True
   elif kind=='socket_survivor':d.socket_survive=True
   elif kind=='missing_front':del d.live[ops.FRONT]
   elif kind=='recovery_binding':op.plan['recovery']=False
   try:op.stop(recovery=kind=='recovery_binding');raise AssertionError('precondition bypassed '+kind)
   except RuntimeError:pass
   if kind not in ('db_owner','survivor','socket_survivor'):assert not any(isinstance(c,str)and c.startswith('delete:')for c in d.calls)
   assert not(p/mode/'old-exit-confirmed.json').exists()
   cases.append({'mode':mode,'stage':'stop','negative':kind})
 for kind in ('certificate','generation','owner_order','front_identity','artifact','auth_binding','db_owner','epoch_uncertain','start_consumed'):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/P.name;shutil.copytree(P,p);ops=load('start_ops',p/mode/'ops.py');op=ops.Operations(p/mode,None);d=system(op);op.d=d;op.stop()
   if kind=='certificate':
    f=p/mode/'old-exit-confirmed.json';v=json.loads(f.read_text());v['configHash']='0'*64;f.write_text(json.dumps(v))
   elif kind=='generation':d.guard=lambda:{'version':1,'open':False,'generation':39,'tasks':{},'audit':[]}
   elif kind=='owner_order':d.add(op.target[ops.WORKER])
   elif kind=='front_identity':d.proc[str(d.live[ops.FRONT]['pid'])]['ticks']='divergent'
   elif kind=='artifact':d.missing_artifact=True
   elif kind=='auth_binding':
    def deny(*a):raise RuntimeError('auth_binding_drift')
    d.validate_bindings=deny
   elif kind=='db_owner':d.db={'otherClientBackends':1,'advisoryLocks':0}
   elif kind=='start_consumed':(p/mode/('start-intent-'+ops.API+'.json')).write_text('{}')
   epoch='UNCERTAIN'if kind=='epoch_uncertain'else('ORIGINAL_VERIFIED'if mode=='return-before-commit'else'VERIFIED');reads=auth(p,epoch)
   with patch.object(cipher_start_gate,'Driver',reads),patch.object(sequencer,'PREPARATIONS',p.parent):
    try:op.start(ops.API);raise AssertionError('start bypassed '+kind)
    except (RuntimeError,FileExistsError):pass
   assert not any(isinstance(c,str)and c.startswith('start:')for c in d.calls)
   cases.append({'mode':mode,'stage':'start','negative':kind})
# Actual preflight: only its system bridge actions are simulated.
for valid in (True,False):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p)
  class B:
   root=p;window=p/'window'
   calls=[]
   def node(self,mode,script):self.calls.append(script);(p/mode/'drain-result.json').write_text(json.dumps({'initiallyClosed':True,'open':False,'generation':38,'drained':True,'tasks':0,'ledgerFault':None}))
   def guard(self):return {'open':False,'generation':38,'tasks':{},'ledgerFault':None}
   def protocol(self,mode,action):self.calls.append(action)
  b=B();s=sequencer.Sequencer(b);src=json.loads((p/'window/privileged-policy.private.json').read_text())['sourceProcesses'];s.baseline={'guardGeneration':38,'apps':{n:{'pid':v['pid'],'identity':{'ticks':v['ticks'],'state':'S'}}for n,v in src.items()}}
  if not valid:(p/'window/restore-result.json').unlink()
  original_read=Path.read_text
  build=json.loads((p/'switch/baseline.private.json').read_text())['frontendBuild']
  front=json.loads((p/'switch/candidate.config.private.json').read_text())['apps'][2]['cwd']
  def read(path,*a,**kw):
   if str(path)==front+'/.next/BUILD_ID':return build
   return original_read(path,*a,**kw)
  with patch.object(Path,'read_text',read):
   try:s.close_then_preflight();assert valid
   except FileNotFoundError:assert not valid
  assert ('preflight'in b.calls)==valid
  cases.append({'stage':'close_then_preflight','validRestore':valid})
# Driver connection diagnostic collision: use actual connection method; replace SQL transport only.
with tempfile.TemporaryDirectory()as tmp:
 p=Path(tmp);d=object.__new__(locked_driver.Driver);d.w=p;d.spec={'node':'node','databaseIdentity':{'database':'isolated'}}
 old=p/'complete-preparatory.private.stderr';old.write_text('preserved previous evidence');before=old.read_bytes();names=[]
 def transport(*a,**k):
  f=a[4];names.append(f.name)
  with f.open('xb'):pass
  return f
 with patch.object(locked_driver,'Pinned',transport):
  d.connection('complete-preparatory');d.connection('complete-preparatory')
 assert len(set(names))==2 and old.read_bytes()==before
 cases.append({'stage':'diagnostic_unique','priorPreserved':True})
# Return-only closure uses its exact mode, never requires absent sibling modes.
for mode in ('switch','return','return-partial','return-before-commit'):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p)
  class FinishBridge:
   root=p;window=p/'window'
   def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'audit':[]}
   def pre_unfence(self,m):assert m==mode
   def protocol(self,m,action):
    assert m==mode
    if action=='unfence':
     cfg=json.loads((p/m/'candidate.config.private.json').read_text())
     (p/m/'owner-unfence-authorized.json').write_text(json.dumps({'direction':json.loads((p/m/'plan.private.json').read_text())['direction'],'generation':38,'configHash':hashlib.sha256(json.dumps(cfg,sort_keys=True).encode()).hexdigest()}))
   def privileged(self,a):return '{}'
   def renewed_unfence(self,m):assert m==mode
   def node(self,m,n):assert m==mode
  original=Path.read_text;build=json.loads((p/mode/'baseline.private.json').read_text())['frontendBuild'];front=next(a for a in json.loads((p/mode/'candidate.config.private.json').read_text())['apps']if a['name']=='re7-admin-front')['cwd']
  def read(path,*a,**kw):
   if str(path)==front+'/.next/BUILD_ID':return build
   for other in ('switch','return','return-partial','return-before-commit'):
    if other!=mode and (p/other)in path.parents:raise AssertionError('closure required another mode')
   return original(path,*a,**kw)
  with patch.object(Path,'read_text',read):sequencer.Sequencer(FinishBridge()).finish(mode)
  cases.append({'stage':'finish_exact_mode','mode':mode,'allOtherModesForbidden':True})
print(json.dumps({'result':'REAL_PRECONDITIONS_PASS','cases':cases,'caseCount':len(cases),'productionEffects':False}))
