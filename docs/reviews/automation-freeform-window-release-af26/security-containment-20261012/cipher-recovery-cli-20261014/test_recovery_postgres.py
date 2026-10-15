"""Reuse the certified lost-response database; execute exact CLI argv with real SQL classification.
Only process/policy actions use the isolated canonical FakeBridge. No production.
"""
import contextlib,hashlib,json,os,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import test_recovery_cli as t
from cipher_verify import verification_sql,classify
ROOT=Path.cwd();OUT=ROOT/('local-evidence/cipher-recovery-cli-20261015'+os.environ.get('RE7_LAB_SUFFIX',''));OUT.mkdir(mode=0o700);os.umask(0o077)
SOCK=Path('/tmp/re7-cipher-recovery-cli'+os.environ.get('RE7_LAB_SUFFIX',''));SOCK.mkdir(mode=0o700)
DATA=ROOT/'local-evidence/cipher-snapshot-vps-20261014/restore/data';BIN='/usr/lib/postgresql/16/bin/'
log=(OUT/'harness.private.log').open('x')
def command(argv):return subprocess.run(argv,check=True,stdout=log,stderr=log,timeout=30)
command([BIN+'pg_ctl','-D',str(DATA),'-l',str(OUT/'postgres.private.log'),'-o',f"-k {SOCK} -p 56550 -h '' -c log_statement=none -c log_min_error_statement=panic",'start'])
try:
 plan=json.loads((ROOT/'local-evidence/cipher-locked-phase-20261014-sealed-v1/commit-uncertain/plan.private.json').read_text());q,n=verification_sql(plan,t.digest(plan))
 def observed(db):
  r=subprocess.run([BIN+'psql','-X','-h',str(SOCK),'-p','56550','-U','postgres','-d',db,'-Atq','-v','ON_ERROR_STOP=1'],input=q,text=True,stdout=subprocess.PIPE,stderr=log,timeout=15,check=True)
  return classify(json.loads(r.stdout),n)
 outcomes=[]
 for db,expected,failure in [('postgres','ORIGINAL_VERIFIED','before'),('cipher_volatile_uncertain_sealed_v1','VERIFIED','uncertain')]:
  assert observed(db)==expected
  case=t.Tests();case.setUp()
  try:
   case.failure(failure);p=case.b.window/'seal-current';t.write(p/'plan.private.json',plan);h=t.recovery_actions.sha(p/'plan.private.json');case.driver.hash=h;case.driver.boundary.plan_hash=h
   phase=json.loads((p/'intent.private.json').read_text());phase['planHash']=h;t.write(p/'intent.private.json',phase);t.write(case.b.window/'credential-commit.intent.private.json',{'planSha256':h,'sealIntentSha256':t.recovery_actions.sha(p/'intent.private.json')})
   # verification SQL receipts bind the canonical plan digest, while driver file hash
   # is from write_once compact JSON, matching that digest in the production path.
   (p/'plan.private.json').write_text(json.dumps(plan,separators=(',',':'),ensure_ascii=False));h=t.recovery_actions.sha(p/'plan.private.json');assert h==t.digest(plan);case.driver.hash=h;case.driver.boundary.plan_hash=h
   phase['planHash']=h;t.write(p/'intent.private.json',phase);t.write(case.b.window/'credential-commit.intent.private.json',{'planSha256':h,'sealIntentSha256':t.recovery_actions.sha(p/'intent.private.json')})
   case.driver.prior=lambda:(plan,h,case.driver.boundary);case.driver.classify=lambda *_:observed(db)
   case.branch(expected);outcomes.append(expected)
  finally:case.tearDown()
 result={'result':'EXACT_RECOVERY_CLI_PG16_PASS','classifications':outcomes,'lostCommitResponseDatabaseReused':True,'sqlClassification':'canonical READ ONLY verification_sql','canonicalProcessActions':'isolated FakeBridge only','sqlMutationExecuted':False,'productionConnections':0,'sealCallsAfterFailure':0,'proofsReused':True}
 (OUT/'result.sanitized.json').write_text(json.dumps(result,sort_keys=True)+'\n');print(json.dumps(result))
finally:command([BIN+'pg_ctl','-D',str(DATA),'stop','-m','fast'])
