"""Exercise the canonical producer function without running generation effects."""
import ast
import os
from pathlib import Path
import stat
import tempfile
import unittest

source=Path(__file__).with_name('prepare-generation.py')
tree=ast.parse(source.read_text())
function=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='ensure_receipts_directory')
namespace={'os':os,'stat':stat}
exec(compile(ast.Module(body=[function],type_ignores=[]),str(source),'exec'),namespace)
ensure=namespace['ensure_receipts_directory']

class ReceiptDirectory(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.path=self.root/'receipts-private'
 def tearDown(self):self.tmp.cleanup()
 def test_empty_generation_creates_owned_700(self):
  ensure(self.root);s=self.path.lstat();self.assertTrue(stat.S_ISDIR(s.st_mode));self.assertEqual(s.st_uid,os.geteuid());self.assertEqual(stat.S_IMODE(s.st_mode),0o700)
 def test_existing_valid_directory_and_receipt_preserved(self):
  self.path.mkdir(mode=0o700);r=self.path/'original.json';r.write_bytes(b'original receipt');before=self.path.stat();ensure(self.root);self.assertEqual(r.read_bytes(),b'original receipt');self.assertEqual(self.path.stat().st_ino,before.st_ino)
 def test_regular_file_denies_without_replacing(self):
  self.path.write_bytes(b'original');
  with self.assertRaisesRegex(RuntimeError,'not_directory'):ensure(self.root)
  self.assertEqual(self.path.read_bytes(),b'original')
 def test_symlink_to_valid_directory_denies(self):
  target=self.root/'target';target.mkdir(mode=0o700);self.path.symlink_to(target,target_is_directory=True)
  with self.assertRaisesRegex(RuntimeError,'not_directory'):ensure(self.root)
  self.assertTrue(self.path.is_symlink())
 def test_dangling_symlink_denies(self):
  self.path.symlink_to(self.root/'missing')
  with self.assertRaisesRegex(RuntimeError,'not_directory'):ensure(self.root)
  self.assertTrue(self.path.is_symlink())
 def test_wrong_owner_denies_without_chown(self):
  self.path.mkdir(mode=0o700);before=self.path.stat()
  with self.assertRaisesRegex(RuntimeError,'owner_drift'):ensure(self.root,expected_uid=os.geteuid()+1)
  self.assertEqual(self.path.stat().st_uid,before.st_uid)
 def test_wrong_modes_deny_without_chmod(self):
  for mode in [0o755,0o770,0o600]:
   self.path.mkdir(mode=0o700);self.path.chmod(mode)
   with self.assertRaisesRegex(RuntimeError,'mode_drift'):ensure(self.root)
   self.assertEqual(stat.S_IMODE(self.path.stat().st_mode),mode);self.path.chmod(0o700);self.path.rmdir()

if __name__=='__main__':unittest.main()
