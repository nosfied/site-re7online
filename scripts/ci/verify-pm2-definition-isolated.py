#!/usr/bin/env python3
"""Exercise source-bound candidate and rollback definitions in an isolated PM2."""

from __future__ import annotations

import argparse
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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTROL = ROOT / "scripts/pm2-definition-control.py"
SPEC = importlib.util.spec_from_file_location("pm2_definition_control", CONTROL)
assert SPEC and SPEC.loader
CONTROL_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL_MODULE)


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
        "environmentKeys": ["BUILD_ID", "NODE_ENV", "PORT"],
    }


def source_artifact(role, runtime, port, build_id):
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
        "definition": {"apps": [{
            "name": "re7-isolated-frontend",
            "script": str(runtime / "server.js"),
            "args": ["start", "-p", str(port)],
            "cwd": str(runtime),
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
            "out_file": str(runtime / "stdout.log"),
            "error_file": str(runtime / "stderr.log"),
            "merge_logs": False,
            "watch": False,
            "env": {"BUILD_ID": build_id, "NODE_ENV": "production", "PORT": str(port)},
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


def normalize_args(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        import shlex
        return shlex.split(value)
    raise AssertionError("loaded_args_type")


def validate_loaded(pm2, env, source, build_id, samples=3):
    app = source["definition"]["apps"][0]
    rows = json.loads(run([pm2, "jlist"], env).stdout)
    matches = [row for row in rows if row.get("name") == app["name"]]
    assert len(matches) == 1, "loaded_instance_count"
    row = matches[0]
    loaded = row["pm2_env"]
    assert loaded["status"] == "online", "pm2_not_online"
    pid = int(row["pid"])
    assert loaded["pm_cwd"] == app["cwd"], "loaded_cwd"
    assert loaded["pm_exec_path"] == app["script"], "loaded_script"
    assert os.path.realpath(loaded["exec_interpreter"]) == os.path.realpath(app["interpreter"]), "loaded_interpreter"
    assert loaded["exec_mode"] == app["exec_mode"], "loaded_exec_mode"
    assert int(loaded.get("instances") or 1) == app["instances"], "loaded_instances"
    assert normalize_args(loaded.get("args")) == app["args"], "loaded_args"
    for key, expected in app["env"].items():
        assert loaded.get(key) == expected, f"loaded_allowlisted_env:{key}"
    for key in ("autorestart", "restart_delay", "kill_timeout"):
        assert loaded.get(key) == app[key], f"loaded_policy:{key}"
    assert bool(loaded.get("merge_logs", False)) is app["merge_logs"], "loaded_policy:merge_logs"
    runtime_logs = CONTROL_MODULE.validate_runtime_log_paths(app, loaded)
    assert os.path.realpath(f"/proc/{pid}/cwd") == os.path.realpath(app["cwd"]), "process_cwd"
    assert os.path.realpath(f"/proc/{pid}/exe") == os.path.realpath(app["interpreter"]), "process_interpreter"
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
        with urllib.request.urlopen(f"http://127.0.0.1:{app['args'][2]}/app/login", timeout=3) as response:
            payload = json.loads(response.read())
            assert response.status == 200 and payload["buildId"] == build_id, "http_or_build_id"
            assert payload["entrypoint"] == app["script"], "process_script"
            assert payload["argv"][-len(app["args"]):] == app["args"], "process_args"
        time.sleep(0.15)
    assert (Path(app["cwd"]) / ".next/BUILD_ID").read_text().strip() == build_id, "build_id_file"
    return {
        "pid": pid,
        "ticks": process_stat(pid)["ticks"],
        "socketOwnerRelation": relation,
        "structureExact": True,
        "allowlistedEnvironmentExact": True,
        "pm2PoliciesExact": True,
        "canonicalLogDefinitionExact": True,
        "runtimeLogPathsSemantic": True,
        "pmIdUsedForLogPaths": loaded["pm_id"],
        "runtimeLogPathCount": len(runtime_logs),
    }


SERVER = r'''const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
if (argv.length !== 3 || argv[0] !== "start" || argv[1] !== "-p") process.exit(64);
const port = Number(argv[2]);
const buildId = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
http.createServer((req, res) => {
  if (req.url === "/app/login") {
    res.writeHead(200, {"content-type": "application/json"});
    return res.end(JSON.stringify({buildId, entrypoint: __filename, argv: process.argv.slice(1)}));
  }
  res.writeHead(404); res.end("not found");
}).listen(port, "127.0.0.1");
'''


def create_runtime(path, build_id):
    (path / ".next").mkdir(parents=True)
    (path / ".next/BUILD_ID").write_text(build_id + "\n")
    (path / "server.js").write_text(SERVER)


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
    options = parser.parse_args()
    pm2 = str(options.pm2.resolve())
    if not options.pm2.is_file():
        raise SystemExit("pm2_binary_missing")
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="re7-pm2-definition-proof-") as directory:
        root = Path(directory)
        pm2_home = root / "pm2-home"
        pm2_home.mkdir(mode=0o700)
        env = os.environ.copy()
        env["PM2_HOME"] = str(pm2_home)
        candidate_runtime, rollback_runtime = root / "candidate", root / "rollback"
        candidate_id, rollback_id = "candidate-build-id", "rollback-build-id"
        create_runtime(candidate_runtime, candidate_id)
        create_runtime(rollback_runtime, rollback_id)
        requests = {
            "candidate": definition_request("candidate"),
            "rollback": definition_request("rollback"),
        }
        sources = {
            "candidate": source_artifact("candidate", candidate_runtime, port, candidate_id),
            "rollback": source_artifact("rollback", rollback_runtime, port, rollback_id),
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
        assert not list(pm2_home.iterdir()), "pm2_touched_before_pair_validation"

        try:
            run([pm2, "start", str(paths["rollback_definition"]), "--only", "re7-isolated-frontend"], env)
            original = validate_loaded(pm2, env, sources["rollback"], rollback_id)
            run([pm2, "delete", "re7-isolated-frontend"], env)
            run([pm2, "start", str(paths["candidate_definition"]), "--only", "re7-isolated-frontend"], env)
            candidate = validate_loaded(pm2, env, sources["candidate"], candidate_id)

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
            resurrected = validate_loaded(pm2, env, sources["candidate"], candidate_id)
            assert {key: sha(path) for key, path in paths.items()} == sealed_hashes, "canonical_artifact_changed_after_resurrect"

            run([pm2, "delete", "re7-isolated-frontend"], env)
            run([pm2, "start", str(paths["rollback_definition"]), "--only", "re7-isolated-frontend"], env)
            restored = validate_loaded(pm2, env, sources["rollback"], rollback_id)
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
                "productionPm2Touched": False,
            }, sort_keys=True))
        finally:
            run([pm2, "delete", "all"], env, check=False)
            run([pm2, "kill"], env, check=False)
        with socket.socket() as handle:
            handle.settimeout(0.2)
            assert handle.connect_ex(("127.0.0.1", port)) != 0, "isolated_port_not_released"


if __name__ == "__main__":
    main()
