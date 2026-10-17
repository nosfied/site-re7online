"""Literal published Bash in disposable filesystem/user/network namespaces; no VPS."""
import hashlib,json,os,re,shutil,subprocess,tempfile,time,unittest
from pathlib import Path
import lab
P=Path(__file__).resolve().parent
BASE=next(p for p in P.parents if(p/'.git').exists())
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
NODE=shutil.which('node');PM='/tmp/re7-b4-toolchain-20261016/node_modules'
class Blocks(unittest.TestCase):
    def exercise(self,case='valid',sql=False):
        old=os.umask(0o077)
        try:
            with tempfile.TemporaryDirectory(prefix='re7-three-gaps-blocks-')as td:
                r=Path(td)
                for n in ('shm','custody','bin'):(r/n).mkdir(mode=0o700)
                apps=lab.fixture(r)
                if case=='config-changed':apps[-1]['pm2_env']['watch']=True
                endpoint=r/'fs/home/deploy/.pm2/rpc.sock'
                server=None
                if case!='daemon-absent':
                    server=subprocess.Popen([NODE,'-e',lab.SERVER,PM,json.dumps(apps),str(endpoint),case],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    self.assertEqual(server.stdout.readline(),b'READY\n')
                shim=r/'bin/ssh'
                shim.write_text('#!/usr/bin/python3\nimport sys\nsys.path.insert(0,'+repr(str(P))+')\nimport lab\nlab.remote(sys.argv[-1],sys.stdin.buffer)\n')
                # New laboratory launcher only; never changes source or production permissions.
                os.chmod(shim,0o700)
                commands=re.findall(r'```bash\n(.*?)```',(P/'COMMANDS.md').read_text(),re.S)
                env=dict(os.environ,RE7_LAB=str(r),RE7_LAB_NODE=NODE,RE7_LAB_CASE=case,RE7_LAB_SERVER=str(server.pid if server else 1),PATH=str(r/'bin')+':'+os.environ['PATH'],PYTHONDONTWRITEBYTECODE='1')
                prefix=['bwrap','--die-with-parent','--unshare-user','--uid','0','--gid','0','--cap-drop','ALL','--unshare-net','--ro-bind','/','/','--bind',str(r/'shm'),'/dev/shm','--bind',str(r/'custody'),str(CUSTODY),'--chdir',str(BASE)]
                try:
                    if case=='source-tampered':
                        bad=r/'bad.js';bad.write_text('adulterated')
                        prefix+=['--ro-bind',str(bad),PM+'/amp/index.js']
                    a=subprocess.run(prefix+['/bin/bash','-c',commands[0]],capture_output=True,env=env,timeout=30)
                    if case=='source-tampered':
                        self.assertNotEqual(a.returncode,0)
                        m=r/'shm/re7-csv-three-gaps-material-20261017-v1/privileged-output.private.jsonl'
                        self.assertEqual(json.loads(m.read_text().splitlines()[-1])['result'],'DENY_NO_RETRY')
                        guard=r/'custody/csv-three-gaps-launcher-20261017-v1-materialize/privileged-output.private.jsonl'
                        self.assertEqual(json.loads(guard.read_text())['exitCode'],1)
                        return {'case':case,'materialize':a.returncode,'literalBash':True,'remoteCalled':False}
                    self.assertEqual(a.returncode,0,a.stdout.decode()+a.stderr.decode())
                    if case=='bundle-tampered':
                        f=r/'shm/re7-csv-three-gaps-material-20261017-v1/bundle.private.json';v=json.loads(f.read_bytes());v['files']['pm2_rpc_fd.cjs']='YWR1bHRlcmF0ZWQ=';f.write_text(json.dumps(v))
                    bundle=r/'shm/re7-csv-three-gaps-material-20261017-v1/bundle.private.json'
                    st=bundle.stat();os.utime(bundle,ns=(1000000000,st.st_mtime_ns))
                    b=subprocess.run(prefix+['/bin/bash','-c',commands[1]],capture_output=True,env=env,timeout=35)
                    folder=r/'custody/csv-three-gaps-executable-20261017-v1'
                    self.assertTrue((folder/'transfer.stdout.private').exists())
                    self.assertTrue((folder/'transfer.stderr.private').exists())
                    records=[json.loads(x)for x in(folder/'sequencer.journal.jsonl').read_text().splitlines()]
                    transport=[json.loads(x)for x in(folder/'privileged-output.private.jsonl').read_text().splitlines()][0]
                    self.assertIn('startedUtc',transport);self.assertIn('finishedUtc',transport)
                    for k in ('stdout','stderr'):
                        raw=(folder/('transfer.'+k+'.private')).read_bytes();self.assertEqual(len(raw),transport[k+'Bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),transport[k+'Sha256'])
                    if case in ('valid','snapshot-substitution'):
                        self.assertEqual(b.returncode,0,b.stdout.decode()+b.stderr.decode()+(folder/'transfer.stderr.private').read_text())
                        self.assertTrue(records[-1]['gatePass'])
                        raw=(folder/'capture.private.jsonl').read_bytes();rows=[json.loads(x)for x in raw.splitlines()]
                        self.assertEqual([x['event']for x in rows if x['event'].startswith('GATE')],['GATE1_VERIFIED_SNAPSHOT','GATE2_RPC_CONFIGURATION_PASS','GATE3_ROUTE_CLIENT_OBSERVED'])
                        self.assertFalse(any(x.get('id')in('identity','ownership','imports')for x in rows))
                        if sql:
                            c=subprocess.run(prefix+['/bin/bash','-c',commands[2]],capture_output=True,env=env,timeout=35)
                            self.assertEqual(c.returncode,0,c.stdout.decode()+c.stderr.decode())
                    else:
                        self.assertNotEqual(b.returncode,0,b.stdout.decode())
                        if case not in ('bundle-tampered','partial-transfer'):
                            self.assertEqual(records[-1]['event'],'THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED', (folder/'transfer.stderr.private').read_text())
                            rows=[json.loads(x)for x in(folder/'capture.private.jsonl').read_text().splitlines()]
                            names={x.get('id'):x for x in rows if x['event']=='command'}
                            if case=='peer-wrong':self.assertEqual(names['peer-before']['exitCode'],1);self.assertNotIn('pm2-rpc',names)
                            if case in ('reply-lost','timeout'):self.assertEqual(names['pm2-rpc']['exitCode'],1);self.assertNotIn('frontend-contract',names)
                            if case=='config-changed':self.assertEqual(names['frontend-contract']['exitCode'],1);self.assertNotIn('db-route',names)
                            if case=='route-changed':self.assertIn('db-route',names);self.assertNotIn('sql-client-path',names)
                        self.assertFalse(records[-1].get('gatePass',False))
                    return {'case':case,'materialize':a.returncode,'collect':b.returncode,'custodyEvent':records[-1]['event'],'literalBash':True,'networkNamespace':True,'sourceManifestSha256':hashlib.sha256((P/'MANIFEST.json').read_bytes()).hexdigest(),'commandsSha256':hashlib.sha256((P/'COMMANDS.md').read_bytes()).hexdigest(),'sqlTransportSynthetic':sql}
                finally:
                    if server:
                        server.terminate();out,err=server.communicate(timeout=3)
                        expected=0 if case in ('peer-wrong','bundle-tampered','source-tampered') else 2 if sql else 1
                        self.assertEqual(int(out.decode().split('CALLS=')[-1].strip()or'0'),expected)
        finally:os.umask(old)
    def test_literal_complete(self):RESULTS.append(self.exercise(sql=True))
    def test_absent_daemon(self):RESULTS.append(self.exercise('daemon-absent'))
    def test_peer_divergence(self):RESULTS.append(self.exercise('peer-wrong'))
    def test_rpc_lost_response(self):RESULTS.append(self.exercise('reply-lost'))
    def test_rpc_timeout(self):RESULTS.append(self.exercise('timeout'))
    def test_config_drift(self):RESULTS.append(self.exercise('config-changed'))
    def test_route_drift(self):RESULTS.append(self.exercise('route-changed'))
    def test_partial_transfer(self):RESULTS.append(self.exercise('partial-transfer'))
    def test_tampered_source(self):RESULTS.append(self.exercise('source-tampered'))
    def test_tampered_bundle(self):RESULTS.append(self.exercise('bundle-tampered'))
    def test_substitution_after_snapshot(self):RESULTS.append(self.exercise('snapshot-substitution'))
RESULTS=[]
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Blocks))
    if result.wasSuccessful():
        (P/'PROOFS.json').write_text(json.dumps({'result':'LOCAL_LITERAL_BLOCKS_VALIDATED','tests':result.testsRun,'cases':RESULTS,'effects':'Real Bash/Python/Node FD/codec/memfd/files/export/custody; simulated SSH remote OS metadata, peer projection, Docker and SQL responses. Namespace UID0 is host user, not root. No VPS or real SQL.','preservedHistoricalPackages':True},indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful()else 1)
