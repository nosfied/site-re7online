"""Real Linux/Node20/PM2: no production, providers, DB, nft or systemd."""
import contextlib
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

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('gate',HERE/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
NODE=str(Path(sys.argv[1]).resolve());CLI=str(Path(sys.argv[2]).resolve())
assert subprocess.check_output([NODE,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(CLI).parents[1]/'package.json').read_text())['version']=='6.0.14'
JS='''const fs=require('node:fs'),http=require('node:http'),cp=require('node:child_process');
const mode=process.env.LAB_MODE;
if(mode==='survivor') {const p=cp.spawn(process.execPath,['-e',"require('node:net').createServer(()=>{}).listen(0,'127.0.0.1');setInterval(()=>{},1000)"],{detached:true,stdio:'ignore',env:process.env});p.unref();fs.writeFileSync(process.env.SURVIVOR_FILE,String(p.pid));setTimeout(()=>process.exit(7),100);}
else if(mode==='exit') process.exit(9);
else {const server=http.createServer((req,res)=>{res.statusCode=mode==='persistent'?503:200;res.end('local fixture');});setTimeout(()=>server.listen(Number(process.env.LAB_PORT),'127.0.0.1'),mode==='slow'?2200:0);}
'''
aspec=importlib.util.spec_from_file_location('actions',HERE/'frontend-action.py');actions=importlib.util.module_from_spec(aspec);aspec.loader.exec_module(actions)
checks=[]
with tempfile.TemporaryDirectory(prefix='re7-front-operational-') as folder:
 base=Path(folder);home=base/'pm2';home.mkdir();env={'HOME':str(base),'PM2_HOME':str(home),'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'};os.environ['PM2_HOME']=str(home)
 def pm(*args):
  v=subprocess.run([NODE,CLI,*args],env=env,text=True,capture_output=True);(base/'pm2.private.log').open('a').write(json.dumps({'args':args,'stdout':v.stdout,'stderr':v.stderr,'exit':v.returncode})+'\n');assert v.returncode==0,v.stderr;return v.stdout
 wrapper=base/'pm2-cli';wrapper.write_text('#!/bin/sh\nexec '+NODE+' '+CLI+' "$@"\n');wrapper.chmod(0o700)
 g.PM=str(wrapper);g.PM_PID=home/'pm2.pid'
 def apps():return json.loads(pm('jlist'))
 def wait(fn):
  end=time.monotonic()+8
  while time.monotonic()<end:
   if fn():return
   time.sleep(.05)
  raise AssertionError('lab_wait_timeout')
 def config(name,cwd,script,extra=None):
  return {'name':name,'cwd':str(cwd),'script':str(script),'interpreter':NODE,'args':[],'watch':False,'autorestart':True,'env':{'NODE_ENV':'production',**(extra or {})}}
 core=base/'core';core.mkdir();(core/'server.cjs').write_text('setInterval(()=>{},1000)')
 for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
  f=base/(name+'.config.cjs');f.write_text('module.exports = '+json.dumps({'apps':[config(name,core,core/'server.cjs')]}));pm('start',str(f))
 try:
  for mode in (['exact-next'] if len(sys.argv)>3 else ['normal','slow','exit','survivor','persistent']):
   p=base/mode;p.mkdir();g.P=p;(p/'execution-authorized').write_text('true')
   for k in ['launcher.cjs','bootstrap.cjs','frontend-check.py']:shutil.copy2(HERE/k,p/k)
   release=Path(sys.argv[3]).resolve() if mode=='exact-next' else p/'candidate';old=Path(sys.argv[4]).resolve() if mode=='exact-next' and len(sys.argv)>4 else p/'return'
   for r,bid in [(release,'candidate'),(old,'return')]:
    if mode=='exact-next' and (r==release or len(sys.argv)>4):continue
    (r/'node_modules/next/dist/bin').mkdir(parents=True);(r/'.next').mkdir();(r/'.next/BUILD_ID').write_text(bid);(r/'node_modules/next/dist/bin/next').write_text(JS)
   with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
   g.PORT=port;g.TARGET=str(release)
   extra={'LAB_MODE':'normal','LAB_PORT':str(port),'SURVIVOR_FILE':str(p/'survivor.pid')}
   cfg=config(g.FRONT,old,old/'node_modules/next/dist/bin/next',extra);f=p/'source.config.cjs';f.write_text('module.exports = '+json.dumps({'apps':[cfg]}));pm('start',str(f));wait(lambda:any(x['name']==g.FRONT and x['pid'] for x in apps()))
   actual=apps();v={'processes':[],'buildId':'return'}
   for x in actual:
    e=x['pm2_env'];v['processes'].append({**{k:e.get(k) for k in ['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']},'name':x['name'],'pid':x['pid'],'startTicks':g.proc(x['pid'])['ticks']})
   (p/'runtime.private.json').write_text(json.dumps(v));pid=int((home/'pm2.pid').read_text());(p/'daemon.private.json').write_text(json.dumps({'pid':pid,'ticks':g.proc(pid)['ticks']}))
   for label,r in [('candidate',release),('return',old)]:
    e={**extra,'LAB_MODE':mode if label=='candidate' else 'normal'};cfg=config(g.FRONT,r,r/'node_modules/next/dist/bin/next',e);cfg['args']=['start','-H','127.0.0.1','-p',str(port)] if mode=='exact-next' else [];(p/(label+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps({'apps':[cfg]})+';\n')
   g.main('before');pm('stop',g.FRONT);g.main('exited');pm('delete',g.FRONT)
   g.main('init-candidate');assert actions.execute('start-candidate',p,str(wrapper))==0
   wait(lambda:Path(g.run_from('candidate')['journal']).exists() and 'application_released' in Path(g.run_from('candidate')['journal']).read_text())
   if mode in ['normal','slow','exact-next']:
    g.main('ready-candidate');g.main('capture-current');assert len([x for x in Path(g.run_from('candidate')['journal']).read_text().splitlines() if json.loads(x)['event']=='application_identity'])==1
    try:actions.execute('start-candidate',p,str(wrapper));raise AssertionError('start replay accepted')
    except FileExistsError:checks.append(mode+': start replay DENIED before PM2')
    assert json.loads(next((p/'command-output-private').glob('start-candidate-*.json')).read_text())['exitCode']==0
    checks.append(mode+': readiness PASS, single application')
   elif mode in ['exit','survivor']:
    wait(lambda:'application_exit' in Path(g.run_from('candidate')['journal']).read_text())
    try:g.main('ready-candidate');raise AssertionError('failure accepted')
    except RuntimeError as e:assert str(e)=='application_ended'
    wait(lambda:any(x['name']==g.FRONT and x['pid']==0 and x['pm2_env']['status']=='stopped' and x['pm2_env']['restart_time']==0 for x in apps()))
    assert len([x for x in Path(g.run_from('candidate')['journal']).read_text().splitlines() if json.loads(x)['event']=='application_identity'])==1
    assert not (p/'candidate-tree.private.json').exists();checks.append(mode+': failure before capture DENY readiness')
   else:
    try:g.ready('candidate',deadline_seconds=2,attempts=4,interval=.5);raise AssertionError('persistent accepted')
    except (RuntimeError,subprocess.TimeoutExpired) as e:
     assert isinstance(e,subprocess.TimeoutExpired) or str(e) in ['readiness_deadline','readiness_deadline_or_attempt_limit']
    checks.append('persistent: limited readiness DENY, no repeat start')
   pm('stop',g.FRONT)
   if mode=='survivor':
    try:g.main('candidate-exited');raise AssertionError('survivor accepted')
    except RuntimeError as e:assert str(e)=='executor_survived',str(e)
    checks.append('survivor: return BLOCKED by real detached child')
    # Cleanup synthetic laboratory only, not a proposed production action.
    pid=int((p/'survivor.pid').read_text());os.kill(pid,15)
    # Orphan zombies in container namespaces must remain denied. Do not promote cleanup as proof.
    pm('delete',g.FRONT);continue
   # Bounded repeat of read-only absence observation, never a start retry.
   for observation in range(3):
    try:g.main('candidate-exited');break
    except RuntimeError as e:
     if str(e)!='unreadable_new_or_changed_process' or observation==2:raise
     checks.append(mode+': incomplete observation DENIED; fresh read-only observation')
   pm('delete',g.FRONT)
   g.main('init-return');assert actions.execute('start-return',p,str(wrapper))==0;wait(lambda:Path(g.run_from('return')['journal']).exists() and 'application_released' in Path(g.run_from('return')['journal']).read_text());g.main('ready-return');g.main('return');checks.append(mode+': compatible return PASS')
   # All real backend stand-ins retain their baseline identity.
   g.core(v,apps());pm('stop',g.FRONT);pm('delete',g.FRONT)
  # Real PM2 refusal: nonexistent configuration, one preserved intent, private diagnostics.
  denied=base/'denied-command';denied.mkdir();(denied/'execution-authorized').write_text('true')
  assert actions.execute('start-candidate',denied,str(wrapper))==1
  log=next((denied/'command-output-private').glob('*.json'));record=json.loads(log.read_text())
  assert record['exitCode']!=0 and record['stderr'] and 'stdout' in record and log.stat().st_mode & 0o777==0o600
  try:actions.execute('start-candidate',denied,str(wrapper));raise AssertionError('failed command replay accepted')
  except FileExistsError:checks.append('privileged-free PM2 failure: stdout/stderr/exit preserved; replay DENIED')
  print(json.dumps({'node':'20.20.0','pm2':'6.0.14','checks':checks,'limits':('real Next candidate and af26 return' if len(sys.argv)>4 else 'synthetic frontends')+'; real PM2/Node/processes/HTTP/sockets; backend stand-ins; no productive effects'},indent=2))
 finally:
  if os.environ.get('LAB_EVIDENCE_DIR'):
   shutil.copytree(base,Path(os.environ['LAB_EVIDENCE_DIR']),dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
  pm('kill')
