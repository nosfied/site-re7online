#!/usr/bin/env python3
"""Exercise source-bound candidate and rollback definitions in an isolated PM2."""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib.util
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTROL = ROOT / "scripts/pm2-definition-control.py"
MATERIALIZER = ROOT / "scripts/pm2-binding-materialize.py"
SPEC = importlib.util.spec_from_file_location("pm2_definition_control", CONTROL)
assert SPEC and SPEC.loader
CONTROL_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL_MODULE)

DEPLOY_TEST_SPEC = importlib.util.spec_from_file_location(
    "converta_deploy_real_pm2_fixture", ROOT / "scripts/ci/test-converta-deploy.py")
assert DEPLOY_TEST_SPEC and DEPLOY_TEST_SPEC.loader
DEPLOY_TEST = importlib.util.module_from_spec(DEPLOY_TEST_SPEC)
DEPLOY_TEST_SPEC.loader.exec_module(DEPLOY_TEST)
DEPLOY = DEPLOY_TEST.deploy


def run(command, env, *, check=True):
    result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=30)
    if check and result.returncode:
        raise RuntimeError(f"command_failed:{Path(command[0]).name}:{result.returncode}:{result.stderr.strip()}")
    return result


def free_port():
    with socket.socket() as handle:
        handle.bind(("127.0.0.1", 0))
        return handle.getsockname()[1]


def write_private(path, value):
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def definition_request(role):
    return {
        "schemaVersion": 2,
        "scope": "isolated-test",
        "role": role,
        "component": "frontend",
        "sourceKind": "authenticated-proven-definition" if role == "rollback" else "canonical-private-config",
        "environmentKeys": ["NODE_ENV", "PORT"],
    }


def source_artifact(role, stable_runtime, physical_runtime, port, build_id):
    source_kind = "authenticated-proven-definition" if role == "rollback" else "canonical-private-config"
    authority = "proven-production-definition" if role == "rollback" else "new-release-config"
    return {
        "schemaVersion": 1,
        "role": role,
        "component": "frontend",
        "sourceKind": source_kind,
        "provenance": {
            "authority": authority,
            "evidenceSha256": hashlib.sha256(f"independent-{role}-evidence".encode()).hexdigest(),
        },
        "releaseIdentity": {
            "releaseId": f"immutable-{role}-fixture",
            "releaseManifestSha256": hashlib.sha256(f"{role}-manifest".encode()).hexdigest(),
            "componentTreeSha256": hashlib.sha256(f"{role}-frontend-tree".encode()).hexdigest(),
            "frontendBuildId": build_id,
            "frontendEntrySha256": sha(physical_runtime / "server.js"),
        },
        "definition": {"apps": [{
            "name": "re7-isolated-frontend",
            "script": str(stable_runtime / "server.js"),
            "args": ["start", "-p", str(port)],
            "cwd": str(stable_runtime),
            "interpreter": os.path.realpath(shutil.which("node") or ""),
            "exec_mode": "fork_mode",
            "instances": 1,
            "namespace": "re7-pm2-definition-proof",
            "autorestart": True,
            "restart_delay": 250,
            "kill_timeout": 3000,
            "listen_timeout": 5000,
            "wait_ready": False,
            "node_args": ["--enable-source-maps"],
            "out_file": str(stable_runtime.parent / "logs" / "frontend.log"),
            "error_file": str(stable_runtime.parent / "logs" / "frontend-error.log"),
            "merge_logs": False,
            "watch": False,
            "env": {"NODE_ENV": "production", "PORT": str(port)},
        }]},
    }


def process_stat(pid):
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
    return {"ppid": int(fields[1]), "ticks": int(fields[19]), "state": fields[0]}


def descendants(root_pid):
    parents = {}
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():
            continue
        try:
            parents[int(item.name)] = process_stat(int(item.name))["ppid"]
        except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError):
            continue
    result = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, parent in parents.items():
            if parent in result and pid not in result:
                result.add(pid)
                changed = True
    return result, parents


def socket_owners(port, allowed):
    wanted = f"{port:04X}"
    inodes = set()
    for table in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
        for line in table.read_text().splitlines()[1:]:
            fields = line.split()
            if fields[1].rsplit(":", 1)[1] == wanted and fields[3] == "0A":
                inodes.add(fields[9])
    owners = set()
    for pid in allowed:
        try:
            for handle in Path(f"/proc/{pid}/fd").iterdir():
                try:
                    target = os.readlink(handle)
                except OSError:
                    continue
                if target.startswith("socket:[") and target[8:-1] in inodes:
                    owners.add(pid)
        except (FileNotFoundError, PermissionError):
            continue
    return owners


def has_ipv6_wildcard_listener(port):
    wanted = f"{port:04X}"
    wildcard = "0" * 32
    return any(
        fields[1].rsplit(":", 1) == [wildcard, wanted] and fields[3] == "0A"
        for fields in (line.split() for line in Path("/proc/net/tcp6").read_text().splitlines()[1:])
    )


