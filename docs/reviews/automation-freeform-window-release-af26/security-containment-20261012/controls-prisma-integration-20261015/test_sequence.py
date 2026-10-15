"""Full concrete admission -> preflight -> prestop recovery -> finish in four modes.
Host/clock/HTTP observations are simulated. The unchanged preparatory subprocess
response is replayed from its prior real READ ONLY receipt, never an empty fixture.
All new cron predicates, manifests, restore validators, admission writes and final
control consumers execute. No CLI or effect touches the VPS.
"""
import ast,base64,contextlib,copy,datetime,hashlib,importlib.util,io,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
from unittest.mock import patch
from prepare_future import verify_files
HERE=Path(__file__).resolve().parent;SOURCE=Path(sys.argv[1]).resolve();ROOT=Path.cwd();cases=[]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m);return m
def write(p,v):p.write_text(json.dumps(v));p.chmod(0o600)
baseline_path=ROOT/'local-evidence/cipher-locked-preparation-v2-20261014T235000Z/root.private.json'
prior_root=json.loads(baseline_path.read_text())
receipt_root=ROOT/'local-evidence/cipher-v13-authorized-20261015'
chain_source=json.loads((receipt_root/'renewed-read-private/result.private.json').read_text())
backup=json.loads((receipt_root/'backup-result.private.json').read_text())
NOW=datetime.datetime.fromisoformat(backup['startedUtc'])+datetime.timedelta(seconds=30)
class Clock(datetime.datetime):
 @classmethod
 def now(cls,tz=None):return NOW if tz else NOW.replace(tzinfo=None)
