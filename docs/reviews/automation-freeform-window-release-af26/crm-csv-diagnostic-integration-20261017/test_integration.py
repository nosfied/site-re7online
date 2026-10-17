"""Only affected source/consumer integration; no launcher, transport or VPS."""
import base64,copy,hashlib,importlib.util,json,os,pathlib,socket,struct,tempfile,types,unittest
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists());REVIEW=P.parent

def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
sources=module(ROOT/'scripts/crm_csv_diagnostic/editable_sources.py','editable_sources')
old=REVIEW/'crm-csv-postrpc-diagnostics-20261017'
manifest_raw=(old/'MANIFEST.json').read_bytes()
assert hashlib.sha256(manifest_raw).hexdigest()=='85cbcb315d6081e33aefa79036c435c270e868445c1625b27ce99319af5ee617'
manifest=json.loads(manifest_raw)

def accepted(name):
    row=manifest['files'][name];path=Path(row['source']);raw=(path if path.is_absolute()else ROOT/path).read_bytes()
    assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256']
    return raw

class Integration(unittest.TestCase):
    def exercise(self,case):
        previous=os.umask(0o077)
        try:
            with tempfile.TemporaryDirectory(prefix='re7-front-flow-')as td:
                r=Path(td);fake=r/'fs';fake.mkdir(mode=0o700)
                lab=module(old/'lab.py','accepted_fixture');apps=lab.fixture(r)
                # Only the affected frontend has two distinct representations.
                before=json.loads((fake/'home/deploy/.pm2/dump.pm2').read_bytes())[0]
                before['exec_mode']='cluster_mode';before['env']={'APP_ONLY':'SYNTHETIC_APP','PATH':'/synthetic/app-path'}
                front=next(a for a in apps if a['name']=='re7-admin-front');front['pm2_env'].update(copy.deepcopy(before))
                osenv={'OS_ONLY':'SYNTHETIC_OS','PATH':'/synthetic/daemon-path','pm2_env':json.dumps(before,sort_keys=True)}
                envfile=fake/'proc/188897/environ';envfile.write_bytes(b''.join((k+'='+v).encode()+b'\0'for k,v in osenv.items()))
                w=fake/'opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window'
                profile=json.loads((w/'source.profile.private.json').read_bytes());next(a for a in profile['apps']if a['name']=='re7-admin-front')['env']=copy.deepcopy(osenv)
                (w/'source.profile.private.json').write_text(json.dumps(profile))
                (w/'saved-dump.pm2.private.json').write_text(json.dumps([before]))
                for n in('dump.pm2','dump.pm2.bak'):(fake/'home/deploy/.pm2'/n).write_text(json.dumps([before]))
                # Fixture bindings are fixed BEFORE the negative mutations. Not operational pins.
                fixture_history={n:hashlib.sha256((w/n).read_bytes()).hexdigest()for n in('saved-dump.pm2.private.json','source.profile.private.json','db-owner-bindings.private.json')}
                if case=='profile-tampered':
                    f=w/'source.profile.private.json';f.write_bytes(f.read_bytes()+b' ')
                if case=='kernel-drift':envfile.write_bytes(b'OS_ONLY=SYNTHETIC_CHANGED\0PATH=/synthetic/daemon-path\0pm2_env='+osenv['pm2_env'].encode()+b'\0')
                if case=='projection-drift':front['pm2_env']['env']['APP_ONLY']='SYNTHETIC_CHANGED'
                blobs={n:accepted(n)for n in('read_package.py','privileged_output.source','ops.source','node_snapshot.cjs','pm2_rpc_fd.cjs')}
                inputs=sources.source_inputs();blobs['contracts.py']=inputs['contracts.py']
                runner=accepted('runner.py').decode();start=runner.index('# Inline diagnostic integration;');end=runner.index('\nINSPECT=',start)
                # Existing complete consumer definitions plus future editable source, memory only.
                runner=runner[:start]+inputs['frontier.source'].decode()+runner[end:]
                scope={'__name__':'offline_consumer_integration','__file__':'<memory only diagnostic>','BLOBS':blobs}
                exec(compile(runner,scope['__file__'],'exec'),scope)
                class FixturePath(pathlib.PosixPath):
                    def __init__(self,*args):
                        p=Path(*args)
                        if str(p).startswith(('/proc/','/home/deploy/','/opt/re7online/')):p=fake/str(p).lstrip('/')
                        super().__init__(p)
                original_load=scope['load']
                def fixture_load(name):
                    value=original_load(name)
                    if 'Path'in value:value['Path']=FixturePath
                    if name=='contracts.py':value['config_consumers'].__defaults__=(FixturePath,value['OPS'])
                    return value
                scope['load']=fixture_load;scope['Path']=FixturePath;scope['P']=FixturePath(scope['P'])
                scope['HISTORY']=fixture_history;scope['BOOT_SHA']=hashlib.sha256((fake/'proc/sys/kernel/random/boot_id').read_bytes()).hexdigest()
                # Real socket inode/metadata. Kernel peer transport and RPC execution simulated.
                with socket.socket(socket.AF_UNIX)as endpoint:
                    socketpath=fake/'home/deploy/.pm2/rpc.sock';endpoint.bind(str(socketpath))
                    class PeerTransport:
                        def __init__(self,*args):pass
                        def __enter__(self):return self
                        def __exit__(self,*args):pass
                        def settimeout(self,value):pass
                        def connect(self,path):assert Path(path)==socketpath
                        def fileno(self):return endpoint.fileno()
                        def getsockopt(self,level,opt,length):
                            assert(level,opt,length)==(socket.SOL_SOCKET,socket.SO_PEERCRED,12)
                            return struct.pack('3i',18676,os.getuid(),os.getgid())
                    scope['socket']=types.SimpleNamespace(socket=PeerTransport,AF_UNIX=socket.AF_UNIX)
                    RealCapture=scope['Capture']
                    class SyntheticRpcCapture(RealCapture):
                        def command(self,ident,argv,**kwargs):
                            assert ident=='pm2-rpc';raw=json.dumps(apps).encode();now=self.lib['utc']()
                            self.bytes(ident,argv,now,now,0,raw,b'');return raw
                    q=r/'diagnostic';q.mkdir(mode=0o700);cap=SyntheticRpcCapture(q)
                    denial=None
                    try:scope['frontend'](cap,-1)
                    except scope['DiagnosticDenied']as exc:denial=(exc.stage,exc.reason)
                rows=[json.loads(x)for x in(q/'privileged-output.private.jsonl').read_bytes().splitlines()]
                names=[x['id']for x in rows if x['event']=='command']
                self.assertLess(names.index('profile-reference-hash'),names.index('profile-reference-json')if'profile-reference-json'in names else len(names))
                expected={'profile-tampered':('profile-reference-hash','HISTORICAL_HASH_DRIFT'),'kernel-drift':('frontend-contract','CANONICAL_ENVIRONMENT_DRIFT'),'projection-drift':('frontend-contract','FRONTEND_APPLICATION_ENVIRONMENT_DRIFT')}
                if case=='valid':
                    self.assertIsNone(denial);self.assertTrue(any(x['event']=='GATE2_RPC_CONFIGURATION_PASS'for x in rows))
                    self.assertLess(names.index('profile-reference-hash'),names.index('frontend-contract'))
                    self.assertTrue('saved-dump.pm2'in names and'saved-dump.pm2.bak'in names)
                else:
                    self.assertEqual(denial,expected[case]);self.assertFalse(any(x['event']=='GATE2_RPC_CONFIGURATION_PASS'for x in rows))
                    if case=='profile-tampered':self.assertNotIn('frontend-contract',names)
                return {'case':case,'denial':denial,'sourceProfileHashBeforeUse':True,'separateRepresentations':True,'canonicalWriterAndReaders':True,'frontierSha256':hashlib.sha256(inputs['frontier.source']).hexdigest(),'adapterSha256':hashlib.sha256(inputs['contracts.py']).hexdigest()}
        finally:os.umask(previous)
    def test_valid_distinct_representations(self):RESULTS.append(self.exercise('valid'))
    def test_authenticated_profile_tampered_denies_before_comparator(self):RESULTS.append(self.exercise('profile-tampered'))
    def test_runtime_os_drift_denies(self):RESULTS.append(self.exercise('kernel-drift'))
    def test_pm2_application_projection_drift_denies(self):RESULTS.append(self.exercise('projection-drift'))

RESULTS=[]
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Integration))
    if result.wasSuccessful():(P/'PROOFS.json').write_text(json.dumps({'result':'AFFECTED_SOURCE_INTEGRATION_LOCAL_VALIDATED','tests':result.testsRun,'cases':RESULTS,'testSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'editableSourceSha256':hashlib.sha256((ROOT/'scripts/crm_csv_diagnostic/editable_sources.py').read_bytes()).hexdigest(),'real':'frontend flow, consumers/load, canonical System/Operations, stable_file/hash/JSON, socket metadata, sealed memfd, Capture/private_record and saved comparisons','simulated':'SSH absent; /proc fixtures, SO_PEERCRED projection, RPC response/process execution. No real Node/PM2/SQL command. No operational profile/pin generated.','unaffectedProofsReused':'11 reconciliation tests, previous 9 literal-block and 2 stat tests; PM2 proof reused, not rerun','noOperationalOutput':True},indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful()else 1)
