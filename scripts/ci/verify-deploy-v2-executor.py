#!/usr/bin/env python3
"""Realistic, non-PM2 fixtures for the two-phase built-in Deploy V2 adapter."""
from __future__ import annotations
import hashlib, json, os, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]; EXECUTOR=ROOT/"scripts/deploy-v2.py"; ADAPTER=ROOT/"scripts/deploy-v2-pm2-adapter.py"
PRIVATE_SECRET="fixture-private-api-value-never-report"
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def put(path,value,mode=0o600):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(value if isinstance(value,bytes) else (json.dumps(value,sort_keys=True)+"\n").encode()); path.chmod(mode)
def mapped(surface,path): return surface/str(path).lstrip("/")

PM2_FAKE=r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']);state=r/'state/pm2.json';calls=r/'state/calls.jsonl';fail=json.loads((r/'state/fail.json').read_text())
def record(v):
 with calls.open('a') as f:f.write(json.dumps({'surface':'pm2','call':v})+'\n')
def save(v):state.write_text(json.dumps(v,sort_keys=True));os.chmod(state,0o600)
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
args=sys.argv[1:];record(args);apps=json.loads(state.read_text());key=' '.join(args[:2])
if fail.get('pm2') in (args[0],key):raise SystemExit(9)
if args==['jlist']:print(json.dumps(apps));raise SystemExit()
if args[0]=='delete':save([x for x in apps if x['name']!=args[1]]);raise SystemExit()
if args[0]=='start':
 d=json.loads(Path(args[1]).read_text())['apps'][0];name=args[3];counter=int((r/'state/counter').read_text())+1;(r/'state/counter').write_text(str(counter));private=d.get('env',{})
 if name=='fixture-api' and d['cwd']=='/srv/api-old' and private.get('API_PRIVATE_REQUIRED')!='fixture-private-api-value-never-report':raise SystemExit(11)
 if name=='fixture-front' and d['cwd']=='/srv/front-old' and (private.get('RE7_FRONT_CONTROL')!='/private/front-old-control.json' or private.get('RE7_FRONT_RUN')!='old-run'):raise SystemExit(12)
 env={'status':'online','pm_cwd':d['cwd'],'pm_exec_path':d['script'],'exec_interpreter':d.get('interpreter','/usr/bin/node'),'args':d.get('args',[]),'node_args':d.get('node_args',[]),'instances':d.get('instances',1),'watch':d.get('watch',False),'namespace':d.get('namespace','default'),'exec_mode':d.get('exec_mode','fork_mode'),'autorestart':d.get('autorestart',True),'stop_exit_codes':d.get('stop_exit_codes',[]),'restart_time':0,'unstable_restarts':0,'pm_out_log_path':d.get('out_file'), 'pm_err_log_path':d.get('error_file'),'pm_log_path':d.get('log_file'),'merge_logs':d.get('merge_logs',True),'log_date_format':d.get('log_date_format','YYYY'),'time':d.get('time',False),'env':private}
 env.update({k:v for k,v in private.items() if k in ('RE7_FRONT_CONTROL','RE7_FRONT_RUN')});app={'name':name,'pid':counter,'startTicks':counter*10,'pm2_env':env};apps=[x for x in apps if x['name']!=name]+[app];save(apps);proc(app)
 control=env.get('RE7_FRONT_CONTROL')
 if control:
  c=json.loads((r/control.lstrip('/')).read_text());j=r/c['journal'].lstrip('/');j.parent.mkdir(parents=True,exist_ok=True);j.write_text('\n'.join(json.dumps({'event':event,'nonce':c['nonce']}) for event in ['parent','application_identity','application_released'])+'\n')
 raise SystemExit()
