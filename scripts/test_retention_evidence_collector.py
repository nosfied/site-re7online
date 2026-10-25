import hashlib
import importlib.util
import fcntl
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
        self.writer_lock = self.root / 'source.writer.lock'
        self.writer_lock.write_bytes(b''); self.writer_lock.chmod(0o600)
        self.sha = hashlib.sha256(self.helper.read_bytes()).hexdigest()
        self.uid = os.geteuid(); self.gid = os.getegid()

    def tearDown(self): self.temp.cleanup()

    def contract(self, **overrides):
        values = dict(source_raw=str(self.source), custody_raw=str(self.custody),
                      destination_raw=str(self.destination), helper_raw=str(self.helper),
                      helper_sha=self.sha, source_writer_lock_raw=str(self.writer_lock),
                      executor_uid=self.uid, executor_gid=self.gid)
        values.update(overrides)
        return m.validate_contract(**values)

    def args(self, **overrides):
        values = dict(source_root=str(self.source), custody_root=str(self.custody),
            destination_root=str(self.destination), helper=str(self.helper),
            helper_sha256=self.sha, source_writer_lock=str(self.writer_lock),
            executor_uid=self.uid, executor_gid=self.gid,
            observation_seconds=30, max_hash_bytes=1024 * 1024)
        values.update(overrides)
        return type('Args', (), values)

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
        args = self.args(executor_uid=self.uid + 1)
        with patch.object(m.os, 'geteuid', return_value=self.uid):
            with self.assertRaisesRegex(ValueError, 'collector_executor_identity'):
                m.collect(args)
        self.assertFalse(self.destination.exists())

    def test_collection_preserves_source_and_writes_private_receipt(self):
        (self.source / 'evidence').write_text('preserved')
        result = m.collect(self.args())
        self.assertEqual(result['result'], 'PRESERVED')
        self.assertEqual((self.source / 'evidence').read_text(), 'preserved')
        self.assertEqual((self.destination / 'evidence').read_text(), 'preserved')
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o700)
        receipt = self.destination / 'collection-receipt.private.json'
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)

    def test_copy_failure_keeps_source_and_partial_destination(self):
        (self.source / 'a').write_text('a')
        def fail(*call_args, **kwargs):
            raise OSError('injected')
        with patch.object(m.shutil, 'copy2', side_effect=fail):
            with self.assertRaises(OSError): m.collect(self.args())
        self.assertEqual((self.source / 'a').read_text(), 'a')
        self.assertTrue(self.destination.exists())

    def test_busy_source_writer_lock_denies_before_copy(self):
        fd = os.open(self.writer_lock, os.O_RDWR | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with patch.object(m.shutil, 'copytree') as copy:
                with self.assertRaisesRegex(ValueError, 'source_writer_lock_busy'):
                    m.collect(self.args())
                copy.assert_not_called()
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)

    def test_late_file_during_second_source_index_denies_success_receipt(self):
        (self.source / 'a').write_text('a')
        (self.source / 'b').write_text('b')
        real = m.retention_report.stable_hash
        source_hashes = 0

        def mutate_during_hash(path, deadline, budget):
            nonlocal source_hashes
            if path.parent == self.source:
                source_hashes += 1
                if source_hashes == 3:
                    (self.source / 'late-exclusive').write_text('preserve me')
            return real(path, deadline, budget)

        with patch.object(m.retention_report, 'stable_hash', side_effect=mutate_during_hash):
            with self.assertRaisesRegex(ValueError, 'comparison_tree_drift:source_after'):
                m.collect(self.args())
        self.assertEqual((self.source / 'late-exclusive').read_text(), 'preserve me')
        self.assertTrue(self.destination.exists())
        self.assertFalse((self.destination / 'collection-receipt.private.json').exists())

    def test_fsync_failure_denies_and_preserves_source_and_partial_copy(self):
        (self.source / 'evidence').write_text('preserved')
        real = m.fsync_regular

        def fail_payload(path):
            if path == self.destination / 'evidence':
                raise OSError('injected_fsync_failure')
            return real(path)

        with patch.object(m, 'fsync_regular', side_effect=fail_payload):
            with self.assertRaisesRegex(OSError, 'injected_fsync_failure'):
                m.collect(self.args())
        self.assertEqual((self.source / 'evidence').read_text(), 'preserved')
        self.assertEqual((self.destination / 'evidence').read_text(), 'preserved')
        self.assertFalse((self.destination / 'collection-receipt.private.json').exists())

    def test_custody_fsync_failure_keeps_prepared_evidence_without_success_receipt(self):
        (self.source / 'evidence').write_text('preserved')
        real = m.fsync_directory

        def fail_custody(path):
            if path == self.custody:
                raise OSError('injected_custody_fsync_failure')
            return real(path)

        with patch.object(m, 'fsync_directory', side_effect=fail_custody):
            with self.assertRaisesRegex(OSError, 'injected_custody_fsync_failure'):
                m.collect(self.args())
        self.assertEqual((self.source / 'evidence').read_text(), 'preserved')
        self.assertEqual((self.destination / 'evidence').read_text(), 'preserved')
        self.assertFalse((self.destination / 'collection-receipt.private.json').exists())

    def test_source_change_during_durability_phase_denies_success_receipt(self):
        (self.source / 'evidence').write_text('preserved')
        real = m.fsync_copied_tree

        def mutate_after_sync(destination, custody):
            real(destination, custody)
            (self.source / 'late-during-fsync').write_text('preserve me')

        with patch.object(m, 'fsync_copied_tree', side_effect=mutate_after_sync):
            with self.assertRaisesRegex(ValueError,
                                        'comparison_tree_drift:source_before_success'):
                m.collect(self.args())
        self.assertTrue((self.source / 'late-during-fsync').exists())
        self.assertTrue(self.destination.exists())
        self.assertFalse((self.destination / 'collection-receipt.private.json').exists())

    def test_payload_and_directories_are_fsynced_before_success_receipt(self):
        (self.source / 'nested').mkdir()
        (self.source / 'nested' / 'evidence').write_text('preserved')
        events = []
        real_file, real_directory, real_rename = m.fsync_regular, m.fsync_directory, m.os.rename

        def record_file(path):
            events.append(('file', Path(path)))
            return real_file(path)

        def record_directory(path):
            events.append(('directory', Path(path)))
            return real_directory(path)

        def record_rename(source, destination):
            events.append(('rename', Path(source), Path(destination)))
            return real_rename(source, destination)

        with patch.object(m, 'fsync_regular', side_effect=record_file), \
                patch.object(m, 'fsync_directory', side_effect=record_directory), \
                patch.object(m.os, 'rename', side_effect=record_rename):
            m.collect(self.args())

        rename_position = next(i for i, event in enumerate(events) if event[0] == 'rename')
        self.assertEqual(rename_position, len(events) - 1)
        required = [
            ('file', self.destination / 'nested' / 'evidence'),
            ('directory', self.destination / 'nested'),
            ('directory', self.destination),
            ('directory', self.custody),
            ('file', self.destination / '.collection-receipt.private.json.prepared'),
        ]
        for event in required:
            self.assertIn(event, events[:rename_position])
        self.assertLess(events.index(required[0]), events.index(required[1]))
        self.assertLess(events.index(required[1]), events.index(required[2]))
        self.assertEqual(events[-4:], [
            ('file', self.destination / '.collection-receipt.private.json.prepared'),
            ('directory', self.destination),
            ('directory', self.custody),
            ('rename', self.destination / '.collection-receipt.private.json.prepared',
             self.destination / 'collection-receipt.private.json'),
        ])
        self.assertTrue((self.destination / 'collection-receipt.private.json').exists())

    def test_module_has_no_destructive_cleanup_calls(self):
        source = SCRIPT.read_text()
        for forbidden in ('rmtree(', '.unlink(', '.rmdir(', 'os.remove(', 'os.unlink('):
            self.assertNotIn(forbidden, source)


if __name__ == '__main__': unittest.main(verbosity=2)
