#!/usr/bin/env python3
"""Stable PM2 adapter for Deploy V2; release bindings contain data only."""
from __future__ import annotations
import argparse, hashlib, json, os, re, stat, subprocess, time, urllib.request
from pathlib import Path

SHA256 = re.compile(r"^[0-9a-f]{64}$")
ACTIONS = {"capture", "select-api", "verify-api", "select-frontend", "verify-frontend",
           "enable-supervision", "verify-supervision", "verify-worker", "checkpoint",
           "rollback-all", "save-once"}
PM2 = Path("/home/deploy/.npm-global/bin/pm2")
PM2_HOME = Path("/home/deploy/.pm2")
NODE = Path("/usr/bin/node")
# Closed allowlist: never enumerate pm2_env.
PM_FIELDS = ("status", "pm_cwd", "pm_exec_path", "exec_interpreter", "args", "node_args",
             "instances", "watch", "namespace", "exec_mode", "autorestart", "stop_exit_codes",
             "restart_time", "unstable_restarts", "pm_out_log_path", "pm_err_log_path",
             "pm_log_path", "merge_logs", "log_date_format", "time", "max_memory_restart",
             "kill_retry_time", "listen_timeout", "restart_delay", "exp_backoff_restart_delay",
             "min_uptime", "max_restarts", "treekill", "wait_ready", "RE7_FRONT_CONTROL",
             "RE7_FRONT_RUN")
POLICY_FIELDS = ("args", "node_args", "instances", "watch", "namespace",
                 "exec_mode", "autorestart", "stop_exit_codes", "merge_logs", "log_date_format",
                 "time", "max_memory_restart", "kill_retry_time", "listen_timeout",
                 "restart_delay", "exp_backoff_restart_delay", "min_uptime", "max_restarts",
                 "treekill", "wait_ready", "kill_timeout", "cron_restart",
                 "shutdown_with_message", "disable_logs", "combine_logs", "instance_var",
                 "append_env_to_name", "increment_var", "source_map_support", "vizion",
                 "automation", "windowsHide", "uid", "gid")

class Denied(RuntimeError): pass
def canonical(v): return (json.dumps(v, sort_keys=True, separators=(",", ":")) + "\n").encode()
def digest(raw): return hashlib.sha256(raw).hexdigest()

def read_bytes(path, limit=64 * 1024 * 1024):
    path = Path(path); fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        a = os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or a.st_size > limit: raise Denied("FILE_TYPE_OR_SIZE")
        chunks, total = [], 0
        while True:
            chunk = os.read(fd, min(1024 * 1024, limit + 1 - total))
            if not chunk: break
            chunks.append(chunk); total += len(chunk)
            if total > limit: raise Denied("FILE_SIZE")
        b = os.fstat(fd)
        if (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) != (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns):
            raise Denied("FILE_CHANGED")
        return b"".join(chunks)
    finally: os.close(fd)

def read_json(path):
    raw = read_bytes(path); value = json.loads(raw)
    if not isinstance(value, dict): raise Denied("JSON_OBJECT")
    return value, raw

def read_dump(path):
    """Read one stable regular dump and return its measured mode."""
    path=Path(path); fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode): raise Denied("DUMP_NOT_REGULAR")
        mode=stat.S_IMODE(before.st_mode)
        if mode!=0o600: raise Denied("DUMP_MODE")
        chunks=[]
        while True:
            chunk=os.read(fd,1024*1024)
            if not chunk: break
            chunks.append(chunk)
        after=os.fstat(fd)
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_mode)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_mode): raise Denied("DUMP_CHANGED")
        return b"".join(chunks),mode
    finally: os.close(fd)

def atomic_write(path, raw, mode=0o600, exclusive=False):
    path = Path(path); path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if exclusive and (path.exists() or path.is_symlink()): raise Denied("DESTINATION_EXISTS")
    tmp = path.with_name(path.name + f".tmp.{os.getpid()}.{time.time_ns()}")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try: os.write(fd, raw); os.fsync(fd)
    finally: os.close(fd)
    os.replace(tmp, path); os.chmod(path, mode)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def walk_keys(v):
    if isinstance(v, dict):
        for key, item in v.items(): yield key; yield from walk_keys(item)
    elif isinstance(v, list):
        for item in v: yield from walk_keys(item)

