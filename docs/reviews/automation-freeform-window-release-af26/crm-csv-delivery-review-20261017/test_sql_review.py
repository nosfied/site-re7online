"""Real isolated PostgreSQL16; SQL payloads/validators/route method/custody are concrete.
Docker/SSH/route representation alone are simulated. Never connects to VPS.
"""
import base64,hashlib,importlib.util,json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists());RV=P.parent
BIN=Path('/usr/lib/postgresql/16/bin');PSQL='/usr/bin/psql'
h=lambda b:hashlib.sha256(b).hexdigest()
class RealPostgres(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  assert all((BIN/n).is_file()for n in('initdb','pg_ctl'))and Path(PSQL).is_file()
  cls.temp=tempfile.TemporaryDirectory(prefix='re7-sql-review-');cls.lab=Path(cls.temp.name);cls.data=cls.lab/'pg';cls.sock=cls.lab/'socket';cls.sock.mkdir(mode=0o700)
  subprocess.run([str(BIN/'initdb'),'-D',str(cls.data),'-A','trust','--no-locale','--encoding=UTF8'],capture_output=True,check=True)
  subprocess.run([str(BIN/'pg_ctl'),'-D',str(cls.data),'-l',str(cls.lab/'postgres.private.log'),'-o',"-F -k "+str(cls.sock)+" -p 56438 -c listen_addresses=''",'-w','start'],capture_output=True,check=True)
  cls.sql("CREATE ROLE wa_agent LOGIN; CREATE ROLE wrong_role LOGIN; CREATE DATABASE whatsapp_agent OWNER wa_agent; CREATE DATABASE wrong_database OWNER wa_agent;",db='postgres')
  for db in('whatsapp_agent','wrong_database'):
   cls.sql('''CREATE TABLE "Event"("id" bigint,"clientId" text,"requestId" text,"eventName" text,"payloadJson" jsonb);
    GRANT SELECT ON "Event" TO wa_agent; GRANT EXECUTE ON FUNCTION pg_control_system() TO wa_agent,wrong_role;''',db=db)
  manifest=json.loads((P/'sql-review/MANIFEST.json').read_bytes());cls.blobs={}
  for n,e in manifest['files'].items():
   if n=='channel.private.json':continue
   f=Path(e['source']);b=(f if f.is_absolute()else ROOT/f).read_bytes();assert len(b)==e['bytes']and h(b)==e['sha256'];cls.blobs[n]=b
  cls.expected={'captureSha256':'SYNTHETIC_PIN_FIXED_BEFORE_NEGATIVES','intervalUtc':['LAB_BEFORE','LAB_AFTER'],
   'route':{'Id':'SYNTHETIC_CONTAINER','Image':'sha256:SYNTHETIC','State':{'Running':True},'NetworkSettings':{'Networks':{'one':{'IPAddress':'172.18.0.2','GlobalIPv6Address':''}},'Ports':{'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'5432'}]}}},
   'clientPathBase64':base64.b64encode((PSQL+'\n').encode()).decode(),'clientVersionBase64':base64.b64encode(subprocess.check_output([PSQL,'--version'])).decode()}
  cls.blobs['channel.private.json']=json.dumps(cls.expected,sort_keys=True).encode()
 @classmethod
 def env(cls):return dict(os.environ,PGHOST=str(cls.sock),PGPORT='56438',PGCONNECT_TIMEOUT='3')
 @classmethod
 def sql(cls,sql,db='whatsapp_agent'):
  return subprocess.run([PSQL,'-X','-w','-Atq','-v','ON_ERROR_STOP=1','-d',db],input=sql.encode(),env=cls.env(),capture_output=True,check=True)
 @classmethod
 def tearDownClass(cls):
  subprocess.run([str(BIN/'pg_ctl'),'-D',str(cls.data),'-m','fast','-w','stop'],capture_output=True,check=True)
  cls.temp.cleanup()
 def exercise(self,case):
  self.sql('TRUNCATE "Event"; GRANT SELECT ON "Event" TO wa_agent; GRANT EXECUTE ON FUNCTION pg_control_system() TO wa_agent;')
  self.sql("INSERT INTO \"Event\" VALUES(1,'SYNTHETIC_TENANT','SYNTHETIC_REQUEST','crm.contact.import.started','{\"operationId\":\"SYNTHETIC_OP\"}'),(2,'SYNTHETIC_TENANT','SYNTHETIC_REQUEST','crm.contact.import.finished','{\"operationId\":\"SYNTHETIC_OP\",\"status\":\"COMPLETED\"}');")
  if case=='privilege':self.sql('REVOKE EXECUTE ON FUNCTION pg_control_system() FROM PUBLIC,wa_agent;')
  if case=='imports-privilege':self.sql('REVOKE SELECT ON "Event" FROM wa_agent;')
  if case=='limit':self.sql('''TRUNCATE "Event"; INSERT INTO "Event" SELECT i,'T','R','crm.contact.import.started','{"operationId":"O"}'::jsonb FROM generate_series(1,100001) i;''')
  q=self.lab/('capture-'+case);q.mkdir(mode=0o700)
  scope={'__name__':'real_sql_consumer','__file__':'<verified sql runner>','BLOBS':self.blobs,'MANIFEST_SHA':'SYNTHETIC_MANIFEST_FIXED_BEFORE_NEGATIVES'}
  exec(compile(self.blobs['runner.py'],scope['__file__'],'exec'),scope)
  realrun=subprocess.run;calls=[]
  def local_transport(argv,**kw):
   # Only external Docker/host boundary remapped; actual SQL bytes execute in PG16.
   self.assertEqual(argv[0],'/usr/bin/docker');calls.append(argv)
   if argv[1]=='inspect':
    route=json.loads(json.dumps(self.expected['route']))
    if case=='route':route['Id']='SYNTHETIC_CHANGED'
    return subprocess.CompletedProcess(argv,0,json.dumps(route).encode(),b'')
   if argv[-2:]==['-c','command -v psql']:return subprocess.CompletedProcess(argv,0,(PSQL+'\n').encode(),b'')
   if argv[-1]=='--version':return subprocess.CompletedProcess(argv,0,subprocess.check_output([PSQL,'--version']),b'')
   self.assertIn('ON_ERROR_STOP=1',argv);self.assertIn('-w',argv)
   sql=kw['input'];self.assertIn(sql,[self.blobs[n+'.sql']for n in('identity','ownership','imports')])
   self.assertTrue(sql.startswith(b'BEGIN READ ONLY;'));self.assertTrue(sql.rstrip().endswith(b'ROLLBACK;'))
   user='wrong_role'if case=='role'else'wa_agent';db='wrong_database'if case=='database'else'whatsapp_agent'
   if case=='output-limit':return subprocess.CompletedProcess(argv,0,b'x'*65537,b'')
   return realrun([PSQL,'-X','-w','-Atq','-v','ON_ERROR_STOP=1','-U',user,'-d',db],input=sql,env=self.env(),capture_output=True,timeout=kw['timeout'])
  scope['subprocess']=type('LabSubprocess',(),{'run':staticmethod(local_transport),'TimeoutExpired':subprocess.TimeoutExpired})
  # Genuine second backend, proving a nonzero live population is not rejected.
  peer=None
  if case=='valid':
   peer=subprocess.Popen([PSQL,'-X','-w','-Atq','-U','wa_agent','-d','whatsapp_agent'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=self.env())
   peer.stdin.write(b'BEGIN; SELECT 1;\n');peer.stdin.flush();self.assertEqual(peer.stdout.readline(),b'1\n')
  try:ok,_=scope['run'](q,'collect')
  finally:
   if peer:peer.stdin.close();peer.wait(timeout=5)
  rows=[json.loads(x)for x in(q/'privileged-output.private.jsonl').read_bytes().splitlines()];end=rows[-1]
  cmds=[r for r in rows if r['event']=='command'];ids=[r['id']for r in cmds];queries=[c for c in calls if'-i'in c]
  if case=='valid':
   self.assertTrue(ok);self.assertEqual(len(queries),3);self.assertEqual(end['result'],'THREE_READONLY_SQLS_PRESERVED')
   backend=next(x for x in rows if x['event']=='SQL_BACKENDS_OBSERVED');self.assertGreaterEqual(backend['backends'],1);self.assertEqual(backend['ownership'],'UNKNOWN')
   self.assertEqual([x['states']for x in rows if x['event']=='IMPORTS_CLASSIFIED_PRIVATE_AUDIT_ONLY'],[{'COMPLETED':1}])
   self.assertEqual(len([x for x in rows if x['event']=='SQL_CHANNEL_REVALIDATED']),4)
  else:
   self.assertFalse(ok);self.assertEqual(end['result'],'DENY_NO_RETRY')
   if case in('privilege','role','database','output-limit'):self.assertNotIn('ownership',ids)
   if case=='route':self.assertEqual(len(queries),0)
   if case=='limit':self.assertEqual((end['denialStage'],end['denialReason']),('imports','IMPORTS_POSSIBLY_TRUNCATED_100001'));self.assertNotIn('after-imports-route',ids)
   if case=='output-limit':self.assertTrue(any(x.get('prefixOnly')for x in rows));self.assertEqual(len(base64.b64decode(next(x for x in cmds if x['id']=='identity')['stdoutBase64'])),65536)
  # Reuse reviewed driver/export/ingest exactly, including the explicit journal bound.
  driver={'__name__':'offline_driver','BLOBS':self.blobs,'MANIFEST_SHA':'SYNTHETIC_MANIFEST_FIXED_BEFORE_NEGATIVES'};exec(compile(self.blobs['driver.py'],'<reviewed sql driver>','exec'),driver)
  lib,record=driver['libraries']();export=lib['export'](q);self.assertEqual(base64.b64decode(export['bytesBase64']),(q/'privileged-output.private.jsonl').read_bytes())
  # Export source is exact fixed remote destination in the contract, represented only in envelope.
  export['source']=driver['OUTPUT']+'/'+driver['JOURNAL']
  envelope=json.dumps({'manifestSha256':driver['MANIFEST_SHA'],'gateExitCode':0 if ok else 1,'capture':export}).encode()
  custody=self.lab/('custody-'+case);custody.mkdir(mode=0o700)
  accepted=driver['ingest'](custody,envelope,b'',0 if ok else 1,'LAB_BEFORE','LAB_AFTER')
  self.assertEqual(accepted,0 if ok else 1);self.assertEqual((custody/'capture.private.jsonl').read_bytes(),(q/'privileged-output.private.jsonl').read_bytes())
  return {'case':case,'postgres16Real':True,'sqlPayloadsUnchanged':True,'ok':ok,'queryCount':len(queries),'denialStage':end.get('denialStage'),'denialReason':end.get('denialReason'),'journalBytes':(q/'privileged-output.private.jsonl').stat().st_size,'exportAndCanonicalCustodyByteExact':True,'externalDockerRouteAndSshSimulated':True}
 def test_valid_nonzero_backends(self):RESULTS.append(self.exercise('valid'))
 def test_pg_control_privilege(self):RESULTS.append(self.exercise('privilege'))
 def test_imports_select_privilege(self):RESULTS.append(self.exercise('imports-privilege'))
 def test_role_mismatch(self):RESULTS.append(self.exercise('role'))
 def test_database_mismatch(self):RESULTS.append(self.exercise('database'))
 def test_real_100001_sentinel(self):RESULTS.append(self.exercise('limit'))
 def test_route_drift_prevents_sql(self):RESULTS.append(self.exercise('route'))
 def test_output_limit_preserves_explicit_prefix(self):RESULTS.append(self.exercise('output-limit'))
RESULTS=[]
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RealPostgres))
 if result.wasSuccessful():(P/'SQL_REVIEW_PROOFS.json').write_text(json.dumps({'result':'LOCAL_POSTGRES16_FOCUSED_VALIDATED_NOT_PRODUCTION','tests':result.testsRun,'cases':RESULTS,'real':'isolated PostgreSQL16/psql with exact pinned SQLs, actual roles/privilege failures, 100001 synthetic Event rows and nonzero backends; route verifier System.db_container, classifier, private_record/export/ingest','simulated':'Docker inspect/exec mapping and container/channel fixtures; SSH not executed; output-size overflow response synthetic','limitations':'statements are separate READ ONLY transactions, no cross-query snapshot/complete ownership; no VPS','noProductionAccess':True},indent=2)+'\n')
 raise SystemExit(0 if result.wasSuccessful()else 1)
