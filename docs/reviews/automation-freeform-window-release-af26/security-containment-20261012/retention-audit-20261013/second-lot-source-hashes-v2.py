import json,gzip,hashlib,os,stat,time
from pathlib import Path
P=Path('/dev/shm/re7-retention-second-lot-20261013T181800Z');v=json.loads(gzip.decompress((P/'deploy-inventory.private.json.gz').read_bytes()));start=time.monotonic();out=[]
for q in v['metadata']:
 assert time.monotonic()-start<150,'budget_exhausted'
 p=Path(q['path']);s=p.lstat()
 assert [s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_blocks,s.st_mtime_ns,s.st_ctime_ns]==[q[k]for k in ['dev','ino','mode','uid','gid','nlink','size','blocks','mtimeNs','ctimeNs']],'source_metadata_drift'
 if stat.S_ISREG(s.st_mode):
  h=hashlib.sha256()
  with p.open('rb')as f:
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
  after=p.lstat();assert (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_blocks,s.st_mtime_ns,s.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_mode,after.st_uid,after.st_gid,after.st_nlink,after.st_size,after.st_blocks,after.st_mtime_ns,after.st_ctime_ns),'source_changed_during_hash'
  out.append({'path':str(p),'sha256':h.hexdigest()})
fd=os.open(P/'source-hashes.private.json.gz',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb')as f:
 with gzip.GzipFile(fileobj=f,mode='wb',mtime=0)as z:z.write(json.dumps(out).encode())
print(json.dumps({'result':'SOURCE_METADATA_AND_HASHES_PASS','files':len(out),'seconds':time.monotonic()-start,'removalAuthorized':False}))
