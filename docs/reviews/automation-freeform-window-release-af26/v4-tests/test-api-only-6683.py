"""Synthetic rehearsal of the 6683 V4 pair switch; never calls PM2 or providers."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest

BASE = Path(__file__).resolve().parent
PACKAGE = Path(os.environ['AF26_V4_PACKAGE']).resolve()
sys.path.insert(0, str(PACKAGE / 'switch'))
spec = importlib.util.spec_from_file_location('v4_fixture', BASE / 'test-package-set.py')
fixture_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_module)
import delegated


class ApiOnlyWindowTests(unittest.TestCase):
    def setUp(self):
        self.fx = fixture_module.PackageTests()
        self.fx.setUp()
        self.fx.new['apps'][2] = self.fx.old['apps'][2].copy()
        (self.fx.switch / 'candidate.config.private.json').write_text(json.dumps(self.fx.new))
        self.ops = fixture_module.ops.Operations(self.fx.switch, self.fx.d)
        self.front = self.fx.d.live[fixture_module.ops.FRONT]
        self.front_identity = self.fx.d.identity(self.front['pid'])

    def tearDown(self):
        self.fx.tearDown()

    def front_unchanged(self):
        live = self.fx.d.live[fixture_module.ops.FRONT]
        self.assertEqual(live['pid'], self.front['pid'])
        self.assertEqual(self.fx.d.identity(live['pid']), self.front_identity)
        self.assertFalse(any(x in self.fx.d.calls for x in (
            'delete:' + fixture_module.ops.FRONT,
            'start:' + fixture_module.ops.FRONT)))

    def test_switch_and_full_return_preserve_frontend(self):
        self.ops.stop()
        self.ops.start(fixture_module.ops.API)
        self.ops.start(fixture_module.ops.WORKER)
        self.front_unchanged()
        returned = self.fx.folder('return', self.fx.new, self.fx.old)
        operation = fixture_module.ops.Operations(returned, self.fx.d)
        operation.stop()
        operation.start(fixture_module.ops.API)
        operation.start(fixture_module.ops.WORKER)
        self.front_unchanged()
        self.assertEqual({x['name'] for x in self.fx.d.apps()}, fixture_module.ops.NAMES)

    def test_partial_return_after_api_start(self):
        self.ops.stop()
        self.ops.start(fixture_module.ops.API)
        returned = self.fx.folder('return-partial', self.fx.new, self.fx.old, recovery=True)
        operation = fixture_module.ops.Operations(returned, self.fx.d)
        operation.stop(recovery=True)
        operation.start(fixture_module.ops.API)
        operation.start(fixture_module.ops.WORKER)
        self.front_unchanged()

    def test_frontend_actions_denied(self):
        with self.assertRaisesRegex(RuntimeError, 'frontend_preserved_no_stop'):
            self.ops.stop(frontend=True)
        with self.assertRaisesRegex(RuntimeError, 'frontend_preserved_no_start'):
            self.ops.start(fixture_module.ops.FRONT)
        self.assertNotIn('stop-front', delegated.ACTIONS)
        self.assertNotIn('start:' + fixture_module.ops.FRONT, delegated.ACTIONS)

    def test_expired_proof_requires_new_nonce_and_frontend_identity(self):
        self.ops.stop()
        action = 'start:' + fixture_module.ops.API
        old = delegated.request(self.fx.switch, action, self.fx.d.guard(), now=1000)
        delegated.record(self.fx.switch, action, {'nftables': [
            {'table': {'family':'inet','name':'re7_campaign_transition'}},
            {'chain': {'family':'inet','table':'re7_campaign_transition','name':'api_input',
                       'type':'filter','hook':'input','prio':-10,'policy':'accept'}},
            {'rule': {'family':'inet','table':'re7_campaign_transition','chain':'api_input',
                      'expr':[{'match': {'op':'==','left': {'payload': {'protocol':'tcp','field':'dport'}},
                                         'right': {'set':[3000,3001]}}}, {'reject': {'type':'tcp reset'}}]}}]},
            old['nonce'], now=1001, guard=self.fx.d.guard())
        new = delegated.request(self.fx.switch, action, self.fx.d.guard(), now=1302,
                                driver=self.fx.d)
        self.assertNotEqual(new['nonce'], old['nonce'])
        self.assertEqual(new['attempt'], 2)
        self.fx.d.proc[str(self.front['pid'])]['ticks'] = 'reused'
        with self.assertRaisesRegex(RuntimeError, 'frontend_identity_changed'):
            delegated.request(self.fx.switch, action, self.fx.d.guard(), now=1603,
                              driver=self.fx.d)

    def test_observer_failure_after_api_denies_worker_without_intent(self):
        self.ops.stop()
        self.ops.start(fixture_module.ops.API)
        self.fx.d.db_only_successor_api = lambda *args: (_ for _ in ()).throw(
            RuntimeError('observer_unavailable'))
        with self.assertRaisesRegex(RuntimeError, 'observer_unavailable'):
            self.ops.start(fixture_module.ops.WORKER)
        self.assertFalse((self.fx.switch / ('start-intent-' + fixture_module.ops.WORKER + '.json')).exists())
        self.front_unchanged()
        returned = self.fx.folder('return-partial', self.fx.new, self.fx.old, recovery=True)
        operation = fixture_module.ops.Operations(returned, self.fx.d)
        operation.stop(recovery=True)
        operation.start(fixture_module.ops.API)
        with self.assertRaisesRegex(RuntimeError, 'observer_unavailable'):
            operation.start(fixture_module.ops.WORKER)
        self.assertFalse((returned / ('start-intent-' + fixture_module.ops.WORKER + '.json')).exists())
        self.front_unchanged()


if __name__ == '__main__':
    unittest.main()
