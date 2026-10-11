"""Actual sample/diagnostic code; proc filesystem fixture and explicit I/O injections.
No claim of complete privileged production observation. Real race proof is separate.
"""
import contextlib
import errno
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('observer',Path(__file__).with_name('observer.py'))
o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)

class Diagnostic(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.proc=self.root/'proc'
        def put(name,value):
            p=self.proc/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
        put('sys/kernel/random/boot_id','fixture-boot')
        for pid in [111,222]:
            parts=['S','0','111']+['0']*16+[str(pid*10)]
            put(str(pid)+'/stat',str(pid)+' (name) '+' '.join(parts))
            put(str(pid)+'/environ','PRIVATE_ENV_SENTINEL=must_not_escape')
            put(str(pid)+'/cmdline','PRIVATE_CMD_SENTINEL')
            (self.proc/str(pid)/'fd').mkdir()
            (self.proc/str(pid)/'cwd').symlink_to('/fixture/release')
        (self.proc/'111/fd/0').symlink_to('socket:[55]')
        (self.proc/'222/fd/3').symlink_to('socket:[55]')
        for kind in ['tcp','tcp6','udp','udp6','raw','raw6','unix','netlink','packet']:put('net/'+kind,'header\n')
        self.policy={'version':1,'bootId':'fixture-boot','daemon':{'pid':111,'ticks':'1110'},'frontendPort':3000,'roles':{k:{'release':'/fixture/release','entry':'/fixture/release/next','nonce':str(i)*64,'capture':str(self.root/(k+'.json'))}for i,k in enumerate(['source','candidate','return'],1)}}
        self.real_readlink=os.readlink
    def tearDown(self):self.tmp.cleanup()
    def path(self,*args):
        p=Path(*args)
        return self.proc/p.relative_to('/proc') if p==Path('/proc')or Path('/proc')in p.parents else p
    def readlink(self,path):return self.real_readlink(self.path(path))
    def sample(self,readlink=None):
        with patch.object(o,'Path',self.path),patch.object(o.os,'readlink',readlink or self.readlink):return o.sample(self.policy)
    def denied(self,stage,reason='ownership_observation_incomplete',readlink=None,ticks='2220',fd=None,errorType='FileNotFoundError',number=errno.ENOENT):
        with self.assertRaises(o.OwnershipObservationError)as caught:self.sample(readlink)
        error=caught.exception;self.assertEqual(str(error),reason)
        self.assertEqual(error.diagnostic,{'reason':reason,'stage':stage,'pid':222,'startTicks':ticks,'fd':fd,'originalError':{'type':errorType,'errno':number,'strerror':os.strerror(number)}})
        out=io.StringIO()
        with contextlib.redirect_stderr(out):o.report_denial(error)
        lines=out.getvalue().splitlines();self.assertEqual(lines[0],'frontend_socket_observation_denied:'+reason)
        self.assertEqual(json.loads(lines[1])['observationDiagnostic'],error.diagnostic)
        for secret in ['PRIVATE_ENV_SENTINEL','PRIVATE_CMD_SENTINEL',str(self.root),'/fixture/release']:self.assertNotIn(secret,out.getvalue())
    def test_complete_fixture_preserves_result_schema(self):
        value=self.sample();self.assertEqual(value['daemon'],self.policy['daemon']);self.assertEqual(len(value['processes']),2);self.assertEqual(len(value['owners']['55']),2)
    def test_identity_missing_records_pid_without_inventing_ticks(self):
        (self.proc/'222/stat').unlink();self.denied('process_identity',ticks=None)
    def test_fd_directory_missing(self):
        (self.proc/'222/fd/3').unlink();(self.proc/'222/fd').rmdir();self.denied('process_fd_list')
    def test_fd_disappears_preserves_strict_negative(self):
        def disappear(path):
            q=self.path(path)
            if q==self.proc/'222/fd/3':q.unlink()
            return self.real_readlink(q)
        self.denied('process_fd_readlink','fd_observation_incomplete',disappear,fd='3')
    def test_environment_missing(self):
        (self.proc/'222/environ').unlink();self.denied('process_environ')
    def test_cmdline_missing(self):
        (self.proc/'222/cmdline').unlink();self.denied('process_cmdline')
    def test_cwd_missing(self):
        (self.proc/'222/cwd').unlink();self.denied('process_cwd')
    def test_permission_failure_denies_and_retains_errno(self):
        def denied(path):
            if self.path(path)==self.proc/'222/cwd':raise PermissionError(errno.EACCES,'PRIVATE_ERROR_SENTINEL','PRIVATE_PATH_SENTINEL')
            return self.readlink(path)
        self.denied('process_cwd','ownership_observation_permission_denied',denied,errorType='PermissionError',number=errno.EACCES)
    def test_process_lookup_failure_retains_original(self):
        actual=o.identity
        def gone(pid):
            if pid==222:raise ProcessLookupError(errno.ESRCH,'PRIVATE_ERROR_SENTINEL')
            return actual(pid)
        with patch.object(o,'identity',gone):self.denied('process_identity',ticks=None,errorType='ProcessLookupError',number=errno.ESRCH)
    def test_error_filename_message_are_not_serialized(self):
        error=o.OwnershipObservationError('ownership_observation_incomplete',{'stage':'process_environ','pid':222,'startTicks':'2220','fd':None},FileNotFoundError(errno.ENOENT,'PRIVATE_ERROR_SENTINEL','PRIVATE_PATH_SENTINEL'))
        out=io.StringIO()
        with contextlib.redirect_stderr(out):o.report_denial(error)
        self.assertNotIn('PRIVATE_',out.getvalue())
    def test_daemon_identity_drift_still_denies(self):
        self.policy['daemon']['ticks']='wrong'
        with self.assertRaisesRegex(RuntimeError,'daemon_identity_changed'):self.sample()
    def test_deadline_is_not_extended(self):
        with patch.object(o,'Path',self.path),patch.object(o.os,'readlink',self.readlink):
            with self.assertRaisesRegex(RuntimeError,'ownership_observation_deadline'):o.sample(self.policy,0)
    def test_two_sample_identity_change_still_denies(self):
        actual=o.sample;calls=0
        def sample(policy,deadline):
            nonlocal calls
            value=actual(policy,deadline);calls+=1
            if calls==1:
                f=self.proc/'222/stat';f.write_text(f.read_text().replace('2220','2221'))
            return value
        with patch.object(o,'Path',self.path),patch.object(o.os,'readlink',self.readlink),patch.object(o,'sample',sample):
            with self.assertRaisesRegex(RuntimeError,'ownership_observation_changed'):o.observe(self.policy)
        self.assertEqual(calls,2)
    def test_real_subprocess_stderr_reaches_existing_private_logger(self):
        parent=Path(__file__).resolve().parent.parent
        spec=importlib.util.spec_from_file_location('client',parent/'frontend-fa60f0f6-prepared/socket_observation_client.py')
        client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
        (self.root/'socket-observer-binding.private.json').write_text(json.dumps({'policy':self.policy,'policySha256':'fixture','helperSha256':'fixture'}))
        code="import importlib.util,errno; s=importlib.util.spec_from_file_location('o',"+repr(str(Path(__file__).with_name('observer.py').resolve()))+");o=importlib.util.module_from_spec(s);s.loader.exec_module(o);e=o.OwnershipObservationError('ownership_observation_incomplete',{'stage':'process_environ','pid':222,'startTicks':'2220','fd':None},FileNotFoundError(errno.ENOENT,'PRIVATE_ERROR_SENTINEL','PRIVATE_PATH_SENTINEL'));o.report_denial(e);raise SystemExit(1)"
        with patch.object(client,'COMMAND',[sys.executable,'-I','-S','-c',code]):
            with self.assertRaisesRegex(RuntimeError,'socket_observer_read_denied'):client.read(self.root,'source-exited')
        files=list((self.root/'socket-observation-output-private').glob('*.json'));self.assertEqual(len(files),1)
        value=json.loads(files[0].read_text());self.assertEqual(value['exitCode'],1);self.assertEqual(value['stdout'],'');self.assertFalse(value['timeout'])
        self.assertEqual(json.loads(value['stderr'].splitlines()[1])['observationDiagnostic']['stage'],'process_environ');self.assertNotIn('PRIVATE_',value['stderr']);self.assertEqual(files[0].stat().st_mode&0o777,0o600)
    def test_normal_gate_reason_unchanged(self):
        out=io.StringIO()
        with contextlib.redirect_stderr(out):o.report_denial(RuntimeError('survivor'))
        self.assertEqual(out.getvalue(),'frontend_socket_observation_denied:survivor\n')

if __name__=='__main__':unittest.main()
