"""Full ORIGINAL consumers; synthetic host boundary only. No VPS or product jobs."""
import json,unittest
from pathlib import Path
from lab import Lab,ORIGINAL,API,WORKER,MODES,PRIOR,sha
import datetime

class Chain(unittest.TestCase):
 def setUp(self):self.l=Lab();self.addCleanup(self.l.close)
 def run_original(self):
  try:return self.l.controller.recover('ORIGINAL')
  except Exception as e:
   if hasattr(self.l,'last_error'):raise AssertionError(str(e)+' / '+self.l.last_error)from e
   p=self.l.w/'step-output.private.jsonl'
   if p.exists():raise AssertionError(str(e)+' / '+json.loads(p.read_text().splitlines()[-1])['stderr'][:600])from e
   raise
 def test_complete_original_no_candidate_code(self):
  l=self.l;self.assertEqual(l.controller.inspect()['classification'],'STOPPED_UNSELECTED')
  r=self.run_original();self.assertEqual(r['result'],'CSV_ORIGINAL_PAIR_RESTORED')
  self.assertEqual(l.fx.crons,{'deploy':'before-deploy','system':'before-system'})
  self.assertFalse(l.fx.fenced);self.assertTrue(all(v is False for v in json.loads((l.w/'execution-gates.private.json').read_text()).values()))
  self.assertEqual(l.fx.d.calls.count('start:'+API),1);self.assertEqual(l.fx.d.calls.count('start:'+WORKER),1)
  self.assertTrue(all(not p.startswith(('switch/','return/','return-partial/'))for p in l.loaded))
  self.assertFalse(list((l.lab/'candidate').glob('*')))
  for mode in ('switch','return','return-partial'):
   self.assertFalse(list((l.root/mode).glob('*.py')))
   for n in ('plan.private.json','candidate.config.private.json','return.config.private.json','baseline.private.json','scripts.sha256'):
    self.assertTrue((l.root/mode/n).is_file())
  self.assertTrue((l.root/'switch/old-exit-confirmed.json').is_file())
  self.assertFalse(any(p.startswith(('switch/','return/','return-partial/'))for p in l.executed))
  self.assertTrue(l.executed)
  child=[json.loads(x)for x in (l.lab/'child-executed.jsonl').read_text().splitlines()]
  self.assertTrue(any('node'in x for x in child));self.assertTrue(any('python'in x for x in child))
  self.assertTrue(all(not str(next(iter(x.values()))).startswith(('switch/','return/','return-partial/'))for x in child))
  l.capture_summary();self.assertEqual(l.summary['bindingEntries'],2)
  for key in ['window/original_checks.py:check_original','window/recovery_contract.py:__init__',ORIGINAL+'/ops.py:certificate','window/prestop_contract.py:path_bindings','window/recovery_start.py:authorize_original_start',ORIGINAL+'/db_owner_set_gate.py:verify','window/recovery_bridge.py:verify_recovery_closure','window/recovery_bridge.py:verify_recovery_gates_false']:
   self.assertGreater(l.summary['verifierCalls'].get(key,0),0,key)
  self.assertEqual(l.controller.inspect()['classification'],'RECOVERY_CONSUMED')
  calls=list(l.fx.d.calls)
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):l.controller.recover('ORIGINAL')
  self.assertEqual(calls,l.fx.d.calls)

 def no_start(self):
  self.assertFalse(any(x.startswith('start:')for x in self.l.fx.d.calls))
  self.assertFalse((self.l.w/'csv-recovery.intent.private.json').exists())
 def test_previous_transport_counterexample(self):
  self.l.close();self.l=Lab(kit=PRIOR/'static-kit');self.addCleanup(self.l.close)
  self.assertEqual(self.l.controller.inspect()['options'],['ORIGINAL'])
  with self.assertRaisesRegex(RuntimeError,'protocol_failed'):self.l.controller.recover('ORIGINAL')
  self.assertIn("unexpected keyword argument 'pass_fds'",self.l.last_error)
  self.assertFalse(any(x.startswith('start:')for x in self.l.fx.d.calls))
  self.assertTrue((self.l.w/'csv-recovery.intent.private.json').exists())
  self.assertFalse((self.l.w/'csv-recovery.receipt.private.json').exists())
 def test_missing_exit_evidence_denies_not_prestop(self):
  (self.l.root/'switch/old-exit-confirmed.json').unlink()
  with self.assertRaisesRegex(RuntimeError,'prestop_process_population'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_sealed_data_tamper_four_modes_denies(self):
  p=self.l.root/'return/plan.private.json';v=json.loads(p.read_text());v['direction']='tampered';p.write_text(json.dumps(v))
  with self.assertRaisesRegex(RuntimeError,'mode_hash_drift|recovery_reference_drift'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_restore_evidence_absent_denies(self):
  (self.l.w/'original-restore-proof.private.json').unlink()
  with self.assertRaises(FileNotFoundError):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_restore_evidence_adulterated_denies(self):
  (self.l.w/'restore-result.json').write_text('{}')
  with self.assertRaisesRegex(RuntimeError,'binding_hash'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_certificate_old_generation_even_with_matching_inventory_denies(self):
  p=self.l.root/'switch/old-exit-confirmed.json';v=json.loads(p.read_text());v['generation']=37;p.write_text(json.dumps(v))
  self.l.exit_imports('switch')
  with self.assertRaisesRegex(RuntimeError,'guard_generation_changed'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_certificate_direction_divergence_denies(self):
  p=self.l.root/'switch/old-exit-confirmed.json';v=json.loads(p.read_text());v['direction']='wrong';p.write_text(json.dumps(v))
  self.l.exit_imports('switch')
  with self.assertRaisesRegex(RuntimeError,'stale_or_wrong_certificate'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_certificate_inventory_hash_divergence_denies(self):
  p=self.l.w/'csv-imports-switch-after-exit.private.json';v=json.loads(p.read_text());v['exitCertificateSha256']='0'*64;p.write_text(json.dumps(v))
  with self.assertRaisesRegex(RuntimeError,'import_exit_binding'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_candidate_selection_intent_denies(self):
  self.l.write('window/csv-selection.intent.private.json',{})
  self.assertEqual(self.l.controller.inspect()['classification'],'UNCERTAIN_SELECTION')
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_confirmed_selection_never_original(self):
  p=self.l.write('window/csv-selection.intent.private.json',{'targetProfileSha256':sha((self.l.w/'target.profile.private.json').read_bytes()),'automaticRetry':False})
  self.l.write('window/csv-selection.receipt.private.json',{'result':'CSV_CANDIDATE_SELECTED','targetProfileSha256':sha((self.l.w/'target.profile.private.json').read_bytes()),'intentSha256':sha(p.read_bytes())})
  view=self.l.controller.inspect();self.assertEqual(view['options'],['CANDIDATE'])
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_uncertain_candidate_start_denies(self):
  self.l.write('return/start-intent-'+API+'.json',{})
  self.assertEqual(self.l.controller.inspect()['classification'],'UNCERTAIN_START')
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_candidate_admission_event_denies(self):
  self.l.fx.admissions=1
  with self.assertRaisesRegex(RuntimeError,'candidate_admission'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_execution_exchange_before_recovery_denies(self):
  self.l.write('window/csv-execution.intent.private.json',{'different':'E2'})
  with self.assertRaisesRegex(RuntimeError,'execution_changed'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_authority_exchange_denies(self):
  p=self.l.bundle['permit'];p['capturedUtc']=(self.l.now+datetime.timedelta(seconds=1)).isoformat()
  self.l.bundle['permitSha256']=sha(self.l.authority.canonical(p))
  with self.assertRaisesRegex(RuntimeError,'authority_replaced'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_expired_permit_denies(self):
  self.l.now+=datetime.timedelta(seconds=601)
  with self.assertRaisesRegex(RuntimeError,'permit_expired'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_query_response_lost_before_recovery_denies(self):
  def lost():raise TimeoutError('synthetic query response lost')
  self.l.ctx.query=lost
  with self.assertRaises(TimeoutError):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_start_response_lost_consumed_without_complete_or_replay(self):
  l=self.l;l.failure='start-lost'
  with self.assertRaisesRegex(RuntimeError,'protocol_failed'):l.controller.recover('ORIGINAL')
  self.assertIn('start:'+API,l.fx.d.calls);self.assertNotIn('start:'+WORKER,l.fx.d.calls)
  self.assertFalse((l.w/'csv-recovery.receipt.private.json').exists())
  self.assertTrue(list((l.root/ORIGINAL).glob('owner-proof-start-*.consumed.json')))
  self.assertEqual(l.controller.inspect()['classification'],'RECOVERY_CONSUMED')
  calls=list(l.fx.d.calls)
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):l.controller.recover('ORIGINAL')
  self.assertEqual(calls,l.fx.d.calls)
 def test_execution_exchange_between_api_worker_denies(self):
  l=self.l;l.after_api=lambda:l.write('window/csv-execution.intent.private.json',{'changed':'E2'})
  with self.assertRaises(RuntimeError):l.controller.recover('ORIGINAL')
  self.assertIn('start:'+API,l.fx.d.calls);self.assertNotIn('start:'+WORKER,l.fx.d.calls)
  self.assertFalse((l.w/'csv-recovery.receipt.private.json').exists())
 def test_unfence_response_lost_no_complete_or_replay(self):
  l=self.l;l.failure='unfence-lost'
  with self.assertRaises(RuntimeError):l.controller.recover('ORIGINAL')
  self.assertFalse(l.fx.fenced);self.assertFalse((l.w/'csv-recovery.receipt.private.json').exists())
  calls=list(l.fx.d.calls)
  with self.assertRaisesRegex(RuntimeError,'explicit_decision'):l.controller.recover('ORIGINAL')
  self.assertEqual(calls,l.fx.d.calls)
 def test_prestop_controls_no_start(self):
  self.l.close();self.l=Lab(prestop=True);self.addCleanup(self.l.close)
  self.assertEqual(self.l.controller.inspect()['classification'],'PRESTOP')
  r=self.l.controller.recover('PRESTOP');self.assertEqual(r['result'],'CSV_PRESTOP_CONTROLS_RESTORED')
  self.assertFalse(any(x.startswith('start:')for x in self.l.fx.d.calls))
  self.assertEqual(self.l.fx.crons,{'deploy':'before-deploy','system':'before-system'})
 def test_original_binding_race_before_worker_denies(self):
  l=self.l;l.after_api=lambda:l.write('window/original-bindings/path-bindings.private.json',{'changed':'binding'})
  with self.assertRaisesRegex(RuntimeError,'protocol_failed|review_hash_drift'):l.controller.recover('ORIGINAL')
  self.assertNotIn('start:'+WORKER,l.fx.d.calls);self.assertFalse((l.w/'csv-recovery.receipt.private.json').exists())

 def test_missing_original_bindings_denies(self):
  (self.l.w/'original-bindings/path-bindings.private.json').unlink()
  with self.assertRaises(FileNotFoundError):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_gate_false_denies_before_intent(self):
  p=self.l.w/'execution-gates.private.json';v=json.loads(p.read_text());v['ownerAuthorized']=False;p.write_text(json.dumps(v))
  with self.assertRaisesRegex(RuntimeError,'recovery_admission_gates'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_old_identity_reappears_denies_exit_certificate(self):
  report=json.loads((self.l.root/'switch/stop-start.json').read_text());pid,identity=next(iter(report['trees'][API].items()))
  self.l.fx.d.proc[pid]=identity
  with self.assertRaisesRegex(RuntimeError,'old_executor_alive'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_original_code_replaced_denies_before_import(self):
  (self.l.root/ORIGINAL/'ops.py').write_text('raise AssertionError("unverified replacement")')
  with self.assertRaisesRegex(RuntimeError,'mode_hash_drift|source_hash'):self.l.controller.recover('ORIGINAL')
  self.no_start()
 def test_delegated_fd_interface_and_sudo_deny_shared_all_modes(self):
  l=self.l;hashes={l.plan['files'][m+'/delegated.py']['sha256']for m in MODES};self.assertEqual(len(hashes),1)
  loader=l.loader_module.Loader(l.ctx,ORIGINAL+'/delegated.py',trusted_modules={'authority':l.authority,'child_transport':l.transport})
  module=loader.module(ORIGINAL+'/delegated.py');before=list(l.effects)
  with self.assertRaisesRegex(RuntimeError,'executor_must_not_use_sudo'):module.DelegatedSystem(l.root/ORIGINAL,'recover-partial').run(['sudo','forbidden'],pass_fds=(123,))
  self.assertEqual(before,l.effects)

 def test_data_symlink_race_before_worker_denies(self):
  l=self.l;app=l.fx.source['apps'][1];link=Path(app['cwd'])/'.data';other=l.lab/'unexpected-shared';other.mkdir()
  def changed():link.unlink();link.symlink_to(other,target_is_directory=True)
  l.after_api=changed
  with self.assertRaisesRegex(RuntimeError,'protocol_failed'):l.controller.recover('ORIGINAL')
  self.assertIn('auth_binding_drift',l.last_error)
  self.assertNotIn('start:'+WORKER,l.fx.d.calls);self.assertFalse((l.w/'csv-recovery.receipt.private.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
