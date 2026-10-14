"""Directed new transport negatives; synthetic subprocesses, no DB/provider/VPS."""
import fcntl,json,os,sys,tempfile,unittest
from pathlib import Path
from transport import capture
os.umask(0o077)
class Tests(unittest.TestCase):
 def test_cleanup_and_no_retry(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);lock=p/'backup.lock';lock.touch(mode=0o600)
   holder=p/'holder.py';holder.write_text("import json,sys\nprint(json.dumps({'protocol':'SNAPSHOT_HOLDER_READY','snapshot':'00000001-00000001-1','identity':{'database':'synthetic'},'inventory':{'synthetic':True}}),flush=True)\nsys.stdin.readline()\nprint(json.dumps({'protocol':'SNAPSHOT_HOLDER_RELEASED','readOnly':True}),flush=True)\n");holder.chmod(0o600)
   sleeper=p/'sleeper.py';sleeper.write_text('import time;time.sleep(30)');sleeper.chmod(0o600)
   for name,dump,identity,timeout in [('identity',['/bin/false'],{},1),('dump',['/bin/false'],{'database':'synthetic'},1),('timeout',[sys.executable,str(sleeper)],{'database':'synthetic'},.1)]:
    out=p/name;out.mkdir(mode=0o700)
    with self.assertRaises(RuntimeError):capture(out,lock,[sys.executable,str(holder)],{'PATH':'/usr/bin:/bin'},dump,{'PATH':'/usr/bin:/bin'},lambda:identity,timeout)
    denial=json.loads((out/'denial.private.json').read_text());self.assertFalse(denial['automaticRetry']);self.assertFalse((out/'capture-receipt.private.json').exists())
    with lock.open('r+')as l:fcntl.flock(l,fcntl.LOCK_EX|fcntl.LOCK_NB)
   out=p/'busy';out.mkdir(mode=0o700)
   with lock.open('r+')as l:
    fcntl.flock(l,fcntl.LOCK_EX|fcntl.LOCK_NB)
    with self.assertRaises(BlockingIOError):capture(out,lock,[sys.executable,str(holder)],{},['/bin/false'],{},lambda:{})
   self.assertFalse((out/'holder.private.stderr').exists())
if __name__=='__main__':unittest.main()
