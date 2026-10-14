import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retention', Path(__file__).with_name('operational-retention-report.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / 'inventory'
        self.root.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_hardlinks_and_overlapping_roots_count_once(self):
        a = self.root / 'a'; a.write_bytes(b'a' * 4096)
        os.link(a, self.root / 'b')
        report = m.inventory([self.root, self.root])
        self.assertEqual(report['uniqueAllocatedBytes'], self.root.stat().st_blocks * 512 + a.stat().st_blocks * 512)
        self.assertEqual(report['externalHardlinks'], [])
        self.assertIsNone(report['recoverableBytes'])

    def test_external_hardlink_not_recoverable(self):
        a = self.root / 'a'; a.write_text('keep')
        os.link(a, self.base / 'kept')
        self.assertEqual(len(m.inventory([self.root])['externalHardlinks']), 1)

    def test_external_symlink_not_traversed(self):
        target = self.base / 'outside'; target.mkdir(); (target / 'secret').write_text('never read')
        (self.root / 'link').symlink_to(target)
        report = m.inventory([self.root])
        self.assertEqual(report['entries'], 2)
        self.assertFalse(report['symlinks'][0]['destinationTraversed'])

    def test_symlink_root_denied(self):
        link = self.base / 'link'; link.symlink_to(self.root)
        with self.assertRaises(ValueError):
            m.inventory([link])

    def test_limit_is_incomplete(self):
        (self.root / 'a').touch()
        self.assertFalse(m.inventory([self.root], max_entries=1)['metadataCompleteWithinBudget'])

    def test_permission_error_is_incomplete(self):
        with patch.object(m.os, 'scandir', side_effect=PermissionError(13, 'denied')):
            report = m.inventory([self.root])
        self.assertFalse(report['metadataCompleteWithinBudget'])
        self.assertEqual(report['errors'][0]['errno'], 13)
        self.assertFalse(report['withdrawalAuthorized'])

    def test_directory_identity_drift_is_incomplete(self):
        original = m.os.fstat
        def changed(fd):
            v = list(original(fd)); v[1] += 1
            return os.stat_result(v)
        with patch.object(m.os, 'fstat', side_effect=changed):
            report = m.inventory([self.root])
        self.assertFalse(report['metadataCompleteWithinBudget'])

    def test_same_size_is_only_candidate(self):
        for name in ('a', 'b'):
            (self.root / name).write_bytes(name.encode() * 1048576)
        report = m.inventory([self.root])
        self.assertEqual(len(report['reviewCandidates']), 1)
        self.assertFalse(report['reviewCandidates'][0]['withdrawalEligible'])
        self.assertIsNone(report['capacityPass'])

    def test_cli_preserves_existing_report_and_sources(self):
        (self.root / 'source').write_text('kept')
        out = self.base / 'report.json'
        command = [sys.executable, str(Path(m.__file__)), '--root', str(self.root), '--output', str(out), '--dry-run']
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
        before = out.read_bytes()
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertEqual(out.read_bytes(), before)
        self.assertEqual((self.root / 'source').read_text(), 'kept')


if __name__ == '__main__':
    unittest.main()
