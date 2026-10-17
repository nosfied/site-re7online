"""Composed snapshots + real Review/Loader/classifier/gate, no operations."""
import copy,hashlib,json,unittest,sys
from pathlib import Path
from scripts.crm_csv_delivery import integrated_audit as audit
from scripts.crm_csv_delivery import test_import_audit as prior
class Composed(unittest.TestCase):
 @classmethod
 def setUpClass(cls):prior.Audit.setUpClass()
 def test_composed_load_real_custody_and_gates(self):
  rows,_,_=audit.captured_rows()
  with audit.composed_loader()as(loader,root,plan):
   leaf=loader.local_module(root/'window/capture_imports.py');gate=loader.local_module(root/'window/csv_boundary.py')
   self.assertEqual(hashlib.sha256(loader.raw['window/capture_imports.py']).hexdigest(),plan['files']['window/capture_imports.py']['sha256'])
   self.assertEqual(loader.raw['window/capture_imports.py'],(audit.ROOT/'scripts/crm_csv_delivery/capture_imports.source').read_bytes())
   ops=leaf.classify(rows);self.assertEqual(len(gate.imports(ops)),20);self.assertEqual(sum(len(x['evidence'])for x in ops),1784)
   with self.assertRaisesRegex(RuntimeError,'canonical_exit_required'):gate.exit_and_imports({}, {'operations':ops})
   with self.assertRaisesRegex(RuntimeError,'import_inventory_incomplete'):gate.exit_and_imports({'oldExitConfirmed':True,'ownershipComplete':True,'sqlZero':True}, {'scopeComplete':False})
 def test_composed_negatives(self):
  fixture=prior.Audit();op,a,b=fixture.produce();_,c,d=fixture.produce(op,tenant='SYNTHETIC_TENANT_B')
  cases={'orphan':[a],'crossTenant':[a,d],'duplicateSummary':[a,b,dict(b,id='SYNTHETIC_DUPLICATE')],
         'unfinished':[a,b,fixture.event('crm.contact.import.started',str(__import__('uuid').uuid4()))]}
  with audit.composed_loader()as(loader,root,plan):
   leaf=loader.local_module(root/'window/capture_imports.py');gate=loader.local_module(root/'window/csv_boundary.py')
   for label,rows in cases.items():
    with self.subTest(case=label):
     with self.assertRaisesRegex(RuntimeError,'import_not_proven_terminal'):gate.imports(leaf.classify(rows))
 def test_snapshot_revalidation_denies_replacement(self):
  with audit.composed_loader()as(loader,root,plan):
   leaf=loader.local_module(root/'window/capture_imports.py')
   (root/'window/capture_imports.py').write_bytes(b'adulterated lab source')
   with self.assertRaisesRegex(RuntimeError,'owner_review_source_drift|owner_review_source_replaced'):loader.local_module(root/'window/capture_imports.py')
 def test_graph_dependencies_four_modes_and_reuse(self):
  raw,plan,objects=audit.composed_inputs();old=json.loads((audit.D/'CODE_COMPOSITION.json').read_bytes())
  self.assertEqual(plan['cycles'],[]);self.assertEqual(plan['imports'],old['imports']);self.assertEqual(plan['eagerDependencies'],old['eagerDependencies'])
  self.assertEqual(len(plan['files']),127)
  changed=[n for n in plan['files']if plan['files'][n]['sha256']!=old['files'][n]['sha256']];self.assertEqual(changed,['window/capture_imports.py'])
  for mode in ('switch','return','return-partial','return-before-commit'):self.assertIn(mode+'/ops.py',plan['files'])
  self.assertFalse(plan['executionAuthorized']);self.assertFalse(plan['operationallyCertified'])
  obj=json.loads((audit.PACKAGE/'CODE_OBJECTS.json').read_bytes());self.assertEqual((obj['newObjects'],obj['newBytes'],obj['reusedObjects']),(0,0,61))
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Composed))
 if result.wasSuccessful():
  value={'base':'a1f934c9ec2132cbf2087f903ed40c428a6f1b5b','tests':result.testsRun,'compositionSha256':audit.REVIEW_SHA,
   'real':'existing editable compositor; byte-pinned object sources; concrete static Review and Loader; composed full module; canonical terminal/exit gates; immutable captured rows',
   'lab':'temporary code-only127-path tree, no operational data/pins/permit; synthetic negative events and frontier flags',
   'coverage':['20 groups/1784 evidence','orphans','tenant mismatch','summary collision','incomplete operation','replacement denied on load','same import/dependency graph, zero cycles, four modes'],
   'previousProofsReused':'16 legacy tests and unaffected recovery/runtime/PM2/SQL proofs not rerun',
   'noVpsOrSqlOrInstall':True,'fullAdmission':'NOT_SATISFIED ownership/exit/knownActivityScope/authority pending',
   'status':'PREPARED LOCALLY / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}
  (audit.D/'INTEGRATED_AUDIT_PROOFS.json').write_text(json.dumps(value,indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