effect_tree=ast.parse((HERE.parent/'scheduled-controls-20261015/test_future_controls.py').read_text())
effects_ast=next(n for n in effect_tree.body if isinstance(n,ast.With))
effects_class=next(n for n in effects_ast.body if isinstance(n,ast.ClassDef)and n.name=='Effects')
for mode in ('switch','return','return-partial','return-before-commit'):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/SOURCE.name;shutil.copytree(SOURCE,p);w=p/'window';sys.path[:0]=[str(p/'conductor'),str(w),str(p/'switch')]
  for name in ['check_root_capture','cron_root_contract','scheduled_controls','sequencer','restore_contract','baseline_contract','ecosystem_contract','ops','locked_driver']:
   sys.modules.pop(name,None)
  seq=load('sequencer',w/'sequencer.py');contract=load('scheduled_controls',w/'scheduled_controls.py');priv=load('local_privileged',w/'privileged.py')
  cfg=json.loads((p/'switch/return.config.private.json').read_text())['apps'];policy=json.loads((w/'privileged-policy.private.json').read_text());initial=json.loads((w/'initial.private.json').read_text())
  expected={k:{ph:(w/(prefix+'.'+suffix)).read_text()for ph,suffix in [('before','before'),('contained','window')]}for k,prefix in [('deploy','deploy.crontab'),('system','re7-converta-backup')]}
  root_policy={**policy,'policySha256':hashlib.sha256((w/'privileged-policy.private.json').read_bytes()).hexdigest(),'cronBefore':base64.b64decode(policy['cronBeforeB64']),'cronWindow':base64.b64decode(policy['cronWindowB64'])}
  ns={'Path':Path,'policy':policy,'cfg':cfg,'initial':initial,'expected':expected,'contract':contract,'privileged':priv,'root_policy':root_policy,'patch':patch,'json':json}
  exec(compile(ast.Module(body=[effects_class],type_ignores=[]),'<reused-system-effects>','exec'),ns)
  e=ns['Effects']('before','before');b=seq.Bridge.__new__(seq.Bridge);b.root=p;b.window=w;b.switch=p/'switch'
  b.run=lambda args,*,input_text=None,**kw:e.run(args,input_text);b.apps=e.apps;b.identity=e.identity
  b.guard=lambda:{'version':1,'open':False,'generation':38,'tasks':{},'audit':[]}
  b.restore_guard=lambda choice: e.calls.append(('HTTP-restore-guard',choice))
  b.privileged=lambda action: json.dumps({'policySha256':root_policy['policySha256'],'phase':None,'sourceProcessesAlive':True})if action=='inspect'else '{}'if action=='check-absent'else e.privileged(action)
  admission=load('integrated_admission',p/'conductor/admit_gates.py')
  # The delivered composition has NO approval. Explicit operator action is
  # simulated only in this test module; the published file remains None.
  try:admission.main(p,Path(tmp)/'absent',Path(tmp)/'forbidden','--owner-authorized-future-controls');raise AssertionError('unapproved engineering admitted')
  except AssertionError as ex:assert str(ex)=='future_window_authorization_absent'
  cases.append({'mode':mode,'stage':'unapproved_composition','accepted':False})
  admission.APPROVAL_COMMIT='f'*40
  inputs=Path(tmp)/'inputs';inputs.mkdir(mode=0o700)
  for n in ['backup-result.private.json','custody-ack.private.json','lab-current.private.json']:shutil.copyfile(receipt_root/n,inputs/n);(inputs/n).chmod(0o600)
  shutil.copyfile(baseline_path,inputs/'root-baseline.private.json');(inputs/'root-baseline.private.json').chmod(0o600)
  observed=copy.deepcopy(prior_root);observed['atUtc']=NOW.isoformat()
  for x in observed['files']:
   if x['path']=='/usr/local/libexec/re7/incident-6683-window-policy.json':x['sha256']=root_policy['policySha256']
  write(inputs/'root.private.json',observed)
  actual_bytes=Path.read_bytes;actual_text=Path.read_text
  build=json.loads((p/'switch/baseline.private.json').read_text())['frontendBuild'];front=next(c for c in cfg if c['name']==seq.FRONT)['cwd']
  def read_bytes(path,*a,**kw):
   if str(path)==backup['remoteDirectory']+'/database.dump':return(receipt_root/'backup/database.dump').read_bytes()
   if str(path)==contract.SYSTEM_CRON:return e.values['system'].encode()
   return actual_bytes(path,*a,**kw)
  def read_text(path,*a,**kw):
   if str(path)==front+'/.next/BUILD_ID':return build
   return actual_text(path,*a,**kw)
  def chain_command(args,**kw):
   assert args[:2]==['python3','-B']and args[2]==str(p/'read-preparatory.py')
   # System subprocess replay: real prior facts, exact integrated bytes checked,
   # and new live cron gate really evaluated before emitting its observed result.
   verify_files(p);contract.ScheduledControls(w,e.run).verify('before')
   target=Path(args[4]);target.mkdir(mode=0o700);r=copy.deepcopy(chain_source)
   r['gatesPassed']=['scheduled_controls_before']+r['gatesPassed'];r['reviewManifestSha256']=hashlib.sha256((p/'preparation-review.sha256').read_bytes()).hexdigest();r['windowManifestSha256']=hashlib.sha256((w/'sequencer-manifest.json').read_bytes()).hexdigest();write(target/'result.private.json',r)
   return subprocess.CompletedProcess(args,0)
  with patch.object(seq,'Bridge',lambda root:b),patch.object(Path,'read_bytes',read_bytes),patch.object(Path,'read_text',read_text),patch.object(datetime,'datetime',Clock),patch.object(subprocess,'check_output',lambda args,**kw:e.run(args,kw.get('input'))),patch.object(subprocess,'run',chain_command),contextlib.redirect_stdout(io.StringIO()):
   admission.main(p,inputs,Path(tmp)/'admission','--owner-authorized-future-controls')
  assert all(x is True for x in json.loads((w/'execution-gates.private.json').read_text()).values())
  cases.append({'mode':mode,'stage':'complete_admission_main','accepted':True,'priorReadOnlyFactsReused':True,'newControlsActuallyVerified':True})
  # Real close/preflight, with command/HTTP effects only.
  s=seq.Sequencer(b);s.baseline={'guardGeneration':38,'apps':{n:{'pid':v['pid'],'identity':e.identity(v['pid'])}for n,v in e.live.items()}}
  b.node=lambda selected,script:(p/selected/'drain-result.json').write_text(json.dumps({'open':False,'generation':38,'tasks':0,'drained':True}))
  b.protocol=lambda selected,action:contract.ScheduledControls(w,e.run).verify('before')
  with patch.object(Path,'read_text',read_text):s.close_then_preflight()
  e.values={k:expected[k]['contained']for k in expected}
  s.recover()
  assert e.values=={k:expected[k]['before']for k in expected}
  cases.append({'mode':mode,'stage':'preflight_then_actual_prestop','accepted':True,'helper8deActualAbortBranch':True})
  # Real sequencer finish orchestration and real final delegated consumer.
  ops=load('ops',p/mode/'ops.py');delegated=load('delegated',p/mode/'delegated.py')
  target=json.loads((p/mode/'candidate.config.private.json').read_text())['apps']
  for c in target:e.live[c['name']]['cfg']=c
  e.values={k:expected[k]['contained']for k in expected}
  class System:
   run=staticmethod(e.run);proof=staticmethod(lambda:None)
   guard=staticmethod(b.guard);apps=staticmethod(lambda:list(e.live.values()))
   @staticmethod
   def check_config(a,c):assert a['cfg']==c
  b.pre_unfence=lambda selected:e.calls.append(('retained-pre-unfence-proof',selected))
  b.renewed_unfence=lambda selected:e.calls.append(('nft-unfence-effect',selected))
  def protocol(selected,action):
   assert selected==mode
   if action=='unfence':write(p/mode/'owner-unfence-authorized.json',{'direction':json.loads((p/mode/'plan.private.json').read_text())['direction'],'generation':38,'configHash':ops.digest(ops.Operations(p/mode,None).target)})
   elif action=='restore-controls':delegated.DelegatedControls(p/mode,System()).finish()
  b.protocol=protocol
  def node(selected,script):
   if script=='validate.cjs':write(p/mode/'after-unfence.json',{'workerHealth':True,'health':[{'ok':True,'db':'ok'}],'guard':{'build':target[0]['env']['CAMPAIGN_BUILD_ID']}})
  b.node=node
  def privileged(action):
   if action=='restore-controls':
    # Exact installed helper restore-controls branch; only root I/O replaced.
    boot={'state':'disabled'};phases=[]
    def commands(args,**kw):
     if args[0]=='/usr/sbin/nft':return b'{"nftables":[]}'
     if args[1]=='enable':boot['state']='enabled';return b''
     return ('ActiveState=inactive\nUnitFileState='+boot['state']+'\n').encode()
    with patch.object(priv,'phase_read',lambda:{'stage':'unfenced','policySha256':root_policy['policySha256'],'mode':mode}),patch.object(priv,'phase_write',lambda *x:phases.append(x)),patch.object(priv,'write_cron',lambda raw:e.values.__setitem__('system',raw.decode())),patch.object(priv,'system',commands):priv.act(action,root_policy)
    assert phases[0][0]=='complete'
   return '{}'
  b.privileged=privileged
  with patch.object(Path,'read_bytes',read_bytes),patch.object(Path,'read_text',read_text):s.finish(mode)
  assert e.values=={k:expected[k]['before']for k in expected}
  events=[json.loads(x)['event']for x in(w/'sequencer.journal.jsonl').read_text().splitlines()]
  assert 'prestop_restored'in events and events[-1]=='complete'
  assert not(w/'credential-commit.intent.private.json').exists()
  cases.append({'mode':mode,'stage':'actual_sequencer_and_delegated_finish','accepted':True,'helper8deActualRestoreBranch':True})
print(json.dumps({'result':'INTEGRATED_CONTROL_SEQUENCE_LOCAL_PASS','cases':cases,'caseCount':len(cases),'completeCandidate':True,'realAdmissionMain':True,'externalPreparatoryChain':'prior real READ ONLY response reused plus actual new controls/hash checks','notExercised':['fresh production root/RPO/SQL-proxy','pre-unfence process/network/nonce gates retained from previous proofs','cipher SQL or successor starts'],'productionEffects':False}))
