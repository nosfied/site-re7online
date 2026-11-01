#!/usr/bin/env python3
"""Root-only, read-only /proc observer for canonical capacity recovery.

The program accepts one closed JSON request on stdin and emits one canonical JSON
observation on stdout.  It has no deletion, subprocess, import-from-request or
output-file capability.  Production installation is fixed to ROOT_HELPER_PATH and
is invoked only through the literal sudoers command documented with this tool.
"""

from __future__ import annotations

import errno
import hashlib
import json
import os
from pathlib import Path
import pwd
import signal
import stat
import sys
import time
from typing import Any


ROOT_HELPER_PATH = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
INSTALL_ANCESTORS = (
    Path("/usr"), Path("/usr/local"), Path("/usr/local/libexec"),
    Path("/usr/local/libexec/re7online"),
)
MAX_REQUEST_BYTES = 64 * 1024
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_CANDIDATES = 16
MAX_PROCESSES = 32768
MAX_FDS_PER_PROCESS = 131072
MAX_MAPS_BYTES = 64 * 1024 * 1024
MAX_REFERENCES = 16384
MAX_FAILURE_DETAILS = 256
MAX_SECONDS = 12
SHA256_LENGTH = 64
NPM_CACHE = "/home/deploy/.npm/_cacache"
BUILD_OUTPUT_ROOT = Path("/opt/re7online/build-output")
RUNTIME_NAMES = {"api-runtime", "frontend-runtime"}
PREPARATIONS_ROOT = Path("/opt/re7online/backups/converta-persistent/preparations")
PREPARATION_ARCHIVE_NAMES = {
    "api-frontend-return.private.tar.gz", "worker-return.private.tar.gz",
}
PREPARATION_WINDOW_ARCHIVE_NAMES = {"worker-minimal-b9-v3.tar.gz"}
MANIFEST_DISPOSITION_PATHS = {
    "/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-reactive-afbb7455.tar.gz",
    "/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z/frontend-9f4cbe0f-v2.tar.gz",
    "/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-css-supervision-20261007T224500Z/frontend-fa60-css-corrected.tar.gz",
    "/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-package-audit",
}
PF_KTHREAD = 0x00200000


class Refused(RuntimeError):
    pass