if args==['save']:(r/'home/deploy/.pm2/dump.pm2').write_text(json.dumps(apps,sort_keys=True));os.chmod(r/'home/deploy/.pm2/dump.pm2',0o600);raise SystemExit()
raise SystemExit(8)
'''
HEALTH_FAKE=r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']);f=json.loads((r/'state/fail.json').read_text())
with (r/'state/calls.jsonl').open('a') as h:h.write(json.dumps({'surface':'health','url':sys.argv[1]})+'\n')
print(500 if f.get('health')==sys.argv[1] else 200)
'''
HELPER_FAKE=r'''#!/usr/bin/env python3
import json,os
from pathlib import Path
r=Path(os.environ['DEPLOY_V2_FIXTURE_ROOT']);f=json.loads((r/'state/fail.json').read_text())
with (r/'state/calls.jsonl').open('a') as h:h.write(json.dumps({'surface':'helper'})+'\n')
if f.get('helper'):raise SystemExit(7)
print(json.dumps({'result':'PASS',**json.loads((r/'state/supervision.json').read_text())}))
'''

def pm_env(cwd,entry,private=None):
    private=private or {}
    value={"status":"online","pm_cwd":cwd,"pm_exec_path":entry,"exec_interpreter":"/usr/bin/node","args":[],"node_args":[],"instances":1,"watch":False,"namespace":"default","exec_mode":"fork_mode","autorestart":True,"stop_exit_codes":[],"restart_time":0,"unstable_restarts":0,"pm_out_log_path":"/logs/shared.out","pm_err_log_path":"/logs/shared.err","pm_log_path":"/logs/shared.log","merge_logs":True,"log_date_format":"YYYY","time":False,"env":private}
    value.update({k:v for k,v in private.items() if k in ("RE7_FRONT_CONTROL","RE7_FRONT_RUN")}); return value
def initial_app(name,pid,cwd,entry,private=None): return {"name":name,"pid":pid,"startTicks":pid*10,"pm2_env":pm_env(cwd,entry,private)}