def normalize_args(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        import shlex
        return shlex.split(value)
    raise AssertionError("loaded_args_type")


def resolved_within(path, root):
    resolved_path = Path(path).resolve(strict=True)
    resolved_root = Path(root).resolve(strict=True)
    assert resolved_path == resolved_root or resolved_root in resolved_path.parents, "physical_path_outside_release"
    return resolved_path


def capture_symlink_identity(stable_runtime, expected_runtime, releases_root):
    stable_runtime = Path(stable_runtime)
    expected_runtime = Path(expected_runtime).resolve(strict=True)
    releases_root = Path(releases_root).resolve(strict=True)
    metadata = stable_runtime.lstat()
    assert stat.S_ISLNK(metadata.st_mode), "stable_path_not_symlink"
    textual_target = os.readlink(stable_runtime)
    resolved_target = stable_runtime.resolve(strict=True)
    resolved_within(expected_runtime, releases_root)
    resolved_within(resolved_target, releases_root)
    assert resolved_target == expected_runtime, "stable_symlink_wrong_release"
    return {
        "lexicalPath": str(stable_runtime),
        "textualTarget": textual_target,
        "resolvedTarget": str(resolved_target),
        "device": metadata.st_dev,
        "inode": metadata.st_ino,
        "mode": stat.S_IMODE(metadata.st_mode),
        "mtimeNs": metadata.st_mtime_ns,
    }


def require_same_symlink_identity(expected, observed):
    assert observed == expected, "stable_symlink_changed"


def validate_pm2_lexical_identity(loaded, app, stable_runtime):
    stable_runtime = Path(stable_runtime)
    assert loaded["pm_cwd"] == app["cwd"], "loaded_cwd"
    assert loaded["pm_exec_path"] == app["script"], "loaded_script"
    assert Path(app["cwd"]) == stable_runtime, "canonical_cwd_not_stable"
    assert Path(app["script"]) == stable_runtime / "server.js", "canonical_script_not_stable"
    assert os.path.realpath(loaded["exec_interpreter"]) == os.path.realpath(app["interpreter"]), "loaded_interpreter"
    assert loaded["exec_mode"] == app["exec_mode"], "loaded_exec_mode"
    assert int(loaded.get("instances") or 1) == app["instances"], "loaded_instances"
    assert normalize_args(loaded.get("args")) == app["args"], "loaded_args"
    for key in ("autorestart", "restart_delay", "kill_timeout", "listen_timeout"):
        assert loaded.get(key) == app[key], f"loaded_policy:{key}"
    for key in ("wait_ready", "watch"):
        assert bool(loaded.get(key, False)) is app[key], f"loaded_policy:{key}"
    assert normalize_args(loaded.get("node_args")) == app["node_args"], "loaded_policy:node_args"
    assert bool(loaded.get("merge_logs", False)) is app["merge_logs"], "loaded_policy:merge_logs"


def validate_physical_identity(app, reported_script, proc_cwd, proc_exe, physical_runtime, releases_root, release_identity):
    physical_runtime = Path(physical_runtime).resolve(strict=True)
    releases_root = Path(releases_root).resolve(strict=True)
    resolved_within(physical_runtime, releases_root)
    resolved_app_cwd = Path(app["cwd"]).resolve(strict=True)
    resolved_app_script = Path(app["script"]).resolve(strict=True)
    resolved_reported_script = Path(reported_script).resolve(strict=True)
    resolved_proc_cwd = Path(proc_cwd).resolve(strict=True)
    resolved_proc_exe = Path(proc_exe).resolve(strict=True)
    resolved_interpreter = Path(app["interpreter"]).resolve(strict=True)
    assert resolved_app_cwd == physical_runtime, "physical_cwd_wrong_release"
    assert resolved_app_script == physical_runtime / "server.js", "physical_script_wrong_release"
    assert resolved_reported_script == resolved_app_script, "process_script_wrong_release"
    assert resolved_proc_cwd == resolved_app_cwd, "process_cwd_wrong_release"
    resolved_within(resolved_app_cwd, physical_runtime)
    resolved_within(resolved_app_script, physical_runtime)
    resolved_within(resolved_reported_script, physical_runtime)
    assert resolved_proc_exe == resolved_interpreter, "process_interpreter"
    assert (physical_runtime / ".next/BUILD_ID").read_text().strip() == release_identity["frontendBuildId"], "build_id_file"
    assert sha(resolved_app_script) == release_identity["frontendEntrySha256"], "entrypoint_sha256"


def validate_loaded(
    pm2, env, source, build_id, stable_runtime, physical_runtime, releases_root,
    prestart_link_identity, samples=3,
):
    app = source["definition"]["apps"][0]
    readiness = CONTROL_MODULE.wait_for_readiness(
        component="frontend", port=int(app["args"][2]), app=app,
        release_identity=source["releaseIdentity"], pm2=Path(pm2),
        stable_path=Path(stable_runtime), release_root=Path(physical_runtime),
        local_health=f"http://127.0.0.1:{app['args'][2]}/app/login",
        public_health=f"http://127.0.0.1:{app['args'][2]}/app/login",
        deadline_seconds=30.0, poll_seconds=0.5, pm2_environment=env,
    )
    assert has_ipv6_wildcard_listener(int(app["args"][2])), "ipv6_wildcard_listener"
    rows = json.loads(run([pm2, "jlist"], env).stdout)
    matches = [row for row in rows if row.get("name") == app["name"]]
    assert len(matches) == 1, "loaded_instance_count"
    row = matches[0]
    loaded = row["pm2_env"]
    assert loaded["status"] == "online", "pm2_not_online"
    pid = int(row["pid"])
    validate_pm2_lexical_identity(loaded, app, stable_runtime)
    for key, expected in app["env"].items():
        assert loaded.get(key) == expected, f"loaded_allowlisted_env:{key}"
    runtime_logs = CONTROL_MODULE.validate_runtime_log_paths(app, loaded)
    original_ticks = process_stat(pid)["ticks"]
    link_identity = capture_symlink_identity(stable_runtime, physical_runtime, releases_root)
    require_same_symlink_identity(prestart_link_identity, link_identity)
    allowed, parents = descendants(pid)
    owners = socket_owners(int(app["args"][2]), allowed)
    assert len(owners) == 1, "socket_owner_count"
    owner = next(iter(owners))
    if owner == pid:
        relation = "DIRECT"
    else:
        chain = [owner]
        while chain[-1] != pid and chain[-1] in parents:
            chain.append(parents[chain[-1]])
        assert chain[-1] == pid, "socket_owner_not_descendant"
        relation = "DESCENDANT"
    for _ in range(samples):
        current_rows = json.loads(run([pm2, "jlist"], env).stdout)
        current_matches = [item for item in current_rows if item.get("name") == app["name"]]
        assert len(current_matches) == 1, "sample_instance_count"
        current_row = current_matches[0]
        assert int(current_row["pid"]) == pid, "sample_pid_changed"
        assert current_row["pm2_env"]["status"] == "online", "sample_not_online"
        assert process_stat(pid)["ticks"] == original_ticks, "sample_start_ticks_changed"
        validate_pm2_lexical_identity(current_row["pm2_env"], app, stable_runtime)
        require_same_symlink_identity(
            link_identity,
            capture_symlink_identity(stable_runtime, physical_runtime, releases_root),
        )
        with urllib.request.urlopen(f"http://127.0.0.1:{app['args'][2]}/app/login", timeout=3) as response:
            payload = json.loads(response.read())
            assert response.status == 200 and payload["buildId"] == build_id, "http_or_build_id"
            assert payload["argv"][-len(app["args"]):] == app["args"], "process_args"
            validate_physical_identity(
                app,
                payload["entrypoint"],
                Path(f"/proc/{pid}/cwd"),
                Path(f"/proc/{pid}/exe"),
                physical_runtime,
                releases_root,
                source["releaseIdentity"],
            )
        time.sleep(0.15)
    return {
        "pid": pid,
        "ticks": original_ticks,
        "socketOwnerRelation": relation,
        "structureExact": True,
        "allowlistedEnvironmentExact": True,
        "pm2PoliciesExact": True,
        "canonicalLogDefinitionExact": True,
        "runtimeLogPathsSemantic": True,
        "pmIdUsedForLogPaths": loaded["pm_id"],
        "runtimeLogPathCount": len(runtime_logs),
        "symlinkResolvedRuntimeExact": True,
        "pm2LexicalIdentityExact": True,
        "physicalReleaseIdentityExact": True,
        "symlinkIdentityStable": True,
        "readinessStableSamples": readiness["stableSamples"],
        "readinessElapsedSeconds": readiness["elapsedSeconds"],
        "healthAfterSocket": readiness["healthStartedMonotonic"] >= readiness["socketStableMonotonic"],
        "ipv6WildcardListener": True,
    }


SERVER = r'''const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
if (argv.length !== 3 || argv[0] !== "start" || argv[1] !== "-p") process.exit(64);
const port = Number(argv[2]);
const buildId = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
const server = http.createServer((req, res) => {
  if (req.url === "/app/login") {
    res.writeHead(200, {"content-type": "application/json"});
    return res.end(JSON.stringify({buildId, entrypoint: __filename, argv: process.argv.slice(1)}));
  }
  res.writeHead(404); res.end("not found");
});
setTimeout(() => server.listen(port, "::"), 4000);
'''


def create_runtime(path, build_id):
    (path / ".next").mkdir(parents=True)
    (path / ".next/BUILD_ID").write_text(build_id + "\n")
    (path / "server.js").write_text(SERVER)


def select_runtime(stable_path, target):
    temporary = stable_path.parent / f".{stable_path.name}.next"
    temporary.symlink_to(target)
    os.replace(temporary, stable_path)
    assert stable_path.is_symlink() and stable_path.resolve() == target.resolve(), "atomic_symlink_selection"


API_SERVER = r'''const http=require("node:http");
http.createServer((req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,db:"ok"}));}).listen(3001,"127.0.0.1");
'''
FRONTEND_SERVER = r'''const http=require("node:http");
http.createServer((req,res)=>{res.writeHead(200,{"content-type":"text/plain"});res.end("frontend");}).listen(3000,"127.0.0.1");
'''
WORKER_SERVER = 'setInterval(() => {}, 1000);\n'


class RealPm2Host(DEPLOY.Host):
    """Use the production Host/PM2 surface while confining all network checks."""
    def __init__(self, environment):
        self.environment = environment
        self.mutations = []
        self.row_drift = None
        self.cutover_sealer = None
        self.cutover_publications = []
        self.cutover_seal_result = None
        self.cutover_result = None

    def run(self, command, *, timeout=40, pass_fds=(), env=None):
        if len(command) == 5 and Path(command[1]).name == "readStateReconciliationBatch.js":
            action = command[2]
            if action == "seal":
                self.cutover_seal_result, self.cutover_publications = self.cutover_sealer()
                self.cutover_result = {
                    "state": "VERIFIED",
                    "receiptSha256": hashlib.sha256(
                        self.cutover_publications[-1][1]).hexdigest(),
                    "entryCount": self.cutover_seal_result["entryCount"],
                }
                publications = self.cutover_publications[:-3]
                result = self.cutover_seal_result
            elif action == "reconcile":
                publications = self.cutover_publications[-3:]
                result = self.cutover_result
            else:
                raise AssertionError(f"unexpected_cutover_action:{action}")
            for destination, payload in publications:
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if not destination.exists():
                    destination.write_bytes(payload)
                    destination.chmod(0o600)
            return subprocess.CompletedProcess(command, 0, json.dumps(result) + "\n", "")
        merged = dict(self.environment)
        if env is not None:
            merged.update(env)
        return super().run(command, timeout=timeout, pass_fds=pass_fds, env=merged)

    def get(self, url, timeout=10):
        path = urllib.parse.urlsplit(url).path
        return super().get(f"http://127.0.0.1:3000{path}", timeout)

    def api_health(self, _url, timeout=10):
        return super().api_health("http://127.0.0.1:3001/health", timeout)

    def control_evidence(self, root, args, *, report, stdout, stderr):
        isolated = list(args)
        component = (isolated[isolated.index("--component") + 1]
                     if "--component" in isolated else "worker")
        port = 3001 if component == "api" else 3000
        for option in ("--local-health", "--public-health"):
            if option in isolated:
                isolated[isolated.index(option) + 1] = f"http://127.0.0.1:{port}/health"
        return super().control_evidence(
            root, isolated, report=report, stdout=stdout, stderr=stderr)

    def pm2_mutate(self, pm2, args):
        self.mutations.append(tuple(args))
        return super().pm2_mutate(pm2, args)

    def pm2_rows(self, pm2):
        rows = super().pm2_rows(pm2)
        if self.row_drift is None:
            return rows
        field, value = self.row_drift
        rows = json.loads(json.dumps(rows))
        worker = next(row for row in rows if row.get("name") == DEPLOY.PROCESS_NAMES["worker"])
        if field == "duplicate":
            rows.append(json.loads(json.dumps(worker)))
        elif field == "pid":
            worker["pid"] = value
        else:
            worker["pm2_env"][field] = value
            if field == "pm_cwd":
                worker["pm2_env"]["cwd"] = value
            elif field == "pm_exec_path":
                worker["pm2_env"]["script"] = value
        return rows


class RealPm2Driver(DEPLOY.Driver):
    """Production driver with only the existing test failpoint hook enabled."""
    def __init__(self, *args, failpoints=(), **kwargs):
        super().__init__(*args, **kwargs)
        self.failpoints = set(failpoints)

    def _failpoint(self, name):
        if name in self.failpoints:
            self.failpoints.remove(name)
            raise DEPLOY.Denied(f"injected:{name}")


def pm2_cli(pm2, environment, *args, check=True):
    return run([str(pm2), *args], environment, check=check)


def prepare_real_driver_fixture(case, node):
    for release in (case.rollback, case.candidate):
        root = case.releases / release
        (root / "api-runtime/dist/index.js").write_text(API_SERVER)
        (root / "frontend-runtime/node_modules/next/dist/bin/next").write_text(FRONTEND_SERVER)
    case.node = node
    case.host.node = node
    case.three_component()
    for release in (case.rollback, case.candidate):
        root = case.releases / release
        worker = root / "worker-runtime/dist/whatsapp-web-worker/src/index.js"
        worker.write_text(WORKER_SERVER)
        (root / "index.sha256").chmod(0o644)
        (root / "manifest.json").chmod(0o644)
        DEPLOY_TEST.put(root / "index.sha256", DEPLOY_TEST.release_index(root), 0o444)
        manifest = json.loads((root / "manifest.json").read_text())
        manifest["indexSha256"] = sha(root / "index.sha256")
        manifest["runtimes"]["api"]["entrySha256"] = sha(root / "api-runtime/dist/index.js")
        manifest["runtimes"]["worker"]["entrySha256"] = sha(worker)
        DEPLOY_TEST.put(root / "manifest.json", manifest, 0o444)
    runtime = json.loads(case.runtime_manifest.read_text())
    rollback_root = case.releases / case.rollback
    common = {"releaseId": case.rollback,
              "manifestSha256": sha(rollback_root / "manifest.json"),
              "indexSha256": sha(rollback_root / "index.sha256")}
    runtime["rollbackReleases"] = {
        "api": {**common, "entrySha256": sha(rollback_root / "api-runtime/dist/index.js")},
        "frontend": {**common,
                     "entrySha256": sha(rollback_root / "frontend-runtime/node_modules/next/dist/bin/next"),
                     "buildId": "rollback-build"},
        "worker": {**common,
                   "entrySha256": sha(rollback_root / "worker-runtime/dist/whatsapp-web-worker/src/index.js")},
    }
    for role in ("candidate", "rollback"):
        binding = runtime["workerPm2"][role]
        source_path = Path(binding["sourceArtifact"])
        definition_path = Path(binding["definition"])
        source = json.loads(source_path.read_text())
        release = case.candidate if role == "candidate" else case.rollback
        release_root = case.releases / release
        source["releaseIdentity"].update(
            releaseManifestSha256=sha(release_root / "manifest.json"),
            componentTreeSha256=sha(release_root / "index.sha256"),
            workerEntrySha256=sha(release_root / "worker-runtime/dist/whatsapp-web-worker/src/index.js"))
        source["definition"]["apps"][0]["interpreter"] = str(node)
        source["definition"]["apps"][0]["merge_logs"] = False
        DEPLOY_TEST.put(source_path, source)
        definition_path.unlink()
        materialized = subprocess.run(
            [sys.executable, str(CONTROL), "build",
             "--request", binding["request"],
             "--source-artifact", str(source_path),
             "--source-sha256", sha(source_path),
             "--output", str(definition_path)],
            check=True, capture_output=True, text=True)
        assert json.loads(materialized.stdout)["result"] == "PM2_DEFINITION_BUILT"
        binding["sourceSha256"] = sha(source_path)
    runtime["controlPlaneSha"] = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"], check=True,
        capture_output=True, text=True).stdout.strip()
    DEPLOY_TEST.put(case.runtime_manifest, runtime)
    case.control_plane = runtime["controlPlaneSha"]
    case.inputs = dataclasses.replace(
        case.inputs, control_plane=case.control_plane,
        runtime_manifest_sha256=sha(case.runtime_manifest))


