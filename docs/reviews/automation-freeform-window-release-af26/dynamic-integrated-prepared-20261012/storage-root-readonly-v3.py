"""Root READ ONLY: exact three archives, references and two complete FD observations.
No process excluded, no installation/delegation/service/provider/ledger mutation.
"""
import hashlib,json,os,stat,time
from pathlib import Path
P=Path('/dev/shm/re7-integrated-storage-audit-20261012T153000Z')
BASE=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window')
REL=('content.private.tar.gz','backup-bindings-pre-postack-20261008T215639Z/window/content.private.tar.gz','postack-backup-20261008T215639Z/backup/content.private.tar.gz')
EXPECTED='4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810'
INDEX_SHA='39b5b962e0465e8d115a8b95e29b0e8bda6bd5356fcd9323fac923fad64e984f'
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
raw=(P/'storage-paths.private.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==INDEX_SHA,'index_drift'
index=json.loads(raw);expected={x['path']:x for x in index['paths']}
def guard():
 raw=Path('/var/lib/re7/campaign-operations/state.json').read_bytes()
 assert hashlib.sha256(raw).hexdigest()==index['guardSha256'],'guard_drift'
 for process in index['processes']:
  p=Path('/proc',str(process['pid']));fields=(p/'stat').read_text().split(') ',1)[1].split();assert fields[19]==str(process['ticks']) and fields[0]not in('Z','X','x') and os.readlink(p/'cwd')==process['cwd'],'process_identity_drift'
 for suffix in ('.lock','.uncertain'):assert not os.path.lexists('/var/lib/re7/campaign-operations/state.json'+suffix),'ledger_marker'
 return hashlib.sha256(raw).hexdigest()
output={'startedAt':time.time(),'samples':[],'references':[],'policies':[],'removalAuthorized':False}
try:
 guard();output['samples']=[sample(),sample()];guard()
 for sample_value in output['samples']:
  for path,x in sample_value['files'].items():
   want=expected[path];mapped={'device':want['dev'],'inode':want['inode'],'mode':want['mode'],'uid':want['uid'],'gid':want['gid'],'nlink':want['nlink'],'size':want['size'],'mtime_ns':want['mtime_ns'],'ctime_ns':want['ctime_ns'],'allocated':want['allocated']}
   assert x['stat']==mapped,'archive_metadata_drift'
  assert not sample_value['owners'] and not sample_value['incomplete'],'owner_or_incomplete'
 assert output['samples'][0]['files']==output['samples'][1]['files'],'samples_drift'
 # Active policy contents remain private: publish hash/relationship, never credentials.
 targets=[str(BASE/r)for r in REL];withdraw=set(index['withdraw']);visited=0
 roots=[Path('/opt/re7online/backups/converta-persistent/preparations'),Path('/home/deploy/.pm2'),Path('/usr/local/libexec/re7')]
 for root in roots:
  for folder,dirs,names in os.walk(root,followlinks=False):
   dirs[:]=[x for x in dirs if x not in ('node_modules','.next','.git','dist','src','public') and not (Path(folder)/x).is_symlink()]
   for name in names:
    p=Path(folder)/name
    if p.is_symlink():continue
    if not (name in ('dump.pm2','dump.pm2.bak') or p.suffix in ('.sha256','.json','.cjs','.py','.sh','.txt') or 'manifest' in name.lower()):continue
    visited+=1;assert visited<30000,'reference_inventory_limit';s=p.stat();assert s.st_size<16*1024*1024,'reference_size_limit'
    raw=p.read_bytes();digest=hashlib.sha256(raw).hexdigest();hits=[x for x in targets if x.encode()in raw]
    relative_hits=[r for r in REL[1:]if r.encode()in raw]
    if hits or relative_hits or root in (roots[1],roots[2]):output['references'].append({'path':str(p),'sha256':digest,'bytes':len(raw),'matches':hits,'relativeMatches':relative_hits,'activeRoot':root in (roots[1],roots[2])})
    if root==roots[2]and 'policy' in name:output['policies'].append({'path':str(p),'sha256':digest,'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode)})
 output['referenceFilesScanned']=visited;output['result']='COMPLETE'
except Exception as e:output['result']='DENY';output['error']=type(e).__name__+':'+str(e)
output['finishedAt']=time.time();print(json.dumps(output));raise SystemExit(0 if output['result']=='COMPLETE' else 1)
