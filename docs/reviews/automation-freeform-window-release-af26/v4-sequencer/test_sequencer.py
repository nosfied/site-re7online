"""Deterministic protocol-order simulation. Does not contact production."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from sequencer import API, WORKER, FRONT, Sequencer


def config(version):
    return {name: {'name': name, 'cwd': '/synthetic/' + version,
                   'script': '/synthetic/' + version + '/' + name,
                   'env': {'BUILD': version}} for name in (API, WORKER, FRONT)}


class FakeBridge:
    def __init__(self, base):
        self.root = Path(base)
        self.window = self.root / 'window'
        self.window.mkdir(parents=True)
        self.old = config('old')
        self.new = config('new')
        self.new[FRONT] = self.old[FRONT]
        self.live = {name: {'pid': i, 'cfg': copy.deepcopy(value)}
                     for i, (name, value) in enumerate(self.old.items(), 101)}
        self.proc = {i: {'state': 'S', 'ticks': str(i * 100)} for i in range(101, 110)}
        self.g = {'open': True, 'generation': 13, 'tasks': [], 'ledgerFault': None}
        self.events = []
        self.fenced = False
        self.system_cron = 'before'
        self.boot = 'enabled'
        self.fail_action = None
        self.fail_once = False
        self.drift_at = None
        self.next_pid = 110
        for mode in ('switch', 'return', 'return-partial'):
            folder = self.root / mode
            folder.mkdir()
            source = self.old if mode == 'switch' else self.new
            target = self.new if mode == 'switch' else self.old
            (folder / 'return.config.private.json').write_text(
                json.dumps({'apps': list(source.values())}))
            (folder / 'candidate.config.private.json').write_text(
                json.dumps({'apps': list(target.values())}))
        (self.window / 'execution-gates.private.json').write_text(json.dumps({
            k: True for k in ('ownerAuthorized', 'preflightReviewed', 'artifactsVerified',
                               'restoreVerified', 'discrepanciesResolved')}))
        (self.window / 'privileged-policy.sha256').write_text('synthetic\n')

    def run(self, args, **kwargs):
        self.events.append(('hash_check', str(kwargs.get('cwd'))))
        return ''

    def guard(self):
        return copy.deepcopy(self.g)

    def apps(self):
        return {name: copy.deepcopy({'name': name, **value}) for name, value in self.live.items()}

    def identity(self, pid):
        return copy.deepcopy(self.proc.get(pid))

    def expected_config(self, mode, file):
        return {a['name']: a for a in json.loads((self.root / mode / file).read_text())['apps']}

    def app_matches(self, name, expected):
        return name in self.live and self.live[name]['cfg'] == expected[name]

    def privileged(self, action):
        self.events.append(('privileged', action))
        if self.fail_action == 'privileged:' + action:
            self.fail_action = None
            raise RuntimeError('privileged_failure')
        if action == 'inspect':
            return json.dumps({'policySha256': 'synthetic', 'phase': None,
                               'sourceProcessesAlive': True})
        if action == 'check-absent':
            if self.fenced:
                raise RuntimeError('fence_present')
        elif action == 'check-present':
            if not self.fenced:
                raise RuntimeError('fence_absent')
        elif action == 'enter':
            self.fenced, self.system_cron, self.boot = True, 'window', 'disabled'
            if self.fail_action == 'privileged-after:enter':
                self.fail_action = None
                raise RuntimeError('privileged_failure_after_partial_effect')
        elif action == 'unfence':
            self.fenced = False
        elif action in ('restore-controls', 'abort-prestop'):
            self.fenced, self.system_cron, self.boot = False, 'before', 'enabled'
        return '{}'

    def node(self, mode, script):
        self.events.append(('node', mode, script))
        if script == 'close.cjs':
            self.g['open'] = False
            self.g['generation'] += 1
            (self.root / mode / 'drain-result.json').write_text('{}')
        elif script == 'open.cjs':
            self.g['open'] = True
            self.g['generation'] += 1
        return ''

    def protocol(self, mode, action):
        self.events.append(('protocol', mode, action, self.g['generation']))
        if self.drift_at == action:
            self.g['generation'] += 1
            self.drift_at = None
        if action == 'preflight':
            assert not self.g['open'] and self.g['generation'] == 14
        if self.fail_action == action or self.fail_action == mode + ':' + action:
            self.fail_action = None
            raise RuntimeError('injected_' + action)
        folder = self.root / mode
        if action in ('stop-pair', 'recover-partial'):
            self.live.pop(API, None)
            self.live.pop(WORKER, None)
            (folder / 'old-exit-confirmed.json').write_text('{}')
        elif action.startswith('start:'):
            name = action.split(':', 1)[1]
            if self.fail_action == 'after_intent:' + name:
                (folder / ('start-intent-' + name + '.json')).write_text('{}')
                self.fail_action = None
                raise RuntimeError('simulated_uncertain_start')
            self.next_pid += 1
            cfg = self.expected_config(mode, 'candidate.config.private.json')[name]
            self.live[name] = {'pid': self.next_pid, 'cfg': copy.deepcopy(cfg)}
            self.proc[self.next_pid] = {'state': 'S', 'ticks': str(self.next_pid * 100)}
            (folder / ('start-intent-' + name + '.json')).write_text('{}')
            (folder / ('started-' + name + '.json')).write_text('{}')
        elif action == 'unfence':
            (folder / 'owner-unfence-authorized.json').write_text('{}')

    def restore_guard(self, config_file):
        self.events.append(('guard_restore', config_file))
        self.g['open'] = True
        self.g['generation'] += 1


class SequenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.b = FakeBridge(Path(self.tmp.name) / 'incident-6683-v4-new')
        self.s = Sequencer(self.b)

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_order_and_frontend_unchanged(self):
        front = copy.deepcopy(self.b.live[FRONT])
        self.s.run()
        events = self.b.events
        close = events.index(('node', 'switch', 'close.cjs'))
        proof = next(i for i, e in enumerate(events) if e[:3] == ('protocol', 'switch', 'preflight'))
        stop = next(i for i, e in enumerate(events) if e[:3] == ('protocol', 'switch', 'stop-pair'))
        self.assertLess(close, proof)
        self.assertLess(proof, stop)
        self.assertEqual(events[proof][3], 14)
        self.assertEqual(self.b.live[FRONT], front)
        self.assertEqual(self.b.live[API]['cfg'], self.b.new[API])
        self.assertTrue(self.b.g['open'])
        self.assertFalse(self.b.fenced)
        self.assertEqual((self.b.system_cron, self.b.boot), ('before', 'enabled'))

    def test_early_proof_denied_before_guard_mutation(self):
        (self.b.root / 'switch/owner-request-preflight.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'preflight_proof_emitted_before_close'):
            self.s.run()
        self.assertTrue(self.b.g['open'])
        self.assertFalse(any(e[:2] == ('node', 'switch') for e in self.b.events))

    def test_failed_proof_or_privileged_action_restores_before_stop(self):
        for reason in ('preflight', 'privileged:enter', 'privileged-after:enter'):
            with self.subTest(reason=reason):
                self.tearDown()
                self.setUp()
                self.b.fail_action = reason
                with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
                    self.s.run()
                self.assertTrue(self.b.g['open'])
                self.assertFalse(self.b.fenced)
                self.assertEqual((self.b.system_cron, self.b.boot), ('before', 'enabled'))
                self.assertEqual(set(self.b.live), {API, WORKER, FRONT})

    def test_generation_drift_rejected_without_waiting_for_expiry(self):
        self.b.drift_at = 'preflight'
        with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
            self.s.run()
        self.assertTrue(self.b.g['open'])
        self.assertFalse(self.b.fenced)
        self.assertFalse(any(e[:3] == ('protocol', 'switch', 'stop-pair')
                             for e in self.b.events))

    def test_expired_start_proof_returns_without_repeating_start(self):
        self.b.fail_action = 'switch:start:' + API
        with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
            self.s.run()
        self.assertEqual(self.b.live[API]['cfg'], self.b.old[API])
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + API)
                             for e in self.b.events), 1)
        self.assertIn(('protocol', 'return-partial', 'recover-partial', 14), self.b.events)

    def test_uncertain_start_intent_does_not_repeat_or_guess_return(self):
        self.b.fail_action = 'after_intent:' + API
        with self.assertRaisesRegex(RuntimeError,
                                    'ambiguous_start_intent_requires_observation'):
            self.s.run()
        self.assertTrue(self.b.fenced)
        self.assertFalse(self.b.g['open'])
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + API)
                             for e in self.b.events), 1)

    def test_failure_after_api_uses_partial_return(self):
        self.b.fail_action = 'switch:start:' + WORKER
        with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
            self.s.run()
        self.assertEqual(self.b.live[API]['cfg'], self.b.old[API])
        self.assertEqual(self.b.live[WORKER]['cfg'], self.b.old[WORKER])
        self.assertTrue(self.b.g['open'])
        self.assertIn(('protocol', 'return-partial', 'recover-partial', 14), self.b.events)

    def test_failure_after_pair_uses_full_return(self):
        self.b.fail_action = 'switch:unfence'
        with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
            self.s.run()
        self.assertEqual(self.b.live[API]['cfg'], self.b.old[API])
        self.assertEqual(self.b.live[WORKER]['cfg'], self.b.old[WORKER])
        self.assertTrue(self.b.g['open'])
        self.assertIn(('protocol', 'return', 'stop-pair', 14), self.b.events)

    def test_privileged_unfence_failure_uses_full_return_while_fenced(self):
        self.b.fail_action = 'privileged:unfence'
        with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
            self.s.run()
        self.assertEqual(self.b.live[API]['cfg'], self.b.old[API])
        self.assertEqual(self.b.live[WORKER]['cfg'], self.b.old[WORKER])
        self.assertTrue(self.b.g['open'])


if __name__ == '__main__':
    unittest.main()
