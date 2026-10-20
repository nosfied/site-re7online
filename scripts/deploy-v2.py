#!/usr/bin/env python3
"""Two-phase Deploy V2 orchestration core.

Promotion selects and verifies candidates, then stops. A later authenticated
acceptance bound to the observed candidate identities is required to resume and
save. Runtime commands remain inside the stable adapter.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, secrets, stat, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

SHA256 = re.compile(r"^[0-9a-f]{64}$")
PROMOTE_ACTIONS = ("capture", "select-api", "verify-api", "select-frontend",
                   "verify-frontend", "enable-supervision", "verify-worker", "checkpoint")
RESUME_ACTIONS = ("verify-api", "verify-frontend", "verify-supervision", "verify-worker", "save-once")

class DeployDenied(RuntimeError): pass
def canonical_bytes(v): return (json.dumps(v,sort_keys=True,separators=(",",":"))+"\n").encode()
def sha256_bytes(v): return hashlib.sha256(v).hexdigest()
def sha256_file(path):
    digest=hashlib.sha256()
    with Path(path).open("rb") as h:
        for chunk in iter(lambda:h.read(1024*1024),b""): digest.update(chunk)
    return digest.hexdigest()

def read_bytes_no_follow(path):
    path=Path(path); fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
    try:
        a=os.fstat(fd)
        if not stat.S_ISREG(a.st_mode): raise DeployDenied(f"not_regular:{path.name}")
        chunks=[]
        while True:
            chunk=os.read(fd,1024*1024)
            if not chunk: break
            chunks.append(chunk)
        b=os.fstat(fd)
        if (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns)!=(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns): raise DeployDenied(f"changed_while_reading:{path.name}")
        return b"".join(chunks)
    finally: os.close(fd)
def read_json_no_follow(path):
    raw=read_bytes_no_follow(path); value=json.loads(raw)
    if not isinstance(value,dict): raise DeployDenied(f"not_object:{Path(path).name}")
    return value,raw
def write_exclusive(path,raw,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    try: os.write(fd,raw); os.fsync(fd)
    finally: os.close(fd)
def atomic_write(path,raw,mode=0o600):
    path=Path(path); tmp=path.with_name(path.name+f".tmp.{os.getpid()}"); write_exclusive(tmp,raw,mode); os.replace(tmp,path); os.chmod(path,mode)
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def validate_manifest(v):
    if v.get("schemaVersion")!=1: raise DeployDenied("manifest_schema")
    if v.get("deploymentClass")!="NORMAL_RELEASE" or v.get("deploymentOrder")!=["api","frontend"]: raise DeployDenied("manifest_class_or_order")
    if not v.get("releaseId") or not v.get("candidateCommit"): raise DeployDenied("release_identity")
    if not v.get("changeBoundary") or any(x is not False for x in v["changeBoundary"].values()): raise DeployDenied("break_glass_required")
    if v.get("runtimeStatePolicy",{}).get("embeddedRuntimeStateForbidden") is not True: raise DeployDenied("runtime_state_policy")
    if v.get("promotionAuthorized") is not False: raise DeployDenied("manifest_must_not_authorize")
    for artifact in v.get("artifacts",{}).values():
        for key,value in artifact.items():
            if key.endswith("Sha256") and not SHA256.fullmatch(str(value)): raise DeployDenied(f"artifact_hash:{key}")
def walk_keys(v):
    if isinstance(v,dict):
        for key,item in v.items(): yield key; yield from walk_keys(item)
    elif isinstance(v,list):
        for item in v: yield from walk_keys(item)
def walk_scalars(v):
    if isinstance(v,dict):
        for item in v.values(): yield from walk_scalars(item)
    elif isinstance(v,list):
        for item in v: yield from walk_scalars(item)
    else: yield v
def validate_binding(v,manifest):
    if v.get("schemaVersion")!=2 or v.get("releaseId")!=manifest["releaseId"]: raise DeployDenied("binding_identity")
    if any(not isinstance(v.get(k),dict) for k in ("processes","staging","api","frontend","worker","supervision","acceptance")): raise DeployDenied("binding_sections")
    if v["acceptance"].get("mode")!="GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL" or v["acceptance"].get("forbidPost") is not True: raise DeployDenied("binding_acceptance")
    if any(x=="NOT_AVAILABLE" for x in walk_scalars(v)): raise DeployDenied("binding_not_available")
    if any(k in {"actions","argv","commands","destinations","executableSha256"} for k in walk_keys(v)): raise DeployDenied("binding_executable_content")
def parse_utc(v):
    parsed=datetime.fromisoformat(v.replace("Z","+00:00"))
    if parsed.tzinfo is None: raise DeployDenied("authorization_timezone")
    return parsed.astimezone(timezone.utc)

def validate_authorization(v,phase,manifest,hashes,extra=None):
    if v.get("schemaVersion")!=2 or v.get("decision")!="AUTHORIZED" or v.get("phase")!=phase: raise DeployDenied("execution_not_authorized")
    if v.get("releaseId")!=manifest["releaseId"]: raise DeployDenied("authorization_release")
    mapping={"manifestSha256":"manifest","executorSha256":"executor","adapterSha256":"adapter","bindingSha256":"binding"}
    for field,key in mapping.items():
        if v.get(field)!=hashes[key]: raise DeployDenied("authorization_"+key)
    for field,value in (extra or {}).items():
        if v.get(field)!=value: raise DeployDenied("authorization_"+field)
    if parse_utc(str(v.get("notAfterUtc","")))<=datetime.now(timezone.utc): raise DeployDenied("authorization_expired")

class Journal:
    def __init__(self,root,create):
        self.root=Path(root); self.path=self.root/"events.jsonl"
        if create: self.root.mkdir(mode=0o700,parents=True,exist_ok=False)
        elif not self.root.is_dir(): raise DeployDenied("execution_root_missing")
        self.sequence=sum(1 for _ in self.path.open()) if self.path.exists() else 0
    def write(self,event,**fields):
        self.sequence+=1; record={"sequence":self.sequence,"event":event,**fields}; fd=os.open(self.path,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
        try: os.write(fd,canonical_bytes(record)); os.fsync(fd)
        finally: os.close(fd)
    def result(self,name,value): write_exclusive(self.root/name,canonical_bytes(value),0o600)

def adapter_env():
    result={k:os.environ[k] for k in ("PATH","HOME","PM2_HOME","USER","LOGNAME","LANG","LC_ALL","TZ","DEPLOY_V2_FIXTURE_ROOT") if k in os.environ}; result.setdefault("PATH","/usr/local/bin:/usr/bin:/bin"); return result
def call_adapter(adapter,action,manifest,binding,binding_sha,root,journal,timeout,scope):
    journal.write("ACTION_STARTED",action=action,scope=scope)
    result=subprocess.run([str(adapter),action,"--manifest",str(manifest),"--binding",str(binding),"--binding-sha256",binding_sha,"--work-dir",str(root),"--scope",scope],check=False,capture_output=True,text=True,timeout=timeout,env=adapter_env())
    try: payload=json.loads(result.stdout.strip()) if result.stdout.strip() else {}
    except json.JSONDecodeError as exc: raise DeployDenied(f"adapter_invalid_json:{action}") from exc
    journal.write("ACTION_FINISHED",action=action,scope=scope,exitCode=result.returncode,result=payload.get("result"),reason=payload.get("reason"))
    if result.returncode!=0 or payload.get("result")!="PASS": raise DeployDenied(f"adapter_denied:{action}:{payload.get('reason','unknown')}")

def rollback(adapter,manifest,binding,binding_sha,root,journal,timeout,scope):
    try:
        call_adapter(adapter,"rollback-all",manifest,binding,binding_sha,root,journal,timeout,scope); return None
    except Exception as error:
        journal.write("ROLLBACK_CRITICAL",reason=str(error)); return str(error)

def copy_authenticated(path,raw,expected,mode):
    write_exclusive(path,raw,mode)
    if sha256_file(path)!=expected: raise DeployDenied("authenticated_copy_sha")

def common_inputs(args,manifest,manifest_raw,manifest_sha,executor_sha):
    adapter=args.adapter.resolve(); adapter_raw=read_bytes_no_follow(adapter); adapter_sha=sha256_bytes(adapter_raw)
    if not adapter.is_file() or not os.access(adapter,os.X_OK) or args.adapter_sha256!=adapter_sha: raise DeployDenied("adapter_identity")
    binding,binding_raw=read_json_no_follow(args.binding.resolve()); binding_sha=sha256_bytes(binding_raw)
    if args.binding_sha256!=binding_sha: raise DeployDenied("binding_sha_mismatch")
    validate_binding(binding,manifest)
    return adapter_raw,binding_raw,{"manifest":manifest_sha,"executor":executor_sha,"adapter":adapter_sha,"binding":binding_sha}

def promote(args,manifest,manifest_raw,manifest_sha,executor_sha):
    adapter_raw,binding_raw,hashes=common_inputs(args,manifest,manifest_raw,manifest_sha,executor_sha)
    authorization,auth_raw=read_json_no_follow(args.authorization.resolve())
    if args.authorization_sha256!=sha256_bytes(auth_raw): raise DeployDenied("authorization_sha_mismatch")
    validate_authorization(authorization,"PROMOTE",manifest,hashes)
    root=args.work_dir.resolve(); journal=Journal(root,True)
    adapter=root/"adapter"; binding=root/"binding.json"; copied_manifest=root/"manifest.json"
    copy_authenticated(adapter,adapter_raw,hashes["adapter"],0o700); copy_authenticated(binding,binding_raw,hashes["binding"],0o600); copy_authenticated(copied_manifest,manifest_raw,hashes["manifest"],0o600)
    journal.write("PROMOTION_AUTHORIZED_COMMITTED",releaseId=manifest["releaseId"],authorizationSha256=args.authorization_sha256,**{k+"Sha256":v for k,v in hashes.items()})
    selected=False; completed=[]
    try:
        for action in PROMOTE_ACTIONS:
            selected=selected or action=="select-api"; call_adapter(adapter,action,copied_manifest,binding,hashes["binding"],root,journal,args.timeout,"promote"); completed.append(action)
        checkpoint,checkpoint_raw=read_json_no_follow(root/"candidate-checkpoint.json")
        execution_id=secrets.token_hex(32)
        state={"schemaVersion":2,"status":"AWAITING_ACCEPTANCE","releaseId":manifest["releaseId"],"executionId":execution_id,"hashes":hashes,"candidate":checkpoint,"checkpointSha256":sha256_bytes(checkpoint_raw),"completedActions":completed}
        atomic_write(root/"execution-state.json",canonical_bytes(state)); state_sha=sha256_file(root/"execution-state.json")
        journal.write("AWAITING_ACCEPTANCE",executionId=execution_id,executionStateSha256=state_sha,api=checkpoint["api"],frontend={k:checkpoint["frontend"][k] for k in ("pid","startTicks","buildId")})
        journal.result("promotion-result.json",{"status":"AWAITING_ACCEPTANCE","executionId":execution_id,"executionStateSha256":state_sha,"actions":completed})
        print("DEPLOY_V2_AWAITING_ACCEPTANCE"); return 0
    except Exception as error:
        journal.write("PROMOTION_DENIED",reason=str(error)); rollback_error=rollback(adapter,copied_manifest,binding,hashes["binding"],root,journal,args.timeout,"rollback-promote") if selected else None
        journal.result("promotion-result.json",{"status":"ROLLBACK_CRITICAL" if rollback_error else "ROLLED_BACK","reason":str(error),"rollbackError":rollback_error,"completedActions":completed})
        print("DEPLOY_V2_PROMOTION_DENIED: "+str(error),file=sys.stderr); return 2 if rollback_error else 1

def validate_acceptance(a,state,state_sha,hashes,manifest):
    required={"schemaVersion","releaseId","decision","mode","executionId","executionStateSha256","manifestSha256","executorSha256","adapterSha256","bindingSha256","api","frontend","csvPostRequests","imports","retryRequests"}
    if set(a)!=required or a.get("schemaVersion")!=2 or a.get("decision")!="ACCEPTED": raise DeployDenied("acceptance_schema_or_decision")
    if a.get("releaseId")!=manifest["releaseId"] or a.get("executionId")!=state["executionId"] or a.get("executionStateSha256")!=state_sha: raise DeployDenied("acceptance_execution")
    if a.get("mode") not in {"AUTOMATED_GET_ONLY","OWNER_MANUAL_AUTHENTICATED"} or any(a.get(k)!=0 for k in ("csvPostRequests","imports","retryRequests")): raise DeployDenied("acceptance_effects")
    for field,key in (("manifestSha256","manifest"),("executorSha256","executor"),("adapterSha256","adapter"),("bindingSha256","binding")):
        if a.get(field)!=hashes[key]: raise DeployDenied("acceptance_"+key)
    candidate=state["candidate"]
    if a.get("api")!=candidate["api"] or a.get("frontend")!={k:candidate["frontend"][k] for k in ("pid","startTicks","buildId")}: raise DeployDenied("acceptance_candidate_identity")

def resume(args,manifest,manifest_raw,manifest_sha,executor_sha):
    root=args.work_dir.resolve(); journal=Journal(root,False); state,state_raw=read_json_no_follow(root/"execution-state.json"); state_sha=sha256_bytes(state_raw)
    if state.get("status")!="AWAITING_ACCEPTANCE" or (root/"result.json").exists(): raise DeployDenied("execution_not_pending")
    copied_manifest,adapter,binding=root/"manifest.json",root/"adapter",root/"binding.json"
    hashes=state.get("hashes",{})
    if hashes!={"manifest":sha256_file(copied_manifest),"executor":executor_sha,"adapter":sha256_file(adapter),"binding":sha256_file(binding)} or manifest_sha!=hashes["manifest"] or sha256_bytes(manifest_raw)!=hashes["manifest"]: raise DeployDenied("resume_artifact_drift")
    acceptance,acceptance_raw=read_json_no_follow(args.acceptance.resolve()); acceptance_sha=sha256_bytes(acceptance_raw)
    if args.acceptance_sha256!=acceptance_sha: raise DeployDenied("acceptance_sha_mismatch")
    authorization,auth_raw=read_json_no_follow(args.authorization.resolve())
    if args.authorization_sha256!=sha256_bytes(auth_raw): raise DeployDenied("authorization_sha_mismatch")
    validate_authorization(authorization,"RESUME",manifest,hashes,{"executionId":state["executionId"],"executionStateSha256":state_sha,"acceptanceSha256":acceptance_sha})
    completed=[]; save_committed=False
    try:
        # From this point the resume itself is authorized. Any stale candidate
        # identity, including one embedded in the acceptance, returns the live
        # processes through the already captured rollback definitions.
        validate_acceptance(acceptance,state,state_sha,hashes,manifest)
        copy_authenticated(root/"acceptance.json",acceptance_raw,acceptance_sha,0o600)
        journal.write("RESUME_AUTHORIZED_COMMITTED",executionId=state["executionId"],executionStateSha256=state_sha,acceptanceSha256=acceptance_sha,authorizationSha256=args.authorization_sha256)
        for action in RESUME_ACTIONS:
            call_adapter(adapter,action,copied_manifest,binding,hashes["binding"],root,journal,args.timeout,"resume"); completed.append(action)
            save_committed=save_committed or action=="save-once"
        saved=read_json_no_follow(root/"saved-dump.json")[0]
        atomic_write(root/"execution-state.json",canonical_bytes({**state,"status":"DEPLOYED_VERIFIED","savedDump":saved}))
        journal.write("DEPLOYMENT_ACCEPTED",savedDumpSha256=saved["sha256"])
        journal.result("result.json",{"status":"DEPLOYED_VERIFIED","resumeActions":completed,"pm2SavedExactlyOnce":True,"savedDump":saved})
        print("DEPLOY_V2_EXECUTION_PASS"); return 0
    except Exception as error:
        # If save committed, runtime and dump both describe the candidate. Never
        # roll runtime back merely because a later local evidence write failed.
        save_committed=save_committed or (root/"adapter-actions/pm2-save.completed").exists()
        journal.write("RESUME_DENIED",reason=str(error),saveCommitted=save_committed)
        rollback_error=None
        if not save_committed: rollback_error=rollback(adapter,copied_manifest,binding,hashes["binding"],root,journal,args.timeout,"rollback-resume")
        status="SAVE_COMMITTED_REPORTING_FAILURE" if save_committed else ("ROLLBACK_CRITICAL" if rollback_error else "ROLLED_BACK")
        journal.result("result.json",{"status":status,"reason":str(error),"completedActions":completed,"rollbackError":rollback_error,"pm2Saved":save_committed})
        print("DEPLOY_V2_"+status+": "+str(error),file=sys.stderr); return 2 if rollback_error or save_committed else 1

def main():
    p=argparse.ArgumentParser(); p.add_argument("--manifest",type=Path,required=True); modes=p.add_mutually_exclusive_group(); modes.add_argument("--promote",action="store_true"); modes.add_argument("--resume",action="store_true")
    p.add_argument("--adapter",type=Path); p.add_argument("--adapter-sha256"); p.add_argument("--binding",type=Path); p.add_argument("--binding-sha256"); p.add_argument("--acceptance",type=Path); p.add_argument("--acceptance-sha256"); p.add_argument("--authorization",type=Path); p.add_argument("--authorization-sha256"); p.add_argument("--work-dir",type=Path); p.add_argument("--timeout",type=int,default=30); args=p.parse_args()
    try:
        manifest,raw=read_json_no_follow(args.manifest.resolve()); validate_manifest(manifest); msha=sha256_bytes(raw); esha=sha256_file(Path(__file__).resolve())
        if not args.promote and not args.resume:
            print(json.dumps({"result":"DEPLOY_V2_PLAN_OK","releaseId":manifest["releaseId"],"manifestSha256":msha},sort_keys=True)); return 0
        if not all((args.authorization,args.authorization_sha256,args.work_dir)): raise DeployDenied("execution_arguments")
        if args.promote:
            if not all((args.adapter,args.adapter_sha256,args.binding,args.binding_sha256)) or args.acceptance or args.acceptance_sha256: raise DeployDenied("promote_arguments")
            return promote(args,manifest,raw,msha,esha)
        if not all((args.acceptance,args.acceptance_sha256)): raise DeployDenied("resume_arguments")
        return resume(args,manifest,raw,msha,esha)
    except (DeployDenied,FileExistsError,json.JSONDecodeError,OSError) as error:
        print("DEPLOY_V2_DENIED: "+str(error),file=sys.stderr); return 64
if __name__=="__main__": raise SystemExit(main())