def make_surface(base):
    s=base/"surface";(s/"bin").mkdir(parents=True);(s/"state").mkdir();put(s/"bin/pm2",PM2_FAKE.encode(),0o700);put(s/"bin/health",HEALTH_FAKE.encode(),0o700);put(s/"bin/supervision-helper",HELPER_FAKE.encode(),0o700);put(s/"state/fail.json",{});put(s/"state/counter",b"2000");put(s/"state/calls.jsonl",b"")
    p={"api_old":"/srv/api-old","front_old":"/srv/front-old","worker":"/srv/worker","api_new":"/release/api","front_new":"/release/front","control_old":"/private/front-old-control.json","control_new":"/private/front-new-control.json","helper":"/usr/local/libexec/re7/frontend-supervision-helper.py"}
    for path,raw in {"/srv/api-old/index.js":b"api-old","/srv/front-old/launcher.js":b"front-old","/srv/worker/worker.js":b"worker","/release/api/index.js":b"api-new","/release/front/launcher.js":b"front-new",p["helper"]:b"helper"}.items():put(mapped(s,path),raw)
    put(mapped(s,"/srv/front-old/.next/BUILD_ID"),b"OLD\n");put(mapped(s,"/release/front/.next/BUILD_ID"),b"NEW\n")
    old={"nonce":"old-run","release":p["front_old"],"entry":"/srv/front-old/launcher.js","entrySha256":digest(mapped(s,"/srv/front-old/launcher.js")),"buildId":"OLD","journal":"/private/old.journal"};new={"nonce":"new-run","release":p["front_new"],"entry":"/release/front/launcher.js","entrySha256":digest(mapped(s,"/release/front/launcher.js")),"buildId":"NEW","journal":"/private/new.journal"};put(mapped(s,p["control_old"]),old);put(mapped(s,p["control_new"]),new)
    api_def={"apps":[{"name":"fixture-api","cwd":p["api_new"],"script":"/release/api/index.js","interpreter":"/usr/bin/node","out_file":"/logs/shared.out","error_file":"/logs/shared.err","log_file":"/logs/shared.log","merge_logs":True,"log_date_format":"YYYY","env":{"CANDIDATE_ONLY":"yes"}}]};front_def={"apps":[{"name":"fixture-front","cwd":p["front_new"],"script":"/release/front/launcher.js","interpreter":"/usr/bin/node","out_file":"/logs/shared.out","error_file":"/logs/shared.err","log_file":"/logs/shared.log","merge_logs":True,"log_date_format":"YYYY","env":{"RE7_FRONT_CONTROL":p["control_new"],"RE7_FRONT_RUN":"new-run"}}]};put(mapped(s,"/private/api-candidate.json"),api_def);put(mapped(s,"/private/front-candidate.json"),front_def)
    apps=[initial_app("fixture-api",1001,p["api_old"],"/srv/api-old/index.js",{"API_PRIVATE_REQUIRED":PRIVATE_SECRET}),initial_app("fixture-front",1002,p["front_old"],"/srv/front-old/launcher.js",{"RE7_FRONT_CONTROL":p["control_old"],"RE7_FRONT_RUN":"old-run"}),initial_app("fixture-worker",1003,p["worker"],"/srv/worker/worker.js",{"WORKER_PRIVATE":"preserved"})];put(s/"state/pm2.json",apps);put(mapped(s,"/home/deploy/.pm2/dump.pm2"),apps)
    for app in apps:
        proc=s/"proc"/str(app["pid"]);(proc/"fd").mkdir(parents=True);put(proc/"stat",(str(app["pid"])+" (node) "+" ".join(["S"]+["0"]*18+[str(app["startTicks"])])+"\n").encode());(proc/"cwd").symlink_to(app["pm2_env"]["pm_cwd"]);(proc/"exe").symlink_to("/usr/bin/node")
        if app["name"]=="fixture-api":(proc/"fd/9").symlink_to("socket:[9001]")
    header="  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n";put(mapped(s,"/proc/net/tcp"),(header+"   0: 00000000:0BB9 00000000:0000 0A 0:0 0:0 0 0 0 9001\n").encode());put(mapped(s,"/proc/net/tcp6"),header.encode())
    manifest={"schemaVersion":1,"releaseId":"deploy-v2-fixture","deploymentClass":"NORMAL_RELEASE","candidateCommit":"f"*40,"deploymentOrder":["api","frontend"],"changeBoundary":{"workerChanged":False},"runtimeStatePolicy":{"embeddedRuntimeStateForbidden":True},"promotionAuthorized":False,"artifacts":{}};mp=base/"manifest.json";put(mp,manifest)
    sup={"helper":p["helper"],"helperSha256":digest(mapped(s,p["helper"])),"policySha256":"a"*64};put(s/"state/supervision.json",sup)
    binding={"schemaVersion":2,"releaseId":"deploy-v2-fixture","processes":{"api":"fixture-api","frontend":"fixture-front","worker":"fixture-worker"},"staging":{"root":"/release"},"api":{"candidateCwd":p["api_new"],"candidateDefinition":"/private/api-candidate.json","candidateDefinitionSha256":digest(mapped(s,"/private/api-candidate.json")),"entrypoint":"/release/api/index.js","entrypointSha256":digest(mapped(s,"/release/api/index.js")),"port":3001,"healthUrls":["http://local/api","https://public/api"]},"frontend":{"candidateCwd":p["front_new"],"candidateDefinition":"/private/front-candidate.json","candidateDefinitionSha256":digest(mapped(s,"/private/front-candidate.json")),"entrypoint":"/release/front/launcher.js","entrypointSha256":digest(mapped(s,"/release/front/launcher.js")),"control":p["control_new"],"controlSha256":digest(mapped(s,p["control_new"])),"buildId":"NEW","healthUrls":["http://local/login","https://public/crm","https://public/assets"]},"worker":{"cwd":p["worker"],"entrypoint":"/srv/worker/worker.js","entrypointSha256":digest(mapped(s,"/srv/worker/worker.js"))},"supervision":sup,"acceptance":{"mode":"GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL","forbidPost":True}};bp=base/"binding.json";put(bp,binding)
    return s,mp,bp

def auth(base,phase,manifest,binding,extra=None):
    value={"schemaVersion":2,"decision":"AUTHORIZED","phase":phase,"releaseId":"deploy-v2-fixture","manifestSha256":digest(manifest),"executorSha256":digest(EXECUTOR),"adapterSha256":digest(ADAPTER),"bindingSha256":digest(binding),"notAfterUtc":"2099-01-01T00:00:00Z"};value.update(extra or {});path=base/(phase.lower()+"-authorization.json");put(path,value);return path
