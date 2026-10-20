#!/usr/bin/env python3
"""Permanent built-in PM2 adapter for Deploy V2.

Release bindings are data only. Commands, ordering, capture, verification,
rollback and save semantics are fixed here and cannot be supplied by a release.
"""
from __future__ import annotations

import argparse, hashlib, json, os, re, stat, subprocess, time, urllib.request
from pathlib import Path

SHA256 = re.compile(r"^[0-9a-f]{64}$")
ACTIONS = {"capture", "select-api", "verify-api", "select-frontend",
           "verify-frontend", "enable-supervision", "verify-worker",
           "rollback-all", "save-once"}
PM2 = Path("/home/deploy/.npm-global/bin/pm2")
PM2_HOME = Path("/home/deploy/.pm2")
NODE = Path("/usr/bin/node")
PM_FIELDS = ("status", "pm_cwd", "pm_exec_path", "exec_interpreter", "args",
             "node_args", "instances", "watch", "namespace", "exec_mode",
             "autorestart", "stop_exit_codes", "restart_time", "unstable_restarts")


class Denied(RuntimeError): pass


def canonical(value): return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
def digest(raw): return hashlib.sha256(raw).hexdigest()


def read_bytes(path, limit=64 * 1024 * 1024):
    path = Path(path); fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit: raise Denied("FILE_TYPE_OR_SIZE")
        chunks = []
        while True:
            chunk = os.read(fd, min(1024 * 1024, limit + 1 - sum(map(len, chunks))))
            if not chunk: break
            chunks.append(chunk)
            if sum(map(len, chunks)) > limit: raise Denied("FILE_SIZE")
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
            raise Denied("FILE_CHANGED")
        return b"".join(chunks)
    finally: os.close(fd)


def read_json(path):
    raw = read_bytes(path); value = json.loads(raw)
    if not isinstance(value, dict): raise Denied("JSON_OBJECT")
    return value, raw


def atomic_write(path, raw, mode=0o600):
    path = Path(path); path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp.{os.getpid()}")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try: os.write(fd, raw); os.fsync(fd)
    finally: os.close(fd)
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def walk_keys(value):
    if isinstance(value, dict):
        for key, item in value.items(): yield key; yield from walk_keys(item)
    elif isinstance(value, list):
        for item in value: yield from walk_keys(item)


def validate_binding(value, manifest):
    if value.get("schemaVersion") != 2 or value.get("releaseId") != manifest.get("releaseId"): raise Denied("BINDING_IDENTITY")
    keys = set(walk_keys(value))
    if keys & {"actions", "argv", "destinations", "commands", "executableSha256"}: raise Denied("BINDING_EXECUTABLE_CONTENT")
    if keys & {"token", "cookie", "tenantId", "uuid", "credential", "credentialReference"}: raise Denied("BINDING_SENSITIVE_REFERENCE")
    if set(value) != {"schemaVersion", "releaseId", "processes", "staging", "api", "frontend", "worker", "supervision", "acceptance"}: raise Denied("BINDING_SCHEMA")
    if set(value["processes"]) != {"api", "frontend", "worker"} or len(set(value["processes"].values())) != 3: raise Denied("PROCESS_NAMES")
    staging = value["staging"].get("root")
    if not isinstance(staging, str) or not Path(staging).is_absolute(): raise Denied("STAGING_ROOT")
    for component in ("api", "frontend"):
        section = value[component]
        for key in ("candidateCwd", "candidateDefinition", "candidateDefinitionSha256", "entrypoint", "entrypointSha256"):
            if not isinstance(section.get(key), str): raise Denied("CANDIDATE_SCHEMA")
        if not all(Path(section[key]).is_absolute() for key in ("candidateCwd", "candidateDefinition", "entrypoint")): raise Denied("CANDIDATE_PATH")
        if not Path(section["candidateCwd"]).is_relative_to(staging): raise Denied("CANDIDATE_STAGING_SCOPE")
        if not all(SHA256.fullmatch(section[key]) for key in ("candidateDefinitionSha256", "entrypointSha256")): raise Denied("CANDIDATE_SHA")
        if not isinstance(section.get("healthUrls"), list) or not section["healthUrls"]: raise Denied("HEALTH_URLS")
    if value["api"].get("port") != 3001: raise Denied("API_PORT")
    if not isinstance(value["frontend"].get("buildId"), str) or not SHA256.fullmatch(value["frontend"].get("controlSha256", "")): raise Denied("FRONTEND_BINDING")
    worker = value["worker"]
    if not all(isinstance(worker.get(key), str) and Path(worker[key]).is_absolute() for key in ("cwd", "entrypoint")) or not SHA256.fullmatch(worker.get("entrypointSha256", "")): raise Denied("WORKER_BINDING")
    supervision = value["supervision"]
    if not isinstance(supervision.get("helper"), str) or not Path(supervision["helper"]).is_absolute() or not SHA256.fullmatch(supervision.get("helperSha256", "")) or not SHA256.fullmatch(supervision.get("policySha256", "")): raise Denied("SUPERVISION_BINDING")
    if value["acceptance"] != {"mode": "GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL", "forbidPost": True}: raise Denied("ACCEPTANCE_BINDING")


