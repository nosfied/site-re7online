"""Focused adapter rehearsal; process absence is tested with real PM2 separately."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
PATCH = Path(__file__).with_name('absent-worker-return.patch')


def load_ops(path):
    for name in ('db_owner_set_gate', 'db_owner_set_observer'):
        sys.modules.setdefault(name, types.ModuleType(name))
    spec = importlib.util.spec_from_file_location('ops', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules['ops'] = module
    spec.loader.exec_module(module)
    return module


class Fake:
    def __init__(self, ops, source, db=None):
        self.ops = ops
        self.current = {n: {'name': n, 'pid': i, 'pm2_env': {
            'status': 'online', 'watch': False, 'pm_cwd': c['cwd']}}
            for i, (n, c) in enumerate(source.items(), 101)}
        self.current[ops.WORKER]['pid'] = 0
        self.current[ops.WORKER]['pm2_env']['status'] = 'errored'
        self.db = db or {'otherClientBackends': 0, 'advisoryLocks': 0}
        self.events = []

    def apps(self): return list(self.current.values())
    def guard(self):
        return {'version': 1, 'open': False, 'generation': 7,
                'tasks': {}, 'audit': [], 'ledgerFault': None}
    def containment(self, window): self.events.append('fence_present')
    def renewal_containment(self, window): self.events.append('renewal_fence_present')
    def identity(self, pid):
        return {'state': 'S', 'ticks': str(pid * 100)} if any(
            a['pid'] == pid and a['pm2_env']['status'] == 'online'
            for a in self.current.values()) else None
    def tree(self, pid): return {str(pid): self.identity(pid)}
    def socket_ids(self, trees): return ['1010']
    def sockets_present(self, captured): return False
    def check_config(self, app, cfg):
        if app['pm2_env']['pm_cwd'] != cfg['cwd']:
            raise RuntimeError('config_drift')
    def delete(self, name):
        self.events.append('delete:' + name)
        self.current.pop(name)
    def db_zero(self):
        self.events.append('db_zero_after_stop')
        return self.db
    def capture_auth(self, root, apps): self.events.append('auth_snapshot')
    def wait(self): raise AssertionError('no fixed wait in synthetic instant exit')


class AdapterTest(unittest.TestCase):
    def setUp(self):
        if SOURCE is None:
            self.skipTest('pass attested source directory')
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.returned = self.base / 'return'
        self.returned.mkdir()
        for n in ('ops', 'delegated'):
            shutil.copy2(SOURCE / (n + '.orig.py'), self.returned / (n + '.py'))
        subprocess.run(['patch', '--batch', '-p0', '-i', str(PATCH)],
                       cwd=self.returned, check=True, stdout=subprocess.DEVNULL)
        self.ops = load_ops(self.returned / 'ops.py')
        source = {n: {'name': n, 'cwd': '/synthetic/candidate/' + n,
                      'script': '/synthetic/candidate/' + n + '/index.js'}
                  for n in (self.ops.API, self.ops.WORKER, self.ops.FRONT)}
        target = {n: {'name': n, 'cwd': '/synthetic/return/' + n,
                      'script': '/synthetic/return/' + n + '/index.js'}
                  for n in source}
        for name, value in (('return.config.private.json', source),
                            ('candidate.config.private.json', target)):
            (self.returned / name).write_text(json.dumps({'apps': list(value.values())}))
        (self.returned / 'plan.private.json').write_text(json.dumps({
            'direction': 'return', 'recovery': True,
            'frontendAbsentAtRecovery': False, 'workerAbsentAtRecovery': True}))
        window = self.base / 'window'
        window.mkdir()
        (window / 'restore-result.json').write_text(json.dumps({'temporaryDatabaseRemoved': True}))
        (window / 'prior-absent-worker.private.json').write_text(json.dumps({
            'trees': {self.ops.WORKER: {'999999': {'ticks': '9', 'state': 'captured'}}},
            'sockets': []}))
        self.source = source

    def tearDown(self):
        if hasattr(self, 'temp'): self.temp.cleanup()

    def make(self, db=None):
        driver = Fake(self.ops, self.source, db)
        operation = self.ops.Operations(self.returned, driver)
        checks = []
        operation.absent_worker = lambda: checks.append('absent_check')
        return operation, driver, checks

    def test_stop_certifies_absence_and_zero_backends_before_successor(self):
        operation, driver, checks = self.make()
        operation.stop(recovery=True)
        self.assertTrue((self.returned / 'old-exit-confirmed.json').is_file())
        self.assertEqual(set(driver.current), {self.ops.FRONT})
        self.assertLess(driver.events.index('delete:' + self.ops.API),
                        driver.events.index('db_zero_after_stop'))
        self.assertLess(driver.events.index('db_zero_after_stop'),
                        driver.events.index('auth_snapshot'))
        self.assertGreaterEqual(len(checks), 4)
        operation.certificate('old-exit-confirmed.json', self.ops.API)
        self.assertGreaterEqual(len(checks), 5)

    def test_advisory_lock_blocks_certificate_after_api_stop(self):
        operation, driver, _ = self.make({'otherClientBackends': 0, 'advisoryLocks': 1})
        with self.assertRaisesRegex(RuntimeError, 'unknown_db_owner'):
            operation.stop(recovery=True)
        self.assertFalse((self.returned / 'old-exit-confirmed.json').exists())
        self.assertEqual(set(driver.current), {self.ops.FRONT})

    def test_unknown_backend_blocks_certificate_after_api_stop(self):
        operation, driver, _ = self.make({'otherClientBackends': 1, 'advisoryLocks': 0})
        with self.assertRaisesRegex(RuntimeError, 'unknown_db_owner'):
            operation.stop(recovery=True)
        self.assertFalse((self.returned / 'old-exit-confirmed.json').exists())
        self.assertEqual(set(driver.current), {self.ops.FRONT})

    def test_delegated_renewal_accepts_only_bound_absent_worker(self):
        spec = importlib.util.spec_from_file_location('delegated',
                                                      self.returned / 'delegated.py')
        delegated = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(delegated)
        operation, driver, checks = self.make()
        with patch.object(self.ops.Operations, 'absent_worker',
                          lambda self: checks.append('rechecked')):
            delegated.reconfirm_for_renewal(self.returned, 'recover-partial', driver, {})
        self.assertIn('renewal_fence_present', driver.events)
        self.assertGreaterEqual(len(checks), 2)
        driver.current[self.ops.WORKER]['pid'] = 444
        with patch.object(self.ops.Operations, 'absent_worker', lambda self: None):
            with self.assertRaisesRegex(RuntimeError, 'absent_worker_recovery_state_drift'):
                delegated.reconfirm_for_renewal(self.returned, 'recover-partial', driver, {})


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0]])
