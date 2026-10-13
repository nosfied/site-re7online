"""Bounded root filesystem/reference/FD audit. No deletion, config or process action.
Only new private evidence files are created in an existing deploy-owned 0700 directory.
"""
import gzip,hashlib,json,os,re,stat,time
from pathlib import Path
P=Path('/dev/shm/re7-retention-audit-20261013T120000Z')
LIMIT_SECONDS=240
ROOTS=('/',)
REFERENCE_ROOTS=('/etc/','/usr/local/libexec/re7/','/usr/local/sbin/','/opt/re7online/backups/converta-persistent/preparations/','/home/deploy/.pm2/')
EXCLUDED_REF_PARTS={'node_modules','.next','.git','dist','src','public'}
started=time.monotonic();deadline=started+LIMIT_SECONDS
errors=[];count=0;refs=0;links=0

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

def walk(out):
 global count,refs,links
 rootdev=os.stat('/').st_dev
 def failed(e):record_error('walk',e.filename,e)
 for folder,dirs,names in os.walk('/',topdown=True,followlinks=False,onerror=failed):
  checktime()
  if folder in ('/proc','/sys','/dev','/run'):
   dirs[:]=[];emit(out,{'kind':'separate_fs','path':folder});continue
  keep=[]
  for name in dirs:
   path=Path(folder)/name
   try:
    s=path.lstat()
    if stat.S_ISLNK(s.st_mode) or s.st_dev==rootdev:keep.append(name)
    else:emit(out,{'kind':'other_fs','path':str(path),'dev':s.st_dev})
   except OSError as e:record_error('directory',path,e)
  dirs[:]=keep
  for name in ['.']+dirs+names:
   # Directories are emitted once, by their own traversal; symlink directories are emitted here.
   p=Path(folder) if name=='.' else Path(folder)/name
   try:
    s=p.lstat()
    if name!='.' and stat.S_ISDIR(s.st_mode):continue
    count+=1
    if count>2500000:raise RuntimeError('inode_entry_limit')
    v={'kind':'inode','path':str(p),'dev':s.st_dev,'ino':s.st_ino,'mode':s.st_mode,'uid':s.st_uid,'gid':s.st_gid,'nlink':s.st_nlink,'size':s.st_size,'blocks':s.st_blocks,'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns}
    if stat.S_ISLNK(s.st_mode):v['target']=os.readlink(p);links+=1
    emit(out,v)
    want=any(str(p).startswith(x) for x in REFERENCE_ROOTS) and not EXCLUDED_REF_PARTS.intersection(p.parts)
    extension=p.suffix in ('.json','.cjs','.py','.sh','.txt','.sha256','.service','.timer','.conf','.pm2') or folder.startswith(('/etc/cron','/etc/systemd','/etc/nginx','/etc/sudoers'))
    if want and extension and stat.S_ISREG(s.st_mode):
     if s.st_size>16*1024*1024:record_error('reference_size',p,ValueError());continue
     raw=p.read_bytes();after=p.lstat()
     if (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):record_error('reference_drift',p,ValueError());continue
     hits=sorted(set(x.decode('utf-8','replace') for x in re.findall(rb'/(?:opt/re7online|home/deploy|var/lib/re7|usr/local|etc|tmp|dev/shm)/[^\s\x00\"\'<>;,\)\}\]]+',raw)))
     relative=[]
     if p.suffix=='.sha256':
      for line in raw.splitlines():
       m=re.fullmatch(rb'[a-f0-9]{64}  (.+)',line)
       if m:relative.append(m.group(1).decode('utf-8','replace'))
     refs+=1;emit(out,{'kind':'reference','path':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'paths':hits,'manifestMembers':relative})
   except OSError as e:record_error('entry',p,e)

assert os.geteuid()==0,'root_read_required'
s=P.lstat();assert stat.S_ISDIR(s.st_mode) and not P.is_symlink() and s.st_uid!=0 and stat.S_IMODE(s.st_mode)==0o700,'private_directory_denied'
for parent in P.parents:
 assert not parent.is_symlink(),'parent_symlink_denied'
outputs=[P/'inventory.private.jsonl.gz',P/'observations.private.json',P/'summary.private.json']
assert all(not os.path.lexists(x) for x in outputs),'evidence_exists_do_not_repeat'
summary={'startedAt':time.time(),'removalAuthorized':False,'filesystems':[]}
try:
 before=sample()
 fd=os.open(outputs[0],os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as raw:
  with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as stream:walk(stream)
  raw.flush();os.fsync(raw.fileno())
 after=sample()
 observations={'samples':[before,after]}
 for target in ['/','/opt/re7online','/home/deploy','/var/lib/docker/volumes/postgres_wa_agent_pgdata/_data','/var/lib/re7','/dev/shm']:
  q=os.statvfs(target);t=os.stat(target);summary['filesystems'].append({'path':target,'dev':t.st_dev,'availableBytes':q.f_bavail*q.f_frsize,'freeBytes':q.f_bfree*q.f_frsize,'totalBytes':q.f_blocks*q.f_frsize,'freeInodes':q.f_favail})
 summary.update(result='COMPLETE' if not errors and not before['incomplete'] and not after['incomplete'] else 'PARTIAL_DENY',entries=count,references=refs,symlinks=links,errors=errors,incomplete=[len(before['incomplete']),len(after['incomplete'])])
except Exception as e:
 observations=locals().get('observations',{'samples':[locals().get('before',{})]})
 summary.update(result='DENY',errorClass=type(e).__name__,errors=errors,entries=count)
for path,value in [(outputs[1],observations),(outputs[2],dict(summary,finishedAt=time.time()))]:
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as stream:json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
for path in outputs:
 if path.exists():os.chown(path,s.st_uid,s.st_gid)
print(json.dumps({k:summary.get(k) for k in ('result','entries','references','symlinks','incomplete','errorClass','removalAuthorized')}))
raise SystemExit(0 if summary.get('result')=='COMPLETE' else 1)
