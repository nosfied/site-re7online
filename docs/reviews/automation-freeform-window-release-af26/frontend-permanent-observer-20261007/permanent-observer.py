"""PROPOSED fixed root read-only observer. No arguments, writes or PM2 commands.
Static root policy binds artifacts and PM2 implementation, not a boot's PIDs.
Window observer/delegation are untouched. Laboratory calls observe directly.
"""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
POLICY=Path('/usr/local/libexec/re7/frontend-permanent-observer-policy.json')
READER=Path('/usr/local/libexec/re7/frontend-socket-observer.py')
EMPTY='/usr/local/libexec/re7/frontend-permanent-no-capture.json'
def require(v,why):
 if not v:raise RuntimeError(why)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def safe(p):
 p=Path(p)
 for n in (p,*p.parents):
  s=n.lstat();require(s.st_uid==0 and not s.st_mode&0o022 and not n.is_symlink(),'root_path_denied')
 require(p.is_file(),'root_file_required')
def daemon(v,reader):
 p=Path(v['pidfile']);require(p.is_file() and not p.is_symlink(),'daemon_pidfile')
 text=p.read_text().strip();require(text.isdecimal() and int(text)>0,'daemon_pidfile_schema')
 q=reader.identity(int(text));root=Path('/proc',text)
 require(q['state'] not in ['Z','X','x'] and root.stat().st_uid==v['uid'],'daemon_uid_or_state')
 require(os.readlink(root/'exe')==v['exe'] and digest(root/'exe')==v['exeSha256'],'daemon_executable')
 require((root/'cmdline').read_bytes().rstrip(b'\0')==v['cmdline'].encode(),'daemon_cmdline')
 # A second daemon for this exact PM2 home is another operational initiator.
 # Reject it by a negative observation; never authorize by title alone.
 for candidate in Path('/proc').iterdir():
  if not candidate.name.isdecimal():continue
  try:cmd=(candidate/'cmdline').read_bytes().rstrip(b'\0')
  except (FileNotFoundError,ProcessLookupError):raise RuntimeError('permanent_process_observation_incomplete')
  require(cmd!=v['cmdline'].encode() or candidate.name==text,'duplicate_pm2_daemon')
 require(p.read_text().strip()==text and reader.identity(q['pid'])['ticks']==q['ticks'],'daemon_identity_churn')
 return {'pid':q['pid'],'ticks':q['ticks']}
def observe(v,reader,empty=EMPTY):
 require(set(v)=={'version','readerSha256','pm2','frontendPort','roles'},'permanent_policy_schema')
 require(v['version']==1 and set(v['pm2'])=={'pidfile','uid','exe','exeSha256','cmdline'},'permanent_pm2_schema')
 require(type(v['pm2']['uid']) is int and v['pm2']['uid']>=0 and type(v['frontendPort']) is int,'permanent_types')
 require(set(v['roles'])=={'source','candidate','return'},'permanent_roles')
 require(not Path(empty).exists() and not Path(empty).is_symlink(),'permanent_capture_forbidden')
 roles={}
 for label,r in v['roles'].items():
  require(set(r)=={'release','entry','entrySha256','buildId'},'permanent_role_schema')
  require(Path(r['release']).is_absolute() and Path(r['entry']).is_relative_to(r['release']),'permanent_artifact_scope')
  require(digest(r['entry'])==r['entrySha256'] and Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'],'permanent_artifact_integrity')
  roles[label]={'release':r['release'],'entry':r['entry'],'nonce':'0'*64,'capture':empty}
 d=daemon(v['pm2'],reader);boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
 effective={'version':1,'bootId':boot,'daemon':d,'roles':roles,'frontendPort':v['frontendPort']}
 result=reader.observe(effective)
 require(daemon(v['pm2'],reader)==d and Path('/proc/sys/kernel/random/boot_id').read_text().strip()==boot,'permanent_identity_churn')
 require(not Path(empty).exists() and not Path(empty).is_symlink(),'permanent_capture_forbidden')
 # No historical capture/PID/socket contributes to this observation.
 result['effectivePolicy']=effective
 return result
def main():
 require(len(sys.argv)==1 and os.geteuid()==0,'fixed_root_invocation_required')
 for p in [Path(__file__),POLICY,READER]:safe(p)
 raw=POLICY.read_bytes();require(len(raw)<=1048576,'policy_size');v=json.loads(raw)
 require(digest(READER)==v['readerSha256'],'reader_integrity')
 require(v['pm2']['pidfile']=='/home/deploy/.pm2/pm2.pid' and v['pm2']['uid']==1000 and v['pm2']['exe']=='/usr/bin/node' and v['pm2']['cmdline']=='PM2 v6.0.14: God Daemon (/home/deploy/.pm2)' and v['frontendPort']==3000,'installed_scope')
 require(all(r['release'].startswith('/opt/re7online/releases/') for r in v['roles'].values()),'installed_release_scope')
 spec=importlib.util.spec_from_file_location('fixed_root_reader',READER);reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
 result=observe(v,reader);result.update(policySha256=hashlib.sha256(raw).hexdigest(),helperSha256=digest(__file__))
 print(json.dumps(result,sort_keys=True))
if __name__=='__main__':
 try:main()
 except Exception as e:print('frontend_permanent_observation_denied:'+str(e),file=sys.stderr);raise SystemExit(1)
