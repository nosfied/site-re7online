#!/usr/bin/env python3
"""Root-only, read-only /proc observer for canonical capacity recovery.

The program accepts one closed JSON request on stdin and emits one canonical JSON
observation on stdout.  It has no deletion, subprocess, import-from-request or
output-file capability outside the existing VPS preservation mode. Installation
is fixed to ROOT_HELPER_PATH. The builder command accepts either a direct root
session or the one closed authenticated-sudo command pinned below.
"""

from __future__ import annotations

import errno
import fcntl
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
LEGACY_EMPTY_TRANSACTION = (
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-36b94c6d-vps-20261107T165118Z-api-frontend-b58ed195-v3-once")
LEGACY_EMPTY_TRANSACTION_ATTESTATION = Path(
    "/opt/re7online/backups/converta-persistent/preparations/"
    "p00-36b94c6d-b58ed195-v3-empty-transaction-preservation-v1/"
    "privileged-emission-attestation.private.json")
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
DEPLOY_CONTROL_DERIVED_PATHS = {
    "/opt/re7online/deploy-control/ef7db111-prep/node_modules",
    "/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/node_modules",
    "/opt/re7online/deploy-control/ef7db111-prep/.next",
    "/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/dist",
}
CRM_INACTIVE_STAGING_PATHS = {
    "/opt/re7online/releases/crm-csv-front-ea3d2788-20261016",
    "/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016",
}
PF_KTHREAD = 0x00200000
BUILDER_ROOT = Path("/tmp/re7-external-builder-a838bd33-v2")
BUILDER_RELEASE = "immutable-a838bd33-external-20261110T130618Z"
BUILDER_TARGET = "a838bd33ea00ea49be52d61e025a36320a4154c1"
BUILDER_DEVICE = 66306
BUILDER_OUTPUT = BUILDER_ROOT / "build-output"
BUILDER_PRODUCER = BUILDER_OUTPUT / f"{BUILDER_RELEASE}-producer"
BUILDER_RUNTIME_ROOT = BUILDER_PRODUCER / BUILDER_RELEASE
BUILDER_DIRECTORIES = (BUILDER_ROOT, BUILDER_OUTPUT, BUILDER_PRODUCER, BUILDER_RUNTIME_ROOT,
                       *(BUILDER_RUNTIME_ROOT / name for name in sorted(RUNTIME_NAMES)))
BUILDER_LOCKS = (BUILDER_ROOT / ".deployment-window.lock",
                 BUILDER_OUTPUT / ".generation-build.lock")
BUILDER_DIGESTS = {
    "contractSha256": "5e91a5d9c95b0845cc48a75e8a8f1473722c13901d1f058805f5fd70cb9faa8a",
    "packageSha256": "99b8ef1d6e056cc6846d6c85731bc41c53dfe251657ead62a12305d5b65ffacb",
    "manifestSha256": "389a1c9ead3fabab8e28b035cc0741bb090835fdb930aec6cf90b9a2afd477c3",
    "indexSha256": "490f96946172d0248647bba16fd51248fca13098a85b156b28aecc4843980af2",
}
BUILDER_SUDO_COMMAND = (
    "/usr/bin/python3 -I -B -E -s "
    "/usr/local/libexec/re7online/capacity-proc-observer.py "
    "collect-builder-a838bd33"
)
DISPOSABLE_GENERATION = "immutable-fa10f4f5-external-20261112T233820Z"
DISPOSABLE_TARGET = "fa10f4f59c9a05328e536dd25a1668c3ba25939e"
DISPOSABLE_ROOT = Path("/tmp/re7-disposable-builder-e1-fa10f4f5-20261112T233820Z")
DISPOSABLE_CUSTODY = Path(
    "/home/deifson-oliveira/DEIFSON/re7-disposable-builder-custody/"
    "immutable-fa10f4f5-external-20261112T233820Z")
DISPOSABLE_CONTRACT_SHA256 = "ababa172ff6a11bc1702b084ddf7668819e82db48690a4970ef479788799a0b2"
DISPOSABLE_LIFECYCLE_SHA256 = "b17053bf86407bce39870018e6eeaac967ce9e6b6f86af8f4da672c861b0c03a"
DISPOSABLE_LOCKS = (
    DISPOSABLE_CUSTODY / "disposable-builder.lifecycle.lock",
    DISPOSABLE_CUSTODY / "disposable-builder.writer.lock",
)
DISPOSABLE_SUDO_COMMAND = (
    "/usr/bin/python3 -I -B -E -s "
    "/usr/local/libexec/re7online/capacity-proc-observer.py "
    "collect-disposable-builder-fa10f4f5"
)


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
    if candidate == LEGACY_EMPTY_TRANSACTION:
        return candidate
    if candidate in MANIFEST_DISPOSITION_PATHS:
        return candidate
    if candidate in DEPLOY_CONTROL_DERIVED_PATHS:
        return candidate
    if candidate in CRM_INACTIVE_STAGING_PATHS:
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
    if isinstance(value, dict) and value.get("phase") == "preserve":
        required.add("preservationRequestSha256")
    if (not isinstance(value, dict) or set(value) != required or
            value.get("schemaVersion") != 1 or
            value.get("kind") != "CAPACITY_PROC_OBSERVATION_REQUEST" or
            value.get("phase") not in {"audit", "prepare", "execute", "preserve"}):
        refuse("REQUEST_SCHEMA")
    if (value["phase"] == "preserve" and
            (not isinstance(value.get("preservationRequestSha256"), str) or
             len(value["preservationRequestSha256"]) != SHA256_LENGTH or
             any(char not in "0123456789abcdef"
                 for char in value["preservationRequestSha256"]))):
        refuse("PRESERVATION_REQUEST_SHA256")
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


def emit_preservation_attestation(request_raw: bytes, request: dict[str, Any],
                                  observation: dict[str, Any], mechanism: dict[str, Any],
                                  deploy_gid: int) -> dict[str, Any]:
    if (request["candidatePaths"] != [LEGACY_EMPTY_TRANSACTION] or
            not observation["complete"] or observation["references"]):
        refuse("PRESERVATION_ATTESTATION_PRECONDITION")
    payload = {
        "schemaVersion": 1, "kind": "PRIVILEGED_PRESERVATION_ATTESTATION",
        "observerRequestSha256": digest(request_raw),
        "preservationRequestSha256": request["preservationRequestSha256"],
        "candidatePath": LEGACY_EMPTY_TRANSACTION,
        "observationSha256": digest(canonical(observation)),
        "helperSha256": mechanism["sha256"],
        "historicalInvocationResultAuthenticated": False,
    }
    path = LEGACY_EMPTY_TRANSACTION_ATTESTATION
    parent = path.parent
    parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            parent_info.st_uid != request["deployUid"] or
            parent_info.st_gid != deploy_gid or stat.S_IMODE(parent_info.st_mode) & 0o077):
        refuse("PRESERVATION_ATTESTATION_PARENT")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o440)
    try:
        os.fchown(fd, 0, deploy_gid)
        os.fchmod(fd, 0o440)
        raw = canonical(payload)
        view = memoryview(raw)
        while view:
            view = view[os.write(fd, view):]
        os.fsync(fd)
        info = os.fstat(fd)
    finally:
        os.close(fd)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return {"path": str(path), "sha256": digest(raw), "identity": identity(info),
            "observationSha256": payload["observationSha256"],
            "helperSha256": payload["helperSha256"],
            "observerRequestSha256": payload["observerRequestSha256"],
            "preservationRequestSha256": payload["preservationRequestSha256"]}


