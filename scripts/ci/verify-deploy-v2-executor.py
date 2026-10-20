#!/usr/bin/env python3
"""Realistic end-to-end fixtures for the built-in Deploy V2 adapter."""
from __future__ import annotations
import hashlib, json, os, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXECUTOR = ROOT / "scripts/deploy-v2.py"
ADAPTER = ROOT / "scripts/deploy-v2-pm2-adapter.py"
ACTIONS = ["capture", "select-api", "verify-api", "select-frontend", "verify-frontend", "enable-supervision", "verify-worker", "save-once"]

def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def put(path, value, mode=0o600):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True) + "\n").encode()); path.chmod(mode)
def mapped(surface, absolute): return surface / str(absolute).lstrip("/")

PM2_FAKE = r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']); state=r/'state/pm2.json'; calls=r/'state/calls.jsonl'; fail=json.loads((r/'state/fail.json').read_text())
def record(v):
 with calls.open('a') as f:f.write(json.dumps({'surface':'pm2','call':v})+'\n')
def save(v):state.write_text(json.dumps(v,sort_keys=True))
def proc(app):
 p=r/'proc'/str(app['pid']);(p/'fd').mkdir(parents=True,exist_ok=True);(p/'stat').write_text(str(app['pid'])+' (node) '+' '.join(['S']+['0']*18+[str(app['startTicks'])])+'\n')
 for n,target in [('cwd',app['pm2_env']['pm_cwd']),('exe','/usr/bin/node')]:
  q=p/n
  if q.exists()or q.is_symlink():q.unlink()
  q.symlink_to(target)
 if app['name']=='fixture-api':
  q=p/'fd/9'
  if q.exists()or q.is_symlink():q.unlink()
  q.symlink_to('socket:[9001]')
args=sys.argv[1:];record(args);apps=json.loads(state.read_text())
key=' '.join(args[:2])
if fail.get('pm2OnceAfterMarker') and args==['jlist'] and (r/'private/front-new-control.json.permanent').exists() and not (r/'state/once-used').exists():
 (r/'state/once-used').write_text('used');raise SystemExit(10)
if fail.get('pm2') in (args[0],key):raise SystemExit(9)
if args==['jlist']:print(json.dumps(apps));raise SystemExit()
if args[0]=='delete':save([x for x in apps if x['name']!=args[1]]);raise SystemExit()
if args[0]=='start':
 d=json.loads(Path(args[1]).read_text())['apps'][0];name=args[3];counter=int((r/'state/counter').read_text())+1;(r/'state/counter').write_text(str(counter))
 env={'status':'online','pm_cwd':d['cwd'],'pm_exec_path':d['script'],'exec_interpreter':d.get('interpreter','/usr/bin/node'),'args':d.get('args',[]),'node_args':d.get('node_args',[]),'instances':d.get('instances',1),'watch':d.get('watch',False),'namespace':d.get('namespace','default'),'exec_mode':'fork_mode','autorestart':d.get('autorestart',True),'stop_exit_codes':d.get('stop_exit_codes',[]),'restart_time':0,'unstable_restarts':0}
 env.update(d.get('env',{}));app={'name':name,'pid':counter,'startTicks':counter*10,'pm2_env':env};apps=[x for x in apps if x['name']!=name]+[app];save(apps);proc(app)
 control=env.get('RE7_FRONT_CONTROL')
 if control:
  c=json.loads((r/control.lstrip('/')).read_text());j=r/c['journal'].lstrip('/');j.parent.mkdir(parents=True,exist_ok=True);j.write_text('\n'.join(json.dumps({'event':event,'nonce':c['nonce']}) for event in ['parent','application_identity','application_released'])+'\n')
 raise SystemExit()
if args==['save']:
 (r/'home/deploy/.pm2/dump.pm2').write_text(json.dumps(apps,sort_keys=True));raise SystemExit()
raise SystemExit(8)
'''

HEALTH_FAKE = r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']);f=json.loads((r/'state/fail.json').read_text())
with (r/'state/calls.jsonl').open('a') as h:h.write(json.dumps({'surface':'health','url':sys.argv[1]})+'\n')
print(500 if f.get('health')==sys.argv[1] else 200)
'''

