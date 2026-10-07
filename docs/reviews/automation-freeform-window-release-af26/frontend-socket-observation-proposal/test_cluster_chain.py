"""Real isolated PM2 cluster -> launcher -> bootstrap -> exact Next packages.

Arguments: Node20 binary, PM2 6.0.14 CLI, preserved fa60 extraction, 9f extraction.
Run in UID/PID/network namespace; observer function is the actual privileged
reader running as namespace root. Installed-path/sudo policy are NOT exercised.
API/worker are timers. No browser/provider/campaign/production accesses.
"""
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
sys.path.insert(0,str(HERE))
import observer
SCRIPTS=HERE.parent/'frontend-fa60f0f6-prepared'
sys.path.insert(0,str(SCRIPTS))
import socket_observation_contract as contract
import socket_observation_client as client
spec=importlib.util.spec_from_file_location('gate',SCRIPTS/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
NODE,CLI,CANDIDATE,RETURN=[str(Path(x).resolve()) for x in sys.argv[1:5]]
assert subprocess.check_output([NODE,'--version'],text=True).strip()=='v20.20.0'
assert json.loads((Path(CLI).parents[1]/'package.json').read_text())['version']=='6.0.14'
assert Path(CANDIDATE,'.next/BUILD_ID').read_text().strip()=='HttJ8PoISXKUzSzoDZ7_E'
assert Path(RETURN,'.next/BUILD_ID').read_text().strip()=='LFcdEK9gXZsBhf4_c5r8G'
results=[]
def forbidden_legacy_certificate(*args,**kwargs):raise AssertionError('legacy certificate path invoked')
g.remaining_source_sockets=forbidden_legacy_certificate
g.root_source_socket_observation=forbidden_legacy_certificate
with tempfile.TemporaryDirectory(prefix='re7-front-cluster-chain-') as tmp:
 base=Path(tmp);home=base/'pm2';env={'HOME':str(base),'PM2_HOME':str(home),'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'};os.environ['PM2_HOME']=str(home)
 def pm(*args):
  v=subprocess.run([NODE,CLI,*args],env=env,text=True,capture_output=True,timeout=15)
  with (base/'pm2.private.log').open('a') as f:f.write(json.dumps({'args':args,'stdout':v.stdout,'stderr':v.stderr,'exit':v.returncode})+'\n')
  assert v.returncode==0,v.stderr
  return v.stdout
 wrapper=base/'pm2-cli';wrapper.write_text('#!/bin/sh\nexec '+NODE+' '+CLI+' "$@"\n');wrapper.chmod(0o700);g.PM=str(wrapper);g.PM_PID=home/'pm2.pid'
 def rows():return json.loads(pm('jlist'))
 def baseline(p):
  actual=rows();out={'processes':[]}
  for x in actual:
   e=x['pm2_env'];out['processes'].append({'name':x['name'],'pid':x['pid'],'startTicks':g.proc(x['pid'])['ticks'],**{k:e.get(k) for k in ['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']}})
  (p/'runtime.private.json').write_text(json.dumps(out));d=int(g.PM_PID.read_text());(p/'daemon.private.json').write_text(json.dumps({'pid':d,'ticks':g.proc(d)['ticks']}));return out
 def config(release):return {'name':g.FRONT,'instances':1,'cwd':release,'script':str(Path(release,'node_modules/next/dist/bin/next')),'interpreter':NODE,'args':['start','-H','127.0.0.1','-p',str(g.PORT)],'watch':False,'autorestart':True,'env':{'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1'}}
 def tracked_start(p,label):
  g.P=p;g.init_run(label);pm('start',str(p/(label+'.tracked.config.cjs')),'--only',g.FRONT)
  # The real readiness checker and real control/journal are used, not substituted.
  baseline(p);g.ready(label)
  row=next(x for x in rows() if x['name']==g.FRONT);assert row['pm2_env']['exec_mode']=='cluster_mode'
  return json.loads((p/(label+'.run.private.json')).read_text())
 def ledger(r):return [x for x in map(json.loads,Path(r['journal']).read_text().splitlines()) if x['event'] in ['parent','application_identity']]
 def policy(roles):
  d=int(g.PM_PID.read_text());return {'version':1,'frontendPort':g.PORT,'bootId':g.BOOT_ID.read_text().strip(),'daemon':{'pid':d,'ticks':g.proc(d)['ticks']},'roles':roles}
 def absent(pol,role,r,path):
  v=observer.observe(pol);contract.absent(v,pol,role,ledger(r),path);return v
 def denied(fn,label):
  try:fn();raise AssertionError('negative accepted:'+label)
  except RuntimeError as ex:results.append({'case':label,'result':'DENY','reason':str(ex)})
 with socket.socket() as s:s.bind(('127.0.0.1',0));g.PORT=s.getsockname()[1]
 try:
  core=base/'core';core.mkdir();(core/'timer.cjs').write_text('setInterval(()=>{},1000)')
  for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
   f=base/(name+'.config.cjs');f.write_text('module.exports = '+json.dumps({'apps':[{'name':name,'cwd':str(core),'script':str(core/'timer.cjs'),'interpreter':NODE,'watch':False}]}));pm('start',str(f))
  source=base/'source';source.mkdir();g.P=source;g.TARGET=CANDIDATE
  for script in ['launcher.cjs','bootstrap.cjs','frontend-check.py']:shutil.copy2(SCRIPTS/script,source/script)
  (source/'return.ecosystem.config.cjs').write_text('module.exports = '+json.dumps({'apps':[config(RETURN)]})+';\n')
  (source/'runtime.private.json').write_text(json.dumps({'processes':[{'name':g.FRONT,'pm_cwd':RETURN}]}))
  src=tracked_start(source,'return');g.enable_supervision('return')
  w=base/'window-fixture';w.mkdir();g.P=w;g.TARGET=CANDIDATE;baseline(w)
  for script in ['launcher.cjs','bootstrap.cjs','frontend-check.py']:shutil.copy2(SCRIPTS/script,w/script)
  for label,release in [('candidate',CANDIDATE),('return',RETURN)]:
   (w/(label+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps({'apps':[config(release)]})+';\n');g.init_run(label)
  source_cap=w/'source-tree.private.json';d=int(g.PM_PID.read_text());shared=os.readlink(f'/proc/{d}/fd/0')[8:-1]
  src_pid=ledger(src)[0]['pid'];assert os.readlink(f'/proc/{src_pid}/fd/0')=='socket:['+shared+']'
  assert ledger(src)[0]['group']==g.proc(d)['group'],'expected shared PM2 group'
  roles={name:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(source_cap if name=='source' else w/(name+'-tree.private.json'))} for name,r in [('source',src),('candidate',json.loads((w/'candidate.run.private.json').read_text())),('return',json.loads((w/'return.run.private.json').read_text()))]};pol=policy(roles)
  policy_hash=hashlib.sha256(json.dumps(pol,sort_keys=True).encode()).hexdigest();helper_hash=hashlib.sha256(Path(observer.__file__).read_bytes()).hexdigest()
  (w/'socket-observer-binding.private.json').write_text(json.dumps({'policy':pol,'policySha256':policy_hash,'helperSha256':helper_hash}))
  def lab_reader(policy):
   value=observer.observe(policy);value.update(policySha256=policy_hash,helperSha256=helper_hash);return value
  badpreflight=base/'preflight-no-access';badpreflight.mkdir();baseline(badpreflight)
  (badpreflight/'socket-observer-binding.private.json').write_text(json.dumps({'policy':pol,'policySha256':policy_hash,'helperSha256':helper_hash}))
  g.P=badpreflight;g.OBSERVATION_READER=None
  before_pid=next(x for x in rows() if x['name']==g.FRONT)['pid']
  denied(lambda:g.main('before'),'real preflight denies absent capability before any window stop')
  assert next(x for x in rows() if x['name']==g.FRONT)['pid']==before_pid
  g.P=w;g.OBSERVATION_READER=lab_reader
  g.main('before');cap=json.loads(source_cap.read_text());assert shared in cap['sockets'],'cluster source did not inherit actual daemon stdin'
  denied(lambda:absent(pol,'source',src,source_cap),'source executor/listener alive')
  pm('stop',g.FRONT)
  g.main('exited');v=absent(pol,'source',src,source_cap);assert v['samples'][0]['owners'][shared]==[{'pid':d,'ticks':g.proc(d)['ticks'],'fd':'0','state':g.proc(d)['state']}]
  results.append({'case':'real cluster source shares stdin; exited owner only daemon','result':'PASS','injection':False})
  pm('delete',g.FRONT)
  # Baseline stays the actual pre-window source: do not rewrite it to match candidates.
  for label in ['candidate','return']:
   pm('start',str(w/(label+'.tracked.config.cjs')),'--only',g.FRONT);g.ready(label);r=json.loads((w/(label+'.run.private.json')).read_text());row=next(x for x in rows() if x['name']==g.FRONT);assert row['pm2_env']['exec_mode']=='cluster_mode'
   t=g.tree(row['pid']);capture=w/(label+'-tree.private.json');capture.write_text(json.dumps({'tree':t,'sockets':g.sockets(t)}));assert shared in json.loads(capture.read_text())['sockets']
   denied(lambda:absent(pol,label,r,capture),label+' executor alive')
   if label=='return':
    # The group fix also affects permanent recovery in cluster, unlike the old fork test.
    g.enable_supervision('return');g.main('supervised-return')
    old_parent=next(x for x in rows() if x['name']==g.FRONT)['pid']
    child=next(x for x in ledger(r) if x['event']=='application_identity');os.kill(child['pid'],15)
    deadline=time.monotonic()+25;recovered=False
    while time.monotonic()<deadline:
     current=next(x for x in rows() if x['name']==g.FRONT)
     try:
      if current['pid'] and current['pid']!=old_parent:
       live_r,live_child=g.supervision_live(w/'return.run.private.json',current)
       assert live_r['nonce']!=r['nonce']
       with urllib.request.urlopen(f'http://127.0.0.1:{g.PORT}/app/login',timeout=1) as response:assert response.status==200
       recovered=True;break
     except (RuntimeError,FileNotFoundError,StopIteration,OSError):pass
     time.sleep(.1)
    assert recovered,'cluster permanent recovery failed'
    results.append({'case':'real cluster Next death -> launcher exits -> PM2 fresh recovery','result':'PASS','injection':False})
   pm('stop',g.FRONT)
   try:g.tracked_absent(label)
   except RuntimeError:
    for record in [r]+[json.loads((d/'control.json').read_text()) for d in (w/(label+'.run.private.json.runs')).glob('*')]:
     js=[json.loads(x) for x in Path(record['journal']).read_text().splitlines()]
     print('absence_inventory_diagnostic:'+json.dumps(g.inventory(record,js)),flush=True)
    raise
   results.append({'case':label+' integrated actual checker uses fresh root reader and exact pre-existing group identity','result':'PASS','injection':'reader call uses same code/syscalls directly as namespace root; installation not exercised'})
   absent(pol,label,r,capture);results.append({'case':label+' exact Next cluster stop and fresh absence contract','result':'PASS','injection':False})
   pm('delete',g.FRONT)
  # Additional real holder of PM2's fd0, without changing the expected daemon.
  unknown=base/'unknown.cjs';unknown.write_text('setInterval(()=>{},1000)');f=base/'unknown.config.cjs';f.write_text('module.exports = '+json.dumps({'apps':[{'name':'unknown-holder','instances':1,'script':str(unknown),'interpreter':NODE,'watch':False}]}));pm('start',str(f))
  denied(lambda:absent(pol,'source',src,source_cap),'real additional stdin owner')
  pm('stop','unknown-holder');pm('delete','unknown-holder')
  bad=json.loads(json.dumps(pol));bad['daemon']['ticks']=str(int(bad['daemon']['ticks'])+1)
  denied(lambda:observer.observe(bad),'daemon identity changed')
  # Reuse defense is a record injection, not a forced real OS PID reuse.
  live=g.proc(d);denied(lambda:contract.absent(observer.observe(pol),pol,'source',[live],source_cap),'PID reuse ledger injection')
  orphan=subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=RETURN,env={**env,'RE7_FRONT_RUN':roles['return']['nonce']},start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:denied(lambda:g.tracked_absent('return'),'real detached descendant/relevant executor survives')
  finally:orphan.terminate();orphan.wait()
  with socket.socket() as listener:
   listener.bind(('127.0.0.1',g.PORT));listener.listen()
   denied(lambda:absent(pol,'source',src,source_cap),'real additional listener')
  real_readlink=observer.os.readlink
  api=next(x for x in rows() if x['name']=='re7-whatsapp-agent')['pid']
  def inaccessible(path):
   if str(path)==f'/proc/{api}/fd/0':raise PermissionError('injected permission failure')
   return real_readlink(path)
  observer.os.readlink=inaccessible
  try:denied(lambda:client.read(w,'permission-negative',reader=lab_reader),'permission fault injection denies and logs private output')
  finally:observer.os.readlink=real_readlink
  records=[json.loads(x.read_text()) for x in (w/'socket-observation-output-private').glob('permission-negative-*.json')]
  assert len(records)==1 and records[0]['exitCode'] is None and 'permission_denied' in records[0]['stderr']
  real_sample=observer.sample;churn=[];calls=0
  def churn_between_samples(policy, deadline=None):
   global calls
   calls+=1;value=real_sample(policy, deadline)
   if calls%2:
    churn.append(subprocess.Popen([NODE,'-e','setInterval(()=>{},1000)'],cwd=RETURN,env={**env,'RE7_FRONT_RUN':roles['return']['nonce']},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
   return value
  observer.sample=churn_between_samples
  try:
   for attempt in range(3):denied(lambda:client.read(w,'churn-'+str(attempt),reader=lab_reader),'persistent churn real processes, sample barrier injected '+str(attempt+1))
  finally:
   observer.sample=real_sample
   for child in churn:child.terminate();child.wait()
  stale=lab_reader(pol)
  denied(lambda:client.read(w,'stale',reader=lambda policy:stale),'replayed snapshot injection denied by invocation time')
  results.append({'case':'R/S identity treatment','result':'PASS','injection':observer.stable_signature({'daemon':pol['daemon'],'daemonFd0':'x','captures':{},'listeners':[],'processes':[{'pid':1,'ticks':'1','parent':0,'group':1,'state':'R','roles':['source']}],'owners':{},'network':{}})==observer.stable_signature({'daemon':pol['daemon'],'daemonFd0':'x','captures':{},'listeners':[],'processes':[{'pid':1,'ticks':'1','parent':0,'group':1,'state':'S','roles':['source']}],'owners':{},'network':{}})})
  # A missing delegation is demonstrated with the real default sudo command in this lab.
  denied(lambda:client.read(w,'missing-delegation'),'real absent helper/sudo capability denies before window')

 finally:
  if os.environ.get('LAB_EVIDENCE_DIR'):
   shutil.copytree(base,Path(os.environ['LAB_EVIDENCE_DIR']),dirs_exist_ok=True,ignore=lambda d,n:[x for x in n if Path(d,x).is_socket()])
  pm('kill')
print(json.dumps({'node':'20.20.0','pm2':'6.0.14','mode':'cluster_mode','results':results},indent=2))