def prepare_real_api_frontend_fixture(case, node, extra_releases=()):
    case.node = node
    case.host.node = node
    for row in case.host.rows.values():
        row["pm2_env"]["exec_interpreter"] = str(node)
    (case.worker / "index.js").write_text(WORKER_SERVER)
    for release in (case.rollback, case.candidate, *extra_releases):
        root = case.releases / release
        (root / "api-runtime/dist/index.js").write_text(API_SERVER)
        (root / "frontend-runtime/node_modules/next/dist/bin/next").write_text(FRONTEND_SERVER)
        (root / "index.sha256").chmod(0o644)
        (root / "manifest.json").chmod(0o644)
        DEPLOY_TEST.put(root / "index.sha256", DEPLOY_TEST.release_index(root), 0o444)
        manifest = json.loads((root / "manifest.json").read_text())
        manifest["indexSha256"] = sha(root / "index.sha256")
        manifest["runtimes"]["api"]["entrySha256"] = sha(root / "api-runtime/dist/index.js")
        DEPLOY_TEST.put(root / "manifest.json", manifest, 0o444)
    runtime = json.loads(case.runtime_manifest.read_text())
    rollback_root = case.releases / case.rollback
    common = {"releaseId": case.rollback,
              "manifestSha256": sha(rollback_root / "manifest.json"),
              "indexSha256": sha(rollback_root / "index.sha256")}
    runtime["rollbackReleases"] = {
        "api": {**common, "entrySha256": sha(rollback_root / "api-runtime/dist/index.js")},
        "frontend": {**common,
                     "entrySha256": sha(rollback_root / "frontend-runtime/node_modules/next/dist/bin/next"),
                     "buildId": "rollback-build"},
    }
    runtime["controlPlaneSha"] = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"], check=True,
        capture_output=True, text=True).stdout.strip()
    DEPLOY_TEST.put(case.runtime_manifest, runtime)
    case.control_plane = runtime["controlPlaneSha"]
    case.inputs = dataclasses.replace(
        case.inputs, control_plane=case.control_plane,
        runtime_manifest_sha256=sha(case.runtime_manifest))


