"""Second lot only: sealed metadata, no symlink traversal or automatic replay.
Canonical anchored unlink/rmdir and filesystem accounting reused without a service action.
No provider, SQL mutation, process control, helper/policy or credential change.
"""
import argparse,hashlib,json,os,stat,time,subprocess,fcntl
from pathlib import Path
ROOTS=tuple('/opt/re7online/releases/'+n for n in (
'03f930e5453efd313a91a16de3e22057a0573d9c',
'a1cc380eddcd1467b8e0d3a8e405f82689a25b3d',
'a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b',
'campaign-eligibility-recovery-reviewed-20261008',
'e8ebd776ba7c92cc9013fefb29035eae3ab1af4e',
'flow-e8ebd776.tar.gz','frontend-a1cc380e.tar.gz',
'worker-bf5f1d76-f06d49cb-042e386a','worker-bf5f1d76-f06d49cb-91230f88'))
FIELDS=('dev','ino','mode','uid','gid','nlink','size','blocks','mtimeNs','ctimeNs')
GUARD='/var/lib/re7/campaign-operations/state.json'
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()

def meta(p):
 s=os.lstat(p)
 return dict(zip(FIELDS,(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_blocks,s.st_mtime_ns,s.st_ctime_ns)))

def parents(p):
 for q in Path(p).parents:
  s=q.lstat();assert stat.S_ISDIR(s.st_mode)and not q.is_symlink(),'parent_chain_denied'

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
  assert (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid)==tuple(want[k]for k in ('dev','ino','mode','uid','gid')),'cache_directory_drift'
  os.rmdir(parts[-1],dir_fd=fd);os.fsync(fd)
 finally:os.close(fd)

def exclusive_json(path,value):
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(value,f);f.flush();os.fsync(f.fileno())

