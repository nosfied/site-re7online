#!/usr/bin/env python3
"""Authenticated, data-driven PM2/launcher adapter for Deploy V2.

Release identities and runtime state live only in the authenticated private binding.
Every environmental operation is an argv-only invocation of a pinned executable that
returns one sanitized JSON decision.
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

SHA256 = re.compile(r"^[0-9a-f]{64}$")
REASON = re.compile(r"^[A-Z0-9_:-]{1,96}$")
ACTIONS = {
    "capture", "select_api", "verify_api", "select_frontend",
    "verify_frontend", "activate_frontend_supervision", "verify_worker",
    "verify_acceptance", "save_pm2", "rollback_frontend", "rollback_api",
    "verify_rollback",
}
PLACEHOLDERS = {"{manifest}", "{binding}", "{workDir}", "{action}"}
FORBIDDEN_EXECUTABLES = {"sh", "bash", "dash", "zsh", "fish", "sudo", "su"}


class AdapterDenied(RuntimeError):
    pass


def read_regular(path: Path) -> bytes:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise AdapterDenied("NOT_REGULAR")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ):
            raise AdapterDenied("CHANGED_WHILE_READING")
        return b"".join(chunks)
    finally:
        os.close(fd)


def read_object(path: Path) -> tuple[dict, bytes]:
    raw = read_regular(path)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise AdapterDenied("NOT_OBJECT")
    return value, raw


def digest_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def open_authenticated_executable(path: Path, expected: str) -> int:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise AdapterDenied("COMMAND_NOT_REGULAR")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        if digest.hexdigest() != expected:
            raise AdapterDenied("COMMAND_EXECUTABLE_MISMATCH")
        os.lseek(fd, 0, os.SEEK_SET)
        return fd
    except Exception:
        os.close(fd)
        raise


def expand(value: str, values: dict[str, str]) -> str:
    if value in PLACEHOLDERS:
        return values[value]
    if "{" in value or "}" in value:
        raise AdapterDenied("UNKNOWN_PLACEHOLDER")
    return value


def validate_binding(binding: dict, manifest: dict, action: str) -> list[dict]:
    if binding.get("schemaVersion") != 1:
        raise AdapterDenied("BINDING_SCHEMA")
    if binding.get("releaseId") != manifest.get("releaseId"):
        raise AdapterDenied("BINDING_RELEASE")
    if set(binding.get("actions", {})) != ACTIONS:
        raise AdapterDenied("BINDING_ACTION_SET")
    if binding.get("acceptance", {}).get("mode") != "GET_ONLY_TENANT_SCOPED":
        raise AdapterDenied("ACCEPTANCE_MODE")
    if binding.get("acceptance", {}).get("forbidPost") is not True:
        raise AdapterDenied("ACCEPTANCE_POST_POLICY")
    plans = binding["actions"].get(action)
    if not isinstance(plans, list) or not plans:
        raise AdapterDenied("ACTION_PLAN")
    return plans


def run_plan(spec: dict, values: dict[str, str]) -> dict:
    if set(spec) != {"argv", "executableSha256", "timeoutSeconds"}:
        raise AdapterDenied("COMMAND_SCHEMA")
    argv = spec["argv"]
    if not isinstance(argv, list) or not argv or not all(isinstance(x, str) for x in argv):
        raise AdapterDenied("COMMAND_ARGV")
    command = [expand(item, values) for item in argv]
    executable = Path(command[0])
    if not executable.is_absolute() or executable.name in FORBIDDEN_EXECUTABLES:
        raise AdapterDenied("COMMAND_EXECUTABLE")
    expected = spec["executableSha256"]
    if not isinstance(expected, str) or not SHA256.fullmatch(expected):
        raise AdapterDenied("COMMAND_EXECUTABLE_SHA")
    timeout = spec["timeoutSeconds"]
    if not isinstance(timeout, int) or not 1 <= timeout <= 120:
        raise AdapterDenied("COMMAND_TIMEOUT")
    executable_fd = open_authenticated_executable(executable, expected)
    try:
        command[0] = f"/proc/self/fd/{executable_fd}"
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
            pass_fds=(executable_fd,),
        )
    finally:
        os.close(executable_fd)
    try:
        payload = json.loads(result.stdout.strip())
    except json.JSONDecodeError as error:
        raise AdapterDenied("COMMAND_INVALID_JSON") from error
    if not isinstance(payload, dict) or set(payload) - {"result", "reason"}:
        raise AdapterDenied("COMMAND_OUTPUT_SCHEMA")
    reason = payload.get("reason")
    if reason is not None and (not isinstance(reason, str) or not REASON.fullmatch(reason)):
        raise AdapterDenied("COMMAND_REASON_UNSAFE")
    if result.returncode != 0 or payload.get("result") != "PASS":
        raise AdapterDenied(reason or "COMMAND_DENIED")
    return {"result": "PASS", "reason": None}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=sorted(ACTIONS))
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--binding", type=Path, required=True)
    parser.add_argument("--binding-sha256", required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest, _ = read_object(args.manifest.resolve())
        binding, binding_raw = read_object(args.binding.resolve())
        if not SHA256.fullmatch(args.binding_sha256) or digest_bytes(binding_raw) != args.binding_sha256:
            raise AdapterDenied("BINDING_SHA_MISMATCH")
        plans = validate_binding(binding, manifest, args.action)
        values = {
            "{manifest}": str(args.manifest.resolve()),
            "{binding}": str(args.binding.resolve()),
            "{workDir}": str(args.work_dir.resolve()),
            "{action}": args.action,
        }
        for plan in plans:
            run_plan(plan, values)
        print(json.dumps({"result": "PASS", "reason": None}, separators=(",", ":")))
        return 0
    except (AdapterDenied, json.JSONDecodeError, OSError, subprocess.TimeoutExpired) as error:
        reason = str(error) if isinstance(error, AdapterDenied) and REASON.fullmatch(str(error)) else "ADAPTER_DENIED"
        print(json.dumps({"result": "DENY", "reason": reason}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
