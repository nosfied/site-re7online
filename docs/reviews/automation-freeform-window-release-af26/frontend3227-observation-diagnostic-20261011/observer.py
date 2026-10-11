"""Proposed fixed read-only root observer. Not installed or production authorized.

CLI: Python -I -S, no arguments, one root-owned policy path. No execution of
preparation files, provider, PM2, shell or configuration mutation. observe(policy)
is callable only to exercise this same reader inside an isolated laboratory.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import time

POLICY = Path('/usr/local/libexec/re7/frontend-socket-observer-policy.json')


def require(value, reason):
    if not value:
        raise RuntimeError(reason)



class OwnershipObservationError(RuntimeError):
    """Safe context only: never serialize environment, cmdline, cwd or file content."""
    def __init__(self, reason, context, original):
        super().__init__(reason)
        number = getattr(original, 'errno', None)
        self.diagnostic = {
            'reason': reason, 'stage': context['stage'], 'pid': context['pid'],
            'startTicks': context['startTicks'], 'fd': context['fd'],
            'originalError': {'type': type(original).__name__, 'errno': number,
                              'strerror': os.strerror(number) if type(number) is int else None}}


def identity(pid):
    parts = Path('/proc', str(pid), 'stat').read_text().rsplit(') ', 1)[1].split()
    return {'pid': pid, 'ticks': parts[19], 'parent': int(parts[1]),
            'group': int(parts[2]), 'state': parts[0]}


def data(path):
    p = Path(path)
    require(p.is_file() and not p.is_symlink(), 'data_file_type')
    with p.open('rb') as stream:
        raw = stream.read(1048577)
    require(len(raw) <= 1048576, 'data_file_size')
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def validate_policy(policy):
    require(set(policy) == {'version', 'bootId', 'daemon', 'roles', 'frontendPort'}, 'policy_schema')
    require(type(policy['version']) is int and policy['version'] == 1, 'policy_version')
    require(set(policy['daemon']) == {'pid', 'ticks'}, 'policy_daemon_schema')
    require(type(policy['daemon']['pid']) is int and policy['daemon']['pid'] > 0 and
            type(policy['daemon']['ticks']) is str and policy['daemon']['ticks'].isdecimal(), 'policy_daemon_identity')
    require(type(policy['frontendPort']) is int and 0 < policy['frontendPort'] < 65536, 'policy_port')
    require(set(policy['roles']) == {'source', 'candidate', 'return'}, 'policy_roles')
    for role in policy['roles'].values():
        require(set(role) == {'release', 'entry', 'nonce', 'capture'}, 'policy_role_schema')
        require(all(type(v) is str and v for v in role.values()), 'policy_role_types')
        require(Path(role['release']).is_absolute() and Path(role['entry']).is_relative_to(role['release']), 'policy_artifact_paths')
        require(Path(role['capture']).is_absolute(), 'policy_capture_path')
        require(len(role['nonce']) == 64 and all(x in '0123456789abcdef' for x in role['nonce']), 'policy_nonce')


def socket_tables(frontend_port):
    tables = {}; listeners = []
    for kind in ['tcp', 'tcp6', 'udp', 'udp6', 'raw', 'raw6', 'unix', 'netlink', 'packet']:
        path = Path('/proc/net', kind)
        require(path.is_file(), 'network_table_missing:' + kind)
        for line in path.read_text().splitlines()[1:]:
            fields = line.split()
            inode = fields[6] if kind == 'unix' else fields[-1] if kind in ['netlink', 'packet'] else fields[9]
            if kind in ['tcp', 'tcp6'] and fields[3] == '0A' and int(fields[1].split(':')[-1], 16) == frontend_port:
                listeners.append(inode)
            if inode == '0':
                continue
            value = {'kind': kind, 'state': fields[5] if kind == 'unix' else fields[3],
                     'type': fields[4] if kind == 'unix' else None,
                     'flags': fields[3] if kind == 'unix' else None}
            require(inode not in tables, 'socket_table_ambiguous')
            tables[inode] = value
    return tables, sorted(listeners)


def sample(policy, deadline=None):
    def budget():
        require(deadline is None or time.monotonic() < deadline, 'ownership_observation_deadline')
    budget()
    require(Path('/proc/sys/kernel/random/boot_id').read_text().strip() == policy['bootId'], 'boot_changed')
    daemon = identity(policy['daemon']['pid'])
    require(daemon['ticks'] == policy['daemon']['ticks'] and daemon['state'] not in ['Z', 'X', 'x'], 'daemon_identity_changed')
    fd0 = os.readlink(f'/proc/{daemon["pid"]}/fd/0')
    relevant = set()
    captures = {}
    for label, role in policy['roles'].items():
        budget()
        path = Path(role['capture'])
        require(not path.is_symlink() and path.parent.is_dir(), 'capture_path_incomplete')
        if not path.exists():
            captures[label] = None
            continue
        value, digest = data(path)
        require(set(value) == {'tree', 'sockets'} and type(value['tree']) is list and type(value['sockets']) is list, 'capture_schema')
        require(len(value['sockets']) <= 8192 and all(type(x) is str and x.isdecimal() and x != '0' for x in value['sockets']), 'capture_socket_schema')
        relevant.update(value['sockets'])
        captures[label] = digest
    if fd0.startswith('socket:['):
        relevant.add(fd0[8:-1])
    owners = {}
    processes = []
    # All UIDs. Permission failure or ambiguous/transient read denies, never an exemption.
    for folder in sorted(Path('/proc').iterdir(), key=lambda x: x.name):
        if not folder.name.isdecimal():
            continue
        budget()
        pid = int(folder.name)
        context = {'stage': 'process_identity', 'pid': pid, 'startTicks': None, 'fd': None}
        try:
            q = identity(pid)
            context['startTicks'] = q['ticks']
            links = {}
            context['stage'] = 'process_fd_list'
            for fd in (folder / 'fd').iterdir():
                budget()
                context.update(stage='process_fd_readlink', fd=fd.name)
                try:
                    links[fd.name] = os.readlink(fd)
                except FileNotFoundError as original:
                    # The observer's own directory enumeration can create/close its directory FD.
                    if pid != os.getpid():
                        raise OwnershipObservationError('fd_observation_incomplete', context, original)
            context.update(stage='process_environ', fd=None)
            env = (folder / 'environ').read_bytes().split(b'\0')
            context['stage'] = 'process_cmdline'
            cmd = (folder / 'cmdline').read_bytes()
            context['stage'] = 'process_cwd'
            cwd = os.readlink(folder / 'cwd')
            labels = [name for name, role in policy['roles'].items()
                      if ('RE7_FRONT_RUN=' + role['nonce']).encode() in env or
                      cwd == role['release'] or role['entry'].encode() in cmd]
            # Even a zombie must appear if it is a relevant executor; inaccessible cwd denies.
            processes.append({**q, 'roles': labels})
            for fd, link in links.items():
                if link.startswith('socket:['):
                    owners.setdefault(link[8:-1], []).append({'pid': pid, 'ticks': q['ticks'], 'fd': fd, 'state': q['state']})
        except PermissionError as original:
            raise OwnershipObservationError('ownership_observation_permission_denied', context, original) from original
        except (FileNotFoundError, ProcessLookupError) as original:
            raise OwnershipObservationError('ownership_observation_incomplete', context, original) from original
    network, listeners = socket_tables(policy['frontendPort'])
    daemon_after = identity(daemon['pid'])
    require(daemon_after['ticks'] == daemon['ticks'] and daemon_after['state'] not in ['Z', 'X', 'x'] and
            os.readlink(f'/proc/{daemon["pid"]}/fd/0') == fd0, 'daemon_changed_during_sample')
    return {'daemon': {'pid': daemon['pid'], 'ticks': daemon['ticks']}, 'daemonFd0': fd0, 'listeners': listeners,
            'captures': captures, 'processes': processes,
            'owners': {i: owners.get(i, []) for i in sorted(relevant)},
            'network': {i: network.get(i) for i in sorted(relevant)}}


def stable_signature(value):
    # R/S is scheduling, not identity. Unrelated churn cannot certify a relevant transient.
    return {'daemon': value['daemon'], 'daemonFd0': value['daemonFd0'], 'captures': value['captures'],
            'processes': [{k: v for k, v in q.items() if k != 'state'} |
                          {'dead': q['state'] in ['Z', 'X', 'x']}
                          for q in value['processes'] if q['roles']],
            'listeners': value['listeners'],
            'owners': {i: [{k: v for k, v in owner.items() if k != 'state'} |
                          {'dead': owner['state'] in ['Z', 'X', 'x']} for owner in rows]
                       for i, rows in value['owners'].items()}, 'network': value['network']}


def observe(policy):
    validate_policy(policy)
    started = time.monotonic()
    first = sample(policy, started+8); second = sample(policy, started+8)
    require(stable_signature(first) == stable_signature(second), 'ownership_observation_changed')
    return {'version': 1, 'observationId': secrets.token_hex(32), 'bootId': policy['bootId'],
            'startedMonotonic': started, 'finishedMonotonic': time.monotonic(), 'samples': [first, second]}


def main():
    require(len(sys.argv) == 1 and os.geteuid() == 0, 'fixed_root_invocation_required')
    for path in (Path(__file__), POLICY):
        for node in (path, *path.parents):
            st = node.lstat()
            require(st.st_uid == 0 and not st.st_mode & 0o022 and not node.is_symlink(), 'installed_path_denied')
        require(path.is_file(), 'installed_file_type')
    policy, digest = data(POLICY)
    require(policy['frontendPort'] == 3000, 'installed_policy_port')
    require(all(r['release'].startswith('/opt/re7online/releases/') and
                r['capture'].startswith('/opt/re7online/backups/converta-persistent/preparations/frontend-')
                for r in policy['roles'].values()), 'installed_policy_scope')
    result = observe(policy); result['policySha256'] = digest; result['helperSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    print(json.dumps(result, sort_keys=True))



def report_denial(error):
    print('frontend_socket_observation_denied:' + str(error), file=sys.stderr)
    if isinstance(error, OwnershipObservationError):
        print(json.dumps({'observationDiagnostic': error.diagnostic}, sort_keys=True), file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report_denial(error)
        raise SystemExit(1)
