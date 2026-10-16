"""Affected recovery interfaces on complete synthetic canonical fixtures.
Root transport/clock, OS effects and the factory of the start gate are simulated;
Recovery, original checker, certificates, start barriers and controls are real.
"""
import datetime
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import authority as a
import integration

HERE=Path(__file__).resolve().parent
ACCEPTED=HERE.parent/'crm-csv-integrated-recovery-20261016'
sys.path.insert(0,str(ACCEPTED))
import test_recovery as t


def load(name,text,**values):
    m=types.ModuleType(name);m.__dict__.update(values);sys.modules[name]=m
    exec(compile(text,name,'exec'),m.__dict__);return m

class Connected(unittest.TestCase):
    def setUp(self):
        self.old_modules=dict(sys.modules);self.old_ops=t.ops;self.old_bindings=t.binding_consumers
        self.temp=tempfile.TemporaryDirectory();self.fx=t.Fixture(Path(self.temp.name))
        self.now=datetime.datetime.now(datetime.timezone.utc)
        self.authority_replacement=False;self.query_lost=False
    def tearDown(self):
        t.ops=self.old_ops;t.binding_consumers=self.old_bindings
        for n in ('recovery','recovery_bridge','recovery_start','ops','csv_start_gate'):
            if n in self.old_modules:sys.modules[n]=self.old_modules[n]
            else:sys.modules.pop(n,None)
        self.temp.cleanup()
    def connect(self,decision):
        f=self.fx
        if decision!='PRESTOP':f.stopped()
        if decision=='CANDIDATE':f.selected()
        texts={n:(ACCEPTED/n).read_text()for n in ('recovery.py','recovery_bridge.py','recovery_start.py')}
        texts['recovery.py']=integration.recovery(texts['recovery.py'])
        texts['recovery_bridge.py']=integration.bridge(texts['recovery_bridge.py'])
        texts['recovery_start.py']=integration.gate(texts['recovery_start.py'])
        for n,v in texts.items():(f.w/n).write_text(v)
        baseops=t.source('operations_recovery_original.py')
        # No final predicate is mocked; append the actual binding consumer.
        bindings={}
        for mode in t.c.MODES:
            v=t.future_sources.operations(t.prevent.operations(t.source('operations_bindings_original.py')),mode)
            if mode==t.c.ORIGINAL:v=v.replace('return original_bindings(window, config)','return original_bindings(window, config, __phase_authority__)')
            bindings[mode]=v
            (f.root/mode/'ops.py').write_text(integration.operations(baseops+'\n'+v))
        # Re-seal ONLY synthetic files: real canonical R2 checker consumes them.
        mm=t.c.read(f.w/'mode-manifest-v4.json')
        for mode,files in mm['modeFiles'].items():
            mm['modeFiles'][mode]={n:t.c.sha(f.root/mode/n)for n in files}
            (f.root/mode/'scripts.sha256').write_text(''.join(t.c.sha(f.root/mode/n)+'  '+n+'\n'for n in files))
            mm['modeManifests'][mode]=t.c.sha(f.root/mode/'scripts.sha256')
        (f.w/'mode-manifest-v4.json').write_text(json.dumps(mm))
        seal=t.c.read(f.w/'recovery-contract.private.json')
        seal['codeSha256']={n:t.c.sha(f.w/n)for n in seal['codeSha256']}
        wm=t.c.read(f.w/'sequencer-manifest.json');wm['filesSha256']=seal['codeSha256'];(f.w/'sequencer-manifest.json').write_text(json.dumps(wm))
        seal['filesSha256']={n:t.c.sha(f.root/n)for n in seal['filesSha256']}
        review=f.root/'original-preparation-review.sha256'
        rows=[line.split('  ',1)[1]for line in review.read_text().splitlines()]
        review.write_text(''.join(t.c.sha(f.root/n)+'  '+n+'\n'for n in rows))
        seal['originalReviewSha256']=t.c.sha(review);seal['originalSequencerManifestSha256']=t.c.sha(f.w/'sequencer-manifest.json')
        (f.w/'recovery-contract.private.json').write_text(json.dumps(seal));f.digest=t.c.sha(f.w/'recovery-contract.private.json')
        raw=(f.w/'recovery.py').read_bytes();meta=(f.w/'recovery.py').stat()
        manifest={'files':{'window/recovery.py':{'sha256':a.digest(raw),'language':'python','uid':meta.st_uid,'mode':meta.st_mode&0o777}},'dependencies':{'window/recovery.py':[]},'imports':{},'entries':{'window/recovery.py':'inspect'}}
        anchor={'version':1,'preparation':str(f.root),'contractSha256':f.digest,'policySha256':f.policy_hash,
            'codeManifestSha256':a.digest(a.canonical(manifest)),
            'profileSha256':{'ORIGINAL':t.c.sha(f.w/'source.profile.private.json'),'CANDIDATE':t.c.sha(f.w/'target.profile.private.json')}}
        self.permit=None if decision=='PRESTOP'else{'anchorSha256':a.digest(a.canonical(anchor)),
            'preparation':str(f.root),'contractSha256':f.digest,'policySha256':f.policy_hash,
            'decision':decision,'targetProfileSha256':anchor['profileSha256'][decision],
            'executionIntentSha256':t.c.sha(f.w/'csv-execution.intent.private.json'),
            'phase':'fenced','capturedUtc':self.now.isoformat()}
        if self.permit:(f.w/'recovery-policy-permit.private.json').write_bytes(a.canonical(self.permit))
        def query():
            if self.query_lost:raise TimeoutError('synthetic query response lost')
            permit=self.permit
            if self.authority_replacement:
                permit=dict(permit,capturedUtc=(self.now+datetime.timedelta(seconds=1)).isoformat())
            return a.canonical({'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,
                'anchor':anchor,'anchorSha256':a.digest(a.canonical(anchor)),'manifest':manifest,
                'permit':permit,'permitSha256':None if permit is None else a.digest(a.canonical(permit)),
                'livePolicySha256':f.policy_hash,'livePhase':'fenced'if f.fenced else'complete'})
        self.context=a.Context(query,now=lambda:self.now)
        rb=load('recovery_bridge',texts['recovery_bridge.py'])
        f.b.phase_authority=self.context
        for name in ('verify_recovery_policy','verify_original_artifact_and_bindings'):
            setattr(f.b,name,types.MethodType(getattr(rb.Bridge,name),f.b))
        future=load('recovery',texts['recovery.py'],__phase_authority__=self.context)
        self.controller=future.Recovery(f.root,f.b,t.seq.Sequencer,f.digest,self.context)
        start=load('recovery_start',texts['recovery_start.py'],__phase_authority__=self.context)
        # Only construction/OS driver is injected; actual gate/Contract revalidate.
        start.build=lambda root,authority:self.controller
        t.ops=load('ops',integration.operations(baseops),__phase_authority__=self.context)
        t.ops.System=lambda:f.d
        t.binding_consumers={m:load('future_binding_'+m.replace('-','_'),v,__phase_authority__=self.context)for m,v in bindings.items()}
        self.http=patch.object(t.seq.request,'urlopen',lambda *args,**kw:Response(f))
        self.http.start();self.addCleanup(self.http.stop)
        return self.controller
    def test_original_real_checker_certificates_controls_and_replay(self):
        controller=self.connect('ORIGINAL');self.assertEqual(controller.inspect()['options'],['ORIGINAL'])
        r=controller.recover('ORIGINAL');self.assertEqual(r['result'],'CSV_ORIGINAL_PAIR_RESTORED')
        before=list(self.fx.d.calls)
        with self.assertRaises(RuntimeError):controller.recover('ORIGINAL')
        self.assertEqual(before,self.fx.d.calls)
        self.assertEqual(self.fx.crons,{'deploy':'before-deploy','system':'before-system'})
    def test_prestop_no_permit_and_no_start(self):
        controller=self.connect('PRESTOP');f=self.fx;f.save({x['name']:x for x in f.source['apps']})
        self.assertEqual(controller.recover('PRESTOP')['result'],'CSV_PRESTOP_CONTROLS_RESTORED')
        self.assertFalse(any(str(x).startswith('start:')for x in f.d.calls))
    def test_candidate_compatible_only(self):
        controller=self.connect('CANDIDATE')
        self.assertEqual(controller.inspect()['options'],['CANDIDATE'])
        with self.assertRaises(RuntimeError):controller.recover('ORIGINAL')
        self.assertEqual(controller.recover('CANDIDATE')['result'],'CSV_CANDIDATE_PAIR_RESTORED')
    def test_authority_replacement_between_api_worker_no_complete(self):
        controller=self.connect('ORIGINAL');original=self.fx.d.start
        def changed(root,name):
            original(root,name)
            if name==t.c.API:self.authority_replacement=True
        self.fx.d.start=changed
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):controller.recover('ORIGINAL')
        self.assertNotIn('start:'+t.c.WORKER,self.fx.d.calls)
        self.assertFalse((self.fx.w/'csv-recovery.receipt.private.json').exists())
    def test_expiry_between_api_worker_no_complete(self):
        controller=self.connect('ORIGINAL');original=self.fx.d.start
        def expired(root,name):
            original(root,name)
            if name==t.c.API:self.now+=datetime.timedelta(seconds=601)
        self.fx.d.start=expired
        with self.assertRaisesRegex(RuntimeError,'expired'):controller.recover('ORIGINAL')
        self.assertNotIn('start:'+t.c.WORKER,self.fx.d.calls)
    def test_lost_start_response_no_replay_or_complete(self):
        controller=self.connect('ORIGINAL');self.fx.d.fail='start-lost'
        with self.assertRaises(TimeoutError):controller.recover('ORIGINAL')
        before=list(self.fx.d.calls)
        with self.assertRaises(RuntimeError):controller.recover('ORIGINAL')
        self.assertEqual(before,self.fx.d.calls)
        self.assertFalse((self.fx.w/'csv-recovery.receipt.private.json').exists())
    def test_uncertain_selection_no_original(self):
        controller=self.connect('ORIGINAL');t.put(self.fx.w/'csv-selection.intent.private.json',{})
        self.assertEqual(controller.inspect()['options'],[])
        with self.assertRaises(RuntimeError):controller.recover('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())
    def test_old_generation_still_denied(self):
        controller=self.connect('ORIGINAL');path=self.fx.root/'switch/old-exit-confirmed.json'
        v=t.c.read(path);v['generation']=37;path.write_text(json.dumps(v))
        q=self.fx.w/'csv-imports-switch-after-exit.private.json';v=t.c.read(q);v['exitCertificateSha256']=t.c.sha(path);q.write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'guard_generation_changed'):controller.recover('ORIGINAL')

    def test_prevention_binding_still_before_effects(self):
        self.connect('PRESTOP');(self.fx.w/'path-bindings.private.json').unlink()
        original=t.pre.FS.lstat
        def fs(path):
            path=Path(path)
            if self.fx.root.parent not in path.parents and path!=self.fx.root.parent:
                import stat
                return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o755)
            return original(path)
        effects=[]
        def forbidden(*args):effects.append(args);raise AssertionError('operational factory reached')
        with patch.object(t.pre,'EVENT_SOURCE',str(self.fx.event/'policy.ts')),patch.object(t.pre.FS,'lstat',fs),patch.object(t.cli,'Bridge',forbidden),patch.object(t.cli,'Sequencer',forbidden):
            with self.assertRaises(FileNotFoundError):t.cli.main([str(self.fx.root),'--execute'])
        self.assertEqual(effects,[])
    def test_prevention_event775_still_before_effects(self):
        self.connect('PRESTOP');original=t.pre.FS.lstat
        def fs(path):
            path=Path(path)
            if path==self.fx.event:
                import stat
                return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o775)
            if self.fx.root.parent not in path.parents and path!=self.fx.root.parent:
                import stat
                return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o755)
            return original(path)
        effects=[]
        def forbidden(*args):effects.append(args);raise AssertionError('operational factory reached')
        with patch.object(t.pre,'EVENT_SOURCE',str(self.fx.event/'policy.ts')),patch.object(t.pre.FS,'lstat',fs),patch.object(t.cli,'Bridge',forbidden),patch.object(t.cli,'Sequencer',forbidden):
            with self.assertRaisesRegex(RuntimeError,'event_source_parent'):t.cli.main([str(self.fx.root),'--execute'])
        self.assertEqual(effects,[])
    def test_python_baseline_real_under_snapshot_loader(self):
        self.connect('PRESTOP');f=self.fx
        from verified_loader import Loader
        # The exact baseline/ecosystem consumers are loaded from checked bytes.
        files={'review/baseline_contract.py':t.source('baseline_contract.py'),
               'review/ecosystem_contract.py':t.source('ecosystem_contract.py')}
        m={'files':{},'dependencies':{},'entries':{'review/baseline_contract.py':'inspect'},
            'imports':{'review/baseline_contract.py':{'ecosystem_contract':'review/ecosystem_contract.py'}}}
        for name,text in files.items():
            file=f.root/name;file.parent.mkdir(exist_ok=True);file.write_text(text);meta=file.stat()
            m['files'][name]={'sha256':a.digest(text.encode()),'language':'python','uid':meta.st_uid,'mode':meta.st_mode&0o777};m['dependencies'][name]=[]
        b=dict(self.context.bundle);anchor=dict(b['anchor'],codeManifestSha256=a.digest(a.canonical(m)))
        b.update(anchor=anchor,anchorSha256=a.digest(a.canonical(anchor)),manifest=m)
        context=a.Context(lambda:a.canonical(b))
        import io
        from contextlib import redirect_stdout
        with redirect_stdout(io.StringIO())as output:
            Loader(context,'review/baseline_contract.py').execute([str(f.root),'switch'])
        self.assertIn('BASELINE_CONTRACT_PASS',output.getvalue())

class Response:
    def __init__(self,fx):self.fx=fx
    status=200
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return json.dumps({'ok':self.fx.health}).encode()

if __name__=='__main__':unittest.main(verbosity=2)