def start_initial_processes(case, host, pm2, worker_definition=None, *,
                            api_namespace="converta", api_environment=None):
    if "worker" in case.stable:
        case.stable["worker"].symlink_to(case.releases / case.rollback / "worker-runtime")
    apps = []
    for component in ("api", "frontend"):
        stable = case.stable[component]
        script = stable / ("dist/index.js" if component == "api" else
                           "node_modules/next/dist/bin/next")
        environment = {"NODE_ENV": "production"}
        if component == "api" and api_environment:
            environment.update(api_environment)
        apps.append({"name": DEPLOY.PROCESS_NAMES[component], "script": str(script),
                     "cwd": str(stable), "interpreter": str(case.node),
                     "args": [] if component == "api" else ["start", "-p", "3000"],
                     "exec_mode": "fork_mode", "instances": 1,
                     "namespace": api_namespace if component == "api" else "converta",
                     "autorestart": True, "restart_delay": 0,
                     "kill_timeout": 1600, "listen_timeout": 3000,
                     "wait_ready": False, "node_args": [],
                     "out_file": str(case.base / f"{component}.out.log"),
                     "error_file": str(case.base / f"{component}.err.log"),
                     "merge_logs": True, "env": environment})
    ecosystem = case.base / "initial-api-frontend.pm2.json"
    write_private(ecosystem, {"apps": apps})
    pm2_cli(pm2, host.environment, "start", str(ecosystem))
    runtime = json.loads(case.runtime_manifest.read_text())
    if worker_definition:
        rollback_definition = Path(worker_definition)
    elif "workerPm2" in runtime:
        rollback_definition = Path(runtime["workerPm2"]["rollback"]["definition"])
    else:
        rollback_definition = case.base / "preserved-worker.pm2.private.json"
        write_private(rollback_definition, {"apps": [{
            "name": DEPLOY.PROCESS_NAMES["worker"], "script": str(case.worker / "index.js"),
            "cwd": str(case.worker), "interpreter": str(case.node), "args": [],
            "node_args": [], "exec_mode": "fork_mode", "instances": 1,
            "namespace": "converta", "autorestart": True, "wait_ready": False,
            "restart_delay": 1000, "kill_timeout": 10000, "listen_timeout": 10000,
            "out_file": str(case.base / "worker.out.log"),
            "error_file": str(case.base / "worker.err.log"), "merge_logs": True,
            "env": {"NODE_ENV": "production"},
        }]})
    pm2_cli(pm2, host.environment, "start", str(rollback_definition), "--only",
            DEPLOY.PROCESS_NAMES["worker"])
    pm2_cli(pm2, host.environment, "save")
    case.dump = Path(host.environment["PM2_HOME"]) / "dump.pm2"
    case.dump.chmod(0o600)


