"""Single sequential executor for the reviewed V4 protocol.

No simulation option exists in the CLI. Tests inject a fake Bridge directly.
The old package is ineligible: its preflight request already exists.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
from urllib import request

API = 're7-whatsapp-agent'
WORKER = 're7-whatsapp-web-worker'
FRONT = 're7-admin-front'
PRIV = '/usr/local/libexec/re7/incident-6683-window-control.py'
GUARD = Path('/var/lib/re7/campaign-operations/state.json')
PREPARATIONS = Path('/opt/re7online/backups/converta-persistent/preparations')


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def guard_state(value):
    require(type(value) is dict and type(value.get('version')) is int and
            value['version'] == 1 and type(value.get('open')) is bool and
            type(value.get('generation')) is int and value['generation'] >= 0 and
            type(value.get('tasks')) is dict and type(value.get('audit')) is list,
            'guard_schema_invalid')
    return value


def same_identity(saved, current):
    return bool(saved and current and saved['ticks'] == current['ticks'] and
                current['state'] != 'Z')


class Bridge:
    def __init__(self, root):
        self.root = Path(root).resolve()
        require(self.root.parent == PREPARATIONS and
                self.root.name.startswith('incident-6683-v4-'), 'preparation_path_denied')
        self.switch = self.root / 'switch'
        self.window = self.root / 'window'

    def run(self, args, *, input_text=None, cwd=None):
        result = subprocess.run(args, input=input_text, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                cwd=cwd, check=True)
        return result.stdout

    def guard(self):
        return guard_state(json.loads(GUARD.read_text()))

    def apps(self):
        pm = '/home/deploy/.npm-global/bin/pm2'
        return {a['name']: a for a in json.loads(self.run([pm, 'jlist']))}

    def identity(self, pid):
        try:
            data = Path('/proc', str(pid), 'stat').read_text().rsplit(')', 1)[1].split()
            return {'state': data[0], 'ticks': data[19]}
        except FileNotFoundError:
            return None

    def expected_config(self, mode, file):
        return {a['name']: a for a in json.loads(
            (self.root / mode / file).read_text())['apps']}

    def app_matches(self, name, config):
        import importlib.util
        spec = importlib.util.spec_from_file_location('v4_ops', self.switch / 'ops.py')
        module = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(self.switch))
        spec.loader.exec_module(module)
        app = self.apps().get(name)
        if app is None:
            return False
        try:
            module.Operations(self.root / 'switch', module.System()).config(app, config[name])
        except Exception:
            return False
        return True

    def node(self, mode, script):
        require(mode in {'switch', 'return', 'return-partial'} and
                script in {'close.cjs', 'validate.cjs', 'open.cjs'},
                'node_step_denied')
        try:
            return self.run(['node', str(self.root / mode / script)])
        except subprocess.CalledProcessError as error:
            # Keep the exact output in the private preparation, never in the
            # public journal or exception. validate.cjs may expose DB IDs.
            path = self.window / 'step-output.private.jsonl'
            stdout = error.stdout or ''
            stderr = error.stderr or ''
            record = {'utc': time.time(), 'mode': mode, 'step': script,
                      'exitCode': error.returncode,
                      'stdout': stdout[:16384], 'stderr': stderr[:16384],
                      'stdoutBytes': len(stdout.encode()),
                      'stderrBytes': len(stderr.encode()),
                      'stdoutSha256': hashlib.sha256(stdout.encode()).hexdigest(),
                      'stderrSha256': hashlib.sha256(stderr.encode()).hexdigest(),
                      'outputTruncated': (len(stdout) > 16384 or len(stderr) > 16384)}
            fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW,
                         0o600)
            try:
                info = os.fstat(fd)
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                        info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
                        'step_output_permissions')
                os.write(fd, (json.dumps(record, sort_keys=True) + '\n').encode())
                os.fsync(fd)
            finally:
                os.close(fd)
            raise RuntimeError(f'step_failed:{mode}/{script}:exit={error.returncode}') from None

    def privileged(self, action):
        require(action in {'inspect', 'check-absent', 'check-present', 'enter', 'unfence',
                           'restore-controls', 'abort-prestop', 'authorize-switch',
                           'authorize-return'}, 'privileged_action_denied')
        return self.run(['sudo', '-n', '/usr/bin/python3', '-I', '-S', PRIV, action])

    def protocol(self, mode, action):
        root = self.root / mode
        delegated = root / 'delegated.py'
        phase = 'request'
        try:
            payload = json.loads(self.run(['python3', str(delegated), 'request', action, str(root)]))
            phase = 'owner-read'
            read_action = 'check-absent' if action in {
                'preflight', 'prepare-containment', 'verify-unfenced', 'restore-controls'
            } else 'check-present'
            proof = self.privileged(read_action)
            phase = 'record'
            self.run(['python3', str(delegated), 'record', action, str(root), payload['nonce']],
                     input_text=proof)
            phase = 'execute'
            self.run(['python3', str(delegated), 'execute', action, str(root)])
        except Exception as error:
            # A denial before start-intent was previously reported only as a
            # generic CalledProcessError. Keep the cause private and durable.
            stdout = getattr(error, 'stdout', None) or ''
            stderr = getattr(error, 'stderr', None) or ''
            record = {'utc': time.time(), 'mode': mode, 'action': action,
                      'phase': phase, 'errorType': type(error).__name__,
                      'exitCode': getattr(error, 'returncode', None),
                      'stdout': stdout[:16384], 'stderr': stderr[:16384],
                      'stdoutBytes': len(stdout.encode()),
                      'stderrBytes': len(stderr.encode()),
                      'stdoutSha256': hashlib.sha256(stdout.encode()).hexdigest(),
                      'stderrSha256': hashlib.sha256(stderr.encode()).hexdigest(),
                      'outputTruncated': len(stdout) > 16384 or len(stderr) > 16384}
            path = self.window / 'protocol-output.private.jsonl'
            fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                info = os.fstat(fd)
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                        info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
                        'protocol_output_permissions')
                os.write(fd, (json.dumps(record, sort_keys=True) + '\n').encode())
                os.fsync(fd)
            finally:
                os.close(fd)
            raise RuntimeError(f'protocol_failed:{mode}/{action}/{phase}') from None

    def restore_guard(self, config_file):
        config = self.expected_config(config_file[0], config_file[1])[API]
        token = config['env']['ADMIN_TOKEN']
        url = 'http://127.0.0.1:3001/admin/ops/campaign-execution'
        headers = {'X-Admin-Token': token, 'Content-Type': 'application/json'}

        def call(method='GET', body=None):
            data = json.dumps(body).encode() if body is not None else None
            req = request.Request(url, data=data, headers=headers, method=method)
            with request.urlopen(req, timeout=5) as response:
                return json.load(response)

        before = call()
        require(before.get('available') and not before.get('ledgerFault') and
                before.get('tasks') == [] and before.get('drained'), 'guard_not_restorable')
        if before['open']:
            return before
        call('POST', {'open': True, 'generation': before['generation'],
                      'reason': 'Owner-authorized 6683 V4 admission restoration after verified executor state'})
        after = call()
        require(after['open'] and after['generation'] == before['generation'] + 1 and
                after['tasks'] == [] and not after.get('ledgerFault'), 'guard_restore_failed')
        return after

    def pre_unfence(self, mode):
        """Checks possible under nft; port 3001 HTTP is deliberately deferred."""
        require(mode in {'switch', 'return', 'return-partial'}, 'mode_denied')
        self.privileged('check-present')
        guard = self.guard()
        require(not guard['open'] and not guard['tasks'] and
                not guard.get('ledgerFault'), 'guard_not_closed_before_unfence')
        config = self.expected_config(mode, 'candidate.config.private.json')
        apps = self.apps()
        require(set(apps) == {API, WORKER, FRONT}, 'incomplete_process_set')
        for name in (API, WORKER):
            marker = json.loads((self.root / mode / ('started-' + name + '.json')).read_text())
            require(apps[name]['pid'] == marker['pid'] and
                    same_identity(marker['identity'], self.identity(marker['pid'])) and
                    self.app_matches(name, config), 'successor_identity_or_config_drift')
        worker_env = config[WORKER]['env']
        host = worker_env['WHATSAPP_WEB_WORKER_CONTROL_HOST']
        port = int(worker_env['WHATSAPP_WEB_WORKER_CONTROL_PORT'])
        require(host == '127.0.0.1' and port > 0 and port != 3001,
                'worker_control_binding_drift')
        probe = request.Request(f'http://{host}:{port}/health', headers={
            'Authorization': 'Bearer ' + worker_env['WHATSAPP_WEB_WORKER_CONTROL_TOKEN']})
        try:
            with request.urlopen(probe, timeout=5) as response:
                payload = json.load(response)
                require(response.status == 200 and payload.get('ok') is True,
                        'worker_control_unhealthy')
        except Exception:
            raise RuntimeError('worker_control_unavailable_under_fence') from None


class Sequencer:
    def __init__(self, bridge):
        self.b = bridge
        self.root = bridge.root
        self.window = bridge.window
        self.mode = 'switch'
        self.baseline = None

    def journal(self, event, **fields):
        path = self.window / 'sequencer.journal.jsonl'
        row = json.dumps({'utc': time.time(), 'event': event, **fields}, sort_keys=True) + '\n'
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            os.write(fd, row.encode())
            os.fsync(fd)
        finally:
            os.close(fd)

    def eligible(self):
        require(not (self.window / 'aborted-before-containment.private.json').exists(),
                'aborted_package_cannot_reuse')
        manifest = json.loads((self.window / 'sequencer-manifest.json').read_text())
        for name, expected in manifest['filesSha256'].items():
            require(Path(name).name == name and
                    hashlib.sha256((self.window / name).read_bytes()).hexdigest() == expected,
                    'sequencer_source_hash_drift')
        for mode in ('switch', 'return', 'return-partial'):
            self.b.run(['sha256sum', '-c', 'scripts.sha256'], cwd=self.root / mode)
        gates = json.loads((self.window / 'execution-gates.private.json').read_text())
        require(all(gates.get(k) is True for k in (
            'ownerAuthorized', 'preflightReviewed', 'artifactsVerified',
            'restoreVerified', 'discrepanciesResolved')), 'execution_gates_incomplete')
        require(not list((self.root / 'switch').glob('owner-request-preflight*.json')),
                'preflight_proof_emitted_before_close')
        require(not list((self.root / 'switch').glob('start-intent-*.json')),
                'old_start_intent_present')
        expected_policy = (self.window / 'privileged-policy.sha256').read_text().strip()
        observed = json.loads(self.b.privileged('inspect'))
        require(observed == {'policySha256': expected_policy, 'phase': None,
                             'sourceProcessesAlive': True}, 'privileged_policy_drift')
        self.b.privileged('check-absent')

    def capture_baseline(self):
        apps = self.b.apps()
        require(set(apps) == {API, WORKER, FRONT}, 'unexpected_process_set')
        source = self.b.expected_config('switch', 'return.config.private.json')
        require(all(self.b.app_matches(n, source) for n in apps), 'source_config_drift')
        identities = {n: {'pid': a['pid'], 'identity': self.b.identity(a['pid'])}
                      for n, a in apps.items()}
        require(all(v['identity'] and v['identity']['state'] != 'Z'
                    for v in identities.values()), 'source_identity_missing')
        guard = self.b.guard()
        require(guard.get('open') and not guard.get('tasks') and
                not guard.get('ledgerFault'), 'guard_baseline_unexpected')
        self.baseline = {'guardGeneration': guard['generation'], 'apps': identities}
        self.journal('baseline', generation=guard['generation'],
                     processes={k: v['pid'] for k, v in identities.items()})

    def close_then_preflight(self):
        # This order is intentional. No code path requests preflight earlier.
        require(self.baseline is not None, 'baseline_missing')
        require(not list((self.root / 'switch').glob('owner-request-preflight*.json')),
                'preflight_proof_emitted_before_close')
        self.b.node('switch', 'close.cjs')
        guard = self.b.guard()
        require(not guard['open'] and guard['generation'] ==
                self.baseline['guardGeneration'] + 1 and
                not guard['tasks'] and not guard.get('ledgerFault'),
                'guard_close_generation_drift')
        require((self.root / 'switch' / 'drain-result.json').is_file(),
                'drain_result_missing')
        self.journal('guard_closed', generation=guard['generation'])
        self.b.protocol('switch', 'preflight')
        require(self.b.guard()['generation'] == guard['generation'],
                'guard_changed_during_preflight')
        self.journal('preflight_pass', generation=guard['generation'])

    def action(self, mode, action):
        self.journal('action_begin', mode=mode, action=action)
        self.b.protocol(mode, action)
        self.journal('action_pass', mode=mode, action=action)

    def controls_enter(self):
        self.action('switch', 'prepare-containment')
        self.journal('containment_begin')
        self.b.privileged('enter')
        self.action('switch', 'contain')
        self.journal('contained')

    def verify_stopped(self, mode):
        require((self.root / mode / 'old-exit-confirmed.json').is_file(),
                'old_exit_certificate_missing')
        apps = self.b.apps()
        require(set(apps) == {FRONT}, 'old_pair_or_unexpected_process_present')
        front = self.baseline['apps'][FRONT]
        require(apps[FRONT]['pid'] == front['pid'] and
                same_identity(front['identity'], self.b.identity(front['pid'])),
                'frontend_identity_changed')

    def verify_started(self, mode, name):
        require((self.root / mode / ('started-' + name + '.json')).is_file(),
                'started_marker_missing')
        config = self.b.expected_config(mode, 'candidate.config.private.json')
        require(self.b.app_matches(name, config), 'successor_identity_or_config_drift')
        apps = self.b.apps()
        require(name in apps and self.b.identity(apps[name]['pid']) is not None,
                'successor_process_missing')
        front = self.baseline['apps'][FRONT]
        require(apps[FRONT]['pid'] == front['pid'] and
                same_identity(front['identity'], self.b.identity(front['pid'])),
                'frontend_identity_changed')

    def start_pair(self, mode):
        for name in (API, WORKER):
            require(not (self.root / mode / ('start-intent-' + name + '.json')).exists(),
                    'start_intent_already_exists')
            self.action(mode, 'start:' + name)
            self.verify_started(mode, name)

    def finish(self, mode):
        self.b.pre_unfence(mode)
        self.journal('pre_unfence_pass', mode=mode)
        self.action(mode, 'unfence')  # PM2 saved/fallback before traffic.
        require((self.root / mode / 'owner-unfence-authorized.json').exists(),
                'unfence_permit_missing')
        self.b.privileged('authorize-switch' if mode == 'switch' else 'authorize-return')
        self.b.privileged('unfence')
        self.action(mode, 'verify-unfenced')
        self.b.node(mode, 'validate.cjs')
        self.b.node(mode, 'open.cjs')
        require(self.b.guard()['open'], 'guard_not_reopened')
        self.b.privileged('restore-controls')
        self.action(mode, 'restore-controls')
        self.b.privileged('check-absent')
        self.journal('complete', mode=mode, guardGeneration=self.b.guard()['generation'])

    def recovery_mode(self):
        switch = self.root / 'switch'
        if not (switch / 'old-exit-confirmed.json').exists():
            return 'prestop'
        for name in (API, WORKER):
            if (switch / ('start-intent-' + name + '.json')).exists() and not (
                switch / ('started-' + name + '.json')).exists():
                raise RuntimeError('ambiguous_start_intent_requires_observation')
        apps = self.b.apps()
        require(FRONT in apps, 'frontend_missing_cannot_select_return')
        new = self.b.expected_config('switch', 'candidate.config.private.json')
        candidate_api = API in apps and self.b.app_matches(API, new)
        candidate_worker = WORKER in apps and self.b.app_matches(WORKER, new)
        if candidate_worker:
            require(candidate_api and (switch / ('started-' + API + '.json')).exists() and
                    (switch / ('started-' + WORKER + '.json')).exists(),
                    'candidate_pair_state_ambiguous')
            return 'return'
        require(not WORKER in apps, 'unexpected_worker_owner')
        require(not API in apps or candidate_api, 'unexpected_api_owner')
        return 'return-partial'

    def recover(self):
        mode = self.recovery_mode()
        self.journal('recovery_selected', mode=mode)
        if mode == 'prestop':
            original = self.baseline['apps']
            live = self.b.apps()
            require(set(live) == {API, WORKER, FRONT}, 'prestop_process_drift')
            require(all(live[n]['pid'] == original[n]['pid'] and
                        same_identity(original[n]['identity'], self.b.identity(live[n]['pid']))
                        for n in live), 'prestop_identity_drift')
            self.b.privileged('abort-prestop')
            self.b.restore_guard(('switch', 'return.config.private.json'))
            self.journal('prestop_restored')
            return
        self.mode = mode
        self.b.privileged('check-present')
        self.action(mode, 'recover-partial' if mode == 'return-partial' else 'stop-pair')
        self.verify_stopped(mode)
        self.start_pair(mode)
        self.finish(mode)

    def post_unfence_return(self):
        """Fresh return preparation after post-unfence validation failed.

        Requires a separately installed root-owned return policy with a new
        phase. Never reuses the switch policy or any consumed start intent.
        """
        mode = 'return'
        global_lock = self.root.parent / '.incident-6683-window.lock'
        with global_lock.open('a+') as overall:
            fcntl.flock(overall.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            manifest = json.loads((self.window / 'sequencer-manifest.json').read_text())
            for name, expected in manifest['filesSha256'].items():
                require(Path(name).name == name and
                        hashlib.sha256((self.window / name).read_bytes()).hexdigest() == expected,
                        'return_sequencer_source_hash_drift')
            require(not (self.root / mode / ('start-intent-' + API + '.json')).exists() and
                    not (self.root / mode / ('start-intent-' + WORKER + '.json')).exists(),
                    'return_start_intent_already_exists')
            require(not (self.root / mode / 'old-exit-confirmed.json').exists() and
                    not list((self.root / mode).glob('owner-request-*.json')),
                    'return_preparation_already_consumed')
            self.b.run(['sha256sum', '-c', 'scripts.sha256'], cwd=self.root / mode)
            expected_hash = (self.window / 'privileged-policy.sha256').read_text().strip()
            observed = json.loads(self.b.privileged('inspect'))
            require(observed == {'policySha256': expected_hash, 'phase': None,
                                 'sourceProcessesAlive': True}, 'fresh_return_policy_required')
            self.b.privileged('check-absent')
            guard = self.b.guard()
            require(not guard['open'] and not guard['tasks'] and
                    not guard.get('ledgerFault'), 'return_guard_not_closed')
            apps = self.b.apps()
            require(set(apps) == {API, WORKER, FRONT}, 'return_process_set_drift')
            source = self.b.expected_config(mode, 'return.config.private.json')
            require(all(self.b.app_matches(n, source) for n in apps),
                    'return_source_config_drift')
            target = self.b.expected_config(mode, 'candidate.config.private.json')
            require(source[FRONT] == target[FRONT], 'frontend_not_preserved_in_return')
            identities = {n: {'pid': a['pid'], 'identity': self.b.identity(a['pid'])}
                          for n, a in apps.items()}
            require(all(v['identity'] and v['identity']['state'] != 'Z'
                        for v in identities.values()), 'return_source_identity_missing')
            self.baseline = {'guardGeneration': guard['generation'], 'apps': identities}
            self.journal('post_unfence_return_baseline', generation=guard['generation'],
                         processes={n: v['pid'] for n, v in identities.items()})
            self.b.privileged('enter')
            self.b.privileged('check-present')
            self.action(mode, 'stop-pair')
            self.verify_stopped(mode)
            self.start_pair(mode)
            self.finish(mode)
            fcntl.flock(overall.fileno(), fcntl.LOCK_UN)

    def run(self):
        lock = self.window / 'sequencer.lock'
        global_lock = self.root.parent / '.incident-6683-window.lock'
        with global_lock.open('a+') as overall, lock.open('a+') as stream:
            fcntl.flock(overall.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.eligible()
            self.capture_baseline()
            try:
                self.close_then_preflight()
                self.controls_enter()
                self.action('switch', 'stop-pair')
                self.verify_stopped('switch')
                self.start_pair('switch')
                self.finish('switch')
            except Exception as exc:
                self.journal('failure', error=type(exc).__name__ + ':' + str(exc))
                # A candidate already serving traffic must not be stopped by a
                # recovery selected for the earlier fenced/closed phase.
                if self.b.guard()['open']:
                    self.journal('post_open_failure_no_automatic_return')
                    raise RuntimeError('post_open_controls_require_operator') from exc
                if self.recovery_mode() != 'prestop':
                    try:
                        self.b.privileged('check-present')
                    except Exception as fence_error:
                        self.journal('fence_absent_or_unreadable_no_automatic_return',
                                     error=type(fence_error).__name__)
                        raise RuntimeError('fence_not_proven_recovery_blocked') from exc
                try:
                    self.recover()
                except Exception as recovery:
                    self.journal('recovery_blocked', error=type(recovery).__name__ + ':' + str(recovery))
                    raise RuntimeError('window_failed_recovery_blocked') from recovery
                raise RuntimeError('window_failed_returned_to_original') from exc
            finally:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
                fcntl.flock(overall.fileno(), fcntl.LOCK_UN)


def main(argv):
    require(len(argv) in {2, 3}, 'exact_preparation_argument_required')
    os.umask(0o077)
    sequencer = Sequencer(Bridge(argv[1]))
    if len(argv) == 3:
        require(argv[2] == '--post-unfence-return', 'unknown_mode')
        sequencer.post_unfence_return()
    else:
        sequencer.run()


if __name__ == '__main__':
    main(sys.argv)
