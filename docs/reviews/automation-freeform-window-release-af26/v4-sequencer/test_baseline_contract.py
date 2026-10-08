"""Contract chain uses actual modules/CLI dispatch; system effects are injected.

Argument is an attested preparation (private), never a productive application.
Only its fixed path binding is rebased into a temporary directory for isolation.
No providers, PM2 starts, nft, crontab, systemd or database are contacted.
"""
import contextlib, copy, hashlib, importlib.util, io, json, re, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import baseline_contract as contract
from sequencer import Bridge, Sequencer
from prepare_baselines import write_baselines

PACKAGE = Path(sys.argv[1]).resolve()
BOUND = re.search(r'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-[A-Za-z0-9-]+/', (PACKAGE/'switch/ops.py').read_text()).group(0).rstrip('/')

def load(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module

class Baselines(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'preparation';self.root.mkdir();self.window=self.root/'window';self.window.mkdir()
        self.guard={'version':1,'open':False,'generation':31,'tasks':{},'audit':[],'ledgerFault':None}
        self.guardfile=self.root/'ledger.json';self.guardfile.write_text(json.dumps(self.guard));self.effects=[];self.cron='before\n';self.supervision='ActiveState=inactive\nUnitFileState=enabled\n'
        self.front=self.root/'frontend';(self.front/'.next').mkdir(parents=True);(self.front/'.next/BUILD_ID').write_text('synthetic-build')
        self.config={'apps':[{'name':n,'cwd':str(self.front),'script':str(self.front/'index.js'),'interpreter':'/synthetic/node','watch':False,'env':{'CAMPAIGN_BUILD_ID':'synthetic'}}for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front')]}
        self.functional=contract.capture_functional({'flags':['tenant'],'connected':['session'],'auth':['auth']},self.front)
        self.initial=contract.capture_operational(self.readguard,self.osrun,restore_open=True)
        self.write_initial(self.initial)
        for n,v in [('deploy.crontab.before','before\n'),('deploy.crontab.window','window\n'),('re7-converta-backup.before','system\n')]: (self.window/n).write_text(v)
        (self.window/'execution-gates.private.json').write_text(json.dumps({k:True for k in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')}))
        (self.window/'sequencer-manifest.json').write_text(json.dumps({'filesSha256':{}}))
        for mode in ('switch','return','return-partial'):
            d=self.root/mode;d.mkdir()
            for n in ('ops.py','delegated.py','db_owner_set_gate.py','db_owner_set_observer.py','privileged_output.py','baseline_contract.py','execution-check.cjs','open.cjs'):
                (d/n).write_bytes((PACKAGE/mode/n).read_bytes().replace(BOUND.encode(),str(self.root).encode()))
            for n in ('candidate','return'):(d/(n+'.config.private.json')).write_text(json.dumps(self.config))
            from ecosystem_contract import generate_mode
            generate_mode(d)
            (d/'ecosystem_contract.py').write_bytes((Path(__file__).parent/'ecosystem_contract.py').read_bytes())
            (d/'baseline_contract.py').write_bytes((Path(__file__).parent/'baseline_contract.py').read_bytes())
            (d/'baseline.private.json').write_text(json.dumps(self.functional))
            (d/'plan.private.json').write_text(json.dumps({'direction':'switch'if mode=='switch'else'return','recovery':mode=='return-partial'}))
            self.manifest(d)
        self.switch_modules('switch')
    def tearDown(self):self.tmp.cleanup()
    def manifest(self,d):
        (d/'scripts.sha256').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n'for p in d.iterdir()if p.is_file()and p.name!='scripts.sha256'))
    def write_initial(self,value):(self.window/'initial.private.json').write_text(json.dumps(value))
    def readguard(self):return json.loads(self.guardfile.read_text())
    def osrun(self,args,text=None):
        if args[:2]==['systemctl','show']:return self.supervision
        if args==['crontab','-l']:return self.cron
        if args==['crontab','-']:
            self.effects.append('crontab');self.cron=text;return ''
        raise AssertionError('unexpected_external_command:'+repr(args))
    def switch_modules(self,mode):
        d=self.root/mode;sys.path.insert(0,str(d))
        self.ops=load('ops',d/'ops.py');self.delegated=load('actual_delegate_'+mode,d/'delegated.py')
        owner=self
        class Driver(self.delegated.DelegatedSystem):
            def guard(self):return owner.readguard()
            def run(self,args,text=None):return owner.osrun(args,text)
            def apps(self):return [{'name':c['name'],'pid':100+i,'pm2_env':{'pm_cwd':c['cwd'],'pm_exec_path':c['script'],'status':'online','watch':False,'restart_time':0}}for i,c in enumerate(owner.config['apps'])]
        self.driver=Driver
        # Bind only the ledger observation path; schema and proof code remain actual.
        self.ops.System.guard=lambda ignored:self.readguard()
    def bridge(self):
        owner=self
        class Chain(Bridge):
            def __init__(self):self.root=owner.root;self.window=owner.window;self.switch=owner.root/'switch'
            def privileged(self,action):
                owner.effects.append('nft-read');return json.dumps({'nftables':[]})
            def run(self,args,*,input_text=None,cwd=None):
                if args[0]=='sha256sum':return '' # File hashes are separately real in delegate.main.
                assert args[:1]==['python3']
                mode=Path(args[1]).parent.name;owner.switch_modules(mode)
                buf=io.StringIO()
                with patch.object(sys,'argv',args[1:]),patch.object(sys,'stdin',io.StringIO(input_text or '')),patch.object(owner.delegated,'DelegatedSystem',owner.driver),contextlib.redirect_stdout(buf):
                    owner.delegated.main() # Actual request/record/execute and proof consumption.
                return buf.getvalue()
        return Chain()
    def test_producer_writes_and_refuses_invalid_or_existing_baseline(self):
        (self.window/'execution-gates.private.json').write_text(json.dumps({k:False for k in json.loads((self.window/'execution-gates.private.json').read_text())}))
        with self.assertRaisesRegex(RuntimeError,'baseline_missing:operational.supervision'):write_baselines(self.root,{'guard':self.initial['guard']},self.functional)
        for p in [self.window/'initial.private.json']+[self.root/m/'baseline.private.json'for m in ('switch','return','return-partial')]:p.unlink()
        with self.assertRaisesRegex(RuntimeError,'baseline_invalid:functional.auth'):write_baselines(self.root,self.initial,self.functional|{'auth':None})
        self.assertFalse((self.window/'initial.private.json').exists())
        hashes=write_baselines(self.root,self.initial,self.functional)
        self.assertEqual(len(hashes),4);self.assertEqual(contract.validate_preparation(self.root),self.initial)
        with self.assertRaisesRegex(RuntimeError,'baseline_output_exists'):write_baselines(self.root,self.initial,self.functional)
    def test_real_chain_prepare_three_modes(self):
        gates=self.window/'execution-gates.private.json';original=gates.read_bytes()
        gates.write_text(json.dumps({k:False for k in json.loads(original)}))
        for p in [self.window/'initial.private.json']+[self.root/m/'baseline.private.json'for m in ('switch','return','return-partial')]:p.unlink()
        write_baselines(self.root,contract.capture_operational(self.readguard,self.osrun,restore_open=True),contract.capture_functional({'flags':['tenant'],'connected':['session'],'auth':['auth']},self.front))
        gates.write_bytes(original)
        for mode in ('switch','return','return-partial'):self.manifest(self.root/mode)
        for mode in ('switch','return','return-partial'):
            self.cron='before\n';self.effects=[]
            real=Path.read_bytes
            def read(p):return b'system\n'if str(p)=='/etc/cron.d/re7-converta-backup'else real(p)
            with patch.object(Path,'read_bytes',read):self.bridge().protocol(mode,'prepare-containment')
            self.assertEqual(self.cron,'window\n');self.assertEqual(self.effects,['nft-read','crontab'])
            self.assertTrue(list((self.root/mode).glob('owner-proof-*.consumed.json')))
    def test_incomplete_attempt_reproduces_legacy_keyerror(self):
        # Reverse the published minimal patch on exact sources, never mock Controls.prepare.
        d=self.root/'switch'
        patch_bound=re.search(r'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-[A-Za-z0-9-]+/', (Path(__file__).parent/'baseline-contract.patch').read_text()).group(0).rstrip('/')
        for name in ('ops.py','delegated.py','execution-check.cjs','open.cjs'):(d/name).write_bytes((PACKAGE/'switch'/name).read_bytes().replace(BOUND.encode(),patch_bound.encode()))
        subprocess.run(['patch','--batch','-R','-p0','-i',str((Path(__file__).parent/'baseline-contract.patch').resolve())],cwd=d,check=True,stdout=subprocess.DEVNULL)
        for name in ('ops.py','delegated.py','execution-check.cjs','open.cjs'):(d/name).write_bytes((d/name).read_bytes().replace(patch_bound.encode(),str(self.root).encode()))
        self.write_initial({'guard':self.initial['guard'],'observedUtc':self.initial['observedUtc']});self.manifest(d)
        self.switch_modules('switch');real=Path.read_bytes
        with patch.object(Path,'read_bytes',lambda p:b'system\n'if str(p)=='/etc/cron.d/re7-converta-backup'else real(p)):
            with self.assertRaisesRegex(RuntimeError,'protocol_failed:switch/prepare-containment/execute'):self.bridge().protocol('switch','prepare-containment')
        # Bridge.protocol logs and wraps actual CLI failure only for external subprocesses;
        # the private diagnostic records the original KeyError type.
        record=json.loads((self.window/'protocol-output.private.jsonl').read_text().splitlines()[-1]);self.assertEqual(record['errorType'],'KeyError');self.assertNotIn('crontab',self.effects)
    def test_missing_operational_denied_before_any_mutation(self):
        for field in ('guard','supervision','observedUtc','observedGuardOpen'):
            with self.subTest(field=field):
                value=copy.deepcopy(self.initial);value.pop(field);self.write_initial(value);self.effects=[]
                with self.assertRaisesRegex(RuntimeError,'baseline_missing:operational.'+field):Sequencer(self.bridge()).eligible()
                self.assertEqual(self.effects,[])
    def test_invalid_operational_types(self):
        for path,values in [(('supervision',),[None,False,'',[], 'ActiveState=active\nUnitFileState=enabled\n']), (('guard','tasks'),[None,False,'',{},[],1]),(('guard','open'),[None,0,'true']), (('guard','generation'),[None,True,-1]),(('observedUtc',),[None,'','2026-10-05'])]:
            for v in values:
                with self.subTest(path=path,value=v):
                    a=copy.deepcopy(self.initial);target=a
                    for key in path[:-1]:target=target[key]
                    target[path[-1]]=v
                    with self.assertRaisesRegex(RuntimeError,'baseline_invalid:'):contract.operational(a)
    def test_functional_invalid_before_mutation(self):
        for field in ('flags','connected','auth','frontendBuild','observedAt'):
            for value in (None,False,''):
                with self.subTest(field=field,value=value):
                    data=copy.deepcopy(self.functional);data[field]=value;(self.root/'return/baseline.private.json').write_text(json.dumps(data));self.effects=[]
                    with self.assertRaisesRegex(RuntimeError,'baseline_invalid:functional'):Sequencer(self.bridge()).eligible()
                    self.assertEqual(self.effects,[])
    def test_modes_and_frontend_drift(self):
        v=copy.deepcopy(self.functional);v['flags']=[];(self.root/'return/baseline.private.json').write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'baseline_modes_diverge'):contract.validate_preparation(self.root)
        (self.root/'return/baseline.private.json').write_text(json.dumps(self.functional));(self.front/'.next/BUILD_ID').write_text('other')
        with self.assertRaisesRegex(RuntimeError,'baseline_frontend_drift'):contract.validate_preparation(self.root)
    def test_sequencer_snapshot_types_and_json(self):
        sample={'guardGeneration':31,'apps':{n:{'pid':100+i,'identity':{'ticks':'100','state':'S'}}for i,n in enumerate(('re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'))}}
        contract.sequential(sample)
        for field,values in [('pid',[None,False,0]),('ticks',[None,False,'','²']),('state',[None,False,[], 'Z'])]:
            for value in values:
                data=copy.deepcopy(sample);process=data['apps']['re7-whatsapp-agent']
                if field=='pid':process[field]=value
                else:process['identity'][field]=value
                with self.assertRaisesRegex(RuntimeError,'baseline_invalid:sequencer.'):contract.sequential(data)
        (self.window/'initial.private.json').write_text('{broken')
        with self.assertRaisesRegex(RuntimeError,'baseline_invalid_json:operational'):contract.validate_preparation(self.root)
        (self.window/'initial.private.json').unlink()
        with self.assertRaisesRegex(RuntimeError,'baseline_missing_file:operational'):contract.validate_preparation(self.root)
    def test_node20_pre_mutation_contract(self):
        node=Path('/tmp/re7-pm2-lab/node')
        self.assertTrue(node.is_file(),'exact Node20.20.0 executable required')
        self.assertEqual(subprocess.check_output([str(node),'--version'],text=True).strip(),'v20.20.0')
        module=self.root/'switch/execution-check.cjs'
        script='require('+json.dumps(str(module))+')();console.log("READ_ONLY_GATE_PASS")'
        ok=subprocess.run([str(node),'-e',script],text=True,capture_output=True)
        self.assertEqual(ok.returncode,0,ok.stderr);self.assertIn('READ_ONLY_GATE_PASS',ok.stdout)
        self.write_initial({k:v for k,v in self.initial.items()if k!='supervision'})
        denied=subprocess.run([str(node),'-e',script],text=True,capture_output=True)
        self.assertNotEqual(denied.returncode,0);self.assertIn('baseline_missing:operational.supervision',denied.stderr)
        self.assertNotIn('READ_ONLY_GATE_PASS',denied.stdout);self.assertEqual(self.effects,[])
        invalid=self.initial.copy();invalid.pop('supervision');invalid['guard']=invalid['guard']|{'open':False};self.write_initial(invalid)
        opening=subprocess.run([str(node),str(self.root/'switch/open.cjs')],text=True,capture_output=True)
        self.assertNotEqual(opening.returncode,0);self.assertIn('baseline_missing:operational.supervision',opening.stderr)
        self.assertNotIn('preserved closed state',opening.stdout)

    def test_capture_refuses_incomplete_or_changed_observation(self):
        with self.assertRaisesRegex(RuntimeError,'baseline_invalid:operational.supervision'):contract.capture_operational(self.readguard,lambda _: '')
        calls=[]
        def changed():
            calls.append(1);return self.guard if len(calls)==1 else self.guard|{'generation':32}
        with self.assertRaisesRegex(RuntimeError,'baseline_observation_changed'):contract.capture_operational(changed,self.osrun)
    def test_return_recapture_preserves_restoration_intent(self):
        observed=contract.capture_operational(self.readguard,self.osrun,restore_open=contract.operational(self.initial)['guard']['open'])
        self.assertFalse(observed['observedGuardOpen']);self.assertTrue(observed['guard']['open']);self.assertEqual(observed['guard']['generation'],31)
        self.assertEqual(contract.validate_preparation(self.root,['return'])['supervision'],self.supervision)
    def test_finish_consumers_read_validated_operational(self):
        for mode in ('switch','return','return-partial'):
            self.switch_modules(mode)
            self.assertEqual(self.delegated.DelegatedControls(self.root/mode,self.driver(self.root/mode,'restore-controls')).initial,self.initial)
            self.write_initial(self.initial|{'supervision':False})
            with self.assertRaisesRegex(RuntimeError,'baseline_invalid:operational.supervision'):self.delegated.DelegatedControls(self.root/mode,self.driver(self.root/mode,'restore-controls'))
            self.write_initial(self.initial)
    def test_real_finish_chain_three_modes(self):
        # Actual finish/proof/config check; only /proc and PM2/systemd observations injected.
        real_bytes=Path.read_bytes;real_text=Path.read_text;real_resolve=Path.resolve
        def readbytes(p):return b'system\n'if str(p)=='/etc/cron.d/re7-converta-backup'else real_bytes(p)
        def readtext(p,*args,**kw):
            if str(p).startswith('/proc/') and p.name=='environ':return 'CAMPAIGN_BUILD_ID=synthetic\0'
            return real_text(p,*args,**kw)
        def resolve(p,*args,**kw):
            if str(p).startswith('/proc/') and p.name=='cwd':return self.front
            if str(p).startswith('/proc/') and p.name=='exe':return Path('/synthetic/node')
            return real_resolve(p,*args,**kw)
        self.guardfile.write_text(json.dumps(self.guard|{'open':True,'generation':32}))
        for mode in ('switch','return','return-partial'):
            self.cron='window\n';self.effects=[]
            (self.root/mode/'after-unfence.json').write_text(json.dumps({'workerHealth':True,'health':[{'ok':True,'db':'ok'}],'guard':{'build':'synthetic'}}))
            with patch.object(Path,'read_bytes',readbytes),patch.object(Path,'read_text',readtext),patch.object(Path,'resolve',resolve):self.bridge().protocol(mode,'restore-controls')
            self.assertEqual(self.cron,'before\n');self.assertEqual(self.effects,['nft-read','crontab'])

if __name__=='__main__':unittest.main(argv=[sys.argv[0]],verbosity=2)