def alarm_handler(_signum: int, _frame: Any) -> None:
    raise TimeoutError("OBSERVER_TIME_LIMIT")


def builder_request(raw: bytes) -> dict[str, Any]:
    if len(raw) > MAX_REQUEST_BYTES:
        refuse("REQUEST_VOLUME")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        refuse("REQUEST_JSON")
    expected = {"schemaVersion": 1, "kind": "A838BD33_BUILDER_PROC_REQUEST",
                "targetCommit": BUILDER_TARGET, "releaseId": BUILDER_RELEASE,
                **BUILDER_DIGESTS}
    if (not isinstance(value, dict) or
            set(value) != set(expected) | {"nonce", "paths", "contract"} or
            any(value[key] != binding for key, binding in expected.items()) or
            canonical(value) != raw):
        refuse("BUILDER_REQUEST_SCHEMA")
    nonce = value["nonce"]
    if (not isinstance(nonce, str) or len(nonce) != SHA256_LENGTH or
            any(char not in "0123456789abcdef" for char in nonce)):
        refuse("REQUEST_NONCE")
    paths = value["paths"]
    if not isinstance(paths, dict) or set(paths) != {
            str(path) for path in (*BUILDER_DIRECTORIES, *BUILDER_LOCKS)}:
        refuse("BUILDER_PATHS")
    for path, binding in paths.items():
        lock = Path(path) in BUILDER_LOCKS
        fields = {"device", "inode", "sha256"} if lock else {"device", "inode"}
        if (not isinstance(binding, dict) or set(binding) != fields or
                type(binding["device"]) is not int or binding["device"] != BUILDER_DEVICE or
                type(binding["inode"]) is not int or binding["inode"] <= 0):
            refuse("BUILDER_PATH_BINDING")
        if lock and (not isinstance(binding["sha256"], str) or
                     len(binding["sha256"]) != SHA256_LENGTH or
                     any(char not in "0123456789abcdef" for char in binding["sha256"])):
            refuse("BUILDER_LOCK_BINDING")
    validate_builder_contract(value["contract"], paths)
    return value


