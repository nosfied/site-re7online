"""Only the new offline documentary-link/static-handoff delta.
No reclassification, derive/capture, SQL, operational launcher or system effects.
"""
import copy,hashlib,json,unittest
from scripts.crm_csv_delivery import link_known_activity as link
from scripts.crm_csv_delivery import integrated_audit as a

class Link(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.blobs,cls.sources,cls.findings=link.existing()
  cls.values=[json.loads(cls.blobs[k])for k in ('inventory','draft','statement')]
 def test_exact_original_sources_link_and_no_rewrite(self):
  self.assertTrue(self.findings['documentaryLinkComplete'])
  self.assertEqual(self.sources['statement']['sha256'],'b5261f73ca3b5a918645616e8e0f1f1d84b6c65c3cc7b9e570755928ee793f75')
  self.assertEqual(self.values[0]['operations'],self.values[1]['operations'])
  for k,row in self.sources.items():self.assertEqual(hashlib.sha256(__import__('pathlib').Path(row['path']).read_bytes()).hexdigest(),row['sha256'])
 def test_reference_population_capture_and_composition_drift_deny(self):
  for field,reason in [('inventorySha256','link_inventory_reference'),('operations','link_operations_drift'),('captureSha256','link_capture_reference'),('compositionSha256','link_composition_reference')]:
   values=copy.deepcopy(self.values);values[1][field]=[]if field=='operations'else'0'*64
   with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,reason):link.relationships(*values)
 def test_no_broad_human_or_implicit_approval(self):
  values=copy.deepcopy(self.values);values[2]['kind']='ALL_TENANT_ACTIONS_CERTIFIED'
  with self.assertRaisesRegex(RuntimeError,'link_statement_scope'):link.relationships(*values)
  values=copy.deepcopy(self.values);values[2]['doesNotCertify'].remove('audit completeness')
  with self.assertRaisesRegex(RuntimeError,'link_statement_exclusions'):link.relationships(*values)
  for key in ('reviewedAgainstAuditAndKnownActivity','scopeComplete','executorExitCertified','ownershipComplete','phaseAuthorityIssued'):
   values=copy.deepcopy(self.values);values[1][key]=True
   with self.subTest(field=key),self.assertRaisesRegex(RuntimeError,'link_draft_approval_claim'):link.relationships(*values)
 def test_993_identity_cannot_be_filled(self):
  values=copy.deepcopy(self.values);values[1]['documentedOccurrences'][0]['auditOperationIdentity']='SYNTHETIC_UNPROVEN_LINK'
  with self.assertRaisesRegex(RuntimeError,'link_993_identity_claim'):link.relationships(*values)
 def test_concrete_static_indices_objects_and_unapproved_decision(self):
  handoff=link.static_handoff('0'*64)
  self.assertEqual((handoff['codePaths'],handoff['uniqueCodeObjects'],handoff['newCodeObjects'],handoff['runtimeCopies']),(127,61,0,0))
  self.assertEqual(set(handoff['runtimeReferences']),{'api-candidate','frontend-candidate','frontend-compatible-return','events-control-policy-overlay'})
  self.assertFalse(handoff['requiredDecision']['current']);self.assertFalse(handoff['requiredDecision']['decisionRecorded'])
  self.assertEqual(handoff['requiredDecision']['field'],'reviewedAgainstAuditAndKnownActivity')
  self.assertFalse(handoff['knownActivityInput']['materialized']);self.assertFalse(handoff['executionAuthorized'])
  self.assertFalse(handoff['operationallyCertified']);self.assertFalse(handoff['operationalGenerationCreated'])

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Link))
 if result.wasSuccessful():
  proof={'base':link.BASE,'tests':result.testsRun,'scope':'New documentary reference validation and static handoff only',
   'real':'Existing private bytes/hash/mode read by canonical stable reader; accepted static composition and61 referenced objects; published source/receipt bytes compared against exact Git base',
   'synthetic':'Negative mutations are in-memory copies; zero-hash link argument only in non-operational handoff test; no observed production data fabricated',
   'notExercised':['VPS','SQL','runtime execution','canonical capture exit/SQL/write effects','root/PM2','installation','phase authority'],
   'reused':'Six inventory-review tests,16 legacy/four composition tests and unaffected functional/recovery/SQL/PM2 proofs not rerun',
   'status':'PREPARED LOCALLY / LOCAL VALIDATED in tested scope / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}
  (a.D/'ACTIVITY_LINK_PROOFS.json').write_bytes(a.encode(proof))
 raise SystemExit(not result.wasSuccessful())
