"""Sealed consumers: prepare files inactive; activate only after VERIFIED DB boundary.
No provider, process control, container recreation or credential in argv/output.
"""
import hashlib,json,os,stat
from pathlib import Path

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def safe_file(p,uid=None,mode=None):
 p=Path(p);s=p.lstat()
 if not stat.S_ISREG(s.st_mode)or p.is_symlink()or s.st_nlink!=1:raise RuntimeError('consumer_file_type_drift')
 if uid is not None and s.st_uid!=uid:raise RuntimeError('consumer_owner_drift')
 if mode is not None and stat.S_IMODE(s.st_mode)!=mode:raise RuntimeError('consumer_mode_drift')
 return s

def verify_manifest(window,planfile,phase='before'):
 if phase not in {'before','contained'}:raise RuntimeError('consumer_phase_invalid')
 window=Path(window);planfile=Path(planfile)
 safe_file(planfile,os.getuid(),0o600)
 m=json.loads((window/'sequencer-manifest.json').read_text())
 if m['filesSha256'][planfile.name]!=digest(planfile):raise RuntimeError('consumer_plan_hash_drift')
 plan=json.loads(planfile.read_text())
 for entry in plan['immutableConsumers']:
  safe_file(entry['path'],entry['uid'],entry['mode'])
  expected=entry['containedSha256'] if phase=='contained'and 'containedSha256'in entry else entry['sha256']
  if digest(entry['path'])!=expected:raise RuntimeError('consumer_source_drift')
 for p in plan['absentEnvironmentPaths']:
  if os.path.lexists(p):raise RuntimeError('consumer_environment_path_appeared')
 for entry in plan['stagedConsumers']:
  if Path(entry['name']).name!=entry['name']:raise RuntimeError('consumer_path_invalid')
  p=window/entry['name'];safe_file(p,os.getuid(),0o600)
  if digest(p)!=entry['sha256']or m['filesSha256'][entry['name']]!=entry['sha256']:raise RuntimeError('staged_consumer_hash_drift')
 return plan

def apply_verified_consumers(window,planfile,boundary):
 if not boundary.may_start_successor():raise RuntimeError('consumer_activation_requires_verified_commit')
 window=Path(window);plan=verify_manifest(window,planfile,phase='contained')
 receipt={'stage':'VERIFIED','consumerPlanSha256':digest(planfile),'databaseReceiptSha256':digest(window/'credential-commit.receipt.private.json'),'consumerHashes':{e['name']:e['sha256']for e in plan['stagedConsumers']},'noContainerRecreation':True}
 out=window/'consumer-activation.receipt.private.json'
 if os.path.lexists(out):
  safe_file(out,os.getuid(),0o600)
  if json.loads(out.read_text())!=receipt:raise RuntimeError('consumer_activation_receipt_drift')
  return receipt # Explicit compatible state; no SQL or write replay.
 fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(receipt,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
 fd=os.open(window,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
 return receipt

def read_activated_connection(window):
 """Administrative TCP entry: no inherited DATABASE_URL or auth/decoder keys."""
 window=Path(window);receipt=window/'consumer-activation.receipt.private.json';safe_file(receipt,os.getuid(),0o600)
 v=json.loads(receipt.read_text());p=window/'administrative-db.private.json';safe_file(p,os.getuid(),0o600)
 if v['stage']!='VERIFIED'or v['consumerHashes'].get(p.name)!=digest(p):raise RuntimeError('administrative_consumer_not_verified')
 if v['databaseReceiptSha256']!=digest(window/'credential-commit.receipt.private.json'):raise RuntimeError('administrative_database_receipt_drift')
 return json.loads(p.read_text())['connection']