def validate_builder_contract(raw: Any, paths: dict[str, Any]) -> None:
    if not isinstance(raw, str) or digest(raw.encode()) != BUILDER_DIGESTS["contractSha256"]:
        refuse("BUILDER_CONTRACT_SHA256")
    try:
        contract = json.loads(raw)
    except json.JSONDecodeError:
        refuse("BUILDER_CONTRACT_JSON")
    if (not isinstance(contract, dict) or contract.get("targetCommit") != BUILDER_TARGET or
            contract.get("releaseId") != BUILDER_RELEASE or
            contract.get("writerLockPath") != str(BUILDER_LOCKS[1]) or
            not isinstance(contract.get("artifacts"), list)):
        refuse("BUILDER_CONTRACT_BINDING")
    runtimes = [item for item in contract["artifacts"]
                if isinstance(item, dict) and item.get("class") == "DERIVED_OUTPUT_RUNTIME"]
    candidates = {str(path) for path in BUILDER_DIRECTORIES[-2:]}
    if (len(runtimes) != len(candidates) or
            any(not isinstance(item.get("path"), str) for item in runtimes) or
            {item["path"] for item in runtimes} != candidates):
        refuse("BUILDER_CONTRACT_PATHS")
    for item in runtimes:
        if (item.get("targetCommit") != BUILDER_TARGET or item.get("releaseId") != BUILDER_RELEASE or
                item.get("observedIdentity") != paths[item["path"]]):
            refuse("BUILDER_CONTRACT_RUNTIME_IDENTITY")


def builder_path_identity(path: Path, binding: dict[str, Any], owner: tuple[int, int],
                          *, lock: bool = False) -> dict[str, Any]:
    info = path.lstat()
    if (path.resolve(strict=True) != path or
            (info.st_dev, info.st_ino) != (binding["device"], binding["inode"]) or
            (info.st_uid, info.st_gid) != owner):
        refuse("BUILDER_PATH_IDENTITY")
    mode = stat.S_IMODE(info.st_mode)
    if lock:
        if (not stat.S_ISREG(info.st_mode) or mode != 0o600 or info.st_nlink != 1 or
                info.st_size > 4096):
            refuse("BUILDER_LOCK_IDENTITY")
    elif (not stat.S_ISDIR(info.st_mode) or mode not in {0o700, 0o755} or
          (path in (BUILDER_ROOT, BUILDER_OUTPUT) and mode != 0o700)):
        refuse("BUILDER_DIRECTORY_IDENTITY")
    return identity(info)


