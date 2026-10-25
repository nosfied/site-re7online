import importlib.util
import json
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

    def test_tree_comparison_proves_content_types_modes_and_symlinks(self):
        left = self.root / 'left'; right = self.root / 'right'
        left.mkdir(); right.mkdir()
        for root in (left, right):
            (root / 'dir').mkdir(mode=0o755)
            (root / 'dir/file').write_bytes(b'payload')
            (root / 'dir/file').chmod(0o640)
            (root / 'link').symlink_to('dir/file')
        result = m.compare_trees(left, right)
        self.assertTrue(result['contentAndMetadataEquivalent'])
        self.assertEqual(result['sourceDigest'], result['destinationDigest'])
        self.assertFalse(result['withdrawalEligible'])
        (right / 'dir/file').chmod(0o600)
        changed = m.compare_trees(left, right)
        self.assertFalse(changed['contentAndMetadataEquivalent'])
        self.assertEqual(changed['changedCount'], 1)
        self.assertTrue(changed['sourceContentContainedInDestination'])
        self.assertEqual(changed['differenceCountsByAttribute']['mode'], 1)

    def test_tree_comparison_detects_unique_and_changed_content(self):
        left = self.root / 'source'; right = self.root / 'destination'
        left.mkdir(); right.mkdir()
        (left / 'same-name').write_text('left')
        (right / 'same-name').write_text('right')
        (left / 'source-only').touch()
        (right / 'destination-only').touch()
        result = m.compare_trees(left, right)
        self.assertEqual(result['sourceOnlyCount'], 1)
        self.assertEqual(result['destinationOnlyCount'], 1)
        self.assertEqual(result['changedCount'], 1)
        self.assertFalse(result['sourceContentContainedInDestination'])

    def test_tree_comparison_includes_root_metadata(self):
        left = self.root / 'root-left'; right = self.root / 'root-right'
        left.mkdir(mode=0o700); right.mkdir(mode=0o755)
        left.chmod(0o700); right.chmod(0o755)
        result = m.compare_trees(left, right)
        self.assertFalse(result['contentAndMetadataEquivalent'])
        self.assertEqual(result['sourceEntries'], 1)
        self.assertEqual(result['destinationEntries'], 1)
        self.assertEqual(result['changedCount'], 1)
        self.assertEqual(result['firstDifferences']['changed'], ['.'])
        self.assertEqual(result['differenceCountsByAttribute']['mode'], 1)

    def test_addition_after_enumeration_during_another_hash_denies_proof(self):
        left = self.root / 'late-left'; right = self.root / 'late-right'
        left.mkdir(); right.mkdir()
        for root in (left, right):
            (root / 'a').write_text('a')
            (root / 'b').write_text('b')
        original = m.stable_hash
        changed = False

        def mutate(path, deadline, budget):
            nonlocal changed
            digest = original(path, deadline, budget)
            if path == left / 'a' and not changed:
                changed = True
                (left / 'late').write_text('late')
            return digest

        with patch.object(m, 'stable_hash', side_effect=mutate):
            with self.assertRaisesRegex(ValueError, 'comparison_tree_drift:source'):
                m.compare_trees(left, right)

    def test_source_mutations_while_destination_is_examined_deny_proof(self):
        actions = ('add', 'remove', 'replace', 'rename')
        for action in actions:
            with self.subTest(action=action):
                left = self.root / f'{action}-left'; right = self.root / f'{action}-right'
                left.mkdir(); right.mkdir()
                for root in (left, right):
                    (root / 'a').write_text('a')
                    (root / 'b').write_text('b')
                original = m.stable_hash
                changed = False

                def mutate(path, deadline, budget):
                    nonlocal changed
                    digest = original(path, deadline, budget)
                    if path == right / 'a' and not changed:
                        changed = True
                        if action == 'add':
                            (left / 'c').write_text('c')
                        elif action == 'remove':
                            (left / 'b').unlink()
                        elif action == 'replace':
                            replacement = self.base / f'{action}-replacement'
                            replacement.write_text('b')
                            os.replace(replacement, left / 'b')
                        else:
                            (left / 'b').rename(left / 'c')
                    return digest

                with patch.object(m, 'stable_hash', side_effect=mutate):
                    with self.assertRaisesRegex(ValueError, 'comparison_tree_drift:source'):
                        m.compare_trees(left, right)

    def test_generation_catalog_reports_pending_space(self):
        generation = self.root / 'generation'; generation.mkdir()
        (generation / 'payload').write_bytes(b'x' * 4096)
        report = m.inventory([self.root])
        catalog = {
            'schemaVersion': 1,
            'generations': [{
                'generationId': 'generation-one',
                'state': 'SUPERSEDED',
                'roots': [str(generation)],
                'operationalReferences': [],
                'custodyState': 'NOT_PROVEN',
            }],
        }
        summary = m.generation_summary(report, catalog)
        self.assertTrue(summary['items'][0]['dispositionPending'])
        self.assertGreater(summary['pendingAllocatedBytes'], 0)

    def test_generation_catalog_is_closed(self):
        report = m.inventory([self.root])
        bad = {'schemaVersion': 1, 'generations': [{
            'generationId': 'bad', 'state': 'FAILED', 'roots': [str(self.root)],
            'operationalReferences': [], 'custodyState': 'NOT_PROVEN', 'extra': True,
        }]}
        with self.assertRaises(ValueError):
            m.generation_summary(report, bad)

    def test_generation_catalog_rejects_relative_or_uninventoried_root(self):
        report = m.inventory([self.root])
        base = {
            'schemaVersion': 1,
            'generations': [{
                'generationId': 'bad-root', 'state': 'FAILED', 'roots': ['relative'],
                'operationalReferences': [], 'custodyState': 'NOT_PROVEN',
            }],
        }
        with self.assertRaises(ValueError):
            m.generation_summary(report, base)
        outside = self.base / 'outside'; outside.mkdir()
        base['generations'][0]['roots'] = [str(outside)]
        with self.assertRaises(ValueError):
            m.generation_summary(report, base)

    def test_private_catalog_requires_mode_0600(self):
        path = self.base / 'catalog.json'
        path.write_text(json.dumps({'schemaVersion': 1, 'generations': []}))
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            m.read_private_json(path)

    def test_bad_output_mode_denied_before_capture(self):
        outdir = self.base / 'public'; outdir.mkdir(mode=0o755)
        with patch.object(sys, 'argv', ['report', '--root', str(self.root),
                         '--output', str(outdir / 'new.json'), '--dry-run']), \
             patch.object(m, 'inventory') as capture:
            with self.assertRaises(ValueError):
                m.main()
            capture.assert_not_called()
        self.assertEqual(list(outdir.iterdir()), [])

    def test_wrong_owner_denied_before_capture(self):
        with patch.object(sys, 'argv', ['report', '--root', str(self.root),
                         '--output', str(self.base / 'new.json'), '--dry-run']), \
             patch.object(m.os, 'geteuid', return_value=os.geteuid() + 1), \
             patch.object(m, 'inventory') as capture:
            with self.assertRaises(ValueError):
                m.main()
            capture.assert_not_called()
        self.assertFalse((self.base / 'new.json').exists())

    def test_output_owner_mismatch_denied(self):
        with self.assertRaises(ValueError):
            m.private_output_directory(self.base, expected_uid=os.geteuid() + 1)

    def test_output_symlink_denied(self):
        link = self.base / 'link'; link.symlink_to(self.root)
        with self.assertRaises(ValueError):
            m.private_output_directory(link)

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
