"""Offline producer-key/classifier/gate proof; no DB, network or application entrypoint."""
import ast,base64,collections,hashlib,io,json,re,shutil,subprocess,tarfile,unittest,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];RV=ROOT/'docs/reviews/automation-freeform-window-release-af26';D=RV/'crm-csv-delivery-review-20261017'
COMMIT='7f79cee615c4bbfef342fef0084644b3d669712a';NEW=ROOT/'scripts/crm_csv_delivery/capture_imports.source';OLD=RV/'crm-csv-operational-20261016/capture_imports.py'
H=lambda b:hashlib.sha256(b).hexdigest()
def require(value,reason):
 if not value:raise RuntimeError(reason)
def function(raw,name):
 n=next(n for n in ast.parse(raw).body if isinstance(n,ast.FunctionDef)and n.name==name)
 ns={'require':require,'hashlib':hashlib,'json':json};exec(compile(ast.fix_missing_locations(ast.Module(body=[n],type_ignores=[])),'<real '+name+'>','exec'),ns);return ns[name]
class Audit(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.classify=function(NEW.read_bytes(),'classify');cls.old=function(OLD.read_bytes(),'classify')
  cls.gate=function((RV/'crm-csv-operational-20261016/csv_boundary.py').read_bytes(),'imports')
  cls.exit_gate=function((RV/'crm-csv-operational-20261016/csv_boundary.py').read_bytes(),'exit_and_imports');cls.exit_gate.__globals__['imports']=cls.gate
  cls.node=shutil.which('node');assert cls.node
  raw=(ROOT/'local-evidence/security-v3-runtime-20261014/api-seed-epoch-v3.tar').read_bytes();assert H(raw)=='36f51ebef7bf74f6efc90088254b1a806f427ee4f614ce9e0802b37d281a80cb'
  with tarfile.open(fileobj=io.BytesIO(raw),mode='r:')as t:
   cls.js=t.extractfile('dist/crm/crmContactUpsert.js').read();cls.routes=t.extractfile('dist/http/routes.js').read()
  cls.ts=subprocess.check_output(['git','show',COMMIT+':apps/whatsapp-agent/src/crm/crmContactUpsert.ts'])
  route_ts=subprocess.check_output(['git','show',COMMIT+':apps/whatsapp-agent/src/http/routes.ts'])
  cls.expressions=['`${params.requestId}:${resultlessHash(row.phone)}`','`${CRM_CONTACT_CREATED_EVENT}:${result.leadId}:${params.requestId}`','`${CRM_CONTACT_IMPORT_SUMMARY_EVENT}:${params.requestId}`']
  for x in cls.expressions:assert x.encode()in cls.ts and x.encode()in cls.js
  assert b'const requestId = crypto.randomUUID();'in route_ts and b'const requestId = crypto.randomUUID();'in cls.routes
  assert b'await confirmCrmContactCsvImport(prisma, {'in route_ts and b'requestId,'in route_ts
  cls.hashfn=re.search(r'function resultlessHash\(value\) \{.*?\n\}',cls.js.decode(),re.S).group()
  assert 'slice(0, 16)'in cls.hashfn
  # Same SQL-consumed rows, verified against immutable result receipt; never a fresh query.
  raw=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-sql-read-20261017-v2/capture.private.jsonl').read_bytes();assert H(raw)=='e41c5dc714d5cabdadedc5f88c12d1ea63f26ba1c9fd34df411f01fcdb3ac01e'
  journal=[json.loads(x)for x in raw.splitlines()];cmd=next(x for x in journal if x.get('event')=='command'and x.get('id')=='imports');sqlraw=base64.b64decode(cmd['stdoutBase64'],validate=True);assert H(sqlraw)==cmd['stdoutSha256'];cls.real=json.loads(sqlraw)['rows']
 @staticmethod
 def event(name,request,tenant='SYNTHETIC_TENANT_A',operation=None,status=None):
  return {'id':str(uuid.uuid4()),'tenant':tenant,'request':request,'event':name,'operation':operation,'status':status}
 def produce(self,op=None,tenant='SYNTHETIC_TENANT_A',lead='syntheticLeadDifferentFromOperation',phone='550000000001'):
  op=op or str(uuid.uuid4())
  # Evaluate ONLY the exact attested pure template expressions/hash, not runtime code.
  program='const crypto=require("node:crypto");'+self.hashfn+';let params={requestId:'+json.dumps(op)+'},row={phone:'+json.dumps(phone)+'},result={leadId:'+json.dumps(lead)+'};const CRM_CONTACT_CREATED_EVENT="crm.contact.created",CRM_CONTACT_IMPORT_SUMMARY_EVENT="crm.contact.import.summary";params.requestId='+self.expressions[0]+';const created='+self.expressions[1]+';params.requestId='+json.dumps(op)+';console.log(JSON.stringify([created,'+self.expressions[2]+']));'
  created,summary=json.loads(subprocess.check_output([self.node,'-e',program]))
  self.assertNotEqual(created,summary);self.assertNotEqual(created,op);self.assertNotEqual(summary,op)
  return op,self.event('crm.contact.created',created,tenant),self.event('crm.contact.import.summary',summary,tenant)
 def classify_rows(self,rows):return type(self).classify(rows)
 def deny(self,rows):
  try:result=self.classify_rows(rows)
  except RuntimeError:return
  with self.assertRaises(RuntimeError):type(self).gate(result)
 def test_real_custody_reproduction_and_reconciliation(self):
  old=type(self).old(self.real);self.assertEqual(collections.Counter(x['state']for x in old),{'UNKNOWN':1764,'COMPLETED':20})
  with self.assertRaisesRegex(RuntimeError,'import_not_proven_terminal'):type(self).gate(old)
  new=self.classify_rows(self.real);self.assertEqual(len(new),20);self.assertTrue(all(x['state']=='COMPLETED'for x in new));self.assertEqual(sum(len(x['evidence'])for x in new),1784)
  self.assertEqual(sorted((e['source'],e['sha256'])for x in old for e in x['evidence']),sorted((e['source'],e['sha256'])for x in new for e in x['evidence']))
  self.assertEqual(len(type(self).gate(new)),20)
  with self.assertRaisesRegex(RuntimeError,'canonical_exit_required'):type(self).exit_gate({}, {'operations':new})
  # Synthetic frontier flags exercise the real validator, never an operational certificate.
  with self.assertRaisesRegex(RuntimeError,'import_inventory_incomplete'):
   type(self).exit_gate({'oldExitConfirmed':True,'ownershipComplete':True,'sqlZero':True,'sha256':'synthetic'}, {'operations':new,'scopeComplete':False,'observationComplete':True,'underFence':True})
  PROOFS['actual']={'sourceSha256':'e41c5dc714d5cabdadedc5f88c12d1ea63f26ba1c9fd34df411f01fcdb3ac01e','originalGroups':{'COMPLETED':20,'UNKNOWN':1764},'correctedGroups':{'COMPLETED':20},'eventEvidencePreserved':1784,'orphanCreationGroups':0,'exactTenantEmbeddedRequestJoin':True,'terminalPredicateOnly':'PASS','fullAdmission':'NOT_SATISFIED canonical_exit_required/knownActivityScope/current authority pending'}
 def test_actual_producer_templates_distinct_keys(self):
  op,a,b=self.produce();self.assertEqual([x['operationId']for x in self.classify_rows([a,b])],[op])
  self.assertEqual(len(type(self).gate(self.classify_rows([a,b]))),1)
 def test_contact_and_row_collision_not_operation(self):
  op,a,b=self.produce();op2,c,d=self.produce(lead='syntheticLeadDifferentFromOperation',phone='550000000001');self.assertNotEqual(op,op2)
  self.assertEqual(len(self.classify_rows([a,b,c,d])),2)
 def test_many_contacts_one_operation(self):
  op,a,b=self.produce();_,c,_=self.produce(op,lead='SYNTHETIC_OTHER_LEAD',phone='550000000002');self.assertEqual(len(self.classify_rows([a,b,c])),1)
 def test_same_operation_uuid_across_tenants_does_not_join(self):
  op,a,_=self.produce();_,_,b=self.produce(op,tenant='SYNTHETIC_TENANT_B');self.deny([a,b])
  self.deny([self.event('crm.contact.import.started',op),self.event('crm.contact.import.finished',op,tenant='SYNTHETIC_TENANT_B',status='COMPLETED')])
 def test_both_tenants_with_own_terminal(self):
  op,a,b=self.produce();_,c,d=self.produce(op,tenant='SYNTHETIC_TENANT_B');self.assertEqual(len(type(self).gate(self.classify_rows([a,b,c,d]))),2)
 def test_orphan_history_not_active_not_terminal(self):
  _,a,_=self.produce();rows=self.classify_rows([a]);self.assertEqual(rows[0]['correlationBasis'],'CREATION_HISTORY_WITHOUT_TERMINAL_NOT_EXECUTOR_ACTIVITY');self.deny([a])
 def test_legacy_summary_operation_collision(self):
  op,a,b=self.produce();self.deny([a,b,self.event('crm.contact.import.summary',b['request'])])
 def test_legacy_new_uuid_collision_not_authorized(self):
  op,a,b=self.produce();self.deny([a,b,self.event('crm.contact.import.started',op),self.event('crm.contact.import.finished',op,status='COMPLETED')])
 def test_nonterminal_real_operation_even_if_legacy_other_completes(self):
  _,a,b=self.produce();op=str(uuid.uuid4());self.deny([a,b,self.event('crm.contact.import.started',op)])
 def test_modern_full_operation_and_row(self):
  op=str(uuid.uuid4());rows=[self.event('crm.contact.import.started',op),self.event('crm.contact.import.row',op+':7',operation=op),self.event('crm.contact.import.summary',op,operation=op),self.event('crm.contact.import.finished',op,status='COMPLETED')];self.assertEqual(len(type(self).gate(self.classify_rows(rows))),1)
 def test_wrong_row_operation(self):
  a,b=str(uuid.uuid4()),str(uuid.uuid4());self.deny([self.event('crm.contact.import.row',a+':7',operation=b)])
 def test_orphan_finished_uncertain_and_duplicate_finished(self):
  op=str(uuid.uuid4());self.deny([self.event('crm.contact.import.finished',op,status='COMPLETED')]);self.deny([self.event('crm.contact.import.uncertain',op)])
  self.deny([self.event('crm.contact.import.started',op),self.event('crm.contact.import.finished',op,status='COMPLETED'),self.event('crm.contact.import.finished',op,status='COMPLETED')])
 def test_bad_creation_and_declared_mismatch(self):
  op,a,b=self.produce();bad=dict(a,request=a['request']+':extra');self.deny([bad,b]);self.deny([dict(a,operation=str(uuid.uuid4())),b])
 def test_future_operational_composer_source_hook(self):
  import sys
  sys.path.insert(0,str(ROOT))
  from scripts.crm_csv_predecessor.composition import apply_import_audit
  code={'window/capture_imports.py':OLD.read_bytes()};origins={'window/capture_imports.py':{'input':'accepted canonical source'}}
  apply_import_audit(code,origins);self.assertEqual(code['window/capture_imports.py'],NEW.read_bytes())
  self.assertEqual(origins['window/capture_imports.py']['inputSha256'],H(NEW.read_bytes()))
  with self.assertRaisesRegex(RuntimeError,'legacy_import_audit_source_drift'):apply_import_audit(code,origins)
 def test_diagnostic_consumer_and_uncovered_scope(self):
  # Actual future diagnostic imports function loads this source and its classifier.
  source=(ROOT/'scripts/crm_csv_diagnostic/sql_execution.source').read_bytes();ns={'__name__':'local_sql_diagnostic','BLOBS':{'capture_imports.source':NEW.read_bytes()}};exec(compile(source,'<real SQL diagnostic source>','exec'),ns)
  class Cap:
   lib={'require':require}
   def __init__(self):self.rows=[]
   def event(self,event,**value):self.rows.append((event,value))
  cap=Cap();ns['imports'](cap,json.dumps({'rows':self.real}).encode());self.assertEqual(cap.rows[0][1]['states'],{'COMPLETED':20});self.assertFalse(cap.rows[0][1]['knownActivityScopeComplete']);self.assertFalse(cap.rows[0][1]['executorExitCertified'])
  for name in ('SQL','capture'):
   a=next(x for x in ast.parse(OLD.read_bytes()).body if (isinstance(x,ast.FunctionDef)and x.name==name)or(isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in x.targets)))
   b=next(x for x in ast.parse(NEW.read_bytes()).body if (isinstance(x,ast.FunctionDef)and x.name==name)or(isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in x.targets)))
   self.assertEqual(ast.dump(a),ast.dump(b))
PROOFS={}
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Audit))
 if result.wasSuccessful():
  PROOFS.update(base='a76fcb60c1fe17ccc0cc552e5f7238373851b40a',tests=result.testsRun,sourceSha256=H(NEW.read_bytes()),producerSourceCommit=COMMIT,producerArchiveSha256='36f51ebef7bf74f6efc90088254b1a806f427ee4f614ce9e0802b37d281a80cb',producerCompiledHashes={'crmContactUpsert':H(Audit.js),'routes':H(Audit.routes)},producerTsHash=H(Audit.ts),real='attested producer pure JS templates/hash via local Node; original/corrected classifiers, canonical gate, future diagnostic consumer, immutable private captured rows',simulated='synthetic tenants/contacts/operation UUIDs only; no producer application/DB/process effects',noVpsSqlRuntimeOrImportExecution=True,status='LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY')
  (D/'LEGACY_AUDIT_PROOFS.json').write_text(json.dumps(PROOFS,indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
