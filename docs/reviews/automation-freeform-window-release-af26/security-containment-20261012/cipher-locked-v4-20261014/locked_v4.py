"""New V4 boundary. Static population/consumers; dynamic phase is never a repair.
No implicit start after intent or uncertain commit. CLI uses only new generation.
"""
import hashlib,json,os
from pathlib import Path
API='re7-whatsapp-agent';WORKER='re7-whatsapp-web-worker';FRONT='re7-admin-front'
MODES=('switch','return','return-partial','return-before-commit')
PRESERVE=('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL')
KEYS=('CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY')
def verify_configs(b):
 source=b.expected_config('switch','return.config.private.json');target=b.expected_config('switch','candidate.config.private.json')
 for mode in MODES:
  cfg=b.expected_config(mode,'candidate.config.private.json')
  if cfg[FRONT]!=source[FRONT]:raise RuntimeError('frontend_drift')
  for name in (API,WORKER):
   for k in PRESERVE:
    if cfg[name]['env'].get(k)!=source[name]['env'].get(k):raise RuntimeError('newauth_newdb_drift')
   for k in KEYS:
    if k in source[name]['env']:
     expected=source[name]['env'][k]if mode=='return-before-commit'else target[name]['env'][k]
     if cfg[name]['env'].get(k)!=expected:raise RuntimeError('return_cipher_drift')
   if cfg[name]['cwd']!=target[name]['cwd']or cfg[name]['script']!=target[name]['script']:raise RuntimeError('compatible_reader_runtime_drift')
 return True

def adapter(module,driver,consumers,coverage):
 class LockedSequencer(module.Sequencer):
  def eligible(self):
   super().eligible();verify_configs(self.b);consumers.verify('before');driver.check_scope()
   if (self.b.window/'credential-commit.intent.private.json').exists()or any((self.b.window/'seal-current').iterdir()):raise RuntimeError('phase_consumed_inspect_only')
  def start_pair(self,mode):
   if mode=='switch':
    self.verify_stopped(mode);self.b.privileged('check-present');consumers.verify('contained');proof=coverage(self.b)
    self.plan,self.plan_hash,self.boundary=driver.seal(proof)
   elif mode=='return-before-commit':
    state=driver.prior()
    if state:
     self.plan,self.plan_hash,self.boundary=state
     if not self.boundary.may_start_original_return()or driver.classify(self.plan,self.plan_hash)!='ORIGINAL_VERIFIED':raise RuntimeError('original_return_inspection_required')
    else:
     # No SQL/intent: preserved immutable population, original credential effective.
     driver.check_scope();self.boundary=__import__('credential_boundary').CredentialBoundary(self.b.window,None)
   else:
    self.plan,self.plan_hash,self.boundary=driver.prior()
    if not self.boundary.may_start_successor()or driver.verify_current_verified(self.plan,self.plan_hash)!='VERIFIED_CURRENT_NEW_EPOCH':raise RuntimeError('verified_new_cipher_required')
   consumers.install('before'if mode=='return-before-commit'else'after',self.boundary,mode)
   return super().start_pair(mode)
  def recover(self):
   state=driver.prior()
   if state:
    self.plan,self.plan_hash,self.boundary=state
    if not self.boundary.may_start_successor()and not self.boundary.may_start_original_return():raise RuntimeError('commit_or_intent_uncertain_inspect_only')
    if self.boundary.may_start_successor():return super().recover()
   elif (self.b.window/'credential-commit.intent.private.json').exists():raise RuntimeError('intent_without_plan_inspect_only')
   mode=super().recovery_mode()
   if mode=='prestop':return super().recover()
   if mode!='return-partial':raise RuntimeError('precommit_unexpected_successor')
   self.mode='return-before-commit';self.b.privileged('check-present');self.action(self.mode,'recover-partial');self.verify_stopped(self.mode);self.start_pair(self.mode);self.finish(self.mode)
 return LockedSequencer
