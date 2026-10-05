"""Directed injected regressions; real OS/PM2 coverage is a separate driver."""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from sequencer import Bridge, same_identity
from privileged_output import run_privileged, OBSERVER

class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.b = object.__new__(Bridge)
        self.b.root = Path(self.tmp.name)
        self.b.window = self.b.root / 'window'
        self.b.window.mkdir()
        (self.b.root / 'switch').mkdir()
        self.record = {'pid': 3, 'ticks': '4', 'tree': {'3':'4'}, 'socketIds':['5']}
    def tearDown(self): self.tmp.cleanup()
    def obs(self, sockets=None): return ({**self.record, 'socketIds': sockets or ['5']}, 7, (9,'10'))
    def capture(self, observations):
        with patch.object(self.b,'guard',return_value={'generation':7}), \
             patch.object(self.b,'privileged',return_value='{}'), \
             patch.object(self.b,'worker_capture_observation',side_effect=observations):
            self.b.capture_worker_before_unfence('switch',{}, {})
    def test_all_nine_actions_log_full_bytes_success_and_failure(self):
        actions=('inspect','check-absent','check-present','enter','unfence','restore-controls',
                 'abort-prestop','authorize-switch','authorize-return')
        for code in (0,1):
            for action in actions:
                payload=b'secret='+b'x'*18000+b'\xff'
                response=subprocess.CompletedProcess([],code,b'{"private":"token"}',payload)
                with patch('sequencer.subprocess.run',return_value=response):
                    if code:
                        with self.assertRaisesRegex(RuntimeError,'privileged_failed'):self.b.privileged(action)
                    else:self.b.privileged(action)
        records=[json.loads(x)for x in (self.b.window/'privileged-output.private.jsonl').read_text().splitlines()]
        self.assertEqual(len(records),18)
        self.assertEqual(base64.b64decode(records[-1]['stderrBase64']),payload)
        self.assertEqual(records[-1]['exitCode'],1)
        journal=(self.b.window/'sequencer.journal.jsonl').read_text()
        self.assertNotIn('token',journal);self.assertNotIn('secret=',journal)
        self.assertEqual((self.b.window/'privileged-output.private.jsonl').stat().st_mode&0o777,0o600)
    def test_transient_rs_is_not_identity_but_zombie_denies(self):
        self.assertTrue(same_identity({'ticks':'1','state':'R'},{'ticks':'1','state':'S'}))
        self.assertFalse(same_identity({'ticks':'1','state':'S'},{'ticks':'1','state':'Z'}))
        self.assertFalse(same_identity({'ticks':'1','state':'S'},{'ticks':'2','state':'S'}))
    def test_observer_success_and_failure_preserve_outputs(self):
        args=['sudo','-n','/usr/bin/python3','-I','-S',OBSERVER]
        for code in (0,1):
            with patch('privileged_output.subprocess.run',return_value=subprocess.CompletedProcess(args,code,b'{"synthetic":true}',b'synthetic diagnostic'))as call:
                if code:
                    with self.assertRaisesRegex(RuntimeError,'db-owner-observe'):run_privileged(args,self.b.window,'db-owner-observe',env={'LAB':'only'},timeout=10)
                else:self.assertEqual(run_privileged(args,self.b.window,'db-owner-observe',env={'LAB':'only'},timeout=10),b'{"synthetic":true}')
                self.assertEqual(call.call_args.kwargs['timeout'],10)
        rows=[json.loads(x)for x in (self.b.window/'privileged-output.private.jsonl').read_text().splitlines()]
        self.assertEqual(len(rows),2);self.assertEqual(base64.b64decode(rows[-1]['stderrBase64']),b'synthetic diagnostic')
    def test_observer_timeout_preserves_partial_streams(self):
        args=['sudo','-n','/usr/bin/python3','-I','-S',OBSERVER]
        with patch('privileged_output.subprocess.run',side_effect=subprocess.TimeoutExpired(args,10,output=b'partial-out',stderr=b'partial-err')):
            with self.assertRaisesRegex(RuntimeError,'exit=None'):run_privileged(args,self.b.window,'db-owner-observe',timeout=10)
        r=json.loads((self.b.window/'privileged-output.private.jsonl').read_text())
        self.assertIsNone(r['exitCode']);self.assertEqual(base64.b64decode(r['stdoutBase64']),b'partial-out')
    def test_extra_privileged_arguments_denied_before_command(self):
        with patch('privileged_output.subprocess.run')as call:
            with self.assertRaisesRegex(RuntimeError,'command_denied'):run_privileged(['sudo','sh'],self.b.window,'inspect')
        call.assert_not_called()
    def test_spawn_failure_is_recorded_without_fake_exit_code(self):
        with patch('sequencer.subprocess.run',side_effect=OSError('synthetic spawn failed')):
            with self.assertRaisesRegex(RuntimeError,'exit=None'):self.b.privileged('inspect')
        self.assertIsNone(json.loads((self.b.window/'privileged-output.private.jsonl').read_text())['exitCode'])
    def test_refresh_archives_every_previous_capture(self):
        self.capture([self.obs(),self.obs()]);p=self.b.root/'switch/worker-before-unfence.private.json';old=p.read_bytes()
        self.capture([self.obs(['6']),self.obs(['6'])])
        archives=list(p.parent.glob('worker-before-unfence.*.private.json'))
        self.assertEqual(len(archives),1);self.assertEqual(archives[0].read_bytes(),old)
        self.assertEqual(json.loads(p.read_text())['socketIds'],['6'])
    def test_churn_bounded_and_previous_capture_intact(self):
        self.capture([self.obs(),self.obs()]);p=self.b.root/'switch/worker-before-unfence.private.json';old=p.read_bytes()
        with self.assertRaisesRegex(RuntimeError,'unstable_after_3'):
            self.capture([self.obs(['5']),self.obs(['6'])]*3)
        self.assertEqual(p.read_bytes(),old)
    def test_identity_change_never_replaces_previous(self):
        self.capture([self.obs(),self.obs()]);wrong=({**self.record,'ticks':'changed'},7,(9,'10'))
        with self.assertRaisesRegex(RuntimeError,'identity_or_tree_drift'):self.capture([wrong,wrong])
    def test_incomplete_read_denies_without_replacing_capture(self):
        self.capture([self.obs(),self.obs()])
        p=self.b.root/'switch/worker-before-unfence.private.json';old=p.read_bytes()
        with self.assertRaises(PermissionError):self.capture([PermissionError('synthetic incomplete read')])
        self.assertEqual(p.read_bytes(),old)
    def test_guard_generation_drift_is_not_retried(self):
        with self.assertRaisesRegex(RuntimeError,'guard_generation_drift'):
            self.capture([self.obs(),(self.record,8,(9,'10'))])
    def test_unknown_unfence_failure_never_retried(self):
        with patch.object(self.b,'pre_unfence')as pre,patch.object(self.b,'privileged',side_effect=RuntimeError('privileged_failed:unfence:exit=1'))as call:
            with self.assertRaises(RuntimeError):self.b.renewed_unfence('switch')
        self.assertEqual(pre.call_count,1);self.assertEqual(call.call_count,1)
    def test_known_pre_delete_failure_refreshes_but_is_bounded(self):
        error=RuntimeError('privileged_failed:unfence:exit=1:worker_capture_sockets_drift')
        with patch.object(self.b,'pre_unfence')as pre,patch.object(self.b,'privileged',side_effect=error)as call:
            with self.assertRaisesRegex(RuntimeError,'unstable_after_3'):self.b.renewed_unfence('switch')
        self.assertEqual(pre.call_count,3);self.assertEqual(call.call_count,3)
if __name__=='__main__':unittest.main()
