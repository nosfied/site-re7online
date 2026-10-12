import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from saved_reference_capture import capture_pair


class SavedCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sources = [self.root / 'saved', self.root / 'fallback']
        self.targets = [self.root / 'captured-saved', self.root / 'captured-fallback']
        for p in self.sources:
            p.write_bytes(b'current actual bytes'); p.chmod(0o600)

    def test_actual_bytes_not_inherited_and_no_overwrite(self):
        capture_pair(self.sources, self.targets)
        self.assertEqual(self.targets[0].read_bytes(), b'current actual bytes')
        with self.assertRaisesRegex(RuntimeError, 'destination_exists'):
            capture_pair(self.sources, self.targets)

    def test_symlink_permissions_owner_and_type_deny_before_output(self):
        self.sources[0].chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'permissions'):
            capture_pair(self.sources, self.targets)
        self.sources[0].chmod(0o600)
        with patch('saved_reference_capture.os.getuid', return_value=-1):
            with self.assertRaisesRegex(RuntimeError, 'type_or_owner'):
                capture_pair(self.sources, self.targets)
        self.sources[0].unlink(); self.sources[0].symlink_to(self.sources[1])
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            capture_pair(self.sources, self.targets)
        self.sources[0].unlink(); self.sources[0].mkdir()
        with self.assertRaisesRegex(RuntimeError, 'type_or_owner'):
            capture_pair(self.sources, self.targets)
        self.assertFalse(self.targets[0].exists())

    def test_inconsistent_samples_deny(self):
        with patch('saved_reference_capture.observe', side_effect=[(b'a', (1,)), (b'b', (2,)), (b'c', (1,)), (b'b', (2,))]):
            with self.assertRaisesRegex(RuntimeError, 'observations_changed'):
                capture_pair(self.sources, self.targets)
        self.assertFalse(self.targets[0].exists())


if __name__ == '__main__':
    unittest.main()
