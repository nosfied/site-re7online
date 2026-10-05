"""Actual isolated PM2/Node processes; no DB, providers, nft or systemd."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

import privileged as gate

API = 're7-whatsapp-agent'
WORKER = 're7-whatsapp-web-worker'
FRONT = 're7-admin-front'


def require(ok, reason):
    if not ok:
        raise AssertionError(reason)


def run(node, cli, env, *args):
    try:
        return subprocess.check_output([node, cli, *args], env=env,
                                       stderr=subprocess.STDOUT, timeout=25)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('pm2_lab_command_failed:' + str(args) + ':' +
                           error.output.decode(errors='replace')[-600:]) from None


def wait_apps(node, cli, env, names):
    for _ in range(60):
        rows = {a['name']: a for a in json.loads(run(node, cli, env, 'jlist'))}
        online = {n for n, a in rows.items() if a['pm2_env']['status'] == 'online'}
        if online == names:
            return rows
        time.sleep(.1)
    raise AssertionError('pm2_state_unstable')


def expect_deny(call, *codes):
    try:
        call()
    except RuntimeError as error:
        require(any(code in str(error) for code in codes), str(error))
        return str(error)
    raise AssertionError('unexpected_allow')


def main(node, cli):
    node, cli = str(Path(node).resolve()), str(Path(cli).resolve())
    require(subprocess.check_output([node, '--version'], text=True).strip() == 'v20.20.0',
            'node_version_drift')
    require(json.loads((Path(cli).parents[1] / 'package.json').read_text())['version'] == '6.0.14',
            'pm2_version_drift')
    with tempfile.TemporaryDirectory(prefix='re7-absent-pm2-') as folder:
        base = Path(folder)
        home = base / 'pm2home'
        env = {**os.environ, 'PM2_HOME': str(home),
               'PATH': str(Path(node).parent) + ':' + os.environ['PATH']}
        configs = {}
        for label in ('candidate', 'return'):
            apps = []
            for name in (API, WORKER, FRONT):
                app_dir = base / label / name
                app_dir.mkdir(parents=True)
                script = app_dir / 'index.js'
                script.write_text('setInterval(() => {}, 1000);\n')
                apps.append({'name': name, 'cwd': str(app_dir),
                             'script': str(script), 'interpreter': node,
                             'exec_mode': 'fork', 'instances': 1,
                             'watch': False, 'autorestart': False})
            path = base / label / 'ecosystem.config.cjs'
            path.write_text('module.exports = ' + json.dumps({'apps': apps}) + ';\n')
            configs[label] = {a['name']: a for a in apps}
        try:
            for name in (FRONT, API, WORKER):
                run(node, cli, env, 'start', str(base / 'candidate/ecosystem.config.cjs'),
                    '--only', name)
            rows = wait_apps(node, cli, env, {API, WORKER, FRONT})
            daemon_pid = int((home / 'pm2.pid').read_text())
            daemon = gate.process_identity(daemon_pid)
            source = {n: {'pid': a['pid'], 'ticks': gate.process_identity(a['pid'])['ticks']}
                      for n, a in rows.items()}
            worker_pid = source[WORKER]['pid']
            require(os.getpgid(worker_pid) == os.getsid(worker_pid) == worker_pid,
                    'worker_session_not_isolated')
            worker_dir = configs['candidate'][WORKER]['cwd']
            absent = {'status': 'absent-proven', 'pid': worker_pid,
                      'ticks': source[WORKER]['ticks'], 'pgid': worker_pid,
                      'sid': worker_pid, 'uid': os.getuid(),
                      'tree': {str(worker_pid): source[WORKER]['ticks']},
                      'socketIds': [], 'cwd': worker_dir,
                      'script': configs['candidate'][WORKER]['script']}
            def target(label, name):
                cfg = configs[label][name]
                return {'cwd': cfg['cwd'], 'script': cfg['script'],
                        'sha256': hashlib.sha256(Path(cfg['script']).read_bytes()).hexdigest()}
            value = {'pm2Daemon': {'pid': daemon_pid, 'ticks': daemon['ticks']},
                     'sourceProcesses': source, 'absentWorker': absent,
                     'targetProcesses': {mode: {name: target(mode, name)
                         for name in (API, WORKER)} for mode in ('candidate', 'return')},
                     'savedPaths': {'pm2': str(home / 'dump.pm2'),
                                    'fallback': str(home / 'dump.pm2.bak')}}
            value['preparation'] = str(base)
            sockets = set()
            for fd in Path('/proc', str(worker_pid), 'fd').iterdir():
                target_fd = os.readlink(fd)
                if target_fd.startswith('socket:['):
                    sockets.add(target_fd[8:-1])
            marker = {**absent, 'status': 'running-captured',
                      'socketIds': sorted(sockets),
                      'daemon': value['pm2Daemon']}
            capture = base / 'candidate/worker-before-unfence.private.json'
            capture.write_text(json.dumps(marker))
            gate.validate_live_capture(value, 'candidate')
            tampered = dict(marker)
            tampered['tree'] = {}
            capture.write_text(json.dumps(tampered))
            expect_deny(lambda: gate.validate_live_capture(value, 'candidate'),
                        'worker_capture_binding_drift')
            capture.write_text(json.dumps(marker))
            expect_deny(lambda: gate.source_processes_ready(value),
                        'absent_worker_pid_present')
            run(node, cli, env, 'stop', WORKER)
            rows = wait_apps(node, cli, env, {API, FRONT})
            require(rows[WORKER]['pid'] == 0, 'worker_not_stopped')
            gate.source_processes_ready(value)
            for name in ('pm2Daemon',):
                wrong = json.loads(json.dumps(value))
                wrong[name]['ticks'] = '0'
                expect_deny(lambda: gate.source_processes_ready(wrong), 'pm2_daemon_drift')
            for name in (API, FRONT):
                wrong = json.loads(json.dumps(value))
                wrong['sourceProcesses'][name]['ticks'] = '0'
                expect_deny(lambda: gate.source_processes_ready(wrong), 'source_process_changed')
            replacement = subprocess.Popen(['sleep', '30'], cwd=worker_dir)
            try:
                expect_deny(lambda: gate.source_processes_ready(value),
                            'absent_worker_release_executor')
            finally:
                replacement.terminate()
                replacement.wait(timeout=3)
            original_identity = gate.process_identity
            with patch.object(gate, 'process_identity', side_effect=lambda pid:
                    {'state': 'S', 'ticks': '999', 'ppid': 1} if pid == worker_pid
                    else original_identity(pid)):
                expect_deny(lambda: gate.source_processes_ready(value),
                            'absent_worker_pid_present')
            run(node, cli, env, 'restart', WORKER)
            wait_apps(node, cli, env, {API, WORKER, FRONT})
            expect_deny(lambda: gate.source_processes_ready(value),
                        'pm2_child_set_drift', 'absent_worker_release_executor')
            run(node, cli, env, 'stop', WORKER)
            gate.source_processes_ready(value)
            run(node, cli, env, 'delete', API)
            run(node, cli, env, 'delete', WORKER)
            run(node, cli, env, 'start', str(base / 'return/ecosystem.config.cjs'), '--only', API)
            wait_apps(node, cli, env, {API, FRONT})
            expect_deny(lambda: gate.target_processes_live(value, 'return'),
                        'pm2_child_set_drift')
            run(node, cli, env, 'start', str(base / 'return/ecosystem.config.cjs'), '--only', WORKER)
            wait_apps(node, cli, env, {API, WORKER, FRONT})
            run(node, cli, env, 'save', '--force')
            shutil.copy2(home / 'dump.pm2', home / 'dump.pm2.bak')
            gate.target_processes_live(value, 'return')
            final = wait_apps(node, cli, env, {API, WORKER, FRONT})
            require(final[FRONT]['pid'] == source[FRONT]['pid'], 'frontend_identity_changed')
            print('PASS real PM2 6.0.14 Node 20.20.0: absent, live, descendant/release, '
                  'reused PID injection, daemon/API/frontend drift, substitute, '
                  'partial failure, complete return and frontend preserved')
        finally:
            run(node, cli, env, 'kill')


if __name__ == '__main__':
    require(len(sys.argv) == 3, 'node_and_pm2_cli_required')
    main(sys.argv[1], sys.argv[2])