def refuse(predicate: str) -> None:
    raise Refused(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def identity(info: os.stat_result) -> dict[str, Any]:
    return {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        "type": ("directory" if stat.S_ISDIR(info.st_mode) else
                 "regular" if stat.S_ISREG(info.st_mode) else "other"),
        "size": info.st_size, "mtimeNs": info.st_mtime_ns,
        "ctimeNs": info.st_ctime_ns,
    }


def process_stat(proc: Path) -> tuple[str, int, int]:
    raw = (proc / "stat").read_text(errors="strict")
    closing = raw.rfind(") ")
    if closing < 0:
        refuse("PROCESS_STAT_SCHEMA")
    fields = raw[closing + 2:].split()
    if len(fields) <= 19:
        refuse("PROCESS_STAT_SCHEMA")
    try:
        return fields[0], int(fields[6]), int(fields[19])
    except ValueError:
        refuse("PROCESS_STAT_SCHEMA")


def start_ticks(proc: Path) -> int:
    return process_stat(proc)[2]


def status_uids(proc: Path) -> tuple[int, int, int, int]:
    for line in (proc / "status").read_text(errors="strict").splitlines():
        if line.startswith("Uid:"):
            fields = line.split()[1:]
            if len(fields) == 4:
                try:
                    return tuple(int(item) for item in fields)  # type: ignore[return-value]
                except ValueError:
                    break
    refuse("PROCESS_UID_SCHEMA")


def process_exists(proc: Path) -> bool:
    try:
        proc.stat()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        return True


def normalized_path(value: Any) -> str:
    if not isinstance(value, str) or not value.startswith("/") or "\x00" in value:
        refuse("CANDIDATE_PATH")
    path = os.path.normpath(value)
    if path != value or ".." in Path(value).parts or any(ord(char) < 32 for char in value):
        refuse("CANDIDATE_PATH")
    return value


def canonical_candidate(value: Any) -> str:
    candidate = normalized_path(value)
    if candidate == NPM_CACHE:
        return candidate
    if candidate in MANIFEST_DISPOSITION_PATHS:
        return candidate
    path = Path(candidate)
    try:
        preparation_relative = path.relative_to(PREPARATIONS_ROOT)
    except ValueError:
        preparation_relative = None
    if (preparation_relative is not None and len(preparation_relative.parts) == 2 and
            preparation_relative.parts[0] not in {"", ".", ".."} and
            preparation_relative.parts[1] in PREPARATION_ARCHIVE_NAMES):
        return candidate
    if (preparation_relative is not None and len(preparation_relative.parts) == 3 and
            preparation_relative.parts[0] not in {"", ".", ".."} and
            preparation_relative.parts[1] == "window" and
            preparation_relative.parts[2] in PREPARATION_WINDOW_ARCHIVE_NAMES):
        return candidate
    try:
        relative = path.relative_to(BUILD_OUTPUT_ROOT)
    except ValueError:
        refuse("CANDIDATE_SCOPE")
    parts = relative.parts
    if (len(parts) != 3 or parts[2] not in RUNTIME_NAMES or
            not parts[0].startswith("immutable-") or not parts[0].endswith("-producer") or
            parts[1] != parts[0][:-len("-producer")]):
        refuse("CANDIDATE_SCOPE")
    return candidate


def references_candidate(candidate: str, target: str) -> bool:
    if target.endswith(" (deleted)"):
        target = target[:-10]
    if not target.startswith("/"):
        return False
    try:
        return os.path.commonpath((candidate, os.path.normpath(target))) == candidate
    except ValueError:
        return False


def active_writer(arguments: list[str]) -> bool:
    if not arguments:
        return False
    executable = Path(arguments[0]).name
    command = " ".join(arguments)
    return (executable in {"npm", "npx"} or
            any(Path(argument).name == "npm-cli.js" for argument in arguments[1:]) or
            "next build" in command or
            ("converta-release.py" in command and " build" in command))


def validate_request(raw: bytes) -> dict[str, Any]:
    if len(raw) > MAX_REQUEST_BYTES:
        refuse("REQUEST_VOLUME")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        refuse("REQUEST_JSON")
    required = {"schemaVersion", "kind", "phase", "nonce", "deployUid",
                "candidatePaths", "consumer"}
    if (not isinstance(value, dict) or set(value) != required or
            value.get("schemaVersion") != 1 or
            value.get("kind") != "CAPACITY_PROC_OBSERVATION_REQUEST" or
            value.get("phase") not in {"audit", "prepare", "execute"}):
        refuse("REQUEST_SCHEMA")
    nonce = value.get("nonce")
    if (not isinstance(nonce, str) or len(nonce) != SHA256_LENGTH or
            any(char not in "0123456789abcdef" for char in nonce)):
        refuse("REQUEST_NONCE")
    if not isinstance(value.get("deployUid"), int) or value["deployUid"] < 0:
        refuse("REQUEST_DEPLOY_UID")
    candidates = value.get("candidatePaths")
    if not isinstance(candidates, list) or not candidates or len(candidates) > MAX_CANDIDATES:
        refuse("REQUEST_CANDIDATES")
    normalized = [canonical_candidate(item) for item in candidates]
    if normalized != sorted(set(normalized)):
        refuse("REQUEST_CANDIDATES_ORDER")
    consumer = value.get("consumer")
    if (not isinstance(consumer, dict) or set(consumer) != {"pid", "startTicks"} or
            not isinstance(consumer.get("pid"), int) or consumer["pid"] <= 1 or
            not isinstance(consumer.get("startTicks"), int) or consumer["startTicks"] <= 0):
        refuse("REQUEST_CONSUMER")
    if canonical(value) != raw:
        refuse("REQUEST_NOT_CANONICAL")
    return value


def add_failure(failures: list[dict[str, Any]], truncated: list[int], *, pid: int,
                ticks: int | None, uids: tuple[int, int, int, int] | None,
                operation: str, predicate: str, error: BaseException | None = None) -> None:
    if len(failures) >= MAX_FAILURE_DETAILS:
        truncated[0] += 1
        return
    code = error.errno if isinstance(error, OSError) else None
    failures.append({
        "pid": pid, "startTicks": ticks,
        "uids": ({"real": uids[0], "effective": uids[1],
                  "saved": uids[2], "fs": uids[3]} if uids is not None else None),
        "operation": operation, "predicate": predicate, "errno": code,
        "errnoName": errno.errorcode.get(code) if code is not None else None,
    })


def scan_proc(candidate_paths: list[str], deploy_uid: int,
              proc_root: Path = Path("/proc")) -> dict[str, Any]:
    references: list[dict[str, Any]] = []
    writers: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    truncated = [0]
    reference_keys: set[tuple[Any, ...]] = set()
    complete = True
    summary = {
        "processesObserved": 0, "emptyCmdlineProcesses": 0,
        "emptyCmdlineProcessesInspected": 0, "kernelThreadsIgnored": 0,
        "vanishedProcesses": 0, "transientFdClosures": 0,
        "identityChanges": 0, "referenceReadFailures": 0,
    }
    processes = sorted((item for item in proc_root.iterdir() if item.name.isdigit()),
                       key=lambda item: int(item.name))
    if len(processes) > MAX_PROCESSES:
        refuse("PROCESS_VOLUME_LIMIT")

    def fail(pid: int, ticks: int | None, uids: tuple[int, int, int, int] | None,
             operation: str, predicate: str, error: BaseException | None = None) -> None:
        nonlocal complete
        complete = False
        summary["referenceReadFailures"] += 1
        add_failure(failures, truncated, pid=pid, ticks=ticks, uids=uids,
                    operation=operation, predicate=predicate, error=error)

    def classify_missing_process(pid: int, proc: Path, ticks: int | None,
                                 uids: tuple[int, int, int, int] | None,
                                 operation: str, error: FileNotFoundError) -> bool:
        """Return true only when absence of the PID directory is proven."""
        if process_exists(proc):
            fail(pid, ticks, uids, operation, "PROCESS_IDENTITY_UNREADABLE", error)
            return False
        summary["vanishedProcesses"] += 1
        return True

    def add_reference(pid: int, ticks: int, uids: tuple[int, int, int, int],
                      source: str, target: str) -> None:
        if target.endswith(" (deleted)"):
            target = target[:-10]
        for candidate in candidate_paths:
            if references_candidate(candidate, target):
                key = (candidate, pid, ticks, source, target)
                if key in reference_keys:
                    continue
                if len(references) >= MAX_REFERENCES:
                    refuse("REFERENCE_VOLUME_LIMIT")
                reference_keys.add(key)
                references.append({
                    "candidatePath": candidate, "pid": pid, "startTicks": ticks,
                    "uids": {"real": uids[0], "effective": uids[1],
                             "saved": uids[2], "fs": uids[3]},
                    "source": source, "target": target,
                })

    for proc in processes:
        pid = int(proc.name)
        if pid == os.getpid():
            continue
        ticks: int | None = None
        uid_values: tuple[int, int, int, int] | None = None
        local_references: list[tuple[str, str]] = []
        local_writer: dict[str, Any] | None = None
        try:
            _state, flags, ticks = process_stat(proc)
            uid_values = status_uids(proc)
            command_raw = (proc / "cmdline").read_bytes()
        except FileNotFoundError as exc:
            classify_missing_process(pid, proc, ticks, uid_values,
                                     "identity:initial", exc)
            continue
        except (OSError, Refused) as exc:
            if process_exists(proc):
                fail(pid, ticks, uid_values, "identity", "PROCESS_IDENTITY_UNREADABLE", exc)
            else:
                summary["vanishedProcesses"] += 1
            continue
        arguments = [item.decode(errors="replace") for item in command_raw.split(b"\0") if item]
        if not arguments:
            try:
                _after_state, after_flags, after = process_stat(proc)
                after_uids = status_uids(proc)
            except FileNotFoundError as exc:
                classify_missing_process(pid, proc, ticks, uid_values,
                                         "identity:empty-cmdline-revalidation", exc)
                continue
            if after != ticks or after_flags != flags or after_uids != uid_values:
                summary["identityChanges"] += 1
                fail(pid, ticks, uid_values, "identity:after", "PROCESS_IDENTITY_CHANGED")
                continue
            summary["emptyCmdlineProcesses"] += 1
            if flags & PF_KTHREAD:
                if uid_values != (0, 0, 0, 0):
                    fail(pid, ticks, uid_values, "classify:kthread", "KERNEL_THREAD_IDENTITY_INVALID")
                else:
                    summary["kernelThreadsIgnored"] += 1
                continue
            summary["emptyCmdlineProcessesInspected"] += 1
        for argument in arguments:
            possible = argument.split("=", 1)[-1]
            if possible.startswith("/"):
                local_references.append(("cmdline", possible))
        if active_writer(arguments):
            local_writer = {
                "pid": pid, "startTicks": ticks, "uid": uid_values[1],
                "commandSha256": digest(command_raw),
            }
        stable = True
        for leaf in ("cwd", "root", "exe"):
            try:
                local_references.append((leaf, os.readlink(proc / leaf)))
            except FileNotFoundError as exc:
                if process_exists(proc):
                    stable = False; fail(pid, ticks, uid_values, f"readlink:{leaf}",
                                         "PROCESS_REFERENCE_UNREADABLE", exc)
                else:
                    summary["vanishedProcesses"] += 1; stable = False
            except OSError as exc:
                stable = False; fail(pid, ticks, uid_values, f"readlink:{leaf}",
                                     "PROCESS_REFERENCE_UNREADABLE", exc)
        try:
            fd_entries = list((proc / "fd").iterdir())
            if len(fd_entries) > MAX_FDS_PER_PROCESS:
                stable = False; fail(pid, ticks, uid_values, "listdir:fd",
                                     "PROCESS_FD_VOLUME_LIMIT")
                fd_entries = []
        except FileNotFoundError:
            fd_entries = []
            if process_exists(proc):
                stable = False; fail(pid, ticks, uid_values, "listdir:fd",
                                     "PROCESS_REFERENCE_UNREADABLE")
            else:
                summary["vanishedProcesses"] += 1; stable = False
        except OSError as exc:
            fd_entries = []; stable = False
            fail(pid, ticks, uid_values, "listdir:fd", "PROCESS_REFERENCE_UNREADABLE", exc)
        for descriptor in fd_entries:
            try:
                local_references.append((f"fd/{descriptor.name}", os.readlink(descriptor)))
            except FileNotFoundError:
                summary["transientFdClosures"] += 1
            except OSError as exc:
                stable = False
                fail(pid, ticks, uid_values, f"readlink:fd/{descriptor.name}",
                     "PROCESS_REFERENCE_UNREADABLE", exc)
        try:
            maps_raw = (proc / "maps").read_bytes()
            if len(maps_raw) > MAX_MAPS_BYTES:
                stable = False
                fail(pid, ticks, uid_values, "read:maps", "PROCESS_MAPS_VOLUME_LIMIT")
            else:
                for line in maps_raw.decode(errors="replace").splitlines():
                    fields = line.split(None, 5)
                    if len(fields) == 6 and fields[5].startswith("/"):
                        local_references.append(("maps", fields[5]))
        except FileNotFoundError:
            if process_exists(proc):
                stable = False; fail(pid, ticks, uid_values, "read:maps",
                                     "PROCESS_REFERENCE_UNREADABLE")
            else:
                summary["vanishedProcesses"] += 1; stable = False
        except OSError as exc:
            stable = False
            fail(pid, ticks, uid_values, "read:maps", "PROCESS_REFERENCE_UNREADABLE", exc)
        try:
            _after_state, after_flags, after_ticks = process_stat(proc)
            after_uids = status_uids(proc)
        except FileNotFoundError as exc:
            classify_missing_process(pid, proc, ticks, uid_values,
                                     "identity:final-revalidation", exc)
            continue
        except (OSError, Refused) as exc:
            fail(pid, ticks, uid_values, "identity:after", "PROCESS_IDENTITY_UNREADABLE", exc)
            continue
        if (after_ticks != ticks or after_flags != flags or
                after_uids != uid_values):
            summary["identityChanges"] += 1
            fail(pid, ticks, uid_values, "identity:after", "PROCESS_IDENTITY_CHANGED")
            continue
        summary["processesObserved"] += 1
        if stable:
            for source, target in local_references:
                add_reference(pid, ticks, uid_values, source, target)
            if local_writer is not None:
                writers.append(local_writer)
    return {
        "complete": complete, "references": references, "activeWriters": writers,
        "failures": failures, "failureDetailsTruncated": truncated[0],
        "summary": summary,
    }


def stable_root_file(path: Path) -> tuple[bytes, dict[str, Any]]:
    before = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or
            before.st_gid != 0 or stat.S_IMODE(before.st_mode) != 0o500):
        refuse("HELPER_IDENTITY")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        blocks: list[bytes] = []
        while block := os.read(fd, 1024 * 1024):
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    compared = [(item.st_dev, item.st_ino, item.st_mode, item.st_size,
                 item.st_mtime_ns, item.st_ctime_ns) for item in (before, opened, after, current)]
    if len(set(compared)) != 1:
        refuse("HELPER_CHANGED")
    return b"".join(blocks), identity(current)


