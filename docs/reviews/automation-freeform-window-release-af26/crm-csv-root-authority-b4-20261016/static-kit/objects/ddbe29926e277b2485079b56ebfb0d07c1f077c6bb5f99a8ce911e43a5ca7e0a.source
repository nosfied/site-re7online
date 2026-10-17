"""Fixed-scope, read-only docker-proxy socket observer for af26 review.

Operational installation must be root-owned at the fixed path in ops.py. Its
CLI accepts no arguments or environment-supplied paths. The callable function
is parameterized only so an isolated laboratory can use another published port.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import sys


def _identity(pid):
    raw = Path('/proc', str(pid), 'stat').read_text()
    fields = raw[raw.rfind(')') + 2:].split()
    if fields[0] == 'Z':
        raise RuntimeError('proxy_zombie')
    return {'pid': pid, 'ticks': fields[19]}


def _address(value, family):
    raw, port = value.split(':')
    if family == socket.AF_INET:
        addr = socket.inet_ntop(family, struct.pack('<I', int(raw, 16)))
    else:
        b = bytes.fromhex(raw)
        addr = socket.inet_ntop(family, b''.join(b[i:i + 4][::-1] for i in range(0, 16, 4)))
    return [addr, int(port, 16)]


def _inventory(pid):
    base = Path('/proc', str(pid))
    inodes = set()
    for fd in (base / 'fd').iterdir():
        link = os.readlink(fd)  # A vanished/unreadable FD denies the sample.
        if link.startswith('socket:['):
            inodes.add(link[8:-1])
    result = {'tcp': [], 'tcp6': [], 'unix': [], 'udp': [], 'udp6': []}
    observed = set()
    for table in result:
        for line in (base / 'net' / table).read_text().splitlines()[1:]:
            cols = line.split()
            inode = cols[6] if table == 'unix' else cols[9]
            if inode not in inodes:
                continue
            observed.add(inode)
            if table == 'unix':
                result[table].append({'inode': inode, 'type': cols[4],
                                      'state': cols[5], 'path': cols[7] if len(cols) > 7 else ''})
            else:
                family = socket.AF_INET6 if table.endswith('6') else socket.AF_INET
                result[table].append({'inode': inode, 'local': _address(cols[1], family),
                                      'peer': _address(cols[2], family), 'state': cols[3]})
    if observed != inodes:
        raise RuntimeError('proxy_socket_unclassified')
    for rows in result.values():
        rows.sort(key=lambda row: row['inode'])
    return result


def _args(pid):
    values = Path('/proc', str(pid), 'cmdline').read_bytes().split(b'\0')
    values = [v.decode('utf-8', 'strict') for v in values if v]
    if not values or Path(values[0]).name != 'docker-proxy':
        raise RuntimeError('proxy_executable_unexpected')
    return values


def observe_proxy(host_ip='127.0.0.1', host_port=5432):
    matches = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal():
            continue
        pid = int(entry.name)
        try:
            if (entry / 'comm').read_text().strip() != 'docker-proxy':
                continue
            args = _args(pid)
        except FileNotFoundError:
            continue
        if '-host-ip' in args and '-host-port' in args and \
           args[args.index('-host-ip') + 1] == host_ip and \
           args[args.index('-host-port') + 1] == str(host_port):
            matches.append((pid, args))
    if len(matches) != 1:
        raise RuntimeError('proxy_count_or_identity')
    pid, args = matches[0]
    before = _identity(pid)
    exe = Path('/proc', str(pid), 'exe')
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    sockets = _inventory(pid)
    if _identity(pid) != before or _args(pid) != args:
        raise RuntimeError('proxy_changed_during_sample')
    return {'identity': before, 'exeSha256': digest, 'args': args, 'sockets': sockets}


def main():
    if len(sys.argv) != 1 or os.geteuid() != 0:
        raise RuntimeError('fixed_root_invocation_required')
    print(json.dumps(observe_proxy(), sort_keys=True, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('proxy_observation_denied', file=sys.stderr)
        sys.exit(1)
