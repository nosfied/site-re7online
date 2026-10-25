import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('retention-evidence-collector.py')
spec = importlib.util.spec_from_file_location('collector', SCRIPT)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'; self.source.mkdir(mode=0o700)
        self.custody = self.root / 'custody'; self.custody.mkdir(mode=0o700)
        self.destination = self.custody / 'attempt-one'
        self.helper = self.root / 'helper.py'; self.helper.write_text('print("fixture")\n')
        self.helper.chmod(0o600)
        self.sha = hashlib.sha256(self.helper.read_bytes()).hexdigest()
        self.uid = os.geteuid(); self.gid = os.getegid()

    def tearDown(self): self.temp.cleanup()

    def contract(self, **overrides):
        values = dict(source_raw=str(self.source), custody_raw=str(self.custody),
                      destination_raw=str(self.destination), helper_raw=str(self.helper),
                      helper_sha=self.sha, executor_uid=self.uid, executor_gid=self.gid)
        values.update(overrides)
        return m.validate_contract(**values)

    def test_empty_and_broad_paths_are_denied_without_copy(self):
        cases = [
            {'source_raw': ''}, {'destination_raw': ''}, {'source_raw': '/tmp'},
            {'destination_raw': '/tmp'}, {'destination_raw': '/'},
            {'destination_raw': str(self.root / 'broad')},
        ]
        for values in cases:
            with self.subTest(values=values), patch.object(shutil, 'copytree') as copy:
                with self.assertRaises(ValueError): self.contract(**values)
                copy.assert_not_called()

    def test_helper_contract_is_fail_closed(self):
        self.helper.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'helper_owner_or_mode'): self.contract()
        self.helper.chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'helper_owner_or_mode'):
            m.validate_helper(self.helper, self.sha, self.uid + 1, self.gid)
        with self.assertRaisesRegex(ValueError, 'helper_sha256'): self.contract(helper_sha='0' * 64)
        with patch.object(m, 'executor_can_read', return_value=False):
            with self.assertRaisesRegex(ValueError, 'helper_not_readable_by_executor'): self.contract()

    def test_collection_cannot_run_as_another_executor(self):
        args = type('Args', (), dict(source_root=str(self.source), custody_root=str(self.custody),
            destination_root=str(self.destination), helper=str(self.helper), helper_sha256=self.sha,
            executor_uid=self.uid + 1, executor_gid=self.gid))
        with patch.object(m.os, 'geteuid', return_value=self.uid):
            with self.assertRaisesRegex(ValueError, 'collector_executor_identity'):
                m.collect(args)
        self.assertFalse(self.destination.exists())

    def test_collection_preserves_source_and_writes_private_receipt(self):
        (self.source / 'evidence').write_text('preserved')
        args = type('Args', (), dict(source_root=str(self.source), custody_root=str(self.custody),
            destination_root=str(self.destination), helper=str(self.helper), helper_sha256=self.sha,
            executor_uid=self.uid, executor_gid=self.gid))
        result = m.collect(args)
        self.assertEqual(result['result'], 'PRESERVED')
        self.assertEqual((self.source / 'evidence').read_text(), 'preserved')
        self.assertEqual((self.destination / 'evidence').read_text(), 'preserved')
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o700)
        receipt = self.destination / 'collection-receipt.private.json'
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)

    def test_copy_failure_keeps_source_and_partial_destination(self):
        (self.source / 'a').write_text('a')
        args = type('Args', (), dict(source_root=str(self.source), custody_root=str(self.custody),
            destination_root=str(self.destination), helper=str(self.helper), helper_sha256=self.sha,
            executor_uid=self.uid, executor_gid=self.gid))
        real = shutil.copy2
        def fail(*call_args, **kwargs):
            raise OSError('injected')
        with patch.object(m.shutil, 'copy2', side_effect=fail):
            with self.assertRaises(OSError): m.collect(args)
        self.assertEqual((self.source / 'a').read_text(), 'a')
        self.assertTrue(self.destination.exists())

    def test_module_has_no_destructive_cleanup_calls(self):
        source = SCRIPT.read_text()
        for forbidden in ('rmtree(', '.unlink(', '.rmdir(', 'os.remove(', 'os.unlink('):
            self.assertNotIn(forbidden, source)


if __name__ == '__main__': unittest.main(verbosity=2)
