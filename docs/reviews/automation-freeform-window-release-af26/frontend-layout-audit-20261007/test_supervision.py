"""Real Node20/PM2 cluster launcher -> bootstrap -> Next, with injected local
/proc/environ denial for one REAL unrelated process. Root observer is effective
code reading real /proc in the namespace; sudo installation is not exercised.
Arguments: effective checker, Node20, PM2 CLI, exact 9f extraction.
No backend/provider/production. Run in UID/PID/network namespace.
"""
import hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent;PUBLIC=HERE.parent
CHECKER,NODE,CLI,RELEASE=map(lambda x:str(Path(x).resolve()),sys.argv[1:5])
assert subprocess.check_output([NODE,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(CLI).parents[1]/'package.json').read_text())['version']=='6.0.14'
results=[]
with tempfile.TemporaryDirectory(prefix='re7-supervision-observation-') as tmp:
 p=Path(tmp);home=p/'pm2';env={'HOME':str(p),'PM2_HOME':str(home),'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}
 os.environ['PM2_HOME']=str(home)
 def pm(*args):
  v=subprocess.run([NODE,CLI,*args],env=env,text=True,capture_output=True,timeout=20)
  with (p/'pm2.private.log').open('a') as f:f.write(json.dumps({'args':args,'exit':v.returncode,'stdout':v.stdout,'stderr':v.stderr})+'\n')
  assert v.returncode==0,v.stderr
  return v.stdout
 wrapper=p/'pm';wrapper.write_text('#!/bin/sh\nexec '+NODE+' '+CLI+' "$@"\n');wrapper.chmod(0o700)
 s=Path(CHECKER).read_text().replace("PM = '/home/deploy/.npm-global/bin/pm2'",'PM = '+repr(str(wrapper))).replace("PM_PID = Path('/home/deploy/.pm2/pm2.pid')",'PM_PID = Path('+repr(str(home/'pm2.pid'))+')').replace('PORT = 3000','PORT = 3091')
 for name in ['launcher.cjs','bootstrap.cjs']:
  shutil.copy2(PUBLIC/'frontend-fa60f0f6-prepared'/name,p/name)
 shutil.copy2(PUBLIC/'frontend-fa60f0f6-prepared/socket_observation_client.py',p/'socket_observation_client.py')
 # Only laboratory injection: deny inventory reads for the real auxiliary PID;
 # root reader retains actual OS reads and classifiers. No shipped env switches.
 hook='''
if __name__ == '__main__':
    import importlib.util, inspect
    spec=importlib.util.spec_from_file_location('real_observer',OBS_PATH)
    root_observer=importlib.util.module_from_spec(spec);spec.loader.exec_module(root_observer)
    def laboratory_reader(policy):
        if (Path(__file__).parent/'deny-root').exists():raise RuntimeError('laboratory_privilege_unavailable')
        value=root_observer.observe(policy)
        binding=json.loads((Path(__file__).parent/'socket-observer-binding.private.json').read_text())
        value.update(policySha256=binding['policySha256'],helperSha256=binding['helperSha256'])
        return value
    OBSERVATION_READER=laboratory_reader
    real_read_bytes=Path.read_bytes
    def injected_inventory_permission(path):
        marker=Path(__file__).parent/'unreadable-pid'
        if marker.exists() and str(path)=='/proc/'+marker.read_text().strip()+'/environ' and any(frame.function=='inventory' for frame in inspect.stack()):
            raise PermissionError('laboratory local-reader denial')
        return real_read_bytes(path)
    Path.read_bytes=injected_inventory_permission
'''.replace('OBS_PATH',repr(str(PUBLIC/'frontend-socket-observation-proposal/observer.py')))
 (p/'frontend-check.py').write_text(s.replace("if __name__ == '__main__':",hook+"\nif __name__ == '__main__':",1))
 spec=importlib.util.spec_from_file_location('gate',p/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);g.P=p
 config={'name':g.FRONT,'instances':1,'cwd':RELEASE,'script':str(Path(RELEASE,'node_modules/next/dist/bin/next')),'interpreter':NODE,'args':['start','-H','127.0.0.1','-p','3091'],'watch':False,'autorestart':True,'env':{'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}}
 (p/'return.ecosystem.config.cjs').write_text('module.exports = '+json.dumps({'apps':[config]})+';\n')
 (p/'runtime.private.json').write_text(json.dumps({'processes':[{'name':g.FRONT,'pm_cwd':RELEASE}]}))
 auxiliary=None
 try:
  pm('ping');g.init_run('return');pm('start',str(p/'return.tracked.config.cjs'))
  daemon=int((home/'pm2.pid').read_text());(p/'daemon.private.json').write_text(json.dumps({'pid':daemon,'ticks':g.proc(daemon)['ticks']}))
  g.ready('return');g.enable_supervision('return')
  row=json.loads(pm('jlist'))[0];assert row['pm2_env']['exec_mode']=='cluster_mode'
  r=json.loads((p/'return.run.private.json').read_text());daemon=int((home/'pm2.pid').read_text())
  roles={k:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(p/(k+'-tree.private.json'))} for k in ['source','candidate','return']}
  policy={'version':1,'bootId':g.BOOT_ID.read_text().strip(),'daemon':{'pid':daemon,'ticks':g.proc(daemon)['ticks']},'frontendPort':3091,'roles':roles}
  binding={'policy':policy,'policySha256':hashlib.sha256(json.dumps(policy).encode()).hexdigest(),'helperSha256':hashlib.sha256((PUBLIC/'frontend-socket-observation-proposal/observer.py').read_bytes()).hexdigest()};(p/'socket-observer-binding.private.json').write_text(json.dumps(binding))
  def current():return json.loads(pm('jlist'))[0]
  def child():
   _,c=g.supervision_live(p/'return.run.private.json',current());return c
  def recover(label):
   prior=current()['pid'];os.kill(child()['pid'],15)
   end=time.monotonic()+22
   while time.monotonic()<end:
    try:
     with urllib.request.urlopen('http://127.0.0.1:3091/app/login',timeout=1) as response:assert response.status==200
     row=current()
     if row['pid'] and row['pid']!=prior:
      run,c=g.supervision_live(p/'return.run.private.json',row)
      with urllib.request.urlopen('http://127.0.0.1:3091/app/login',timeout=1) as response:assert response.status==200
      assert run['nonce']!=r['nonce'];results.append({'case':label,'result':'PASS'});return
    except (RuntimeError,OSError,StopIteration):pass
    time.sleep(.1)
   raise AssertionError('no recovery:'+label)
  auxiliary=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=RELEASE if os.environ.get('LAB_EXECUTOR') else p,env=env,start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  (p/'unreadable-pid').write_text(str(auxiliary.pid))
  if os.environ.get('LAB_EXPECT_DENY'):
   if os.environ.get('LAB_NO_PRIVILEGE'):(p/'deny-root').touch()
   os.kill(child()['pid'],15);time.sleep(3)
   logs=(p/'return.run.private.json.observations.private.jsonl').read_text()
   assert os.environ['LAB_EXPECT_DENY'] in logs,logs
   assert current()['pid']==0
   assert not list((p/'return.run.private.json.runs').glob('*/control.json'))
   results.append({'case':'recovery denied before Next fork: '+os.environ['LAB_EXPECT_DENY'],'result':'DENY'})
  else:
   recover('real PM2/Next death; new unreadable auxiliary is classified by fresh real root observation (permission denial injected)')
  if not os.environ.get('LAB_EXPECT_DENY'):
   assert list((p/'socket-observation-output-private').glob('supervision-recovery-*.json'))
   # Captured policy cannot authorize a different daemon; mutate lab binding only.
   binding['policy']['daemon']['ticks']=str(int(policy['daemon']['ticks'])+1);(p/'socket-observer-binding.private.json').write_text(json.dumps(binding))
   old=current()['pid'];os.kill(child()['pid'],15);time.sleep(3)
   logs=(p/'return.run.private.json.observations.private.jsonl').read_text();assert 'socket_observer_read_denied' in logs
   row=current();assert row['pid']==0 and row['pm2_env']['status']=='stopped'
   results.append({'case':'real PM2 recovery denies changed daemon in root policy before Next fork','result':'DENY'})
   # Each attempted recovery has no new application journal when preflight denies.
   controls=list((p/'return.run.private.json.runs').glob('*/control.json'));assert len(controls)==1
   results.append({'case':'denied recovery does not create second application/control; historical journal intact','result':'PASS'})
 finally:
  if auxiliary:auxiliary.terminate();auxiliary.wait()
  if os.environ.get('LAB_EVIDENCE_DIR'):shutil.copytree(p,os.environ['LAB_EVIDENCE_DIR'],dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
  pm('kill')
print(json.dumps({'node':'20.20.0','pm2':'6.0.14','mode':'cluster_mode','results':results},indent=2))
