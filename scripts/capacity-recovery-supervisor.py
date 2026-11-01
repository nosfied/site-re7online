#!/usr/bin/env python3
"""Closed supervisor for durable capacity-recovery execution evidence.

It invokes only the sibling canonical executor and preserves its channels/exit
code. Audit is additionally confined to an authenticated transient cgroup v2
scope; prepare and execute retain the historical signal behavior.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import resource
import secrets
import signal
import stat
import subprocess
import sys
import time
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EXECUTOR = ROOT / "scripts/capacity-recovery.py"
PYTHON = Path("/usr/bin/python3")
SYSTEMD_RUN = Path("/usr/bin/systemd-run")
SYSTEMCTL = Path("/usr/bin/systemctl")
CGROUP_FS = Path("/sys/fs/cgroup")
AUDIT_MEMORY_MIN_BYTES = 128 * 1024 * 1024
AUDIT_MEMORY_MAX_BYTES = 512 * 1024 * 1024
AUDIT_TIMEOUT_MIN_SECONDS = 10
AUDIT_TIMEOUT_MAX_SECONDS = 30 * 60
AUDIT_STOP_GRACE_SECONDS = 5
AUDIT_SCOPE_PREFIX = "re7-capacity-audit-"
INTERNAL_ACTION = "__contained-audit"


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


def child_rss_peak_bytes() -> int:
    """Linux reports ru_maxrss in KiB; the supervisor has exactly one child."""
    return resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * 1024


def trusted_system_binary(path: Path, *, allow_root_symlink: bool = False) -> None:
    try:
        info = path.lstat()
    except OSError as error:
        raise RuntimeError(f"AUDIT_CONTAINMENT_BINARY:{path}") from error
    if stat.S_ISLNK(info.st_mode):
        if not allow_root_symlink or info.st_uid != 0 or info.st_gid != 0:
            raise RuntimeError(f"AUDIT_CONTAINMENT_BINARY:{path}")
        try:
            target = path.resolve(strict=True)
            info = target.lstat()
        except OSError as error:
            raise RuntimeError(f"AUDIT_CONTAINMENT_BINARY:{path}") from error
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or
            stat.S_IMODE(info.st_mode) & 0o022 or not stat.S_IMODE(info.st_mode) & 0o111):
        raise RuntimeError(f"AUDIT_CONTAINMENT_BINARY:{path}")


def unified_cgroup() -> str:
    try:
        lines = Path("/proc/self/cgroup").read_text().splitlines()
    except OSError as error:
        raise RuntimeError("AUDIT_CONTAINMENT_CGROUP") from error
    matches = [line.split(":", 2)[2] for line in lines
               if line.startswith("0::") and len(line.split(":", 2)) == 3]
    if len(matches) != 1 or not matches[0].startswith("/"):
        raise RuntimeError("AUDIT_CONTAINMENT_CGROUP")
    return matches[0]


def cgroup_number(path: Path, name: str) -> int | None:
    try:
        value = (path / name).read_text().strip()
        return None if value == "max" else int(value)
    except (OSError, ValueError):
        return None


def cgroup_events(path: Path) -> dict[str, int] | None:
    try:
        return {key: int(value) for key, value in
                (line.split() for line in (path / "memory.events").read_text().splitlines())}
    except (OSError, ValueError):
        return None


def verify_contained_cgroup(unit: str, memory_max_bytes: int,
                            cgroup_fs: Path = CGROUP_FS) -> tuple[str, dict[str, Any]]:
    relative = unified_cgroup()
    if Path(relative).name != unit or not relative.endswith("/" + unit):
        raise RuntimeError("AUDIT_CONTAINMENT_SCOPE_IDENTITY")
    path = cgroup_fs / relative.lstrip("/")
    try:
        info = path.lstat()
        memory_max = (path / "memory.max").read_text().strip()
        swap_max = (path / "memory.swap.max").read_text().strip()
        oom_group = (path / "memory.oom.group").read_text().strip()
    except OSError as error:
        raise RuntimeError("AUDIT_CONTAINMENT_CGROUP") from error
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or
            memory_max != str(memory_max_bytes) or swap_max != "0" or oom_group != "1"):
        raise RuntimeError("AUDIT_CONTAINMENT_NOT_APPLIED")
    return relative, {"memoryMaxBytes": memory_max_bytes, "memorySwapMaxBytes": 0,
                      "memoryOomGroup": True}


def internal_parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(add_help=False)
    result.add_argument("action", choices=[INTERNAL_ACTION])
    result.add_argument("--unit", required=True)
    result.add_argument("--memory-max-bytes", type=int, required=True)
    result.add_argument("--containment-output", type=Path, required=True)
    result.add_argument("--request", type=Path, required=True)
    result.add_argument("--request-sha256", required=True)
    result.add_argument("--plan-output", type=Path, required=True)
    result.add_argument("--telemetry-output", type=Path, required=True)
    return result


def contained_audit_main() -> None:
    args = internal_parser().parse_args()
    try:
        relative, projection = verify_contained_cgroup(args.unit, args.memory_max_bytes)
        evidence = {"schemaVersion": 1, "state": "PASS", "unit": args.unit,
                    "cgroup": relative, **projection}
        code = 0
    except RuntimeError as error:
        evidence = {"schemaVersion": 1, "state": "DENY", "unit": args.unit,
                    "predicate": str(error)}
        code = 78
    fd = exclusive(args.containment_output)
    try:
        os.write(fd, canonical(evidence)); os.fsync(fd)
    finally:
        os.close(fd)
    if code:
        raise SystemExit(code)
    executor_args = argparse.Namespace(
        action="audit", request=args.request, request_sha256=args.request_sha256,
        plan_output=args.plan_output, telemetry_output=args.telemetry_output)
    os.execv(str(PYTHON), executor_argv(executor_args))


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
    audit.add_argument("--containment-output", type=Path, required=True)
    audit.add_argument("--memory-max-bytes", type=int, required=True)
    audit.add_argument("--timeout-seconds", type=int, required=True)
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


def validate_audit_limits(args: argparse.Namespace) -> None:
    if not AUDIT_MEMORY_MIN_BYTES <= args.memory_max_bytes <= AUDIT_MEMORY_MAX_BYTES:
        raise RuntimeError("AUDIT_MEMORY_BUDGET")
    if not AUDIT_TIMEOUT_MIN_SECONDS <= args.timeout_seconds <= AUDIT_TIMEOUT_MAX_SECONDS:
        raise RuntimeError("AUDIT_DURATION_BUDGET")


def audit_scope_unit() -> str:
    return f"{AUDIT_SCOPE_PREFIX}{os.getpid()}-{secrets.token_hex(8)}.scope"


def systemd_scope_argv(args: argparse.Namespace, unit: str) -> list[str]:
    return [
        str(SYSTEMD_RUN), "--user", "--scope", "--quiet", f"--unit={unit}",
        "--property=MemoryAccounting=yes",
        f"--property=MemoryMax={args.memory_max_bytes}",
        "--property=MemorySwapMax=0", "--property=OOMPolicy=kill",
        f"--property=RuntimeMaxSec={args.timeout_seconds}s",
        f"--property=TimeoutStopSec={AUDIT_STOP_GRACE_SECONDS}s",
        "--property=KillMode=control-group", "--property=SendSIGKILL=yes",
        str(PYTHON), "-B", str(Path(__file__).resolve()), INTERNAL_ACTION,
        "--unit", unit, "--memory-max-bytes", str(args.memory_max_bytes),
        "--containment-output", str(args.containment_output),
        "--request", str(args.request), "--request-sha256", args.request_sha256,
        "--plan-output", str(args.plan_output),
        "--telemetry-output", str(args.telemetry_output),
    ]


def systemctl(args: list[str], *, timeout: int = 5) -> subprocess.CompletedProcess[str]:
    return subprocess.run([str(SYSTEMCTL), "--user", *args], stdin=subprocess.DEVNULL,
                          capture_output=True, text=True, timeout=timeout, check=False)


def scope_properties(unit: str) -> dict[str, str]:
    names = ("LoadState", "ActiveState", "Result", "MemoryMax", "MemorySwapMax",
             "RuntimeMaxUSec", "OOMPolicy", "ControlGroup")
    result = systemctl(["show", unit, *(item for name in names for item in ("-p", name)),
                        "--no-pager"])
    if result.returncode != 0:
        return {"queryError": "SYSTEMCTL_SHOW"}
    projection: dict[str, str] = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition("=")
        if separator and key in names:
            projection[key] = value
    return projection


def read_containment(path: Path) -> dict[str, Any] | None:
    try:
        info = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(info.st_mode) or
                info.st_uid != os.geteuid() or info.st_gid != os.getegid() or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            return None
        raw = path.read_bytes()
        current = path.lstat()
        if ((info.st_dev, info.st_ino, info.st_size) !=
                (current.st_dev, current.st_ino, current.st_size)):
            return None
        value = json.loads(raw)
        return value if isinstance(value, dict) else None
    except (OSError, ValueError, TypeError):
        return None


def scope_memory_snapshot(containment: dict[str, Any] | None) -> dict[str, Any]:
    result = {"scopeMemoryCurrentBytes": None, "scopeMemoryPeakBytes": None,
              "scopeMemoryEvents": None}
    if not containment or containment.get("state") != "PASS":
        return result
    relative = containment.get("cgroup")
    if not isinstance(relative, str) or not relative.startswith("/"):
        return result
    path = CGROUP_FS / relative.lstrip("/")
    result["scopeMemoryCurrentBytes"] = cgroup_number(path, "memory.current")
    result["scopeMemoryPeakBytes"] = cgroup_number(path, "memory.peak")
    result["scopeMemoryEvents"] = cgroup_events(path)
    return result


def kill_scope(unit: str, signal_name: str) -> bool:
    result = systemctl(["kill", "--kill-whom=all", f"--signal={signal_name}", unit])
    return result.returncode == 0


def cleanup_scope(unit: str) -> bool:
    result = systemctl(["reset-failed", unit])
    return result.returncode == 0


def audit_terminal_reason(*, received_signal: int | None, fail_safe_kill: bool,
                          scope_result: str | None,
                          containment: dict[str, Any] | None,
                          exit_code: int) -> str:
    if received_signal is not None:
        return "SUPERVISOR_SIGNAL"
    if fail_safe_kill:
        return "AUDIT_SCOPE_FAIL_SAFE_TIMEOUT"
    if scope_result == "timeout":
        return "AUDIT_TIMEOUT"
    if scope_result == "oom-kill":
        return "AUDIT_MEMORY_MAX"
    if containment is None or containment.get("state") != "PASS":
        return "AUDIT_CONTAINMENT_NOT_APPLIED"
    if exit_code != 0:
        return "CHILD_EXIT_NONZERO"
    return "COMPLETED"


def publish_terminal(path: Path, value: dict[str, Any]) -> None:
    terminal_fd = exclusive(path)
    try:
        os.write(terminal_fd, canonical(value)); os.fsync(terminal_fd)
    finally:
        os.close(terminal_fd)
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def run_contained_audit(args: argparse.Namespace, out_fd: int, err_fd: int,
                        supervisor_fd: int) -> int:
    validate_audit_limits(args)
    trusted_system_binary(SYSTEMD_RUN)
    trusted_system_binary(SYSTEMCTL)
    trusted_system_binary(PYTHON, allow_root_symlink=True)
    if args.containment_output.exists() or args.containment_output.is_symlink():
        raise FileExistsError(args.containment_output)

    unit = audit_scope_unit()
    child: subprocess.Popen[bytes] | None = None
    received_signal: int | None = None
    forwarded_signal = False
    fail_safe_kill = False
    containment: dict[str, Any] | None = None
    sampled_peak: int | None = None
    sampled_current: int | None = None
    sampled_events: dict[str, int] | None = None

    def forward(signum: int, _frame: Any) -> None:
        nonlocal received_signal
        received_signal = signum
        append(supervisor_fd, "signal_received", signal=signum, unit=unit,
               childPid=child.pid if child is not None else None)

    previous = {number: signal.signal(number, forward)
                for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
    started_ns = time.monotonic_ns()
    try:
        append(supervisor_fd, "before_child", unit=unit, action="audit",
               memoryMaxBytes=args.memory_max_bytes,
               timeoutSeconds=args.timeout_seconds,
               containmentMechanism="SYSTEMD_USER_SCOPE_CGROUP_V2")
        child = subprocess.Popen(systemd_scope_argv(args, unit),
                                 stdin=subprocess.DEVNULL, stdout=out_fd,
                                 stderr=err_fd, close_fds=True)
        fail_safe_deadline = (time.monotonic() + args.timeout_seconds +
                              AUDIT_STOP_GRACE_SECONDS + 10)
        while child.poll() is None:
            if containment is None:
                containment = read_containment(args.containment_output)
                if containment is not None:
                    append(supervisor_fd, "containment_authenticated", unit=unit,
                           containmentState=containment.get("state"),
                           cgroup=containment.get("cgroup"))
            snapshot = scope_memory_snapshot(containment)
            current = snapshot["scopeMemoryCurrentBytes"]
            peak = snapshot["scopeMemoryPeakBytes"]
            events = snapshot["scopeMemoryEvents"]
            if current is not None:
                sampled_current = current
            if peak is not None:
                sampled_peak = peak if sampled_peak is None else max(sampled_peak, peak)
            if events is not None:
                sampled_events = events
            if received_signal is not None and not forwarded_signal:
                forwarded_signal = True
                kill_scope(unit, signal.Signals(received_signal).name)
            if time.monotonic() > fail_safe_deadline:
                fail_safe_kill = True
                kill_scope(unit, "SIGKILL")
                break
            time.sleep(0.05)
        code = child.wait()
        child_rss_peak = child_rss_peak_bytes()
        containment = read_containment(args.containment_output)
        properties = scope_properties(unit)
        result = properties.get("Result")
        reason = audit_terminal_reason(
            received_signal=received_signal, fail_safe_kill=fail_safe_kill,
            scope_result=result, containment=containment, exit_code=code)
        cleanup_ok = cleanup_scope(unit) if properties.get("LoadState") != "not-found" else True
        elapsed_ns = time.monotonic_ns() - started_ns
        os.fsync(out_fd); os.fsync(err_fd)
        append(supervisor_fd, "after_child", unit=unit, childPid=child.pid,
               exitCode=code, receivedSignal=received_signal, reason=reason,
               childRssPeakBytes=child_rss_peak, elapsedMonotonicNs=elapsed_ns,
               scopeMemoryCurrentBytes=sampled_current,
               scopeMemoryPeakBytes=sampled_peak,
               scopeMemoryEvents=sampled_events, scopeResult=result,
               scopeCleanupOk=cleanup_ok)
        terminal = {"schemaVersion": 2, "state": "TERMINAL", "action": "audit",
                    "exitCode": code, "signal": -code if code < 0 else received_signal,
                    "reason": reason, "childPid": child.pid, "unit": unit,
                    "memoryMaxBytes": args.memory_max_bytes,
                    "timeoutSeconds": args.timeout_seconds,
                    "elapsedMonotonicNs": elapsed_ns,
                    "childRssPeakBytes": child_rss_peak,
                    "scopeMemoryPeakBytes": sampled_peak,
                    "scopeMemoryEvents": sampled_events,
                    "scopeResult": result, "scopeCleanupOk": cleanup_ok,
                    "containmentState": None if containment is None else containment.get("state")}
        publish_terminal(args.terminal_output, terminal)
        if not cleanup_ok and code == 0:
            return 78
        if reason == "AUDIT_CONTAINMENT_NOT_APPLIED":
            return 78
        return code if code != 0 or reason == "COMPLETED" else 78
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)


def main() -> None:
    os.umask(0o077)
    if len(sys.argv) > 1 and sys.argv[1] == INTERNAL_ACTION:
        contained_audit_main()
        return
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
    if args.action == "audit":
        try:
            code = run_contained_audit(args, out_fd, err_fd, supervisor_fd)
        except Exception as error:
            append(supervisor_fd, "containment_denied", action="audit",
                   predicate=type(error).__name__, detail=str(error))
            os.fsync(out_fd); os.fsync(err_fd)
            publish_terminal(args.terminal_output, {
                "schemaVersion": 2, "state": "TERMINAL", "action": "audit",
                "exitCode": 78, "signal": None,
                "reason": "AUDIT_CONTAINMENT_NOT_APPLIED",
                "predicate": type(error).__name__, "detail": str(error),
            })
            code = 78
        finally:
            os.fsync(supervisor_fd)
            os.close(supervisor_fd); os.close(out_fd); os.close(err_fd)
        raise SystemExit(code)

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
        child_rss_peak = child_rss_peak_bytes()
        os.fsync(out_fd); os.fsync(err_fd)
        append(supervisor_fd, "after_child", childPid=child.pid, exitCode=code,
               receivedSignal=received_signal, childRssPeakBytes=child_rss_peak)
        terminal = canonical({"schemaVersion": 1, "state": "TERMINAL", "exitCode": code,
                              "signal": -code if code < 0 else received_signal,
                              "childPid": child.pid, "childRssPeakBytes": child_rss_peak})
        publish_terminal(args.terminal_output, json.loads(terminal))
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)
        os.fsync(supervisor_fd)
        os.close(supervisor_fd); os.close(out_fd); os.close(err_fd)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
