"""Existing V4 contract observes preserved launcher OS environment, not PM2 projection.

PM2 cluster ProcessContainer injects application env into JS after exec. /proc retains
its initial environment, including the serialized pm2_env envelope. This is
ONLY a preservation snapshot: V4 may start API/worker; never this frontend.
"""
import json
from pathlib import Path

def capture(row, read=lambda p:Path(p).read_bytes()):
 pid=row['pid'];require(type(pid)is int and pid>0,'preserved_front_pid')
 path=f'/proc/{pid}/environ';first=read(path);second=read(path)
 require(first==second and first.endswith(b'\0'),'preserved_front_environment_incomplete_or_changed')
 values={}
 for item in first.split(b'\0')[:-1]:
  key,sep,value=item.partition(b'=');require(sep and key and key.decode()not in values,'preserved_front_environment_invalid')
  values[key.decode()]=value.decode()
 require('pm2_env'in values,'preserved_front_pm2_envelope_missing')
 encoded=json.loads(values['pm2_env']);effective=row['pm2_env']
 for key in ['pm_cwd','pm_exec_path','exec_interpreter']:
  require(encoded[key]==effective[key],'preserved_front_pm2_envelope_drift:'+key)
 return values

def require(ok,code):
 if not ok:raise RuntimeError(code)
