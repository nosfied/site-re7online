"""Focused R1/R2 regression. Real consumers; synthetic files and external effects."""
import ast
import hashlib
import json
import os
import stat
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import test_recovery as t
from inputs import source
import original_checks


class Corrections(t.RecoveryTests):
    def deny_before_effects(self, reason=None):
        calls=list(self.fx.d.calls);root=list(self.fx.root_calls)
        with self.assertRaises(Exception) as error:self.run_cli('ORIGINAL')
        if reason:self.assertIn(reason,str(error.exception))
        self.assertEqual(self.fx.d.calls,calls)
        # read-only root inspection may run; effectful actions may not.
        self.assertFalse(any(a in ('authorize-return','unfence','restore-controls','abort-prestop') for a in self.fx.root_calls[len(root):]))
        self.assertFalse((self.fx.w/'csv-recovery.intent.private.json').exists())
        self.assert_no_completion()
    def certificate(self, **changes):
        self.fx.stopped()
        p=self.fx.root/'switch/old-exit-confirmed.json';v=t.c.read(p);v.update(changes);p.write_text(json.dumps(v))
        q=self.fx.w/'csv-imports-switch-after-exit.private.json';v=t.c.read(q);v['exitCertificateSha256']=t.c.sha(p);q.write_text(json.dumps(v))
    def test_previous_generation_consistent_inventory_denied(self):
        self.certificate(generation=37)
        # Same exact files rejected by the final Operations consumer and decision.
        with self.assertRaisesRegex(RuntimeError,'guard_generation_changed'):
            t.ops.Operations(self.fx.root/'switch',self.fx.d).certificate('old-exit-confirmed.json',t.c.API)
        self.deny_before_effects('guard_generation_changed')
    def test_old_generation_even_without_inventory_update_denied(self):
        self.fx.stopped();p=self.fx.root/'switch/old-exit-confirmed.json';v=t.c.read(p);v['generation']=37;p.write_text(json.dumps(v))
        self.deny_before_effects('guard_generation_changed')
    def test_certificate_direction_and_config_denied(self):
        self.certificate(direction='other',configHash='0'*64)
        self.deny_before_effects('stale_or_wrong_certificate')
    def test_certificate_identity_reappearance_denied(self):
        self.fx.stopped();cert=t.c.read(self.fx.root/'switch/old-exit-confirmed.json')
        # Reappearance of an original captured process, not a real process.
        pid,identity=next(iter(cert['trees'][t.c.API].items()))
        self.fx.d.proc[str(pid)]=identity
        self.deny_before_effects()
    def test_original_never_reads_candidate_runtime(self):
        self.fx.stopped();candidate=Path(self.fx.target['apps'][0]['cwd'])
        original_bytes=Path.read_bytes;original_text=Path.read_text;original_stat=Path.lstat
        def guarded(fn):
            def call(path,*a,**kw):
                if path==candidate or candidate in path.parents:
                    raise AssertionError('candidate_only_runtime_access_forbidden')
                return fn(path,*a,**kw)
            return call
        with patch.object(Path,'read_bytes',guarded(original_bytes)),patch.object(Path,'read_text',guarded(original_text)),patch.object(Path,'lstat',guarded(original_stat)):
            self.assertEqual(self.run_cli('ORIGINAL')['result'],'CSV_ORIGINAL_PAIR_RESTORED')
    def test_immutable_content_drift_denied(self):
        self.fx.stopped();Path(self.fx.source['apps'][0]['script']).write_bytes(b'// drift\n')
        self.deny_before_effects('immutable_live_drift')
    def test_immutable_metadata_denied(self):
        self.fx.stopped();p=Path(self.fx.source['apps'][0]['script']);original=Path.lstat
        def meta(q,*a,**kw):
            v=original(q,*a,**kw)
            if q==p:
                fields=list(v);fields[0]=(v.st_mode&~0o777)|0o644;return os.stat_result(fields)
            return v
        with patch.object(Path,'lstat',meta):self.deny_before_effects('immutable_live_drift')
    def test_sealed_metadata_denied(self):
        self.fx.stopped();p=self.fx.root/t.c.ORIGINAL/'ops.py';original=Path.lstat
        def meta(q,*a,**kw):
            v=original(q,*a,**kw)
            if q==p:
                fields=list(v);fields[0]=(v.st_mode&~0o777)|0o644;return os.stat_result(fields)
            return v
        with patch.object(Path,'lstat',meta):self.deny_before_effects('sealed_file_type_owner_mode')
    def test_sealed_owner_and_hardlink_denied(self):
        self.fx.stopped();p=self.fx.root/t.c.ORIGINAL/'ops.py';original=Path.lstat
        for field,value in ((4,os.getuid()+1),(3,2)):
            def meta(q,*a,**kw):
                v=original(q,*a,**kw)
                if q==p:
                    fields=list(v);fields[field]=value;return os.stat_result(fields)
                return v
            with self.subTest(field=field),patch.object(Path,'lstat',meta):self.deny_before_effects('sealed_file_type_owner_mode')
    def test_missing_sealed_file_denied(self):
        self.fx.stopped();p=self.fx.root/t.c.ORIGINAL/'ops.py';original=Path.read_bytes
        def read(q):
            if q==p:raise FileNotFoundError('synthetic_missing_sealed_file')
            return original(q)
        with patch.object(Path,'read_bytes',read):self.deny_before_effects('synthetic_missing')
    def test_sealed_replaced_symlink_denied(self):
        self.fx.stopped();p=self.fx.root/t.c.ORIGINAL/'ops.py';original=Path.is_symlink
        with patch.object(Path,'is_symlink',lambda q:q==p or original(q)):
            self.deny_before_effects('sealed_file_type_owner_mode')
    def test_sealed_integrity_denied(self):
        self.fx.stopped();(self.fx.root/t.c.ORIGINAL/'ops.py').write_text('# substituted\n')
        self.deny_before_effects('mode_hash_drift')
    def test_read_failure_denied(self):
        self.fx.stopped();p=self.fx.w/'csv-contract.private.json';original=Path.read_text
        def read(q,*a,**kw):
            if q==p:raise PermissionError('synthetic_unreadable')
            return original(q,*a,**kw)
        with patch.object(Path,'read_text',read):self.deny_before_effects('synthetic_unreadable')
    def test_immutable_reference_list_change_denied(self):
        self.fx.stopped();p=self.fx.w/'csv-contract.private.json';v=t.c.read(p);v['immutable']=[];p.write_text(json.dumps(v))
        self.deny_before_effects('original_canonical_input_drift')
    def test_canonical_checker_reproduced_exactly(self):
        expected=t.future_sources.original_checker(source('canonical_contract.py'))
        self.assertEqual(Path(original_checks.__file__).read_text(),expected)
        # Predicate bodies remain the exact versioned canonical AST.
        old=ast.parse(source('canonical_contract.py'));new=ast.parse(expected)
        for name in ('read_permission','read','require','sha'):
            a=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name==name)
            b=next(n for n in new.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
    def reseal_review(self, text):
        p=self.fx.root/'original-preparation-review.sha256';p.write_text(text)
        seal_path=self.fx.w/'recovery-contract.private.json';seal=t.c.read(seal_path)
        seal['originalReviewSha256']=t.c.sha(p);seal_path.write_text(json.dumps(seal))
        self.fx.digest=t.c.sha(seal_path);self.fx.controller.digest=self.fx.digest
        sys.modules['recovery_binding'].RECOVERY_CONTRACT_SHA256=self.fx.digest
    def test_explicitly_pinned_empty_review_denied(self):
        self.fx.stopped();self.reseal_review('')
        self.deny_before_effects('original_review_coverage')
    def test_explicitly_pinned_incomplete_review_denied(self):
        self.fx.stopped();p=self.fx.root/'original-preparation-review.sha256'
        self.reseal_review(''.join(line for line in p.read_text().splitlines(True) if 'original-bindings/' not in line))
        self.deny_before_effects('original_review_coverage')
    def test_original_review_missing_denied(self):
        self.fx.stopped();p=self.fx.root/'original-preparation-review.sha256';original=Path.read_bytes
        def read(q):
            if q==p:raise FileNotFoundError('original_review_absent')
            return original(q)
        with patch.object(Path,'read_bytes',read):self.deny_before_effects('original_review_absent')
    def test_checker_canonical_blocks_unchanged(self):
        old=ast.parse(source('canonical_contract.py'));new=ast.parse(Path(original_checks.__file__).read_text())
        before=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name=='check')
        after=next(n for n in new.body if isinstance(n,ast.FunctionDef) and n.name=='check_original')
        # Entire immutable and mode loops, not just helper names or test order.
        for target in ('e','mode'):
            a=next(n for n in before.body if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id==target)
            b=next(n for n in after.body if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id==target)
            self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
    def test_generation_race_before_intent_denied(self):
        self.fx.stopped();original=self.fx.b.verify_recovery_admission
        def admission():
            original();p=self.fx.root/'switch/old-exit-confirmed.json';v=t.c.read(p);v['generation']=37;p.write_text(json.dumps(v))
        self.fx.b.verify_recovery_admission=admission
        self.deny_before_effects('guard_generation_changed')


