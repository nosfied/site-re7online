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
TOOL='/dev/shm/re7-csv-r1r2-deploy-complement-tools-20261017-v1'
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
        for name in ('remote','custody','bin'):(self.lab/name).mkdir(mode=0o700)
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
        for name in ('crontab','systemctl','ps','ss','node','pm2','ssh'):
            self.shim(name)
        self.base=['bwrap','--die-with-parent','--cap-drop','ALL','--ro-bind','/','/',
                   '--bind',str(self.lab/'remote'),'/dev/shm',
                   '--bind',str(self.lab/'custody'),str(CUSTODY),
                   '--ro-bind',str(OLD),str(OLD),'--ro-bind',str(SECOND),str(SECOND),
                   '--ro-bind',str(self.lab/'bin'),'/usr/local/bin',
                   '--ro-bind',str(self.lab/'no-sudo'),'/usr/bin/sudo',
                   '--bind',str(self.lab),'/tmp']
        self.blocks=re.findall(r'```bash\n(.*?)```',(HERE/'COMMANDS.md').read_text(),re.S)
    def tearDown(self):
        self.assertEqual(self.before,[snapshot(p)for p in self.old_files])
        self.tmp.cleanup()
    def shim(self,name):
        raw='''#!/usr/bin/python3 -I
import json,os,subprocess,sys
from pathlib import Path
name=Path(sys.argv[0]).name
with open('/tmp/trace','a')as f:f.write(json.dumps({'command':name,'argv':sys.argv[1:],'uid':os.getuid()})+'\\n')
if name=='ssh':
 assert sys.argv[1:]==['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy@admin.re7online.com','/usr/bin/python3','-B','-I','-S','-','export']
 raw=sys.stdin.buffer.read()
 assert __import__('hashlib').sha256(raw).hexdigest()==READER_HASH
 p=subprocess.run(['/usr/bin/python3','-B','-I','-S','-','export'],input=raw,capture_output=True)
 sys.stdout.buffer.write(p.stdout);sys.stderr.buffer.write(p.stderr);sys.exit(p.returncode)
if name=='crontab' and Path('/tmp/fail-cron').exists():
 print('synthetic failure',file=sys.stderr);sys.exit(7)
if name in ('node','pm2'):raise RuntimeError('discovery_must_not_execute_tool')
print({'crontab':'# synthetic deploy cron','systemctl':'ActiveState=active\\nUnitFileState=enabled','ps':'PID PPID UID STARTED COMMAND\\n42 1 1000 synthetic','ss':'State Recv-Q Send-Q Local Address:Port Peer Address:Port'}[name])
'''.replace('READER_HASH',repr(digest(SOURCE)))
        exclusive(self.lab/'bin'/name,raw.encode(),0o700)
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
        who=self.run_ns(['/usr/bin/id','-u']);self.assertEqual(who.stdout.strip(),str(os.getuid()).encode())
        absent=self.run_ns(['/bin/sh','-c','command -v sudo']);self.assertNotEqual(absent.returncode,0)
        denied=self.run_ns(['/usr/bin/sudo','-n','true']);self.assertNotEqual(denied.returncode,0)
        self.assertEqual(self.action('check-origin').returncode,0)
        c=self.action('collect');self.assertEqual(c.returncode,0,c.stderr.decode())
        raw=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes()
        rows=m.validate_capture(raw,SOURCE.read_bytes())
        self.assertEqual(len(rows),8)
        boot=json.loads(__import__('base64').b64decode(rows[1]['stdoutBase64']))
        m.validate_boot_inventory(boot)
        self.assertEqual(boot['targets'][0]['bytes'],37)
        self.assertEqual(rows[1]['argv'],['/usr/bin/python3','-B','-I','-S','-','boot'])
        c=self.action('custody');self.assertEqual(c.returncode,0,c.stderr.decode())
        dest=self.lab/'custody'/Path(m.LOCAL).name
        self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),raw)
        receipt=json.loads((dest/'sequencer.journal.jsonl').read_text())
        self.assertEqual(receipt['event'],'R1R2_COMPLEMENT_CUSTODY_COMPLETE_NOT_CERTIFIED')
        self.assertFalse(receipt['atomicSnapshot']);self.assertFalse(receipt['originalCollectionCompleted'])
        for p in dest.iterdir():self.assertEqual(p.stat().st_mode&0o777,0o600)
        self.assertEqual(dest.stat().st_mode&0o777,0o700)
        calls=self.trace();self.assertEqual([x['command']for x in calls],['crontab','systemctl','ps','ss','ssh'])
        self.assertTrue(all(x['uid']==os.getuid()for x in calls))
        # Existing destinations deny without changing either journal or replaying commands.
        trace=list(calls);before=snapshot(dest/'sequencer.journal.jsonl')
        self.assertNotEqual(self.action('collect').returncode,0)
        self.assertNotEqual(self.action('custody').returncode,0)
        self.assertEqual(before,snapshot(dest/'sequencer.journal.jsonl'));self.assertEqual(trace,self.trace())
        PROOFS.update(fullLauncherChain='PASS',uid=os.getuid(),sudoExecutableUnavailable=True,
                      bootRead='real local procfs; UUID not published',commands=6,
                      syntheticResponses=['deploy-cron','supervision','process-discovery','listener-discovery','tool-path-discovery'],
                      transfer='real local SSH substitute executable -> real Python export subprocess, no SSH network',
                      custody='real private_record and origin validator; both historical source directories read-only',
                      replayExistingDestinations='DENY unchanged',rawBytesPublished=False)
    def test_failure_preserved_by_export_and_canonical_custody(self):
        exclusive(self.lab/'fail-cron',b'')
        self.assertNotEqual(self.action('collect').returncode,0)
        capture=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes()
        self.assertEqual(json.loads(capture.splitlines()[-1])['result'],'COMPLEMENT_READS_DENY')
        self.assertNotEqual(self.action('custody').returncode,0)
        dest=self.lab/'custody'/Path(m.LOCAL).name
        self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),capture)
        self.assertEqual(json.loads((dest/'sequencer.journal.jsonl').read_text())['event'],'R1R2_COMPLEMENT_CUSTODY_DENY')
        self.assertEqual([x['command']for x in self.trace()],['crontab','ssh'])
    def test_reviewed_hash_denies_before_any_capture(self):
        with (self.tools/'read_package.py').open('ab')as f:f.write(b'\n# synthetic tamper\n')
        self.assertNotEqual(self.action('collect').returncode,0)
        self.assertFalse((self.lab/'remote'/Path(m.REMOTE).name).exists())
        self.assertEqual(self.trace(),[])
    def test_minimal_delta_and_no_privileged_call(self):
        old=HERE.parent/'crm-csv-r1r2-complement-20261017/read_package.py'
        expected=old.read_text().replace('Root mode only reads fixed paths.','Unprivileged boot mode only reads boot_id.').replace('complement-read-20261017-v1','deploy-complement-read-20261017-v1').replace("['sudo','-n','/usr/bin/python3','-B','-I','-S','-','root']","['/usr/bin/python3','-B','-I','-S','-','boot']").replace("if action=='root':","if action=='boot':").replace('stdin to root/export','stdin to boot/export')
        self.assertEqual(SOURCE.read_text(),expected)
        self.assertFalse(any('sudo'in argv for _,argv,_ in m.specs(SOURCE.read_bytes())))
        self.assertNotIn('run_privileged(',SOURCE.read_text())
        self.assertEqual(digest(HERE/'privileged_output.source'),m.WRITER_SHA)
        PROOFS.update(minimalDelta='exact deterministic comparison PASS; observe/FD/read64 unchanged',
                      canonicalWriter='byte-exact; run_privileged defined but never called')

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Launcher)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():
        print(json.dumps({'result':'LOCAL_LAUNCHER_CHAIN_PASS','tests':result.testsRun,'proofs':PROOFS},sort_keys=True))
    raise SystemExit(not result.wasSuccessful())
