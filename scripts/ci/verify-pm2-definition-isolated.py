#!/usr/bin/env python3
"""Exercise canonical PM2 definitions against a real isolated PM2 daemon."""

from __future__ import annotations

import argparse
import hashlib
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
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n")
    path.chmod(0o600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def configuration_identity(value):
    selected = {key: value[key] for key in ("component", "scope", "structure", "applicationEnv")}
    return hashlib.sha256((json.dumps(selected, sort_keys=True, separators=(",", ":")) + "\n").encode()).hexdigest()


def definition_request(role, runtime, port, build_id):
    source = "authenticated-proven-definition" if role == "rollback" else "canonical-private-config"
    value = {
        "schemaVersion": 1,
        "scope": "isolated-test",
        "role": role,
        "component": "frontend",
        "source": {"kind": source, "identitySha256": "0" * 64},
        "structure": {
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
        },
        "applicationEnv": {
            "allowlist": ["BUILD_ID", "NODE_ENV", "PORT"],
            "values": {"BUILD_ID": build_id, "NODE_ENV": "production", "PORT": str(port)},
        },
    }
    value["source"]["identitySha256"] = configuration_identity(value)
    return value


def process_rows(pm2, env):
    value = json.loads(run([pm2, "jlist"], env).stdout)
    return {row["name"]: row for row in value}


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
            handles = Path(f"/proc/{pid}/fd").iterdir()
            for handle in handles:
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


def validate_loaded(pm2, env, request, build_id, samples=3):
    rows = json.loads(run([pm2, "jlist"], env).stdout)
    matches = [row for row in rows if row.get("name") == "re7-isolated-frontend"]
    assert len(matches) == 1, "loaded_instance_count"
    row = matches[0]
    assert row["pm2_env"]["status"] == "online", "pm2_not_online"
    expected = request["structure"]
    loaded = row["pm2_env"]
    pid = int(row["pid"])
    assert loaded["pm_cwd"] == expected["cwd"], "loaded_cwd"
    assert loaded["pm_exec_path"] == expected["script"], "loaded_script"
    assert os.path.realpath(loaded["exec_interpreter"]) == os.path.realpath(expected["interpreter"]), "loaded_interpreter"
    assert loaded["exec_mode"] == "fork_mode", "loaded_exec_mode"
    assert int(loaded.get("instances") or 1) == 1, "loaded_instances"
    assert normalize_args(loaded.get("args")) == expected["args"], "loaded_args"
    assert "args" not in request["applicationEnv"]["values"], "env_args_present"
    assert os.path.realpath(f"/proc/{pid}/cwd") == os.path.realpath(expected["cwd"]), "process_cwd"
    assert os.path.realpath(f"/proc/{pid}/exe") == os.path.realpath(expected["interpreter"]), "process_interpreter"
    cmdline = [part.decode(errors="replace") for part in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if part]
    assert cmdline and cmdline[0].startswith("node "), "process_title"
    allowed, parents = descendants(pid)
    owners = socket_owners(int(expected["args"][2]), allowed)
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
        with urllib.request.urlopen(f"http://127.0.0.1:{expected['args'][2]}/app/login", timeout=3) as response:
            payload = json.loads(response.read())
            assert response.status == 200 and payload["buildId"] == build_id, "http_or_build_id"
            assert payload["entrypoint"] == expected["script"], "process_script"
            assert payload["argv"][-len(expected["args"]):] == expected["args"], "process_args"
        time.sleep(0.15)
    assert (Path(expected["cwd"]) / ".next/BUILD_ID").read_text().strip() == build_id, "build_id_file"
    return {"pid": pid, "ticks": process_stat(pid)["ticks"], "socketOwnerRelation": relation}


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


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--pm2", type=Path, required=True)
    options = args.parse_args()
    pm2 = str(options.pm2.resolve())
    if not options.pm2.is_file():
        raise SystemExit("pm2_binary_missing")
    candidate_port, rollback_port = free_port(), free_port()
    while rollback_port == candidate_port:
        rollback_port = free_port()
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
        candidate_request = definition_request("candidate", candidate_runtime, candidate_port, candidate_id)
        rollback_request = definition_request("rollback", rollback_runtime, rollback_port, rollback_id)
        candidate_request_path, rollback_request_path = root / "candidate-request.json", root / "rollback-request.json"
        candidate_definition, rollback_definition = root / "candidate-definition.json", root / "rollback-definition.json"
        write_private(candidate_request_path, candidate_request)
        write_private(rollback_request_path, rollback_request)

        contaminated = json.loads(json.dumps(candidate_request))
        contaminated["applicationEnv"] = {"allowlist": ["ArGs"], "values": {"ArGs": "start,-p,3000"}}
        contaminated_path = root / "contaminated-request.json"
        write_private(contaminated_path, contaminated)
        denied = run([sys.executable, str(CONTROL), "build", "--request", str(contaminated_path), "--output", str(root / "must-not-exist.json")], env, check=False)
        assert denied.returncode == 2 and not (root / "must-not-exist.json").exists(), "contaminated_fixture_not_denied"
        assert not list(pm2_home.iterdir()), "pm2_touched_before_collision_denial"

        for request_path, output in ((candidate_request_path, candidate_definition), (rollback_request_path, rollback_definition)):
            run([sys.executable, str(CONTROL), "build", "--request", str(request_path), "--output", str(output)], env)
            run([sys.executable, str(CONTROL), "validate", "--request", str(request_path), "--definition", str(output)], env)
            assert stat.S_IMODE(output.stat().st_mode) == 0o600

        try:
            run([pm2, "start", str(rollback_definition), "--only", "re7-isolated-frontend"], env)
            original = validate_loaded(pm2, env, rollback_request, rollback_id)
            run([pm2, "delete", "re7-isolated-frontend"], env)
            run([pm2, "start", str(candidate_definition), "--only", "re7-isolated-frontend"], env)
            candidate = validate_loaded(pm2, env, candidate_request, candidate_id)

            run([pm2, "save"], env)
            dump = pm2_home / "dump.pm2"
            assert dump.is_file(), "isolated_dump_missing"
            serialized = json.loads(dump.read_text())
            saved_rows = [item for item in serialized if item["name"] == "re7-isolated-frontend"]
            assert len(saved_rows) == 1, "serialized_instances"
            saved = saved_rows[0]
            assert normalize_args(saved["args"]) == candidate_request["structure"]["args"], "serialized_args"
            assert saved["exec_mode"] == "fork_mode", "serialized_shape"
            run([pm2, "kill"], env)
            run([pm2, "resurrect"], env)
            resurrected = validate_loaded(pm2, env, candidate_request, candidate_id)

            run([pm2, "delete", "re7-isolated-frontend"], env)
            run([pm2, "start", str(rollback_definition), "--only", "re7-isolated-frontend"], env)
            restored = validate_loaded(pm2, env, rollback_request, rollback_id)
            assert restored["pid"] != candidate["pid"], "rollback_pid_not_replaced"
            print(json.dumps({
                "result": "PM2_ISOLATED_CANDIDATE_AND_ROLLBACK_PASS",
                "candidateDefinitionSha256": sha(candidate_definition),
                "rollbackDefinitionSha256": sha(rollback_definition),
                "candidate": candidate,
                "resurrected": resurrected,
                "rollback": restored,
                "originalRollback": original,
                "samplesPerValidation": 3,
                "productionPm2Touched": False,
            }, sort_keys=True))
        finally:
            run([pm2, "delete", "all"], env, check=False)
            run([pm2, "kill"], env, check=False)
        for port in (candidate_port, rollback_port):
            with socket.socket() as handle:
                handle.settimeout(0.2)
                assert handle.connect_ex(("127.0.0.1", port)) != 0, "isolated_port_not_released"


if __name__ == "__main__":
    main()