def capacity():
 q=os.statvfs('/');deploy=q.f_bavail*q.f_frsize
 raw=subprocess.check_output(['docker','--host','unix:///var/run/docker.sock','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10)
 return min(deploy,int(raw.splitlines()[-1].split()[3]))

def under(p,root):return p==root or p.startswith(root+'/')
def inventory():
 out={}
 def deny(e):raise e
 for root in ROOTS:
  parents(root);out[root]=meta(root)
  if stat.S_ISDIR(out[root]['mode']):
   for folder,dirs,files in os.walk(root,followlinks=False,onerror=deny):
    for name in dirs+files:out[os.path.join(folder,name)]=meta(os.path.join(folder,name))
 return out

def validate_targets(plan):
 assert plan['roots']==list(ROOTS),'literal_allowlist_drift'
 assert not plan.get('syntheticProofPolicy'),'synthetic_policy_denied'
 want={v['path']:v for v in plan['entries']};assert len(want)==len(plan['entries']),'duplicate_entry'
 assert all(any(under(p,r)for r in ROOTS)for p in want),'path_outside_allowlist'
 actual=inventory();assert set(actual)==set(want),'membership_drift'
 keys=set()
 for p,v in want.items():
  parents(p);assert actual[p]=={k:v[k]for k in FIELDS},'metadata_drift'
  assert (v['dev'],v['ino'])not in keys,'inode_overlap';keys.add((v['dev'],v['ino']))
  assert stat.S_ISREG(v['mode'])or stat.S_ISDIR(v['mode'])or stat.S_ISLNK(v['mode']),'type_denied'
  if not stat.S_ISDIR(v['mode']):assert v['nlink']==1,'external_hardlink'
  if stat.S_ISREG(v['mode']):assert digest(p)==v['sha256']and meta(p)==actual[p],'file_hash_or_race'
  elif stat.S_ISLNK(v['mode']):assert os.readlink(p)==v['target']and meta(p)==actual[p],'link_drift'
 return want

def read_database_role():
 sql="BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SELECT json_build_object('verifier',rolpassword,'attributes',to_jsonb(pg_authid)-'rolpassword') FROM pg_authid WHERE rolname='wa_agent';ROLLBACK;"
 r=subprocess.run(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,timeout=12)
 assert r.returncode==0,'database_observation_denied'
 return json.loads(r.stdout)

REFERENCE_ROOTS=('/etc/systemd/system','/etc/cron.d','/etc/nginx','/etc/sudoers.d','/usr/local/libexec/re7','/usr/local/sbin','/home/deploy/.pm2','/opt/re7online/backups/converta-persistent/preparations','/opt/re7online/releases')
SKIP={'node_modules','.next','.git','dist','src','public','logs','.data','.cache'}
def reference_paths(evidence):
 out=[]
 def denied(e):raise e
 for root in REFERENCE_ROOTS:
  for folder,dirs,files in os.walk(root,followlinks=False,onerror=denied):
   dirs[:]=[d for d in dirs if d not in SKIP and not under(os.path.join(folder,d),evidence)and not any(under(os.path.join(folder,d),r)for r in ROOTS)]
   if under(folder,evidence)or any(under(folder,r)for r in ROOTS):continue
   for n in files+dirs:
    p=Path(folder)/n;z=p.lstat()
    if stat.S_ISLNK(z.st_mode):out.append(str(p))
    elif stat.S_ISREG(z.st_mode)and(z.st_size<=16*1024*1024)and(p.suffix in {'.json','.cjs','.py','.sh','.txt','.sha256','.conf','.service','.timer','.pm2','.pid','.env'}or str(p).startswith(('/etc/cron','/etc/nginx','/usr/local/libexec','/usr/local/sbin'))):out.append(str(p))
 return sorted(set(out))

def validate_state(plan):
 assert reference_paths(plan['evidenceDirectory'])==plan['referenceInventory'],'reference_inventory_drift'
 assert Path('/proc/sys/kernel/random/boot_id').read_text().strip()==plan['bootId'],'boot_drift'
 parents(GUARD);z=Path(GUARD).lstat();assert stat.S_ISREG(z.st_mode)and z.st_nlink==1 and z.st_uid==plan['guardUid']and stat.S_IMODE(z.st_mode)==plan['guardMode'],'guard_type_or_owner'
 raw=Path(GUARD).read_bytes();assert hashlib.sha256(raw).hexdigest()==plan['guardSha256'],'guard_hash_drift'
 g=json.loads(raw);assert g['generation']==38 and g['open']is False and not g['tasks']and not g.get('ledgerFault'),'guard_contract'
 assert not any(os.path.lexists(GUARD+x)for x in ['.lock','.uncertain']),'guard_marker'
 for q in plan['processes']:
  p=Path('/proc',str(q['pid']));s=(p/'stat').read_text().split(') ',1)[1].split()
  assert s[19]==q['ticks']and s[0]not in ['Z','X','x']and os.readlink(p/'cwd')==q['cwd'],'process_identity_drift'
 for q in plan['references']:
  p=Path(q['path']);assert not p.is_symlink()and p.is_file(),'reference_type_drift'
  s=p.lstat();assert s.st_uid==q['uid']and stat.S_IMODE(s.st_mode)==q['mode']and digest(p)==q['sha256'],'reference_drift'
 for q in plan.get('referenceLinks',[]):assert os.path.islink(q['path'])and os.readlink(q['path'])==q['target'],'reference_link_drift'
 db=plan['database'];r=Path(db['receipt']);assert digest(r)==db['receiptSha256'],'database_receipt_drift'
 v=json.loads(r.read_text());assert v['verification']=={'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}and v['planSha256']==db['planSha256'],'database_not_verified'
 assert v['intentSha256']==digest(db['intent']),'database_intent_drift'
 assert digest(db['policy'])==db['policySha256']=='9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c','policy_drift'
 row=read_database_role();assert row['attributes']==db['expectedFullAttributes']and hashlib.sha256(row['verifier'].encode()).hexdigest()==db['expectedVerifierSha256'],'effective_new_database_drift'
 assert plan['custody']['verified']is True and plan['custody']['archiveSha256']=='eaa1d3e711746b0bc3b2b0b1fb1b0d86f8eb0624162eacea02bf8749d15bf22e','custody_binding'
 assert capacity()>=plan['minimumBeforeBytes'],'before_capacity_denied'

def observe(plan):
 keys={(q['dev'],q['ino'])for q in plan['entries']};hits=[];incomplete=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  ticks=None
  try:
   s=(p/'stat').read_text().split(') ',1)[1].split();ticks=s[19]
   for field in ['cwd','exe']:
    try:
     target=os.readlink(p/field)
     if any(under(target,r)for r in ROOTS):hits.append({'pid':int(p.name),'ticks':ticks,'field':field})
    except FileNotFoundError:
     if s[0]!='Z'and(p/'cmdline').read_bytes():raise
   with os.scandir(p/'fd')as ds:
    for f in ds:
     try:
      z=os.stat(f.path);target=os.readlink(f.path)
      if(z.st_dev,z.st_ino)in keys or any(under(target,r)for r in ROOTS):hits.append({'pid':int(p.name),'ticks':ticks,'fd':f.name})
     except OSError as e:incomplete.append({'pid':int(p.name),'ticks':ticks,'fd':f.name,'errno':e.errno})
   for line in (p/'maps').read_text().splitlines():
    fields=line.split(None,5)
    if len(fields)<5:raise ValueError('map_shape')
    major,minor=fields[3].split(':');key=(os.makedev(int(major,16),int(minor,16)),int(fields[4]))
    target=fields[5]if len(fields)>5 else''
    if key in keys or any(under(target,r)for r in ROOTS):hits.append({'pid':int(p.name),'ticks':ticks,'kind':'mapping'})
   assert(p/'stat').read_text().split(') ',1)[1].split()[19]==ticks,'identity_drift'
  except(OSError,AssertionError)as e:incomplete.append({'pid':int(p.name),'ticks':ticks,'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
 return {'at':time.time(),'owners':hits,'incomplete':incomplete}

def anchored_link_unlink(p,want):
 parts=Path(p).parts;fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for part in parts[1:-1]:
   nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=nxt
  s=os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)
  assert(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_mtime_ns,s.st_ctime_ns)==tuple(want[k]for k in('dev','ino','mode','uid','gid','nlink','mtimeNs','ctimeNs')),'link_identity_drift'
  assert os.readlink(parts[-1],dir_fd=fd)==want['target'],'link_target_drift'
  os.unlink(parts[-1],dir_fd=fd);os.fsync(fd)
 finally:os.close(fd)

def run(plan,folder,apply=False):
 assert not os.path.lexists(folder/'withdrawal.intent.private.json'),'attempt_consumed'
 validate_state(plan);want=validate_targets(plan)
 reclaim=sum(q['blocks']*512 for q in want.values());assert capacity()+reclaim-plan['evidenceBudgetBytes']>=plan['requiredPostFreeBytes'],'post_capacity_denied'
 samples=[observe(plan),observe(plan)];assert all(not q['owners']and not q['incomplete']for q in samples),'ownership_or_incomplete'
 validate_state(plan)
 if not apply:return {'result':'DRY_RUN_PASS','observations':samples,'removedCount':0,'allocatedPotential':reclaim}
 exclusive_json(folder/'withdrawal.intent.private.json',{'at':time.time(),'planSha256':plan['_hash'],'observations':samples})
 removed=0;journal=folder/'removals.private.jsonl';jfd=os.open(journal,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  for root in ROOTS:
   validate_state(plan);sample=observe(plan);assert not sample['owners']and not sample['incomplete'],'root_owner_or_incomplete'
   targets=[p for p in want if under(p,root)]
   files=sorted(p for p in targets if not stat.S_ISDIR(want[p]['mode']))
   dirs=sorted((p for p in targets if stat.S_ISDIR(want[p]['mode'])),key=lambda p:len(Path(p).parts),reverse=True)
   for p in files+dirs:
    if stat.S_ISREG(want[p]['mode']):anchored_unlink(p,want[p])
    elif stat.S_ISLNK(want[p]['mode']):anchored_link_unlink(p,want[p])
    else:anchored_rmdir(p,want[p])
    removed+=1;raw=(json.dumps({'path':p,'at':time.time()})+'\n').encode();assert os.write(jfd,raw)==len(raw),'journal_short_write'
    if removed%256==0:os.fsync(jfd)
  os.fsync(jfd);validate_state(plan);assert all(not os.path.lexists(r)for r in ROOTS),'root_remaining'
  assert capacity()>=plan['requiredPostFreeBytes'],'final_capacity_denied'
  v={'result':'WITHDRAWAL_COMPLETE','removedCount':removed,'finishedAt':time.time(),'planSha256':plan['_hash']};exclusive_json(folder/'withdrawal.receipt.private.json',v);return v
 except Exception as e:
  os.fsync(jfd);exclusive_json(folder/'partial.private.json',{'at':time.time(),'removedCount':removed,'errorClass':type(e).__name__,'planSha256':plan['_hash'],'noAutomaticRetry':True});raise
 finally:os.close(jfd)

def post_read(plan,folder):
 validate_state(plan);remaining=0;drift=0
 for q in plan['entries']:
  if not os.path.lexists(q['path']):continue
  remaining+=1
  if not stat.S_ISDIR(q['mode'])and meta(q['path'])!={k:q[k]for k in FIELDS}:drift+=1
 sample=observe(plan)
 return {'result':'POST_READ_COMPLETE','remainingEntries':remaining,'nonDirectoryMetadataDrift':drift,'observation':sample,'minimumAvailableBytes':capacity(),'capacityPass':capacity()>=plan['requiredPostFreeBytes'],'receiptExists':(folder/'withdrawal.receipt.private.json').is_file(),'removalExecutedByThisReader':False}

def main():
 a=argparse.ArgumentParser();a.add_argument('--plan',required=True);a.add_argument('--plan-sha256',required=True);a.add_argument('--owner-authorized-apply',action='store_true');a.add_argument('--post-read',action='store_true');v=a.parse_args();assert not(v.owner_authorized_apply and v.post_read),'mode_conflict'
 p=Path(v.plan);parents(p);s=p.lstat();assert stat.S_ISREG(s.st_mode)and stat.S_IMODE(s.st_mode)==0o600,'input_type_or_mode'
 raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==v.plan_sha256,'input_hash_drift';plan=json.loads(raw);plan['_hash']=v.plan_sha256
 assert s.st_uid==plan['executorUid'],'input_owner_drift';folder=p.parent;s=folder.lstat();assert stat.S_ISDIR(s.st_mode)and stat.S_IMODE(s.st_mode)==0o700 and s.st_uid==plan['executorUid'],'directory_owner_or_mode'
 assert os.geteuid()==0,'existing_operator_sudo_required'
 with(folder/'administrative.lock').open('a+')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  try:
   r=post_read(plan,folder)if v.post_read else run(plan,folder,v.owner_authorized_apply)
   name=('post-'+str(time.time_ns())if v.post_read else'apply-result'if v.owner_authorized_apply else'dry-run')+'.private.json';exclusive_json(folder/name,r)
   print(json.dumps({k:r[k]for k in ['result','removedCount','remainingEntries','capacityPass','minimumAvailableBytes']if k in r},sort_keys=True))
  except Exception as e:
   exclusive_json(folder/('denial-'+str(time.time_ns())+'.private.json'),{'at':time.time(),'errorClass':type(e).__name__,'reason':str(e)if isinstance(e,AssertionError)else None,'errno':getattr(e,'errno',None),'noAutomaticRetry':True})
   print(json.dumps({'result':'DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
if __name__=='__main__':main()
