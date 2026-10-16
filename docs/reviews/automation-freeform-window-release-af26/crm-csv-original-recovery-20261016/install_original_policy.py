"""Owner-only, explicit emergency policy adoption. Does NOT start or unfence."""
import hashlib,importlib.util,json,os,stat,sys,tempfile,fcntl,datetime,subprocess
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z')
Q=P.parent/'csv-original-recovery-20261016T111200Z'
OLD='4bc3454db8009dd6aef4db7c7e331c79278d37326c2438b9f668c6610a6b74b3'
NEW='e2a5ffab807f457b4179a6981e15cbf52800cbf975bce921c31ee3a9a989860b'
SOURCE='a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e'
HELPER=Path('/usr/local/libexec/re7/incident-6683-window-control.py')
POLICY=Path('/usr/local/libexec/re7/incident-6683-window-policy.json')
RULE=Path('/etc/sudoers.d/re7-incident-6683-window')
ROOTQ=Path('/var/lib/re7/csv-original-recovery-20261016T111200Z')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def require(v,why):
 if not v:raise RuntimeError(why)
def put(p,raw):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
def main():
 require(os.getuid()==0 and sys.argv[1:]==['--operator-install-original-return'],'explicit_owner_action_required')
 for p,h,m in [(HELPER,'8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212',0o644),(RULE,'62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a',0o440),(POLICY,OLD,0o600)]:
  s=p.lstat();require(stat.S_ISREG(s.st_mode)and s.st_uid==0 and stat.S_IMODE(s.st_mode)==m and not p.is_symlink()and sha(p)==h,'root_source_drift')
 spec=importlib.util.spec_from_file_location('canonical_privileged',HELPER);h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
 for p in (HELPER,POLICY,RULE,ROOTQ.parent):
  if p==ROOTQ.parent:
   for node in (p,*p.parents):
    s=node.lstat();require(stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not(s.st_mode&0o022)and not node.is_symlink(),'root_state_chain')
  else:h.root_regular(p)
 with Path(h.LOCK).open('a+')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  old=h.policy_from();h.PHASE=h.phase_path(OLD);phase=h.phase_read()
  require(phase and phase['stage']=='fenced'and phase['policySha256']==OLD,'original_fenced_phase_required');h.guard_closed();h.nft_present();h.boot('disabled')
  require(h.CRON.read_bytes()==old['cronWindow'],'system_cron_drift')
  actual=subprocess.check_output(['/usr/sbin/runuser','-u','deploy','--','/usr/bin/crontab','-l'],stderr=subprocess.PIPE)
  require(actual==(P/'window/deploy.crontab.window').read_bytes(),'deploy_cron_drift')
  daemon=h.process_identity(old['pm2Daemon']['pid'])
  require(daemon and daemon['ticks']==old['pm2Daemon']['ticks']and daemon['state']!='Z','pm2_daemon_drift')
  children=[]
  for proc in Path('/proc').iterdir():
   if proc.name.isdigit():
    ident=h.process_identity(int(proc.name))
    if ident and ident['ppid']==old['pm2Daemon']['pid']and ident['state']!='Z':children.append(int(proc.name))
  require(children==[old['sourceProcesses']['re7-admin-front']['pid']],'unexpected_pm2_children')
  require(not ROOTQ.exists()and not ROOTQ.is_symlink()and not h.phase_path(NEW).exists(),'recovery_policy_consumed')
  sourcefile=P/'window/source.profile.private.json';require(sha(sourcefile)==SOURCE,'source_profile_drift')
  source={a['name']:a for a in json.loads(sourcefile.read_bytes())['apps']}
  raw=(Q/'original-return-policy.private.json').read_bytes();require(hashlib.sha256(raw).hexdigest()==NEW,'new_policy_bytes_drift');new=json.loads(raw)
  expected=json.loads(POLICY.read_bytes());expected['targetProcesses']['return']={n:{'cwd':source[n]['cwd'],'script':source[n]['script'],'sha256':sha(source[n]['script'])}for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker')}
  require(new==expected,'nonrestricted_policy_delta')
  for n,e in old['sourceProcesses'].items():
   observed=h.process_identity(e['pid'])
   if n=='re7-admin-front':require(observed and observed['ticks']==e['ticks']and observed['state']!='Z','frontend_drift')
   else:require(not observed or observed['ticks']!=e['ticks']or observed['state']=='Z','old_pair_still_live')
  require(not any((P/'window'/n).exists()for n in ['event-overlay.intent.private.json','event-overlay.receipt.private.json','csv-selection.intent.private.json','csv-selection.receipt.private.json']),'selection_or_overlay_exists')
  require(not any(list((P/m).glob('start-intent-*.json'))or list((P/m).glob('started-*.json'))for m in ('switch','return','return-partial','return-before-commit')),'prior_or_uncertain_start')
  ROOTQ.mkdir(mode=0o700);put(ROOTQ/'old-policy.private.json',POLICY.read_bytes());put(ROOTQ/'old-phase.private.json',h.PHASE.read_bytes())
  put(ROOTQ/'intent.private.json',json.dumps({'sourcePolicySha256':OLD,'policySha256':NEW,'sourceProfileSha256':SOURCE,'automaticRetry':False}).encode())
  # A new phase for the new explicit policy; the historical phase remains intact.
  h.PHASE=h.phase_path(NEW);h.phase_write('fenced',NEW)
  fd,tmp=tempfile.mkstemp(prefix='.original-return-',dir=POLICY.parent)
  with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,0o600);os.replace(tmp,POLICY)
  value=h.policy_from();require(value['policySha256']==NEW,'installed_policy_drift');h.nft_present()
  receipt={'result':'ORIGINAL_RETURN_POLICY_INSTALLED_FENCED','policySha256':NEW,'sourcePolicySha256':OLD,'sourceProfileSha256':SOURCE,'processActions':0,'unfenceExecuted':False,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  put(ROOTQ/'receipt.private.json',json.dumps(receipt,sort_keys=True).encode());print(json.dumps(receipt,sort_keys=True))
if __name__=='__main__':
 os.umask(0o077)
 try:main()
 except BaseException as e:print(json.dumps({'result':'ORIGINAL_POLICY_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