def make_real_driver(case, host, pm2, failpoints=()):
    return RealPm2Driver(
        case.inputs, host=host, repo=ROOT, releases=case.releases,
        stable=case.stable, lock=case.lock, dump=case.dump, pm2=pm2,
        clock=lambda: 1234567890.0, failpoints=failpoints)


def isolated_daemon_pid(pm2_home):
    pid_path = pm2_home / "pm2.pid"
    if not pid_path.exists():
        return None
    pid = int(pid_path.read_text().strip())
    environment = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    assert f"PM2_HOME={pm2_home}".encode() in environment, "pm2_daemon_not_isolated"
    return pid


def run_real_driver_scenario(pm2, node, name, failpoint=None, resume=False, drift=None):
    fixture = DEPLOY_TEST.DeployFixture(methodName="runTest")
    fixture.setUp()
    pm2_home = fixture.base / "real-pm2-home"
    pm2_home.mkdir(mode=0o700)
    environment = dict(os.environ, PM2_HOME=str(pm2_home),
                       PATH=str(node.parent) + os.pathsep + os.environ.get("PATH", ""))
    host = RealPm2Host(environment)
    try:
        prepare_real_driver_fixture(fixture, node)
        fixture.host = host
        fixture.pm2 = pm2
        start_initial_processes(fixture, host, pm2)
        driver = make_real_driver(fixture, host, pm2, (failpoint,) if failpoint else ())
        driver.preflight()
        if drift:
            host.row_drift = drift
            try:
                driver.activate()
            except DEPLOY.Denied:
                pass
            else:
                raise AssertionError(f"security_negative_not_denied:{drift[0]}")
            host.row_drift = None
            journal = driver._journal_read()
            if journal["state"] == "FAILED":
                assert journal["recoveryAction"] == "rollback", journal["recoveryAction"]
                make_real_driver(fixture, host, pm2).rollback()
            else:
                assert journal["state"] == "ROLLED_BACK", journal["state"]
            terminal = make_real_driver(fixture, host, pm2)._journal_read()
            assert terminal["state"] == "ROLLED_BACK", terminal["state"]
            restored = terminal["rollback"]["restoredComponents"]
            assert all(component in DEPLOY.THREE_COMPONENTS for component in restored), restored
        else:
            try:
                driver.activate()
            except DEPLOY.Denied as error:
                if not failpoint:
                    raise
                assert f"injected:{failpoint}" in str(error)
            journal = driver._journal_read()
            if journal["state"] == "AWAITING_ACCEPTANCE":
                try:
                    driver.rollback()
                except DEPLOY.Denied as error:
                    if not resume:
                        raise
                    assert f"injected:{failpoint}" in str(error)
                journal = driver._journal_read()
            if resume and journal["state"] == "FAILED":
                rollback_definition = str(Path(json.loads(fixture.runtime_manifest.read_text())
                                               ["workerPm2"]["rollback"]["definition"]))
                starts_before = host.mutations.count(
                    ("start", rollback_definition, "--only", DEPLOY.PROCESS_NAMES["worker"]))
                make_real_driver(fixture, host, pm2).rollback()
                starts_after = host.mutations.count(
                    ("start", rollback_definition, "--only", DEPLOY.PROCESS_NAMES["worker"]))
                assert starts_after == starts_before, "rollback_effect_repeated"
            terminal = make_real_driver(fixture, host, pm2)._journal_read()
            assert terminal["state"] == "ROLLED_BACK", terminal["state"]
            assert terminal["rollback"]["restoredComponents"] == ["worker", "frontend", "api"]
        rows = host.pm2_rows(pm2)
        assert len([row for row in rows if row.get("name") == DEPLOY.PROCESS_NAMES["worker"]]) == 1
        assert all(fixture.stable[c].resolve() ==
                   (fixture.releases / fixture.rollback / DEPLOY.RUNTIME_DIR[c]).resolve()
                   for c in DEPLOY.THREE_COMPONENTS)
        print("REAL_DRIVER_SCENARIO_PASS", name)
    finally:
        host.row_drift = None
        daemon = isolated_daemon_pid(pm2_home)
        pm2_cli(pm2, environment, "delete", "all", check=False)
        pm2_cli(pm2, environment, "kill", check=False)
        if daemon is not None:
            deadline = time.monotonic() + 5
            while Path(f"/proc/{daemon}").exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            assert not Path(f"/proc/{daemon}").exists(), "isolated_pm2_daemon_residual"
        fixture.tearDown()


def run_real_three_component_driver(pm2, node):
    for port in (3000, 3001):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as error:
                raise RuntimeError(f"isolated_port_unavailable:{port}") from error
    run_real_driver_scenario(pm2, node, "activate-and-reverse-rollback")
    run_real_driver_scenario(pm2, node, "failure-after-worker-delete",
                             failpoint="worker_after_delete")
    run_real_driver_scenario(pm2, node, "failure-after-worker-start",
                             failpoint="worker_after_start")
    run_real_driver_scenario(pm2, node, "interrupted-rollback-resume",
                             failpoint="rollback_worker_after_start_effect", resume=True)
    for field, value in (("pid", 99999999), ("pm_id", 999),
                         ("pm_out_log_path", "/tmp/unrelated-worker.log"),
                         ("pm_cwd", "/tmp/unrelated-worker-runtime"),
                         ("NODE_ENV", "drift"), ("duplicate", True)):
        run_real_driver_scenario(pm2, node, f"deny-{field}", drift=(field, value))
    print("THREE_COMPONENT_REAL_PM2_INTEGRATION_PASS")


