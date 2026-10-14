import importlib.util,os,stat,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
S=importlib.util.spec_from_file_location('third',Path(__file__).with_name('withdraw.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class Driver(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.d=Path(self.tmp.name);self.files=[self.d/'a.tar.gz',self.d/'b.tar.gz'];self.folder=self.d/'evidence';self.folder.mkdir()
  for f in self.files:f.write_bytes(b'duplicate')
  self.ps=[patch.object(m,'ROOTS',tuple(map(str,self.files))),patch.object(m,'validate_state',lambda p:None),patch.object(m,'capacity',lambda:10**10),patch.object(m,'observe',lambda p:{'owners':[],'incomplete':[]})]
  for p in self.ps:p.start()
  self.plan={'roots':list(m.ROOTS),'entries':[dict(m.meta(f),path=str(f),sha256=m.digest(f))for f in self.files],'evidenceBudgetBytes':1,'requiredPostFreeBytes':1,'_hash':'local-synthetic'}
 def tearDown(self):
  for p in reversed(self.ps):p.stop()
  self.tmp.cleanup()
 def test_dry_no_intent(self):self.assertEqual(m.run(self.plan,self.folder)['result'],'DRY_RUN_PASS');self.assertFalse((self.folder/'withdrawal.intent.private.json').exists())
 def test_apply_keeps_parent_and_evidence(self):
  self.assertEqual(m.run(self.plan,self.folder,True)['removedCount'],2);self.assertTrue(self.d.is_dir());self.assertTrue((self.folder/'withdrawal.receipt.private.json').is_file())
 def test_replay_denied(self):
  m.run(self.plan,self.folder,True)
  with self.assertRaisesRegex(AssertionError,'consumed'):m.run(self.plan,self.folder,True)
 def test_partial_no_replay(self):
  orig=m.anchored_unlink
  def fail_second(p,w):
   if p==str(self.files[1]):raise OSError('local fault')
   return orig(p,w)
  with patch.object(m,'anchored_unlink',side_effect=fail_second):
   with self.assertRaises(OSError):m.run(self.plan,self.folder,True)
  self.assertFalse(self.files[0].exists());self.assertTrue(self.files[1].exists());self.assertTrue((self.folder/'partial.private.json').exists())
  with self.assertRaisesRegex(AssertionError,'consumed'):m.run(self.plan,self.folder,True)
 def test_hardlink(self):
  os.link(self.files[0],self.d/'alias')
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_symlink(self):
  self.files[0].unlink();self.files[0].symlink_to(self.files[1])
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_directory(self):
  self.files[0].unlink();self.files[0].mkdir()
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_content_drift(self):
  self.files[0].write_bytes(b'changed')
  with self.assertRaises(AssertionError):m.validate_targets(self.plan)
 def test_extra_path(self):
  self.plan['roots'].append(str(self.d/'other'))
  with self.assertRaisesRegex(AssertionError,'allowlist'):m.validate_targets(self.plan)
 def test_owner_no_intent(self):
  with patch.object(m,'observe',lambda p:{'owners':[{'pid':os.getpid()}],'incomplete':[]}):
   with self.assertRaises(m.ObservationDenied):m.run(self.plan,self.folder,True)
  self.assertFalse((self.folder/'withdrawal.intent.private.json').exists())
 def test_incomplete_no_intent(self):
  with patch.object(m,'observe',lambda p:{'owners':[],'incomplete':[{'stage':'maps','errno':13}]}):
   with self.assertRaises(m.ObservationDenied):m.run(self.plan,self.folder,True)
  self.assertFalse((self.folder/'withdrawal.intent.private.json').exists())
 def test_post_owner_denied(self):
  with patch.object(m,'observe',lambda p:{'owners':[{'pid':1}],'incomplete':[]}):
   with self.assertRaises(m.ObservationDenied):m.post_read(self.plan,self.folder)
 def test_capacity_before_intent(self):
  with patch.object(m,'capacity',lambda:0):
   with self.assertRaisesRegex(AssertionError,'capacity'):m.run(self.plan,self.folder,True)
if __name__=='__main__':unittest.main()
