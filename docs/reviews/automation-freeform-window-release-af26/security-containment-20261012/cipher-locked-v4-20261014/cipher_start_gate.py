"""Every canonical start path must prove the irreversible cipher boundary first."""
import os
from pathlib import Path
from sequencer import Bridge
from locked_driver import Driver

def authorize_start(mode_directory):
 mode=Path(mode_directory);b=Bridge(mode.parent);driver=Driver(b);prior=driver.prior()
 if mode.name=='return-before-commit':
  if prior is None:
   if os.path.lexists(b.window/'credential-commit.intent.private.json'):raise RuntimeError('intent_without_plan_no_original_start')
   driver.check_scope();return
  plan,h,boundary=prior
  if boundary.may_start_successor()or not boundary.may_start_original_return()or driver.classify(plan,h)!='ORIGINAL_VERIFIED':raise RuntimeError('old_cipher_start_forbidden')
  return
 if prior is None:raise RuntimeError('verified_cipher_receipt_absent')
 plan,h,boundary=prior
 if not boundary.may_start_successor()or driver.verify_current_verified(plan,h)!='VERIFIED_CURRENT_NEW_EPOCH':raise RuntimeError('current_new_cipher_unproven')
