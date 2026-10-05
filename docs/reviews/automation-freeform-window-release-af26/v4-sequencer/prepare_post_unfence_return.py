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

SOURCE_NORMALIZED = {
    'ops.py': 'd9f727586a03a509c04629a1e1a4c8571a16e2d41a9c582396f558ee7158babe',
    'delegated.py': '47089f123b55fa92723e7dece9b4ac8984c51395746a543025a1d816ca6f7d0f',
}
RESULT_NORMALIZED = {
    'ops.py': 'efe934d8def4d8e7e862ccd361225bd80ebac6277521a2f30516b75e68d930e2',
    'delegated.py': 'ab50ce75dc665c98ad6350a734a9310d03865f9ae17305d6ef813d3fbca88104',
}


def normalized_digest(path):
    raw = Path(path).read_bytes()
    raw = re.sub(rb'/opt/re7online/backups/converta-persistent/preparations/'
                 rb'incident-6683-v4-[A-Za-z0-9-]+/', b'<PREPARATION>/', raw)
    return hashlib.sha256(raw).hexdigest()

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
    from privileged_output import run_privileged
    run_privileged(['sudo', '-n', '/usr/bin/python3', '-I', '-S',
                    '/usr/local/libexec/re7/incident-6683-window-control.py',
                    'check-absent'], original / 'window', 'check-absent')
    apps = {a['name']: a for a in json.loads(subprocess.check_output([PM, 'jlist'], text=True))}
    expected = config(original / 'switch/candidate.config.private.json')
    require(set(apps) in ({API, WORKER, FRONT}, {API, FRONT}) and all(
        apps[n]['pm2_env']['pm_cwd'] == expected[n]['cwd'] and
        apps[n]['pm2_env']['pm_exec_path'] == expected[n]['script'] and
        apps[n]['pm2_env']['watch'] is False and
        apps[n]['pm2_env']['status'] == 'online' for n in (API, FRONT)),
        'candidate_process_or_config_drift')
    for name in (API,):
        marker = json.loads((original / 'switch' / ('started-' + name + '.json')).read_text())
        now = process_identity(marker['pid'])
        require(apps[name]['pid'] == marker['pid'] and now and now['state'] != 'Z' and
                now['ticks'] == marker['identity']['ticks'], 'candidate_process_identity_drift')
    worker_marker = json.loads((original / 'switch' / ('started-' + WORKER + '.json')).read_text())
    worker_live = WORKER in apps and apps[WORKER]['pm2_env']['status'] == 'online'
    absent = None
    if worker_live:
        now = process_identity(worker_marker['pid'])
        require(apps[WORKER]['pid'] == worker_marker['pid'] and now and
                now['state'] != 'Z' and now['ticks'] == worker_marker['identity']['ticks'] and
                apps[WORKER]['pm2_env']['pm_cwd'] == expected[WORKER]['cwd'] and
                apps[WORKER]['pm2_env']['pm_exec_path'] == expected[WORKER]['script'] and
                apps[WORKER]['pm2_env']['watch'] is False,
                'candidate_worker_identity_drift')
    else:
        require(WORKER not in apps or apps[WORKER]['pid'] in (0, None),
                'worker_substitute_or_live')
        captured = json.loads((original / 'switch/worker-before-unfence.private.json').read_text())
        require(captured['status'] == 'running-captured' and
                captured['pid'] == worker_marker['pid'] and
                captured['ticks'] == worker_marker['identity']['ticks'] and
                captured['cwd'] == expected[WORKER]['cwd'] and
                captured['script'] == expected[WORKER]['script'],
                'worker_capture_binding_drift')
        absent = {**captured, 'status': 'absent-proven'}
        absent['priorPolicySha256'] = (original / 'window/privileged-policy.sha256').read_text().strip()
        absent['workerCaptureSha256'] = digest(
            original / 'switch/worker-before-unfence.private.json')
        # The same implementation used by the root helper checks surviving
        # descendants, process group/session, sockets and release executors.
        import importlib.util
        spec = importlib.util.spec_from_file_location('v4_absence', original / 'window/privileged.py')
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        source = {n: {'pid': apps[n]['pid'], 'ticks': process_identity(apps[n]['pid'])['ticks']}
                  for n in (API, FRONT)}
        source[WORKER] = {'pid': captured['pid'], 'ticks': captured['ticks']}
        daemon = captured['daemon']
        helper.source_processes_ready({'sourceProcesses': source, 'pm2Daemon': daemon,
                                       'absentWorker': {k: absent[k] for k in
                                           ('status', 'pid', 'ticks', 'pgid', 'sid', 'uid',
                                            'tree', 'socketIds', 'cwd', 'script')}})
    frontend = json.loads((original / 'switch/old-exit-confirmed.json').read_text())['frontend']
    current_front = process_identity(frontend['pid'])
    require(apps[FRONT]['pid'] == frontend['pid'] and current_front and
            current_front['state'] != 'Z' and
            current_front['ticks'] == frontend['identity']['ticks'],
            'frontend_identity_drift')
    previous_bindings = json.loads((original / 'window/db-owner-bindings.private.json').read_text())
    observation = run_privileged(['sudo', '-n', '/usr/bin/python3', '-I', '-S',
                          '/usr/local/libexec/re7/db-owner-set-observer.py'],
                          original / 'window', 'db-owner-observe')
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
                 're7-incident-6683-window.sudoers.proposed', 'privileged_output.py'):
        shutil.copy2(original / 'window' / name, window / name)
        (window / name).chmod(0o600)
    if absent is not None:
        shutil.copy2(original / 'switch/worker-before-unfence.private.json',
                     window / 'worker-before-unfence.private.json')
        (window / 'worker-before-unfence.private.json').chmod(0o600)
        write_json(window / 'absent-worker-source.private.json', absent)
        write_json(window / 'prior-absent-worker.private.json', {
            'trees': {WORKER: {pid: {'ticks': ticks, 'state': 'captured'}
                                for pid, ticks in absent['tree'].items()}},
            'sockets': absent['socketIds'],
            'source': 'fresh_absence_check_of_before_unfence_capture'})
    (window / 'proxy-observation.private.json').write_bytes(observation)
    (window / 'proxy-observation.private.json').chmod(0o600)
    # Delegated execution requires this file. Never inherit authorization from
    # a consumed attempt; the owner/executor enables it only after fresh inspect.
    write_json(window / 'execution-gates.private.json', {k: False for k in (
        'ownerAuthorized', 'preflightReviewed', 'artifactsVerified',
        'restoreVerified', 'discrepanciesResolved')})
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
    if absent is not None:
        # The minimal return adapter uses the new absent-worker report instead
        # of consuming a prior switch stop certificate. These patches must
        # apply to the attested sources, never a changed private script.
        patch_path = original / 'window/absent-worker-return.patch'
        require(patch_path.is_file(), 'absent_worker_adapter_patch_missing')
        require(digest(patch_path) == '378841d7326acfb26832ac8d3b910837ec57626abc3d493fbc8883bf75d4210a',
                'absent_worker_adapter_patch_drift')
        require(all(normalized_digest(returned / n) == h for n, h in
                    SOURCE_NORMALIZED.items()), 'absent_worker_source_drift')
        subprocess.run(['patch', '--batch', '-p0', '-i', str(patch_path)],
                       cwd=returned, stdout=subprocess.DEVNULL, check=True)
        require(all(normalized_digest(returned / n) == h for n, h in
                    RESULT_NORMALIZED.items()), 'absent_worker_result_drift')
        plan_path = returned / 'plan.private.json'
        plan = json.loads(plan_path.read_text())
        require(plan.get('direction') == 'return' and plan.get('recovery') is False,
                'return_plan_unexpected')
        plan['recovery'] = True
        plan['workerAbsentAtRecovery'] = True
        write_json(plan_path, plan)
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
    shutil.copy2(window / 'privileged_output.py', returned / 'privileged_output.py')
    (returned / 'privileged_output.py').chmod(0o600)
    shutil.copy2(window / 'privileged_output.py', destination / 'switch/privileged_output.py')
    (destination / 'switch/privileged_output.py').chmod(0o600)
    names = [line.split('  ', 1)[1] for line in
             (original / 'return/scripts.sha256').read_text().splitlines()]
    require(len(names) == 25 and 'privileged_output.py' in names and
            all((returned / name).is_file() for name in names),
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
