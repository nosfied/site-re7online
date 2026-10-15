"""Explicit recovery only: never calls seal, SQL apply or the normal run path."""
import hashlib,json,os
from credential_boundary import VERIFIED
from locked_plan import digest
from locked_v4 import verify_configs,MODES,API,WORKER

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,reason):
 if not v:raise RuntimeError(reason)

def bound_state(driver):
 state=driver.prior();require(state is not None,'recovery_final_plan_absent')
 plan,h,boundary=state;w=driver.w;p=w/'seal-current'
 source=boundary.safe_read(p/'source.private.json');sealed=boundary.safe_read(p/'plan.private.json')
 phase=boundary.safe_read(p/'intent.private.json');intent=boundary.safe_read(w/'credential-commit.intent.private.json')
 require(sealed==plan and sha(p/'plan.private.json')==h,'recovery_plan_drift')
 require(phase.get('planHash')==h and phase.get('sourceHash')==sha(p/'source.private.json') and phase.get('scopeHash')==digest(driver.approved) and phase.get('phaseId')==driver.spec['phaseId'],'recovery_seal_provenance_drift')
 require(intent.get('planSha256')==h and intent.get('sealIntentSha256')==sha(p/'intent.private.json'),'recovery_commit_intent_drift')
 return plan,h,boundary

def baseline_sequencer(cls):
 class Recoverable(cls):
  def capture_baseline(self):
   super().capture_baseline()
   from credential_boundary import CredentialBoundary
   CredentialBoundary(self.window).write(self.window/'recovery-baseline.private.json',self.baseline)
 return Recoverable

def execute(b,driver,executor,action,decision):
 require(action in ('record-original','record-verified','recover-original','recover-verified'),'recovery_action_invalid')
 expected='ORIGINAL_VERIFIED'if action.endswith('original')else'VERIFIED'
 require(decision==expected,'explicit_operator_decision_required')
 require((b.root/'execution-authorized').read_text().strip()=='true','execution_not_authorized')
 gates=json.loads((b.window/'execution-gates.private.json').read_text())
 require(set(gates)==set(('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')) and all(x is True for x in gates.values()),'recovery_gates_incomplete')
 verify_configs(b)
 for mode in MODES:b.run(['sha256sum','-c','scripts.sha256'],cwd=b.root/mode)
 plan,h,boundary=bound_state(driver)
 require(not os.path.lexists(b.window/'recovery.intent.private.json'),'recovery_consumed_inspect_only')
 require(driver.classify(plan,h)==expected,'fresh_classification_differs_from_decision')
 original=boundary.may_start_original_return();verified=boundary.may_start_successor()
 require(not(original and verified),'contradictory_observation_receipts')
 if expected=='VERIFIED':require(not os.path.lexists(b.window/'credential-original-observed.receipt.private.json'),'original_observation_forbids_verified_branch')
 else:require(not os.path.lexists(b.window/'credential-commit.receipt.private.json'),'verified_forbids_original_branch')
 # Read and validate saved full baseline; never capture live replacement identities.
 executor.baseline=boundary.safe_read(b.window/'recovery-baseline.private.json')
 from baseline_contract import sequential
 sequential(executor.baseline)
 initial=json.loads((b.window/'initial.private.json').read_text())
 require(executor.baseline['guardGeneration']==initial['guard']['generation']==38,'recovery_baseline_guard_drift')
 guard=b.guard();require(not guard['open'] and guard['generation']==38 and not guard.get('tasks') and not guard.get('ledgerFault'),'recovery_guard_drift')
 front=executor.baseline['apps']['re7-admin-front'];apps=b.apps()
 require('re7-admin-front'in apps and apps['re7-admin-front']['pid']==front['pid'] and __import__('sequencer').same_identity(front['identity'],b.identity(front['pid'])),'recovery_frontend_identity_drift')
 b.privileged('check-present')
 mode=executor.recovery_mode()
 require(mode in ('return','return-partial'),'recovery_requires_canonical_exit')
 require(expected!='ORIGINAL_VERIFIED'or mode=='return-partial','original_with_successor_denied')
 target='return-before-commit'if expected=='ORIGINAL_VERIFIED'else mode
 for name in (API,WORKER):require(not os.path.lexists(b.root/target/('start-intent-'+name+'.json')),'recovery_start_consumed')
 if action.startswith('record-'):
  require(not original and not verified,'observation_already_recorded')
  if expected=='ORIGINAL_VERIFIED':boundary.record_original_observation(lambda:driver.classify(plan,h))
  else:boundary.record_verified_observation(lambda:VERIFIED if driver.classify(plan,h)=='VERIFIED'else None)
  return {'result':'OBSERVATION_RECORDED','classification':expected,'planSha256':h,'recoveryExecuted':False}
 require(original if expected=='ORIGINAL_VERIFIED'else verified,'corresponding_observation_receipt_required')
 # Exclusive one-use recovery intent persists even if stop/start/finish fails.
 boundary.write(b.window/'recovery.intent.private.json',{'classification':expected,'planSha256':h,'commitIntentSha256':sha(b.window/'credential-commit.intent.private.json'),'operatorDecision':decision,'mode':target,'automaticReplay':False})
 executor.recover()
 boundary.write(b.window/'recovery.receipt.private.json',{'result':'RECOVERY_COMPLETE','classification':expected,'planSha256':h,'mode':target,'recoveryIntentSha256':sha(b.window/'recovery.intent.private.json')})
 return {'result':'RECOVERY_COMPLETE','classification':expected,'mode':target,'planSha256':h,'sqlReplayed':False}
