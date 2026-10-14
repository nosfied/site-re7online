import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('complete_runtime',Path(__file__).with_name('prepare_complete_runtime.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BeforeCopy(unittest.TestCase):
    def test_missing_private_capture_denies_before_copy_or_compiler(self):
        with tempfile.TemporaryDirectory()as tmp:
            p=Path(tmp);out=p/'out';out.mkdir(mode=0o700)
            with patch.object(m.subprocess,'check_output')as compiler:
                with self.assertRaises(FileNotFoundError):m.prepare(p/'missing',p/'base',p/'overlay',out,'a'*64,'b'*64)
                compiler.assert_not_called();self.assertEqual(list(out.iterdir()),[])
    def test_inappropriate_output_denies_before_capture(self):
        with tempfile.TemporaryDirectory()as tmp:
            p=Path(tmp);out=p/'out';out.mkdir(mode=0o755)
            with patch.object(m,'read')as capture:
                with self.assertRaises(ValueError):m.prepare(p/'missing',p/'base',p/'overlay',out,'a'*64,'b'*64)
                capture.assert_not_called();self.assertEqual(list(out.iterdir()),[])

if __name__=='__main__':unittest.main()
