#!/usr/bin/env python3
"""Canonical continuation wrapper for an already accepted fixed-current finalize.

The wrapper owns the existing deployment lock, passes its authenticated open-file
description as fd 9, and gives the child already-open exclusive stdout/stderr
files.  It never invokes preflight, activate, rollback, readiness, or restart.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from typing import Any, Callable

LOCK_FD = 9
LOCK_ENV = "RE7_DEPLOYMENT_LOCK_HELD"
RUNTIME_CACHE_RELEASE = "immutable-36b94c6d-vps-20261107T165118Z"
RUNTIME_CACHE_TARGET = "36b94c6da7a1f3e07d4a123d0629b35bea48b014"
RUNTIME_CACHE_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-36b94c6d-vps-20261107T165118Z-api-frontend-6fd93b08-v4-once"
)
RUNTIME_CACHE_INTENT_SHA256 = "6064a4a98ede89bb085b09e4e474048d976aa9cf31a4c0cd03207be18a0c4f7c"


class Denied(RuntimeError):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_regular(path: Path, *, modes: set[int]) -> bytes:
    try:
        before = path.lstat()
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as error:
        raise Denied(f"input_open:{path.name}") from error
    try:
        opened = os.fstat(fd)
        if (stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(opened.st_mode) or
                (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or
                (opened.st_uid, opened.st_gid) != (os.geteuid(), os.getegid()) or
                stat.S_IMODE(opened.st_mode) not in modes):
            raise Denied(f"input_identity:{path.name}")
        chunks: list[bytes] = []
        while block := os.read(fd, 1024 * 1024):
            chunks.append(block)
        after = os.fstat(fd)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size,
                                  value.st_mtime_ns, value.st_ctime_ns)
        if identity(opened) != identity(after):
            raise Denied(f"input_changed:{path.name}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _sha256_value(value: Any) -> bool:
    return (isinstance(value, str) and len(value) == 64 and
            all(character in "0123456789abcdef" for character in value))


def _argv_value(argv: list[str], flag: str) -> str:
    if argv.count(flag) != 1:
        raise Denied(f"request_finalize_argv:{flag}")
    index = argv.index(flag)
    if index + 1 >= len(argv):
        raise Denied(f"request_finalize_argv:{flag}")
    return argv[index + 1]


def _bound_regular(path: Path, expected_sha256: str) -> bytes:
    if not path.is_absolute() or not _sha256_value(expected_sha256):
        raise Denied("request_recovery_binding")
    raw = stable_regular(path, modes={0o600})
    if sha256(raw) != expected_sha256:
        raise Denied("request_recovery_sha256")
    return raw


def _validate_checkout_driver(value: dict[str, Any], argv: list[str]) -> None:
    driver = Path(value["driver"])
    if driver.name != "converta-deploy.py" or driver.parent.name != "scripts":
        raise Denied("request_driver_checkout")
    if sha256(stable_regular(driver, modes={0o500, 0o600})) != value["driverSha256"]:
        raise Denied("request_driver_sha256")
    repo = driver.parent.parent
    control_plane = _argv_value(argv, "--control-plane")
    commands = {
        "head": ["git", "-C", str(repo), "rev-parse", "HEAD"],
        "tracked": ["git", "-C", str(repo), "ls-files", "--error-unmatch", "--",
                    "scripts/converta-deploy.py"],
        "blob": ["git", "-C", str(repo), "show", f"{control_plane}:scripts/converta-deploy.py"],
        "status": ["git", "-C", str(repo), "status", "--porcelain=v1",
                   "--untracked-files=all"],
    }
    results = {
        name: subprocess.run(command, check=False, capture_output=True)
        for name, command in commands.items()
    }
    if (any(result.returncode for result in results.values()) or
            results["head"].stdout.decode().strip() != control_plane or
            results["tracked"].stdout.decode().strip() != "scripts/converta-deploy.py" or
            results["status"].stdout or
            sha256(results["blob"].stdout) != value["driverSha256"]):
        raise Denied("request_driver_checkout")


def _validate_finalize_continuation(value: dict[str, Any], argv: list[str]) -> None:
    attempt = value.get("attemptOrdinal")
    if not isinstance(attempt, int) or isinstance(attempt, bool) or not 2 <= attempt <= 99:
        raise Denied("request_attempt_ordinal")
    transaction = Path(value["transactionRoot"])
    outputs = value.get("evidenceOutputs")
    if not isinstance(outputs, dict) or set(outputs) != {"stdout", "stderr", "exit"}:
        raise Denied("request_evidence_outputs")
    output_paths: list[Path] = []
    for name in ("stdout", "stderr", "exit"):
        output = Path(outputs.get(name, ""))
        expected = f"fixed-current-finalize-continuation-attempt-{attempt:02d}.{name}.private.txt"
        if not output.is_absolute() or output.parent != transaction or output.name != expected:
            raise Denied("request_evidence_outputs")
        output_paths.append(output)
    if len(set(output_paths)) != 3:
        raise Denied("request_evidence_outputs")

    recovery = value.get("recovery")
    expected_recovery = {
        "priorRequest", "priorRequestSha256", "negativeJournal",
        "negativeJournalSha256", "priorEvidence",
    }
    if not isinstance(recovery, dict) or set(recovery) != expected_recovery:
        raise Denied("request_recovery_schema")
    prior_request_path = Path(recovery.get("priorRequest", ""))
    prior_raw = _bound_regular(prior_request_path, recovery.get("priorRequestSha256", ""))
    try:
        prior = json.loads(prior_raw)
    except json.JSONDecodeError as error:
        raise Denied("request_recovery_prior_json") from error
    prior_required = {"schemaVersion", "action", "lockPath", "transactionRoot",
                      "driver", "driverSha256", "finalizeArgv"}
    if (not isinstance(prior, dict) or set(prior) != prior_required or
            prior.get("schemaVersion") != 1 or prior.get("action") != "finalize" or
            prior.get("lockPath") != value["lockPath"] or
            prior.get("transactionRoot") != value["transactionRoot"] or
            prior.get("driverSha256") != value["driverSha256"] or
            not isinstance(prior.get("finalizeArgv"), list) or
            prior["finalizeArgv"][:2] != ["/usr/bin/python3", "-B"] or
            prior["finalizeArgv"][3:4] != ["finalize"] or
            prior["finalizeArgv"][4:] != argv[4:]):
        raise Denied("request_recovery_prior_binding")

    journal_path = Path(recovery.get("negativeJournal", ""))
    if journal_path != transaction / "transaction.v1.private.json":
        raise Denied("request_recovery_journal_path")
    journal_raw = _bound_regular(journal_path, recovery.get("negativeJournalSha256", ""))
    try:
        journal = json.loads(journal_raw)
    except json.JSONDecodeError as error:
        raise Denied("request_recovery_journal_json") from error
    if (not isinstance(journal, dict) or journal.get("state") != "FAILED" or
            journal.get("recoveryAction") != "finalize" or
            journal.get("saveCount") not in {0, 1}):
        raise Denied("request_recovery_journal_state")

    prior_evidence = recovery.get("priorEvidence")
    if not isinstance(prior_evidence, dict) or set(prior_evidence) != {"stdout", "stderr", "exit"}:
        raise Denied("request_recovery_evidence")
    expected_names = {
        name: transaction / f"fixed-current-finalize-continuation.{name}.private.txt"
        for name in ("stdout", "stderr", "exit")
    }
    for name, expected_path in expected_names.items():
        binding = prior_evidence.get(name)
        if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
            raise Denied("request_recovery_evidence")
        path = Path(binding.get("path", ""))
        if path != expected_path:
            raise Denied("request_recovery_evidence")
        _bound_regular(path, binding.get("sha256", ""))
    try:
        exit_code = int(expected_names["exit"].read_text().strip())
    except (OSError, ValueError) as error:
        raise Denied("request_recovery_exit") from error
    if exit_code == 0:
        raise Denied("request_recovery_exit")
    _validate_checkout_driver(value, argv)


def load_request(path: Path, expected_sha256: str) -> dict[str, Any]:
    raw = stable_regular(path, modes={0o600})
    if sha256(raw) != expected_sha256:
        raise Denied("request_sha256")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise Denied("request_json") from error
    common = {"schemaVersion", "action", "lockPath", "transactionRoot"}
    if value.get("schemaVersion") != 1 or not common.issubset(value):
        raise Denied("request_schema")
    action = value.get("action")
    if action in {"finalize", "finalize_continuation", "finalize_runtime_cache_continuation"}:
        required = common | {"driver", "driverSha256", "finalizeArgv"}
        if action == "finalize_continuation":
            required |= {"attemptOrdinal", "evidenceOutputs", "recovery"}
        if action == "finalize_runtime_cache_continuation":
            required |= {"attemptOrdinal", "evidenceOutputs"}
        if set(value) != required:
            raise Denied("request_schema")
        for name in ("lockPath", "transactionRoot", "driver"):
            item = value.get(name)
            if not isinstance(item, str) or not Path(item).is_absolute():
                raise Denied(f"request_path:{name}")
        if not _sha256_value(value.get("driverSha256")):
            raise Denied("request_driver_sha256")
        argv = value.get("finalizeArgv")
        if (not isinstance(argv, list) or not argv or
                not all(isinstance(item, str) and item for item in argv) or
                argv[:4] != ["/usr/bin/python3", "-B", value["driver"], "finalize"] or
                any(item in {"preflight", "activate", "rollback", "restart"}
                    for item in argv[4:])):
            raise Denied("request_finalize_argv")
        if action == "finalize_runtime_cache_continuation":
            attempt = value.get("attemptOrdinal")
            if not isinstance(attempt, int) or isinstance(attempt, bool) or not 1 <= attempt <= 99:
                raise Denied("request_attempt_ordinal")
            outputs = value.get("evidenceOutputs")
            if not isinstance(outputs, dict) or set(outputs) != {"stdout", "stderr", "exit"}:
                raise Denied("request_evidence_outputs")
            transaction = Path(value["transactionRoot"])
            if (transaction != RUNTIME_CACHE_TRANSACTION or
                    _argv_value(argv, "--release") != RUNTIME_CACHE_RELEASE or
                    _argv_value(argv, "--target") != RUNTIME_CACHE_TARGET or
                    _argv_value(argv, "--transaction-root") != str(RUNTIME_CACHE_TRANSACTION) or
                    _argv_value(argv, "--generation-retirement-intent-sha256") !=
                    RUNTIME_CACHE_INTENT_SHA256 or
                    not Path(_argv_value(argv, "--runtime-cache-reconciliation")).is_absolute() or
                    not _sha256_value(_argv_value(argv, "--runtime-cache-reconciliation-sha256"))):
                raise Denied("request_runtime_cache_scope")
            paths: list[Path] = []
            for name in ("stdout", "stderr", "exit"):
                item = outputs.get(name)
                if not isinstance(item, str) or not Path(item).is_absolute():
                    raise Denied(f"request_path:evidenceOutputs.{name}")
                output = Path(item)
                expected_name = f"runtime-cache-finalize-v1-attempt-{attempt:02d}.{name}.private.txt"
                if (output.parent != transaction or
                        output.name != expected_name):
                    raise Denied("request_evidence_outputs")
                paths.append(output)
            if len(set(paths)) != 3:
                raise Denied("request_evidence_outputs")
        elif action == "finalize_continuation":
            _validate_finalize_continuation(value, argv)
    elif action == "release_terminal_lock":
        required = common | {
            "transactionJournalSha256", "lockSha256", "receiptOutput",
        }
        if set(value) != required:
            raise Denied("request_schema")
        for name in ("lockPath", "transactionRoot", "receiptOutput"):
            item = value.get(name)
            if not isinstance(item, str) or not Path(item).is_absolute():
                raise Denied(f"request_path:{name}")
        for name in ("transactionJournalSha256", "lockSha256"):
            if not _sha256_value(value.get(name)):
                raise Denied(f"request_sha256:{name}")
    else:
        raise Denied("request_action")
    return value


def acquire_lock(path: Path) -> int:
    try:
        before = path.lstat()
        fd = os.open(path, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
    except OSError as error:
        raise Denied("lock_open") from error
    try:
        opened = os.fstat(fd)
        if (stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(opened.st_mode) or
                (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or
                (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600)):
            raise Denied("lock_identity")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise Denied("lock_busy") from error
        if fd != LOCK_FD:
            os.dup2(fd, LOCK_FD, inheritable=True)
            os.close(fd)
            fd = LOCK_FD
        else:
            os.set_inheritable(fd, True)
        validate_lock(path, fd)
        return fd
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


def validate_lock(path: Path, fd: int = LOCK_FD) -> None:
    try:
        current = path.lstat()
        opened = os.fstat(fd)
    except OSError as error:
        raise Denied("external_lock_fd") from error
    if (path.is_symlink() or not stat.S_ISREG(opened.st_mode) or
            (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino) or
            (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o600) or not os.get_inheritable(fd)):
        raise Denied("external_lock_identity")
    try:
        fdinfo = Path(f"/proc/self/fdinfo/{fd}").read_text()
    except OSError as error:
        raise Denied("external_lock_fdinfo") from error
    expected = (os.major(opened.st_dev), os.minor(opened.st_dev), opened.st_ino)
    owned = False
    for line in fdinfo.splitlines():
        fields = line.split()
        if len(fields) < 7 or fields[0] != "lock:" or fields[2:5] != ["FLOCK", "ADVISORY", "WRITE"]:
            continue
        try:
            major, minor, inode = fields[6].split(":")
            observed = (int(major, 16), int(minor, 16), int(inode))
        except (ValueError, IndexError):
            continue
        if observed == expected:
            owned = True
            break
    if not owned:
        raise Denied("external_lock_not_held")
    probe = os.open(path, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
    try:
        try:
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        fcntl.flock(probe, fcntl.LOCK_UN)
        raise Denied("external_lock_not_held")
    finally:
        os.close(probe)


def _open_exclusive(path: Path) -> int:
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as error:
        raise Denied(f"evidence_open:{path.name}") from error
    opened = os.fstat(fd)
    if (not stat.S_ISREG(opened.st_mode) or
            (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o600)):
        os.close(fd)
        raise Denied(f"evidence_identity:{path.name}")
    return fd


def open_evidence(transaction: Path, outputs: dict[str, str] | None = None
                  ) -> tuple[dict[str, Path], tuple[int, int, int]]:
    info = transaction.lstat()
    if (transaction.is_symlink() or not transaction.is_dir() or
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("transaction_root")
    paths = ({name: Path(value) for name, value in outputs.items()} if outputs is not None else {
        "stdout": transaction / "fixed-current-finalize-continuation.stdout.private.txt",
        "stderr": transaction / "fixed-current-finalize-continuation.stderr.private.txt",
        "exit": transaction / "fixed-current-finalize-continuation.exit.private.txt",
    })
    if set(paths) != {"stdout", "stderr", "exit"} or any(
            path.parent != transaction for path in paths.values()):
        raise Denied("evidence_paths")
    if any(path.exists() or path.is_symlink() for path in paths.values()):
        raise Denied("evidence_exists")
    opened: list[int] = []
    try:
        for name in ("stdout", "stderr", "exit"):
            opened.append(_open_exclusive(paths[name]))
    except Exception:
        for fd in opened:
            os.close(fd)
        raise
    return paths, (opened[0], opened[1], opened[2])


def _write_all(fd: int, raw: bytes) -> None:
    view = memoryview(raw)
    while view:
        written = os.write(fd, view)
        if written <= 0:
            raise OSError("short_write")
        view = view[written:]


def _fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _lock_bytes(lock_fd: int) -> bytes:
    os.lseek(lock_fd, 0, os.SEEK_SET)
    chunks: list[bytes] = []
    while block := os.read(lock_fd, 1024 * 1024):
        chunks.append(block)
    return b"".join(chunks)


def release_terminal_lock(request: dict[str, Any], lock_fd: int) -> dict[str, Any]:
    lock_path = Path(request["lockPath"])
    validate_lock(lock_path, lock_fd)
    transaction = Path(request["transactionRoot"])
    info = transaction.lstat()
    if (transaction.is_symlink() or not transaction.is_dir() or
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("transaction_root")
    journal_path = transaction / "transaction.v1.private.json"
    journal_raw = stable_regular(journal_path, modes={0o600})
    journal_sha256 = sha256(journal_raw)
    expected_journal = request.get("transactionJournalSha256")
    if expected_journal is not None and journal_sha256 != expected_journal:
        raise Denied("terminal_journal_sha256")
    try:
        journal = json.loads(journal_raw)
    except json.JSONDecodeError as error:
        raise Denied("terminal_journal_json") from error
    terminal = {"DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"}
    finalize = journal.get("finalize")
    if (not isinstance(journal, dict) or journal.get("state") not in terminal or
            journal.get("saveCount") != 1 or journal.get("deployedMarkerCreated") is not True or
            journal.get("generationRetirementState") != journal.get("state") or
            not isinstance(finalize, dict) or finalize.get("lockReleaseStarted") is not True):
        raise Denied("terminal_journal_state")
    lock_raw = _lock_bytes(lock_fd)
    lock_sha256 = sha256(lock_raw)
    if journal.get("lockDigest") != lock_sha256:
        raise Denied("terminal_lock_digest")
    expected_lock = request.get("lockSha256")
    if expected_lock is not None and lock_sha256 != expected_lock:
        raise Denied("terminal_lock_sha256")
    opened = os.fstat(lock_fd)
    before = lock_path.lstat()
    if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
        raise Denied("terminal_lock_identity")
    receipt = {
        "schemaVersion": 1,
        "action": "RELEASE_TERMINAL_DEPLOYMENT_LOCK",
        "state": journal["state"],
        "transactionRoot": str(transaction),
        "transactionJournalSha256": journal_sha256,
        "lockPath": str(lock_path),
        "lockSha256": lock_sha256,
        "lockDevice": opened.st_dev,
        "lockInode": opened.st_ino,
        "released": True,
    }
    receipt_path = Path(request["receiptOutput"]) if request.get("receiptOutput") else None
    receipt_fd = -1
    if receipt_path is not None:
        parent = receipt_path.parent
        parent_info = parent.lstat()
        if (parent.is_symlink() or not parent.is_dir() or
                (parent_info.st_uid, parent_info.st_gid, stat.S_IMODE(parent_info.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o700)):
            raise Denied("receipt_parent")
        receipt_fd = _open_exclusive(receipt_path)
    try:
        lock_path.unlink()
        _fsync_directory(lock_path.parent)
        if receipt_fd >= 0:
            raw = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()
            _write_all(receipt_fd, raw)
            os.fsync(receipt_fd)
            _fsync_directory(receipt_path.parent)
    finally:
        if receipt_fd >= 0:
            os.close(receipt_fd)
    if lock_path.exists() or lock_path.is_symlink():
        raise Denied("terminal_lock_remains")
    return receipt


def run(request: dict[str, Any], lock_fd: int, *,
        runner: Callable[..., subprocess.CompletedProcess[Any]] = subprocess.run) -> int:
    lock_path = Path(request["lockPath"])
    validate_lock(lock_path, lock_fd)
    if request["action"] == "finalize_continuation":
        _validate_finalize_continuation(request, request["finalizeArgv"])
    driver = Path(request["driver"])
    if sha256(stable_regular(driver, modes={0o500, 0o600})) != request["driverSha256"]:
        raise Denied("driver_sha256")
    transaction = Path(request["transactionRoot"])
    _, descriptors = open_evidence(transaction, request.get("evidenceOutputs"))
    stdout_fd, stderr_fd, exit_fd = descriptors
    environment = dict(os.environ)
    environment[LOCK_ENV] = "1"
    completed: subprocess.CompletedProcess[Any] | None = None
    failure: BaseException | None = None
    try:
        completed = runner(
            request["finalizeArgv"], check=False, stdout=stdout_fd, stderr=stderr_fd,
            env=environment, pass_fds=(lock_fd,), close_fds=True)
        _write_all(exit_fd, (str(completed.returncode) + "\n").encode())
    except BaseException as error:
        failure = error
    finally:
        for fd in descriptors:
            try:
                os.fsync(fd)
            except OSError:
                pass
            finally:
                try:
                    os.close(fd)
                except OSError:
                    pass
    directory = os.open(transaction, os.O_RDONLY | os.O_DIRECTORY |
                        getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    validate_lock(lock_path, lock_fd)
    if failure is not None:
        raise failure
    assert completed is not None
    return completed.returncode


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    lock_fd = -1
    try:
        request = load_request(args.request, args.request_sha256)
        lock_fd = acquire_lock(Path(request["lockPath"]))
        if request["action"] == "release_terminal_lock":
            receipt = release_terminal_lock(request, lock_fd)
            print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
            return 0
        returncode = run(request, lock_fd)
        if returncode != 0:
            print(f"FIXED_CURRENT_FINALIZATION_CONTINUATION_DENY:finalize_exit:{returncode}",
                  file=sys.stderr)
            return returncode
        release_terminal_lock(request, lock_fd)
        return 0
    except (Denied, OSError, ValueError) as error:
        print(f"FIXED_CURRENT_FINALIZATION_CONTINUATION_DENY:{error}", file=sys.stderr)
        return 2
    finally:
        if lock_fd >= 0:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
            finally:
                os.close(lock_fd)


if __name__ == "__main__":
    raise SystemExit(main())
