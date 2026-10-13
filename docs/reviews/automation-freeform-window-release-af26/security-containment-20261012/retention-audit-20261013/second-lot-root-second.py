import os,json,stat,hashlib,time,gzip
from pathlib import Path
P=Path('/dev/shm/re7-retention-second-lot-20261013T181800Z')
deadline=time.monotonic()+90
errors=[]
def checktime():
 if time.monotonic()>deadline:raise TimeoutError('audit_budget_exhausted')
def record_error(stage,path,error):
 errors.append({'stage':stage,'path':str(path),'errorClass':type(error).__name__,'errno':getattr(error,'errno',None)})
def emit(out,v):out.write((json.dumps(v,separators=(',',':'))+'\n').encode())
def proc_identity(p):
 raw=(p/'stat').read_text().split(') ',1)[1].split()
 return {'pid':int(p.name),'ticks':raw[19],'state':raw[0]}
def sample():
 out={'startedAt':time.time(),'processes':[],'incomplete':[]}
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  checktime();q={'pid':int(p.name)}
  try:
   q.update(proc_identity(p));q['fds']=[]
   for field in ('cwd','exe'):
    try:q[field]=os.readlink(p/field)
    except FileNotFoundError:
     if q['state']=='Z' or (not (p/'cmdline').read_bytes() and q['pid']!=os.getpid()):q[field]=None;q['classification']='zombie_or_kernel_no_userspace_link'
     else:raise
   with os.scandir(p/'fd') as ds:
    for entry in ds:
     try:
      target=os.readlink(entry.path);s=os.stat(entry.path)
      q['fds'].append({'fd':entry.name,'target':target,'dev':s.st_dev,'ino':s.st_ino,'mode':s.st_mode,'nlink':s.st_nlink,'blocks':s.st_blocks})
     except OSError as e:out['incomplete'].append({'stage':'fd','pid':q['pid'],'ticks':q.get('ticks'),'fd':entry.name,'errorClass':type(e).__name__,'errno':e.errno})
   if proc_identity(p)['ticks']!=q['ticks']:out['incomplete'].append({'stage':'identity_after','pid':q['pid'],'ticks':q.get('ticks'),'errorClass':'IdentityDrift'})
   out['processes'].append(q)
  except OSError as e:
   # A vanished process is recorded; never silently converted to a complete sample.
   out['incomplete'].append({'stage':'process','pid':q['pid'],'ticks':q.get('ticks'),'errorClass':type(e).__name__,'errno':e.errno})
 return dict(out,finishedAt=time.time())


scope=json.loads((P/'scope.private.json').read_text()); samples=[sample(),sample()]
for s in samples:
 s['owners']=[{'pid':q['pid'],'ticks':q['ticks'],'field':field,'target':q.get(field)} for q in s['processes'] for field in ['cwd','exe'] if q.get(field) and any(q[field]==r or q[field].startswith(r+'/') for r in scope['candidateRoots'])]
 for q in s['processes']:
  for f in q['fds']:
   if any(f['target']==r or f['target'].startswith(r+'/') for r in scope['candidateRoots']):s['owners'].append(dict(f,pid=q['pid'],ticks=q['ticks']))
refs=[]
for root in ['/usr/local/libexec/re7','/etc/sudoers.d','/etc/systemd/system','/etc/cron.d','/etc/nginx','/usr/local/sbin']:
 for folder,dirs,names in os.walk(root,onerror=lambda e: (_ for _ in ()).throw(e)):
  for name in names:
   q=Path(folder)/name
   if q.is_symlink():
    refs.append({'path':str(q),'resolvedTarget':str(q.resolve()),'candidateMentions':[r for r in scope['candidateRoots'] if str(q.resolve())==r or str(q.resolve()).startswith(r+'/')]});continue
   raw=q.read_bytes();refs.append({'path':str(q),'sha256':hashlib.sha256(raw).hexdigest(),'candidateMentions':[r for r in scope['candidateRoots'] if r.encode() in raw or Path(r).name.encode() in raw]})
deploy=json.loads(gzip.decompress((P/'deploy-inventory.private.json.gz').read_bytes()))
for e in deploy['errors']:
 q=Path(e['path']);z=q.lstat();raw=q.read_bytes();after=q.lstat()
 assert (z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'root_reference_drift'
 refs.append({'path':str(q),'sha256':hashlib.sha256(raw).hexdigest(),'candidateMentions':[r for r in scope['candidateRoots'] if r.encode() in raw or Path(r).name.encode() in raw]})
v={'result':'COMPLETE' if all(not s['incomplete'] for s in samples) else 'DENY','samples':samples,'rootReferences':refs,'removalAuthorized':False}
fd=os.open(P/'root-observation.private.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:json.dump(v,f);f.flush();os.fsync(f.fileno())
print(json.dumps({'result':v['result'],'samples':len(samples),'owners':[len(s['owners'])for s in samples],'incomplete':[len(s['incomplete'])for s in samples],'removalAuthorized':False}))
