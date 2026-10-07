"""One proposed absence contract for source, candidate and return. No cached certificate."""
import hashlib
import json
from pathlib import Path


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def absent(observation, policy, role, ledger, capture=None):
    require(observation['version'] == 1 and observation['bootId'] == policy['bootId'], 'observation_binding')
    require(len(observation['samples']) == 2, 'observations_required')
    samples = observation['samples']
    if capture:
        digest = hashlib.sha256(Path(capture).read_bytes()).hexdigest()
        inodes = json.loads(Path(capture).read_text())['sockets']
    else:
        digest = None; inodes = []
    for sample in samples:
        require(sample['daemon'] == policy['daemon'], 'daemon_binding')
        require(not sample['listeners'], 'frontend_listener_survived')
        require(sample['captures'][role] == digest, 'capture_binding')
        by_pid = {q['pid']: q for q in sample['processes']}
        for q in ledger:
            # PID reuse, zombies, and a surviving descendant are all denial, not exceptions.
            require(q['pid'] not in by_pid, 'executor_or_reused_pid_survived')
        require(not any(role in q['roles'] for q in sample['processes']), 'executor_survived')
        for inode in inodes:
            owners = sample['owners'][inode];network = sample['network'][inode]
            if not owners and network is None:
                continue
            require(network == {'kind': 'unix', 'state': '03', 'type': '0001', 'flags': '00000000'}, 'private_socket_or_listener_survived')
            require(sample['daemonFd0'] == 'socket:[' + inode + ']', 'private_socket_survived')
            require(len(owners) == 1 and owners[0]['pid'] == policy['daemon']['pid'] and
                    owners[0]['ticks'] == policy['daemon']['ticks'] and owners[0]['fd'] == '0' and
                    owners[0]['state'] not in ['Z', 'X', 'x'], 'additional_socket_owner')
    return True


def preflight(observation, policy, capture):
    value = json.loads(Path(capture).read_text())
    expected = {(x['pid'], x['ticks']) for x in value['tree']}
    digest = hashlib.sha256(Path(capture).read_bytes()).hexdigest()
    for sample in observation['samples']:
        require(sample['daemon'] == policy['daemon'] and sample['captures']['source'] == digest, 'preflight_binding')
        actual = {(x['pid'], x['ticks']) for x in sample['processes'] if 'source' in x['roles']}
        require(actual == expected, 'source_executor_missing_or_additional')
        require(not any(x['state'] in ['Z', 'X', 'x'] for x in sample['processes'] if 'source' in x['roles']), 'source_executor_dead')
        for inode in value['sockets']:
            owners = sample['owners'][inode]
            require(owners, 'source_socket_observation_missing')
            for owner in owners:
                if (owner['pid'], owner['ticks']) in expected:
                    require(owner['state'] not in ['Z', 'X', 'x'], 'source_socket_dead_owner')
                    continue
                require(owner['pid'] == policy['daemon']['pid'] and owner['ticks'] == policy['daemon']['ticks'] and owner['fd'] == '0' and
                        sample['daemonFd0'] == 'socket:[' + inode + ']' and
                        sample['network'][inode] == {'kind': 'unix', 'state': '03', 'type': '0001', 'flags': '00000000'}, 'source_socket_additional_owner')
        require(sample['listeners'] and all(i in value['sockets'] for i in sample['listeners']), 'frontend_listener_unexplained')
    return True
