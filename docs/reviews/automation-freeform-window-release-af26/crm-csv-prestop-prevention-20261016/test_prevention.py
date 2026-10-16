"""Focused local tests. Real consumer sources; no operational entrypoint run.

Only host ancestors outside fixtures, unrelated CLI authorities and OS effects
are modeled. Files/links/JSON inside fixtures and the shared predicates are real.
"""
import datetime
import hashlib
import importlib.util
import json
import os
import stat
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
REVIEW = HERE.parent
from source_inputs import read_source

# Reject any accidental fallback to private evidence during this suite.
def deny_private_evidence(event, args):
    if event == 'open' and args and 'local-evidence' in str(args[0]):
        raise AssertionError('private_evidence_access_forbidden')
sys.addaudithook(deny_private_evidence)
sys.path.insert(0, str(HERE))
import prestop_contract as contract
import future_sources


def load(name, source):
    module = types.ModuleType(name)
    exec(compile(source, name, 'exec'), module.__dict__)
    return module


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


class Fixture:
    def __init__(self, base, event_mode=0o700):
        self.root = base / 'candidate'
        self.root.mkdir(mode=0o700)
        self.window = self.root / 'window'
        self.window.mkdir(mode=0o700)
        self.event = base / 'event'
        self.event.mkdir(mode=0o700)
        self.parents = self.event / 'events'
        # Permissions set only on creation of synthetic objects; no chmod/repair.
        mask = os.umask(0)
        try:
            self.parents.mkdir(mode=event_mode)
        finally:
            os.umask(mask)
        self.target = self.parents / 'eventRetentionPolicy.ts'
        self.bytes(self.target, b'previous policy\n')
        self.apps = []
        self.bindings = {}
        for name in ('api-source', 'api-target', 'worker', 'front'):
            app = base / name
            app.mkdir(mode=0o700)
            script = app / 'index.js'
            self.bytes(script, b'// synthetic entrypoint\n')
            role = 're7-whatsapp-agent' if name.startswith('api') else ('re7-whatsapp-web-worker' if name == 'worker' else 're7-admin-front')
            self.apps.append({'name': role, 'cwd': str(app), 'script': str(script),
                              'interpreter': '/synthetic/node', 'env': {'SYNTHETIC': 'true'}, 'watch': False})
            if name != 'front':
                data = base / (name + '-data')
                data.mkdir(mode=0o700)
                (app / '.data').symlink_to(data, target_is_directory=True)
                self.bindings[str(app / '.data')] = str(data)
        self.source = {'apps': [self.apps[0], self.apps[2], self.apps[3]]}
        self.target_profile = {'apps': [self.apps[1], self.apps[2], self.apps[3]]}
        for mode in contract.MODES:
            d = self.root / mode
            d.mkdir(mode=0o700)
            for n, value in [('return.config.private.json', self.source),
                             ('candidate.config.private.json', self.target_profile)]:
                self.json(d / n, value)
        self.binding_file = self.window / 'path-bindings.private.json'
        self.json(self.binding_file, self.bindings)
        self.json(self.window / 'event-consumer-binding.private.json', {'path': str(self.target)})
        self.bytes(self.root / 'preparation-review.sha256', b'synthetic review\n')
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.json(self.window / 'csv-admission.receipt.private.json', {
            'result': 'FIVE_GATES_ADMITTED', 'reviewSha256': sha(self.root / 'preparation-review.sha256'),
            'rootCapturedUtc': now, 'backupCapturedUtc': now})

    @staticmethod
    def bytes(path, raw):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)

    @classmethod
    def json(cls, path, value):
        cls.bytes(path, json.dumps(value).encode())

    def config(self):
        return {a['name']: a for a in self.source['apps']}


class LocalFS(contract.Filesystem):
    def __init__(self, base):
        self.base = base
        self.unreadable = None
        self.unreadable_bytes = None
        self.parent_race = False

    def lstat(self, path):
        path = Path(path)
        if path == self.unreadable:
            raise PermissionError('synthetic EACCES')
        result = super().lstat(path)
        if path != self.base and self.base not in path.parents:
            # The real host uses775/1777 outside the fixture. Model trusted host
            # ancestors; never modify their permissions or skip fixture parents.
            return types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o755)
        if self.parent_race and path.name == 'events':
            return types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o775)
        return result



class PreventionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ops_source = read_source('operations_bindings_original.py')
        cls.event_source = read_source('event_overlay.py')
        cls.cli_source = read_source('csv_cli.py')
        cls.original_ops = load('unchanged_operations_excerpt', cls.ops_source)
        cls.ops = load('future_real_operations', future_sources.operations(cls.ops_source))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.fx = Fixture(self.base)
        self.fs = LocalFS(self.base)
        self.literal = patch.object(contract, 'EVENT_SOURCE', str(self.fx.target))
        self.literal.start()
        self.fs_patch = patch.object(contract.FS, 'lstat', self.fs.lstat)
        self.fs_patch.start()

    def tearDown(self):
        self.fs_patch.stop()
        self.literal.stop()
        self.tmp.cleanup()

    def deny(self, reason, call=None):
        with self.assertRaisesRegex(contract.ContractDeny, reason):
            (call or (lambda: contract.validate_pre_stop(self.fx.root)))()

    def test_exact_original_body_and_require(self):
        import ast
        original = ast.parse(self.ops_source)
        cls = next(n for n in original.body if isinstance(n, ast.ClassDef))
        shared = ast.parse((HERE / 'prestop_contract.py').read_text())
        fn = next(n for n in shared.body if isinstance(n, ast.FunctionDef) and n.name == 'path_bindings')
        # Ignore only the new explanatory docstring; statements are unchanged.
        self.assertEqual([ast.dump(n) for n in cls.body[0].body], [ast.dump(n) for n in fn.body[1:]])
        old_require = next(n for n in original.body if isinstance(n, ast.FunctionDef))
        new_require = next(n for n in shared.body if isinstance(n, ast.FunctionDef) and n.name == 'require')
        self.assertEqual(ast.dump(old_require), ast.dump(new_require))

    def test_equivalence_matrix(self):
        cases = ('valid', 'missing_file', 'invalid_json', 'list_map', 'missing_cwd',
                 'missing_script', 'wrong_target', 'plain_data_with_reference',
                 'unlisted_data', 'false_reference', 'extra_reference',
                 'duplicate_json_key', 'symlink_binding_file', 'script_outside_cwd',
                 'symlink_script', 'symlink_cwd', 'relative_cwd_script',
                 'binding_target_alias', 'noncanonical_path', 'empty_config',
                 'single_app_subset', 'directory_binding_file', 'read_error',
                 'path_read_error', 'binding_mode644', 'hardlinked_binding',
                 'missing_name_field', 'readable_missing_data_target')
        results = []
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as folder:
                fx = Fixture(Path(folder)); config = fx.config()
                app = config['re7-whatsapp-agent']; data = Path(app['cwd']) / '.data'
                def save(v): fx.binding_file.write_text(json.dumps(v))
                if case == 'missing_file': fx.binding_file.unlink()
                elif case == 'invalid_json': fx.binding_file.write_text('{')
                elif case == 'list_map': save([])
                elif case == 'missing_cwd': app['cwd'] += '-absent'
                elif case == 'missing_script': app['script'] += '-absent'
                elif case == 'wrong_target': save({str(data): str(fx.root)})
                elif case == 'plain_data_with_reference': data.unlink(); data.mkdir()
                elif case == 'unlisted_data': save({}); data.unlink(); data.mkdir()
                elif case == 'false_reference': save({str(data): ''})
                elif case == 'extra_reference': save({**fx.bindings, '/unrelated/.data': '/not-present'})
                elif case == 'duplicate_json_key': fx.binding_file.write_text('{"unused":1,"unused":2}')
                elif case == 'symlink_binding_file':
                    old = fx.binding_file.with_suffix('.original'); fx.binding_file.rename(old); fx.binding_file.symlink_to(old)
                elif case == 'script_outside_cwd': app['script'] = fx.apps[2]['script']
                elif case == 'symlink_script':
                    link = Path(app['cwd']) / 'alias.js'; link.symlink_to(app['script']); app['script'] = str(link)
                elif case == 'symlink_cwd':
                    link = Path(folder) / 'cwd-alias'; link.symlink_to(app['cwd']); app['cwd'] = str(link); save({})
                elif case == 'relative_cwd_script':
                    app['cwd'] = Path(app['cwd']).name; app['script'] = app['cwd'] + '/index.js'; save({})
                elif case == 'binding_target_alias':
                    alias = Path(folder) / 'alias'; alias.symlink_to(fx.bindings[str(data)]); save({str(data): str(alias)})
                elif case == 'noncanonical_path': app['script'] = app['cwd'] + '/./index.js'
                elif case == 'empty_config': config = {}
                elif case == 'single_app_subset': save({str(data): fx.bindings[str(data)], '/unrelated/.data': '/absent'}); config = {app['name']: app}
                elif case == 'directory_binding_file': fx.binding_file.unlink(); fx.binding_file.mkdir()
                elif case == 'binding_mode644':
                    fx.binding_file.unlink(); mask = os.umask(0)
                    try:
                        fd = os.open(fx.binding_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
                        with os.fdopen(fd, 'w') as f: json.dump(fx.bindings, f)
                    finally: os.umask(mask)
                elif case == 'hardlinked_binding': os.link(fx.binding_file, fx.window / 'other-link')
                elif case == 'missing_name_field': app.pop('name')
                elif case == 'readable_missing_data_target':
                    dest = Path(fx.bindings[str(data)]); dest.rmdir()
                previous = Path.cwd(); os.chdir(folder)
                original_read = Path.read_text; original_is_dir = Path.is_dir
                def read(path, *a, **k):
                    if case == 'read_error' and path == fx.binding_file: raise PermissionError('synthetic EACCES')
                    return original_read(path, *a, **k)
                def is_dir(path):
                    if case == 'path_read_error' and str(path) == app['cwd']: raise PermissionError('synthetic path EACCES')
                    return original_is_dir(path)
                def outcome(call):
                    try: return ('ACCEPT', call())
                    except Exception as e: return ('DENY', type(e).__name__, str(e))
                try:
                    with patch.object(Path, 'read_text', read), patch.object(Path, 'is_dir', is_dir):
                        old = outcome(lambda: self.original_ops.System().validate_bindings(fx.window, config))
                        shared = outcome(lambda: contract.path_bindings(fx.window, config))
                        final = outcome(lambda: self.ops.System().validate_bindings(fx.window, config))
                finally: os.chdir(previous)
                self.assertEqual(old, shared); self.assertEqual(old, final)
                if old[0] == 'ACCEPT': self.assertIsNone(old[1])
                results.append({'case': case, 'outcome': old[0], 'result': None if old[0]=='ACCEPT' else old[1]})
        self.__class__.matrix_results = results

    def test_valid_all_eight_profiles_and_real_operations(self):
        self.assertEqual(contract.validate_pre_stop(self.fx.root)['profiles'], 8)
        self.assertIsNone(self.ops.System().validate_bindings(self.fx.window, self.fx.config()))

    def test_real_775_parent(self):
        other = self.base / 'denied'; other.mkdir(mode=0o700)
        fx = Fixture(other, event_mode=0o775)
        self.assertEqual(stat.S_IMODE(fx.parents.stat().st_mode), 0o775)
        with patch.object(contract, 'EVENT_SOURCE', str(fx.target)):
            self.deny('event_source_parent', lambda: contract.validate_pre_stop(fx.root))

    def test_missing_binding_same_denial_in_operations(self):
        self.fx.binding_file.unlink()
        for call in (lambda: contract.validate_pre_stop(self.fx.root), lambda: self.ops.System().validate_bindings(self.fx.window, self.fx.config())):
            with self.assertRaises(FileNotFoundError): call()

    def test_unreadable_event_parent(self):
        self.fs.unreadable = self.fx.parents; self.deny('event_source_parent_unreadable')

    def test_symlink_event_parent_denied(self):
        moved = self.fx.parents.with_name('moved'); self.fx.parents.rename(moved)
        self.fx.parents.symlink_to(moved, target_is_directory=True); self.deny('event_source_parent')

    def test_verifier_does_not_write(self):
        def snapshot():
            return {str(p.relative_to(self.base)): (p.lstat().st_mode, os.readlink(p) if p.is_symlink() else sha(p))
                    for p in self.base.rglob('*') if p.is_file() or p.is_symlink()}
        before = snapshot(); original_open = os.open
        def readonly_open(path, flags, *a, **kw):
            self.assertFalse(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            return original_open(path, flags, *a, **kw)
        with patch.object(os, 'open', side_effect=readonly_open), patch.object(os, 'chmod', side_effect=AssertionError('chmod')):
            contract.validate_pre_stop(self.fx.root)
        self.assertEqual(snapshot(), before)

    def test_revalidate_at_operations_use_after_file_disappears(self):
        contract.validate_pre_stop(self.fx.root); self.fx.binding_file.unlink()
        with self.assertRaises(FileNotFoundError): self.ops.System().validate_bindings(self.fx.window, self.fx.config())

    def test_final_event_consumer_rechecks_parent(self):
        # Real apply() source and actual target metadata. Unchanged authorities
        # (nft, source policy/consumer inventory) are injected; no writer executes.
        boundary = load('local_event_boundary', read_source('csv_boundary.py'))
        source = future_sources.event_overlay(self.event_source).replace(
            '/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts', str(self.fx.target))
        calls = []
        stub = types.SimpleNamespace(read=lambda p: {'path': str(self.fx.target), 'uid': os.getuid(), 'mode': 0o600},
                                     write=lambda *a: calls.append('write'))
        bridge = types.SimpleNamespace(Bridge=lambda p: types.SimpleNamespace(privileged=lambda a: calls.append('fence-observation')))
        with patch.dict(sys.modules, {'csv_boundary': boundary, 'csv_contract': stub, 'sequencer': bridge}):
            module = load('future_real_overlay', source)
            module.event_consumers = lambda *a, **kw: None
            module.event_policy = lambda *a: None
            # Supply only unaffected hash lookup; the shared parent predicate is real.
            stub.read = lambda p: {'path': str(self.fx.target), 'uid': os.getuid(), 'mode': 0o600,
                                  'targetSha256': sha(self.fx.target), 'beforeSha256': sha(self.fx.target)}
            contract.validate_pre_stop(self.fx.root)
            self.fs.parent_race = True
            self.deny('event_source_parent', lambda: module.apply(self.fx.root))
        self.assertNotIn('write', calls)

    def test_current_checker_shared_gate_precedes_old_checks(self):
        source = read_source('check_current_original.py')
        calls = []
        class StopAfterSharedGate(Exception):
            pass
        def old_check(*a, **kw):
            calls.append('old-package-check')
            raise StopAfterSharedGate()
        stub = types.SimpleNamespace(check=old_check, read=None, require=contract.require, sha=sha)
        with patch.dict(sys.modules, {'csv_contract': stub}):
            module = load('future_real_current_checker', future_sources.check_current(source))
        self.fs.parent_race = True
        self.deny('event_source_parent', lambda: module.check_current(self.fx.root))
        self.assertEqual(calls, [])
        self.fs.parent_race = False
        with self.assertRaises(StopAfterSharedGate):
            module.check_current(self.fx.root)
        self.assertEqual(calls, ['old-package-check'])

    def cli(self, change_after_baseline=None):
        calls = []
        class StopSimulation(Exception):
            pass
        class Sequence:
            def __init__(self, b):
                self.baseline = {'synthetic': True}
            def eligible(self):
                calls.append('eligible')
            def capture_baseline(self):
                calls.append('baseline')
                if change_after_baseline:
                    change_after_baseline()
            def close_then_preflight(self):
                calls.append('close')
            def controls_enter(self):
                calls.append('contain')
            def action(self, mode, action):
                calls.append(action)
                raise StopSimulation()
            def journal(self, *a, **kw):
                calls.append('journal')
        c = types.SimpleNamespace(check=lambda *a, **k: calls.append('package-read'),
                                  read=lambda p: json.loads(Path(p).read_text()),
                                  write=lambda *a: calls.append('evidence-write'),
                                  require=contract.require, sha=sha)
        seq = types.SimpleNamespace(Bridge=lambda p: None, Sequencer=Sequence, API='api', WORKER='worker', FRONT='front')
        boundary = types.SimpleNamespace(stage_boundary=None, exit_and_imports=None)
        current = types.SimpleNamespace(check_current=lambda *a: calls.append('current-read'))
        with patch.dict(sys.modules, {'csv_contract': c, 'sequencer': seq, 'csv_boundary': boundary, 'check_current': current}):
            module = load('future_real_csv_cli', future_sources.csv_cli(self.cli_source))
            try:
                module.execute(self.fx.root)
            except StopSimulation:
                pass
            except (RuntimeError, OSError) as error:
                self.last_cli_error = error
        return calls

    def test_cli_775_denies_before_any_effect(self):
        other = self.base / 'cli-denied'
        other.mkdir(mode=0o700)
        self.fx = Fixture(other, event_mode=0o775)
        with patch.object(contract, 'EVENT_SOURCE', str(self.fx.target)):
            self.assertEqual(self.cli(), [])

    def test_cli_missing_binding_denies_before_any_effect(self):
        self.fx.binding_file.unlink()
        self.assertEqual(self.cli(), [])

    def test_cli_binding_reference_drift_denies_before_any_effect(self):
        key = next(iter(self.fx.bindings))
        self.fx.bindings[key] = str(self.base)
        self.fx.binding_file.write_text(json.dumps(self.fx.bindings))
        self.assertEqual(self.cli(), [])

    def test_cli_valid_reaches_simulated_contain_stop_in_order(self):
        calls = self.cli()
        self.assertLess(calls.index('close'), calls.index('contain'))
        self.assertLess(calls.index('contain'), calls.index('stop-pair'))

    def test_cli_recheck_denies_drift_before_close_contain_stop(self):
        calls = self.cli(lambda: self.fx.binding_file.unlink())
        self.assertIn('baseline', calls)
        self.assertNotIn('close', calls)
        self.assertNotIn('contain', calls)
        self.assertNotIn('stop-pair', calls)

    def test_delivered_source_hash_drift_denies(self):
        import source_inputs
        (self.base / 'reference_sources').mkdir()
        (self.base / 'reference_sources/operations_bindings_original.py').write_text('altered source')
        with patch.object(source_inputs, 'HERE', self.base):
            with self.assertRaisesRegex(RuntimeError, 'consumer_source_hash_mismatch'):
                source_inputs.read_source('operations_bindings_original.py')

    def test_isolated_missing_versioned_source_has_no_git_fallback(self):
        import source_inputs
        (self.base / 'ISOLATED_DELIVERY').write_text('isolated')
        with patch.object(source_inputs, 'HERE', self.base), patch.object(source_inputs.subprocess, 'check_output', side_effect=AssertionError('external fallback')):
            with self.assertRaises(FileNotFoundError): source_inputs.read_source('csv_cli.py')

    def test_unknown_consumer_source_denies(self):
        with self.assertRaisesRegex(RuntimeError, 'predicate_changed'):
            future_sources.operations(self.ops_source.replace("'auth_binding_drift'", "'different_contract'"))
        with self.assertRaisesRegex(RuntimeError, 'source_contract_changed'):
            future_sources.event_overlay('unrecognized source')


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PreventionTests)
    names = unittest.defaultTestLoader.getTestCaseNames(PreventionTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps({'tests': names, 'testMethods': result.testsRun, 'passed': result.wasSuccessful(),
                      'equivalenceMatrix': getattr(PreventionTests, 'matrix_results', []),
                      'privateEvidenceAccessForbidden': True}, sort_keys=True))
    sys.exit(0 if result.wasSuccessful() else 1)