# Reuse only affected interface proofs; do not discover the whole suite42.
INTERFACES=('test_confirmed_selection_only_candidate','test_candidate_api_partial_known_returns_candidate',
            'test_candidate_pair_known_returns_candidate','test_stopped_original_cli_full_sequence_without_overlay','test_prestop_explicit_controls_closure',
            'test_consumed_recovery_no_second_start','test_start_lost_response_no_replay_or_false_complete',
            'test_event775_denies_execute_but_original_recovers','test_binding_missing_denies_execute_before_controls',
            'test_shared_binding_revalidation_at_original_start',
            'test_uncertain_selection_never_original','test_missing_candidate_binding_does_not_block_original')

def suite():
    result=unittest.TestSuite(Corrections(n) for n in Corrections.__dict__ if n.startswith('test_'))
    for name in INTERFACES:
        if not hasattr(t.RecoveryTests,name):raise RuntimeError('focused_interface_test_missing:'+name)
        result.addTest(t.RecoveryTests(name))
    return result

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(suite())
    print(json.dumps({'result':'FOCUSED_CORRECTIONS_PASS' if result.wasSuccessful() else 'DENY',
                      'testsRun':result.testsRun,'externalEffects':'SIMULATED','productionTouched':False}))
    sys.exit(not result.wasSuccessful())
