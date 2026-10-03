import importlib.util
import json
import subprocess
import sys
import os
import unittest
from pathlib import Path
from unittest.mock import patch

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ['AF26_V4_PACKAGE']).resolve() / 'switch'))
spec = importlib.util.spec_from_file_location('historical_tests', BASE / 'test-package-set.py')
historical = importlib.util.module_from_spec(spec)
spec.loader.exec_module(historical)
import delegated as d


def fence():
    return {'nftables': [
        {'table': {'family': 'inet', 'name': 're7_campaign_transition'}},
        {'chain': {'family': 'inet', 'table': 're7_campaign_transition', 'name': 'api_input',
                   'type': 'filter', 'hook': 'input', 'prio': -10, 'policy': 'accept'}},
        {'rule': {'family': 'inet', 'table': 're7_campaign_transition', 'chain': 'api_input',
                  'expr': [{'match': {'op': '==', 'left': {'payload': {
                      'protocol': 'tcp', 'field': 'dport'}}, 'right': {'set': [3000, 3001]}}},
                           {'reject': {'type': 'tcp reset'}}]}}]}


class DelegatedTests(unittest.TestCase):
    def setUp(self):
        self.fixture = historical.PackageTests()
        self.fixture.setUp()
        self.root = self.fixture.switch

    def tearDown(self):
        self.fixture.tearDown()

    def test_db_owner_binding_drift_invalidates_worker_nonce(self):
        self.fixture.o.stop()
        self.fixture.o.start(d.ops.API)
        action = 'start:' + d.ops.WORKER
        old = d.request(self.root, action, self.fixture.d.guard(), now=1000,
                        driver=self.fixture.d)
        path = self.fixture.window / 'db-owner-bindings.private.json'
        data = json.loads(path.read_text())
        data['proxySha256'] = 'changed-after-request'
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(RuntimeError, 'owner_request_generation_or_configuration_drift'):
            d.record(self.root, action, fence(), old['nonce'], now=1001,
                     guard=self.fixture.d.guard())
        with self.assertRaisesRegex(RuntimeError, 'renewal_binding_drift'):
            d.request(self.root, action, self.fixture.d.guard(), now=1301,
                      driver=self.fixture.d)

    def proof(self, action='stop-pair', nft=None):
        request = d.request(self.root, action, self.fixture.d.guard())
        d.record(self.root, action, fence() if nft is None else nft,
                 request['nonce'], guard=self.fixture.d.guard())
        driver = d.DelegatedSystem(self.root, action)
        driver.guard = self.fixture.d.guard
        return driver

    def test_fresh_semantic_proof_accepted(self):
        self.assertEqual(self.proof().proof()['request']['action'], 'stop-pair')

    def test_expired_proof_denied(self):
        driver = self.proof()
        driver.clock = lambda: driver.proof_time + d.MAX_AGE + 1
        driver.proof_time = json.loads(d.proof_path(self.root, 'stop-pair').read_text())['observedAt']
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_expired'):
            driver.proof()

    def test_owner_delay_expired_request_renews_with_new_nonce(self):
        old = d.request(self.root, 'preflight', self.fixture.d.guard(), now=1000)
        with self.assertRaisesRegex(RuntimeError, 'prior_request_still_valid'):
            d.request(self.root, 'preflight', self.fixture.d.guard(), now=1299,
                      driver=self.fixture.d)
        new = d.request(self.root, 'preflight', self.fixture.d.guard(), now=1301,
                        driver=self.fixture.d)
        self.assertEqual((old['attempt'], new['attempt']), (1, 2))
        self.assertNotEqual(old['nonce'], new['nonce'])
        self.assertTrue(d.request_path(self.root, 'preflight', 1).exists())
        with self.assertRaisesRegex(RuntimeError, 'owner_request_replay_or_wrong_nonce'):
            d.record(self.root, 'preflight', {'nftables': []}, old['nonce'],
                     now=1302, guard=self.fixture.d.guard())
        d.record(self.root, 'preflight', {'nftables': []}, new['nonce'],
                 now=1302, guard=self.fixture.d.guard())
        driver = d.DelegatedSystem(self.root, 'preflight', clock=lambda: 1303)
        driver.guard = self.fixture.d.guard
        self.assertEqual(driver.proof()['request']['nonce'], new['nonce'])

    def test_expired_start_proof_renews_only_after_live_reconfirmation(self):
        self.fixture.o.stop()
        action = 'start:' + d.ops.API
        old = d.request(self.root, action, self.fixture.d.guard(), now=1000)
        d.record(self.root, action, fence(), old['nonce'], now=1001,
                 guard=self.fixture.d.guard())
        driver = d.DelegatedSystem(self.root, action, clock=lambda: 1302)
        driver.guard = self.fixture.d.guard
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_expired'):
            driver.proof()
        new = d.request(self.root, action, self.fixture.d.guard(), now=1302,
                        driver=self.fixture.d)
        self.assertEqual(new['attempt'], 2)
        d.proof_path(self.root, action, 2).write_bytes(
            d.proof_path(self.root, action, 1).read_bytes())
        driver.clock = lambda: 1303
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_request_mismatch'):
            driver.proof()
        d.proof_path(self.root, action, 2).unlink()  # synthetic replay file only
        with self.assertRaisesRegex(RuntimeError, 'owner_request_replay_or_wrong_nonce'):
            d.record(self.root, action, fence(), old['nonce'], now=1303,
                     guard=self.fixture.d.guard())
        d.record(self.root, action, fence(), new['nonce'], now=1303,
                 guard=self.fixture.d.guard())
        driver.clock = lambda: 1304
        self.assertEqual(driver.proof()['request']['attempt'], 2)
        self.fixture.o.start(d.ops.API)
        self.assertEqual(set(self.fixture.d.live), {d.ops.FRONT, d.ops.API})
        with self.assertRaisesRegex(RuntimeError, 'prior_proof_still_valid'):
            d.request(self.root, action, self.fixture.d.guard(), now=1305,
                      driver=self.fixture.d)

    def test_consumed_preintent_failure_can_renew_but_started_worker_cannot(self):
        self.fixture.o.stop()
        self.fixture.o.start(d.ops.API)
        action = 'start:' + d.ops.WORKER
        old = d.request(self.root, action, self.fixture.d.guard(), now=1000)
        d.record(self.root, action, fence(), old['nonce'], now=1001,
                 guard=self.fixture.d.guard())
        d.proof_path(self.root, action, 1).rename(d.consumed_path(self.root, action, 1))
        # Linux R/S changed without a restart; the incident's failed check was
        # before start-intent, so a separate proof may recover this exact state.
        api = self.fixture.d.live[d.ops.API]['pid']
        self.fixture.d.proc[str(api)]['state'] = 'R'
        new = d.request(self.root, action, self.fixture.d.guard(), now=1002,
                        driver=self.fixture.d)
        self.assertEqual(new['attempt'], 2)
        self.fixture.o.start(d.ops.WORKER)
        d.record(self.root, action, fence(), new['nonce'], now=1003,
                 guard=self.fixture.d.guard())
        d.proof_path(self.root, action, 2).rename(d.consumed_path(self.root, action, 2))
        with self.assertRaisesRegex(RuntimeError, 'start_already_attempted'):
            d.request(self.root, action, self.fixture.d.guard(), now=1004,
                      driver=self.fixture.d)

    def test_renewal_rejects_competing_successor_and_reused_pid(self):
        self.fixture.o.stop()
        action = 'start:' + d.ops.API
        old = d.request(self.root, action, self.fixture.d.guard(), now=1000)
        d.record(self.root, action, fence(), old['nonce'], now=1001,
                 guard=self.fixture.d.guard())
        self.fixture.d.add(self.fixture.new['apps'][0])
        with self.assertRaisesRegex(RuntimeError, 'successor_order_or_owner_conflict'):
            d.request(self.root, action, self.fixture.d.guard(), now=1302,
                      driver=self.fixture.d)
        self.fixture.d.live.pop(d.ops.API)
        front = self.fixture.d.live[d.ops.FRONT]['pid']
        self.fixture.d.proc[str(front)]['ticks'] = 'reused'
        # A new start request still cannot pass the source frontend identity.
        with self.assertRaisesRegex(RuntimeError, 'frontend_identity_changed|successor_identity_changed'):
            d.request(self.root, action, self.fixture.d.guard(), now=1302,
                      driver=self.fixture.d)

    def test_stop_after_partial_mutation_cannot_be_renewed(self):
        action = 'stop-pair'
        old = d.request(self.root, action, self.fixture.d.guard(), now=1000)
        d.record(self.root, action, fence(), old['nonce'], now=1001,
                 guard=self.fixture.d.guard())
        self.fixture.o.stop()
        d.proof_path(self.root, action, 1).rename(d.consumed_path(self.root, action, 1))
        with self.assertRaisesRegex(RuntimeError, 'completed_action_cannot_renew'):
            d.request(self.root, action, self.fixture.d.guard(), now=1302,
                      driver=self.fixture.d)
        # The bound partial-return route still works, without resurrecting an
        # old executor or starting a new one before the exit certificate.
        import copy
        source = copy.deepcopy(self.fixture.new)
        source['apps'][2] = self.fixture.old['apps'][2]
        recovery = self.fixture.folder('return-partial', source, self.fixture.old,
                                       recovery=True)
        op = d.ops.Operations(recovery, self.fixture.d)
        op.stop(recovery=True)
        op.start(d.ops.API)
        op.start(d.ops.WORKER)
        self.assertEqual(set(self.fixture.d.live), d.ops.NAMES)

    def test_controlled_clock_switch_delay_failure_and_partial_return(self):
        fake = self.fixture.d
        def authorize(root, action, at):
            challenge = d.request(root, action, fake.guard(), now=at)
            d.record(root, action, fence(), challenge['nonce'], now=at + 1,
                     guard=fake.guard())
            verifier = d.DelegatedSystem(root, action, clock=lambda: at + 2)
            verifier.guard = fake.guard
            self.assertEqual(verifier.proof()['request']['nonce'], challenge['nonce'])
            return challenge

        authorize(self.root, 'stop-pair', 1000)
        self.fixture.o.stop()
        self.assertEqual(set(fake.live), {d.ops.FRONT})
        d.proof_path(self.root, 'stop-pair').rename(d.consumed_path(self.root, 'stop-pair'))

        action = 'start:' + d.ops.API
        first = authorize(self.root, action, 1010)
        expired = d.DelegatedSystem(self.root, action, clock=lambda: 1312)
        expired.guard = fake.guard
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_expired'):
            expired.proof()
        renewed = d.request(self.root, action, fake.guard(), now=1312, driver=fake)
        self.assertNotEqual(first['nonce'], renewed['nonce'])
        with self.assertRaisesRegex(RuntimeError, 'owner_request_replay_or_wrong_nonce'):
            d.record(self.root, action, fence(), first['nonce'], now=1313,
                     guard=fake.guard())
        d.record(self.root, action, fence(), renewed['nonce'], now=1313,
                 guard=fake.guard())
        current = d.DelegatedSystem(self.root, action, clock=lambda: 1314)
        current.guard = fake.guard
        current.proof()
        self.fixture.o.start(d.ops.API)
        d.proof_path(self.root, action).rename(d.consumed_path(self.root, action))
        self.assertEqual(set(fake.live), {d.ops.FRONT, d.ops.API})

        authorize(self.root, 'start:' + d.ops.WORKER, 1320)
        fake.fail_start = True
        with self.assertRaisesRegex(RuntimeError, 'simulated_start_failure'):
            self.fixture.o.start(d.ops.WORKER)
        fake.fail_start = False
        self.assertTrue((self.root / ('start-intent-' + d.ops.WORKER + '.json')).exists())
        self.assertEqual(set(fake.live), {d.ops.FRONT, d.ops.API})
        d.proof_path(self.root, 'start:' + d.ops.WORKER).rename(
            d.consumed_path(self.root, 'start:' + d.ops.WORKER))
        with self.assertRaisesRegex(RuntimeError, 'start_already_attempted'):
            d.request(self.root, 'start:' + d.ops.WORKER, fake.guard(), now=1323,
                      driver=fake)

        import copy
        source = copy.deepcopy(self.fixture.new)
        source['apps'][2] = self.fixture.old['apps'][2]
        recovery = self.fixture.folder('return-partial', source, self.fixture.old,
                                       recovery=True)
        authorize(recovery, 'recover-partial', 1330)
        returning = d.ops.Operations(recovery, fake)
        returning.stop(recovery=True)
        self.assertEqual(set(fake.live), {d.ops.FRONT})
        authorize(recovery, 'start:' + d.ops.API, 1340)
        returning.start(d.ops.API)
        authorize(recovery, 'start:' + d.ops.WORKER, 1350)
        returning.start(d.ops.WORKER)
        self.assertEqual(set(fake.live), d.ops.NAMES)
        self.assertEqual({a['name']: a['cfg'] for a in fake.apps()},
                         {a['name']: a for a in self.fixture.old['apps']})
        self.assertEqual(sum(str(x).startswith('start:' + d.ops.WORKER)
                             for x in fake.calls), 2)  # one failed switch, one return
        self.assertNotIn('provider', repr(fake.calls))

    def test_controlled_clock_complete_switch_saves_only_full_set(self):
        fake = self.fixture.d
        def authorize(action, at):
            challenge = d.request(self.root, action, fake.guard(), now=at)
            d.record(self.root, action, fence(), challenge['nonce'], now=at + 1,
                     guard=fake.guard())
            verifier = d.DelegatedSystem(self.root, action, clock=lambda: at + 2)
            verifier.guard = fake.guard
            verifier.proof()

        authorize('stop-pair', 1000)
        self.fixture.o.stop()
        self.assertEqual(set(fake.live), {d.ops.FRONT})
        authorize('start:' + d.ops.API, 1010)
        self.fixture.o.start(d.ops.API)
        authorize('start:' + d.ops.WORKER, 1020)
        self.fixture.o.start(d.ops.WORKER)
        authorize('stop-front', 1030)
        self.fixture.o.stop(frontend=True)
        self.assertEqual(set(fake.live), {d.ops.API, d.ops.WORKER})
        authorize('start:' + d.ops.FRONT, 1040)
        self.fixture.o.start(d.ops.FRONT)
        authorize('unfence', 1050)
        d.DelegatedControls(self.root, fake).unfence()
        self.assertEqual(set(fake.live), d.ops.NAMES)
        self.assertTrue((self.root / 'owner-unfence-authorized.json').exists())
        self.assertEqual(sum(x == (d.ops.PM, 'save') for x in fake.calls), 1)
        self.assertNotIn('provider', repr(fake.calls))

    def test_future_proof_denied(self):
        driver = self.proof()
        driver.clock = lambda: 0
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_expired'):
            driver.proof()

    def test_wrong_root_proof_denied(self):
        driver = self.proof()
        r = json.loads(d.request_path(self.root, 'stop-pair').read_text())
        r['root'] = '/another/direction'
        d.request_path(self.root, 'stop-pair').write_text(json.dumps(r))
        with self.assertRaisesRegex(RuntimeError, 'owner_request_binding_drift'):
            driver.proof()

    def test_wrong_nonce_denied(self):
        driver = self.proof()
        r = json.loads(d.request_path(self.root, 'stop-pair').read_text())
        r['nonce'] = 'other'
        d.request_path(self.root, 'stop-pair').write_text(json.dumps(r))
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_request_mismatch'):
            driver.proof()

    def test_missing_proof_denies_before_process_commands(self):
        d.request(self.root, 'stop-pair', self.fixture.d.guard())
        with self.assertRaises(FileNotFoundError):
            d.DelegatedSystem(self.root, 'stop-pair').proof()
        self.assertEqual(self.fixture.d.calls, [])

    def test_wrong_fence_denied(self):
        bad = fence()
        bad['nftables'][2]['rule']['expr'][0]['match']['right']['set'] = [3001]
        with self.assertRaisesRegex(RuntimeError, 'fence_expression_drift'):
            self.proof(nft=bad)

    def test_generation_change_denies_proof(self):
        driver = self.proof()
        self.fixture.d.g['generation'] += 1
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_generation_or_configuration_drift'):
            driver.proof()

    def test_configuration_change_denies_proof(self):
        driver = self.proof()
        with (self.root / 'candidate.config.private.json').open('a') as f:
            f.write('\n')
        with self.assertRaisesRegex(RuntimeError, 'owner_proof_generation_or_configuration_drift'):
            driver.proof()

    def test_absence_proof_cannot_authorize_stop(self):
        with self.assertRaisesRegex(RuntimeError, 'fence_structure_drift'):
            self.proof(nft={'nftables': []})

    def test_preflight_requires_no_fence(self):
        with self.assertRaisesRegex(RuntimeError, 'transition_fence_still_present'):
            self.proof(action='preflight')

    def test_no_sudo_execution_even_if_owner_authenticated(self):
        driver = d.DelegatedSystem(self.root, 'stop-pair')
        with self.assertRaisesRegex(RuntimeError, 'executor_must_not_use_sudo'):
            driver.run(['sudo', '-n', 'true'])

    def test_shared_window_lock_denies_parallel_executor_across_modes(self):
        other = self.fixture.folder('return', self.fixture.new, self.fixture.old)
        with d.operation_lock(self.root):
            with self.assertRaises(BlockingIOError):
                with d.operation_lock(other):
                    self.fail('parallel executor acquired window lock')
            contender = subprocess.run([
                sys.executable, '-c',
                'import fcntl,sys; p=open(sys.argv[1],"a+"); '
                'fcntl.flock(p.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)',
                str(self.fixture.window / 'operator.lock')], capture_output=True)
            self.assertNotEqual(contender.returncode, 0)
            self.assertIn(b'BlockingIOError', contender.stderr)

    def test_delegated_enter_verifies_without_privileged_commands(self):
        d.DelegatedControls(self.root, self.fixture.d).enter()
        self.assertEqual(self.fixture.d.calls, [])

    def test_unfence_only_authorizes_after_complete_save(self):
        self.fixture.all_started()
        d.DelegatedControls(self.root, self.fixture.d).unfence()
        self.assertTrue((self.root / 'owner-unfence-authorized.json').exists())
        self.assertIn((d.ops.PM, 'save'), self.fixture.d.calls)
        self.assertFalse(any(isinstance(c, tuple) and c[0] == 'sudo'
                             for c in self.fixture.d.calls))

    def test_partial_successors_do_not_authorize_owner_unfence(self):
        self.fixture.o.stop()
        self.fixture.o.start(d.ops.API)
        with self.assertRaisesRegex(RuntimeError, 'incomplete_process_set'):
            d.DelegatedControls(self.root, self.fixture.d).unfence()
        self.assertFalse((self.root / 'owner-unfence-authorized.json').exists())

    def test_old_executor_survival_still_blocks(self):
        self.fixture.test_live_executor_blocks_certificate_and_successor()

    def test_old_socket_still_blocks(self):
        self.fixture.test_remaining_socket_blocks_certificate()

    def test_old_child_still_blocks(self):
        self.fixture.test_live_child_blocks_certificate()

    def test_unknown_database_owner_still_blocks(self):
        self.fixture.test_unknown_db_owner_blocks_certificate()

    def test_database_lock_still_blocks(self):
        self.fixture.test_advisory_lock_blocks_certificate()

    def test_full_switch_return_retains_both_exit_barriers(self):
        self.fixture.test_switch_and_return_same_pair_and_frontend_barrier()

    def prepare_fake(self):
        fake = self.fixture.d
        fake.proof = lambda: {'validated': True}
        old_run = fake.run
        def run(args, text=None):
            if args == ['crontab', '-']:
                fake.calls.append(tuple(args))
                fake.cron = text
                return ''
            return old_run(args, text)
        fake.run = run
        old_read = Path.read_bytes
        def read_bytes(path):
            if str(path) == '/etc/cron.d/re7-converta-backup':
                return fake.system_cron.encode()
            return old_read(path)
        return patch.object(Path, 'read_bytes', read_bytes)

    def test_prepare_changes_only_user_cron_after_closed_guard(self):
        fake = self.fixture.d
        fake.cron, fake.system_cron = 'before-deploy', 'before-system'
        fake.supervision = self.fixture.initial['supervision']
        with self.prepare_fake():
            d.DelegatedControls(self.root, fake).prepare()
        self.assertEqual(fake.cron, 'window-deploy')
        self.assertEqual(fake.system_cron, 'before-system')
        self.assertEqual(fake.supervision, self.fixture.initial['supervision'])
        self.assertFalse(any(isinstance(c, tuple) and c[0] == 'sudo' for c in fake.calls))

    def test_prepare_open_guard_changes_nothing(self):
        self.fixture.d.g['open'] = True
        with self.prepare_fake(), self.assertRaisesRegex(RuntimeError, 'guard_not_closed_drained'):
            d.DelegatedControls(self.root, self.fixture.d).prepare()
        self.assertEqual(self.fixture.d.calls, [])

    def restore_fake(self):
        self.fixture.all_started()
        self.fixture.new['apps'][0]['env']['CAMPAIGN_BUILD_ID'] = 'new'
        (self.root / 'candidate.config.private.json').write_text(json.dumps(self.fixture.new))
        self.fixture.d.live[d.ops.API]['cfg']['env']['CAMPAIGN_BUILD_ID'] = 'new'
        (self.root / 'after-unfence.json').write_text(json.dumps({
            'workerHealth': True, 'health': [{'ok': True, 'db': 'ok'}], 'guard': {'build': 'new'}}))
        self.fixture.d.supervision = self.fixture.initial['supervision']
        self.fixture.d.system_cron = 'before-system'

    def test_finish_verifies_owner_restoration_and_restores_only_user_cron(self):
        self.restore_fake()
        with self.prepare_fake():
            d.DelegatedControls(self.root, self.fixture.d).finish()
        self.assertEqual(self.fixture.d.cron, 'before-deploy')
        self.assertFalse(any(isinstance(c, tuple) and c[0] == 'sudo' for c in self.fixture.d.calls))

    def test_finish_denies_wrong_owner_system_cron(self):
        self.restore_fake()
        self.fixture.d.system_cron = 'window-system'
        with self.prepare_fake(), self.assertRaisesRegex(RuntimeError, 'system_cron_restore_failed'):
            d.DelegatedControls(self.root, self.fixture.d).finish()
        self.assertEqual(self.fixture.d.cron, 'window-deploy')

    def test_finish_denies_wrong_owner_supervision(self):
        self.restore_fake()
        self.fixture.d.supervision = 'ActiveState=inactive\nUnitFileState=disabled\n'
        with self.prepare_fake(), self.assertRaisesRegex(RuntimeError, 'supervision_restore_failed'):
            d.DelegatedControls(self.root, self.fixture.d).finish()
        self.assertEqual(self.fixture.d.cron, 'window-deploy')


if __name__ == '__main__':
    unittest.main(verbosity=2)
