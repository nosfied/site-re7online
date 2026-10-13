"""Only local temporary fixtures. No SSH/provider/database/process control."""
import importlib.util,tempfile,pathlib,hashlib,os,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('w',pathlib.Path(__file__).with_name('withdraw-reviewed.py'));w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class Tests(unittest.TestCase):
 def fixture(self,d):
  p=pathlib.Path(d)/'file';p.write_bytes(b'evidence');q=w.meta(p);q['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();return p,q
 def test_exact_unlink(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);w.anchored_unlink(str(p),q);self.assertFalse(p.exists())
 def test_metadata_drift(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);p.write_bytes(b'changed')
   with self.assertRaises(AssertionError):w.anchored_unlink(str(p),q)
   self.assertTrue(p.exists())
 def test_hash_conflict(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);q['sha256']='0'*64
   with self.assertRaises(AssertionError):w.anchored_unlink(str(p),q)
   self.assertTrue(p.exists())
 def test_parent_symlink(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);(pathlib.Path(d)/'alias').symlink_to(d)
   with self.assertRaises(OSError):w.anchored_unlink(str(pathlib.Path(d)/'alias'/'file'),q)
   self.assertTrue(p.exists())
 def test_external_hardlink(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);os.link(p,pathlib.Path(d)/'copy')
   with self.assertRaises(AssertionError):w.cache_inventory(d)
   self.assertTrue(p.exists())
 def test_extra_cache_member(self):
  with tempfile.TemporaryDirectory()as d:
   p,q=self.fixture(d);before=w.cache_inventory(d);(pathlib.Path(d)/'unexpected').write_text('x');self.assertNotEqual(set(before),set(w.cache_inventory(d)))
 def test_rmdir_not_empty(self):
  with tempfile.TemporaryDirectory()as d:
   sub=pathlib.Path(d)/'sub';sub.mkdir();q=w.meta(sub);(sub/'new').write_text('x')
   with self.assertRaises(OSError):w.anchored_rmdir(str(sub),q)
   self.assertTrue(sub.exists())
 def test_original_directory_preserved_by_scope(self):
  self.assertEqual(len(w.ARCHIVES),4);self.assertNotIn(w.CACHE,w.ARCHIVES);self.assertTrue(all(x.endswith('/content.private.tar.gz')for x in w.ARCHIVES))
class Chain(unittest.TestCase):
 def fixture(self,d):
  base=pathlib.Path(d);cache=base/'cache';cache.mkdir();sub=cache/'sub';sub.mkdir();(sub/'cached').write_text('cache')
  archives=[]
  for i in range(4):
   p=base/str(i);p.write_text('archive');archives.append(str(p))
  main=base/'principal';main.write_text('archive')
  entries=[]
  for p in [str(cache),str(sub),str(sub/'cached')]+archives:
   q=dict(w.meta(p),path=p)
   if pathlib.Path(p).is_file():q['sha256']=w.digest(p)
   entries.append(q)
  plan={'archives':archives,'cacheRoot':str(cache),'main':dict(w.meta(main),path=str(main),sha256=w.digest(main)),'entries':entries,'_hash':'synthetic','requiredPostFreeBytes':1}
  return cache,archives,main,plan
 def test_full_chain_and_no_replay(self):
  with tempfile.TemporaryDirectory()as d:
   cache,archives,main,plan=self.fixture(d)
   with patch.multiple(w,CACHE=str(cache),ARCHIVES=tuple(archives)),patch.object(w,'validate_state'),patch.object(w,'capacity',return_value=999999),patch.object(w,'owners',return_value={'owners':[],'incomplete':[]}),patch.object(w.os,'geteuid',return_value=0):
    self.assertEqual(w.run(plan,pathlib.Path(d),False)['result'],'DRY_RUN_PASS')
    r=w.run(plan,pathlib.Path(d),True);self.assertEqual(r['result'],'WITHDRAWAL_COMPLETE');self.assertTrue(main.exists());self.assertTrue(cache.exists());self.assertEqual(list(cache.iterdir()),[])
    with self.assertRaises(AssertionError):w.run(plan,pathlib.Path(d),True)
 def test_owner_blocks_before_intent(self):
  with tempfile.TemporaryDirectory()as d:
   cache,archives,main,plan=self.fixture(d)
   with patch.multiple(w,CACHE=str(cache),ARCHIVES=tuple(archives)),patch.object(w,'validate_state'),patch.object(w,'capacity',return_value=999999),patch.object(w,'owners',return_value={'owners':[{'pid':123}],'incomplete':[]}),patch.object(w.os,'geteuid',return_value=0):
    with self.assertRaises(AssertionError):w.run(plan,pathlib.Path(d),True)
    self.assertTrue(all(pathlib.Path(x).exists()for x in archives));self.assertFalse((pathlib.Path(d)/'withdrawal.intent.private.json').exists())
 def test_incomplete_blocks_before_intent(self):
  with tempfile.TemporaryDirectory()as d:
   cache,archives,main,plan=self.fixture(d)
   with patch.multiple(w,CACHE=str(cache),ARCHIVES=tuple(archives)),patch.object(w,'validate_state'),patch.object(w,'capacity',return_value=999999),patch.object(w,'owners',return_value={'owners':[],'incomplete':[{'errno':13}]}),patch.object(w.os,'geteuid',return_value=0):
    with self.assertRaises(AssertionError):w.run(plan,pathlib.Path(d),True)
    self.assertTrue(main.exists());self.assertFalse((pathlib.Path(d)/'withdrawal.intent.private.json').exists())
 def test_partial_receipt_and_no_replay(self):
  with tempfile.TemporaryDirectory()as d:
   cache,archives,main,plan=self.fixture(d);real=w.anchored_unlink;calls=[]
   def fail_second(p,q):
    calls.append(p)
    if len(calls)==2:raise OSError('synthetic denial')
    real(p,q)
   with patch.multiple(w,CACHE=str(cache),ARCHIVES=tuple(archives)),patch.object(w,'validate_state'),patch.object(w,'capacity',return_value=999999),patch.object(w,'owners',return_value={'owners':[],'incomplete':[]}),patch.object(w.os,'geteuid',return_value=0),patch.object(w,'anchored_unlink',side_effect=fail_second):
    r=w.run(plan,pathlib.Path(d),True);self.assertEqual(r['result'],'PARTIAL_OR_DENY_NO_RETRY');self.assertFalse(pathlib.Path(archives[0]).exists());self.assertTrue(pathlib.Path(archives[1]).exists());self.assertTrue(main.exists());self.assertTrue((pathlib.Path(d)/'withdrawal.receipt.private.json').exists())
    with self.assertRaises(AssertionError):w.run(plan,pathlib.Path(d),True)
 def test_capacity_blocks_before_intent(self):
  with tempfile.TemporaryDirectory()as d:
   cache,archives,main,plan=self.fixture(d);plan['requiredPostFreeBytes']=10**12
   with patch.multiple(w,CACHE=str(cache),ARCHIVES=tuple(archives)),patch.object(w,'validate_state'),patch.object(w,'capacity',return_value=0),patch.object(w.os,'geteuid',return_value=0):
    with self.assertRaises(AssertionError):w.run(plan,pathlib.Path(d),True)
    self.assertTrue(all(pathlib.Path(x).exists()for x in archives));self.assertFalse((pathlib.Path(d)/'withdrawal.intent.private.json').exists())
unittest.main()
