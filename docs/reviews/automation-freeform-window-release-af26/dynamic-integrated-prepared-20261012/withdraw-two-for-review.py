"""FOR REVIEW ONLY. Removal requires the specific future owner authorization.
Derived from the canonical October 10 withdrawal driver; no service/DB mutation.
"""
import contextlib,fcntl,hashlib,io,json,os,stat,sys,time
from pathlib import Path
P=Path('/dev/shm/re7-integrated-storage-audit-20261012T153000Z')
BASE=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window')
TWO=('backup-bindings-pre-postack-20261008T215639Z/window/content.private.tar.gz','postack-backup-20261008T215639Z/backup/content.private.tar.gz')
INDEX_HASH='39b5b962e0465e8d115a8b95e29b0e8bda6bd5356fcd9323fac923fad64e984f'
READER_HASH='2cd7f25e96e9a4fcd796a4f06dde59c288945c3eccb2345c34e35982ef6d0e49'
REFERENCE_HASH='b0af5d143cf00e2d5aa5704e7cf09d3249927d3a6e01690f1e2d6fdb47bcd4c2'
POLICIES={'/usr/local/libexec/re7/frontend-socket-observer-policy.json': '7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472', '/usr/local/libexec/re7/frontend-permanent-observer-policy.json': '3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391', '/usr/local/libexec/re7/incident-6683-window-policy.json': '620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f'}
HISTORICAL_REFERENCES={'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-manifest.private.json': 'b62bd64175c5423e70a2c71e79efd1159814ec2c2f780f64dd7de1daa79ae6d6', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/archive.sha256': '98fe570989918530ae5fcd1779782135b5484da5b6b00fa44bd22f87622cd5d0', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/return-partial/backup-manifest.json': 'eaecb387dfdc2c633370dc8ed77d2dabbfdfd507411fb75d9fd8324bff79ac1a', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/return/backup-manifest.json': 'eaecb387dfdc2c633370dc8ed77d2dabbfdfd507411fb75d9fd8324bff79ac1a', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/window/backup-manifest.private.json': 'eaecb387dfdc2c633370dc8ed77d2dabbfdfd507411fb75d9fd8324bff79ac1a', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/switch/backup-manifest.json': 'eaecb387dfdc2c633370dc8ed77d2dabbfdfd507411fb75d9fd8324bff79ac1a', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/postack-backup-20261008T215639Z/backup-manifest.private.json': 'b62bd64175c5423e70a2c71e79efd1159814ec2c2f780f64dd7de1daa79ae6d6', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/postack-backup-20261008T215639Z/preconditions-result.sanitized.json': '5d4c1415e54525619d3769c0705c4897d39f1e68ff2ae17d98ebf434037495b0', '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/authorized-window-20261008T215610Z/before.private.json': 'e83d23d673bf8a29906fd6157e43ab11cd4d78ccc5840b2f2d4f91c2e2d14828'}
assert sys.argv[1:]==['--future-owner-authorized-withdraw-two'],'future_specific_authorization_required'
assert os.geteuid()==0,'existing_operator_sudo_required'
lock=os.open(P/'administrative.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
record=P/'withdrawal-decision.private.json';assert not os.path.lexists(record),'attempt_already_exists'
raw=(P/'storage-paths.private.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==INDEX_HASH,'index_drift'
index=json.loads(raw);assert index['withdraw']==[str(BASE/x)for x in TWO],'allowlist_drift'
expected={x['path']:x for x in index['paths']}
reference_raw=(P/'root-observation.private.json').read_bytes();assert hashlib.sha256(reference_raw).hexdigest()==REFERENCE_HASH,'reviewed_reference_drift'
reference=json.loads(reference_raw);assert reference['result']=='COMPLETE','reference_incomplete'
source=(P/'storage-root-readonly-v3.py').read_bytes();assert hashlib.sha256(source).hexdigest()==READER_HASH,'reader_drift'
stream=io.StringIO();namespace={}
try:
 with contextlib.redirect_stdout(stream):exec(compile(source,'fixed-complete-storage-reader','exec'),namespace)
except SystemExit as error:assert error.code==0,'fresh_observation_denied'
v=json.loads(stream.getvalue());assert v['result']=='COMPLETE','fresh_observation_incomplete'
assert v['references']==reference['references'],'references_drift'
for path,digest in HISTORICAL_REFERENCES.items():
 p=Path(path);assert not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==digest,'historical_reference_drift'
assert v['referenceFilesScanned']==reference['referenceFilesScanned'],'reference_inventory_drift'
for path,digest in POLICIES.items():
 observed=next(x for x in v['policies']if x['path']==path)
 assert observed['sha256']==digest and observed['uid']==0 and observed['mode']==0o600,'active_policy_drift'
assert all(not s['owners']and not s['incomplete']for s in v['samples']),'owner_or_incomplete'
fd=os.open(record,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w')as f:json.dump({'startedAt':time.time(),'paths':[str(BASE/x)for x in TWO],'freshObservation':v},f);f.flush();os.fsync(f.fileno())
for relative in TWO:
 namespace['guard']();namespace['REL']=(relative,);individual=namespace['sample']()
 assert not individual['owners']and not individual['incomplete'],'individual_observation_denied'
 assert time.time()-v['finishedAt']<=120,'observation_expired'
 target=BASE/relative
 for p in(target,*target.parents):assert not p.is_symlink(),'symlink_chain'
 descriptor=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(descriptor);digest=hashlib.sha256()
  while True:
   data=os.read(descriptor,1048576)
   if not data:break
   digest.update(data)
  after=os.fstat(descriptor);s=target.lstat();want=expected[str(target)]
  observed={'dev':s.st_dev,'inode':s.st_ino,'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'nlink':s.st_nlink,'size':s.st_size,'mtime_ns':s.st_mtime_ns,'ctime_ns':s.st_ctime_ns,'allocated':s.st_blocks*512}
  assert all(observed[k]==want[k]for k in observed),'individual_metadata_drift'
  assert before==after and(after.st_dev,after.st_ino)==(s.st_dev,s.st_ino),'individual_identity_drift'
  assert digest.hexdigest()==index['blobSha256'],'individual_hash_drift'
  os.unlink(target) # Only this reviewed literal path; never main, directory, manifest or release.
  parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(parent)
  finally:os.close(parent)
  print('WITHDRAWN '+relative,flush=True)
 finally:os.close(descriptor)
namespace['guard']();assert namespace['sha'](BASE/'content.private.tar.gz')==index['blobSha256'],'main_drift'
print('TWO_WITHDRAWN_MAIN_AND_ALL_GENERATIONS_PRESERVED')
