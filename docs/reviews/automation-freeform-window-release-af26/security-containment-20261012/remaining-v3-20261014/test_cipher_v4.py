"""Exercise real V4 run/start/recovery with injected isolated OS/SQL bridges."""
import copy,hashlib,importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[4]
COMMON=ROOT/'docs/reviews/automation-freeform-window-release-af26/v4-sequencer';sys.path.insert(0,str(COMMON));sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parent))
from test_sequencer import FakeBridge
from baseline_contract import capture_operational
from ecosystem_contract import generate_mode
from cipher_v4 import adapter,load_seal,KEYS,PRESERVE,API,WORKER,FRONT,MODES
from cipher_consumers import CipherConsumers
SOURCE=ROOT/'local-evidence/database-authorized-window-20261013T200200Z/final-generation-extracted/incident-6683-v4-security-database-final-v4-20261013T140000Z/window/sequencer.py'
spec=importlib.util.spec_from_file_location('closed_guard_v4',SOURCE);v4=importlib.util.module_from_spec(spec);spec.loader.exec_module(v4)
os.umask(0o077)
def write(p,v):p.write_text(json.dumps(v));p.chmod(0o600)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class Bridge(FakeBridge):
    def node(self,mode,script):
        if script in ('close.cjs','open.cjs'):
            self.events.append(('node',mode,script));self.g['open']=False
            if script=='close.cjs':(self.root/mode/'drain-result.json').write_text('{}')
            return ''
        return super().node(mode,script)
    def protocol(self,mode,action):
        if action=='preflight':self.events.append(('protocol',mode,action,38));return
        return super().protocol(mode,action)
    def restore_guard(self,*args):self.g['open']=False
class Driver:
    def __init__(self,events):self.state='ORIGINAL_VERIFIED';self.events=events;self.calls=0;self.fail=None
    def classify(self,*args):return self.state
    def apply(self,*args):
        self.calls+=1;self.events.append(('cipher_sql',))
        if self.fail=='before':raise RuntimeError('sql_failure_before_commit')
        self.state='VERIFIED'
        if self.fail=='timeout':raise TimeoutError('commit_response_uncertain')
