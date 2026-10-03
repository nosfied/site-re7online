"""In-memory process/command simulation; operational CLI is never executed."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys
import os

ROOT = Path(os.environ['AF26_V4_PACKAGE']).resolve()
sys.path.insert(0, str(ROOT / 'switch'))
spec = importlib.util.spec_from_file_location('ops', ROOT / 'switch' / 'ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def configs(version):
    return {'apps': [{'name': n, 'cwd': '/sim/' + version + '/' + n,
       'script': '/sim/' + version + '/' + n + '/index.js', 'interpreter': '/sim/node',
       'env': {'BUILD': version, 'PORT': '3001', 'DATABASE_URL': 'postgresql://127.0.0.1:55432/synthetic'},
       'watch': False} for n in [ops.API, ops.WORKER, ops.FRONT]]}


class Fake:
    def __init__(self, cfg):
        self.live = {}
        self.proc = {}
        self.sockets = set()
        self.calls = []
        self.g = {'open': False, 'tasks': [], 'generation': 7, 'ledgerFault': None}
        self.restarts = 0
        self.survive = False
        self.socket_survive = False
        self.db = {'otherClientBackends': 0, 'advisoryLocks': 0}
        self.contained = True
        self.after_delete = None
        self.on_start = None
        self.fail_start = False
        self.missing_artifact = False
        self.pid = 100
        self.cron = 'window-deploy'
        self.system_cron = 'window-system'
        self.supervision = 'ActiveState=inactive\nUnitFileState=disabled\n'
        for c in cfg['apps']:
            self.add(c)

    def add(self, c):
        self.pid += 10
        pid = self.pid
        self.live[c['name']] = {'name': c['name'], 'pid': pid, 'cfg': copy.deepcopy(c),
            'pm2_env': {'status': 'online', 'watch': False, 'restart_time': self.restarts}}
        self.proc[str(pid)] = {'state': 'S', 'ticks': str(pid * 100)}
        self.proc[str(pid + 1)] = {'state': 'S', 'ticks': str(pid * 100 + 1)}
        self.sockets.add(str(pid * 10))

    def apps(self):
        return list(self.live.values())

    def guard(self):
        return self.g

    def identity(self, pid):
        # /proc reads return a snapshot, not a reference to mutable fake state.
        return copy.deepcopy(self.proc.get(str(pid)))

    def tree(self, pid):
        return {str(pid): copy.deepcopy(self.proc[str(pid)]), str(pid + 1): copy.deepcopy(self.proc[str(pid + 1)])}

    def socket_ids(self, trees):
        return [str(int(next(iter(t))) * 10) for t in trees]

    def sockets_present(self, captured):
        return bool(set(captured) & self.sockets)

    def containment(self, window):
        ops.require(self.contained, 'simulated_containment_failure')

    def renewal_containment(self, window):
        ops.require(self.contained and self.cron == 'window-deploy' and
                    self.system_cron == 'window-system' and
                    'UnitFileState=disabled' in self.supervision,
                    'simulated_renewal_containment_failure')

    def db_zero(self):
        self.calls.append('read-only-db-owner-check')
        return self.db

    def db_only_successor_api(self, pid, identity, database_url, bindings):
        self.calls.append('read-only-api-db-owner-check')
        ops.require(self.db == {'otherClientBackends': 0, 'advisoryLocks': 0}, 'unknown_db_owner')

    def capture_auth(self, root, apps):
        self.calls.append('capture-current-auth-not-restored')

    def delete(self, name):
        self.calls.append('delete:' + name)
        a = self.live.pop(name)
        if not self.survive:
            self.proc.pop(str(a['pid']))
            self.proc.pop(str(a['pid'] + 1))
        if not self.socket_survive:
            self.sockets.discard(str(a['pid'] * 10))
        if self.after_delete:
            self.after_delete(name)

    def start(self, root, name):
        self.calls.append('start:' + name)
        if self.fail_start:
            raise RuntimeError('simulated_start_failure')
        c = json.loads((root / 'candidate.config.private.json').read_text())['apps']
        self.add(next(a for a in c if a['name'] == name))
        if self.on_start:
            self.on_start(name)

    def check_config(self, app, cfg):
        ops.require(app['cfg'] == cfg, 'simulated_config_drift')

    def wait(self):
        self.calls.append('bounded-wait')

    def path_exists(self, path):
        return not self.missing_artifact

    def validate_bindings(self, window, config):
        self.calls.append('auth-realpath-check-not-restore')

    def run(self, args, text=None):
        self.calls.append(tuple(args))
        if args[:2] == ['crontab', '-l']:
            return self.cron
        if args[:1] == ['crontab']:
            self.cron = Path(args[1]).read_text()
        if args[:1] == ['cat']:
            return self.system_cron
        if args[:2] == ['systemctl', 'show']:
            return self.supervision
        if args[:4] == ['sudo', '-n', 'nft', '-j']:
            return json.dumps({'nftables': []})
        if args[:3] == ['sudo', '-n', 'install']:
            self.system_cron = Path(args[-2]).read_text()
        if args[:4] == ['sudo', '-n', 'systemctl', 'disable']:
            self.supervision = 'ActiveState=inactive\nUnitFileState=disabled\n'
        if args[:4] == ['sudo', '-n', 'systemctl', 'enable']:
            self.supervision = 'ActiveState=inactive\nUnitFileState=enabled\n'
        return ''


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.window = self.base / 'window'
        self.window.mkdir()
        (self.window / 'restore-result.json').write_text(json.dumps({'temporaryDatabaseRemoved': True}))
        (self.window / 'db-owner-bindings.private.json').write_text(json.dumps({
            'containerId': 'synthetic', 'containerIp': '10.250.0.2',
            'publishedPort': 5432, 'apiHttpPort': 3001,
            'proxySha256': 'synthetic', 'observerSha256': 'synthetic',
            'proxyIdentity': {'pid': 1, 'ticks': 'synthetic'}}))
        for n, v in [('deploy.crontab.before', 'before-deploy'), ('deploy.crontab.window', 'window-deploy'), ('re7-converta-backup.before', 'before-system'), ('re7-converta-backup.window', 'window-system'), ('automation-fence.nft', 'verified recipe')]:
            (self.window / n).write_text(v)
        self.initial = {'guard': {'open': False}, 'supervision': 'ActiveState=inactive\nUnitFileState=enabled\n'}
        (self.window / 'initial.private.json').write_text(json.dumps(self.initial))
        self.old = configs('old')
        self.new = configs('new')
        self.d = Fake(self.old)
        self.switch = self.folder('switch', self.old, self.new)
        self.o = ops.Operations(self.switch, self.d)

    def tearDown(self):
        self.tmp.cleanup()

    def folder(self, name, source, target, recovery=False, absent=False):
        p = self.base / name
        p.mkdir()
        (p / 'plan.private.json').write_text(json.dumps({'direction': name, 'recovery': recovery, 'frontendAbsentAtRecovery': absent}))
        (p / 'return.config.private.json').write_text(json.dumps(source))
        (p / 'candidate.config.private.json').write_text(json.dumps(target))
        return p

    def pair_started(self):
        self.o.stop()
        self.o.start(ops.API)
        self.o.start(ops.WORKER)

    def all_started(self):
        self.pair_started()
        self.o.stop(frontend=True)
        self.o.start(ops.FRONT)

    def test_switch_and_return_same_pair_and_frontend_barrier(self):
        self.all_started()
        r = self.folder('return', self.new, self.old)
        ro = ops.Operations(r, self.d)
        ro.stop()
        ro.start(ops.API)
        ro.start(ops.WORKER)
        ro.stop(frontend=True)
        ro.start(ops.FRONT)
        self.assertEqual([a['cfg'] for a in self.d.apps()], self.old['apps'])
        self.assertTrue((r / 'frontend-exit-confirmed.json').exists())
        self.assertNotIn('provider', repr(self.d.calls))

    def test_binding_changed_after_proof_blocks_worker_before_intent(self):
        import hashlib
        self.o.stop()
        self.o.start(ops.API)
        path = self.window / 'db-owner-bindings.private.json'
        previous = hashlib.sha256(path.read_bytes()).hexdigest()
        self.d.proof = lambda: {'request': {'dbOwnerBindingsHash': previous}}
        data = json.loads(path.read_text())
        data['proxySha256'] = 'changed-after-proof'
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(RuntimeError, 'db_owner_binding_drift'):
            self.o.start(ops.WORKER)
        self.assertFalse((self.switch / ('start-intent-' + ops.WORKER + '.json')).exists())

    def test_start_without_certificate_denied(self):
        with self.assertRaises(FileNotFoundError):
            self.o.start(ops.API)
        self.assertFalse(any(str(x).startswith('start:') for x in self.d.calls))

    def test_live_executor_blocks_certificate_and_successor(self):
        self.d.survive = True
        with self.assertRaisesRegex(RuntimeError, 'old_executor_alive'):
            self.o.stop()
        self.assertFalse((self.switch / 'old-exit-confirmed.json').exists())
        self.assertIn(ops.WORKER, self.d.live)
        self.assertNotIn('delete:' + ops.WORKER, self.d.calls)

    def test_live_child_blocks_certificate(self):
        original = self.d.delete
        def delete(name):
            pid = self.d.live[name]['pid']
            child = copy.deepcopy(self.d.proc[str(pid + 1)])
            original(name)
            self.d.proc[str(pid + 1)] = child
        self.d.delete = delete
        with self.assertRaisesRegex(RuntimeError, 'old_executor_alive'):
            self.o.stop()

    def test_remaining_socket_blocks_certificate(self):
        self.d.socket_survive = True
        with self.assertRaisesRegex(RuntimeError, 'old_socket_alive'):
            self.o.stop()

    def test_unknown_db_owner_blocks_certificate(self):
        self.d.db['otherClientBackends'] = 1
        with self.assertRaisesRegex(RuntimeError, 'unknown_db_owner'):
            self.o.stop()

    def test_advisory_lock_blocks_certificate(self):
        self.d.db['advisoryLocks'] = 1
        with self.assertRaisesRegex(RuntimeError, 'unknown_db_owner'):
            self.o.stop()

    def test_respawn_blocks_certificate(self):
        self.d.after_delete = lambda n: self.d.add(next(a for a in self.old['apps'] if a['name'] == n))
        with self.assertRaisesRegex(RuntimeError, 'executor_respawned'):
            self.o.stop()

    def test_frontend_changed_during_pair_stop_blocks(self):
        self.d.after_delete = lambda n: self.d.proc[str(self.d.live[ops.FRONT]['pid'])].update(ticks='changed')
        with self.assertRaisesRegex(RuntimeError, 'frontend_identity_changed'):
            self.o.stop()

    def test_frontend_r_to_s_during_pair_stop_is_same_process(self):
        self.d.after_delete = lambda n: self.d.proc[str(self.d.live[ops.FRONT]['pid'])].update(state='R')
        self.o.stop()
        self.assertTrue((self.switch / 'old-exit-confirmed.json').exists())

    def test_zombie_frontend_cannot_be_accepted_as_preserved_owner(self):
        self.o.stop()
        front = self.d.live[ops.FRONT]['pid']
        self.d.proc[str(front)]['state'] = 'Z'
        with self.assertRaisesRegex(RuntimeError, 'frontend_identity_changed'):
            self.o.start(ops.API)
        self.assertNotIn(ops.API, self.d.live)

    def test_guard_generation_changed_before_start_blocks(self):
        self.o.stop()
        self.d.g['generation'] += 1
        with self.assertRaisesRegex(RuntimeError, 'guard_generation_changed'):
            self.o.start(ops.API)

    def test_initial_open_guard_blocks_stop(self):
        self.d.g['open'] = True
        with self.assertRaisesRegex(RuntimeError, 'guard_not_closed_drained'):
            self.o.stop()
        self.assertEqual(self.d.calls, [])

    def test_pending_tasks_or_fault_blocks(self):
        for key, value in [('tasks', ['one']), ('ledgerFault', 'fault')]:
            with self.subTest(key=key):
                self.d.g[key] = value
                with self.assertRaisesRegex(RuntimeError, 'guard_not_closed_drained'):
                    self.o.stop()
                self.d.g[key] = [] if key == 'tasks' else None

    def test_containment_failure_blocks_delete(self):
        self.d.contained = False
        with self.assertRaisesRegex(RuntimeError, 'containment_failure'):
            self.o.stop()
        self.assertEqual(self.d.calls, [])

    def test_restore_proof_missing_blocks(self):
        (self.window / 'restore-result.json').unlink()
        with self.assertRaises(FileNotFoundError):
            self.o.stop()
        self.assertEqual(self.d.calls, [])

    def test_duplicate_stop_not_repeated(self):
        self.o.stop()
        with self.assertRaises(RuntimeError):
            self.o.stop()
        self.assertEqual(sum(str(x).startswith('delete:') for x in self.d.calls), 2)

    def test_worker_before_api_denied(self):
        self.o.stop()
        with self.assertRaisesRegex(RuntimeError, 'successor_order'):
            self.o.start(ops.WORKER)

    def test_missing_artifact_denied(self):
        self.o.stop()
        self.d.missing_artifact = True
        with self.assertRaisesRegex(RuntimeError, 'artifact_missing'):
            self.o.start(ops.API)

    def test_restarted_successor_not_accepted(self):
        self.o.stop()
        self.d.restarts = 1
        with self.assertRaisesRegex(RuntimeError, 'successor_restarted'):
            self.o.start(ops.API)
        self.assertFalse((self.switch / ('started-' + ops.API + '.json')).exists())

    def test_changed_configuration_denied(self):
        self.d.live[ops.API]['cfg']['env']['BUILD'] = 'other'
        with self.assertRaisesRegex(RuntimeError, 'config_drift'):
            self.o.stop()
        self.assertEqual(self.d.calls, [])

    def test_return_cannot_use_switch_certificate(self):
        self.o.stop()
        r = self.folder('return', self.new, self.old)
        (r / 'old-exit-confirmed.json').write_bytes((self.switch / 'old-exit-confirmed.json').read_bytes())
        with self.assertRaisesRegex(RuntimeError, 'stale_or_wrong_certificate'):
            ops.Operations(r, self.d).start(ops.API)

    def test_partial_api_started_recovered_without_overlap(self):
        self.o.stop()
        self.o.start(ops.API)
        source = copy.deepcopy(self.new)
        source['apps'][2] = self.old['apps'][2]
        r = self.folder('return-partial', source, self.old, recovery=True)
        ro = ops.Operations(r, self.d)
        ro.stop(recovery=True)
        ro.start(ops.API)
        ro.start(ops.WORKER)
        self.assertEqual(self.d.live[ops.API]['cfg'], self.old['apps'][0])

    def test_no_successor_after_pair_stop_recoverable(self):
        self.o.stop()
        source = copy.deepcopy(self.new)
        source['apps'][2] = self.old['apps'][2]
        r = self.folder('return-partial', source, self.old, recovery=True)
        ro = ops.Operations(r, self.d)
        ro.stop(recovery=True)
        ro.start(ops.API)
        ro.start(ops.WORKER)

    def test_failed_front_start_recovered_with_new_front_certificate(self):
        self.pair_started()
        self.o.stop(frontend=True)
        r = self.folder('return-front-missing', self.new, self.old, recovery=True, absent=True)
        ro = ops.Operations(r, self.d)
        ro.stop(recovery=True)
        ro.start(ops.API)
        ro.start(ops.WORKER)
        ro.start(ops.FRONT)
        self.assertEqual(self.d.live[ops.FRONT]['cfg'], self.old['apps'][2])

    def test_partial_recovery_old_executor_alive_denied(self):
        self.o.stop()
        saved = json.loads((self.switch / 'stop-start.json').read_text())
        pid, ident = next(iter(saved['trees'][ops.API].items()))
        self.d.proc[pid] = ident
        source = copy.deepcopy(self.new)
        source['apps'][2] = self.old['apps'][2]
        r = self.folder('return-partial', source, self.old, recovery=True)
        with self.assertRaisesRegex(RuntimeError, 'old_executor_alive'):
            ops.Operations(r, self.d).stop(recovery=True)

    def test_front_exit_certificate_required(self):
        self.pair_started()
        with self.assertRaises(FileNotFoundError):
            self.o.start(ops.FRONT)

    def test_front_survivor_denied(self):
        self.pair_started()
        self.d.survive = True
        with self.assertRaisesRegex(RuntimeError, 'old_executor_alive'):
            self.o.stop(frontend=True)

    def test_fence_counter_values_do_not_weaken_rule_check(self):
        fence = {'nftables': [{'table': {'family': 'inet', 'name': 're7_campaign_transition'}},
            {'chain': {'family': 'inet', 'table': 're7_campaign_transition', 'name': 'api_input', 'type': 'filter', 'hook': 'input', 'prio': -10, 'policy': 'accept'}},
            {'rule': {'family': 'inet', 'table': 're7_campaign_transition', 'chain': 'api_input', 'expr': [{'match': {'op': '==', 'left': {'payload': {'protocol': 'tcp', 'field': 'dport'}}, 'right': {'set': [3000, 3001]}}}, {'counter': {'packets': 45, 'bytes': 900}}, {'reject': {'type': 'tcp reset'}}]}}]}
        ops.check_fence(fence)
        fence['nftables'][2]['rule']['expr'][0]['match']['right']['set'] = [3001]
        with self.assertRaisesRegex(RuntimeError, 'fence_expression_drift'):
            ops.check_fence(fence)

    def test_containment_preserves_supervision_and_no_intermediate_save(self):
        self.d.cron = 'before-deploy'
        self.d.system_cron = 'before-system'
        self.d.supervision = self.initial['supervision']
        ops.Controls(self.switch, self.d).enter()
        self.assertEqual(self.d.cron, 'window-deploy')
        self.assertIn('disabled', self.d.supervision)
        self.assertFalse(any('save' in str(x) for x in self.d.calls))

    def test_restore_controls_requires_technical_validation(self):
        with self.assertRaises(FileNotFoundError):
            ops.Controls(self.switch, self.d).finish()
        self.assertEqual(self.d.calls, [])

    def test_restore_exact_cron_and_initial_enabled_inactive(self):
        self.all_started()
        (self.switch / 'after-unfence.json').write_text(json.dumps({'workerHealth': True, 'health': [{'ok': True, 'db': 'ok'}], 'guard': {'build': 'new'}}))
        self.o.target[ops.API]['env']['CAMPAIGN_BUILD_ID'] = 'new'
        self.d.live[ops.API]['cfg']['env']['CAMPAIGN_BUILD_ID'] = 'new'
        cfg = self.new
        cfg['apps'][0]['env']['CAMPAIGN_BUILD_ID'] = 'new'
        (self.switch / 'candidate.config.private.json').write_text(json.dumps(cfg))
        ops.Controls(self.switch, self.d).finish()
        self.assertEqual(self.d.cron, 'before-deploy')
        self.assertEqual(self.d.system_cron, 'before-system')
        self.assertEqual(self.d.supervision, self.initial['supervision'])

    def test_unknown_pm2_application_blocks_all_deletes(self):
        extra = configs('old')['apps'][0]
        extra['name'] = 'unknown-owner'
        self.d.add(extra)
        with self.assertRaisesRegex(RuntimeError, 'unknown_pm2_process'):
            self.o.stop()
        self.assertEqual(self.d.calls, [])

    def test_start_failure_requires_new_recovery_barrier(self):
        self.o.stop()
        self.d.fail_start = True
        with self.assertRaisesRegex(RuntimeError, 'simulated_start_failure'):
            self.o.start(ops.API)
        self.d.fail_start = False
        with self.assertRaises(FileExistsError):
            self.o.start(ops.API)
        source = copy.deepcopy(self.new)
        source['apps'][2] = self.old['apps'][2]
        r = self.folder('return-partial', source, self.old, recovery=True)
        ro = ops.Operations(r, self.d)
        ro.stop(recovery=True)
        ro.start(ops.API)
        self.assertTrue((r / 'old-exit-confirmed.json').exists())

    def test_incomplete_pair_is_not_regular_return(self):
        self.o.stop()
        self.o.start(ops.API)
        r = self.folder('return', self.new, self.old)
        with self.assertRaisesRegex(RuntimeError, 'unexpected_partial_composition'):
            ops.Operations(r, self.d).stop()

    def test_pid_reuse_does_not_count_as_old_executor(self):
        self.o.stop()
        prior = json.loads((self.switch / 'stop-start.json').read_text())
        pid = next(iter(prior['trees'][ops.API]))
        self.d.proc[pid] = {'state': 'S', 'ticks': 'different-start-ticks'}
        self.o.start(ops.API)

    def test_duplicate_start_not_submitted_twice(self):
        self.o.stop()
        self.o.start(ops.API)
        with self.assertRaisesRegex(RuntimeError, 'successor_order'):
            self.o.start(ops.API)
        self.assertEqual(self.d.calls.count('start:' + ops.API), 1)

    def test_restoration_preserves_initially_disabled_supervision(self):
        self.initial['supervision'] = 'ActiveState=inactive\nUnitFileState=disabled\n'
        (self.window / 'initial.private.json').write_text(json.dumps(self.initial))
        self.test_restore_exact_cron_and_initial_enabled_inactive()
        self.assertFalse(any(isinstance(x, tuple) and x[:4] == ('sudo', '-n', 'systemctl', 'enable') for x in self.d.calls))

    def test_operational_cli_rejects_local_directory(self):
        with self.assertRaisesRegex(RuntimeError, 'not_bound_remote_preparation'):
            ops.main('stop-pair', self.switch)
        self.assertEqual(self.d.calls, [])

    def test_unfence_only_after_complete_verified_set(self):
        self.all_started()
        ops.Controls(self.switch, self.d).unfence()
        calls = self.d.calls
        save = calls.index((ops.PM, 'save'))
        remove = calls.index(('sudo', '-n', 'nft', 'delete', 'table', 'inet', 're7_campaign_transition'))
        self.assertLess(save, remove)
        self.assertEqual(sum(x == (ops.PM, 'save') for x in calls), 1)

    def test_unfence_denied_for_incomplete_start(self):
        self.o.stop()
        self.o.start(ops.API)
        with self.assertRaisesRegex(RuntimeError, 'incomplete_process_set'):
            ops.Controls(self.switch, self.d).unfence()
        self.assertNotIn((ops.PM, 'save'), self.d.calls)

    def test_successor_changed_before_worker_start_denied(self):
        self.o.stop()
        self.o.start(ops.API)
        pid = self.d.live[ops.API]['pid']
        self.d.proc[str(pid)]['ticks'] = 'replaced'
        with self.assertRaisesRegex(RuntimeError, 'successor_identity_changed'):
            self.o.start(ops.WORKER)

    def test_bound_cores_equal_exact_tested_copy(self):
        expected = (ROOT / 'switch/ops.py').read_bytes()
        delegated = (ROOT / 'switch/delegated.py').read_bytes()
        for mode in ['return', 'return-partial', 'return-front-missing']:
            self.assertEqual((ROOT / mode / 'ops.py').read_bytes(), expected)
            self.assertEqual((ROOT / mode / 'delegated.py').read_bytes(), delegated)
        for module in ['db_owner_set_gate.py', 'db_owner_set_observer.py']:
            expected_module = (ROOT / 'switch' / module).read_bytes()
            for mode in ['return', 'return-partial', 'return-front-missing']:
                self.assertEqual((ROOT / mode / module).read_bytes(), expected_module)

    def test_system_listing_cannot_resurrect_missing_pm2_daemon(self):
        from unittest.mock import patch
        system = ops.System()
        system.run = lambda *args: self.fail('PM2 command must not run')
        with patch.object(ops.Path, 'is_file', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'pm2_daemon_missing_no_respawn'):
                system.apps()


if __name__ == '__main__':
    unittest.main(verbosity=2)
