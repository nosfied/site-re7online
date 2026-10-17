"""Affected data materialization + exact canonical scope predicates, no capture SQL."""
import ast,copy,json,tempfile,unittest
from pathlib import Path
from scripts.crm_csv_delivery import materialize_activity as m
from scripts.crm_csv_delivery import integrated_audit as a

class Materialization(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.blobs,cls.sources,cls.receipt,cls.proofs=m.inputs()
  cls.inventory,cls.draft,cls.statement=(json.loads(cls.blobs[k])for k in ('inventory','draft','statement'))
  cls.scope=m.make_scope(cls.inventory,cls.draft,cls.statement,cls.receipt['linkSha256'],cls.proofs)
 def predicates(self,loader):
  tree=ast.parse(loader.raw['window/capture_imports.py'])
  f=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='capture')
  start=next(i for i,n in enumerate(f.body)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='scope'for t in n.targets))
  end=next(i for i,n in enumerate(f.body)if i>start and isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='path'for t in n.targets))
  nodes=f.body[start+1:end];self.assertEqual(len(nodes),3)
  # Exact require + keys + require from the existing consumer; no replacement
  # schema. capture's exit/SQL/write effects are deliberately NOT executed.
  return compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'exact-composed-scope-predicates','exec')
 def test_new_technical_review_does_not_claim_human_or_operational_frontier(self):
  self.assertTrue(self.scope['reviewedAgainstAuditAndKnownActivity'])
  self.assertTrue(self.scope['operations']==self.inventory['operations'],'private_population_drift')
  self.assertEqual(self.scope['humanDeclaration']['statementSha256'],self.sources['statement']['sha256'])
  for k in ('ownerReviewed','scopeComplete','knownActivityScopeComplete','observationComplete','underFence','executorExitCertified','ownershipComplete','phaseAuthorityIssued','consumableAsOperationalScope'):self.assertIs(self.scope[k],False)
  self.assertIsNone(self.scope['humanConfirmation'])
  self.assertFalse(self.draft['reviewedAgainstAuditAndKnownActivity'])
 def test_canonical_read_and_scope_requirements_accept_technical_review_not_owner_approval(self):
  with a.composed_loader()as(loader,root,_),tempfile.TemporaryDirectory()as td:
   contract=loader.local_module(root/'window/csv_contract.py');gate=loader.local_module(root/'window/csv_boundary.py')
   path=Path(td)/'csv-known-imports.private.json';m.link.prior.reader()['write_artifact'](path,a.encode(self.scope))
   actual=contract.read(path);self.assertFalse(actual['ownerReviewed'])
   exec(self.predicates(loader),{'scope':actual,'operations':self.inventory['operations'],'require':gate.require})
   actual['reviewedAgainstAuditAndKnownActivity']=False
   with self.assertRaisesRegex(RuntimeError,'known_activity_scope_missing'):
    exec(self.predicates(loader),{'scope':actual,'operations':self.inventory['operations'],'require':gate.require})
 def test_exact_membership_denies_unobserved_tenant_operation(self):
  with a.composed_loader()as(loader,root,_):
   gate=loader.local_module(root/'window/csv_boundary.py');scope=copy.deepcopy(self.scope)
   scope['operations'][0]['tenantId']='SYNTHETIC_OTHER_TENANT'
   with self.assertRaisesRegex(RuntimeError,'known_activity_not_observed'):
    exec(self.predicates(loader),{'scope':scope,'operations':self.inventory['operations'],'require':gate.require})
 def test_full_operational_gates_still_deny(self):
  with a.composed_loader()as(loader,root,_),tempfile.TemporaryDirectory()as td:
   gate=loader.local_module(root/'window/csv_boundary.py');contract=loader.local_module(root/'window/csv_contract.py')
   self.assertEqual(len(gate.imports(self.scope['operations'])),20)
   with self.assertRaisesRegex(RuntimeError,'canonical_exit_required'):gate.exit_and_imports({},self.scope)
   with self.assertRaisesRegex(RuntimeError,'import_inventory_incomplete'):
    gate.exit_and_imports({'oldExitConfirmed':True,'ownershipComplete':True,'sqlZero':True},self.scope)
   changed=copy.deepcopy(self.scope['operations']);changed[0]['state']='UNKNOWN'
   with self.assertRaisesRegex(RuntimeError,'import_not_proven_terminal'):gate.imports(changed)
   # Concrete first blocker from the real four-mode checker, without fabricating
   # a contract/profile merely to reach a later check.
   with self.assertRaises(FileNotFoundError)as caught:contract.check(Path(td),live=False)
   self.assertEqual(Path(caught.exception.filename).name,'csv-contract.private.json')
 def test_private_listing_exact_population_and_originals_unchanged(self):
  text=m.owner_listing(self.inventory,self.sources,self.receipt['linkSha256']).decode()
  self.assertEqual(text.count('## Tenant:'),2)
  for op in self.inventory['operations']:
   self.assertTrue('`'+op['tenantId']+'`'in text,'private_tenant_missing');self.assertTrue(text.count('`'+op['operationId']+'`')==1,'private_operation_missing_or_duplicate')
  self.assertTrue('993 seguem sem vínculo'in text,'private_993_notice_missing')
  for k,row in self.sources.items():self.assertEqual(a.sha(Path(row['path']).read_bytes()),row['sha256'])

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Materialization))
 if result.wasSuccessful():
  proof={'base':m.BASE,'tests':result.testsRun,
   'real':'Authenticated private sources; composed Review/Loader; csv_contract.read; exact three scope predicates extracted from capture; imports/exit_and_imports; csv_contract.check missing-contract denial; real temporary private data file',
   'synthetic':'Cross-tenant/UNKNOWN negative copies in memory; temporary data-only root. No production observation fabricated.',
   'notExercised':'capture full exit/SQL/write path; VPS; runtime; root/PM2; operational generation/installation/authority',
   'reuse':'Six inventory, five link, legacy/composition/functional/SQL/recovery proofs reused; no suite/build/composer rerun',
   'consumerCodeChanged':False,'ownerApprovalInferred':False,
   'status':'PREPARED LOCALLY / LOCAL VALIDATED in affected scope / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}
  (a.D/'ACTIVITY_MATERIALIZATION_PROOFS.json').write_bytes(a.encode(proof))
 raise SystemExit(not result.wasSuccessful())
