"""Fixed, root-owned V4 window controls. Install only after owner review.

The production entry point accepts one of the literal sudoers actions below. It
never imports from or executes the deploy-owned preparation. Its policy is a
separate root-owned regular file installed before the window.
"""
import base64
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

POLICY = Path('/usr/local/libexec/re7/incident-6683-window-policy.json')
AUDIT = Path('/var/log/re7-incident-6683-window.log')
PHASE = None
LOCK = Path('/var/lib/re7/incident-6683-v4-control.lock')
CRON = Path('/etc/cron.d/re7-converta-backup')
GUARD = Path('/var/lib/re7/campaign-operations/state.json')
TABLE = 're7_campaign_transition'
ACTIONS = frozenset({'inspect', 'check-absent', 'check-present', 'enter', 'unfence',
                     'restore-controls', 'abort-prestop', 'authorize-switch',
                     'authorize-return'})


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def phase_path(policy_hash):
    require(len(policy_hash) == 64 and all(c in '0123456789abcdef' for c in policy_hash),
            'policy_hash_invalid')
    return Path('/var/lib/re7/incident-6683-v4-phase-' + policy_hash + '.json')


def root_regular(path):
    path = Path(path)
    for node in (path, *path.parents):
        info = node.lstat()
        require(info.st_uid == 0 and not (info.st_mode & 0o022), 'root_chain_unsafe')
        require(stat.S_ISREG(info.st_mode) if node == path else stat.S_ISDIR(info.st_mode),
                'root_chain_wrong_type')


def policy_from(path=POLICY):
    root_regular(path)
    raw = Path(path).read_bytes()
    value = json.loads(raw)
    require(set(value) == {'preparation', 'fenceB64', 'fenceSha256',
                           'cronBeforeB64', 'cronWindowB64', 'sourceProcesses',
                           'pm2Daemon', 'targetProcesses', 'savedPaths'},
            'policy_shape')
    require(value['preparation'].startswith(
        '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-'),
        'policy_preparation')
    for key in ('fence', 'cronBefore', 'cronWindow'):
        value[key] = base64.b64decode(value[key + 'B64'], validate=True)
    require(hashlib.sha256(value['fence']).hexdigest() == value['fenceSha256'],
            'policy_fence_hash')
    require(value['cronBefore'] != value['cronWindow'], 'policy_cron_equal')
    require(set(value['sourceProcesses']) == {'re7-whatsapp-agent',
             're7-whatsapp-web-worker', 're7-admin-front'}, 'policy_process_shape')
    for entry in value['sourceProcesses'].values():
        require(set(entry) == {'pid', 'ticks'} and isinstance(entry['pid'], int) and
                isinstance(entry['ticks'], str) and entry['ticks'].isdigit(),
                'policy_process_identity')
    require(set(value['pm2Daemon']) == {'pid', 'ticks'}, 'policy_pm2_shape')
    require(set(value['targetProcesses']) == {'switch', 'return'},
            'policy_target_modes')
    for mode in ('switch', 'return'):
        require(set(value['targetProcesses'][mode]) == {
            're7-whatsapp-agent', 're7-whatsapp-web-worker'}, 'policy_target_shape')
        for cfg in value['targetProcesses'][mode].values():
            require(set(cfg) == {'cwd', 'script', 'sha256'} and
                    cfg['cwd'].startswith('/opt/re7online/releases/') and
                    cfg['script'].startswith(cfg['cwd'] + '/') and
                    len(cfg['sha256']) == 64, 'policy_target_config')
    require(set(value['savedPaths']) == {'pm2', 'fallback'} and
            all(x.startswith('/home/deploy/.pm2/') or
                x.startswith('/opt/re7online/backups/converta-persistent/')
                for x in value['savedPaths'].values()), 'policy_saved_paths')
    value['policySha256'] = hashlib.sha256(raw).hexdigest()
    return value


