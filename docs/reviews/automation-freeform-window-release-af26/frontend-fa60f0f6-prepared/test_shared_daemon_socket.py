"""PM2 real isolated; capture injection and simulated daemon binding labeled explicitly. Run in private PID/proc namespace."""
import importlib.util,json,os,subprocess,tempfile,time
from pathlib import Path
here=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('gate',here/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
import sys
node=str(Path(sys.argv[1]).resolve());cli=str(Path(sys.argv[2]).resolve())
assert subprocess.check_output([node,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(cli).parents[1]/'package.json').read_text())['version']=='6.0.14'
with tempfile.TemporaryDirectory(prefix='re7-shared-pm2-') as tmp:
 p=Path(tmp);home=p/'home';env={**os.environ,'PM2_HOME':str(home),'PATH':str(Path(node).parent)+':/usr/bin:/bin'};os.environ['PM2_HOME']=str(home)
 def pm(*a):return subprocess.check_output([node,cli,*a],env=env,text=True,stderr=subprocess.PIPE)
 wrapper=p/'pm';wrapper.write_text('#!/bin/sh\nexec '+node+' '+cli+' "$@"\n');wrapper.chmod(0o700)
 g.P=p;g.PM=str(wrapper);g.PM_PID=home/'pm2.pid'
 try:
  pm('ping');pid=int(g.PM_PID.read_text());d=g.proc(pid);(p/'daemon.private.json').write_text(json.dumps(d))
  inode=os.readlink(f'/proc/{pid}/fd/0');assert inode.startswith('socket:['),inode
  inode=inode[8:-1]
  assert not g.remaining_source_sockets([inode]);print('REAL_PM2_CONNECTED_UNIX_STDIN_PASS')
  (p/'daemon.private.json').write_text(json.dumps({**d,'ticks':str(int(d['ticks'])+1)}))
  try:g.remaining_source_sockets([inode]);raise AssertionError('accepted drift')
  except RuntimeError as e:assert str(e)=='daemon_ticks';print('DAEMON_TICKS_DRIFT_DENIED')
  (p/'daemon.private.json').write_text(json.dumps(d))
  app=p/'app.cjs';app.write_text('setInterval(()=>{},1000)')
  pm('start',str(app),'--name','re7-admin-front','--interpreter',node)
  rows=g.rows();r=next(r for r in rows if r['name']==g.FRONT);e=r['pm2_env'];v={'processes':[{**{k:e.get(k) for k in ['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']},'name':r['name'],'pid':r['pid'],'startTicks':g.proc(r['pid'])['ticks']}]};(p/'runtime.private.json').write_text(json.dumps(v))
  g.main('before');c=json.loads((p/'source-tree.private.json').read_text());print('REAL_CAPTURE_HAS_SHARED_STDIN',inode in c['sockets'])
  try:g.main('exited');raise AssertionError('live process accepted')
  except RuntimeError as ex:assert str(ex)=='survivor_or_pid_reused';print('REAL_LIVE_EXECUTOR_DENIED')
  pm('stop','re7-admin-front');g.main('exited');print('REAL_PM2_STOP_TO_EXITED_PASS')
  # Injection is explicit: the local daemon's stdin was not inherited by this app.
  c['sockets'].append(inode);(p/'source-tree.private.json').write_text(json.dumps(c))
  g.main('exited');print('CAPTURE_FIELD_INJECTION_SHARED_STDIN_EXITED_PASS')
  # Root certificate record checks with directory-chain metadata explicitly injected.
  # File/proc/daemon/socket reads remain real inside the private UID/PID namespace.
  import hashlib,time
  class CertificatePath(type(p)):
   @property
   def parents(self):return ()
  certificate=CertificatePath(str(p/'root-certificate.fixture.json'));g.SOURCE_ROOT_OBSERVATION=certificate
  record={'at':time.time(),'bootId':g.BOOT_ID.read_text().strip(),'sourceSha256':hashlib.sha256((p/'source-tree.private.json').read_bytes()).hexdigest(),'daemon':{'pid':d['pid'],'ticks':d['ticks']},'observations':[{inode:[[d['pid'],d['ticks'],'0',False]]}]*2}
  certificate.write_text(json.dumps(record));certificate.chmod(0o644)
  assert not g.root_source_socket_observation(c['sockets'],{inode},d);print('ROOT_RECORD_REAL_READ_PASS_PARENT_METADATA_INJECTED')
  for label,updates,reason in [('expired',{'at':time.time()-121},'root_socket_observation_expired'),('future',{'at':time.time()+60},'root_socket_observation_expired'),('foreign-owner',{'observations':[{inode:[[d['pid']+1,d['ticks'],'0',False]]}]*2},'root_socket_observation_owners'),('capture',{'sourceSha256':'0'*64},'root_socket_observation_capture')]:
   certificate.write_text(json.dumps({**record,**updates}))
   try:g.root_source_socket_observation(c['sockets'],{inode},d);raise AssertionError(label+' accepted')
   except RuntimeError as ex:assert str(ex)==reason;print('ROOT_RECORD_'+label+'_DENIED_PARENT_METADATA_INJECTED')
  certificate.unlink();g.SOURCE_ROOT_OBSERVATION=Path('/run/re7-frontend-source-exit-20261007T173647Z.json')
  import socket
  a,b=socket.socketpair();foreign=os.readlink(f'/proc/{os.getpid()}/fd/{a.fileno()}')[8:-1]
  try:g.remaining_source_sockets([foreign]);raise AssertionError('own socket accepted')
  except RuntimeError as ex:assert str(ex)=='frontend_socket_survived';print('REAL_OTHER_UNIX_SOCKET_DENIED')
  saved0=os.dup(0);os.dup2(a.fileno(),0);a.close()
  fake=p/'fixture.pid';fake.write_text(str(os.getpid()));g.PM_PID=fake
  (p/'daemon.private.json').write_text(json.dumps(g.proc(os.getpid())))
  child=subprocess.Popen([node,'-e','setInterval(()=>{},1000)'],stdin=0,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:
   try:g.remaining_source_sockets([foreign]);raise AssertionError('extra owner accepted')
   except RuntimeError as ex:assert str(ex)=='frontend_socket_owner_ambiguous';print('REAL_ADDITIONAL_OWNER_DENIED_SIMULATED_DAEMON_BINDING')
  finally:child.terminate();child.wait();os.dup2(saved0,0);os.close(saved0);b.close()
  g.PM_PID=home/'pm2.pid'

 finally:
  pm('kill')
