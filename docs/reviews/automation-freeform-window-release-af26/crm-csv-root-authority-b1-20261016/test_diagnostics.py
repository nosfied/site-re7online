"""Concrete canonical transport/Context/bootstrap; only sudo/root simulated."""
import base64
from contextlib import redirect_stdout,redirect_stderr
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import authority as a
import privileged_output as p
import bootstrap
import verified_loader
import child_transport

class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'prep';self.window=self.root/'window';self.window.mkdir(parents=True)
        self.canary=self.root/'import-ran'
        entry=self.root/'entry.py';entry.write_text('from pathlib import Path\nPath('+repr(str(self.canary))+').write_text("SYNTHETIC_IMPORT")\n')
        s=entry.stat();m={'files':{'entry.py':{'sha256':a.digest(entry.read_bytes()),'uid':s.st_uid,'mode':s.st_mode&0o777,'language':'python'}},
            'dependencies':{'entry.py':[]},'entries':{'entry.py':'inspect'},'imports':{}}
        anchor={'version':1,'preparation':str(self.root),'contractSha256':'c'*64,'policySha256':'a'*64,
            'codeManifestSha256':a.digest(a.canonical(m)),'profileSha256':{'ORIGINAL':'d'*64,'CANDIDATE':'e'*64}}
        self.bundle={'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,'anchor':anchor,'anchorSha256':a.digest(a.canonical(anchor)),
            'manifest':m,'permit':None,'permitSha256':None,'livePolicySha256':'a'*64,'livePhase':'fenced'}
        self.stdout=a.canonical(self.bundle);self.stderr=b'SYNTHETIC_PRIVATE_STDERR\x00\xff';self.code=0;self.mode='normal';self.calls=0
        self.reply=self.root/'reply.bin';self.err=self.root/'stderr.bin'
        self.helper=self.root/'fake-root.py'
        self.helper.write_text("import os,sys,time\nfrom pathlib import Path\nos.write(1,Path(sys.argv[1]).read_bytes())\nos.write(2,Path(sys.argv[2]).read_bytes())\nif sys.argv[4]=='partial':time.sleep(1)\nsys.exit(int(sys.argv[3]))\n")
        self.run=subprocess.run
        def sudo(args,**kw):
            self.assertEqual(args,a.QUERY);self.assertEqual(kw['timeout'],15)
            self.assertEqual(kw['env'],{'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C'})
            self.calls+=1;self.reply.write_bytes(self.stdout);self.err.write_bytes(self.stderr)
            if self.mode=='partial':kw['timeout']=0.15 # exercise real TimeoutExpired promptly
            if self.mode=='unavailable':return self.run(['/nonexistent-local-b1-helper'],**kw)
            result=self.run(['/usr/bin/python3','-I','-S',str(self.helper),str(self.reply),str(self.err),str(self.code),self.mode],**kw)
            if self.mode=='lost':raise subprocess.TimeoutExpired(args,15,output=result.stdout,stderr=result.stderr)
            return result
        self.transport=patch.object(p.subprocess,'run',sudo);self.transport.start();self.addCleanup(self.transport.stop)
        self.metadata=patch.object(a,'protected_bytes',lambda path:b'LAB_ROOT_METADATA');self.metadata.start();self.addCleanup(self.metadata.stop)
        mapping={'authority':a,'privileged_output':p,'verified_loader':verified_loader,'child_transport':child_transport}
        self.libraries=patch.object(bootstrap,'trusted_library',lambda name:mapping[name]);self.libraries.start();self.addCleanup(self.libraries.stop)
    def tearDown(self):
        def summaries(file,keys):
            if not file.is_file()or file.is_symlink():return []
            try:rows=[json.loads(x)for x in file.read_text().splitlines()]
            except (ValueError,UnicodeError):return []
            return [{k:row[k]for k in keys if k in row}for row in rows]
        print('B1_DIAGNOSTIC_EVIDENCE='+json.dumps({'case':self._testMethodName,'queryCalls':self.calls,
            'private':summaries(self.window/'privileged-output.private.jsonl',('action','exitCode','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256')),
            'journal':summaries(self.window/'sequencer.journal.jsonl',('event','stage','reason','automaticRetry','stdoutBytes','stderrBytes')),
            'consumerImported':self.canary.exists()}))
        self.temp.cleanup()
    def context(self):return a.Context(diagnostic_window=self.window)
    def launch(self,window=None,correlation=None):
        args=['python','entry.py','--diagnostic-window',str(self.window if window is None else window)]
        if correlation is not None:args+=['--authority-correlation',json.dumps(correlation),'--']
        return bootstrap.main(args)
    def journal(self):return [json.loads(x)for x in (self.window/'sequencer.journal.jsonl').read_text().splitlines()]
    def raw(self):return [json.loads(x)for x in (self.window/'privileged-output.private.jsonl').read_text().splitlines()]
    def assert_private(self):
        row=self.raw()[-1]
        self.assertEqual(base64.b64decode(row['stdoutBase64']),self.stdout)
        self.assertEqual(base64.b64decode(row['stderrBase64']),self.stderr)
        self.assertEqual(row['stdoutSha256'],hashlib.sha256(self.stdout).hexdigest())
        self.assertEqual(row['stderrSha256'],hashlib.sha256(self.stderr).hexdigest())
        for name in ('privileged-output.private.jsonl','sequencer.journal.jsonl'):
            m=(self.window/name).stat();self.assertEqual(m.st_mode&0o777,0o600);self.assertEqual(m.st_uid,os.getuid());self.assertEqual(m.st_nlink,1)
        public=(self.window/'sequencer.journal.jsonl').read_bytes()
        self.assertNotIn(self.stderr,public);self.assertNotIn(b'SYNTHETIC_PRIVATE',public)
        self.assertFalse(self.canary.exists())
    def denied(self):
        out,err=io.StringIO(),io.StringIO()
        with redirect_stdout(out),redirect_stderr(err),self.assertRaisesRegex(RuntimeError,'authority_query_denied')as error:
            self.launch()
        self.assertEqual(str(error.exception),'authority_query_denied')
        self.assertEqual(out.getvalue()+err.getvalue(),'');self.assertEqual(self.calls,1)
        self.assert_private();self.assertEqual(self.journal()[-1]['event'],'authority_query_denied')
        self.assertFalse(self.journal()[-1]['automaticRetry'])
    def test_valid_reply_persisted_before_import(self):
        original=verified_loader.Loader.__init__
        def loader(instance,*args,**kw):
            self.assertEqual(self.raw()[-1]['exitCode'],0)
            self.assertFalse(self.canary.exists())
            return original(instance,*args,**kw)
        with patch.object(verified_loader.Loader,'__init__',loader):self.launch()
        self.assertTrue(self.canary.exists());self.assertEqual(self.calls,len(self.raw()))
        self.assertTrue(all(row['exitCode']==0 for row in self.raw()))
    def test_absent_reply_zero_exit_denies_before_import(self):self.stdout=b'';self.denied()
    def test_invalid_binary_reply_kept_private(self):self.stdout=b'\xffSYNTHETIC_PRIVATE_REPLY\x00';self.denied()
    def test_malformed_json_reply_kept_private(self):self.stdout=b'{"SYNTHETIC_PRIVATE_REPLY":';self.denied()
    def test_nonzero_response_kept_private(self):self.code=9;self.denied();self.assertEqual(self.raw()[-1]['exitCode'],9)
    def test_lost_full_response_denies_without_retry(self):self.mode='lost';self.denied();self.assertIsNone(self.raw()[-1]['exitCode'])
    def test_real_partial_timeout_keeps_exact_bytes(self):self.mode='partial';self.stdout=b'{"partial":"SYNTHETIC_PRIVATE';self.denied();self.assertIsNone(self.raw()[-1]['exitCode'])
    def test_invalid_authority_private_validation_record(self):
        self.bundle['livePolicySha256']='f'*64;self.stdout=a.canonical(self.bundle);self.denied()
        self.assertEqual(self.journal()[-1]['stage'],'validation')
    def test_authority_changed_between_reads_records_denial(self):
        context=self.context();self.bundle['anchor']['contractSha256']='1'*64
        self.bundle['anchorSha256']=a.digest(a.canonical(self.bundle['anchor']));self.stdout=a.canonical(self.bundle)
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):context.revalidate()
        self.assertEqual(self.calls,2);self.assert_private();self.assertEqual(self.journal()[-1]['reason'],'authority_replaced')
    def test_parent_authority_mismatch_before_import_is_recorded(self):
        with self.assertRaisesRegex(RuntimeError,'bootstrap_authority_replaced'):
            self.launch(correlation={'authority':['0'*64,None],'executionSha256':None})
        self.assert_private();self.assertEqual(self.journal()[-1]['stage'],'correlation')
    def test_diagnostic_route_is_not_authority(self):
        other=self.root/'other';other.mkdir()
        with self.assertRaisesRegex(RuntimeError,'authority_diagnostic_window_mismatch'):self.launch(window=other)
        self.assertFalse(self.canary.exists());self.assertEqual(self.calls,1)
        rows=[json.loads(x)for x in (other/'sequencer.journal.jsonl').read_text().splitlines()]
        self.assertEqual(rows[-1]['reason'],'authority_diagnostic_window_mismatch')
    def test_missing_route_denies_before_query(self):
        with self.assertRaisesRegex(RuntimeError,'bootstrap_diagnostic_window_required'):bootstrap.main(['python','entry.py'])
        self.assertEqual(self.calls,0);self.assertFalse(self.canary.exists())
    def test_actual_missing_transport_oserror_is_private(self):
        self.mode='unavailable'
        with self.assertRaisesRegex(RuntimeError,'authority_query_denied')as error:self.launch()
        row=self.raw()[-1];self.assertIsNone(row['exitCode']);self.assertEqual(row['stdoutBytes'],0)
        self.assertGreater(row['stderrBytes'],0);self.assertEqual(str(error.exception),'authority_query_denied')
        self.assertEqual(self.calls,1);self.assertFalse(self.canary.exists())
        self.assertEqual(self.journal()[-1]['stage'],'transport')
    def test_missing_private_directory_no_creation_or_fallback(self):
        target=self.root/'missing-window'
        with self.assertRaisesRegex(RuntimeError,'authority_diagnostic_failed'):self.launch(window=target)
        self.assertFalse(target.exists());self.assertFalse(self.canary.exists());self.assertEqual(self.calls,1)
    def test_private_output_symlink_cannot_be_used(self):
        target=self.root/'canary-output';target.write_bytes(b'UNCHANGED')
        (self.window/'privileged-output.private.jsonl').symlink_to(target)
        with self.assertRaisesRegex(RuntimeError,'authority_query_denied'):self.launch()
        self.assertEqual(target.read_bytes(),b'UNCHANGED');self.assertFalse(self.canary.exists());self.assertEqual(self.calls,1)


def load_tests(loader,tests,pattern):
    suite=loader.loadTestsFromTestCase(DiagnosticTests)
    # Same concrete B2 connected consumers, with this delta's diagnostic source,
    # real canonical query transport and only the sudo endpoint mapped to a lab process.
    import test_process
    for name in ('test_real_delegated_three_processes_and_consumption','test_real_node_python_baseline_chain',
                 'test_execution_race_denied_before_child_import_or_request','test_authority_exchange_race_denied_before_import'):
        suite.addTest(test_process.ProcessChain(name))
    return suite
if __name__=='__main__':unittest.main(verbosity=2)
