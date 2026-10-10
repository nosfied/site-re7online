"""FUTURE OWNER DECISION ONLY. Never invoked during preparation. Exact four paths."""
import contextlib,fcntl,hashlib,io,json,os,stat,sys,time
from pathlib import Path
P=Path('/dev/shm/re7-position6-operational-20261010T224151Z')
BASE=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z/window')
FOUR=('backup-bindings-pre-postack-20261008T190208Z/window/content.private.tar.gz','postack-backup-20261008T190208Z/backup/content.private.tar.gz','postack-backup-20261008T202538Z/backup/content.private.tar.gz','backup-bindings-pre-postack-20261008T202538Z/window/content.private.tar.gz')
INDEX_HASH='2907e12c99b68f88fb1f38bcc0b75b233b3bd4f988adb4eebdbd6107d835c6a3'
READER_HASH='0afdad90bfac03f2b5d72bc94f311b64045e7ead4ca399e02704640dc0368d60'
POLICIES={'incident-6683-window-policy.json':'38a20f3c9bba0dbf009cdf7db292c6b4a2f627200843f4a6f0fbbd7f505ddd4c','frontend-socket-observer-policy.json':'6087f980ed58f084294f77dbca688c5cba9b39229d3c2b10daa35732ff74f7d4','frontend-permanent-observer-policy.json':'24a78e7ebb6e92b56a6719a7234631ed11b8e93b657665817b6905a16a00add3'}
assert sys.argv[1:]==['--future-owner-authorized-withdraw-four'],'explicit_future_authorization_required'
assert os.geteuid()==0,'existing_operator_sudo_required'
lock=os.open(P/'administrative.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
record=P/'withdrawal-decision.private.json';assert not record.exists() and not record.is_symlink(),'attempt_already_exists'
raw=(P/'original-paths.private.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==INDEX_HASH,'original_index_drift'
index=json.loads(raw);expected={x['path']:x for x in index['files']}
referencesRaw=(P/'live-references.private.json').read_bytes();assert hashlib.sha256(referencesRaw).hexdigest()=='fd2dd4969af0c03e86c770294b51bf502241bd9663c9f60f82108729d4d44522','reference_index_drift'
references=json.loads(referencesRaw);assert not references['denials'],'reference_index_incomplete'
for item in references['files']:
 assert not item['matches'],'active_redundant_path_reference'
 assert hashlib.sha256(Path(item['path']).read_bytes()).hexdigest()==item['sha256'],'live_reference_drift'
source=(P/'storage-root-readonly-v2.py').read_bytes();assert hashlib.sha256(source).hexdigest()==READER_HASH,'reader_drift'
# Execute the actual complete observer now, not the old certificate. No process excluded.
stream=io.StringIO();namespace={}
try:
 with contextlib.redirect_stdout(stream):exec(compile(source,'fixed-storage-observer','exec'),namespace)
except SystemExit as e:assert e.code==0,'fresh_observation_denied'
v=json.loads(stream.getvalue());assert v['observationResult']=='COMPLETE','fresh_observation_incomplete'
paths={str(BASE/r)for r in FOUR}
assert all(not any(x['path'] in paths for x in s['owners']) for s in v['samples']),'archive_open'
for name,digest in POLICIES.items():assert v['privatePolicies']['/usr/local/libexec/re7/'+name]['sha256']==digest,'active_policy_drift'
# Guard/task must remain exactly at the approved state; no recovery/ack/open is done here.
ledger=Path('/var/lib/re7/campaign-operations/state.json').read_bytes()
assert hashlib.sha256(ledger).hexdigest()=='a072223faacd2681a25696d422e6b67947c88ac6b9634d97382af4536580aacf','ledger_drift'
for pid,ticks in ((18676,'222727'),(3438948,'2120147745'),(3625739,'2128115907'),(3625960,'2128116272')):
 fields=Path('/proc',str(pid),'stat').read_text().split(') ',1)[1].split()
 assert fields[19]==ticks and fields[0] not in ('Z','X','x'),'process_identity_drift'
assert not os.path.lexists('/var/lib/re7/campaign-operations/state.json.lock') and not os.path.lexists('/var/lib/re7/campaign-operations/state.json.uncertain'),'ledger_marker_present'
for path in paths:assert v['samples'][1]['files'][path]['stat']==expected[path]['stat'],'source_metadata_drift'
fd=os.open(record,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:json.dump({'freshObservation':v,'authorizedPaths':sorted(paths),'startedAt':time.time()},f);f.flush();os.fsync(f.fileno())
# Any divergence stops immediately; a partial withdrawal is recorded, never retried blindly.
for relative in FOUR:
 target=BASE/relative
 namespace['REL']=(relative,)
 individual=namespace['sample']()
 assert not individual['incomplete'] and not individual['owners'],'individual_owner_observation_denied'
 assert individual['files'][str(target)]['stat']==expected[str(target)]['stat'],'individual_observation_drift'
 assert time.time()-v['finishedAt']<=120,'observation_expired'
 for node in (target,*target.parents):assert not node.is_symlink(),'symlink_path_denied'
 descriptor=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(descriptor);h=hashlib.sha256()
  while True:
   b=os.read(descriptor,1048576)
   if not b:break
   h.update(b)
  after=os.fstat(descriptor);s=target.lstat();want=expected[str(target)]['stat']
  observed=dict(device=s.st_dev,inode=s.st_ino,mode=stat.S_IMODE(s.st_mode),uid=s.st_uid,gid=s.st_gid,nlink=s.st_nlink,size=s.st_size,mtime_ns=s.st_mtime_ns,ctime_ns=s.st_ctime_ns,allocated=s.st_blocks*512)
  assert observed==want and before==after and (after.st_dev,after.st_ino)==(s.st_dev,s.st_ino),'individual_metadata_drift'
  assert h.hexdigest()==expected[str(target)]['sha256'],'individual_hash_drift'
  os.unlink(target) # ONLY this exact allowlisted pathname; no directories/manifests/main copy.
  directory=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(directory)
  finally:os.close(directory)
  print('WITHDRAWN '+relative,flush=True)
 finally:os.close(descriptor)
print('FOUR_WITHDRAWN_MAIN_AND_MANIFESTS_PRESERVED')
