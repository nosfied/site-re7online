"""Fixed read-only installation preflight; no PM2 mutation or window/start action.

Three attempts only for explicitly transient observations, preserving every raw
result. Root reader is the fixed sudo invocation. No certificate is reused.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import time

P = Path('/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import socket_observation_client as client
import socket_observation_contract as contract


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
    Path(path).chmod(0o600)


def strict_sockets(g, tree):
    result = set()
    for q in tree:
        require(g.proc(q['pid'])['ticks'] == q['ticks'], 'source_identity_drift')
        for fd in Path('/proc', str(q['pid']), 'fd').iterdir():
            link = os.readlink(fd)  # Vanishing descriptor denies this observation.
            if link.startswith('socket:['):
                result.add(link[8:-1])
    return sorted(result)


def live(g, origin, policy):
    require(g.BOOT_ID.read_text().strip() == origin['bootId'] == policy['bootId'], 'boot_drift')
    require(g.PM_PID.read_text().strip() == str(origin['daemon']['pid']), 'daemon_pid_drift')
    require(g.proc(origin['daemon']['pid'])['ticks'] == origin['daemon']['ticks'], 'daemon_identity_drift')
    fronts = [x for x in g.rows(timeout=5) if x['name'] == g.FRONT]
    require(len(fronts) == 1, 'source_pm2_missing_or_duplicate')
    row = fronts[0]
    require(row['pid'] == origin['pid'] and g.proc(row['pid'])['ticks'] == origin['ticks'], 'source_identity_drift')
    require(row['pm2_env']['exec_mode'] == origin['pm2ExecMode'] and
            row['pm2_env']['restart_time'] == origin['restartCount'], 'source_supervision_drift')
    run, child = g.supervision_live(Path(origin['sourceControl']), row)
    require(run['nonce'] == origin['sourceNonce'] == policy['roles']['source']['nonce'], 'source_nonce_drift')
    require(run['release'] == origin['sourceRelease'] == policy['roles']['source']['release'] and
            run['entry'] == origin['sourceEntry'] == policy['roles']['source']['entry'], 'source_artifact_drift')
    require(run['entrySha256'] == origin['entrySha256'] and run['buildId'] == origin['buildId'], 'source_bytes_drift')
    tree = g.tree(row['pid'])
    keys = lambda xs: {(x['pid'], x['ticks'], x['parent'], x['group']) for x in xs}
    require(keys(tree) == keys(origin['tree']), 'source_tree_drift')
    capture = {'tree': tree, 'sockets': strict_sockets(g, tree)}
    require(keys(g.tree(row['pid'])) == keys(tree), 'source_tree_changed_during_capture')
    require(strict_sockets(g, tree) == capture['sockets'], 'source_capture_churn')
    return capture


def category(reason):
    if any(x in reason for x in ['ownership_observation_changed', 'ownership_observation_incomplete',
                                 'fd_observation_incomplete', 'source_capture_churn',
                                 'ownership_observation_deadline', 'socket_observer_stale_or_timeout',
                                 'source_socket_observation_missing', 'source_sockets_changed_after_read']):
        return 'POTENTIALLY_TRANSIENT'
    if any(x in reason for x in ['ownership_observation_permission_denied', 'installed_path_denied',
                                 'network_table_missing', 'sudo:', 'not allowed', 'password is required',
                                 "can't open file"]):
        return 'CAPABILITY_OR_INSTALLATION_BLOCKED'
    return 'BINDING_OR_UNEXPLAINED_BLOCKED'


def attempt(g, origin, policy, root, folder, number):
    out = folder / ('attempt-' + str(number) + '.private.json')
    record = {'attempt': number, 'at': time.time(), 'result': 'DENY'}
    try:
        captured = live(g, origin, policy)
        snapshot = folder / ('source-' + str(number) + '.private.json')
        save(snapshot, captured)
        current = root / 'source-tree.private.json'
        if current.exists():
            # Preserve old authoritative bytes before replacing the read-only capture.
            prior = folder / ('prior-source-' + str(number) + '.private.json')
            with prior.open('xb') as stream:
                stream.write(current.read_bytes())
            prior.chmod(0o600)
        temporary = root / ('capture-' + secrets.token_hex(16) + '.private.json')
        save(temporary, captured)
        os.replace(temporary, current)
        started = time.monotonic()
        observation, returned_policy = client.read(root, 'live-preflight-' + str(number))
        require(returned_policy == policy, 'client_policy_drift')
        contract.preflight(observation, policy, current)
        after = live(g, origin, policy)
        require(after['sockets'] == captured['sockets'], 'source_sockets_changed_after_read')
        owners = observation['samples'][1]['owners']
        shared = observation['samples'][1]['daemonFd0']
        record.update(result='PASS', category='COMPLETE_CURRENT_OBSERVATION',
                      observationId=observation['observationId'], samples=2,
                      elapsed=time.monotonic()-started, captureSha256=digest(current),
                      sourceSocketCount=len(captured['sockets']),
                      daemonSharedSocket=shared,
                      owners=owners)
    except Exception as error:
        reason = str(error)
        if reason.startswith('socket_observer_read_denied:'):
            raw = root / 'socket-observation-output-private' / reason.split(':', 1)[1]
            if raw.is_file():
                output = json.loads(raw.read_text())
                record['privilegedOutput'] = str(raw)
                reason += ':' + output.get('stderr', '')
                if output.get('timeout'):
                    reason += ':ownership_observation_deadline'
        record.update(reason=reason, category=category(reason))
    save(out, record)
    return record


def run(g, root, origin, policy):
    folder = root / 'receipts-private' / ('preflight-' + secrets.token_hex(16))
    folder.mkdir(mode=0o700)
    started = time.monotonic()
    records = []
    for number in range(1, 4):
        if time.monotonic()-started >= 45:
            break
        row = attempt(g, origin, policy, root, folder, number)
        records.append(row)
        if row['result'] == 'PASS' or row['category'] != 'POTENTIALLY_TRANSIENT':
            break
    successful = bool(records) and records[-1]['result'] == 'PASS'
    summary = {'result': 'PASS' if successful else 'DENY', 'attempts': len(records),
               'negativeAttemptsPreserved': sum(x['result'] != 'PASS' for x in records),
               'classification': ('TRANSIENT_CONFIRMED_BY_NEW_COMPLETE_READ' if successful and len(records)>1 else
                                  'COMPLETE_CURRENT_OBSERVATION' if successful else
                                  'REPEATED_OBSERVATION_BLOCKED_CAUSE_NOT_ESTABLISHED' if len(records)>1 else
                                  records[-1]['category'] if records else 'BUDGET_EXHAUSTED'),
               'privateResultDirectory': str(folder), 'elapsed': time.monotonic()-started,
               'executionGate': False}
    save(folder/'summary.private.json', summary)
    return summary


def main():
    require(len(sys.argv) == 1, 'fixed_preflight_no_arguments')
    origin = json.loads((P/'origin.private.json').read_text())
    require(digest(P/'policy.private.json') == 'b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0', 'policy_staging_integrity')
    require(digest(P/'origin.private.json') == 'e473c238902dcd757cca0a4c6c3f5ba7b6978bdf77ce9ad65323cc9536b401f6', 'origin_staging_integrity')
    for line in (P/'scripts.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(Path(name).name == name and digest(P/name) == expected, 'scripts_integrity:'+name)
    policy = json.loads((P/'policy.private.json').read_text())
    binding = json.loads((P/'socket-observer-binding.private.json').read_text())
    require(binding['policy'] == policy and binding['policySha256'] == digest(P/'policy.private.json') and
            binding['helperSha256'] == digest(P/'observer.py'), 'binding_staging_integrity')
    scope = json.loads((P/'observation-scope.private.json').read_text())
    require(scope['executionGate'] is False and scope['notAWindowPreparation'] is True, 'observation_only_scope')
    spec = importlib.util.spec_from_file_location('frontend_gates', P/'frontend-check.py')
    g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
    result = run(g, P, origin, policy)
    print(json.dumps(result, sort_keys=True))
    if result['result'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never dump environ, policy, cmdline or raw privileged result to the terminal.
        print('OBSERVATION_PREFLIGHT_DENIED:'+str(error), file=sys.stderr)
        raise SystemExit(1)
