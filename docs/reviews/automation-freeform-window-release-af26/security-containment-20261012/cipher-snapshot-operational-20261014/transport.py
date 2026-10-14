"""Node/Prisma holder + exact dump channel. Library, no installed helper/policy.
All outputs private; no retry/retention/process-service control.
"""
import datetime,fcntl,hashlib,json,os,re,selectors,signal,stat,subprocess,time
from pathlib import Path

def require(v,r):
 if not v:raise RuntimeError(r)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f);f.write('\n');f.flush();os.fsync(f.fileno())
def line(child,budget=45,limit=67108864):
 sel=selectors.DefaultSelector();sel.register(child.stdout,selectors.EVENT_READ);buf=bytearray();end=time.monotonic()+budget
 try:
  while True:
   require(time.monotonic()<end,'holder_protocol_timeout')
   if not sel.select(min(1,max(0,end-time.monotonic()))):continue
   chunk=os.read(child.stdout.fileno(),262144);require(chunk,'holder_closed_before_message');buf.extend(chunk);require(len(buf)<=limit,'holder_output_bound')
   if b'\n'in buf:
    first,rest=bytes(buf).split(b'\n',1);require(not rest,'unexpected_holder_message');return json.loads(first)
 finally:sel.close()
def capture(out,lock_path,holder_command,holder_env,dump_command,dump_env,dump_identity,timeout=120):
 out=Path(out);s=out.lstat();require(out.is_dir()and not out.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700,'output_type_owner_mode');require(not list(out.iterdir()),'output_nonempty')
 for parent in out.parents:require(not parent.is_symlink(),'output_chain_symlink')
 lock=None;holder=None;dump=None;stage='lock';start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  lock=os.open(lock_path,os.O_RDWR|os.O_NOFOLLOW);ls=os.fstat(lock);require(stat.S_ISREG(ls.st_mode)and ls.st_uid==os.getuid()and stat.S_IMODE(ls.st_mode)in(0o600,0o640)and ls.st_nlink==1,'canonical_lock_metadata_drift');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  with (out/'holder.private.stderr').open('xb')as error:
   os.chmod(error.name,0o600);stage='holder';holder=subprocess.Popen(holder_command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=error,env=holder_env,start_new_session=True)
   ready=line(holder);require(ready['protocol']=='SNAPSHOT_HOLDER_READY','holder_protocol');require(re.fullmatch(r'[0-9A-F]+-[0-9A-F]+-[0-9]+',ready['snapshot']),'snapshot_format')
   stage='identity';identity=dump_identity();require(identity==ready['identity'],'inventory_dump_channel_identity_mismatch')
   put(out/'cipher-current.private.json',ready['inventory']);put(out/'holder-ready.private.json',{k:v for k,v in ready.items()if k!='inventory'})
   stage='dump'
   with(out/'database.dump').open('xb')as destination,(out/'dump.private.stderr').open('xb')as dump_error:
    os.chmod(destination.name,0o600);os.chmod(dump_error.name,0o600)
    dump=subprocess.Popen([*dump_command,'--snapshot='+ready['snapshot']],stdout=destination,stderr=dump_error,env=dump_env,start_new_session=True)
    end=time.monotonic()+timeout
    while dump.poll()is None:
     require(holder.poll()is None,'holder_died_during_dump');require(time.monotonic()<end,'dump_timeout');time.sleep(.05)
    require(dump.returncode==0,'dump_denied');require(holder.poll()is None,'holder_died_before_release');destination.flush();os.fsync(destination.fileno())
   stage='release';holder.stdin.write(b'release\n');holder.stdin.flush();holder.stdin.close();released=line(holder,15);require(released=={'protocol':'SNAPSHOT_HOLDER_RELEASED','readOnly':True},'holder_release_mismatch');holder.wait(timeout=15);require(holder.returncode==0,'holder_release_failed')
  result={'result':'CANONICAL_LOCK_SHARED_SNAPSHOT_CAPTURE_COMPLETE','startedUtc':start,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'identityChannelsEqual':True,'inventorySha256':sha(out/'cipher-current.private.json'),'dumpSha256':sha(out/'database.dump'),'dumpBytes':(out/'database.dump').stat().st_size,'holderAliveUntilDumpComplete':True,'canonicalLock':str(lock_path),'lockMetadata':{'uid':ls.st_uid,'gid':ls.st_gid,'mode':stat.S_IMODE(ls.st_mode),'dev':ls.st_dev,'ino':ls.st_ino},'automaticRetry':False,'providerCalls':0,'readOnly':True};put(out/'capture-receipt.private.json',result);return result
 except Exception as e:
  put(out/'denial.private.json',{'result':'DENY','stage':stage,'errorClass':type(e).__name__,'reason':str(e)if isinstance(e,RuntimeError)else None,'automaticRetry':False});raise
 finally:
  for child in [dump,holder]:
   if child and child.poll()is None:
    os.killpg(child.pid,signal.SIGTERM)
    try:child.wait(timeout=3)
    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
  if holder:
   for stream in [holder.stdin,holder.stdout]:
    if stream:stream.close()
  if lock is not None:os.close(lock)