class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.b=Bridge(Path(self.tmp.name)/'fresh-review');self.b.g.update(open=False,generation=38)
        old=copy.deepcopy(self.b.old);new=copy.deepcopy(self.b.new)
        for n in (API,WORKER):
            old[n]['env'].update({k:'synthetic-preserved-'+k for k in PRESERVE});new[n]['env'].update(old[n]['env'])
            for k in KEYS:old[n]['env'][k]='synthetic-old-'+k;new[n]['env'][k]='synthetic-new-'+k
        epoch={k:'synthetic-'+k for k in ['CAMPAIGN_SEED_WRITE_EPOCH','CAMPAIGN_SEED_SECRET','CAMPAIGN_SEED_HISTORICAL_SECRET','CAMPAIGN_SEED_HISTORICAL_POLICY_FILE','CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256']}
        old[API]['env'].update(epoch);new[API]['env'].update(epoch)
        self.b.old=old;self.b.new=new
        for n in self.b.live:self.b.live[n]['cfg']=copy.deepcopy(old[n])
        for mode in MODES:
            folder=self.b.root/mode;folder.mkdir(exist_ok=True)
            before=copy.deepcopy(new)
            for n in (API,WORKER):
                for k in KEYS:before[n]['env'][k]=old[n]['env'][k]
            write(folder/'candidate.config.private.json',{'apps':list((before if mode=='return-before-commit'else new).values())})
            write(folder/'return.config.private.json',{'apps':list(old.values())})
            for name in ['candidate.ecosystem.config.cjs','return.ecosystem.config.cjs']:
                path=folder/name
                if path.exists():path.unlink() # synthetic fixture only; production generations immutable
            generate_mode(folder)
        write(self.b.window/'initial.private.json',capture_operational(self.b.guard,lambda _: 'ActiveState=inactive\nUnitFileState=enabled\n'))
        plan={'inventoryCount':11,'changes':[{}]*10,'retained':[{}]};raw=json.dumps(plan,separators=(',',':'));ph=hashlib.sha256(raw.encode()).hexdigest();write(self.b.window/'channel-plan.private.json',plan)
        sql=self.b.window/'channel-apply.private.sql';sql.write_text('synthetic-sql');sql.chmod(0o600)
        hook={'kind':'channel_cipher_with_opaque_historical_disposition','guardGeneration':38,'executionAuthorized':True,'planHash':ph,'sqlSha256':sha(sql)};write(self.b.window/'cipher-hook.private.json',hook)
        consumers={'immutable':[],'before':[],'after':[],'modeBindings':{mode:sha(self.b.root/mode/'candidate.config.private.json')for mode in MODES}};write(self.b.window/'cipher-consumers.private.json',consumers)
        names=['cipher-hook.private.json','channel-plan.private.json','channel-apply.private.sql','cipher-consumers.private.json'];write(self.b.window/'cipher-adapter-manifest.private.json',{'filesSha256':{n:sha(self.b.window/n)for n in names},'modeFiles':{mode:{n:sha(self.b.root/mode/n)for n in ['candidate.config.private.json','return.config.private.json']}for mode in MODES}})
        self.driver=Driver(self.b.events);cls=adapter(v4,self.driver,CipherConsumers(self.b.window,sha(self.b.window/'cipher-consumers.private.json')));self.s=cls(self.b)
    def tearDown(self):self.tmp.cleanup()
    def test_full_canonical_sequence_guard38_preserved(self):
        self.s.run();self.assertEqual(self.driver.calls,1);self.assertTrue(self.s.boundary.may_start_successor());self.assertEqual(self.b.guard()['generation'],38);self.assertFalse(self.b.guard()['open']);self.assertFalse(self.b.fenced)
        e=self.b.events;self.assertLess(e.index(('cipher_sql',)),next(i for i,x in enumerate(e)if x[:3]==('protocol','switch','start:'+API)))
        self.assertEqual(self.b.live[FRONT]['cfg'],self.b.old[FRONT]);self.assertEqual(self.b.live[API]['cfg']['env']['DATABASE_URL'],self.b.old[API]['env']['DATABASE_URL'])
    def test_commit_timeout_no_successor_no_replay_then_inspection(self):
        self.driver.fail='timeout'
        with self.assertRaises(RuntimeError):self.s.run()
        self.assertEqual(self.driver.calls,1);self.assertEqual(set(self.b.live),{FRONT});self.assertFalse(self.s.boundary.may_start_successor())
        with self.assertRaises(RuntimeError):self.s.recover()
        self.s.boundary.record_verified_observation(lambda:{'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False})
        self.s.recover();self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[API]['cfg']['env'][KEYS[0]],'synthetic-new-'+KEYS[0])
    def test_before_commit_intent_requires_observed_original(self):
        self.driver.fail='before'
        with self.assertRaises(RuntimeError):self.s.run()
        self.assertEqual(set(self.b.live),{FRONT});self.s.boundary.record_original_observation(lambda:self.driver.classify())
        self.s.recover();self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[API]['cfg']['env'][KEYS[0]],'synthetic-old-'+KEYS[0])
        self.assertEqual(self.b.live[API]['cfg']['env']['APP_AUTH_SECRET'],'synthetic-preserved-APP_AUTH_SECRET')
    def test_successor_failure_uses_new_cipher_return(self):
        self.b.fail_action='switch:start:'+API
        with self.assertRaises(RuntimeError):self.s.run()
        self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[API]['cfg']['env'][KEYS[0]],'synthetic-new-'+KEYS[0])
    def test_manifest_drift_denies_before_containment(self):
        p=self.b.window/'channel-apply.private.sql';p.write_text('drift')
        with self.assertRaisesRegex(RuntimeError,'manifest_drift'):self.s.run()
        self.assertEqual(self.driver.calls,0);self.assertFalse(any(e==('privileged','enter')for e in self.b.events))
    def test_hook_execution_false_denies_before_sql(self):
        hook=self.b.window/'cipher-hook.private.json';v=json.loads(hook.read_text());v['executionAuthorized']=False;write(hook,v)
        manifest=self.b.window/'cipher-adapter-manifest.private.json';v=json.loads(manifest.read_text());v['filesSha256'][hook.name]=sha(hook);write(manifest,v)
        with self.assertRaisesRegex(RuntimeError,'execution_not_authorized'):self.s.run()
        self.assertEqual(self.driver.calls,0);self.assertFalse(self.b.fenced)
    def test_false_gates_deny_before_sql(self):
        write(self.b.window/'execution-gates.private.json',{k:False for k in json.loads((self.b.window/'execution-gates.private.json').read_text())})
        with self.assertRaises(RuntimeError):self.s.run()
        self.assertEqual(self.driver.calls,0)
    def test_wrong_return_cipher_denies_before_containment(self):
        f=self.b.root/'return'/'candidate.config.private.json';v=json.loads(f.read_text());v['apps'][0]['env'][KEYS[0]]='synthetic-old-'+KEYS[0];write(f,v)
        with self.assertRaises(RuntimeError):self.s.run()
        self.assertEqual(self.driver.calls,0)
    def test_incomplete_exit_denies_before_intent(self):
        self.s.capture_baseline();self.s.load_cipher();self.b.fenced=True
        with self.assertRaisesRegex(RuntimeError,'old_exit'):self.s.start_pair('switch')
        self.assertFalse((self.b.window/'credential-commit.intent.private.json').exists());self.assertEqual(self.driver.calls,0)
if __name__=='__main__':unittest.main()
