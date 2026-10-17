"""Future maintenance only: real chmod/FD/kernel ACLs in disposable local dirs.
All SSH, namespace, coordination and (for failure cases) syscall delivery are simulated.
Canonical meta/private writer/Event predicate are real byte-pinned consumers.
"""
import base64,contextlib,datetime,errno,hashlib,io,json,os,re,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from scripts.crm_csv_delivery import mode_maintenance as m
ROOT=m.ROOT;PROOFS=[]

class Maintenance(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.fs=self.root/'fs';self.fs.mkdir(mode=0o755);path=self.fs;old=os.umask(0)
  try:
   for part in 'opt/re7online/site-re7online/apps/whatsapp-agent/src/events'.split('/'):
    path/=part;path.mkdir(mode=0o755 if str(path.relative_to(self.fs)) in ('opt','opt/re7online') else 0o775)
  finally:os.umask(old)
  self.b,(self.lib,self.Capture,self.record)=m.libraries();self.original_open=os.open;self.original_lstat=os.lstat;self.original_path_lstat=Path.lstat
  self.targets=('/opt/re7online/site-re7online','/opt/re7online/site-re7online/apps','/opt/re7online/site-re7online/apps/whatsapp-agent','/opt/re7online/site-re7online/apps/whatsapp-agent/src','/opt/re7online/site-re7online/apps/whatsapp-agent/src/events')
  paths=('/', '/opt','/opt/re7online',*self.targets)
  self.plan={'sourceSha256':m.OBSERVED_SHA,'sourceStartedUtc':'synthetic','sourceFinishedUtc':'synthetic','targets':list(self.targets),'expected':{p:self.lib['meta'](self.real(p).lstat()) for p in paths}}
  self.folder=self.root/'remote';self.count=0;self.checks=0
 def real(self,path):return self.fs/str(path).lstrip('/')
 def coord(self,action):
  return {'action':action,'owner':'Deifson','operatorUid':1000,'authorizedCommit':'c'*40,'maintainers':'synthetic lab owner','sessionJobReferences':'synthetic Git/npm jobs held','confirmationMethod':'synthetic explicit owner acknowledgements, not operational proof','allRelevantMaintainersAcknowledged':True,'noFilesystemMaintenanceInFlight':True,'noNewMaintenanceUntilRelease':True,'confirmedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 def run_action(self,action,scenario=None):
  source=m.SOURCE.read_bytes();reader,_=self.lib['stable_file'](self.b['REVIEW']/'crm-csv-r2-directed-20261017/read_package.py');writer,_=self.lib['stable_file'](self.b['REVIEW']/'crm-csv-r2-directed-20261017/privileged_output.source');pred,_=self.lib['stable_file'](m.PREDICATE)
  with patch.object(m,'REMOTE',str(self.folder)):body=m.program(source,reader,writer,pred,self.plan,None if action=='inspect' else self.coord(action),action)
  original_chmod=os.fchmod
  def opening(path,*args,**kwargs):return self.original_open(self.fs if str(path)=='/' else path,*args,**kwargs)
  def lstat(path,*args,**kwargs):return self.original_lstat(self.fs if str(path)=='/' else path,*args,**kwargs)
  def path_lstat(path,*args,**kwargs):
   # Only canonical Event predicate external namespace; directory/private record readers stay real.
   if str(path) in self.plan['expected']:
    self.checks+=1;return self.original_path_lstat(self.real(path),*args,**kwargs)
   return self.original_path_lstat(path,*args,**kwargs)
  def fchmod(fd,mode):
   self.count+=1
   if scenario=='unknown-ack':original_chmod(fd,mode);raise OSError(errno.EIO,'synthetic lost syscall acknowledgement')
   if scenario=='syscall-failure' and self.count==2:raise OSError(errno.EIO,'synthetic failed syscall')
   original_chmod(fd,mode)
  out=io.StringIO();ctx=patch('time.monotonic',side_effect=[100,100,131]) if scenario=='deadline-partial' else contextlib.nullcontext()
  with patch('os.open',side_effect=opening),patch('os.lstat',side_effect=lstat),patch.object(Path,'lstat',path_lstat),patch('os.fchmod',side_effect=fchmod),ctx,contextlib.redirect_stdout(out):
   try:exec(compile(body,'<exact generated maintenance program>','exec'),{'__name__':'__main__'})
   except SystemExit as e:code=e.code
  v=json.loads(out.getvalue())
  for item in v['privateEvidence'].values():
   raw=base64.b64decode(item['bytesBase64']);self.assertEqual(len(raw),item['bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),item['sha256'])
  PROOFS.append({'action':action,'scenario':scenario or 'normal','exit':code,'result':v['result'],'classification':v.get('classification'),'confirmedEffects':v.get('confirmedEffects'),'canonicalEventLstats':self.checks,'labOnly':True})
  return code,v
 def test_apply_and_conditioned_return(self):
  before={p:self.real(p).stat() for p in self.targets};code,v=self.run_action('apply');self.assertEqual(code,0);self.assertEqual(v['result'],'APPLIED_EVENT_PARENTS_PASS');self.assertEqual(self.count,5);self.assertGreaterEqual(self.checks,8)
  for p in self.targets:
   now=self.real(p).stat();self.assertEqual(now.st_mode,before[p].st_mode&~0o020);self.assertEqual((now.st_uid,now.st_gid,now.st_ino),(before[p].st_uid,before[p].st_gid,before[p].st_ino))
  self.assertEqual(self.run_action('inspect')[1]['classification'],'APPLIED')
  code,v=self.run_action('return');self.assertEqual(code,0);self.assertEqual(v['confirmedEffects'],5)
  for p in self.targets:self.assertEqual(self.real(p).stat().st_mode,before[p].st_mode)
  count=self.count;self.assertEqual(self.run_action('return')[0],1);self.assertEqual(self.count,count)
 def test_metadata_drift_before_any_effect(self):
  (self.real(self.targets[-1])/'synthetic-new-entry').write_text('fixture')
  self.assertEqual(self.run_action('apply')[0],1);self.assertEqual(self.count,0)
 def test_acl_present_blocks_all_effects(self):
  if not Path('/usr/bin/setfacl').is_file():self.fail('lab setfacl unavailable')
  subprocess.run(['/usr/bin/setfacl','-m','u:12345:rwx',str(self.real(self.targets[0]))],check=True)
  # Even with refreshed fixture metadata, actual ACL is a hard DENY; not a production plan refresh.
  self.plan['expected'][self.targets[0]]=self.lib['meta'](self.real(self.targets[0]).stat())
  code,v=self.run_action('apply');self.assertEqual(code,1);self.assertEqual(self.count,0);self.assertEqual(v['reason'],'acl_present_analysis_required')
 def test_partial_confirmed_return(self):
  code,v=self.run_action('apply','deadline-partial');self.assertEqual(code,1);self.assertEqual(v['confirmedEffectsThisAttempt'],1)
  code,v=self.run_action('inspect');self.assertEqual(code,0);self.assertEqual(v['classification'],'PARTIAL_PROVEN');self.assertTrue(v['returnEligible'])
  code,v=self.run_action('return');self.assertEqual(code,0);self.assertEqual(v['confirmedEffects'],1)
 def test_uncertain_effect_blocks_return(self):
  code,v=self.run_action('apply','unknown-ack');self.assertEqual(code,1);self.assertEqual(v['confirmedEffectsThisAttempt'],0)
  code,v=self.run_action('inspect');self.assertEqual(code,0);self.assertEqual(v['classification'],'UNCERTAIN_EFFECT');self.assertFalse(v['returnEligible'])
  count=self.count;self.assertEqual(self.run_action('return')[0],1);self.assertEqual(self.count,count)
 def test_apply_replay_and_return_drift(self):
  self.assertEqual(self.run_action('apply')[0],0);count=self.count
  self.assertEqual(self.run_action('apply')[0],1);self.assertEqual(self.count,count)
  (self.real(self.targets[-1])/'synthetic-new-entry').write_text('drift')
  self.assertEqual(self.run_action('return')[0],1);self.assertEqual(self.count,count)
 def test_wrong_population_or_owner(self):
  self.plan['expected'][self.targets[0]]['uid']=999
  self.assertEqual(self.run_action('apply')[0],1);self.assertEqual(self.count,0)
 def test_coordination_not_automatic_fence(self):
  original=self.coord
  def unconfirmed(action):v=original(action);v['noFilesystemMaintenanceInFlight']=False;return v
  with patch.object(self,'coord',side_effect=unconfirmed):
   code,v=self.run_action('apply');self.assertEqual(code,1);self.assertEqual(self.count,0);self.assertEqual(v['reason'],'writers_not_coordinated')
 def test_transported_channels_loss_no_replay(self):
  # Real driver/library/canonical custody. Only operator decision, plan namespace and SSH boundary simulated.
  local=self.root/'local';local.mkdir(mode=0o700)
  def ssh(argv,**kwargs):
   import shlex
   body=shlex.split(argv[-1])[5];out=io.StringIO()
   def opening(path,*a,**k):return self.original_open(self.fs if str(path)=='/' else path,*a,**k)
   def lstat(path,*a,**k):return self.original_lstat(self.fs if str(path)=='/' else path,*a,**k)
   def event_lstat(path,*a,**k):return self.original_path_lstat(self.real(path) if str(path) in self.plan['expected'] else path,*a,**k)
   with patch('os.open',side_effect=opening),patch('os.lstat',side_effect=lstat),patch.object(Path,'lstat',event_lstat),contextlib.redirect_stdout(out):
    try:exec(compile(body,'<transported program>','exec'),{'__name__':'__main__'})
    except SystemExit as e:code=e.code
   # Actual apply completed in disposable filesystem, transport acknowledgement lost.
   raise subprocess.TimeoutExpired(argv,45,output=b'')
  text=(ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md').read_text()
  literal=re.search(r"<<'REVIEWED_EVENT_MODE_apply'\n(.*?)\nREVIEWED_EVENT_MODE_apply",text,re.S).group(1)
  def trace(frame,event,arg):
   if event=='call' and frame.f_code.co_name=='execute' and frame.f_code.co_filename==str(ROOT/'scripts/crm_csv_delivery/mode_maintenance.py'):
    frame.f_globals.update(LOCAL=local,REMOTE=str(self.folder),plan_from_custody=lambda lib:self.plan,owner_coordination=self.coord)
   return trace
  prior=sys.gettrace()
  with patch('subprocess.run',side_effect=ssh) as run,contextlib.redirect_stdout(io.StringIO()):
   try:
    sys.settrace(trace);exec(compile(literal,'<published apply literal>','exec'),{'__name__':'__main__'})
   except SystemExit as e:code=e.code
   finally:sys.settrace(prior)
  self.assertEqual(code,1);self.assertEqual(run.call_count,1)
  self.assertEqual(self.run_action('inspect')[1]['classification'],'APPLIED')
  PROOFS.append({'case':'driver response lost after real local five effects','result':'one transport only; no automatic return/retry; private channels preserved, subsequent separate inspect sees APPLIED'})

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Maintenance);result=unittest.TextTestRunner(verbosity=2).run(suite)
 if result.wasSuccessful():
  out={'result':'LOCAL_VALIDATED_REVIEW_PENDING_NO_PRODUCTION_AUTHORIZATION','tests':result.testsRun,'cases':PROOFS,'real':'Disposable-directory fchmod by held FDs; meta/ACL kernel reads; immutable original Event predicate; canonical private_record and export hashes; explicit return only confirmed effects','simulated':'Target namespace, historical expected plan, owner coordination/authorization, deadline/error delivery, SSH and lost response; no actual writer exclusion or productive effects','productionExecuted':False}
  (ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/MAINTENANCE_PROOFS.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 raise SystemExit(0 if result.wasSuccessful() else 1)
