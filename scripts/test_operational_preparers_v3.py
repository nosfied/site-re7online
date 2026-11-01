import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

m = module('preparers_v3', HERE / 'operational_preparers_v3.py')
admission = module('deploy_preparation_admission', HERE / 'deploy-preparation-admission.py')
fixture_module = module('preparation_fixtures', HERE / 'test_operational_preparation_review.py')
NOW = datetime.datetime(2026, 10, 14, 12, tzinfo=datetime.timezone.utc)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_module.PreparationTests(); self.fixture.setUp()
        self.base = self.fixture.base
        self.parent = self.base / 'future'; self.parent.mkdir(mode=0o700)
        review = self.fixture.value(); review['state'] = 'READY'
        review['artifacts'][0]['reusePermitted'] = False
        review['artifacts'][0]['justification'] = 'independent test generation required'
        review['artifacts'][0]['newCopyAllocatedBytes'] = 16384
        review['budgets']['root']['stagingBytes'] = 131072
        review['budgets']['root']['evidenceBytes'] = 1048576
        for sample in review['capacitySamples']: sample['availableBytes'] = 10000000
        self.context = self.capture('context', {'atUtc': NOW.isoformat(), 'context': self.fixture.context})
        self.capacity = self.capture('capacity', {'atUtc': NOW.isoformat(), 'samples': review['capacitySamples']})
        saved = self.capture('saved', [{'name': 'api'}]); fallback = self.capture('fallback', [{'name': 'api'}])
        for original, source in [('/home/deploy/.pm2/dump.pm2', saved), ('/home/deploy/.pm2/dump.pm2.bak', fallback)]:
            review['referenceNodes'].append(original); review['referenceRoots'].append(original)
            review['referenceSources'].append(dict(source, path=original))
        self.value = {'review': review, 'captureBindings': {
            'contextObservation': dict(self.context, valuePointer='/context', timePointer='/atUtc'),
            'capacitySamples': dict(self.capacity, valuePointer='/samples', timePointer='/atUtc')},
            'maxCaptureAgeSeconds': 60, 'savedFallback': [dict(saved, role='saved'), dict(fallback, role='fallback')],
            'clockMode': 'synthetic-test', 'operations': [self.copy_operation()]}
        self.runners = {'copy': m.local_copy, 'tar': m.local_tar}

    def tearDown(self): self.fixture.tearDown()

    def capture(self, name, value):
        p = self.base / (name + '.private.json'); p.write_text(json.dumps(value)); p.chmod(0o600)
        return {'capturePath': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}

    def copy_operation(self):
        return {'kind': 'copy', 'name': 'copy-compiled', 'artifactIndex': 0,
                'allocatedBudgetBytes': 4096, 'reason': 'sealed new fixture generation',
                'source': str(self.fixture.artifact), 'sourceSha256': self.fixture.digest, 'target': 'package.bin'}

    def run_adapter(self, kind, value=None, runners=None):
        value = value or copy.deepcopy(self.value)
        if not value['review']['generation'].startswith('case-'):
            value['review']['generation'] = kind + '-future'
        artifacts = []
        for operation in value['operations']:
            if operation['kind'] not in ('copy', 'tar'):
                continue
            artifacts.append({
                'path': str(self.parent / value['review']['generation'] / operation['target']),
                'scope': kind + ':fixture', 'owner': 'fixture-owner',
                'budgetBytes': operation['allocatedBudgetBytes'], 'budgetInodes': 1,
                'protection': 'DERIVED_WITH_AUTHORITY',
                'authority': {'path': str(self.fixture.artifact),
                              'sha256': self.fixture.digest},
                'terminalDisposition': 'SANITIZE_AFTER_USE',
                'equivalenceSha256': hashlib.sha256(operation['target'].encode()).hexdigest(),
            })
        contract = {'schemaVersion': 1, 'generationId': value['review']['generation'],
                    'preparationArtifacts': artifacts}
        path = self.base / (value['review']['generation'] + '.preparation-contract.private.json')
        path.write_text(json.dumps(contract, sort_keys=True, separators=(',', ':')) + '\n')
        path.chmod(0o600)
        value['preparationArtifactContract'] = {
            'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        return getattr(m, 'prepare_' + kind)(value, self.parent, runners or self.runners, NOW)

    def test_api_real_copy_is_behind_gate_and_records_sidecars(self):
        result = self.run_adapter('api')
        gen = self.parent / 'api-future'
        self.assertEqual((gen / 'package.bin').read_bytes(), self.fixture.artifact.read_bytes())
        for name in ['before.private.json', 'gate-000.private.json', 'prepared.private.json']:
            self.assertEqual((gen / name).stat().st_mode & 0o777, 0o600)
        self.assertFalse(result['executionAuthorized'])
        lifecycle = json.loads((gen / 'preparation-artifacts.lifecycle.private.json').read_text())
        self.assertEqual(lifecycle['state'], 'OPEN')

    def test_frontend_existing_compiled_bytes_no_build(self):
        self.run_adapter('frontend')
        self.assertEqual((self.parent / 'frontend-future/package.bin').read_bytes(), self.fixture.artifact.read_bytes())
        self.assertFalse((self.parent / 'frontend-future/denial.private.json').exists())

    def test_each_adapter_denies_identity_before_copy(self):
        self.context_file = Path(self.context['capturePath'])
        capture = json.loads(self.context_file.read_text()); capture['context']['samples'][0]['processes']['api']['ticks'] += 1
        self.context_file.write_text(json.dumps(capture))
        value = copy.deepcopy(self.value)
        value['captureBindings']['contextObservation']['sha256'] = hashlib.sha256(self.context_file.read_bytes()).hexdigest()
        calls = []
        for kind in ['api', 'frontend']:
            with self.assertRaises(ValueError): self.run_adapter(kind, value, {'copy': lambda *a: calls.append(a)})
            self.assertFalse((self.parent / (kind + '-future')).exists())
            denial = json.loads((self.parent / (kind + '-future.denial.private.json')).read_text())
            self.assertTrue(denial['noArtifactMutation'])
        self.assertEqual(calls, [])

    def test_denial_before_copy_build_tar_hooks(self):
        calls = []
        for kind in ('copy', 'build', 'tar'):
            value = copy.deepcopy(self.value)
            value['review']['generation'] = 'case-' + kind
            value['operations'][0]['kind'] = kind
            value['review']['budgets']['root']['stagingBytes'] = 0
            with self.assertRaises(ValueError):
                self.run_adapter('api', value, {kind: lambda *a: calls.append(kind)})
        self.assertEqual(calls, [])

    def test_capture_missing_stale_hash_and_owner_deny(self):
        changes = ['missing', 'stale', 'hash', 'mode']
        for change in changes:
            value = copy.deepcopy(self.value)
            value['review']['generation'] = 'case-' + change
            if change == 'missing': del value['captureBindings']['capacitySamples']
            if change == 'stale': value['maxCaptureAgeSeconds'] = 1; when = NOW + datetime.timedelta(seconds=2)
            else: when = NOW
            if change == 'hash': value['captureBindings']['capacitySamples']['sha256'] = 'a' * 64
            if change == 'mode': Path(self.capacity['capturePath']).chmod(0o644)
            with self.assertRaises((ValueError, RuntimeError)):
                m.prepare_api(value, self.parent, self.runners, when)
            Path(self.capacity['capturePath']).chmod(0o600)
        self.assertFalse((self.parent / 'future-synthetic').exists())

    def test_saved_fallback_binding_missing_denies(self):
        value = copy.deepcopy(self.value)
        value['review']['referenceRoots'].remove('/home/deploy/.pm2/dump.pm2.bak')
        calls = []
        with self.assertRaises(ValueError): self.run_adapter('api', value, {'copy': lambda *a: calls.append(a)})
        self.assertEqual(calls, [])

    def test_sparse_source_dense_budget_denies_before_copy(self):
        with self.fixture.artifact.open('wb') as f: f.truncate(1048576)
        digest = hashlib.sha256(self.fixture.artifact.read_bytes()).hexdigest()
        value = copy.deepcopy(self.value)
        value['review']['artifacts'][0]['expected']['sha256'] = digest
        value['review']['artifacts'][0]['existing'][0]['sha256'] = digest
        value['operations'][0]['sourceSha256'] = digest
        calls = []
        with self.assertRaises(ValueError): self.run_adapter('frontend', value, {'copy': lambda *a: calls.append(a)})
        self.assertEqual(calls, [])

    def test_auth_missing_complete_and_failure_after_complete_denies(self):
        for rows in [[{'event': 'failure'}], [{'event': 'complete', 'guardGeneration': 38}, {'event': 'failure'}]]:
            value = self.closure_value('auth')
            journal = value['closure']['journal']; p = Path(journal['capturePath'])
            p.write_text(''.join(json.dumps(r) + '\n' for r in rows))
            journal['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
            with self.assertRaises(ValueError): m.close_auth(value, self.parent / 'bad.private.json', NOW)
        self.assertFalse((self.parent / 'bad.private.json').exists())

    def test_reuse_denies_copy_no_unnecessary_duplicate(self):
        value = copy.deepcopy(self.value); value['review']['artifacts'][0]['reusePermitted'] = True
        with self.assertRaises(ValueError): self.run_adapter('api', value)
        value['operations'] = []
        value['review']['generation'] = 'case-reuse-new'
        result = self.run_adapter('api', value)
        self.assertEqual(result['result'], 'LOCAL_PREPARED')
        self.assertFalse((self.parent / 'case-reuse-new/package.bin').exists())

    def test_drift_between_steps_stops_second_and_keeps_partial(self):
        value = copy.deepcopy(self.value)
        value['operations'].append(dict(value['operations'][0], name='second', target='second.bin'))
        calls = []
        def first(op, gen):
            m.local_copy(op, gen); calls.append(op['name'])
            Path(self.context['capturePath']).write_text('{}')
        with self.assertRaises(ValueError): self.run_adapter('frontend', value, {'copy': first})
        gen = self.parent / 'frontend-future'
        self.assertEqual(calls, ['copy-compiled'])
        self.assertTrue((gen / 'package.bin').exists()); self.assertTrue((gen / 'denial.private.json').exists())
        self.assertFalse((gen / 'second.bin').exists())
        self.assertEqual(json.loads((gen / 'preparation-artifacts.lifecycle.private.json').read_text())['state'],
                         'RETENTION_DEBT')
        with self.assertRaises(ValueError): self.run_adapter('frontend', value)

    def test_equivalent_open_preparation_blocks_only_same_scope(self):
        self.run_adapter('api')
        value = copy.deepcopy(self.value)
        value['review']['generation'] = 'case-equivalent'
        value['operations'][0]['target'] = 'package.bin'
        with self.assertRaisesRegex(ValueError, 'equivalent_preparation_pending'):
            self.run_adapter('api', value)
        value['review']['generation'] = 'case-other-scope'
        self.run_adapter('frontend', value)

    def test_lifecycle_closure_requires_absence_for_sanitized(self):
        self.run_adapter('api')
        path = self.parent / 'api-future/preparation-artifacts.lifecycle.private.json'
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'preparation_sanitized_artifact_present'):
            m.preparation_lifecycle.close_lifecycle(path, before, 'SANITIZED', 'a' * 64,
                                                    'owner', 'completed')
        (self.parent / 'api-future/package.bin').unlink()
        value = m.preparation_lifecycle.close_lifecycle(path, before, 'SANITIZED', 'a' * 64,
                                                        'owner', 'completed')
        self.assertEqual(value['state'], 'SANITIZED')

    def test_admission_materialization_producer_and_terminal_closure_transition(self):
        generation = 'api-future'
        artifact = {'path': str(self.parent / generation / 'package.bin'),
            'scope': 'api:integrated', 'owner': 'owner', 'budgetBytes': 4096,
            'budgetInodes': 1, 'protection': 'DERIVED_WITH_AUTHORITY',
            'authority': {'path': str(self.fixture.artifact), 'sha256': self.fixture.digest},
            'terminalDisposition': 'SANITIZE_AFTER_USE',
            'equivalenceSha256': hashlib.sha256(b'integrated').hexdigest()}
        admitted = self.base / 'admitted'
        controls = {}
        for role in ('generation-retirement', 'converta-release', 'root-policy'):
            source = self.base / (role + '.source'); source.write_text(role); source.chmod(0o644)
            raw = source.read_bytes(); controls[role] = (source, raw, hashlib.sha256(raw).hexdigest())
        request = {'schemaVersion': 2, 'generationId': generation, 'releaseId': 'release',
                   'targetCommit': '1' * 40, 'finalRoot': str(admitted),
                   'operationalStateOutputName': 'operational-state.private.json',
                   'preparationArtifacts': [artifact]}
        template = json.dumps({'schemaVersion': 2, 'controlPlaneArtifacts': []}).encode()
        template_path = self.base / 'template'; template_path.write_bytes(template); template_path.chmod(0o600)
        admission.materialize(request, controls, (template_path, template,
                                                   hashlib.sha256(template).hexdigest()))
        value = copy.deepcopy(self.value); value['review']['generation'] = generation
        contract = admitted / 'preparation-artifacts.contract.private.json'
        value['preparationArtifactContract'] = {
            'path': str(contract), 'sha256': hashlib.sha256(contract.read_bytes()).hexdigest()}
        m.prepare_api(value, self.parent, self.runners, NOW)
        lifecycle = self.parent / generation / 'preparation-artifacts.lifecycle.private.json'
        self.assertEqual(json.loads(lifecycle.read_text())['state'], 'OPEN')
        (self.parent / generation / 'package.bin').unlink()
        closed = m.preparation_lifecycle.close_lifecycle(
            lifecycle, hashlib.sha256(lifecycle.read_bytes()).hexdigest(), 'SANITIZED',
            'c' * 64, 'owner', 'downstream success')
        self.assertEqual(closed['state'], 'SANITIZED')

    def test_tar_actual_bytes_after_gate(self):
        value = copy.deepcopy(self.value)
        value['operations'].append({'kind': 'tar', 'name': 'pack', 'artifactIndex': 0,
            'allocatedBudgetBytes': 12288, 'reason': 'fixture archive contract', 'target': 'package.tar',
            'members': ['package.bin'], 'memberSha256': {'package.bin': self.fixture.digest}})
        self.run_adapter('frontend', value)
        with m.tarfile.open(self.parent / 'frontend-future/package.tar') as tar:
            self.assertEqual(tar.getnames(), ['package.bin'])
            self.assertEqual(tar.extractfile('package.bin').read(), self.fixture.artifact.read_bytes())

    def closure_value(self, kind):
        value = copy.deepcopy(self.value); value['review']['state'] = 'CONSUMED'
        archive = self.base / 'historical.tar'; archive.write_bytes(b'historical')
        value['review']['referenceNodes'].append(str(archive))
        value['review']['materials'].append({'path': str(archive), 'kind': 'package', 'custody': {
            'ownerAccessible': True, 'restoreVerified': True, 'locator': 'private offhost fixture',
            'indexSha256': 'b' * 64, 'contentSha256': 'c' * 64}})
        journal = self.base / 'journal.private.jsonl'
        journal.write_text(json.dumps({'event': 'complete', 'mode': 'switch', 'guardGeneration': 38, 'utc': NOW.isoformat()}) + '\n'); journal.chmod(0o600)
        phase = '/opt/re7online/backups/converta-persistent/preparations/' + value['review']['generation']
        value['closure'] = {'generationPath': phase, 'journal': {'capturePath': str(journal), 'sha256': hashlib.sha256(journal.read_bytes()).hexdigest(), 'originalPath': phase + '/window/sequencer.journal.jsonl'}}
        if kind == 'database':
            value['closure']['expectedPlanSha256'] = 'd' * 64
            value['closure']['databaseReceipt'] = self.capture('db-receipt', {'planSha256': 'd' * 64,
                'verification': {'result': 'VERIFIED', 'usesNewCredentials': True, 'oldCredentialReactivation': False}})
            value['closure']['databaseReceipt']['originalPath'] = phase + '/window/credential-commit.receipt.private.json'
        return value

    def test_auth_and_database_closure_classify_without_mutating_sources(self):
        before = self.fixture.artifact.read_bytes()
        for kind in ['auth', 'database']:
            value = self.closure_value(kind); out = self.parent / (kind + '.private.json')
            getattr(m, 'close_' + kind)(value, out, NOW)
            result = json.loads(out.read_text())
            self.assertEqual([x['classification'] for x in result['materials']], ['HOST_REQUIRED', 'ARCHIVABLE_FOR_REVIEW'])
            self.assertFalse(result['executionAuthorized'])
        self.assertEqual(self.fixture.artifact.read_bytes(), before)

    def test_database_uncertain_receipt_denies_closure(self):
        value = self.closure_value('database')
        receipt = value['closure']['databaseReceipt']
        p = Path(receipt['capturePath']); content = json.loads(p.read_text()); content['verification']['result'] = 'UNCERTAIN'
        p.write_text(json.dumps(content)); receipt['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
        out = self.parent / 'db.private.json'
        with self.assertRaises(ValueError): m.close_database(value, out, NOW)
        self.assertFalse(out.exists())

    def test_closure_dependency_receipt_and_source_missing_denied(self):
        value = self.closure_value('auth'); value['review']['referenceSources'] = []
        with self.assertRaises(ValueError): m.close_auth(value, self.parent / 'auth.private.json', NOW)
        self.assertFalse((self.parent / 'auth.private.json').exists())
        value = self.closure_value('auth')
        value['closure']['generationPath'] = '/opt/re7online/backups/converta-persistent/preparations/other-generation'
        with self.assertRaises(ValueError): m.close_auth(value, self.parent / 'auth.private.json', NOW)


if __name__ == '__main__': unittest.main()
