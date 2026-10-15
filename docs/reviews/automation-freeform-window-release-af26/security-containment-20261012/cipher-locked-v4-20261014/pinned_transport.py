"""Private same-session SQL transport. No shell, values in argv or replay."""
import json,os,select,subprocess,time
from pathlib import Path
class Pinned:
 def __init__(self,node,script,configuration,identity,stderr,deadline=30):
  self.end=time.monotonic()+deadline;self.buf=b'';self.error=Path(stderr).open('xb');os.chmod(stderr,0o600)
  env={k:v for k,v in os.environ.items()if k in ('PATH','HOME','LANG','USER')}
  self.p=subprocess.Popen([node,str(script),str(configuration)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.error,env=env)
  try:
   ready=self.read()
   if ready.get('ready')is not True or ready['identity']!=identity:raise RuntimeError('database_channel_identity_drift')
  except BaseException:self.close();raise
 def read(self):
  while b'\n'not in self.buf:
   remaining=self.end-time.monotonic()
   if remaining<=0 or not select.select([self.p.stdout],[],[],remaining)[0]:raise TimeoutError('pinned_deadline')
   block=os.read(self.p.stdout.fileno(),65536)
   if not block:raise RuntimeError('pinned_transport_closed')
   self.buf+=block
   if len(self.buf)>64*1024*1024:raise RuntimeError('pinned_response_budget')
  line,self.buf=self.buf.split(b'\n',1);return json.loads(line)
 def query(self,sql):
  if time.monotonic()>=self.end:raise TimeoutError('pinned_deadline')
  self.p.stdin.write((json.dumps({'sql':sql},separators=(',',':'))+'\n').encode());self.p.stdin.flush();result=self.read()
  if result.get('ok')is not True:raise RuntimeError('sql_denied:'+str(result.get('sqlstate')))
  rows=result['rows']
  if not rows:return ''
  if len(rows)==1 and len(rows[0])==1:return json.dumps(next(iter(rows[0].values())),separators=(',',':'),ensure_ascii=False)
  return json.dumps(rows,separators=(',',':'),ensure_ascii=False)
 def close(self):
  if self.p.poll()is None:
   try:self.p.stdin.close();self.p.wait(timeout=2)
   except (BrokenPipeError,subprocess.TimeoutExpired):self.p.terminate()
   try:self.p.wait(timeout=2)
   except subprocess.TimeoutExpired:self.p.kill();self.p.wait(timeout=2)
  self.error.close()
