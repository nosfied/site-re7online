#!/usr/bin/env python3
"""Closed supervisor for durable capacity-recovery execution evidence.

It invokes only the sibling canonical executor, preserves its channels/exit code,
and records cgroup memory counters after normal completion or a forwarded signal.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EXECUTOR = ROOT / "scripts/capacity-recovery.py"
PYTHON = Path("/usr/bin/python3")


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def exclusive(path: Path, mode: int = 0o600) -> int:
    if not path.is_absolute() or path.parent.is_symlink():
        raise RuntimeError("SUPERVISOR_OUTPUT_PATH")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)
    return fd


def cgroup_root() -> Path | None:
    try:
        for line in Path("/proc/self/cgroup").read_text().splitlines():
            fields = line.split(":", 2)
            if len(fields) == 3 and fields[0] == "0":
                return Path("/sys/fs/cgroup") / fields[2].lstrip("/")
    except OSError:
        pass
    return None


def memory_snapshot() -> dict[str, Any]:
    root = cgroup_root()
    result: dict[str, Any] = {"memoryCurrentBytes": None, "memoryPeakBytes": None,
                              "memoryEvents": None}
    if root is None:
        return result
    for name, key in (("memory.current", "memoryCurrentBytes"),
                      ("memory.peak", "memoryPeakBytes")):
        try:
            raw = (root / name).read_text().strip()
            result[key] = None if raw == "max" else int(raw)
        except (OSError, ValueError):
            pass
    try:
        result["memoryEvents"] = {
            key: int(value) for key, value in
            (line.split() for line in (root / "memory.events").read_text().splitlines())
        }
    except (OSError, ValueError):
        pass
    return result


def append(fd: int, phase: str, **fields: Any) -> None:
    row = {"schemaVersion": 1, "phase": phase, "monotonicNs": time.monotonic_ns(),
           **memory_snapshot(), **fields}
    os.write(fd, canonical(row))
    os.fsync(fd)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--stdout-output", type=Path, required=True)
    result.add_argument("--stderr-output", type=Path, required=True)
    result.add_argument("--terminal-output", type=Path, required=True)
    result.add_argument("--telemetry-output", type=Path, required=True)
    result.add_argument("--supervisor-telemetry-output", type=Path, required=True)
    actions = result.add_subparsers(dest="action", required=True)
    audit = actions.add_parser("audit")
    audit.add_argument("--request", type=Path, required=True)
    audit.add_argument("--request-sha256", required=True)
    audit.add_argument("--plan-output", type=Path, required=True)
    prepare = actions.add_parser("prepare")
    prepare.add_argument("--plan", type=Path, required=True)
    prepare.add_argument("--plan-sha256", required=True)
    prepare.add_argument("--intent-output", type=Path, required=True)
    prepare.add_argument("--commands-output", type=Path, required=True)
    prepare.add_argument("--manifest-output", type=Path, required=True)
    execute = actions.add_parser("execute")
    execute.add_argument("--intent", type=Path, required=True)
    execute.add_argument("--intent-sha256", required=True)
    execute.add_argument("--authorization", type=Path, required=True)
    execute.add_argument("--authorization-sha256", required=True)
    execute.add_argument("--receipt-root", type=Path, required=True)
    return result


def executor_argv(args: argparse.Namespace) -> list[str]:
    argv = [str(PYTHON), "-B", str(EXECUTOR), args.action]
    names = ({"audit": ("request", "request_sha256", "plan_output"),
              "prepare": ("plan", "plan_sha256", "intent_output", "commands_output",
                          "manifest_output"),
              "execute": ("intent", "intent_sha256", "authorization",
                          "authorization_sha256", "receipt_root")})[args.action]
    for name in names:
        argv.extend(("--" + name.replace("_", "-"), str(getattr(args, name))))
    argv.extend(("--telemetry-output", str(args.telemetry_output)))
    return argv


def main() -> None:
    os.umask(0o077)
    args = parser().parse_args()
    out_fd = exclusive(args.stdout_output)
    try:
        err_fd = exclusive(args.stderr_output)
    except Exception:
        os.close(out_fd)
        raise
    try:
        supervisor_fd = exclusive(args.supervisor_telemetry_output)
    except Exception:
        os.close(out_fd); os.close(err_fd)
        raise
    child: subprocess.Popen[bytes] | None = None
    received_signal: int | None = None

    def forward(signum: int, _frame: Any) -> None:
        nonlocal received_signal
        received_signal = signum
        append(supervisor_fd, "signal_received", signal=signum,
               childPid=child.pid if child is not None else None)
        if child is not None and child.poll() is None:
            child.send_signal(signum)

    previous = {number: signal.signal(number, forward)
                for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
    try:
        append(supervisor_fd, "before_child")
        child = subprocess.Popen(executor_argv(args), stdin=subprocess.DEVNULL,
                                 stdout=out_fd, stderr=err_fd, close_fds=True)
        code = child.wait()
        os.fsync(out_fd); os.fsync(err_fd)
        append(supervisor_fd, "after_child", childPid=child.pid, exitCode=code,
               receivedSignal=received_signal)
        terminal = canonical({"schemaVersion": 1, "state": "TERMINAL", "exitCode": code,
                              "signal": -code if code < 0 else received_signal,
                              "childPid": child.pid})
        terminal_fd = exclusive(args.terminal_output)
        try:
            os.write(terminal_fd, terminal); os.fsync(terminal_fd)
        finally:
            os.close(terminal_fd)
        parent = os.open(args.terminal_output.parent,
                         os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)
        os.fsync(supervisor_fd)
        os.close(supervisor_fd); os.close(out_fd); os.close(err_fd)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
