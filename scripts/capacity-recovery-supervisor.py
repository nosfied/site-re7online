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
AUDIT_RECOVERY_WAIT_SECONDS = 10
AUDIT_RECOVERY_TERM_GRACE_SECONDS = 1
AUDIT_SCOPE_PREFIX = "re7-capacity-audit-"
INTERNAL_ACTION = "__contained-audit"
EXECUTOR_PROOF_MAX_BYTES = 64 * 1024


class AuditPostLaunchError(RuntimeError):
    def __init__(self, predicate: str, *, unit: str, child_pid: int,
                 executor_state: str, termination_state: str) -> None:
        super().__init__(predicate)
        self.unit = unit
        self.child_pid = child_pid
        self.executor_state = executor_state
        self.termination_state = termination_state


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
    names = ("LoadState", "ActiveState", "SubState", "Result", "MemoryMax",
             "MemorySwapMax", "RuntimeMaxUSec", "OOMPolicy", "ControlGroup")
    try:
        result = systemctl(["show", unit,
                            *(item for name in names for item in ("-p", name)),
                            "--no-pager"])
    except (OSError, subprocess.TimeoutExpired):
        return {"queryError": "SYSTEMCTL_SHOW"}
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


def executor_telemetry_started(path: Path) -> bool:
    """Authenticate the executor's first durable event without trusting existence."""
    fd = -1
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
                before.st_gid != os.getegid() or stat.S_IMODE(before.st_mode) != 0o600 or
                before.st_nlink != 1):
            return False
        raw = os.read(fd, EXECUTOR_PROOF_MAX_BYTES + 1)
        after = os.fstat(fd)
        if ((before.st_dev, before.st_ino) != (after.st_dev, after.st_ino) or
                len(raw) > EXECUTOR_PROOF_MAX_BYTES):
            return False
        first, separator, _rest = raw.partition(b"\n")
        if not separator:
            return False
        row = json.loads(first)
        return (isinstance(row, dict) and row.get("schemaVersion") == 1 and
                row.get("phase") == "telemetry_started")
    except (OSError, ValueError, TypeError):
        return False
    finally:
        if fd >= 0:
            os.close(fd)


def executor_execution_state(*, launcher_started: bool,
                             containment: dict[str, Any] | None,
                             telemetry_path: Path) -> str:
    if not launcher_started:
        return "EXECUTOR_NOT_STARTED"
    if executor_telemetry_started(telemetry_path):
        return "EXECUTOR_STARTED"
    if containment is not None and containment.get("state") == "DENY":
        return "EXECUTOR_NOT_STARTED"
    return "EXECUTOR_STATE_INCONCLUSIVE"


def scope_termination_snapshot(unit: str,
                               containment: dict[str, Any] | None) -> dict[str, Any]:
    properties = scope_properties(unit)
    if "queryError" in properties:
        return {"state": "INCONCLUSIVE", "predicate": properties["queryError"],
                "properties": properties, "cgroupMembers": None}

    relative: str | None = None
    if containment is not None and isinstance(containment.get("cgroup"), str):
        relative = containment["cgroup"]
    elif isinstance(properties.get("ControlGroup"), str):
        relative = properties["ControlGroup"]
    if relative is not None and (not relative.startswith("/") or ".." in Path(relative).parts):
        return {"state": "INCONCLUSIVE", "predicate": "SCOPE_CGROUP_IDENTITY",
                "properties": properties, "cgroupMembers": None}

    members: int | None = None
    cgroup_absent = relative in (None, "")
    if relative not in (None, ""):
        member_path = CGROUP_FS / relative.lstrip("/") / "cgroup.procs"
        try:
            members = len([line for line in member_path.read_text().splitlines() if line])
            cgroup_absent = False
        except FileNotFoundError:
            cgroup_absent = not member_path.parent.exists()
            if not cgroup_absent:
                return {"state": "INCONCLUSIVE", "predicate": "SCOPE_MEMBERS_UNREADABLE",
                        "properties": properties, "cgroupMembers": None}
        except OSError:
            return {"state": "INCONCLUSIVE", "predicate": "SCOPE_MEMBERS_UNREADABLE",
                    "properties": properties, "cgroupMembers": None}

    load = properties.get("LoadState")
    active = properties.get("ActiveState")
    if load == "not-found" and cgroup_absent:
        state = "TERMINATED_CONFIRMED"
    elif active in {"inactive", "failed"} and (cgroup_absent or members == 0):
        state = "TERMINATED_CONFIRMED"
    elif active in {"active", "activating", "deactivating", "reloading"} or (members or 0) > 0:
        state = "ACTIVE"
    else:
        state = "INCONCLUSIVE"
    return {"state": state, "properties": properties, "cgroupMembers": members,
            "cgroupAbsent": cgroup_absent}


