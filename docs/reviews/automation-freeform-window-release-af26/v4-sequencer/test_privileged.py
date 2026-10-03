"""Isolated file/process rehearsal; nft/systemctl commands are injected."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import privileged as p


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.cron = self.base / 'cron'
        self.cron.write_bytes(b'before')
        self.guard = self.base / 'guard'
        self.guard.write_text(json.dumps({'version': 1, 'open': False,
             'generation': 14, 'tasks': {}, 'audit': []}))
        self.state = None
        self.fence = False
        self.boot = 'enabled'
        self.fail_fence_once = False
        self.value = {'cronBefore': b'before', 'cronWindow': b'window',
                      'fence': b'table inet re7_campaign_transition {}',
                      'policySha256': 'synthetic', 'sourceProcesses': {}}
        self.patches = [patch.object(p, 'CRON', self.cron),
                        patch.object(p, 'GUARD', self.guard),
                        patch.object(p, 'source_processes_alive', lambda v: None),
                        patch.object(p, 'target_processes_live', lambda v, m: None),
                        patch.object(p, 'phase_read', lambda: self.state),
                        patch.object(p, 'phase_write', self.write_phase),
                        patch.object(p, 'nft_absent', self.absent),
                        patch.object(p, 'nft_present', self.present),
                        patch.object(p, 'system', self.system),
                        patch.object(p, 'write_cron', self.cron.write_bytes)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.tmp.cleanup()

    def write_phase(self, stage, policy_hash, mode=None):
        self.state = {'stage': stage, 'policySha256': policy_hash, 'mode': mode}

    def absent(self):
        if self.fence:
            raise RuntimeError('fence_present')
        return b'{"nftables":[]}'

    def present(self):
        if not self.fence:
            raise subprocess.CalledProcessError(1, 'nft')
        return b'{"nftables":[]}'

    def system(self, args, *, input_bytes=None):
        if args[:2] == ['/usr/bin/systemctl', 'show']:
            return ('ActiveState=inactive\nUnitFileState=' + self.boot + '\n').encode()
        if args[:2] == ['/usr/bin/systemctl', 'disable']:
            self.boot = 'disabled'
        elif args[:2] == ['/usr/bin/systemctl', 'enable']:
            self.boot = 'enabled'
        elif args[:3] == ['/usr/sbin/nft', '--file', '-']:
            if self.fail_fence_once:
                self.fail_fence_once = False
                raise subprocess.CalledProcessError(1, 'nft')
            self.fence = True
        elif args[:3] == ['/usr/sbin/nft', 'delete', 'table']:
            self.fence = False
        return b''

    def test_sequential_effects_and_restoration(self):
        p.act('enter', self.value)
        self.assertEqual((self.cron.read_bytes(), self.boot, self.fence, self.state['stage']),
                         (b'window', 'disabled', True, 'fenced'))
        with self.assertRaisesRegex(RuntimeError, 'phase_drift'):
            p.act('unfence', self.value)
        p.act('authorize-switch', self.value)
        p.act('unfence', self.value)
        p.act('restore-controls', self.value)
        self.assertEqual((self.cron.read_bytes(), self.boot, self.fence, self.state['stage']),
                         (b'before', 'enabled', False, 'complete'))

    def test_real_guard_read_rejects_work_invalid_shape_and_open(self):
        good = json.loads(self.guard.read_text())
        p.guard_closed()
        cases = (
            {'tasks': {'active': {'phase': 'provider'}}},
            {'tasks': None}, {'tasks': False}, {'tasks': ''}, {'tasks': []},
            {'open': True}, {'open': None}, {'version': False},
            {'generation': False}, {'audit': None},
        )
        for change in cases:
            with self.subTest(change=change):
                self.guard.write_text(json.dumps(good | change))
                with self.assertRaisesRegex(RuntimeError, 'guard_(schema_invalid|not_closed_drained)'):
                    p.guard_closed()
        missing = good.copy()
        missing.pop('tasks')
        self.guard.write_text(json.dumps(missing))
        with self.assertRaisesRegex(RuntimeError, 'guard_schema_invalid'):
            p.guard_closed()

    def test_partial_privileged_failure_recovered_before_stop(self):
        self.fail_fence_once = True
        with self.assertRaises(subprocess.CalledProcessError):
            p.act('enter', self.value)
        self.assertEqual((self.cron.read_bytes(), self.boot, self.fence),
                         (b'window', 'disabled', False))
        p.act('abort-prestop', self.value)
        self.assertEqual((self.cron.read_bytes(), self.boot, self.fence, self.state['stage']),
                         (b'before', 'enabled', False, 'aborted'))

    def test_return_can_replace_ready_switch_before_unfence(self):
        p.act('enter', self.value)
        p.act('authorize-switch', self.value)
        self.assertEqual(self.state['mode'], 'switch')
        p.act('authorize-return', self.value)
        self.assertEqual(self.state['mode'], 'return')
        p.act('unfence', self.value)
        self.assertFalse(self.fence)


class ProcessIdentityTests(unittest.TestCase):
    def test_actual_child_processes_and_saved_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            script_a = base / 'api.js'
            script_w = base / 'worker.js'
            script_a.write_text('synthetic api')
            script_w.write_text('synthetic worker')
            saved, fallback = base / 'saved', base / 'fallback'
            saved.write_text('three compatible apps')
            fallback.write_bytes(saved.read_bytes())
            children = []
            try:
                children.append(subprocess.Popen(['sleep', '30']))
                for script in (script_a, script_w):
                    children.append(subprocess.Popen(
                        [sys.executable, '-c', 'import time;time.sleep(30)', str(script)],
                        cwd=base))
                front, api, worker = children
                daemon_identity = p.process_identity(os.getpid())
                front_identity = p.process_identity(front.pid)
                value = {
                    'pm2Daemon': {'pid': os.getpid(), 'ticks': daemon_identity['ticks']},
                    'sourceProcesses': {
                        're7-whatsapp-agent': {'pid': 99999991, 'ticks': '1'},
                        're7-whatsapp-web-worker': {'pid': 99999992, 'ticks': '1'},
                        're7-admin-front': {'pid': front.pid, 'ticks': front_identity['ticks']}},
                    'targetProcesses': {'switch': {
                        're7-whatsapp-agent': {'cwd': str(base), 'script': str(script_a),
                            'sha256': hashlib.sha256(script_a.read_bytes()).hexdigest()},
                        're7-whatsapp-web-worker': {'cwd': str(base), 'script': str(script_w),
                            'sha256': hashlib.sha256(script_w.read_bytes()).hexdigest()}}},
                    'savedPaths': {'pm2': str(saved), 'fallback': str(fallback)}}
                p.target_processes_live(value, 'switch')
                wrong = json.loads(json.dumps(value))
                wrong['pm2Daemon']['ticks'] = '0'
                with self.assertRaisesRegex(RuntimeError, 'pm2_daemon_drift'):
                    p.target_processes_live(wrong, 'switch')
                wrong = json.loads(json.dumps(value))
                wrong['sourceProcesses']['re7-admin-front']['ticks'] = '0'
                with self.assertRaisesRegex(RuntimeError, 'frontend_identity_drift'):
                    p.target_processes_live(wrong, 'switch')
                fallback.write_text('diverged')
                with self.assertRaisesRegex(RuntimeError, 'saved_fallback_drift'):
                    p.target_processes_live(value, 'switch')
                fallback.write_bytes(saved.read_bytes())
                worker.terminate()
                worker.wait(timeout=3)
                with self.assertRaisesRegex(RuntimeError, 'pm2_child_set_drift'):
                    p.target_processes_live(value, 'switch')
            finally:
                for child in children:
                    if child.poll() is None:
                        child.terminate()
                        child.wait(timeout=3)


class PolicyTests(unittest.TestCase):
    def test_phase_is_unique_to_immutable_policy_and_preserves_legacy_phase(self):
        first = p.phase_path('a' * 64)
        second = p.phase_path('b' * 64)
        self.assertNotEqual(first, second)
        self.assertNotEqual(first, Path('/var/lib/re7/incident-6683-v4-phase.json'))
        self.assertEqual(first.parent, second.parent)
        with self.assertRaisesRegex(RuntimeError, 'policy_hash_invalid'):
            p.phase_path('bad')

    def test_fixed_policy_bytes_and_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'policy.json'
            fence = b'table inet re7_campaign_transition {}'
            script = '/opt/re7online/releases/synthetic-api/index.js'
            target = {'cwd': '/opt/re7online/releases/synthetic-api',
                      'script': script, 'sha256': 'a' * 64}
            value = {
                'preparation': '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-synthetic',
                'fenceB64': base64.b64encode(fence).decode(),
                'fenceSha256': hashlib.sha256(fence).hexdigest(),
                'cronBeforeB64': base64.b64encode(b'before').decode(),
                'cronWindowB64': base64.b64encode(b'window').decode(),
                'sourceProcesses': {name: {'pid': index, 'ticks': str(index * 100)}
                    for index, name in enumerate(('re7-whatsapp-agent',
                        're7-whatsapp-web-worker', 're7-admin-front'), 101)},
                'pm2Daemon': {'pid': 100, 'ticks': '10000'},
                'targetProcesses': {mode: {
                    're7-whatsapp-agent': target,
                    're7-whatsapp-web-worker': target}
                    for mode in ('switch', 'return')},
                'savedPaths': {'pm2': '/home/deploy/.pm2/dump.pm2',
                               'fallback': '/home/deploy/.pm2/dump.pm2.bak'}}
            path.write_text(json.dumps(value))
            with patch.object(p, 'root_regular', lambda x: None):
                parsed = p.policy_from(path)
                self.assertEqual(parsed['fence'], fence)
                value['fenceSha256'] = '0' * 64
                path.write_text(json.dumps(value))
                with self.assertRaisesRegex(RuntimeError, 'policy_fence_hash'):
                    p.policy_from(path)


class IsolatedFileEffectsTests(unittest.TestCase):
    def test_atomic_cron_replacement_in_user_namespace(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'cron'
            target.write_bytes(b'before')
            code = '''import os,pathlib,stat,sys
sys.path.insert(0,sys.argv[1])
import privileged as p
p.CRON=pathlib.Path(sys.argv[2])
old=p.CRON.stat().st_ino
p.write_cron(b'window')
assert p.CRON.read_bytes()==b'window'
assert p.CRON.stat().st_ino!=old
assert stat.S_IMODE(p.CRON.stat().st_mode)==0o644
p.CRON.unlink()
p.CRON.symlink_to(pathlib.Path(sys.argv[2]).parent/'other')
try: p.write_cron(b'wrong')
except RuntimeError as e: assert str(e)=='cron_path_unsafe'
else: raise AssertionError('symlink accepted')
'''
            subprocess.run(['unshare', '-Ur', sys.executable, '-I', '-S', '-c',
                            code, str(Path(__file__).parent), str(target)],
                           check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=10)


if __name__ == '__main__':
    unittest.main()