def validate_binding(v, manifest):
    if v.get("schemaVersion") != 2 or v.get("releaseId") != manifest.get("releaseId"): raise Denied("BINDING_IDENTITY")
    keys = set(walk_keys(v))
    if keys & {"actions", "argv", "destinations", "commands", "executableSha256"}: raise Denied("BINDING_EXECUTABLE_CONTENT")
    if keys & {"token", "cookie", "tenantId", "uuid", "credential", "credentialReference"}: raise Denied("BINDING_SENSITIVE_REFERENCE")
    if set(v) != {"schemaVersion", "releaseId", "processes", "staging", "api", "frontend", "worker", "supervision", "acceptance"}: raise Denied("BINDING_SCHEMA")
    if set(v["processes"]) != {"api", "frontend", "worker"} or len(set(v["processes"].values())) != 3: raise Denied("PROCESS_NAMES")
    staging = v["staging"].get("root")
    if not isinstance(staging, str) or not Path(staging).is_absolute(): raise Denied("STAGING_ROOT")
    for component in ("api", "frontend"):
        s = v[component]
        for key in ("candidateCwd", "candidateDefinition", "candidateDefinitionSha256", "entrypoint", "entrypointSha256"):
            if not isinstance(s.get(key), str): raise Denied("CANDIDATE_SCHEMA")
        if not all(Path(s[key]).is_absolute() for key in ("candidateCwd", "candidateDefinition", "entrypoint")): raise Denied("CANDIDATE_PATH")
        if not Path(s["candidateCwd"]).is_relative_to(staging): raise Denied("CANDIDATE_STAGING_SCOPE")
        if not all(SHA256.fullmatch(s[key]) for key in ("candidateDefinitionSha256", "entrypointSha256")): raise Denied("CANDIDATE_SHA")
        if not isinstance(s.get("healthUrls"), list) or not s["healthUrls"]: raise Denied("HEALTH_URLS")
    if v["api"].get("port") != 3001: raise Denied("API_PORT")
    if not isinstance(v["frontend"].get("buildId"), str) or not SHA256.fullmatch(v["frontend"].get("controlSha256", "")): raise Denied("FRONTEND_BINDING")
    worker = v["worker"]
    if not all(isinstance(worker.get(k), str) and Path(worker[k]).is_absolute() for k in ("cwd", "entrypoint")) or not SHA256.fullmatch(worker.get("entrypointSha256", "")): raise Denied("WORKER_BINDING")
    sup = v["supervision"]
    if not isinstance(sup.get("helper"), str) or not Path(sup["helper"]).is_absolute() or not SHA256.fullmatch(sup.get("helperSha256", "")) or not SHA256.fullmatch(sup.get("policySha256", "")): raise Denied("SUPERVISION_BINDING")
    if v["acceptance"] != {"mode": "GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL", "forbidPost": True}: raise Denied("ACCEPTANCE_BINDING")

class Surface:
    def __init__(self, release_id):
        fixture = os.environ.get("DEPLOY_V2_FIXTURE_ROOT")
        if fixture and release_id != "deploy-v2-fixture": raise Denied("FIXTURE_SURFACE_RELEASE")
        self.root = Path(fixture).resolve() if fixture else None
    def path(self, value):
        value = Path(value)
        if not value.is_absolute(): raise Denied("ABSOLUTE_PATH_REQUIRED")
        return self.root / value.relative_to("/") if self.root else value
    def executable(self, prod, fixture): return self.root / "bin" / fixture if self.root else Path(prod)
    def run(self, argv, timeout=30):
        env = {"PATH":"/usr/local/bin:/usr/bin:/bin", "LANG":"C.UTF-8", "LC_ALL":"C.UTF-8"}
        if self.root: env["DEPLOY_V2_FIXTURE_ROOT"] = str(self.root)
        return subprocess.run(argv, check=False, capture_output=True, text=True, timeout=timeout, env=env)
    def pm2(self, *args): return self.run([str(self.executable(PM2, "pm2")), *args])
    def helper(self, helper, *args):
        argv = [str(self.executable(helper, "supervision-helper")), *args] if self.root else ["/usr/bin/sudo", "-n", "/usr/bin/python3", "-I", "-S", str(helper), *args]
        return self.run(argv)
    def health(self, url):
        if self.root:
            result = self.run([str(self.executable("/usr/bin/curl", "health")), url]); return int(result.stdout.strip()) if result.returncode == 0 else 0
        try:
            with urllib.request.urlopen(url, timeout=5) as response: response.read(1024); return response.status
        except OSError: return 0
    def injected(self, name):
        path = self.root / "state/fail.json" if self.root else None
        return bool(json.loads(path.read_text()).get(name)) if path and path.is_file() else False