def builder_administrative_execution(owner: tuple[int, int],
                                     expected_command: str = BUILDER_SUDO_COMMAND) -> dict[str, Any]:
    if os.geteuid() != 0:
        refuse("BUILDER_ROOT_REQUIRED")
    sudo = {key: value for key, value in os.environ.items() if key.startswith("SUDO_")}
    if not sudo:
        return {"mode": "DIRECT_ROOT"}
    expected_keys = {"SUDO_UID", "SUDO_GID", "SUDO_USER", "SUDO_COMMAND"}
    try:
        account = pwd.getpwuid(owner[0])
    except KeyError:
        refuse("BUILDER_SUDO_CALLER_IDENTITY")
    if (set(sudo) != expected_keys or sudo["SUDO_UID"] != str(owner[0]) or
            sudo["SUDO_GID"] != str(owner[1]) or sudo["SUDO_USER"] != account.pw_name or
            sudo["SUDO_COMMAND"] != expected_command):
        refuse("BUILDER_SUDO_CALLER_IDENTITY")
    return {"mode": "AUTHENTICATED_SUDO", "uid": owner[0], "gid": owner[1],
            "user": account.pw_name, "commandSha256": digest(expected_command.encode())}


def disposable_request(raw: bytes) -> dict[str, Any]:
    if len(raw) > MAX_REQUEST_BYTES:
        refuse("REQUEST_VOLUME")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        refuse("REQUEST_JSON")
    expected_fields = {
        "schemaVersion", "kind", "phase", "generationId", "targetCommit",
        "contractSha256", "lifecycleSha256", "contract", "lifecycle", "nonce",
        "consumer", "root", "worktree", "locks", "maxAgeSeconds",
    }
    if (not isinstance(value, dict) or set(value) != expected_fields or canonical(value) != raw or
            value.get("schemaVersion") != 1 or
            value.get("kind") != "DISPOSABLE_BUILDER_PROC_REQUEST" or
            value.get("phase") not in {"PREPARE", "EXECUTE"} or
            value.get("generationId") != DISPOSABLE_GENERATION or
            value.get("targetCommit") != DISPOSABLE_TARGET or
            value.get("contractSha256") != DISPOSABLE_CONTRACT_SHA256 or
            value.get("lifecycleSha256") != DISPOSABLE_LIFECYCLE_SHA256 or
            value.get("maxAgeSeconds") != (300 if value.get("phase") == "PREPARE" else 60)):
        refuse("DISPOSABLE_REQUEST_SCHEMA")
    nonce = value.get("nonce")
    if (not isinstance(nonce, str) or len(nonce) != SHA256_LENGTH or
            any(char not in "0123456789abcdef" for char in nonce)):
        refuse("REQUEST_NONCE")
    try:
        contract_raw = value["contract"].encode()
        lifecycle_raw = value["lifecycle"].encode()
    except (AttributeError, UnicodeEncodeError):
        refuse("DISPOSABLE_AUTHORITY")
    if (digest(contract_raw) != DISPOSABLE_CONTRACT_SHA256 or
            digest(lifecycle_raw) != DISPOSABLE_LIFECYCLE_SHA256):
        refuse("DISPOSABLE_AUTHORITY")
    try:
        contract = json.loads(contract_raw)
        lifecycle = json.loads(lifecycle_raw)
    except json.JSONDecodeError:
        refuse("DISPOSABLE_AUTHORITY")
    if (contract.get("schemaVersion") != 1 or contract.get("generationId") != DISPOSABLE_GENERATION or
            contract.get("targetCommit") != DISPOSABLE_TARGET or
            contract.get("disposableRoot") != str(DISPOSABLE_ROOT) or
            contract.get("custodyRoot") != str(DISPOSABLE_CUSTODY) or
            contract.get("locks") != {"lifecycle": str(DISPOSABLE_LOCKS[0]),
                                      "writer": str(DISPOSABLE_LOCKS[1])} or
            lifecycle.get("schemaVersion") != 1 or lifecycle.get("generationId") != DISPOSABLE_GENERATION or
            lifecycle.get("targetCommit") != DISPOSABLE_TARGET or lifecycle.get("state") != "EXPORTED" or
            lifecycle.get("event") != "AUTHORITY_EXPORTED" or
            lifecycle.get("contractSha256") != DISPOSABLE_CONTRACT_SHA256):
        refuse("DISPOSABLE_AUTHORITY")
    root_binding = value.get("root")
    if (not isinstance(root_binding, dict) or root_binding != lifecycle.get("rootIdentity")):
        refuse("DISPOSABLE_ROOT_BINDING")
    if value.get("worktree") != contract.get("worktreePath"):
        refuse("DISPOSABLE_WORKTREE_BINDING")
    locks = value.get("locks")
    if (not isinstance(locks, list) or len(locks) != 2 or
            [item.get("path") for item in locks if isinstance(item, dict)] !=
            [str(path) for path in DISPOSABLE_LOCKS]):
        refuse("DISPOSABLE_LOCK_BINDING")
    consumer = value.get("consumer")
    if (not isinstance(consumer, dict) or set(consumer) != {"pid", "startTicks"} or
            type(consumer.get("pid")) is not int or type(consumer.get("startTicks")) is not int or
            consumer["pid"] <= 0 or consumer["startTicks"] <= 0):
        refuse("DISPOSABLE_CONSUMER_BINDING")
    return value


