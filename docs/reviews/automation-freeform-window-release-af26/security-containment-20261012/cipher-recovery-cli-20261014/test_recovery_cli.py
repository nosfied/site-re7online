"""Exact CLI argv, canonical sequencer/consumers; isolated process bridge, no production."""
import contextlib,hashlib,importlib.util,io,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'cipher-locked-v4-20261014'
sys.path.insert(0,str(OLD));sys.path.insert(0,str(HERE))
import test_locked_v4 as fixture
sys.path.insert(0,str(HERE.parent/'cipher-volatile-protocol-20261014'));sys.path.insert(0,str(HERE.parent/'remaining-v2-20261014'))
import locked_cli as cli
import recovery_actions
from locked_plan import digest
from credential_boundary import CredentialBoundary

def write(p,v):fixture.previous.write(p,v)
class Tests(unittest.TestCase):
 def setUp(self):
  fixture.Tests.setUp(self);self.driver.w=self.b.window;self.driver.approved={'synthetic':'approved'};self.driver.spec={'phaseId':'synthetic-phase'}
  write(self.b.window/'sequencer-manifest.json',{'filesSha256':{}})
  (self.b.root/'execution-authorized').write_text('true\n')
  seal=self.driver.seal
  def bound_seal(proof):
   try:return seal(proof)
   finally:
    if self.driver.boundary:
     p=self.b.window/'seal-current';write(p/'source.private.json',{'synthetic':'source'});write(p/'plan.private.json',{})
     self.driver.hash=hashlib.sha256((p/'plan.private.json').read_bytes()).hexdigest();self.driver.boundary.plan_hash=self.driver.hash
     write(p/'intent.private.json',{'phaseId':'synthetic-phase','planHash':self.driver.hash,'sourceHash':recovery_actions.sha(p/'source.private.json'),'scopeHash':digest(self.driver.approved)})
     write(self.b.window/'credential-commit.intent.private.json',{'planSha256':self.driver.hash,'sealIntentSha256':recovery_actions.sha(p/'intent.private.json')})
     if (self.b.window/'credential-commit.receipt.private.json').exists():write(self.b.window/'credential-commit.receipt.private.json',self.driver.boundary.envelope(fixture.VERIFIED))
  self.driver.seal=bound_seal
 def tearDown(self):fixture.Tests.tearDown(self)
 def invoke(self,*flags):
  with patch.object(cli,'Bridge',return_value=self.b),patch.object(cli,'Driver',return_value=self.driver),patch.object(cli,'sequencer',fixture.previous.v4),patch.object(cli,'coverage',return_value=self.proof),contextlib.redirect_stdout(io.StringIO()):return cli.main([str(self.b.root),*flags])
 def failure(self,kind):
  self.driver.failure=kind
  with self.assertRaises(RuntimeError):self.invoke()
 def branch(self,expected):
  suffix='original'if expected=='ORIGINAL_VERIFIED'else'verified'
  r=self.invoke('--recovery-action','record-'+suffix,'--operator-decision',expected);self.assertEqual(r['classification'],expected)
  r=self.invoke('--recovery-action','recover-'+suffix,'--operator-decision',expected);self.assertEqual(r['result'],'RECOVERY_COMPLETE')
  self.assertEqual(self.driver.calls,1)
  with self.assertRaisesRegex(RuntimeError,'consumed'):self.invoke('--recovery-action','recover-'+suffix,'--operator-decision',expected)
 def test_cli_original_precommit(self):
  self.failure('before');self.branch('ORIGINAL_VERIFIED');self.assertEqual(self.b.live[fixture.previous.API]['cfg']['env'][fixture.previous.KEYS[0]],'synthetic-old-'+fixture.previous.KEYS[0])
 def test_cli_lost_commit_response(self):
  self.failure('uncertain');self.assertEqual(self.invoke('--inspect-readonly')['result'],'VERIFIED');self.branch('VERIFIED');self.assertEqual(self.b.live[fixture.previous.API]['cfg']['env'][fixture.previous.KEYS[0]],'synthetic-new-'+fixture.previous.KEYS[0])
 def test_cli_ambiguous_denies(self):
  self.failure('uncertain');self.driver.state='DENY'
  with self.assertRaisesRegex(RuntimeError,'classification'):self.invoke('--recovery-action','record-verified','--operator-decision','VERIFIED')
 def test_cli_explicit_decision_required(self):
  self.failure('before')
  with self.assertRaisesRegex(RuntimeError,'decision'):self.invoke('--recovery-action','record-original')
 def test_cli_other_branch_denied(self):
  self.failure('before');self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED');self.driver.state='VERIFIED'
  with self.assertRaisesRegex(RuntimeError,'original_observation'):self.invoke('--recovery-action','record-verified','--operator-decision','VERIFIED')
 def test_cli_no_record_no_recover(self):
  self.failure('uncertain')
  with self.assertRaisesRegex(RuntimeError,'receipt_required'):self.invoke('--recovery-action','recover-verified','--operator-decision','VERIFIED')
 def test_cli_intent_binding_denied(self):
  self.failure('before');write(self.b.window/'credential-commit.intent.private.json',{'planSha256':self.driver.hash,'sealIntentSha256':'wrong'})
  with self.assertRaisesRegex(RuntimeError,'intent_drift'):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_observation_replay_denied(self):
  self.failure('before');self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
  with self.assertRaisesRegex(RuntimeError,'already_recorded'):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_baseline_missing_denies(self):
  self.failure('before');(self.b.window/'recovery-baseline.private.json').unlink()
  with self.assertRaises(FileNotFoundError):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_consumed_start_denies(self):
  self.failure('before');(self.b.root/'return-before-commit'/('start-intent-'+fixture.previous.API+'.json')).write_text('{}')
  with self.assertRaisesRegex(RuntimeError,'start_consumed'):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_lock_denies(self):
  import fcntl,os
  self.failure('before');fd=os.open(self.b.root.parent/'.incident-6683-window.lock',os.O_RDWR);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  try:
   with self.assertRaises(BlockingIOError):self.invoke('--inspect-readonly')
  finally:os.close(fd)
 def test_cli_false_gates_denies(self):
  self.failure('before');write(self.b.window/'execution-gates.private.json',{k:False for k in json.loads((self.b.window/'execution-gates.private.json').read_text())})
  with self.assertRaisesRegex(RuntimeError,'gates'):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_manifest_drift_denies(self):
  self.failure('before');write(self.b.window/'sequencer-manifest.json',{'filesSha256':{'locked_cli.py':'wrong'}})
  (self.b.window/'locked_cli.py').write_text('wrong')
  with self.assertRaisesRegex(RuntimeError,'manifest'):self.invoke('--inspect-readonly')
 def test_cli_frontend_identity_denies(self):
  self.failure('before');self.b.live[fixture.previous.FRONT]['pid']+=1
  with self.assertRaisesRegex(RuntimeError,'frontend_identity'):self.invoke('--recovery-action','record-original','--operator-decision','ORIGINAL_VERIFIED')
 def test_cli_failed_recovery_preserves_intent_no_replay(self):
  self.failure('uncertain');self.invoke('--recovery-action','record-verified','--operator-decision','VERIFIED');self.b.fail_action='return-partial:start:'+fixture.previous.API
  with self.assertRaises(RuntimeError):self.invoke('--recovery-action','recover-verified','--operator-decision','VERIFIED')
  self.assertTrue((self.b.window/'recovery.intent.private.json').is_file());self.assertEqual(self.driver.calls,1)
  with self.assertRaisesRegex(RuntimeError,'consumed'):self.invoke('--recovery-action','recover-verified','--operator-decision','VERIFIED')
 def test_cli_start_response_uncertain_denies(self):
  self.failure('uncertain');(self.b.root/'switch'/('start-intent-'+fixture.previous.API+'.json')).write_text('{}')
  with self.assertRaisesRegex(RuntimeError,'ambiguous_start'):self.invoke('--recovery-action','record-verified','--operator-decision','VERIFIED')
 def test_cli_normal_run_single_lock_baseline_persisted(self):
  self.invoke();self.assertEqual(self.driver.calls,1);self.assertTrue((self.b.window/'recovery-baseline.private.json').is_file());self.assertFalse(self.b.guard()['open'])
 def test_cli_successor_failure_keeps_new_cipher(self):
  self.b.fail_action='switch:start:'+fixture.previous.API
  with self.assertRaises(RuntimeError):self.invoke()
  self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[fixture.previous.API]['cfg']['env'][fixture.previous.KEYS[0]],'synthetic-new-'+fixture.previous.KEYS[0])
if __name__=='__main__':unittest.main()
