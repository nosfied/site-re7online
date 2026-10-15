"""Real concurrent PostgreSQL sessions on a clone of the certified restore.
No production connection or fresh dump. Original restored DB is not modified.
"""
import copy,hashlib,json,os,select,subprocess,sys,time,uuid
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'cipher-volatile-protocol-20261014'))
from locked_plan import READ_SQL,digest
from locked_phase import run,scope_check
def phase(q,a,p,o,i,m,r,budget_seconds=30):return run(q,a,p,o,i,m,r,budget_seconds)
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'remaining-v2-20261014'))
from channel_transaction import render,literal
BIN='/usr/lib/postgresql/16/bin/';BASE=ROOT/'local-evidence/cipher-snapshot-vps-20261014';OUT=ROOT/('local-evidence/cipher-locked-phase-20261014'+os.environ.get('RE7_LAB_SUFFIX',''));OUT.mkdir(mode=0o700,exist_ok=False)
SOCK=Path('/tmp/re7-cipher-volatile-20261014'+os.environ.get('RE7_LAB_SUFFIX',''));SOCK.mkdir(mode=0o700,exist_ok=False)
os.umask(0o077)
log=(OUT/'postgres-harness.private.log').open('x');err=(OUT/'postgres-harness.private.stderr').open('x')
def command(cmd):subprocess.run(cmd,check=True,stdout=log,stderr=err,timeout=30)
cli=['psql','-X','-h',str(SOCK),'-p','56550','-U','postgres','-d','cipher_volatile_lab'+os.environ.get('RE7_LAB_SUFFIX','').replace('-','_'),'-Atq','-v','ON_ERROR_STOP=1']
class Session:
 def __init__(self):self.p=subprocess.Popen(cli,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(OUT/(str(uuid.uuid4())+'.private.stderr')).open('x'));self.buf=b''
 def query(self,q,timeout=15):
  marker='MARKER'+uuid.uuid4().hex;self.p.stdin.write((q+'\nSELECT '+literal(marker)+';\n').encode());self.p.stdin.flush();limit=time.monotonic()+timeout
  while marker.encode()+b'\n' not in self.buf:
   left=limit-time.monotonic()
   if left<=0:raise RuntimeError('local_session_timeout')
   if not select.select([self.p.stdout],[],[],left)[0]:raise RuntimeError('local_session_timeout')
   chunk=os.read(self.p.stdout.fileno(),65536)
   if not chunk:raise RuntimeError('local_sql_denied')
   self.buf+=chunk
  result,self.buf=self.buf.split(marker.encode()+b'\n',1);return result.decode().strip()
 def close(self):
  if self.p.poll() is None:self.p.stdin.close()
  try:self.p.wait(timeout=3)
  except subprocess.TimeoutExpired:self.p.kill();self.p.wait()
def sql(q):
 s=Session()
 try:return s.query(q)
 finally:s.close()
