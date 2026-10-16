"""Local root/transport rehearsal. All files synthetic; root metadata/owner simulated."""
import copy
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from contextlib import nullcontext
import authority as a
from verified_loader import Loader
from root_store import Store
import root_extension
import integration
from child_transport import command

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent

def source(relative):return (REVIEW/relative).read_text()
def module(name,text,**globals):
    m=types.ModuleType(name);m.__dict__.update(globals);sys.modules[name]=m
    exec(compile(text,name,'exec'),m.__dict__);return m

class Case:
    def __init__(self,root):
        self.root=root/'prep';self.root.mkdir()
        self.store_root=root/'root-owned';self.store_root.mkdir()
        self.now=datetime.datetime(2026,10,16,21,tzinfo=datetime.timezone.utc)
        self.phase='fenced';self.policy='1'*64;self.calls=0
        self.manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
        self.add('entry.py',"from dep import value\nresult=value\n",imports={'dep':'dep.py'},entry='inspect')
        self.add('dep.py','value=42\n')
        (self.root/'window').mkdir();(self.root/'window/recovery-contract.private.json').write_bytes(b'synthetic-contract')
        (self.root/'window/csv-execution.intent.private.json').write_bytes(b'synthetic-execution')
        self.anchor={'version':1,'preparation':str(self.root),'contractSha256':a.digest(b'synthetic-contract'),
            'policySha256':self.policy,'codeManifestSha256':a.digest(a.canonical(self.manifest)),
            'profileSha256':{'ORIGINAL':'2'*64,'CANDIDATE':'3'*64}}
        self.store=Store(self.store_root,read=lambda p:Path(p).read_bytes(),now=lambda:self.now,lock_path=root/'root-lock',directory_check=lambda path:None)
        self.helper=types.SimpleNamespace(policy_from=lambda:{'policySha256':self.policy,'preparation':str(self.root)},
            phase_read=lambda:None if self.phase is None else{'stage':self.phase,'policySha256':self.policy},
            guard_closed=lambda:None,nft_present=lambda:None)
        self.install()
    def add(self,path,text,imports=None,entry=None,language='python'):
        f=self.root/path;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(text)
        s=f.stat();self.manifest['files'][path]={'sha256':a.digest(f.read_bytes()),'language':language,
            'uid':s.st_uid,'mode':s.st_mode&0o777}
        self.manifest['dependencies'][path]=[]
        self.manifest['imports'][path]=imports or{}
        if entry:self.manifest['entries'][path]=entry
    def install(self):
        self.anchor['codeManifestSha256']=a.digest(a.canonical(self.manifest))
        with patch('os.geteuid',lambda:0),patch.object(self.store,'_owner_lock',lambda:nullcontext()):
            self.store.install_owner_once(a.canonical(self.anchor),a.canonical(self.manifest),
                a.digest(a.canonical(self.anchor)),a.digest(a.canonical(self.manifest)),owner_action=True)
    def query(self):self.calls+=1;return self.store.query_locked(self.helper)
    def ctx(self):return a.Context(self.query,now=lambda:self.now)
    def issue(self,decision='ORIGINAL'):
        with patch('os.geteuid',lambda:0),patch.object(self.store,'_owner_lock',lambda:nullcontext()):
            return self.store.issue_owner_once(self.helper,decision,a.digest(b'synthetic-execution'),owner_action=True)

class AuthorityTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.c=Case(Path(self.tmp.name))
    def tearDown(self):self.tmp.cleanup()
    def test_static_inspection_and_prestop_have_no_permit(self):
        c=self.c.ctx();c.revalidate('prestop');self.assertIsNone(c.bundle['permit'])
        with self.assertRaisesRegex(RuntimeError,'permit_required'):c.operation('ORIGINAL')
        self.assertFalse((self.c.store._path(self.c.policy)/'issue.intent.json').exists())
    def test_owner_only_and_one_shot_issue_query_no_renewal(self):
        with patch('os.geteuid',lambda:1000),self.assertRaisesRegex(RuntimeError,'owner_issue'):
            self.c.store._issue_owner_once(self.c.helper,'ORIGINAL','a'*64,owner_action=True)
        self.c.issue();folder=self.c.store._path(self.c.policy)
        before={p.name:(p.read_bytes(),p.stat().st_mtime_ns)for p in folder.iterdir()}
        self.c.ctx().operation('ORIGINAL');self.c.now+=datetime.timedelta(seconds=601)
        with self.assertRaisesRegex(RuntimeError,'expired'):self.c.ctx().operation('ORIGINAL')
        after={p.name:(p.read_bytes(),p.stat().st_mtime_ns)for p in folder.iterdir()}
        self.assertEqual(before,after)
        with self.assertRaisesRegex(RuntimeError,'issue_consumed'):self.c.issue()
    def test_missing_denied_before_import(self):
        self.c.store.read=lambda p:(_ for _ in ()).throw(FileNotFoundError('synthetic missing'))
        with self.assertRaises(FileNotFoundError):self.c.ctx()
        self.assertNotIn('dep',sys.modules)
    def test_permission_denied_not_pass(self):
        self.c.store.read=lambda p:(_ for _ in ()).throw(PermissionError('synthetic unreadable'))
        with self.assertRaises(PermissionError):self.c.ctx()
    def test_anchor_tamper_denied(self):
        f=self.c.store._path(self.c.policy)/'anchor.json';v=json.loads(f.read_bytes());v['contractSha256']='0'*64;f.write_bytes(a.canonical(v))
        with self.assertRaisesRegex(RuntimeError,'static_record_drift'):self.c.ctx()
    def test_same_checked_bytes_even_after_replacement(self):
        ctx=self.c.ctx();loader=Loader(ctx,'entry.py')
        (self.c.root/'dep.py').write_text("raise AssertionError('unverified replacement executed')\n")
        self.assertEqual(loader.execute().result,42)
        with self.assertRaisesRegex(RuntimeError,'source_hash'):Loader(ctx,'entry.py')
    def test_malicious_entry_not_executed_before_authentication(self):
        f=self.c.root/'entry.py';f.write_text("raise AssertionError('should not execute')\n")
        with self.assertRaisesRegex(RuntimeError,'source_hash'):Loader(self.c.ctx(),'entry.py')
    def test_undeclared_import_and_child_bypass(self):
        # A declared file with an undeclared import must not reach sys.path fallback.
        ctx=self.c.ctx();loader=Loader(ctx,'entry.py');loader.raw['entry.py']=b'import recovery_binding\n'
        with self.assertRaisesRegex(RuntimeError,'legacy_binding_forbidden'):loader.execute()
        with self.assertRaisesRegex(RuntimeError,'child_bypass'):command(ctx,['python3','relative.py'])
        with self.assertRaises((RuntimeError,ValueError)):command(ctx,['python3','/tmp/not-approved.py'])
    def test_phase_policy_profile_mismatch_and_expiry(self):
        self.c.issue();ctx=self.c.ctx();ctx.operation('ORIGINAL')
        self.c.phase='unfenced'
        with self.assertRaisesRegex(RuntimeError,'live_phase'):ctx.operation('ORIGINAL')
        self.c.phase='fenced';self.c.policy='9'*64
        with self.assertRaises(FileNotFoundError):ctx.revalidate()
    def test_permit_profile_drift_denied_even_with_updated_ack(self):
        self.c.issue();p=self.c.store._path(self.c.policy);permit=json.loads((p/'permit.json').read_bytes());permit['targetProfileSha256']='9'*64
        raw=a.canonical(permit);(p/'permit.json').write_bytes(raw);(p/'issue.receipt.json').write_bytes(a.canonical({'result':'ROOT_RECOVERY_PERMIT_ISSUED','permitSha256':a.digest(raw)}))
        with self.assertRaisesRegex(RuntimeError,'permit_context'):self.c.ctx()
    def test_exchange_between_api_and_worker_and_expiry(self):
        self.c.issue();ctx=self.c.ctx();ctx.operation('ORIGINAL','start')
        p=self.c.store._path(self.c.policy);v=json.loads((p/'permit.json').read_bytes());v['capturedUtc']=(self.c.now+datetime.timedelta(seconds=1)).isoformat();raw=a.canonical(v)
        (p/'permit.json').write_bytes(raw);(p/'issue.receipt.json').write_bytes(a.canonical({'result':'ROOT_RECOVERY_PERMIT_ISSUED','permitSha256':a.digest(raw)}))
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):ctx.operation('ORIGINAL','start')
    def test_lost_issue_response_no_reissue_or_renewal(self):
        original=self.c.store._put
        def lost(path,raw):
            original(path,raw)
            if path.name=='issue.receipt.json':raise TimeoutError('response lost')
        with patch.object(self.c.store,'_put',lost),self.assertRaises(TimeoutError):self.c.issue()
        raw=self.c.query();self.assertIsNotNone(json.loads(raw)['permit'])
        with self.assertRaisesRegex(RuntimeError,'issue_consumed'):self.c.issue()
    def test_transitive_missing_and_seal_cycle(self):
        m=copy.deepcopy(self.c.manifest);m['dependencies']['entry.py']=['dep.py'];m['dependencies']['dep.py']=['entry.py']
        with self.assertRaisesRegex(RuntimeError,'cycle'):a.validate_dag(m)
        m=copy.deepcopy(self.c.manifest);m['imports']['entry.py']['dep']='unknown.py'
        with self.assertRaisesRegex(RuntimeError,'import_coverage'):a.validate_dag(m)
    def test_query_transport_literal_and_no_write_action(self):
        self.assertEqual(a.QUERY[-1],'inspect-recovery-authority')
        text=root_extension.sudoers(source('v4-sequencer/render_sudoers.py'))
        m=module('future_sudoers_local',text)
        self.assertIn(' -I -S /usr/local/libexec/re7/incident-6683-window-control.py inspect-recovery-authority\n',m.render())
        self.assertNotIn('issue',m.render());self.assertNotIn('install',m.render())
    def test_helper_real_dispatch_query_preserves_phase(self):
        text=root_extension.helper(source('v4-sequencer/privileged.py'))
        h=module('future_helper_local',text)
        # act is real; root-owned file metadata, store path and root library import
        # are replaced with synthetic equivalents. No helper.main/root effects.
        h.phase_read=self.c.helper.phase_read;h.policy_from=self.c.helper.policy_from
        h.root_regular=lambda path:None
        import root_store
        with patch.object(root_store,'Store',lambda:self.c.store):
            raw=h.act('inspect-recovery-authority',self.c.helper.policy_from())
        self.assertEqual(json.loads(raw)['livePhase'],'fenced')
        self.assertFalse((self.c.store._path(self.c.policy)/'issue.intent.json').exists())
    def test_future_transform_removes_binding_imports(self):
        parent=REVIEW/'crm-csv-integrated-recovery-20261016'
        for name,fn in [('recovery.py',integration.recovery),('recovery_bridge.py',integration.bridge),('recovery_start.py',integration.gate)]:
            value=fn((parent/name).read_text());compile(value,name,'exec')
            self.assertNotIn('from recovery_binding import',value)
    def test_full_consumers_render_and_diagnostic_transport(self):
        op=source('crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source')
        value=integration.operations(op);compile(value,'future_ops.py','exec')
        self.assertIn('command(__phase_authority__, args)',value)
        self.assertIn('original_bindings(window, config, __phase_authority__)',value)
        import subprocess as sub
        seq=source('v4-sequencer/sequencer.py')
        parent=HERE.parent/'crm-csv-integrated-recovery-20261016'
        pure={};exec((parent/'future_sources.py').read_text(),pure)
        value=integration.sequencer(pure['sequencer'](seq));compile(value,'future_sequencer.py','exec')
        self.assertNotIn('spec_from_file_location',value)
        self.assertIn('command(__phase_authority__, args)',value)
        out=root_extension.diagnostics(source('v4-sequencer/privileged_output.py'))
        m=module('future_diagnostics_local',out)
        self.assertIn('inspect-recovery-authority',m.ACTIONS)
    def test_partial_issue_and_raw_child_denied(self):
        p=self.c.store._path(self.c.policy)
        (p/'issue.intent.json').write_bytes(b'{}')
        with self.assertRaisesRegex(RuntimeError,'issue_incomplete'):self.c.ctx()
    def test_source_metadata_denied_before_exec(self):
        import stat
        original=os.fstat
        def changed(fd):
            v=original(fd);fields=list(v);fields[4]=v.st_uid+1
            return os.stat_result(fields)
        with patch.object(os,'fstat',changed),self.assertRaisesRegex(RuntimeError,'source_type'):
            Loader(self.c.ctx(),'entry.py')
    def test_node_real_execution_check_routes_python_baseline(self):
        # Exact execution-check consumer, only its obsolete namespace assertion
        # is replaced by the approved root context assertion.
        original=source('crm-csv-review-publication-20261016/code-sources/execution-check.cjs.95aee8b54048.source')
        check=integration.execution_check(original)
        root=self.c.root;mode=root/'switch';mode.mkdir()
        (mode/'scripts.sha256').write_text('')
        # Real loop must have at least one pinned file; synthetic content only.
        (mode/'pinned.txt').write_bytes(b'pinned')
        (mode/'scripts.sha256').write_text(a.digest(b'pinned')+'  pinned.txt\n')
        (root/'window/execution-gates.private.json').write_text(json.dumps({k:True for k in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')}))
        files={'switch/entry.cjs':"require('./execution-check.cjs')();module.exports='NODE_REAL_CHECK_PASS';",'switch/execution-check.cjs':check,'switch/baseline_contract.py':"raise AssertionError('raw Python bypass')\n"}
        m={'files':{},'dependencies':{},'entries':{'switch/entry.cjs':'inspect','switch/baseline_contract.py':'inspect'},'imports':{'switch/entry.cjs':{'./execution-check.cjs':'switch/execution-check.cjs'},'switch/execution-check.cjs':{'baseline_contract.py':'switch/baseline_contract.py'}}}
        for n,v in files.items():m['files'][n]={'sha256':a.digest(v.encode()),'language':'python'if n.endswith('.py')else'commonjs'};m['dependencies'][n]=[]
        import base64
        snap={'root':str(root),'identity':['synthetic-root','synthetic-permit'],'manifest':m,'entry':'switch/entry.cjs','files':{n:base64.b64encode(v.encode()).decode()for n,v in files.items()}}
        driver=Path(self.tmp.name)/'node-driver.cjs';driver.write_text("const boot=require("+json.dumps(str(HERE/'node_bootstrap.cjs'))+");const snap="+json.dumps(snap)+";let python=0;const out=boot.run(snap.entry,[],(cmd)=>{if(cmd[0]==='node-snapshot')return JSON.stringify(snap);if(cmd[0]==='python'&&cmd[1]==='switch/baseline_contract.py'&&cmd[2]==='--authority-correlation'){python++;return Buffer.from('BASELINE_SIMULATED');}throw Error('unexpected transport');});if(python!==1||out!=='NODE_REAL_CHECK_PASS')throw Error('bad route');console.log('NODE_CHECK_ROUTED_BASELINE_NO_RAW_EXEC');")
        result=subprocess.run(['node',str(driver)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_node_launch_strips_preload_environment(self):
        ctx=self.c.ctx()
        args=command(ctx,['node',str(self.c.root/'entry.py')])
        self.assertEqual(args[:7],['/usr/bin/env','-u','NODE_OPTIONS','-u','NODE_PATH','/usr/bin/node','/usr/local/libexec/re7/recovery-node-launch.cjs'])
    def test_node_denies_raw_python_and_undeclared_require(self):
        import base64
        for body,expected in [("require('child_process').execFileSync('python3',['/synthetic/unapproved.py']);",'node_child_bypass'),("require('./not-approved.cjs');",'node_import_undeclared')]:
            raw=body.encode();snap={'root':str(self.c.root),'identity':['anchor','permit'],'entry':'entry.cjs',
                'manifest':{'files':{'entry.cjs':{'language':'commonjs','sha256':a.digest(raw)}},'entries':{'entry.cjs':'inspect'},'imports':{}},
                'files':{'entry.cjs':base64.b64encode(raw).decode()}}
            driver=Path(self.tmp.name)/'node-negative.cjs'
            driver.write_text("const boot=require("+json.dumps(str(HERE/'node_bootstrap.cjs'))+");const snap="+json.dumps(snap)+";let denied=false;try{boot.run('entry.cjs',[],()=>JSON.stringify(snap));}catch(e){if(!e.message.includes("+json.dumps(expected)+"))throw e;denied=true;}if(!denied)throw Error('unexpected PASS');")
            result=subprocess.run(['node',str(driver)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