class Surface:
    """Production surfaces with a release-locked alternate root for CI fixtures."""
    def __init__(self, release_id):
        fixture = os.environ.get("DEPLOY_V2_FIXTURE_ROOT")
        if fixture and release_id != "deploy-v2-fixture": raise Denied("FIXTURE_SURFACE_RELEASE")
        self.root = Path(fixture).resolve() if fixture else None

    def path(self, value):
        value = Path(value)
        if not value.is_absolute(): raise Denied("ABSOLUTE_PATH_REQUIRED")
        return self.root / value.relative_to("/") if self.root else value

    def executable(self, production, fixture_name): return self.root / "bin" / fixture_name if self.root else Path(production)

    def run(self, argv, timeout=30):
        env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
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


class Adapter:
    def __init__(self, binding, root, surface):
        self.binding, self.root, self.surface = binding, Path(root), surface
        self.capture_path = self.root / "capture.json"; self.actions = self.root / "adapter-actions"
        self.actions.mkdir(mode=0o700, exist_ok=True)

    def record(self, action, result, reason=None):
        path = self.actions / f"{action}.json"
        if path.exists(): raise Denied("ACTION_REPLAY")
        atomic_write(path, canonical({"action": action, "result": result, "reason": reason, "atUnixNs": time.time_ns()}))

    def rows(self):
        result = self.surface.pm2("jlist")
        if result.returncode != 0: raise Denied("PM2_JLIST")
        rows = json.loads(result.stdout)
        chosen = {row.get("name"): row for row in rows if row.get("name") in self.binding["processes"].values()}
        if set(chosen) != set(self.binding["processes"].values()): raise Denied("PM2_PROCESS_SET")
        return chosen

    def identity(self, row):
        pid = row.get("pid"); env = row.get("pm2_env", {})
        if not isinstance(pid, int) or pid <= 0 or not isinstance(env, dict): raise Denied("PROCESS_SCHEMA")
        proc = self.surface.path(f"/proc/{pid}"); fields = (proc / "stat").read_text().rsplit(") ", 1)[1].split()
        if fields[0] in {"Z", "X", "x"}: raise Denied("PROCESS_DEAD")
        return {"name": row["name"], "pid": pid, "startTicks": fields[19], "cwd": os.readlink(proc / "cwd"),
                "executable": os.readlink(proc / "exe"), "pm": {key: env.get(key) for key in PM_FIELDS}}

    def snapshot(self): return {name: self.identity(row) for name, row in self.rows().items()}

    def checked_file(self, path, expected):
        mapped = self.surface.path(path)
        if digest(read_bytes(mapped)) != expected: raise Denied("FILE_SHA")
        return mapped

    def helper_check(self):
        cfg = self.binding["supervision"]; helper = self.checked_file(cfg["helper"], cfg["helperSha256"])
        result = self.surface.helper(helper)
        if result.returncode != 0: raise Denied("SUPERVISION_POLICY")
        observed = json.loads(result.stdout)
        if observed.get("policySha256") != cfg["policySha256"] or observed.get("helperSha256") != cfg["helperSha256"]: raise Denied("SUPERVISION_POLICY_OUTPUT")

    def capture(self):
        if self.capture_path.exists(): raise Denied("CAPTURE_REPLAY")
        rows = self.rows(); processes = {name: self.identity(row) for name, row in rows.items()}; self.helper_check()
        dump_raw = read_bytes(self.surface.path(PM2_HOME / "dump.pm2")); rollback = self.root / "rollback" / "dump.pm2"; atomic_write(rollback, dump_raw)
        definitions = {}
        for label, name in self.binding["processes"].items():
            pm = processes[name]["pm"]
            definition = {"apps": [{"name": name, "cwd": pm["pm_cwd"], "script": pm["pm_exec_path"], "interpreter": pm["exec_interpreter"],
                                      "args": pm["args"] or [], "node_args": pm["node_args"] or [], "instances": pm["instances"], "watch": pm["watch"],
                                      "namespace": pm["namespace"], "autorestart": pm["autorestart"], "stop_exit_codes": pm["stop_exit_codes"] or []}]}
            path = self.root / "rollback" / f"{label}.json"; atomic_write(path, canonical(definition)); definitions[label] = {"path": str(path), "sha256": digest(read_bytes(path))}
        front_name = self.binding["processes"]["frontend"]; control_value = rows[front_name].get("pm2_env", {}).get("RE7_FRONT_CONTROL")
        if not isinstance(control_value, str) or not control_value: raise Denied("FRONTEND_CONTROL")
        control_path = self.surface.path(control_value); control_raw = read_bytes(control_path); control = json.loads(control_raw)
        build = self.surface.path(Path(processes[front_name]["cwd"]) / ".next" / "BUILD_ID").read_text().strip()
        journal_value = control.get("journal") if isinstance(control, dict) else None
        marker_value = control_value + ".permanent"
        def artifact_state(value):
            if not isinstance(value, str) or not Path(value).is_absolute(): return {"path": None, "exists": False, "sha256": None}
            path = self.surface.path(value); exists = path.is_file() and not path.is_symlink()
            return {"path": value, "exists": exists, "sha256": digest(read_bytes(path)) if exists else None}
        api_name = self.binding["processes"]["api"]
        socket_inodes = self.socket_matches(processes[api_name]["pid"], self.binding["api"]["port"])
        value = {"schemaVersion": 1, "capturedAtUnixNs": time.time_ns(), "processes": processes,
                 "dump": {"source": str(PM2_HOME / "dump.pm2"), "sha256": digest(dump_raw), "rollback": str(rollback), "mode": "0600"},
                 "rollbackDefinitions": definitions,
                 "apiSocket": {"port": self.binding["api"]["port"], "ownedByApi": bool(socket_inodes), "inodes": socket_inodes},
                 "frontend": {"control": control_value, "controlSha256": digest(control_raw), "buildId": build,
                              "launcher": processes[front_name]["pm"]["pm_exec_path"],
                              "launcherSha256": digest(read_bytes(self.surface.path(processes[front_name]["pm"]["pm_exec_path"]))),
                              "journal": artifact_state(journal_value), "marker": artifact_state(marker_value)},
                 "supervision": self.binding["supervision"], "destinations": {"snapshot": str(self.capture_path), "reports": str(self.actions), "journal": str(self.root / "events.jsonl")}}
        atomic_write(self.capture_path, canonical(value))

    def captured(self): return read_json(self.capture_path)[0]

    def select(self, component):
        section = self.binding[component]; definition = self.checked_file(section["candidateDefinition"], section["candidateDefinitionSha256"]); name = self.binding["processes"][component]
        if self.surface.pm2("delete", name).returncode != 0: raise Denied(f"{component.upper()}_DELETE")
        if self.surface.pm2("start", str(definition), "--only", name).returncode != 0: raise Denied(f"{component.upper()}_START")

    def socket_matches(self, pid, port):
        inodes = set(); matches = set(); proc = self.surface.path(f"/proc/{pid}")
        for fd in (proc / "fd").iterdir():
            try: target = os.readlink(fd)
            except OSError: continue
            if target.startswith("socket:[") and target.endswith("]"): inodes.add(target[8:-1])
        wanted = f"{port:04X}"
        for table in ("/proc/net/tcp", "/proc/net/tcp6"):
            for line in self.surface.path(table).read_text().splitlines()[1:]:
                fields = line.split()
                if len(fields) > 9 and fields[1].rsplit(":", 1)[-1] == wanted and fields[3] == "0A" and fields[9] in inodes: matches.add(fields[9])
        return sorted(matches)

    def verify(self, component):
        expected = self.binding[component]; name = self.binding["processes"][component]; samples = []
        for _ in range(3):
            identity = self.snapshot()[name]; pm = identity["pm"]
            if pm["status"] != "online" or pm["pm_cwd"] != expected["candidateCwd"] or pm["pm_exec_path"] != expected["entrypoint"]: raise Denied(f"{component.upper()}_IDENTITY")
            if identity["cwd"] != expected["candidateCwd"] or identity["executable"] != str(NODE): raise Denied(f"{component.upper()}_PROC")
            if pm["restart_time"] != 0 or pm["unstable_restarts"] != 0: raise Denied(f"{component.upper()}_RESTARTS")
            samples.append((identity["pid"], identity["startTicks"])); time.sleep(0.01 if self.surface.root else 1)
        if len(set(samples)) != 1: raise Denied(f"{component.upper()}_UNSTABLE")
        self.checked_file(expected["entrypoint"], expected["entrypointSha256"])
        if component == "api" and not self.socket_matches(samples[0][0], expected["port"]): raise Denied("API_SOCKET")
        if component == "frontend":
            self.checked_file(expected["control"], expected["controlSha256"])
            if self.surface.path(Path(expected["candidateCwd"]) / ".next" / "BUILD_ID").read_text().strip() != expected["buildId"]: raise Denied("FRONTEND_BUILD_ID")
        if any(self.surface.health(url) != 200 for url in expected["healthUrls"]): raise Denied(f"{component.upper()}_HEALTH")

    def enable_supervision(self):
        self.verify("frontend"); self.helper_check(); front = self.binding["frontend"]
        control_path = self.surface.path(front["control"]); control = read_json(control_path)[0]
        required = {"nonce", "entrySha256", "buildId", "journal"}
        if not required <= set(control) or control["entrySha256"] != front["entrypointSha256"] or control["buildId"] != front["buildId"]: raise Denied("SUPERVISION_CONTROL")
        journal = self.surface.path(control["journal"])
        records = [json.loads(line) for line in read_bytes(journal).decode().splitlines()]
        if not records or any(row.get("nonce") != control["nonce"] for row in records): raise Denied("SUPERVISION_JOURNAL_NONCE")
        events = [row.get("event") for row in records]
        if events.count("parent") != 1 or events.count("application_identity") != 1 or events.count("application_released") != 1 or any(event in {"application_exit", "child_error", "launcher_error"} for event in events): raise Denied("SUPERVISION_JOURNAL_EVENTS")
        marker = self.surface.path(front["control"] + ".permanent")
        if marker.exists() or marker.is_symlink(): raise Denied("SUPERVISION_MARKER_EXISTS")
        atomic_write(marker, canonical({"nonce": control["nonce"], "entrySha256": control["entrySha256"], "buildId": control["buildId"]}))
        self.helper_check()

    def verify_worker(self):
        name = self.binding["processes"]["worker"]; before = self.captured()["processes"][name]; after = self.snapshot()[name]
        expected = self.binding["worker"]
        if before != after or after["pm"]["pm_cwd"] != expected["cwd"] or after["pm"]["pm_exec_path"] != expected["entrypoint"] or digest(read_bytes(self.surface.path(after["pm"]["pm_exec_path"]))) != expected["entrypointSha256"]: raise Denied("WORKER_CHANGED")

    def rollback_all(self):
        captured = self.captured(); errors = []
        for component in ("frontend", "api"):
            name = self.binding["processes"][component]
            if self.surface.pm2("delete", name).returncode != 0:
                errors.append(f"ROLLBACK_{component.upper()}_DELETE"); continue
            if self.surface.pm2("start", captured["rollbackDefinitions"][component]["path"], "--only", name).returncode != 0:
                errors.append(f"ROLLBACK_{component.upper()}_START")
        after = self.snapshot()
        for name, identity in captured["processes"].items():
            if after[name]["pm"]["pm_cwd"] != identity["pm"]["pm_cwd"] or after[name]["pm"]["pm_exec_path"] != identity["pm"]["pm_exec_path"]: raise Denied("ROLLBACK_IDENTITY")
        worker = self.binding["processes"]["worker"]
        if after[worker] != captured["processes"][worker]: raise Denied("ROLLBACK_WORKER_CHANGED")
        urls = self.binding["api"]["healthUrls"] + self.binding["frontend"]["healthUrls"]
        if any(self.surface.health(url) != 200 for url in urls): raise Denied("ROLLBACK_HEALTH")
        if errors: raise Denied("ROLLBACK_PARTIAL")

    def save_once(self):
        acceptance = read_json(self.root / "acceptance.json")[0]
        if set(acceptance) != {"schemaVersion", "releaseId", "decision", "mode", "csvPostRequests", "imports", "retryRequests"}: raise Denied("ACCEPTANCE_SCHEMA")
        if acceptance["schemaVersion"] != 1 or acceptance["releaseId"] != self.binding["releaseId"] or acceptance["decision"] != "ACCEPTED" or acceptance["mode"] not in {"AUTOMATED_GET_ONLY", "OWNER_MANUAL_AUTHENTICATED"} or any(acceptance[key] != 0 for key in ("csvPostRequests", "imports", "retryRequests")): raise Denied("ACCEPTANCE_GATE")
        marker = self.actions / "pm2-save.completed"
        if marker.exists(): raise Denied("SAVE_REPLAY")
        self.verify("api"); self.verify("frontend"); self.verify_worker()
        if self.surface.pm2("save").returncode != 0: raise Denied("PM2_SAVE")
        atomic_write(marker, canonical({"result": "PASS", "atUnixNs": time.time_ns()}))

    def execute(self, action):
        methods = {"capture": self.capture, "select-api": lambda: self.select("api"), "verify-api": lambda: self.verify("api"),
                   "select-frontend": lambda: self.select("frontend"), "verify-frontend": lambda: self.verify("frontend"),
                   "enable-supervision": self.enable_supervision, "verify-worker": self.verify_worker, "rollback-all": self.rollback_all, "save-once": self.save_once}
        try: methods[action](); self.record(action, "PASS")
        except Exception as error:
            reason = str(error) if isinstance(error, Denied) else "ADAPTER_INTERNAL_" + type(error).__name__.upper()
            try: self.record(action, "DENY", reason)
            except Denied: pass
            raise


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("action", choices=sorted(ACTIONS)); parser.add_argument("--manifest", type=Path, required=True); parser.add_argument("--binding", type=Path, required=True); parser.add_argument("--binding-sha256", required=True); parser.add_argument("--work-dir", type=Path, required=True); args = parser.parse_args()
    try:
        manifest = read_json(args.manifest.resolve())[0]; binding, raw = read_json(args.binding.resolve())
        if digest(raw) != args.binding_sha256: raise Denied("BINDING_SHA")
        validate_binding(binding, manifest); Adapter(binding, args.work_dir.resolve(), Surface(binding["releaseId"])).execute(args.action)
        print(json.dumps({"result": "PASS", "reason": None}, separators=(",", ":"))); return 0
    except (Denied, OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        reason = str(error) if isinstance(error, Denied) else "ADAPTER_DENIED"; print(json.dumps({"result": "DENY", "reason": reason}, separators=(",", ":"))); return 1


if __name__ == "__main__": raise SystemExit(main())
