"""Reviewed adapter candidate: one private DB credential commit at the existing V4 boundary.
Not installed/used. Future DB preparation must seal this file, plan, SQL and configs.
"""
import ctypes,ctypes.util,hashlib,json,os,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,unquote,parse_qsl,urlencode,urlunsplit
from credential_boundary import CredentialBoundary

def verify_database_result(plan,source_url,new_url):
 lib=ctypes.CDLL(ctypes.util.find_library('pq'));lib.PQconnectdb.argtypes=[ctypes.c_char_p];lib.PQconnectdb.restype=ctypes.c_void_p;lib.PQstatus.argtypes=[ctypes.c_void_p];lib.PQstatus.restype=ctypes.c_int;lib.PQfinish.argtypes=[ctypes.c_void_p]
 def login(url):
  p=urlsplit(url);q=[(k,v)for k,v in parse_qsl(p.query)if k not in ['schema','connection_limit','pool_timeout','pgbouncer','statement_cache_size','connect_timeout']];q.append(('connect_timeout','3'));uri=urlunsplit((p.scheme,p.netloc,p.path,urlencode(q),p.fragment));c=lib.PQconnectdb(uri.encode())
  try:return lib.PQstatus(c)==0
  finally:lib.PQfinish(c)
 if not login(new_url)or login(source_url):raise RuntimeError('new_credential_or_old_revocation_not_verified')
 role=plan['role'];assert re.fullmatch('[a-z_][a-z0-9_]*',role),'role_binding_invalid'
 sql="BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SELECT json_build_object('verifier',rolpassword,'privileges',json_build_object('rolsuper',rolsuper,'rolcreaterole',rolcreaterole,'rolcreatedb',rolcreatedb,'rolreplication',rolreplication,'rolcanlogin',rolcanlogin,'rolvaliduntil',rolvaliduntil)) FROM pg_authid WHERE rolname='"+role+"';ROLLBACK;"
 r=subprocess.run(['docker','exec','wa-agent-postgres','psql','-X','-U',role,'-d',plan['database'],'-Atq','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,timeout=12)
 if r.returncode:raise RuntimeError('durable_role_verifier_read_denied')
 row=json.loads(r.stdout);assert row['privileges']==plan['expectedPrivileges'],'database_role_privilege_drift'
 if hashlib.sha256(row['verifier'].encode()).hexdigest()!=plan['expectedVerifierSha256']:raise RuntimeError('durable_role_verifier_mismatch')
 return {'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}

def adapter(sequencer_module):
 class CredentialSequencer(sequencer_module.Sequencer):
  def eligible(self):
   super().eligible()
   p=self.b.window/'credential-hook.private.json';self.plan=json.loads(p.read_text());manifest=json.loads((self.b.window/'sequencer-manifest.json').read_text())
   assert manifest['filesSha256']['credential-hook.private.json']==hashlib.sha256(p.read_bytes()).hexdigest()
   assert self.plan['kind']=='database_password'and self.plan['sameRolePrivileges']is True and self.plan['applyAuthorized']is True,'database_execution_not_authorized_in_draft'
   source=self.b.expected_config('switch','return.config.private.json');target=self.b.expected_config('switch','candidate.config.private.json');self.old_url=source[sequencer_module.API]['env']['DATABASE_URL'];self.new_url=target[sequencer_module.API]['env']['DATABASE_URL']
   a,b=urlsplit(self.old_url),urlsplit(self.new_url);assert(a.hostname,a.port,a.username,a.path,a.query)==(b.hostname,b.port,b.username,b.path,b.query)and a.password!=b.password,'database_target_changed_or_password_unchanged'
   for mode in ['switch','return','return-partial']:
    c=self.b.expected_config(mode,'candidate.config.private.json')
    assert all(c[n]['env']['DATABASE_URL']==self.new_url for n in [sequencer_module.API,sequencer_module.WORKER]),'safe_return_must_keep_new_database_credential'
   assert self.plan['role']==unquote(a.username)and self.plan['database']==a.path.lstrip('/')
   self.sqlfile=self.b.window/'role-change.private.sql';assert manifest['filesSha256']['role-change.private.sql']==hashlib.sha256(self.sqlfile.read_bytes()).hexdigest()==self.plan['sqlSha256']
   assert unquote(b.password)not in self.sqlfile.read_text(),'plaintext_password_in_sql'
   self.boundary=CredentialBoundary(self.b.window)
   assert not(self.b.window/'credential-commit.intent.private.json').exists(),'credential_intent_consumed_inspect_only'
  def start_pair(self,mode):
   if mode=='switch':
    def before():
     self.verify_stopped(mode)  # Exact canonical exit/frontend identity contract.
     self.b.privileged('check-present')  # Fresh root fence observation; original protocol revalidates ownership before start.
     g=self.b.guard();assert g['open']is False and g['generation']==38 and g['tasks']=={}
    def apply():
     sql="SET lock_timeout='2s';SET statement_timeout='10s';BEGIN;"+self.sqlfile.read_text()+'COMMIT;'
     with(self.b.window/'credential-sql.stdout.private').open('x')as out,(self.b.window/'credential-sql.stderr.private').open('x')as err:
      os.chmod(out.name,0o600);os.chmod(err.name,0o600)
      r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U',self.plan['role'],'-d',self.plan['database'],'-v','ON_ERROR_STOP=1'],input=sql,text=True,stdout=out,stderr=err,timeout=15)
     if r.returncode:raise RuntimeError('credential_sql_uncertain_inspect_only')
    self.boundary.execute(before,apply,lambda:verify_database_result(self.plan,self.old_url,self.new_url))
   elif(self.b.window/'credential-commit.intent.private.json').exists()and not self.boundary.may_start_successor():raise RuntimeError('credential_result_uncertain_no_successor')
   super().start_pair(mode)
  def recover(self):
   if(self.b.window/'credential-commit.intent.private.json').exists()and not self.boundary.may_start_successor():raise RuntimeError('credential_commit_uncertain_manual_inspection_required')
   return super().recover()
 return CredentialSequencer
if __name__=='__main__':
 assert len(sys.argv)==3 and sys.argv[2]=='--future-owner-authorized-execute','future_explicit_execution_decision_required'
 root=Path(sys.argv[1]).resolve();sys.path.insert(0,str(root/'window'));import sequencer
 adapter(sequencer)(sequencer.Bridge(root)).run()
