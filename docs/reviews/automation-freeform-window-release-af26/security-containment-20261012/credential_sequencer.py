"""Reviewed adapter candidate: one private DB credential commit at the existing V4 boundary.
Not installed/used. Future DB preparation must seal this file, plan, SQL and configs.
"""
import ctypes,ctypes.util,hashlib,json,os,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,unquote,parse_qsl,urlencode,urlunsplit
from credential_boundary import CredentialBoundary

class DatabaseDriver:
 """Fixed production transport; lab subclasses replace only external SQL transport."""
 def read_role(self,plan):
  role=plan['role'];assert re.fullmatch('[a-z_][a-z0-9_]*',role),'role_binding_invalid'
  sql="BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SELECT json_build_object('verifier',rolpassword,'privileges',json_build_object('rolsuper',rolsuper,'rolcreaterole',rolcreaterole,'rolcreatedb',rolcreatedb,'rolreplication',rolreplication,'rolcanlogin',rolcanlogin,'rolvaliduntil',rolvaliduntil),'fullAttributes',to_jsonb(pg_authid)-'rolpassword') FROM pg_authid WHERE rolname='"+role+"';ROLLBACK;"
  return self.query(plan,sql)
 def read_command(self,plan):return ['docker','exec','wa-agent-postgres','psql','-X','-U',plan['role'],'-d',plan['database'],'-Atq','-v','ON_ERROR_STOP=1']
 def apply_command(self,plan):return ['docker','exec','-i','wa-agent-postgres','psql','-X','-U',plan['role'],'-d',plan['database'],'-v','ON_ERROR_STOP=1']
 def query(self,plan,sql):
  r=subprocess.run(self.read_command(plan)+['-c',sql],capture_output=True,text=True,timeout=12)
  if r.returncode:raise RuntimeError('durable_role_verifier_read_denied')
  return json.loads(r.stdout)
 def apply(self,plan,sqlfile,window):
  role=plan['role'];assert re.fullmatch('[a-z_][a-z0-9_]*',role)
  assert re.fullmatch('[0-9a-f]{32}',plan['originalVerifierMd5'])
  expected=json.dumps(plan['expectedPrivileges'],sort_keys=True).replace("'","''");full=json.dumps(plan['expectedFullAttributes'],sort_keys=True).replace("'","''")
  guard="DO $credential$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE rolname='"+role+"' AND md5(rolpassword)='"+plan['originalVerifierMd5']+"' AND jsonb_build_object('rolsuper',rolsuper,'rolcreaterole',rolcreaterole,'rolcreatedb',rolcreatedb,'rolreplication',rolreplication,'rolcanlogin',rolcanlogin,'rolvaliduntil',rolvaliduntil)='"+expected+"'::jsonb AND to_jsonb(pg_authid)-'rolpassword'='"+full+"'::jsonb) THEN RAISE EXCEPTION 'original_role_or_privilege_drift';END IF;END $credential$;"
  sql="SET lock_timeout='2s';SET statement_timeout='10s';BEGIN;SET LOCAL TIME ZONE 'UTC';LOCK TABLE pg_authid IN SHARE ROW EXCLUSIVE MODE;"+guard+sqlfile.read_text()+'COMMIT;' 
  with(window/'credential-sql.stdout.private').open('x')as out,(window/'credential-sql.stderr.private').open('x')as err:
   os.chmod(out.name,0o600);os.chmod(err.name,0o600)
   r=subprocess.run(self.apply_command(plan),input=sql,text=True,stdout=out,stderr=err,timeout=15)
  if r.returncode:raise RuntimeError('credential_sql_uncertain_inspect_only')
 def login(self,url,plan):
  module=plan['tcpClientModule'];node=plan['nodeExecutable']
  assert node=='/usr/bin/node' and module.endswith('/node_modules/@prisma/client')and module.startswith('/opt/re7online/releases/'),'tcp_client_binding_invalid'
  program="""const fs=require('node:fs');const {PrismaClient}=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,'utf8'));if(typeof p.url!=='string'||!p.url)throw Error('missing_bound_url');const c=new PrismaClient({datasources:{db:{url:p.url}},log:[],errorFormat:'minimal'});(async()=>{let connected=false;try{await c.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe(\"SET LOCAL statement_timeout='3s'\");await tx.$queryRawUnsafe('SELECT 1')},{maxWait:3000,timeout:5000});connected=true}catch(e){if(!['P1000'].includes(e.code||e.errorCode)){process.stdout.write(JSON.stringify({error:{code:e.code,name:e.name,message:e.message}}));process.exitCode=2;return}}finally{await c.$disconnect()}process.stdout.write(JSON.stringify({connected}))})().catch(()=>{process.exitCode=2});"""
  result=subprocess.run([node,'-e',program,module],input=json.dumps({'url':url}),capture_output=True,text=True,timeout=12)
  if result.returncode:
   if 'tcpDiagnosticDirectory'in plan:
    folder=Path(plan['tcpDiagnosticDirectory']);folder.mkdir(mode=0o700,exist_ok=True)
    name=folder/('tcp-'+str(__import__('time').time_ns())+'.private.json')
    fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w')as f:json.dump({'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr},f)
   raise RuntimeError('tcp_observation_incomplete')
  v=json.loads(result.stdout)
  assert set(v)=={'connected'}and type(v['connected'])is bool,'tcp_observation_shape'
  return v['connected']
 def classify(self,plan,old_url,new_url):
  row=self.read_role(plan)
  assert row['privileges']==plan['expectedPrivileges']and row['fullAttributes']==plan['expectedFullAttributes'],'database_role_privilege_drift'
  digest=hashlib.sha256(row['verifier'].encode()).hexdigest()
  old,new=self.login(old_url,plan),self.login(new_url,plan)
  if digest==plan['originalVerifierSha256'] and old and not new:return 'ORIGINAL_VERIFIED'
  if digest==plan['expectedVerifierSha256'] and new and not old:return 'VERIFIED'
  raise RuntimeError('database_verifier_or_connections_diverge_inspect_only')

