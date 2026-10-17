"""Execute the two published blocks literally in a disposable network namespace."""
import hashlib,json,os,re,subprocess,tempfile,unittest
from pathlib import Path
import lab
P=Path(__file__).resolve().parent;BASE=next(p for p in P.parents if(p/'.git').exists())
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
RESULTS=[]
class Blocks(unittest.TestCase):
    def exercise(self,case):
        with tempfile.TemporaryDirectory(prefix='re7-toolchain-blocks-')as td:
            r=Path(td)
            for n in ('shm','custody','bin'):(r/n).mkdir(mode=0o700)
            lab.fixture(r)
            shim=r/'bin/ssh';shim.write_text('#!/usr/bin/python3\nimport sys\nsys.path.insert(0,'+repr(str(P))+')\nimport lab\nlab.remote(sys.argv[-1],sys.stdin.buffer)\n');shim.chmod(0o700)
            env=dict(os.environ,RE7_DISCOVERY_LAB=str(r),RE7_DISCOVERY_CASE=case,PATH=str(r/'bin')+':'+os.environ['PATH'],PYTHONDONTWRITEBYTECODE='1')
            prefix=['bwrap','--die-with-parent','--unshare-user','--uid','0','--gid','0','--cap-drop','ALL','--unshare-net','--ro-bind','/','/','--bind',str(r),str(r),'--bind',str(r/'shm'),'/dev/shm','--bind',str(r/'custody'),str(CUSTODY),'--chdir',str(BASE)]
            blocks=re.findall(r'```bash\n(.*?)```',(P/'COMMANDS.md').read_text(),re.S)
            a=subprocess.run(prefix+['/bin/bash','-c',blocks[0]],capture_output=True,env=env,timeout=25)
            self.assertEqual(a.returncode,0,a.stdout.decode()+a.stderr.decode())
            b=subprocess.run(prefix+['/bin/bash','-c',blocks[1]],capture_output=True,env=env,timeout=50)
            folder=r/'custody/csv-toolchain-discovery-20261017-v1'
            self.assertTrue((folder/'transfer.stderr.private').exists())
            self.assertTrue((folder/'capture.private.jsonl').exists(),(folder/'transfer.stderr.private').read_text())
            rows=[json.loads(x)for x in(folder/'capture.private.jsonl').read_text().splitlines()]
            end=next(x for x in reversed(rows)if x['event']=='end')
            journal=[json.loads(x)for x in(folder/'privileged-output.private.jsonl').read_text().splitlines()]
            transport=journal[0]
            for key in ('stdout','stderr'):
                raw=(folder/('transfer.'+key+'.private')).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),transport[key+'Sha256']);self.assertEqual(len(raw),transport[key+'Bytes'])
            if case=='valid':
                self.assertEqual(b.returncode,0,b.stdout.decode()+b.stderr.decode()+(folder/'transfer.stderr.private').read_text()+json.dumps(end))
                self.assertEqual(end['result'],'DISCOVERY_OBSERVED_NOT_CERTIFIED');self.assertFalse(end['elfClosureCertified']);self.assertFalse(end['protectionCertified'])
                self.assertTrue((r/'analysis-calls').read_text())
            else:
                self.assertNotEqual(b.returncode,0);self.assertEqual(end['result'],'DENY_NO_RETRY')
                if case in ('missing-tool','denied-tool'):
                    self.assertEqual(end['denialStage'],'analysis-tool');self.assertEqual(end['errno'],2 if case=='missing-tool'else 13)
                    self.assertFalse((r/'analysis-calls').read_text())
                if case=='replacement':self.assertEqual(end['denialStage'],'path-selection');self.assertFalse((r/'analysis-calls').read_text())
            RESULTS.append({'case':case,'materializeExit':a.returncode,'collectExit':b.returncode,'result':end['result'],'denialStage':end.get('denialStage'),'custody':'canonical byte-exact journal and original stdout/stderr preserved','literalBlocks':True})
    def test_valid(self):self.exercise('valid')
    def test_missing_tool(self):self.exercise('missing-tool')
    def test_denied_read(self):self.exercise('denied-tool')
    def test_concurrent_substitution(self):self.exercise('replacement')
if __name__=='__main__':
    r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Blocks))
    if r.wasSuccessful():
        (P/'PROOFS.json').write_text(json.dumps({'result':'LOCAL_ROUTE_VALIDATED_NOT_OPERATIONALLY_CERTIFIED','tests':r.testsRun,'cases':RESULTS,'commandsSha256':hashlib.sha256((P/'COMMANDS.md').read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256((P/'MANIFEST.json').read_bytes()).hexdigest(),'real':'Bash/Python launcher, FD/no-follow/metadata canonical reader, actual local readelf consuming actual ELF FD, export/transfer envelope/ingest/private_record; isolated user and network namespace','simulated':'SSH via local shim; host root UID65534 projected to UID0 inside user namespace; remote filesystem/proc/stat/maps/boot/pm2.pid; expected Node digest projected to local synthetic image (/usr/bin/true), not Node d016; ENOENT/EACCES injected at tool read, not observations of VPS; new fixture executable modes only','preserved':'All historical destinations, DENYs and operational generations untouched; no target Node/PM2 executed'},indent=2)+'\n')
    raise SystemExit(0 if r.wasSuccessful()else 1)
