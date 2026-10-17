"""Directed local proof of review commands. No ssh/sudo or existing operational suites."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('read_package',HERE/'read_package.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
RAW=(HERE/'read_package.py').read_bytes()


class Packet(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-r1r2-lab-')
        self.root=Path(self.tmp.name);self.root.chmod(0o700)
        self.lab=self.root/'fs';self.lab.mkdir(mode=0o700)
        for path in m.PROTECTED+m.EXTRA:
            p=self.lab/path.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True)
            if path.endswith('static-authority-installs'):p.mkdir()
            elif path.endswith('pm2-input.json'):p.symlink_to('/proc/self/fd')
            else:p.write_bytes(b'synthetic evidence only\n')
        self.view=m.root_inventory(self.lab)
        self.calls=[]
    def tearDown(self):self.tmp.cleanup()
    def runner(self,args,**kwargs):
        self.calls.append(args)
        if args[0]=='sudo':
            # Root/sudo and namespace simulated; real reader executes against fixture.
            out=json.dumps(m.root_inventory(self.lab)).encode()
        else:
            # Real local child transport, synthetic response, no system command runs.
            c=subprocess.run(['/usr/bin/python3','-I','-S','-c',
                'import sys;sys.stdout.buffer.write(b"synthetic-discovery\\n")'],capture_output=True,check=True)
            out=c.stdout
        return subprocess.CompletedProcess(args,0,out,b'')
    def capture(self):
        folder=self.root/'capture'
        self.assertTrue(m.collect(HERE,RAW,folder,run=self.runner))
        return folder
    def frame(self,folder):
        frame=m.export(folder);frame['source']=m.REMOTE+'/'+m.JOURNAL
        return json.dumps(frame).encode()
    def transport(self,frame,code=0):
        def run(args,**kw):
            self.assertEqual(args[:6],['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes'])
            self.assertEqual(kw['input'],RAW)
            return subprocess.CompletedProcess(args,code,frame,b'synthetic transport stderr')
        return run
    def test_inventory_covers_every_target_and_alias_without_following(self):
        self.assertEqual(self.view['result'],'RAW_INVENTORY_COMPLETE')
        self.assertEqual([x['path']for x in self.view['targets']],list(m.PROTECTED+m.EXTRA))
        alias=next(x for x in self.view['targets']if x['path']==m.LIB+'pm2-input.json')
        self.assertEqual(alias['target'],'/proc/self/fd');self.assertNotIn('sha256',alias)
    def test_absent_targets_are_observations_not_created(self):
        p=self.lab/m.PROTECTED[0].lstrip('/');p.unlink()
        row=m.observe(m.PROTECTED[0],self.lab)
        self.assertEqual(row['kind'],'absent');self.assertFalse(p.exists())
    def test_parent_symlink_denies_without_following(self):
        d=self.lab/'usr/local/libexec/re7';d.rename(d.with_name('real'));d.symlink_to(d.with_name('real'))
        v=m.root_inventory(self.lab);self.assertEqual(v['result'],'RAW_INVENTORY_DENY')
        self.assertTrue(v['errors'])
    def test_read_denied_is_not_absence(self):
        from unittest.mock import patch
        original=m.os.open
        def denied(path,*a,**kw):
            if path=='authority.py':raise PermissionError('synthetic denial')
            return original(path,*a,**kw)
        with patch.object(m.os,'open',side_effect=denied):v=m.root_inventory(self.lab)
        self.assertTrue(any(x['errorClass']=='PermissionError'for x in v['errors']))
    def test_substitution_during_file_read_denies(self):
        from unittest.mock import patch
        p=self.root/'race';p.write_bytes(b'one');original=m.os.fstat;calls=0
        def change(fd):
            nonlocal calls
            calls+=1
            if calls==2:
                q=self.root/'replacement';q.write_bytes(b'two');os.replace(q,p)
            return original(fd)
        with patch.object(m.os,'fstat',side_effect=change):
            with self.assertRaisesRegex(RuntimeError,'file_changed'):m.stable_file(p)
    def test_round_trip_exact_bytes_and_canonical_ingestion(self):
        folder=self.capture();raw=(folder/m.JOURNAL).read_bytes()
        destination=self.root/'custody';self.assertTrue(m.custody(HERE,RAW,destination,run=self.transport(self.frame(folder))))
        self.assertEqual((destination/'original-capture.private.jsonl').read_bytes(),raw)
        self.assertEqual(len(m.validate_capture(raw,RAW)),8)
        events=[json.loads(x)for x in (destination/m.JOURNAL).read_text().splitlines()]
        self.assertEqual(events[1:],[json.loads(x)for x in raw.splitlines()])
        for f in destination.iterdir():self.assertEqual(stat.S_IMODE(f.stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(destination.stat().st_mode),0o700)
    def test_timeout_stops_and_preserves_partial_no_retry(self):
        calls=[]
        def timeout(args,**kw):
            calls.append(args);raise subprocess.TimeoutExpired(args,1,output=b'partial\x00',stderr=b'private error')
        folder=self.root/'failed';self.assertFalse(m.collect(HERE,RAW,folder,run=timeout))
        rows=[json.loads(x)for x in (folder/m.JOURNAL).read_text().splitlines()]
        self.assertEqual(len(calls),1);self.assertEqual(base64.b64decode(rows[1]['stdoutBase64']),b'partial\x00')
        self.assertEqual(rows[-1]['result'],'RAW_READS_DENY')
        with self.assertRaises(RuntimeError):m.validate_capture((folder/m.JOURNAL).read_bytes(),RAW)
    def test_invalid_root_reply_stops_after_first_command(self):
        def malformed(args,**kw):return subprocess.CompletedProcess(args,0,b'{}',b'')
        folder=self.root/'bad-root';self.assertFalse(m.collect(HERE,RAW,folder,run=malformed))
        self.assertEqual(len((folder/m.JOURNAL).read_text().splitlines()),3)
    def test_incomplete_transfer_preserved_and_no_complete(self):
        folder=self.capture();raw=self.frame(folder)[:-15];d=self.root/'incomplete'
        self.assertFalse(m.custody(HERE,RAW,d,run=self.transport(raw)))
        self.assertEqual((d/'transfer.stdout.private').read_bytes(),raw)
        self.assertNotIn('CUSTODY_COMPLETE',(d/'sequencer.journal.jsonl').read_text())
    def test_hash_tampering_denies_ingestion(self):
        folder=self.capture();frame=json.loads(self.frame(folder));frame['sha256']='0'*64
        d=self.root/'bad-hash';self.assertFalse(m.custody(HERE,RAW,d,run=self.transport(json.dumps(frame).encode())))
        self.assertNotIn('CUSTODY_COMPLETE',(d/'sequencer.journal.jsonl').read_text())
    def test_command_bytes_tampering_denies(self):
        folder=self.capture();rows=[json.loads(x)for x in (folder/m.JOURNAL).read_text().splitlines()]
        rows[1]['stdoutBytes']+=1
        with self.assertRaisesRegex(RuntimeError,'command_bytes'):m.validate_capture(('\n'.join(json.dumps(x)for x in rows)+'\n').encode(),RAW)
    def test_wrong_private_directory_denies_before_transport(self):
        d=self.root/'existing';d.mkdir(mode=0o755)
        with self.assertRaises(FileExistsError):m.custody(HERE,RAW,d,run=lambda *a,**k:self.fail('transport'))
        parent=self.root/'wrong-parent';parent.mkdir(mode=0o755)
        with self.assertRaisesRegex(RuntimeError,'private_directory_contract'):
            m.custody(HERE,RAW,parent/'new',run=lambda *a,**k:self.fail('transport'))
    def test_consumed_collection_and_custody_are_not_repeated(self):
        folder=self.capture()
        with self.assertRaises(FileExistsError):m.collect(HERE,RAW,folder,run=lambda *a,**k:self.fail('repeat'))
        d=self.root/'once';self.assertTrue(m.custody(HERE,RAW,d,run=self.transport(self.frame(folder))))
        with self.assertRaises(FileExistsError):m.custody(HERE,RAW,d,run=lambda *a,**k:self.fail('repeat'))
    def test_lost_transport_response_does_not_repeat_or_claim_custody(self):
        calls=[]
        def lost(args,**kw):
            calls.append(args);raise subprocess.TimeoutExpired(args,1,output=b'{"partial":',stderr=b'lost')
        d=self.root/'lost'
        self.assertFalse(m.custody(HERE,RAW,d,run=lost));self.assertEqual(len(calls),1)
        self.assertEqual((d/'transfer.stdout.private').read_bytes(),b'{"partial":')
        self.assertNotIn('CUSTODY_COMPLETE',(d/'sequencer.journal.jsonl').read_text())
    def test_export_symlink_and_wrong_mode_deny(self):
        folder=self.capture();p=folder/m.JOURNAL;q=folder/'elsewhere';p.rename(q);p.symlink_to(q)
        with self.assertRaises(RuntimeError):m.export(folder)
        p.unlink();q.rename(p);p.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError,'capture_permissions'):m.export(folder)
    def test_unknown_tool_paths_are_discovery_not_dependency(self):
        args=m.specs(RAW)[-1][1]
        c=subprocess.run(args,capture_output=True,env={'PATH':'/nonexistent'},check=False)
        self.assertEqual(c.returncode,0);self.assertIn(b'NOT_RESOLVED_IN_FIXED_PATH',c.stdout)
    def test_canonical_writer_tamper_denies_before_creation(self):
        d=self.root/'package';d.mkdir(mode=0o700);(d/'privileged_output.source').write_bytes(b'not canonical')
        folder=self.root/'not-created'
        with self.assertRaisesRegex(RuntimeError,'canonical_writer_hash'):m.collect(d,RAW,folder,run=self.runner)
        self.assertFalse(folder.exists())

if __name__=='__main__':unittest.main(verbosity=2)
