"""Exact documented launchers, real unprivileged subprocesses in a bind-mount lab.
No network calls: SSH is a local executable exporting the approved stdin bytes.
Historical origin is a REQUIRED read-only private input, never a public fixture.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
SOURCE=HERE/'read_package.py'
spec=importlib.util.spec_from_file_location('reader',SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CUSTODY=Path(m.LOCAL).parent
OLD=CUSTODY/'csv-r1r2-read-20261016-v1'
SECOND=CUSTODY/'csv-r1r2-complement-read-20261017-v1'
TOOL='/dev/shm/re7-csv-r2-directed-tools-20261017-v1'
PROOFS={}

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def exclusive(p,raw,mode=0o600):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    with os.fdopen(fd,'wb')as f:f.write(raw)
def snapshot(p):
    s=p.stat();return [digest(p),s.st_size,s.st_mode,s.st_mtime_ns,s.st_ctime_ns,s.st_ino]

class Launcher(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(os.getuid(),0)
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-deploy-complement-')
        self.lab=Path(self.tmp.name)
        for name in ('remote','custody','bin','home','opt','proc'):(self.lab/name).mkdir(mode=0o700)
        for name in (OLD.name,SECOND.name):(self.lab/'custody'/name).mkdir(mode=0o700)
        self.tools=self.lab/'remote'/Path(TOOL).name;self.tools.mkdir(mode=0o700)
        for name in ('read_package.py','privileged_output.source'):
            exclusive(self.tools/name,(HERE/name).read_bytes())
        exclusive(self.lab/'no-sudo',b'Privilege escalation unavailable in lab\n')
        self.old_files=[OLD/'original-capture.private.jsonl',SECOND/'complement-capture.private.jsonl']
        self.before=[snapshot(p)for p in self.old_files]
        self.assertEqual(self.before[0][0],m.ORIGIN['sha256'])
        self.assertEqual(self.before[1][0],'2a8afe5a15cc1a90be5658828125fd219ba631e013887a3a498798f114b52e99')
        self.assertEqual(self.before[1][1],1630)
        # Synthetic procfs and filesystem paths are a lab boundary. Python,
        # launcher, file readers, descriptors, export and private_record are real.
        self.fixture()
        source_rel=HERE.relative_to('/home')
        local_package=self.lab/'home'/source_rel;local_package.mkdir(parents=True,mode=0o700)
        for name in ('read_package.py','privileged_output.source'):
            exclusive(local_package/name,(HERE/name).read_bytes())
        local_custody=self.lab/'home'/CUSTODY.relative_to('/home');local_custody.mkdir(parents=True,mode=0o700)
        for name in (OLD.name,SECOND.name):(local_custody/name).mkdir(mode=0o700)
        self.custody_root=local_custody
        self.shim('ssh')
        self.scp_shim()
        system=self.lab/'system-bin';system.mkdir()
        for name in ('python3','python3.12','bash','dash','node','mkdir','id','stat','cut','sha256sum'):
            exclusive(system/name,b'')
        (system/'sh').symlink_to('dash')
        exclusive(system/'sudo',b'not executable')
        self.base=['bwrap','--die-with-parent','--cap-drop','ALL','--ro-bind','/','/',
                   '--bind',str(self.lab/'remote'),'/dev/shm',
                   '--bind',str(self.lab/'home'),'/home',
                   '--ro-bind',str(OLD),str(OLD),'--ro-bind',str(SECOND),str(SECOND),
                   '--ro-bind',str(self.lab/'bin'),'/usr/local/bin',
                   '--ro-bind',str(system),'/usr/bin',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/python3',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/python3.12',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/node',
                   '--ro-bind','/usr/bin/bash','/usr/bin/bash',
                   '--ro-bind','/usr/bin/dash','/usr/bin/dash',
                   *[v for name in ('mkdir','id','stat','cut','sha256sum')for v in ('--ro-bind','/usr/bin/'+name,'/usr/bin/'+name)],
                   '--bind',str(self.lab/'opt'),'/opt',
                   '--bind',str(self.lab/'proc'),'/proc',
                   '--bind',str(self.lab),'/tmp']
        self.blocks=re.findall(r'```bash\n(.*?)```',(HERE/'COMMANDS.md').read_text(),re.S)
    def tearDown(self):
        self.assertEqual(self.before,[snapshot(p)for p in self.old_files])
        self.tmp.cleanup()
    def fixture(self):
        def put(path,raw):
            path.parent.mkdir(parents=True,exist_ok=True);exclusive(path,raw)
        boot=self.lab/'proc/sys/kernel/random/boot_id'
        put(boot,b'12345678-1234-1234-1234-123456789abc\n')
        for role,hint in m.HISTORICAL_CANDIDATES.items():
            pid=hint['pid'];ppid=1 if role=='daemon'else 18676
            p=self.lab/'proc'/str(pid);p.mkdir(parents=True)
            values=['S',str(ppid)]+['0']*17+[str(hint['historicalTicks'])]
            put(p/'stat',(str(pid)+' (synthetic process) '+ ' '.join(values)+'\n').encode())
            p.joinpath('cwd').symlink_to('/home/deploy'if role=='daemon'else hint['cwd'])
            p.joinpath('exe').symlink_to('/usr/bin/node')
            command=b'PM2 v6.0.14: God Daemon (/home/deploy/.pm2)\0'if role=='daemon'else ('/usr/bin/node\0'+hint['script']+'\0').encode()
            put(p/'cmdline',command)
            if role!='daemon':
                put(p/'environ',b'NODE_ENV=production\0PM2_HOME=/home/deploy/.pm2\0DATABASE_URL=postgresql://synthetic:NOT_A_SECRET@127.0.0.1:5432/lab\0ADMIN_TOKEN=UNSELECTED_SENTINEL\0')
            p.joinpath('fd').mkdir()
            inode={'api':101,'worker':102}.get(role)
            if inode is not None:p.joinpath('fd/7').symlink_to('socket:['+str(inode)+']')
        child=self.lab/'proc/188910';child.mkdir()
        put(child/'stat',b'188910 (synthetic next) S 188897 '+ b'0 '*17+b'999\n')
        child.joinpath('exe').symlink_to('/usr/bin/node');child.joinpath('fd').mkdir();child.joinpath('fd/8').symlink_to('socket:[103]')
        put(self.lab/'proc/188897/task/188897/children',b'188910 ')
        proxy=self.lab/'proc/177517';proxy.mkdir()
        put(proxy/'stat',b'177517 (synthetic proxy) S 176940 '+b'0 '*17+b'888\n')
        # Build NUL argv explicitly (digits following \0 must not become octal escapes).
        exclusive(proxy/'cmdline',b'\0'.join(x.encode()for x in ['/usr/bin/docker-proxy','-proto','tcp','-host-ip','127.0.0.1','-host-port','5432','-container-ip','172.18.0.2','-container-port','5432'])+b'\0')
        lines=['header']
        for port,inode in [(3001,101),(8787,102),(3000,103)]:
            lines.append('0: 00000000:%04X 00000000:0000 0A 0:0 00:0 0 1000 0 %s'%(port,inode))
        put(self.lab/'proc/18676/net/tcp',('\n'.join(lines)+'\n').encode());put(self.lab/'proc/18676/net/tcp6',b'header\n')
        put(self.lab/'home/deploy/.pm2/pm2.pid',b'18676\n')
        pm=self.lab/'home/deploy/.npm-global';(pm/'bin').mkdir(parents=True)
        put(pm/'lib/node_modules/pm2/bin/pm2',b'// synthetic; must never execute\n')
        put(pm/'lib/node_modules/pm2/package.json',b'{"name":"pm2","version":"synthetic"}')
        (pm/'bin/pm2').symlink_to('../lib/node_modules/pm2/bin/pm2')
    def shim(self,name):
        raw="#!/usr/bin/python3 -I\nimport hashlib,json,os,subprocess,sys\nassert sys.argv[1:]==['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy@admin.re7online.com','/usr/bin/python3','-B','-I','-S','-','export']\nwith open('/tmp/trace','a')as f:f.write(json.dumps({'command':'ssh','uid':os.getuid()})+'\\n')\nraw=sys.stdin.buffer.read();assert hashlib.sha256(raw).hexdigest()==READER_HASH\nr=subprocess.run(['/usr/bin/python3','-B','-I','-S','-','export'],input=raw,capture_output=True)\nsys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr);sys.exit(r.returncode)\n".replace('READER_HASH',repr(digest(SOURCE)))
        exclusive(self.lab/'bin'/name,raw.encode(),0o700)
    def scp_shim(self):
        # Only the transfer transport is synthetic; the exact shell hash tests
        # and exclusive destination file creation are exercised.
        script="""#!/usr/bin/python3 -I
