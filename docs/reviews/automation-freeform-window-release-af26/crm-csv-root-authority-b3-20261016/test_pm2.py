"""B3 concrete System/Context/Loader -> real inherited FD -> actual PM2 parser.
No daemon. Root transport/metadata/authority issue and app process effects simulated.
Run reproduce.py for a delivered-only isolated tree without local-evidence.
"""
import ast
import copy
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
import authority as a
from verified_loader import Loader
import child_transport
import integration as b2
import b3_integration as b3
import test_connected as connected
import test_r3 as r3

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
SOURCE=REVIEW/'crm-csv-review-publication-20261016/code-sources'
NODE=shutil.which('node')


def module(name, text):
    m=types.ModuleType(name);exec(compile(text,name,'exec'),m.__dict__);return m


def full_operations():
    return (SOURCE/'ops.py.c84a5e059cbc.source').read_text()


class PM2Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'prep';self.root.mkdir();self.w=self.root/'window';self.w.mkdir()
        self.now=datetime.datetime(2026,10,16,21,tzinfo=datetime.timezone.utc)
        self.manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
        self.mode='switch';self.calls=[];self.before_consume=lambda:None
        self.config={'apps':[{'name':n,'cwd':'/synthetic/'+n,'script':'/synthetic/'+n+'/main.js',
                    'interpreter':'/synthetic/node20','watch':False,'autorestart':True,
                    'env':{'NEWauth':'synthetic-auth','NEWDB':'synthetic-db','NEWcipher':'synthetic-cipher',
                           'unicode':'ação','large':'x'*140000}}
                   for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front')]}
        self.parser=b3.ecosystem((REVIEW/'v4-sequencer/ecosystem_contract.py').read_text())
        self.ec=module('synthetic_canonical_ecosystem',self.parser)
        self.ops_source=b3.operations(b2.operations(full_operations()))
        for mode in ('switch','return-before-commit','return','return-partial'):
            def name(n):return mode+'/'+n
            self.add(name('ecosystem_contract.py'),self.parser)
            self.add(name('candidate.config.private.json'),json.dumps(self.config),language='json')
            self.add(name('candidate.ecosystem.config.cjs'),self.ec.rendered(self.config).decode(),language='commonjs',entry='forward' if mode=='switch'else'recovery')
            self.add(name('pm2_input.py'),(HERE/'pm2_input.py').read_text(),imports={'ecosystem_contract':name('ecosystem_contract.py')})
            self.add(name('db_owner_set_gate.py'),(SOURCE/'db_owner_set_gate.py.ca9b0bf8ece3.source').read_text())
            self.add(name('db_owner_set_observer.py'),(SOURCE/'db_owner_set_observer.py.ddbe29926e27.source').read_text())
            self.add(name('ops.py'),self.ops_source,imports={n:name(n+'.py')for n in ('db_owner_set_gate','db_owner_set_observer','pm2_input')},entry='inspect')
            self.manifest['dependencies'][name('candidate.ecosystem.config.cjs')]=[name('candidate.config.private.json'),name('ecosystem_contract.py')]
            self.manifest['dependencies'][name('pm2_input.py')]=[name('candidate.ecosystem.config.cjs')]
        (self.w/'csv-execution.intent.private.json').write_bytes(b'synthetic-execution')
        (self.w/'recovery-contract.private.json').write_bytes(b'synthetic-contract')
        (self.w/'target.profile.private.json').write_bytes(b'synthetic-profile')
        self.anchor={'version':1,'preparation':str(self.root),'contractSha256':a.digest(b'synthetic-contract'),
            'policySha256':'1'*64,'codeManifestSha256':a.digest(a.canonical(self.manifest)),
            'profileSha256':{'ORIGINAL':'2'*64,'CANDIDATE':a.digest(b'synthetic-profile')}}
        self.reply={'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,'anchor':self.anchor,
            'anchorSha256':a.digest(a.canonical(self.anchor)),'manifest':self.manifest,'permit':None,
            'permitSha256':None,'livePolicySha256':'1'*64,'livePhase':'fenced'}
        self.alias=Path(self.temp.name)/'pm2-input.json';self.alias.symlink_to('/proc/self/fd')
        self.context=None

    def add(self,name,text,imports=None,language='python',entry=None):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
        s=p.stat();self.manifest['files'][name]={'sha256':a.digest(p.read_bytes()),'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode),'language':language}
        self.manifest['dependencies'][name]=[];self.manifest['imports'][name]=imports or{}
        if entry:self.manifest['entries'][name]=entry

    def seal_fixture(self):
        # Synthetic owner review BEFORE creation of any Context. Not operational
        # sealing or permission adjustment. Mutations later deliberately DENY.
        self.anchor['codeManifestSha256']=a.digest(a.canonical(self.manifest))
        self.reply['anchorSha256']=a.digest(a.canonical(self.anchor))

    def prepare(self,mode='switch'):
        self.mode=mode
        if mode!='switch':
            p={'anchorSha256':self.reply['anchorSha256'],'preparation':str(self.root),'contractSha256':self.anchor['contractSha256'],
                'policySha256':self.anchor['policySha256'],'phase':'fenced','decision':'ORIGINAL' if mode=='return-before-commit'else'CANDIDATE',
                'targetProfileSha256':self.anchor['profileSha256']['ORIGINAL' if mode=='return-before-commit'else'CANDIDATE'],
                'executionIntentSha256':a.digest(b'synthetic-execution'),'capturedUtc':self.now.isoformat()}
            self.reply.update(permit=p,permitSha256=a.digest(a.canonical(p)))
        self.context=a.Context(lambda:a.canonical(self.reply),now=lambda:self.now)
        self.loader=Loader(self.context,mode+'/ops.py',trusted_modules={'child_transport':child_transport})
        self.ops=self.loader.module(mode+'/ops.py');self.system=self.ops.System()
        self.system.apps=lambda:self.calls.append('daemon-presence-simulated')
        self.input=self.loader.module(mode+'/pm2_input.py');self.input.ALIAS=self.alias

    def alias_metadata(self):
        # Actual symlink and Linux FD; root owner/ancestor protection simulated.
        original=Path.lstat
        def inspect(p,*args,**kwargs):
            result=original(p,*args,**kwargs)
            if p==self.alias or p in self.alias.parents:
                row=list(result);row[4]=0
                if p!=self.alias:row[0]=stat.S_IFDIR|0o755
                return os.stat_result(row)
            return result
        return patch.object(Path,'lstat',inspect)

    def consume(self):
        original=subprocess.check_output
        def pm2(argv,**kwargs):
            self.assertEqual(argv[:2],[self.ops.PM,'start'])
            self.assertEqual(argv[3:],['--only','re7-whatsapp-agent'])
            self.assertEqual(kwargs['env'],self.ops.CLEAN)
            self.assertEqual(kwargs['pass_fds'],(int(Path(argv[2]).name),))
            fd=kwargs['pass_fds'][0]
            self.assertEqual(fcntl.fcntl(fd,fcntl.F_GET_SEALS)&self.input.SEALS,self.input.SEALS)
            self.before_consume()
            self.calls.append('actual-PM2-read-and-parser-no-daemon')
            out=original([NODE,str(HERE/'pm2_boundary.cjs'),argv[2],'re7-whatsapp-agent'],**kwargs)
            self.consumed=json.loads(out)
            return out
        with self.alias_metadata(),patch.object(self.ops.subprocess,'check_output',pm2):
            self.system.start(self.root/self.mode,'re7-whatsapp-agent')
        return self.consumed

    def test_old_cjs_replacement_executes_changed_bytes_in_actual_pm2(self):
        self.prepare()
        # Concrete original System class, not an imitation of its start method.
        tree=ast.parse(b2.operations(full_operations()))
        cls=next(c for c in tree.body if isinstance(c,ast.ClassDef)and c.name=='System')
        values=dict(self.ops.__dict__)
        exec(compile(ast.Module(body=[cls],type_ignores=[]),'original-System','exec'),values)
        old=values['System']();old.apps=lambda:None
        p=self.root/'switch/candidate.ecosystem.config.cjs'
        marker=Path(self.temp.name)/'unexpected-effect'
        original=subprocess.check_output
        def substituted(argv,**kw):
            self.assertEqual(argv,[self.ops.PM,'start',str(p),'--only','re7-whatsapp-agent'])
            p.write_text('require("fs").writeFileSync('+json.dumps(str(marker))+',"executed");module.exports={apps:[{name:"replaced"}]};')
            return original([NODE,str(HERE/'pm2_boundary.cjs'),str(p),'re7-whatsapp-agent'],**kw)
        with patch.object(self.ops.subprocess,'check_output',substituted):
            old.start(self.root/'switch','re7-whatsapp-agent')
        self.assertTrue(marker.exists())

    def test_real_system_fd_and_actual_pm2_preserve_all_fields_after_replacement(self):
        self.prepare()
        def change():
            (self.root/'switch/candidate.ecosystem.config.cjs').write_text('throw Error("untrusted CJS ran")')
            (self.root/'switch/candidate.config.private.json').write_text('{}')
        self.before_consume=change
        self.assertEqual(self.consume(),self.config['apps'])
        self.assertEqual(self.calls,['daemon-presence-simulated','actual-PM2-read-and-parser-no-daemon'])
        with self.assertRaisesRegex(RuntimeError,'source_hash'):
            self.system.start(self.root/'switch','re7-whatsapp-agent')

    def test_memfd_write_and_truncate_denied_and_fd_closed(self):
        self.prepare();fd=self.input.sealed_fd(b'{"apps":[]}')
        try:
            with self.assertRaises(PermissionError):os.write(fd,b'changed')
            with self.assertRaises(PermissionError):os.ftruncate(fd,0)
        finally:os.close(fd)
        self.consume() # exact config itself > pipe chunk; no stdin truncation

    def test_original_has_no_candidate_only_dependency(self):
        for mode in ('switch','return','return-partial'):
            for p in (self.root/mode).iterdir():p.unlink()
        self.prepare('return-before-commit')
        self.assertEqual(self.consume(),self.config['apps'])

    def test_candidate_recovery_modes_keep_specific_permit(self):
        self.prepare('return')
        self.assertEqual(self.consume(),self.config['apps'])
        self.prepare('return-partial')
        self.assertEqual(self.consume(),self.config['apps'])

    def test_original_without_permit_denies_before_pm2(self):
        self.prepare();self.mode='return-before-commit'
        with self.assertRaisesRegex(RuntimeError,'permit_required'):
            self.system.start(self.root/self.mode,'re7-whatsapp-agent')
        self.assertNotIn('actual-PM2-read-and-parser-no-daemon',self.calls)

    def test_json_cjs_mismatch_and_executable_dependency_denied(self):
        p=self.root/'switch/candidate.ecosystem.config.cjs';p.write_bytes(p.read_bytes()+b'require("unapproved")\n')
        self.manifest['files']['switch/candidate.ecosystem.config.cjs']['sha256']=a.digest(p.read_bytes());self.seal_fixture()
        self.prepare()
        with self.assertRaisesRegex(RuntimeError,'ecosystem_json_drift'):self.consume()
        self.assertNotIn('actual-PM2-read-and-parser-no-daemon',self.calls)

    def test_missing_transitive_dependency_denied_before_import(self):
        self.prepare();(self.root/'switch/ecosystem_contract.py').unlink()
        with self.assertRaises(FileNotFoundError):self.consume()
        self.assertNotIn('actual-PM2-read-and-parser-no-daemon',self.calls)

    def test_json_dependency_not_in_closure_denied(self):
        self.manifest['dependencies']['switch/candidate.ecosystem.config.cjs']=[];self.seal_fixture();self.prepare()
        with self.assertRaisesRegex(RuntimeError,'json_dependency_missing'):self.consume()

    def test_read_permission_error_denies(self):
        self.prepare();original=os.open
        def deny(p,*args,**kw):
            if str(p).endswith('candidate.config.private.json'):raise PermissionError('synthetic read denied')
            return original(p,*args,**kw)
        with patch.object(os,'open',deny),self.assertRaises(PermissionError):self.consume()

    def test_authority_changes_after_sealing_denies_closes_fd(self):
        self.prepare();original=self.input.sealed_fd;opened=[]
        def changed(raw):
            fd=original(raw);opened.append(fd);self.reply['livePolicySha256']='9'*64;return fd
        with patch.object(self.input,'sealed_fd',changed),self.assertRaisesRegex(RuntimeError,'live_policy_drift'):self.consume()
        with self.assertRaises(OSError):os.fstat(opened[0])
        self.assertNotIn('actual-PM2-read-and-parser-no-daemon',self.calls)

    def test_recovery_expiry_between_api_worker_denies(self):
        self.prepare('return-before-commit');self.consume();self.now+=datetime.timedelta(seconds=600)
        with self.assertRaisesRegex(RuntimeError,'permit_expired'):
            self.system.start(self.root/self.mode,'re7-whatsapp-web-worker')
        self.assertEqual(self.calls.count('actual-PM2-read-and-parser-no-daemon'),1)

    def test_wrong_alias_denied_before_pm2(self):
        self.prepare();self.alias.unlink();self.alias.symlink_to('/tmp')
        with self.assertRaisesRegex(RuntimeError,'root_alias'):self.consume()

    def test_unprotected_alias_owner_denied(self):
        self.prepare()
        # Direct metadata contract (no fixture override): synthetic non-root UID.
        original=Path.lstat
        def wrong(p,*args,**kw):
            s=original(p,*args,**kw);row=list(s);row[4]=1001;return os.stat_result(row)
        with patch.object(Path,'lstat',wrong),self.assertRaisesRegex(RuntimeError,'root_chain'):
            self.input.protected_alias()

    def test_lost_pm2_response_closes_fd_without_retry(self):
        self.prepare();fds=[]
        def lost(argv,**kw):
            fds.extend(kw['pass_fds']);self.calls.append('simulated-response-lost');raise subprocess.TimeoutExpired('synthetic-pm2',1)
        with self.alias_metadata(),patch.object(self.ops.subprocess,'check_output',lost),self.assertRaises(subprocess.TimeoutExpired):
            self.system.start(self.root/self.mode,'re7-whatsapp-agent')
        self.assertEqual(self.calls.count('simulated-response-lost'),1)
        with self.assertRaises(OSError):os.fstat(fds[0])

    def test_operations_barriers_and_order_unchanged(self):
        before=ast.parse(b2.operations(full_operations()));after=ast.parse(self.ops_source)
        def start(tree):return next(n for c in tree.body if isinstance(c,ast.ClassDef)and c.name=='Operations'for n in c.body if isinstance(n,ast.FunctionDef)and n.name=='start')
        self.assertEqual(ast.dump(start(before)),ast.dump(start(after)))
        self.assertLess(self.ops_source.index('self.apps()  # Never implicitly'),self.ops_source.index('from pm2_input import start'))

    def test_operations_to_system_to_actual_pm2_api_worker_order(self):
        # Concrete canonical Operations + gate + Sequencer from the accepted
        # synthetic fixture, connected to complete real System and PM2 parser.
        # Driver process/DB/HTTP/PM2 daemon results remain explicitly synthetic.
        case=r3.Forward('test_forward_real_pair_without_recovery_permit')
        case.setUp()
        try:
            f=case.prepare()
            self.root=f.root;self.w=f.w
            self.manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
            self.anchor=copy.deepcopy(case.context.bundle['anchor'])
            self.reply=copy.deepcopy(case.context.bundle)
            for n in ('db_owner_set_gate','db_owner_set_observer'):
                ref=next(SOURCE.glob(n+'.py.*.source'))
                self.add('window/'+n+'.py',ref.read_text())
            self.add('window/ecosystem_contract.py',self.parser)
            self.add('window/pm2_input.py',(HERE/'pm2_input.py').read_text(),imports={'ecosystem_contract':'window/ecosystem_contract.py'})
            self.add('window/b3_system.py',self.ops_source,imports={n:'window/'+n+'.py'for n in ('db_owner_set_gate','db_owner_set_observer','pm2_input')},entry='inspect')
            for n,lang in [('candidate.config.private.json','json'),('candidate.ecosystem.config.cjs','commonjs')]:
                # Register the concrete fixture's already sealed config bytes;
                # do not rewrite them, their profiles or the canonical receipt.
                file=f.root/'switch'/n;meta=file.stat();key='switch/'+n
                self.manifest['files'][key]={'sha256':a.digest(file.read_bytes()),'uid':meta.st_uid,'mode':stat.S_IMODE(meta.st_mode),'language':lang}
                self.manifest['dependencies'][key]=[];self.manifest['imports'][key]={}
            self.manifest['entries']['switch/candidate.ecosystem.config.cjs']='forward'
            self.manifest['dependencies']['switch/candidate.ecosystem.config.cjs']=['switch/candidate.config.private.json','window/ecosystem_contract.py']
            self.manifest['dependencies']['window/pm2_input.py']=['switch/candidate.ecosystem.config.cjs']
            self.reply.update(anchor=self.anchor,manifest=self.manifest)
            self.seal_fixture()
            ctx=a.Context(lambda:a.canonical(self.reply),now=lambda:case.now)
            loader=Loader(ctx,'window/b3_system.py',trusted_modules={'child_transport':child_transport})
            real=loader.module('window/b3_system.py');driver=real.System();driver.apps=lambda:None
            inp=loader.module('window/pm2_input.py');inp.ALIAS=self.alias
            self.input=inp
            case.ops.__phase_authority__=ctx
            previous=f.d.start;calls=[];output=subprocess.check_output
            expected=json.loads((f.root/'switch/candidate.config.private.json').read_bytes())['apps']
            def pm2(argv,**kw):
                calls.append(argv[-1])
                value=output([NODE,str(HERE/'pm2_boundary.cjs'),argv[2],argv[-1]],**kw)
                self.assertEqual(json.loads(value),expected)
                self.assertTrue((f.root/'switch'/('start-intent-'+argv[-1]+'.json')).is_file())
                return value
            def start(root,name):
                driver.start(root,name)
                previous(root,name) # explicitly simulated process appearance
            f.d.start=start
            with self.alias_metadata(),patch.object(real.subprocess,'check_output',pm2):
                case.start(connected.t.c.API)
                case.start(connected.t.c.WORKER)
            self.assertEqual(calls,[connected.t.c.API,connected.t.c.WORKER])
            self.assertIsNone(ctx.bundle['permit'])
            with self.assertRaises(RuntimeError):case.start(connected.t.c.API)
            self.assertEqual(len(calls),2) # no PM2 replay from consumed start
        finally:
            case.tearDown()

    def test_canonical_parser_equivalence(self):
        original=module('original_ecosystem',(REVIEW/'v4-sequencer/ecosystem_contract.py').read_text())
        p=self.root/'matrix.json'
        for raw in (json.dumps(self.config),'{"apps":[],"apps":[]}','{"apps":NaN}','{}','bad-json'):
            p.write_text(raw)
            def result(call):
                try:return ('ok',call())
                except Exception as e:return(type(e).__name__,str(e))
            self.assertEqual(result(lambda:original.source(p)),result(lambda:self.ec.source(p)))
            self.assertEqual(result(lambda:original.source(p)),result(lambda:self.ec.source_bytes(raw)))
        for raw in (b'\xffinvalid', '{"apps":[]}'.encode('utf-16'), b'\xef\xbb\xbf{}'):
            p.write_bytes(raw)
            self.assertEqual(result(lambda:original.source(p)),result(lambda:self.ec.source(p)))
            self.assertEqual(result(lambda:original.source(p)),result(lambda:self.ec.source_bytes(raw)))


def load_tests(loader, tests, pattern):
    suite=loader.loadTestsFromTestCase(PM2Tests)
    for name in ('test_original_real_checker_certificates_controls_and_replay','test_prestop_no_permit_and_no_start',
                 'test_candidate_compatible_only','test_lost_start_response_no_replay_or_complete',
                 'test_prevention_binding_still_before_effects','test_prevention_event775_still_before_effects'):
        suite.addTest(connected.Connected(name))
    suite.addTest(r3.Forward('test_forward_real_pair_without_recovery_permit'))
    return suite
