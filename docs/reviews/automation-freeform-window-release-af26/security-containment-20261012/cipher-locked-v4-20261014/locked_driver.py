import hashlib,json,os,subprocess
from pathlib import Path
from pinned_transport import Pinned
from locked_phase import run,scope_check
from locked_plan import READ_SQL,digest
from cipher_verify import verification_sql,classify
from channel_transaction import render
from credential_boundary import CredentialBoundary,VERIFIED
class Driver:
 def __init__(self,b):
  self.b=b;self.w=b.window
  origin=self.w/'cipher-origin.private.json'
  if origin.is_file():
   value=json.loads(origin.read_text());previous=Path(value['originalWindow']);receipt=previous/'credential-commit.receipt.private.json'
   if previous.parent.parent!=b.root.parent or hashlib.sha256(receipt.read_bytes()).hexdigest()!=value['receiptSha256']:raise RuntimeError('cipher_origin_receipt_drift')
   self.w=previous
  self.spec=json.loads((self.w/'locked-hook.private.json').read_text());self.approved=json.loads((self.w/'approved-scope.private.json').read_text())
 def connection(self,tag):return Pinned(self.spec['node'],self.w/'locked_transport.cjs',self.w/'source.config.private.json',self.spec['databaseIdentity'],self.w/(tag+'.private.stderr'),deadline=30)
 def historical_gate(self,c):
  policy=json.loads((self.w/'historical-population.private.json').read_text());ids=sorted({e['eventId']for e in policy['entries']})
  import uuid
  literals=','.join("'"+str(uuid.UUID(x))+"'::uuid"for x in ids)
  sql="""SELECT coalesce(json_agg(json_build_object('id',id,'clientId',"clientId",'payloadJson',"payloadJson")ORDER BY id),'[]')FROM "Event" WHERE id IN("""+literals+")"
  events=json.loads(c.query(sql))
  request={'mode':'historical-gate','events':events}
  r=subprocess.run([self.spec['node'],str(self.w/'current_plan.cjs'),str(self.w/'source.config.private.json'),str(self.b.root/'switch/candidate.config.private.json')],input=json.dumps(request),text=True,capture_output=True,env={k:x for k,x in os.environ.items()if k in ('PATH','HOME','USER','LANG')},timeout=10)
  if r.returncode or json.loads(r.stdout)!=dict(historicalEvents=126,historicalFields=147,payloadsUnchanged=True):raise RuntimeError('historical_population_payload_drift')
 def check_scope(self):
  c=self.connection('scope-'+str(__import__('time').time_ns()))
  try:
   c.query('BEGIN READ ONLY;');v=json.loads(c.query(READ_SQL));scope_check(self.approved,v);self.historical_gate(c);c.query('ROLLBACK;')
   request={'current':v,'opaqueId':self.approved['opaqueId'],'dispositionSeal':self.spec['dispositionSeal'],'approvedScopeHash':digest(self.approved)}
   clean={k:x for k,x in os.environ.items()if k in ('PATH','HOME','USER','LANG')}
   r=subprocess.run([self.spec['node'],str(self.w/'current_plan.cjs'),str(self.w/'source.config.private.json'),str(self.b.root/'switch/candidate.config.private.json')],input=json.dumps(request),text=True,capture_output=True,env=clean,timeout=10)
   if r.returncode:raise RuntimeError('original_cipher_readability_denied')
   # Check only; no source/plan/hash/intent is persisted by this READ ONLY phase.
   if len(json.loads(r.stdout)['changes'])!=10:raise RuntimeError('readability_population_denied')
  finally:c.close()
 def classify(self,plan,h):
  c=self.connection('verify-'+str(__import__('time').time_ns()))
  try:
   q,n=verification_sql(plan,h);v=json.loads(c.query(q));return classify(v,n)
  finally:c.close()
 def seal(self,proof):
  path=self.w/'seal-current';boundary=None
  def make(current):
   self.historical_gate(c)
   if json.loads(c.query("SELECT json_build_object('others',(SELECT count(*)FROM pg_stat_activity WHERE datname=current_database()AND backend_type='client backend'AND pid<>pg_backend_pid()))"))!={'others':0}:raise RuntimeError('writer_appeared_under_lock')
   request={'current':current,'opaqueId':self.approved['opaqueId'],'dispositionSeal':self.spec['dispositionSeal'],'approvedScopeHash':digest(self.approved)}
   clean={k:v for k,v in os.environ.items()if k in ('PATH','HOME','USER','LANG')}
   r=subprocess.run([self.spec['node'],str(self.w/'current_plan.cjs'),str(self.w/'source.config.private.json'),str(self.b.root/'switch/candidate.config.private.json')],input=json.dumps(request),text=True,capture_output=True,env=clean,timeout=10)
   if r.returncode:raise RuntimeError('canonical_current_plan_denied')
   return json.loads(r.stdout)
  def sqlbody(plan,h):
   nonlocal boundary
   boundary=CredentialBoundary(self.w,h)
   boundary.write(self.w/'credential-commit.intent.private.json',{'planSha256':h,'sealIntentSha256':hashlib.sha256((path/'intent.private.json').read_bytes()).hexdigest(),'automaticRetry':False,'automaticOldCredentialReturn':False})
   q=render(plan,h)
   if not q.startswith('BEGIN;')or not q.endswith('COMMIT;\n'):raise RuntimeError('canonical_sql_shape_drift')
   return q[len('BEGIN;'):-len('COMMIT;\n')]
  c=self.connection('locked-transaction')
  try:
   empty=json.loads(c.query("SELECT json_build_object('others',(SELECT count(*)FROM pg_stat_activity WHERE datname=current_database()AND backend_type='client backend'AND pid<>pg_backend_pid()),'advisory',(SELECT count(*)FROM pg_locks WHERE locktype='advisory'AND database=(SELECT oid FROM pg_database WHERE datname=current_database())))"))
   if empty!={'others':0,'advisory':0}:raise RuntimeError('new_unknown_writer_denied')
   plan,h=run(c.query,self.approved,proof,path,self.spec['phaseId'],make,sqlbody)
  finally:c.close()
  if self.classify(plan,h)!='VERIFIED':raise RuntimeError('commit_receipt_not_verified_inspect_only')
  boundary.write(self.w/'credential-commit.receipt.private.json',boundary.envelope(VERIFIED));return plan,h,boundary
 def verify_current_verified(self,plan,h):
  # Preserve original CAS/receipt certificate; allow only approved Web evolution.
  c=self.connection('current-epoch-'+str(__import__('time').time_ns()))
  try:
   q,n=verification_sql(plan,h);v=json.loads(c.query(q))
   if v['mfaCount']or v['webhookCount']or v['inventoryTotal']!=11 or v['opaque']!=1 or v['receiptCount']!=n or v['receiptsExact']!=n:raise RuntimeError('durable_receipt_or_population_drift')
   c.query('BEGIN READ ONLY;');current=json.loads(c.query(READ_SQL));c.query('ROLLBACK;')
   expected=json.loads(json.dumps(self.approved))
   for change in plan['changes']:
    row=next(r for r in expected['rows']if r['id']==change['id']);row.update(change['originalRow']);row['secretCiphertext']=change['nextCiphertext']
    account=next(a for a in expected['accounts']if a['id']==change['originalAccount']['id']);account.update(change['originalAccount'])
   scope_check(expected,current)
   request={'mode':'verify-current-new','current':current,'opaqueId':self.approved['opaqueId']}
   r=subprocess.run([self.spec['node'],str(self.w/'current_plan.cjs'),str(self.w/'source.config.private.json'),str(self.b.root/'switch/candidate.config.private.json')],input=json.dumps(request),text=True,capture_output=True,env={k:x for k,x in os.environ.items()if k in ('PATH','HOME','USER','LANG')},timeout=10)
   if r.returncode or json.loads(r.stdout)!=dict(newEpochReadable=10,opaquePreserved=True):raise RuntimeError('current_new_cipher_not_proven')
   return 'VERIFIED_CURRENT_NEW_EPOCH'
  finally:c.close()
 def prior(self):
  path=self.w/'seal-current'
  if not(path/'plan.private.json').is_file():return None
  plan=json.loads((path/'plan.private.json').read_text());return plan,digest(plan),CredentialBoundary(self.w,digest(plan))
