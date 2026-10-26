#!/usr/bin/env python3
"""Transactional frontend-only activation using the canonical readiness observer.

This executor intentionally does not build, save PM2 state, write DEPLOYED, or
change the campaign guard.  It selects one prebuilt frontend and stops at
AWAITING_ACCEPTANCE.  A readiness denial returns the frontend to its authenticated
rollback root before reporting ROLLED_BACK.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import secrets
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

SHA256 = re.compile(r"^[0-9a-f]{64}$")
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
PLAN_KEYS = {
    "schemaVersion", "target", "releaseId", "package", "control", "releaseVerifier", "pm2",
    "lockPath", "transactionRoot", "guardPath", "dumpPath", "frontend",
    "preservedProcesses",
}
BINDING_KEYS = {"request", "sourceArtifact", "sourceSha256", "definition", "releaseRoot"}


class Denied(RuntimeError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_regular_stable(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            deny(f"not_regular:{path.name}")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        identity = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns, item.st_mode)
        if identity(before) != identity(after):
            deny(f"changed_while_reading:{path.name}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_exclusive_durable(path: Path, raw: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        view = memoryview(raw)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                deny(f"evidence_write:{path.name}")
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_directory(path.parent)


def replace_durable(path: Path, raw: bytes) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, raw)
        os.fsync(fd)
        os.close(fd)
        fd = -1
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        if fd >= 0:
            os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def load_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        deny(f"{label}_json")
    if not isinstance(value, dict):
        deny(f"{label}_object")
    return value


def exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        deny(f"{label}_keys")


def absolute(value: Any, label: str) -> Path:
    if not isinstance(value, str) or not Path(value).is_absolute():
        deny(f"{label}_absolute")
    return Path(value)


def validate_binding(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        deny(f"{label}_object")
    exact_keys(value, BINDING_KEYS, label)
    for field in ("request", "sourceArtifact", "definition", "releaseRoot"):
        absolute(value[field], f"{label}_{field}")
    if not isinstance(value["sourceSha256"], str) or not SHA256.fullmatch(value["sourceSha256"]):
        deny(f"{label}_source_sha256")
    return value


def load_plan(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not SHA256.fullmatch(expected_sha256):
        deny("plan_sha256_format")
    raw = read_regular_stable(path)
    if sha256_bytes(raw) != expected_sha256:
        deny("plan_sha256")
    value = load_json(raw, "plan")
    exact_keys(value, PLAN_KEYS, "plan")
    if value["schemaVersion"] != 1:
        deny("plan_schema")
    if not isinstance(value["target"], str) or not GIT_SHA.fullmatch(value["target"]):
        deny("target")
    if not isinstance(value["releaseId"], str) or Path(value["releaseId"]).name != value["releaseId"]:
        deny("release_id")
    package = value["package"]
    control = value["control"]
    verifier = value["releaseVerifier"]
    frontend = value["frontend"]
    if not isinstance(package, dict) or set(package) != {"path", "sha256"}:
        deny("package_contract")
    if not SHA256.fullmatch(str(package["sha256"])):
        deny("package_sha256_format")
    absolute(package["path"], "package_path")
    if not isinstance(control, dict) or set(control) != {"path", "sha256"}:
        deny("control_contract")
    if not SHA256.fullmatch(str(control["sha256"])):
        deny("control_sha256_format")
    absolute(control["path"], "control_path")
    if not isinstance(verifier, dict) or set(verifier) != {"path", "sha256"}:
        deny("release_verifier_contract")
    if not SHA256.fullmatch(str(verifier["sha256"])):
        deny("release_verifier_sha256_format")
    absolute(verifier["path"], "release_verifier_path")
    required_frontend = {
        "stablePath", "processName", "port", "localHealth", "publicHealth",
        "candidate", "rollback",
    }
    if not isinstance(frontend, dict) or set(frontend) != required_frontend:
        deny("frontend_contract")
    if frontend["port"] != 3000 or not all(isinstance(frontend[k], str) and frontend[k] for k in ("processName", "localHealth", "publicHealth")):
        deny("frontend_identity")
    absolute(frontend["stablePath"], "frontend_stable_path")
    validate_binding(frontend["candidate"], "candidate")
    validate_binding(frontend["rollback"], "rollback")
    if Path(frontend["candidate"]["releaseRoot"]).name != value["releaseId"]:
        deny("candidate_release_id")
    for field in ("pm2", "lockPath", "transactionRoot", "guardPath", "dumpPath"):
        absolute(value[field], field)
    if value["preservedProcesses"] != ["re7-whatsapp-agent", "re7-whatsapp-web-worker"]:
        deny("preserved_processes")
    return value


def process_ticks(pid: int) -> int:
    raw = Path(f"/proc/{pid}/stat").read_text()
    return int(raw.rsplit(") ", 1)[1].split()[19])


def pm2_rows(pm2: Path) -> list[dict[str, Any]]:
    completed = subprocess.run([str(pm2), "jlist"], capture_output=True, text=True, timeout=15)
    if completed.returncode != 0:
        deny("pm2_jlist")
    try:
        rows = json.loads(completed.stdout)
    except json.JSONDecodeError:
        deny("pm2_jlist_json")
    if not isinstance(rows, list):
        deny("pm2_jlist_shape")
    return rows


def process_snapshot(pm2: Path, names: list[str]) -> dict[str, Any]:
    rows = pm2_rows(pm2)
    result = {}
    for name in names:
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            deny(f"preserved_process_count:{name}")
        row = matches[0]
        env = row.get("pm2_env", {})
        pid = int(row.get("pid") or 0)
        if pid <= 0:
            deny(f"preserved_process_pid:{name}")
        result[name] = {
            "pid": pid, "startTicks": process_ticks(pid), "status": env.get("status"),
            "restartCount": env.get("restart_time"), "cwd": env.get("pm_cwd"),
            "script": env.get("pm_exec_path"),
        }
    return result


def preservation_snapshot(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "processes": process_snapshot(Path(plan["pm2"]), plan["preservedProcesses"]),
        "guardSha256": sha256_file(Path(plan["guardPath"])),
        "dumpSha256": sha256_file(Path(plan["dumpPath"])),
    }


def atomic_select(stable_path: Path, target: Path) -> None:
    if target.resolve(strict=True) != target:
        target = target.resolve(strict=True)
    temporary = stable_path.parent / f".{stable_path.name}.{os.getpid()}.partial"
    if temporary.exists() or temporary.is_symlink():
        deny("selection_temporary_exists")
    os.symlink(target, temporary)
    try:
        os.replace(temporary, stable_path)
        fsync_directory(stable_path.parent)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def invoke_readiness(plan: dict[str, Any], binding: dict[str, Any], tx: Path, label: str) -> dict[str, Any]:
    report = tx / f"{label}.report.private.json"
    stdout_path = tx / f"{label}.stdout.private.txt"
    stderr_path = tx / f"{label}.stderr.private.txt"
    command = [
        sys.executable, plan["control"]["path"], "wait-readiness",
        "--request", binding["request"], "--source-artifact", binding["sourceArtifact"],
        "--source-sha256", binding["sourceSha256"], "--definition", binding["definition"],
        "--pm2", plan["pm2"], "--stable-path", plan["frontend"]["stablePath"],
        "--release-root", binding["releaseRoot"], "--port", "3000",
        "--local-health", plan["frontend"]["localHealth"],
        "--public-health", plan["frontend"]["publicHealth"],
        "--deadline-seconds", "30", "--poll-seconds", "0.5", "--report", str(report),
    ]
    completed = subprocess.run(command, capture_output=True, timeout=45)
    write_exclusive_durable(stdout_path, completed.stdout)
    write_exclusive_durable(stderr_path, completed.stderr)
    if not report.exists() or report.is_symlink():
        deny(f"READINESS_OBSERVABILITY_DEFECT:{label}:report_missing")
    report_raw = read_regular_stable(report)
    # The observer writes the report itself; synchronize it and its containing directory
    # before making a rollback decision.
    with report.open("rb") as handle:
        os.fsync(handle.fileno())
    fsync_directory(tx)
    report_value = load_json(report_raw, f"{label}_report")
    expected_result = "READINESS_PASS" if completed.returncode == 0 else "READINESS_DENY"
    if report_value.get("result") != expected_result or report_value.get("component") != "frontend" or report_value.get("port") != 3000:
        deny(f"READINESS_OBSERVABILITY_DEFECT:{label}:report_mismatch")
    if completed.returncode != 0:
        reason = report_value.get("reason")
        if not isinstance(reason, str) or not reason:
            deny(f"READINESS_OBSERVABILITY_DEFECT:{label}:reason_missing")
        raise Denied(reason)
    if report_value.get("releaseId") != Path(binding["releaseRoot"]).name:
        deny(f"READINESS_OBSERVABILITY_DEFECT:{label}:release_mismatch")
    return report_value


def validate_static_inputs(plan: dict[str, Any], evidence_root: Path | None = None) -> None:
    package = Path(plan["package"]["path"])
    control = Path(plan["control"]["path"])
    if sha256_file(package) != plan["package"]["sha256"]:
        deny("package_sha256")
    control_raw = read_regular_stable(control)
    if sha256_bytes(control_raw) != plan["control"]["sha256"]:
        deny("control_sha256")
    verifier = Path(plan["releaseVerifier"]["path"])
    verifier_raw = read_regular_stable(verifier)
    if sha256_bytes(verifier_raw) != plan["releaseVerifier"]["sha256"]:
        deny("release_verifier_sha256")
    candidate = Path(plan["frontend"]["candidate"]["releaseRoot"])
    if candidate.name != plan["releaseId"] or not candidate.is_dir() or candidate.is_symlink():
        deny("candidate_release_root")
    build_id = candidate / ".next/BUILD_ID"
    if not read_regular_stable(build_id).strip():
        deny("candidate_build_id")
    candidate = plan["frontend"]["candidate"]
    rollback = plan["frontend"]["rollback"]
    pair = subprocess.run([
        sys.executable, str(control), "validate-pair",
        "--candidate-request", candidate["request"],
        "--candidate-source-artifact", candidate["sourceArtifact"],
        "--candidate-source-sha256", candidate["sourceSha256"],
        "--candidate-definition", candidate["definition"],
        "--rollback-request", rollback["request"],
        "--rollback-source-artifact", rollback["sourceArtifact"],
        "--rollback-source-sha256", rollback["sourceSha256"],
        "--rollback-definition", rollback["definition"],
    ], capture_output=True, timeout=30)
    if evidence_root is not None:
        write_exclusive_durable(evidence_root / "validate-pair.stdout.private.txt", pair.stdout)
        write_exclusive_durable(evidence_root / "validate-pair.stderr.private.txt", pair.stderr)
    if pair.returncode != 0:
        deny("pm2_definition_pair")
    for label, source_args in (
        ("package", ["--package", str(package)]),
        ("release-root", ["--release-root", str(candidate)]),
    ):
        completed = subprocess.run([
            sys.executable, str(verifier), "verify", *source_args,
            "--target", plan["target"], "--release-id", plan["releaseId"],
            "--components", "api,frontend",
        ], capture_output=True, timeout=120)
        if evidence_root is not None:
            write_exclusive_durable(evidence_root / f"verify-{label}.stdout.private.txt", completed.stdout)
            write_exclusive_durable(evidence_root / f"verify-{label}.stderr.private.txt", completed.stderr)
        if completed.returncode != 0:
            deny(f"release_verify:{label}")


def restart_frontend(plan: dict[str, Any], tx: Path, label: str) -> None:
    completed = subprocess.run(
        [plan["pm2"], "restart", plan["frontend"]["processName"]],
        capture_output=True, timeout=30,
    )
    write_exclusive_durable(tx / f"{label}.pm2.stdout.private.txt", completed.stdout)
    write_exclusive_durable(tx / f"{label}.pm2.stderr.private.txt", completed.stderr)
    if completed.returncode != 0:
        deny(f"pm2_restart:{label}")


def rollback_frontend(plan: dict[str, Any], tx: Path, original_reason: str) -> None:
    rollback = plan["frontend"]["rollback"]
    atomic_select(Path(plan["frontend"]["stablePath"]), Path(rollback["releaseRoot"]))
    restart_frontend(plan, tx, "rollback")
    invoke_readiness(plan, rollback, tx, "rollback-readiness")
    replace_durable(tx / "state.private.json", canonical({
        "state": "ROLLED_BACK", "failurePredicate": original_reason,
        "saveCount": 0, "deployedMarker": False, "automaticRetry": False,
    }))


def handoff_lock_to_private_holder(lock_fd: int, lock_path: Path, tx: Path) -> dict[str, Any]:
    """Keep the same flock alive after the activation controller exits.

    Invalid tokens and EOF never release the lock.  The later, separately reviewed
    finalizer authenticates PID/start ticks/FD and writes the private token once.
    """
    fifo = tx / "lock-control.private.fifo"
    token_path = tx / "lock-control-token.private.txt"
    holder_path = tx / "lock-holder.private.json"
    token = f"RELEASE_LOCK:{secrets.token_hex(32)}"
    os.mkfifo(fifo, 0o600)
    write_exclusive_durable(token_path, (token + "\n").encode())
    pid = os.fork()
    if pid == 0:  # pragma: no cover - exercised by an integration fixture
        try:
            os.setsid()
            null_fd = os.open("/dev/null", os.O_RDWR)
            for descriptor in (0, 1, 2):
                os.dup2(null_fd, descriptor)
            if null_fd > 2:
                os.close(null_fd)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            while True:
                with fifo.open("r") as control:
                    observed = control.readline().rstrip("\n")
                if observed == token:
                    os._exit(0)
        except BaseException:
            while True:
                time.sleep(3600)
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        try:
            ticks = process_ticks(pid)
            fd_targets = [os.readlink(item) for item in Path(f"/proc/{pid}/fd").iterdir()]
            if str(lock_path) in fd_targets:
                value = {
                    "pid": pid, "startTicks": ticks, "lockPath": str(lock_path),
                    "controlPath": str(fifo), "deadline": None,
                    "releaseProtocol": "authenticate PID/start ticks/FD, then write the exact private token once",
                }
                write_exclusive_durable(holder_path, canonical(value))
                return value
        except (FileNotFoundError, ProcessLookupError):
            pass
        time.sleep(0.05)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    deny("lock_handoff_failed")


def activate(plan: dict[str, Any], *, handoff_lock: bool = True) -> dict[str, Any]:
    tx = Path(plan["transactionRoot"])
    tx.mkdir(mode=0o700, parents=True, exist_ok=False)
    fsync_directory(tx.parent)
    validate_static_inputs(plan, tx)
    lock_path = Path(plan["lockPath"])
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            deny("deployment_window_locked")
        before = preservation_snapshot(plan)
        write_exclusive_durable(tx / "preservation-before.private.json", canonical(before))
        frontend_before_rows = pm2_rows(Path(plan["pm2"]))
        frontend_before_matches = [row for row in frontend_before_rows if row.get("name") == plan["frontend"]["processName"]]
        if len(frontend_before_matches) != 1:
            deny("frontend_process_count_before")
        frontend_before_restarts = frontend_before_matches[0].get("pm2_env", {}).get("restart_time")
        if not isinstance(frontend_before_restarts, int):
            deny("frontend_restart_count_before")
        stable = Path(plan["frontend"]["stablePath"])
        rollback_root = Path(plan["frontend"]["rollback"]["releaseRoot"]).resolve(strict=True)
        if stable.resolve(strict=True) != rollback_root:
            deny("frontend_live_return_mismatch")
        mutated = False
        try:
            atomic_select(stable, Path(plan["frontend"]["candidate"]["releaseRoot"]))
            mutated = True
            restart_frontend(plan, tx, "candidate")
            readiness = invoke_readiness(plan, plan["frontend"]["candidate"], tx, "candidate-readiness")
            frontend_after_rows = pm2_rows(Path(plan["pm2"]))
            frontend_after_matches = [row for row in frontend_after_rows if row.get("name") == plan["frontend"]["processName"]]
            if len(frontend_after_matches) != 1 or frontend_after_matches[0].get("pm2_env", {}).get("restart_time") != frontend_before_restarts + 1:
                deny("frontend_restart_count_after")
            after = preservation_snapshot(plan)
            if after != before:
                deny("preserved_runtime_drift")
            state = {
                "state": "AWAITING_ACCEPTANCE", "target": plan["target"],
                "releaseId": plan["releaseId"], "frontend": {
                    "pid": readiness.get("pid"), "startTicks": readiness.get("startTicks"),
                    "buildId": (Path(plan["frontend"]["candidate"]["releaseRoot"]) / ".next/BUILD_ID").read_text().strip(),
                }, "preserved": after, "saveCount": 0, "deployedMarker": False,
            }
            write_exclusive_durable(tx / "state.private.json", canonical(state))
            if handoff_lock:
                state["lockHolder"] = handoff_lock_to_private_holder(lock_fd, lock_path, tx)
                replace_durable(tx / "state.private.json", canonical(state))
            return state
        except Exception as error:
            reason = str(error)
            if mutated:
                rollback_frontend(plan, tx, reason)
            else:
                replace_durable(tx / "state.private.json", canonical({
                    "state": "DENIED_BEFORE_MUTATION", "failurePredicate": reason,
                    "saveCount": 0, "automaticRetry": False,
                }))
            raise
    finally:
        os.close(lock_fd)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    try:
        plan = load_plan(args.plan, args.plan_sha256)
        if args.validate_only:
            validate_static_inputs(plan)
            print(json.dumps({"result": "FRONTEND_ONLY_EXECUTOR_VALID", "target": plan["target"], "releaseId": plan["releaseId"]}, sort_keys=True))
            return 0
        activate(plan, handoff_lock=True)
    except (Denied, OSError, subprocess.SubprocessError, KeyError, TypeError) as error:
        print(f"FRONTEND_ONLY_DENY:{error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
