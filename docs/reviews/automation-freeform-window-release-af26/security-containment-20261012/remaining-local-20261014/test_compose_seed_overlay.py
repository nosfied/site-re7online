import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('overlay',Path(__file__).with_name('compose_seed_overlay.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Gates(unittest.TestCase):
    def test_private_destination_denies_before_any_compiler_or_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'out';p.mkdir(mode=0o755)
            with patch.object(m.subprocess,'check_output') as command:
                with self.assertRaisesRegex(ValueError,'owner_mode'):m.run(Path(tmp),Path(tmp),p,'missing-node')
                command.assert_not_called();self.assertEqual(list(p.iterdir()),[])
            p.chmod(0o700)
            with patch.object(m.os,'getuid',return_value=-1):
                with self.assertRaisesRegex(ValueError,'owner_mode'):m.private_directory(p)
            link=Path(tmp)/'link';link.symlink_to(p)
            with self.assertRaisesRegex(ValueError,'symlink'):m.private_directory(link)

    def test_base_drift_denies_before_compiler_or_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'out';p.mkdir(mode=0o700)
            with patch.object(m.subprocess,'check_output') as command:
                with self.assertRaisesRegex(AssertionError,'compiled_drift'):m.run(Path(tmp),Path(tmp),p,'missing-node')
                command.assert_not_called();self.assertEqual(list(p.iterdir()),[])

if __name__=='__main__':unittest.main()
