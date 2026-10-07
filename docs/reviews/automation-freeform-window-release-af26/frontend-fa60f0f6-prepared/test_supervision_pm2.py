"""Real PM2 save/kill/resurrect and Node/Next crash; no production/services/providers."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('gate',HERE/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
aspec=importlib.util.spec_from_file_location('act',HERE/'frontend-action.py');a=importlib.util.module_from_spec(aspec);aspec.loader.exec_module(a)
NODE=str(Path(sys.argv[1]).resolve());CLI=str(Path(sys.argv[2]).resolve());CANDIDATE=Path(sys.argv[3]).resolve();RETURN=Path(sys.argv[4]).resolve()
assert subprocess.check_output([NODE,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(CLI).parents[1]/'package.json').read_text())['version']=='6.0.14'
results=[]
for label in ['candidate','return']:
 with tempfile.TemporaryDirectory(prefix='re7-front-supervision-') as d:
  p=Path(d);home=p/'pm2';home.mkdir();g.P=p;g.PM_PID=home/'pm2.pid';g.TARGET=str(CANDIDATE)
  env={'HOME':str(p),'PM2_HOME':str(home),'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}
  os.environ['PM2_HOME']=str(home)
  def pm(*args):
   v=subprocess.run([NODE,CLI,*args],env=env,text=True,capture_output=True,timeout=15)
   with (p/'pm2.private.jsonl').open('a') as f:f.write(json.dumps({'args':args,'stdout':v.stdout,'stderr':v.stderr,'exit':v.returncode})+'\n')
   assert v.returncode==0,v.stderr
   return v.stdout
  wrapper=p/'pm2-cli';wrapper.write_text('#!/bin/sh\nexec '+NODE+' '+CLI+' "$@"\n');wrapper.chmod(0o700);g.PM=str(wrapper)
  def rows():return json.loads(pm('jlist'))
  def wait(fn):
   end=time.monotonic()+20;last=None
   while time.monotonic()<end:
    try:
     value=fn()
     if value:return value
    except (RuntimeError,FileNotFoundError,StopIteration,OSError) as e:last=str(e)
    time.sleep(.1)
   raise AssertionError('bounded_lab_wait:'+str(last))
  def config(name,cwd,entry,args):
   return {'name':name,'cwd':str(cwd),'script':str(entry),'interpreter':NODE,'args':args,'autorestart':True,'watch':False,'env':{'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}}
  with socket.socket() as s:s.bind(('127.0.0.1',0));g.PORT=s.getsockname()[1]
  args=['start','-H','127.0.0.1','-p',str(g.PORT)]
  core=p/'core';core.mkdir();(core/'timer.cjs').write_text('setInterval(()=>{},1000)')
  (p/'execution-authorized').write_text('true')
  for f in ['launcher.cjs','bootstrap.cjs','frontend-check.py']:shutil.copy2(HERE/f,p/f)
  try:
   for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker',g.FRONT]:
    cwd=RETURN if name==g.FRONT else core;entry=cwd/'node_modules/next/dist/bin/next' if name==g.FRONT else core/'timer.cjs'
    f=p/(name+'.config.cjs');f.write_text('module.exports = '+json.dumps({'apps':[config(name,cwd,entry,args if name==g.FRONT else [])]})+';\n');pm('start',str(f))
   wait(lambda:any(x['name']==g.FRONT and x['pid'] for x in rows()))
   baseline={'processes':[]}
   for x in rows():
    e=x['pm2_env'];baseline['processes'].append({'name':x['name'],'pid':x['pid'],'startTicks':g.proc(x['pid'])['ticks'],**{k:e.get(k) for k in ['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']}})
   (p/'runtime.private.json').write_text(json.dumps(baseline));daemon=int((home/'pm2.pid').read_text());(p/'daemon.private.json').write_text(json.dumps({'pid':daemon,'ticks':g.proc(daemon)['ticks']}))
   for name,release in [('candidate',CANDIDATE),('return',RETURN)]:
    (p/(name+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps({'apps':[config(g.FRONT,release,release/'node_modules/next/dist/bin/next',args)]})+';\n')
   g.main('before');pm('stop',g.FRONT);g.main('exited');pm('delete',g.FRONT);g.main('init-'+label)
   assert a.execute('start-'+label,p,str(wrapper))==0
   g.main('ready-'+label)
   try:a.execute('start-'+label,p,str(wrapper));raise AssertionError('window replay allowed')
   except FileExistsError:pass
   print('observed_pm2_settings:'+str({k:next(x for x in rows() if x['name']==g.FRONT)['pm2_env'].get(k) for k in ['autorestart','stop_exit_codes']}),flush=True)
   g.main('enable-supervision-'+label)
   assert (p/'execution-authorized').read_text().strip()=='false'
   try:a.execute('start-'+label,p,str(wrapper));raise AssertionError('closed-window start allowed')
   except RuntimeError as e:assert str(e)=='execution_not_authorized'
   try:g.main('enable-supervision-'+label);raise AssertionError('duplicate promotion allowed')
   except FileExistsError:pass
   g.main('supervised-'+label)
   control=p/(label+'.run.private.json');initial=json.loads(control.read_text());window_bytes=Path(initial['journal']).read_bytes()
   pm('save');dump=home/'dump.pm2';digest=hashlib.sha256(dump.read_bytes()).hexdigest()
   pm('kill');wait(lambda:not Path(f'/proc/{daemon}').exists())
   pm('resurrect');assert hashlib.sha256(dump.read_bytes()).hexdigest()==digest
   def supervised():
    row=next(x for x in rows() if x['name']==g.FRONT)
    r,child=g.supervision_live(control,row)
    with urllib.request.urlopen(f'http://127.0.0.1:{g.PORT}/app/login',timeout=1) as response:assert response.status==200
    return row,r,child
   first=wait(supervised);assert first[1]['nonce']!=initial['nonce']
   assert Path(initial['journal']).read_bytes().startswith(window_bytes)
   assert int((home/'pm2.pid').read_text())!=daemon
   # Real Next killed after readiness. No operator start/restart issued.
   os.kill(first[2]['pid'],9)
   recovered=wait(lambda:(v if (v:=supervised())[0]['pid']!=first[0]['pid'] else None))
   assert recovered[1]['nonce'] not in [initial['nonce'],first[1]['nonce']]
   assert recovered[0]['pm2_env']['restart_time']>first[0]['pm2_env']['restart_time']
   assert any(json.loads(x)['event']=='application_exit' for x in Path(first[1]['journal']).read_text().splitlines())
   assert hashlib.sha256(dump.read_bytes()).hexdigest()==digest
   # Same dump a second time is also recoverable, never a consumed run.
   last_daemon=int((home/'pm2.pid').read_text());pm('kill');wait(lambda:not Path(f'/proc/{last_daemon}').exists());pm('resurrect');again=wait(supervised)
   assert again[1]['nonce'] not in [initial['nonce'],first[1]['nonce'],recovered[1]['nonce']]
   assert hashlib.sha256(dump.read_bytes()).hexdigest()==digest
   g.main('supervised-'+label)
   pm('stop',g.FRONT)
   for observation in range(3):
    try:g.tracked_absent(label);break
    except RuntimeError as e:
     print('absence_observation:DENY:'+str(e),flush=True)
     if str(e)!='unreadable_new_or_changed_process' or observation==2:raise
   results.append({'release':label,'buildId':initial['buildId'],'save_kill_resurrect':'PASS','next_death_pm2_recovery':'PASS','same_dump_second_resurrect':'PASS','window_replay':'DENIED','promotion_replay':'DENIED','fresh_nonces':4,'all_incarnations_absent_after_stop':'PASS'})
  finally:
   if os.environ.get('LAB_EVIDENCE_DIR'):shutil.copytree(p,Path(os.environ['LAB_EVIDENCE_DIR'])/label,dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
   pm('kill')
print(json.dumps({'node':'20.20.0','pm2':'6.0.14','results':results,'limits':'real Next packages and PM2/HTTP/processes; backend stand-ins; no production/provider/DB/nft/systemd'},indent=2))
