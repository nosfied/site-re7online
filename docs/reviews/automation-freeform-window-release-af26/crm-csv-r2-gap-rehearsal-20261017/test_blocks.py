"""Exact NEXT_COMMANDS blocks in an unprivileged bind-mount lab; no network.
Private history supplies boot/identity/argv fixtures; none of its bytes are printed.
Frontend title is explicitly synthetic: historical references only preserve its SHA.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent/'crm-csv-r2-directed-result-20261017/NEXT_COMMANDS.md'
PACKAGE=HERE.parent/'crm-csv-r2-directed-20261017'
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
TOOLS='/dev/shm/re7-csv-r2-directed-tools-20261017-v1'
CAPTURE='/dev/shm/re7-csv-r2-gap-diagnostic-20261017-v1'
LOCAL=CUSTODY/'csv-r2-gap-diagnostic-20261017-v1'
JOURNAL='privileged-output.private.jsonl'
PROOFS={}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def exclusive(p,data,mode=0o600):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb')as f:f.write(data)
def metadata(p):
    s=p.lstat();return [sha(p.read_bytes()),s.st_size,s.st_mode,s.st_ino,s.st_mtime_ns,s.st_ctime_ns]

class ExactBlocks(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(os.getuid(),0)
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-gap-blocks-');self.root=Path(self.tmp.name)
        self.assertEqual(sha(REVIEW.read_bytes()),'6daa22ad7248b46f2cbabc57c5e231bfcfec8ad912218f7f87d254688519891d')
        self.blocks=re.findall(r'```bash\n(.*?)```',REVIEW.read_text(),re.S);self.assertEqual(len(self.blocks),2)
        self.assertEqual(sha((PACKAGE/'read_package.py').read_bytes()),'66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691')
        self.assertEqual(sha((PACKAGE/'privileged_output.source').read_bytes()),'93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')
        self.hist=[]
        for name in ['csv-r1r2-read-20261016-v1','csv-r1r2-complement-read-20261017-v1','csv-r1r2-deploy-complement-read-20261017-v1','csv-r2-directed-read-20261017-v1']:
            for p in sorted((CUSTODY/name).iterdir()):self.hist.append((p,metadata(p)))
        ctx=json.loads((CUSTODY/'crm-csv-staging-20261016/capture-context-v2.private.json').read_text())
        self.contextSha=sha((CUSTODY/'crm-csv-staging-20261016/capture-context-v2.private.json').read_bytes())
        self.proxyArgs=ctx['proxy']['args'];self.assertIn('-use-listen-fd',self.proxyArgs)
        self.assertEqual(len(self.proxyArgs),12)
        app=next(a for a in ctx['sourceProfile']['apps']if a['name']=='re7-admin-front')
        rows=[json.loads(x)for x in (CUSTODY/'csv-r2-directed-read-20261017-v1/complement-capture.private.jsonl').read_text().splitlines()]
        inv=json.loads(base64.b64decode(rows[1]['stdoutBase64']));boot=next(x['value']for x in inv['targets']if x['label']=='boot-before')
        self.bootRaw=base64.b64decode(boot['bytesBase64']);self.assertEqual(sha(self.bootRaw),'f9512be026ba35cb4662d4f5ac90cc0478f8d67e68ef95eb7d9793199b8d3ce7')
        for name in ['home','proc','remote','bin','system-bin']:(self.root/name).mkdir(mode=0o700)
        self.folder=self.root/'remote'/Path(CAPTURE).name
        self.local=self.root/'home'/LOCAL.relative_to('/home')
        self.local.parent.mkdir(parents=True,mode=0o700)
        self.tools=self.root/'remote'/Path(TOOLS).name;self.tools.mkdir(mode=0o700)
        local_package=self.root/'home'/PACKAGE.relative_to('/home');local_package.mkdir(parents=True)
        for name in ['read_package.py','privileged_output.source']:
            exclusive(self.tools/name,(PACKAGE/name).read_bytes());exclusive(local_package/name,(PACKAGE/name).read_bytes())
        self.put(self.root/'proc/sys/kernel/random/boot_id',self.bootRaw)
        self.front=self.root/'proc/188897';self.front.mkdir()
        ticks=ctx['identities']['re7-admin-front']['ticks']
        self.statfile(self.front/'stat',188897,18676,ticks)
        self.front.joinpath('cwd').symlink_to(app['cwd']);self.front.joinpath('exe').symlink_to('/usr/bin/node')
        # No historical cmdline bytes exist here. Do NOT reconstruct them from SHA.
        # Exercise the required no-literal case with an explicitly synthetic title.
        self.frontCommand=b'synthetic frontend supervisor\0'
        self.assertNotIn(app['script'].encode(),self.frontCommand)
        self.put(self.front/'cmdline',self.frontCommand)
        self.put(self.front/'environ',b'NODE_ENV=production\0PM2_HOME=/home/deploy/.pm2\0ADMIN_TOKEN=UNSELECTED_SENTINEL\0')
        self.proxy=self.root/'proc/177517';self.proxy.mkdir()
        self.statfile(self.proxy/'stat',177517,176940,'96580070')
        self.put(self.proxy/'cmdline',b'\0'.join(a.encode()for a in self.proxyArgs)+b'\0')
        system=self.root/'system-bin'
        for name in ['python3','python3.12','bash','dash','node']:exclusive(system/name,b'')
        (system/'sh').symlink_to('dash');exclusive(system/'sudo',b'not executable')
        self.ssh_fixture()
        self.base=['bwrap','--die-with-parent','--unshare-user','--uid','0','--gid','0','--cap-drop','ALL','--ro-bind','/','/',
                   '--bind',str(self.root/'home'),'/home','--bind',str(self.root/'remote'),'/dev/shm',
                   '--bind',str(self.root/'proc'),'/proc',
                   # Namespace UID0 maps only to this unprivileged host user.
                   # No host-root uid, sudo, chown, or validator substitution.
                   '--ro-bind',str(self.root/'bin'),'/usr/local/bin',
                   '--ro-bind',str(system),'/usr/bin',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/python3',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/python3.12',
                   '--ro-bind','/usr/bin/python3.12','/usr/bin/node',
                   '--ro-bind','/usr/bin/bash','/usr/bin/bash','--ro-bind','/usr/bin/dash','/usr/bin/dash',
                   '--bind',str(self.root),'/tmp']
    def put(self,p,data,mode=0o600):
        p.parent.mkdir(parents=True,exist_ok=True);exclusive(p,data,mode)
    def statfile(self,p,pid,ppid,ticks):
        self.put(p,(str(pid)+' (synthetic process) '+' '.join(['S',str(ppid)]+['0']*17+[str(ticks)])+'\n').encode())
    def tearDown(self):
        for p,before in self.hist:self.assertEqual(metadata(p),before)
        self.tmp.cleanup()
    def ssh_fixture(self):
        script='''#!/usr/bin/python3 -I
import hashlib,json,os,subprocess,sys
from pathlib import Path
assert sys.argv[1:]==['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy@admin.re7online.com','/usr/bin/python3','-B','-I','-S','-','/dev/shm/re7-csv-r2-directed-tools-20261017-v1']
raw=sys.stdin.buffer.read()
r=subprocess.run(['/usr/bin/python3','-B','-I','-S','-','/dev/shm/re7-csv-r2-directed-tools-20261017-v1'],input=raw,capture_output=True)
with open('/tmp/transport-trace','a')as f:f.write(json.dumps({'uid':os.getuid(),'exportExit':r.returncode})+'\\n')
if Path('/tmp/lost').exists():sys.exit(255)
if Path('/tmp/truncated').exists():sys.stdout.buffer.write(r.stdout[:len(r.stdout)//2]);sys.exit(0)
sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr);sys.exit(r.returncode)
'''
        exclusive(self.root/'bin/ssh',script.encode(),0o700)
    def block(self,i):
        # Exact published bytes; no replacement of paths, pins or validators.
        return subprocess.run(self.base+['--','/bin/bash','--noprofile','--norc','-s'],input=self.blocks[i].encode(),capture_output=True,timeout=30)
    def rows(self):return [json.loads(x)for x in (self.folder/JOURNAL).read_text().splitlines()]
    def receipt(self):return json.loads((self.local/'sequencer.journal.jsonl').read_text())
    def transport_count(self):
        p=self.root/'transport-trace';return len(p.read_text().splitlines())if p.exists()else 0
    def test_exact_both_blocks_historical_proxy_and_frontend_without_marker(self):
        probe=subprocess.run(self.base+['--','/usr/bin/python3','-I','-S','-c',
            "import ctypes,json,os; H=type('H',(ctypes.Structure,),{'_fields_':[('version',ctypes.c_uint32),('pid',ctypes.c_int)]}); D=type('D',(ctypes.Structure,),{'_fields_':[('effective',ctypes.c_uint32),('permitted',ctypes.c_uint32),('inheritable',ctypes.c_uint32)]}); h=H(0x20080522,0); d=(D*2)(); assert ctypes.CDLL(None).capget(ctypes.byref(h),ctypes.byref(d))==0; print(json.dumps({'namespaceUid':os.getuid(),'effectiveCapabilities':int(d[0].effective)|(int(d[1].effective)<<32)}))"],capture_output=True)
        self.assertEqual(probe.returncode,0,probe.stderr.decode());caps=json.loads(probe.stdout);self.assertEqual(caps['effectiveCapabilities'],0)
        PROOFS['uidSimulation']={'hostUid':os.getuid(),'namespaceUid':caps['namespaceUid'],'effectiveCapabilities':0,'productionUidDistinctionCertified':False}
        no_sudo=subprocess.run(self.base+['--','/bin/sh','-c','command -v sudo'],capture_output=True);self.assertNotEqual(no_sudo.returncode,0)
        r=self.block(0);self.assertEqual(r.returncode,0,r.stderr.decode())
        rows=self.rows();self.assertEqual([x['event']for x in rows],['R2_GAP_BEGIN','R2_GAP_BOOT','R2_GAP_PROCESS','R2_GAP_PROCESS','R2_GAP_END'])
        front=rows[2];proxy=rows[3]
        self.assertEqual(base64.b64decode(front['cmdlineBase64']),self.frontCommand)
        self.assertNotIn('pm_exec_path',front['selectedEnvironment']);self.assertNotIn('UNSELECTED_SENTINEL',json.dumps(rows))
        self.assertEqual(base64.b64decode(proxy['cmdlineBase64']).rstrip(b'\0').split(b'\0'),[x.encode()for x in self.proxyArgs])
        r=self.block(1);self.assertEqual(r.returncode,0,r.stderr.decode());self.assertEqual(self.transport_count(),1)
        self.assertEqual((self.local/'gap-capture.private.jsonl').read_bytes(),(self.folder/JOURNAL).read_bytes())
        receipt=self.receipt();self.assertEqual(receipt['event'],'R2_GAP_RAW_PRESERVED_NOT_CERTIFIED')
        self.assertFalse(receipt['operationalCertification']);self.assertFalse(receipt['originalCollectionCompleted']);self.assertFalse(receipt['atomicSnapshot'])
        self.assertEqual(self.local.stat().st_mode&0o777,0o700)
        for f in self.local.iterdir():self.assertEqual(f.stat().st_mode&0o777,0o600)
        before=metadata(self.folder/JOURNAL);self.assertNotEqual(self.block(0).returncode,0);self.assertEqual(metadata(self.folder/JOURNAL),before)
        self.assertNotEqual(self.block(1).returncode,0);self.assertEqual(self.transport_count(),1)
        PROOFS['positive']='exact two blocks PASS; actual historical proxy argv privately reused; frontend no-marker model is synthetic'
    def assert_partial(self):
        rows=self.rows();self.assertEqual(rows[-1]['event'],'R2_GAP_DENY')
        self.assertNotIn('R2_GAP_END',[r['event']for r in rows])
        r=self.block(1);self.assertEqual(r.returncode,0,r.stderr.decode())
        self.assertEqual((self.local/'gap-capture.private.jsonl').read_bytes(),(self.folder/JOURNAL).read_bytes())
        self.assertEqual(self.receipt()['event'],'R2_GAP_RAW_PRESERVED_NOT_CERTIFIED')
    def test_frontend_pid_divergent_denies_before_representation(self):
        p=self.front/'stat';p.write_text(p.read_text().replace('188897 (','188898 ('))
        self.assertNotEqual(self.block(0).returncode,0);self.assert_partial()
        self.assertNotIn('R2_GAP_PROCESS',[r['event']for r in self.rows()])
    def test_proxy_ticks_divergent_preserves_frontend_partial(self):
        p=self.proxy/'stat';p.write_text(p.read_text().replace('96580070','96580071'))
        self.assertNotEqual(self.block(0).returncode,0);self.assert_partial()
        self.assertEqual([r.get('label')for r in self.rows()if r['event']=='R2_GAP_PROCESS'],['frontend'])
    def test_permission_denied_records_errno13_without_escalation(self):
        unreadable=self.root/'unreadable';exclusive(unreadable,b'',0o000)
        self.base+=['--ro-bind',str(unreadable),'/proc/188897/environ']
        self.assertNotEqual(self.block(0).returncode,0);self.assert_partial()
        self.assertEqual(self.rows()[-1]['errorClass'],'PermissionError');self.assertEqual(self.rows()[-1]['errno'],13)
    def test_proxy_uid_divergent_denies_with_real_fstat(self):
        # The same exact block runs with namespace UID1000 here. Proxy fixture
        # metadata is UID1000, so the literal UID0 check MUST deny, not approve.
        i=self.base.index('--uid');self.base[i+1]='1000'
        j=self.base.index('--gid');self.base[j+1]='1000'
        self.assertNotEqual(self.block(0).returncode,0);self.assert_partial()
        self.assertEqual([r.get('label')for r in self.rows()if r['event']=='R2_GAP_PROCESS'],['frontend'])
    def test_response_lost_after_export_no_retry_or_false_custody(self):
        self.assertEqual(self.block(0).returncode,0);source=metadata(self.folder/JOURNAL)
        exclusive(self.root/'lost',b'')
        self.assertNotEqual(self.block(1).returncode,0);self.assertEqual(self.transport_count(),1)
        self.assertEqual(self.receipt()['event'],'R2_GAP_CUSTODY_DENY');self.assertFalse((self.local/'gap-capture.private.jsonl').exists())
        self.assertEqual(source,metadata(self.folder/JOURNAL))
    def test_truncated_response_preserved_private_and_denied(self):
        self.assertEqual(self.block(0).returncode,0);exclusive(self.root/'truncated',b'')
        self.assertNotEqual(self.block(1).returncode,0)
        self.assertGreater((self.local/'transfer.stdout.private').stat().st_size,0)
        self.assertEqual(self.receipt()['event'],'R2_GAP_CUSTODY_DENY');self.assertEqual(self.transport_count(),1)
    def test_library_hash_mismatch_denies_before_new_destination(self):
        with (self.tools/'read_package.py').open('ab')as f:f.write(b'\n# synthetic tamper\n')
        self.assertNotEqual(self.block(0).returncode,0);self.assertFalse(self.folder.exists())

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ExactBlocks))
    if result.wasSuccessful():print(json.dumps({'result':'EXACT_PUBLISHED_BLOCKS_LOCAL_PASS','tests':result.testsRun,'proofs':PROOFS,'remoteExecuted':False},sort_keys=True))
    raise SystemExit(not result.wasSuccessful())
