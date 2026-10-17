"""Local only: real boot_id, concrete readers/custody, external effects simulated."""
import base64
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'crm-csv-r1r2-read-package-20261016/read_package.py'
assert hashlib.sha256(OLD.read_bytes()).hexdigest()=='d01961f5388fc49b65130ac4beace468327ac3faae22d3bb6a6599005d3a73e8'
def load(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
old=load('old_review_reader',OLD);m=load('complement_review_reader',HERE/'read_package.py')
RAW=(HERE/'read_package.py').read_bytes()
SYNTHETIC=b'12345678-1234-1234-1234-123456789abc\n'
REAL_PROOF={}


class Complement(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-complement-lab-');self.root=Path(self.tmp.name)
        self.fs=self.root/'fs';p=self.fs/m.BOOT_ID.lstrip('/');p.parent.mkdir(parents=True);p.write_bytes(SYNTHETIC)
    def tearDown(self):self.tmp.cleanup()
    def boot(self):return self.fs/m.BOOT_ID.lstrip('/')
    def runner(self,args,**kw):
        # sudo and root namespace simulated, concrete observation/validation functions.
        v=m.root_inventory(self.fs)
        return subprocess.CompletedProcess(args,0,json.dumps(v).encode()if args[0]=='sudo'else b'synthetic-command\n',b'')
    def original(self):
        d=self.root/'old';d.mkdir(mode=0o700)
        payload={'result':'RAW_INVENTORY_DENY','targets':[{'path':'/synthetic/'+str(x),'startedUtc':'old-start','sha256':'a'*64}for x in range(18)],'errors':[{'path':m.BOOT_ID,'errorClass':'OSError'}]}
        out=json.dumps(payload).encode();ref=dict(m.ORIGIN);ref['rootStdoutSha256']=m.sha(out)
        rows=[{'event':'r1r2_begin','readerSha256':ref['readerSha256']},
              {'event':'r1r2_command','id':'root-inventory','exitCode':1,'accepted':False,'stdoutBase64':base64.b64encode(out).decode(),'stdoutSha256':m.sha(out),'stdoutBytes':len(out),'startedUtc':ref['rootStartedUtc'],'finishedUtc':ref['rootFinishedUtc']},
              {'event':'r1r2_end','result':'RAW_READS_DENY'}]
        raw=('\n'.join(json.dumps(x)for x in rows)+'\n').encode();ref.update(sha256=m.sha(raw),bytes=len(raw))
        p=d/'original-capture.private.jsonl';m.write_artifact(p,raw);return p,ref
    def capture(self):
        d=self.root/'capture';self.assertTrue(m.collect(HERE,RAW,d,run=self.runner));return d
    def frame(self,d):
        v=m.export(d);v['source']=m.REMOTE+'/'+m.JOURNAL;return json.dumps(v).encode()
    def transfer(self,raw):
        def run(args,**kw):
            self.assertEqual(args[:6],['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes'])
            self.assertEqual(kw['input'],RAW);return subprocess.CompletedProcess(args,0,raw,b'')
        return run
    def test_real_boot_old_failure_new_single_small_read(self):
        original_fdopen=os.fdopen;requests=[]
        class Buffered:
            def __init__(self,stream):self.stream=stream
            def __enter__(self):return self
            def __exit__(self,*args):return self.stream.__exit__(*args)
            def read(self,n):requests.append(n);return self.stream.read(n)
        def wrap(*args,**kw):return Buffered(original_fdopen(*args,**kw))
        with patch.object(old.os,'fdopen',side_effect=wrap):
            with self.assertRaises(OSError)as caught:old.observe(m.BOOT_ID)
        calls=[];real=os.read
        def read(fd,n):calls.append(n);return real(fd,n)
        with patch.object(m.os,'read',side_effect=read):row=m.observe(m.BOOT_ID)
        self.assertEqual(requests,[old.LIMIT+1]);self.assertEqual(calls,[64]);self.assertTrue(row['bootIdFormatVerified']);self.assertEqual(row['bytes'],37)
        REAL_PROOF.update(oldReadRequests=requests,oldErrorClass='OSError',oldErrno=caught.exception.errno,newReadRequests=calls,newBytes=37,newFormatVerified=True,bootValuePublished=False,productionErrnoProven=False)
    def test_real_root_entrypoint_stdin_without_sudo(self):
        c=subprocess.run(['/usr/bin/python3','-B','-I','-S','-','root'],input=RAW,capture_output=True,check=False)
        self.assertEqual(c.returncode,0);v=json.loads(c.stdout);m.validate_boot_inventory(v)
        self.assertEqual(len(v['targets']),1);self.assertEqual(v['targets'][0]['bytes'],37)
    def test_invalid_format_rejected_without_echo(self):
        self.boot().write_bytes(b'not-a-uuid-secret\n')
        v=m.root_inventory(self.fs);self.assertEqual(v['result'],'RAW_BOOT_ID_DENY');self.assertEqual(v['errors'][0]['errno'],None)
        self.assertNotIn('not-a-uuid',json.dumps(v))
    def test_truncated_and_overlong_rejected_no_fallback(self):
        for raw in (SYNTHETIC[:-1],SYNTHETIC[:15],SYNTHETIC+b'extra',b'x'*65):
            self.boot().write_bytes(raw)
            with self.assertRaises(RuntimeError):m.observe(m.BOOT_ID,self.fs)
    def test_virtual_short_read_denied(self):
        real=os.read;calls=[]
        def truncated(fd,n):calls.append(n);return real(fd,12)
        with patch.object(m.os,'read',side_effect=truncated):v=m.root_inventory(self.fs)
        self.assertEqual(calls,[64]);self.assertEqual(v['result'],'RAW_BOOT_ID_DENY')
    def test_read_error_records_errno_once_without_sensitive_content(self):
        calls=[]
        def fail(fd,n):calls.append(n);raise OSError(errno.EIO,'sensitive simulated content')
        with patch.object(m.os,'read',side_effect=fail):v=m.root_inventory(self.fs)
        self.assertEqual(calls,[64]);self.assertEqual(v['errors'][0]['errno'],errno.EIO);self.assertNotIn('sensitive',json.dumps(v))
    def test_replacement_denies(self):
        real=os.read
        def swap(fd,n):
            value=real(fd,n);q=self.boot().with_name('new');q.write_bytes(SYNTHETIC);os.replace(q,self.boot());return value
        with patch.object(m.os,'read',side_effect=swap):
            with self.assertRaisesRegex(RuntimeError,'leaf_changed_(during|after)_read'):m.observe(m.BOOT_ID,self.fs)
    def test_leaf_and_parent_symlinks_not_followed(self):
        p=self.boot();p.unlink();p.symlink_to('/proc/sys/kernel/random/boot_id')
        with self.assertRaisesRegex(RuntimeError,'boot_id_not_regular'):m.observe(m.BOOT_ID,self.fs)
        p.unlink();d=p.parent;d.rename(d.with_name('actual'));d.symlink_to(d.with_name('actual'))
        with self.assertRaisesRegex(RuntimeError,'ancestor_type'):m.observe(m.BOOT_ID,self.fs)
    def test_other_file_observation_equivalence(self):
        p=self.fs/'file';p.write_bytes(b'unchanged generic read')
        self.assertEqual(old.observe('/file',self.fs),m.observe('/file',self.fs))
        p.unlink();p.symlink_to('/not/followed');self.assertEqual(old.observe('/file',self.fs),m.observe('/file',self.fs))
        p.unlink();self.assertEqual(old.observe('/file',self.fs),m.observe('/file',self.fs))
        with p.open('wb')as f:f.truncate(m.LIMIT+1)
        for module in (old,m):
            with self.assertRaisesRegex(RuntimeError,'target_size_bound'):module.observe('/file',self.fs)
    def test_scope_only_boot_and_five_missing_commands(self):
        paths=[];observe=m.observe
        def spy(path,root):paths.append(path);return observe(path,root)
        with patch.object(m,'observe',side_effect=spy):m.root_inventory(self.fs)
        self.assertEqual(paths,[m.BOOT_ID]);self.assertEqual([x[0]for x in m.specs(RAW)],['boot-id']+[x[0]for x in old.specs(RAW)][1:])
        self.assertEqual(m.specs(RAW)[1:],old.specs(RAW)[1:])
    def test_origin_unchanged_and_complement_not_original_complete(self):
        source,ref=self.original();before=source.read_bytes()
        with patch.dict(m.ORIGIN,ref,clear=True):
            capture=self.capture();dest=self.root/'custody'
            # Only path default is injected; actual canonical origin verification executes.
            with patch.object(m.verify_origin,'__defaults__',(source,)):
                self.assertTrue(m.custody(HERE,RAW,dest,run=self.transfer(self.frame(capture))))
            receipt=json.loads((dest/'sequencer.journal.jsonl').read_text())
            self.assertFalse(receipt['originalCollectionCompleted']);self.assertFalse(receipt['atomicSnapshot']);self.assertEqual(receipt['origin'],ref)
            self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),(capture/m.JOURNAL).read_bytes())
        self.assertEqual(before,source.read_bytes());self.assertEqual(json.loads(source.read_text().splitlines()[-1])['result'],'RAW_READS_DENY')
    def test_origin_tamper_denies_before_transfer(self):
        source,ref=self.original();source.write_bytes(source.read_bytes()+b'\n');d=self.root/'not-created'
        with patch.dict(m.ORIGIN,ref,clear=True),patch.object(m.verify_origin,'__defaults__',(source,)):
            with self.assertRaisesRegex(RuntimeError,'origin_bytes'):m.custody(HERE,RAW,d,run=lambda *a,**k:self.fail('transfer'))
        self.assertFalse(d.exists())
    def test_boot_failure_preserves_complement_deny_without_following_commands(self):
        source,ref=self.original();calls=[]
        def failed(args,**kw):
            calls.append(args);return subprocess.CompletedProcess(args,1,b'{"errors":[{"errno":5}]}',b'')
        with patch.dict(m.ORIGIN,ref,clear=True):
            d=self.root/'denied';self.assertFalse(m.collect(HERE,RAW,d,run=failed));self.assertEqual(len(calls),1)
            dest=self.root/'denied-custody'
            with patch.object(m.verify_origin,'__defaults__',(source,)):
                self.assertFalse(m.custody(HERE,RAW,dest,run=self.transfer(self.frame(d))))
            self.assertEqual(json.loads((dest/'sequencer.journal.jsonl').read_text())['event'],'R1R2_COMPLEMENT_CUSTODY_DENY')
            self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),(d/m.JOURNAL).read_bytes())
    def test_transport_oserror_errno_and_no_retry(self):
        source,ref=self.original();calls=[]
        def fail(*a,**kw):calls.append(a);raise OSError(errno.EACCES,'private transport error')
        with patch.dict(m.ORIGIN,ref,clear=True),patch.object(m.verify_origin,'__defaults__',(source,)):
            d=self.root/'lost';self.assertFalse(m.custody(HERE,RAW,d,run=fail))
        self.assertEqual(len(calls),1);self.assertEqual(json.loads((d/m.JOURNAL).read_text())['errno'],errno.EACCES)
    def test_concurrent_or_consumed_destination_not_reused(self):
        d=self.capture()
        with self.assertRaises(FileExistsError):m.collect(HERE,RAW,d,run=lambda *a,**k:self.fail('retry'))
    def test_custody_revalidates_format_and_origin(self):
        d=self.capture();rows=[json.loads(x)for x in (d/m.JOURNAL).read_text().splitlines()]
        rows[0]['origin']['sha256']='0'*64
        with self.assertRaisesRegex(RuntimeError,'capture_origin'):m.validate_capture(('\n'.join(json.dumps(x)for x in rows)+'\n').encode(),RAW)
        v=m.root_inventory(self.fs);v['targets'][0]['bytesBase64']=base64.b64encode(b'bad').decode();v['targets'][0]['bytes']=3;v['targets'][0]['sha256']=m.sha(b'bad')
        with self.assertRaisesRegex(RuntimeError,'boot_id_format'):m.validate_boot_inventory(v)

if __name__=='__main__':unittest.main(verbosity=2)
