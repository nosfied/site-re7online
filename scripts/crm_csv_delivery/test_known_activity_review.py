"""Focused offline review: real composed classifier/gate; no capture or SQL."""
import ast,copy,json,unittest
from scripts.crm_csv_delivery import review_known_activity as review
from scripts.crm_csv_delivery import integrated_audit as audit

class Review(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.value,cls.findings,cls.sources,cls.occurrences=review.inspect_existing()
  cls.rows,_,_=audit.captured_rows()
 def test_existing_population_integrity_and_no_rewrite(self):
  self.assertEqual((self.findings['operations'],self.findings['evidencePairs'],self.findings['exactLegacyTerminals']),(20,1784,20))
  self.assertEqual(audit.sha((audit.DEST/'inventory.private.json').read_bytes()),review.INVENTORY_SHA)
 def test_operation_drift_and_duplicate_key_deny(self):
  changed=copy.deepcopy(self.value);changed['operations'][0]['state']='UNKNOWN'
  with self.assertRaisesRegex(RuntimeError,'review_operation_or_evidence_drift'):review.validate_inventory(changed,self.value['operations'],self.rows)
  changed=copy.deepcopy(self.value);changed['operations'][1]=copy.deepcopy(changed['operations'][0])
  with self.assertRaisesRegex(RuntimeError,'review_population_duplicate_or_missing'):review.validate_inventory(changed,changed['operations'],self.rows)
 def test_evidence_hash_tenant_and_terminal_deny(self):
  for mutation,reason in [('hash','review_evidence_hash_or_tenant'),('tenant','review_evidence_hash_or_tenant'),('terminal','review_terminal_not_proven')]:
   with self.subTest(case=mutation):
    changed=copy.deepcopy(self.value);op=changed['operations'][0]
    if mutation=='hash':op['evidence'][0]['sha256']='0'*64
    elif mutation=='tenant':op['tenantId']='SYNTHETIC_OTHER_TENANT'
    else:op['terminalProofMatchesOperation']=False
    with self.assertRaisesRegex(RuntimeError,reason):review.validate_inventory(changed,changed['operations'],self.rows)
 def test_no_inferred_human_or_completeness_claim(self):
  for flag in review.FLAGS:
   changed=copy.deepcopy(self.value);changed[flag]=True
   with self.subTest(flag=flag):
    with self.assertRaisesRegex(RuntimeError,'review_approval_or_completeness_claim'):review.validate_inventory(changed,self.value['operations'],self.rows)
 def test_original_occurrences_unlinked_and_versioned(self):
  self.assertEqual(len(self.occurrences),2)
  self.assertTrue(all(x['auditOperationIdentity']is None for x in self.occurrences))
  self.assertTrue(all(x['commit']==review.BASE and len(x['sha256'])==64 for x in self.sources.values()))
 def test_draft_denied_by_exact_composed_scope_predicate(self):
  # Only the existing pure predicate is extracted. capture() itself is NOT run:
  # its exit/SQL/write effects are outside this offline review.
  with audit.composed_loader()as(loader,root,plan):
   gate=loader.local_module(root/'window/csv_boundary.py')
   tree=ast.parse(loader.raw['window/capture_imports.py'])
   capture=next(x for x in tree.body if isinstance(x,ast.FunctionDef)and x.name=='capture')
   checks=[x for x in capture.body if isinstance(x,ast.Expr)and isinstance(x.value,ast.Call)
           and any(isinstance(a,ast.Constant)and a.value=='known_activity_scope_missing'for a in x.value.args)]
   self.assertEqual(len(checks),1)
   fragment=ast.fix_missing_locations(ast.Module(body=checks,type_ignores=[]))
   with self.assertRaisesRegex(RuntimeError,'known_activity_scope_missing'):
    exec(compile(fragment,'composed-scope-predicate','exec'),{'require':gate.require,'scope':self.value})

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Review))
 if result.wasSuccessful():
  proof={'base':review.BASE,'tests':result.testsRun,'status':'LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY',
   'real':'Stable existing private inventory/source response; composed Review/Loader/classifier/imports gate; exact pure scope predicate extracted from composed capture',
   'contraproofs':['operation drift','duplicate tenant+UUID','evidence hash','tenant divergence','unproven terminal','nine inferred approval/completeness flags','unapproved scope denied'],
   'synthetic':'Only mutated in-memory copies for negative tests; temporary code-only tree. No production observation simulated.',
   'notExecuted':['derive','capture','SQL','VPS','exit/ownership','root/PM2/system effects','composition rebuild'],
   'reused':'16 legacy tests and four composed integration tests, plus unaffected runtime/PM2/SQL/recovery proofs; not rerun',
   'inventorySha256':review.INVENTORY_SHA,'compositionSha256':audit.REVIEW_SHA}
  (audit.D/'KNOWN_ACTIVITY_REVIEW_PROOFS.json').write_text(json.dumps(proof,indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
