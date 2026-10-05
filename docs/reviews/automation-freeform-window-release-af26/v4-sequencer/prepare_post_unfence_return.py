"""Create a fresh V4 return preparation after a failed post-unfence validation.

Run only after the previous policy's restore-controls has restored cron/boot.
This program never changes processes, firewall, cron, boot, guard or database.
It does not install the new root-owned policy; the owner must do that later.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.parse
import re

BASE = Path('/opt/re7online/backups/converta-persistent/preparations')
PM = '/home/deploy/.npm-global/bin/pm2'
API = 're7-whatsapp-agent'
WORKER = 're7-whatsapp-web-worker'
FRONT = 're7-admin-front'
STATIC = ('close.cjs', 'contain.py', 'db_owner_set_gate.py',
          'db_owner_set_observer.py', 'delegated.py', 'execution-check.cjs',
          'open.cjs', 'ops.py', 'preparation-bindings.cjs', 'read-state.py',
          'recover-partial.py', 'restore-controls.py', 'start-one.py',
          'stop-pair.py', 'unfence.py', 'validate.cjs', 'plan.private.json')


def require(value, code):
    if not value:
        raise RuntimeError(code)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n')
    path.chmod(0o600)


def process_identity(pid):
    try:
        fields = Path('/proc', str(pid), 'stat').read_text().rsplit(')', 1)[1].split()
    except FileNotFoundError:
        return None
    return {'state': fields[0], 'ticks': fields[19]}


def config(path):
    return {app['name']: app for app in json.loads(path.read_text())['apps']}


def main(original, destination):
    os.umask(0o077)
    original, destination = Path(original).resolve(), Path(destination)
    require(original.parent == BASE and original.name.startswith('incident-6683-v4-'),
            'original_path_denied')
    require(destination.parent == BASE and destination.name.startswith('incident-6683-v4-return-') and
            not destination.exists() and not destination.is_symlink(), 'new_return_path_required')
    require((original / 'switch/owner-unfence-authorized.json').is_file() and
            (original / 'switch/old-exit-confirmed.json').is_file(), 'switch_not_completed')
    require(not list((original / 'return').glob('start-intent-*.json')),
            'return_mode_already_attempted')
    require(not list((original / 'return-partial').glob('start-intent-*.json')),
            'partial_return_already_attempted')
    guard = json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text())
    require(type(guard) is dict and guard.get('version') == 1 and
            type(guard.get('open')) is bool and guard['open'] is False and
            type(guard.get('generation')) is int and
            type(guard.get('tasks')) is dict and len(guard['tasks']) == 0 and
            type(guard.get('audit')) is list and not guard.get('ledgerFault'),
            'closed_drained_guard_required')
    before = original / 'window/re7-converta-backup.before'
    require(Path('/etc/cron.d/re7-converta-backup').read_bytes() == before.read_bytes(),
            'cron_must_be_restored_first')
    supervision = subprocess.check_output(['systemctl', 'show', 'pm2-deploy.service',
                       '--property=ActiveState,UnitFileState'], text=True)
    require(supervision == 'ActiveState=inactive\nUnitFileState=enabled\n',
            'boot_must_be_restored_first')
    require(subprocess.check_output(['crontab', '-l']) ==
            (original / 'window/deploy.crontab.before').read_bytes(),
            'deploy_cron_must_be_restored_first')
    subprocess.run(['sudo', '-n', '/usr/bin/python3', '-I', '-S',
                    '/usr/local/libexec/re7/incident-6683-window-control.py',
                    'check-absent'], stdout=subprocess.DEVNULL, check=True)
    apps = {a['name']: a for a in json.loads(subprocess.check_output([PM, 'jlist'], text=True))}
    expected = config(original / 'switch/candidate.config.private.json')
    require(set(apps) == {API, WORKER, FRONT} and all(
        apps[n]['pm2_env']['pm_cwd'] == expected[n]['cwd'] and
        apps[n]['pm2_env']['pm_exec_path'] == expected[n]['script'] and
        apps[n]['pm2_env']['watch'] is False and
        apps[n]['pm2_env']['status'] == 'online' for n in apps),
        'candidate_process_or_config_drift')
    for name in (API, WORKER):
        marker = json.loads((original / 'switch' / ('started-' + name + '.json')).read_text())
        now = process_identity(marker['pid'])
        require(apps[name]['pid'] == marker['pid'] and now and now['state'] != 'Z' and
                now['ticks'] == marker['identity']['ticks'], 'candidate_process_identity_drift')
    frontend = json.loads((original / 'switch/old-exit-confirmed.json').read_text())['frontend']
    current_front = process_identity(frontend['pid'])
    require(apps[FRONT]['pid'] == frontend['pid'] and current_front and
            current_front['state'] != 'Z' and
            current_front['ticks'] == frontend['identity']['ticks'],
            'frontend_identity_drift')
    previous_bindings = json.loads((original / 'window/db-owner-bindings.private.json').read_text())
    observation = subprocess.check_output(['sudo', '-n', '/usr/bin/python3', '-I', '-S',
                          '/usr/local/libexec/re7/db-owner-set-observer.py'])
    proxy = json.loads(observation)
    require(proxy['identity'] == previous_bindings['proxyIdentity'] and
            proxy['exeSha256'] == previous_bindings['proxySha256'], 'proxy_identity_drift')
    # Re-capture counts/identities rather than asserting that the state from
    # before the failed switch is still current during degraded service.
    url = urllib.parse.urlparse(expected[API]['env']['DATABASE_URL'])
    db_user = urllib.parse.unquote(url.username)
    db_name = url.path.lstrip('/')
    script = (original / 'return/preparation-bindings.cjs').read_text()
    statement = re.search(r'sql: `(.+?)`', script, re.S)
    require(statement is not None and db_user and db_name, 'baseline_query_missing')
    result = subprocess.check_output(['docker', 'exec', previous_bindings['containerId'],
             'psql', '-U', db_user, '-d', db_name, '-Atqc', statement.group(1)],
             text=True, timeout=15)
    counts = json.loads(result.strip())
    require(all(type(counts.get(k)) is int and counts[k] == 0 for k in
                ('jobs', 'groups', 'leases', 'sendingScheduled')) and
            all(isinstance(counts.get(k), list) for k in ('flags', 'connected', 'auth')),
            'return_work_or_baseline_ambiguous')

    destination.mkdir(mode=0o700)
    window = destination / 'window'
    window.mkdir(mode=0o700)
    (destination / 'switch').mkdir(mode=0o700)
    returned = destination / 'return'
    returned.mkdir(mode=0o700)
    for name in ('automation-fence.nft', 're7-converta-backup.before',
                 're7-converta-backup.window', 'deploy.crontab.before',
                 'deploy.crontab.window', 'frontend-build-env.private.json',
                 'db-owner-bindings.private.json', 'path-bindings.private.json',
                 'backup-manifest.private.json', 'restore-result.json',
                 'prepare_policy.py', 'privileged.py', 'sequencer.py',
                 're7-incident-6683-window.sudoers.proposed'):
        shutil.copy2(original / 'window' / name, window / name)
        (window / name).chmod(0o600)
    (window / 'proxy-observation.private.json').write_bytes(observation)
    (window / 'proxy-observation.private.json').chmod(0o600)
    write_json(window / 'initial.private.json', {
        'guard': {'generation': guard['generation'], 'open': True,
                  'tasks': 0, 'ledgerFault': False},
        'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'supervision': supervision})
    source_config = (original / 'switch/candidate.config.private.json').read_bytes()
    target_config = (original / 'switch/return.config.private.json').read_bytes()
    for mode, name, raw in (
        ('switch', 'return.config.private.json', source_config),
        ('switch', 'candidate.config.private.json', source_config),
        ('return', 'return.config.private.json', source_config),
        ('return', 'candidate.config.private.json', target_config),
    ):
        path = destination / mode / name
        path.write_bytes(raw)
        path.chmod(0o600)
    shutil.copy2(original / 'switch/ops.py', destination / 'switch/ops.py')
    (destination / 'switch/ops.py').chmod(0o600)
    for name in STATIC:
        raw = (original / 'return' / name).read_bytes()
        if name in {'ops.py', 'delegated.py', 'read-state.py', 'execution-check.cjs'}:
            raw = raw.replace(str(original).encode(), str(destination).encode())
        path = returned / name
        path.write_bytes(raw)
        path.chmod(0o600)
    # Bridge.app_matches imports switch/ops.py; it must also bind to this root.
    path = destination / 'switch/ops.py'
    path.write_bytes(path.read_bytes().replace(str(original).encode(), str(destination).encode()))
    for name in ('backup-manifest.json', 'proof-bindings.private.json'):
        shutil.copy2(original / 'return' / name, returned / name)
        (returned / name).chmod(0o600)
    front_release = Path(expected[FRONT]['cwd'])
    write_json(returned / 'baseline.private.json', {
        'auth': counts['auth'], 'connected': counts['connected'],
        'flags': counts['flags'],
        'frontendBuild': (front_release / '.next/BUILD_ID').read_text().strip(),
        'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    for variant, raw in (('candidate', target_config), ('return', source_config)):
        data = json.loads(raw)
        path = returned / (variant + '.ecosystem.config.cjs')
        path.write_text('module.exports = ' + json.dumps(data, separators=(',', ':')) + ';\n')
        path.chmod(0o600)
    names = [line.split('  ', 1)[1] for line in
             (original / 'return/scripts.sha256').read_text().splitlines()]
    require(len(names) == 24 and all((returned / name).is_file() for name in names),
            'return_static_incomplete')
    (returned / 'scripts.sha256').write_text(''.join(
        digest(returned / name) + '  ' + name + '\n' for name in names))
    (returned / 'scripts.sha256').chmod(0o600)
    subprocess.run(['sha256sum', '-c', 'scripts.sha256'], cwd=returned,
                   stdout=subprocess.DEVNULL, check=True)
    manifest = json.loads((original / 'window/sequencer-manifest.json').read_text())
    manifest['status'] = 'FRESH_POST_UNFENCE_RETURN_POLICY_NOT_INSTALLED'
    manifest['filesSha256'] = {n: digest(window / n) for n in manifest['filesSha256']
                               if (window / n).is_file()}
    write_json(window / 'sequencer-manifest.json', manifest)
    require(not list(destination.glob('*/owner-*')) and
            not list(destination.glob('*/start-intent-*')),
            'reused_proof_or_intent')
    subprocess.run(['python3', str(window / 'prepare_policy.py'), str(destination)],
                   stdout=subprocess.DEVNULL, check=True)
    print('FRESH_RETURN_PREPARATION_PASS', destination.name,
          'policySha256', (window / 'privileged-policy.sha256').read_text().strip())


if __name__ == '__main__':
    require(len(sys.argv) == 3, 'original_and_new_preparation_required')
    main(sys.argv[1], sys.argv[2])