def promote(base,failure=None):
    surface,manifest,binding=make_surface(base)
    if failure:put(surface/"state/fail.json",failure)
    authorization=auth(base,"PROMOTE",manifest,binding);work=base/"execution";cmd=[str(EXECUTOR),"--manifest",str(manifest),"--promote","--adapter",str(ADAPTER),"--adapter-sha256",digest(ADAPTER),"--binding",str(binding),"--binding-sha256",digest(binding),"--authorization",str(authorization),"--authorization-sha256",digest(authorization),"--work-dir",str(work)];env={**os.environ,"DEPLOY_V2_FIXTURE_ROOT":str(surface)};result=subprocess.run(cmd,text=True,capture_output=True,check=False,env=env);return result,work,surface,manifest,binding,env
def acceptance_for(base,work,manifest,binding,mutate=None):
    state=json.loads((work/"execution-state.json").read_text());candidate=state["candidate"]
    value={"schemaVersion":2,"releaseId":"deploy-v2-fixture","decision":"ACCEPTED","mode":"OWNER_MANUAL_AUTHENTICATED","executionId":state["executionId"],"executionStateSha256":digest(work/"execution-state.json"),"manifestSha256":digest(manifest),"executorSha256":digest(EXECUTOR),"adapterSha256":digest(ADAPTER),"bindingSha256":digest(binding),"api":candidate["api"],"frontend":{k:candidate["frontend"][k] for k in ("pid","startTicks","buildId")},"csvPostRequests":0,"imports":0,"retryRequests":0};(mutate or (lambda x:None))(value);path=base/"acceptance.json";put(path,value);return path,state
def resume(base,work,surface,manifest,binding,env,mutate=None,failure=None):
    acceptance,state=acceptance_for(base,work,manifest,binding,mutate)
    if failure:put(surface/"state/fail.json",failure)
    authorization=auth(base,"RESUME",manifest,binding,{"executionId":state["executionId"],"executionStateSha256":digest(work/"execution-state.json"),"acceptanceSha256":digest(acceptance)});cmd=[str(EXECUTOR),"--manifest",str(manifest),"--resume","--acceptance",str(acceptance),"--acceptance-sha256",digest(acceptance),"--authorization",str(authorization),"--authorization-sha256",digest(authorization),"--work-dir",str(work)];return subprocess.run(cmd,text=True,capture_output=True,check=False,env=env)
def pm_calls(surface):return [json.loads(x) for x in (surface/"state/calls.jsonl").read_text().splitlines() if json.loads(x).get("surface")=="pm2"]

