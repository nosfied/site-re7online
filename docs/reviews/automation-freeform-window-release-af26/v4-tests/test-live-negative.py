"""Real OS/socket negatives in the private rootless PostgreSQL lab."""
import importlib.util
from pathlib import Path
import socket
import subprocess
import sys
import time
import unittest
import copy
import json
import os

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lab', BASE / 'test-live-set.py')
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

DOCKER = lab.DOCKER
HOST = ['--host', lab.SOCK]
NS = ['nsenter', '--target', os.environ['AF26_LAB_NAMESPACE_PID'],
      '--user', '--net', '--preserve-credentials', '--']


class Negatives(unittest.TestCase):
    def wait_extra(self, before, lock=False):
        for _ in range(100):
            state = lab.SYSTEM.db_backends()
            if state['advisoryLocks'] if lock else len(state['backends']) > before:
                return
            time.sleep(.02)
        self.fail('synthetic_extra_connection_not_visible')

    def denied(self):
        with self.assertRaises(RuntimeError):
            lab.check()

    def hold(self, command, lock=False):
        old = {b['pid'] for b in lab.SYSTEM.db_backends()['backends']}
        before = len(old)
        proc = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
        try:
            self.wait_extra(before, lock)
            self.denied()
        finally:
            proc.terminate()
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=3)
            added = {b['pid'] for b in lab.SYSTEM.db_backends()['backends']} - old
            for pid in added:
                subprocess.run([DOCKER, *HOST, 'exec', lab.CONTAINER, 'psql',
                    '-U', lab.DB_USER, '-d', lab.DB_NAME, '-Atqc',
                    f'SELECT pg_terminate_backend({pid})'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    def test_unknown_client_via_proxy(self):
        self.hold(NS + ['psql', f'postgresql://{lab.DB_USER}:{lab.DB_PASSWORD}@127.0.0.1:{lab.PORT}/{lab.DB_NAME}',
                        '-Atqc', 'SELECT pg_sleep(20)'])

    def test_direct_backend(self):
        self.hold([DOCKER, *HOST, 'exec', '-e', 'PGPASSWORD=' + lab.DB_PASSWORD,
                   lab.CONTAINER, 'psql', '-h', lab.CONTAINER_IP, '-U', lab.DB_USER,
                   '-d', lab.DB_NAME, '-Atqc', 'SELECT pg_sleep(20)'])

    def test_unix_backend(self):
        self.hold([DOCKER, *HOST, 'exec', lab.CONTAINER, 'psql', '-U', lab.DB_USER,
                   '-d', lab.DB_NAME, '-Atqc', 'SELECT pg_sleep(20)'])

    def test_advisory_lock(self):
        self.hold([DOCKER, *HOST, 'exec', lab.CONTAINER, 'psql', '-U', lab.DB_USER,
                   '-d', lab.DB_NAME, '-Atqc',
                   'SELECT pg_advisory_lock(73); SELECT pg_sleep(20)'], lock=True)

    def test_incomplete_proxy_tcp(self):
        proc = subprocess.Popen(NS + ['python3', '-c',
            f'import socket,time;s=socket.create_connection(("127.0.0.1",{lab.PORT}));time.sleep(20)'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                observed = lab.SYSTEM.proxy_socket_inventory('lab')
                if len([r for r in observed['sockets']['tcp'] if r['local'] == ['127.0.0.1', lab.PORT]
                        and r['state'] == '01']) > 2:
                    break
                time.sleep(.02)
            self.denied()
        finally:
            proc.terminate(); proc.wait(timeout=3)

    def test_real_churn_between_samples(self):
        class Churn(lab.Local):
            count = 0
            held = None
            def db_container(self):
                self.count += 1
                if self.count == 3:
                    self.held = socket.create_connection(('127.0.0.1', lab.PORT))
                return super().db_container()
        system = Churn()
        try:
            with self.assertRaises(RuntimeError):
                lab.check(system)
            self.assertEqual(system.count >= 3, True)
        finally:
            if system.held: system.held.close()

    def test_real_http_socket_closes_between_samples(self):
        proc = subprocess.Popen(NS + ['python3', '-c',
            f'import socket,time;s=socket.create_connection(("::1",{lab.HTTP_PORT}));time.sleep(20)'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                inv = lab.SYSTEM.api_socket_inventory(lab.API_PID)
                if any(r['local'][1] == lab.HTTP_PORT and r['state'] == '01' for r in inv['tcp6']):
                    break
                time.sleep(.02)
            self.assertTrue(any(r['local'][1] == lab.HTTP_PORT and r['state'] == '01' for r in inv['tcp6']))
            class Closing(lab.Local):
                count = 0
                def db_container(self):
                    self.count += 1
                    if self.count == 2:
                        proc.terminate(); proc.wait(timeout=3)
                        for _ in range(100):
                            inv = self.api_socket_inventory(lab.API_PID)
                            if not any(r['local'][1] == lab.HTTP_PORT and r['state'] == '01'
                                       for r in inv['tcp6']):
                                break
                            time.sleep(.02)
                    return super().db_container()
            with self.assertRaisesRegex(RuntimeError, 'db_owner_changed_during_check|api_unclassified_socket'):
                lab.check(Closing())
        finally:
            if proc.poll() is None:
                proc.terminate(); proc.wait(timeout=3)

    def test_ipv6_http_is_classified_not_db(self):
        proc = subprocess.Popen(NS + ['python3', '-c',
            f'import socket,time;s=socket.create_connection(("::1",{lab.HTTP_PORT}));time.sleep(10)'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                inv = lab.SYSTEM.api_socket_inventory(lab.API_PID)
                if any(r['local'][1] == lab.HTTP_PORT and r['state'] == '01' for r in inv['tcp6']):
                    break
                time.sleep(.02)
            self.assertTrue(any(r['local'][1] == lab.HTTP_PORT and r['state'] == '01' for r in inv['tcp6']))
            self.assertEqual(lab.check()['apiConnections'], 2)
        finally:
            proc.terminate(); proc.wait(timeout=3)

    def test_proxy_identity_binding_mismatch(self):
        bindings = copy.deepcopy(lab.BINDINGS)
        bindings['proxyIdentity']['ticks'] = 'replaced'
        with self.assertRaisesRegex(RuntimeError, 'proxy_identity_changed'):
            lab.check(bindings=bindings)

    def test_api_identity_binding_mismatch(self):
        saved = lab.SYSTEM.identity(lab.API_PID)
        saved['ticks'] = 'replaced'
        with self.assertRaisesRegex(RuntimeError, 'successor_identity_changed'):
            lab.SYSTEM.db_only_successor_api(lab.API_PID, saved, lab.URL, lab.BINDINGS)

    def test_privileged_observer_unavailable_denies(self):
        with self.assertRaisesRegex(RuntimeError, 'proxy_observer_not_installed'):
            lab.ops.System().proxy_socket_inventory(lab.BINDINGS['observerSha256'])

    def test_unexpected_ipv6_db_socket_fixture_denied(self):
        class IPv6(lab.Local):
            def api_socket_inventory(self, pid):
                inv = super().api_socket_inventory(pid)
                inv['tcp6'].append({'inode':'synthetic', 'local':['::1',40100],
                                    'peer':['::1',lab.PORT], 'state':'01'})
                return inv
        with self.assertRaisesRegex(RuntimeError, 'api_unclassified_socket'):
            lab.check(IPv6())

    def test_ipv6_bridge_fixture_denied(self):
        class BridgeIPv6(lab.Local):
            def run(self, args, text=None):
                raw = super().run(args, text)
                if args[:2] == ['docker', 'inspect']:
                    items = json.loads(raw)
                    for net in items[0]['NetworkSettings']['Networks'].values():
                        net['GlobalIPv6Address'] = 'fd00::2'
                    return json.dumps(items)
                return raw
        with self.assertRaisesRegex(RuntimeError, 'db_ipv6_path_unmodeled'):
            lab.check(BridgeIPv6())

if __name__ == '__main__':
    unittest.main(verbosity=2)
