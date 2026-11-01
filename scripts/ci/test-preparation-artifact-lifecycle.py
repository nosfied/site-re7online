import importlib.util
import json
import os
from pathlib import Path
import hashlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from types import SimpleNamespace

SCRIPT = Path(__file__).resolve().parents[1] / 'preparation_artifact_lifecycle.py'
spec = importlib.util.spec_from_file_location('preparation_lifecycle', SCRIPT)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.root.chmod(0o700)

    def tearDown(self): self.temp.cleanup()

    def artifact(self, scope='api:a', digest='a' * 64, budget=4096):
        return {'path': str(self.root / scope.replace(':', '-') / 'archive.tar'),
                'scope': scope, 'owner': 'owner', 'budgetBytes': budget,
                'budgetInodes': 1, 'protection': 'DERIVED_WITH_AUTHORITY',
                'authority': {'path': str(self.root / 'authority'), 'sha256': 'b' * 64},
                'terminalDisposition': 'SANITIZE_AFTER_USE', 'equivalenceSha256': digest}

    def write_lifecycle(self, name, state, artifact):
        directory = self.root / name; directory.mkdir()
        path = directory / 'preparation-artifacts.lifecycle.private.json'
        path.write_bytes(m.canonical({'schemaVersion': 1, 'generationId': name,
                                      'state': state, 'event': 'fixture',
                                      'preparationArtifacts': [artifact]}))
        path.chmod(0o600)

    def test_same_scope_equivalent_pending_denies_but_other_scope_does_not(self):
        self.write_lifecycle('old', 'OPEN', self.artifact())
        with self.assertRaisesRegex(ValueError, 'equivalent_preparation_pending'):
            m.validate_existing_lifecycles(self.root, {'preparationArtifacts': [self.artifact()]})
        result = m.validate_existing_lifecycles(
            self.root, {'preparationArtifacts': [self.artifact(scope='frontend:b')]})
        self.assertGreaterEqual(result['reservedBytes'], 4096)

    def test_terminal_sanitized_does_not_reserve_or_block(self):
        self.write_lifecycle('old', 'SANITIZED', self.artifact())
        result = m.validate_existing_lifecycles(self.root,
            {'preparationArtifacts': [self.artifact()]})
        self.assertEqual(result['reservedBytes'], 0)

    def test_shared_capacity_denies_before_allocation(self):
        constrained = SimpleNamespace(f_bavail=0, f_frsize=4096, f_favail=100)
        with mock.patch.object(m.os, 'statvfs', return_value=constrained):
            with self.assertRaisesRegex(ValueError, 'preparation_shared_capacity_bytes'):
                m.validate_existing_lifecycles(self.root,
                    {'preparationArtifacts': [self.artifact(budget=4096)]})

    def test_historical_without_lifecycle_is_not_invented_as_sanitized(self):
        (self.root / 'legacy').mkdir()
        result = m.validate_existing_lifecycles(self.root,
            {'preparationArtifacts': [self.artifact(scope='other')]})
        self.assertEqual(result['reservedBytes'], 0)
        self.assertFalse((self.root / 'legacy/preparation-artifacts.lifecycle.private.json').exists())

    def test_generation_retirement_records_terminal_review_without_cleanup(self):
        artifact = self.artifact(); target = Path(artifact['path'])
        target.parent.mkdir(); target.write_bytes(b'residue')
        lifecycle = target.parent / 'preparation-artifacts.lifecycle.private.json'
        lifecycle.write_bytes(m.canonical({'schemaVersion': 1, 'generationId': 'fixture',
            'state': 'OPEN', 'event': 'CREATION_STARTED', 'preparationArtifacts': [artifact]}))
        lifecycle.chmod(0o600)
        evidence = self.root / 'evidence.private.json'; evidence.write_text('{}\n'); evidence.chmod(0o600)
        result = subprocess.run([sys.executable, '-B', str(SCRIPT.parent / 'generation-retirement.py'),
            'review-preparation', '--preparation-lifecycle', str(lifecycle),
            '--preparation-lifecycle-sha256', hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
            '--evidence', str(evidence), '--evidence-sha256', hashlib.sha256(evidence.read_bytes()).hexdigest(),
            '--state', 'RETENTION_DEBT', '--reviewer', 'owner', '--reason', 'interrupted fixture'],
            capture_output=True, text=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(target.exists())
        self.assertEqual(json.loads(lifecycle.read_text())['state'], 'RETENTION_DEBT')


if __name__ == '__main__': unittest.main()
