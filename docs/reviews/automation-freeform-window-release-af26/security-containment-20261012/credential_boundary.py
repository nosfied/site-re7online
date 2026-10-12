"""Local/review contract for irreversible steps between canonical stop proof and successor start.
No CLI or production mutation. Existing Sequencer supplies exit/drain/fence checks.
"""
from pathlib import Path
import json,os
class CredentialBoundary:
 def __init__(self,directory):self.root=Path(directory)
 def execute(self,verify_canonical_stopped,apply_once,verify_durable_receipt):
  intent=self.root/'credential-commit.intent.private.json';receipt=self.root/'credential-commit.receipt.private.json'
  if intent.exists()or receipt.exists():raise RuntimeError('credential_intent_already_exists_inspect_only')
  verify_canonical_stopped()  # Must call actual verify_stopped + owner/fence/locks in the eventual adapter.
  fd=os.open(intent,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w')as f:json.dump({'stage':'intent','automaticRetry':False,'automaticOldCredentialReturn':False},f);f.flush();os.fsync(f.fileno())
  apply_once()  # Exception/timeout/uncertainty keeps intent and refuses starts/automatic recovery.
  result=verify_durable_receipt()
  if result!={'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}:raise RuntimeError('credential_result_not_verified_inspect_only')
  fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w')as f:json.dump(result,f);f.flush();os.fsync(f.fileno())
  return result
 def may_start_successor(self):
  p=self.root/'credential-commit.receipt.private.json'
  return p.is_file()and not p.is_symlink()and json.loads(p.read_text())=={'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}
