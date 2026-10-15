import fcntl,hashlib,json,os,sys
from pathlib import Path
from sequencer import Bridge
import sequencer
from locked_driver import Driver
from locked_v4 import adapter
from writer_coverage import coverage
from cipher_consumers import CipherConsumers

def main(root,inspection=False,post_return=False):
 b=Bridge(root);manifest=json.loads((b.window/'sequencer-manifest.json').read_text())
 for n,h in manifest['filesSha256'].items():
  p=b.window/n
  if p.parent!=b.window or hashlib.sha256(p.read_bytes()).hexdigest()!=h:raise RuntimeError('manifest_drift')
 driver=Driver(b)
 if inspection:
  prior=driver.prior()
  print(json.dumps({'result':'NO_FINAL_PLAN'if prior is None else driver.classify(prior[0],prior[1]),'replayAuthorized':False,'successorAuthorized':False}));return
 if (b.root/'execution-authorized').read_text().strip()!='true':raise RuntimeError('execution_not_authorized')
 fd=os.open(b.root.parent/'.incident-6683-window.lock',os.O_CREAT|os.O_RDWR,0o600)
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);consumers=CipherConsumers(b.window,hashlib.sha256((b.window/'cipher-consumers.private.json').read_bytes()).hexdigest());cls=adapter(sequencer,driver,consumers,coverage);executor=cls(b)
  if post_return:executor.post_unfence_return()
  else:executor.run()
 finally:os.close(fd)
if __name__=='__main__':
 try:main(Path(sys.argv[1]),len(sys.argv)==3 and sys.argv[2]=='--inspect-readonly',len(sys.argv)==3 and sys.argv[2]=='--post-unfence-return')
 except BaseException as error:print(json.dumps({'result':'DENY','errorClass':type(error).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
