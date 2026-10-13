"""Review-only retirement driver; fixed paths, private bound plan, no automatic retries.
Adapted from canonical storage withdrawal: exact allowlist + fresh ownership + guarded unlink.
No database, provider, service, ledger, root policy or credential mutation.
"""
import argparse,hashlib,json,os,stat,time,subprocess
from pathlib import Path
CACHE='/home/deploy/.npm/_cacache'
B='/opt/re7online/backups/converta-persistent/preparations/'
ARCHIVES=tuple(B+x for x in (
'incident-6683-v4-20261003T150000Z/window/prior-backup-20261003T145400Z/content.private.tar.gz',
'incident-6683-v4-20261003T150000Z/window/refresh-20261003T152700Z/content.private.tar.gz',
'incident-6683-v4-pm2-20261003T235000Z/window/backup-first-preserved-20261003T235000Z/content.private.tar.gz',
'incident-6683-v4-sequenced-20261003T163000Z/window/prior-backup-20261003T163200Z/content.private.tar.gz'))
FIELDS=('dev','ino','mode','uid','gid','nlink','size','blocks','mtimeNs','ctimeNs')
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def meta(p):
 s=os.lstat(p)
 return dict(zip(FIELDS,(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_blocks,s.st_mtime_ns,s.st_ctime_ns)))
def compare(p,want):
 assert meta(p)=={k:want[k]for k in FIELDS},'target_metadata_drift'
def parents(p):
 for q in Path(p).parents:
  s=q.lstat();assert stat.S_ISDIR(s.st_mode)and not q.is_symlink(),'parent_chain_denied'
def cache_inventory(root):
 out={}
 def deny(e):raise e
 for folder,ds,fs in os.walk(root,followlinks=False,onerror=deny):
  for x in [folder]+[os.path.join(folder,n)for n in fs]+[os.path.join(folder,n)for n in ds if os.path.islink(os.path.join(folder,n))]:
   m=meta(x);assert stat.S_ISDIR(m['mode'])or stat.S_ISREG(m['mode']),'cache_type_denied'
   if stat.S_ISREG(m['mode']):assert m['nlink']==1,'cache_external_hardlink_denied'
   out[x]=m
 return out
def validate_targets(plan):
 assert plan['archives']==list(ARCHIVES)and plan['cacheRoot']==CACHE,'allowlist_denied'
 assert plan['main']['path']not in ARCHIVES,'principal_is_candidate'
 parents(plan['main']['path']);compare(plan['main']['path'],plan['main']);assert digest(plan['main']['path'])==plan['main']['sha256'],'principal_drift';compare(plan['main']['path'],plan['main'])
 want={x['path']:x for x in plan['entries']}
 assert set(ARCHIVES).issubset(want)and CACHE in want,'input_incomplete'
 assert all(p in ARCHIVES or p==CACHE or p.startswith(CACHE+'/')for p in want),'extra_path_denied'
 actual=cache_inventory(CACHE)
 assert set(actual)=={p for p in want if p==CACHE or p.startswith(CACHE+'/')},'cache_membership_drift'
 for p,x in want.items():
  parents(p);compare(p,x)
  if stat.S_ISREG(x['mode']):
   assert x['nlink']==1 and digest(p)==x['sha256'],'file_hash_or_hardlink_denied'
 assert len({(want[p]['dev'],want[p]['ino'])for p in ARCHIVES})==4,'archive_inode_overlap'
 return want
CONTROL_ROOTS=('/etc/systemd/system','/etc/cron.d','/etc/nginx','/etc/sudoers.d','/usr/local/libexec/re7','/usr/local/sbin')
def control_paths():
 out=[]
 def denied(e):raise e
 for root in CONTROL_ROOTS:
  for folder,ds,fs in os.walk(root,followlinks=False,onerror=denied):
   out.extend(os.path.join(folder,x)for x in fs)
   out.extend(os.path.join(folder,x)for x in ds if os.path.islink(os.path.join(folder,x)))
 return sorted(out)
