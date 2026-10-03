"""Disposable live socket/PG test; synthetic rootless Docker only.

Set AF26_LAB_* to the isolated Docker/API instances prepared by the operator.
This file contains no productive endpoint, identity, credential or process ID.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

PACKAGE = Path(os.environ['AF26_V4_PACKAGE']).resolve()
if os.environ.get('AF26_LAB_ACK') != 'synthetic-isolated':
    raise RuntimeError('synthetic_lab_ack_required')
sys.path.insert(0, str(PACKAGE / 'switch'))
import ops
import db_owner_set_observer

DOCKER = os.environ['AF26_LAB_DOCKER']
SOCK = os.environ['AF26_LAB_DOCKER_SOCKET']
API_PID = int(os.environ['AF26_LAB_API_PID'])
PORT = int(os.environ['AF26_LAB_DB_PORT'])
if not SOCK.startswith('unix:///tmp/') or PORT == 5432:
    raise RuntimeError('private_lab_socket_and_nonproduction_port_required')
HTTP_PORT = int(os.environ['AF26_LAB_HTTP_PORT'])
CONTAINER = os.environ['AF26_LAB_CONTAINER_ID']
CONTAINER_IP = os.environ['AF26_LAB_CONTAINER_IP']
PROXY_SHA256 = os.environ['AF26_LAB_PROXY_SHA256']
DB_USER = os.environ.get('AF26_LAB_DB_USER', 're7_lab')
DB_NAME = os.environ.get('AF26_LAB_DB_NAME', 're7_proxy_lab')
DB_PASSWORD = os.environ['AF26_LAB_DB_PASSWORD']


class Local(ops.System):
    def run(self, args, text=None):
        if args[0] != 'docker':
            raise RuntimeError('lab_command_unexpected')
        args = [CONTAINER if x == 'wa-agent-postgres' else x for x in args[1:]]
        args = [DB_USER if x == 'wa_agent' else DB_NAME if x == 'whatsapp_agent' else x for x in args]
        return subprocess.check_output([DOCKER, '--host', SOCK, *args],
                                       input=text, text=True, timeout=10)

    def proxy_socket_inventory(self, expected_sha):
        return db_owner_set_observer.observe_proxy('127.0.0.1', PORT)


SYSTEM = Local()
BINDINGS = {
    'containerId': CONTAINER,
    'containerIp': CONTAINER_IP,
    'publishedPort': PORT,
    'apiHttpPort': HTTP_PORT,
    'proxySha256': PROXY_SHA256,
    'observerSha256': 'lab-direct-import',
}
BINDINGS['proxyIdentity'] = db_owner_set_observer.observe_proxy('127.0.0.1', PORT)['identity']
URL = f'postgresql://127.0.0.1:{PORT}/{DB_NAME}'


def check(system=SYSTEM, bindings=BINDINGS):
    return system.db_only_successor_api(API_PID, system.identity(API_PID), URL, bindings)


if __name__ == '__main__':
    print(json.dumps(check(), sort_keys=True))
