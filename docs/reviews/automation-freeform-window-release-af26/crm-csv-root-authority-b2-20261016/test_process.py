"""Real subprocess chains; root/sudo and external host effects explicitly synthetic."""
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import authority as a
import integration
from test_connected import t, load
import test_connected as connected

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
BASE=REVIEW/'crm-csv-review-publication-20261016/code-sources'

class ProcessChain(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.lab=Path(self.tmp.name)
        self.fx=t.Fixture(self.lab);self.root=self.fx.root
        self.library=self.lab/'library';self.library.mkdir()
        self.now=datetime.datetime.now(datetime.timezone.utc)
        self.state=self.lab/'root-state.json';self.trigger=None
        self.closed=False
    def tearDown(self):
        if (self.lab/'processes.jsonl').exists():
            events=self.processes()
            print('B2_PROCESS_EVIDENCE='+json.dumps({'case':self._testMethodName,'parentPid':os.getpid(),
                'events':events,'consumerImports':len(self.effects()),
                'requestExists':(self.root/'switch/owner-request-preflight.json').exists(),
                'proofConsumed':(self.root/'switch/owner-proof-preflight.consumed.json').exists(),
                'falseComplete':(self.fx.w/'csv-complete.receipt.private.json').exists()}))
        self.tmp.cleanup()
    def setup(self, predecessor=False, permit=None):
        f=self.fx
        for name in ('authority.py','bootstrap.py','child_transport.py','node_bootstrap.cjs'):
            source=HERE/('before_'+name if predecessor else name)
            shutil.copyfile(source,self.library/name)
        shutil.copyfile(HERE/'verified_loader.py',self.library/'verified_loader.py')
        shim=self.lab/'shim.py';node=self.lab/'node.cjs'
        config={'lab':str(self.lab),'library':str(self.library),'shim':str(shim),'node':str(node),
            'sha256':{n:hashlib.sha256((self.library/(n+'.py')).read_bytes()).hexdigest()for n in ('authority','verified_loader','child_transport')}}
        shim.write_text((HERE/'lab_shim.py').read_text().replace('CONFIG = None','CONFIG = '+repr(config)))
        node.write_text("const fs=require('node:fs'),cp=require('node:child_process');fs.appendFileSync("+json.dumps(str(self.lab/'processes.jsonl'))+",JSON.stringify({event:'node_launcher',pid:process.pid,ppid:process.ppid})+'\\n');const boot=require("+json.dumps(str(self.library/'node_bootstrap.cjs'))+");boot.run(process.argv[2],process.argv.slice(3),(command,options)=>{if(command[0]==='python'&&fs.existsSync("+json.dumps(str(self.lab/'node-change-execution'))+")){fs.writeFileSync("+json.dumps(str(f.w/'csv-execution.intent.private.json'))+",'E2 changed at Node-Python boundary');}return cp.execFileSync('/usr/bin/python3',['-I','-S',"+json.dumps(str(shim))+",...command],options);});\n")
        old=load('before_integration_process',(HERE/'before_integration.py').read_text())
        transformer=old if predecessor else integration
        files={}
        files['switch/ops.py']=transformer.operations((BASE/'ops.py.c84a5e059cbc.source').read_text())
        # Namespace and host driver injection ONLY in the authenticated fixture.
        # Functions request/record/proof/execute/bindings remain concrete.
        files['switch/ops.py']+='\nfrom lab_effects import Driver\nSystem=Driver\n'
        delegated=transformer.delegated((BASE/'delegated.py.8744ced356ca.source').read_text())
        delegated=delegated.replace("BOUND_PREPARATION = Path('/opt/re7online/backups/converta-persistent/preparations/incident-csv-operational-review-v3-20261016')",'BOUND_PREPARATION = Path('+repr(str(f.root))+')')
        mark="if __name__ == '__main__':"
        delegated=delegated.replace(mark,"from lab_effects import record as lab_record\nlab_record(__phase_authority__.root,'delegated_import')\n"+mark)
        files['switch/delegated.py']=delegated
        files['window/lab_effects.py']=(HERE/'lab_effects.py').read_text()
        files['window/restore_contract.py']='from lab_effects import validate_restore as validate\n'
        files['window/baseline_contract.py']=t.source('baseline_contract.py')
        files['switch/baseline_contract.py']=t.source('baseline_contract.py')
        files['window/ecosystem_contract.py']=t.source('ecosystem_contract.py')
        files['window/scheduled_controls.py']=t.source('scheduled_controls.py')
        files['switch/db_owner_set_gate.py']=(BASE/'db_owner_set_gate.py.ca9b0bf8ece3.source').read_text()
        files['switch/db_owner_set_observer.py']=(BASE/'db_owner_set_observer.py.ddbe29926e27.source').read_text()
        files['switch/execution-check.cjs']=transformer.execution_check((BASE/'execution-check.cjs.95aee8b54048.source').read_text())
        files['switch/close.cjs']="require('./execution-check.cjs')();module.exports='LAB_NODE_BASELINE_COMPLETE';\n"
        common={'ops':'switch/ops.py','baseline_contract':'window/baseline_contract.py','ecosystem_contract':'window/ecosystem_contract.py',
                'lab_effects':'window/lab_effects.py','restore_contract':'window/restore_contract.py','scheduled_controls':'window/scheduled_controls.py',
                'db_owner_set_gate':'switch/db_owner_set_gate.py','db_owner_set_observer':'switch/db_owner_set_observer.py'}
        manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
        for name,text in files.items():
            file=f.root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(text);meta=file.stat()
            manifest['files'][name]={'sha256':a.digest(file.read_bytes()),'uid':meta.st_uid,'mode':meta.st_mode&0o777,
                'language':'commonjs'if name.endswith('.cjs')else'python'}
            manifest['dependencies'][name]=[];manifest['imports'][name]=dict(common)
        manifest['imports']['switch/close.cjs']={'./execution-check.cjs':'switch/execution-check.cjs'}
        manifest['imports']['switch/execution-check.cjs']={'baseline_contract.py':'switch/baseline_contract.py'}
        manifest['entries']={'switch/delegated.py':'inspect','switch/close.cjs':'inspect','switch/baseline_contract.py':'inspect'}
        (f.root/'switch/scripts.sha256').write_text(''.join(row['sha256']+'  '+Path(name).name+'\n'for name,row in manifest['files'].items()if name.startswith('switch/')))
        anchor={'version':1,'preparation':str(f.root),'contractSha256':t.c.sha(f.w/'recovery-contract.private.json'),
                'policySha256':f.policy_hash,'codeManifestSha256':a.digest(a.canonical(manifest)),
                'profileSha256':{'ORIGINAL':t.c.sha(f.w/'source.profile.private.json'),'CANDIDATE':t.c.sha(f.w/'target.profile.private.json')}}
        self.bundle={'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,'anchor':anchor,'anchorSha256':a.digest(a.canonical(anchor)),
            'permit':None,'permitSha256':None,'manifest':manifest,'livePolicySha256':f.policy_hash,'livePhase':'fenced'}
        if permit:
            p={'anchorSha256':self.bundle['anchorSha256'],'preparation':str(f.root),'contractSha256':anchor['contractSha256'],
                'policySha256':f.policy_hash,'decision':'ORIGINAL','targetProfileSha256':anchor['profileSha256']['ORIGINAL'],
                'executionIntentSha256':t.c.sha(f.w/'csv-execution.intent.private.json'),'phase':'fenced','capturedUtc':self.now.isoformat()}
            self.bundle.update(permit=p,permitSha256=a.digest(a.canonical(p)))
        self.save_state()
        authority=load('lab_parent_authority',(self.library/'authority.py').read_text())
        authority.BOOTSTRAP=str(shim)
        query=lambda:authority.canonical(json.loads(self.state.read_text())['bundle'])
        self.context=authority.Context(query,now=lambda:self.now)
        transport=load('lab_parent_transport',(self.library/'child_transport.py').read_text())
        transport.BOOTSTRAP=str(shim);transport.NODE=str(node)
        seqsource=transformer.sequencer(t.future_sources.sequencer((REVIEW/'v4-sequencer/sequencer.py').read_text()))
        sequence=load('lab_real_bridge',seqsource,__phase_authority__=self.context)
        self.bridge=sequence.Bridge.__new__(sequence.Bridge)
        self.bridge.root=f.root;self.bridge.window=f.w;self.bridge.switch=f.root/'switch'
        self.bridge.privileged=lambda action: json.dumps({'nftables':[]})
        self.transport=transport
        self.old_transport=sys.modules.get('child_transport');sys.modules['child_transport']=transport
        self.addCleanup(lambda:sys.modules.__setitem__('child_transport',self.old_transport)if self.old_transport else sys.modules.pop('child_transport',None))
        real_run=subprocess.run
        def run(args,**kw):
            if self.trigger:self.trigger(args)
            # Always launch the real command, stdin/stdout/pipes intact.
            args=[shutil.which('node') if x=='/usr/bin/node' else x for x in args]
            return real_run(args,**kw)
        self.process_patch=patch.object(sequence.subprocess,'run',run);self.process_patch.start();self.addCleanup(self.process_patch.stop)
        return self
    def save_state(self,**kw):self.state.write_text(json.dumps(dict(bundle=self.bundle,**kw)))
    def effects(self):
        p=self.fx.w/'effects.jsonl'
        return [json.loads(x)for x in p.read_text().splitlines()]if p.exists()else[]
    def processes(self):return [json.loads(x)for x in (self.lab/'processes.jsonl').read_text().splitlines()]
    def change_execution(self):
        (self.fx.w/'csv-execution.intent.private.json').write_text(json.dumps({'admissionSha256':'E2-synthetic','automaticRetry':False}))
    def diagnostic(self):return (self.fx.w/'protocol-output.private.jsonl').read_text()
    def test_before_context_gap_reaches_child_import_and_request(self):
        self.setup(predecessor=True);self.context.start_mode(self.root/'switch')
        def change(args):
            self.trigger=None;self.change_execution()
        self.trigger=change
        # First request actually runs in B with E2. A rejects before record.
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertTrue((self.root/'switch/owner-request-preflight.json').exists())
        self.assertTrue(self.effects());self.assertIn('not JSON serializable',self.diagnostic())
    def test_execution_race_denied_before_child_import_or_request(self):
        self.setup();self.context.start_mode(self.root/'switch')
        def change(args):self.trigger=None;self.change_execution()
        self.trigger=change
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertFalse((self.root/'switch/owner-request-preflight.json').exists());self.assertEqual(self.effects(),[])
        self.assertFalse(any(x['event']=='loader_constructor'for x in self.processes()))
        self.assertIn('authority_execution_changed',self.diagnostic())
    def test_real_delegated_three_processes_and_consumption(self):
        self.setup();self.bridge.protocol('switch','preflight')
        self.assertTrue((self.root/'switch/owner-proof-preflight.consumed.json').exists())
        events=[p for p in self.processes()if p['event']=='bootstrap_complete']
        self.assertEqual(len({p['pid']for p in events}),3)
        self.assertTrue(all(p['ppid']==os.getpid()for p in events))
        r=json.loads((self.root/'switch/owner-request-preflight.json').read_text())
        self.assertEqual(r['executionIntentSha256'],t.c.sha(self.fx.w/'csv-execution.intent.private.json'))
        before=len(self.effects())
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertFalse((self.root/'switch/owner-request-preflight.renewal-0002.json').exists())
        self.assertGreaterEqual(len(self.effects()),before) # import is read, no second execute/consume.
        self.assertIn('completed_action_cannot_renew',self.diagnostic())
    def test_real_node_python_baseline_chain(self):
        self.setup()
        try:self.bridge.node('switch','close.cjs')
        except RuntimeError as e:raise AssertionError((self.fx.w/'step-output.private.jsonl').read_text())from e
        p=self.processes();self.assertTrue(any(x['kind']=='node-snapshot'for x in p if x['event']=='bootstrap_complete'))
        self.assertTrue(any(x['kind']=='python'and x['entry']=='switch/baseline_contract.py'for x in p if x['event']=='bootstrap_complete'))
        self.assertGreaterEqual(len({x['pid']for x in p}),3)
        node=next(x for x in p if x['event']=='node_launcher')
        self.assertEqual(node['ppid'],os.getpid())
        self.assertTrue(any(x['entry']=='switch/baseline_contract.py'and x['ppid']==node['pid']for x in p if x['event']=='bootstrap_complete'))
    def test_node_execution_race_denies_baseline_before_import(self):
        self.setup();(self.lab/'node-change-execution').write_text('synthetic concurrency hook')
        with self.assertRaisesRegex(RuntimeError,'step_failed'):self.bridge.node('switch','close.cjs')
        records=self.processes()
        self.assertTrue(any(x['event']=='bootstrap'and x['entry']=='switch/baseline_contract.py'for x in records))
        self.assertFalse(any(x['event']=='loader_constructor'and x['entry']=='switch/baseline_contract.py'for x in records))
        self.assertIn('authority_execution_changed',(self.fx.w/'step-output.private.jsonl').read_text())
    def test_fresh_parent_execute_detects_durable_request_execution(self):
        self.setup();script=self.root/'switch/delegated.py'
        payload=json.loads(self.bridge.run(['python3',str(script),'request','preflight',str(script.parent)]))
        self.bridge.run(['python3',str(script),'record','preflight',str(script.parent),payload['nonce']],input_text=json.dumps({'nftables':[]}))
        self.change_execution()
        context=type(self.context)(lambda:json.dumps(json.loads(self.state.read_text())['bundle']),now=lambda:self.now)
        sys.modules['lab_real_bridge'].__phase_authority__=context
        with self.assertRaises(subprocess.CalledProcessError)as error:
            self.bridge.run(['python3',str(script),'execute','preflight',str(script.parent)])
        self.assertIn('owner_proof_generation_or_configuration_drift',error.exception.stderr)
        self.assertTrue((script.parent/'owner-proof-preflight.json').exists())
        self.assertFalse((script.parent/'owner-proof-preflight.consumed.json').exists())
    def test_fresh_parent_record_detects_request_execution_drift(self):
        self.setup()
        script=self.root/'switch/delegated.py'
        payload=json.loads(self.bridge.run(['python3',str(script),'request','preflight',str(script.parent)]))
        self.change_execution()
        self.context=type(self.context)(lambda:json.dumps(json.loads(self.state.read_text())['bundle']),now=lambda:self.now)
        # New B has same static root identity but E2. The durable request E1
        # binding is checked by the concrete record() body, not only correlation.
        module=sys.modules['lab_real_bridge'];module.__phase_authority__=self.context
        with self.assertRaises(subprocess.CalledProcessError)as error:
            self.bridge.run(['python3',str(script),'record','preflight',str(script.parent),payload['nonce']],input_text=json.dumps({'nftables':[]}))
        self.assertIn('owner_request_generation_or_configuration_drift',error.exception.stderr)
        self.assertFalse((script.parent/'owner-proof-preflight.json').exists())
    def test_unauthorized_child_no_import(self):
        self.setup();bad=self.root/'switch/not-declared.py';bad.write_text('raise AssertionError("unverified import")')
        with self.assertRaisesRegex(RuntimeError,'authority_entry_denied'):self.bridge.run(['python3',str(bad)])
        self.assertEqual(self.effects(),[]);self.assertFalse((self.lab/'processes.jsonl').exists())
    def test_direct_bootstrap_undeclared_child_no_execution(self):
        self.setup();bad=self.root/'switch/not-declared.py';marker=self.lab/'forbidden-executed'
        bad.write_text('from pathlib import Path\nPath('+repr(str(marker))+').write_text("BAD")\n')
        result=subprocess.run(['/usr/bin/python3','-I','-S',str(self.lab/'shim.py'),'python','switch/not-declared.py',
            '--authority-correlation',json.dumps(self.context.correlation()),'--'],text=True,capture_output=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('authority_entry_denied',result.stderr)
        self.assertFalse(marker.exists());self.assertEqual(self.effects(),[])
    def test_forward_missing_execution_still_denied(self):
        self.setup();(self.fx.w/'csv-execution.intent.private.json').unlink()
        with self.assertRaisesRegex(RuntimeError,'authority_forward_execution_required'):
            self.context.start_mode(self.root/'switch')
        self.assertEqual(self.effects(),[])
    def test_authority_exchange_race_denied_before_import(self):
        self.setup()
        def change(args):
            self.trigger=None;self.bundle['anchor']['contractSha256']='a'*64;self.bundle['anchorSha256']=a.digest(a.canonical(self.bundle['anchor']));self.save_state()
        self.trigger=change
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertEqual(self.effects(),[]);self.assertIn('bootstrap_authority_replaced',self.diagnostic())
    def test_expired_recovery_authority_denies_child_before_import(self):
        self.setup(permit=True);p=self.bundle['permit']
        self.bundle['manifest']['entries']['switch/delegated.py']='recovery'
        self.bundle['anchor']['codeManifestSha256']=a.digest(a.canonical(self.bundle['manifest']));self.bundle['anchorSha256']=a.digest(a.canonical(self.bundle['anchor']));p['anchorSha256']=self.bundle['anchorSha256'];self.bundle['permitSha256']=a.digest(a.canonical(p));self.save_state()
        cls=type(self.context);self.context=cls(lambda:json.dumps(json.loads(self.state.read_text())['bundle']),now=lambda:self.now)
        sys.modules['lab_real_bridge'].__phase_authority__=self.context
        def expire(args):
            self.trigger=None;self.save_state(clock=(self.now+datetime.timedelta(seconds=601)).isoformat())
        self.trigger=expire
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertIn('authority_permit_expired',self.diagnostic());self.assertEqual(self.effects(),[])
    def test_lost_root_response_before_import(self):
        self.setup()
        def lost(args):self.trigger=None;self.save_state(queryLost=True)
        self.trigger=lost
        with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.bridge.protocol('switch','preflight')
        self.assertEqual(self.effects(),[]);self.assertIn('lab root response lost',self.diagnostic())
    def test_lost_execute_response_no_automatic_replay(self):
        self.setup();real=subprocess.run
        # Outer Bridge.run waits for actual execute completion; emulate only the
        # lost response AFTER that real process returns, never a mocked execute.
        self.process_patch.stop()
        calls=[]
        def lost(args,**kw):
            result=real(args,**kw)
            if 'execute'in args:
                calls.append('execute');raise subprocess.TimeoutExpired(args,1,output=result.stdout,stderr='lab lost after actual execute')
            return result
        with patch('subprocess.run',lost),self.assertRaisesRegex(RuntimeError,'protocol_failed'):
            self.bridge.protocol('switch','preflight')
        self.assertEqual(calls,['execute']);self.assertTrue((self.root/'switch/owner-proof-preflight.consumed.json').exists())
        self.assertFalse((self.fx.w/'csv-complete.receipt.private.json').exists())


def load_tests(loader,tests,pattern):
    suite=loader.loadTestsFromTestCase(ProcessChain)
    for name in ('test_original_real_checker_certificates_controls_and_replay','test_prestop_no_permit_and_no_start',
                 'test_candidate_compatible_only','test_expiry_between_api_worker_no_complete',
                 'test_authority_replacement_between_api_worker_no_complete','test_lost_start_response_no_replay_or_complete'):
        suite.addTest(connected.Connected(name))
    import test_r3
    for name in ('test_forward_real_pair_without_recovery_permit','test_forward_revalidation_after_start_intent_before_effect',
                 'test_forward_start_gate_selection_negative','test_forward_response_lost_no_replay_or_complete'):
        suite.addTest(test_r3.Forward(name))
    return suite
if __name__=='__main__':unittest.main(verbosity=2)
