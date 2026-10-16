"""Concrete future CLI/Recovery/Sequencer/Operations/ScheduledControls; OS simulated."""
import ast
import base64
import copy
import datetime
import hashlib
import json
import os
import stat
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from inputs import source
import future_sources


def load(name, text):
    m=types.ModuleType(name);m.__file__=name;sys.modules[name]=m
    exec(compile(text,name,'exec'),m.__dict__);return m


def put(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    raw=value if isinstance(value,bytes) else (json.dumps(value)+'\n').encode()
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'wb') as f:f.write(raw)


# Prevent hidden dependence on private evidence even when invoked inside the repo.
def no_private(event,args):
    if event=='open' and args and 'local-evidence' in str(args[0]):raise AssertionError('private_evidence_forbidden')
sys.addaudithook(no_private)

base=load('baseline_contract',source('baseline_contract.py'))
pre=load('prestop_contract',source('prestop_contract.py'))
prevent=load('prevention_transform',source('prevention_sources.py'))
seq=load('sequencer',future_sources.sequencer(source('sequencer.py')))
scheduled=load('scheduled_controls',source('scheduled_controls.py'))
boundary=load('csv_boundary',source('csv_boundary.py'))
ops=load('ops',source('operations_recovery_original.py'))
ecosystem=load('ecosystem_contract',source('ecosystem_contract.py').replace("MODES = ('switch', 'return', 'return-partial')", "MODES = ('switch', 'return', 'return-partial', 'return-before-commit')"))
binding_consumers={mode:load('bindings_'+mode.replace('-','_'),future_sources.operations(
    prevent.operations(source('operations_bindings_original.py')),mode)) for mode in pre.MODES}
import recovery_contract as c
import recovery
import recovery_bridge as rb
import recovery_start
REAL_BUILD=recovery.build
import policy_proposal
contract_stub=types.ModuleType('csv_contract')
contract_stub.check=lambda *a,**kw:None  # Unaffected package/admission authority NOT certified here.
contract_stub.read=c.read;contract_stub.sha=c.sha;contract_stub.require=c.require
contract_stub.write=put
sys.modules['csv_contract']=contract_stub
check_stub=types.ModuleType('check_current');check_stub.check_current=lambda *a,**kw:None
sys.modules['check_current']=check_stub
cli=load('csv_cli',future_sources.csv_cli(prevent.csv_cli(source('csv_cli.py'))))
# Exact canonical start-gate text comes from its versioned producer literal.
producer=ast.parse(source('compose.py'))
gate_text=next(n.args[0].value for n in ast.walk(producer) if isinstance(n,ast.Call)
               and isinstance(n.func,ast.Attribute) and n.func.attr=='write_text'
               and n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str)
               and 'def authorize_start(d)' in n.args[0].value)
gate=load('csv_start_gate',future_sources.start_gate(gate_text))


class Driver:
    def __init__(self, fx):
        self.fx=fx;self.live={};self.proc={};self.next_pid=1000;self.calls=[];self.db={'otherClientBackends':0,'advisoryLocks':0}
        self.mode='switch';self.fail=None;self.restore_valid=True;self.sockets=set()
        for app in fx.source['apps']:self.add(app)
    def add(self, config):
        self.next_pid+=10;pid=self.next_pid
        self.live[config['name']]={'name':config['name'],'pid':pid,'cfg':copy.deepcopy(config),
            'pm2_env':{'status':'online','watch':False,'restart_time':0}}
        self.proc[str(pid)]={'state':'S','ticks':str(pid*10)}
        self.proc[str(pid+1)]={'state':'S','ticks':str(pid*10+1)}
    def apps(self):return list(self.live.values())
    def guard(self):return {'version':1,'open':False,'generation':38,'tasks':{},'audit':[],'ledgerFault':False}
    def identity(self,pid):return copy.deepcopy(self.proc.get(str(pid)))
    def tree(self,pid):return {str(pid):self.identity(pid),str(pid+1):self.identity(pid+1)}
    def socket_ids(self,trees):return []
    def sockets_present(self,captured):return bool(set(captured)&self.sockets)
    def containment(self,window):c.require(self.fx.fenced,'fake_fence_absent')
    def db_zero(self):return self.db
    def db_only_successor_api(self,*args):c.require(self.db=={'otherClientBackends':0,'advisoryLocks':0},'fake_api_db_owner')
    def capture_auth(self,*args):self.calls.append('preserve-current-auth-db-cipher')
    def check_config(self,app,config):c.require(app['cfg']==config,'fake_active_config_drift')
    def delete(self,name):
        self.calls.append('delete:'+name);pid=self.live.pop(name)['pid']
        self.proc.pop(str(pid),None);self.proc.pop(str(pid+1),None)
    def wait(self):pass
    def path_exists(self,path):return Path(path).is_file()
    def validate_bindings(self,window,config):return binding_consumers[self.mode].System().validate_bindings(window,config)
    def run(self,args,text=None):
        self.calls.append(tuple(args))
        if args == [ops.PM,'save']:
            self.fx.save({a['name']:a for a in c.read(self.fx.root/self.mode/'candidate.config.private.json')['apps']})
        elif args[:2] == ['install','-m']:
            # Delegated save/fallback effects in synthetic custody only; no chmod.
            (self.fx.saved/'dump.pm2.bak').write_bytes((self.fx.saved/'dump.pm2').read_bytes())
        elif args[:1] == ['cmp']:
            c.require((self.fx.saved/'dump.pm2').read_bytes()==(self.fx.saved/'dump.pm2.bak').read_bytes(),'fake_cmp')
        elif args[:4] == ['sudo','-n','nft','delete']:
            # Delegated request prepares permission; real root release is later.
            self.fx.root_calls.append('delegated-unfence-permit')
        else:raise AssertionError('unexpected_driver_effect:'+repr(args))
        return ''
    def start(self,root,name):
        self.calls.append('start:'+name)
        if self.fail=='start-before':raise RuntimeError('injected_start_before')
        config=next(a for a in c.read(root/'candidate.config.private.json')['apps'] if a['name']==name)
        self.add(config)
        if self.fail=='start-lost':raise TimeoutError('injected_start_response_lost')


