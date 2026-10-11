"""Authorized receipt initialization + exactly one bounded preparatory invocation.
No installation/process-control/binding write. Prior diagnostics are preserved.
"""
from pathlib import Path
import os,stat,json,hashlib,subprocess,fcntl,time
def ensure_receipts_directory(root, expected_uid=None):
 """Create only the fixed receipt directory; never repair an existing divergence."""
 uid=os.geteuid() if expected_uid is None else expected_uid
 parent=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  try:os.mkdir('receipts-private',mode=0o700,dir_fd=parent)
  except FileExistsError:pass
  before=os.stat('receipts-private',dir_fd=parent,follow_symlinks=False)
  if not stat.S_ISDIR(before.st_mode):raise RuntimeError('receipts_not_directory_or_symlink')
  if before.st_uid!=uid:raise RuntimeError('receipts_owner_drift')
  if stat.S_IMODE(before.st_mode)!=0o700:raise RuntimeError('receipts_mode_drift')
  child=os.open('receipts-private',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:
   after=os.fstat(child)
   if (after.st_dev,after.st_ino,after.st_uid,after.st_mode)!=(before.st_dev,before.st_ino,before.st_uid,before.st_mode):raise RuntimeError('receipts_identity_drift')
  finally:os.close(child)
 finally:os.close(parent)
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z')
I=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-incoming-20261011T101500Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
os.umask(0o077)
lock=(P/'window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
record=I/'preflight-authorized-continuation-20261011.private.json'
with record.open('x') as f:f.write('{}')
record.chmod(0o600)
v={'startedAt':time.time(),'stage':'preconditions','result':'DENY','preflightInvocations':0,'installerInvocations':0}
try:
 for name,expected in [('scripts.sha256','6bd3c775e839bf53219c4b88a868bb46fb3da40f788107d91aa05109541310e5'),('bindings.sha256','7c40b7e6ec841b942d12891e03676a7986e8d129b34f109635a55020defd2c95')]:
  assert h(P/name)==expected,'manifest_identity_drift:'+name
  subprocess.run(['sha256sum','-c',name],cwd=P,check=True,capture_output=True,text=True,timeout=10)
 subprocess.run(['python3',str(P/'check-preparation.py')],check=True,capture_output=True,text=True,timeout=30)
 assert h('/usr/local/libexec/re7/frontend-socket-observer.py')=='c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30','installed_helper_drift'
 assert h('/usr/local/libexec/re7/frontend-socket-observer.pre-observation-v2-101500.py')=='93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385','archive_helper_drift'
 for name,mode in [('/usr/local/libexec/re7/frontend-socket-observer.py',0o644),('/usr/local/libexec/re7/frontend-socket-observer-policy.json',0o600)]:
  s=Path(name).lstat();assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_gid==0 and stat.S_IMODE(s.st_mode)==mode,'installed_metadata_drift'
 assert (P/'execution-authorized').read_text().strip()=='false'
 assert not list(P.glob('start-*.intent')),'start_intent_present'
 assert not (P/'source-tree.preparatory.private.json').exists(),'preparatory_capture_already_exists'
 v['stage']='receipt_directory';ensure_receipts_directory(P)
 s=(P/'receipts-private').lstat();v['receiptDirectory']={'uid':s.st_uid,'mode':oct(stat.S_IMODE(s.st_mode))}
 v['stage']='preparatory_preflight';v['preflightInvocations']=1
 try:
  r=subprocess.run(['python3',str(P/'run-preparatory-preflight.py')],text=True,capture_output=True,timeout=90)
  output={'stdout':r.stdout,'stderr':r.stderr,'exitCode':r.returncode,'timeout':False}
 except subprocess.TimeoutExpired as e:
  output={'stdout':e.stdout.decode()if isinstance(e.stdout,bytes)else e.stdout,'stderr':e.stderr.decode()if isinstance(e.stderr,bytes)else e.stderr,'exitCode':None,'timeout':True}
 with (I/'preflight-authorized-continuation-output.private.json').open('x')as f:json.dump(output,f)
 assert output['exitCode']==0,'preflight_denied_or_timeout'
 assert (P/'execution-authorized').read_text().strip()=='false'
 assert (P/'source-tree.preparatory.private.json').is_file(),'preparatory_capture_not_archived'
 v.update(result='PASS',stage='complete',captureSha256=h(P/'source-tree.preparatory.private.json'))
except Exception as e:
 v.update(errorType=type(e).__name__,error=str(e))
finally:
 v['finishedAt']=time.time();record.write_text(json.dumps(v,sort_keys=True));record.chmod(0o600)
 print(json.dumps({'result':v['result'],'stage':v['stage'],'preflightInvocations':v['preflightInvocations'],'executionAuthorized':False}))
if v['result']!='PASS':raise SystemExit(1)