def verify_database_result(plan,source_url,new_url,driver=None):
 if (driver or DatabaseDriver()).classify(plan,source_url,new_url)!='VERIFIED':raise RuntimeError('new_credential_or_old_revocation_not_verified')
 return {'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}

def adapter(sequencer_module,database_driver=None,allow_observed_original_return=False):
 driver=database_driver or DatabaseDriver()
 class CredentialSequencer(sequencer_module.Sequencer):
  def eligible(self):
   super().eligible()
   self.load_plan()
  def capture_baseline(self):
   super().capture_baseline()
   self.boundary.write(self.b.window/'credential-source-baseline.private.json',self.baseline)
  def load_plan(self,require_original=True):
   p=self.b.window/'credential-hook.private.json';self.plan=json.loads(p.read_text());manifest=json.loads((self.b.window/'sequencer-manifest.json').read_text())
   assert manifest['filesSha256']['credential-hook.private.json']==hashlib.sha256(p.read_bytes()).hexdigest()
   assert self.plan['kind']=='database_password'and self.plan['sameRolePrivileges']is True and self.plan['ownerDecisionRequired']is True,'database_owner_decision_contract_missing'
   source=self.b.expected_config('switch','return.config.private.json');target=self.b.expected_config('switch','candidate.config.private.json');self.old_url=source[sequencer_module.API]['env']['DATABASE_URL'];self.new_url=target[sequencer_module.API]['env']['DATABASE_URL']
   a,b=urlsplit(self.old_url),urlsplit(self.new_url);assert(a.hostname,a.port,a.username,a.path,a.query)==(b.hostname,b.port,b.username,b.path,b.query)and a.password!=b.password,'database_target_changed_or_password_unchanged'
   for mode in ['switch','return','return-partial']:
    c=self.b.expected_config(mode,'candidate.config.private.json')
    assert all(c[n]['env']['DATABASE_URL']==self.new_url for n in [sequencer_module.API,sequencer_module.WORKER]),'safe_return_must_keep_new_database_credential'
   assert self.plan['role']==unquote(a.username)and self.plan['database']==a.path.lstrip('/')
   self.sqlfile=self.b.window/'role-change.private.sql';assert manifest['filesSha256']['role-change.private.sql']==hashlib.sha256(self.sqlfile.read_bytes()).hexdigest()==self.plan['sqlSha256']
   assert unquote(b.password)not in self.sqlfile.read_text(),'plaintext_password_in_sql'
   self.boundary=CredentialBoundary(self.b.window,plan_sha256=hashlib.sha256(p.read_bytes()).hexdigest())
   self.consumer_plan=self.b.window/'database-consumers.private.json'
   from database_consumers import verify_manifest
   verify_manifest(self.b.window,self.consumer_plan,phase='before'if require_original else'contained')
   sequencer_module.validate_preparation(self.b.root,['return-before-commit'])
   m=json.loads((self.b.window/'mode-manifest-v4.json').read_text())
   for n,digest in m['modeFiles']['return-before-commit'].items():assert hashlib.sha256((self.b.root/'return-before-commit'/n).read_bytes()).hexdigest()==digest
   before=self.b.expected_config('return-before-commit','candidate.config.private.json')
   assert not any((self.b.root/'return-before-commit').glob('start-intent-*')),'precommit_return_consumed'
   for n in [sequencer_module.API,sequencer_module.WORKER]:
    assert (before[n]['cwd'],before[n]['script'])==(target[n]['cwd'],target[n]['script']),'precommit_return_runtime_drift'
    assert before[n]['env']['DATABASE_URL']==self.old_url,'precommit_return_not_original'
    for k in ['APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN']:
     assert before[n]['env'].get(k)==target[n]['env'].get(k),'precommit_return_auth_drift'
   if require_original:
    assert driver.classify(self.plan,self.old_url,self.new_url)=='ORIGINAL_VERIFIED','original_verifier_not_proven'
    assert not(self.b.window/'credential-commit.intent.private.json').exists(),'credential_intent_consumed_inspect_only'
  def start_pair(self,mode):
   if mode=='switch':
    def before():
     from database_consumers import verify_manifest
     verify_manifest(self.b.window,self.consumer_plan,phase='contained')
     if driver.classify(self.plan,self.old_url,self.new_url)!='ORIGINAL_VERIFIED':raise RuntimeError('original_verifier_drift_before_intent')
     self.verify_stopped(mode)  # Exact canonical exit/frontend identity contract.
     self.b.privileged('check-present')  # Fresh root fence observation; original protocol revalidates ownership before start.
     g=self.b.guard();assert g['open']is False and g['generation']==38 and g['tasks']=={}
    self.boundary.execute(before,lambda:driver.apply(self.plan,self.sqlfile,self.b.window),lambda:verify_database_result(self.plan,self.old_url,self.new_url,driver))
   elif mode=='return-before-commit':
    if (self.b.window/'credential-commit.intent.private.json').exists()and not(allow_observed_original_return and self.boundary.may_start_original_return()):raise RuntimeError('precommit_return_intent_present_inspect_only')
    if driver.classify(self.plan,self.old_url,self.new_url)!='ORIGINAL_VERIFIED':raise RuntimeError('precommit_original_not_proven')
   elif not self.boundary.may_start_successor():raise RuntimeError('credential_result_uncertain_no_successor')
   if mode!='return-before-commit':
    from database_consumers import apply_verified_consumers
    apply_verified_consumers(self.b.window,self.consumer_plan,self.boundary)
   super().start_pair(mode)
  def recover(self):
   if (self.b.window/'credential-commit.intent.private.json').exists():
    if not self.boundary.may_start_successor():
     if not(allow_observed_original_return and self.boundary.may_start_original_return()):raise RuntimeError('credential_commit_uncertain_manual_inspection_required')
    elif driver.classify(self.plan,self.old_url,self.new_url)!='VERIFIED':raise RuntimeError('verified_receipt_database_drift')
    if self.boundary.may_start_successor():return super().recover()
   if driver.classify(self.plan,self.old_url,self.new_url)!='ORIGINAL_VERIFIED':raise RuntimeError('precommit_original_not_proven')
   observed=super().recovery_mode() # Preserve ambiguous intent/process/identity negatives.
   if observed=='prestop':return super().recover()
   if observed!='return-partial':raise RuntimeError('precommit_unexpected_successor')
   mode='return-before-commit';self.mode=mode
   self.journal('recovery_selected',mode=mode,credential='ORIGINAL_VERIFIED')
   self.b.privileged('check-present')
   self.action(mode,'recover-partial');self.verify_stopped(mode)
   self.start_pair(mode);self.finish(mode)
 return CredentialSequencer
if __name__=='__main__':
 assert len(sys.argv)==3 and sys.argv[2]=='--future-owner-authorized-execute','future_explicit_execution_decision_required'
 root=Path(sys.argv[1]).resolve();sys.path.insert(0,str(root/'window'));import sequencer
 adapter(sequencer)(sequencer.Bridge(root)).run()
