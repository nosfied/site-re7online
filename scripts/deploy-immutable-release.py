#!/usr/bin/env python3
"""Canonical immutable release pipeline for the Converta PM2 topology.

Builds happen off-host. Production promotion selects complete versioned
runtimes with explicit PM2 definitions; it never copies files into a live cwd.
Private captures contain the complete PM2 environment and must stay mode 0600.
"""

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
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

SCHEMA = 2
NODE_VERSION = "v20.20.0"
PROCESS_NAMES = {
    "api": "re7-whatsapp-agent",
    "frontend": "re7-admin-front",
    "worker": "re7-whatsapp-web-worker",
}
PM2_FIELDS = (
    "name", "cwd", "script", "interpreter", "args", "instances", "exec_mode",
    "autorestart", "watch", "max_memory_restart", "min_uptime", "max_restarts",
    "kill_timeout", "listen_timeout", "shutdown_with_message", "wait_ready",
    "treekill", "merge_logs", "log_date_format", "out_file", "error_file",
    "log_file", "combine_logs", "time", "env",
)


class Denied(RuntimeError):
    pass


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise Denied(reason)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path: Path, value: Any, mode: int = 0o600) -> None:
    require(path.is_absolute(), "private_output_not_absolute")
    require(not path.exists() and not path.is_symlink(), f"single_use_output_exists:{path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        raw = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
        os.write(fd, raw)
        os.fsync(fd)
        os.close(fd)
        fd = -1
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if fd >= 0:
            os.close(fd)
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json_regular(path: Path, expected_mode: int | None = None) -> Any:
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, f"not_regular:{path}")
    if expected_mode is not None:
        require(stat.S_IMODE(before.st_mode) == expected_mode, f"mode:{path}")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        raw = b""
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            raw += chunk
        after = os.fstat(fd)
    finally:
        os.close(fd)
    keys = ("st_dev", "st_ino", "st_mode", "st_uid", "st_gid", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns")
    require(tuple(getattr(before, key) for key in keys) == tuple(getattr(after, key) for key in keys), f"changed_while_reading:{path}")
    return json.loads(raw)


def run(argv: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None,
        capture: bool = True, timeout: int = 1800) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=capture,
                          timeout=timeout, check=False)


