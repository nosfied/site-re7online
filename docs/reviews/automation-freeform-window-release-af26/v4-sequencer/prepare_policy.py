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
    live = {a['name']: a for a in json.loads(subprocess.check_output([PM, 'jlist'], text=True))}
    require(set(live) == {API, WORKER, FRONT}, 'pm2_process_set_drift')
    source = apps(root / 'switch/return.config.private.json')
    require(all(live[n]['pm2_env']['pm_cwd'] == source[n]['cwd'] and
                live[n]['pm2_env']['pm_exec_path'] == source[n]['script'] and
                live[n]['pm2_env']['watch'] is False for n in live),
            'source_config_drift')
    candidate = apps(root / 'switch/candidate.config.private.json')
    returned = apps(root / 'return/candidate.config.private.json')
    require(candidate[FRONT] == source[FRONT] == returned[FRONT],
            'frontend_not_preserved')
    daemon = identity(int(PM_PID.read_text().strip()))
    identities = {n: identity(a['pid']) for n, a in live.items()}
    for entry in identities.values():
        parts = Path('/proc', str(entry['pid']), 'stat').read_text().rsplit(')', 1)[1].split()
        require(int(parts[1]) == daemon['pid'], 'pm2_parent_drift')
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
