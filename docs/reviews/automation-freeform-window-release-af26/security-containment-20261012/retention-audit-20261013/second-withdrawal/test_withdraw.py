import importlib.util,json,os,stat,tempfile,unittest,mmap
from pathlib import Path
from unittest.mock import patch
S=importlib.util.spec_from_file_location('second',Path(__file__).with_name('withdraw.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class Withdrawal(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.base=Path(self.t.name);self.root=self.base/'release';self.root.mkdir();(self.root/'a').write_bytes(b'package');self.data=self.base/'protected-data';self.data.mkdir();(self.data/'alive').write_bytes(b'production');os.symlink(self.data,self.root/'.data');self.e=self.base/'evidence';self.e.mkdir()
  self.patches=[patch.object(m,'ROOTS',(str(self.root),)),patch.object(m,'validate_state',lambda p:None),patch.object(m,'capacity',lambda:10**10)]
  for p in self.patches:p.start()
  entries=[]
  for p,q in m.inventory().items():
   q=dict(q,path=p)
   if stat.S_ISREG(q['mode']):q['sha256']=m.digest(p)
   elif stat.S_ISLNK(q['mode']):q['target']=os.readlink(p)
   entries.append(q)
  self.plan={'roots':list(m.ROOTS),'entries':entries,'evidenceBudgetBytes':1024,'requiredPostFreeBytes':1,'_hash':'synthetic-local-test'}
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.t.cleanup()
 def empty(self):return patch.object(m,'observe',lambda p:{'at':0,'owners':[],'incomplete':[]})
 def test_dry_run_keeps_bytes(self):
  with self.empty():self.assertEqual(m.run(self.plan,self.e)['result'],'DRY_RUN_PASS')
  self.assertTrue((self.root/'a').exists());self.assertFalse((self.e/'withdrawal.intent.private.json').exists())
 def test_apply_external_link_never_followed(self):
  with self.empty():self.assertEqual(m.run(self.plan,self.e,True)['result'],'WITHDRAWAL_COMPLETE')
  self.assertFalse(self.root.exists());self.assertEqual((self.data/'alive').read_bytes(),b'production')
 def test_consumed_blocks_replay(self):
  with self.empty():m.run(self.plan,self.e,True)
  with self.assertRaisesRegex(AssertionError,'attempt_consumed'):m.run(self.plan,self.e,True)
 def test_new_member_denied(self):
  (self.root/'new').write_bytes(b'x')
  with self.assertRaisesRegex(AssertionError,'membership'):m.validate_targets(self.plan)
 def test_content_drift_denied(self):
  (self.root/'a').write_bytes(b'altered')
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_link_retarget_denied(self):
  (self.root/'.data').unlink();os.symlink(self.base,self.root/'.data')
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_hardlink_denied(self):
  os.link(self.root/'a',self.base/'outside')
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_input_extra_root_denied(self):
  self.plan['roots'].append(str(self.data))
  with self.assertRaisesRegex(AssertionError,'allowlist'):m.validate_targets(self.plan)
 def test_incomplete_observation_denied(self):
  with patch.object(m,'observe',lambda p:{'owners':[],'incomplete':[{'errno':13}]}):
   with self.assertRaisesRegex(AssertionError,'ownership'):m.run(self.plan,self.e,True)
  self.assertFalse((self.e/'withdrawal.intent.private.json').exists())
 def test_owner_denied(self):
  with patch.object(m,'observe',lambda p:{'owners':[{'pid':os.getpid()}],'incomplete':[]}):
   with self.assertRaises(AssertionError):m.run(self.plan,self.e,True)
 def test_own_descriptor_is_owner(self):
  with (self.root/'a').open('rb')as f:
   sample=m.observe(self.plan);self.assertTrue(any(q['pid']==os.getpid()for q in sample['owners']))
 def test_mapping_after_fd_closed_is_owner(self):
  with(self.root/'a').open('rb')as f:mapped=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
  try:self.assertTrue(any(q.get('kind')=='mapping'and q['pid']==os.getpid()for q in m.observe(self.plan)['owners']))
  finally:mapped.close()
 def test_partial_no_resume(self):
  original=m.anchored_link_unlink
  def fail(*args):raise OSError('injected-only-in-local-lab')
  with self.empty(),patch.object(m,'anchored_unlink',side_effect=OSError('injected-local')):
   with self.assertRaises(OSError):m.run(self.plan,self.e,True)
  self.assertTrue((self.e/'partial.private.json').exists());self.assertGreater(json.loads((self.e/'partial.private.json').read_text())['removedCount'],0);self.assertTrue((self.data/'alive').exists())
  with self.assertRaisesRegex(AssertionError,'attempt_consumed'):m.run(self.plan,self.e,True)
 def test_capacity_denied_before_intent(self):
  with self.empty(),patch.object(m,'capacity',lambda:0):
   with self.assertRaises(AssertionError):m.run(self.plan,self.e,True)
 def test_parent_symlink_denied(self):
  linked=self.base/'alias';os.symlink(self.root,linked)
  with self.assertRaises(AssertionError):m.parents(linked/'a')
 def test_synthetic_policy_denied(self):
  self.plan['syntheticProofPolicy']={'enabled':True}
  with self.assertRaisesRegex(AssertionError,'synthetic_policy'):m.validate_targets(self.plan)
class StateGates(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.guard=Path(self.tmp.name)/'guard';self.guard.write_text(json.dumps({'generation':38,'open':False,'tasks':{}}));self.guard.chmod(0o600)
  self.plan={'evidenceDirectory':self.tmp.name,'referenceInventory':[],'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'guardUid':os.getuid(),'guardMode':0o600,'guardSha256':m.digest(self.guard),'processes':[],'references':[],'database':{'receipt':str(Path(self.tmp.name)/'not-created')}}
  self.patches=[patch.object(m,'GUARD',str(self.guard)),patch.object(m,'reference_paths',return_value=[])]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def test_boot_drift(self):
  self.plan['bootId']='previous-boot'
  with self.assertRaisesRegex(AssertionError,'boot_drift'):m.validate_state(self.plan)
 def test_new_reference(self):
  with patch.object(m,'reference_paths',return_value=['new']):
   with self.assertRaisesRegex(AssertionError,'reference_inventory'):m.validate_state(self.plan)
 def test_uncertain_marker(self):
  Path(str(self.guard)+'.uncertain').touch()
  with self.assertRaisesRegex(AssertionError,'guard_marker'):m.validate_state(self.plan)
 def test_closed38_required_even_when_hash_matches(self):
  self.guard.write_text(json.dumps({'generation':38,'open':True,'tasks':{}}));self.plan['guardSha256']=m.digest(self.guard)
  with self.assertRaisesRegex(AssertionError,'guard_contract'):m.validate_state(self.plan)
 def test_wrong_ticks(self):
  self.plan['processes']=[{'pid':os.getpid(),'ticks':'wrong','cwd':os.getcwd()}]
  with self.assertRaisesRegex(AssertionError,'process_identity'):m.validate_state(self.plan)
if __name__=='__main__':unittest.main()