def checked(argv: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    result = run(argv, **kwargs)
    if result.returncode != 0:
        raise Denied(f"command_failed:{Path(argv[0]).name}:{argv[1] if len(argv) > 1 else 'run'}:{result.returncode}")
    return result


def tree_index(root: Path) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        meta = path.lstat()
        if path.is_symlink():
            target = os.readlink(path)
            require(not Path(target).is_absolute(), f"external_symlink:{rel}")
            resolved = (path.parent / target).resolve()
            require(resolved == root.resolve() or root.resolve() in resolved.parents, f"external_symlink:{rel}")
            result.append({"path": rel, "type": "symlink", "target": target, "mode": stat.S_IMODE(meta.st_mode)})
        elif path.is_dir():
            result.append({"path": rel, "type": "directory", "mode": stat.S_IMODE(meta.st_mode)})
        elif path.is_file():
            result.append({"path": rel, "type": "file", "size": meta.st_size, "sha256": sha256(path), "mode": stat.S_IMODE(meta.st_mode)})
        else:
            raise Denied(f"unsupported_runtime_entry:{rel}")
    return result


def index_digest(index: list[dict[str, Any]]) -> str:
    return hashlib.sha256((json.dumps(index, sort_keys=True, separators=(",", ":")) + "\n").encode()).hexdigest()


def copy_runtime(source: Path, destination: Path, includes: list[str]) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    for item in includes:
        src = source / item
        require(src.exists() or src.is_symlink(), f"runtime_input_missing:{item}")
        dst = destination / item
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir() and not src.is_symlink():
            shutil.copytree(src, dst, symlinks=True)
        else:
            shutil.copy2(src, dst, follow_symlinks=False)


def normalize_modes(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_symlink():
            continue
        os.chmod(path, 0o755 if path.is_dir() else (0o755 if os.access(path, os.X_OK) else 0o644))
    os.chmod(root, 0o755)


def reproducible_tar(source: Path, output: Path) -> None:
    with tarfile.open(output, "w:xz", format=tarfile.PAX_FORMAT) as archive:
        for path in [source, *sorted(source.rglob("*"))]:
            rel = Path(source.name) / path.relative_to(source)
            info = archive.gettarinfo(str(path), arcname=rel.as_posix())
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            if path.is_file() and not path.is_symlink():
                with path.open("rb") as stream:
                    archive.addfile(info, stream)
            else:
                archive.addfile(info)


def independent_extract(package: Path, expected: list[dict[str, Any]], release_name: str) -> None:
    with tempfile.TemporaryDirectory(prefix="immutable-release-extract-") as folder:
        old_umask = os.umask(0o022)
        try:
            with tarfile.open(package, "r:xz") as archive:
                archive.extractall(folder, filter="data")
        finally:
            os.umask(old_umask)
        actual = tree_index(Path(folder) / release_name)
        require(actual == expected, "independent_extraction_mismatch")


def git_output(repo: Path, *args: str) -> str:
    return checked(["git", "-C", str(repo), *args]).stdout.strip()


def prepare(args: argparse.Namespace) -> None:
    repo = args.repo.resolve()
    output = args.output.resolve()
    require(not str(output).startswith("/opt/re7online/"), "production_build_forbidden")
    require(not output.exists(), "release_output_exists")
    require(checked(["node", "--version"]).stdout.strip() == NODE_VERSION, "node_20_20_0_required")
    require(not git_output(repo, "status", "--porcelain", "--untracked-files=no"), "control_worktree_dirty")
    base = git_output(repo, "rev-parse", f"{args.base}^{{commit}}")
    target = git_output(repo, "rev-parse", f"{args.target}^{{commit}}")
    matrix = checked([str(repo / "scripts/deploy-impact-matrix.sh"), base, target], cwd=repo).stdout
    required = {"MIGRATION_REVIEW": "NO", "UNKNOWN_RUNTIME_IMPACT": "NO", "REVIEW_REQUIRED": "NO"}
    for key, expected in required.items():
        require(f"{key}: {expected}" in matrix, f"impact_matrix:{key}")
    changed = {"api": "BACKEND_BUILD: YES" in matrix, "frontend": "FRONTEND_BUILD: YES" in matrix, "worker": "WORKER_BUILD: YES" in matrix}
    require(any(changed.values()), "no_runtime_component_changed")
    output.mkdir(parents=True, mode=0o755)
    source = output / "source"
    checked(["git", "-C", str(repo), "worktree", "add", "--detach", str(source), target])
    try:
        api_source = source / "apps/whatsapp-agent"
        if changed["api"] or changed["worker"]:
            checked(["npm", "ci", "--include=dev"], cwd=api_source)
            checked(["npm", "run", "db:generate"], cwd=api_source)
        if changed["api"]:
            checked(["npm", "run", "build"], cwd=api_source)
        if changed["frontend"]:
            checked(["npm", "ci"], cwd=source)
            checked(["npm", "run", "build"], cwd=source, env={**os.environ, "NODE_OPTIONS": os.environ.get("NODE_OPTIONS", "--max-old-space-size=4096")})
        worker_source = source / "apps/whatsapp-web-worker"
        if changed["worker"]:
            checked(["npm", "ci", "--include=dev"], cwd=worker_source)
            checked(["npm", "run", "db:generate"], cwd=worker_source)
            checked(["npm", "run", "build"], cwd=worker_source)
        if changed["api"]:
            checked(["npm", "prune", "--omit=dev"], cwd=api_source)
        if changed["frontend"]:
            checked(["npm", "prune", "--omit=dev"], cwd=source)
        if changed["worker"]:
            checked(["npm", "prune", "--omit=dev"], cwd=worker_source)
        runtime = output / "runtime"
        runtime.mkdir()
        if changed["api"]:
            copy_runtime(api_source, runtime / "api", ["dist", "node_modules", "package.json", "package-lock.json", "prisma"])
        if changed["frontend"]:
            copy_runtime(source, runtime / "frontend", [".next", "node_modules", "public", "package.json", "package-lock.json"])
        if changed["worker"]:
            copy_runtime(worker_source, runtime / "worker", ["dist", "node_modules", "package.json", "package-lock.json"])
        build_id = (runtime / "frontend/.next/BUILD_ID").read_text().strip() if changed["frontend"] else None
        if changed["frontend"]:
            require(bool(build_id), "frontend_build_id_missing")
            require((runtime / "frontend/node_modules/next/dist/bin/next").is_file(), "frontend_launcher_missing")
        if changed["api"]:
            require((runtime / "api/dist/index.js").is_file(), "api_entry_missing")
        if changed["worker"]:
            require((runtime / "worker/dist/whatsapp-web-worker/src/index.js").is_file(), "worker_entry_missing")
        for forbidden in (".env", ".env.production", "src"):
            require(not (runtime / "api" / forbidden).exists(), f"forbidden_api_payload:{forbidden}")
        require(not (runtime / "frontend/src").exists(), "frontend_source_in_runtime")
        normalize_modes(runtime)
        index = tree_index(runtime)
        manifest = {
            "schemaVersion": SCHEMA,
            "deploymentClass": "IMMUTABLE_RELEASE",
            "baseCommit": base,
            "targetCommit": target,
            "builder": {"node": NODE_VERSION, "npm": checked(["npm", "--version"]).stdout.strip(), "architecture": os.uname().machine, "location": "external"},
            "components": {},
            "apiParallelProbe": {"allowed": False, "reason": "NO_PROVEN_SIDE_EFFECT_FREE_MODE"},
            "runtimeIndexSha256": index_digest(index),
            "pm2SavePolicy": "EXACTLY_ONCE_AFTER_ACCEPTANCE",
        }
        if changed["api"]:
            manifest["components"]["api"] = {"changed": True, "runtime": "runtime/api", "entrypoint": "dist/index.js", "entrySha256": sha256(runtime / "api/dist/index.js")}
        else:
            manifest["components"]["api"] = {"changed": False}
        if changed["frontend"]:
            manifest["components"]["frontend"] = {"changed": True, "runtime": "runtime/frontend", "entrypoint": "node_modules/next/dist/bin/next", "entrySha256": sha256(runtime / "frontend/node_modules/next/dist/bin/next"), "args": ["start", "-p", "3000"], "probeArgs": ["start", "-p", str(args.probe_port)], "buildId": build_id}
        else:
            manifest["components"]["frontend"] = {"changed": False}
        if changed["worker"]:
            manifest["components"]["worker"] = {"changed": True, "runtime": "runtime/worker", "entrypoint": "dist/whatsapp-web-worker/src/index.js", "entrySha256": sha256(runtime / "worker/dist/whatsapp-web-worker/src/index.js")}
        else:
            manifest["components"]["worker"] = {"changed": False}
        (output / "runtime-index.json").write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        package = output / f"immutable-{target[:12]}.tar.xz"
        reproducible_tar(runtime, package)
        independent_extract(package, index, "runtime")
        (output / "SHA256SUMS").write_text(
            f"{sha256(output / 'manifest.json')}  manifest.json\n"
            f"{sha256(output / 'runtime-index.json')}  runtime-index.json\n"
            f"{sha256(package)}  {package.name}\n"
        )
        os.chmod(output / "manifest.json", 0o444)
        os.chmod(output / "runtime-index.json", 0o444)
        os.chmod(output / "SHA256SUMS", 0o444)
        os.chmod(package, 0o444)
        print(json.dumps({"status": "PREPARED_INERT", "release": str(output), "target": target, "buildId": build_id, "packageSha256": sha256(package), "components": changed}))
    finally:
        if source.exists():
            checked(["git", "-C", str(repo), "worktree", "remove", "--force", str(source)])


def manifest(release: Path) -> dict[str, Any]:
    data = read_json_regular(release / "manifest.json")
    require(data.get("schemaVersion") == SCHEMA and data.get("deploymentClass") == "IMMUTABLE_RELEASE", "manifest_contract")
    index = read_json_regular(release / "runtime-index.json")
    require(index_digest(index) == data.get("runtimeIndexSha256"), "runtime_index_hash")
    require(tree_index(release / "runtime") == index, "runtime_tree_drift")
    return data


def pid_ticks(pid: int, proc_root: Path = Path("/proc")) -> int:
    text = (proc_root / str(pid) / "stat").read_text()
    return int(text.rsplit(") ", 1)[1].split()[19])


def pm2_rows(pm2: str) -> list[dict[str, Any]]:
    return json.loads(checked([pm2, "jlist"]).stdout)


def process_row(rows: list[dict[str, Any]], name: str) -> dict[str, Any]:
    matches = [row for row in rows if row.get("name") == name]
    require(len(matches) == 1, f"pm2_process_count:{name}")
    return matches[0]


def private_definition(row: dict[str, Any]) -> dict[str, Any]:
    env = row.get("pm2_env", {})
    app: dict[str, Any] = {"name": row["name"]}
    mapping = {"pm_cwd": "cwd", "pm_exec_path": "script", "exec_interpreter": "interpreter", "node_args": "node_args", "pm_out_log_path": "out_file", "pm_err_log_path": "error_file", "pm_log_path": "log_file"}
    for source, target in mapping.items():
        if env.get(source) is not None:
            app[target] = env[source]
    for field in PM2_FIELDS:
        if field in env and field not in ("name", "cwd", "script", "interpreter"):
            app[field] = env[field]
    app["env"] = dict(env.get("env", {}))
    require(all(app.get(key) for key in ("cwd", "script", "interpreter")), f"incomplete_return_definition:{row['name']}")
    return {"apps": [app]}


def pm_identity(row: dict[str, Any], proc_root: Path) -> dict[str, Any]:
    env = row["pm2_env"]
    pid = int(row["pid"])
    return {"name": row["name"], "pid": pid, "startTicks": pid_ticks(pid, proc_root), "status": env.get("status"), "cwd": env.get("pm_cwd"), "entrypoint": env.get("pm_exec_path"), "interpreter": env.get("exec_interpreter"), "restartTime": env.get("restart_time"), "unstableRestarts": env.get("unstable_restarts")}


def write_definition(path: Path, definition: dict[str, Any]) -> None:
    atomic_json(path, definition)


def health(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status == 200
    except Exception:
        return False


def owns_listening_socket(pid: int, port: int, proc_root: Path) -> bool:
    sockets: set[str] = set()
    try:
        for fd in (proc_root / str(pid) / "fd").iterdir():
            try:
                target = os.readlink(fd)
            except OSError:
                continue
            if target.startswith("socket:[") and target.endswith("]"):
                sockets.add(target[8:-1])
    except OSError:
        return False
    expected_port = f"{port:04X}"
    for table in (proc_root / str(pid) / "net/tcp", proc_root / str(pid) / "net/tcp6"):
        try:
            lines = table.read_text().splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            fields = line.split()
            if len(fields) > 9 and fields[1].rsplit(":", 1)[-1].upper() == expected_port and fields[3] == "0A" and fields[9] in sockets:
                return True
    return False


def record_predicate(report: Path, records: list[dict[str, Any]], name: str, observed: Any, expected: Any) -> bool:
    passed = observed == expected
    records.append({"name": name, "at": time.time(), "observed": observed, "expected": expected, "result": "PASS" if passed else "FAIL"})
    temporary = report.with_suffix(".tmp")
    temporary.write_text(json.dumps({"predicates": records}, indent=2, sort_keys=True) + "\n")
    os.chmod(temporary, 0o600)
    with temporary.open("rb") as stream:
        os.fsync(stream.fileno())
    os.replace(temporary, report)
    return passed


def candidate_definition(return_definition: dict[str, Any], name: str, cwd: Path, script: Path, args: list[str]) -> dict[str, Any]:
    result = json.loads(json.dumps(return_definition))
    app = result["apps"][0]
    require(app["name"] == name, f"definition_name:{name}")
    app["cwd"] = str(cwd)
    app["script"] = str(script)
    app["args"] = args
    return result


def capture(args: argparse.Namespace, release: Path, data: dict[str, Any], transaction: Path) -> dict[str, Any]:
    require(not transaction.exists(), "transaction_exists")
    transaction.mkdir(parents=True, mode=0o700)
    rows = pm2_rows(args.pm2)
    proc_root = Path(args.proc_root)
    identities = {role: pm_identity(process_row(rows, name), proc_root) for role, name in PROCESS_NAMES.items()}
    definitions = {}
    for role, name in PROCESS_NAMES.items():
        definition = private_definition(process_row(rows, name))
        path = transaction / f"return-{role}.private.json"
        write_definition(path, definition)
        definitions[role] = {"path": str(path), "sha256": sha256(path)}
    dump = Path(args.dump).resolve()
    dump_meta = dump.stat()
    require(stat.S_ISREG(dump_meta.st_mode) and stat.S_IMODE(dump_meta.st_mode) == 0o600, "dump_not_regular_0600")
    dump_copy = transaction / "dump.before.pm2"
    shutil.copy2(dump, dump_copy)
    os.chmod(dump_copy, 0o600)
    candidates = {}
    for role in ("api", "worker", "frontend"):
        component = data["components"][role]
        if not component.get("changed"):
            continue
        root = release / component["runtime"]
        definition = candidate_definition(read_json_regular(Path(definitions[role]["path"]), 0o600), PROCESS_NAMES[role], root, root / component["entrypoint"], component.get("args", []))
        path = transaction / f"candidate-{role}.private.json"
        write_definition(path, definition)
        candidates[role] = {"path": str(path), "sha256": sha256(path)}
    supports = {}
    if data["components"]["api"].get("changed"):
        live_data = Path(identities["api"]["cwd"]) / ".data"
        require(live_data.exists(), "api_live_data_missing")
        candidate_data = release / data["components"]["api"]["runtime"] / ".data"
        require(not candidate_data.exists() and not candidate_data.is_symlink(), "api_candidate_data_preexists")
        target = live_data.resolve()
        require(target.is_dir(), "api_live_data_not_directory")
        candidate_data.symlink_to(target, target_is_directory=True)
        require(candidate_data.resolve() == target, "api_data_link_mismatch")
        supports["apiData"] = {"path": str(candidate_data), "target": str(target)}
    state = {"schemaVersion": 1, "state": "CAPTURED", "release": str(release), "targetCommit": data["targetCommit"], "identities": identities, "definitions": definitions, "candidateDefinitions": candidates, "runtimeSupports": supports, "selected": [], "dump": {"path": str(dump), "sha256": sha256(dump), "returnPath": str(dump_copy), "returnSha256": sha256(dump_copy)}, "saveCount": 0}
    atomic_json(transaction / "state.private.json", state)
    return state


def select(pm2: str, name: str, definition: Path) -> None:
    require(checked([pm2, "delete", name]).returncode == 0, f"delete_failed:{name}")
    checked([pm2, "start", str(definition), "--only", name])


def probe_frontend(args: argparse.Namespace) -> None:
    release = args.release.resolve()
    data = manifest(release)
    component = data["components"]["frontend"]
    runtime = release / component["runtime"]
    name = f"re7-frontend-probe-{data['targetCommit'][:12]}"
    definition = {
        "apps": [{
            "name": name,
            "cwd": str(runtime),
            "script": str(runtime / component["entrypoint"]),
            "interpreter": shutil.which("node") or "node",
            "args": component["probeArgs"],
            "instances": 1,
            "exec_mode": "fork",
            "autorestart": True,
            "watch": False,
            "env": {"NODE_ENV": "production"},
        }]
    }
    with tempfile.TemporaryDirectory(prefix="immutable-front-probe-") as folder:
        root = Path(folder)
        definition_path = root / "probe.json"
        definition_path.write_text(json.dumps(definition, sort_keys=True) + "\n")
        env = {**os.environ, "PM2_HOME": str(root / "pm2")}
        def pm2(*values: str) -> subprocess.CompletedProcess[str]:
            return checked([args.pm2, *values], env=env)
        report: dict[str, Any] = {"samples": [], "urls": {}, "pm2SaveCalls": 0}
        try:
            pm2("start", str(definition_path), "--only", name)
            deadline = time.time() + 30
            while time.time() < deadline and not health(f"http://127.0.0.1:{args.port}/app/login"):
                time.sleep(0.5)
            first: tuple[int, int] | None = None
            for _ in range(3):
                rows = json.loads(pm2("jlist").stdout)
                row = process_row(rows, name)
                identity = pm_identity(row, Path("/proc"))
                current = (identity["pid"], identity["startTicks"])
                if first is None:
                    first = current
                require(current == first, "frontend_probe_identity_unstable")
                require(identity["status"] == "online", "frontend_probe_offline")
                require(identity["cwd"] == str(runtime), "frontend_probe_cwd")
                require(identity["entrypoint"] == str(runtime / component["entrypoint"]), "frontend_probe_entrypoint")
                require(identity["restartTime"] == 0 and identity["unstableRestarts"] == 0, "frontend_probe_restart")
                report["samples"].append(identity)
                time.sleep(1)
            urls = ["/app/login", "/app/inbox", "/app/crm", f"/_next/static/{component['buildId']}/_buildManifest.js"]
            for suffix in urls:
                value = health(f"http://127.0.0.1:{args.port}{suffix}")
                report["urls"][suffix] = 200 if value else "FAIL"
                require(value, f"frontend_probe_http:{suffix}")
            report["result"] = "FRONTEND_CANDIDATE_REAL_PASS"
            report_path = release / "frontend-probe-report.json"
            require(not report_path.exists(), "frontend_probe_already_consumed")
            report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
            os.chmod(report_path, 0o444)
            print("FRONTEND_CANDIDATE_REAL_PASS")
        finally:
            run([args.pm2, "delete", name], env=env)
            run([args.pm2, "kill"], env=env)


def verify_component(args: argparse.Namespace, role: str, expected: dict[str, Any], entry_sha: str,
                     urls: list[str], report: Path, records: list[dict[str, Any]]) -> bool:
    name = PROCESS_NAMES[role]
    proc_root = Path(args.proc_root)
    passed = True
    first: dict[str, Any] | None = None
    for sample in range(3):
        row = process_row(pm2_rows(args.pm2), name)
        observed = pm_identity(row, proc_root)
        if first is None:
            first = observed
        for key in ("pid", "startTicks"):
            passed &= record_predicate(report, records, f"{role}.sample{sample}.{key}", observed[key], first[key])
        passed &= record_predicate(report, records, f"{role}.sample{sample}.status", observed["status"], "online")
        passed &= record_predicate(report, records, f"{role}.sample{sample}.cwd", observed["cwd"], expected["cwd"])
        passed &= record_predicate(report, records, f"{role}.sample{sample}.entrypoint", observed["entrypoint"], expected["script"])
        passed &= record_predicate(report, records, f"{role}.sample{sample}.interpreter", observed["interpreter"], expected["interpreter"])
        passed &= record_predicate(report, records, f"{role}.sample{sample}.restartTime", observed["restartTime"], 0)
        passed &= record_predicate(report, records, f"{role}.sample{sample}.unstableRestarts", observed["unstableRestarts"], 0)
        passed &= record_predicate(report, records, f"{role}.sample{sample}.entrySha256", sha256(Path(expected["script"])), entry_sha)
        if role == "api":
            passed &= record_predicate(report, records, f"{role}.sample{sample}.ownsSocket3001", owns_listening_socket(observed["pid"], 3001, proc_root), True)
        for number, url in enumerate(urls):
            passed &= record_predicate(report, records, f"{role}.sample{sample}.health{number}", health(url), True)
        if sample < 2:
            time.sleep(args.sample_delay)
    return bool(passed)


def rollback(args: argparse.Namespace, transaction: Path, state: dict[str, Any], records: list[dict[str, Any]], reason: str) -> None:
    report = transaction / "rollback-report.private.json"
    failures: list[str] = []
    for role in reversed(state.get("selected", [])):
        name = PROCESS_NAMES[role]
        definition = Path(state["definitions"][role]["path"])
        result = run([args.pm2, "delete", name])
        if result.returncode != 0:
            failures.append(f"delete:{role}:{result.returncode}")
            continue
        result = run([args.pm2, "start", str(definition), "--only", name])
        if result.returncode != 0:
            failures.append(f"start:{role}:{result.returncode}")
    if not failures:
        rows = pm2_rows(args.pm2)
        proc_root = Path(args.proc_root)
        for role in ("api", "frontend", "worker"):
            observed = pm_identity(process_row(rows, PROCESS_NAMES[role]), proc_root)
            expected = state["identities"][role]
            for key in ("cwd", "entrypoint", "interpreter"):
                if observed[key] != expected[key]:
                    failures.append(f"identity:{role}:{key}")
        for url in (args.api_health_local, args.frontend_health_local):
            if not health(url):
                failures.append(f"health:{url}")
    atomic_json(report, {"reason": reason, "failures": failures, "result": "ROLLED_BACK" if not failures else "ROLLBACK_FAILED", "predicatesBeforeDecision": records})
    if failures:
        raise Denied("rollback_failed:" + ",".join(failures))
    state["state"] = "ROLLED_BACK"
    state["rollbackReport"] = str(report)
    rewrite_state(transaction / "state.private.json", state)
    raise Denied(f"rolled_back:{reason}")


def rewrite_state(path: Path, value: Any) -> None:
    temporary = path.with_suffix(".rewrite")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    os.chmod(temporary, 0o600)
    with temporary.open("rb") as stream:
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def promote(args: argparse.Namespace) -> None:
    release = args.release.resolve()
    data = manifest(release)
    if data["components"]["api"].get("changed"):
        require(data.get("apiParallelProbe", {}).get("allowed") is False, "api_parallel_policy_missing")
    transaction = args.transaction.resolve()
    state = capture(args, release, data, transaction)
    report = transaction / "promotion-report.private.json"
    records: list[dict[str, Any]] = []
    try:
        for role in ("api", "worker", "frontend"):
            component = data["components"][role]
            if not component.get("changed"):
                continue
            definition = Path(state["candidateDefinitions"][role]["path"])
            expected = read_json_regular(definition, 0o600)["apps"][0]
            state["selected"].append(role)
            rewrite_state(transaction / "state.private.json", state)
            select(args.pm2, PROCESS_NAMES[role], definition)
            urls = [args.api_health_local, args.api_health_public] if role == "api" else ([args.frontend_health_local, args.frontend_health_public] if role == "frontend" else [])
            if not verify_component(args, role, expected, component["entrySha256"], urls, report, records):
                rollback(args, transaction, state, records, f"{role}_verification")
            state["state"] = f"{role.upper()}_VERIFIED"
            rewrite_state(transaction / "state.private.json", state)
            if role == "frontend":
                actual_build = Path(expected["cwd"], ".next/BUILD_ID").read_text().strip()
                if not record_predicate(report, records, "frontend.buildId", actual_build, component["buildId"]):
                    rollback(args, transaction, state, records, "frontend_build_id")
        if not data["components"]["worker"].get("changed"):
            worker = pm_identity(process_row(pm2_rows(args.pm2), PROCESS_NAMES["worker"]), Path(args.proc_root))
            for key in ("pid", "startTicks", "cwd", "entrypoint"):
                if not record_predicate(report, records, f"worker.preserved.{key}", worker[key], state["identities"]["worker"][key]):
                    rollback(args, transaction, state, records, "worker_changed")
        state["state"] = "AWAITING_ACCEPTANCE"
        state["candidateIdentities"] = {role: pm_identity(process_row(pm2_rows(args.pm2), PROCESS_NAMES[role]), Path(args.proc_root)) for role in PROCESS_NAMES}
        rewrite_state(transaction / "state.private.json", state)
        print("AWAITING_ACCEPTANCE")
    except Denied as exc:
        if str(exc).startswith(("rolled_back:", "rollback_failed:")):
            raise
        rollback(args, transaction, state, records, f"selection:{exc}")
    except Exception as exc:
        rollback(args, transaction, state, records, f"unexpected:{type(exc).__name__}")


def commit(args: argparse.Namespace) -> None:
    transaction = args.transaction.resolve()
    state = read_json_regular(transaction / "state.private.json", 0o600)
    require(state.get("state") == "AWAITING_ACCEPTANCE", "not_awaiting_acceptance")
    acceptance = read_json_regular(args.acceptance.resolve(), 0o600)
    require(acceptance == {"targetCommit": state["targetCommit"], "decision": "ACCEPTED"}, "acceptance_binding")
    current = {role: pm_identity(process_row(pm2_rows(args.pm2), PROCESS_NAMES[role]), Path(args.proc_root)) for role in PROCESS_NAMES}
    require(current == state["candidateIdentities"], "candidate_identity_drift")
    require(health(args.api_health_local) and health(args.api_health_public), "api_health_before_save")
    require(health(args.frontend_health_local) and health(args.frontend_health_public), "frontend_health_before_save")
    require(state.get("saveCount") == 0, "save_replay")
    checked([args.pm2, "save"])
    dump = Path(args.dump)
    meta = dump.stat()
    require(stat.S_ISREG(meta.st_mode) and stat.S_IMODE(meta.st_mode) == 0o600, "saved_dump_not_regular_0600")
    state["saveCount"] = 1
    state["state"] = "DEPLOYED"
    state["savedDumpSha256"] = sha256(dump)
    rewrite_state(transaction / "state.private.json", state)
    print("DEPLOYED")


def rollback_command(args: argparse.Namespace) -> None:
    transaction = args.transaction.resolve()
    state = read_json_regular(transaction / "state.private.json", 0o600)
    require(state.get("state") != "DEPLOYED" and state.get("saveCount") == 0, "rollback_after_pm2_save_requires_separate_window")
    rollback(args, transaction, state, [], "operator_requested")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    sub = result.add_subparsers(dest="command", required=True)
    build = sub.add_parser("prepare")
    build.add_argument("--repo", type=Path, required=True)
    build.add_argument("--base", required=True)
    build.add_argument("--target", required=True)
    build.add_argument("--output", type=Path, required=True)
    build.add_argument("--probe-port", type=int, default=3100)
    build.set_defaults(handler=prepare)
    probe = sub.add_parser("probe-frontend")
    probe.add_argument("--release", type=Path, required=True)
    probe.add_argument("--pm2", required=True)
    probe.add_argument("--port", type=int, default=3100)
    probe.set_defaults(handler=probe_frontend)
    for name, handler in (("promote", promote), ("commit", commit), ("rollback", rollback_command)):
        command = sub.add_parser(name)
        command.add_argument("--transaction", type=Path, required=True)
        command.add_argument("--pm2", default="pm2")
        command.add_argument("--proc-root", default="/proc")
        command.add_argument("--dump", default=str(Path.home() / ".pm2/dump.pm2"))
        command.add_argument("--api-health-local", default="http://127.0.0.1:3001/health")
        command.add_argument("--api-health-public", default="https://converta.re7online.com/agent-api/health")
        command.add_argument("--frontend-health-local", default="http://127.0.0.1:3000/app/login")
        command.add_argument("--frontend-health-public", default="https://converta.re7online.com/app/login")
        command.add_argument("--sample-delay", type=float, default=1.0)
        command.set_defaults(handler=handler)
        if name == "promote":
            command.add_argument("--release", type=Path, required=True)
        if name == "commit":
            command.add_argument("--acceptance", type=Path, required=True)
    return result


def main() -> int:
    os.umask(0o077)
    args = parser().parse_args()
    try:
        args.handler(args)
        return 0
    except Denied as exc:
        print(f"DENIED:{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
