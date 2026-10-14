import importlib.util,tempfile,json,tarfile,hashlib,io,unittest
from pathlib import Path
S=importlib.util.spec_from_file_location('restore',Path(__file__).with_name('restore-isolated.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class Restore(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.p=Path(self.t.name);self.a=self.p/'archive';self.i=self.p/'index';self.h=hashlib.sha256(b'historical').hexdigest();self.i.write_text(json.dumps({'objects':[{'sha256':self.h}],'originals':[{'path':'/original','sha256':self.h}]}))
  with tarfile.open(self.a,'w')as tar:
   q=tarfile.TarInfo('blobs/'+self.h);q.size=10;tar.addfile(q,io.BytesIO(b'historical'))
 def tearDown(self):self.t.cleanup()
 def run_restore(self):return m.run(self.a,self.i,m.digest(self.a),m.digest(self.i),self.p/'isolated')
 def test_exact_content(self):self.assertEqual(self.run_restore()['result'],'ISOLATED_EXTRACTION_PASS');self.assertEqual((self.p/'isolated'/self.h).read_bytes(),b'historical')
 def test_existing_root_denied(self):
  (self.p/'isolated').mkdir()
  with self.assertRaisesRegex(AssertionError,'exists'):self.run_restore()
 def test_wrong_archive_hash(self):
  with self.assertRaisesRegex(AssertionError,'hash_drift'):m.run(self.a,self.i,'bad',m.digest(self.i),self.p/'isolated')
 def test_traversal_denied(self):
  with tarfile.open(self.a,'w')as tar:tar.addfile(tarfile.TarInfo('../../escape'))
  with self.assertRaisesRegex(AssertionError,'membership'):self.run_restore()
 def test_symlink_denied(self):
  with tarfile.open(self.a,'w')as tar:
   q=tarfile.TarInfo('blobs/'+self.h);q.type=tarfile.SYMTYPE;q.linkname='/original';tar.addfile(q)
  with self.assertRaisesRegex(AssertionError,'type'):self.run_restore()
if __name__=='__main__':unittest.main()
