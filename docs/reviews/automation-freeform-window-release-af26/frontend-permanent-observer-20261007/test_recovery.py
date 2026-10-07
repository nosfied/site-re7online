"""Permanent recovery composition, real PM2/Node/Next, isolated Linux namespaces.
Arguments: effective checker, patched client, Node20, PM2 CLI, corrected tar
extraction, 9f extraction. API/worker timers; auth/providers absent. Local proc
permission failure and boot transition are explicitly injected. Root observer
syscalls are real; immutable root policy deployment is represented by a private
fixture. No rebinding occurs on recovery. Namespace init reaps real orphans.
"""
import hashlib,importlib.util,json,os,shutil,subprocess,sys,tempfile,time,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent;PUB=HERE.parent;SCRIPTS=PUB/'frontend-fa60f0f6-prepared'
CHECKER,CLIENT,NODE,CLI,CANDIDATE,RETURN=[str(Path(x).resolve()) for x in sys.argv[1:7]]
assert subprocess.check_output([NODE,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(CLI).parents[1]/'package.json').read_text())['version']=='6.0.14'
recovery_label=os.environ.get('RECOVERY_LABEL','return');assert recovery_label in ['candidate','return']
results=[]
with tempfile.TemporaryDirectory(prefix='re7-final-front-composition-') as tmp:
 base=Path(tmp);home=base/'pm2';os.environ['PM2_HOME']=str(home);env={'HOME':str(base),'PM2_HOME':str(home),'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}
 def pm(*args):
  v=subprocess.run([NODE,CLI,*args],env=env,text=True,capture_output=True,timeout=20)
  with (base/'pm2.private.jsonl').open('a') as f:f.write(json.dumps({'args':args,'exit':v.returncode,'stdout':v.stdout,'stderr':v.stderr})+'\n')
  assert v.returncode==0,v.stderr;return v.stdout
 wrapper=base/'pm';wrapper.write_text('#!/bin/sh\nexec '+NODE+' '+CLI+' "$@"\n');wrapper.chmod(0o700)
 def load(name,path):
  spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 obs=load('real_observer',PUB/'frontend-socket-observation-proposal/observer.py')
 permanent=load('real_permanent_observer',HERE/'permanent-observer.py')
 g=load('effective_gate',CHECKER);g.PM=str(wrapper);g.PM_PID=home/'pm2.pid';g.PORT=3094;g.TARGET=CANDIDATE
 sys.path.insert(0,str(SCRIPTS));sys.path.insert(0,str(Path(CLIENT).parent))
 action=load('effective_action',SCRIPTS/'frontend-action.py')
 installed=base/'installed-policy.private.json'
 helper_hash=hashlib.sha256((PUB/'frontend-socket-observation-proposal/observer.py').read_bytes()).hexdigest()
 def reader(requested):
  pol=json.loads(installed.read_text());v=obs.observe(pol);v.update(policySha256=hashlib.sha256(installed.read_bytes()).hexdigest(),helperSha256=helper_hash);return v
 g.OBSERVATION_READER=reader
 def row():return next(x for x in json.loads(pm('jlist')) if x['name']==g.FRONT)
 def fresh_exit(stage):
  end=time.monotonic()+3
  while True:
   if action.execute(stage,p,str(wrapper))==0:return
   if time.monotonic()>=end:raise AssertionError('bounded fresh exit denied')
   time.sleep(.05) # schedule another actual gate read; never a certificate

 def baseline(p):
  v=[]
  for x in json.loads(pm('jlist')):
   e=x['pm2_env'];v.append({'name':x['name'],'pid':x['pid'],'startTicks':g.proc(x['pid'])['ticks'],**{k:e.get(k) for k in ['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']}})
  (p/'runtime.private.json').write_text(json.dumps({'processes':v}));pid=int(g.PM_PID.read_text());(p/'daemon.private.json').write_text(json.dumps({'pid':pid,'ticks':g.proc(pid)['ticks']}))
 def config(release):return {'name':g.FRONT,'instances':1,'cwd':release,'script':str(Path(release,'node_modules/next/dist/bin/next')),'interpreter':NODE,'args':['start','-H','127.0.0.1','-p','3094'],'watch':False,'autorestart':True,'env':{'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}}
 def scripts(p):
  p.mkdir()
  for name in ['launcher.cjs','bootstrap.cjs','socket_observation_contract.py']:shutil.copy2(SCRIPTS/name,p/name)
  shutil.copy2(CLIENT,p/'socket_observation_client.py')
  shutil.copy2(HERE/'permanent_observation_client.py',p/'permanent_observation_client.py')
  s=Path(CHECKER).read_text().replace("PM = '/home/deploy/.npm-global/bin/pm2'",'PM = '+repr(str(wrapper))).replace("PM_PID = Path('/home/deploy/.pm2/pm2.pid')",'PM_PID = Path('+repr(str(home/'pm2.pid'))+')').replace('PORT = 3000','PORT = 3094')
  s=s.replace("P = Path('/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z')",'P = Path('+repr(str(p))+')').replace("TARGET = '/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front'",'TARGET = '+repr(CANDIDATE))
  hook='''
if __name__ == '__main__':
    import importlib.util,inspect
    spec=importlib.util.spec_from_file_location('lab_root_observer',OBS_PATH)
    root_obs=importlib.util.module_from_spec(spec);spec.loader.exec_module(root_obs)
    def lab_reader(requested):
        pol=json.loads(Path(INSTALLED).read_text());v=root_obs.observe(pol)
        v.update(policySha256=hashlib.sha256(Path(INSTALLED).read_bytes()).hexdigest(),helperSha256=HASH)
        return v
    OBSERVATION_READER=lab_reader
    spec2=importlib.util.spec_from_file_location('lab_permanent',PERM_PATH)
    perm=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(perm)
    def permanent_reader(binding):
        if (Path(__file__).parent/'deny-permanent-reader').exists():raise RuntimeError('permanent_observation_permission_denied')
        v=perm.observe(binding['policy'],root_obs,empty=EMPTY_PATH)
        v.update(policySha256=binding['policySha256'],helperSha256=binding['helperSha256'])
        return v
    PERMANENT_READER=permanent_reader
    original_read=Path.read_bytes
    def inventory_fault(path):
        marker=Path(__file__).parent/'unreadable-pid'
        if marker.exists() and str(path)=='/proc/'+marker.read_text().strip()+'/environ' and any(x.function=='inventory' for x in inspect.stack()):raise PermissionError('lab local environ denial')
        return original_read(path)
    Path.read_bytes=inventory_fault
'''.replace('OBS_PATH',repr(str(PUB/'frontend-socket-observation-proposal/observer.py'))).replace('INSTALLED',repr(str(installed))).replace('HASH',repr(helper_hash)).replace('PERM_PATH',repr(str(HERE/'permanent-observer.py'))).replace('EMPTY_PATH',repr(str(base/'no-capture-ever')))
  (p/'frontend-check.py').write_text(s.replace("if __name__ == '__main__':",hook+"\nif __name__ == '__main__':",1));(p/'execution-authorized').write_text('true')
  # Permanent reader/client effective code, no policy rewrite.
 def binding(p,policy):
  installed.write_text(json.dumps(policy,indent=2)+'\n');b={'policy':policy,'policySha256':hashlib.sha256(installed.read_bytes()).hexdigest(),'helperSha256':helper_hash};(p/'socket-observer-binding.private.json').write_text(json.dumps(b))
  if not (p/'permanent-observer-binding.private.json').exists():
   pp={'version':1,'readerSha256':helper_hash,'frontendPort':3094,'pm2':{'pidfile':str(home/'pm2.pid'),'uid':os.getuid(),'exe':os.readlink('/proc/'+str(policy['daemon']['pid'])+'/exe'),'exeSha256':hashlib.sha256(Path('/proc',str(policy['daemon']['pid']),'exe').read_bytes()).hexdigest(),'cmdline':Path('/proc',str(policy['daemon']['pid']),'cmdline').read_bytes().rstrip(b'\0').decode()},'roles':{label:{'release':role['release'],'entry':role['entry'],'entrySha256':hashlib.sha256(Path(role['entry']).read_bytes()).hexdigest(),'buildId':Path(role['release'],'.next/BUILD_ID').read_text().strip()} for label,role in policy['roles'].items()}}
   (p/'permanent-observer-binding.private.json').write_text(json.dumps({'policy':pp,'policySha256':hashlib.sha256((json.dumps(pp)+'\n').encode()).hexdigest(),'helperSha256':hashlib.sha256((HERE/'permanent-observer.py').read_bytes()).hexdigest()}))
 def wait_live(p,label):
  end=time.monotonic()+25
  while time.monotonic()<end:
   try:
    with urllib.request.urlopen('http://127.0.0.1:3094/app/login',timeout=1) as r:assert r.status==200
    actual=row();run,child=g.supervision_live(p/(label+'.run.private.json'),actual);return actual,run,child
   except (RuntimeError,OSError,StopIteration):time.sleep(.1)
  raise AssertionError('bounded recovery/readiness failed')
 def denied_state(p,reason):
  time.sleep(3);assert row()['pid']==0
  text=(p/(recovery_label+'.run.private.json.observations.private.jsonl')).read_text();assert reason in text,text
  results.append({'case':reason,'result':'DENY','nextFork':False})
 children=[]
 try:
  pm('ping');core=base/'core';core.mkdir();(core/'timer.cjs').write_text('setInterval(()=>{},1000)')
  for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
   f=base/(name+'.cjs');f.write_text('module.exports = '+json.dumps({'apps':[{'name':name,'cwd':str(core),'script':str(core/'timer.cjs'),'interpreter':NODE,'watch':False}]}));pm('start',str(f))
  source=base/'source';scripts(source);g.P=source
  (source/'return.ecosystem.config.cjs').write_text('module.exports = '+json.dumps({'apps':[config(RETURN)]})+';\n');(source/'runtime.private.json').write_text(json.dumps({'processes':[{'name':g.FRONT,'pm_cwd':RETURN}]}))
  g.init_run('return');pm('start',str(source/'return.tracked.config.cjs'));baseline(source);g.ready('return');g.enable_supervision('return');src=json.loads((source/'return.run.private.json').read_text())
  p=base/'window';scripts(p);g.P=p;baseline(p)
  for label,release in [('candidate',CANDIDATE),('return',RETURN)]:
   (p/(label+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps({'apps':[config(release)]})+';\n');g.init_run(label)
  candidate=json.loads((p/'candidate.run.private.json').read_text());ret=json.loads((p/'return.run.private.json').read_text());pid=int(g.PM_PID.read_text())
  roles={k:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(p/(k+'-tree.private.json'))} for k,r in [('source',src),('candidate',candidate),('return',ret)]}
  policy={'version':1,'bootId':g.BOOT_ID.read_text().strip(),'daemon':{'pid':pid,'ticks':g.proc(pid)['ticks']},'roles':roles,'frontendPort':3094};binding(p,policy)
  g.main('before');assert action.execute('stop',p,str(wrapper))==0;fresh_exit('exited');assert action.execute('delete',p,str(wrapper))==0
  assert action.execute('start-candidate',p,str(wrapper))==0;assert action.execute('ready-candidate',p,str(wrapper))==0;assert action.execute('candidate',p,str(wrapper))==0
  try:action.execute('start-candidate',p,str(wrapper));raise AssertionError('window start replay')
  except FileExistsError:results.append({'case':'window second candidate start','result':'DENY'})
  if recovery_label=='candidate':
   g.enable_supervision('candidate');ret=candidate;recovery_release=CANDIDATE
   results.append({'case':'real source9f -> corrected candidate, fresh exit observation, single start; promotion simulated owner acceptance','result':'PASS'})
  else:
   bad=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=CANDIDATE,env={**env,'RE7_FRONT_RUN':candidate['nonce']},start_new_session=True);children.append(bad)
   assert action.execute('stop',p,str(wrapper))==0;assert action.execute('candidate-exited',p,str(wrapper))==1
   results.append({'case':'real candidate executor survivor blocks return','result':'DENY'})
   bad.terminate();bad.wait();assert action.execute('candidate-exited',p,str(wrapper))==0;assert action.execute('delete',p,str(wrapper))==0
   assert action.execute('start-return',p,str(wrapper))==0;assert action.execute('ready-return',p,str(wrapper))==0;g.enable_supervision('return')
   results.append({'case':'real cluster source9f -> corrected candidate -> return9f, fresh exit observations, single start each','result':'PASS'})
   recovery_release=RETURN
  pm('save');dump=home/'dump.pm2';saved=hashlib.sha256(dump.read_bytes()).hexdigest();window=Path(ret['journal']).read_bytes()
  # Effective permanent helper negatives against the real live daemon.
  static=json.loads((p/'permanent-observer-binding.private.json').read_text())['policy']
  for field,bad,reason in [('uid',999999,'daemon_uid_or_state'),('cmdline','wrong daemon','daemon_cmdline'),('exeSha256','0'*64,'daemon_executable')]:
   invalid=json.loads(json.dumps(static));invalid['pm2'][field]=bad
   try:permanent.observe(invalid,obs,empty=str(base/'no-capture-ever'));raise AssertionError('invalid daemon admitted')
   except RuntimeError as e:assert str(e)==reason,str(e)
   results.append({'case':reason,'result':'DENY','evidence':'effective helper, real daemon; invalid policy fixture'})
  old_daemon=int(g.PM_PID.read_text());pm('kill');pm('resurrect');live,run,child=wait_live(p,recovery_label)
  assert int(g.PM_PID.read_text())!=old_daemon and run['nonce']!=ret['nonce']
  assert hashlib.sha256(dump.read_bytes()).hexdigest()==saved and Path(ret['journal']).read_bytes().startswith(window)
  results.append({'case':'real new daemon, same saved dump, legible inventory -> automatic recovery','result':'PASS'})
  stable_binding=hashlib.sha256((p/'permanent-observer-binding.private.json').read_bytes()).hexdigest()
  aux=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=base,env=env,start_new_session=True);children.append(aux);(p/'unreadable-pid').write_text(str(aux.pid))
  old_parent=live['pid'];os.kill(child['pid'],15);live,run,child=wait_live(p,recovery_label);assert live['pid']!=old_parent
  results.append({'case':'new daemon + unreadable local process -> automatic fresh recovery; no policy rewrite','result':'PASS'})
  pm('stop',g.FRONT)
  controls=[p/(recovery_label+'.run.private.json')]+list((p/(recovery_label+'.run.private.json.runs')).glob('*/control.json'))
  for path in controls:
   r=json.loads(path.read_text());r['bootId']='previous-boot-fixture';path.write_text(json.dumps(r))
  b=json.loads((p/'socket-observer-binding.private.json').read_text());b['policy']['bootId']='previous-boot-fixture';binding(p,b['policy'])
  old_daemon=int(g.PM_PID.read_text());pm('kill');pm('resurrect');live,run,child=wait_live(p,recovery_label)
  assert int(g.PM_PID.read_text())!=old_daemon
  results.append({'case':'injected boot boundary + real new daemon -> automatic recovery with static permanent policy; old PIDs/sockets not used','result':'PASS'})
  survivor=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=recovery_release,env={**env,'RE7_FRONT_RUN':ret['nonce']},start_new_session=True);children.append(survivor)
  os.kill(child['pid'],15);denied_state(p,'supervision_current_executor_survived')
  survivor.terminate();survivor.wait();pm('restart',g.FRONT);live,run,child=wait_live(p,recovery_label)
  results.append({'case':'real survivor blocks recovery; remove lab survivor, normal supervisor recovery','result':'PASS'})
  (p/'deny-permanent-reader').write_text('injected unavailable privilege')
  os.kill(child['pid'],15);denied_state(p,'permanent_observation_permission_denied')
  (p/'deny-permanent-reader').unlink();pm('restart',g.FRONT);live,run,child=wait_live(p,recovery_label)
  static=json.loads((p/'permanent-observer-binding.private.json').read_text())['policy']
  dup=subprocess.Popen([NODE,'-e','process.title='+json.dumps(static['pm2']['cmdline'])+';setInterval(()=>{},1000)'+(' '*256)],cwd=base,env=env,start_new_session=True);children.append(dup)
  deadline=time.monotonic()+3
  while Path('/proc',str(dup.pid),'cmdline').read_bytes().rstrip(b'\0')!=static['pm2']['cmdline'].encode():
   assert time.monotonic()<deadline;time.sleep(.01)
  try:permanent.observe(static,obs,empty=str(base/'no-capture-ever'));raise AssertionError('duplicate admitted')
  except RuntimeError as e:assert str(e)=='duplicate_pm2_daemon',str(e)
  results.append({'case':'duplicate PM2-home daemon title','result':'DENY','evidence':'real Node process with deliberately set title; not a second real PM2 daemon'})
  dup.terminate();dup.wait()
  assert hashlib.sha256((p/'permanent-observer-binding.private.json').read_bytes()).hexdigest()==stable_binding
  assert hashlib.sha256(dump.read_bytes()).hexdigest()==saved
  g.main('supervised-'+recovery_label)
 finally:
  for child in children:
   if child.poll() is None:child.terminate();child.wait()
  if os.environ.get('LAB_EVIDENCE_DIR'):shutil.copytree(base,os.environ['LAB_EVIDENCE_DIR'],dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
  pm('kill')
print(json.dumps({'node':'20.20.0','pm2':'6.0.14','mode':'cluster_mode','results':results,'boot':'injected ledger/policy transition; actual daemon changed','recoveryLabel':recovery_label,'permission':'local environ denial injected; real root proc/socket observations'},indent=2))
