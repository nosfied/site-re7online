import os,json,stat,hashlib,re,subprocess,time,gzip
from pathlib import Path
P=Path('/dev/shm/re7-retention-second-lot-20261013T181800Z');scope=json.loads((P/'scope.private.json').read_text());start=time.monotonic()
B=Path('/opt/re7online/backups/converta-persistent/preparations');result={'at':time.time(),'removalAuthorized':False,'metadata':[],'references':[],'errors':[],'protectedBank':{}}
for root in scope['candidateRoots']:
 p=Path(root);assert not p.is_symlink(),'candidate_root_symlink'
 paths=[p]
 if p.is_dir():
  for folder,dirs,names in os.walk(p,followlinks=False):
   assert time.monotonic()-start<150,'budget_exhausted'
   paths.extend(Path(folder)/n for n in dirs+names)
 for q in paths:
  z=q.lstat();v={'path':str(q),'dev':z.st_dev,'ino':z.st_ino,'mode':z.st_mode,'uid':z.st_uid,'gid':z.st_gid,'nlink':z.st_nlink,'size':z.st_size,'blocks':z.st_blocks,'mtimeNs':z.st_mtime_ns,'ctimeNs':z.st_ctime_ns}
  if q.is_symlink():v['target']=os.readlink(q);v['resolvedTarget']=str(q.resolve())
  result['metadata'].append(v)
roots=['/etc/systemd/system','/etc/cron.d','/etc/nginx','/etc/sudoers.d','/usr/local/libexec/re7','/usr/local/sbin','/home/deploy/.pm2',str(B)]
skip={'node_modules','.next','.git','dist','src','public'}
for root in roots:
 for folder,dirs,names in os.walk(root,followlinks=False):
  assert time.monotonic()-start<150,'budget_exhausted'
  dirs[:]=[n for n in dirs if n not in skip]
  for n in names:
   q=Path(folder)/n
   try:
    z=q.lstat()
    if q.is_symlink():result['references'].append({'path':str(q),'target':os.readlink(q),'resolvedTarget':str(q.resolve())});continue
    if not stat.S_ISREG(z.st_mode)or z.st_size>16*1024*1024:continue
    if q.suffix not in ['.json','.cjs','.py','.sh','.txt','.sha256','.conf','.service','.timer','.pm2']and not str(q).startswith(('/etc/cron','/etc/nginx','/usr/local/libexec','/usr/local/sbin')):continue
    raw=q.read_bytes();after=q.lstat();assert (z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'reference_changed'
    hits=sorted(set(x.decode('utf8','replace')for x in re.findall(rb"/(?:opt/re7online|home/deploy|var/lib/re7|usr/local|etc|tmp|dev/shm)/[^\s\x00\"'<>;,)}\]]+",raw)))
    candidates=[x for x in scope['candidateRoots']if x.encode()in raw or Path(x).name.encode()in raw]
    result['references'].append({'path':str(q),'sha256':hashlib.sha256(raw).hexdigest(),'references':hits,'candidateMentions':candidates})
   except OSError as e:result['errors'].append({'path':str(q),'errorClass':type(e).__name__,'errno':e.errno})
for n in ['preparation-review.sha256','window/privileged-policy.private.json','window/initial.private.json','window/credential-hook.private.json','window/sequencer-manifest.json','window/execution-gates.private.json','execution-authorized']:
 q=B/'incident-6683-v4-security-database-final-v4-20261013T140000Z'/n;result['protectedBank'][n]=hashlib.sha256(q.read_bytes()).hexdigest()
fd=os.open(P/'deploy-inventory.private.json.gz',os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb')as f:
 with gzip.GzipFile(fileobj=f,mode='wb',mtime=0)as z:z.write(json.dumps(result,separators=(',',':')).encode())
 f.flush();os.fsync(f.fileno())
print(json.dumps({'result':'DEPLOY_INVENTORY_CAPTURED_ROOT_CHECK_PENDING','entries':len(result['metadata']),'references':len(result['references']),'readErrors':len(result['errors']),'seconds':time.monotonic()-start,'removalAuthorized':False}))
