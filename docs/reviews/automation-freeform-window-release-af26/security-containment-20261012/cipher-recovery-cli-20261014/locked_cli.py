"""Generation-specific entrypoint. Inspection and recovery share the canonical lock."""
import argparse,fcntl,hashlib,json,os,stat
from pathlib import Path
from sequencer import Bridge
import sequencer
from locked_driver import Driver
from locked_v4 import adapter
from writer_coverage import coverage
from cipher_consumers import CipherConsumers
from recovery_actions import execute,baseline_sequencer,bound_state

def parser():
 p=argparse.ArgumentParser();p.add_argument('root',type=Path)
 g=p.add_mutually_exclusive_group();g.add_argument('--inspect-readonly',action='store_true');g.add_argument('--post-unfence-return',action='store_true');g.add_argument('--recovery-action',choices=('record-original','record-verified','recover-original','recover-verified'))
 p.add_argument('--operator-decision',choices=('ORIGINAL_VERIFIED','VERIFIED'));return p

def main(argv=None):
 a=parser().parse_args(argv)
 if bool(a.operator_decision)!=bool(a.recovery_action):raise RuntimeError('explicit_recovery_decision_required')
 b=Bridge(a.root)
 manifest=json.loads((b.window/'sequencer-manifest.json').read_text())
 for n,h in manifest['filesSha256'].items():
  p=b.window/n;s=p.lstat()
  if p.parent!=b.window or not stat.S_ISREG(s.st_mode)or s.st_nlink!=1 or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o600 or hashlib.sha256(p.read_bytes()).hexdigest()!=h:raise RuntimeError('manifest_drift')
 driver=Driver(b)
 # The canonical fresh post-unfence path obtains this lock itself.
 if a.post_unfence_return or (not a.inspect_readonly and not a.recovery_action):
  if (b.root/'execution-authorized').read_text().strip()!='true':raise RuntimeError('execution_not_authorized')
  cls=baseline_sequencer(adapter(sequencer,driver,CipherConsumers(b.window,hashlib.sha256((b.window/'cipher-consumers.private.json').read_bytes()).hexdigest()),coverage));executor=cls(b)
  return executor.post_unfence_return()if a.post_unfence_return else executor.run()
 fd=os.open(b.root.parent/'.incident-6683-window.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode)or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:raise RuntimeError('lock_path_drift')
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if a.inspect_readonly:
   prior=driver.prior()
   if prior is not None:prior=bound_state(driver)
   result={'result':'NO_FINAL_PLAN'if prior is None else driver.classify(prior[0],prior[1]),'planSha256':None if prior is None else prior[1],'replayAuthorized':False,'successorAuthorized':False}
  else:
   if (b.root/'execution-authorized').read_text().strip()!='true':raise RuntimeError('execution_not_authorized')
   cls=baseline_sequencer(adapter(sequencer,driver,CipherConsumers(b.window,hashlib.sha256((b.window/'cipher-consumers.private.json').read_bytes()).hexdigest()),coverage));executor=cls(b)
   result=execute(b,driver,executor,a.recovery_action,a.operator_decision)if a.recovery_action else executor.run()
  if result is not None:print(json.dumps(result,sort_keys=True))
  return result
 finally:os.close(fd)
if __name__=='__main__':
 try:main()
 except BaseException as error:print(json.dumps({'result':'DENY','errorClass':type(error).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