class Adapter:
    def __init__(self, binding, root, surface, scope):
        self.binding, self.root, self.surface, self.scope = binding, Path(root), surface, scope
        self.capture_path = self.root / "capture.json"; self.actions = self.root / "adapter-actions"
        self.actions.mkdir(mode=0o700, exist_ok=True)
    def record(self, action, result, reason=None):
        atomic_write(self.actions / f"{self.scope}.{action}.json", canonical({"action":action,"scope":self.scope,"result":result,"reason":reason,"atUnixNs":time.time_ns()}), exclusive=True)
    def rows(self):
        result = self.surface.pm2("jlist")
        if result.returncode != 0: raise Denied("PM2_JLIST")
        rows = json.loads(result.stdout); selected = {x.get("name"):x for x in rows if x.get("name") in self.binding["processes"].values()}
        if set(selected) != set(self.binding["processes"].values()): raise Denied("PM2_PROCESS_SET")
        return selected
    def identity(self, row):
        pid, env = row.get("pid"), row.get("pm2_env", {})
        if not isinstance(pid, int) or pid <= 0 or not isinstance(env, dict): raise Denied("PROCESS_SCHEMA")
        proc = self.surface.path(f"/proc/{pid}"); fields = (proc/"stat").read_text().rsplit(") ",1)[1].split()
        if fields[0] in {"Z","X","x"}: raise Denied("PROCESS_DEAD")
        return {"name":row["name"],"pid":pid,"startTicks":fields[19],"cwd":os.readlink(proc/"cwd"),"executable":os.readlink(proc/"exe"),"pm":{k:env.get(k) for k in PM_FIELDS}}
    def snapshot(self): return {name:self.identity(row) for name,row in self.rows().items()}
    def checked_file(self, path, expected):
        mapped = self.surface.path(path)
        if digest(read_bytes(mapped)) != expected: raise Denied("FILE_SHA")
        return mapped
    def helper_check(self):
        cfg=self.binding["supervision"]; helper=self.checked_file(cfg["helper"],cfg["helperSha256"]); result=self.surface.helper(helper)
        if result.returncode != 0: raise Denied("SUPERVISION_POLICY")
        observed=json.loads(result.stdout)
        if observed.get("policySha256")!=cfg["policySha256"] or observed.get("helperSha256")!=cfg["helperSha256"]: raise Denied("SUPERVISION_POLICY_OUTPUT")
    def private_definition(self,row):
        env=row.get("pm2_env",{})
        if not isinstance(env.get("env"),dict): raise Denied("ROLLBACK_PRIVATE_ENV_UNAVAILABLE")
        private=dict(env["env"])
        for key in ("RE7_FRONT_CONTROL","RE7_FRONT_RUN"):
            if isinstance(env.get(key),str): private[key]=env[key]
        interpreter=env.get("exec_interpreter")
        if not isinstance(interpreter,str) or not Path(interpreter).is_absolute(): raise Denied("ROLLBACK_INTERPRETER")
        app={"name":row["name"],"cwd":env.get("pm_cwd"),"script":env.get("pm_exec_path"),"interpreter":interpreter}
        for key in POLICY_FIELDS:
            if key in env and env[key] is not None: app[key]=env[key]
        for src,dst in (("pm_out_log_path","out_file"),("pm_err_log_path","error_file"),("pm_log_path","log_file")):
            if isinstance(env.get(src),str): app[dst]=env[src]
        app["env"]=private
        if not all(isinstance(app.get(k),str) and app[k] for k in ("cwd","script")): raise Denied("ROLLBACK_DEFINITION_IDENTITY")
        return {"apps":[app]}
    def config_fingerprint(self,row): return digest(canonical(self.private_definition(row)))
    def artifact_state(self,value):
        if not isinstance(value,str) or not Path(value).is_absolute(): return {"path":None,"exists":False,"sha256":None}
        path=self.surface.path(value); exists=path.is_file() and not path.is_symlink()
        return {"path":value,"exists":exists,"sha256":digest(read_bytes(path)) if exists else None}
    def capture(self):
        if self.capture_path.exists(): raise Denied("CAPTURE_REPLAY")
        rows=self.rows(); processes={n:self.identity(r) for n,r in rows.items()}; self.helper_check()
        dump_raw,dump_mode=read_dump(self.surface.path(PM2_HOME/"dump.pm2")); rollback=self.root/"rollback/dump.pm2"; atomic_write(rollback,dump_raw,exclusive=True)
        rollback_raw,rollback_mode=read_dump(rollback)
        if rollback_raw!=dump_raw: raise Denied("ROLLBACK_DUMP_COPY")
        definitions={}
        for label,name in self.binding["processes"].items():
            raw=canonical(self.private_definition(rows[name])); path=self.root/"rollback"/f"{label}.json"; atomic_write(path,raw,exclusive=True)
            definitions[label]={"path":str(path),"sha256":digest(raw),"configFingerprint":self.config_fingerprint(rows[name])}
        front=self.binding["processes"]["frontend"]; env=rows[front]["pm2_env"]; control_value=env.get("RE7_FRONT_CONTROL"); run_value=env.get("RE7_FRONT_RUN")
        if not isinstance(control_value,str) or not control_value or not isinstance(run_value,str) or not run_value: raise Denied("FRONTEND_CONTROL_RUN")
        control_raw=read_bytes(self.surface.path(control_value)); control=json.loads(control_raw); build=self.surface.path(Path(processes[front]["cwd"])/".next/BUILD_ID").read_text().strip()
        api=self.binding["processes"]["api"]; sockets=self.socket_matches(processes[api]["pid"],self.binding["api"]["port"])
        value={"schemaVersion":2,"capturedAtUnixNs":time.time_ns(),"processes":processes,
               "dump":{"source":str(PM2_HOME/"dump.pm2"),"sha256":digest(dump_raw),"size":len(dump_raw),"rollback":str(rollback),"mode":f"{dump_mode:04o}","rollbackMode":f"{rollback_mode:04o}"},
               "rollbackDefinitions":definitions,"apiSocket":{"port":self.binding["api"]["port"],"ownedByApi":bool(sockets),"inodes":sockets},
               "frontend":{"control":control_value,"run":run_value,"controlSha256":digest(control_raw),"buildId":build,"launcher":processes[front]["pm"]["pm_exec_path"],"launcherSha256":digest(read_bytes(self.surface.path(processes[front]["pm"]["pm_exec_path"]))),"journal":self.artifact_state(control.get("journal")),"marker":self.artifact_state(control_value+".permanent")},
               "supervision":self.binding["supervision"],"destinations":{"snapshot":str(self.capture_path),"reports":str(self.actions),"journal":str(self.root/"events.jsonl")}}
        atomic_write(self.capture_path,canonical(value),exclusive=True)
    def captured(self): return read_json(self.capture_path)[0]
    def select(self,component):
        sec=self.binding[component]; definition=self.checked_file(sec["candidateDefinition"],sec["candidateDefinitionSha256"]); name=self.binding["processes"][component]
        if self.surface.pm2("delete",name).returncode!=0: raise Denied(f"{component.upper()}_DELETE")
        if self.surface.pm2("start",str(definition),"--only",name).returncode!=0: raise Denied(f"{component.upper()}_START")
    def socket_matches(self,pid,port):
        inodes,matches=set(),set(); proc=self.surface.path(f"/proc/{pid}")
        for fd in (proc/"fd").iterdir():
            try: target=os.readlink(fd)
            except OSError: continue
            if target.startswith("socket:[") and target.endswith("]"): inodes.add(target[8:-1])
        wanted=f"{port:04X}"
        for table in ("/proc/net/tcp","/proc/net/tcp6"):
            for line in self.surface.path(table).read_text().splitlines()[1:]:
                fields=line.split()
                if len(fields)>9 and fields[1].rsplit(":",1)[-1]==wanted and fields[3]=="0A" and fields[9] in inodes: matches.add(fields[9])
        return sorted(matches)
    def frontend_control(self,identity,require_marker):
        expected=self.binding["frontend"]; pm=identity["pm"]
        if pm["RE7_FRONT_CONTROL"]!=expected["control"]: raise Denied("FRONTEND_LIVE_CONTROL")
        control,raw=read_json(self.checked_file(expected["control"],expected["controlSha256"])); nonce=control.get("nonce")
        if not isinstance(nonce,str) or not nonce or pm["RE7_FRONT_RUN"]!=nonce: raise Denied("FRONTEND_LIVE_RUN")
        if (control.get("release"),control.get("entry"),control.get("entrySha256"),control.get("buildId"))!=(expected["candidateCwd"],expected["entrypoint"],expected["entrypointSha256"],expected["buildId"]): raise Denied("FRONTEND_CONTROL_IDENTITY")
        journal_value=control.get("journal")
        if not isinstance(journal_value,str) or not Path(journal_value).is_absolute(): raise Denied("SUPERVISION_JOURNAL_PATH")
        records=[json.loads(line) for line in read_bytes(self.surface.path(journal_value)).decode().splitlines()]
        if not records or any(row.get("nonce")!=nonce for row in records): raise Denied("SUPERVISION_JOURNAL_NONCE")
        events=[row.get("event") for row in records]
        if events.count("parent")!=1 or events.count("application_identity")!=1 or events.count("application_released")!=1 or any(e in {"application_exit","child_error","launcher_error"} for e in events): raise Denied("SUPERVISION_JOURNAL_EVENTS")
        marker=self.surface.path(expected["control"]+".permanent")
        if require_marker:
            marker_value,_=read_json(marker)
            if marker_value!={"nonce":nonce,"entrySha256":expected["entrypointSha256"],"buildId":expected["buildId"]}: raise Denied("SUPERVISION_MARKER_IDENTITY")
        elif marker.exists() or marker.is_symlink(): raise Denied("SUPERVISION_MARKER_PREMATURE")
        return {"controlSha256":digest(raw),"nonce":nonce,"journal":journal_value,"marker":expected["control"]+".permanent"}
    def verify(self,component,require_marker=False):
        expected=self.binding[component]; name=self.binding["processes"][component]; samples=[]; last=None
        for _ in range(3):
            identity=self.snapshot()[name]; pm=identity["pm"]
            if pm["status"]!="online" or pm["pm_cwd"]!=expected["candidateCwd"] or pm["pm_exec_path"]!=expected["entrypoint"]: raise Denied(f"{component.upper()}_IDENTITY")
            if identity["cwd"]!=expected["candidateCwd"] or identity["executable"]!=str(NODE): raise Denied(f"{component.upper()}_PROC")
            if pm["restart_time"]!=0 or pm["unstable_restarts"]!=0: raise Denied(f"{component.upper()}_RESTARTS")
            if component=="frontend": self.frontend_control(identity,require_marker)
            samples.append((identity["pid"],identity["startTicks"])); last=identity; time.sleep(.01 if self.surface.root else 1)
        if len(set(samples))!=1: raise Denied(f"{component.upper()}_UNSTABLE")
        self.checked_file(expected["entrypoint"],expected["entrypointSha256"])
        if component=="api" and not self.socket_matches(samples[0][0],expected["port"]): raise Denied("API_SOCKET")
        if component=="frontend" and self.surface.path(Path(expected["candidateCwd"])/".next/BUILD_ID").read_text().strip()!=expected["buildId"]: raise Denied("FRONTEND_BUILD_ID")
        if any(self.surface.health(url)!=200 for url in expected["healthUrls"]): raise Denied(f"{component.upper()}_HEALTH")
        return last
    def enable_supervision(self):
        identity=self.verify("frontend",False); self.helper_check(); info=self.frontend_control(identity,False); marker=self.surface.path(info["marker"])
        atomic_write(marker,canonical({"nonce":info["nonce"],"entrySha256":self.binding["frontend"]["entrypointSha256"],"buildId":self.binding["frontend"]["buildId"]}),exclusive=True)
        self.helper_check(); self.frontend_control(identity,True)
    def verify_supervision(self): self.helper_check(); self.verify("frontend",True)
    def verify_worker(self):
        name=self.binding["processes"]["worker"]; before=self.captured()["processes"][name]; after=self.snapshot()[name]; expected=self.binding["worker"]
        if before!=after or after["pm"]["pm_cwd"]!=expected["cwd"] or after["pm"]["pm_exec_path"]!=expected["entrypoint"] or digest(read_bytes(self.surface.path(after["pm"]["pm_exec_path"])))!=expected["entrypointSha256"]: raise Denied("WORKER_CHANGED")
    def checkpoint(self):
        api=self.verify("api"); front=self.verify("frontend",True); self.verify_worker(); worker=self.snapshot()[self.binding["processes"]["worker"]]; control=read_json(self.surface.path(self.binding["frontend"]["control"]))[0]
        value={"schemaVersion":1,"api":{"pid":api["pid"],"startTicks":api["startTicks"]},"frontend":{"pid":front["pid"],"startTicks":front["startTicks"],"buildId":self.binding["frontend"]["buildId"],"controlSha256":self.binding["frontend"]["controlSha256"],"run":control["nonce"]},"worker":{"pid":worker["pid"],"startTicks":worker["startTicks"]}}
        atomic_write(self.root/"candidate-checkpoint.json",canonical(value),exclusive=True)
    def rollback_all(self):
        captured=self.captured(); errors=[]
        for component in ("frontend","api"):
            name=self.binding["processes"][component]; definition=captured["rollbackDefinitions"][component]
            if self.surface.pm2("delete",name).returncode!=0: errors.append(f"ROLLBACK_{component.upper()}_DELETE"); continue
            if digest(read_bytes(definition["path"]))!=definition["sha256"]: raise Denied("ROLLBACK_DEFINITION_SHA")
            if self.surface.pm2("start",definition["path"],"--only",name).returncode!=0: errors.append(f"ROLLBACK_{component.upper()}_START")
        rows=self.rows(); after=self.snapshot()
        for label,name in self.binding["processes"].items():
            before=captured["processes"][name]
            if after[name]["pm"]["pm_cwd"]!=before["pm"]["pm_cwd"] or after[name]["pm"]["pm_exec_path"]!=before["pm"]["pm_exec_path"]: raise Denied("ROLLBACK_IDENTITY")
            if self.config_fingerprint(rows[name])!=captured["rollbackDefinitions"][label]["configFingerprint"]: raise Denied("ROLLBACK_CONFIGURATION")
        worker=self.binding["processes"]["worker"]
        if after[worker]!=captured["processes"][worker]: raise Denied("ROLLBACK_WORKER_CHANGED")
        if any(self.surface.health(url)!=200 for url in self.binding["api"]["healthUrls"]+self.binding["frontend"]["healthUrls"]): raise Denied("ROLLBACK_HEALTH")
        if errors: raise Denied("ROLLBACK_PARTIAL")
    def validate_acceptance(self):
        a=read_json(self.root/"acceptance.json")[0]; required={"schemaVersion","releaseId","decision","mode","executionId","executionStateSha256","manifestSha256","executorSha256","adapterSha256","bindingSha256","api","frontend","csvPostRequests","imports","retryRequests"}
        if set(a)!=required or a["schemaVersion"]!=2 or a["releaseId"]!=self.binding["releaseId"] or a["decision"]!="ACCEPTED" or a["mode"] not in {"AUTOMATED_GET_ONLY","OWNER_MANUAL_AUTHENTICATED"} or any(a[k]!=0 for k in ("csvPostRequests","imports","retryRequests")): raise Denied("ACCEPTANCE_GATE")
        checkpoint=read_json(self.root/"candidate-checkpoint.json")[0]
        if a["api"]!=checkpoint["api"] or a["frontend"]!={k:checkpoint["frontend"][k] for k in ("pid","startTicks","buildId")}: raise Denied("ACCEPTANCE_CANDIDATE_IDENTITY")
    def dump_fingerprints(self,raw):
        rows=json.loads(raw)
        if not isinstance(rows,list): raise Denied("DUMP_SCHEMA")
        chosen={x.get("name"):x for x in rows if x.get("name") in self.binding["processes"].values()}
        if set(chosen)!=set(self.binding["processes"].values()): raise Denied("DUMP_PROCESS_SET")
        return {name:self.config_fingerprint(row) for name,row in chosen.items()}
    def save_once(self):
        self.validate_acceptance(); marker=self.actions/"pm2-save.completed"; transaction=self.root/"save-transaction.json"
        if marker.exists() or transaction.exists(): raise Denied("SAVE_REPLAY")
        self.verify("api"); self.verify("frontend",True); self.verify_worker(); captured=self.captured(); rollback_raw,rollback_mode=read_dump(captured["dump"]["rollback"])
        if f"{rollback_mode:04o}"!=captured["dump"]["rollbackMode"]: raise Denied("SAVE_ROLLBACK_DUMP_MODE")
        if digest(rollback_raw)!=captured["dump"]["sha256"]: raise Denied("SAVE_ROLLBACK_DUMP_SHA")
        atomic_write(transaction,canonical({"state":"PREPARED","oldDumpSha256":captured["dump"]["sha256"],"atUnixNs":time.time_ns()}),exclusive=True); saved=False
        try:
            if self.surface.pm2("save").returncode!=0: raise Denied("PM2_SAVE")
            saved=True
            if self.surface.injected("postSaveFailure"): raise Denied("SAVE_POSTCHECK_INJECTED")
            dump_path=self.surface.path(PM2_HOME/"dump.pm2"); new_raw,new_mode=read_dump(dump_path); expected={n:self.config_fingerprint(r) for n,r in self.rows().items()}
            if self.dump_fingerprints(new_raw)!=expected: raise Denied("SAVE_DUMP_IDENTITY")
            identity={"sha256":digest(new_raw),"size":len(new_raw),"mode":f"{new_mode:04o}"}; atomic_write(self.root/"saved-dump.json",canonical(identity),exclusive=True); atomic_write(transaction,canonical({"state":"COMMITTED",**identity,"atUnixNs":time.time_ns()})); atomic_write(marker,canonical({"result":"PASS",**identity,"atUnixNs":time.time_ns()}),exclusive=True)
        except Exception:
            if saved:
                dump_path=self.surface.path(PM2_HOME/"dump.pm2"); atomic_write(dump_path,rollback_raw)
                restored_raw,restored_mode=read_dump(dump_path)
                if digest(restored_raw)!=captured["dump"]["sha256"]: raise Denied("SAVE_POSTFAIL_DUMP_RESTORE_CRITICAL")
                atomic_write(transaction,canonical({"state":"ABORTED_DUMP_RESTORED","restoredDumpSha256":captured["dump"]["sha256"],"restoredDumpMode":f"{restored_mode:04o}","atUnixNs":time.time_ns()}))
            raise
    def execute(self,action):
        methods={"capture":self.capture,"select-api":lambda:self.select("api"),"verify-api":lambda:self.verify("api"),"select-frontend":lambda:self.select("frontend"),"verify-frontend":lambda:self.verify("frontend",self.scope=="resume"),"enable-supervision":self.enable_supervision,"verify-supervision":self.verify_supervision,"verify-worker":self.verify_worker,"checkpoint":self.checkpoint,"rollback-all":self.rollback_all,"save-once":self.save_once}
        try: methods[action](); self.record(action,"PASS")
        except Exception as error:
            reason=str(error) if isinstance(error,Denied) else "ADAPTER_INTERNAL_"+type(error).__name__.upper()
            try: self.record(action,"DENY",reason)
            except Denied: pass
            raise

def main():
    p=argparse.ArgumentParser(); p.add_argument("action",choices=sorted(ACTIONS)); p.add_argument("--manifest",type=Path,required=True); p.add_argument("--binding",type=Path,required=True); p.add_argument("--binding-sha256",required=True); p.add_argument("--work-dir",type=Path,required=True); p.add_argument("--scope",choices=("promote","resume","rollback-promote","rollback-resume"),required=True); a=p.parse_args()
    try:
        manifest=read_json(a.manifest.resolve())[0]; binding,raw=read_json(a.binding.resolve())
        if digest(raw)!=a.binding_sha256: raise Denied("BINDING_SHA")
        validate_binding(binding,manifest); Adapter(binding,a.work_dir.resolve(),Surface(binding["releaseId"]),a.scope).execute(a.action); print('{"result":"PASS","reason":null}'); return 0
    except (Denied,OSError,ValueError,json.JSONDecodeError,subprocess.TimeoutExpired) as error:
        reason=str(error) if isinstance(error,Denied) else "ADAPTER_DENIED"; print(json.dumps({"result":"DENY","reason":reason},separators=(",",":"))); return 1
if __name__=="__main__": raise SystemExit(main())