def installation_identity() -> dict[str, Any]:
    if Path(__file__).absolute() != ROOT_HELPER_PATH or os.geteuid() != 0:
        refuse("HELPER_EXECUTION_IDENTITY")
    ancestors: list[dict[str, Any]] = []
    for path in INSTALL_ANCESTORS:
        info = path.lstat()
        if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or
                info.st_gid != 0 or stat.S_IMODE(info.st_mode) & 0o022):
            refuse("HELPER_ANCESTOR_IDENTITY")
        ancestors.append({"path": str(path), "identity": identity(info)})
    raw, helper_identity = stable_root_file(ROOT_HELPER_PATH)
    interpreter = Path("/proc/self/exe").resolve(strict=True)
    interpreter_info = interpreter.lstat()
    if (not stat.S_ISREG(interpreter_info.st_mode) or interpreter_info.st_uid != 0 or
            interpreter_info.st_gid != 0 or stat.S_IMODE(interpreter_info.st_mode) & 0o022):
        refuse("INTERPRETER_IDENTITY")
    return {
        "path": str(ROOT_HELPER_PATH), "sha256": digest(raw),
        "identity": helper_identity, "ancestors": ancestors,
        "interpreter": {"path": str(interpreter), "identity": identity(interpreter_info)},
    }


def alarm_handler(_signum: int, _frame: Any) -> None:
    raise TimeoutError("OBSERVER_TIME_LIMIT")