def materialize_authenticated_api_pair(case, gate_path, pm2, pm2_home, node):
    """Replace the legacy synthetic API pair with outputs from the real producer."""
    custody = case.base / "authenticated-api-pm2-authority"
    custody.mkdir(mode=0o700)
    media_root = "/opt/re7online/content/template-campaign-media"
    persistent = Path(json.loads(gate_path.read_text())["persistentRoot"]["path"])
    stable = case.stable["api"]
    config = custody / "api-candidate.config.cjs"
    config.write_text("module.exports=" + json.dumps({"apps": [{
        "name": DEPLOY.PROCESS_NAMES["api"], "script": str(stable / "dist/index.js"),
        "args": [], "cwd": str(stable), "interpreter": str(node), "exec_mode": "fork",
        "instances": 1, "autorestart": True, "node_args": [],
        "out_file": str(case.base / "api.out.log"),
        "error_file": str(case.base / "api.err.log"), "stop_exit_codes": [78],
        "watch": False, "env": {"NODE_ENV": "production"},
    }]}, sort_keys=True, separators=(",", ":")) + ";\n")
    config.chmod(0o600)
    records = {}
    values = {
        "preparation": {"result": "OBS2_PRIVATE_DEFINITIONS_READY",
            "files": {"candidate": str(config)}, "onlyObs2Differs": True,
            "obs1Unchanged": True, "productionChanged": False},
        "execution": {"result": "OBS2_PREVIOUS_VALUE_DESTROYED", "state": "API_STABLE",
            "finalChecks": {"apiOnline": True, "apiCwdPreserved": True}},
        "closure": {"result": "OBS2_PREVIOUS_VALUE_DESTROYED",
            "activeDefinitionsReferenceCurrentObs2": True, "inventory": []},
    }
    for name, value in values.items():
        records[name] = custody / f"rotation-{name}.private.json"
        write_private(records[name], value)
    deployment = custody / "template-media-deployment.json"
    write_private(deployment, {"schemaVersion": 5, "status": "DEPLOYED_VERIFIED",
        "persistentStorage": {"templateMediaRoot": media_root}})
    origin = custody / "api-source-origin.private.json"
    write_private(origin, {"schemaVersion": 1,
        "kind": "CONVERTA_PM2_API_SOURCE_ORIGIN_V1",
        "processName": DEPLOY.PROCESS_NAMES["api"],
        "canonicalConfig": {"path": str(config), "sha256": sha(config)},
        "rotation": {name: {"path": str(path), "sha256": sha(path)}
                     for name, path in records.items()},
        "functionalOverlay": {"deploymentRecord": {
            "path": str(deployment), "sha256": sha(deployment)},
            "environment": {"TEMPLATE_MEDIA_ROOT": media_root}},
        "persistentRoot": str(persistent)})
    producer = custody / "fixture-release-producer.py"
    producer.write_text("#!/usr/bin/env python3\nimport json,sys\na=sys.argv\n"
        "print(json.dumps({'result':'RELEASE VERIFIED','releaseId':"
        "a[a.index('--release-id')+1],'targetCommit':a[a.index('--target')+1]}))\n")
    producer.chmod(0o700)

    bindings = {}
    for role, release_id, target in (("candidate", case.candidate, case.target),
                                     ("rollback", case.rollback, "c" * 40)):
        release_root = case.releases / release_id
        output = custody / role
        completed = subprocess.run([sys.executable, str(MATERIALIZER), "--role", role,
            "--component", "api", "--target", target, "--release-id", release_id,
            "--release-root", str(release_root), "--producer", str(producer),
            "--producer-sha256", sha(producer), "--control", str(CONTROL),
            "--control-sha256", sha(CONTROL), "--api-origin", str(origin),
            "--api-origin-sha256", sha(origin), "--persistent-root", str(persistent),
            "--scope", "isolated-test", "--node", str(node), "--pm2", str(pm2),
            "--pm2-home", str(pm2_home), "--output", str(output)],
            check=False, text=True, capture_output=True)
        if completed.returncode:
            raise AssertionError(f"api_materializer_failed:{role}:{completed.stderr.strip()}")
        assert json.loads(completed.stdout)["result"] == "PM2_BINDING_MATERIALIZED"
        bindings[role] = {"request": str(output / "request.private.json"),
            "sourceArtifact": str(output / "source.private.json"),
            "sourceSha256": sha(output / "source.private.json"),
            "definition": str(output / "definition.private.json")}
    pair = subprocess.run([sys.executable, str(CONTROL), "validate-pair",
        *binding_args("candidate", Path(bindings["candidate"]["request"]),
                      Path(bindings["candidate"]["sourceArtifact"]),
                      Path(bindings["candidate"]["definition"])),
        *binding_args("rollback", Path(bindings["rollback"]["request"]),
                      Path(bindings["rollback"]["sourceArtifact"]),
                      Path(bindings["rollback"]["definition"]))],
        check=True, text=True, capture_output=True)
    assert json.loads(pair.stdout)["result"] == "PM2_DEFINITION_PAIR_VALID"
    gate = json.loads(gate_path.read_text()); gate["cutover"]["pm2"] = bindings
    DEPLOY_TEST.put(gate_path, gate)
    runtime = json.loads(case.runtime_manifest.read_text())
    runtime["durablePersistence"]["requestSha256"] = sha(gate_path)
    DEPLOY_TEST.put(case.runtime_manifest, runtime)
    contract = json.loads(case.generation_contract.read_text())
    contract["durablePersistence"] = runtime["durablePersistence"]
    DEPLOY_TEST.put(case.generation_contract, contract)
    DEPLOY_TEST.put(case.retirement.intent, {"contractSha256": sha(case.generation_contract)})
    case.retirement = dataclasses.replace(
        case.retirement, intent_sha256=sha(case.retirement.intent))
    case.inputs = dataclasses.replace(case.inputs,
        runtime_manifest_sha256=sha(case.runtime_manifest), retirement=case.retirement)


