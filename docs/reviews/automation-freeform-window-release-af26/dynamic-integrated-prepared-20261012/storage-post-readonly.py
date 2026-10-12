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
  p=BASE/r
  if os.path.lexists(p):
   before=meta(p);digest=sha(p);after=meta(p);assert before==after,'archive_drift'
   result['files'][str(p)]={'exists':True,'stat':after,'sha256':digest}
  else:result['files'][str(p)]={'exists':False}
 targets={(x['dev'],x['inode']):x['path']for x in index['paths']}
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
def guard():
 raw=Path('/var/lib/re7/campaign-operations/state.json').read_bytes()
 assert hashlib.sha256(raw).hexdigest()==index['guardSha256'],'guard_drift'
 for process in index['processes']:
  p=Path('/proc',str(process['pid']));fields=(p/'stat').read_text().split(') ',1)[1].split();assert fields[19]==str(process['ticks']) and fields[0]not in('Z','X','x') and os.readlink(p/'cwd')==process['cwd'],'process_identity_drift'
 for suffix in ('.lock','.uncertain'):assert not os.path.lexists('/var/lib/re7/campaign-operations/state.json'+suffix),'ledger_marker'
 return hashlib.sha256(raw).hexdigest()
assert os.geteuid()==0,'root_read_required'
raw=(P/'storage-paths.private.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==INDEX_SHA,'index_drift'
index=json.loads(raw)
result={'startedAt':time.time(),'samples':[],'readOnly':True}
try:
 guard();result['samples']=[sample(),sample()];guard()
 for sample_value in result['samples']:
  assert not sample_value['incomplete'] and not sample_value['owners'],'owner_or_incomplete'
  main=sample_value['files'][index['keep']];assert main['exists']and main['sha256']==index['blobSha256'],'main_drift'
 assert result['samples'][0]['files']==result['samples'][1]['files'],'samples_drift'
 result['result']='COMPLETE';result['remainingCopies']=[x for x in index['withdraw']if result['samples'][1]['files'][x]['exists']]
except Exception as e:result['result']='DENY';result['error']=type(e).__name__+':'+str(e)
result['finishedAt']=time.time();print(json.dumps(result));raise SystemExit(0 if result['result']=='COMPLETE' else 1)
