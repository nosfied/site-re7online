from pathlib import Path
import json,hashlib,os,subprocess,importlib.util,sys,datetime
BASE=Path('/opt/re7online/backups/converta-persistent/preparations');A=BASE/'incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z';F=BASE/'frontend-dynamic-5b3cf3af-20261012T170000Z';C=BASE/'incident-6683-v4-dynamic-compatible-20261012T184200Z'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
sys.path.insert(0,str(F));s=importlib.util.spec_from_file_location('front_gate',F/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
rows=g.rows();assert len(rows)==3;front=next(r for r in rows if r['name']==g.FRONT);run,child=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front)
assert run['release']=='/opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z' and run['buildId']=='dFvS6tFEaWQsSIIn3P702'
assert (F/'execution-authorized').read_text().strip()=='false'and all(v is False for v in json.loads((A/'window/execution-gates.private.json').read_text()).values())
sys.path.insert(0,str(C/'switch'));s=importlib.util.spec_from_file_location('compat_ops',C/'switch/ops.py');o=importlib.util.module_from_spec(s);s.loader.exec_module(o)
source=json.loads((C/'switch/return.config.private.json').read_text())['apps']
for a in source:o.Operations(C/'switch',o.System()).config(next(r for r in rows if r['name']==a['name']),a)
pol=json.loads((C/'window/privileged-policy.private.json').read_text());assert g.proc(pol['pm2Daemon']['pid'])['ticks']==pol['pm2Daemon']['ticks']
for name,v in pol['sourceProcesses'].items():r=next(r for r in rows if r['name']==name);assert r['pid']==v['pid']and g.proc(r['pid'])['ticks']==v['ticks']
manifest=json.loads((A/'api-candidate-manifest.private.json').read_text())
for f in manifest['files']:assert h(Path(manifest['candidate'])/f['path'])==f['sha256']
assert h('/home/deploy/.pm2/dump.pm2')==h('/home/deploy/.pm2/dump.pm2.bak')
old=json.loads((A/'window/initial.private.json').read_text());guard=json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text());assert guard['open']is False and guard['generation']==38 and guard['tasks']=={} and not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+p)for p in ['.lock','.uncertain'])
assert Path('/etc/cron.d/re7-converta-backup').read_bytes()==(A/'window/re7-converta-backup.before').read_bytes();assert subprocess.check_output(['crontab','-l'])==(A/'window/deploy.crontab.before').read_bytes()
boot=subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True);assert boot==old['supervision']
barrier=subprocess.run(['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/incident-6683-window-control.py','check-absent'],capture_output=True,text=True,timeout=10);assert barrier.returncode==0
health=json.loads(subprocess.check_output(['curl','--fail','--max-time','5','--silent','--show-error','http://127.0.0.1:3001/health'],text=True));assert health['ok']and health['db']=='ok'
minimum=min(os.statvfs(A).f_bavail*os.statvfs(A).f_frsize,int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3]));assert minimum>=2131755008
print(json.dumps({'result':'FINAL_TECHNICAL_COMPONENTS_SUPERVISION_CONTROLS_CAPACITY_PASS','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'processes':[{'name':r['name'],'pid':r['pid'],'ticks':g.proc(r['pid'])['ticks'],'cwd':r['pm2_env']['pm_cwd'],'restarts':r['pm2_env']['restart_time']}for r in rows],'frontendChild':child,'frontendBuild':run['buildId'],'savedSha256':h('/home/deploy/.pm2/dump.pm2'),'fallbackSha256':h('/home/deploy/.pm2/dump.pm2.bak'),'guardSha256':h('/var/lib/re7/campaign-operations/state.json'),'guard':{k:guard[k]for k in ['open','generation','tasks']},'boot':boot,'barrierAbsent':True,'health':health,'apiGates':json.loads((A/'window/execution-gates.private.json').read_text()),'frontendGate':False,'availableMinimumBytes':minimum,'standbyPolicyNotInstalled':True}))