def run_real_read_state_cutover(pm2, node, *, outcome="rollback"):
    assert outcome in {"preaggregate", "rollback", "finalize"}
    fixture = DEPLOY_TEST.DeployFixture(methodName="runTest")
    fixture.setUp()
    pm2_home = fixture.base / "read-state-cutover-pm2-home"
    pm2_home.mkdir(mode=0o700)
    environment = dict(os.environ, PM2_HOME=str(pm2_home),
                       PATH=str(node.parent) + os.pathsep + os.environ.get("PATH", ""))
    host = RealPm2Host(environment)
    try:
        predecessor = (fixture.configure_first_cutover_topology()
                       if outcome == "preaggregate" else None)
        prepare_real_api_frontend_fixture(
            fixture, node, (predecessor,) if predecessor is not None else ())
        for release_id, target in ((fixture.candidate, fixture.target),
                                   (fixture.rollback, "c" * 40)):
            manifest_path = fixture.releases / release_id / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest.update(releaseId=release_id, targetCommit=target)
            manifest_path.chmod(0o644)
            DEPLOY_TEST.put(manifest_path, manifest, 0o444)
        gate_path = fixture.enable_read_state_cutover(predecessor_release=predecessor)
        synthetic_host = fixture.host
        host.cutover_sealer = synthetic_host.cutover_sealer
        host.cutover_publications = synthetic_host.cutover_publications
        host.cutover_seal_result = synthetic_host.cutover_seal_result
        host.cutover_result = synthetic_host.cutover_result
        fixture.host = host
        fixture.pm2 = pm2
        start_initial_processes(
            fixture, host, pm2, api_namespace="default",
            api_environment={
                "TEMPLATE_MEDIA_ROOT": "/opt/re7online/content/template-campaign-media"})
        materialize_authenticated_api_pair(fixture, gate_path, pm2, pm2_home, node)
        driver = make_real_driver(
            fixture, host, pm2,
            ("read_state_cutover_after_quiesce",) if outcome == "preaggregate" else ())
        driver.preflight()
        rows = host.pm2_rows(pm2)
        legacy = next(row for row in rows if row.get("name") == DEPLOY.PROCESS_NAMES["api"])
        assert "INBOX_READ_STATE_ROOT" not in legacy["pm2_env"], "legacy_cb_external_root"
        worker_pid = int(next(row for row in rows if row.get("name") ==
                              DEPLOY.PROCESS_NAMES["worker"])["pid"])
        if outcome == "preaggregate":
            try:
                driver.activate()
            except DEPLOY.Denied as error:
                assert "injected:read_state_cutover_after_quiesce" in str(error)
            else:
                raise AssertionError("preaggregate_failpoint_not_consumed")
            terminal = driver._journal_read()
            assert terminal["state"] == "ROLLED_BACK", terminal["state"]
            assert driver._selection_snapshot("api")["releaseId"] == predecessor
            assert driver._selection_snapshot("frontend")["releaseId"] == predecessor
            restored_api = next(row for row in host.pm2_rows(pm2) if row.get("name") ==
                                DEPLOY.PROCESS_NAMES["api"])
            assert "INBOX_READ_STATE_ROOT" not in restored_api["pm2_env"]
            assert int(next(row for row in host.pm2_rows(pm2) if row.get("name") ==
                            DEPLOY.PROCESS_NAMES["worker"])["pid"]) == worker_pid
            print("READ_STATE_CUTOVER_REAL_PM2_PREAGGREGATE_PASS")
            return
        gate = json.loads(gate_path.read_text())
        authorization = json.loads(Path(gate["reconciliation"]["authorization"]).read_text())
        source = Path(authorization["entries"][0]["sources"][0]["path"])
        source.write_text(json.dumps(json.loads(source.read_text()), indent=2) + "\n")
        final_source_sha = sha(source)
        driver.activate()
        journal = driver._journal_read()
        assert journal["state"] == "AWAITING_ACCEPTANCE", journal["state"]
        assert journal["readStateCutover"]["state"] == "AGGREGATE_VERIFIED"
        manifest = json.loads(Path(gate["reconciliation"]["manifest"]).read_text())
        assert manifest["entries"][0]["sourceAuthorities"][0]["sha256"] == final_source_sha
        candidate_rows = host.pm2_rows(pm2)
        candidate_api = next(row for row in candidate_rows if row.get("name") ==
                             DEPLOY.PROCESS_NAMES["api"])
        expected_root = gate["persistentRoot"]["path"]
        assert candidate_api["pm2_env"].get("INBOX_READ_STATE_ROOT") == expected_root
        assert int(next(row for row in candidate_rows if row.get("name") ==
                        DEPLOY.PROCESS_NAMES["worker"])["pid"]) == worker_pid
        assert driver._selection_snapshot("frontend")["releaseId"] == fixture.candidate
        assert driver._journal_read()["saveCount"] == 0
        if outcome == "rollback":
            driver.rollback()
            terminal = driver._journal_read()
            assert terminal["state"] == "ROLLED_BACK", terminal["state"]
            rollback_api = next(row for row in host.pm2_rows(pm2) if row.get("name") ==
                                DEPLOY.PROCESS_NAMES["api"])
            assert rollback_api["pm2_env"].get("INBOX_READ_STATE_ROOT") == expected_root
            assert driver._selection_snapshot("api")["releaseId"] == fixture.rollback
            assert driver._selection_snapshot("frontend")["releaseId"] == fixture.rollback
            assert terminal["saveCount"] == 0 and host.mutations.count(("save",)) == 0
        else:
            fixture.acceptance()
            driver.finalize()
            terminal = driver._journal_read()
            assert terminal["state"] == "DEPLOYED_RETENTION_INCOMPLETE", terminal["state"]
            assert driver._selection_snapshot("api")["releaseId"] == fixture.candidate
            assert driver._selection_snapshot("frontend")["releaseId"] == fixture.candidate
            assert terminal["saveCount"] == 1 and host.mutations.count(("save",)) == 1
        assert int(next(row for row in host.pm2_rows(pm2) if row.get("name") ==
                        DEPLOY.PROCESS_NAMES["worker"])["pid"]) == worker_pid
        print(f"READ_STATE_CUTOVER_REAL_PM2_{outcome.upper()}_PASS")
    finally:
        daemon = isolated_daemon_pid(pm2_home)
        pm2_cli(pm2, environment, "delete", "all", check=False)
        pm2_cli(pm2, environment, "kill", check=False)
        if daemon is not None:
            deadline = time.monotonic() + 5
            while Path(f"/proc/{daemon}").exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            assert not Path(f"/proc/{daemon}").exists(), "isolated_pm2_daemon_residual"
        fixture.tearDown()


