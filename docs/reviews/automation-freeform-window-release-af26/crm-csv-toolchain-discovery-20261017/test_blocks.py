"""Three literal published blocks, isolated filesystem/network, no VPS."""
import hashlib,json,os,re,subprocess,tempfile,unittest
from pathlib import Path
import lab
P=Path(__file__).resolve().parent;BASE=next(p for p in P.parents if(p/'.git').exists())
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
RESULTS=[]
class Blocks(unittest.TestCase):
    def exercise(self,case):
        with tempfile.TemporaryDirectory(prefix='re7-elf-local-blocks-')as td:
            r=Path(td)
            for n in ('shm','custody','bin'):(r/n).mkdir(mode=0o700)
            lab.fixture(r)
            for name,call in [('ssh','remote(sys.argv[-1],sys.stdin.buffer)'),('python3','local()'),('scp','scp()')]:
                shim=r/'bin'/name;shim.write_text('#!/usr/bin/python3\nimport sys\nsys.path.insert(0,'+repr(str(P))+')\nimport lab\nlab.'+call+'\n');shim.chmod(0o700)
            env=dict(os.environ,RE7_DISCOVERY_LAB=str(r),RE7_DISCOVERY_CASE=case,PATH=str(r/'bin')+':'+os.environ['PATH'],PYTHONDONTWRITEBYTECODE='1')
            prefix=['bwrap','--die-with-parent','--unshare-user','--uid','0','--gid','0','--cap-drop','ALL','--unshare-net','--ro-bind','/','/','--bind',str(r),str(r),'--bind',str(r/'shm'),'/dev/shm','--bind',str(r/'custody'),str(CUSTODY),'--chdir',str(BASE)]
            blocks=re.findall(r'```bash\n(.*?)```',(P/'COMMANDS.md').read_text(),re.S)
            def block(i):return subprocess.run(prefix+['/bin/bash','-c',blocks[i]],capture_output=True,env=env,timeout=40)
            a=block(0)
            if case.startswith('local-tool-'):
                self.assertNotEqual(a.returncode,0,a.stdout.decode()+a.stderr.decode())
                journal=r/'shm/re7-csv-toolchain-material-20261017-v2/privileged-output.private.jsonl'
                self.assertEqual(json.loads(journal.read_text().splitlines()[-1])['result'],'DENY_NO_RETRY')
                self.assertFalse((r/'shm/re7-csv-toolchain-read-20261017-v2').exists())
                RESULTS.append({'case':case,'materializeExit':a.returncode,'remoteCalled':False,'privateDeny':True});return
            self.assertEqual(a.returncode,0,a.stdout.decode()+a.stderr.decode()+(r/'shm/re7-csv-toolchain-material-20261017-v2/privileged-output.private.jsonl').read_text()[-3500:])
            b=block(1);folder=r/'custody/csv-toolchain-discovery-20261017-v2'
            self.assertTrue((folder/'capture.private.jsonl').exists(),(folder/'transfer.stderr.private').read_text())
            rows=[json.loads(x)for x in(folder/'capture.private.jsonl').read_text().splitlines()]
            end=next(x for x in reversed(rows)if x['event']=='end')
            self.assertFalse((r/'analysis-calls').read_text(),'No remote analysis may execute')
            if case in ('replacement','node-read-denied'):
                self.assertNotEqual(b.returncode,0);self.assertEqual(end['result'],'DENY_NO_RETRY')
                self.assertFalse((r/'custody/csv-toolchain-analysis-20261017-v2').exists())
                RESULTS.append({'case':case,'collectExit':b.returncode,'result':end['result'],'denialStage':end['denialStage'],'remoteToolCalled':False});return
            self.assertEqual(b.returncode,0,b.stdout.decode()+b.stderr.decode()+json.dumps(end))
            c=block(2);out=r/'custody/csv-toolchain-analysis-20261017-v2'
            journal=[json.loads(x)for x in(out/'privileged-output.private.jsonl').read_text().splitlines()]
            final=journal[-1]
            if case=='valid':
                self.assertEqual(c.returncode,0,c.stdout.decode()+c.stderr.decode()+json.dumps(final))
                self.assertEqual(final['result'],'LOCAL_ELF_ANALYZED_NOT_CERTIFIED');self.assertFalse(final['elfClosureCertified'])
                self.assertEqual(len([x for x in rows if x['event']=='image-published']),1,'Deduplicate selected/mapped same ELF')
                self.assertTrue(any(x.get('id')=='local-elf-0'and x.get('exitCode')==0 for x in journal))
            else:
                self.assertNotEqual(c.returncode,0);self.assertEqual(final['result'],'DENY_NO_RETRY')
                self.assertEqual(final['denialStage'],'transfer-images'if case=='partial-transfer'else'image-integrity')
                self.assertTrue(list((out/'images').glob('*.elf')),'Preserve partial')
                self.assertTrue(any(x.get('id','').startswith('partial-image-') and x.get('exitCode')==0 for x in journal),'Hash/metadata partials with canonical reader')
                self.assertFalse(any(x.get('id','').startswith('local-elf-')for x in journal))
            RESULTS.append({'case':case,'materializeExit':a.returncode,'collectExit':b.returncode,'localAnalysisExit':c.returncode,'result':final['result'],'denialStage':final.get('denialStage'),'remoteToolCalled':False,'literalBlocks':True,'privateCaptureSha256':hashlib.sha256((folder/'capture.private.jsonl').read_bytes()).hexdigest()})
    def test_valid(self):self.exercise('valid')
    def test_local_tool_missing(self):self.exercise('local-tool-missing')
    def test_local_tool_denied(self):self.exercise('local-tool-denied')
    def test_remote_read_denied(self):self.exercise('node-read-denied')
    def test_concurrent_substitution(self):self.exercise('replacement')
    def test_partial_transfer(self):self.exercise('partial-transfer')
    def test_image_tampered(self):self.exercise('image-tampered')
if __name__=='__main__':
    r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Blocks))
    if r.wasSuccessful():
        (P/'PROOFS.json').write_text(json.dumps({'result':'LOCAL_SPLIT_ROUTE_VALIDATED_NOT_CERTIFIED','tests':r.testsRun,'cases':RESULTS,'commandsSha256':hashlib.sha256((P/'COMMANDS.md').read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256((P/'MANIFEST.json').read_bytes()).hexdigest(),'real':'Three literal Bash blocks; reviewed in-memory launcher, canonical reader/write_artifact/private_record/export/ingest; real local readelf --version and ELF FD analysis; preserved image bytes and SHA integrity','simulated':'SSH/SCP transports via shims; remote proc/boot/PID/maps and expected Node hash mapped to local /usr/bin/true (never executed); root UID65534 projected to0 in isolated user namespace; denied reads/missing tool injected; no VPS','notCertified':'ELF/JS closure and operational protection; production identities not observed','reused':'Accepted Capture/reader/custody; no repetition of PM2/closure26/Operations suites'},indent=2)+'\n')
    raise SystemExit(0 if r.wasSuccessful()else 1)