for path in (EXECUTOR,ADAPTER):assert path.is_file()
with tempfile.TemporaryDirectory(prefix="deploy-v2-two-phase-") as tmp:
    root=Path(tmp)
    # A successful promote stops before acceptance and before save.
    first,work,surface,manifest,binding,env=promote(root/"success");assert first.returncode==0,(first.stdout,first.stderr);assert first.stdout.strip()=="DEPLOY_V2_AWAITING_ACCEPTANCE";assert ["save"] not in [x["call"] for x in pm_calls(surface)]
    # Acceptance is generated after selection and is bound to both candidate PIDs/ticks.
    second=resume(root/"success",work,surface,manifest,binding,env);assert second.returncode==0,(second.stdout,second.stderr)
    calls=[x["call"] for x in pm_calls(surface)];assert calls.count(["save"])==1
    assert json.loads((work/"result.json").read_text())["status"]=="DEPLOYED_VERIFIED"
    # Frontend live control and run are allowlisted and checked; no generic environment walk.
    state=json.loads((surface/"state/pm2.json").read_text());front=next(x for x in state if x["name"]=="fixture-front");assert front["pm2_env"]["RE7_FRONT_CONTROL"]=="/private/front-new-control.json" and front["pm2_env"]["RE7_FRONT_RUN"]=="new-run"
    # Full-fidelity rollback: API private value, frontend control/run, logging and policies survive.
    denied,run,s,mp,bp,e=promote(root/"rollback");assert denied.returncode==0
    drift=json.loads((s/"state/pm2.json").read_text());next(x for x in drift if x["name"]=="fixture-front")["pm2_env"]["RE7_FRONT_RUN"]="drifted";put(s/"state/pm2.json",drift)
    bad=resume(root/"rollback",run,s,mp,bp,e);assert bad.returncode==1,(bad.stdout,bad.stderr)
    by={x["name"]:x for x in json.loads((s/"state/pm2.json").read_text())};assert by["fixture-api"]["pm2_env"]["env"]["API_PRIVATE_REQUIRED"]==PRIVATE_SECRET;assert by["fixture-front"]["pm2_env"]["RE7_FRONT_CONTROL"]=="/private/front-old-control.json" and by["fixture-front"]["pm2_env"]["RE7_FRONT_RUN"]=="old-run"
    for item in (by["fixture-api"],by["fixture-front"]):
        pm=item["pm2_env"];assert (pm["pm_out_log_path"],pm["pm_err_log_path"],pm["pm_log_path"],pm["merge_logs"],pm["log_date_format"])==("/logs/shared.out","/logs/shared.err","/logs/shared.log",True,"YYYY")
    public=(bad.stdout+bad.stderr+(run/"events.jsonl").read_text()+(run/"result.json").read_text());assert PRIVATE_SECRET not in public
    assert PRIVATE_SECRET not in "".join(path.read_text() for path in (ROOT/"docs/saas").glob("*.md"))
    # A post-save failure restores the old dump before runtime rollback.
    promoted,run,s,mp,bp,e=promote(root/"post-save");assert promoted.returncode==0;old_dump=digest(mapped(s,"/home/deploy/.pm2/dump.pm2"));failed=resume(root/"post-save",run,s,mp,bp,e,failure={"postSaveFailure":True});assert failed.returncode==1,(failed.stdout,failed.stderr);assert digest(mapped(s,"/home/deploy/.pm2/dump.pm2"))==old_dump;assert json.loads((run/"save-transaction.json").read_text())["state"]=="ABORTED_DUMP_RESTORED"
    restored={x["name"]:x for x in json.loads((s/"state/pm2.json").read_text())};assert restored["fixture-api"]["pm2_env"]["pm_cwd"]=="/srv/api-old" and restored["fixture-front"]["pm2_env"]["pm_cwd"]=="/srv/front-old";assert [x["call"] for x in pm_calls(s)].count(["save"])==1
    # Acceptance referring to a different candidate is denied; no save occurs.
    promoted,run,s,mp,bp,e=promote(root/"stale-acceptance");assert promoted.returncode==0
    stale=resume(root/"stale-acceptance",run,s,mp,bp,e,mutate=lambda x:x["api"].update(pid=999999));assert stale.returncode==1;assert ["save"] not in [x["call"] for x in pm_calls(s)]
    restored={x["name"]:x for x in json.loads((s/"state/pm2.json").read_text())};assert restored["fixture-api"]["pm2_env"]["pm_cwd"]=="/srv/api-old" and restored["fixture-front"]["pm2_env"]["pm_cwd"]=="/srv/front-old"
    # Binding cannot transport commands.
    badroot=root/"bad-binding";surface,mp,bp=make_surface(badroot);value=json.loads(bp.read_text());value["actions"]={"capture":{"argv":["pm2"]}};put(bp,value);work=badroot/"adapter-work";work.mkdir();result=subprocess.run([str(ADAPTER),"capture","--manifest",str(mp),"--binding",str(bp),"--binding-sha256",digest(bp),"--work-dir",str(work),"--scope","promote"],text=True,capture_output=True,env={**os.environ,"DEPLOY_V2_FIXTURE_ROOT":str(surface)});assert result.returncode==1 and "BINDING_EXECUTABLE_CONTENT" in result.stdout
print("DEPLOY_V2_POST_SELECTION_ACCEPTANCE_READY")
print("FULL_FIDELITY_ROLLBACK_VERIFIED")
print("ACTIVE_FRONTEND_CONTROL_VERIFIED")
print("SAVE_FAILURE_ATOMICITY_VERIFIED")