def validate_state(plan):
 assert control_paths()==plan['controlPaths'],'control_inventory_drift'
 g=Path('/var/lib/re7/campaign-operations/state.json');raw=g.read_bytes()
 assert hashlib.sha256(raw).hexdigest()==plan['guardSha256'],'guard_drift'
 j=json.loads(raw);assert j['generation']==38 and j['open']is False and j['tasks']=={},'guard_contract_denied'
 assert not any(os.path.lexists(str(g)+x)for x in ('.lock','.uncertain')),'ledger_marker'
 for x in plan['processes']:
  p=Path('/proc',str(x['pid']));s=(p/'stat').read_text().split(') ',1)[1].split()
  assert s[19]==x['ticks']and s[0]not in('Z','X','x')and os.readlink(p/'cwd')==x['cwd'],'process_drift'
 for x in plan['references']:
  p=Path(x['path']);assert p.is_file()and not p.is_symlink()and digest(p)==x['sha256'],'reference_drift'
def owners(plan):
 keys={(x['dev'],x['ino'])for x in plan['entries']};hits=[];incomplete=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  ticks=None
  try:
   s=(p/'stat').read_text().split(') ',1)[1].split();ticks=s[19]
   try:
    cwd=os.readlink(p/'cwd')
    if cwd==CACHE or cwd.startswith(CACHE+'/'):hits.append({'pid':int(p.name),'ticks':ticks,'kind':'cwd'})
   except FileNotFoundError:
    if s[0]!='Z'and (p/'cmdline').read_bytes():raise
   with os.scandir(p/'fd')as ds:
    for f in ds:
     try:
      st=os.stat(f.path);target=os.readlink(f.path)
      if (st.st_dev,st.st_ino)in keys or target==CACHE or target.startswith(CACHE+'/'):hits.append({'pid':int(p.name),'ticks':ticks,'fd':f.name})
     except OSError as e:incomplete.append({'pid':int(p.name),'ticks':ticks,'fd':f.name,'errno':e.errno,'errorClass':type(e).__name__})
   assert (p/'stat').read_text().split(') ',1)[1].split()[19]==ticks,'identity_drift'
  except (OSError,AssertionError)as e:incomplete.append({'pid':int(p.name),'ticks':ticks,'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
 return {'at':time.time(),'owners':hits,'incomplete':incomplete}
def anchored_unlink(p,want):
 """Every parent opened without following symlinks; exact inode and content rechecked."""
 parts=Path(p).parts;fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for part in parts[1:-1]:
   nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=nxt
  st=os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)
  assert (st.st_dev,st.st_ino,st.st_mode,st.st_nlink,st.st_size,st.st_mtime_ns,st.st_ctime_ns)==tuple(want[k]for k in ('dev','ino','mode','nlink','size','mtimeNs','ctimeNs')),'last_file_drift'
  filefd=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  with os.fdopen(filefd,'rb')as f:
   h=hashlib.sha256()
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
   after=os.fstat(f.fileno());assert h.hexdigest()==want['sha256']and (after.st_dev,after.st_ino,after.st_mtime_ns,after.st_ctime_ns)==(st.st_dev,st.st_ino,st.st_mtime_ns,st.st_ctime_ns),'last_hash_drift'
  os.unlink(parts[-1],dir_fd=fd);os.fsync(fd)
 finally:os.close(fd)
def anchored_rmdir(p,want):
 parts=Path(p).parts;fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for part in parts[1:-1]:
   nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=nxt
  s=os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)
  assert (s.st_dev,s.st_ino,s.st_mode)==tuple(want[k]for k in ('dev','ino','mode')),'cache_directory_drift'
  os.rmdir(parts[-1],dir_fd=fd);os.fsync(fd)
 finally:os.close(fd)