def system(args, *, input_bytes=None):
    result = subprocess.run(args, input=input_bytes, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=True, timeout=12,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
    return result.stdout


def audit(action, result, policy_hash):
    line = json.dumps({'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'action': action, 'result': result, 'policySha256': policy_hash}) + '\n'
    fd = os.open(AUDIT, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(info.st_uid == 0 and stat.S_ISREG(info.st_mode) and
                not (info.st_mode & 0o077), 'audit_path_unsafe')
        os.write(fd, line.encode())
        os.fsync(fd)
    finally:
        os.close(fd)


def nft_absent():
    output = system(['/usr/sbin/nft', '-j', 'list', 'tables'])
    tables = json.loads(output)['nftables']
    require(not any(x.get('table', {}).get('family') == 'inet' and
                    x.get('table', {}).get('name') == TABLE for x in tables),
            'fence_already_present')
    return output


def nft_present():
    output = system(['/usr/sbin/nft', '-j', 'list', 'table', 'inet', TABLE])
    objects = json.loads(output)['nftables']
    require(all(set(x) <= {'metainfo', 'table', 'chain', 'rule'} for x in objects),
            'fence_unknown_object')
    tables = [x['table'] for x in objects if 'table' in x]
    chains = [x['chain'] for x in objects if 'chain' in x]
    rules = [x['rule'] for x in objects if 'rule' in x]
    require(len(tables) == len(chains) == len(rules) == 1, 'fence_shape_drift')
    require(tables[0]['family'] == 'inet' and tables[0]['name'] == TABLE,
            'fence_table_drift')
    c = chains[0]
    require(c['family'] == 'inet' and c['table'] == TABLE and c['name'] == 'api_input' and
            c['type'] == 'filter' and c['hook'] == 'input' and c['prio'] == -10 and
            c['policy'] == 'accept', 'fence_chain_drift')
    r = rules[0]
    require(r['family'] == 'inet' and r['table'] == TABLE and r['chain'] == 'api_input',
            'fence_rule_drift')
    expr = [x for x in r['expr'] if 'counter' not in x]
    require(expr == [
        {'match': {'op': '==', 'left': {'payload': {'protocol': 'tcp', 'field': 'dport'}},
                   'right': {'set': [3000, 3001]}}},
        {'reject': {'type': 'tcp reset'}}], 'fence_rule_drift')
    return output


def boot(expected):
    output = system(['/usr/bin/systemctl', 'show', 'pm2-deploy.service',
                     '--property=ActiveState,UnitFileState']).decode()
    require('ActiveState=inactive\n' in output and
            ('UnitFileState=' + expected + '\n') in output, 'boot_state_drift')


def write_cron(content):
    # Source bytes came from the root-owned policy. No install from a mutable
    # deploy path and no symlink traversal at the destination.
    require(not CRON.is_symlink() and CRON.is_file(), 'cron_path_unsafe')
    fd, temporary = tempfile.mkstemp(prefix='.re7-6683-', dir=str(CRON.parent))
    try:
        os.fchmod(fd, 0o644)
        os.fchown(fd, 0, 0)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, CRON)
        directory = os.open(CRON.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def guard_closed():
    value = json.loads(GUARD.read_text())
    require(value.get('open') is False and value.get('tasks') == [] and
            not value.get('ledgerFault'), 'guard_not_closed_drained')


def source_processes_alive(value):
    daemon = value['pm2Daemon']
    now_daemon = process_identity(daemon['pid'])
    require(now_daemon and now_daemon['ticks'] == daemon['ticks'] and
            now_daemon['state'] != 'Z', 'pm2_daemon_drift')
    for entry in value['sourceProcesses'].values():
        path = Path('/proc', str(entry['pid']), 'stat')
        try:
            parts = path.read_text().rsplit(')', 1)[1].split()
        except FileNotFoundError as error:
            raise RuntimeError('source_process_missing') from error
        require(parts[0] != 'Z' and parts[19] == entry['ticks'] and
                int(parts[1]) == daemon['pid'],
                'source_process_changed')


def process_identity(pid):
    try:
        fields = Path('/proc', str(pid), 'stat').read_text().rsplit(')', 1)[1].split()
    except FileNotFoundError:
        return None
    return {'state': fields[0], 'ppid': int(fields[1]), 'ticks': fields[19]}


def target_processes_live(value, mode):
    daemon = value['pm2Daemon']
    observed_daemon = process_identity(daemon['pid'])
    require(observed_daemon and observed_daemon['state'] != 'Z' and
            observed_daemon['ticks'] == daemon['ticks'], 'pm2_daemon_drift')
    front = value['sourceProcesses']['re7-admin-front']
    observed_front = process_identity(front['pid'])
    require(observed_front and observed_front['state'] != 'Z' and
            observed_front['ticks'] == front['ticks'] and
            observed_front['ppid'] == daemon['pid'], 'frontend_identity_drift')
    for name in ('re7-whatsapp-agent', 're7-whatsapp-web-worker'):
        prior = value['sourceProcesses'][name]
        old = process_identity(prior['pid'])
        require(not old or old['ticks'] != prior['ticks'] or old['state'] == 'Z',
                'old_process_still_alive')
    children = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        pid = int(path.name)
        identity = process_identity(pid)
        if identity and identity['ppid'] == daemon['pid'] and identity['state'] != 'Z':
            children.append(pid)
    require(len(children) == 3 and front['pid'] in children,
            'pm2_child_set_drift')
    matched = {front['pid']}
    for cfg in value['targetProcesses'][mode].values():
        script = Path(cfg['script'])
        require(script.is_file() and not script.is_symlink() and
                hashlib.sha256(script.read_bytes()).hexdigest() == cfg['sha256'],
                'target_script_drift')
        candidates = []
        for pid in children:
            if pid in matched:
                continue
            try:
                cwd = os.readlink(Path('/proc', str(pid), 'cwd'))
                argv = Path('/proc', str(pid), 'cmdline').read_bytes().split(b'\0')
            except FileNotFoundError:
                continue
            if cwd == cfg['cwd'] and cfg['script'].encode() in argv:
                candidates.append(pid)
        require(len(candidates) == 1, 'target_process_ambiguous')
        matched.add(candidates[0])
    require(len(matched) == 3, 'target_process_unexplained')
    saved = value['savedPaths']
    for path in saved.values():
        require(Path(path).is_file() and not Path(path).is_symlink(),
                'saved_path_missing')
    require(Path(saved['pm2']).read_bytes() == Path(saved['fallback']).read_bytes(),
            'saved_fallback_drift')


def phase_read():
    if not PHASE.exists():
        return None
    root_regular(PHASE)
    return json.loads(PHASE.read_text())


def phase_write(stage, policy_hash, mode=None):
    require(stage in {'fenced', 'ready', 'unfenced', 'complete', 'aborted'},
            'phase_invalid')
    require(PHASE.parent.is_dir() and not PHASE.parent.is_symlink() and
            PHASE.parent.stat().st_uid == 0 and
            not (PHASE.parent.stat().st_mode & 0o022), 'phase_parent_unsafe')
    data = {'stage': stage, 'policySha256': policy_hash, 'mode': mode}
    fd, temporary = tempfile.mkstemp(prefix='.incident-6683-phase-', dir=str(PHASE.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, PHASE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def phase_require(value, stage):
    phase = phase_read()
    require(phase and phase.get('stage') == stage and
            phase.get('policySha256') == value['policySha256'], 'phase_drift')
    return phase


def act(action, value):
    require(action in ACTIONS, 'unknown_action')
    if action == 'inspect':
        require(phase_read() is None, 'phase_already_exists')
        source_processes_alive(value)
        require(CRON.read_bytes() == value['cronBefore'], 'cron_before_drift')
        boot('enabled')
        nft_absent()
        system(['/usr/sbin/nft', '--check', '--file', '-'],
               input_bytes=value['fence'])
        return json.dumps({'policySha256': value['policySha256'],
                           'phase': None, 'sourceProcessesAlive': True}).encode()
    if action == 'check-absent':
        return nft_absent()
    if action == 'check-present':
        return nft_present()
    if action == 'enter':
        require(phase_read() is None, 'phase_already_exists')
        guard_closed()
        source_processes_alive(value)
        require(CRON.read_bytes() == value['cronBefore'], 'cron_before_drift')
        boot('enabled')
        nft_absent()
        system(['/usr/sbin/nft', '--check', '--file', '-'], input_bytes=value['fence'])
        write_cron(value['cronWindow'])
        system(['/usr/bin/systemctl', 'disable', 'pm2-deploy.service'])
        boot('disabled')
        system(['/usr/sbin/nft', '--file', '-'], input_bytes=value['fence'])
        output = nft_present()
        phase_write('fenced', value['policySha256'])
        return output
    if action in {'authorize-switch', 'authorize-return'}:
        phase = phase_read()
        require(phase and phase.get('stage') in {'fenced', 'ready'} and
                phase.get('policySha256') == value['policySha256'],
                'phase_drift')
        guard_closed()
        nft_present()
        mode = 'switch' if action == 'authorize-switch' else 'return'
        target_processes_live(value, mode)
        phase_write('ready', value['policySha256'], mode)
        return nft_present()
    if action == 'unfence':
        phase = phase_require(value, 'ready')
        guard_closed()
        target_processes_live(value, phase['mode'])
        nft_present()
        system(['/usr/sbin/nft', 'delete', 'table', 'inet', TABLE])
        output = nft_absent()
        phase_write('unfenced', value['policySha256'], phase['mode'])
        return output
    if action == 'restore-controls':
        phase = phase_require(value, 'unfenced')
        nft_absent()
        require(CRON.read_bytes() == value['cronWindow'], 'cron_window_drift')
        boot('disabled')
        write_cron(value['cronBefore'])
        system(['/usr/bin/systemctl', 'enable', 'pm2-deploy.service'])
        boot('enabled')
        output = nft_absent()
        phase_write('complete', value['policySha256'], phase['mode'])
        return output
    # The sequencer proves the original process identities before requesting
    # this. This fixed action is not a return path for a started successor.
    require(action == 'abort-prestop', 'unknown_action')
    phase = phase_read()
    require(phase is None or (phase.get('stage') == 'fenced' and
            phase.get('policySha256') == value['policySha256']),
            'abort_phase_invalid')
    source_processes_alive(value)
    try:
        nft_present()
        system(['/usr/sbin/nft', 'delete', 'table', 'inet', TABLE])
    except subprocess.CalledProcessError:
        nft_absent()
    if CRON.read_bytes() == value['cronWindow']:
        write_cron(value['cronBefore'])
    else:
        require(CRON.read_bytes() == value['cronBefore'], 'cron_unknown_state')
    state = system(['/usr/bin/systemctl', 'show', 'pm2-deploy.service',
                    '--property=ActiveState,UnitFileState']).decode()
    if 'UnitFileState=disabled\n' in state:
        system(['/usr/bin/systemctl', 'enable', 'pm2-deploy.service'])
    boot('enabled')
    output = nft_absent()
    phase_write('aborted', value['policySha256'])
    return output


def main(argv):
    global PHASE
    require(len(argv) == 2 and argv[1] in ACTIONS, 'literal_action_required')
    action = argv[1]
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(info.st_uid == 0 and stat.S_ISREG(info.st_mode) and
                not (info.st_mode & 0o077), 'control_lock_unsafe')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        value = policy_from()
        PHASE = phase_path(value['policySha256'])
        try:
            output = act(action, value)
            audit(action, 'pass', value['policySha256'])
            if output:
                os.write(1, output)
        except Exception:
            audit(action, 'fail', value['policySha256'])
            raise
    finally:
        os.close(fd)


if __name__ == '__main__':
    main(sys.argv)