command([BIN+'pg_ctl','-D',str(BASE/'restore/data'),'-l',str(OUT/'postgres.private.log'),'-o',f"-k {SOCK} -p 56550 -h '' -c log_statement=none -c log_min_error_statement=panic",'start'])
try:
 command([BIN+'createdb','-h',str(SOCK),'-p','56550','-U','postgres','-T','postgres','cipher_volatile_lab'+os.environ.get('RE7_LAB_SUFFIX','').replace('-','_')])
 baseline=json.loads(sql(READ_SQL));original=json.loads((BASE/'channel-plan/channel-plan.private.json').read_text());opaque=original['retained'][0]['originalRow']['id'];seal=original['retained'][0]['dispositionSeal']
 approved={**baseline,'opaqueId':opaque};oldKey=json.loads((ROOT/'local-evidence/security-containment-20261012/package-v2/new-values.private.json').read_text())['CHANNEL_ACCOUNT_SECRET_KEY'];newKey='isolated-concurrency-next-key-'*4
 node=str(ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node')
 def make(current):
  r=subprocess.run([node,str(HERE.parent/'cipher-volatile-protocol-20261014/renew_local.cjs'),str(ROOT)],input=json.dumps(dict(current=current,opaqueId=opaque,seal=seal,oldKey=oldKey,newKey=newKey)),text=True,capture_output=True,timeout=10)
  if r.returncode:raise RuntimeError('local_crypto_denied')
  return json.loads(r.stdout)
 def body(plan,h,fail=False):
  q=render(plan,h,fail);assert q.startswith('BEGIN;') and q.endswith('COMMIT;\n');return q[len('BEGIN;'): -len('COMMIT;\n')]
 proof=dict(certificateHashes={'fixture':'sealed-synthetic-exit-proof'},observationIncomplete=[],allWritersExited=True,dbOwnershipProven=True,fenceActive=True,unknownWriters=[],guardGeneration=38,authDb='NEWauth+NEWDB',approvedRenewal=True)
 target=next(r for r in baseline['rows']if r['secretKind']=='baileysAuthState.v1');web=next(a for a in baseline['accounts']if a['id']==target['channelAccountId']);assert web['provider']=='web_session';aid=literal(web['id']);rid=literal(target['id'])
 # A committed legitimate account writer before locks must be retained by the final plan.
 sql('UPDATE "ChannelAccount" SET metadata=jsonb_set(metadata,\'{webSession,reconnectCount}\',\'987\'),"updatedAt"=now() WHERE id='+aid+';')
 writer=subprocess.run([node,str(HERE.parent/'cipher-volatile-protocol-20261014/renew_local.cjs'),str(ROOT)],input=json.dumps(dict(mode='local-writer',row=target,oldKey=oldKey)),text=True,capture_output=True,timeout=10);assert writer.returncode==0
 encrypted=json.loads(writer.stdout);(OUT/'writer.private.json').write_text(writer.stdout)
 sql('UPDATE "ChannelAccountSecret" SET "secretCiphertext"='+literal(encrypted['ciphertext'])+',"secretHash"='+literal(encrypted['hash'])+',"updatedAt"=now() WHERE id='+rid+';')
 latest=json.loads(sql(READ_SQL));assert next(r for r in latest['rows']if r['id']==target['id'])['secretCiphertext']==encrypted['ciphertext'],'writer_update_not_visible';assert scope_check(approved,latest)
 cases=[];durations=[]
 def attempt(name,make_cb=make,render_cb=body,proof_override=None,query_wrap=None,expect=False,budget=30):
  p=OUT/name;p.mkdir(mode=0o700);s=Session();q=query_wrap(s.query)if query_wrap else s.query
  try:
   result=phase(q,approved,proof_override or proof,p,name,make_cb,render_cb,budget)
   assert expect,name+'_unexpected_pass';durations.append(json.loads((p/'outcome.private.json').read_text()).get('elapsedSeconds',0));return result
  except RuntimeError:
   assert not expect,name+'_unexpected_deny';cases.append(name)
  finally:s.close()
 # Every negative leaves the latest state untouched and no new receipt.
 def state():return digest(json.loads(sql(READ_SQL)))
 before=state();events=sql('SELECT count(*)FROM "Event";')
 attempt('unknown-writer',proof_override={**proof,'unknownWriters':['uncovered']});assert state()==before
 attempt('rollback-before-commit',render_cb=lambda p,h:body(p,h,True));assert state()==before and sql('SELECT count(*)FROM "Event";')==events
 attempt('budget-denied',budget=0);assert state()==before
 for label,change in [('population',lambda c:c['rows'].pop()),('identity',lambda c:c['accounts'][0].update(clientId='00000000-0000-0000-0000-000000000000')),('metadata-control',lambda c:c['accounts'][0].update(metadata={'control':'changed'})),('opaque',lambda c:next(r for r in c['rows']if r['id']==opaque).update(status='changed'))]:
  bad=copy.deepcopy(latest);change(bad)
  try:scope_check(approved,bad);raise AssertionError('scope_negative_accepted')
  except RuntimeError:cases.append(label)
 # A writer holding the account blocks acquisition within lock_timeout, no plan/intent.
 blocker=Session();blocker.query('BEGIN;UPDATE "ChannelAccount" SET "updatedAt"="updatedAt" WHERE id='+aid+';');start=time.monotonic();attempt('lock-timeout');assert time.monotonic()-start<3;blocker.query('ROLLBACK;');blocker.close();assert state()==before
 # During the held phase, a competing writer times out, including account metadata.
 def competing(current):
  writer=Session()
  try:
   try:writer.query('SET lock_timeout=\'200ms\';UPDATE "ChannelAccount" SET metadata=\'{}\' WHERE id='+aid+';');raise AssertionError('writer_not_blocked')
   except RuntimeError:cases.append('concurrent-writer-blocked')
  finally:writer.close()
  return make(current)
 plan,h=attempt('confirmed',make_cb=competing,expect=True)
 assert next(a for a in plan['changes']if a['id']==target['id'])['originalAccount']['metadata']['webSession']['reconnectCount']==987
 current=json.loads(sql(READ_SQL));assert current['accounts']==latest['accounts'];
 checked=subprocess.run([node,str(HERE.parent/'cipher-volatile-protocol-20261014/renew_local.cjs'),str(ROOT)],input=json.dumps(dict(mode='verify-latest',row=next(r for r in current['rows']if r['id']==target['id']),newKey=newKey)),text=True,capture_output=True,timeout=10);assert checked.returncode==0
 assert next(r for r in current['rows']if r['id']==opaque)==next(r for r in latest['rows']if r['id']==opaque)
 sys.path.insert(0,str(HERE.parent/'remaining-v3-20261014'));from cipher_verify import verification_sql,classify
 v,n=verification_sql(plan,h);assert classify(json.loads(sql(v)),n)=='VERIFIED'
 # Successor failure after VERIFIED cannot reactivate old cipher or replay ALTER.
 cases.append('verified-successor-failure-inspection-no-replay')
 # Another database cloned from the already certified source, not another restore.
 command([BIN+'createdb','-h',str(SOCK),'-p','56550','-U','postgres','-T','postgres','cipher_volatile_uncertain'+os.environ.get('RE7_LAB_SUFFIX','').replace('-','_')])
 saved_cli=cli[:];cli[cli.index('-d')+1]='cipher_volatile_uncertain'+os.environ.get('RE7_LAB_SUFFIX','').replace('-','_')
 def lost_response(query):
  def call(q):
   value=query(q)
   if q=='COMMIT;':raise RuntimeError('synthetic_commit_response_lost')
   return value
  return call
 attempt('commit-uncertain',query_wrap=lost_response)
 uncertain_plan=json.loads((OUT/'commit-uncertain/plan.private.json').read_text());uh=digest(uncertain_plan);uv,un=verification_sql(uncertain_plan,uh)
 assert classify(json.loads(sql(uv)),un)=='VERIFIED'
 assert not (OUT/'commit-uncertain/commit-observed.private.json').exists()
 cases.append('actual-commit-response-loss-readonly-VERIFIED')
 cli[:]=saved_cli
 # Full stale plan CAS still rejects metadata changes; no source update is implicit.
 original_state=state();s=Session()
 try:
  try:s.query(render(original,digest(original)));raise AssertionError('stale_plan_accepted')
  except RuntimeError:cases.append('refused-plan-CAS-denied')
 finally:s.close()
 assert state()==original_state
 result=dict(result='LOCAL_VOLATILE_LOCK_PROTOCOL_PASS',cases=cases,converted=10,opaquePreserved=1,latestMetadataPreserved=True,latestCipherPayloadPreserved=True,compatibleReaderDecryptsLatest=True,maximumPhaseSeconds=max(durations),originalCertifiedRestoreReused=True,sourceDatabaseModified=False,productionConnections=0,applicationStarted=False,limits='Local phase uses real restored rows and canonical SQL/crypto; production writer coverage, fences, successor start and policy integration remain review gates.')
 (OUT/'result.sanitized.json').write_text(json.dumps(result));print(json.dumps(result))
finally:
 command([BIN+'pg_ctl','-D',str(BASE/'restore/data'),'stop','-m','fast'])
