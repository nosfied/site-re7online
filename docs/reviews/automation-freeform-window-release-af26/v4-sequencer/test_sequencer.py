"""Deterministic protocol-order simulation. Does not contact production."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import privileged as privileged_helper
from sequencer import API, WORKER, FRONT, Bridge, Sequencer, guard_state


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
        self.g = {'version': 1, 'open': True, 'generation': 13, 'tasks': {},
                  'audit': [], 'ledgerFault': None}
        self.events = []
        self.fenced = False
        self.system_cron = 'before'
        self.boot = 'enabled'
        self.fail_action = None
        self.fail_once = False
        self.drift_at = None
        self.next_pid = 110
        self.fail_validate_count = 0
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
        (self.window / 'sequencer.py').write_text('synthetic sequencer')
        (self.window / 'sequencer-manifest.json').write_text(json.dumps({
            'filesSha256': {'sequencer.py': hashlib.sha256(
                b'synthetic sequencer').hexdigest()}}))

    def run(self, args, **kwargs):
        self.events.append(('hash_check', str(kwargs.get('cwd'))))
        return ''

    def guard(self):
        return guard_state(copy.deepcopy(self.g))

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
        if script == 'validate.cjs' and self.fail_validate_count:
            self.fail_validate_count -= 1
            raise RuntimeError('step_failed:switch/validate.cjs:exit=1')
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

    def test_persisted_empty_task_object_allows_preflight_after_close(self):
        self.s.run()
        self.assertTrue(self.b.g['open'])
        self.assertEqual(self.b.live[API]['cfg'], self.b.new[API])
        self.assertLess(
            self.b.events.index(('node', 'switch', 'close.cjs')),
            next(i for i, e in enumerate(self.b.events)
                 if e[:3] == ('protocol', 'switch', 'preflight')))

    def test_invalid_persisted_guard_rejected_before_close(self):
        for tasks in (None, False, '', []):
            with self.subTest(tasks=tasks):
                self.tearDown()
                self.setUp()
                self.b.g['tasks'] = tasks
                with self.assertRaisesRegex(RuntimeError, 'guard_schema_invalid'):
                    self.s.run()
                self.assertFalse(any(e[:2] == ('node', 'switch') for e in self.b.events))
        self.tearDown()
        self.setUp()
        del self.b.g['tasks']
        with self.assertRaisesRegex(RuntimeError, 'guard_schema_invalid'):
            self.s.run()

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

    def test_transient_validation_after_unfence_never_restarts_pair(self):
        self.b.fail_validate_count = 1
        with self.assertRaisesRegex(RuntimeError, 'fence_not_proven_recovery_blocked'):
            self.s.run()
        self.assertFalse(self.b.fenced)
        self.assertFalse(self.b.g['open'])
        self.assertEqual(self.b.live[API]['cfg'], self.b.new[API])
        self.assertEqual(self.b.live[WORKER]['cfg'], self.b.new[WORKER])
        self.b.node('switch', 'validate.cjs')  # independent read-only recheck
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + API)
                             for e in self.b.events), 1)
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + WORKER)
                             for e in self.b.events), 1)

    def test_persistent_validation_after_unfence_stays_closed(self):
        self.b.fail_validate_count = 2
        with self.assertRaisesRegex(RuntimeError, 'fence_not_proven_recovery_blocked'):
            self.s.run()
        with self.assertRaisesRegex(RuntimeError, 'step_failed:switch/validate.cjs'):
            self.b.node('switch', 'validate.cjs')
        self.assertFalse(self.b.fenced)
        self.assertFalse(self.b.g['open'])
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + API)
                             for e in self.b.events), 1)
        self.assertEqual(sum(e[:3] == ('protocol', 'switch', 'start:' + WORKER)
                             for e in self.b.events), 1)


class StepDiagnosticTests(unittest.TestCase):
    def test_real_node_failure_records_private_output_and_safe_exception(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'switch').mkdir()
            (root / 'window').mkdir()
            (root / 'switch/validate.cjs').write_text(
                "process.stdout.write('private-stdout');"
                "process.stderr.write('private-stderr');process.exit(17)")
            bridge = Bridge.__new__(Bridge)
            bridge.root, bridge.switch, bridge.window = (
                root, root / 'switch', root / 'window')
            with self.assertRaisesRegex(RuntimeError,
                                        'step_failed:switch/validate.cjs:exit=17') as caught:
                bridge.node('switch', 'validate.cjs')
            self.assertNotIn('private-', str(caught.exception))
            path = root / 'window/step-output.private.jsonl'
            row = json.loads(path.read_text())
            self.assertEqual((row['mode'], row['step'], row['exitCode']),
                             ('switch', 'validate.cjs', 17))
            self.assertEqual((row['stdout'], row['stderr']),
                             ('private-stdout', 'private-stderr'))
            self.assertEqual(row['stdoutSha256'],
                             hashlib.sha256(b'private-stdout').hexdigest())
            self.assertEqual(row['stderrSha256'],
                             hashlib.sha256(b'private-stderr').hexdigest())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


class RealGuardChainTests(unittest.TestCase):
    def run_case(self, fail_action=None):
        with tempfile.TemporaryDirectory() as folder:
            bridge = FakeBridge(Path(folder) / 'incident-6683-v4-chain')
            bridge.fail_action = fail_action
            guard_file = bridge.window / 'guard.json'
            guard_file.write_text(json.dumps(bridge.g))
            cron = bridge.window / 'cron'
            cron.write_bytes(b'before')
            state = {'phase': None, 'fence': False, 'boot': 'enabled'}
            value = {'cronBefore': b'before', 'cronWindow': b'window',
                     'fence': b'table inet re7_campaign_transition {}',
                     'policySha256': 'synthetic', 'sourceProcesses': {}}

            def node(mode, script):
                result = FakeBridge.node(bridge, mode, script)
                guard_file.write_text(json.dumps(bridge.g))
                return result

            def guard():
                return guard_state(json.loads(guard_file.read_text()))

            def read_phase():
                return state['phase']

            def write_phase(stage, policy_hash, mode=None):
                state['phase'] = {'stage': stage, 'policySha256': policy_hash,
                                  'mode': mode}

            def absent():
                if state['fence']:
                    raise RuntimeError('fence_present')
                return b'{"nftables":[]}'

            def present():
                if not state['fence']:
                    raise RuntimeError('fence_absent')
                return b'{"nftables":[]}'

            def system(args, *, input_bytes=None):
                if args[:2] == ['/usr/bin/systemctl', 'show']:
                    return ('ActiveState=inactive\nUnitFileState=' + state['boot'] + '\n').encode()
                if args[:2] == ['/usr/bin/systemctl', 'disable']:
                    state['boot'] = 'disabled'
                elif args[:2] == ['/usr/bin/systemctl', 'enable']:
                    state['boot'] = 'enabled'
                elif args[:3] == ['/usr/sbin/nft', '--file', '-']:
                    state['fence'] = True
                elif args[:3] == ['/usr/sbin/nft', 'delete', 'table']:
                    state['fence'] = False
                return b''

            def privileged(action):
                bridge.events.append(('privileged', action))
                return privileged_helper.act(action, value).decode()

            with patch.object(privileged_helper, 'GUARD', guard_file), \
                 patch.object(privileged_helper, 'CRON', cron), \
                 patch.object(privileged_helper, 'source_processes_alive', lambda v: None), \
                 patch.object(privileged_helper, 'target_processes_live', lambda v, m: None), \
                 patch.object(privileged_helper, 'phase_read', read_phase), \
                 patch.object(privileged_helper, 'phase_write', write_phase), \
                 patch.object(privileged_helper, 'nft_absent', absent), \
                 patch.object(privileged_helper, 'nft_present', present), \
                 patch.object(privileged_helper, 'system', system), \
                 patch.object(privileged_helper, 'write_cron', cron.write_bytes), \
                 patch.object(bridge, 'node', node), \
                 patch.object(bridge, 'guard', guard), \
                 patch.object(bridge, 'privileged', privileged):
                if fail_action:
                    with self.assertRaisesRegex(RuntimeError, 'window_failed_returned_to_original'):
                        Sequencer(bridge).run()
                else:
                    Sequencer(bridge).run()
            self.assertEqual(bridge.g['tasks'], {})
            self.assertTrue(bridge.g['open'])
            self.assertEqual(state['phase']['stage'], 'complete')
            self.assertEqual((cron.read_bytes(), state['boot'], state['fence']),
                             (b'before', 'enabled', False))
            actions = [event[1] for event in bridge.events if event[0] == 'privileged']
            authorization = 'authorize-return' if fail_action else 'authorize-switch'
            self.assertLess(actions.index('enter'), actions.index(authorization))
            self.assertLess(actions.index(authorization), actions.index('unfence'))
            self.assertEqual(state['phase']['mode'], 'return' if fail_action else 'switch')

    def test_sequencer_invokes_real_helper_guard_for_closed_object_tasks(self):
        self.run_case()

    def test_partial_failure_uses_real_helper_guard_for_return(self):
        self.run_case('switch:unfence')


if __name__ == '__main__':
    unittest.main()
