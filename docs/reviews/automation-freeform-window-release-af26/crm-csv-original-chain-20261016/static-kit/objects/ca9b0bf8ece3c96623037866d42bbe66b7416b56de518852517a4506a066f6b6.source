"""Fail-closed set attribution for the af26 API -> docker-proxy -> PostgreSQL gate.

Only the owner of each observed socket and the exact fixed DB route matter here.
This is a point-in-time proof; containment/PM2/nonce/old-exit gates stay in ops.py.
"""
import ipaddress
from urllib.parse import urlsplit


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def _tcp(rows, inode_set):
    return [r for r in rows if r['inode'] in inode_set]


def _pair(row):
    return (tuple(row['local']), tuple(row['peer']))


def _loopback(address):
    ip = ipaddress.ip_address(address)
    return ip.is_loopback or bool(isinstance(ip, ipaddress.IPv6Address) and
                                  ip.ipv4_mapped and ip.ipv4_mapped.is_loopback)


def _expected_proxy_args(args, host, port, target_ip):
    required = {'-proto': 'tcp', '-host-ip': host, '-host-port': str(port),
                '-container-ip': target_ip, '-container-port': '5432'}
    require(len(args) in (11, 12) and args[0].endswith('/docker-proxy'), 'proxy_arguments_drift')
    seen = {}
    i = 1
    while i < len(args):
        key = args[i]
        if key == '-use-listen-fd':
            require(key not in seen, 'proxy_arguments_drift')
            seen[key] = True
            i += 1
            continue
        require(key in required and key not in seen and i + 1 < len(args), 'proxy_arguments_drift')
        seen[key] = args[i + 1]
        i += 2
    require(all(seen.get(k) == v for k, v in required.items()), 'proxy_arguments_drift')
    require(set(seen) <= set(required) | {'-use-listen-fd'}, 'proxy_arguments_drift')


def _classify_api(inv, host, port, target_ip, http_port):
    require(not inv['udp'] and not inv['udp6'], 'api_unexpected_udp')
    # Node's unnamed socketpairs are not pathname sockets that can reach PG.
    require(all(not r['path'] and r['type'] == '0001' and r['state'] == '03'
                for r in inv['unix']), 'api_unexpected_unix')
    db, http = [], []
    for table in ('tcp', 'tcp6'):
        for row in inv[table]:
            local, peer, state = row['local'], row['peer'], row['state']
            require(peer != [target_ip, 5432], 'api_direct_db_socket')
            if table == 'tcp' and peer == [host, port] and state == '01':
                db.append(row)
            elif local[1] == http_port and state in ('01', '0A'):
                if state == '01':
                    require(_loopback(peer[0]), 'unexpected_http_during_fence')
                else:
                    require(local[0] in ('0.0.0.0', '::', '127.0.0.1', '::1'),
                            'unexpected_http_listener')
                http.append(row)
            else:
                # No generic exemption for a socket with a non-DB-looking peer.
                raise RuntimeError('api_unclassified_socket')
    require(len({_pair(r) for r in db}) == len(db), 'api_duplicate_db_socket')
    return db


def _classify_proxy(inv, host, port, target_ip):
    require(not inv['tcp6'] and not inv['unix'] and not inv['udp'] and not inv['udp6'],
            'proxy_unclassified_socket')
    listener, ingress, egress = [], [], []
    for row in inv['tcp']:
        local, peer, state = row['local'], row['peer'], row['state']
        if local == [host, port] and state == '0A' and peer[1] == 0:
            listener.append(row)
        elif local == [host, port] and state == '01':
            ingress.append(row)
        elif peer == [target_ip, 5432] and state == '01':
            egress.append(row)
        else:
            raise RuntimeError('proxy_unclassified_socket')
    require(len(listener) == 1, 'proxy_listener_drift')
    require(len({_pair(r) for r in ingress}) == len(ingress), 'proxy_duplicate_ingress')
    require(len({_pair(r) for r in egress}) == len(egress), 'proxy_duplicate_egress')
    return ingress, egress


def _one(system, pid, marker, host, port, bindings):
    current = system.identity(pid)
    require(current and current['ticks'] == marker['ticks'] and current['state'] != 'Z',
            'successor_identity_changed')
    target = system.db_container()
    require(target['id'] == bindings['containerId'] and
            target['ip'] == bindings['containerIp'] and
            target['published'] == [host, port], 'db_container_drift')
    api = system.api_socket_inventory(pid)
    proxy = system.proxy_socket_inventory(bindings['observerSha256'])
    require(proxy['identity'] == bindings['proxyIdentity'], 'proxy_identity_changed')
    require(proxy['exeSha256'] == bindings['proxySha256'], 'proxy_binary_drift')
    _expected_proxy_args(proxy['args'], host, port, target['ip'])
    db = system.db_backends(target['id'])
    require(db['advisoryLocks'] == 0, 'unknown_db_owner')
    api_db = _classify_api(api, host, port, target['ip'], bindings['apiHttpPort'])
    ingress, egress = _classify_proxy(proxy['sockets'], host, port, target['ip'])
    api_pairs = sorted((_pair(row) for row in api_db))
    inbound_pairs = sorted(((tuple(row['peer']), tuple(row['local'])) for row in ingress))
    require(api_pairs == inbound_pairs, 'api_proxy_ingress_mismatch')
    backend_pairs = [(b['address'], b['port']) for b in db['backends']]
    egress_pairs = sorted((row['local'][0], row['local'][1]) for row in egress)
    require(all(a is not None and isinstance(p, int) and p > 0 for a, p in backend_pairs),
            'unknown_db_owner')
    require(sorted(backend_pairs) == egress_pairs, 'proxy_backend_mismatch')
    # Moby TCPProxy's reviewed 1 Accept -> 1 DialTCP is required in addition
    # to the exact socket/backend matches; equal cardinalities alone are not proof.
    require(len(api_pairs) == len(egress_pairs), 'proxy_pair_cardinality')
    current = system.identity(pid)
    require(current and current['ticks'] == marker['ticks'] and current['state'] != 'Z',
            'successor_identity_changed')
    require(system.db_container() == target, 'db_container_changed_during_check')
    return (target, api, proxy, db)


def verify(system, pid, marker, database_url, bindings):
    url = urlsplit(database_url)
    require(url.scheme in ('postgres', 'postgresql'), 'db_endpoint_unprovable')
    try:
        host = str(ipaddress.IPv4Address(url.hostname))
        port = url.port or 5432
    except (TypeError, ValueError):
        raise RuntimeError('db_endpoint_unprovable')
    require(host == '127.0.0.1' and port == bindings['publishedPort'],
            'db_endpoint_unprovable')
    first = _one(system, pid, marker, host, port, bindings)
    second = _one(system, pid, marker, host, port, bindings)
    require(first == second, 'db_owner_changed_during_check')
    return {'apiConnections': len([r for r in first[1]['tcp'] if r['peer'] == [host, port]]),
            'proxyPid': first[2]['identity']['pid']}
