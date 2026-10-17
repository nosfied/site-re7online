"""Real static producers + four-mode checker. No operational system boundary."""
import json,tempfile,unittest
from pathlib import Path
from scripts.crm_csv_delivery import compose_bound_review as b,integrated_audit as a

class Bound(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name)/'new'
  cls.result=b.compose(cls.root)
  cls.ctx=a.composed_loader();cls.loader,cls.code,cls.plan=cls.ctx.__enter__()
  cls.checker=cls.loader.local_module(cls.code/'window/csv_contract.py')
 @classmethod
 def tearDownClass(cls):cls.ctx.__exit__(None,None,None);cls.temp.cleanup()
 def test_full_real_offline_contract(self):
  result=self.checker.check(self.root,live=False)
  self.assertEqual((result['modes'],result['immutableReferences'],result['live']),(4,4,False))
 def test_profiles_four_modes_preserve_original_and_credentials(self):
  read=self.checker.read;source=read(self.root/'window/source.profile.private.json');target=read(self.root/'window/target.profile.private.json')
  for mode in b.MODES:
   candidate=read(self.root/mode/'candidate.config.private.json');previous=read(self.root/mode/'return.config.private.json')
   self.assertTrue(candidate==(source if mode=='return-before-commit'else target),'private_target_profile_drift')
   self.assertTrue(previous==(source if mode in ('switch','return-before-commit')else target),'private_source_profile_drift')
   self.assertTrue(all(x['env']==y['env']for x,y in zip(source['apps'],candidate['apps'])),'private_credentials_drift')
 def test_seals_all_members_and_original_closure_code_unchanged(self):
  for line in(self.root/'preparation-review.sha256').read_text().splitlines():
   h,n=line.split('  ',1);self.assertEqual(a.sha((self.root/n).read_bytes()),h)
  for name,row in self.plan['files'].items():self.assertEqual(a.sha((self.root/name).read_bytes()),row['sha256'])
  self.assertEqual(self.plan['cycles'],[])
  self.assertFalse(any(self.root.rglob('*intent*')))
 def test_json_cjs_and_data_reference_tampering_deny(self):
  for name,content,reason in [('switch/candidate.ecosystem.config.cjs',b'module.exports={};','ecosystem_json_drift'),('window/path-bindings.private.json',b'{}','window_hash_drift')]:
   f=self.root/name;old=f.read_bytes();f.write_bytes(content)
   try:
    with self.assertRaisesRegex(RuntimeError,reason):self.checker.check(self.root,live=False)
   finally:f.write_bytes(old)
 def test_predecessor_drift_and_exclusive_destination(self):
  p=self.root/'window/csv-contract.private.json';old=p.read_bytes();v=json.loads(old);v['sourcePolicySha256']='0'*64;p.write_bytes(a.encode(v))
  try:
   with self.assertRaisesRegex(RuntimeError,'source_policy_or_model_drift'):self.checker.check(self.root,live=False)
  finally:p.write_bytes(old)
  with self.assertRaisesRegex(RuntimeError,'bound_destination_exists'):b.compose(self.root)
 def test_coverage_separates_group_descriptions_from_literal_paths(self):
  coverage=b.input_coverage(self.plan,self.root)
  self.assertTrue(all(' 'not in n for n in coverage['requiredDataAbsent']))
  self.assertIn('window/restore proofs and mode backup/baseline/proof-bindings',coverage['historicalDataGroupsSupplied'])
  self.assertEqual(coverage['partialRequirementGroups'][0]['notSupplied'],['original-preparation-review.sha256'])
  self.assertIn('window/recovery-contract.private.json',coverage['requiredDataAbsent'])
 def test_no_operational_certification_or_admitted_gates(self):
  s=self.checker.read(self.root/'window/binding-status.private.json')
  self.assertEqual(s['state'],'TEMPLATE_NOT_ADMITTED')
  for k in ('freshness','exit','ownership','phaseAuthority'):self.assertIsNone(s[k])
  self.assertTrue(all(v is False for v in self.checker.read(self.root/'window/execution-gates.private.json').values()))
  self.assertEqual((self.root/'execution-authorized').read_bytes(),b'false\n')
  paths=self.checker.read(self.root/'window/path-bindings.private.json');self.assertEqual(len(paths),3)
  self.assertLess(self.result['writtenBytes'],self.result['copyBudgetBytes'])

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Bound))
 if result.wasSuccessful():
  proof={'base':b.BASE,'tests':result.testsRun,
   'real':'Byte-pinned historical data; authenticated source objects; exact producer profile/variant/seal functions; ecosystem generate/validate; real Review/Loader and csv_contract.check(live=False) across four complete static modes; private filesystem and hashes',
   'simulated':'Only tampered local review files for negative cases; no production state fabricated',
   'notExecuted':['historical compose/bind/install entrypoints','live=True checker','VPS','SQL','CJS execution','PM2','contains/stops/starts','phase authority'],
   'preserved':'R1/R2 and ORIGINAL code closure byte-exact; source/candidate environment equal; originals/consumed generations untouched',
   'reuse':'Runtime archives/PM2/functional/SQL/recovery proofs reused; no build or broad suite',
   'status':'PREPARED LOCALLY / LOCAL VALIDATED in static scope / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}
  (a.D/'BOUND_STATIC_PROOFS.json').write_bytes(a.encode(proof))
 raise SystemExit(not result.wasSuccessful())
