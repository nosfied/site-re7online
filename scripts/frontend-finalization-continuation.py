#!/usr/bin/env python3
"""Canonical, fail-closed continuation for an accepted frontend-only window.

The wrapper owns the existing deployment lock and passes the authenticated open
file description as fd 9.  It never creates the lock, publishes acceptance, or
invokes activate/readiness/restart paths.
"""

from __future__ import annotations

import argparse
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
from typing import Any


class Denied(RuntimeError):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_regular(path: Path, mode: int | None = None) -> bytes:
    before = path.lstat()
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        raise Denied(f"input_not_regular:{path}")
    if mode is not None and stat.S_IMODE(before.st_mode) != mode:
        raise Denied(f"input_mode:{path}")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise Denied(f"input_identity_changed:{path}")
        chunks: list[bytes] = []
        while chunk := os.read(fd, 1024 * 1024):
            chunks.append(chunk)
        after = os.fstat(fd)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size,
                                  value.st_mtime_ns, value.st_ctime_ns)
        if identity(opened) != identity(after):
            raise Denied(f"input_changed_during_read:{path}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def load_request(path: Path, expected_sha256: str) -> dict[str, Any]:
    raw = read_regular(path, 0o600)
    if sha256(raw) != expected_sha256:
        raise Denied("request_sha256")
    value = json.loads(raw)
    required = {
        "schemaVersion", "action", "lockPath", "transactionRoot", "executor",
        "executorSha256", "target", "release", "acceptanceSha256", "dumpPath",
        "dumpSha256", "markerPath", "environment", "terminalStates",
    }
    if set(value) != required or value["schemaVersion"] != 1 or value["action"] != "finalize":
        raise Denied("request_schema")
    if not isinstance(value["environment"], dict) or not all(
            isinstance(key, str) and isinstance(item, str)
            for key, item in value["environment"].items()):
        raise Denied("request_environment")
    if value["terminalStates"] != ["DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"]:
        raise Denied("request_terminal_states")
    return value


def _deploy_ids() -> tuple[int, int]:
    return pwd.getpwnam("deploy").pw_uid, grp.getgrnam("deploy").gr_gid


def acquire_lock(path: Path, expected_ids: tuple[int, int] | None = None) -> int:
    expected_uid, expected_gid = expected_ids or _deploy_ids()
    before = path.lstat()
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        raise Denied("lock_not_regular")
    if (before.st_uid, before.st_gid, stat.S_IMODE(before.st_mode)) != (
            expected_uid, expected_gid, 0o600):
        raise Denied("lock_owner_or_mode")
    fd = os.open(path, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
    opened = os.fstat(fd)
    if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
        os.close(fd)
        raise Denied("lock_identity_changed")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        os.close(fd)
        raise Denied("lock_busy") from error
    if fd != 9:
        os.dup2(fd, 9, inheritable=True)
        os.close(fd)
        fd = 9
    else:
        os.set_inheritable(fd, True)
    return fd


def validate_external_protocol(lock_path: Path, fd: int, environ: dict[str, str]) -> None:
    if environ.get("RE7_DEPLOYMENT_LOCK_HELD") != "1":
        raise Denied("external_lock_flag")
    opened = os.fstat(fd)
    current = lock_path.lstat()
    if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (
            current.st_dev, current.st_ino):
        raise Denied("external_lock_fd")
    if not os.get_inheritable(fd):
        raise Denied("external_lock_not_inheritable")
    probe = os.open(lock_path, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
    try:
        try:
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        fcntl.flock(probe, fcntl.LOCK_UN)
        raise Denied("external_lock_not_held")
    finally:
        os.close(probe)


def _json(path: Path) -> dict[str, Any]:
    return json.loads(read_regular(path, 0o600))


def validate_prefinal(request: dict[str, Any]) -> tuple[int, int, int, str]:
    tx = Path(request["transactionRoot"])
    if tx.is_symlink() or not tx.is_dir():
        raise Denied("transaction_root")
    state = _json(tx / "window-state.private.json")
    if state.get("state") != "AWAITING_ACCEPTANCE" or state.get("saveCount") != 0:
        raise Denied("state_or_save_count")
    if state.get("target") != request["target"] or state.get("release") != request["release"]:
        raise Denied("state_identity")
    acceptance = tx / "technical-acceptance.private.json"
    acceptance_raw = read_regular(acceptance, 0o600)
    if sha256(acceptance_raw) != request["acceptanceSha256"]:
        raise Denied("acceptance_sha256")
    accepted = json.loads(acceptance_raw)
    if accepted.get("accepted") is not True or accepted.get("target") != request["target"] or accepted.get("release") != request["release"]:
        raise Denied("acceptance_identity")
    for name in ("pm2-save-intent.private.json", "pm2-save-execution.private.json"):
        if (tx / name).exists() or (tx / name).is_symlink():
            raise Denied("save_already_started")
    marker = Path(request["markerPath"])
    if marker.exists() or marker.is_symlink():
        raise Denied("deployed_marker_exists")
    dump = Path(request["dumpPath"])
    if sha256(read_regular(dump)) != request["dumpSha256"]:
        raise Denied("dump_sha256")
    acceptance_info = acceptance.stat()
    return (acceptance_info.st_dev, acceptance_info.st_ino,
            acceptance_info.st_mtime_ns, request["acceptanceSha256"])


def exclusive_bytes(path: Path, raw: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            if written <= 0:
                raise OSError("short_write")
            offset += written
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_terminal(request: dict[str, Any]) -> None:
    tx = Path(request["transactionRoot"])
    state = _json(tx / "window-state.private.json")
    if state.get("state") not in request["terminalStates"] or state.get("saveCount") != 1:
        raise Denied("terminal_state")
    execution = _json(tx / "pm2-save-execution.private.json")
    if execution.get("state") != "PM2_SAVE_EXECUTED" or execution.get("exitCode") != 0 or execution.get("saveCount") != 1:
        raise Denied("save_execution")
    for name in ("frontend-finalization-receipt.private.json", "pm2-dump-validation.private.json"):
        read_regular(tx / name, 0o600)
    read_regular(Path(request["markerPath"]), 0o600)


def run(request: dict[str, Any], fd: int) -> None:
    validate_external_protocol(Path(request["lockPath"]), fd, {
        "RE7_DEPLOYMENT_LOCK_HELD": "1"
    })
    acceptance_before = validate_prefinal(request)
    executor = Path(request["executor"])
    if sha256(read_regular(executor)) != request["executorSha256"]:
        raise Denied("executor_sha256")
    tx = Path(request["transactionRoot"])
    stdout_path = tx / "continuation-finalize.stdout.private.txt"
    stderr_path = tx / "continuation-finalize.stderr.private.txt"
    environment = dict(os.environ)
    environment.update(request["environment"])
    environment["RE7_DEPLOYMENT_LOCK_HELD"] = "1"
    completed = subprocess.run(
        ["/usr/bin/bash", "--noprofile", "--norc", str(executor), "finalize"],
        check=False, capture_output=True, env=environment, pass_fds=(fd,))
    exclusive_bytes(stdout_path, completed.stdout)
    exclusive_bytes(stderr_path, completed.stderr)
    if completed.returncode != 0:
        raise Denied(f"finalize_exit:{completed.returncode}")
    acceptance = Path(request["transactionRoot"]) / "technical-acceptance.private.json"
    acceptance_info = acceptance.stat()
    acceptance_after = (acceptance_info.st_dev, acceptance_info.st_ino,
                        acceptance_info.st_mtime_ns, sha256(read_regular(acceptance, 0o600)))
    if acceptance_after != acceptance_before:
        raise Denied("acceptance_republished")
    validate_terminal(request)
    directory = os.open(tx, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    fd = -1
    try:
        request = load_request(args.request, args.request_sha256)
        fd = acquire_lock(Path(request["lockPath"]))
        run(request, fd)
        print("FRONTEND_FINALIZATION_CONTINUATION_PASS")
        return 0
    except (Denied, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"FRONTEND_FINALIZATION_CONTINUATION_DENY:{error}", file=sys.stderr)
        return 2
    finally:
        if fd >= 0:
            os.close(fd)


if __name__ == "__main__":
    raise SystemExit(main())