def run() -> dict[str, Any]:
    if len(sys.argv) != 2 or sys.argv[1] != "collect":
        refuse("ARGUMENTS")
    try:
        deploy = pwd.getpwnam("deploy")
    except KeyError:
        refuse("DEPLOY_IDENTITY")
    if (os.environ.get("SUDO_UID") != str(deploy.pw_uid) or
            os.environ.get("SUDO_GID") != str(deploy.pw_gid) or
            os.environ.get("SUDO_USER") != "deploy"):
        refuse("SUDO_CALLER_IDENTITY")
    mechanism = installation_identity()
    request_raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    request = validate_request(request_raw)
    if request["deployUid"] != deploy.pw_uid:
        refuse("REQUEST_DEPLOY_UID")
    consumer_path = Path("/proc") / str(request["consumer"]["pid"])
    expected_uids = (deploy.pw_uid,) * 4
    if (start_ticks(consumer_path) != request["consumer"]["startTicks"] or
            status_uids(consumer_path) != expected_uids):
        refuse("CONSUMER_IDENTITY")
    started_wall = time.time_ns()
    started_mono = time.monotonic_ns()
    observation = scan_proc(request["candidatePaths"], deploy.pw_uid)
    if (start_ticks(consumer_path) != request["consumer"]["startTicks"] or
            status_uids(consumer_path) != expected_uids):
        observation["complete"] = False
        observation["summary"]["identityChanges"] += 1
        truncated = [observation["failureDetailsTruncated"]]
        add_failure(observation["failures"], truncated,
                    pid=request["consumer"]["pid"], ticks=request["consumer"]["startTicks"],
                    uids=None, operation="consumer:after", predicate="CONSUMER_IDENTITY_CHANGED")
        observation["failureDetailsTruncated"] = truncated[0]
    finished_wall = time.time_ns()
    result = {
        "schemaVersion": 1, "kind": "CAPACITY_PROC_OBSERVATION",
        "state": "COMPLETE" if observation["complete"] else "INCOMPLETE",
        "phase": request["phase"], "nonce": request["nonce"],
        "requestSha256": digest(request_raw), "candidatePaths": request["candidatePaths"],
        "deployUid": request["deployUid"], "consumer": request["consumer"],
        "mechanism": mechanism, "capturedAtNs": started_wall,
        "finishedAtNs": finished_wall,
        "durationMs": (time.monotonic_ns() - started_mono) // 1_000_000,
        "observation": observation,
    }
    raw = canonical(result)
    if len(raw) > MAX_RESPONSE_BYTES:
        refuse("RESPONSE_VOLUME")
    return result


def main() -> None:
    signal.signal(signal.SIGALRM, alarm_handler)
    signal.alarm(MAX_SECONDS)
    try:
        result = run()
        sys.stdout.buffer.write(canonical(result))
        sys.stdout.buffer.flush()
    except (Refused, TimeoutError, OSError) as exc:
        predicate = str(exc) if isinstance(exc, (Refused, TimeoutError)) else "OBSERVER_IO"
        sys.stdout.buffer.write(canonical({
            "schemaVersion": 1, "kind": "CAPACITY_PROC_OBSERVATION_ERROR",
            "state": "DENY", "predicate": predicate,
        }))
        sys.stdout.buffer.flush()
        raise SystemExit(2)
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    main()
