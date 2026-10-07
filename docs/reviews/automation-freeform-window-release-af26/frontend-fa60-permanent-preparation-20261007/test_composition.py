"""Final operational composition, real PM2/Node/Next, isolated Linux namespaces.
Arguments: effective checker, patched client, Node20, PM2 CLI, corrected tar
extraction, 9f extraction. API/worker timers; auth/providers absent. Local proc
permission failure and boot transition are explicitly injected. Root observer
syscalls are real; owner policy installation is simulated in a private file.
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
 g=load('effective_gate',CHECKER);g.PM=str(wrapper);g.PM_PID=home/'pm2.pid';g.PORT=3094;g.TARGET=CANDIDATE
 sys.path.insert(0,str(SCRIPTS));sys.path.insert(0,str(Path(CLIENT).parent))
 action=load('effective_action',SCRIPTS/'frontend-action.py')
 installed=base/'installed-policy.private.json'
 helper_hash=hashlib.sha256((PUB/'frontend-socket-observation-proposal/observer.py').read_bytes()).hexdigest()
 def reader(requested):
  pol=json.loads(installed.read_text());v=obs.observe(pol);v.update(policySha256=hashlib.sha256(installed.read_bytes()).hexdigest(),helperSha256=helper_hash);return v
 g.OBSERVATION_READER=reader
 def row():return next(x for x in json.loads(pm('jlist')) if x['name']==g.FRONT)
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
    original_read=Path.read_bytes
    def inventory_fault(path):
        marker=Path(__file__).parent/'unreadable-pid'
        if marker.exists() and str(path)=='/proc/'+marker.read_text().strip()+'/environ' and any(x.function=='inventory' for x in inspect.stack()):raise PermissionError('lab local environ denial')
        return original_read(path)
    Path.read_bytes=inventory_fault
'''.replace('OBS_PATH',repr(str(PUB/'frontend-socket-observation-proposal/observer.py'))).replace('INSTALLED',repr(str(installed))).replace('HASH',repr(helper_hash))
  (p/'frontend-check.py').write_text(s.replace("if __name__ == '__main__':",hook+"\nif __name__ == '__main__':",1));(p/'execution-authorized').write_text('true')
  shutil.copy2(HERE/'verify-rebinding.py',p/'verify-rebinding.py')
 def binding(p,policy):
  installed.write_text(json.dumps(policy,indent=2)+'\n');b={'policy':policy,'policySha256':hashlib.sha256(installed.read_bytes()).hexdigest(),'helperSha256':helper_hash};(p/'socket-observer-binding.private.json').write_text(json.dumps(b))
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
 def explicit_rebind(p,number):
  proposal=base/('proposal-'+str(number));v=load('proposal_generator',HERE/'rebind-policy.py').generate(p/(recovery_label+'.run.private.json'),proposal)
  # Explicit owner action simulated here; effective generator/verifier unchanged.
  shutil.copy2(proposal/'observer-policy.private.json',installed)
  o=reader(None);(proposal/'installed-observation.private.json').write_text(json.dumps(o))
  result=subprocess.run(['/usr/bin/python3',str(p/'verify-rebinding.py'),str(proposal)],text=True,capture_output=True,timeout=5)
  assert result.returncode==0,result.stderr
  assert row()['pid']==0,'policy install must not start Next'
  results.append({'case':'explicit rebinding '+str(number)+'; root installation simulated, real observer/verifier','result':'PASS','delta':v['delta']})
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
  g.main('before');assert action.execute('stop',p,str(wrapper))==0;assert action.execute('exited',p,str(wrapper))==0;assert action.execute('delete',p,str(wrapper))==0
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
  old_daemon=int(g.PM_PID.read_text());pm('kill');pm('resurrect');live,run,child=wait_live(p,recovery_label)
  assert int(g.PM_PID.read_text())!=old_daemon and run['nonce']!=ret['nonce']
  assert hashlib.sha256(dump.read_bytes()).hexdigest()==saved and Path(ret['journal']).read_bytes().startswith(window)
  results.append({'case':'real new daemon, same saved dump, legible inventory -> automatic recovery','result':'PASS'})
  aux=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=base,env=env,start_new_session=True);children.append(aux);(p/'unreadable-pid').write_text(str(aux.pid))
  os.kill(child['pid'],15);denied_state(p,'supervision_policy_rebinding_required')
  explicit_rebind(p,1);pm('restart',g.FRONT);live,run,child=wait_live(p,recovery_label)
  results.append({'case':'manual explicit rebind then supervised resume; real unreadable process with permission injected','result':'PASS'})
  # Same daemon can now recover automatically while that unrelated PID persists.
  old_parent=live['pid'];os.kill(child['pid'],15);live,run,child=wait_live(p,recovery_label);assert live['pid']!=old_parent
  results.append({'case':'same newly attested daemon -> Next failure -> automatic fresh incarnation','result':'PASS'})
  pm('stop',g.FRONT)
  # Boot transition is a ledger/policy injection; no machine reboot claimed.
  controls=[p/(recovery_label+'.run.private.json')]+list((p/(recovery_label+'.run.private.json.runs')).glob('*/control.json'))
  for path in controls:
   r=json.loads(path.read_text());r['bootId']='previous-boot-fixture';path.write_text(json.dumps(r))
  b=json.loads((p/'socket-observer-binding.private.json').read_text());b['policy']['bootId']='previous-boot-fixture';binding(p,b['policy'])
  pm('kill');pm('resurrect');denied_state(p,'supervision_policy_rebinding_required')
  explicit_rebind(p,2)
  survivor=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=recovery_release,env={**env,'RE7_FRONT_RUN':ret['nonce']},start_new_session=True);children.append(survivor)
  pm('restart',g.FRONT);denied_state(p,'supervision_current_executor_survived')
  survivor.terminate();survivor.wait();pm('restart',g.FRONT);live,run,child=wait_live(p,recovery_label)
  results.append({'case':'injected boot boundary + real new daemon + explicit rebind -> recovery, no old PID/socket replay','result':'PASS'})
  assert hashlib.sha256(dump.read_bytes()).hexdigest()==saved
  g.main('supervised-'+recovery_label)
 finally:
  for child in children:
   if child.poll() is None:child.terminate();child.wait()
  if os.environ.get('LAB_EVIDENCE_DIR'):shutil.copytree(base,os.environ['LAB_EVIDENCE_DIR'],dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
  pm('kill')
print(json.dumps({'node':'20.20.0','pm2':'6.0.14','mode':'cluster_mode','results':results,'boot':'injected ledger/policy transition; actual daemon changed','recoveryLabel':recovery_label,'permission':'local environ denial injected; real root proc/socket observations'},indent=2))
