"""One-use irreversible boundary; uncertainty keeps the intent and forbids replay.
Production adapter binds receipts to the sealed plan and exact original intent.
"""
from pathlib import Path
import json,os,stat,hashlib
VERIFIED={'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}
class CredentialBoundary:
 def __init__(self,directory,plan_sha256=None):self.root=Path(directory);self.plan_hash=plan_sha256
 def safe_read(self,p):
  s=p.lstat()
  if p.is_symlink()or not stat.S_ISREG(s.st_mode)or s.st_nlink!=1 or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o600:raise RuntimeError('credential_evidence_path_drift')
  return json.loads(p.read_text())
 def write(self,p,v):
  fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
  fd=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 def envelope(self,result):
  if self.plan_hash is None:return result
  return {'verification':result,'planSha256':self.plan_hash,'intentSha256':hashlib.sha256((self.root/'credential-commit.intent.private.json').read_bytes()).hexdigest()}
 def execute(self,verify_canonical_stopped,apply_once,verify_durable_receipt):
  intent=self.root/'credential-commit.intent.private.json';receipt=self.root/'credential-commit.receipt.private.json'
  if os.path.lexists(intent)or os.path.lexists(receipt):raise RuntimeError('credential_intent_already_exists_inspect_only')
  verify_canonical_stopped()
  self.write(intent,{'stage':'intent','planSha256':self.plan_hash,'automaticRetry':False,'automaticOldCredentialReturn':False})
  apply_once()
  result=verify_durable_receipt()
  if result!=VERIFIED:raise RuntimeError('credential_result_not_verified_inspect_only')
  self.write(receipt,self.envelope(result));return result
 def may_start_successor(self):
  p=self.root/'credential-commit.receipt.private.json'
  if not os.path.lexists(p):return False
  intent=self.root/'credential-commit.intent.private.json';v=self.safe_read(intent)
  if v.get('planSha256')!=self.plan_hash:raise RuntimeError('credential_intent_plan_drift')
  return self.safe_read(p)==self.envelope(VERIFIED)
 def record_verified_observation(self,verify_durable_receipt):
  """Explicit operator inspection after uncertainty, never ALTER/replay."""
  p=self.root/'credential-commit.intent.private.json';v=self.safe_read(p)
  if v.get('planSha256')!=self.plan_hash:raise RuntimeError('credential_intent_plan_drift')
  receipt=self.root/'credential-commit.receipt.private.json'
  if os.path.lexists(receipt):raise RuntimeError('credential_receipt_exists_inspect_only')
  result=verify_durable_receipt()
  if result!=VERIFIED:raise RuntimeError('credential_observation_not_verified_no_successor')
  self.write(receipt,self.envelope(result));return result

 def record_original_observation(self,verify_original):
  intent=self.root/'credential-commit.intent.private.json';v=self.safe_read(intent)
  if v.get('planSha256')!=self.plan_hash:raise RuntimeError('credential_intent_plan_drift')
  if os.path.lexists(self.root/'credential-commit.receipt.private.json'):raise RuntimeError('verified_commit_forbids_original_return')
  if verify_original()!='ORIGINAL_VERIFIED':raise RuntimeError('original_not_verified_no_successor')
  self.write(self.root/'credential-original-observed.receipt.private.json',self.envelope({'result':'ORIGINAL_VERIFIED','originalCredentialStillEffective':True,'sqlReplayAuthorized':False}))
 def may_start_original_return(self):
  if os.path.lexists(self.root/'credential-commit.receipt.private.json'):return False
  p=self.root/'credential-original-observed.receipt.private.json'
  if not os.path.lexists(p):return False
  intent=self.safe_read(self.root/'credential-commit.intent.private.json')
  if intent.get('planSha256')!=self.plan_hash:raise RuntimeError('credential_intent_plan_drift')
  return self.safe_read(p)==self.envelope({'result':'ORIGINAL_VERIFIED','originalCredentialStillEffective':True,'sqlReplayAuthorized':False})
