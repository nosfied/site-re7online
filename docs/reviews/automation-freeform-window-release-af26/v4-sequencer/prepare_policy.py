"""Create a private, immutable-input policy for owner installation before a window.

This script never installs root files. It refuses to overwrite a policy and
prints only its SHA-256. Re-run in a new preparation if process identities move.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from baseline_contract import validate_preparation

API = 're7-whatsapp-agent'
WORKER = 're7-whatsapp-web-worker'
FRONT = 're7-admin-front'
PM = '/home/deploy/.npm-global/bin/pm2'
PM_PID = Path('/home/deploy/.pm2/pm2.pid')


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def identity(pid):
    data = Path('/proc', str(pid), 'stat').read_text().rsplit(')', 1)[1].split()
    require(data[0] != 'Z', 'process_zombie')
    return {'pid': pid, 'ticks': data[19]}


def apps(path):
    return {a['name']: a for a in json.loads(path.read_text())['apps']}


def target(app):
    script = Path(app['script'])
    require(script.is_file() and not script.is_symlink(), 'target_script_missing')
    require(app['cwd'].startswith('/opt/re7online/releases/') and
            app['script'].startswith(app['cwd'] + '/'), 'target_path_unexpected')
    return {'cwd': app['cwd'], 'script': app['script'],
            'sha256': hashlib.sha256(script.read_bytes()).hexdigest()}


def create(root):
    root = Path(root).resolve()
    require(root.parent == Path('/opt/re7online/backups/converta-persistent/preparations') and
            root.name.startswith('incident-6683-v4-'), 'preparation_path_denied')
    window = root / 'window'
    output = window / 'privileged-policy.private.json'
    require(not output.exists() and not output.is_symlink(), 'policy_already_exists')
    manifest = json.loads((window / 'sequencer-manifest.json').read_text())
    post_return = manifest.get('status') == 'FRESH_POST_UNFENCE_RETURN_POLICY_NOT_INSTALLED'
    validate_preparation(root, ['return'] if post_return else None)
    live = {a['name']: a for a in json.loads(subprocess.check_output([PM, 'jlist'], text=True))}
    absent_path = window / 'absent-worker-source.private.json'
    absent = json.loads(absent_path.read_text()) if absent_path.is_file() else None
    require(set(live) == {API, WORKER, FRONT} or
            (absent is not None and set(live) == {API, FRONT}),
            'pm2_process_set_drift')
    source = apps(root / 'switch/return.config.private.json')
    required_live = (API, FRONT) if absent is not None else (API, WORKER, FRONT)
    require(all(live[n]['pm2_env']['pm_cwd'] == source[n]['cwd'] and
                live[n]['pm2_env']['pm_exec_path'] == source[n]['script'] and
                live[n]['pm2_env']['watch'] is False and
                live[n]['pm2_env']['status'] == 'online' for n in required_live),
            'source_config_drift')
    if absent is not None and WORKER in live:
        require(live[WORKER]['pm2_env']['status'] != 'online' and
                live[WORKER]['pid'] in (0, None), 'worker_substitute_or_live')
    candidate = apps(root / 'switch/candidate.config.private.json')
    returned = apps(root / 'return/candidate.config.private.json')
    require(candidate[FRONT] == source[FRONT] == returned[FRONT],
            'frontend_not_preserved')
    daemon = identity(int(PM_PID.read_text().strip()))
    identities = {n: identity(live[n]['pid']) for n in required_live}
    for entry in identities.values():
        parts = Path('/proc', str(entry['pid']), 'stat').read_text().rsplit(')', 1)[1].split()
        require(int(parts[1]) == daemon['pid'], 'pm2_parent_drift')
    if absent is not None:
        require(absent['status'] == 'absent-proven' and
                absent['daemon'] == daemon and
                absent['cwd'] == source[WORKER]['cwd'] and
                absent['script'] == source[WORKER]['script'],
                'absent_worker_binding_drift')
        identities[WORKER] = {'pid': absent['pid'], 'ticks': absent['ticks']}
    def encoded(name):
        return base64.b64encode((window / name).read_bytes()).decode()
    policy = {
        'preparation': str(root),
        'fenceB64': encoded('automation-fence.nft'),
        'fenceSha256': hashlib.sha256((window / 'automation-fence.nft').read_bytes()).hexdigest(),
        'cronBeforeB64': encoded('re7-converta-backup.before'),
        'cronWindowB64': encoded('re7-converta-backup.window'),
        'sourceProcesses': identities,
        'pm2Daemon': daemon,
        'targetProcesses': {
            'switch': {n: target(candidate[n]) for n in (API, WORKER)},
            'return': {n: target(returned[n]) for n in (API, WORKER)}},
        'savedPaths': {'pm2': '/home/deploy/.pm2/dump.pm2',
                       'fallback': '/home/deploy/.pm2/dump.pm2.bak'}}
    if absent is not None:
        policy['absentWorker'] = {k: absent[k] for k in
            ('status', 'pid', 'ticks', 'pgid', 'sid', 'uid', 'tree', 'socketIds', 'cwd',
             'script', 'priorPolicySha256', 'workerCaptureSha256')}
        import importlib.util
        spec = importlib.util.spec_from_file_location('v4_privileged_check', window / 'privileged.py')
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        helper.source_processes_ready(policy)
    raw = json.dumps(policy, sort_keys=True, separators=(',', ':')).encode() + b'\n'
    os.umask(0o077)
    with output.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    digest = hashlib.sha256(raw).hexdigest()
    (window / 'privileged-policy.sha256').write_text(digest + '\n')
    print(digest)


if __name__ == '__main__':
    require(len(sys.argv) == 2, 'package_argument_required')
    create(sys.argv[1])
