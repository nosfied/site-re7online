"""Real compositor/Loader/entry sources; local synthetic namespace only.
Private predecessor bytes remain off-Git. No host query or operation is run.
"""
import argparse
import ast
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from scripts.crm_csv_predecessor import composition as c, pre_authority as p, sources as s
from scripts.crm_csv_predecessor.test_predecessor import stored, module
from scripts.crm_csv_predecessor.runtime import ROOT_FILES

RAW = None
ROOT_BLOBS = {}


def encoded(value): return (json.dumps(value, sort_keys=True, indent=2)+'\n').encode()


class Fixture:
    def __init__(self, plan, objects):
        self.objects = objects
        self.temp = tempfile.TemporaryDirectory(prefix='re7-owner-review-lab-')
        self.root = Path(self.temp.name); self.plan = copy.deepcopy(plan)
        for name, row in self.plan['files'].items():
            path = self.root/name; path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as f: f.write(objects[row['sha256']])
        self.runtime = (self.root/'review/pre_authority.py').read_bytes()
        self.reader_raw = (self.root/'review/reader.py').read_bytes()
        self.read = module('accepted_review_reader', self.reader_raw).read
        self.seal()
    def seal(self):
        raw = encoded(self.plan); (self.root/'COMPOSITION.json').write_bytes(raw)
        self.sha = s.digest(raw)
    def view(self):
        p.REVIEW_READ = self.read; p.RUNTIME_RAW = self.runtime; p.READER_RAW = self.reader_raw
        return p.Review(self.root, self.sha)
    def program(self, entry):
        return c.owner_launch_program(self.plan, self.objects, self.root, self.sha, entry)
    def close(self): self.temp.cleanup()


