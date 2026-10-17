"""Focused storage boundary regressions. No SSH/VPS or captured binary execution."""
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

P=Path(__file__).resolve().parent
sys.path.insert(0,str(P))
import storage_bounds as b
import editable_sources as edit

RESULTS=[]
def lab_inputs(root):
    return dict(MATERIAL=str(root/'material'),CUSTODY=str(root/'custody'),TOOLS=str(root/'tools'),OUTPUT=str(root/'remote'),DISCOVERY_NAME='discovery-new',ANALYSIS_NAME='analysis-new',LAUNCHER_PREFIX='launcher-new-')

def loaded(root):
    blobs=edit.source_inputs(lab_inputs(root))
    roots={str(root/'material'):'material',str(root/'tools'):'tools',str(root/'remote'):'remote',str(root/'custody/discovery-new'):'custody',str(root/'custody/analysis-new'):'analysis'}
    scope={'__name__':'reviewed_library','BLOBS':blobs,'STORAGE_ROOTS':roots,'MANIFEST_SHA':'lab-only','MANIFEST':{},'MANIFEST_RAW':b'{}'}
    exec(compile(blobs['driver.py'],'<composed driver>','exec'),scope)
    return scope,blobs

class Storage(unittest.TestCase):
    def test_composition_and_pins(self):
        with tempfile.TemporaryDirectory() as td:
            scope,blobs=loaded(Path(td))
            self.assertEqual(len(blobs),8)
            self.assertLess(sum(map(len,blobs.values())),b.MiB)
            self.assertNotIn("argv=['scp','-p','-r'",blobs['local_elf.py'].decode())
            self.assertIn('receive_images',blobs['local_elf.py'].decode())
            with patch.object(edit,'BOUNDS_SHA','0'*64):
                with self.assertRaisesRegex(RuntimeError,'bounds_source_digest'):edit.source_inputs(lab_inputs(Path(td)))
            with self.assertRaisesRegex(RuntimeError,'future_destinations_unbound'):edit.source_inputs({})
            params=lab_inputs(Path(td));params['OUTPUT']='/dev/shm/re7-csv-toolchain-read-20261017-v2'
            with self.assertRaisesRegex(RuntimeError,'consumed_destination'):edit.source_inputs(params)
        RESULTS.append('eight composed pinned sources; no recursive receiver; unbound/consumed destinations deny')

    def test_canonical_writes_and_partial_deny(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);q=root/'remote';q.mkdir(mode=0o700)
            scope,blobs=loaded(root);lib,record=scope['libraries']()
            # Exact canonical writer and reader, wrapped before any persistent artifact.
            cap=scope['libload']('capture.source')['Capture'](q)
            cap.bytes('sample',['synthetic'],lib['utc'](),lib['utc'](),0,b'partial',b'')
            prefix=(q/'sample.stdout.private').read_bytes()
            self.assertEqual(prefix,b'partial')
            snapshot=(q/'privileged-output.private.jsonl').read_bytes()
            with self.assertRaisesRegex(RuntimeError,'storage_artifact_exceeded'):
                lib['write_artifact'](q/'overflow.stdout.private',b'x'*(6*b.MiB+1))
            self.assertFalse((q/'overflow.stdout.private').exists())
            # Reserve/total exhaustion before canonical write; prior bytes remain.
            with patch.dict(b.ROLES,remote=(len(prefix)+len(snapshot)+b.TERMINAL+1,384)):
                guard=b.Guard({q:'remote'})
                with self.assertRaisesRegex(RuntimeError,'storage_total_exceeded'):
                    guard.artifact(lambda p,raw:None)(q/'no.private',b'xx')
                plain={'__name__':'canonical_writer'}
                writer_raw=(edit.P.parent/'crm-csv-r2-directed-20261017/privileged_output.source').read_bytes()
                exec(compile(writer_raw,'<pinned writer>','exec'),plain)
                guard.record(plain['private_record'])(q,'privileged-output.private.jsonl',{'event':'end','result':'DENY_NO_RETRY'})
            self.assertEqual((q/'sample.stdout.private').read_bytes(),prefix)
            self.assertTrue((q/'privileged-output.private.jsonl').read_bytes().startswith(snapshot))
            exported=lib['export'](q)
            self.assertEqual(base64.b64decode(exported['bytesBase64']),(q/'privileged-output.private.jsonl').read_bytes())
            # Canonical ingest creates original channels, exact capture and replayed
            # rows; failed source is still DENY, not promoted by custody.
            folder=root/'custody/discovery-new';folder.mkdir(parents=True,mode=0o700)
            envelope=json.dumps({'manifestSha256':'lab-only','capture':exported,'gateExitCode':1}).encode()
            self.assertEqual(scope['ingest'](folder,envelope,b'',1,lib['utc'](),lib['utc']()),1)
            receipt=json.loads((folder/'sequencer.journal.jsonl').read_text().splitlines()[-1])
            self.assertFalse(receipt['gatePass'])
        RESULTS.append('canonical Capture/write_artifact/private_record/export/ingest; excess refuses before write; terminal DENY preserves prefix')

    def test_canonical_partial_write_failure_is_retained(self):
        with tempfile.TemporaryDirectory() as td:
            q=Path(td);q.chmod(0o700);guard=b.Guard({q:'remote'})
            def disk_failure(path,raw):
                fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
                try:os.write(fd,raw[:3])
                finally:os.close(fd)
                raise OSError(28,'synthetic storage failure')
            with self.assertRaises(OSError):guard.artifact(disk_failure)(q/'partial.private',b'abcdef')
            self.assertEqual((q/'partial.private').read_bytes(),b'abc')
            # Next guard sees/accounting includes the partial; no unlink/repair.
            fd=os.open(q,os.O_RDONLY|os.O_DIRECTORY)
            try:self.assertEqual(guard._scan(fd)[0],3)
            finally:os.close(fd)
        RESULTS.append('injected ENOSPC after actual prefix write; partial persists and counts in later accounting')

    def test_journal_limit_before_append(self):
        with tempfile.TemporaryDirectory() as td:
            q=Path(td);q.chmod(0o700);g=b.Guard({q:'remote'});path=q/'journal'
            path.write_bytes(b'x'*4);path.chmod(0o600)
            called=[]
            with self.assertRaisesRegex(RuntimeError,'storage_journal_exceeded'):
                g.call(path,2,lambda:called.append(True),file_limit=b.TERMINAL+5)
            self.assertFalse(called);self.assertEqual(path.read_bytes(),b'xxxx')
            with patch.dict(b.ROLES,remote=(b.MiB,1)):
                g.call(path,0,lambda:called.append(True),terminal=True)
                self.assertEqual(called,[True],'append/terminal does not consume another directory entry')
                with self.assertRaisesRegex(RuntimeError,'storage_total_exceeded'):
                    g.call(q/'new-file',0,lambda:None,terminal=True)
        RESULTS.append('incremental journal bound rejects before append; old bytes unchanged')

    def test_real_child_channels_overflow_and_timeout(self):
        with tempfile.TemporaryDirectory() as td:
            r=b.bounded_run([sys.executable,'-c','import sys;sys.stdout.write("ok")'],temporary_dir=td,channel_limit=32,timeout=3,check=False)
            self.assertEqual(r.stdout,b'ok')
            for code,limit,timeout in [('import os;os.write(1,b"x"*10000)',32,3),('import os,time;os.write(1,b"partial");time.sleep(3)',32,.3)]:
                with self.assertRaises(subprocess.TimeoutExpired) as caught:
                    b.bounded_run([sys.executable,'-c',code],temporary_dir=td,channel_limit=limit,timeout=timeout,check=False)
                self.assertLessEqual(len(caught.exception.stdout),limit)
                self.assertTrue(caught.exception.stdout)
            self.assertEqual(os.listdir(td),[],'Anonymous temporaries closed, partial bytes returned for canonical custody')
        RESULTS.append('real subprocess/pipes/timeouts/overflow; capped prefixes and anonymous temporaries, no SSH')

    def test_large_export_custody_counts_nested_base64(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);q=root/'remote';q.mkdir(mode=0o700)
            scope,_=loaded(root);lib,record=scope['libraries']();cap=scope['libload']('capture.source')['Capture'](q)
            for i in range(3):cap.bytes('data-'+str(i),['synthetic'],lib['utc'](),lib['utc'](),0,b'x'*650000,b'')
            capture=lib['export'](q)
            folder=root/'custody/discovery-new';folder.mkdir(parents=True,mode=0o700)
            envelope=json.dumps({'manifestSha256':'lab-only','capture':capture,'gateExitCode':1}).encode()
            self.assertGreater(len(envelope),3*b.MiB)
            self.assertEqual(scope['ingest'](folder,envelope,b'',1,lib['utc'](),lib['utc']()),1)
            self.assertEqual((folder/'capture.private.jsonl').read_bytes(),base64.b64decode(capture['bytesBase64']))
            journal=(folder/'privileged-output.private.jsonl').read_bytes()
            self.assertGreater(len(journal),len(envelope))
            self.assertFalse(json.loads((folder/'sequencer.journal.jsonl').read_text().splitlines()[-1])['gatePass'])
        RESULTS.append('multi-MiB canonical export/ingest; outer and inner Base64 copies accounted, origin DENY retained')

    def test_capture_command_bounded_and_failure_custody(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);q=root/'remote';q.mkdir(mode=0o700)
            scope,_=loaded(root);cap=scope['libload']('capture.source')['Capture'](q)
            with self.assertRaisesRegex(RuntimeError,'command_denied'):
                cap.command('overflow',[sys.executable,'-c','import os;os.write(1,b"x"*2000000)'],timeout=3)
            self.assertEqual((q/'overflow.stdout.private').stat().st_size,b.MiB)
            row=json.loads((q/'privileged-output.private.jsonl').read_text().splitlines()[0])
            self.assertEqual(row['errorClass'],'ChannelLimitExceeded');self.assertEqual(row['stdoutBytes'],b.MiB)
        RESULTS.append('real composed Capture.command reaches bounded child; overflow private prefixes and failure row preserved')

    def test_temporary_io_failure_preserves_prefix_and_ends_child(self):
        original=b.tempfile.TemporaryFile
        class Short:
            def __init__(self,**kw):self.f=original(**kw)
            def __enter__(self):return self
            def __exit__(self,*a):self.f.close()
            def __getattr__(self,k):return getattr(self.f,k)
            def write(self,raw):self.f.write(raw[:3]);raise OSError(28,'injected channel disk failure')
        with tempfile.TemporaryDirectory() as td:
            with patch.object(b.tempfile,'TemporaryFile',Short):
                with self.assertRaises(OSError) as caught:
                    b.bounded_run([sys.executable,'-c','import os,time;os.write(1,b"abcdef");time.sleep(3)'],temporary_dir=td,channel_limit=32,timeout=2,check=False)
            self.assertEqual(caught.exception.errno,28);self.assertEqual(caught.exception.stdout,b'abc')
        RESULTS.append('temporary channel ENOSPC after real prefix; real local child group ended, partial attached to error for canonical custody')

    def test_exact_transfer_and_partial_preserved(self):
        for excess in (False,True):
            with tempfile.TemporaryDirectory() as td:
                root=Path(td);q=root/'custody/analysis-new';q.mkdir(parents=True,mode=0o700)
                scope,_=loaded(root);cap=scope['libload']('capture.source')['Capture'](q)
                data=b'\x7fELF'+b'x'*4092;digest=hashlib.sha256(data).hexdigest();refs=[{'sha256':digest,'bytes':len(data)}]
                original=subprocess.Popen;calls=[]
                def target(argv,**kw):
                    # SCP transport only simulated; child OS writes/RLIMIT/pipes real.
                    calls.append(argv);self.assertNotIn('-r',argv)
                    script='import os;fd=os.open('+repr(argv[-1])+',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.write(fd,'+repr(data+(b'X' if excess else b''))+');os.close(fd)'
                    return original([sys.executable,'-c',script],**kw)
                with patch.object(b.subprocess,'Popen',target):
                    if excess:
                        # A single write can return short on RLIMIT, leaving a
                        # byte-exact-size prefix. Inject a nonzero child exit as
                        # SCP would report a failed write, never infer rollback.
                        # Force second write to trigger EFBIG, canonical catch DENY.
                        def target_overflow(argv,**kw):
                            calls.append(argv)
                            script='import os;fd=os.open('+repr(argv[-1])+',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.write(fd,'+repr(data)+');os.write(fd,b"X")'
                            return original([sys.executable,'-c',script],**kw)
                        with patch.object(b.subprocess,'Popen',target_overflow):
                            with self.assertRaisesRegex(RuntimeError,'image_transfer_partial'):
                                b.receive_images(refs,q/'images',{'HOST':'synthetic','OUTPUT':'/synthetic'},cap)
                    else:b.receive_images(refs,q/'images',{'HOST':'synthetic','OUTPUT':'/synthetic'},cap)
                self.assertEqual(len(calls),1)
                self.assertEqual((q/'images'/ (digest+'.elf')).read_bytes(),data)
                self.assertTrue((q/'privileged-output.private.jsonl').exists())
        RESULTS.append('exact serial nonrecursive SCP arguments; transport target simulated; real RLIMIT refuses extra byte, partial image/channel retained without retry')

    def test_transfer_set_excess_before_effect(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);q=root/'custody/analysis-new';q.mkdir(parents=True,mode=0o700)
            scope,_=loaded(root);cap=scope['libload']('capture.source')['Capture'](q)
            for refs in ([{'sha256':'a'*64,'bytes':1}]*65,[{'sha256':'a'*64,'bytes':128*b.MiB+1}]):
                with self.assertRaisesRegex(RuntimeError,'transfer_set_budget'):
                    b.receive_images(refs,q/'images',{'HOST':'synthetic','OUTPUT':'/synthetic'},cap)
                self.assertFalse((q/'images').exists())
        RESULTS.append('object count65 and raw total128 MiB+1 deny before receive directory/process creation')

    def test_plan_is_derived_not_capacity_fitted(self):
        p=b.plan()
        self.assertEqual(p['remote']['payloadBytes'],143*b.MiB)
        self.assertEqual(p['localIfShared']['payloadBytes'],546*b.MiB)
        self.assertEqual(p['remote']['proposedOperationBytes'],192*b.MiB)
        self.assertEqual(p['localIfShared']['proposedOperationBytes'],704*b.MiB)
        with patch.dict(b.ROLES,remote=(206*b.MiB,384)):
            self.assertGreater(b.plan()['remote']['proposedOperationBytes'],192*b.MiB)
        RESULTS.append('plan derives from enforced pools + independent allocation allowance +25 percent, rounded64 MiB; no observed free bytes input')

    def test_launcher_text_bound(self):
        value=b.LimitedText();value.write('x'*b.TEXT_LIMIT)
        with self.assertRaisesRegex(RuntimeError,'launcher_channel_exceeded'):value.write('x')
        self.assertEqual(len(value.getvalue()),b.TEXT_LIMIT)
        RESULTS.append('launcher output cap before accumulation; prefix unchanged')

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Storage))
    if result.wasSuccessful():
        report={'result':'LOCAL_STORAGE_CONTROLS_VALIDATED_NOT_OPERATIONAL','tests':result.testsRun,'cases':RESULTS,'real':'Canonical pinned source composition, reader, Capture, writer, export, ingest; local subprocess/pipe/RLIMIT/fsync/O_EXCL, files and anonymous temporaries','simulated':'SSH not used; SCP target substituted by Python child, synthetic objects and roots. No production identities, capacity, allocation geometry or reserve certification','notRepeated':'PM2 proof, frontend/predecessor/Operations suites and consumed blocks','sourceHashes':{n:hashlib.sha256((P/n).read_bytes()).hexdigest() for n in ('storage_bounds.py','editable_sources.py','test_budget.py')}}
        (P/'PROOFS.json').write_text(json.dumps(report,indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
