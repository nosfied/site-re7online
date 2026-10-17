"""Only affected metadata/diagnosis/transport proofs. No VPS or consumed action."""
import ast,base64,hashlib,json,os,re,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists());REVIEW=P.parent
RESULTS=[]
def module(name,path):
    s={'__name__':'test_library','__file__':str(path)};exec(compile(path.read_bytes(),str(path),'exec'),s);return s
LIB=module('reader',REVIEW/'crm-csv-r2-directed-20261017/read_package.py')
PROBE=module('probe',P/'capacity_read.py')
class Metadata(unittest.TestCase):
    def run_probe(self,case):
        with tempfile.TemporaryDirectory(prefix='re7-capacity-predicate-')as td:
            root=Path(td);q=root/'target'
            mask=os.umask(0)
            try:q.mkdir(mode=0o775 if case=='directory-contract-denied'else 0o700)
            finally:os.umask(mask)
            (q/'images').write_bytes(b'NEVER_READ_IMAGE_CONTENT')
            realopen=os.open;realvfs=os.statvfs;calls=[];opens=[]
            if case=='missing':(q/'images').unlink();q.rmdir()
            def opened(path,flags,*a,**kw):
                self.assertFalse(flags&(os.O_CREAT|os.O_TRUNC|os.O_WRONLY|os.O_RDWR|os.O_APPEND));opens.append(os.fsdecode(path))
                self.assertNotEqual(os.fsdecode(path),'images')
                if os.fsdecode(path)=='target' and case=='denied':raise PermissionError(13,'synthetic denied')
                if os.fsdecode(path)=='target' and case=='replacement':
                    q.rename(root/'old');q.mkdir(mode=0o700)
                return realopen(path,flags,*a,**kw)
            def vfs(fd):
                calls.append(fd);self.assertIsInstance(fd,int)
                if case=='vfs-error':raise OSError(5,'synthetic IO')
                value=realvfs(fd)
                if case=='budget-low':
                    values=list(value);values[4]=0;return os.statvfs_result(values)
                return value
            with patch.object(os,'open',opened),patch.object(os,'statvfs',vfs):v=PROBE['collect'](LIB,str(q))
            self.assertNotIn('NEVER_READ_IMAGE_CONTENT',json.dumps(v));self.assertFalse(v['remoteFilesWritten']);self.assertFalse(v['imagesCreationAttempted'])
            if case in ('valid','budget-low','directory-contract-denied'):
                self.assertEqual(v['readerUid'],os.getuid());self.assertEqual(v['readerGid'],os.getgid());self.assertEqual(len(calls),1);self.assertEqual(v['statvfsCallCount'],1);self.assertEqual(v['result'],'CAPACITY_METADATA_OBSERVED_NOT_CERTIFIED')
                nums=v['statvfs']['result'];self.assertEqual(v['statvfs']['product']['availableBytes'],nums['f_bavail']*nums['f_frsize'])
                self.assertTrue(v['paths'][-1]['exists']);self.assertEqual(v['paths'][-1]['metadata']['size'],len(b'NEVER_READ_IMAGE_CONTENT'))
                if case=='budget-low':self.assertFalse(v['statvfs']['comparison']['satisfied'])
                if case=='directory-contract-denied':self.assertEqual(v['canonicalDirectory']['result'],'DENY')
            else:
                self.assertEqual(v['result'],'CAPACITY_READ_DENY');self.assertEqual(len(calls),1 if case=='vfs-error'else 0)
                if case=='vfs-error':self.assertEqual(v['statvfs']['errno'],5)
                if case=='denied':self.assertEqual(v['errno'],13)
            RESULTS.append({'case':case,'scope':'actual local FD/metadata/statvfs; synthetic error/replacement only as named','statvfsCalls':len(calls),'result':v['result'],'imageOpened':False,'remoteFileWrite':False})
    def test_one_real_statvfs_no_content(self):self.run_probe('valid')
    def test_directory_contract_separate_from_statvfs(self):self.run_probe('directory-contract-denied')
    def test_low_budget_is_observation_not_admission(self):self.run_probe('budget-low')
    def test_denied_read(self):self.run_probe('denied')
    def test_replacement(self):self.run_probe('replacement')
    def test_missing(self):self.run_probe('missing')
    def test_statvfs_error(self):self.run_probe('vfs-error')
    def test_original_stage_ambiguous(self):
        # Exact original three statements and exception handler, never run().
        source=(REVIEW/'crm-csv-toolchain-discovery-20261017/runner.py').read_text();run=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)and n.name=='run');tr=next(n for n in run.body if isinstance(n,ast.Try))
        tree=ast.fix_missing_locations(ast.Module(body=[ast.Try(body=tr.body[:3],handlers=tr.handlers,orelse=[],finalbody=[])],type_ignores=[]))
        blobs={n:(REVIEW/'crm-csv-r2-directed-20261017'/n).read_bytes()for n in ('read_package.py','privileged_output.source')}
        capscope={'__name__':'lib','BLOBS':blobs};exec(compile((REVIEW/'crm-csv-toolchain-discovery-20261017/capture.source').read_bytes(),'<actual Capture>','exec'),capscope)
        endings=[]
        with tempfile.TemporaryDirectory(prefix='re7-stage-ambiguity-')as td:
            root=Path(td)
            for name,free,mode in [('budget-false',0,0o700),('directory-denied',512*1024*1024,0o775)]:
                q=root/name;mask=os.umask(0)
                try:q.mkdir(mode=mode)
                finally:os.umask(mask)
                diag=root/(name+'-diag');diag.mkdir(mode=0o700);cap=capscope['Capture'](diag);count=[]
                def vfs(path):count.append(str(path));return os.statvfs_result((1,1,free,free,free,1,1,1,0,255))
                scope={'os':os,'q':q,'lib':LIB,'require':LIB['require'],'cap':cap}
                with patch.object(os,'statvfs',vfs):exec(compile(tree,'<exact original prefix/catch>','exec'),scope)
                row=json.loads((diag/'privileged-output.private.jsonl').read_text());self.assertEqual(len(count),2);self.assertFalse((q/'images').exists())
                endings.append({k:row[k]for k in ('denialStage','denialReason','errorClass','errno','result')})
            self.assertEqual(endings[0],endings[1]);self.assertEqual(endings[0]['errorClass'],'RuntimeError')
        RESULTS.append({'case':'original-stage-ambiguity','sameRecordedOutcomeForStatvfsPredicateAndCanonicalDirectoryDenial':True,'originalStatvfsCallsEachCase':2,'validators':'exact original prefix/catch and actual canonical new_directory/directory and Capture/private_record','external':'capacity numbers synthetic; laboratory775 fixture only; no historical attribution'})
