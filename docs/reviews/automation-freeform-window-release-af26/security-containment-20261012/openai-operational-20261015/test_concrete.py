"""Full concrete generation; canonical Operations/Sequencer, only OS/provider effects simulated."""
import copy,importlib.util,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent;sys.path[:0]=[str(P/'window'),str(P/'switch')]
import openai_contract as contract,openai_start_gate,sequencer

def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
os.environ['AF26_V4_PACKAGE']=str(P);fx=load('reused_os_simulator',HERE.parent.parent/'v4-tests/test-package-set.py');cases=[]
def system(op):
 class Sim(fx.Fake):
  def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'audit':[]}
 return Sim({'apps':list(op.source.values())})
def choose(p):
 w=p/'window';contract.write(w/'openai-selection.intent.private.json',{'contractSha256':contract.sha(w/'openai-contract.private.json'),'automaticRetry':False});contract.write(w/'openai-selection.receipt.private.json',{'result':'NEW_OPENAI_SELECTED','intentSha256':contract.sha(w/'openai-selection.intent.private.json'),'contractSha256':contract.sha(w/'openai-contract.private.json'),'targetProfileSha256':contract.sha(w/'target.profile.private.json')})
def prepared():
 tmp=tempfile.TemporaryDirectory();p=Path(tmp.name)/P.name;shutil.copytree(P,p);return tmp,p
contract.check(P,live=False);cases.append('concrete_complete_four_modes_contract')
for mode in contract.MODES:
 tmp,p=prepared()
 try:
  ops=load('actual_ops_'+mode.replace('-','_'),p/mode/'ops.py');op=ops.Operations(p/mode,None);d=system(op);op.d=d
  op.stop()
  if mode!='return-before-commit':choose(p)
  with patch.object(openai_start_gate,'check',lambda root,live:contract.check(root,live=False)):
   op.start(ops.API);op.start(ops.WORKER)
  assert len([x for x in d.calls if isinstance(x,str)and x.startswith('start:')])==2
  # Actual start marker protects against repeating a consumed start.
  with patch.object(openai_start_gate,'check',lambda root,live:contract.check(root,live=False)):
   try:op.start(ops.API);raise AssertionError('start replay bypass')
   except (RuntimeError,FileExistsError):pass
  cases.append('actual_stop_start_pair_'+mode)
 finally:tmp.cleanup()
 for negative in ('missing_mode','mode_divergence','file_mode','hash','empty_references','restore_missing','selection_uncertain','selection_receipt_drift','wrong_epoch'):
  tmp,p=prepared()
  try:
   ops=load('negative_ops',p/mode/'ops.py');op=ops.Operations(p/mode,None);d=system(op);op.d=d
   if negative in ('selection_uncertain','selection_receipt_drift','wrong_epoch'):
    op.stop()
    if negative=='selection_uncertain':contract.write(p/'window/openai-selection.intent.private.json',{'automaticRetry':False})
    elif negative=='selection_receipt_drift':choose(p);(p/'window/openai-selection.receipt.private.json').write_text('{}')
    elif mode=='return-before-commit':choose(p)
    # Other modes intentionally have no NEW selection.
    with patch.object(openai_start_gate,'check',lambda root,live:contract.check(root,live=False)):
     try:op.start(ops.API);raise AssertionError('start boundary bypass')
     except (RuntimeError,KeyError,FileExistsError):pass
    assert not any(isinstance(x,str)and x.startswith('start:')for x in d.calls)
   else:
    if negative in ('missing_mode','mode_divergence'):
     f=p/mode/'plan.private.json';v=json.loads(f.read_text());v.pop('mode')if negative=='missing_mode'else v.update(mode='other');f.write_text(json.dumps(v))
    elif negative=='file_mode':(p/mode/'candidate.config.private.json').chmod(0o644)
    elif negative=='hash':(p/mode/'ops.py').write_text('invalid changed code')
    elif negative=='empty_references':
     f=p/'window/openai-contract.private.json';v=json.loads(f.read_text());v['immutable']=[];f.write_text(json.dumps(v))
    elif negative=='restore_missing':(p/'window/restore-result.json').unlink()
    try:contract.check(p,live=False);raise AssertionError('contract bypass')
    except (RuntimeError,KeyError,FileNotFoundError):pass
   cases.append(mode+':'+negative)
  finally:tmp.cleanup()
# Real preflight and finish use concrete restore/configuration files, both cron predicates.
for mode in contract.MODES:
 tmp,p=prepared()
 try:
  current={'deploy':(p/'window/deploy.crontab.before').read_text(),'system':(p/'window/re7-converta-backup.before').read_text()}
  class B:
   root=p;window=p/'window'
   calls=[]
   def scheduled_controls(self):
    from scheduled_controls import ScheduledControls
    def run(args,text=None):
     if args==['crontab','-l']:return current['deploy']
     if args[0]=='cat':return current['system']
     if args==['crontab','-']:current['deploy']=text;return ''
     raise RuntimeError('unexpected system effect')
    return ScheduledControls(self.window,run)
   def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'ledgerFault':False,'audit':[]}
   def node(self,m,n):
    self.calls.append((m,n))
    if n=='close.cjs':(p/m/'drain-result.json').write_text('{}')
   def protocol(self,m,a):
    self.calls.append((m,a))
    if a=='unfence':(p/m/'owner-unfence-authorized.json').write_text('{}')
   def privileged(self,a):self.calls.append(a);return '{}'
   def pre_unfence(self,m):self.calls.append(('pre_unfence',m))
   def renewed_unfence(self,m):self.calls.append(('renewed_unfence',m))
  b=B();s=sequencer.Sequencer(b);src=contract.read(p/'window/privileged-policy.private.json')['sourceProcesses'];s.baseline={'guardGeneration':38,'apps':{n:{'pid':e['pid'],'identity':{'ticks':e['ticks'],'state':'S'}}for n,e in src.items()}}
  original=Path.read_text;cfg=contract.read(p/mode/'candidate.config.private.json');front=next(a for a in cfg['apps']if a['name']=='re7-admin-front')['cwd'];build=contract.read(p/mode/'baseline.private.json')['frontendBuild']
  def local_read(path,*args,**kw):return build if str(path)==front+'/.next/BUILD_ID'else original(path,*args,**kw)
  with patch.object(Path,'read_text',local_read):s.close_then_preflight();s.finish(mode)
  assert ('switch','preflight')in b.calls and ('complete'in[p.read_text()for p in [p/'window/sequencer.journal.jsonl']][0])
  current['deploy']+='drift'
  try:b.scheduled_controls().verify('before');raise AssertionError('deploy drift bypass')
  except RuntimeError:pass
  current['deploy']=(p/'window/deploy.crontab.before').read_text();current['system']+='drift'
  try:b.scheduled_controls().verify('before');raise AssertionError('system drift bypass')
  except RuntimeError:pass
  cases.append('real_preflight_finish_and_both_cron_negatives_'+mode)
 finally:tmp.cleanup()
print(json.dumps({'result':'OPENAI_CONCRETE_LOCAL_TESTS_PASS','caseCount':len(cases),'cases':cases,'realOperationsStopStart':True,'realSequencerPreflightFinish':True,'operatingSystemEffectsSimulated':True,'providerCalls':0,'productionEffects':False},sort_keys=True))