HELPER_FAKE = r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']);f=json.loads((r/'state/fail.json').read_text());args=sys.argv[1:]
with (r/'state/calls.jsonl').open('a') as h:h.write(json.dumps({'surface':'helper','call':args})+'\n')
expected=json.loads((r/'state/supervision.json').read_text())
if f.get('helper')=='enable' and (r/'private/front-new-control.json.permanent').exists():raise SystemExit(7)
print(json.dumps({'result':'PASS',**expected}));raise SystemExit()
'''

def initial_app(name, pid, cwd, entry, control=None):
    env = {"status":"online","pm_cwd":cwd,"pm_exec_path":entry,"exec_interpreter":"/usr/bin/node","args":[],"node_args":[],"instances":1,"watch":False,"namespace":"default","exec_mode":"fork_mode","autorestart":True,"stop_exit_codes":[],"restart_time":0,"unstable_restarts":0}
    if control: env["RE7_FRONT_CONTROL"] = control
    return {"name":name,"pid":pid,"startTicks":pid*10,"pm2_env":env}

def make_surface(base, scenario):
    s = base / "surface"; (s/"bin").mkdir(parents=True); (s/"state").mkdir()
    put(s/"bin/pm2", PM2_FAKE.encode(), 0o700); put(s/"bin/health", HEALTH_FAKE.encode(), 0o700); put(s/"bin/supervision-helper", HELPER_FAKE.encode(), 0o700)
    put(s/"state/fail.json", {}); put(s/"state/counter", b"2000"); put(s/"state/calls.jsonl", b"")
    paths = {"api_old":"/srv/api-old","front_old":"/srv/front-old","worker":"/srv/worker","api_new":"/release/api","front_new":"/release/front","control_old":"/private/front-old-control.json","control_new":"/private/front-new-control.json","helper":"/usr/local/libexec/re7/frontend-supervision-helper.py"}
    files = {"/srv/api-old/index.js":b"api-old", "/srv/front-old/launcher.js":b"front-old", "/srv/worker/worker.js":b"worker", "/release/api/index.js":b"api-new", "/release/front/launcher.js":b"front-new", paths["helper"]:b"authenticated-helper"}
    for path, raw in files.items(): put(mapped(s,path),raw)
    put(mapped(s,"/srv/front-old/.next/BUILD_ID"),b"OLD\n"); put(mapped(s,"/release/front/.next/BUILD_ID"),b"NEW\n")
    old_control={"nonce":"old","release":paths["front_old"],"entry":"/srv/front-old/launcher.js","entrySha256":digest(mapped(s,"/srv/front-old/launcher.js")),"buildId":"OLD","journal":"/private/old.journal"}; put(mapped(s,paths["control_old"]),old_control)
    new_control={"nonce":"new","release":paths["front_new"],"entry":"/release/front/launcher.js","entrySha256":digest(mapped(s,"/release/front/launcher.js")),"buildId":"NEW","journal":"/private/new.journal"}; put(mapped(s,paths["control_new"]),new_control)
    api_def={"apps":[{"name":"fixture-api","cwd":paths["api_new"],"script":"/release/api/index.js","interpreter":"/usr/bin/node"}]}; front_def={"apps":[{"name":"fixture-front","cwd":paths["front_new"],"script":"/release/front/launcher.js","interpreter":"/usr/bin/node","env":{"RE7_FRONT_CONTROL":paths["control_new"]}}]}
    put(mapped(s,"/private/api-candidate.json"),api_def); put(mapped(s,"/private/front-candidate.json"),front_def)
    apps=[initial_app("fixture-api",1001,paths["api_old"],"/srv/api-old/index.js"),initial_app("fixture-front",1002,paths["front_old"],"/srv/front-old/launcher.js",paths["control_old"]),initial_app("fixture-worker",1003,paths["worker"],"/srv/worker/worker.js")]
    put(s/"state/pm2.json",apps); put(mapped(s,"/home/deploy/.pm2/dump.pm2"),apps)
    for app in apps:
        proc=s/"proc"/str(app["pid"]);(proc/"fd").mkdir(parents=True);put(proc/"stat",(str(app["pid"])+" (node) "+" ".join(["S"]+["0"]*18+[str(app["startTicks"])])+"\n").encode())
        (proc/"cwd").symlink_to(app["pm2_env"]["pm_cwd"]);(proc/"exe").symlink_to("/usr/bin/node")
        if app["name"]=="fixture-api":(proc/"fd/9").symlink_to("socket:[9001]")
    header="  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n";put(mapped(s,"/proc/net/tcp"),(header+"   0: 00000000:0BB9 00000000:0000 0A 0:0 0:0 0 0 0 9001\n").encode());put(mapped(s,"/proc/net/tcp6"),header.encode())
    manifest={"schemaVersion":1,"releaseId":"deploy-v2-fixture","deploymentClass":"NORMAL_RELEASE","candidateCommit":"f"*40,"deploymentOrder":["api","frontend"],"changeBoundary":{"workerChanged":False},"runtimeStatePolicy":{"embeddedRuntimeStateForbidden":True},"promotionAuthorized":False,"artifacts":{}}
    mp=base/"manifest.json";put(mp,manifest)
    supervision={"helper":paths["helper"],"helperSha256":digest(mapped(s,paths["helper"])),"policySha256":"a"*64}; put(s/"state/supervision.json",{"helperSha256":supervision["helperSha256"],"policySha256":supervision["policySha256"]})
    binding={"schemaVersion":2,"releaseId":"deploy-v2-fixture","processes":{"api":"fixture-api","frontend":"fixture-front","worker":"fixture-worker"},"staging":{"root":"/release"},"api":{"candidateCwd":paths["api_new"],"candidateDefinition":"/private/api-candidate.json","candidateDefinitionSha256":digest(mapped(s,"/private/api-candidate.json")),"entrypoint":"/release/api/index.js","entrypointSha256":digest(mapped(s,"/release/api/index.js")),"port":3001,"healthUrls":["http://local/api","https://public/api"]},"frontend":{"candidateCwd":paths["front_new"],"candidateDefinition":"/private/front-candidate.json","candidateDefinitionSha256":digest(mapped(s,"/private/front-candidate.json")),"entrypoint":"/release/front/launcher.js","entrypointSha256":digest(mapped(s,"/release/front/launcher.js")),"control":paths["control_new"],"controlSha256":digest(mapped(s,paths["control_new"])),"buildId":"NEW","healthUrls":["http://local/login","https://public/crm","https://public/assets"]},"worker":{"cwd":paths["worker"],"entrypoint":"/srv/worker/worker.js","entrypointSha256":digest(mapped(s,"/srv/worker/worker.js"))},"supervision":supervision,"acceptance":{"mode":"GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL","forbidPost":True}}
    bp=base/"binding.json";put(bp,binding)
    acceptance={"schemaVersion":1,"releaseId":"deploy-v2-fixture","decision":"ACCEPTED","mode":"OWNER_MANUAL_AUTHENTICATED","csvPostRequests":0,"imports":0,"retryRequests":0};ap=base/"acceptance.json";put(ap,acceptance)
    return s,mp,bp,ap,binding

def invoke(base, scenario, failure=None, acceptance_ok=True, auth_overrides=None):
    surface,manifest,binding,acceptance,_=make_surface(base,scenario)
    if failure: put(surface/"state/fail.json",failure)
    if not acceptance_ok:
        value=json.loads(acceptance.read_text());value["decision"]="DENIED";put(acceptance,value)
    authorization={"schemaVersion":1,"decision":"AUTHORIZED","releaseId":"deploy-v2-fixture","manifestSha256":digest(manifest),"executorSha256":digest(EXECUTOR),"adapterSha256":digest(ADAPTER),"bindingSha256":digest(binding),"acceptanceSha256":digest(acceptance),"notAfterUtc":"2099-01-01T00:00:00Z"};authorization.update(auth_overrides or {})
    auth=base/"authorization.json";put(auth,authorization);work=base/"execution"
    cmd=[str(EXECUTOR),"--manifest",str(manifest),"--execute","--adapter",str(ADAPTER),"--adapter-sha256",digest(ADAPTER),"--binding",str(binding),"--binding-sha256",digest(binding),"--acceptance",str(acceptance),"--acceptance-sha256",digest(acceptance),"--authorization",str(auth),"--authorization-sha256",digest(auth),"--work-dir",str(work)]
    env={**os.environ,"DEPLOY_V2_FIXTURE_ROOT":str(surface)};result=subprocess.run(cmd,text=True,capture_output=True,check=False,env=env)
    calls=[json.loads(x) for x in (surface/"state/calls.jsonl").read_text().splitlines()];return result,work,surface,calls,cmd,env

adapter_source=ADAPTER.read_text()
for forbidden in ('"actions"[', 'run_plan(', 'executableSha256 by action'):
    assert forbidden not in adapter_source
for required in ACTIONS+["rollback-all"]: assert f'"{required}"' in adapter_source

with tempfile.TemporaryDirectory(prefix="deploy-v2-realistic-") as temporary:
    root=Path(temporary)
    ok,work,surface,calls,cmd,env=invoke(root/"success","success")
    assert ok.returncode==0,(ok.stdout,ok.stderr,{p.name:p.read_text() for p in (work/"adapter-actions").glob("*.json")},(surface/"private/new.journal").read_text(),calls)
    pm2=[x["call"] for x in calls if x["surface"]=="pm2"]
    assert pm2.count(["save"])==1 and not any("rollback" in " ".join(x) for x in pm2)
    initial_worker=json.loads((work/"capture.json").read_text())["processes"]["fixture-worker"]
    final_worker=next(x for x in json.loads((surface/"state/pm2.json").read_text()) if x["name"]=="fixture-worker")
    assert final_worker["pid"]==initial_worker["pid"]
    replay=subprocess.run(cmd,text=True,capture_output=True,check=False,env=env);assert replay.returncode==64
    scenarios=[("capture",{"pm2":"jlist"}), ("select-api",{"pm2":"delete fixture-api"}), ("verify-api",{"health":"http://local/api"}), ("select-frontend",{"pm2":"delete fixture-front"}), ("verify-frontend",{"health":"http://local/login"}), ("enable-supervision",{"helper":"enable"}), ("save-once",None)]
    for index,(name,failure) in enumerate(scenarios):
        result,run,s,entries,_,_=invoke(root/f"deny-{index}",name,failure=failure,acceptance_ok=name!="save-once")
        assert result.returncode in (1,2),(name,result.stdout,result.stderr)
        pm=[x["call"] for x in entries if x["surface"]=="pm2"]
        assert ["save"] not in pm
        if name!="capture":
            state=json.loads((s/"state/pm2.json").read_text());by={x["name"]:x for x in state}
            assert by["fixture-api"]["pm2_env"]["pm_cwd"]=="/srv/api-old" and by["fixture-front"]["pm2_env"]["pm_cwd"]=="/srv/front-old",name
    worker_result,_,worker_surface,worker_entries,_,_=invoke(root/"worker-deny","worker",failure={"pm2OnceAfterMarker":True})
    assert worker_result.returncode==1
    worker_state={x["name"]:x for x in json.loads((worker_surface/"state/pm2.json").read_text())}
    assert worker_state["fixture-worker"]["pid"]==1003 and ["save"] not in [x["call"] for x in worker_entries if x["surface"]=="pm2"]
    # The realistic PM2 surface also proves worker preservation on success.
    assert all(x.get("surface")!="real-pm2" for x in calls)
    bad_binding=root/"bad-binding";bad_binding.mkdir();s,m,b,a,v=make_surface(bad_binding,"bad")
    value=json.loads(b.read_text());value["actions"]={"capture":{"argv":["pm2"]}};put(b,value)
    bad_work=bad_binding/"adapter-work";bad_work.mkdir()
    bad=subprocess.run([str(ADAPTER),"capture","--manifest",str(m),"--binding",str(b),"--binding-sha256",digest(b),"--work-dir",str(bad_work)],text=True,capture_output=True,check=False,env={**os.environ,"DEPLOY_V2_FIXTURE_ROOT":str(s)})
    assert bad.returncode==1 and "BINDING_EXECUTABLE_CONTENT" in bad.stdout
    assert not (s/"state/calls.jsonl").read_text()
    denied,_,_,_,_,_=invoke(root/"authorization-deny","auth",auth_overrides={"decision":"DENIED"});assert denied.returncode==64
    assert not (root/"authorization-deny/execution").exists()

print("DEPLOY_V2_BUILTIN_ADAPTER_REALISTIC_FIXTURES_PASS")