@unittest.skipUnless(RAW is not None, 'explicit pinned custody required; no fabricated predecessor')
class Integrated(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.plan, cls.objects = c.compose(RAW)
    def setUp(self):
        self.f = Fixture(self.plan, self.objects); self.addCleanup(self.f.close)

    def test_real_compositor_five_edges_original_leaf_and_no_cycles(self):
        plan = self.plan; leaf = 'window/policy_predecessor.py'
        self.assertEqual(plan['cycles'], [])
        bad_objects = dict(self.objects)
        key = plan['files']['review/pre_authority.py']['sha256']
        bad_objects[key] = b'not the reviewed library'
        with self.assertRaisesRegex(RuntimeError, 'owner_launch_library_drift'):
            c.owner_launch_program(self.f.plan, bad_objects, self.f.root, self.f.sha, 'window/root_readonly.py')
        with self.assertRaisesRegex(RuntimeError, 'static_inputs_must_not_claim'):
            s.compose_inputs(RAW, prior={}, source_only=True)
        for output, source, names in [
            ('review/reader.py', c.REVIEW/'crm-csv-postrpc-diagnostics-20261017/launch.py', ['metadata', 'read']),
            ('review/graph.py', c.REVIEW/'crm-csv-root-authority-b4-20261016/compose_static.py', ['require', 'topo']),
        ]:
            def selected(raw):
                return [ast.dump(n, include_attributes=False) for n in ast.parse(raw).body
                        if isinstance(n, ast.FunctionDef) and n.name in names]
            self.assertEqual(selected(self.objects[plan['files'][output]['sha256']]), selected(source.read_bytes()))
        for owner in s.INPUTS:
            self.assertEqual(plan['imports'][owner]['policy_predecessor'], leaf)
            self.assertIn(leaf, plan['eagerDependencies'][owner])
        def eager_closure(entry, result=None):
            result = set() if result is None else result
            if entry in result: return result
            result.add(entry)
            for child in plan['eagerDependencies'][entry]: eager_closure(child, result)
            return result
        closure = eager_closure('window/original_checks.py')
        self.assertIn(leaf, closure)
        self.assertFalse(any(x.startswith(('switch/', 'return/', 'return-partial/')) for x in closure))
        # Real accepted ORIGINAL loader in the new static graph; candidate code
        # removed from this synthetic namespace, required DATA is not deleted.
        for name in list(self.plan['files']):
            if name.startswith(('switch/', 'return/', 'return-partial/')):
                (self.f.root/name).unlink()
        view = self.f.view(); loader = view.loader('return-before-commit/ops.py')
        ops = loader.module('return-before-commit/ops.py')
        original = loader.local_module(self.f.root/'window/original_checks.py')
        self.assertEqual(original.POLICY_SOURCE, s.POLICY_SOURCE)
        self.assertTrue(callable(ops.Operations.start))
        snapshot = loader.raw
        self.assertIn(leaf, snapshot)
        self.assertFalse(any(x.startswith(('switch/', 'return/', 'return-partial/')) for x in snapshot))

    def test_root_entry_exact_owner_program_host_boundary_simulated(self):
        f = self.f; parents = {str(parent) for name in ROOT_FILES for parent in Path(name).parents}
        real_stat = Path.lstat; real_bytes = Path.read_bytes
        def meta(path, *args, **kwargs):
            key = str(path)
            if key in ROOT_FILES:
                mode = 0o440 if key.startswith('/etc/sudoers') else 0o600 if key.endswith('.json') else 0o644
                return types.SimpleNamespace(st_uid=0, st_mode=stat.S_IFREG|mode)
            if key in parents: return types.SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR|0o755)
            return real_stat(path, *args, **kwargs)
        def raw(path): return ROOT_BLOBS[str(path)] if str(path) in ROOT_BLOBS else real_bytes(path)
        with patch.object(Path, 'lstat', meta), patch.object(Path, 'read_bytes', raw), \
             patch.object(subprocess, 'run', side_effect=AssertionError('host_effect_forbidden')), \
             patch.object(subprocess, 'check_output', side_effect=AssertionError('host_effect_forbidden')), \
             redirect_stdout(io.StringIO()) as out:
            exec(compile(f.program('window/root_readonly.py'), '<owner-reviewed literal program>', 'exec'), {})
        result = json.loads(out.getvalue()); self.assertEqual(result['result'], 'CSV_ROOT_SOURCE_PASS')
        self.assertIs(result['mutation'], False)
        self.assertEqual({x['path']:x['sha256'] for x in result['files']}, ROOT_FILES)

    def test_preinstall_real_process_authenticates_then_canonical_missing_input_denies(self):
        # No verifier is replaced by PASS. This code-only fixture intentionally
        # has no operational contract/profile/RPO. The ACTUAL checker must deny.
        run = subprocess.run([sys.executable, '-I', '-S', '-c', self.f.program('window/pre_install.py').decode()],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn(b'csv-contract.private.json', run.stderr)
        self.assertNotIn(b'NameError', run.stderr)
        self.assertNotIn(b'ModuleNotFoundError', run.stderr)

    def test_leaf_missing_or_tampered_denies_before_entry(self):
        path = self.f.root/'window/policy_predecessor.py'; original = path.read_bytes()
        for changed in (None, original+b'\nraise RuntimeError("must not execute")\n'):
            if changed is None: path.unlink()
            else: path.write_bytes(changed)
            with self.subTest(missing=changed is None):
                with self.assertRaises((RuntimeError, FileNotFoundError)):
                    self.f.view().loader('window/root_readonly.py')
            if not path.exists(): path.write_bytes(original)
            else: path.write_bytes(original)

    def test_substitution_after_snapshot_before_import_denies(self):
        view = self.f.view(); loader = view.loader('window/root_readonly.py')
        (self.f.root/'window/policy_predecessor.py').write_bytes(b'raise RuntimeError("untrusted")')
        with self.assertRaisesRegex(RuntimeError, 'owner_review_source_drift'):
            loader.execute()

    def test_import_outside_review_closure_denies(self):
        self.f.plan['imports']['window/root_readonly.py'].pop('policy_predecessor')
        self.f.seal(); loader = self.f.view().loader('window/root_readonly.py')
        with self.assertRaisesRegex(RuntimeError, 'authority_import_undeclared:policy_predecessor'):
            loader.execute()

    def test_producer_leaf_source_tamper_denies(self):
        original = Path.read_bytes; leaf = Path(s.__file__).with_name('runtime.py')
        def changed(path):
            return b'raise RuntimeError("not trusted")' if path == leaf else original(path)
        with patch.object(Path, 'read_bytes', changed):
            with self.assertRaisesRegex(RuntimeError, 'reviewed_source_drift'):
                c.compose(RAW)

    def test_real_node_bootstrap_python_snapshots_then_missing_data_denies(self):
        import shutil
        node = shutil.which('node')
        self.assertIsNotNone(node, 'local Node required; no download/fallback')
        command = self.f.view().child_command(['node', str(self.f.root/'window/current-sql.cjs')])
        # Only executable-location projection: canonical /usr/bin/node is absent
        # locally. The actual existing Node runs the complete canonical bootstrap.
        command[command.index('/usr/bin/node')] = node
        empty = self.f.root/'empty-path'; empty.mkdir()
        env = dict(os.environ, PATH=str(empty))  # no docker/SQL/PM2 is available
        run = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(run.returncode, 0)
        self.assertTrue(b'waiting-work.private.json' in run.stderr, 'node_baseline_frontier_not_reached; stderr_sha256='+s.digest(run.stderr))
        self.assertNotIn(b'owner_review_runtime_index_drift', run.stderr)
        self.assertNotIn(b'node_import_undeclared', run.stderr)

    def test_cycle_denies_before_entry(self):
        self.f.plan['eagerDependencies']['window/policy_predecessor.py'] = ['window/root_readonly.py']
        self.f.seal()
        with self.assertRaisesRegex(RuntimeError, 'dependency_cycle'):
            self.f.view()

    def test_literal_review_cannot_be_overridden_by_environment_or_argv(self):
        program = self.f.program('window/pre_install.py')
        self.f.plan['uniqueBytes'] += 1; self.f.seal()
        env = dict(os.environ, REVIEW_SHA=self.f.sha, PYTHONPATH=str(self.f.root))
        run = subprocess.run([sys.executable, '-I', '-S', '-c', program.decode(), self.f.sha], env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(run.returncode, 0); self.assertIn(b'owner_review_manifest_drift', run.stderr)

    def test_no_phase_or_mutating_child_authority(self):
        view = self.f.view()
        with self.assertRaisesRegex(RuntimeError, 'no_start_authority'): view.start_mode('switch')
        with self.assertRaisesRegex(RuntimeError, 'not_phase_authority'): view.revalidate('recovery')
        with self.assertRaisesRegex(RuntimeError, 'python_child_denied'):
            p.broker(self.f.root, self.f.sha, ['python', 'switch/ops.py', ['contain']])
        with self.assertRaisesRegex(RuntimeError, 'node_child_denied'):
            p.broker(self.f.root, self.f.sha, ['node-snapshot', 'switch/close.cjs', []])

    def test_real_python_child_broker_and_node_snapshot(self):
        view = self.f.view()
        # Real Python process/owner program/Loader/baseline source. Missing data
        # denies, no SQL or simulated PASS. Transport and baseline are connected.
        command = view.child_command(['python3', str(self.f.root/'return-before-commit/baseline_contract.py'), str(self.f.root), 'return-before-commit'])
        run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(run.returncode, 0)
        self.assertNotIn(b'NameError', run.stderr)
        self.assertNotIn(b'ModuleNotFoundError', run.stderr)
        with redirect_stdout(io.StringIO()) as out:
            p.broker(self.f.root, self.f.sha, ['node-snapshot', 'window/current-sql.cjs', []])
        snap = json.loads(out.getvalue())
        raw = base64.b64decode(snap['files']['window/current-sql.cjs'])
        self.assertEqual(s.digest(raw), self.plan['files']['window/current-sql.cjs']['sha256'])
        self.assertEqual(snap['correlation'], {'ownerReviewSha256': self.f.sha})
        self.assertEqual(snap['identity'][0], 'OWNER_REVIEW')


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(); parser.add_argument('--custody', required=True); args, rest = parser.parse_known_args()
    RAW = stored(args.custody)
    for line in Path(args.custody).read_bytes().splitlines():
        row = json.loads(line)
        if 'stdoutBase64' in row:
            for target in json.loads(base64.b64decode(row['stdoutBase64']))['targets']:
                if target['path'] in ROOT_FILES:
                    value = base64.b64decode(target['bytesBase64']); assert s.digest(value) == ROOT_FILES[target['path']]
                    ROOT_BLOBS[target['path']] = value
    assert set(ROOT_BLOBS) == set(ROOT_FILES)
    Integrated.__unittest_skip__ = False
    unittest.main(argv=[sys.argv[0], *rest], verbosity=2)