class Fixture:
    def __init__(self, root):
        self.root=root/'case';self.w=self.root/'window';self.w.mkdir(parents=True)
        self.source={'apps':[]};self.target=None;self.fenced=True;self.crons={'deploy':'window-deploy','system':'window-system'}
        self.supervision='ActiveState=inactive\nUnitFileState=disabled\n';self.fail=None;self.root_calls=[];self.admissions=0;self.health=True
        for name in (c.API,c.WORKER,c.FRONT):
            folder=root/name;folder.mkdir();put(folder/'dist/index.js',b'// synthetic runtime\n')
            self.source['apps'].append({'name':name,'cwd':str(folder),'script':str(folder/'dist/index.js'),
                'interpreter':'/synthetic/node','watch':False,'env':{'CAMPAIGN_BUILD_ID':'synthetic-current',
                'DATABASE_URL':'synthetic-NEWDB','PORT':'3001','ADMIN_TOKEN':'synthetic-NEWauth',
                'DEDICATED_CIPHER':'synthetic-NEWcipher',
                'WHATSAPP_WEB_WORKER_CONTROL_HOST':'127.0.0.1','WHATSAPP_WEB_WORKER_CONTROL_PORT':'3500',
                'WHATSAPP_WEB_WORKER_CONTROL_TOKEN':'synthetic-NEWauth'}})
        self.target=copy.deepcopy(self.source);a=self.target['apps'][0];folder=root/'candidate';folder.mkdir();put(folder/'dist/index.js',b'// synthetic candidate\n')
        a['cwd']=str(folder);a['script']=str(folder/'dist/index.js')
        put(self.w/'source.profile.private.json',self.source);put(self.w/'target.profile.private.json',self.target)
        for mode in c.MODES:
            put(self.root/mode/'plan.private.json',{'mode':mode,'direction':mode,'recovery':mode!='switch'})
            put(self.root/mode/'candidate.config.private.json',self.source if mode==c.ORIGINAL else self.target)
            put(self.root/mode/'return.config.private.json',self.source if mode in ('switch',c.ORIGINAL) else self.target)
        for name,value in [('deploy.crontab.before','before-deploy'),('deploy.crontab.window','window-deploy'),
                           ('re7-converta-backup.before','before-system'),('re7-converta-backup.window','window-system')]:put(self.w/name,value.encode())
        put(self.w/'initial.private.json',{'guard':{'open':False,'generation':38,'tasks':0,'ledgerFault':False},'supervision':'ActiveState=inactive\nUnitFileState=enabled\n','observedGuardOpen':False,'observedUtc':'2026-10-16T00:00:00+00:00'})
        put(self.w/'path-bindings.private.json',{});put(self.w/'original-bindings/path-bindings.private.json',{})
        put(self.w/'db-owner-bindings.private.json',{'apiHttpPort':3001})
        self.event=root/'events';self.event.mkdir(mode=0o700);put(self.event/'policy.ts',b'// synthetic previous Event source\n')
        put(self.w/'event-consumer-binding.private.json',{'path':str(self.event/'policy.ts')})
        self.d=Driver(self)
        put(self.w/'csv-baseline.private.json',{'apps':{n:{'pid':a['pid'],'identity':self.d.identity(a['pid'])} for n,a in self.d.live.items()}})
        put(self.w/'csv-execution.intent.private.json',{'reviewed':'synthetic-explicit-admission'})
        gates={k:True for k in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')}
        put(self.w/'execution-gates.private.json',gates);put(self.root/'execution-authorized',b'true\n')
        # Synthetic fixture contains the exact delivered/transformed consumer code,
        # not empty files standing in for a complete future operational package.
        code = {name:(Path(__file__).parent/name).read_text() for name in
                ('recovery.py','recovery_contract.py','recovery_bridge.py','recovery_start.py')}
        code.update({'csv_start_gate.py':future_sources.start_gate(gate_text),'csv_cli.py':future_sources.csv_cli(prevent.csv_cli(source('csv_cli.py'))),
                     'csv_boundary.py':source('csv_boundary.py'),'prestop_contract.py':source('prestop_contract.py'),
                     'sequencer.py':future_sources.sequencer(source('sequencer.py')),
                     'baseline_contract.py':source('baseline_contract.py'),'scheduled_controls.py':source('scheduled_controls.py'),
                     'original_checks.py':(Path(__file__).parent/'original_checks.py').read_text(),
                     'ecosystem_contract.py':source('ecosystem_contract.py').replace("MODES = ('switch', 'return', 'return-partial')", "MODES = ('switch', 'return', 'return-partial', 'return-before-commit')")})
        for name,text in code.items():put(self.w/name,text.encode())
        original_code={'ops.py':source('operations_recovery_original.py')+'\n'+future_sources.operations(
                       prevent.operations(source('operations_bindings_original.py')),c.ORIGINAL),
                       'csv_start_gate.py':future_sources.start_gate(gate_text)}
        for name,text in original_code.items():put(self.root/c.ORIGINAL/name,text.encode())
        checks=''.join(c.sha(self.root/c.ORIGINAL/name)+'  '+name+'\n' for name in original_code)
        put(self.root/c.ORIGINAL/'scripts.sha256',checks.encode())
        names={mode:list(original_code) for mode in c.MODES}
        manifest={'modeFiles':{mode:{name:c.sha(self.root/c.ORIGINAL/name) for name in original_code} for mode in c.MODES},
                  'modeManifests':{mode:c.sha(self.root/c.ORIGINAL/'scripts.sha256') for mode in c.MODES}}
        put(self.w/'mode-names.private.json',names);put(self.w/'mode-manifest-v4.json',manifest)
        refs=['window/mode-names.private.json','window/mode-manifest-v4.json','window/source.profile.private.json','window/target.profile.private.json','window/csv-baseline.private.json','window/initial.private.json',
              'window/deploy.crontab.before','window/deploy.crontab.window','window/re7-converta-backup.before','window/re7-converta-backup.window']
        refs += [m+'/'+n for m in c.MODES for n in ('plan.private.json','candidate.config.private.json','return.config.private.json')]
        seal={'version':1,'codeSha256':{name:c.sha(self.w/name) for name in code},'filesSha256':{f:c.sha(self.root/f) for f in refs},'sourceProfileSha256':c.sha(self.w/'source.profile.private.json'),
              'targetProfileSha256':c.sha(self.w/'target.profile.private.json'),'preservedCredentials':['NEWauth','NEWDB','NEWcipher'],
              'originalBindingsSha256':c.sha(self.w/'original-bindings/path-bindings.private.json'),
              'eventSource':{'path':str(self.event/'policy.ts'),'beforeSha256':c.sha(self.event/'policy.ts')},
              'sourceScriptSha256':{a['name']:c.sha(a['script']) for a in self.source['apps']}}
        put(self.w/'recovery-contract.private.json',seal);self.digest=c.sha(self.w/'recovery-contract.private.json')
        self.saved=root/'saved';self.saved.mkdir()
        self.policy={'preparation':str(self.root),'sourceProcesses':{a['name']:{} for a in self.source['apps']},'targetProcesses':{'switch':self.targets(self.target),'return':self.targets(self.target)}}
        self.install_policy(self.source)
        self.canonical_package()
        fx=self
        class B(rb.Bridge):
            # Only host path admission/OS effects differ; all recovery readers below are real.
            def __init__(self):self.root=fx.root;self.window=fx.w;self.switch=fx.root/'switch';self.recovery_policy_hash=fx.policy_hash;self.SAVED_ROOT=fx.saved
            def apps(self):return fx.d.live
            def identity(self,pid):return fx.d.identity(pid)
            def guard(self):return fx.d.guard()
            def app_matches(self,name,config):
                if name not in fx.d.live:return False
                try:ops.Operations(fx.root/'switch',fx.d).config(fx.d.live[name],config[name]);return True
                except (RuntimeError,KeyError):return False
            def run(self,args,*,input_text=None,cwd=None):
                if args==['crontab','-l']:return fx.crons['deploy']
                if args==['cat',scheduled.SYSTEM_CRON]:return fx.crons['system']
                if args==['crontab','-']:
                    fx.root_calls.append('restore-deploy-cron')
                    if fx.fail=='deploy-cron':raise RuntimeError('injected_deploy_cron_failure')
                    fx.crons['deploy']=input_text;return ''
                if args[0]=='systemctl':return fx.supervision
                if args[0]=='docker':return str(fx.admissions)
                raise AssertionError('unexpected_OS_command:'+repr(args))
            def privileged(self,action):
                fx.root_calls.append(action)
                if action=='check-present':c.require(fx.fenced,'fake_not_fenced')
                elif action=='check-absent':c.require(not fx.fenced,'fake_still_fenced')
                elif action=='abort-prestop':
                    fx.fenced=False;fx.crons['system']='before-system';fx.supervision='ActiveState=inactive\nUnitFileState=enabled\n'
                    if fx.fail=='abort-lost':raise TimeoutError('injected_abort_response_lost')
                elif action=='authorize-return':
                    profile=fx.source if self.expected_config(fx.active_mode,'candidate.config.private.json')=={a['name']:a for a in fx.source['apps']} else fx.target
                    c.require(fx.policy['targetProcesses']['return']==fx.targets(profile),'fake_root_target_mismatch')
                elif action=='restore-controls':fx.crons['system']='before-system';fx.supervision='ActiveState=inactive\nUnitFileState=enabled\n'
                else:raise AssertionError('unexpected_root_action:'+action)
                return '{}'
            def node(self,mode,script):
                fx.root_calls.append('node:'+script)
                c.require(script in ('validate.cjs','open.cjs'),'unexpected_node_effect')
                c.require(fx.health,'injected_http_db_health_failure')
                if script=='validate.cjs':c.require(not fx.fenced,'HTTP_must_be_after_unfence')
            def protocol(self,mode,action):
                rb.authorize_protocol(mode,action)
                fx.active_mode=mode;fx.d.mode=mode
                op=ops.Operations(fx.root/mode,fx.d)
                if action in ('recover-partial','stop-pair'):
                    op.stop(recovery=action=='recover-partial');fx.exit_imports(mode)
                elif action.startswith('start:'):op.start(action.split(':',1)[1])
                elif action=='unfence':
                    controls=ops.Controls.__new__(ops.Controls)
                    controls.root=fx.root/mode;controls.window=fx.w;controls.d=fx.d
                    controls.unfence()  # Exact real consumer, OS effects intercepted by Driver.run.
                    put(fx.root/mode/'owner-unfence-authorized.json',{'synthetic':True})
                elif action=='verify-unfenced':c.require(not fx.fenced and fx.health,'post_unfence_http_db_failure')
                elif action=='restore-controls':self.scheduled_controls().restore_deploy()
                else:raise AssertionError('unexpected_protocol:'+action)
            def pre_unfence(self,mode):
                fx.root_calls.append('pre-unfence')
                return super().pre_unfence(mode)  # Exact marker/config/HTTP predicate.
            def capture_worker_before_unfence(self,mode,app,config):
                # OS /proc/socket capture alone simulated; no historical capture reused.
                fx.root_calls.append('capture-worker-before-unfence')
                c.require(self.identity(app['pid']) is not None,'fake_worker_capture_identity')
            def renewed_unfence(self,mode):
                fx.root_calls.append('unfence');fx.fenced=False
                if fx.fail=='unfence-lost':raise TimeoutError('injected_unfence_response_lost')
        self.b=B();self.active_mode=c.ORIGINAL
        self.controller=recovery.Recovery(self.root,self.b,seq.Sequencer,self.digest)
        binding=load('recovery_binding',future_sources.binding_source(self.digest,self.policy_hash,c.sha(self.w/'recovery-policy-permit.private.json')))
        ops.System=lambda:self.d
        self.restore=types.ModuleType('restore_contract')
        def restore_validate(path):c.require(self.d.restore_valid,'injected_restore_authority_invalid');return {'result':'PREVIOUS_RESTORE_AUTHORITY_INJECTED'}
        self.restore.validate=restore_validate;sys.modules['restore_contract']=self.restore
    def canonical_package(self):
        # Complete static canonical inputs, synthetic profiles/data; real checker.
        front=next(a for a in self.source['apps'] if a['name']==c.FRONT)
        put(Path(front['cwd'])/'.next/BUILD_ID',b'synthetic-front\n')
        baseline={'auth':[],'connected':[],'flags':[],'frontendBuild':'synthetic-front','observedAt':'2026-10-16T00:00:00+00:00'}
        mm={'modeFiles':{},'modeManifests':{}};names={}
        original=self.root/c.ORIGINAL
        ops_text=(original/'ops.py').read_bytes();gate_raw=(original/'csv_start_gate.py').read_bytes()
        for mode in c.MODES:
            d=self.root/mode
            if mode!=c.ORIGINAL:
                put(d/'ops.py',ops_text);put(d/'csv_start_gate.py',gate_raw)
            put(d/'baseline.private.json',baseline)
            ecosystem.generate_mode(d)
            files=['ops.py','csv_start_gate.py','baseline.private.json','plan.private.json',
                   'candidate.config.private.json','return.config.private.json',
                   'candidate.ecosystem.config.cjs','return.ecosystem.config.cjs']
            mm['modeFiles'][mode]={n:c.sha(d/n) for n in files};names[mode]=files
            (d/'scripts.sha256').write_text(''.join(c.sha(d/n)+'  '+n+'\n' for n in files)) if (d/'scripts.sha256').exists() else put(d/'scripts.sha256',''.join(c.sha(d/n)+'  '+n+'\n' for n in files).encode())
            mm['modeManifests'][mode]=c.sha(d/'scripts.sha256')
        (self.w/'mode-names.private.json').write_text(json.dumps(names))
        (self.w/'mode-manifest-v4.json').write_text(json.dumps(mm))
        refs=[{'path':a['script'],'uid':os.getuid(),'mode':0o600,'sha256':c.sha(a['script'])} for a in self.source['apps']]
        refs.append({'path':str(self.event/'policy.ts'),'uid':os.getuid(),'mode':0o600,'sha256':c.sha(self.event/'policy.ts')})
        spec={'immutable':refs,'sourcePolicySha256':'fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251',
              'remotePreparation':str(self.root),'sourceProfileSha256':c.sha(self.w/'source.profile.private.json'),
              'targetProfileSha256':c.sha(self.w/'target.profile.private.json')}
        put(self.w/'csv-contract.private.json',spec)
        seal=c.read(self.w/'recovery-contract.private.json')
        wm={'preparation':str(self.root),'filesSha256':seal['codeSha256']}
        put(self.w/'sequencer-manifest.json',wm)
        review=list(seal['filesSha256'])+['window/csv-contract.private.json','window/sequencer-manifest.json',
                'window/original-bindings/path-bindings.private.json','window/db-owner-bindings.private.json',
                'window/event-consumer-binding.private.json']
        review += [m+'/'+n for m,files in mm['modeFiles'].items() for n in files]
        review += [m+'/scripts.sha256' for m in c.MODES]
        put(self.root/'original-preparation-review.sha256',''.join(c.sha(self.root/n)+'  '+n+'\n' for n in sorted(set(review))).encode())
        seal['filesSha256']={n:c.sha(self.root/n) for n in seal['filesSha256']}
        seal['originalCanonicalSha256']=c.sha(self.w/'csv-contract.private.json')
        seal['originalSequencerManifestSha256']=c.sha(self.w/'sequencer-manifest.json')
        seal['originalReviewSha256']=c.sha(self.root/'original-preparation-review.sha256')
        (self.w/'recovery-contract.private.json').write_text(json.dumps(seal))
        self.digest=c.sha(self.w/'recovery-contract.private.json')
    def targets(self,profile):return {a['name']:{'cwd':a['cwd'],'script':a['script'],'sha256':c.sha(a['script'])} for a in profile['apps'] if a['name'] in (c.API,c.WORKER)}
    def install_policy(self,profile):
        # Synthetic fixture setup only: never invokes an installer or edits a real policy.
        self.policy['targetProcesses']['return']=self.targets(profile)
        path=self.w/'privileged-policy.private.json'
        if path.exists():path.write_text(json.dumps(self.policy)+'\n')
        else:put(path,self.policy)
        self.policy_hash=c.sha(path)
        sidecar=self.w/'privileged-policy.sha256'
        if sidecar.exists():sidecar.write_text(self.policy_hash)
        else:put(sidecar,self.policy_hash.encode())
        proof={'policySha256':self.policy_hash,'phase':'fenced','targetProfileSha256':c.sha(self.w/('source.profile.private.json' if profile==self.source else 'target.profile.private.json')),
               'capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        path=self.w/'recovery-policy-permit.private.json'
        if path.exists():path.write_text(json.dumps(proof)+'\n')
        else:put(path,proof)
        if hasattr(self,'b'):self.b.recovery_policy_hash=self.policy_hash
        if 'recovery_binding' in sys.modules:
            sys.modules['recovery_binding'].ROOT_POLICY_PERMIT_SHA256=c.sha(path)
            sys.modules['recovery_binding'].INSTALLED_POLICY_SHA256=self.policy_hash
    def exit_imports(self,mode):
        put(self.w/('csv-imports-'+mode+'-after-exit.private.json'),{'basis':'AUDIT_AND_EXECUTOR_EXIT','scopeComplete':True,'observationComplete':True,'underFence':True,
            'exitCertificateSha256':c.sha(self.root/mode/'old-exit-confirmed.json'),'operations':[]})
    def stopped(self):self.d.mode='switch';ops.Operations(self.root/'switch',self.d).stop();self.exit_imports('switch')
    def selected(self):
        put(self.w/'csv-selection.intent.private.json',{'targetProfileSha256':c.sha(self.w/'target.profile.private.json'),'automaticRetry':False})
        put(self.w/'csv-selection.receipt.private.json',{'result':'CSV_CANDIDATE_SELECTED','targetProfileSha256':c.sha(self.w/'target.profile.private.json'),'intentSha256':c.sha(self.w/'csv-selection.intent.private.json')})
        self.install_policy(self.target)
    def save(self,config):
        rows=[{'name':a['name'],'pm_cwd':a['cwd'],'pm_exec_path':a['script'],'env':a['env']} for a in config.values()]
        for name in ('dump.pm2','dump.pm2.bak'):
            path=self.saved/name
            if path.exists():path.write_text(json.dumps(rows)+'\n')
            else:put(path,rows)


class RecoveryTests(unittest.TestCase):
    observations=[]
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.fx=Fixture(Path(self.tmp.name));self.orig_lstat=Path.lstat
        class Response:
            status=200
            def __enter__(inner):return inner
            def __exit__(inner,*a):pass
            def read(inner):return json.dumps({'ok':self.fx.health}).encode()
        self.http=patch.object(seq.request,'urlopen',lambda *a,**kw:Response());self.http.start()
        self.build=patch.object(recovery,'build',lambda root:self.fx.controller);self.build.start()
        self.start_build=patch.object(recovery_start,'build',lambda root:self.fx.controller);self.start_build.start()
    def tearDown(self):self.start_build.stop();self.build.stop();self.http.stop();self.tmp.cleanup()
    def run_cli(self,decision):
        try:
            value=cli.main([str(self.fx.root),'--operator-recover',decision])
            self.observations.append({'test':self._testMethodName,'decision':decision,'result':value['result'],'mode':value['mode']})
            return value
        except Exception as error:
            self.observations.append({'test':self._testMethodName,'decision':decision,'denied':type(error).__name__})
            raise
    def inspect(self):
        value=cli.main([str(self.fx.root),'--inspect-readonly'])
        self.observations.append({'test':self._testMethodName,'classification':value['classification'],'options':value['options'],'mode':value['mode']})
        return value
    def assert_no_completion(self):self.assertFalse((self.fx.w/'csv-recovery.receipt.private.json').exists())
    def test_prestop_explicit_controls_closure(self):
        self.fx.save({a['name']:a for a in self.fx.source['apps']})
        self.assertEqual(self.inspect()['options'],['PRESTOP'])
        self.assertEqual(self.run_cli('PRESTOP')['result'],'CSV_PRESTOP_CONTROLS_RESTORED')
        self.assertFalse(any(x.startswith('start:') for x in self.fx.d.calls));self.assertFalse(self.fx.fenced)
    def test_stopped_original_cli_full_sequence_without_overlay(self):
        self.fx.stopped();self.assertEqual(self.inspect()['options'],['ORIGINAL'])
        result=self.run_cli('ORIGINAL');self.assertEqual(result['result'],'CSV_ORIGINAL_PAIR_RESTORED')
        self.assertEqual(self.fx.crons,{'deploy':'before-deploy','system':'before-system'})
        self.assertFalse(self.fx.fenced);self.assertEqual(self.inspect()['options'],[])
        self.assertFalse((self.fx.w/'csv-selection.intent.private.json').exists())
        self.assertNotIn('overlay',self.fx.d.calls)
    def test_uncertain_selection_never_original(self):
        self.fx.stopped();put(self.fx.w/'csv-selection.intent.private.json',{})
        self.assertEqual(self.inspect()['classification'],'UNCERTAIN_SELECTION')
        with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.run_cli('ORIGINAL')
        self.assert_no_completion()
    def test_confirmed_selection_only_candidate(self):
        self.fx.stopped();self.fx.selected();v=self.inspect()
        self.assertEqual((v['options'],v['mode']),(['CANDIDATE'],'return-partial'))
        with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.run_cli('ORIGINAL')
        self.assertEqual(self.run_cli('CANDIDATE')['result'],'CSV_CANDIDATE_PAIR_RESTORED')
    def test_candidate_api_partial_known_returns_candidate(self):
        self.fx.stopped();self.fx.selected();self.fx.d.mode='switch'
        ops.Operations(self.fx.root/'switch',self.fx.d).start(c.API)
        self.assertEqual(self.inspect()['mode'],'return-partial')
        self.assertEqual(self.run_cli('CANDIDATE')['mode'],'return-partial')
    def test_candidate_pair_known_returns_candidate(self):
        self.fx.stopped();self.fx.selected();self.fx.d.mode='switch'
        for n in (c.API,c.WORKER):ops.Operations(self.fx.root/'switch',self.fx.d).start(n)
        self.assertEqual(self.inspect()['mode'],'return')
        self.assertEqual(self.run_cli('CANDIDATE')['mode'],'return')
    def test_start_intent_without_ack_denies(self):
        self.fx.stopped();self.fx.selected();put(self.fx.root/'switch'/('start-intent-'+c.API+'.json'),{})
        self.assertEqual(self.inspect()['classification'],'UNCERTAIN_START')
        with self.assertRaises(RuntimeError):self.run_cli('CANDIDATE')
        self.assert_no_completion()
    def test_consumed_recovery_no_second_start(self):
        self.fx.stopped();self.run_cli('ORIGINAL');before=list(self.fx.d.calls)
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
        self.assertEqual(before,self.fx.d.calls)
    def test_start_lost_response_no_replay_or_false_complete(self):
        self.fx.stopped();self.fx.d.fail='start-lost'
        with self.assertRaises(TimeoutError):self.run_cli('ORIGINAL')
        self.assertIn(c.API,self.fx.d.live);self.assert_no_completion();before=list(self.fx.d.calls)
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
        self.assertEqual(before,self.fx.d.calls)
    def test_start_failure_before_effect_keeps_intent(self):
        self.fx.stopped();self.fx.d.fail='start-before'
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
        self.assertTrue((self.fx.w/'csv-recovery.intent.private.json').exists());self.assert_no_completion()
    def test_unfence_lost_response_never_complete_or_retry(self):
        self.fx.stopped();self.fx.fail='unfence-lost'
        with self.assertRaises(TimeoutError):self.run_cli('ORIGINAL')
        self.assertFalse(self.fx.fenced);self.assert_no_completion()
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
    def test_cron_failure_prevents_complete(self):
        self.fx.stopped();self.fx.fail='deploy-cron'
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
        self.assert_no_completion()
    def test_unknown_cron_denies_before_recovery_intent(self):
        self.fx.stopped();self.fx.crons['deploy']='unknown'
        with self.assertRaises(RuntimeError):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())
    def test_new_admission_denies_original(self):
        self.fx.stopped();self.fx.admissions=1
        with self.assertRaisesRegex(RuntimeError,'candidate_admission'):self.run_cli('ORIGINAL')
        self.assert_no_completion()
    def test_frontend_identity_drift_denies(self):
        self.fx.stopped();pid=self.fx.d.live[c.FRONT]['pid'];self.fx.d.proc[str(pid)]['ticks']='different'
        with self.assertRaisesRegex(RuntimeError,'frontend_identity'):self.inspect()
    def test_restore_authority_failure_denies(self):
        self.fx.stopped();self.fx.d.restore_valid=False
        with self.assertRaisesRegex(RuntimeError,'restore_authority'):self.run_cli('ORIGINAL')
        self.assert_no_completion()
    def test_db_unknown_denies_original(self):
        self.fx.stopped();self.fx.d.db['otherClientBackends']=1
        with self.assertRaisesRegex(RuntimeError,'unknown_db_owner'):self.inspect()
    def test_missing_exit_not_prestop_when_pair_stopped(self):
        self.fx.stopped();(self.fx.root/'switch/old-exit-confirmed.json').unlink()
        with self.assertRaisesRegex(RuntimeError,'prestop_process_population'):self.inspect()
    def test_wrong_decision_no_intent(self):
        with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())
    def test_missing_candidate_binding_does_not_block_original(self):
        self.fx.stopped();(self.fx.w/'path-bindings.private.json').unlink()
        self.assertEqual(self.run_cli('ORIGINAL')['result'],'CSV_ORIGINAL_PAIR_RESTORED')
    def test_root_policy_wrong_target_denies_original(self):
        self.fx.stopped();self.fx.install_policy(self.fx.target)
        with self.assertRaisesRegex(RuntimeError,'root_permit_drift|root_return_target'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())
    def test_proposal_is_return_only_delta_and_no_extra_actions(self):
        self.fx.stopped();v=self.inspect();proposal=policy_proposal.propose(self.fx.policy,self.fx.source,self.fx.targets(self.fx.source),v)
        self.assertEqual(proposal['rootAction'],'authorize-return');self.assertEqual(proposal['newPrivilegedActions'],[])
        with self.assertRaises(RuntimeError):policy_proposal.propose(self.fx.policy,self.fx.source,self.fx.targets(self.fx.source),{'classification':'UNCERTAIN_SELECTION'})
    def test_shared_binding_revalidation_at_original_start(self):
        self.fx.stopped();path=self.fx.w/'original-bindings/path-bindings.private.json'
        original=self.fx.d.start
        def changed(root,name):
            original(root,name)
            if name==c.API:path.write_text('{"drift":"unexpected"}')
        self.fx.d.start=changed
        # Canonical package validation now catches the same race earlier.
        with self.assertRaisesRegex(RuntimeError,'review_hash_drift'):self.run_cli('ORIGINAL')
        self.assert_no_completion()

    def test_binding_missing_denies_execute_before_controls(self):
        (self.fx.w/'path-bindings.private.json').unlink()
        original_stat=pre.FS.lstat
        def filesystem(path):
            path=Path(path)
            if self.fx.root.parent not in path.parents and path!=self.fx.root.parent:
                return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o755)
            return original_stat(path)
        with patch.object(pre,'EVENT_SOURCE',str(self.fx.event/'policy.ts')),patch.object(pre.FS,'lstat',filesystem):
            with self.assertRaises(FileNotFoundError):cli.main([str(self.fx.root),'--execute'])
        self.assertEqual(self.fx.root_calls,[]);self.assertEqual(self.fx.d.calls,[])

    def test_event775_denies_execute_but_original_recovers(self):
        moved=self.fx.event.with_name('event-before');self.fx.event.rename(moved)
        mask=os.umask(0)
        try:self.fx.event.mkdir(mode=0o775)
        finally:os.umask(mask)
        put(self.fx.event/'policy.ts',(moved/'policy.ts').read_bytes())
        original_stat=pre.FS.lstat
        def filesystem(path):
            path=Path(path)
            if self.fx.root.parent not in path.parents and path!=self.fx.root.parent:
                return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o755)
            return original_stat(path)
        with patch.object(pre,'EVENT_SOURCE',str(self.fx.event/'policy.ts')),patch.object(pre.FS,'lstat',filesystem):
            with self.assertRaisesRegex(RuntimeError,'event_source_parent'):cli.main([str(self.fx.root),'--execute'])
        self.assertEqual(self.fx.root_calls,[]);self.assertEqual(self.fx.d.calls,[])
        self.fx.stopped();self.assertEqual(self.run_cli('ORIGINAL')['result'],'CSV_ORIGINAL_PAIR_RESTORED')

    def test_selection_receipt_drift_no_original_fallback(self):
        self.fx.stopped();self.fx.selected()
        path=self.fx.w/'csv-selection.receipt.private.json';v=c.read(path);v['intentSha256']='0'*64;path.write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'selection_unproven'):self.inspect()
        self.assert_no_completion()

    def test_observation_race_before_original_effect_denies(self):
        self.fx.stopped();first=self.inspect();self.assertEqual(first['options'],['ORIGINAL'])
        self.fx.selected()
        with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())

    def test_original_gate_requires_explicit_recovery_intent(self):
        self.fx.stopped();self.fx.d.mode=c.ORIGINAL
        with self.assertRaises(FileNotFoundError):ops.Operations(self.fx.root/c.ORIGINAL,self.fx.d).start(c.API)
        self.assertFalse(any(x.startswith('start:') for x in self.fx.d.calls))

    def test_saved_drift_prevents_receipt(self):
        self.fx.stopped();original=self.fx.b.verify_recovery_closure
        def drift(*args,**kw):
            (self.fx.saved/'dump.pm2.bak').write_text('[]');return original(*args,**kw)
        self.fx.b.verify_recovery_closure=drift
        with self.assertRaisesRegex(RuntimeError,'saved_'):self.run_cli('ORIGINAL')
        self.assert_no_completion()

    def test_supervision_drift_prevents_receipt(self):
        self.fx.stopped();original=self.fx.b.verify_recovery_closure
        def drift(*args,**kw):
            self.fx.supervision='wrong';return original(*args,**kw)
        self.fx.b.verify_recovery_closure=drift
        with self.assertRaisesRegex(RuntimeError,'supervision'):self.run_cli('ORIGINAL')
        self.assert_no_completion()

    def test_root_permit_expired_denies_before_intent(self):
        self.fx.stopped();p=self.fx.w/'recovery-policy-permit.private.json';v=c.read(p)
        v['capturedUtc']='2000-01-01T00:00:00+00:00';p.write_text(json.dumps(v))
        sys.modules['recovery_binding'].ROOT_POLICY_PERMIT_SHA256=c.sha(p)
        with self.assertRaisesRegex(RuntimeError,'permit_stale'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())

    def test_prestop_lost_abort_preserves_intent_no_start(self):
        self.fx.fail='abort-lost'
        with self.assertRaises(TimeoutError):self.run_cli('PRESTOP')
        self.assert_no_completion();self.assertEqual(self.inspect()['options'],[])
        self.assertFalse(any(x.startswith('start:') for x in self.fx.d.calls))

    def test_recovery_reference_drift_denies_inspection(self):
        path=self.fx.root/'return/plan.private.json';path.write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'recovery_reference_drift'):self.inspect()


    def test_original_protocol_action_allowlist(self):
        for action in rb.ORIGINAL_ACTIONS:rb.authorize_protocol(c.ORIGINAL,action)
        for action in ('stop-pair','preflight','contain','start:'+c.FRONT):
            with self.assertRaisesRegex(RuntimeError,'action_denied'):rb.authorize_protocol(c.ORIGINAL,action)

    def test_policy_proposal_canonical_root_parser(self):
        helper=load('canonical_root_policy_parser',source('privileged.py'))
        profile=copy.deepcopy(self.fx.source)
        for app in profile['apps']:
            app['cwd']='/opt/re7online/releases/synthetic-current/'+app['name'];app['script']=app['cwd']+'/dist/index.js'
        targets={a['name']:{'cwd':a['cwd'],'script':a['script'],'sha256':'a'*64} for a in profile['apps'] if a['name'] in (c.API,c.WORKER)}
        fence=b'table inet synthetic_local_only {}';enc=lambda x:base64.b64encode(x).decode()
        policy={'preparation':'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-synthetic-local',
                'fenceB64':enc(fence),'fenceSha256':hashlib.sha256(fence).hexdigest(),
                'cronBeforeB64':enc(b'before'),'cronWindowB64':enc(b'window'),
                'sourceProcesses':{n:{'pid':i+10,'ticks':str(i+100)} for i,n in enumerate((c.API,c.WORKER,c.FRONT))},
                'pm2Daemon':{'pid':1,'ticks':'100'},'targetProcesses':{'switch':targets,'return':targets},
                'savedPaths':{'pm2':'/home/deploy/.pm2/dump.pm2','fallback':'/home/deploy/.pm2/dump.pm2.bak'}}
        view={'classification':'STOPPED_UNSELECTED','options':['ORIGINAL'],'mode':c.ORIGINAL}
        proposal=policy_proposal.propose(policy,profile,targets,view)
        path=Path(self.tmp.name)/'synthetic-root-policy.json';put(path,proposal['policy'])
        with patch.object(helper,'root_regular',lambda path:None):
            parsed=helper.policy_from(path)
        self.assertEqual(parsed['targetProcesses']['return'],targets)
        self.assertEqual(proposal['rootMode'],'return')
        self.assertEqual(set(proposal['policy']),set(policy))

    def test_original_code_drift_denies_before_recovery(self):
        self.fx.stopped();path=self.fx.root/c.ORIGINAL/'ops.py';path.write_text('# changed')
        with self.assertRaisesRegex(RuntimeError,'original_mode_code_hash'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())

    def test_exported_root_receipt_hash_drift_denies(self):
        self.fx.stopped();path=self.fx.w/'recovery-policy-permit.private.json';v=c.read(path);v['phase']='other';path.write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'root_export_hash'):self.run_cli('ORIGINAL')
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())

    def test_real_factory_cli_with_explicit_pins(self):
        self.fx.stopped()
        def os_bridge(root,policy_hash):
            self.assertEqual(Path(root),self.fx.root)
            self.assertEqual(policy_hash,self.fx.policy_hash)
            return self.fx.b
        with patch.object(rb,'Bridge',os_bridge),patch.object(recovery,'build',REAL_BUILD),patch.object(recovery_start,'build',REAL_BUILD):
            self.assertEqual(cli.main([str(self.fx.root),'--inspect-readonly'])['options'],['ORIGINAL'])
            result=cli.main([str(self.fx.root),'--operator-recover','ORIGINAL'])
        self.assertEqual(result['result'],'CSV_ORIGINAL_PAIR_RESTORED')

    def test_binding_source_rejects_omissions(self):
        for missing in (None,'','not-a-hash'):
            with self.assertRaisesRegex(RuntimeError,'explicit_recovery_binding_hash_required'):
                future_sources.binding_source(missing,'a'*64,'b'*64)

    def test_canonical_node_accepts_original_with_transport_only_simulated(self):
        calls=[]
        with patch.object(self.fx.b,'run',lambda args,**kw:calls.append(args) or ''):
            seq.Bridge.node(self.fx.b,c.ORIGINAL,'validate.cjs')
        self.assertEqual(calls,[['node',str(self.fx.root/c.ORIGINAL/'validate.cjs')]])
        with self.assertRaisesRegex(RuntimeError,'node_step_denied'):
            seq.Bridge.node(self.fx.b,'unknown','validate.cjs')

    def test_worker_capture_original_uses_root_return_path(self):
        self.fx.stopped();self.run_cli('ORIGINAL')
        self.fx.fenced=True
        record={'status':'running-captured','pid':self.fx.d.live[c.WORKER]['pid'],'ticks':'synthetic',
                'tree':{},'socketIds':[],'cwd':'synthetic','script':'synthetic'}
        with patch.object(self.fx.b,'worker_capture_observation',lambda *a:(record,38,('synthetic-api','1'))), \
             patch.object(self.fx.b,'private_record',lambda *a:None):
            seq.Bridge.capture_worker_before_unfence(self.fx.b,c.ORIGINAL,self.fx.d.live[c.WORKER],{})
        self.assertTrue((self.fx.root/'return/worker-before-unfence.private.json').is_file())
        self.assertFalse((self.fx.root/c.ORIGINAL/'worker-before-unfence.private.json').exists())
        self.assertEqual({m:c.root_mode(m) for m in c.MODES},
                         {'switch':'switch','return':'return','return-partial':'return','return-before-commit':'return'})
        with self.assertRaises(RuntimeError):c.root_mode('unknown')

    def test_canonical_capture_baseline_and_close_preserve_guard38(self):
        self.fx.fenced=False;self.fx.crons={'deploy':'before-deploy','system':'before-system'}
        self.fx.supervision='ActiveState=inactive\nUnitFileState=enabled\n'
        s=seq.Sequencer(self.fx.b);initial=c.read(self.fx.w/'initial.private.json')
        initial['guard']['generation']=38
        old_node=self.fx.b.node
        def node(mode,script):
            if script=='close.cjs':put(self.fx.root/mode/'drain-result.json',{'synthetic':True})
            else:old_node(mode,script)
        with patch.object(seq,'validate_preparation',lambda *a,**kw:initial), \
             patch.object(seq,'sequential',lambda value:value), \
             patch.object(self.fx.b,'node',node), \
             patch.object(self.fx.b,'protocol',lambda mode,action:None):
            s.capture_baseline();s.close_then_preflight()
        self.assertEqual(s.baseline['guardGeneration'],38)
        self.assertFalse(self.fx.b.guard()['open']);self.assertEqual(self.fx.b.guard()['generation'],38)


if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RecoveryTests))
    print(json.dumps({'passed':result.wasSuccessful(),'testMethods':result.testsRun,'tests':unittest.defaultTestLoader.getTestCaseNames(RecoveryTests),'observedTransitions':RecoveryTests.observations,'productionEffects':False}))
    sys.exit(0 if result.wasSuccessful() else 1)
