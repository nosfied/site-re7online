"""Only new composition interfaces: no functional suite or operation consumer run."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from verify_offline import verify
from compose_offline import compose
import compose_offline as composer
HERE = Path(__file__).resolve().parent
ROOT = HERE / 'prepared-kit'
PIN = hashlib.sha256((ROOT / 'COMPOSITION.json').read_bytes()).hexdigest()


class CompositionTests(unittest.TestCase):
    def test_exact_prepared_bytes_readonly(self):
        before = {str(f.relative_to(ROOT)): (f.stat().st_size, f.stat().st_mtime_ns) for f in ROOT.rglob('*') if f.is_file()}
        self.assertEqual(verify(ROOT, PIN)['result'], 'OFFLINE_COMPOSITION_INTEGRITY_PASS')
        after = {str(f.relative_to(ROOT)): (f.stat().st_size, f.stat().st_mtime_ns) for f in ROOT.rglob('*') if f.is_file()}
        self.assertEqual(before, after)
    def test_unbound_cannot_certify_operationally(self):
        with self.assertRaisesRegex(RuntimeError, 'OPERATIONAL_CERTIFICATION_DENIED'):
            verify(ROOT, PIN, True)
    def test_missing_or_wrong_manifest_pin(self):
        for value in ('', '0' * 64):
            with self.subTest(value=bool(value)), self.assertRaises(RuntimeError): verify(ROOT, value)
    def test_tampered_file_denies(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'kit'; shutil.copytree(ROOT, dest)
            (dest / 'code/window/recovery_bridge.py').write_text('# altered\n')
            with self.assertRaisesRegex(RuntimeError, 'offline_file_hash_drift'): verify(dest, PIN)
    def test_composer_refuses_existing_output_without_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'kit'; dest.mkdir(mode=0o700)
            with self.assertRaisesRegex(RuntimeError, 'new_output_required'): compose(dest)
            self.assertEqual(list(dest.iterdir()), [])
    def test_template_index_drift_denies_before_copy(self):
        original = composer.raw
        def changed(path):
            value = original(path)
            if Path(path).name == 'csv-operational-controls-v3.index.private.json':
                return value + b' '
            return value
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'new-kit'
            with patch.object(composer, 'raw', changed), self.assertRaisesRegex(RuntimeError, 'template_index_not_pinned_to_git_proof'):
                compose(dest)
            self.assertFalse(dest.exists())
    def test_invalid_parent_denies_before_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'kit'; original = Path.lstat
            def observe(path, *args, **kw):
                value = original(path, *args, **kw)
                if path == dest.parent:
                    import os
                    fields = list(value); fields[0] = (value.st_mode & ~0o777) | 0o775
                    return os.stat_result(fields)
                return value
            with patch.object(Path, 'lstat', observe), self.assertRaisesRegex(RuntimeError, 'private_output_parent'):
                compose(dest)
            self.assertFalse(dest.exists())


if __name__ == '__main__': unittest.main(verbosity=2)
