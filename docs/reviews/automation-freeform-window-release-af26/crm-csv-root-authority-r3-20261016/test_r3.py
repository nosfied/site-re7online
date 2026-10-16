"""R3 on concrete Operations/gate/Context and one-shot Store, synthetic OS only.
Run via reproduce.py: the pinned predecessor and dependencies are isolated there.
"""
import datetime
import json
from pathlib import Path
import types
import unittest
from contextlib import nullcontext
from unittest.mock import patch
import authority as a
import integration
import test_connected as connected
from test_connected import load, t
from root_store import Store

BEFORE = load('integration_before_r3', Path(__file__).with_name('integration_before_r3.py').read_text())

class Forward(connected.Connected):
    def prepare(self, old=False, forward_entry=False):
        self.connect('PRESTOP')
        f=self.fx
        # Actual stop certificate and selection readers; only Driver's OS effects
        # are synthetic. The fixture's recovery-policy change is NOT a forward step.
        f.stopped()
        self.select()
        self.install_store(forward_entry)
        transform=BEFORE if old else integration
        self.ops=load('ops_forward_r3', transform.operations(t.source('operations_recovery_original.py')),
                      __phase_authority__=self.context)
        t.ops=self.ops
        self.ops.System=lambda:f.d
        return f
    def select(self):
        f=self.fx
        t.put(f.w/'csv-selection.intent.private.json',{'targetProfileSha256':t.c.sha(f.w/'target.profile.private.json'),'automaticRetry':False})
        t.put(f.w/'csv-selection.receipt.private.json',{'result':'CSV_CANDIDATE_SELECTED','targetProfileSha256':t.c.sha(f.w/'target.profile.private.json'),'intentSha256':t.c.sha(f.w/'csv-selection.intent.private.json')})
    def install_store(self, forward_entry=False):
        f=self.fx;b=dict(self.context.bundle)
        if forward_entry:
            # New synthetic owner-approved manifest, before its only installation.
            # No editing of a sealed Store and no emitted recovery permit.
            manifest=json.loads(json.dumps(b['manifest']))
            for name,scope in [('switch/forward.py','forward'),('return/recovery.py','recovery')]:
                file=f.root/name;file.write_text('value=7\n');meta=file.stat()
                manifest['files'][name]={'sha256':a.digest(file.read_bytes()),'language':'python','uid':meta.st_uid,'mode':meta.st_mode&0o777}
                manifest['dependencies'][name]=[];manifest['entries'][name]=scope
            anchor=dict(b['anchor'],codeManifestSha256=a.digest(a.canonical(manifest)))
            b.update(anchor=anchor,anchorSha256=a.digest(a.canonical(anchor)),manifest=manifest)
        folder=Path(self.temp.name)/'synthetic-root-store';folder.mkdir()
        self.store=Store(folder,read=lambda p:Path(p).read_bytes(),now=lambda:self.now,
                         lock_path=folder/'lock',directory_check=lambda p:None)
        self.helper=types.SimpleNamespace(policy_from=lambda:{'policySha256':f.policy_hash,'preparation':str(f.root)},
            phase_read=lambda:{'stage':'fenced' if f.fenced else 'complete','policySha256':f.policy_hash},
            guard_closed=lambda:None,nft_present=lambda:None)
        with patch('os.geteuid',lambda:0),patch.object(self.store,'_owner_lock',lambda:nullcontext()):
            self.store.install_owner_once(a.canonical(b['anchor']),a.canonical(b['manifest']),
                b['anchorSha256'],a.digest(a.canonical(b['manifest'])),owner_action=True)
        self.context=a.Context(lambda:self.store.query_locked(self.helper),now=lambda:self.now)
    def issue(self):
        with patch('os.geteuid',lambda:0),patch.object(self.store,'_owner_lock',lambda:nullcontext()):
            return self.store.issue_owner_once(self.helper,'CANDIDATE',
                t.c.sha(self.fx.w/'csv-execution.intent.private.json'),owner_action=True)
    def start(self,name):
        self.ops.Operations(self.fx.root/'switch',self.fx.d).start(name)
    def assert_not_started(self):
        self.assertFalse(any(x.startswith('start:')for x in self.fx.d.calls))
    def test_r3_before_no_permit_denies_before_start_intent(self):
        f=self.prepare(old=True)
        with self.assertRaisesRegex(RuntimeError,'authority_permit_required'):self.start(t.c.API)
        self.assert_not_started();self.assertFalse((f.root/'switch'/('start-intent-'+t.c.API+'.json')).exists())
    def test_r3_before_later_real_issue_replaces_context_no_retry(self):
        self.prepare(old=True)
        with self.assertRaisesRegex(RuntimeError,'authority_permit_required'):self.start(t.c.API)
        raw=self.issue();self.assertEqual(json.loads(raw)['decision'],'CANDIDATE')
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):self.start(t.c.API)
        with self.assertRaisesRegex(RuntimeError,'issue_consumed'):self.issue()
        self.assert_not_started()
    def test_forward_real_pair_without_recovery_permit(self):
        f=self.prepare();identity=self.context.identity
        sequence=t.seq.Sequencer(f.b);sequence.baseline=t.c.read(f.w/'csv-baseline.private.json')
        sequence.start_pair('switch')
        self.assertEqual([x for x in f.d.calls if x.startswith('start:')],['start:'+t.c.API,'start:'+t.c.WORKER])
        self.assertEqual(self.context.identity,identity);self.assertIsNone(self.context.bundle['permit'])
        self.assertFalse((self.store._path(f.policy_hash)/'issue.intent.json').exists())
        self.assertFalse((f.w/'csv-recovery.intent.private.json').exists())
    def test_forward_canonical_sequencer_rejects_each_missing_gate(self):
        f=self.prepare();sequence=t.seq.Sequencer(f.b)
        original=f.b.run
        def readonly(args,**kw):
            if args==['sha256sum','-c','scripts.sha256']:
                directory=Path(kw['cwd'])
                for line in (directory/'scripts.sha256').read_text().splitlines():
                    expected,name=line.split('  ',1)
                    self.assertEqual(t.c.sha(directory/name),expected)
                return ''
            return original(args,**kw)
        f.b.run=readonly
        p=f.w/'execution-gates.private.json';gates=json.loads(p.read_text())
        for key in gates:
            p.write_text(json.dumps(dict(gates,**{key:False})))
            with self.subTest(gate=key),self.assertRaisesRegex(RuntimeError,'execution_gates_incomplete'):
                sequence.eligible()
        p.write_text(json.dumps(gates));self.assert_not_started()
    def test_forward_start_gate_selection_negative(self):
        f=self.prepare();(f.w/'csv-selection.receipt.private.json').unlink()
        with self.assertRaisesRegex(RuntimeError,'candidate_selection_absent'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_wrong_selection_hash_negative(self):
        f=self.prepare();p=f.w/'csv-selection.receipt.private.json';v=json.loads(p.read_text());v['targetProfileSha256']='f'*64;p.write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'selection_unproven'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_old_exit_generation_denied(self):
        f=self.prepare();p=f.root/'switch/old-exit-confirmed.json';v=json.loads(p.read_text());v['generation']=37;p.write_text(json.dumps(v))
        with self.assertRaisesRegex(RuntimeError,'guard_generation_changed'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_owner_and_restore_still_denied(self):
        f=self.prepare();f.d.db={'otherClientBackends':1,'advisoryLocks':0}
        with self.assertRaisesRegex(RuntimeError,'unknown_db_owner'):self.start(t.c.API)
        f.d.db={'otherClientBackends':0,'advisoryLocks':0};f.d.restore_valid=False
        with self.assertRaisesRegex(RuntimeError,'restore'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_contract_profile_and_phase_negative(self):
        f=self.prepare();f.fenced=False
        with self.assertRaisesRegex(RuntimeError,'authority_forward_phase'):self.start(t.c.API)
        f.fenced=True;p=f.w/'target.profile.private.json';raw=p.read_bytes();p.write_bytes(raw+b' ')
        with self.assertRaisesRegex(RuntimeError,'authority_forward_profile'):self.start(t.c.API)
        p.write_bytes(raw);(f.w/'recovery-contract.private.json').write_bytes(b'{}')
        with self.assertRaisesRegex(RuntimeError,'authority_forward_contract'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_new_context_with_recovery_permit_cannot_start_switch(self):
        self.prepare();self.issue();self.context=a.Context(lambda:self.store.query_locked(self.helper),now=lambda:self.now)
        self.ops.__phase_authority__=self.context
        with self.assertRaisesRegex(RuntimeError,'authority_forward_recovery_conflict'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_issue_between_api_worker_blocks_second_start(self):
        f=self.prepare();self.start(t.c.API);self.issue()
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):self.start(t.c.WORKER)
        self.assertNotIn('start:'+t.c.WORKER,f.d.calls)
    def test_forward_execution_change_between_api_worker_denies(self):
        f=self.prepare();self.start(t.c.API);(f.w/'csv-execution.intent.private.json').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'authority_forward_execution_drift'):self.start(t.c.WORKER)
        self.assertNotIn('start:'+t.c.WORKER,f.d.calls)
    def test_forward_revalidation_after_start_intent_before_effect(self):
        f=self.prepare();op=self.ops.Operations(f.root/'switch',f.d);write=op.write_once
        def changed(name,value):
            write(name,value)
            if name.startswith('start-intent-'):self.issue()
        op.write_once=changed
        with self.assertRaisesRegex(RuntimeError,'authority_replaced'):op.start(t.c.API)
        self.assert_not_started();self.assertTrue((f.root/'switch'/('start-intent-'+t.c.API+'.json')).exists())
    def test_forward_consumed_or_recovery_blocks_no_replay(self):
        f=self.prepare();t.put(f.w/'csv-recovery.intent.private.json',{})
        with self.assertRaisesRegex(RuntimeError,'authority_forward_consumed_or_recovery'):self.start(t.c.API)
        self.assert_not_started()
    def test_forward_start_consumed_does_not_repeat_effect(self):
        f=self.prepare();self.start(t.c.API);before=list(f.d.calls)
        with self.assertRaises(RuntimeError):self.start(t.c.API)
        self.assertEqual(before,f.d.calls)
    def test_forward_response_lost_no_replay_or_complete(self):
        f=self.prepare();f.d.fail='start-lost'
        with self.assertRaises(TimeoutError):self.start(t.c.API)
        before=list(f.d.calls)
        with self.assertRaises(RuntimeError):self.start(t.c.API)
        self.assertEqual(before,f.d.calls);self.assertFalse((f.w/'csv-complete.receipt.private.json').exists())
    def test_forward_snapshot_scope_before_import_no_recovery_permit(self):
        self.prepare(forward_entry=True)
        from verified_loader import Loader
        self.assertEqual(Loader(self.context,'switch/forward.py').execute().value,7)
        with self.assertRaisesRegex(RuntimeError,'authority_permit_required'):
            Loader(self.context,'return/recovery.py')
        self.assertIsNone(self.context.bundle['permit'])
    def test_forward_mode_scope_and_unknown_entry_denied(self):
        self.prepare()
        with self.assertRaisesRegex(RuntimeError,'authority_start_mode_scope'):self.context.start_mode(self.fx.root/'alien')
        with self.assertRaisesRegex(RuntimeError,'authority_entry_denied'):self.context.snapshot('switch/unknown.py')


def load_tests(loader,tests,pattern):
    suite=unittest.TestSuite(Forward(name) for name in sorted(Forward.__dict__) if name.startswith('test_'))
    # Re-run only directly affected Operations/Context recovery and prevention
    # interfaces. Baseline/Node and unaffected graph tests are reused, not rerun.
    for name in ('test_original_real_checker_certificates_controls_and_replay','test_prestop_no_permit_and_no_start',
                 'test_candidate_compatible_only','test_authority_replacement_between_api_worker_no_complete',
                 'test_expiry_between_api_worker_no_complete','test_lost_start_response_no_replay_or_complete',
                 'test_uncertain_selection_no_original','test_old_generation_still_denied',
                 'test_prevention_binding_still_before_effects','test_prevention_event775_still_before_effects'):
        suite.addTest(connected.Connected(name))
    return suite

if __name__=='__main__':unittest.main(verbosity=2)