class Blocks(unittest.TestCase):
    def block(self,case):
        custody=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
        with tempfile.TemporaryDirectory(prefix='re7-capacity-command-')as td:
            root=Path(td)
            for n in ('shm','custody','bin'):(root/n).mkdir(mode=0o700)
            target=root/'shm/re7-csv-toolchain-read-20261017-v2';target.mkdir(mode=0o700)
            # Matching basename only inside isolated lab, never the real consumed destination.
            shim=root/'bin/ssh';shim.write_text('#!/usr/bin/python3\nimport sys\nsys.path.insert(0,'+repr(str(P))+')\nimport lab\nlab.remote(sys.argv[-1])\n');shim.chmod(0o700)
            env=dict(os.environ,RE7_CAPACITY_CASE=case,PATH=str(root/'bin')+':'+os.environ['PATH'],PYTHONDONTWRITEBYTECODE='1')
            prefix=['bwrap','--die-with-parent','--unshare-user','--uid','0','--gid','0','--cap-drop','ALL','--unshare-net','--ro-bind','/','/','--bind',str(root),str(root),'--bind',str(root/'shm'),'/dev/shm','--bind',str(root/'custody'),str(custody),'--chdir',str(ROOT)]
            command=re.findall(r'```bash\n(.*?)```',(P/'COMMANDS.md').read_text(),re.S)[0]
            result=subprocess.run(prefix+['/bin/bash','-c',command],capture_output=True,env=env,timeout=30)
            q=root/'custody/csv-toolchain-capacity-20261017-v1';rows=[json.loads(x)for x in(q/'privileged-output.private.jsonl').read_text().splitlines()];row=next(x for x in rows if x['event']=='command');receipt=json.loads((q/'sequencer.journal.jsonl').read_text())
            for key in ('stdout','stderr'):
                raw=(q/('capacity-ssh.'+key+'.private')).read_bytes();self.assertEqual(len(raw),row[key+'Bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),row[key+'Sha256']);self.assertEqual(raw,base64.b64decode(row[key+'Base64']))
            self.assertEqual(list(target.iterdir()),[],'Remote images/source/results never created')
            if case=='valid':
                self.assertEqual(result.returncode,0,result.stdout.decode()+result.stderr.decode())
                obs=json.loads(base64.b64decode(row['stdoutBase64']))['observation'];self.assertEqual(obs['statvfsCallCount'],1);self.assertFalse(obs['remoteFilesWritten']);self.assertEqual(receipt['event'],'CAPACITY_CUSTODY_PRESERVED_NOT_CERTIFIED')
            else:
                self.assertNotEqual(result.returncode,0);self.assertEqual(receipt['event'],'CAPACITY_CUSTODY_DENY_PARTIAL_PRESERVED');self.assertGreater(row['stdoutBytes'],0)
            RESULTS.append({'case':'literal-command-'+case,'literalBash':True,'exitCode':result.returncode,'custodyEvent':receipt['event'],'remoteFilesWritten':False,'SSH':'simulated shim, network namespace disabled; actual FD/statvfs/Capture/ingest'})
    def test_literal_command(self):self.block('valid')
    def test_response_lost(self):self.block('reply-lost')
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(Metadata),unittest.defaultTestLoader.loadTestsFromTestCase(Blocks)]))
    if result.wasSuccessful():
        (P/'PROOFS.json').write_text(json.dumps({'result':'LOCAL_METADATA_PROCEDURE_VALIDATED_NOT_EXECUTED_ON_VPS','tests':result.testsRun,'cases':RESULTS,'commandsSha256':hashlib.sha256((P/'COMMANDS.md').read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256((P/'MANIFEST.json').read_bytes()).hexdigest(),'noHistoricalCauseInferred':True,'limits':'local metadata/statvfs real; capacity/denial/replacement fixtures as identified; SSH/root-user namespace/production path simulated; no images, Node/PM2/ELF/SQL or VPS; no previous suite repeated'},indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful()else 1)
