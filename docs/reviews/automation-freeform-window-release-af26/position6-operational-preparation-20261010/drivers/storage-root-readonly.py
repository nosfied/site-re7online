"""Bounded root READ ONLY audit. Run manually through existing sudo; stdout is PRIVATE."""
import hashlib,json,os,stat,time
from pathlib import Path
BASE=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z/window')
REL=('content.private.tar.gz','backup-bindings-pre-postack-20261008T190208Z/window/content.private.tar.gz','postack-backup-20261008T190208Z/backup/content.private.tar.gz','postack-backup-20261008T202538Z/backup/content.private.tar.gz','backup-bindings-pre-postack-20261008T202538Z/window/content.private.tar.gz')
EXPECTED='4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810'
def meta(p):
 s=p.lstat();assert stat.S_ISREG(s.st_mode) and not p.is_symlink(),'archive_type_denied'
 return dict(device=s.st_dev,inode=s.st_ino,mode=stat.S_IMODE(s.st_mode),uid=s.st_uid,gid=s.st_gid,nlink=s.st_nlink,size=s.st_size,mtime_ns=s.st_mtime_ns,ctime_ns=s.st_ctime_ns,allocated=s.st_blocks*512)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def sample():
 result={'at':time.time(),'files':{},'owners':[],'incomplete':[]}
 for r in REL:
  p=BASE/r;a=meta(p);h=sha(p);b=meta(p)
  assert a==b and h==EXPECTED,'archive_drift'
  result['files'][str(p)]={'stat':b,'sha256':h}
 targets={(v['stat']['device'],v['stat']['inode']):p for p,v in result['files'].items()}
 procs=list(Path('/proc').iterdir());assert len(procs)<10000,'process_inventory_limit'
 for p in procs:
  if not p.name.isdigit():continue
  try:
   ticks=(p/'stat').read_text().split(') ',1)[1].split()[19]
   # Keep the collector directory FD alive while observing its own descriptors.
   with os.scandir(p/'fd') as entries:
    for entry in entries:
     fd=Path(entry.path)
     try:
      s=fd.stat();key=(s.st_dev,s.st_ino)
      if key in targets:result['owners'].append({'pid':int(p.name),'ticks':ticks,'fd':fd.name,'path':targets[key],'link':os.readlink(fd)})
     except FileNotFoundError:
      result['incomplete'].append({'pid':p.name,'fd':fd.name,'reason':'fd_disappeared'})
   if (p/'stat').read_text().split(') ',1)[1].split()[19]!=ticks:result['incomplete'].append({'pid':p.name,'reason':'identity_drift'})
  except FileNotFoundError:
   if p.exists():result['incomplete'].append({'pid':p.name,'reason':'partial_process_read'})
  except PermissionError:result['incomplete'].append({'pid':p.name,'reason':'permission_denied'})
 result['completedAt']=time.time();return result
assert os.geteuid()==0,'root_read_required'
out={'startedAt':time.time(),'samples':[],'references':[],'privatePolicies':{}}
try:
 out['samples']=[sample(),sample()]
 roots=[BASE.parent,Path('/home/deploy/.pm2')]
 names=[]
 for root in roots:
  for p in root.rglob('*'):
   if p.is_symlink() or not p.is_file():continue
   if p.name in ('dump.pm2','dump.pm2.bak') or 'manifest' in p.name.lower() or p.suffix in ('.sha256','.json','.cjs','.py','.sh','.txt'):
    names.append(p)
    assert len(names)<=10000,'reference_inventory_limit'
 for p in names:
  assert p.stat().st_size<=16*1024*1024,'reference_file_limit'
  raw=p.read_bytes();matches=[r for r in REL if r.encode() in raw or str(BASE/r).encode() in raw]
  out['references'].append({'path':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'matches':matches})
 for p in Path('/usr/local/libexec/re7').glob('*policy*.json'):
  assert p.stat().st_size<=1024*1024,'policy_limit'
  raw=p.read_bytes();out['privatePolicies'][str(p)]={'sha256':hashlib.sha256(raw).hexdigest(),'contents':json.loads(raw),'uid':p.stat().st_uid,'mode':stat.S_IMODE(p.stat().st_mode)}
 a,b=out['samples'];assert a['files']==b['files'],'between_samples_drift'
 assert not a['incomplete'] and not b['incomplete'],'incomplete_observation'
 assert a['owners']==b['owners'],'owners_unstable'
 out['observationResult']='COMPLETE';out['removalAuthorization']=False
except Exception as e:out['observationResult']='DENY';out['error']=str(e)
out['finishedAt']=time.time();print(json.dumps(out));raise SystemExit(0 if out['observationResult']=='COMPLETE' else 1)