import json,os,sys
from pathlib import Path
assert sys.argv[1:4]==['-B','-o','StrictHostKeyChecking=yes']
assert len(sys.argv)==7 and sys.argv[-1]=='deploy@admin.re7online.com:/dev/shm/re7-csv-r2-directed-tools-20261017-v1/'
with open('/tmp/trace','a')as f:f.write(json.dumps({'command':'scp','uid':os.getuid()})+'\\n')
for arg in sys.argv[4:-1]:
 p=Path(arg);raw=p.read_bytes()
 fd=os.open('/dev/shm/re7-csv-r2-directed-tools-20261017-v1/'+p.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(raw)
"""
        exclusive(self.lab/'bin/scp',script.encode(),0o700)
    def run_ns(self,args,input=None):
        return subprocess.run(self.base+['--']+args,input=input,capture_output=True,timeout=30)
    def action(self,action):
        blocks=[b for b in self.blocks if "sys.argv=[str(p/'read_package.py'),'"+action+"']" in b]
        self.assertEqual(len(blocks),1)
        # The entire bash block from COMMANDS.md is run verbatim, no substitution.
        return self.run_ns(['/bin/bash','--noprofile','--norc','-s'],blocks[0].encode())
    def trace(self):
        p=self.lab/'trace';return [json.loads(x)for x in p.read_text().splitlines()]if p.exists()else[]
    def test_complete_published_chain_no_sudo(self):
        self.assertNotEqual(self.run_ns(['/bin/sh','-c','command -v sudo']).returncode,0)
        self.assertEqual(self.action('check-origin').returncode,0)
        empty=self.lab/'remote-empty';empty.mkdir(mode=0o700)
        idx=self.base.index(str(self.lab/'remote'));self.base[idx]=str(empty)
        self.capture_root=empty
        for index in (1,2):
            r=self.run_ns(['/bin/bash','--noprofile','--norc','-s'],self.blocks[index].encode())
            self.assertEqual(r.returncode,0,r.stderr.decode())
        c=self.action('collect');self.assertEqual(c.returncode,0,c.stderr.decode())
        raw=(self.capture_root/Path(m.REMOTE).name/m.JOURNAL).read_bytes()
        rows=m.validate_capture(raw,SOURCE.read_bytes());self.assertEqual(len(rows),3)
        inventory=json.loads(__import__('base64').b64decode(rows[1]['stdoutBase64']))
        m.validate_directed_inventory(inventory)
        self.assertNotIn('NOT_A_SECRET',json.dumps(inventory));self.assertNotIn('UNSELECTED_SENTINEL',json.dumps(inventory))
        c=self.action('custody');self.assertEqual(c.returncode,0,c.stderr.decode())
        dest=self.custody_root/Path(m.LOCAL).name
        self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),raw)
        receipt=json.loads((dest/'sequencer.journal.jsonl').read_text())
        self.assertEqual(receipt['event'],'R2_DIRECTED_CUSTODY_COMPLETE_NOT_CERTIFIED')
        self.assertFalse(receipt['atomicSnapshot']);self.assertFalse(receipt['originalCollectionCompleted'])
        self.assertEqual([x['command']for x in self.trace()],['scp','ssh'])
        self.assertNotEqual(self.action('collect').returncode,0);self.assertNotEqual(self.action('custody').returncode,0)
        self.assertEqual([x['command']for x in self.trace()],['scp','ssh'])
        PROOFS.update(fullLauncherChain='PASS; synthetic /proc/config/PM2 paths, real unprivileged Python subprocesses and canonical private custody',sudoUnavailable=True,secretsNotPersisted=True)
    def denied(self,expected):
        self.assertNotEqual(self.action('collect').returncode,0)
        raw=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes();rows=[json.loads(x)for x in raw.splitlines()]
        inventory=json.loads(__import__('base64').b64decode(rows[1]['stdoutBase64']))
        self.assertTrue(any(e.get('reason')==expected for e in inventory['errors']),inventory['errors'])
        self.assertNotEqual(self.action('custody').returncode,0)
        dest=self.custody_root/Path(m.LOCAL).name
        self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),raw)
        self.assertEqual(json.loads((dest/'sequencer.journal.jsonl').read_text())['event'],'R2_DIRECTED_CUSTODY_DENY')
    def test_old_pid_reused_ticks_deny_and_preserve(self):
        p=self.lab/'proc/936386/stat';s=p.read_text().split();s[-1]='666';p.write_text(' '.join(s)+'\n')
        self.denied('historical_candidate_ticks_drift')
    def test_parent_divergence_denies(self):
        p=self.lab/'proc/936540/stat';s=p.read_text().replace('S 18676 ','S 1 ');p.write_text(s)
        self.denied('process_parent')
    def test_wrong_pm2_target_denies(self):
        (self.lab/'home/deploy/.npm-global/lib/node_modules/pm2/package.json').write_text('{"name":"wrong"}')
        self.denied('pm2_package_name')
    def test_proc_access_denied_errno_preserved_no_escalation(self):
        # An unowned/permission-denied procfs boundary is represented by a bound
        # new empty mode000 fixture. No chmod or root helper in the test.
        exclusive(self.lab/'unreadable',b'',0o000)
        self.base+=['--ro-bind',str(self.lab/'unreadable'),'/proc/936386/environ']
        self.assertNotEqual(self.action('collect').returncode,0)
        raw=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes();rows=[json.loads(x)for x in raw.splitlines()]
        inventory=json.loads(__import__('base64').b64decode(rows[1]['stdoutBase64']))
        self.assertTrue(any(e['errorClass']=='PermissionError'and e['errno']==13 for e in inventory['errors']))
    def test_pidfile_changed_denies_without_new_pid_discovery(self):
        (self.lab/'home/deploy/.pm2/pm2.pid').write_text('999999\n')
        self.denied('pm2_pidfile_changed_candidate')
    def test_real_local_proc_read_and_fd_image(self):
        fd=os.open('/proc/'+str(os.getpid()),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:
            before=m.proc_identity(m.read_at(fd,'stat',4096));image=m.executable(fd,{})
            after=m.proc_identity(m.read_at(fd,'stat',4096))
            self.assertEqual(before['ticks'],after['ticks']);self.assertEqual(before['pid'],os.getpid())
            self.assertEqual(len(image['sha256']),64)
        finally:os.close(fd)
        PROOFS['realLocalProc']='real current unprivileged Python PID/stat and running executable FD hash; identity values not published'
    def test_symlink_cycle_denies(self):
        # Direct real file-reader interfaces: link cycles never reach execution.
        pm=self.lab/'home/deploy/.npm-global/bin/pm2';pm.unlink();pm.symlink_to('pm2')
        self.assertNotEqual(self.action('collect').returncode,0)
        raw=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes();rows=[json.loads(x)for x in raw.splitlines()]
        inventory=json.loads(__import__('base64').b64decode(rows[1]['stdoutBase64']))
        self.assertTrue(any(e.get('reason')=='chain_symlink_bound'for e in inventory['errors']))
    def test_link_substitution_between_lstat_and_read_denies(self):
        from unittest.mock import patch
        p=self.lab/'changing';exclusive(self.lab/'a',b'a');exclusive(self.lab/'b',b'b');p.symlink_to('a')
        real=m.os.readlink
        def replace_link(path,*args,**kwargs):
            target=real(path,*args,**kwargs)
            if str(path)==str(p):
                p.unlink();p.symlink_to('b')
            return target
        with patch.object(m.os,'readlink',side_effect=replace_link):
            with self.assertRaisesRegex(RuntimeError,'chain_link_changed'):m.file_chain(str(p))
    def test_proc_generic_link_not_followed_and_duplicate_config_denied(self):
        p=self.lab/'proc/936386';p.joinpath('environ').unlink();p.joinpath('environ').symlink_to('cmdline')
        fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:
            with self.assertRaises(OSError):m.read_at(fd,'environ',m.PROC_LIMIT)
        finally:os.close(fd)
        with self.assertRaisesRegex(RuntimeError,'duplicate_selected_env'):
            m.selected_environment(b'PM2_HOME=a\0PM2_HOME=b\0')

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Launcher))
    if result.wasSuccessful():print(json.dumps({'result':'LOCAL_DIRECTED_LAUNCHER_PASS','tests':result.testsRun,'proofs':PROOFS},sort_keys=True))
    raise SystemExit(not result.wasSuccessful())
