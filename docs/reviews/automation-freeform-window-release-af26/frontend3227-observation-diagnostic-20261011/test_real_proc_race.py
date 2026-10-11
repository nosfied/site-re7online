"""Run only in fresh user/PID/net/mount namespaces with private proc.
Real child exit and FD close; barriers injected only to make syscall races deterministic.
No PM2/Next/provider effects, no production capability claim.
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from unittest.mock import patch

assert os.getpid()==1 and os.geteuid()==0,'isolated_pid_user_namespace_required'
s=importlib.util.spec_from_file_location('diagnostic_observer',Path(__file__).with_name('observer.py'))
o=importlib.util.module_from_spec(s);s.loader.exec_module(o)
r=Path(__file__).resolve().parent.parent
s=importlib.util.spec_from_file_location('contract',r/'frontend-fa60f0f6-prepared/socket_observation_contract.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
code="""import socket,sys
s,t=socket.socketpair();print(s.fileno(),flush=True)
for line in sys.stdin:
 if line.strip()=='CLOSE':s.close();print('CLOSED',flush=True)
"""
results=[]
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp);me=o.identity(os.getpid())
 policy={'version':1,'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'daemon':{'pid':me['pid'],'ticks':me['ticks']},'frontendPort':3000,'roles':{k:{'release':'/nonexistent/frontend-fixture','entry':'/nonexistent/frontend-fixture/next','nonce':secrets.token_hex(32),'capture':str(root/(k+'.json'))}for k in ['source','candidate','return']}}
 for target in ['process_identity','process_environ','process_cmdline','process_cwd','process_fd_readlink']:
  child=subprocess.Popen([sys.executable,'-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,env={'RE7_FRONT_RUN':policy['roles']['source']['nonce']})
  fd=child.stdout.readline().strip();q=o.identity(child.pid);actual_identity=o.identity;actual_link=os.readlink;actual_bytes=Path.read_bytes;fired=False
  def terminate():
   global fired
   fired=True;child.terminate();child.wait(timeout=3)
  def identity(pid):
   if target=='process_identity'and pid==child.pid:terminate()
   return actual_identity(pid)
  def read_bytes(path):
   if str(path)==f'/proc/{child.pid}/'+('environ'if target=='process_environ'else'cmdline') and target in ['process_environ','process_cmdline']:terminate()
   return actual_bytes(path)
  def readlink(path):
   global fired
   if str(path)==f'/proc/{child.pid}/cwd'and target=='process_cwd':terminate()
   if str(path)==f'/proc/{child.pid}/fd/{fd}'and target=='process_fd_readlink':
    child.stdin.write('CLOSE\n');child.stdin.flush();assert child.stdout.readline().strip()=='CLOSED';fired=True
   return actual_link(path)
  try:
   with patch.object(o,'identity',identity),patch.object(Path,'read_bytes',read_bytes),patch.object(o.os,'readlink',readlink):
    try:o.sample(policy);raise AssertionError('race_not_denied')
    except o.OwnershipObservationError as error:
     assert fired and error.diagnostic['stage']==target and error.diagnostic['pid']==child.pid
     assert error.diagnostic['startTicks']==(None if target=='process_identity'else q['ticks'])
     assert error.diagnostic['originalError']['type']=='FileNotFoundError'
     assert error.diagnostic['fd']==(fd if target=='process_fd_readlink'else None)
     out=io.StringIO()
     with contextlib.redirect_stderr(out):o.report_denial(error)
     assert json.loads(out.getvalue().splitlines()[1])['observationDiagnostic']==error.diagnostic
     results.append({'scenario':target,'result':'PASS','effect':'real proc exit/fd-close; deterministic barrier injected'})
  finally:
   if child.poll()is None:child.terminate();child.wait(timeout=3)
   child.stdin.close();child.stdout.close()
 child=subprocess.Popen([sys.executable,'-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,env={'RE7_FRONT_RUN':policy['roles']['source']['nonce']})
 child.stdout.readline();q=o.identity(child.pid)
 try:
  observation=o.observe(policy)
  try:c.absent(observation,policy,'source',[q]);raise AssertionError('survivor_not_denied')
  except RuntimeError as error:assert str(error)=='executor_or_reused_pid_survived'
  results.append({'scenario':'survivor','result':'PASS','effect':'real child + actual two-sample observer and absence contract'})
 finally:child.terminate();child.wait(timeout=3);child.stdin.close();child.stdout.close()
print(json.dumps({'result':'PASS','scenarios':results}))
