#!/usr/bin/env python3
"""Persist the Phase 1 frontend supervision state after API verification.

This is the capture block used by the successful safe-return preparation, split
out so the candidate window cannot omit its producer.  It does not select or
restart a process and never persists PM2 environment values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Callable


PM2 = "/home/deploy/.npm-global/bin/pm2"
PM2_PID = Path("/home/deploy/.pm2/pm2.pid")
PROCESS_NAMES = (
    "re7-whatsapp-web-worker",
    "re7-whatsapp-agent",
    "re7-admin-front",
)
RUNTIME_FIELDS = (
    "status",
    "pm_cwd",
    "pm_exec_path",
    "exec_interpreter",
    "restart_time",
    "exec_mode",
)
EXECUTION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb", buffering=0) as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(value: object, reason: str) -> None:
    if not value:
        raise RuntimeError(reason)


def stable_json(path: Path) -> dict[str, object]:
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and not path.is_symlink(), f"input_type:{path.name}")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), f"input_replaced:{path.name}")
        raw = bytearray()
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            raw.extend(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    fields = ("st_dev", "st_ino", "st_mode", "st_uid", "st_gid", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns")
    require(tuple(getattr(opened, key) for key in fields) == tuple(getattr(after, key) for key in fields), f"input_changed:{path.name}")
    value = json.loads(raw)
    require(isinstance(value, dict), f"input_schema:{path.name}")
    return value


def atomic_json(path: Path, value: object, *, exclusive: bool = True) -> None:
    require(path.parent.is_dir() and not path.parent.is_symlink(), "output_parent")
    if exclusive:
        require(not path.exists() and not path.is_symlink(), f"output_exists:{path.name}")
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    fd = os.open(temporary, flags, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write((json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary.exists():
            temporary.unlink()


def proc_ticks(pid: int, proc_root: Path = Path("/proc")) -> int:
    text = (proc_root / str(pid) / "stat").read_text()
    close = text.rfind(")")
    require(close > 0, "proc_stat")
    return int(text[close + 2 :].split()[19])


def sanitized_rows() -> list[dict[str, object]]:
    raw = json.loads(subprocess.check_output([PM2, "jlist"], timeout=10))
    rows = []
    for item in raw:
        environment = item.get("pm2_env") or {}
        rows.append(
            {
                "name": item.get("name"),
                "pid": item.get("pid"),
                "pm2_env": {field: environment.get(field) for field in RUNTIME_FIELDS},
            }
        )
    return rows


def phase1_runtime(rows: list[dict[str, object]], tick_reader: Callable[[int], int]) -> dict[str, object]:
    processes = []
    for name in PROCESS_NAMES:
        matches = [row for row in rows if row.get("name") == name]
        require(len(matches) == 1, f"process_population:{name}")
        row = matches[0]
        pid = int(row["pid"])
        environment = row["pm2_env"]
        processes.append(
            {
                "name": name,
                "pid": pid,
                "startTicks": tick_reader(pid),
                **{field: environment.get(field) for field in RUNTIME_FIELDS},
            }
        )
    return {"processes": processes}


def capture(
    root: Path,
    execution_id: str,
    api_report_path: Path,
    control_path: Path,
    policy_path: Path,
    expected_policy_sha256: str,
    *,
    rows: list[dict[str, object]] | None = None,
    daemon_pid: int | None = None,
    tick_reader: Callable[[int], int] = proc_ticks,
) -> dict[str, object]:
    require(bool(EXECUTION_ID.fullmatch(execution_id)), "execution_id")
    require(stat.S_IMODE(root.stat().st_mode) == 0o700, "root_mode")
    runtime_path = root / "runtime.private.json"
    daemon_path = root / "daemon.private.json"
    binding_path = root / "phase1-state-binding.private.json"
    readiness_path = root / "candidate-v2.readiness.private.jsonl"
    readiness_binding_path = root / "candidate-v2.readiness-binding.private.json"
    for path in (runtime_path, daemon_path, binding_path, readiness_path, readiness_binding_path):
        require(not path.exists() and not path.is_symlink(), f"single_use_exists:{path.name}")

    report = stable_json(api_report_path)
    control = stable_json(control_path)
    policy = stable_json(policy_path)
    require(sha256(policy_path) == expected_policy_sha256, "policy_sha256")
    require(report.get("result") == "API_CANDIDATE_STABLE", "api_not_verified")
    candidate = report.get("candidateCapture")
    require(isinstance(candidate, dict) and candidate.get("status") == "PASS", "api_identity_missing")
    expected_tuple = {key: control.get(key) for key in ("release", "entry", "entrySha256", "buildId")}
    require(policy.get("roles", {}).get("candidate") == expected_tuple, "permanent_run_scope")
    require(control.get("nonce") and control.get("journal"), "candidate_control_binding")
    require(not Path(str(control_path) + ".permanent").exists(), "candidate_marker_preexists")
    require(not Path(str(control["journal"])).exists(), "candidate_journal_preexists")

    observed_daemon_pid = daemon_pid if daemon_pid is not None else int(PM2_PID.read_text())
    daemon_ticks_before = tick_reader(observed_daemon_pid)
    observed_rows = rows if rows is not None else sanitized_rows()
    runtime = phase1_runtime(observed_rows, tick_reader)
    daemon_ticks_after = tick_reader(observed_daemon_pid)
    require(daemon_ticks_before == daemon_ticks_after, "daemon_changed_during_capture")
    api = next(item for item in runtime["processes"] if item["name"] == "re7-whatsapp-agent")
    worker = next(item for item in runtime["processes"] if item["name"] == "re7-whatsapp-web-worker")
    require(api["pid"] == candidate.get("pid") and api["startTicks"] == candidate.get("startTicks"), "api_report_identity")
    require(api["status"] == "online", "api_status")
    require(worker["status"] == "online", "worker_status")

    daemon = {"pid": observed_daemon_pid, "ticks": daemon_ticks_after}
    atomic_json(runtime_path, runtime)
    atomic_json(daemon_path, daemon)
    binding = {
        "schemaVersion": 1,
        "producer": "PHASE1_SAFE_RETURN_CAPTURE_REUSED",
        "executionId": execution_id,
        "runtime": {"path": runtime_path.name, "sha256": sha256(runtime_path)},
        "daemon": {"path": daemon_path.name, "sha256": sha256(daemon_path)},
        "apiReport": {"path": str(api_report_path), "sha256": sha256(api_report_path)},
        "candidateControl": {"path": str(control_path), "sha256": sha256(control_path)},
        "candidateBuildId": control["buildId"],
        "policy": {"path": str(policy_path), "sha256": expected_policy_sha256},
        "apiIdentity": {"pid": api["pid"], "startTicks": api["startTicks"]},
        "workerIdentity": {"pid": worker["pid"], "startTicks": worker["startTicks"]},
        "readiness": {"path": readiness_path.name, "initialState": "ABSENT", "producer": "frontend-check.py ready-candidate"},
        "readinessBinding": {"path": readiness_binding_path.name, "initialState": "ABSENT"},
    }
    atomic_json(binding_path, binding)
    return binding


def seal_readiness(
    root: Path,
    execution_id: str,
    *,
    rows: list[dict[str, object]] | None = None,
    tick_reader: Callable[[int], int] = proc_ticks,
) -> dict[str, object]:
    binding_path = root / "phase1-state-binding.private.json"
    output = root / "candidate-v2.readiness-binding.private.json"
    require(not output.exists() and not output.is_symlink(), "readiness_binding_replay")
    binding = stable_json(binding_path)
    require(binding.get("executionId") == execution_id, "execution_binding")
    runtime_path = root / str(binding["runtime"]["path"])
    daemon_path = root / str(binding["daemon"]["path"])
    readiness_path = root / str(binding["readiness"]["path"])
    require(sha256(runtime_path) == binding["runtime"]["sha256"], "runtime_changed")
    require(sha256(daemon_path) == binding["daemon"]["sha256"], "daemon_changed")
    require(readiness_path.is_file(), "readiness_missing")
    readiness_rows = [json.loads(line) for line in readiness_path.read_text().splitlines() if line.strip()]
    require(readiness_rows and readiness_rows[-1].get("result") == "PASS", "readiness_not_passed")
    control_path = Path(str(binding["candidateControl"]["path"]))
    control = stable_json(control_path)
    require(sha256(control_path) == binding["candidateControl"]["sha256"], "control_changed")
    journal = Path(str(control["journal"]))
    require(journal.is_file(), "journal_missing")
    journal_rows = [json.loads(line) for line in journal.read_text().splitlines() if line.strip()]
    require(journal_rows and all(item.get("nonce") == control["nonce"] for item in journal_rows), "journal_nonce")
    require(not Path(str(control_path) + ".permanent").exists(), "marker_preexists")
    observed = phase1_runtime(rows if rows is not None else sanitized_rows(), tick_reader)
    api = next(item for item in observed["processes"] if item["name"] == "re7-whatsapp-agent")
    front = next(item for item in observed["processes"] if item["name"] == "re7-admin-front")
    worker = next(item for item in observed["processes"] if item["name"] == "re7-whatsapp-web-worker")
    require({"pid": api["pid"], "startTicks": api["startTicks"]} == binding["apiIdentity"], "api_identity_drift")
    require({"pid": worker["pid"], "startTicks": worker["startTicks"]} == binding["workerIdentity"], "worker_identity_drift")
    require(front["status"] == "online" and front["pm_cwd"] == control["release"], "frontend_identity")
    sealed = {
        "schemaVersion": 1,
        "executionId": execution_id,
        "phase1StateBindingSha256": sha256(binding_path),
        "readinessSha256": sha256(readiness_path),
        "journalSha256": sha256(journal),
        "candidateControlSha256": sha256(control_path),
        "candidateBuildId": control["buildId"],
        "apiIdentity": binding["apiIdentity"],
        "frontendIdentity": {"pid": front["pid"], "startTicks": front["startTicks"]},
        "workerIdentity": binding["workerIdentity"],
        "markerState": "ABSENT_BEFORE_ENABLE_SUPERVISION",
        "result": "PHASE1_READINESS_BOUND_PASS",
    }
    atomic_json(output, sealed)
    return sealed


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="action", required=True)
    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument("--root", type=Path, required=True)
    capture_parser.add_argument("--execution-id", required=True)
    capture_parser.add_argument("--api-report", type=Path, required=True)
    capture_parser.add_argument("--control", type=Path, required=True)
    capture_parser.add_argument("--policy", type=Path, required=True)
    capture_parser.add_argument("--policy-sha256", required=True)
    seal_parser = subparsers.add_parser("seal-readiness")
    seal_parser.add_argument("--root", type=Path, required=True)
    seal_parser.add_argument("--execution-id", required=True)
    args = parser.parse_args()
    if args.action == "capture":
        result = capture(args.root, args.execution_id, args.api_report, args.control, args.policy, args.policy_sha256)
        print(json.dumps({"result": "PHASE1_STATE_CAPTURE_PASS", "executionId": result["executionId"], "runtimeSha256": result["runtime"]["sha256"], "daemonSha256": result["daemon"]["sha256"]}, sort_keys=True))
    else:
        result = seal_readiness(args.root, args.execution_id)
        print(json.dumps({"result": result["result"], "executionId": result["executionId"], "readinessSha256": result["readinessSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
