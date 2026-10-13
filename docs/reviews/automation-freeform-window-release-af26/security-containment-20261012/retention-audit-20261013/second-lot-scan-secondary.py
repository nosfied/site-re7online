import os,json,stat,time,gzip
from pathlib import Path
P=Path('/dev/shm/re7-retention-second-lot-20261013T181800Z');v={'at':time.time(),'files':[],'errors':[],'symlinks':[]};start=time.monotonic()
for root in ['/opt/re7online/backups/converta-persistent/preparations','/opt/re7online/backups/converta-persistent/snapshots','/var/log','/home/deploy/.pm2/logs']:
 for folder,dirs,names in os.walk(root,followlinks=False,onerror=lambda e:v['errors'].append({'path':e.filename,'errno':e.errno})):
  assert time.monotonic()-start<90,'budget_exhausted'
  dirs[:]=[n for n in dirs if n not in ['node_modules','.next','.git']]
  for n in dirs+names:
   q=Path(folder)/n
   try:
    z=q.lstat()
    if stat.S_ISLNK(z.st_mode):v['symlinks'].append({'path':str(q),'target':os.readlink(q)})
    elif stat.S_ISREG(z.st_mode):v['files'].append({'path':str(q),'dev':z.st_dev,'ino':z.st_ino,'blocks':z.st_blocks,'size':z.st_size,'nlink':z.st_nlink,'uid':z.st_uid,'gid':z.st_gid,'mode':z.st_mode,'mtimeNs':z.st_mtime_ns})
   except OSError as e:v['errors'].append({'path':str(q),'errno':e.errno})
fd=os.open(P/'secondary-inventory.private.json.gz',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb')as f:
 with gzip.GzipFile(fileobj=f,mode='wb',mtime=0)as g:g.write(json.dumps(v).encode())
print(json.dumps({'files':len(v['files']),'errors':len(v['errors']),'removalAuthorized':False}))
