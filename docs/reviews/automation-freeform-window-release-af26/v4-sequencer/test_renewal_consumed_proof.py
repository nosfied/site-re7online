"""Run against a private mode copy after applying renewal-consumed-proof.patch.

Set RE7_PATCHED_MODE_DIR to the directory containing delegated.py and ops.py.
No production state is read or written.
"""
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

mode = os.environ.get('RE7_PATCHED_MODE_DIR')
if not mode:
    raise SystemExit('RE7_PATCHED_MODE_DIR required')
sys.path.insert(0, mode)
ops = importlib.import_module('ops')
delegated = importlib.import_module('delegated')


class RenewalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.action = 'start:' + ops.WORKER
        self.bound = {'action': self.action, 'root': str(self.root),
                      'guardGeneration': 4, 'configurationHash': 'config',
                      'dbOwnerBindingsHash': 'binding'}
        self.prior = dict(self.bound, nonce='old', requestedAt=100, attempt=1)
        delegated.request_path(self.root, self.action, 1).write_text(json.dumps(self.prior))
        delegated.consumed_path(self.root, self.action, 1).write_text(
            json.dumps({'request': self.prior, 'observedAt': 110}))

    def tearDown(self):
        self.tmp.cleanup()

    def renew(self, now=500):
        with patch.object(delegated, 'bindings', return_value=self.bound), \
             patch.object(delegated, 'reconfirm_for_renewal') as confirm:
            value = delegated.request(self.root, self.action, now=now, guard={}, driver=object())
        return value, confirm

    def test_consumed_proof_reconfirmed_new_nonce_history_preserved(self):
        value, confirm = self.renew()
        self.assertEqual(value['attempt'], 2)
        self.assertNotEqual(value['nonce'], 'old')
        self.assertTrue(delegated.consumed_path(self.root, self.action, 1).exists())
        self.assertTrue(delegated.request_path(self.root, self.action, 2).exists())
        self.assertEqual(confirm.call_args.args[-1]['request'], self.prior)
        with patch.object(delegated, 'bindings', return_value=self.bound), \
             patch.object(delegated, 'validate_nft'):
            with self.assertRaisesRegex(RuntimeError, 'owner_request_replay_or_wrong_nonce'):
                delegated.record(self.root, self.action, {}, 'old', now=501, guard={})
            delegated.record(self.root, self.action, {}, value['nonce'], now=501, guard={})
        self.assertEqual(json.loads(delegated.proof_path(self.root, self.action, 2).read_text())
                         ['request']['nonce'], value['nonce'])
        with patch.object(delegated, 'bindings', return_value=self.bound):
            with self.assertRaisesRegex(RuntimeError, 'prior_proof_still_valid'):
                delegated.request(self.root, self.action, now=501, guard={}, driver=object())

    def test_binding_drift_denies_without_new_request(self):
        self.bound['dbOwnerBindingsHash'] = 'changed'
        with self.assertRaisesRegex(RuntimeError, 'renewal_binding_drift'):
            self.renew()
        self.assertFalse(delegated.request_path(self.root, self.action, 2).exists())

    def test_consumed_proof_request_mismatch_denies(self):
        delegated.consumed_path(self.root, self.action, 1).write_text(json.dumps({
            'request': dict(self.prior, nonce='forged'), 'observedAt': 110}))
        with self.assertRaisesRegex(RuntimeError, 'prior_proof_request_mismatch'):
            self.renew()

    def test_reconfirmation_denial_preserves_history(self):
        with patch.object(delegated, 'bindings', return_value=self.bound), \
             patch.object(delegated, 'reconfirm_for_renewal', side_effect=RuntimeError('owner_changed')):
            with self.assertRaisesRegex(RuntimeError, 'owner_changed'):
                delegated.request(self.root, self.action, now=500, guard={}, driver=object())
        self.assertFalse(delegated.request_path(self.root, self.action, 2).exists())

    def test_worker_db_gate_uses_archived_binding_and_fresh_topology(self):
        # No live proof file exists; the archived request is supplied to the
        # real DB gate. The topology observer is still called on every renewal.
        (self.root / ('started-' + ops.API + '.json')).write_text(json.dumps({
            'pid': 42, 'identity': {'ticks': '1', 'state': 'S'}}))
        window = self.root / 'window'
        window.mkdir()
        data = b'{"apiHttpPort":3001}'
        (window / 'db-owner-bindings.private.json').write_bytes(data)
        obj = ops.Operations.__new__(ops.Operations)
        obj.root, obj.window = self.root, window
        obj.target = {ops.API: {'env': {'PORT': '3001', 'DATABASE_URL': 'synthetic'}}}
        class Driver:
            calls = 0
            def identity(self, pid):
                return {'ticks': '1', 'state': 'S'}
            def db_only_successor_api(self, *args):
                self.calls += 1
        obj.d = Driver()
        proof = {'request': {'dbOwnerBindingsHash': __import__('hashlib').sha256(data).hexdigest()}}
        obj.db_gate_for_start(ops.WORKER, {ops.API: {'pid': 42}}, binding_proof=proof)
        self.assertEqual(obj.d.calls, 1)
        proof['request']['dbOwnerBindingsHash'] = 'wrong'
        with self.assertRaisesRegex(RuntimeError, 'db_owner_binding_drift'):
            obj.db_gate_for_start(ops.WORKER, {ops.API: {'pid': 42}}, binding_proof=proof)
        self.assertEqual(obj.d.calls, 1)


if __name__ == '__main__':
    unittest.main()
