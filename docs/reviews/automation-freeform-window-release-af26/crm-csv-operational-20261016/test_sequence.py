"""Exact CLI functions + canonical Operations/Sequencer. OS bridge/probes/admission facts injected.
Admission/RPO authority and real HTTP effects are deliberately NOT certified by these tests.
"""
import copy,datetime,importlib.util,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent;sys.path[:0]=[str(P/'window'),str(P/'switch')]
import event_overlay
import csv_cli as cli,csv_contract as c,csv_start_gate,sequencer,ops
os.environ['AF26_V4_PACKAGE']=str(P)
spec=importlib.util.spec_from_file_location('os_sim_cli',HERE.parent/'v4-tests/test-package-set.py');fx=importlib.util.module_from_spec(spec);spec.loader.exec_module(fx)
results=[]
for scenario in ('complete','prestop_failure','ambiguous_api_start','contained_new_return','frontend_drift_recovery'):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p);w=p/'window';source=c.read(w/'source.profile.private.json')
  class D(fx.Fake):
   def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'ledgerFault':False,'audit':[]}
  d=D(source);d.cron=(w/'deploy.crontab.before').read_text();d.system_cron=(w/'re7-converta-backup.before').read_text();d.supervision=c.read(w/'initial.private.json')['supervision'];fence={'active':False};once={'pre':False}
  policy=c.read(w/'privileged-policy.private.json');d.proc={};d.sockets=set();d.pid=max(e['pid']for e in policy['sourceProcesses'].values())
  for name,a in d.live.items():
   e=policy['sourceProcesses'][name];a['pid']=e['pid'];d.proc[str(e['pid'])]={'state':'S','ticks':e['ticks']};d.proc[str(e['pid']+1)]={'state':'S','ticks':e['ticks']+'1'};d.sockets.add(str(e['pid']*10))
  if scenario=='ambiguous_api_start':d.fail_start=True
  class B(sequencer.Bridge):
   def __init__(self,root):self.root=Path(root);self.window=self.root/'window'
   def guard(self):return d.guard()
   def apps(self):return {a['name']:a for a in d.apps()}
   def identity(self,pid):return d.identity(pid)
   def run(self,args,**kw):
    if args[0]=='sha256sum':return '' # Full file/hash contract separately executed before all cases.
    return d.run(args,kw.get('input_text'))
   def app_matches(self,n,config):
    try:d.check_config(self.apps()[n],config[n]);return True
    except (RuntimeError,KeyError):return False
   def privileged(self,action):
    if action=='inspect':return json.dumps({'policySha256':c.sha(w/'privileged-policy.private.json'),'phase':None,'sourceProcessesAlive':True})
    if action=='check-present':c.require(fence['active'],'no_fence')
    if action=='check-absent':c.require(not fence['active'],'fence_present')
    if action=='enter':fence['active']=True
    if action=='abort-prestop':fence['active']=False;d.system_cron=(w/'re7-converta-backup.before').read_text()
    return '{}'
   def restore_guard(self,*a):c.require(not d.guard()['open'],'guard')
   def scheduled_controls(self):
    from scheduled_controls import ScheduledControls
    def run(args,text=None):
     if args==['crontab','-']:d.cron=text;return ''
     return d.run(args,text)
    return ScheduledControls(w,run)
   def node(self,mode,script):
    if script=='close.cjs':(p/mode/'drain-result.json').write_text('{}')
   def protocol(self,mode,action):
    op=ops.Operations(p/mode,d);controls=ops.Controls(p/mode,d)
    if action=='preflight'and scenario in ('prestop_failure','frontend_drift_recovery'):raise RuntimeError('injected preflight failure')
    if action=='contain':controls.enter()
    elif action in ('stop-pair','recover-partial'):op.stop(recovery=action=='recover-partial')
    elif action.startswith('start:'):op.start(action.split(':',1)[1])
    elif action=='unfence':controls.unfence();(p/mode/'owner-unfence-authorized.json').write_text('{}')
    elif action=='verify-unfenced':
     cfg=c.read(p/mode/'candidate.config.private.json');(p/mode/'after-unfence.json').write_text(json.dumps({'workerHealth':True,'health':[{'ok':True,'db':'ok'}],'guard':{'build':cfg['apps'][0]['env']['CAMPAIGN_BUILD_ID']}}))
    elif action=='restore-controls':controls.finish()
    if action in ('stop-pair','recover-partial'):
     c.write(w/('csv-imports-'+mode+'-after-exit.private.json'),{'basis':'AUDIT_AND_EXECUTOR_EXIT','scopeComplete':True,'observationComplete':True,'underFence':True,'exitCertificateSha256':c.sha(p/mode/'old-exit-confirmed.json'),'operations':[]})
   def pre_unfence(self,mode):
    if scenario=='contained_new_return'and mode=='switch'and not once['pre']:
     once['pre']=True;raise RuntimeError('injected contained failure')
   def renewed_unfence(self,mode):fence['active']=False
  def current(root,phase='before'):
   wanted=c.read(w/('source.profile.private.json'if phase=='before'else'target.profile.private.json'))
   c.require(set(d.live)=={a['name']for a in wanted['apps']},'mock_process_set')
   for a in wanted['apps']:d.check_config(d.live[a['name']],a)
   c.require(d.cron==(w/'deploy.crontab.before').read_text()and d.system_cron==(w/'re7-converta-backup.before').read_text(),'both_crons_not_restored')
   return {'result':'LOCAL_SYSTEM_OBSERVATION','phase':phase,'providerFunctionalityCertified':False}
  original_read=Path.read_text;front=next(a for a in source['apps']if a['name']=='re7-admin-front')['cwd'];build=c.read(p/'switch/baseline.private.json')['frontendBuild']
  def remote_read(path,*args,**kw):return build if str(path)==front+'/.next/BUILD_ID'else original_read(path,*args,**kw)
  c.write(w/'csv-admission.receipt.private.json',{'result':'FIVE_GATES_ADMITTED','reviewSha256':c.sha(p/'preparation-review.sha256'),'rootCapturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backupCapturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
  f=w/'execution-gates.private.json';f.write_text(json.dumps({k:True for k in c.read(f)}));(p/'execution-authorized').write_text('true\n')
  with patch.object(event_overlay,'apply',lambda root:None),patch.object(cli,'Bridge',B),patch.object(cli,'check',lambda root,live:c.check(root,live=False)),patch.object(cli,'check_current',current),patch.object(csv_start_gate,'check',lambda root,live:c.check(root,live=False)),patch.object(Path,'read_text',remote_read):
   try:cli.execute(p);assert scenario=='complete'
   except RuntimeError:assert scenario!='complete'
   if scenario=='complete':
    assert c.read(w/'csv-complete.receipt.private.json')['result']=='CSV_API_COMPLETE_CANDIDATE_PRESERVED'
    try:cli.execute(p);raise AssertionError('execution replay')
    except RuntimeError:pass
   elif scenario=='frontend_drift_recovery':
    original_pid=d.live[ops.FRONT]['pid'];d.proc[str(original_pid)]['ticks']='different'
    try:cli.recover(p,'PRESTOP');raise AssertionError('frontend drift recovered')
    except RuntimeError:pass
    assert not(w/'csv-recovery.intent.private.json').exists()and not any(isinstance(x,str)and x.startswith('delete:')for x in d.calls)
   elif scenario=='ambiguous_api_start':
    assert cli.inspect(p)['classification']=='UNCERTAIN_START'
    try:cli.recover(p,'CANDIDATE');raise AssertionError('ambiguous recovery')
    except RuntimeError:pass
   else:
    decision='CANDIDATE'if scenario=='contained_new_return'else'PRESTOP';cli.recover(p,decision)
    assert c.read(w/('csv-complete.receipt.private.json'if scenario=='contained_new_return'else'csv-abort.receipt.private.json'))['gatesFalse']
  results.append({'scenario':scenario,'passed':True})
print(json.dumps({'result':'EXACT_CSV_CLI_SEQUENCE_LOCAL_PASS','cases':results,'caseCount':len(results),'admissionProofsInjectedNotCertified':True,'operatingSystemEffectsSimulated':True,'productionEffects':False}))