def _disposable_identity(path: Path, expected: dict[str, Any], owner: tuple[int, int],
                         *, lock: bool = False) -> dict[str, Any]:
    info = path.lstat()
    projected = identity(info)
    if (path.resolve(strict=True) != path or (info.st_uid, info.st_gid) != owner or
            projected.get("device") != expected.get("device") or
            projected.get("inode") != expected.get("inode")):
        refuse("DISPOSABLE_PATH_IDENTITY")
    if lock:
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or
                info.st_nlink != 1 or digest(path.read_bytes()) != expected.get("sha256")):
            refuse("DISPOSABLE_LOCK_IDENTITY")
    elif (not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700):
        refuse("DISPOSABLE_ROOT_IDENTITY")
    return projected


def _consumer_holds_locks(consumer: dict[str, int], locks: list[dict[str, Any]],
                          owner: tuple[int, int]) -> None:
    process = Path("/proc") / str(consumer["pid"])
    if (start_ticks(process) != consumer["startTicks"] or status_uids(process) != (owner[0],) * 4):
        refuse("DISPOSABLE_CONSUMER_IDENTITY")
    wanted = {(item["device"], item["inode"]) for item in locks}
    observed: set[tuple[int, int]] = set()
    try:
        descriptors = list((process / "fd").iterdir())
    except OSError:
        refuse("DISPOSABLE_CONSUMER_LOCKS")
    for descriptor in descriptors:
        try:
            info = descriptor.stat()
        except OSError:
            continue
        key = (info.st_dev, info.st_ino)
        if key in wanted:
            observed.add(key)
    if observed != wanted:
        refuse("DISPOSABLE_CONSUMER_LOCKS")
    for item in locks:
        descriptor = os.open(item["path"], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                continue
            refuse("DISPOSABLE_CONSUMER_LOCKS")
        finally:
            os.close(descriptor)


def collect_disposable(raw: bytes) -> dict[str, Any]:
    request = disposable_request(raw)
    root = DISPOSABLE_ROOT.lstat()
    owner = (root.st_uid, root.st_gid)
    if owner[0] == 0:
        refuse("DISPOSABLE_OWNER")
    before_root = _disposable_identity(DISPOSABLE_ROOT, request["root"], owner)
    before_locks = [
        _disposable_identity(Path(item["path"]), item, owner, lock=True)
        for item in request["locks"]
    ]
    _consumer_holds_locks(request["consumer"], request["locks"], owner)
    started = time.time_ns()
    observation = scan_proc([str(DISPOSABLE_ROOT)], owner[0])
    if observation.get("complete") is not True:
        refuse("DISPOSABLE_PROCESS_OBSERVATION_INCOMPLETE")
    if observation.get("references"):
        refuse("DISPOSABLE_PROCESS_REFERENCE")
    if observation.get("activeWriters"):
        refuse("DISPOSABLE_ACTIVE_WRITER")
    if (_disposable_identity(DISPOSABLE_ROOT, request["root"], owner) != before_root or
            [_disposable_identity(Path(item["path"]), item, owner, lock=True)
             for item in request["locks"]] != before_locks):
        refuse("DISPOSABLE_PATH_CHANGED")
    _consumer_holds_locks(request["consumer"], request["locks"], owner)
    return {
        "schemaVersion": 1, "kind": "DISPOSABLE_BUILDER_PROC_ATTESTATION",
        "state": "COMPLETE", "phase": request["phase"],
        "requestSha256": digest(raw), "nonce": request["nonce"],
        "generationId": DISPOSABLE_GENERATION, "targetCommit": DISPOSABLE_TARGET,
        "contractSha256": DISPOSABLE_CONTRACT_SHA256,
        "lifecycleSha256": DISPOSABLE_LIFECYCLE_SHA256,
        "candidatePaths": [str(DISPOSABLE_ROOT)], "root": before_root,
        "locks": before_locks, "consumer": request["consumer"],
        "capturedAtNs": started, "finishedAtNs": time.time_ns(),
        "observation": observation,
    }


def collect_builder(raw: bytes) -> dict[str, Any]:
    request = builder_request(raw)
    bindings = request["paths"]
    root = BUILDER_ROOT.lstat()
    owner = (root.st_uid, root.st_gid)
    if owner[0] == 0:
        refuse("BUILDER_OWNER")
    paths = (*BUILDER_DIRECTORIES, *BUILDER_LOCKS)

    def capture() -> dict[str, dict[str, Any]]:
        return {str(path): builder_path_identity(
            path, bindings[str(path)], owner, lock=path in BUILDER_LOCKS) for path in paths}

    before = capture()
    descriptors: list[int] = []
    try:
        for path in BUILDER_LOCKS:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
            descriptors.append(fd)
            opened = os.fstat(fd)
            if identity(opened) != before[str(path)] or opened.st_nlink != 1:
                refuse("BUILDER_LOCK_IDENTITY")
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                refuse("BUILDER_LOCK_BUSY")
            if digest(os.pread(fd, 4097, 0)) != bindings[str(path)]["sha256"]:
                refuse("BUILDER_LOCK_BINDING")
        if capture() != before:
            refuse("BUILDER_PATH_CHANGED")
        candidates = [str(path) for path in BUILDER_DIRECTORIES[-2:]]
        started = time.time_ns()
        observation = scan_proc(candidates, owner[0])
        if observation["complete"] is not True:
            refuse("BUILDER_PROCESS_OBSERVATION_INCOMPLETE")
        if observation["references"]:
            refuse("BUILDER_PROCESS_REFERENCE")
        if observation["activeWriters"]:
            refuse("BUILDER_ACTIVE_WRITER")
        if capture() != before:
            refuse("BUILDER_PATH_CHANGED")
        return {"schemaVersion": 1, "kind": "A838BD33_BUILDER_PROC_ATTESTATION",
                "state": "COMPLETE", "requestSha256": digest(raw), "nonce": request["nonce"],
                "targetCommit": BUILDER_TARGET, "releaseId": BUILDER_RELEASE, **BUILDER_DIGESTS,
                "candidatePaths": candidates, "paths": before, "bindings": bindings,
                "capturedAtNs": started,
                "finishedAtNs": time.time_ns(), "observation": observation}
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def run() -> dict[str, Any]:
    if sys.argv[1:] == ["collect-disposable-builder-fa10f4f5"]:
        mechanism = installation_identity()
        root = DISPOSABLE_ROOT.lstat()
        administrative_execution = builder_administrative_execution(
            (root.st_uid, root.st_gid), DISPOSABLE_SUDO_COMMAND)
        result = collect_disposable(sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1))
        result["mechanism"] = mechanism
        result["administrativeExecution"] = administrative_execution
        if len(canonical(result)) > MAX_RESPONSE_BYTES:
            refuse("RESPONSE_VOLUME")
        return result
    if sys.argv[1:] == ["collect-builder-a838bd33"]:
        mechanism = installation_identity()
        root = BUILDER_ROOT.lstat()
        administrative_execution = builder_administrative_execution((root.st_uid, root.st_gid))
        result = collect_builder(sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1))
        result["mechanism"] = mechanism
        result["administrativeExecution"] = administrative_execution
        if len(canonical(result)) > MAX_RESPONSE_BYTES:
            refuse("RESPONSE_VOLUME")
        return result
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
    if request["phase"] == "preserve":
        result["attestation"] = emit_preservation_attestation(
            request_raw, request, observation, mechanism, deploy.pw_gid)
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
