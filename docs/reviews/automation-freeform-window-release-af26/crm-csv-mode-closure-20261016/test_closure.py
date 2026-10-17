"""Focused real consumers/Loader/bootstrap. Productive OS/DB/root effects simulated.
All profiles/authority replies below are synthetic TEST inputs, never kit inputs.
"""
import ast,base64,copy,datetime,hashlib,json,os,shutil,subprocess,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
import compose
HERE=Path(__file__).resolve().parent

def sha(x):return hashlib.sha256(x).hexdigest()
def mod(name,raw):
    m=types.ModuleType(name);sys.modules[name]=m
    exec(compile(raw,name,'exec'),m.__dict__);return m

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.plan,cls.objects=compose.compose()
    def raw(self,n):return self.objects[self.plan['files'][n]['sha256']]
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.lab=Path(self.tmp.name);self.root=self.lab/'prep';self.root.mkdir();(self.root/'window').mkdir()
        self.a=mod('authority',self.raw('protected/authority.py'))
        self.ct=mod('child_transport',self.raw('protected/child_transport.py'))
        self.loader=mod('mode_loader',self.raw('protected/verified_loader.py'))
        self.manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
        self.bundle=None;self.clock=datetime.datetime.now(datetime.timezone.utc)
        self.put('window/recovery-contract.private.json',b'synthetic-contract')
        self.put('window/csv-execution.intent.private.json',b'synthetic-execution')
    def put(self,name,raw):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(raw);p.chmod(0o600);return p
    def include(self,name):
        if name in self.manifest['files']:return
        raw=self.raw(name);p=self.put(name,raw)
        row=self.plan['files'][name]
        self.manifest['files'][name]={'sha256':row['sha256'],'uid':os.getuid(),'mode':0o600,
            'language':'commonjs' if name.endswith('.cjs') else 'python'}
        self.manifest['dependencies'][name]=[]
        self.manifest['imports'][name]=self.plan['imports'][name]
        for dep in self.manifest['imports'][name].values():self.include(dep)
    def context(self,decision=None):
        a={'version':1,'preparation':str(self.root),'contractSha256':sha(b'synthetic-contract'),
           'policySha256':'1'*64,'codeManifestSha256':sha(self.a.canonical(self.manifest)),
           'profileSha256':{'ORIGINAL':'2'*64,'CANDIDATE':sha((self.root/'window/target.profile.private.json').read_bytes()) if (self.root/'window/target.profile.private.json').exists() else '3'*64}}
        self.bundle={'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,'anchor':a,
            'anchorSha256':sha(self.a.canonical(a)),'permit':None,'permitSha256':None,
            'manifest':self.manifest,'livePolicySha256':'1'*64,'livePhase':'fenced'}
        if decision:
            p={'anchorSha256':self.bundle['anchorSha256'],'preparation':str(self.root),'contractSha256':a['contractSha256'],
               'policySha256':'1'*64,'decision':decision,'targetProfileSha256':a['profileSha256'][decision],
               'executionIntentSha256':sha(b'synthetic-execution'),'phase':'fenced','capturedUtc':self.clock.isoformat()}
            self.bundle.update(permit=p,permitSha256=sha(self.a.canonical(p)))
        self.ctx=self.a.Context(lambda:json.dumps(self.bundle),now=lambda:self.clock)
        return self.ctx
    def loaded(self,entry,decision=None):
        self.include(entry);self.manifest['entries'][entry]='inspect'
        for n in self.manifest['files']:
            if n.endswith('/ops.py'):self.manifest['entries'][n]='inspect'
        ctx=self.context(decision)
        return self.loader.Loader(ctx,entry,trusted_modules={'authority':self.a,'child_transport':self.ct})
    def original(self):
        self.include('return-before-commit/ops.py')
        return self.loaded('window/recovery_bridge.py','ORIGINAL')
    def test_original_loader_real_ops_without_candidate_directories(self):
        l=self.original();op=l.mode_module('return-before-commit')
        self.assertEqual(op.__file__,str(self.root/'return-before-commit/ops.py'))
        self.assertTrue(callable(op.Operations.config))
        self.assertTrue(all(not (self.root/m).exists() for m in ('switch','return','return-partial')))
    def test_original_entrypoint_load_and_config_real_predicate(self):
        l=self.original();bridge=l.module('window/recovery_bridge.py');seq=l.module('window/sequencer.py')
        op=l.mode_module('return-before-commit')
        # Only external /proc + PM2 observation replaced. Real Operations.config
        # and System.check_config execute; fixture is current local process.
        name='synthetic-api';pid=os.getpid()
        cfg={name:{'cwd':str(Path('/proc',str(pid),'cwd').resolve()),'script':'synthetic.js',
                   'interpreter':str(Path('/proc',str(pid),'exe').resolve()),'env':{}}}
        app={'pid':pid,'pm2_env':{'status':'online','watch':False,'pm_cwd':cfg[name]['cwd'],'pm_exec_path':'synthetic.js'}}
        # Minimal JSON inputs used by real Operations.__init__.
        for f,v in [('plan.private.json',{}),('return.config.private.json',{'apps':[]}),('candidate.config.private.json',{'apps':[]})]:self.put('return-before-commit/'+f,json.dumps(v).encode())
        b=bridge.Bridge.__new__(bridge.Bridge);b.root=self.root;b.switch=self.root/'switch';b.apps=lambda:{name:app}
        self.assertTrue(b.app_matches('return-before-commit',name,cfg))
        cfg[name]['script']='wrong.js';self.assertFalse(b.app_matches('return-before-commit',name,cfg))
        self.assertFalse((self.root/'switch').exists())
    def test_wrong_mode_denied_before_ops_import(self):
        l=self.original()
        with self.assertRaisesRegex(RuntimeError,'mode_scope'):l.mode_module('../switch')
        self.include('switch/ops.py');self.manifest['entries']['switch/ops.py']='inspect'
        l=self.loaded('window/recovery_bridge.py','ORIGINAL')
        with self.assertRaisesRegex(RuntimeError,'decision_or_execution|start_mode|forward_recovery_conflict'):l.mode_module('switch')
    def test_missing_mode_entry_denied(self):
        l=self.original();del self.bundle['manifest']['entries']['return-before-commit/ops.py']
        # Re-seal test reply then establish a fresh context (not edit live binding).
        l=self.loader.Loader(self.context('ORIGINAL'),'window/recovery_bridge.py',trusted_modules={'authority':self.a,'child_transport':self.ct})
        with self.assertRaisesRegex(RuntimeError,'inspect_entry'):l.mode_module('return-before-commit')
    def test_mode_tamper_between_snapshot_and_use_denies(self):
        l=self.original();p=self.root/'return-before-commit/ops.py'
        p.write_text('raise AssertionError("must never execute")')
        with self.assertRaisesRegex(RuntimeError,'source_hash'):l.mode_module('return-before-commit')
    def test_same_snapshot_bytes_not_mutable_path(self):
        l=self.original();op=self.loader.Loader(self.ctx,'return-before-commit/ops.py',trusted_modules={'authority':self.a,'child_transport':self.ct})
        (self.root/'return-before-commit/ops.py').write_text('raise AssertionError("replacement")')
        self.assertTrue(callable(op.module('return-before-commit/ops.py').Operations))
        with self.assertRaisesRegex(RuntimeError,'source_hash'):l.mode_module('return-before-commit')
    def test_authority_exchange_and_expiry_before_use(self):
        l=self.original();self.clock+=datetime.timedelta(seconds=601)
        with self.assertRaisesRegex(RuntimeError,'expired'):l.mode_module('return-before-commit')
        self.clock-=datetime.timedelta(seconds=601)
        self.bundle['permit']['capturedUtc']=(self.clock+datetime.timedelta(seconds=1)).isoformat()
        self.bundle['permitSha256']=sha(self.a.canonical(self.bundle['permit']))
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):l.mode_module('return-before-commit')
    def test_original_config_library_after_unfence_no_start_authorization(self):
        l=self.original();self.bundle['livePhase']='unfenced'
        self.assertTrue(callable(l.mode_module('return-before-commit').Operations.config))
        with self.assertRaisesRegex(RuntimeError,'live_phase'):self.ctx.start_mode(self.root/'return-before-commit')
        self.assertFalse((self.root/'window/csv-recovery.intent.private.json').exists())
    def test_forward_r3_default_and_consumption_unchanged(self):
        self.include('switch/ops.py');self.manifest['entries']['switch/ops.py']='inspect'
        self.put('window/target.profile.private.json',b'synthetic-target')
        ctx=self.context();self.assertIs(ctx.start_mode(self.root/'switch'),ctx)
        self.assertIsNone(ctx.bundle['permit'])
        self.put('window/csv-complete.receipt.private.json',b'{}')
        with self.assertRaisesRegex(RuntimeError,'forward_consumed'):ctx.start_mode(self.root/'switch')
    def test_prestop_inspection_no_start_permit(self):
        l=self.loaded('window/recovery_bridge.py');self.ctx.revalidate('prestop')
        self.assertIsNone(self.ctx.bundle['permit'])
        with self.assertRaisesRegex(RuntimeError,'permit_required'):self.ctx.start_mode(self.root/'return-before-commit')
        self.assertFalse((self.root/'window/csv-recovery.intent.private.json').exists())
    def test_undeclared_import_denied_real_loader(self):
        l=self.original()
        with self.assertRaisesRegex(RuntimeError,'import_undeclared'):l._import('window/recovery_bridge.py')('unknown_binding')
        with self.assertRaisesRegex(RuntimeError,'legacy_binding_forbidden'):l._import('window/recovery_bridge.py')('recovery_binding')
    def test_read_failure_propagates_no_pass(self):
        l=self.original();real=os.open
        def denied(path,*a,**k):
            if str(path).endswith('/return-before-commit/ops.py'):raise PermissionError('synthetic unreadable')
            return real(path,*a,**k)
        with patch.object(os,'open',denied),self.assertRaises(PermissionError):l.mode_module('return-before-commit')
    def test_exit_code_mode_explicit_canonical_methods_called(self):
        l=self.original();m=l.module('window/recovery_bridge.py');calls=[]
        op=l.mode_module('return-before-commit')
        # Host restore/guard/process/DB observers only simulated. The real Bridge
        # method runs through authenticated Loader and real Operations constructor.
        mode='switch'
        for f,v in [('plan.private.json',{}),('return.config.private.json',{'apps':[]}),('candidate.config.private.json',{'apps':[]}),('stop-start.json',{})]:self.put(mode+'/'+f,json.dumps(v).encode())
        b=m.Bridge.__new__(m.Bridge);b.root=self.root
        # Inject read-only host boundary by patching freshly loaded System and
        # proof observer methods; no substitute bridge/entry source.
        orig=self.loader.Loader.mode_module
        def boundary(loader,requested):
            module=orig(loader,requested);calls.append(('mode',requested))
            for fn in ('restore_proof','guard','certificate','old_absent'):
                setattr(module.Operations,fn,lambda _s,*args,_fn=fn:calls.append((_fn,args)))
            module.System.db_zero=lambda _s:{'otherClientBackends':0,'advisoryLocks':0}
            return module
        # csv_boundary exit check remains concrete but needs many receipts;
        # no fake certification: stop at its actual missing proof read.
        with patch.object(self.loader.Loader,'mode_module',boundary),self.assertRaises(FileNotFoundError):
            b.verify_recovery_exit(mode,code_mode='return-before-commit')
        self.assertEqual(calls[0],('mode','return-before-commit'))
        self.assertTrue(any(x[0]=='certificate' for x in calls))
    def test_check_current_real_loader_missing_inputs_denies_before_host_effect(self):
        l=self.loaded('window/check_current.py');m=l.module('window/check_current.py')
        # No host commands allowed in this negative. Actual canonical precheck
        # must reject the absent operational contract before any subprocess.
        with patch.object(subprocess,'check_output',side_effect=AssertionError('host effect reached')):
            with self.assertRaises(FileNotFoundError):m.check_current(self.root)
    def test_original_contract_complete_entry_missing_inputs_not_bypassed(self):
        l=self.original();m=l.module('window/recovery.py')
        bridge=l.module('window/recovery_bridge.py')
        b=bridge.Bridge.__new__(bridge.Bridge);b.root=self.root
        r=m.Recovery(self.root,b,l.module('window/sequencer.py').Sequencer,self.ctx.pin('contract'),self.ctx)
        # Entire candidate directories absent does NOT certify R2 data. Actual
        # Recovery.inspect reaches the original checker and denies absent inputs.
        with self.assertRaises((RuntimeError,FileNotFoundError,json.JSONDecodeError)):r.inspect()
        self.assertFalse((self.root/'switch').exists())
    def test_call_sites_and_unchanged_sql_predicates(self):
        for name in ('window/recovery.py','window/recovery_contract.py','window/sequencer.py','window/check_current.py'):
            tree=ast.parse(self.raw(name))
            for n in ast.walk(tree):
                if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='app_matches':self.assertEqual(len(n.args),3,name)
        js=self.raw('window/current-sql.cjs').decode()
        for part in ('BEGIN READ ONLY;SET LOCAL statement_timeout=8000;','b.noWork(q);','b.baseline(p+\'/\'+m,q);b.proofs(p+\'/\'+m);','ROLLBACK;'):
            self.assertIn(part,js)
        current=self.raw('window/check_current.py').decode();self.assertNotIn("'node','-e'",current);self.assertNotIn('import ops',current)
    def test_composition_missing_inputs_remain_denied_and_original_data_rule_explicit(self):
        self.assertFalse(self.plan['operationallyCertified']);self.assertFalse(self.plan['executionAuthorized'])
        self.assertEqual([x for x in self.plan['missingInputs'] if x['kind'] in ('import','require')],[])
        self.assertTrue(self.plan['integrationBlocks'])
        text=self.raw('window/recovery_contract.py').decode()
        self.assertIn("('candidate.config.private.json', 'return.config.private.json', 'plan.private.json')",text)
        self.assertIn("sequencer.verify_stopped('switch')",text)
    def node(self,entry,js_hook='',args=()):
        self.include(entry);self.manifest['entries'][entry]='inspect'
        # Declare actual Python proof child for Node bootstrap.
        if 'window/restore_contract.py' in self.manifest['files']:self.manifest['entries']['window/restore_contract.py']='inspect'
        self.context();library=self.lab/'library';library.mkdir(exist_ok=True)
        mapping={'authority':'authority.py','verified_loader':'verified_loader.py','child_transport':'child_transport.py',
                 'privileged_output':'privileged_output.py','bootstrap':'recovery-launch.py'}
        state={'bundle':self.bundle,'library':str(library),'libraries':{}}
        for name,filename in mapping.items():
            raw=self.raw('protected/'+filename);(library/(name+'.py')).write_bytes(raw);state['libraries'][name]=sha(raw)
        boot=library/'node.cjs';boot.write_bytes(self.raw('protected/recovery-node-launch.cjs'))
        path=self.lab/'state.json';path.write_text(json.dumps(state))
        runner=self.lab/'run.cjs';runner.write_text("const fs=require('node:fs'),cp=require('node:child_process');\n"+js_hook+"\nconst b=require("+json.dumps(str(boot))+");b.run("+json.dumps(entry)+",['--diagnostic-window',"+json.dumps(str(self.root/'window'))+",..."+json.dumps(list(args))+"],(c,o)=>cp.execFileSync('/usr/bin/python3',['-B','-I','-S',"+json.dumps(str(HERE/'lab_bootstrap.py'))+","+json.dumps(str(path))+",...c],o));\n")
        return subprocess.run([shutil.which('node'),str(runner)],capture_output=True,text=True,timeout=30)
    def sql_fixture(self):
        # No live IDs/payloads. Explicit synthetic closure and restore evidence.
        ids=[str(i)*8+'-'+str(i)*4+'-'+str(i)*4+'-'+str(i)*4+'-'+str(i)*12 for i in range(1,6)]
        client,batch,job,c1,c2=ids
        audit={'synthetic':True};ack=sha(json.dumps(audit,sort_keys=True,separators=(',',':')).encode())
        receipt={'taskHash':'5'*64,'retryAllowed':False,'reference':{'clientId':client,'campaignId':c1}}
        expected={'version':2,'expectedLifecycle':'after_approved_canonical_cancel','guardMustRemainClosed':True,
          'capturedGeneration':38,'acknowledgementSha256':ack,'scope':{'clientId':client,'batchId':batch,'jobId':job,'campaignIds':[c1,c2]},
          'receipt':receipt,'receiptId':c1,'taskHash':'5'*64,'closurePlanHash':'6'*64,
          'databaseTimezone':'UTC','leases':0,'jobs':[],'groups':[],'sendingScheduled':[]}
        closure={'job':{'id':job,'clientId':client,'batchId':batch,'campaignId':c1,'status':'cancelled','attempt':1,
          'failureReason':'batch_cancelled','finishedAt':'synthetic','leaseToken':None,'leaseOwner':None,'leaseExpiresAt':None},
          'batch':{'id':batch,'clientId':client,'status':'cancelled','completedAt':'synthetic'},
          'links':[{'campaignId':c1,'clientId':client,'batchId':batch,'status':'cancelled','recipientCount':11}],
          'campaigns':[{'id':n,'clientId':client,'status':'cancelled'}for n in [c1,c2]],'cancelEvents':1,
          'results':6,'uniqueMetaIds':6,'reported':6,'remainingResults':0,'remainingAccepted':0}
        q={**expected,'flags':[],'connected':[],'auth':[],'closure':closure}
        def put(n,v):return self.put(n,json.dumps(v,sort_keys=True).encode())
        put('window/waiting-work.private.json',expected)
        put('window/closure-verified.private.json',{'mode':'READ_ONLY','stage':'VERIFY_AFTER_CANONICAL_CANCEL','planHash':'6'*64,
          'plan':{'preserveResults':6,'notSubmitted':5,'guardRemainsClosed38':True,'providerCalls':0}})
        original={'result':'PASS','isolatedLocalOnly':True,'applicationStarted':False,'providerCalls':0,'productionWrites':0,
          'converted':10,'opaquePreserved':1,'historicalFields':147,'v2Independent':True,'replayAdditionalEvents':0,
          'schemaTables':70,'migrationRows':66,'migrationChecksumMismatches':[],'ownershipAclRestored':False,'dumpSha256':'7'*64}
        original_path=put('window/original-restore-proof.private.json',original)
        manifest={'files':{'database.dump':{'sha256':'8'*64,'bytes':123}},'catalogObjects':12}
        tooling='pg_dump/pg_restore16.12; Node20.20.0; existing isolated restore PG16'
        evidence={'result':'FRESH_READONLY_BACKUP_PASS','backupLockHeld':True,'newCipherPlanGenerated':False,'schemaDigest':'9'*64,'dumpSha256':'8'*64,'dumpBytes':123}
        ep=put('window/backup-compatibility.private.json',evidence)
        mb=sha(json.dumps(manifest,sort_keys=True).encode())
        contract={'version':1,'scope':'ISOLATED_RESTORE_EVIDENCE_NOT_FRESH_RPO','originalProofSha256':sha(original_path.read_bytes()),
          'evidenceState':'CERTIFIED_RETAINED_STOPPED','ownershipAclRestored':False,'currentBackupManifestSha256':mb,
          'currentDumpSha256':'8'*64,'schemaFrontierSha256':'9'*64,'tooling':tooling,'compatibilityEvidenceSha256':sha(ep.read_bytes())}
        cp=put('window/restore-contract.private.json',contract)
        r={'result':'PASS','temporaryDatabaseRemoved':False,'databaseRetainedStoppedForEvidence':True,'snapshotCertified':True,
          'isolatedLocalOnly':True,'applicationStarted':False,'providerCalls':0,'migrationChecksumMismatches':[],
          'dumpSha256':'8'*64,'dumpBytes':123,'schemaDigest':'9'*64,'tooling':tooling,
          'proofMode':'REUSED_ISOLATED_RESTORE_EQUAL_TOOLING_SCHEMA_FRONTIER','restoreExecutedForThisCapture':False,
          'originalRestoreProofSha256':sha(original_path.read_bytes()),'reusedOriginalProof':original,'originalCertifiedDumpSha256':'7'*64}
        rp=put('window/restore-result.json',r)
        for mode in ('switch','return','return-partial','return-before-commit'):
            put(mode+'/backup-manifest.json',manifest)
            put(mode+'/baseline.private.json',{'flags':[],'connected':[],'auth':[]})
            put(mode+'/proof-bindings.private.json',{'backupManifestSha256':mb,'restoreResultSha256':sha(rp.read_bytes()),
              'restoreContractSha256':sha(cp.read_bytes()),'dumpSha256':'8'*64,'dumpBytes':123,'catalogObjects':12})
        guard={'version':1,'open':False,'generation':38,'tasks':{},'audit':[audit]}
        hook="const read=fs.readFileSync,exists=fs.existsSync,exec=cp.execFileSync;let docker=0,proofs=0;\n"
        hook+="fs.readFileSync=function(p,...a){if(String(p)==='/var/lib/re7/campaign-operations/state.json')return JSON.stringify("+json.dumps(guard)+");return read.call(this,p,...a)};\n"
        hook+="fs.existsSync=function(p){if(String(p).startsWith('/var/lib/re7/campaign-operations/state.json.'))return false;return exists.call(this,p)};\n"
        hook+="cp.execFileSync=function(c,a,o){if(c==='docker'){docker++;if(!o.input.startsWith('BEGIN READ ONLY;SET LOCAL statement_timeout=8000;')||!o.input.endsWith(';ROLLBACK;'))throw Error('SQL_SCOPE');return JSON.stringify("+json.dumps(q)+")}const r=exec.call(this,c,a,o);if(a.includes('window/restore_contract.py')&&a.includes('python'))proofs++;return r};\n"
        hook+="process.on('exit',()=>fs.writeFileSync("+json.dumps(str(self.lab/'observed.json'))+",JSON.stringify({docker,proofs})));"
        return hook
    def test_current_sql_real_node_python_restore_four_modes(self):
        hook=self.sql_fixture();r=self.node('window/current-sql.cjs',hook)
        self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout,'SQL_FOUR_MODES_PASS')
        self.assertEqual(json.loads((self.lab/'observed.json').read_text()),{'docker':1,'proofs':4})
    def test_current_sql_tamper_before_use_no_docker(self):
        hook=self.sql_fixture()
        hook+="\nconst prior=cp.execFileSync;let first=true;cp.execFileSync=function(c,a,o){const r=prior(c,a,o);if(first&&a.includes('node-snapshot')){first=false;fs.writeFileSync("+json.dumps(str(self.root/'switch/preparation-bindings.cjs'))+",'throw Error(\"UNAUTHENTICATED\")')}return r};"
        r=self.node('window/current-sql.cjs',hook)
        self.assertNotEqual(r.returncode,0);self.assertIn('authority_source_hash',r.stderr)
        self.assertEqual(json.loads((self.lab/'observed.json').read_text())['docker'],0)
    def test_waiting_work_real_imports_strict_builtin(self):
        result=self.node('switch/waiting-work.cjs');self.assertEqual(result.returncode,0,result.stderr)
    def test_frozen_consumer_real_negative_and_undeclared_import(self):
        # Entry invokes actual consumer noWork; no fixture rewrite of its code.
        self.include('switch/waiting-work-frozen.cjs')
        name='window/probe.cjs';raw=b"const f=require('../switch/waiting-work-frozen.cjs');try{f.noWork({},{});throw Error('BAD_PASS')}catch(e){if(e.message==='BAD_PASS')throw e;process.stdout.write(e.message)}"
        self.put(name,raw);self.manifest['files'][name]={'sha256':sha(raw),'uid':os.getuid(),'mode':0o600,'language':'commonjs'};self.manifest['dependencies'][name]=[];self.manifest['imports'][name]={'../switch/waiting-work-frozen.cjs':'switch/waiting-work-frozen.cjs'}
        result=self.node(name);self.assertEqual(result.returncode,0,result.stderr);self.assertIn('frozen_binding_schema',result.stdout)
        raw=b"require('node:module')";self.put(name,raw);self.manifest['files'][name]['sha256']=sha(raw)
        result=self.node(name);self.assertNotEqual(result.returncode,0);self.assertIn('node_import_undeclared:node:module',result.stderr)
        raw=b"require('assert/strict')";self.put(name,raw);self.manifest['files'][name]['sha256']=sha(raw)
        result=self.node(name);self.assertNotEqual(result.returncode,0);self.assertIn('node_import_undeclared:assert/strict',result.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