def binding_args(prefix, request_path, source_path, definition_path):
    return [
        f"--{prefix}-request", str(request_path),
        f"--{prefix}-source-artifact", str(source_path),
        f"--{prefix}-source-sha256", sha(source_path),
        f"--{prefix}-definition", str(definition_path),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pm2", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--npm", type=Path, required=True)
    options = parser.parse_args()
    pm2_path = options.pm2.resolve(strict=True)
    node = options.node.resolve(strict=True)
    npm = options.npm.resolve(strict=True)
    tool_environment = dict(os.environ,
                            PATH=str(node.parent) + os.pathsep + os.environ.get("PATH", ""))
    if run([str(node), "--version"], tool_environment).stdout.strip() != "v20.20.0":
        raise SystemExit("node_version")
    if run([str(npm), "--version"], tool_environment).stdout.strip() != "10.8.2":
        raise SystemExit("npm_version")
    pm2 = str(pm2_path)
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="re7-pm2-definition-proof-") as directory:
        root = Path(directory)
        pm2_home = root / "pm2-home"
        pm2_home.mkdir(mode=0o700)
        env = os.environ.copy()
        env["PM2_HOME"] = str(pm2_home)
        env["PATH"] = str(node.parent) + os.pathsep + env.get("PATH", "")
        releases = root / "releases"
        current = root / "current"
        logs = current / "logs"
        releases.mkdir()
        current.mkdir()
        logs.mkdir()
        candidate_runtime, rollback_runtime = releases / "candidate", releases / "rollback"
        stable_runtime = current / "frontend"
        candidate_id, rollback_id = "candidate-build-id", "rollback-build-id"
        create_runtime(candidate_runtime, candidate_id)
        create_runtime(rollback_runtime, rollback_id)
        stable_runtime.symlink_to(rollback_runtime)
        requests = {
            "candidate": definition_request("candidate"),
            "rollback": definition_request("rollback"),
        }
        sources = {
            "candidate": source_artifact("candidate", stable_runtime, candidate_runtime, port, candidate_id),
            "rollback": source_artifact("rollback", stable_runtime, rollback_runtime, port, rollback_id),
        }
        paths = {}
        for role in ("candidate", "rollback"):
            paths[f"{role}_request"] = root / f"{role}-request.json"
            paths[f"{role}_source"] = root / f"{role}-source.json"
            paths[f"{role}_definition"] = root / f"{role}-definition.json"
            write_private(paths[f"{role}_request"], requests[role])
            write_private(paths[f"{role}_source"], sources[role])
            built = run([
                sys.executable, str(CONTROL), "build",
                "--request", str(paths[f"{role}_request"]),
                "--source-artifact", str(paths[f"{role}_source"]),
                "--source-sha256", sha(paths[f"{role}_source"]),
                "--output", str(paths[f"{role}_definition"]),
            ], env)
            assert json.loads(built.stdout)["sourceArtifactSha256"] == sha(paths[f"{role}_source"])
            run([
                sys.executable, str(CONTROL), "validate",
                "--request", str(paths[f"{role}_request"]),
                "--source-artifact", str(paths[f"{role}_source"]),
                "--source-sha256", sha(paths[f"{role}_source"]),
                "--definition", str(paths[f"{role}_definition"]),
            ], env)
            assert stat.S_IMODE(paths[f"{role}_definition"].stat().st_mode) == 0o600

        sealed_hashes = {key: sha(path) for key, path in paths.items()}

        pair_result = run([
            sys.executable, str(CONTROL), "validate-pair",
            *binding_args("candidate", paths["candidate_request"], paths["candidate_source"], paths["candidate_definition"]),
            *binding_args("rollback", paths["rollback_request"], paths["rollback_source"], paths["rollback_definition"]),
        ], env)
        assert json.loads(pair_result.stdout)["result"] == "PM2_DEFINITION_PAIR_VALID"
        pair_payload = json.loads(pair_result.stdout)
        assert pair_payload["configurationDigestsEqual"] is True, "stable_definitions_not_identical"
        assert sha(paths["candidate_definition"]) == sha(paths["rollback_definition"]), "definition_bytes_not_identical"
        assert pair_payload["candidate"]["releaseIdentitySha256"] != pair_payload["rollback"]["releaseIdentitySha256"], "release_identity_not_distinct"
        assert not list(pm2_home.iterdir()), "pm2_touched_before_pair_validation"

        try:
            rollback_link = capture_symlink_identity(stable_runtime, rollback_runtime, releases)
            run([pm2, "start", str(paths["rollback_definition"]), "--only", "re7-isolated-frontend"], env)
            original = validate_loaded(
                pm2, env, sources["rollback"], rollback_id, stable_runtime,
                rollback_runtime, releases, rollback_link,
            )


            run([pm2, "delete", "re7-isolated-frontend"], env)
            select_runtime(stable_runtime, candidate_runtime)
            candidate_link = capture_symlink_identity(stable_runtime, candidate_runtime, releases)
            run([pm2, "start", str(paths["candidate_definition"]), "--only", "re7-isolated-frontend"], env)
            candidate = validate_loaded(
                pm2, env, sources["candidate"], candidate_id, stable_runtime,
                candidate_runtime, releases, candidate_link,
            )

            run([pm2, "save"], env)
            dump = pm2_home / "dump.pm2"
            assert dump.is_file(), "isolated_dump_missing"
            serialized = json.loads(dump.read_text())
            saved_rows = [item for item in serialized if item["name"] == "re7-isolated-frontend"]
            assert len(saved_rows) == 1, "serialized_instances"
            saved = saved_rows[0]
            candidate_app = sources["candidate"]["definition"]["apps"][0]
            assert normalize_args(saved["args"]) == candidate_app["args"], "serialized_args"
            assert saved["exec_mode"] == "fork_mode", "serialized_shape"
            run([pm2, "kill"], env)
            run([pm2, "resurrect"], env)
            resurrected = validate_loaded(
                pm2, env, sources["candidate"], candidate_id, stable_runtime,
                candidate_runtime, releases, candidate_link,
            )
            assert {key: sha(path) for key, path in paths.items()} == sealed_hashes, "canonical_artifact_changed_after_resurrect"

            run([pm2, "delete", "re7-isolated-frontend"], env)
            select_runtime(stable_runtime, rollback_runtime)
            restored_link = capture_symlink_identity(stable_runtime, rollback_runtime, releases)
            run([pm2, "start", str(paths["rollback_definition"]), "--only", "re7-isolated-frontend"], env)
            restored = validate_loaded(
                pm2, env, sources["rollback"], rollback_id, stable_runtime,
                rollback_runtime, releases, restored_link,
            )
            assert {key: sha(path) for key, path in paths.items()} == sealed_hashes, "canonical_artifact_changed_after_rollback"
            assert restored["pid"] != candidate["pid"], "rollback_pid_not_replaced"
            print(json.dumps({
                "result": "PM2_SOURCE_PROVENANCE_AND_ROLLBACK_PASS",
                "candidateSourceSha256": sha(paths["candidate_source"]),
                "rollbackSourceSha256": sha(paths["rollback_source"]),
                "candidateDefinitionSha256": sha(paths["candidate_definition"]),
                "rollbackDefinitionSha256": sha(paths["rollback_definition"]),
                "candidate": candidate,
                "resurrected": resurrected,
                "rollback": restored,
                "originalRollback": original,
                "samplesPerValidation": 3,
                "saveKillResurrect": True,
                "rollbackExact": True,
                "canonicalArtifactsPreserved": True,
                "fixedCurrentTopology": True,
                "identicalConfigurationSha256": sha(paths["candidate_definition"]),
                "releaseIdentitiesDistinct": True,
                "productionPm2Touched": False,
            }, sort_keys=True))
        finally:
            run([pm2, "delete", "all"], env, check=False)
            run([pm2, "kill"], env, check=False)
        with socket.socket() as handle:
            handle.settimeout(0.2)
            assert handle.connect_ex(("127.0.0.1", port)) != 0, "isolated_port_not_released"
    run_real_three_component_driver(pm2_path, node)
    run_real_read_state_cutover(pm2_path, node, outcome="preaggregate")
    run_real_read_state_cutover(pm2_path, node, outcome="rollback")
    run_real_read_state_cutover(pm2_path, node, outcome="finalize")


if __name__ == "__main__":
    main()