def exclusive_json(path,value):
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(value,f);f.flush();os.fsync(f.fileno())

def capacity():
 q=os.statvfs('/');deploy=q.f_bavail*q.f_frsize
 raw=subprocess.check_output(['docker','--host','unix:///var/run/docker.sock','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10)
 return min(deploy,int(raw.splitlines()[-1].split()[3]))
def run(plan,path,apply):
 assert os.geteuid()==0,'root_read_required';assert not os.path.lexists(path/'withdrawal.intent.private.json'),'intent_consumed'
 validate_state(plan);want=validate_targets(plan)
 reclaim=sum(x['blocks']*512 for p,x in want.items()if p!=CACHE)
 assert capacity()+reclaim>=plan['requiredPostFreeBytes'],'durable_margin_denied'
 observations=[owners(plan),owners(plan)]
 assert all(not x['owners']and not x['incomplete']for x in observations),'ownership_or_observation_denied'
 validate_state(plan)
 if not apply:return {'result':'DRY_RUN_PASS','removed':False,'observations':observations}
 exclusive_json(path/'withdrawal.intent.private.json',{'at':time.time(),'planSha256':plan['_hash'],'observations':observations})
 result={'startedAt':time.time(),'removed':[],'cacheRootPreserved':True}
 try:
  for p in ARCHIVES:anchored_unlink(p,want[p]);result['removed'].append(p)
  for p in sorted(x for x in want if x.startswith(CACHE+'/')and stat.S_ISREG(want[x]['mode'])):
   anchored_unlink(p,want[p]);result['removed'].append(p)
  # Keep the cache root and all historical preparation directories. Remove only indexed empty cache subdirectories.
  for p in sorted((x for x in want if x.startswith(CACHE+'/')and stat.S_ISDIR(want[x]['mode'])),key=lambda x:len(Path(x).parts),reverse=True):
   anchored_rmdir(p,want[p])
  validate_state(plan);result['minimumAvailableBytes']=capacity();result['result']='WITHDRAWAL_COMPLETE'if result['minimumAvailableBytes']>=plan['requiredPostFreeBytes']else'WITHDRAWAL_COMPLETE_CAPACITY_DENY'
 except Exception as e:result.update(result='PARTIAL_OR_DENY_NO_RETRY',errorClass=type(e).__name__,reason=str(e)if isinstance(e,AssertionError)else None)
 result['finishedAt']=time.time();exclusive_json(path/'withdrawal.receipt.private.json',result);return result
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--plan',required=True);a.add_argument('--plan-sha256',required=True);a.add_argument('--owner-authorized-apply',action='store_true');v=a.parse_args()
 p=Path(v.plan);raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==v.plan_sha256,'input_drift';plan=json.loads(raw);plan['_hash']=v.plan_sha256
 st=p.parent.lstat();assert stat.S_ISDIR(st.st_mode)and stat.S_IMODE(st.st_mode)==0o700 and not p.parent.is_symlink(),'evidence_directory_denied'
 try:
  r=run(plan,p.parent,v.owner_authorized_apply);exclusive_json(p.parent/('apply-result.private.json'if v.owner_authorized_apply else 'dry-run.private.json'),r)
  print(json.dumps({'result':r['result'],'removedCount':len(r.get('removed',[])),'automaticRetry':False}));raise SystemExit(0 if r['result']in('DRY_RUN_PASS','WITHDRAWAL_COMPLETE')else 1)
 except Exception as e:
  exclusive_json(p.parent/'denial.private.json',{'at':time.time(),'errorClass':type(e).__name__,'reason':str(e)if isinstance(e,AssertionError)else None,'errno':getattr(e,'errno',None),'noAutomaticRetry':True});print(json.dumps({'result':'DENY','errorClass':type(e).__name__,'reason':str(e)if isinstance(e,AssertionError)else None,'errno':getattr(e,'errno',None),'noAutomaticRetry':True}));raise SystemExit(1)
