"""Real PostgreSQL/SCRAM + actual credential adapter and canonical Sequencer.
Only process/nft/PM2/cron effects use the existing FakeBridge. No production endpoint.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,subprocess,sys,tempfile,time
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
from credential_sequencer import DatabaseDriver,adapter
from credential_boundary import CredentialBoundary
from database_plan import render
from database_composition import patch_sequencer,patch_ecosystem
from database_consumers import read_activated_connection
CANON=Path(sys.argv[1]).resolve();sys.path.insert(0,str(CANON))
from baseline_contract import capture_operational
from ecosystem_contract import generate_mode
sys.path.insert(0,str(R.parent/'v4-sequencer'))
from test_sequencer import FakeBridge
root=Path(tempfile.mkdtemp(prefix='re7-database-composition-',dir='/tmp'));root.chmod(0o700);sock=root/'socket';sock.mkdir(mode=0o700)
port='55484';BIN='/usr/lib/postgresql/16/bin/';log=(root/'commands.private.log').open('x');err=(root/'commands.private.stderr').open('x');os.umask(0o077)
def run(cmd,**kw):return subprocess.run(cmd,stdout=log,stderr=err,check=True,timeout=45,**kw)
base=['psql','-X','-h',str(sock),'-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(base+['-Atq','-c',q],text=True,timeout=10).strip()
ecpath=root/'ecosystem_contract.py';ecpath.write_text(patch_ecosystem((CANON/'ecosystem_contract.py').read_text()));ecspec=importlib.util.spec_from_file_location('ecosystem_contract',ecpath);ec=importlib.util.module_from_spec(ecspec);sys.modules['ecosystem_contract']=ec;ecspec.loader.exec_module(ec);generate_mode=ec.generate_mode
source=(CANON/'sequencer.py').read_text();patched=patch_sequencer(source);path=root/'sequencer_exact.py';path.write_text(patched)
spec=importlib.util.spec_from_file_location('sequencer_exact',path);seq=importlib.util.module_from_spec(spec);spec.loader.exec_module(seq)
class Bridge(FakeBridge):
 def node(self,mode,script):
  self.events.append(('node',mode,script));assert not self.g['open']and self.g['generation']==38
  if script=='close.cjs':(self.root/mode/'drain-result.json').write_text('{}')
  return ''
 def privileged(self,action):
  result=super().privileged(action)
  if action in ['restore-controls','abort-prestop']and hasattr(self,'cron_file'):self.cron_file.write_text('before')
  return result
 def protocol(self,mode,action):
  if action=='preflight':self.events.append(('protocol',mode,action,38));assert not self.g['open'];return
  return super().protocol(mode,action)
 def restore_guard(self,*args):assert not self.g['open']
class Driver(DatabaseDriver):
 def __init__(self):self.applies=0;self.timeout=False;self.timeout_before=False
 def read_command(self,plan):return base+['-Atq']
 def login(self,url,plan=None):
  plan=plan or self.current_plan
  # Only module/node locations differ; use the exact production TCP method.
  original_node,original_module=plan['nodeExecutable'],plan['tcpClientModule']
  plan['nodeExecutable']='/usr/bin/node';plan['tcpClientModule']='/opt/re7online/releases/fixture/node_modules/@prisma/client'
  from unittest.mock import patch
  real_run=subprocess.run
  def local_run(command,**kw):
   if len(command)>2 and command[1]=='-e':command=[str(Path.cwd()/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'),*command[1:-1],str(Path.cwd()/'apps/whatsapp-agent/node_modules/@prisma/client')]
   return real_run(command,**kw)
  try:
   with patch('credential_sequencer.subprocess.run',side_effect=local_run):return super().login(url,plan)
  finally:plan['nodeExecutable'],plan['tcpClientModule']=original_node,original_module
 def apply_command(self,plan):
  self.applies+=1
  if self.timeout_before:return [sys.executable,str(root/'before-result.py')]+base
  if self.timeout:return [sys.executable,str(root/'lost-result.py')]+base
  return base
started=False;results=[]
try:
 run([BIN+'initdb','-D',str(root/'data'),'-U','postgres','--auth-local=trust','--auth-host=scram-sha-256'])
 run([BIN+'pg_ctl','-D',str(root/'data'),'-l',str(root/'postgres.private.log'),'-o','-p '+port+' -k '+str(sock)+' -h 127.0.0.1 -c log_statement=none -c log_min_error_statement=panic','start']);started=True
 sql("CREATE TABLE sentinel(id int PRIMARY KEY,value text);INSERT INTO sentinel VALUES(1,'preserved'),(2,'tenant-b');")
 data_before=sql('SELECT md5(string_agg(id::text||value,\',\'ORDER BY id))FROM sentinel')
 (root/'before-result.py').write_text("import subprocess,sys,time\ntime.sleep(30)\nr=subprocess.run(sys.argv[1:]);assert r.returncode==0\n")
 (root/'lost-result.py').write_text("import subprocess,sys,time\nr=subprocess.run(sys.argv[1:]);assert r.returncode==0\ntime.sleep(30)\n")
 for scenario in ['precommit_failure','committed','successor_failure','timeout_committed','timeout_original','sql_rollback_original','catalog_guard_denial','survivor_denial','privilege_drift','receipt_conflict']:
  case=root/scenario;case.mkdir(mode=0o700);b=Bridge(case);b.g.update(open=False,generation=38)
  old,new=secrets.token_urlsafe(48),secrets.token_urlsafe(48);role='fixture_'+scenario
  sql('CREATE ROLE '+role+' LOGIN SUPERUSER;')
  management='host='+str(sock)+' port='+port+' user=postgres dbname=postgres'
  render(management,{'username':role,'password':old},case/'old.sql');run(base+['-f',str(case/'old.sql')])
  render(management,{'username':role,'password':new},case/'new.sql')
  newsql=(case/'new.sql').read_text()
  if scenario=='sql_rollback_original':newsql+='SELECT 1/0;\n';(case/'new.sql').write_text(newsql)
  verifier=re.search("PASSWORD '([^']+)'",newsql).group(1)
  driver=Driver();before=driver.read_role({'role':role,'database':'postgres'})
  oldurl='postgresql://'+role+':'+old+'@127.0.0.1:'+port+'/postgres';newurl='postgresql://'+role+':'+new+'@127.0.0.1:'+port+'/postgres'
  for a in b.old.values():a['env'].update(DATABASE_URL=oldurl,APP_AUTH_SECRET='NEWauth-session-'+'x'*32,ADMIN_TOKEN='NEWauth-admin-'+'x'*32,WHATSAPP_WEB_WORKER_CONTROL_TOKEN='NEWauth-worker-'+'x'*32)
  b.new=copy.deepcopy(b.old)
  for n in [seq.API,seq.WORKER]:b.new[n]['env']['DATABASE_URL']=newurl
  for n in b.live:b.live[n]['cfg']=copy.deepcopy(b.old[n])
  (b.window/'initial.private.json').write_text(json.dumps(capture_operational(b.guard,lambda _: 'ActiveState=inactive\nUnitFileState=enabled\n')))
  for mode in ['switch','return','return-partial','return-before-commit']:
   d=b.root/mode;d.mkdir(exist_ok=True)
   for name,c in [('return',b.old if mode=='switch'else b.new),('candidate',b.old if mode=='return-before-commit'else b.new)]:
    (d/(name+'.config.private.json')).write_text(json.dumps({'apps':list(c.values())}))
   (d/'baseline.private.json').write_bytes((b.root/'switch/baseline.private.json').read_bytes())
   for filename in ['candidate.ecosystem.config.cjs','return.ecosystem.config.cjs']:
    if (d/filename).exists():(d/filename).rename(d/(filename+'.initial-fixture'))
   generate_mode(d)
  plan={'kind':'database_password','sameRolePrivileges':True,'ownerDecisionRequired':True,'role':role,'database':'postgres','expectedPrivileges':before['privileges'],'expectedFullAttributes':before['fullAttributes'],'originalVerifierSha256':hashlib.sha256(before['verifier'].encode()).hexdigest(),'originalVerifierMd5':hashlib.md5(before['verifier'].encode()).hexdigest(),'expectedVerifierSha256':hashlib.sha256(verifier.encode()).hexdigest(),'sqlSha256':hashlib.sha256(newsql.encode()).hexdigest()}
  if scenario=='catalog_guard_denial':plan['originalVerifierMd5']='0'*32
  plan.update(tcpDiagnosticDirectory=str(root/'tcp-diagnostics'),nodeExecutable='/usr/bin/node',tcpClientModule='/opt/re7online/releases/fixture/node_modules/@prisma/client');driver.current_plan=plan
  (b.window/'credential-hook.private.json').write_text(json.dumps(plan));(b.window/'role-change.private.sql').write_text(newsql)
  (b.window/'administrative-db.private.json').write_text(json.dumps({'connection':newurl}));(b.window/'docker-recovery.private.json').write_text('{}')
  staged=[{'name':n,'sha256':hashlib.sha256((b.window/n).read_bytes()).hexdigest()}for n in ['administrative-db.private.json','docker-recovery.private.json']]
  b.cron_file=case/'cron-fixture';b.cron_file.write_text('before');b.cron_file.chmod(0o600)
  immutable=[{'path':str(b.cron_file),'uid':os.getuid(),'mode':0o600,'sha256':hashlib.sha256(b'before').hexdigest(),'containedSha256':hashlib.sha256(b'window').hexdigest()}]
  (b.window/'database-consumers.private.json').write_text(json.dumps({'immutableConsumers':immutable,'absentEnvironmentPaths':[],'stagedConsumers':staged}))
  (b.window/'sequencer.py').write_text(patched)
  (b.window/'mode-manifest-v4.json').write_text(json.dumps({'modeFiles':{'return-before-commit':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in (b.root/'return-before-commit').iterdir()if p.is_file()}}}))
  for p in b.window.iterdir():
   if p.is_file():p.chmod(0o600)
  (b.window/'sequencer-manifest.json').write_text(json.dumps({'filesSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in b.window.iterdir()if p.is_file()and p.name not in ['sequencer-manifest.json','execution-gates.private.json']}}))
  s=adapter(seq,driver)(b);s.eligible();s.capture_baseline()
  b.cron_file.write_text('window')
  b.fenced=True;b.system_cron='window';b.boot='disabled';b.live.pop(seq.API);b.live.pop(seq.WORKER);(b.root/'switch/old-exit-confirmed.json').write_text('{}')
  if scenario=='precommit_failure':
   b.fenced=False
   try:s.start_pair('switch');raise AssertionError('precommit_fence_failure_accepted')
   except RuntimeError:pass
   assert not (b.window/'credential-commit.intent.private.json').exists();b.fenced=True
   s.recover();assert driver.applies==0 and b.app_matches(seq.API,b.old)and not s.boundary.may_start_successor()
  elif scenario=='survivor_denial':
   b.live[seq.API]={'pid':999,'cfg':b.old[seq.API],'pm2_env':{'status':'online'}}
   try:s.recover();raise AssertionError('survivor_accepted')
   except RuntimeError:pass
   assert driver.applies==0
  elif scenario=='privilege_drift':
   sql('ALTER ROLE '+role+' NOSUPERUSER')
   try:s.recover();raise AssertionError('privilege_drift_accepted')
   except AssertionError as e:
    assert str(e)=='database_role_privilege_drift'
   assert driver.applies==0;sql('ALTER ROLE '+role+' SUPERUSER')
  elif scenario in ['timeout_original','sql_rollback_original','catalog_guard_denial']:
   if scenario=='timeout_original':driver.timeout_before=True
   try:s.start_pair('switch');raise AssertionError('uncertain_original_started')
   except (RuntimeError,subprocess.TimeoutExpired):pass
   assert driver.classify(plan,oldurl,newurl)=='ORIGINAL_VERIFIED'
   try:s.recover();raise AssertionError('uncertain_original_auto_return')
   except RuntimeError:pass
   s.boundary.record_original_observation(lambda:driver.classify(plan,oldurl,newurl));explicit=adapter(seq,driver,allow_observed_original_return=True)(b);explicit.load_plan(False);explicit.baseline=s.baseline;explicit.recover();assert driver.applies==1 and b.app_matches(seq.API,b.old)
  else:
   if scenario=='timeout_committed':driver.timeout=True
   if scenario=='successor_failure':b.fail_action='switch:start:'+seq.WORKER
   try:s.start_pair('switch')
   except (RuntimeError,subprocess.TimeoutExpired):
    if scenario=='committed':raise
   if scenario=='timeout_committed':
    assert not s.boundary.may_start_successor()and seq.API not in b.live
    try:s.recover();raise AssertionError('uncertain_commit_auto_return')
    except RuntimeError:pass
    s.boundary.record_verified_observation(lambda:__import__('credential_sequencer').verify_database_result(plan,oldurl,newurl,driver));s.recover()
   elif scenario=='successor_failure':s.recover()
   elif scenario=='receipt_conflict':
    receipt=b.window/'credential-commit.receipt.private.json';v=json.loads(receipt.read_text());v['planSha256']='wrong';receipt.write_text(json.dumps(v));assert not s.boundary.may_start_successor()
    try:s.recover();raise AssertionError('incompatible_receipt_accepted')
    except RuntimeError:pass
   assert driver.applies==1 and driver.login(newurl)and not driver.login(oldurl)
   if scenario!='receipt_conflict':assert read_activated_connection(b.window)==newurl
  after=driver.read_role(plan);assert after['privileges']==before['privileges']and after['fullAttributes']==before['fullAttributes'];assert sql('SELECT md5(string_agg(id::text||value,\',\'ORDER BY id))FROM sentinel')==data_before
  results.append({'scenario':scenario,'result':'PASS','alterCalls':driver.applies,'privilegesAndDataPreserved':True})
 finally_placeholder=None
finally:
 if started:run([BIN+'pg_ctl','-D',str(root/'data'),'stop','-m','fast'])
 log.close();err.close()
print(json.dumps({'result':'PASS','scenarios':results,'canonicalSequencerSourceSha256':hashlib.sha256(source.encode()).hexdigest(),'patchedSequencerSha256':hashlib.sha256(patched.encode()).hexdigest(),'postgres':'16 real isolated SCRAM','externalEffectsSimulated':['PM2/processes','nft','cron','HTTP readiness'],'timeout':'real 15s subprocess timeout after PostgreSQL commit; transport result held by wrapper','productionMutations':0,'temporaryServerStopped':True}))
