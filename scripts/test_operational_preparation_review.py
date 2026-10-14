import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('preparation', Path(__file__).with_name('operational_preparation_review.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
H = 'a' * 64


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / 'artifacts'; self.root.mkdir()
        self.artifact = self.root / 'package'; self.artifact.write_bytes(b'validated bytes')
        self.digest = hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        self.source = self.base / 'source.private.json'
        self.source.write_text(json.dumps({'path': str(self.artifact)})); self.source.chmod(0o600)
        self.empty = self.base / 'empty.private.json'; self.empty.write_text('{}'); self.empty.chmod(0o600)
        self.deps = self.base / 'deps.private.json'; self.deps.write_text('{}'); self.deps.chmod(0o600)
        self.deps_sha = hashlib.sha256(self.deps.read_bytes()).hexdigest()
        expected = {'sha256': self.digest, 'runtime': 'Node20.20.0', 'dependenciesSha256': self.deps_sha, 'contract': 'no-new-links'}
        self.request = {'expected': expected, 'existing': [dict(expected, path=str(self.artifact), dependenciesCapturePath=str(self.deps))],
                        'reusePermitted': True, 'newCopyAllocatedBytes': 4096, 'newLinks': []}
        self.samples = [{'filesystem': 'root', 'executor': e, 'availableBytes': a, 'complete': True,
                         'freshForReview': True, 'walAndGrowthReviewed': True, 'writeErrors': 0,
                         'atUtc': '2026-10-14T10:00:00Z'} for e, a in [('deploy', 20000), ('postgres', 18000)]]
        self.budget = {'root': {'reserveSource': 'synthetic reviewed budget', 'phase': 'local fixture',
                      'canonicalReserveBytes': 5000, 'stagingBytes': 4096, 'returnBytes': 2000,
                      'backupBytes': 1000, 'walGrowthBytes': 1000, 'evidenceBytes': 1000,
                      'nonOverlappingRubrics': True}}
        self.processes = {'api': {'pid': 123, 'ticks': 45, 'configSha256': H, 'envSha256': H}}
        self.context = {'pm2CaptureUid': os.getuid(), 'samples': [
            {'complete': True, 'incomplete': [], 'processes': self.processes} for _ in range(2)]}
        self.expected_context = {'uid': os.getuid(), 'processes': self.processes}

    def tearDown(self):
        self.tmp.cleanup()

    def refs(self):
        return [{'path': '/opt/re7online/current.json', 'capturePath': str(self.source),
                 'sha256': hashlib.sha256(self.source.read_bytes()).hexdigest()},
                {'path': str(self.artifact), 'capturePath': str(self.empty),
                 'sha256': hashlib.sha256(self.empty.read_bytes()).hexdigest()}]

    def value(self):
        return {'localOnly': True, 'generation': 'future-synthetic', 'purpose': 'review only',
                'responsible': 'operational reviewer', 'owner': 'owner', 'state': 'CONSUMED',
                'lastReview': '2026-10-14', 'nextReview': '2026-10-21', 'artifacts': [self.request],
                'capacitySamples': self.samples, 'budgets': self.budget,
                'referenceNodes': ['/opt/re7online/current.json', str(self.artifact)],
                'referenceSources': self.refs(), 'referenceRoots': ['/opt/re7online/current.json'],
                'inventoryRoots': [str(self.root)], 'materials': [{'path': str(self.artifact), 'kind': 'package'}],
                'contextObservation': self.context, 'expectedContext': self.expected_context}

    def test_reuse_exact_hash_runtime_dependencies_contract(self):
        self.assertEqual(m.reuse_decision(self.request)['action'], 'REUSE')
        for field in ['runtime', 'dependenciesSha256', 'contract']:
            r = copy.deepcopy(self.request); r['existing'][0][field] = 'different'
            with self.assertRaises(ValueError): m.reuse_decision(r)

    def test_copy_requires_justification_and_link_review(self):
        r = copy.deepcopy(self.request); r['reusePermitted'] = False
        with self.assertRaises(ValueError): m.reuse_decision(r)
        r['justification'] = 'separate return required by contract'; r['newLinks'] = ['shared']
        with self.assertRaises(ValueError): m.reuse_decision(r)
        r['linkContractReviewed'] = True
        self.assertEqual(m.reuse_decision(r)['newCopyBytes'], 4096)

    def test_hash_drift_denies(self):
        self.artifact.write_text('drift')
        with self.assertRaises(ValueError): m.reuse_decision(self.request)

    def test_dependency_capture_hash_and_private_mode(self):
        self.deps.write_text('changed')
        with self.assertRaises(ValueError): m.reuse_decision(self.request)
        self.deps.write_text('{}'); self.deps.chmod(0o664)
        with self.assertRaises(ValueError): m.reuse_decision(self.request)

    def test_minimum_postgres_and_per_filesystem(self):
        self.assertEqual(m.capacity_review(self.samples, self.budget)[0]['minimumAvailableBytes'], 18000)
        self.samples[1]['availableBytes'] = 1
        with self.assertRaises(ValueError): m.capacity_review(self.samples, self.budget)
        self.samples[1]['filesystem'] = 'other'
        with self.assertRaises(ValueError): m.capacity_review(self.samples, self.budget)

    def test_wal_stale_incomplete_overlap_denied(self):
        for field, value in [('complete', False), ('freshForReview', False), ('walAndGrowthReviewed', False), ('writeErrors', 1)]:
            samples = copy.deepcopy(self.samples); samples[0][field] = value
            with self.assertRaises(ValueError): m.capacity_review(samples, self.budget)
        self.budget['root']['nonOverlappingRubrics'] = False
        with self.assertRaises(ValueError): m.capacity_review(self.samples, self.budget)

    def test_transitive_references_and_missing_source(self):
        refs = m.reference_review(self.value()['referenceNodes'], self.refs(), ['/opt/re7online/current.json'])
        self.assertIn(str(self.artifact), refs['protected'])
        with self.assertRaises(ValueError):
            m.reference_review(self.value()['referenceNodes'], self.refs()[:1], ['/opt/re7online/current.json'])

    def test_context_root_pm2_incomplete_identity_denied(self):
        for change in ('uid', 'incomplete', 'process'):
            c = copy.deepcopy(self.context)
            if change == 'uid': c['pm2CaptureUid'] += 1
            if change == 'incomplete': c['samples'][1]['incomplete'] = ['permission']
            if change == 'process': c['samples'][0]['processes']['api']['ticks'] += 1
            with self.assertRaises(ValueError): m.context_review(c, self.expected_context)

    def test_classification_keeps_consumed_dependency_and_evidence(self):
        materials = [{'path': 'launcher', 'kind': 'package'}, {'path': 'receipt', 'kind': 'receipt'},
                     {'path': 'archive', 'kind': 'package', 'custody': {'ownerAccessible': True,
                      'restoreVerified': True, 'indexSha256': H, 'contentSha256': H, 'locator': 'private offhost'}},
                     {'path': 'unknown', 'kind': 'package'}]
        states = m.classify('REFUSED', materials, ['launcher'])
        self.assertEqual([r['classification'] for r in states],
                         ['HOST_REQUIRED', 'HOST_REQUIRED', 'ARCHIVABLE_FOR_REVIEW', 'UNRESOLVED'])
        self.assertTrue(all(r['withdrawalAuthorized'] is False for r in states))

    def test_integrated_local_plan_and_weekly_review(self):
        value = self.value(); result = m.prepare(value)
        self.assertFalse(result['productionCertified']); self.assertFalse(result['executionAuthorized'])
        self.assertEqual(result['materials'][0]['classification'], 'HOST_REQUIRED')
        value['nextReview'] = '2026-10-22'
        with self.assertRaises(ValueError): m.prepare(value)

    def test_cli_sidecar_new_only_preserves_source_and_manifest(self):
        value = self.value(); input_path = self.base / 'input.private.json'
        input_path.write_text(json.dumps(value)); input_path.chmod(0o600)
        before = self.source.read_bytes(); artifact = self.artifact.read_bytes()
        out = self.base / 'sidecar.private.json'
        cmd = [sys.executable, m.__file__, '--input', str(input_path), '--input-sha256',
               hashlib.sha256(input_path.read_bytes()).hexdigest(), '--output', str(out), '--dry-run']
        r = subprocess.run(cmd, capture_output=True)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
        self.assertEqual(before, self.source.read_bytes()); self.assertEqual(artifact, self.artifact.read_bytes())


if __name__ == '__main__': unittest.main()
