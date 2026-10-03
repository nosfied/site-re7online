"""Four operational modes using the real proxy/PG gate with simulated PM2."""
import importlib.util
import json
from pathlib import Path
import socket
import sys
import os
import time
import unittest

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ['AF26_V4_PACKAGE']).resolve() / 'switch'))
import ops
import delegated

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

fixture_mod = load('fixture_mod', BASE / 'test-package-set.py')
lab = load('lab', BASE / 'test-live-set.py')
orig_configs = fixture_mod.configs
def configs(version):
    cfg = orig_configs(version)
    cfg['apps'][0]['env']['DATABASE_URL'] = lab.URL
    cfg['apps'][0]['env']['PORT'] = str(lab.HTTP_PORT)
    return cfg
fixture_mod.configs = configs

class Integrated(unittest.TestCase):
    def setUp(self):
        self.fx = fixture_mod.PackageTests()
        self.fx.setUp()
        (self.fx.window / 'db-owner-bindings.private.json').write_text(json.dumps(lab.BINDINGS))
        self.real = lab.Local()

    def tearDown(self):
        self.fx.tearDown()

    def attach_real_api(self, root):
        fake = self.fx.d
        original_identity = fake.identity
        fake.identity = lambda pid: self.real.identity(pid) if pid == lab.API_PID else original_identity(pid)
        fake.live[ops.API]['pid'] = lab.API_PID
        (root / ('started-' + ops.API + '.json')).write_text(json.dumps({
            'pid': lab.API_PID, 'identity': self.real.identity(lab.API_PID)}))
        fake.db_only_successor_api = self.real.db_only_successor_api

    def renew_and_start_worker(self, root, operation, expect_error=None):
        action = 'start:' + ops.WORKER
        delegated.request(root, action, self.fx.d.guard(), now=1000, driver=self.fx.d)
        before = self.fx.d.calls.count('start:' + ops.WORKER)
        if expect_error:
            with self.assertRaisesRegex(RuntimeError, expect_error):
                delegated.request(root, action, self.fx.d.guard(), now=1301,
                                  driver=self.fx.d)
            with self.assertRaisesRegex(RuntimeError, expect_error):
                operation.start(ops.WORKER)
            self.assertFalse((root / ('start-intent-' + ops.WORKER + '.json')).exists())
            self.assertEqual(before, self.fx.d.calls.count('start:' + ops.WORKER))
        else:
            delegated.request(root, action, self.fx.d.guard(), now=1301,
                              driver=self.fx.d)
            operation.start(ops.WORKER)
            self.assertEqual(before + 1, self.fx.d.calls.count('start:' + ops.WORKER))

    def test_four_modes_real_gate_on_renewal_and_start(self):
        # Each mode gets a fresh fake world; the API/PG/proxy are real and read-only.
        for mode in ('switch', 'return', 'return-partial', 'return-front-missing'):
            with self.subTest(mode=mode):
                if mode != 'switch':
                    self.tearDown(); self.setUp()
                switch = self.fx.o
                switch.stop()
                switch.start(ops.API)
                if mode == 'switch':
                    root, operation = self.fx.switch, switch
                elif mode == 'return':
                    switch.start(ops.WORKER); switch.stop(frontend=True); switch.start(ops.FRONT)
                    root = self.fx.folder('return', self.fx.new, self.fx.old)
                    operation = ops.Operations(root, self.fx.d)
                    operation.stop(); operation.start(ops.API)
                elif mode == 'return-partial':
                    source = json.loads(json.dumps(self.fx.new))
                    source['apps'][2] = self.fx.old['apps'][2]
                    root = self.fx.folder('return-partial', source, self.fx.old, recovery=True)
                    operation = ops.Operations(root, self.fx.d)
                    operation.stop(recovery=True); operation.start(ops.API)
                else:
                    switch.start(ops.WORKER); switch.stop(frontend=True)
                    root = self.fx.folder('return-front-missing', self.fx.new,
                                          self.fx.old, recovery=True, absent=True)
                    operation = ops.Operations(root, self.fx.d)
                    operation.stop(recovery=True); operation.start(ops.API)
                self.attach_real_api(root)
                self.renew_and_start_worker(root, operation)

    def test_api_started_observer_failure_never_submits_worker(self):
        self.fx.o.stop()
        self.fx.o.start(ops.API)
        self.attach_real_api(self.fx.switch)
        self.real.proxy_socket_inventory = lambda sha: (_ for _ in ()).throw(
            RuntimeError('proxy_observer_unavailable'))
        self.renew_and_start_worker(self.fx.switch, self.fx.o,
                                    expect_error='proxy_observer_unavailable')

    def test_unknown_client_blocks_renewal_and_start_without_intent(self):
        self.fx.o.stop()
        self.fx.o.start(ops.API)
        self.attach_real_api(self.fx.switch)
        unknown = socket.create_connection(('127.0.0.1', lab.PORT))
        try:
            for _ in range(100):
                rows = self.real.proxy_socket_inventory('lab')['sockets']['tcp']
                if len([r for r in rows if r['local'] == ['127.0.0.1', lab.PORT]
                        and r['state'] == '01']) > 2:
                    break
                time.sleep(.02)
            self.renew_and_start_worker(self.fx.switch, self.fx.o,
                                        expect_error='api_proxy_ingress_mismatch')
        finally:
            unknown.close()

if __name__ == '__main__':
    unittest.main(verbosity=2)
