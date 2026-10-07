"""Directed driver tests: real files/FDs and actual client/contract.
PM2 metadata and privileged samples are explicit fixtures, NOT OS ownership proof.
Real PM2/Next/root-reader proof remains test_cluster_chain.py, unchanged.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import types
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'frontend-fa60f0f6-prepared'))
from unittest.mock import patch
import preflight as p
import socket_observation_client as client


def proc(pid):
    v=Path('/proc',str(pid),'stat').read_text().rsplit(') ',1)[1].split()
    return {'pid':pid,'ticks':v[19],'parent':int(v[1]),'group':int(v[2]),'state':v[0]}


class Driver(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'receipts-private').mkdir()
        code="""import socket,sys
ss=[]
def new():
 s=socket.socket();s.bind(('127.0.0.1',0));s.listen();ss.append(s);return s
s=new();print(s.getsockname()[1],s.fileno(),flush=True)
for line in sys.stdin:
 if line.strip()=='STOP':break
 if line.strip()=='OPEN':print(new().fileno(),flush=True)
"""
        self.child=subprocess.Popen([sys.executable,'-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
        self.port,self.fd=map(int,self.child.stdout.readline().split())
        q=proc(self.child.pid);self.q=q;self.calls=0
        boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();nonce=secrets.token_hex(32)
        self.origin={'bootId':boot,'daemon':{'pid':q['pid'],'ticks':q['ticks']},'pid':q['pid'],'ticks':q['ticks'],'pm2ExecMode':'cluster_mode','restartCount':0,'sourceControl':str(self.root/'control.json'),'sourceNonce':nonce,'sourceRelease':'/fixture/release','sourceEntry':'/fixture/release/next','entrySha256':'entry-digest','buildId':'build-fixture','tree':[q]}
        self.policy={'version':1,'bootId':boot,'daemon':self.origin['daemon'],'frontendPort':self.port,'roles':{k:{'release':self.origin['sourceRelease'],'entry':self.origin['sourceEntry'],'nonce':nonce if k=='source' else secrets.token_hex(32),'capture':str(self.root/(k+'-tree.private.json'))} for k in ['source','candidate','return']}}
        self.row={'pid':q['pid'],'name':'re7-admin-front','pm2_env':{'exec_mode':'cluster_mode','restart_time':0}}
        self.g=types.SimpleNamespace(BOOT_ID=Path('/proc/sys/kernel/random/boot_id'),PM_PID=self.root/'daemon.pid',FRONT='re7-admin-front',proc=proc,rows=lambda timeout:[self.row],supervision_live=lambda control,row:({'nonce':nonce,'release':self.origin['sourceRelease'],'entry':self.origin['sourceEntry'],'entrySha256':'entry-digest','buildId':'build-fixture'},{}),tree=lambda pid:[proc(pid)])
        self.g.PM_PID.write_text(str(q['pid']))
        (self.root/'socket-observer-binding.private.json').write_text(json.dumps({'policy':self.policy,'policySha256':'policy-fixture','helperSha256':'helper-fixture'}))
        self.real_read=client.read

    def tearDown(self):
        self.child.stdin.write('STOP\n');self.child.stdin.flush();self.child.wait(timeout=3);self.child.stdin.close();self.child.stdout.close();self.tmp.cleanup()

    def reader(self,policy):
        self.calls+=1
        cap=self.root/'source-tree.private.json';v=json.loads(cap.read_text());start=time.monotonic()
        sample={'daemon':policy['daemon'],'captures':{'source':hashlib.sha256(cap.read_bytes()).hexdigest()},'processes':[dict(proc(self.child.pid),roles=['source'])],'listeners':[os.readlink('/proc/'+str(self.child.pid)+'/fd/'+str(self.fd))[8:-1]],'daemonFd0':'fixture-no-shared-descriptor','owners':{i:[dict(pid=self.q['pid'],ticks=self.q['ticks'],fd=str(self.fd),state='S')] for i in v['sockets']},'network':{i:None for i in v['sockets']}}
        return {'version':1,'policySha256':'policy-fixture','helperSha256':'helper-fixture','observationId':secrets.token_hex(32),'bootId':policy['bootId'],'startedMonotonic':start,'finishedMonotonic':time.monotonic(),'samples':[sample,sample]}

    def execute(self,reader=None):
        with patch.object(p.client,'read',lambda root,stage:self.real_read(root,stage,reader=reader or self.reader)):
            return p.run(self.g,self.root,self.origin,self.policy)

    def test_complete_read_and_private_receipt(self):
        v=self.execute();self.assertEqual(v['result'],'PASS');self.assertEqual(self.calls,1)
        out=list((self.root/'socket-observation-output-private').glob('*.json'));self.assertEqual(len(out),1)
        self.assertEqual(out[0].stat().st_mode&0o777,0o600)

    def test_transient_then_fresh_pass_preserves_negative_and_old_capture(self):
        previous={'tree':[],'sockets':[]};(self.root/'source-tree.private.json').write_text(json.dumps(previous))
        n=0
        def reader(policy):
            nonlocal n;n+=1
            if n==1:raise RuntimeError('ownership_observation_changed')
            return self.reader(policy)
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts'],v['negativeAttemptsPreserved']),('PASS',2,1))
        folder=Path(v['privateResultDirectory']);self.assertEqual(json.loads((folder/'prior-source-1.private.json').read_text()),previous)
        self.assertEqual(json.loads((folder/'attempt-1.private.json').read_text())['result'],'DENY')

    def test_persistent_churn_is_bounded_and_not_claimed_permanent_permission(self):
        def reader(policy):raise RuntimeError('ownership_observation_changed')
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts']),('DENY',3))
        self.assertEqual(v['classification'],'REPEATED_OBSERVATION_BLOCKED_CAUSE_NOT_ESTABLISHED')
        self.assertEqual(len(list((self.root/'socket-observation-output-private').glob('*.json'))),3)

    def test_permission_denial_stops_and_preserves_privileged_cause(self):
        def reader(policy):raise RuntimeError('ownership_observation_permission_denied')
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts']),('DENY',1))
        raw=json.loads(next((self.root/'socket-observation-output-private').glob('*.json')).read_text())
        self.assertEqual(raw['stderr'],'ownership_observation_permission_denied')

    def test_missing_capability_is_not_transient(self):
        def reader(policy):raise RuntimeError('sudo: a password is required')
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts']),('DENY',1))

    def test_additional_owner_denies_without_retry(self):
        def reader(policy):
            v=self.reader(policy)
            for s in v['samples']:
                for rows in s['owners'].values():rows.append({'pid':999999,'ticks':'1','fd':'0','state':'S'})
            return v
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts']),('DENY',1))

    def test_identity_drift_denies_before_privileged_read(self):
        self.origin['ticks']='0';v=self.execute();self.assertEqual(v['result'],'DENY');self.assertEqual(self.calls,0)

    def test_incomplete_samples_denied_by_real_client(self):
        def reader(policy):
            v=self.reader(policy);v['samples']=v['samples'][:1];return v
        self.assertEqual(self.execute(reader)['result'],'DENY')

    def test_replay_time_denied_by_real_client(self):
        def reader(policy):
            v=self.reader(policy);v['startedMonotonic']=v['finishedMonotonic']=0;return v
        self.assertEqual(self.execute(reader)['result'],'DENY')

    def test_duplicate_pm2_source_denies_before_read(self):
        self.g.rows=lambda timeout:[self.row,self.row];v=self.execute();self.assertEqual(v['result'],'DENY');self.assertEqual(self.calls,0)

    def test_zombie_rejected_by_real_source_contract(self):
        def reader(policy):
            v=self.reader(policy)
            for s in v['samples']:s['processes'][0]['state']='Z'
            return v
        self.assertEqual(self.execute(reader)['result'],'DENY')

    def test_descriptor_change_after_reader_denies(self):
        def reader(policy):
            v=self.reader(policy)
            self.child.stdin.write('OPEN\n');self.child.stdin.flush();self.child.stdout.readline()
            return v
        v=self.execute(reader);self.assertEqual((v['result'],v['attempts']),('DENY',3))


if __name__=='__main__':unittest.main()
