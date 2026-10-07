"""Fixed permanent reader client. Private diagnostics; no policy update/start."""
import hashlib,json,os,subprocess,time
from pathlib import Path
COMMAND=['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/frontend-permanent-observer.py']
def require(v,why):
 if not v:raise RuntimeError(why)
def read(root,run,reader=None):
 root=Path(root);binding=json.loads((root/'permanent-observer-binding.private.json').read_text())
 require(set(binding)=={'policy','policySha256','helperSha256'},'permanent_binding_schema')
 start=time.monotonic()
 if reader is None:
  folder=root/'permanent-observer-private';folder.mkdir(mode=0o700,exist_ok=True);out=folder/(str(time.time_ns())+'.json')
  try:
   r=subprocess.run(COMMAND,cwd='/',capture_output=True,text=True,timeout=10);record={'stdout':r.stdout,'stderr':r.stderr,'exitCode':r.returncode,'timeout':False}
  except subprocess.TimeoutExpired as e:
   record={'stdout':repr(e.stdout),'stderr':repr(e.stderr),'exitCode':None,'timeout':True}
  out.write_text(json.dumps(record));out.chmod(0o600)
  require(record['exitCode']==0,'permanent_reader_denied:'+out.name);value=json.loads(record['stdout'])
 else:value=reader(binding)
 require(value['policySha256']==binding['policySha256'] and value['helperSha256']==binding['helperSha256'],'permanent_reader_integrity')
 require(type(value['samples']) is list and len(value['samples'])==2,'permanent_observation_samples')
 require(start<=value['startedMonotonic']<=value['finishedMonotonic']<=time.monotonic() and time.monotonic()-value['finishedMonotonic']<=10,'permanent_observation_freshness')
 require(value['bootId']==Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'permanent_observation_boot')
 policy=binding['policy'];effective=value['effectivePolicy']
 require(any(r['release']==run['release'] and r['entry']==run['entry'] and r['entrySha256']==run['entrySha256'] and r['buildId']==run['buildId'] for r in policy['roles'].values()),'permanent_run_scope')
 require(effective['bootId']==value['bootId'] and effective['frontendPort']==policy['frontendPort'] and all(effective['roles'][k]['release']==r['release'] and effective['roles'][k]['entry']==r['entry'] for k,r in policy['roles'].items()),'permanent_effective_scope')
 d=effective['daemon'];require(Path(policy['pm2']['pidfile']).read_text().strip()==str(d['pid']),'permanent_daemon_pidfile')
 stat=Path('/proc',str(d['pid']),'stat').read_text().rsplit(') ',1)[1].split();require(stat[19]==d['ticks'] and stat[0] not in ['Z','X','x'],'permanent_daemon_identity')
 require(all(s['daemon']==d for s in value['samples']),'permanent_sample_daemon')
 return value
