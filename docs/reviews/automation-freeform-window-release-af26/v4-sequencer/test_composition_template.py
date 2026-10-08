"""Exact staged template/three modes; OS/DB effects injected, no productive paths written."""
import contextlib, hashlib, importlib.util, json, os
from pathlib import Path
import re, shutil, subprocess, sys, tempfile, unittest
from unittest.mock import patch
from baseline_contract import capture_operational

PACKAGE=Path(sys.argv[1]).resolve()
# Read the fixed preparation binding from the exact staged adapter, not a dated fixture.
bindings=set(re.findall(r'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-[A-Za-z0-9-]+/', (PACKAGE/'switch/ops.py').read_text()))
assert len(bindings)==1, 'test_preparation_binding_ambiguous'
PRIVATE_SOURCE=bindings.pop().rstrip('/')
sys.path.insert(0,str(PACKAGE/'window'))

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m

class Composition(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name)
        self.original=self.base/'incident-6683-v4-composition';self.dest=self.base/'incident-6683-v4-return-composition'
        self.original.mkdir();self.window=self.original/'window';self.window.mkdir()
        for mode in ('switch','return','return-partial'):
            shutil.copytree(PACKAGE/mode,self.original/mode)
            for n in ('ops.py','delegated.py','read-state.py','execution-check.cjs','preparation-bindings.cjs'):
                f=self.original/mode/n;f.write_bytes(f.read_bytes().replace(PRIVATE_SOURCE.encode(),str(self.original).encode()))
        for n in ('privileged.py','sequencer.py','prepare_policy.py','prepare_post_unfence_return.py','privileged_output.py','absent-worker-return.patch','sequencer-manifest.json','baseline_contract.py','ecosystem_contract.py'):
            shutil.copyfile(PACKAGE/'window'/n,self.window/n)
        shutil.copyfile(Path(__file__).parent/'prepare_post_unfence_return.py',self.window/'prepare_post_unfence_return.py')
        self.template=load('composed_template',self.window/'prepare_post_unfence_return.py')
        self.template.BASE=self.base
        self.guard={'version':1,'open':False,'generation':28,'tasks':{},'audit':[]}
        (self.window/'initial.private.json').write_text(json.dumps(capture_operational(lambda:self.guard,lambda _: 'ActiveState=inactive\nUnitFileState=enabled\n',restore_open=True)))
        self.apps={};self.config={};self.returned={}
        for i,n in enumerate((self.template.API,self.template.WORKER,self.template.FRONT),101):
            d=self.base/n;d.mkdir();(d/'index.js').write_text('synthetic');(d/'.next').mkdir();(d/'.next/BUILD_ID').write_text('synthetic-build')
            c={'name':n,'cwd':str(d),'script':str(d/'index.js'),'watch':False,'env':{'DATABASE_URL':'postgresql://synthetic@127.0.0.1:5432/synthetic'}}
            self.config[n]=c;self.returned[n]=c.copy()
            self.apps[n]={'name':n,'pid':i,'pm2_env':{'pm_cwd':c['cwd'],'pm_exec_path':c['script'],'watch':False,'status':'online'}}
            (self.original/'switch'/('started-'+n+'.json')).write_text(json.dumps({'pid':i,'identity':{'ticks':str(i)}}))
        for mode in ('switch','return','return-partial'):
            (self.original/mode/'candidate.config.private.json').write_text(json.dumps({'apps':list(self.config.values())}))
            (self.original/mode/'return.config.private.json').write_text(json.dumps({'apps':list(self.returned.values())}))
        self.proxy={'identity':{'pid':99,'ticks':'99'},'exeSha256':'synthetic-proxy'}
        binding={'proxyIdentity':self.proxy['identity'],'proxySha256':self.proxy['exeSha256'],'containerId':'synthetic'}
        for n in ('automation-fence.nft','re7-converta-backup.before','re7-converta-backup.window','deploy.crontab.before','deploy.crontab.window','frontend-build-env.private.json','path-bindings.private.json','backup-manifest.private.json','restore-result.json','re7-incident-6683-window.sudoers.proposed','waiting-work.private.json'):
            (self.window/n).write_text('{}')
        (self.window/'db-owner-bindings.private.json').write_text(json.dumps(binding))
        (self.window/'privileged-policy.sha256').write_text('synthetic')
        (self.original/'switch/owner-unfence-authorized.json').write_text('{}')
        (self.original/'switch/old-exit-confirmed.json').write_text(json.dumps({'frontend':{'pid':103,'identity':{'ticks':'103'}}}))
        (self.window/'waiting-work.private.json').write_text(json.dumps({'version':1,'guardMustRemainClosed':True,'jobs':[],'groups':[],'leases':0,'sendingScheduled':[]}))
        self.real_read=Path.read_text;self.real_run=subprocess.run;self.real_output=subprocess.check_output
        self.root_checks=[]
    def tearDown(self):self.temp.cleanup()
    def execute(self,absent=False):
        if absent:
            self.apps[self.template.WORKER]['pid']=0;self.apps[self.template.WORKER]['pm2_env']['status']='errored'
            capture={'status':'running-captured','pid':102,'ticks':'102','daemon':{'pid':99,'ticks':'99'},'pgid':102,'sid':102,'uid':os.getuid(),'tree':{'102':'102'},'socketIds':[],'cwd':self.config[self.template.WORKER]['cwd'],'script':self.config[self.template.WORKER]['script']}
            (self.original/'switch/worker-before-unfence.private.json').write_text(json.dumps(capture))
        def text(p,*a,**kw):
            if str(p)=='/var/lib/re7/campaign-operations/state.json':return json.dumps(self.guard)
            if str(p)=='/etc/cron.d/re7-converta-backup':return '{}'
            return self.real_read(p,*a,**kw)
        real_bytes=Path.read_bytes
        def read_bytes(p):
            if str(p)=='/etc/cron.d/re7-converta-backup':return b'{}'
            return real_bytes(p)
        def check_output(args,**kw):
            if args[-1]=='jlist':return json.dumps(list(self.apps.values())).encode()
            if args[0]=='systemctl':return 'ActiveState=inactive\nUnitFileState=enabled\n'
            if args[0]=='crontab':return b'{}'
            if args[0]=='/usr/bin/node':return self.real_output(['/tmp/re7-pm2-lab/node',*args[1:]],**kw)
            if args[0]=='docker':return json.dumps({'jobs':[],'groups':[],'leases':0,'sendingScheduled':[],'flags':[],'connected':[],'auth':[]})
            raise AssertionError('unexpected_command')
        def run(args,**kw):
            if args[0]=='sudo':
                out=json.dumps(self.proxy).encode() if args[-1].endswith('db-owner-set-observer.py') else b'{}'
                return subprocess.CompletedProcess(args,0,out,b'synthetic-private-stderr')
            if args[0]=='python3':
                # Policy installation and live identity are deliberately not simulated as PASS.
                (self.dest/'window/privileged-policy.sha256').write_text('synthetic-generated-policy')
                return subprocess.CompletedProcess(args,0,b'',b'')
            if args[0]=='/usr/bin/node':args=['/tmp/re7-pm2-lab/node',*args[1:]]
            return self.real_run(args,**kw)
        original_spec=importlib.util.spec_from_file_location
        def spec(name,path,*a,**kw):
            s=original_spec(name,path,*a,**kw)
            if name=='v4_absence':
                original_exec=s.loader.exec_module
                def exec_module(m):
                    original_exec(m)
                    m.source_processes_ready=lambda v:self.root_checks.append(v)
                s.loader.exec_module=exec_module
            return s
        def normalized(p):
            raw=Path(p).read_bytes()
            for path in (str(self.original),str(self.dest),PRIVATE_SOURCE):raw=raw.replace((path+'/').encode(),b'<PREPARATION>/')
            return hashlib.sha256(raw).hexdigest()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(Path,'read_text',text));stack.enter_context(patch.object(Path,'read_bytes',read_bytes))
            stack.enter_context(patch.object(subprocess,'check_output',check_output));stack.enter_context(patch.object(subprocess,'run',run))
            stack.enter_context(patch.object(self.template,'process_identity',lambda pid:None if absent and pid==102 else {'ticks':str(pid),'state':'S'}))
            stack.enter_context(patch.object(self.template,'normalized_digest',normalized))
            stack.enter_context(patch.object(importlib.util,'spec_from_file_location',spec))
            self.template.main(self.original,self.dest)
        gates=json.loads((self.dest/'window/execution-gates.private.json').read_text())
        self.assertEqual(set(gates),{'ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved'})
        self.assertTrue(all(x is False for x in gates.values()))
        # Hashes checked on the actual generated 26-file package, not a mocked manifest.
        lines=(self.dest/'return/scripts.sha256').read_text().splitlines();self.assertEqual(len(lines),28)
        for line in lines:
            h,n=line.split('  ',1);self.assertEqual(hashlib.sha256((self.dest/'return'/n).read_bytes()).hexdigest(),h)
        for where in ('window','switch','return'):
            self.assertEqual((self.dest/where/'privileged_output.py').read_bytes(),(PACKAGE/'window/privileged_output.py').read_bytes())
        self.assertFalse(list(self.dest.glob('*/start-intent-*')));self.assertFalse(list(self.dest.glob('*/owner-*')))
        private=[json.loads(l)for l in (self.window/'privileged-output.private.jsonl').read_text().splitlines()]
        self.assertEqual({x['action']for x in private},{'check-absent','db-owner-observe'})
        self.assertTrue(all(x['stderrBytes']>0 for x in private))
        return json.loads((self.dest/'return/plan.private.json').read_text())
    def test_three_mode_observer_errors_use_final_logger(self):
        import stat, types
        observer=Path('/usr/local/libexec/re7/db-owner-set-observer.py')
        raw=(PACKAGE/'switch/db_owner_set_observer.py').read_bytes()
        sys.path.insert(0,str(self.original/'switch'))
        logger=load('privileged_output',self.window/'privileged_output.py')
        old_file=Path.is_file;old_link=Path.is_symlink;old_stat=Path.lstat;old_bytes=Path.read_bytes
        def file(p):return True if p==observer else old_file(p)
        def link(p):return False if p==observer else old_link(p)
        def st(p):
            if p in (observer,*observer.parents):return types.SimpleNamespace(st_uid=0,st_mode=(stat.S_IFREG if p==observer else stat.S_IFDIR)|0o644)
            return old_stat(p)
        def read(p):return raw if p==observer else old_bytes(p)
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(Path,'is_file',file));stack.enter_context(patch.object(Path,'is_symlink',link))
            stack.enter_context(patch.object(Path,'lstat',st));stack.enter_context(patch.object(Path,'read_bytes',read))
            for mode in ('switch','return','return-partial'):
                ops=load('ops_'+mode.replace('-','_'),self.original/mode/'ops.py')
                for exit in (0,1):
                    result=subprocess.CompletedProcess([],exit,b'{"synthetic":true}',b'private-observer-error')
                    with patch.object(subprocess,'run',return_value=result):
                        if exit:
                            with self.assertRaisesRegex(RuntimeError,'privileged_failed:db-owner-observe:exit=1'):
                                ops.System().proxy_socket_inventory(hashlib.sha256(raw).hexdigest())
                        else:self.assertEqual(ops.System().proxy_socket_inventory(hashlib.sha256(raw).hexdigest()),{'synthetic':True})
        rows=[json.loads(x)for x in (self.window/'privileged-output.private.jsonl').read_text().splitlines()]
        self.assertEqual(len(rows),6);self.assertEqual(sum(x['exitCode']==1 for x in rows),3)
        self.assertNotIn('private-observer-error',(self.window/'sequencer.journal.jsonl').read_text())

    def test_live_worker_template_full_composition(self):
        plan=self.execute();self.assertFalse(plan['recovery']);self.assertEqual(self.root_checks,[])
    def test_absent_worker_template_full_composition(self):
        plan=self.execute(True);self.assertTrue(plan['workerAbsentAtRecovery']);self.assertTrue(plan['recovery'])
        self.assertEqual(len(self.root_checks),1)
        self.assertEqual(self.root_checks[0]['absentWorker']['tree'],{'102':'102'})
    def test_absent_source_drift_denied_no_start(self):
        (self.original/'return/ops.py').write_text((self.original/'return/ops.py').read_text()+'\n# unreviewed\n')
        with self.assertRaisesRegex(RuntimeError,'absent_worker_source_drift'):self.execute(True)
        self.assertFalse(list(self.dest.glob('*/start-intent-*')))

if __name__=='__main__':unittest.main(argv=[sys.argv[0]])