def wait_scope_termination(unit: str, containment: dict[str, Any] | None,
                           deadline: float) -> dict[str, Any]:
    while True:
        snapshot = scope_termination_snapshot(unit, containment)
        if snapshot["state"] == "TERMINATED_CONFIRMED" or time.monotonic() >= deadline:
            return snapshot
        time.sleep(0.05)


def close_supervised_scope(unit: str, containment: dict[str, Any] | None,
                           child: subprocess.Popen[bytes], supervisor_fd: int,
                           *, deadline_seconds: int = AUDIT_RECOVERY_WAIT_SECONDS) -> dict[str, Any]:
    """Bounded exact-unit recovery; never discovers or signals by process name."""
    deadline = time.monotonic() + deadline_seconds
    attempts: list[dict[str, Any]] = []
    evidence_errors = 0
    snapshot = scope_termination_snapshot(unit, containment)
    for signal_name, grace in (("SIGTERM", AUDIT_RECOVERY_TERM_GRACE_SECONDS),
                               ("SIGKILL", deadline_seconds)):
        if snapshot["state"] == "TERMINATED_CONFIRMED":
            break
        succeeded = kill_scope(unit, signal_name)
        attempts.append({"signal": signal_name, "succeeded": succeeded})
        try:
            append(supervisor_fd, "scope_termination_requested", unit=unit,
                   signal=signal_name, succeeded=succeeded,
                   observedState=snapshot.get("state"))
        except OSError:
            evidence_errors += 1
        signal_deadline = min(deadline, time.monotonic() + grace)
        snapshot = wait_scope_termination(unit, containment, signal_deadline)

    if snapshot["state"] != "TERMINATED_CONFIRMED" and time.monotonic() < deadline:
        snapshot = wait_scope_termination(unit, containment, deadline)

    launcher_code = child.poll()
    if snapshot["state"] == "TERMINATED_CONFIRMED" and launcher_code is None:
        try:
            child.terminate()
        except OSError:
            pass
        try:
            launcher_code = child.wait(timeout=1)
        except subprocess.TimeoutExpired:
            try:
                child.kill()
            except OSError:
                pass
            try:
                launcher_code = child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                launcher_code = None

    confirmed = snapshot["state"] == "TERMINATED_CONFIRMED" and launcher_code is not None
    return {"state": "TERMINATED_CONFIRMED" if confirmed else "RECOVERY_PENDING",
            "scope": snapshot, "killAttempts": attempts,
            "launcherExitCode": launcher_code,
            "evidenceErrors": evidence_errors}


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
    try:
        result = systemctl(["kill", "--kill-whom=all", f"--signal={signal_name}", unit])
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def cleanup_scope(unit: str) -> bool:
    try:
        result = systemctl(["reset-failed", unit])
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def audit_terminal_reason(*, received_signal: int | None, fail_safe_kill: bool,
                          scope_result: str | None,
                          containment: dict[str, Any] | None,
                          executor_state: str, termination_state: str,
                          post_launch_failure: bool,
                          launcher_exited_scope_active: bool,
                          exit_code: int) -> str:
    if termination_state != "TERMINATED_CONFIRMED":
        return "AUDIT_RECOVERY_PENDING"
    if post_launch_failure:
        return "AUDIT_POST_LAUNCH_FAILURE"
    if received_signal is not None:
        return "SUPERVISOR_SIGNAL"
    if fail_safe_kill:
        return "AUDIT_SCOPE_FAIL_SAFE_TIMEOUT"
    if launcher_exited_scope_active:
        return "AUDIT_LAUNCHER_EXITED_SCOPE_ACTIVE"
    if scope_result == "timeout":
        return "AUDIT_TIMEOUT"
    if scope_result == "oom-kill":
        return "AUDIT_MEMORY_MAX"
    if (containment is None or containment.get("state") != "PASS") and \
            executor_state == "EXECUTOR_NOT_STARTED":
        return "AUDIT_CONTAINMENT_NOT_APPLIED"
    if containment is None or containment.get("state") != "PASS":
        return "AUDIT_LAUNCH_STATE_INCONCLUSIVE"
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
    for output in (args.containment_output, args.telemetry_output, args.plan_output):
        if output.exists() or output.is_symlink():
            raise FileExistsError(output)

    unit = audit_scope_unit()
    child: subprocess.Popen[bytes] | None = None
    received_signal: int | None = None
    forwarded_signal = False
    fail_safe_kill = False
    containment: dict[str, Any] | None = None
    sampled_peak: int | None = None
    sampled_current: int | None = None
    sampled_events: dict[str, int] | None = None
    termination: dict[str, Any] | None = None
    post_launch_failure: str | None = None
    launcher_exited_scope_active = False

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
        while True:
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
                termination = close_supervised_scope(
                    unit, containment, child, supervisor_fd)
                break
            if time.monotonic() > fail_safe_deadline:
                fail_safe_kill = True
                termination = close_supervised_scope(
                    unit, containment, child, supervisor_fd)
                break
            if child.poll() is not None:
                snapshot = scope_termination_snapshot(unit, containment)
                if snapshot["state"] == "TERMINATED_CONFIRMED":
                    termination = {"state": "TERMINATED_CONFIRMED", "scope": snapshot,
                                   "killAttempts": [], "launcherExitCode": child.poll(),
                                   "evidenceErrors": 0}
                else:
                    launcher_exited_scope_active = snapshot["state"] == "ACTIVE"
                    termination = close_supervised_scope(
                        unit, containment, child, supervisor_fd)
                break
            time.sleep(0.05)
    except Exception as error:
        if child is None:
            for number, handler in previous.items():
                signal.signal(number, handler)
            raise
        post_launch_failure = type(error).__name__
        termination = close_supervised_scope(unit, containment, child, supervisor_fd)

    try:
        if termination is None:
            termination = close_supervised_scope(unit, containment, child, supervisor_fd)
        code = termination.get("launcherExitCode")
        if not isinstance(code, int):
            code = 78
        child_rss_peak = child_rss_peak_bytes()
        containment = read_containment(args.containment_output)
        properties = termination.get("scope", {}).get("properties", {})
        result = properties.get("Result")
        executor_state = executor_execution_state(
            launcher_started=True, containment=containment,
            telemetry_path=args.telemetry_output)
        reason = audit_terminal_reason(
            received_signal=received_signal, fail_safe_kill=fail_safe_kill,
            scope_result=result, containment=containment,
            executor_state=executor_state, termination_state=termination["state"],
            post_launch_failure=post_launch_failure is not None,
            launcher_exited_scope_active=launcher_exited_scope_active,
            exit_code=code)
        cleanup_ok = False
        if termination["state"] == "TERMINATED_CONFIRMED":
            cleanup_ok = (cleanup_scope(unit)
                          if properties.get("LoadState") != "not-found" else True)
        if not cleanup_ok and reason == "COMPLETED":
            reason = "AUDIT_SCOPE_CLEANUP_FAILED"
        elapsed_ns = time.monotonic_ns() - started_ns
        os.fsync(out_fd); os.fsync(err_fd)
        append(supervisor_fd, "after_child", unit=unit, childPid=child.pid,
               exitCode=code, receivedSignal=received_signal, reason=reason,
               childRssPeakBytes=child_rss_peak, elapsedMonotonicNs=elapsed_ns,
               scopeMemoryCurrentBytes=sampled_current,
               scopeMemoryPeakBytes=sampled_peak,
               scopeMemoryEvents=sampled_events, scopeResult=result,
               scopeCleanupOk=cleanup_ok, executorState=executor_state,
               terminationState=termination["state"],
               postLaunchFailure=post_launch_failure)
        terminal = {"schemaVersion": 3,
                    "state": ("TERMINAL" if termination["state"] ==
                              "TERMINATED_CONFIRMED" else "RECOVERY_PENDING"),
                    "action": "audit",
                    "exitCode": code, "signal": -code if code < 0 else received_signal,
                    "reason": reason, "childPid": child.pid, "unit": unit,
                    "executorState": executor_state,
                    "terminationState": termination["state"],
                    "postLaunchFailure": post_launch_failure,
                    "memoryMaxBytes": args.memory_max_bytes,
                    "timeoutSeconds": args.timeout_seconds,
                    "elapsedMonotonicNs": elapsed_ns,
                    "childRssPeakBytes": child_rss_peak,
                    "scopeMemoryPeakBytes": sampled_peak,
                    "scopeMemoryEvents": sampled_events,
                    "scopeResult": result, "scopeCleanupOk": cleanup_ok,
                    "scopeTermination": termination.get("scope"),
                    "killAttempts": termination.get("killAttempts", []),
                    "containmentState": None if containment is None else containment.get("state")}
        publish_terminal(args.terminal_output, terminal)
        if termination["state"] != "TERMINATED_CONFIRMED":
            return 78
        if not cleanup_ok and code == 0:
            return 78
        if reason in {"AUDIT_CONTAINMENT_NOT_APPLIED",
                      "AUDIT_LAUNCH_STATE_INCONCLUSIVE",
                      "AUDIT_POST_LAUNCH_FAILURE",
                      "AUDIT_LAUNCHER_EXITED_SCOPE_ACTIVE",
                      "AUDIT_SCOPE_CLEANUP_FAILED"}:
            return 78
        return code if code != 0 or reason == "COMPLETED" else 78
    except Exception as error:
        executor_state = executor_execution_state(
            launcher_started=True, containment=read_containment(args.containment_output),
            telemetry_path=args.telemetry_output)
        raise AuditPostLaunchError(
            type(error).__name__, unit=unit, child_pid=child.pid,
            executor_state=executor_state,
            termination_state=(termination or {}).get("state", "RECOVERY_PENDING")) from error
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
        except AuditPostLaunchError as error:
            state = ("TERMINAL" if error.termination_state ==
                     "TERMINATED_CONFIRMED" else "RECOVERY_PENDING")
            reason = ("AUDIT_POST_LAUNCH_FAILURE" if state == "TERMINAL"
                      else "AUDIT_RECOVERY_PENDING")
            append(supervisor_fd, "post_launch_finalization_failure", action="audit",
                   predicate=str(error), unit=error.unit, childPid=error.child_pid,
                   executorState=error.executor_state,
                   terminationState=error.termination_state, reason=reason)
            if not args.terminal_output.exists() and not args.terminal_output.is_symlink():
                publish_terminal(args.terminal_output, {
                    "schemaVersion": 3, "state": state, "action": "audit",
                    "exitCode": 78, "signal": None, "reason": reason,
                    "predicate": str(error), "unit": error.unit,
                    "childPid": error.child_pid,
                    "executorState": error.executor_state,
                    "terminationState": error.termination_state,
                })
            code = 78
        except Exception as error:
            append(supervisor_fd, "containment_denied", action="audit",
                   predicate=type(error).__name__, detail=str(error))
            os.fsync(out_fd); os.fsync(err_fd)
            publish_terminal(args.terminal_output, {
                "schemaVersion": 3, "state": "TERMINAL", "action": "audit",
                "exitCode": 78, "signal": None,
                "reason": "AUDIT_CONTAINMENT_NOT_APPLIED",
                "predicate": type(error).__name__, "detail": str(error),
                "executorState": "EXECUTOR_NOT_STARTED",
                "terminationState": "NOT_APPLICABLE",
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
