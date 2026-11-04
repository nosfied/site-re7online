#!/usr/bin/env python3
"""Canonical, fail-closed capacity recovery control plane.

The tool deliberately keeps npm-cache maintenance separate from generation
retirement.  It never discovers destructive paths during execute: audit emits a
closed plan, prepare re-authenticates it, and execute consumes only an exact
intent plus an exact AUTHORIZE_ONCE document.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import resource
import secrets
import sqlite3
import stat
import subprocess
import sys
import tarfile
import time
from typing import Any, Callable, Iterable

SHA256 = re.compile(r"^[0-9a-f]{64}$")
FIXED_CURRENT_LOCK_PREFIX = b"CONVERTA_FIXED_CURRENT_V1:"
ROOT = Path(__file__).resolve().parents[1]
NPM_CACHE = Path("/home/deploy/.npm/_cacache")
NPM_PARENT = Path("/home/deploy/.npm")
NPM_CACHE_ALLOWED_MODES = {0o700, 0o750, 0o755}
LITERAL_RM = ("/usr/bin/rm", "-r", "--")
LITERAL_UNLINK = ("/usr/bin/unlink", "--")
LITERAL_RMDIR = ("/usr/bin/rmdir", "--")
PREPARATIONS_ROOT = Path("/opt/re7online/backups/converta-persistent/preparations")
RELEASES_ROOT = Path("/opt/re7online/releases")
PREPARATION_DERIVED_ARCHIVE_NAMES = {
    "api-frontend-return.private.tar.gz", "worker-return.private.tar.gz",
    "worker-minimal-b9-v3.tar.gz",
}
PREPARATION_DUPLICATE_ONLY_ARCHIVE_NAMES = {"worker-minimal-b9-v3.tar.gz"}
CLASSES = {
    "NPM_CACHE_MAINTENANCE", "DERIVED_OUTPUT_RUNTIME",
    "CLOSED_PREPARATION_DERIVED_ARCHIVE",
    "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
    "CLOSED_DEPLOY_CONTROL_DERIVED_TREE",
}
DISPOSITION_MANIFEST_PATH = (
    ROOT / "config/capacity-recovery/closed-preparation-manifest-disposition.v1.json")
DISPOSITION_MANIFEST_SHA256 = "b2b5bff4adeec32f12e9f32e0487a75f85fa334a3273931c88b62338b6d9f78d"
DISPOSITION_ID = "p00-closed-preparations-20261031-v2-three-archives"
WORKER_PACKAGE_AUDIT_MANIFEST_PATH = (
    ROOT / "config/capacity-recovery/worker-package-audit-disposition.v1.json")
WORKER_PACKAGE_AUDIT_MANIFEST_SHA256 = "40727a3c5f6c685ffa0169366310b6f4d92a203ade522835da0c83fbb3868c76"
WORKER_PACKAGE_AUDIT_DISPOSITION_ID = "p00-worker-package-audit-afbb7455-v1"
DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH = (
    ROOT / "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json")
DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256 = "5d08f0a07e0c6eab2638772f0d6bd65f65fb0df2f965e644ae4d1374131143c0"
DEPLOY_CONTROL_DISPOSITION_ID = "p00-ef7db111-deploy-control-derived-v1"
DEPLOY_CONTROL_ROOT = Path("/opt/re7online/deploy-control/ef7db111-prep")
DEPLOY_CONTROL_GITDIR = Path(
    "/opt/re7online/site-re7online/.git/worktrees/ef7db111-prep")
DEPLOY_CONTROL_PATHS = (
    DEPLOY_CONTROL_ROOT / "node_modules",
    DEPLOY_CONTROL_ROOT / "apps/whatsapp-agent/node_modules",
    DEPLOY_CONTROL_ROOT / ".next",
    DEPLOY_CONTROL_ROOT / "apps/whatsapp-agent/dist",
)
GIT = Path("/usr/bin/git")
AUDIT_REQUEST_KEYS = {
    "schemaVersion", "kind", "minimumRecoveryBytes", "targetAvailableBytes",
    "rootPolicy", "operationalState", "candidates",
}
AUDIT_REQUEST_V2_KEYS = AUDIT_REQUEST_KEYS | {"procObserver"}
AUDIT_REQUEST_V3_KEYS = AUDIT_REQUEST_V2_KEYS | {"incrementalBatch"}
PROC_OBSERVER_PATH = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
PROC_OBSERVER_COMMAND = (
    "/usr/bin/sudo", "-n", "--", "/usr/bin/python3", "-I", "-B", "-E", "-s",
    str(PROC_OBSERVER_PATH), "collect",
)
PROC_OBSERVER_TIMEOUT_SECONDS = 15
PROC_OBSERVER_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
PROC_OBSERVER_BINDING_KEYS = {"path", "sha256"}
COMMON_CANDIDATE_KEYS = {"class", "path"}
NPM_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS
OUTPUT_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS | {
    "runtimeRelativePath", "releaseRoot", "contract", "package", "manifest", "index",
}
PREPARATION_ARCHIVE_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS | {"sha256", "proof"}
MANIFEST_DISPOSITION_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS | {"dispositionManifest"}
DEPLOY_CONTROL_CANDIDATE_KEYS = MANIFEST_DISPOSITION_CANDIDATE_KEYS
DERIVED_ARCHIVE_PROOF_KEYS = {"kind", "record", "recordEntry"}
DUPLICATE_ARCHIVE_PROOF_KEYS = {"kind", "authoritativeCopy"}
OPERATIONAL_KEYS = {
    "schemaVersion", "currentPaths", "pm2LivePaths", "pm2DumpPaths",
    "openTransactionPaths", "protectedGraphPaths", "deploymentLock", "writerLock",
    "liveObservations",
}
LIVE_OBSERVATION_KEYS = {"currentLinks", "pm2", "dump", "transactionsRoot", "releaseGraph"}
TERMINAL_TRANSACTION_STATES = {
    "DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE", "ROLLED_BACK",
}
FIXED_CURRENT_TRANSACTION_STATES = {
    "PREFLIGHT_PASS", "ACTIVATING", "AWAITING_ACCEPTANCE", "FINALIZING",
    "DEPLOYED", "DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE",
    "ROLLING_BACK", "ROLLED_BACK", "FAILED",
}
WINDOW_TRANSACTION_STATES = {
    "AWAITING_ACCEPTANCE": {"terminal": False, "saveCount": 0},
    "FINALIZATION_INCOMPLETE": {"terminal": False, "saveCount": 1},
    "ROLLBACK_INCOMPLETE": {"terminal": False, "saveCount": 0},
    "DENIED_BEFORE_MUTATION": {"terminal": True, "saveCount": 0},
    "ROLLED_BACK": {"terminal": True, "saveCount": 0},
    "ROLLED_BACK_TECHNICAL_REJECTION": {"terminal": True, "saveCount": 0},
    "DEPLOYED": {"terminal": True, "saveCount": 1},
    "DEPLOYED_SANITIZED": {"terminal": True, "saveCount": 1},
    "DEPLOYED_RETENTION_INCOMPLETE": {"terminal": True, "saveCount": 1},
}
WINDOW_STATE_KEYSETS = {
    "AWAITING_ACCEPTANCE": {frozenset({
        "state", "target", "release", "buildId", "api", "frontend", "worker",
        "availableBytes", "guard", "retirement", "saveCount", "acceptance",
        "deployedMarker",
    })},
    "FINALIZATION_INCOMPLETE": {frozenset({
        "state", "target", "release", "buildId", "api", "frontend", "worker",
        "availableBytes", "guard", "retirement", "saveCount", "acceptance",
        "deployedMarker", "failurePredicate", "automaticRetry", "lockHolderPid",
    })},
    "ROLLBACK_INCOMPLETE": {frozenset({
        "state", "failurePredicate", "restored", "saveCount", "automaticRetry",
        "lockHandoffMetadataComplete",
    })},
    "DENIED_BEFORE_MUTATION": {frozenset({
        "state", "failurePredicate", "productionUnchanged", "intent", "saveCount",
        "automaticRetry",
    })},
    "ROLLED_BACK": {frozenset({
        "state", "failurePredicate", "restored", "saveCount", "automaticRetry",
    })},
    "ROLLED_BACK_TECHNICAL_REJECTION": {frozenset({
        "state", "failurePredicate", "restored", "frontend", "release", "saveCount",
        "automaticRetry", "deployedMarker", "apiPreserved", "workerPreserved",
        "lockReleasedOnControllerExit",
    })},
    "DEPLOYED": {frozenset({
        "state", "target", "release", "buildId", "api", "frontend", "worker",
        "guard", "saveCount", "acceptance", "acceptanceSha256", "deployedMarker",
        "markerSha256", "dumpSha256", "dumpValidationSha256", "saveExecutionSha256",
        "automaticRetry",
    })},
    "DEPLOYED_SANITIZED": {frozenset({
        "state", "saveCount", "acceptance", "deployedMarker", "dumpSha256",
        "retirementReceiptSha256", "restartCountDuringFinalize",
    })},
    "DEPLOYED_RETENTION_INCOMPLETE": {frozenset({
        "state", "saveCount", "acceptance", "deployedMarker", "dumpSha256",
        "retirementReceiptSha256", "restartCountDuringFinalize",
    })},
}
LEGACY_ROLLBACK_SENTINELS = {
    "final-state.private.txt": b"ROLLED_BACK\n",
    "rollback-result.private.txt": b"ROLLED_BACK\n",
    "pm2-save-count.private.txt": b"0\n",
}
LEGACY_PROTECTED_SENTINELS = {
    "identity-before.json", "pm2-before.private.json",
    "api-return.private.json", "frontend-return.private.json",
}
EMPTY_PREFLIGHT = re.compile(r"^preflight-[0-9a-f]{8}-[0-9]{8}T[0-9]{6}Z$")
NAME_REGISTRY_MAX_BYTES = 64 * 1024 * 1024
NAME_REGISTRY_CACHE_KIB = 1024
TAR_PROGRESS_INTERVAL = 4096
TAR_PROGRESS_EVENT_LIMIT = 256
TAR_PROGRESS_TIME_INTERVAL_SECONDS = 1.0


class Denied(RuntimeError):
    pass


class ExactNameRegistry:
    """Disk-backed exact set with a fixed cache and disk budget.

    Names are stored as UTF-8 bytes with surrogate preservation in a BLOB
    primary key. SQLite therefore cannot add case folding, Unicode
    normalization, or locale collation.
    """

    DATABASE_NAME = "names.sqlite3"
    KNOWN_FILES = {DATABASE_NAME, f"{DATABASE_NAME}-journal",
                   f"{DATABASE_NAME}-wal", f"{DATABASE_NAME}-shm"}

    def __init__(self, parent: Path, *, max_bytes: int = NAME_REGISTRY_MAX_BYTES,
                 cache_kib: int = NAME_REGISTRY_CACHE_KIB) -> None:
        self.parent = parent
        self.max_bytes = max_bytes
        self.cache_kib = cache_kib
        self.directory: Path | None = None
        self.directory_fd = -1
        self.directory_identity: tuple[int, int] | None = None
        self.connection: sqlite3.Connection | None = None
        self.peak_physical_bytes = 0
        self.count = 0
        self.uniqueness_checks = 0

    @staticmethod
    def _encoded(value: str) -> bytes:
        return value.encode("utf-8", "surrogatepass")

    def __enter__(self) -> ExactNameRegistry:
        try:
            parent_info = self.parent.lstat()
            if self.parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode):
                deny("DISPOSITION_NAME_REGISTRY_PARENT")
            filesystem = os.statvfs(self.parent)
            if filesystem.f_bavail * filesystem.f_frsize < self.max_bytes:
                deny("DISPOSITION_NAME_REGISTRY_SPACE")
            parent_fd = os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY |
                                os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                for _ in range(16):
                    name = f".capacity-name-registry-{secrets.token_hex(16)}"
                    try:
                        os.mkdir(name, 0o700, dir_fd=parent_fd)
                        break
                    except FileExistsError:
                        continue
                else:
                    deny("DISPOSITION_NAME_REGISTRY_CREATE")
                os.fsync(parent_fd)
                self.directory = self.parent / name
                self.directory_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY |
                                            os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
            finally:
                os.close(parent_fd)
            directory_info = os.fstat(self.directory_fd)
            if (not stat.S_ISDIR(directory_info.st_mode) or
                    directory_info.st_uid != os.geteuid() or
                    directory_info.st_gid != os.getegid() or
                    stat.S_IMODE(directory_info.st_mode) != 0o700):
                deny("DISPOSITION_NAME_REGISTRY_IDENTITY")
            self.directory_identity = (directory_info.st_dev, directory_info.st_ino)
            database_fd = os.open(self.DATABASE_NAME, os.O_WRONLY | os.O_CREAT |
                                  os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                                  0o600, dir_fd=self.directory_fd)
            os.close(database_fd)
            database_path = f"/proc/self/fd/{self.directory_fd}/{self.DATABASE_NAME}"
            self.connection = sqlite3.connect(database_path, isolation_level=None)
            self.connection.execute("PRAGMA journal_mode=OFF")
            self.connection.execute("PRAGMA synchronous=FULL")
            self.connection.execute("PRAGMA temp_store=FILE")
            self.connection.execute(f"PRAGMA cache_size=-{self.cache_kib}")
            page_size = int(self.connection.execute("PRAGMA page_size").fetchone()[0])
            max_pages = max(1, self.max_bytes // page_size)
            self.connection.execute(f"PRAGMA max_page_count={max_pages}")
            self.connection.execute(
                "CREATE TABLE names (value BLOB PRIMARY KEY) WITHOUT ROWID")
            # One bounded transaction avoids a durability sync per name. The
            # registry is disposable read-only working state, never authority.
            self.connection.execute("BEGIN IMMEDIATE")
            self.measure()
            return self
        except Denied:
            self._cleanup()
            raise
        except (OSError, sqlite3.Error):
            self._cleanup()
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")

    def add(self, value: str) -> None:
        if self.connection is None:
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")
        try:
            self.uniqueness_checks += 1
            self.connection.execute(
                "INSERT INTO names(value) VALUES (?)", (sqlite3.Binary(self._encoded(value)),))
            self.count += 1
        except sqlite3.IntegrityError:
            deny("DISPOSITION_ARCHIVE_MEMBER_DUPLICATE")
        except sqlite3.Error as error:
            if getattr(error, "sqlite_errorcode", None) == sqlite3.SQLITE_FULL:
                deny("DISPOSITION_NAME_REGISTRY_SPACE")
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")

    def measure(self) -> int:
        if self.directory_fd < 0:
            return 0
        total = 0
        try:
            names = os.listdir(self.directory_fd)
            if any(name not in self.KNOWN_FILES for name in names):
                deny("DISPOSITION_NAME_REGISTRY_STORAGE")
            for name in names:
                info = os.stat(name, dir_fd=self.directory_fd, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode):
                    deny("DISPOSITION_NAME_REGISTRY_STORAGE")
                total += info.st_blocks * 512
        except OSError:
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")
        self.peak_physical_bytes = max(self.peak_physical_bytes, total)
        if total > self.max_bytes:
            deny("DISPOSITION_NAME_REGISTRY_SPACE")
        return total

    def finalize(self) -> dict[str, Any]:
        """Flush the disposable registry and return bounded sanitized metrics."""
        if self.connection is None or self.directory_fd < 0:
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")
        try:
            self.connection.commit()
            page_count = int(self.connection.execute("PRAGMA page_count").fetchone()[0])
            page_size = int(self.connection.execute("PRAGMA page_size").fetchone()[0])
            max_page_count = int(self.connection.execute(
                "PRAGMA max_page_count").fetchone()[0])
            cache_size = int(self.connection.execute("PRAGMA cache_size").fetchone()[0])
            journal_mode = str(self.connection.execute(
                "PRAGMA journal_mode").fetchone()[0])
            files: list[dict[str, Any]] = []
            for name in sorted(os.listdir(self.directory_fd)):
                if name not in self.KNOWN_FILES:
                    deny("DISPOSITION_NAME_REGISTRY_STORAGE")
                info = os.stat(name, dir_fd=self.directory_fd, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode):
                    deny("DISPOSITION_NAME_REGISTRY_STORAGE")
                files.append({
                    "kind": "database" if name == self.DATABASE_NAME else name.removeprefix(
                        self.DATABASE_NAME).removeprefix("-"),
                    "logicalBytes": info.st_size,
                    "physicalBytes": info.st_blocks * 512,
                })
            physical = self.measure()
        except Denied:
            raise
        except (OSError, sqlite3.Error, TypeError, ValueError):
            deny("DISPOSITION_NAME_REGISTRY_STORAGE")
        return {
            "distinctNames": self.count,
            "uniquenessChecks": self.uniqueness_checks,
            "pageCount": page_count,
            "pageSize": page_size,
            "maxPageCount": max_page_count,
            "configuredDatabaseLimitBytes": max_page_count * page_size,
            "cacheSizeKiB": abs(cache_size) if cache_size < 0 else None,
            "journalMode": journal_mode,
            "files": files,
            "physicalBytes": physical,
        }

    def _cleanup(self) -> bool:
        failed = False
        if self.connection is not None:
            try:
                self.connection.close()
            except sqlite3.Error:
                failed = True
            self.connection = None
        if self.directory_fd >= 0:
            try:
                for name in os.listdir(self.directory_fd):
                    if name not in self.KNOWN_FILES:
                        failed = True
                        continue
                    try:
                        os.unlink(name, dir_fd=self.directory_fd)
                    except OSError:
                        failed = True
                os.fsync(self.directory_fd)
            except OSError:
                failed = True
            os.close(self.directory_fd)
            self.directory_fd = -1
        if self.directory is not None:
            try:
                current = self.directory.lstat()
                if (self.directory.is_symlink() or not stat.S_ISDIR(current.st_mode) or
                        (current.st_dev, current.st_ino) != self.directory_identity):
                    raise OSError(errno.ESTALE, "name registry identity changed")
                os.rmdir(self.directory)
                parent_fd = os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY |
                                    os.O_NOFOLLOW | os.O_CLOEXEC)
                try:
                    os.fsync(parent_fd)
                finally:
                    os.close(parent_fd)
            except OSError:
                failed = True
            self.directory = None
            self.directory_identity = None
        return failed

    def __exit__(self, kind: type[BaseException] | None,
                 value: BaseException | None, traceback: Any) -> bool:
        if self._cleanup():
            deny("DISPOSITION_NAME_REGISTRY_CLEANUP")
        return False


class Telemetry:
    """Durable, content-free memory/phase evidence for long recovery phases."""

    def __init__(self, path: Path):
        if not path.is_absolute() or path.parent.is_symlink():
            deny(f"TELEMETRY_PATH:{path}")
        self.path = path
        self.started_ns = time.monotonic_ns()
        self.cgroup = self._cgroup_root()
        self.baseline_events = self._memory_events()
        self.fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                          os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        self.emit("telemetry_started", memory_events_baseline=self.baseline_events)

    @staticmethod
    def _cgroup_root() -> Path | None:
        try:
            for line in Path("/proc/self/cgroup").read_text().splitlines():
                fields = line.split(":", 2)
                if len(fields) == 3 and fields[0] == "0":
                    relative = fields[2].lstrip("/")
                    return Path("/sys/fs/cgroup") / relative
        except OSError:
            pass
        return None

    def _cgroup_number(self, name: str) -> int | None:
        if self.cgroup is None:
            return None
        try:
            raw = (self.cgroup / name).read_text().strip()
            return int(raw) if raw != "max" else None
        except (OSError, ValueError):
            return None

    def _memory_events(self) -> dict[str, int] | None:
        if self.cgroup is None:
            return None
        try:
            result: dict[str, int] = {}
            for line in (self.cgroup / "memory.events").read_text().splitlines():
                key, value = line.split()
                result[key] = int(value)
            return result
        except (OSError, ValueError):
            return None

    @staticmethod
    def _rss() -> tuple[int | None, int]:
        current: int | None = None
        try:
            resident = int(Path("/proc/self/statm").read_text().split()[1])
            current = resident * os.sysconf("SC_PAGE_SIZE")
        except (OSError, ValueError, IndexError):
            pass
        return current, resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024

    def emit(self, phase: str, *, candidate: str | None = None,
             member_count: int = 0, temporary_disk_bytes: int | None = None,
             tar_members_retained: int | None = None,
             name_registry: dict[str, Any] | None = None,
             memory_events_baseline: dict[str, int] | None = None,
             progress_kind: str | None = None,
             progress_bytes: int | None = None,
             member_size_bytes: int | None = None) -> None:
        rss_current, rss_peak = self._rss()
        row: dict[str, Any] = {
            "schemaVersion": 1, "phase": phase, "candidate": candidate,
            "memberCount": member_count, "monotonicNs": time.monotonic_ns(),
            "elapsedNs": time.monotonic_ns() - self.started_ns,
            "rssCurrentBytes": rss_current, "rssPeakBytes": rss_peak,
            "memoryCurrentBytes": self._cgroup_number("memory.current"),
            "memoryPeakBytes": self._cgroup_number("memory.peak"),
            "memoryEvents": self._memory_events(),
        }
        if memory_events_baseline is not None:
            row["memoryEventsBaseline"] = memory_events_baseline
        if temporary_disk_bytes is not None:
            row["temporaryDiskBytes"] = temporary_disk_bytes
        if tar_members_retained is not None:
            row["tarMembersRetained"] = tar_members_retained
        if name_registry is not None:
            row["nameRegistry"] = name_registry
        if progress_kind is not None:
            row["progressKind"] = progress_kind
        if progress_bytes is not None:
            row["progressBytes"] = progress_bytes
        if member_size_bytes is not None:
            row["memberSizeBytes"] = member_size_bytes
        os.write(self.fd, canonical(row))
        os.fsync(self.fd)

    def close(self) -> None:
        if self.fd >= 0:
            os.fsync(self.fd)
            os.close(self.fd)
            self.fd = -1


_TELEMETRY: Telemetry | None = None


def telemetry(phase: str, *, candidate: Path | str | None = None,
              member_count: int = 0, temporary_disk_bytes: int | None = None,
              tar_members_retained: int | None = None,
              name_registry: dict[str, Any] | None = None,
              progress_kind: str | None = None,
              progress_bytes: int | None = None,
              member_size_bytes: int | None = None) -> None:
    if _TELEMETRY is not None:
        _TELEMETRY.emit(phase, candidate=str(candidate) if candidate is not None else None,
                        member_count=member_count, temporary_disk_bytes=temporary_disk_bytes,
                        tar_members_retained=tar_members_retained,
                        name_registry=name_registry, progress_kind=progress_kind,
                        progress_bytes=progress_bytes,
                        member_size_bytes=member_size_bytes)


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def valid_sha(value: Any) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def normalized_absolute(value: Any, predicate: str) -> Path:
    if not isinstance(value, str):
        deny(predicate)
    path = Path(value)
    if (not path.is_absolute() or ".." in path.parts or
            Path(os.path.normpath(str(path))) != path or
            any(ord(character) < 32 for character in str(path))):
        deny(predicate)
    return path


def stat_identity(info: os.stat_result, *, include_nlink: bool = False) -> dict[str, Any]:
    identity = {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        "type": ("directory" if stat.S_ISDIR(info.st_mode) else
                 "regular" if stat.S_ISREG(info.st_mode) else
                 "symlink" if stat.S_ISLNK(info.st_mode) else "other"),
        "size": info.st_size, "mtimeNs": info.st_mtime_ns, "ctimeNs": info.st_ctime_ns,
    }
    if include_nlink:
        identity["nlink"] = info.st_nlink
    return identity


def stable_regular(path: Path, expected_sha: str, *, private: bool = True,
                   allowed_modes: set[int] | None = None,
                   include_nlink: bool = False,
                   allowed_owner_pairs: set[tuple[int, int]] | None = None
                   ) -> tuple[bytes, dict[str, Any]]:
    if not valid_sha(expected_sha):
        deny(f"FILE_SHA_SCHEMA:{path.name}")
    try:
        before = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(before.st_mode):
            deny(f"FILE_TYPE:{path}")
        mode = stat.S_IMODE(before.st_mode)
        expected_owners = (allowed_owner_pairs if allowed_owner_pairs is not None else
                           {(os.geteuid(), os.getegid())})
        if allowed_modes is not None and (mode not in allowed_modes or
                                          (before.st_uid, before.st_gid) not in expected_owners):
            deny(f"FILE_MODE_IDENTITY:{path}")
        if private and allowed_modes is None and (mode & 0o077 or before.st_uid != os.geteuid() or before.st_gid != os.getegid()):
            deny(f"FILE_PRIVATE_IDENTITY:{path}")
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
    except OSError:
        deny(f"FILE_READ:{path}")
    identities = [(item.st_dev, item.st_ino, item.st_mode, item.st_uid, item.st_gid, item.st_size,
                   item.st_mtime_ns, item.st_ctime_ns, item.st_nlink)
                  for item in (before, opened, after, current)]
    if len(set(identities)) != 1:
        deny(f"FILE_CHANGED:{path}")
    raw = b"".join(blocks)
    if digest_bytes(raw) != expected_sha:
        deny(f"FILE_SHA256:{path}")
    return raw, stat_identity(current, include_nlink=include_nlink)


def stable_regular_digest(path: Path, expected_sha: str, *, private: bool = True,
                          allowed_modes: set[int] | None = None,
                          include_nlink: bool = False,
                          allowed_owner_pairs: set[tuple[int, int]] | None = None,
                          expected_size: int | None = None,
                          progress: Callable[[int], None] | None = None,
                          ) -> dict[str, Any]:
    """Authenticate a regular file without ever retaining its contents."""
    if not valid_sha(expected_sha):
        deny(f"FILE_SHA_SCHEMA:{path.name}")
    try:
        before = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(before.st_mode):
            deny(f"FILE_TYPE:{path}")
        mode = stat.S_IMODE(before.st_mode)
        expected_owners = (allowed_owner_pairs if allowed_owner_pairs is not None else
                           {(os.geteuid(), os.getegid())})
        if allowed_modes is not None and (mode not in allowed_modes or
                                          (before.st_uid, before.st_gid) not in expected_owners):
            deny(f"FILE_MODE_IDENTITY:{path}")
        if private and allowed_modes is None and (mode & 0o077 or
                                                   before.st_uid != os.geteuid() or
                                                   before.st_gid != os.getegid()):
            deny(f"FILE_PRIVATE_IDENTITY:{path}")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            digest = hashlib.sha256()
            consumed = 0
            while block := os.read(fd, 1024 * 1024):
                digest.update(block)
                consumed += len(block)
                if progress is not None:
                    progress(consumed)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
    except OSError:
        deny(f"FILE_READ:{path}")
    identities = [(item.st_dev, item.st_ino, item.st_mode, item.st_uid, item.st_gid,
                   item.st_size, item.st_mtime_ns, item.st_ctime_ns, item.st_nlink)
                  for item in (before, opened, after, current)]
    if len(set(identities)) != 1:
        deny(f"FILE_CHANGED:{path}")
    if expected_size is not None and current.st_size != expected_size:
        deny(f"FILE_SIZE:{path}")
    if digest.hexdigest() != expected_sha:
        deny(f"FILE_SHA256:{path}")
    return stat_identity(current, include_nlink=include_nlink)


class FramedRelationDigest:
    """Canonical incremental relation digest with unambiguous length framing."""

    DOMAIN = b"re7-capacity-relation-v1\0"

    def __init__(self) -> None:
        self._digest = hashlib.sha256(self.DOMAIN)
        self.count = 0

    def add(self, value: dict[str, Any]) -> None:
        raw = canonical(value)
        self._digest.update(len(raw).to_bytes(8, "big"))
        self._digest.update(raw)
        self.count += 1

    def hexdigest(self) -> str:
        return self._digest.hexdigest()


def _same_open_identity(expected: dict[str, Any], info: os.stat_result) -> bool:
    return all(expected.get(key) == value for key, value in {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        "size": info.st_size, "mtimeNs": info.st_mtime_ns, "ctimeNs": info.st_ctime_ns,
        "nlink": info.st_nlink,
    }.items() if key in expected)


def object_json(raw: bytes, predicate: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(predicate)
    if not isinstance(value, dict):
        deny(predicate)
    return value


def write_exclusive(path: Path, raw: bytes, mode: int = 0o600) -> None:
    if not path.is_absolute() or path.parent.is_symlink():
        deny(f"OUTPUT_PATH:{path}")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(fd, raw)
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def physical_usage(paths: Iterable[Path]) -> dict[str, dict[str, int]]:
    """Count allocated blocks and inodes once, including hard links only once."""
    seen: set[tuple[int, int]] = set()
    result: dict[str, dict[str, int]] = {}
    for root in paths:
        allocated = 0
        inodes = 0
        stack = [root]
        while stack:
            path = stack.pop()
            try:
                info = path.lstat()
            except OSError:
                deny(f"PATH_READ:{path}")
            key = (info.st_dev, info.st_ino)
            if key not in seen:
                seen.add(key)
                allocated += info.st_blocks * 512
                inodes += 1
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                try:
                    with os.scandir(path) as entries:
                        stack.extend(Path(entry.path) for entry in entries)
                except OSError:
                    deny(f"PATH_WALK:{path}")
        result[str(root)] = {"allocatedBytes": allocated, "inodes": inodes}
    return result


ProcessScan = tuple[list[tuple[int, int, str, str]], list[dict[str, Any]], bool, dict[str, Any]]
PROCESS_FAILURE_DETAIL_LIMIT = 256
PF_KTHREAD = 0x00200000


def _record_process_reference_failure(summary: dict[str, Any], pid: int, start_ticks: int,
                                      uids: tuple[int, int, int, int], operation: str,
                                      error: OSError) -> None:
    summary["referenceReadFailures"] += 1
    details = summary["referenceReadFailureDetails"]
    if len(details) >= PROCESS_FAILURE_DETAIL_LIMIT:
        summary["referenceReadFailureDetailsTruncated"] += 1
        return
    details.append({
        "pid": pid,
        "startTicks": start_ticks,
        "uids": {"real": uids[0], "effective": uids[1],
                 "saved": uids[2], "fs": uids[3]},
        "operation": operation,
        "errno": error.errno,
        "errnoName": errno.errorcode.get(error.errno),
    })


def _record_transient_fd_closure(summary: dict[str, Any], pid: int, start_ticks: int,
                                 uids: tuple[int, int, int, int], operation: str) -> None:
    summary["transientFdClosures"] += 1
    details = summary["transientFdClosureDetails"]
    if len(details) >= PROCESS_FAILURE_DETAIL_LIMIT:
        summary["transientFdClosureDetailsTruncated"] += 1
        return
    details.append({
        "pid": pid,
        "startTicks": start_ticks,
        "uids": {"real": uids[0], "effective": uids[1],
                 "saved": uids[2], "fs": uids[3]},
        "operation": operation,
        "errno": errno.ENOENT,
        "errnoName": "ENOENT",
    })


def _process_still_exists(proc: Path) -> bool:
    try:
        proc.stat()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        return True


def _is_active_npm_or_build(arguments: list[str]) -> bool:
    if not arguments:
        return False
    executable = Path(arguments[0]).name
    command = " ".join(arguments)
    return (executable in {"npm", "npx"} or
            any(Path(argument).name == "npm-cli.js" for argument in arguments[1:]) or
            "next build" in command or
            ("converta-release.py" in command and " build" in command))


def _proc_stat_identity(raw: str) -> tuple[int, int]:
    closing = raw.rfind(") ")
    if closing < 0:
        deny("PROCESS_STAT_SCHEMA")
    fields = raw[closing + 2:].split()
    if len(fields) <= 19:
        deny("PROCESS_STAT_SCHEMA")
    try:
        return int(fields[6]), int(fields[19])
    except ValueError:
        deny("PROCESS_STAT_SCHEMA")


def _proc_start_ticks(raw: str) -> int:
    return _proc_stat_identity(raw)[1]


def _read_start_ticks(proc: Path) -> int:
    return _proc_start_ticks((proc / "stat").read_text(errors="strict"))


def _read_proc_identity(proc: Path) -> tuple[int, int]:
    return _proc_stat_identity((proc / "stat").read_text(errors="strict"))


def _status_uids(proc: Path) -> tuple[int, int, int, int]:
    for line in (proc / "status").read_text(errors="strict").splitlines():
        if line.startswith("Uid:"):
            fields = line.split()[1:]
            if len(fields) != 4:
                break
            try:
                return tuple(int(item) for item in fields)  # type: ignore[return-value]
            except ValueError:
                break
    deny("PROCESS_UID_SCHEMA")


def _proc_targets(proc_root: Path = Path("/proc"), deploy_uid: int | None = None) -> ProcessScan:
    targets: list[tuple[int, int, str, str]] = []
    writers: list[dict[str, Any]] = []
    complete = True
    if deploy_uid is None:
        deploy_uid = deploy_identity()[0]
    summary = {
        "deployProcessesInspected": 0,
        "otherProcessesInspected": 0,
        "permissionLimitedOtherProcesses": 0,
        "kernelThreadsIgnored": 0, "emptyCmdlineProcessesInspected": 0,
        "vanishedProcesses": 0,
        "identityFailures": 0,
        "referenceReadFailures": 0,
        "transientFdClosures": 0,
        "referenceReadFailureDetails": [],
        "referenceReadFailureDetailsTruncated": 0,
        "transientFdClosureDetails": [],
        "transientFdClosureDetailsTruncated": 0,
    }
    try:
        processes = list(proc_root.iterdir())
    except OSError:
        summary["identityFailures"] += 1
        return targets, writers, False, summary
    for proc in processes:
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        pid = int(proc.name)
        local_targets: list[tuple[int, int, str, str]] = []
        local_writers: list[dict[str, Any]] = []
        try:
            before_flags, before_ticks = _read_proc_identity(proc)
            try:
                uids = _status_uids(proc)
            except Denied:
                complete = False
                summary["identityFailures"] += 1
                continue
            except (PermissionError, OSError):
                try:
                    directory_uid = proc.stat().st_uid
                except FileNotFoundError:
                    summary["vanishedProcesses"] += 1
                    continue
                try:
                    after_ticks = _read_start_ticks(proc)
                except FileNotFoundError:
                    summary["vanishedProcesses"] += 1
                    continue
                except OSError:
                    complete = False
                    summary["identityFailures"] += 1
                    continue
                if after_ticks != before_ticks:
                    complete = False
                    summary["identityFailures"] += 1
                    continue
                if directory_uid == deploy_uid:
                    complete = False
                    summary["identityFailures"] += 1
                else:
                    summary["permissionLimitedOtherProcesses"] += 1
                continue
            deploy_process = deploy_uid in uids
            other_limited = False
            try:
                command_parts = (proc / "cmdline").read_bytes().split(b"\0")
            except FileNotFoundError:
                if _process_still_exists(proc) and deploy_process:
                    complete = False
                    summary["identityFailures"] += 1
                else:
                    summary["vanishedProcesses"] += 1
                continue
            except OSError:
                try:
                    after_ticks = _read_start_ticks(proc)
                except FileNotFoundError:
                    summary["vanishedProcesses"] += 1
                    continue
                except OSError:
                    complete = False
                    summary["identityFailures"] += 1
                    continue
                if after_ticks != before_ticks:
                    complete = False
                    summary["identityFailures"] += 1
                    continue
                if deploy_process:
                    complete = False
                    summary["identityFailures"] += 1
                else:
                    summary["permissionLimitedOtherProcesses"] += 1
                continue
            command = " ".join(item.decode(errors="replace") for item in command_parts if item)
            arguments = [item.decode(errors="replace") for item in command_parts if item]
            if not arguments:
                after_flags, after_ticks = _read_proc_identity(proc)
                if after_ticks != before_ticks or after_flags != before_flags:
                    complete = False
                    summary["identityFailures"] += 1
                    continue
                if before_flags & PF_KTHREAD:
                    if uids != (0, 0, 0, 0):
                        complete = False
                        summary["identityFailures"] += 1
                    else:
                        summary["kernelThreadsIgnored"] += 1
                    continue
                else:
                    summary["emptyCmdlineProcessesInspected"] += 1
            for argument in arguments:
                possible_path = argument.split("=", 1)[-1]
                if possible_path.startswith("/"):
                    local_targets.append((pid, before_ticks, "cmdline", possible_path))
            if _is_active_npm_or_build(arguments):
                local_writers.append({"pid": pid, "startTicks": before_ticks,
                                      "uid": uids[1], "commandSha256": digest_bytes(command.encode())})
            for leaf in ("cwd", "root", "exe"):
                try:
                    local_targets.append((pid, before_ticks, leaf, os.readlink(proc / leaf)))
                except FileNotFoundError as exc:
                    if deploy_process and _process_still_exists(proc):
                        complete = False
                        _record_process_reference_failure(
                            summary, pid, before_ticks, uids, f"readlink:{leaf}", exc)
                    elif not deploy_process and _process_still_exists(proc):
                        other_limited = True
                except OSError as exc:
                    if deploy_process:
                        complete = False
                        _record_process_reference_failure(
                            summary, pid, before_ticks, uids, f"readlink:{leaf}", exc)
                    else:
                        other_limited = True
            try:
                for fd in (proc / "fd").iterdir():
                    try:
                        local_targets.append((pid, before_ticks, f"fd/{fd.name}", os.readlink(fd)))
                    except FileNotFoundError:
                        # An FD may close between directory enumeration and readlink.
                        # The final start-ticks check still authenticates the process.
                        _record_transient_fd_closure(
                            summary, pid, before_ticks, uids, f"readlink:fd/{fd.name}")
                    except OSError as exc:
                        if deploy_process:
                            complete = False
                            _record_process_reference_failure(
                                summary, pid, before_ticks, uids,
                                f"readlink:fd/{fd.name}", exc)
                        else:
                            other_limited = True
            except FileNotFoundError as exc:
                if deploy_process and _process_still_exists(proc):
                    complete = False
                    _record_process_reference_failure(
                        summary, pid, before_ticks, uids, "listdir:fd", exc)
                elif not deploy_process and _process_still_exists(proc):
                    other_limited = True
            except OSError as exc:
                if deploy_process:
                    complete = False
                    _record_process_reference_failure(
                        summary, pid, before_ticks, uids, "listdir:fd", exc)
                else:
                    other_limited = True
            try:
                for line in (proc / "maps").read_text(errors="replace").splitlines():
                    if "/" in line:
                        local_targets.append((pid, before_ticks, "maps", line.split(None, 5)[-1]))
            except FileNotFoundError as exc:
                if deploy_process and _process_still_exists(proc):
                    complete = False
                    _record_process_reference_failure(
                        summary, pid, before_ticks, uids, "read:maps", exc)
                elif not deploy_process and _process_still_exists(proc):
                    other_limited = True
            except OSError as exc:
                if deploy_process:
                    complete = False
                    _record_process_reference_failure(
                        summary, pid, before_ticks, uids, "read:maps", exc)
                else:
                    other_limited = True
            after_flags, after_ticks = _read_proc_identity(proc)
            if after_ticks != before_ticks or after_flags != before_flags:
                complete = False
                summary["identityFailures"] += 1
                continue
            targets.extend(local_targets)
            writers.extend(local_writers)
            summary["deployProcessesInspected" if deploy_process else "otherProcessesInspected"] += 1
            if other_limited:
                summary["permissionLimitedOtherProcesses"] += 1
        except PermissionError:
            try:
                directory_uid = proc.stat().st_uid
            except FileNotFoundError:
                summary["vanishedProcesses"] += 1
                continue
            if directory_uid == deploy_uid:
                complete = False
                summary["identityFailures"] += 1
            else:
                summary["permissionLimitedOtherProcesses"] += 1
        except FileNotFoundError:
            summary["vanishedProcesses"] += 1
            continue
        except (OSError, Denied):
            complete = False
            summary["identityFailures"] += 1
    return targets, writers, complete, summary


def _validate_proc_observer_binding(value: Any) -> dict[str, str]:
    if (not isinstance(value, dict) or set(value) != PROC_OBSERVER_BINDING_KEYS or
            value.get("path") != str(PROC_OBSERVER_PATH) or not valid_sha(value.get("sha256"))):
        deny("PROC_OBSERVER_BINDING")
    return {"path": value["path"], "sha256": value["sha256"]}


def _proc_observer_installation(binding: dict[str, str]) -> dict[str, Any]:
    path = Path(binding["path"])
    try:
        info = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or
                info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o500):
            deny("PROC_OBSERVER_INSTALLATION_IDENTITY")
        ancestors = []
        for parent in (Path("/usr"), Path("/usr/local"), Path("/usr/local/libexec"), path.parent):
            parent_info = parent.lstat()
            if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
                    parent_info.st_uid != 0 or parent_info.st_gid != 0 or
                    stat.S_IMODE(parent_info.st_mode) & 0o022):
                deny("PROC_OBSERVER_ANCESTOR_IDENTITY")
            ancestors.append({"path": str(parent), "identity": stat_identity(parent_info)})
    except OSError:
        deny("PROC_OBSERVER_INSTALLATION_READ")
    return {"path": str(path), "identity": stat_identity(info), "ancestors": ancestors}


def _privileged_proc_targets(binding_value: Any, candidate_paths: list[str],
                             phase: str) -> tuple[ProcessScan, dict[str, Any]]:
    binding = _validate_proc_observer_binding(binding_value)
    installed = _proc_observer_installation(binding)
    consumer = {"pid": os.getpid(), "startTicks": _read_start_ticks(Path("/proc/self"))}
    request = {
        "schemaVersion": 1, "kind": "CAPACITY_PROC_OBSERVATION_REQUEST",
        "phase": phase, "nonce": secrets.token_hex(32), "deployUid": deploy_identity()[0],
        "candidatePaths": sorted(set(candidate_paths)), "consumer": consumer,
    }
    request_raw = canonical(request)
    started = time.time_ns()
    try:
        result = subprocess.run(
            PROC_OBSERVER_COMMAND, input=request_raw, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, check=False, timeout=PROC_OBSERVER_TIMEOUT_SECONDS,
            env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
        )
    except subprocess.TimeoutExpired:
        deny("PROC_OBSERVER_TIMEOUT")
    except OSError:
        deny("PROC_OBSERVER_INVOCATION")
    finished = time.time_ns()
    if result.stderr or len(result.stdout) > PROC_OBSERVER_MAX_RESPONSE_BYTES:
        deny("PROC_OBSERVER_OUTPUT")
    try:
        response = json.loads(result.stdout)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("PROC_OBSERVER_RESPONSE_JSON")
    if result.returncode != 0:
        predicate = response.get("predicate") if isinstance(response, dict) else None
        deny("PROC_OBSERVER_DENY:" + (predicate if isinstance(predicate, str) else "UNKNOWN"))
    required = {"schemaVersion", "kind", "state", "phase", "nonce", "requestSha256",
                "candidatePaths", "deployUid", "consumer", "mechanism", "capturedAtNs",
                "finishedAtNs", "durationMs", "observation"}
    if (not isinstance(response, dict) or set(response) != required or
            response.get("schemaVersion") != 1 or
            response.get("kind") != "CAPACITY_PROC_OBSERVATION" or
            canonical(response) != result.stdout or response.get("state") not in {"COMPLETE", "INCOMPLETE"} or
            response.get("phase") != phase or response.get("nonce") != request["nonce"] or
            response.get("requestSha256") != digest_bytes(request_raw) or
            response.get("candidatePaths") != request["candidatePaths"] or
            response.get("deployUid") != request["deployUid"] or response.get("consumer") != consumer):
        deny("PROC_OBSERVER_RESPONSE_BINDING")
    captured = response.get("capturedAtNs")
    completed = response.get("finishedAtNs")
    duration = response.get("durationMs")
    if (not isinstance(captured, int) or not isinstance(completed, int) or
            not isinstance(duration, int) or captured < started or completed > finished or
            captured > completed or duration < 0 or duration > PROC_OBSERVER_TIMEOUT_SECONDS * 1000):
        deny("PROC_OBSERVER_RESPONSE_TIME")
    mechanism = response.get("mechanism")
    if (not isinstance(mechanism, dict) or mechanism.get("path") != binding["path"] or
            mechanism.get("sha256") != binding["sha256"] or
            mechanism.get("identity") != installed["identity"] or
            mechanism.get("ancestors") != installed["ancestors"]):
        deny("PROC_OBSERVER_MECHANISM")
    observation = response.get("observation")
    observation_keys = {"complete", "references", "activeWriters", "failures",
                        "failureDetailsTruncated", "summary"}
    if (not isinstance(observation, dict) or set(observation) != observation_keys or
            not isinstance(observation.get("complete"), bool) or
            response["state"] != ("COMPLETE" if observation["complete"] else "INCOMPLETE") or
            not isinstance(observation.get("references"), list) or
            not isinstance(observation.get("activeWriters"), list) or
            not isinstance(observation.get("failures"), list) or
            not isinstance(observation.get("failureDetailsTruncated"), int) or
            not isinstance(observation.get("summary"), dict)):
        deny("PROC_OBSERVER_OBSERVATION_SCHEMA")
    targets: list[tuple[int, int, str, str]] = []
    for ref in observation["references"]:
        if (not isinstance(ref, dict) or set(ref) != {"candidatePath", "pid", "startTicks", "uids", "source", "target"} or
                ref["candidatePath"] not in request["candidatePaths"] or
                not isinstance(ref["pid"], int) or not isinstance(ref["startTicks"], int) or
                not isinstance(ref["source"], str) or not isinstance(ref["target"], str)):
            deny("PROC_OBSERVER_REFERENCE_SCHEMA")
        targets.append((ref["pid"], ref["startTicks"], ref["source"], ref["target"]))
    summary = dict(observation["summary"])
    summary["referenceReadFailureDetails"] = observation["failures"]
    summary["referenceReadFailureDetailsTruncated"] = observation["failureDetailsTruncated"]
    evidence = {
        "mechanism": mechanism, "phase": phase, "requestSha256": digest_bytes(request_raw),
        "responseSha256": digest_bytes(result.stdout), "nonce": request["nonce"],
        "capturedAtNs": captured, "finishedAtNs": completed,
        "complete": observation["complete"], "candidatePaths": request["candidatePaths"],
        "request": request, "response": response,
    }
    return (targets, observation["activeWriters"], observation["complete"], summary), evidence


def path_overlap(left: str, right: str) -> bool:
    try:
        common = os.path.commonpath((os.path.normpath(left), os.path.normpath(right)))
    except ValueError:
        return False
    return common in {os.path.normpath(left), os.path.normpath(right)}


def process_target_references_candidate(candidate: str, target: str) -> bool:
    """A process references a candidate only at or below its literal root.

    Generic ancestors such as root=/ or cwd=/home/deploy do not prove that the
    process uses a descendant candidate. Operational graph references keep the
    stricter bidirectional overlap rule through path_overlap().
    """
    candidate_path = os.path.normpath(candidate)
    target_path = os.path.normpath(target)
    if not os.path.isabs(candidate_path) or not os.path.isabs(target_path):
        return False
    try:
        return os.path.commonpath((candidate_path, target_path)) == candidate_path
    except ValueError:
        return False


def deploy_identity() -> tuple[int, int]:
    try:
        user = pwd.getpwnam("deploy")
        group = grp.getgrnam("deploy")
    except KeyError:
        deny("DEPLOY_IDENTITY_MISSING")
    if user.pw_gid != group.gr_gid:
        deny("DEPLOY_PRIMARY_GROUP")
    return user.pw_uid, group.gr_gid


def deploy_group_principals() -> list[str]:
    _, gid = deploy_identity()
    group = grp.getgrgid(gid)
    members = set(group.gr_mem)
    members.update(entry.pw_name for entry in pwd.getpwall() if entry.pw_gid == gid)
    return sorted(members)


def physical_directory(path: Path, predicate: str) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError:
        deny(predicate)
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or path.resolve(strict=True) != path:
        deny(predicate)
    return info


def validate_operational(raw: bytes) -> dict[str, Any]:
    value = object_json(raw, "OPERATIONAL_STATE_JSON")
    if set(value) != OPERATIONAL_KEYS or value.get("schemaVersion") != 2:
        deny("OPERATIONAL_STATE_SCHEMA")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "openTransactionPaths", "protectedGraphPaths"):
        items = value.get(key)
        if not isinstance(items, list) or any(not isinstance(item, str) for item in items):
            deny(f"OPERATIONAL_STATE_{key}")
        value[key] = [str(normalized_absolute(item, f"OPERATIONAL_STATE_{key}")) for item in items]
    for key in ("deploymentLock", "writerLock"):
        value[key] = str(normalized_absolute(value.get(key), f"OPERATIONAL_STATE_{key}"))
    observations = value.get("liveObservations")
    if not isinstance(observations, dict) or set(observations) != LIVE_OBSERVATION_KEYS:
        deny("OPERATIONAL_STATE_LIVE_OBSERVATIONS")
    links = observations.get("currentLinks")
    if (not isinstance(links, list) or any(
            not isinstance(item, dict) or set(item) != {"path", "target"} or
            not isinstance(item.get("path"), str) or not isinstance(item.get("target"), str)
            for item in links)):
        deny("OPERATIONAL_STATE_CURRENT_LINKS")
    for item in links:
        item["path"] = str(normalized_absolute(item["path"], "OPERATIONAL_STATE_CURRENT_LINK"))
        item["target"] = str(normalized_absolute(item["target"], "OPERATIONAL_STATE_CURRENT_TARGET"))
    for label in ("pm2", "dump", "releaseGraph"):
        item = observations.get(label)
        expected = {"path", "sha256", "fingerprintSha256"} if label == "pm2" else {"path", "sha256"}
        if not isinstance(item, dict) or set(item) != expected or not valid_sha(item.get("sha256")):
            deny(f"OPERATIONAL_STATE_{label.upper()}")
        item["path"] = str(normalized_absolute(item.get("path"), f"OPERATIONAL_STATE_{label.upper()}"))
        if label == "pm2" and not valid_sha(item.get("fingerprintSha256")):
            deny("OPERATIONAL_STATE_PM2_FINGERPRINT")
    transactions = observations.get("transactionsRoot")
    if (not isinstance(transactions, dict) or set(transactions) !=
            {"path", "ownerUid", "groupGid", "allowedModes"} or
            not isinstance(transactions.get("ownerUid"), int) or
            not isinstance(transactions.get("groupGid"), int) or
            not isinstance(transactions.get("allowedModes"), list) or
            any(not isinstance(mode, str) or not re.fullmatch(r"0[0-7]{3}", mode)
                for mode in transactions["allowedModes"])):
        deny("OPERATIONAL_STATE_TRANSACTIONS_ROOT")
    transactions["path"] = str(normalized_absolute(
        transactions.get("path"), "OPERATIONAL_STATE_TRANSACTIONS_ROOT"))
    return value


def _json_absolute_paths(value: Any) -> list[str]:
    paths: set[str] = set()
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
        elif isinstance(current, str) and current.startswith("/"):
            try:
                paths.add(str(normalized_absolute(current, "LIVE_ABSOLUTE_PATH")))
            except Denied:
                deny("LIVE_ABSOLUTE_PATH")
    return sorted(paths)


def _pm2_projection(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        deny("LIVE_PM2_SHAPE")
    projected: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            deny("LIVE_PM2_ROW")
        environment = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
        projected.append({
            "name": row.get("name", environment.get("name")),
            "pid": row.get("pid"),
            "status": row.get("status", environment.get("status")),
            "restart_time": row.get("restart_time", environment.get("restart_time")),
            "pm_cwd": row.get("pm_cwd", environment.get("pm_cwd")),
            "pm_exec_path": row.get("pm_exec_path", environment.get("pm_exec_path")),
        })
    return sorted(projected, key=lambda item: str(item.get("name")))


def _stable_observed_private(path: Path) -> tuple[bytes, dict[str, Any], str]:
    try:
        expected = sha256(path)
    except OSError:
        deny(f"LIVE_FILE_READ:{path}")
    raw, identity = stable_regular(path, expected)
    return raw, identity, expected


def _stable_private_json(path: Path, predicate: str) -> tuple[Any, str]:
    raw, _, observed_sha = _stable_observed_private(path)
    try:
        return json.loads(raw), observed_sha
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(predicate)


def _protected_json_paths(root: Path) -> list[str]:
    """Read every JSON evidence file without following a legacy symlink."""
    paths: set[str] = set()
    try:
        descendants = sorted(root.rglob("*.json"), key=lambda item: str(item))
    except OSError:
        deny("LIVE_TRANSACTION_SCAN_INCOMPLETE")
    for evidence in descendants:
        if evidence.is_symlink():
            deny("LIVE_LEGACY_TRANSACTION_JSON_SYMLINK")
        value, _ = _stable_private_json(evidence, "LIVE_LEGACY_TRANSACTION_JSON")
        paths.update(_json_absolute_paths(value))
    return sorted(paths)


def _classify_transaction(child: Path) -> tuple[list[str], dict[str, Any]]:
    journal = child / "transaction.v1.private.json"
    window = child / "window-state.private.json"
    if journal.exists() or journal.is_symlink():
        if window.exists() or window.is_symlink():
            deny("LIVE_TRANSACTION_LAYOUT_AMBIGUOUS")
        if journal.is_symlink():
            deny("LIVE_TRANSACTION_SCAN_INCOMPLETE")
        journal_value, journal_sha = _stable_private_json(journal, "LIVE_TRANSACTION_JOURNAL")
        if not isinstance(journal_value, dict):
            deny("LIVE_TRANSACTION_JOURNAL")
        state = journal_value.get("state")
        if (journal_value.get("schemaVersion") != 1 or not isinstance(state, str) or
                state not in FIXED_CURRENT_TRANSACTION_STATES):
            deny("LIVE_TRANSACTION_JOURNAL")
        references = [] if state in TERMINAL_TRANSACTION_STATES else _json_absolute_paths(journal_value)
        return references, {"path": str(journal), "sha256": journal_sha,
                            "state": state, "format": "FIXED_CURRENT_V1",
                            "terminal": state in TERMINAL_TRANSACTION_STATES}

    if window.exists() or window.is_symlink():
        if window.is_symlink():
            deny("LIVE_TRANSACTION_SCAN_INCOMPLETE")
        window_value, window_sha = _stable_private_json(window, "LIVE_WINDOW_STATE")
        if not isinstance(window_value, dict):
            deny("LIVE_WINDOW_STATE")
        state = window_value.get("state")
        rule = WINDOW_TRANSACTION_STATES.get(state)
        if (rule is None or window_value.get("saveCount") != rule["saveCount"] or
                frozenset(window_value) not in WINDOW_STATE_KEYSETS[state]):
            deny("LIVE_WINDOW_STATE_CONTRACT")
        references = [] if rule["terminal"] else _protected_json_paths(child)
        return references, {"path": str(window), "sha256": window_sha,
                            "state": state, "format": "FRONTEND_WINDOW_STATE",
                            "terminal": rule["terminal"]}

    try:
        present = {item.name for item in child.iterdir()}
    except OSError:
        deny("LIVE_TRANSACTION_SCAN_INCOMPLETE")
    if LEGACY_ROLLBACK_SENTINELS.keys() <= present:
        hashes: dict[str, str] = {}
        for name, expected in LEGACY_ROLLBACK_SENTINELS.items():
            raw, _, observed_sha = _stable_observed_private(child / name)
            if raw != expected:
                deny("LIVE_LEGACY_ROLLBACK_CONTRACT")
            hashes[name] = observed_sha
        return [], {"path": str(child), "sha256": digest_bytes(canonical(hashes)),
                    "state": "ROLLED_BACK", "format": "LEGACY_ROLLBACK_SENTINELS",
                    "terminal": True}

    if not present and EMPTY_PREFLIGHT.fullmatch(child.name):
        return [], {"path": str(child), "sha256": digest_bytes(canonical([])),
                    "state": "PREFLIGHT_EMPTY", "format": "LEGACY_EMPTY_PREFLIGHT",
                    "terminal": True}

    if LEGACY_PROTECTED_SENTINELS <= present and child.name.startswith("immutable-"):
        references = _protected_json_paths(child)
        sentinel_hashes = {}
        for name in sorted(LEGACY_PROTECTED_SENTINELS):
            _, _, sentinel_hashes[name] = _stable_observed_private(child / name)
        return references, {"path": str(child),
                            "sha256": digest_bytes(canonical(sentinel_hashes)),
                            "state": "PROTECTED_NONTERMINAL",
                            "format": "LEGACY_PRE_CANONICAL_PROTECTED",
                            "terminal": False}

    deny("LIVE_TRANSACTION_LAYOUT_UNKNOWN")


def _reconciliation_receipt_file(value: Any, label: str,
                                 *, parse_json: bool = True) -> tuple[Path, str, Any]:
    if (not isinstance(value, dict) or set(value) != {"path", "sha256"} or
            not isinstance(value.get("path"), str) or
            not SHA256.fullmatch(str(value.get("sha256", "")))):
        deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
    path = Path(value["path"])
    raw, _ = stable_regular(path, value["sha256"], allowed_modes={0o600, 0o644})
    parsed = object_json(raw, label) if parse_json else raw
    return path, value["sha256"], parsed


def _fixed_current_receipt_activation(
        evidence: Any, component: str,
        source: dict[str, list[str]]) -> tuple[str, str]:
    legacy = {"runtimeManifest", "transactionJournal",
              "selectedRelease", "immediateRollback"}
    versioned = legacy | {"kind"}
    if (not isinstance(evidence, dict) or set(evidence) not in (legacy, versioned) or
            (set(evidence) == versioned and evidence.get("kind") != "FIXED_CURRENT")):
        deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
    _, manifest_sha, manifest = _reconciliation_receipt_file(
        evidence["runtimeManifest"], "LIVE_RELEASE_GRAPH_ROLLBACK_MANIFEST")
    _, _, journal = _reconciliation_receipt_file(
        evidence["transactionJournal"], "LIVE_RELEASE_GRAPH_ROLLBACK_JOURNAL")
    binding = journal.get("binding")
    components = journal.get("components",
                             binding.get("components") if isinstance(binding, dict) else None)
    rollback = manifest.get("rollbackReleases")
    previous = journal.get("previous", {}).get("releases")
    selections = journal.get("preflight", {}).get("selections")
    candidate = binding.get("release") if isinstance(binding, dict) else None
    if (not isinstance(binding, dict) or
            binding.get("runtimeManifestSha256") != manifest_sha or
            not isinstance(components, list) or component not in components or
            any(item not in {"api", "frontend"} for item in components) or
            not isinstance(rollback, dict) or not isinstance(previous, dict) or
            not isinstance(selections, dict) or set(selections) != {"api", "frontend"} or
            not isinstance(candidate, str) or candidate not in source["activeReleases"]):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    selection = selections.get(component)
    selected = selection.get("releaseId") if isinstance(selection, dict) else None
    if (not isinstance(selected, str) or
            selected not in source["installedVerifiedReleases"]):
        deny("LIVE_RELEASE_GRAPH_COMPONENT_COVERAGE")
    definition = rollback.get(component)
    if (not isinstance(definition, dict) or definition.get("releaseId") != selected or
            previous.get(component) != selected or
            evidence["selectedRelease"] != candidate or
            evidence["immediateRollback"] != selected):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    return candidate, selected


def _frontend_only_receipt_activation(
        evidence: Any, source: dict[str, list[str]],
        release_root: Path) -> tuple[str, str]:
    expected = {"kind", "executor", "selectionIntent", "activationIntent",
                "awaitingAcceptanceState", "technicalAcceptance",
                "finalizationReceipt", "finalWindowState",
                "selectedRelease", "immediateRollback"}
    if (not isinstance(evidence, dict) or set(evidence) != expected or
            evidence.get("kind") != "FRONTEND_ONLY_V1"):
        deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
    values: dict[str, Any] = {}
    bindings: dict[str, tuple[Path, str]] = {}
    for key in expected - {"kind", "executor", "selectedRelease", "immediateRollback"}:
        path, sha256, value = _reconciliation_receipt_file(
            evidence[key], f"LIVE_RELEASE_GRAPH_FRONTEND_{key.upper()}")
        bindings[key] = (path, sha256)
        values[key] = value
    executor_path, _, _ = _reconciliation_receipt_file(
        evidence["executor"], "LIVE_RELEASE_GRAPH_FRONTEND_EXECUTOR", parse_json=False)

    selection = values["selectionIntent"]
    activation = values["activationIntent"]
    awaiting = values["awaitingAcceptanceState"]
    acceptance = values["technicalAcceptance"]
    finalization = values["finalizationReceipt"]
    final_window = values["finalWindowState"]
    selected = activation.get("release")
    rollback = activation.get("rollbackRelease")
    target_commit = activation.get("target")
    transaction_root = Path(str(activation.get("transactionRoot", "")))
    selected_runtime = Path(str(selection.get("target", "")))
    rollback_runtime = Path(str(selection.get("expectedCurrent", "")))
    if (not isinstance(selected, str) or selected not in source["activeReleases"] or
            not isinstance(rollback, str) or rollback not in source["rollbackReleases"] or
            selected not in source["installedVerifiedReleases"] or
            rollback not in source["installedVerifiedReleases"] or
            evidence["selectedRelease"] != selected or
            evidence["immediateRollback"] != rollback or
            not isinstance(target_commit, str) or not target_commit or
            not transaction_root.is_absolute() or
            selection != {"frontend": "candidate",
                          "expectedCurrent": str(rollback_runtime),
                          "target": str(selected_runtime)} or
            selected_runtime != release_root / selected / "frontend-runtime" or
            rollback_runtime != release_root / rollback / "frontend-runtime"):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    transaction_paths = [bindings[key][0] for key in
                         ("selectionIntent", "awaitingAcceptanceState",
                          "technicalAcceptance", "finalizationReceipt", "finalWindowState")]
    activation_path = bindings["activationIntent"][0]
    if (any(path.parent != transaction_root for path in transaction_paths) or
            activation_path.parent != executor_path.parent or
            activation_path.name != "activation-intent.private.json" or
            bindings["finalWindowState"][0].name != "window-state.private.json" or
            bindings["selectionIntent"][0].name != "selection-intent.private.json" or
            bindings["technicalAcceptance"][0].name !=
            "technical-acceptance.private.json" or
            bindings["finalizationReceipt"][0].name !=
            "frontend-finalization-receipt.private.json" or
            bindings["awaitingAcceptanceState"][0].name !=
            f"window-state.private.json.previous.{bindings['awaitingAcceptanceState'][1]}"):
        deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
    if (activation.get("schemaVersion") != 1 or
            activation.get("state") != "SEALED_AWAITING_EXPLICIT_ACTIVATION_AUTHORIZATION" or
            activation.get("activationExecuted") is not False or
            activation.get("authorizationReady") is not True or
            activation.get("automaticRetry") is not False or
            activation.get("deployedMarkerBeforeAcceptance") is not False or
            activation.get("saveCountBeforeAcceptance") != 0 or
            activation.get("retirementReceiptAbsent") is not True or
            activation.get("executorSha256") != evidence["executor"]["sha256"]):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    if (awaiting.get("state") != "AWAITING_ACCEPTANCE" or
            awaiting.get("release") != selected or awaiting.get("target") != target_commit or
            awaiting.get("buildId") != activation.get("buildId") or
            awaiting.get("saveCount") != 0 or awaiting.get("acceptance") is not False or
            awaiting.get("deployedMarker") is not False):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    if (acceptance != {"accepted": True,
                       "acceptedAt": acceptance.get("acceptedAt"),
                       "decision": "TECHNICAL_ACCEPTANCE_PASS",
                       "ownerDecision": "TECHNICAL_ACCEPTANCE_GRANTED",
                       "release": selected, "schemaVersion": 1,
                       "scope": "frontend-only technical acceptance",
                       "source": "owner_confirmation_in_active_window",
                       "target": target_commit} or
            not isinstance(acceptance.get("acceptedAt"), str) or
            not acceptance["acceptedAt"]):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    final_common = {"state": "DEPLOYED_SANITIZED", "saveCount": 1,
                    "dumpSha256": finalization.get("dumpSha256"),
                    "retirementReceiptSha256": finalization.get("retirementReceiptSha256"),
                    "restartCountDuringFinalize": 0}
    if (finalization != final_common or
            not SHA256.fullmatch(str(finalization.get("dumpSha256", ""))) or
            not SHA256.fullmatch(str(finalization.get("retirementReceiptSha256", ""))) or
            final_window != {**final_common, "acceptance": True, "deployedMarker": True}):
        deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
    return selected, rollback


def capture_live_operational(operational: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Recapture mutable operational references while both canonical locks are held."""
    observations = operational["liveObservations"]
    current_paths: list[str] = []
    current_evidence: list[dict[str, str]] = []
    for item in observations["currentLinks"]:
        link = Path(item["path"])
        expected_target = Path(item["target"])
        try:
            info = link.lstat()
            target = link.resolve(strict=True)
            expected = expected_target.resolve(strict=True)
        except OSError:
            deny(f"LIVE_CURRENT_LINK:{link}")
        if not stat.S_ISLNK(info.st_mode) or target != expected:
            deny(f"LIVE_CURRENT_LINK:{link}")
        current_paths.append(str(target))
        current_evidence.append({"path": str(link), "target": str(target)})

    pm2 = observations["pm2"]
    pm2_path = Path(pm2["path"])
    raw, _ = stable_regular(pm2_path, pm2["sha256"], allowed_modes={0o500, 0o700})
    fd = os.open(pm2_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or digest_bytes(raw) != pm2["sha256"]:
            deny("LIVE_PM2_BINARY")
        try:
            result = subprocess.run([f"/proc/self/fd/{fd}", "jlist"], text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    timeout=30, check=False, pass_fds=(fd,))
        except (OSError, subprocess.TimeoutExpired):
            deny("LIVE_PM2_JLIST")
    finally:
        os.close(fd)
    if result.returncode != 0:
        deny("LIVE_PM2_JLIST")
    try:
        pm2_rows = json.loads(result.stdout)
    except json.JSONDecodeError:
        deny("LIVE_PM2_JLIST")
    projection = _pm2_projection(pm2_rows)
    pm2_fingerprint = digest_bytes(canonical(projection))
    if pm2_fingerprint != pm2["fingerprintSha256"]:
        deny("LIVE_PM2_CHANGED")
    pm2_paths = _json_absolute_paths(projection)

    dump = observations["dump"]
    dump_raw, _ = stable_regular(Path(dump["path"]), dump["sha256"],
                                 allowed_modes={0o600, 0o644})
    try:
        dump_value = json.loads(dump_raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("LIVE_DUMP_JSON")
    dump_paths = _json_absolute_paths(dump_value)

    graph = observations["releaseGraph"]
    graph_raw, _ = stable_regular(Path(graph["path"]), graph["sha256"],
                                  allowed_modes={0o600, 0o644})
    graph_value = object_json(graph_raw, "LIVE_RELEASE_GRAPH_JSON")
    if graph_value.get("schemaVersion") == 1:
        if set(graph_value) != {"schemaVersion", "protectedGraphPaths"}:
            deny("LIVE_RELEASE_GRAPH_SCHEMA")
    elif graph_value.get("schemaVersion") == 2:
        expected = {"schemaVersion", "sourceGraph", "successorGraph",
                    "reconciliationReceipt", "protectedGraphPaths", "inventoryPaths"}
        if set(graph_value) != expected:
            deny("LIVE_RELEASE_GRAPH_SCHEMA")
        rich_values = {}
        for label in ("sourceGraph", "successorGraph"):
            binding = graph_value[label]
            if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
                    not isinstance(binding.get("path"), str) or
                    not SHA256.fullmatch(str(binding.get("sha256", "")))):
                deny("LIVE_RELEASE_GRAPH_PROVENANCE")
            source_raw, _ = stable_regular(Path(binding["path"]), binding["sha256"],
                                           allowed_modes={0o600, 0o644})
            source_value = object_json(source_raw, "LIVE_RELEASE_GRAPH_PROVENANCE_JSON")
            rich_keys = {"activeReleases", "rollbackReleases", "transitiveReturnReleases",
                         "candidateReleases", "installedVerifiedReleases",
                         "supersededCandidates"}
            optional_rich_keys = {"immediateRollbackReleases"}
            if (frozenset(source_value) not in {frozenset(rich_keys),
                                          frozenset(rich_keys | optional_rich_keys)} or
                    any(not isinstance(source_value.get(key), list) or
                        any(not isinstance(item, str) for item in source_value[key])
                        for key in rich_keys)):
                deny("LIVE_RELEASE_GRAPH_PROVENANCE_SCHEMA")
            immediate = source_value.get("immediateRollbackReleases")
            if immediate is not None and (not isinstance(immediate, dict) or
                    set(immediate) != {"api", "frontend"} or
                    any(not isinstance(item, str) or
                        item not in source_value["rollbackReleases"]
                        for item in immediate.values())):
                deny("LIVE_RELEASE_GRAPH_PROVENANCE_SCHEMA")
            rich_values[label] = source_value
        receipt_binding = graph_value["reconciliationReceipt"]
        if (not isinstance(receipt_binding, dict) or
                set(receipt_binding) != {"path", "sha256"} or
                not isinstance(receipt_binding.get("path"), str) or
                not SHA256.fullmatch(str(receipt_binding.get("sha256", "")))):
            deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
        receipt_raw, _ = stable_regular(Path(receipt_binding["path"]),
                                        receipt_binding["sha256"],
                                        allowed_modes={0o600, 0o644})
        receipt = object_json(receipt_raw, "LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT_JSON")
        receipt_keys = {"schemaVersion", "state", "reconciliationId", "requestSha256",
                        "releaseRoot", "sourceGraph", "operationalState", "successorGraph",
                        "privateDataParents", "activationEvidence", "results",
                        "originalsModified", "destructiveCommands",
                        "freshRecaptureRequiredBeforeRetirement"}
        if (set(receipt) != receipt_keys or receipt.get("schemaVersion") != 2 or
                receipt.get("state") != "RECONCILED_NO_EFFECT" or
                receipt.get("sourceGraph") != graph_value["sourceGraph"] or
                receipt.get("successorGraph") != graph_value["successorGraph"] or
                receipt.get("originalsModified") is not False or
                receipt.get("destructiveCommands") != 0):
            deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
        operational_binding = receipt["operationalState"]
        if (not isinstance(operational_binding, dict) or
                set(operational_binding) != {"path", "sha256"}):
            deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
        operational_raw, _ = stable_regular(Path(operational_binding["path"]),
                                            operational_binding["sha256"],
                                            allowed_modes={0o600, 0o644})
        reconciliation_operational = object_json(
            operational_raw, "LIVE_RELEASE_GRAPH_RECONCILIATION_OPERATIONAL_JSON")
        release_root = normalized_absolute(receipt.get("releaseRoot", ""),
                                           "LIVE_RELEASE_GRAPH_RELEASE_ROOT")
        successor_value = rich_values["successorGraph"]
        expected_inventory = sorted(str(release_root / release)
                                    for release in successor_value["installedVerifiedReleases"])
        private_parents = receipt.get("privateDataParents")
        activation_evidence = receipt.get("activationEvidence")
        results = receipt.get("results")
        if (not isinstance(private_parents, list) or
                any(not isinstance(item, str) for item in private_parents) or
                not isinstance(activation_evidence, dict) or not isinstance(results, list)):
            deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
        derived_private_parents = set()
        for result in results:
            expected_result = {"releaseId", "priorRole", "result", "contract",
                               "lifecycleSha256", "reviewSha256", "closure"}
            if (not isinstance(result, dict) or set(result) != expected_result or
                    not isinstance(result.get("releaseId"), str)):
                deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
            contract_binding = result["contract"]
            if (not isinstance(contract_binding, dict) or
                    set(contract_binding) != {"path", "sha256"}):
                deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
            contract_raw, _ = stable_regular(Path(contract_binding["path"]),
                                             contract_binding["sha256"],
                                             allowed_modes={0o600, 0o644})
            contract = object_json(contract_raw, "LIVE_RELEASE_GRAPH_CONTRACT_JSON")
            release = result["releaseId"]
            installed = release_root / release
            if contract.get("releaseId") != release:
                deny("LIVE_RELEASE_GRAPH_CONTRACT_IDENTITY")
            private_declared = any(
                isinstance(artifact, dict) and
                artifact.get("class") == "PRIVATE_DATA_NEVER_RETIRE" and
                isinstance(artifact.get("path"), str) and
                installed in Path(artifact["path"]).parents
                for artifact in contract.get("artifacts", []))
            try:
                (installed / "api-runtime/.data").lstat()
                private_present = True
            except FileNotFoundError:
                private_present = False
            except OSError:
                private_present = True
            if private_declared or private_present:
                derived_private_parents.add(str(installed))
            expected_result_name = ("PRESERVED_PRIVATE_DATA"
                                    if private_declared or private_present
                                    else "HISTORICAL_EVIDENCE_ONLY")
            if result.get("result") != expected_result_name:
                deny("LIVE_RELEASE_GRAPH_PRIVATE_PARENT_DIVERGENCE")
        if sorted(private_parents) != sorted(derived_private_parents):
            deny("LIVE_RELEASE_GRAPH_PRIVATE_PARENT_DIVERGENCE")
        protected_releases = set(successor_value["activeReleases"] +
                                 successor_value["rollbackReleases"] +
                                 successor_value["transitiveReturnReleases"] +
                                 successor_value["candidateReleases"])
        if set(activation_evidence) != {"api", "frontend"}:
            deny("LIVE_RELEASE_GRAPH_RECONCILIATION_RECEIPT")
        selected_now = {}
        immediate = {}
        for component in ("api", "frontend"):
            evidence = activation_evidence.get(component)
            if (component == "frontend" and isinstance(evidence, dict) and
                    evidence.get("kind") == "FRONTEND_ONLY_V1"):
                candidate, selected = _frontend_only_receipt_activation(
                    evidence, rich_values["sourceGraph"], release_root)
            else:
                candidate, selected = _fixed_current_receipt_activation(
                    evidence, component, rich_values["sourceGraph"])
            immediate[component] = selected
            selected_now[component] = candidate
            if candidate not in rich_values["sourceGraph"]["activeReleases"]:
                deny("LIVE_RELEASE_GRAPH_ACTIVE_SELECTION")
        if set(selected_now) != {"api", "frontend"} or set(immediate) != {"api", "frontend"}:
            deny("LIVE_RELEASE_GRAPH_IMMEDIATE_ROLLBACK_DIVERGENCE")
        immediate_rollbacks = set(immediate.values())
        referenced = set()
        for release in successor_value["installedVerifiedReleases"]:
            installed = release_root / release
            tokens = (release, str(installed))
            for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
                values = reconciliation_operational.get(key)
                if not isinstance(values, list):
                    deny("LIVE_RELEASE_GRAPH_RECONCILIATION_OPERATIONAL_SCHEMA")
                if any(isinstance(value, str) and any(token in value for token in tokens)
                       for value in values):
                    referenced.add(str(installed))
        expected_protected = sorted(
            {str(release_root / release) for release in protected_releases | immediate_rollbacks} |
            {str(normalized_absolute(item, "LIVE_RELEASE_GRAPH_PRIVATE_PARENT"))
             for item in private_parents} | referenced)
        if (graph_value.get("inventoryPaths") != expected_inventory or
                graph_value.get("protectedGraphPaths") != expected_protected):
            deny("LIVE_RELEASE_GRAPH_PROJECTION_DIVERGENCE")
        inventory = graph_value.get("inventoryPaths")
        if (not isinstance(inventory, list) or
                any(not isinstance(item, str) for item in inventory)):
            deny("LIVE_RELEASE_GRAPH_INVENTORY")
        normalized_inventory = [normalized_absolute(item, "LIVE_RELEASE_GRAPH_INVENTORY_PATH")
                                for item in inventory]
        for raw_path in graph_value.get("protectedGraphPaths", []):
            protected = normalized_absolute(raw_path, "LIVE_RELEASE_GRAPH_PATH")
            if not any(protected == parent or parent in protected.parents
                       for parent in normalized_inventory):
                deny("LIVE_RELEASE_GRAPH_PROTECTION_OUTSIDE_INVENTORY")
    else:
        deny("LIVE_RELEASE_GRAPH_SCHEMA")
    if (not isinstance(graph_value.get("protectedGraphPaths"), list) or
            any(not isinstance(item, str) for item in graph_value["protectedGraphPaths"])):
        deny("LIVE_RELEASE_GRAPH_SCHEMA")
    graph_paths = [str(normalized_absolute(item, "LIVE_RELEASE_GRAPH_PATH"))
                   for item in graph_value["protectedGraphPaths"]]

    transaction_definition = observations["transactionsRoot"]
    transaction_root = Path(transaction_definition["path"])
    transaction_info = physical_directory(transaction_root, "LIVE_TRANSACTIONS_ROOT")
    transaction_mode = f"0{stat.S_IMODE(transaction_info.st_mode):03o}"
    if ((transaction_info.st_uid, transaction_info.st_gid) !=
            (transaction_definition["ownerUid"], transaction_definition["groupGid"]) or
            transaction_mode not in transaction_definition["allowedModes"] or
            stat.S_IMODE(transaction_info.st_mode) & 0o022):
        deny("LIVE_TRANSACTIONS_ROOT_IDENTITY")
    transaction_paths: list[str] = []
    transaction_evidence: list[dict[str, Any]] = []
    try:
        children = sorted(transaction_root.iterdir(), key=lambda item: item.name)
    except OSError:
        deny("LIVE_TRANSACTION_SCAN_INCOMPLETE")
    for child in children:
        child_info = physical_directory(child, "LIVE_TRANSACTION_SCAN_INCOMPLETE")
        if (child_info.st_uid != transaction_info.st_uid or child_info.st_gid != transaction_info.st_gid or
                stat.S_IMODE(child_info.st_mode) & 0o022):
            deny("LIVE_TRANSACTION_IDENTITY")
        references, evidence = _classify_transaction(child)
        transaction_paths.extend(references)
        transaction_evidence.append(evidence)

    fresh = dict(operational)
    fresh["currentPaths"] = sorted(set(current_paths))
    fresh["pm2LivePaths"] = sorted(set(pm2_paths))
    fresh["pm2DumpPaths"] = sorted(set(dump_paths))
    fresh["openTransactionPaths"] = sorted(set(transaction_paths))
    fresh["protectedGraphPaths"] = sorted(set(graph_paths))
    evidence = {
        "currentLinks": current_evidence,
        "pm2FingerprintSha256": pm2_fingerprint,
        "dumpSha256": dump["sha256"],
        "releaseGraphSha256": graph["sha256"],
        "transactions": transaction_evidence,
        "recapturedPathsSha256": digest_bytes(canonical({
            key: fresh[key] for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths",
                                        "openTransactionPaths", "protectedGraphPaths")
        })),
    }
    return fresh, evidence


def load_binding(value: Any, label: str) -> tuple[Path, str, bytes, dict[str, Any]]:
    if not isinstance(value, dict) or set(value) != {"path", "sha256"}:
        deny(f"{label}_BINDING")
    path = normalized_absolute(value.get("path"), f"{label}_PATH")
    expected = value.get("sha256")
    raw, _ = stable_regular(path, expected)
    return path, expected, raw, object_json(raw, f"{label}_JSON")


def root_policy(value: Any) -> tuple[dict[str, Any], Path, str]:
    path, expected, _, policy = load_binding(value, "ROOT_POLICY")
    if set(policy) != {"schemaVersion", "canonicalRoots"} or policy.get("schemaVersion") != 1:
        deny("ROOT_POLICY_SCHEMA")
    roots = policy.get("canonicalRoots")
    if not isinstance(roots, dict) or "outputs" not in roots:
        deny("ROOT_POLICY_OUTPUTS")
    output = roots["outputs"]
    if (not isinstance(output, dict) or set(output) != {"path", "ownerUid", "groupGid", "allowedModes"} or
            not isinstance(output.get("allowedModes"), list)):
        deny("ROOT_POLICY_OUTPUTS")
    return policy, path, expected


def validate_lock_free(path: Path) -> dict[str, Any]:
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or
                stat.S_IMODE(before.st_mode) != 0o600 or
                before.st_uid != os.geteuid() or before.st_gid != os.getegid()):
            deny(f"LOCK_IDENTITY:{path}")
        fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
        opened = os.fstat(fd)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            deny(f"LOCK_CHANGED:{path}")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(fd, fcntl.LOCK_UN)
        except BlockingIOError:
            deny(f"LOCK_BUSY:{path}")
        finally:
            os.close(fd)
    except OSError:
        deny(f"LOCK_OPEN:{path}")
    return stat_identity(before)


def authenticate_npm(candidate: dict[str, Any],
                     process_data: ProcessScan,
                     operational: dict[str, Any] | None = None) -> dict[str, Any]:
    if set(candidate) != NPM_CANDIDATE_KEYS:
        deny("NPM_CACHE_SCHEMA")
    path = normalized_absolute(candidate.get("path"), "NPM_CACHE_PATH")
    if path != NPM_CACHE or path.parent != NPM_PARENT:
        deny("NPM_CACHE_PATH")
    uid, gid = deploy_identity()
    parent = physical_directory(NPM_PARENT, "NPM_CACHE_PARENT")
    root = physical_directory(path, "NPM_CACHE_IDENTITY")
    if (parent.st_uid, parent.st_gid, stat.S_IMODE(parent.st_mode)) != (uid, gid, 0o775):
        deny("NPM_CACHE_PARENT_IDENTITY")
    if (root.st_uid, root.st_gid) != (uid, gid):
        deny("NPM_CACHE_OWNER")
    if stat.S_IMODE(root.st_mode) not in NPM_CACHE_ALLOWED_MODES:
        deny("NPM_CACHE_MODE")
    actual_principals = deploy_group_principals()
    if actual_principals != ["deploy"]:
        deny("NPM_CACHE_GROUP_PRINCIPAL_UNEXPECTED")
    targets, writers, complete, scan_summary = process_data
    if writers:
        deny("NPM_OR_BUILD_ACTIVE")
    references = [{"pid": pid, "startTicks": ticks, "source": source}
                  for pid, ticks, source, target in targets
                  if process_target_references_candidate(str(path), target)]
    if references:
        deny("NPM_CACHE_REFERENCED")
    if operational is not None:
        live_references = (operational["currentPaths"] + operational["pm2LivePaths"] +
                           operational["pm2DumpPaths"] + operational["openTransactionPaths"] +
                           operational["protectedGraphPaths"])
        if any(process_target_references_candidate(str(path), item)
               for item in live_references):
            deny("NPM_CACHE_OPERATIONALLY_REFERENCED")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    return {"class": candidate["class"], "path": str(path),
            "identity": stat_identity(root), "parentIdentity": stat_identity(parent),
            "deployGroupPrincipals": actual_principals, "references": [],
            "processScan": scan_summary}


def artifact_for(contract: dict[str, Any], path: Path, cls: str) -> dict[str, Any]:
    matches = [item for item in contract.get("artifacts", [])
               if isinstance(item, dict) and item.get("path") == str(path) and item.get("class") == cls]
    if len(matches) != 1:
        deny(f"CONTRACT_ARTIFACT:{cls}:{path}")
    return matches[0]


def _entry_mode(entry: dict[str, Any]) -> int:
    value = entry.get("mode")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"0[0-7]{3}", value):
        return int(value, 8)
    deny("INDEX_MODE")


def compare_index(runtime: Path, release_root: Path, relative: str,
                  index: dict[str, Any], allowed_release_extras: set[str]) -> dict[str, Any]:
    entries = index.get("entries")
    if not isinstance(entries, list):
        deny("INDEX_ENTRIES")
    selected: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            deny("INDEX_ENTRY")
        name = entry["path"]
        if name == relative or name.startswith(relative + "/"):
            selected[name] = entry
    if relative not in selected:
        deny("INDEX_RUNTIME_ROOT")
    errors: list[str] = []
    checked_files = 0
    for name, entry in selected.items():
        suffix = Path(name).relative_to(relative)
        for label, base in (("output", runtime), ("release", release_root / relative)):
            target = base / suffix
            try:
                info = target.lstat()
            except OSError:
                errors.append(f"{label}:missing:{name}")
                continue
            # Reuse the producer's scan_runtime()/validate_index() entry model:
            # symlinks are authenticated by mode, literal target and confinement.
            actual_type = ("directory" if stat.S_ISDIR(info.st_mode) else
                           "file" if stat.S_ISREG(info.st_mode) else
                           "symlink" if stat.S_ISLNK(info.st_mode) else "other")
            if actual_type != entry.get("type") or stat.S_IMODE(info.st_mode) != _entry_mode(entry):
                errors.append(f"{label}:identity:{name}")
                continue
            if actual_type == "file":
                checked_files += 1
                if info.st_size != entry.get("size") or sha256(target) != entry.get("sha256"):
                    errors.append(f"{label}:content:{name}")
            elif actual_type == "symlink":
                before = (info.st_dev, info.st_ino, info.st_mode, info.st_size,
                          info.st_mtime_ns, info.st_ctime_ns)
                try:
                    link = os.readlink(target)
                    resolved = target.resolve(strict=True)
                    comparison_root = (runtime.parent if label == "output" else release_root).resolve(strict=True)
                    after_info = target.lstat()
                except OSError:
                    errors.append(f"{label}:symlink_broken:{name}")
                    continue
                after = (after_info.st_dev, after_info.st_ino, after_info.st_mode,
                         after_info.st_size, after_info.st_mtime_ns, after_info.st_ctime_ns)
                if before != after:
                    errors.append(f"{label}:symlink_changed:{name}")
                elif resolved != comparison_root and comparison_root not in resolved.parents:
                    errors.append(f"{label}:symlink_escape:{name}")
                elif link != entry.get("target"):
                    errors.append(f"{label}:symlink_target:{name}")
    expected_suffixes = {Path(name).relative_to(relative).as_posix() for name in selected}
    expected_suffixes.discard(".")
    for label, base in (("output", runtime), ("release", release_root / relative)):
        observed = set()
        for item in base.rglob("*"):
            suffix = item.relative_to(base).as_posix()
            if label == "release" and any(suffix == allowed or suffix.startswith(allowed + "/")
                                           for allowed in allowed_release_extras):
                continue
            observed.add(suffix)
        if observed != expected_suffixes:
            errors.append(f"{label}:entry_set")
    if errors:
        deny("DERIVED_OUTPUT_EQUIVALENCE_INCOMPLETE:" + errors[0])
    return {"indexEntryCount": len(selected), "checkedFileObservations": checked_files,
            "allowedReleaseExtras": sorted(allowed_release_extras)}


def authenticate_output(candidate: dict[str, Any], policy: dict[str, Any], operational: dict[str, Any],
                        process_data: ProcessScan) -> dict[str, Any]:
    if set(candidate) != OUTPUT_CANDIDATE_KEYS:
        deny("DERIVED_OUTPUT_SCHEMA")
    path = normalized_absolute(candidate.get("path"), "DERIVED_OUTPUT_PATH")
    relative = candidate.get("runtimeRelativePath")
    if relative not in {"api-runtime", "frontend-runtime"}:
        deny("DERIVED_OUTPUT_RUNTIME_RELATIVE")
    output_def = policy["canonicalRoots"]["outputs"]
    output_root = Path(output_def["path"])
    if path == output_root or output_root not in path.parents:
        deny("DERIVED_OUTPUT_OUTSIDE_ROOT")
    current = path
    while current != output_root:
        info = physical_directory(current, "DERIVED_OUTPUT_ANCESTOR")
        if (info.st_uid, info.st_gid) != (output_def["ownerUid"], output_def["groupGid"]) or stat.S_IMODE(info.st_mode) & 0o022:
            deny("DERIVED_OUTPUT_ANCESTOR")
        current = current.parent
    output_root_info = physical_directory(output_root, "DERIVED_OUTPUT_ROOT")
    if ((output_root_info.st_uid, output_root_info.st_gid) !=
            (output_def["ownerUid"], output_def["groupGid"]) or
            f"0{stat.S_IMODE(output_root_info.st_mode):03o}" not in output_def["allowedModes"] or
            stat.S_IMODE(output_root_info.st_mode) & 0o022):
        deny("DERIVED_OUTPUT_ROOT_IDENTITY")
    references = (operational["currentPaths"] + operational["pm2LivePaths"] +
                  operational["pm2DumpPaths"] + operational["openTransactionPaths"] +
                  operational["protectedGraphPaths"])
    if any(path_overlap(str(path), item) for item in references):
        deny("DERIVED_OUTPUT_REFERENCED_OR_PROTECTED")
    targets, _, complete, scan_summary = process_data
    if any(process_target_references_candidate(str(path), target)
           for _, _, _, target in targets):
        deny("DERIVED_OUTPUT_PROCESS_REFERENCE")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    bindings = {}
    for label in ("contract", "package", "manifest", "index"):
        item = candidate[label]
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            deny(f"DERIVED_OUTPUT_{label.upper()}_BINDING")
        item_path = normalized_absolute(item.get("path"), f"DERIVED_OUTPUT_{label.upper()}_PATH")
        modes = {0o600} if label == "contract" else {0o600, 0o644}
        raw, identity = stable_regular(item_path, item.get("sha256"), allowed_modes=modes)
        bindings[label] = (item_path, raw, identity)
    contract = object_json(bindings["contract"][1], "DERIVED_OUTPUT_CONTRACT_JSON")
    manifest = object_json(bindings["manifest"][1], "DERIVED_OUTPUT_MANIFEST_JSON")
    index = object_json(bindings["index"][1], "DERIVED_OUTPUT_INDEX_JSON")
    release_root = normalized_absolute(candidate.get("releaseRoot"), "DERIVED_OUTPUT_RELEASE_ROOT")
    physical_directory(release_root, "DERIVED_OUTPUT_RELEASE_ROOT")
    output_artifact = artifact_for(contract, path, "DERIVED_OUTPUT_RUNTIME")
    release_artifact = artifact_for(contract, release_root, "RELEASE_RUNTIME")
    package_artifact = artifact_for(contract, bindings["package"][0], "PACKAGE_PRESERVE")
    manifest_artifact = artifact_for(contract, bindings["manifest"][0], "PACKAGE_PRESERVE")
    index_artifact = artifact_for(contract, bindings["index"][0], "PACKAGE_PRESERVE")
    release_id = contract.get("releaseId")
    target = contract.get("targetCommit")
    linked_artifacts = (output_artifact, release_artifact, package_artifact,
                        manifest_artifact, index_artifact)
    if (not isinstance(release_id, str) or not isinstance(target, str) or
            output_artifact.get("releaseId") != release_id or release_artifact.get("releaseId") != release_id or
            package_artifact.get("releaseId") != release_id or
            manifest_artifact.get("releaseId") != release_id or index_artifact.get("releaseId") != release_id):
        deny("DERIVED_OUTPUT_CONTRACT_LINK")
    if any(item.get("targetCommit") != target for item in linked_artifacts):
        deny("DERIVED_OUTPUT_CONTRACT_TARGET_LINK")
    for label, artifact in (("package", package_artifact), ("manifest", manifest_artifact),
                            ("index", index_artifact)):
        if artifact.get("digest") != {"sha256": candidate[label]["sha256"]}:
            deny("DERIVED_OUTPUT_CONTRACT_DIGEST_LINK")
    if manifest.get("releaseId") != release_id or manifest.get("targetCommit") != target:
        deny("DERIVED_OUTPUT_MANIFEST_LINK")
    allowed: set[str] = set()
    overlay = contract.get("privateDataOverlay")
    if isinstance(overlay, dict) and overlay.get("path", "").startswith(relative + "/"):
        allowed.add(str(Path(overlay["path"]).relative_to(relative)))
    for artifact in contract.get("artifacts", []):
        if (isinstance(artifact, dict) and artifact.get("class") == "EPHEMERAL_RUNTIME_CACHE" and
                isinstance(artifact.get("path"), str)):
            artifact_path = Path(artifact["path"])
            release_runtime = release_root / relative
            if release_runtime in artifact_path.parents:
                allowed.add(artifact_path.relative_to(release_runtime).as_posix())
    equivalence = compare_index(path, release_root, relative, index, allowed)
    return {"class": candidate["class"], "path": str(path), "identity": stat_identity(path.lstat()),
            "releaseId": release_id, "targetCommit": target, "releaseRoot": str(release_root),
            "runtimeRelativePath": relative,
            "bindings": {label: {"path": str(value[0]), "sha256": candidate[label]["sha256"]}
                         for label, value in bindings.items()}, "equivalence": equivalence,
            "processScan": scan_summary}


DIRECTORY_IDENTITY_KEYS = {"device", "inode", "uid", "gid", "mode"}
ANCESTOR_IDENTITY_KEYS = DIRECTORY_IDENTITY_KEYS | {"path"}


def _directory_identity(info: os.stat_result) -> dict[str, Any]:
    return {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
    }


def _identity_owner_allowed(info: os.stat_result) -> bool:
    return (info.st_uid, info.st_gid) in {(0, 0), (os.geteuid(), os.getegid())}


def _validate_directory_identity(value: Any, predicate: str, *, path: bool = False) -> None:
    expected = ANCESTOR_IDENTITY_KEYS if path else DIRECTORY_IDENTITY_KEYS
    if (not isinstance(value, dict) or set(value) != expected or
            any(not isinstance(value.get(key), int)
                for key in ("device", "inode", "uid", "gid")) or
            not re.fullmatch(r"0[0-7]{3}", str(value.get("mode", ""))) or
            (path and not isinstance(value.get("path"), str))):
        deny(predicate)


def _preparation_archive_ancestors(path: Path,
                                   expected_identities: list[dict[str, Any]] | None = None
                                   ) -> list[dict[str, Any]]:
    if path.parent == PREPARATIONS_ROOT or PREPARATIONS_ROOT not in path.parents:
        deny("PREPARATION_ARCHIVE_SCOPE")
    root_info = physical_directory(PREPARATIONS_ROOT, "PREPARATION_ARCHIVE_ROOT")
    legacy_owner = (root_info.st_uid, root_info.st_gid)
    observed: list[dict[str, Any]] = []
    current = path.parent
    while True:
        info = physical_directory(current, "PREPARATION_ARCHIVE_ANCESTOR")
        owner_allowed = (_identity_owner_allowed(info) if expected_identities is not None else
                         (info.st_uid, info.st_gid) == legacy_owner)
        if not owner_allowed or stat.S_IMODE(info.st_mode) & 0o022:
            deny("PREPARATION_ARCHIVE_ANCESTOR_IDENTITY")
        observed.append({"path": str(current), **_directory_identity(info)})
        if current == PREPARATIONS_ROOT:
            break
        current = current.parent
    if expected_identities is not None and observed != expected_identities:
        deny("PREPARATION_ARCHIVE_ANCESTOR_IDENTITY")
    return observed


def _archive_structure(path: Path, identity: dict[str, Any]) -> dict[str, Any]:
    protected = False
    entries = 0
    try:
        with tarfile.open(path, mode="r:gz") as archive:
            for member in archive:
                entries += 1
                name = member.name[2:] if member.name.startswith("./") else member.name
                pure = Path(name)
                if (not name or pure.is_absolute() or ".." in pure.parts or
                        member.isdev() or member.isfifo()):
                    deny("PREPARATION_ARCHIVE_MEMBER_UNSAFE")
                parts = tuple(part for part in pure.parts if part not in {"", "."})
                lowered = tuple(part.lower() for part in parts)
                if (any(part == ".data" or part == ".env" or part.startswith(".env.")
                        for part in lowered) or
                        (lowered and lowered[0] in {
                            "content", "database", "runtime-data", "configuration",
                            "uploads", "media", "evidence", "receipts",
                        }) or
                        any(part in {"tenant-data", "tenant-scoped", "secrets"}
                            for part in lowered) or
                        any(lowered[index:index + 3] in {
                            ("apps", "whatsapp-agent", ".data"),
                            ("apps", "whatsapp-agent", "uploads"),
                        } for index in range(max(0, len(lowered) - 2)))):
                    protected = True
    except (tarfile.TarError, OSError):
        deny("PREPARATION_ARCHIVE_READ")
    after = path.lstat()
    if ((after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns,
         after.st_nlink) !=
            (identity["device"], identity["inode"], identity["size"],
             identity["mtimeNs"], identity["ctimeNs"], identity["nlink"])):
        deny("PREPARATION_ARCHIVE_CHANGED")
    if protected:
        deny("PREPARATION_ARCHIVE_PROTECTED_MATERIAL")
    return {"memberCount": entries, "protectedMaterialFound": False}


def _preparation_archive_proof(candidate: dict[str, Any], path: Path,
                               expected_sha: str, expected_size: int) -> dict[str, Any]:
    proof = candidate.get("proof")
    if not isinstance(proof, dict):
        deny("PREPARATION_ARCHIVE_PROOF_SCHEMA")
    if (path.name in PREPARATION_DUPLICATE_ONLY_ARCHIVE_NAMES and
            proof.get("kind") != "DUPLICATE_COPY"):
        deny("PREPARATION_ARCHIVE_PROOF_KIND")
    if proof.get("kind") == "VERSIONED_PREPARATION_RECORD":
        if set(proof) != DERIVED_ARCHIVE_PROOF_KEYS or proof.get("recordEntry") != path.name:
            deny("PREPARATION_ARCHIVE_PROOF_SCHEMA")
        binding = proof.get("record")
        if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
            deny("PREPARATION_ARCHIVE_RECORD_BINDING")
        record_path = normalized_absolute(binding.get("path"),
                                          "PREPARATION_ARCHIVE_RECORD_PATH")
        if (record_path.name != "AUTOMATION_RELEASE_PREPARATION_2026-09-29.md" or
                record_path.parent.name != "saas" or record_path.parent.parent.name != "docs"):
            deny("PREPARATION_ARCHIVE_RECORD_SCOPE")
        raw, _ = stable_regular(record_path, binding.get("sha256"), private=False,
                                allowed_modes={0o600, 0o640, 0o644})
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            deny("PREPARATION_ARCHIVE_RECORD_ENCODING")
        row = f"| {path.name} | {expected_size} | `{expected_sha}` |"
        if text.count(row) != 1:
            deny("PREPARATION_ARCHIVE_RECORD_DIVERGED")
        if "`tar -tzf` dos arquivos compactados PASS" not in text:
            deny("PREPARATION_ARCHIVE_RECORD_READBACK")
        return {"kind": proof["kind"], "record": {
            "path": str(record_path), "sha256": binding["sha256"],
        }, "recordEntry": path.name}
    if proof.get("kind") == "DUPLICATE_COPY":
        if set(proof) != DUPLICATE_ARCHIVE_PROOF_KEYS:
            deny("PREPARATION_ARCHIVE_PROOF_SCHEMA")
        binding = proof.get("authoritativeCopy")
        if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
            deny("PREPARATION_ARCHIVE_AUTHORITY_BINDING")
        authority = normalized_absolute(binding.get("path"),
                                        "PREPARATION_ARCHIVE_AUTHORITY_PATH")
        if authority == path or PREPARATIONS_ROOT not in authority.parents:
            deny("PREPARATION_ARCHIVE_AUTHORITY_SCOPE")
        authority_raw, authority_identity = stable_regular(
            authority, binding.get("sha256"), allowed_modes={0o600, 0o640, 0o644},
            include_nlink=True)
        if (binding.get("sha256") != expected_sha or len(authority_raw) != expected_size or
                authority_identity["nlink"] != 1):
            deny("PREPARATION_ARCHIVE_AUTHORITY_DIVERGED")
        return {"kind": proof["kind"], "authoritativeCopy": {
            "path": str(authority), "sha256": binding["sha256"],
            "identity": authority_identity,
        }}
    deny("PREPARATION_ARCHIVE_PROOF_KIND")


def authenticate_preparation_archive(candidate: dict[str, Any], operational: dict[str, Any],
                                     process_data: ProcessScan) -> dict[str, Any]:
    if set(candidate) != PREPARATION_ARCHIVE_CANDIDATE_KEYS:
        deny("PREPARATION_ARCHIVE_SCHEMA")
    path = normalized_absolute(candidate.get("path"), "PREPARATION_ARCHIVE_PATH")
    if path.name not in PREPARATION_DERIVED_ARCHIVE_NAMES:
        deny("PREPARATION_ARCHIVE_PROTECTED_NAME")
    if path.name in PREPARATION_DUPLICATE_ONLY_ARCHIVE_NAMES:
        try:
            relative = path.relative_to(PREPARATIONS_ROOT)
        except ValueError:
            deny("PREPARATION_ARCHIVE_SCOPE")
        if len(relative.parts) != 3 or relative.parts[1] != "window":
            deny("PREPARATION_ARCHIVE_SCOPE")
    _preparation_archive_ancestors(path)
    raw, identity = stable_regular(path, candidate.get("sha256"),
                                   allowed_modes={0o600, 0o640, 0o644},
                                   include_nlink=True)
    if identity["nlink"] != 1:
        deny("PREPARATION_ARCHIVE_HARDLINK")
    references = (operational["currentPaths"] + operational["pm2LivePaths"] +
                  operational["pm2DumpPaths"] + operational["openTransactionPaths"] +
                  operational["protectedGraphPaths"])
    if any(path_overlap(str(path), item) for item in references):
        deny("PREPARATION_ARCHIVE_REFERENCED_OR_PROTECTED")
    targets, writers, complete, scan_summary = process_data
    if any(process_target_references_candidate(str(path), target)
           for _, _, _, target in targets):
        deny("PREPARATION_ARCHIVE_PROCESS_REFERENCE")
    if any(writer.get("candidatePath") == str(path) for writer in writers):
        deny("PREPARATION_ARCHIVE_WRITER")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    structure = _archive_structure(path, identity)
    proof = _preparation_archive_proof(candidate, path, candidate["sha256"], len(raw))
    return {"class": candidate["class"], "path": str(path), "sha256": candidate["sha256"],
            "identity": identity, "proof": proof, "archive": structure,
            "processScan": scan_summary}


def _disposition_manifest(
    binding: Any, *, sealed_binding: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
        deny("DISPOSITION_MANIFEST_BINDING")
    path = normalized_absolute(binding.get("path"), "DISPOSITION_MANIFEST_PATH")
    specs = (
        {"path": DISPOSITION_MANIFEST_PATH, "sha256": DISPOSITION_MANIFEST_SHA256,
         "dispositionId": DISPOSITION_ID, "entryCount": 3,
         "bindPackageSymlinks": False},
        {"path": WORKER_PACKAGE_AUDIT_MANIFEST_PATH,
         "sha256": WORKER_PACKAGE_AUDIT_MANIFEST_SHA256,
         "dispositionId": WORKER_PACKAGE_AUDIT_DISPOSITION_ID, "entryCount": 1,
         "bindPackageSymlinks": True},
    )
    spec = next((item for item in specs if item["sha256"] == binding.get("sha256")), None)
    expected = ({"path": str(spec["path"]), "sha256": spec["sha256"]}
                if sealed_binding is None and spec is not None else sealed_binding)
    if (spec is None or not isinstance(expected, dict) or
            set(expected) != {"path", "sha256"} or binding != expected):
        deny("DISPOSITION_MANIFEST_FIXED_BINDING")
    try:
        relative = spec["path"].relative_to(ROOT)
    except ValueError:
        deny("DISPOSITION_MANIFEST_FIXED_BINDING")
    if not relative.parts or tuple(path.parts[-len(relative.parts):]) != relative.parts:
        deny("DISPOSITION_MANIFEST_FIXED_BINDING")
    manifest_root = path.parents[len(relative.parts) - 1]
    if sealed_binding is not None and path != spec["path"]:
        try:
            manifest_root.relative_to(PREPARATIONS_ROOT)
        except ValueError:
            deny("DISPOSITION_MANIFEST_FIXED_BINDING")
    raw, _ = stable_regular(path, spec["sha256"], private=False,
                            allowed_modes={0o600, 0o640, 0o644})
    value = object_json(raw, "DISPOSITION_MANIFEST_JSON")
    if (set(value) != {"schemaVersion", "kind", "dispositionId", "entries",
                       "versionedEnvExample"} or
            value.get("schemaVersion") != 2 or
            value.get("kind") != "CLOSED_PREPARATION_MANIFEST_DISPOSITION" or
            value.get("dispositionId") != spec["dispositionId"] or
            not isinstance(value.get("entries"), list) or
            len(value["entries"]) != spec["entryCount"]):
        deny("DISPOSITION_MANIFEST_SCHEMA")
    env = value.get("versionedEnvExample")
    if not isinstance(env, dict) or set(env) != {"path", "sha256"}:
        deny("DISPOSITION_MANIFEST_ENV_EXAMPLE")
    env_path = manifest_root / env.get("path", "")
    if env_path != manifest_root / "apps/whatsapp-agent/.env.example":
        deny("DISPOSITION_MANIFEST_ENV_EXAMPLE")
    stable_regular(env_path, env.get("sha256"), private=False,
                   allowed_modes={0o600, 0o640, 0o644})
    entries: dict[str, dict[str, Any]] = {}
    common = {"path", "type", "physicalBytes", "sha256", "identity", "proof",
              "authority", "authorityState", "authorityIdentity", "candidateAncestors",
              "historicalRecords"}
    for entry in value["entries"]:
        if not isinstance(entry, dict):
            deny("DISPOSITION_MANIFEST_ENTRY_SCHEMA")
        expected = common | ({"packageFilesSha256"}
                             if entry.get("type") == "ENUMERATED_TREE" else set())
        if spec["bindPackageSymlinks"] and entry.get("type") == "ENUMERATED_TREE":
            expected.add("packageSymlinksSha256")
        if "protectedMemberExceptions" in entry:
            expected.add("protectedMemberExceptions")
        if set(entry) != expected or entry.get("type") not in {"ARCHIVE_FILE", "ENUMERATED_TREE"}:
            deny("DISPOSITION_MANIFEST_ENTRY_SCHEMA")
        candidate_path = normalized_absolute(entry.get("path"), "DISPOSITION_ENTRY_PATH")
        authority = normalized_absolute(entry.get("authority"), "DISPOSITION_AUTHORITY_PATH")
        if (candidate_path == authority or PREPARATIONS_ROOT not in candidate_path.parents or
                RELEASES_ROOT not in authority.parents):
            deny("DISPOSITION_MANIFEST_ENTRY_SCOPE")
        if str(candidate_path) in entries:
            deny("DISPOSITION_MANIFEST_DUPLICATE")
        if (not isinstance(entry.get("physicalBytes"), int) or entry["physicalBytes"] <= 0 or
                not isinstance(entry.get("identity"), dict) or
                set(entry["identity"]) != {"device", "inode", "nlink", "uid", "gid", "mode"} or
                any(not isinstance(entry["identity"].get(key), int)
                    for key in ("device", "inode", "nlink", "uid", "gid")) or
                not re.fullmatch(r"0[0-7]{3}", str(entry["identity"].get("mode", ""))) or
                not isinstance(entry.get("historicalRecords"), list) or
                not entry["historicalRecords"]):
            deny("DISPOSITION_MANIFEST_ENTRY_SCHEMA")
        ancestors = entry.get("candidateAncestors")
        if not isinstance(ancestors, list) or not ancestors:
            deny("DISPOSITION_MANIFEST_ANCESTOR_SCHEMA")
        for ancestor in ancestors:
            _validate_directory_identity(ancestor, "DISPOSITION_MANIFEST_ANCESTOR_SCHEMA",
                                         path=True)
            normalized_absolute(ancestor["path"], "DISPOSITION_MANIFEST_ANCESTOR_SCHEMA")
        if entry.get("authorityState") != "PRESENT":
            deny("DISPOSITION_MANIFEST_AUTHORITY_IDENTITY")
        _validate_directory_identity(entry.get("authorityIdentity"),
                                     "DISPOSITION_MANIFEST_AUTHORITY_IDENTITY")
        if entry["type"] == "ARCHIVE_FILE":
            if not valid_sha(entry.get("sha256")) or entry.get("proof") != "ARCHIVE_AUTHORITY_TREE":
                deny("DISPOSITION_MANIFEST_ARCHIVE_SCHEMA")
            exceptions = entry.get("protectedMemberExceptions", [])
            if exceptions not in ([], [
                    {"kind": "VERSIONED_ENV_EXAMPLE",
                     "path": "apps/whatsapp-agent/.env.example"},
                    {"kind": "OPENAI_LIBRARY_CODE",
                     "pathPrefix": "node_modules/openai/resources/uploads/"},
            ]):
                deny("DISPOSITION_MANIFEST_ARCHIVE_EXCEPTIONS")
        elif (entry.get("sha256") is not None or
              not valid_sha(entry.get("packageFilesSha256")) or
              entry.get("proof") != "ENUMERATED_TREE_AUTHORITY"):
            deny("DISPOSITION_MANIFEST_TREE_SCHEMA")
        if (spec["bindPackageSymlinks"] and entry.get("type") == "ENUMERATED_TREE" and
                not valid_sha(entry.get("packageSymlinksSha256"))):
            deny("DISPOSITION_MANIFEST_TREE_SCHEMA")
        for record in entry["historicalRecords"]:
            if not isinstance(record, dict) or set(record) != {"path", "sha256"}:
                deny("DISPOSITION_MANIFEST_RECORD_SCHEMA")
            record_path = manifest_root / record.get("path", "")
            try:
                record_path.relative_to(manifest_root)
            except ValueError:
                deny("DISPOSITION_MANIFEST_RECORD_SCOPE")
            stable_regular(record_path, record.get("sha256"), private=False,
                           allowed_modes={0o600, 0o640, 0o644})
        entries[str(candidate_path)] = entry
    return value, entries


def _disposition_reference_checks(path: Path, operational: dict[str, Any],
                                  process_data: ProcessScan) -> dict[str, Any]:
    references = (operational["currentPaths"] + operational["pm2LivePaths"] +
                  operational["pm2DumpPaths"] + operational["openTransactionPaths"] +
                  operational["protectedGraphPaths"])
    if any(path_overlap(str(path), item) for item in references):
        deny("DISPOSITION_REFERENCED_OR_PROTECTED")
    targets, writers, complete, summary = process_data
    if any(process_target_references_candidate(str(path), target)
           for _, _, _, target in targets):
        deny("DISPOSITION_PROCESS_REFERENCE")
    if any(writer.get("candidatePath") == str(path) for writer in writers):
        deny("DISPOSITION_WRITER")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    return summary


def _normalized_archive_member(name: str) -> PurePosixPath:
    original = name
    while name.startswith("./"):
        name = name[2:]
    if name in {"", "."}:
        if (original and not original.startswith("/") and
                all(part in {"", "."} for part in original.split("/"))):
            return PurePosixPath(".")
        deny("DISPOSITION_ARCHIVE_MEMBER_PATH")
    pure = PurePosixPath(name)
    if (not name or pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts) or
            any(ord(character) < 32 for character in name)):
        deny("DISPOSITION_ARCHIVE_MEMBER_PATH")
    return pure


def _authority_root(path: Path, entry: dict[str, Any], *,
                    require_not_group_writable: bool = False
                    ) -> tuple[os.stat_result, dict[str, Any]]:
    if entry.get("authorityState") != "PRESENT":
        deny("DISPOSITION_AUTHORITY_ABSENT")
    info = physical_directory(path, "DISPOSITION_AUTHORITY_DIRECTORY")
    identity = _directory_identity(info)
    if (not _identity_owner_allowed(info) or
            (require_not_group_writable and stat.S_IMODE(info.st_mode) & 0o022) or
            identity != entry.get("authorityIdentity")):
        deny("DISPOSITION_AUTHORITY_IDENTITY")
    return info, identity


def _authority_leaf(root: Path, root_info: os.stat_result,
                    relative: str, *, require_not_group_writable: bool = False
                    ) -> tuple[Path, list[dict[str, Any]]]:
    normalized_root = Path(os.path.abspath(root))
    if normalized_root != root or root == root.parent:
        deny("DISPOSITION_AUTHORITY_CONFINEMENT")
    if relative == ".":
        current_root = physical_directory(root, "DISPOSITION_AUTHORITY_DIRECTORY")
        if _directory_identity(current_root) != _directory_identity(root_info):
            deny("DISPOSITION_AUTHORITY_IDENTITY")
        return root, []
    leaf = Path(os.path.abspath(root / relative))
    try:
        leaf.relative_to(root)
    except ValueError:
        deny("DISPOSITION_AUTHORITY_CONFINEMENT")
    current = leaf.parent
    ancestors: list[dict[str, Any]] = []
    while current != root:
        if current == current.parent:
            deny("DISPOSITION_AUTHORITY_CONFINEMENT")
        try:
            current.relative_to(root)
        except ValueError:
            deny("DISPOSITION_AUTHORITY_CONFINEMENT")
        info = physical_directory(current, "DISPOSITION_AUTHORITY_ANCESTOR")
        if (info.st_dev != root_info.st_dev or not _identity_owner_allowed(info) or
                (require_not_group_writable and stat.S_IMODE(info.st_mode) & 0o022)):
            deny("DISPOSITION_AUTHORITY_IDENTITY")
        ancestors.append({"path": str(current), **_directory_identity(info),
                          "nlink": info.st_nlink})
        current = current.parent
    return leaf, ancestors


def _safe_archive_link(member: tarfile.TarInfo, member_path: PurePosixPath) -> str:
    return _safe_relative_link(member_path, member.linkname)


def _safe_relative_link(member_path: PurePosixPath, linkname: str) -> str:
    """Authenticate a relative link target without resolving or following it."""
    target = PurePosixPath(linkname)
    if target.is_absolute() or not linkname or any(ord(character) < 32
                                                   for character in linkname):
        deny("DISPOSITION_ARCHIVE_SYMLINK")
    resolved = list(member_path.parent.parts)
    for part in target.parts:
        if part == "..":
            if not resolved:
                deny("DISPOSITION_ARCHIVE_SYMLINK")
            resolved.pop()
        elif part not in {"", "."}:
            resolved.append(part)
    if not resolved:
        deny("DISPOSITION_ARCHIVE_SYMLINK")
    return linkname


def _protected_archive_member(relative: str, entry: dict[str, Any], payload_sha: str | None,
                              manifest: dict[str, Any]) -> None:
    parts = tuple(part.lower() for part in PurePosixPath(relative).parts)
    exceptions = entry.get("protectedMemberExceptions", [])
    env_allowed = {"kind": "VERSIONED_ENV_EXAMPLE",
                   "path": "apps/whatsapp-agent/.env.example"} in exceptions
    uploads_allowed = {"kind": "OPENAI_LIBRARY_CODE",
                       "pathPrefix": "node_modules/openai/resources/uploads/"} in exceptions
    if any(part == ".env" or part.startswith(".env.") for part in parts):
        env = manifest["versionedEnvExample"]
        if relative != "apps/whatsapp-agent/.env.example" or not env_allowed or payload_sha != env["sha256"]:
            deny("DISPOSITION_ARCHIVE_PROTECTED_MATERIAL")
        return
    openai_upload = "node_modules/openai/resources/uploads/" in relative.lower()
    if "uploads" in parts:
        if not (uploads_allowed and openai_upload):
            deny("DISPOSITION_ARCHIVE_PROTECTED_MATERIAL")
        return
    if (any(part in {".data", "tenant-data", "tenant-scoped", "secrets"} for part in parts) or
            (parts and parts[0] in {"content", "database", "runtime-data", "configuration",
                                    "media", "evidence", "receipts"})):
        deny("DISPOSITION_ARCHIVE_PROTECTED_MATERIAL")


def _authenticate_disposition_archive(path: Path, entry: dict[str, Any],
                                      manifest: dict[str, Any]) -> dict[str, Any]:
    progress_events = 0
    last_progress_at = time.monotonic()

    def emit_temporal_progress(kind: str, consumed: int, *, member_count: int = 0,
                               member_size: int | None = None) -> None:
        nonlocal progress_events, last_progress_at
        now = time.monotonic()
        if (progress_events >= TAR_PROGRESS_EVENT_LIMIT or
                now - last_progress_at < TAR_PROGRESS_TIME_INTERVAL_SECONDS):
            return
        telemetry("tar_scan_progress", candidate=path, member_count=member_count,
                  progress_kind=kind, progress_bytes=consumed,
                  member_size_bytes=member_size)
        progress_events += 1
        last_progress_at = now

    telemetry("before_archive_hash", candidate=path)
    identity = stable_regular_digest(
        path, entry["sha256"],
        allowed_modes={int(entry["identity"]["mode"], 8)}, include_nlink=True,
        progress=lambda consumed: emit_temporal_progress(
            "archive_hash", consumed, member_size=entry["identity"].get("size")))
    telemetry("after_archive_hash", candidate=path)
    expected_identity = entry["identity"]
    if ({key: identity[key] for key in expected_identity} != expected_identity or
            identity["nlink"] != 1):
        deny("DISPOSITION_IDENTITY_DIVERGED")
    authority = Path(entry["authority"])
    authority_root, authority_root_identity = _authority_root(authority, entry)
    relation = FramedRelationDigest()
    scratch_parent = _TELEMETRY.path.parent if _TELEMETRY is not None else path.parent
    max_tar_members_retained = 0
    name_registry_peak_bytes = 0
    name_registry_metrics: dict[str, Any] | None = None
    telemetry("before_tar_scan", candidate=path)
    telemetry("before_authority_compare", candidate=path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            if not _same_open_identity(identity, opened):
                deny("DISPOSITION_IDENTITY_DIVERGED")
            with ExactNameRegistry(scratch_parent) as names, \
                    os.fdopen(os.dup(fd), "rb") as source, \
                    tarfile.open(fileobj=source, mode="r|gz") as archive:
                for member in archive:
                    max_tar_members_retained = max(max_tar_members_retained,
                                                   len(archive.members))
                    try:
                        relative = _normalized_archive_member(member.name).as_posix()
                        if relative == "." and not member.isdir():
                            deny("DISPOSITION_ARCHIVE_ROOT_MEMBER")
                        names.add(relative)
                        if member.isreg():
                            stream = archive.extractfile(member)
                            if stream is None:
                                deny("DISPOSITION_ARCHIVE_READ")
                            digest = hashlib.sha256()
                            payload_bytes = 0
                            while chunk := stream.read(1024 * 1024):
                                digest.update(chunk)
                                payload_bytes += len(chunk)
                                emit_temporal_progress(
                                    "archive_payload", payload_bytes,
                                    member_count=relation.count, member_size=member.size)
                            member_sha = digest.hexdigest()
                            _protected_archive_member(relative, entry, member_sha, manifest)
                            authoritative, authority_ancestors = _authority_leaf(
                                authority, authority_root, relative)
                            try:
                                authority_mode = stat.S_IMODE(authoritative.lstat().st_mode)
                            except OSError:
                                deny("DISPOSITION_ARCHIVE_AUTHORITY_DIVERGED")
                            authority_identity = stable_regular_digest(
                                authoritative, member_sha, private=False,
                                allowed_modes={authority_mode}, expected_size=member.size,
                                allowed_owner_pairs={(0, 0), (os.geteuid(), os.getegid())},
                                progress=lambda consumed: emit_temporal_progress(
                                    "authority_leaf", consumed,
                                    member_count=relation.count, member_size=member.size))
                            relation.add({"path": relative, "type": "file", "size": member.size,
                                          "sha256": member_sha,
                                          "tarMode": f"0{member.mode & 0o7777:03o}",
                                          "authority": authority_identity,
                                          "authorityAncestors": authority_ancestors})
                        elif member.isdir():
                            authoritative, authority_ancestors = _authority_leaf(
                                authority, authority_root, relative)
                            directory_info = physical_directory(
                                authoritative, "DISPOSITION_ARCHIVE_AUTHORITY_DIVERGED")
                            if (directory_info.st_dev != authority_root.st_dev or
                                    not _identity_owner_allowed(directory_info)):
                                deny("DISPOSITION_AUTHORITY_IDENTITY")
                            _protected_archive_member(relative, entry, None, manifest)
                            relation.add({"path": relative, "type": "directory", "size": 0,
                                          "authority": stat_identity(directory_info,
                                                                     include_nlink=True),
                                          "authorityAncestors": authority_ancestors})
                        elif member.issym():
                            target = _safe_archive_link(member, PurePosixPath(relative))
                            authoritative, authority_ancestors = _authority_leaf(
                                authority, authority_root, relative)
                            try:
                                info = authoritative.lstat()
                            except OSError:
                                deny("DISPOSITION_ARCHIVE_AUTHORITY_DIVERGED")
                            if (not stat.S_ISLNK(info.st_mode) or
                                    os.readlink(authoritative) != target):
                                deny("DISPOSITION_ARCHIVE_AUTHORITY_DIVERGED")
                            relation.add({"path": relative, "type": "symlink", "target": target,
                                          "authority": stat_identity(info, include_nlink=True),
                                          "authorityAncestors": authority_ancestors})
                        else:
                            deny("DISPOSITION_ARCHIVE_MEMBER_UNSAFE")
                        if (relation.count % TAR_PROGRESS_INTERVAL == 0 and
                                progress_events < TAR_PROGRESS_EVENT_LIMIT):
                            current_disk = names.measure()
                            name_registry_peak_bytes = max(
                                name_registry_peak_bytes, names.peak_physical_bytes)
                            telemetry("tar_scan_progress", candidate=path,
                                      member_count=relation.count,
                                      temporary_disk_bytes=current_disk)
                            progress_events += 1
                            last_progress_at = time.monotonic()
                    finally:
                        # Stream mode still appends every TarInfo to this list in
                        # Python 3.12. Admitted member handling never relies on a
                        # previous TarInfo (hard links remain denied), so release
                        # it before requesting the next header.
                        archive.members.clear()
                name_registry_metrics = names.finalize()
                name_registry_peak_bytes = max(name_registry_peak_bytes,
                                               names.peak_physical_bytes)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
        if not _same_open_identity(identity, after) or not _same_open_identity(identity, current):
            deny("DISPOSITION_IDENTITY_DIVERGED")
    except (tarfile.TarError, OSError):
        deny("DISPOSITION_ARCHIVE_READ")
    telemetry("after_authority_compare", candidate=path, member_count=relation.count)
    telemetry("after_tar_scan", candidate=path, member_count=relation.count,
              temporary_disk_bytes=name_registry_peak_bytes,
              tar_members_retained=max_tar_members_retained,
              name_registry=name_registry_metrics)
    return {"memberCount": relation.count, "relationSha256": relation.hexdigest(),
            "authority": str(authority), "authorityIdentity": authority_root_identity,
            "effects": [[*LITERAL_UNLINK, str(path)]]}


def _parse_package_files(path: Path, expected_sha: str) -> tuple[dict[str, str], dict[str, Any]]:
    identity = stable_regular_digest(
        path, expected_sha, allowed_modes={0o600, 0o640, 0o644}, include_nlink=True)
    if identity["nlink"] != 1:
        deny("DISPOSITION_TREE_HARDLINK")
    raw = _read_stable_regular(
        path, identity, "DISPOSITION_PACKAGE_FILES_READ", maximum_bytes=16 * 1024 * 1024)
    entries: dict[str, str] = {}
    try:
        lines = raw.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        deny("DISPOSITION_PACKAGE_FILES_ENCODING")
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([^\x00-\x1f]+)", line)
        if match is None:
            deny("DISPOSITION_PACKAGE_FILES_SCHEMA")
        relative = _normalized_archive_member(match.group(2).removeprefix("./")).as_posix()
        if relative == "PACKAGE_FILES.sha256" or relative in entries:
            deny("DISPOSITION_PACKAGE_FILES_SCHEMA")
        entries[relative] = match.group(1)
    if not entries:
        deny("DISPOSITION_PACKAGE_FILES_SCHEMA")
    return entries, identity


def _read_stable_regular(path: Path, expected: dict[str, Any], predicate: str,
                         *, maximum_bytes: int = 1024 * 1024) -> bytes:
    """Read an already authenticated small control file without following links."""
    if expected.get("size", maximum_bytes + 1) > maximum_bytes:
        deny(predicate)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            if not _same_open_identity(expected, opened):
                deny(predicate)
            chunks: list[bytes] = []
            consumed = 0
            while block := os.read(fd, min(64 * 1024, maximum_bytes + 1 - consumed)):
                consumed += len(block)
                if consumed > maximum_bytes:
                    deny(predicate)
                chunks.append(block)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
    except OSError:
        deny(predicate)
    if (not _same_open_identity(expected, after) or
            not _same_open_identity(expected, current)):
        deny(predicate)
    return b"".join(chunks)


def _parse_package_symlinks(path: Path, expected_sha: str) -> tuple[dict[str, str], dict[str, Any]]:
    """Authenticate PACKAGE_SYMLINKS.txt before interpreting its closed relation."""
    try:
        mode = stat.S_IMODE(path.lstat().st_mode)
    except OSError:
        deny("DISPOSITION_PACKAGE_SYMLINKS_READ")
    identity = stable_regular_digest(
        path, expected_sha, private=False, allowed_modes={mode}, include_nlink=True,
        allowed_owner_pairs={(0, 0), (os.geteuid(), os.getegid())})
    if identity["nlink"] != 1:
        deny("DISPOSITION_TREE_HARDLINK")
    raw = _read_stable_regular(
        path, identity, "DISPOSITION_PACKAGE_SYMLINKS_READ")
    try:
        lines = raw.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        deny("DISPOSITION_PACKAGE_SYMLINKS_SCHEMA")
    entries: dict[str, str] = {}
    for line in lines:
        if line.count("\t") != 1:
            deny("DISPOSITION_PACKAGE_SYMLINKS_SCHEMA")
        relative_raw, target = line.split("\t", 1)
        relative = _normalized_archive_member(relative_raw.removeprefix("./"))
        if relative.as_posix() in {"PACKAGE_FILES.sha256", "PACKAGE_SYMLINKS.txt"}:
            deny("DISPOSITION_PACKAGE_SYMLINKS_SCHEMA")
        _safe_relative_link(relative, target)
        if relative.as_posix() in entries:
            deny("DISPOSITION_PACKAGE_SYMLINKS_SCHEMA")
        entries[relative.as_posix()] = target
    return entries, identity


def _stable_symlink(path: Path, expected_target: str, root_device: int,
                    predicate: str) -> dict[str, Any]:
    """Authenticate lstat/readlink/lstat without following a symlink."""
    try:
        before = path.lstat()
        if (not stat.S_ISLNK(before.st_mode) or before.st_dev != root_device or
                not _identity_owner_allowed(before)):
            deny(predicate)
        observed = os.readlink(path)
        after = path.lstat()
    except OSError:
        deny(predicate)
    fields = lambda info: (info.st_dev, info.st_ino, info.st_mode, info.st_uid,
                           info.st_gid, info.st_size, info.st_mtime_ns,
                           info.st_ctime_ns, info.st_nlink)
    if fields(before) != fields(after) or observed != expected_target:
        deny(predicate)
    return stat_identity(after, include_nlink=True)


def _authenticate_disposition_tree(path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    root = physical_directory(path, "DISPOSITION_TREE_ROOT")
    root_device = root.st_dev
    expected_identity = entry["identity"]
    root_identity = stat_identity(root, include_nlink=True)
    if {key: root_identity[key] for key in expected_identity} != expected_identity:
        deny("DISPOSITION_IDENTITY_DIVERGED")
    manifest_path = path / "PACKAGE_FILES.sha256"
    listed, package_identity = _parse_package_files(manifest_path, entry["packageFilesSha256"])
    links_manifest_name = "PACKAGE_SYMLINKS.txt"
    if links_manifest_name not in listed:
        deny("DISPOSITION_PACKAGE_SYMLINKS_SCHEMA")
    links_manifest_path = path / links_manifest_name
    declared_links, links_manifest_identity = _parse_package_symlinks(
        links_manifest_path, listed[links_manifest_name])
    if ("packageSymlinksSha256" in entry and
            listed[links_manifest_name] != entry["packageSymlinksSha256"]):
        deny("DISPOSITION_PACKAGE_SYMLINKS_BINDING")
    if set(listed) & set(declared_links):
        deny("DISPOSITION_TREE_LEAF_SET")
    authority = Path(entry["authority"])
    authority_root, authority_root_identity = _authority_root(
        authority, entry, require_not_group_writable=True)
    actual_files: set[str] = set()
    actual_links: set[str] = set()
    directories: list[str] = []
    relation = FramedRelationDigest()
    stack = [path]
    while stack:
        current = stack.pop()
        current_info = physical_directory(current, "DISPOSITION_TREE_DIRECTORY")
        if current_info.st_dev != root_device:
            deny("DISPOSITION_TREE_CROSS_DEVICE")
        if not _identity_owner_allowed(current_info) or stat.S_IMODE(current_info.st_mode) & 0o022:
            deny("DISPOSITION_TREE_DIRECTORY_IDENTITY")
        relation.add({
            "type": "directory",
            "path": "." if current == path else current.relative_to(path).as_posix(),
            **stat_identity(current_info, include_nlink=True),
        })
        if current != path:
            directories.append(current.relative_to(path).as_posix())
        try:
            children = sorted(os.scandir(current), key=lambda item: item.name)
        except OSError:
            deny("DISPOSITION_TREE_READ")
        for child in children:
            child_path = Path(child.path)
            info = child_path.lstat()
            if info.st_dev != root_device:
                deny("DISPOSITION_TREE_CROSS_DEVICE")
            relative = child_path.relative_to(path).as_posix()
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                stack.append(child_path)
            elif stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                if info.st_nlink != 1:
                    deny("DISPOSITION_TREE_HARDLINK")
                actual_files.add(relative)
            elif stat.S_ISLNK(info.st_mode):
                if relative not in declared_links:
                    deny("DISPOSITION_TREE_LEAF_SET")
                actual_links.add(relative)
            else:
                deny("DISPOSITION_TREE_UNSAFE_LEAF")
    expected_files = set(listed) | {"PACKAGE_FILES.sha256"}
    if actual_files != expected_files or actual_links != set(declared_links):
        deny("DISPOSITION_TREE_LEAF_SET")
    for relative in sorted(listed):
        leaf = path / relative
        try:
            leaf_mode = stat.S_IMODE(leaf.lstat().st_mode)
            authority_mode = stat.S_IMODE((authority / relative).lstat().st_mode)
        except OSError:
            deny("DISPOSITION_TREE_AUTHORITY_DIVERGED")
        if leaf_mode & 0o022:
            deny("DISPOSITION_TREE_AUTHORITY_DIVERGED")
        identity = stable_regular_digest(
            leaf, listed[relative], private=False, allowed_modes={leaf_mode},
            include_nlink=True,
            allowed_owner_pairs={(0, 0), (os.geteuid(), os.getegid())})
        if identity["nlink"] != 1:
            deny("DISPOSITION_TREE_HARDLINK")
        if identity["device"] != root_device:
            deny("DISPOSITION_TREE_CROSS_DEVICE")
        authority_leaf, authority_ancestors = _authority_leaf(
            authority, authority_root, relative, require_not_group_writable=True)
        authority_identity = stable_regular_digest(
            authority_leaf, listed[relative], private=False,
            allowed_modes={authority_mode},
            include_nlink=True,
            allowed_owner_pairs={(0, 0), (os.geteuid(), os.getegid())})
        if (identity["size"] != authority_identity["size"] or
                authority_identity["device"] != authority_root.st_dev):
            deny("DISPOSITION_TREE_AUTHORITY_DIVERGED")
        relation.add({"type": "file", "path": relative,
                      "sha256": listed[relative], "size": identity["size"],
                      "identity": identity, "authority": authority_identity,
                      "authorityAncestors": authority_ancestors})
    for relative in sorted(declared_links):
        target = declared_links[relative]
        candidate_identity = _stable_symlink(
            path / relative, target, root_device, "DISPOSITION_TREE_SYMLINK_DIVERGED")
        authority_leaf, authority_ancestors = _authority_leaf(
            authority, authority_root, relative, require_not_group_writable=True)
        authority_identity = _stable_symlink(
            authority_leaf, target, authority_root.st_dev,
            "DISPOSITION_TREE_AUTHORITY_DIVERGED")
        relation.add({"type": "symlink", "path": relative, "target": target,
                      "identity": candidate_identity,
                      "authority": authority_identity,
                      "authorityAncestors": authority_ancestors})
    authority_manifest, authority_manifest_ancestors = _authority_leaf(
        authority, authority_root, "PACKAGE_FILES.sha256",
        require_not_group_writable=True)
    authority_manifest_mode = stat.S_IMODE(authority_manifest.lstat().st_mode)
    authority_manifest_identity = stable_regular_digest(
        authority_manifest, entry["packageFilesSha256"], private=False,
        allowed_modes={authority_manifest_mode},
        include_nlink=True,
        allowed_owner_pairs={(0, 0), (os.geteuid(), os.getegid())})
    if authority_manifest_identity["device"] != authority_root.st_dev:
        deny("DISPOSITION_TREE_AUTHORITY_DIVERGED")
    relation.add({"type": "authority-manifest", "path": "PACKAGE_FILES.sha256",
                  "identity": authority_manifest_identity,
                  "authorityAncestors": authority_manifest_ancestors})
    leaf_effects = [[*LITERAL_UNLINK, str(path / relative)]
                    for relative in sorted(expected_files | set(declared_links), reverse=True)]
    directory_effects = [[*LITERAL_RMDIR, str(path / relative)]
                         for relative in sorted(directories,
                                                key=lambda value: (-len(PurePosixPath(value).parts), value))]
    directory_effects.append([*LITERAL_RMDIR, str(path)])
    return {"leafCount": len(expected_files) + len(declared_links),
            "regularLeafCount": len(expected_files), "symlinkCount": len(declared_links),
            "directoryCount": len(directories) + 1,
            "packageFiles": {"path": str(manifest_path), "sha256": entry["packageFilesSha256"],
                             "identity": package_identity},
            "packageSymlinks": {"path": str(links_manifest_path),
                                "sha256": listed[links_manifest_name],
                                "identity": links_manifest_identity},
            "relationSha256": relation.hexdigest(), "authority": str(authority),
            "authorityIdentity": authority_root_identity,
            "effects": leaf_effects + directory_effects}


def authenticate_manifest_disposition(candidate: dict[str, Any], operational: dict[str, Any],
                                      process_data: ProcessScan, *,
                                      sealed_manifest_binding: dict[str, Any] | None = None,
                                      ) -> dict[str, Any]:
    if set(candidate) != MANIFEST_DISPOSITION_CANDIDATE_KEYS:
        deny("DISPOSITION_CANDIDATE_SCHEMA")
    manifest_binding = candidate.get("dispositionManifest")
    manifest, entries = _disposition_manifest(
        manifest_binding, sealed_binding=sealed_manifest_binding)
    path = normalized_absolute(candidate.get("path"), "DISPOSITION_CANDIDATE_PATH")
    entry = entries.get(str(path))
    if entry is None:
        deny("DISPOSITION_CANDIDATE_NOT_DECLARED")
    ancestor_identities = _preparation_archive_ancestors(path, entry["candidateAncestors"])
    process_summary = _disposition_reference_checks(path, operational, process_data)
    if entry["type"] == "ARCHIVE_FILE":
        detail = _authenticate_disposition_archive(path, entry, manifest)
        identity = stat_identity(path.lstat(), include_nlink=True)
    else:
        detail = _authenticate_disposition_tree(path, entry)
        identity = stat_identity(path.lstat(), include_nlink=True)
    usage = physical_usage([path])[str(path)]
    if usage["allocatedBytes"] != entry["physicalBytes"]:
        deny("DISPOSITION_PHYSICAL_BYTES_DIVERGED")
    return {"class": candidate["class"], "path": str(path),
            "dispositionId": manifest["dispositionId"],
            "dispositionManifest": manifest_binding,
            "entry": entry, "identity": identity, "detail": detail,
            "candidateAncestors": ancestor_identities,
            "processScan": process_summary}


def _deploy_control_manifest(binding: Any, *,
                             sealed_binding: dict[str, Any] | None = None
                             ) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
        deny("DEPLOY_CONTROL_MANIFEST_BINDING")
    path = normalized_absolute(binding.get("path"), "DEPLOY_CONTROL_MANIFEST_PATH")
    expected = ({"path": str(DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH),
                 "sha256": DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256}
                if sealed_binding is None else sealed_binding)
    if (not isinstance(expected, dict) or set(expected) != {"path", "sha256"} or
            binding != expected):
        deny("DEPLOY_CONTROL_MANIFEST_FIXED_BINDING")
    relative = Path("config/capacity-recovery/") / DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH.name
    if tuple(path.parts[-len(relative.parts):]) != relative.parts:
        deny("DEPLOY_CONTROL_MANIFEST_FIXED_BINDING")
    if sealed_binding is not None and path != DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH:
        try:
            path.parents[len(relative.parts) - 1].relative_to(PREPARATIONS_ROOT)
        except ValueError:
            deny("DEPLOY_CONTROL_MANIFEST_FIXED_BINDING")
    raw, _ = stable_regular(path, DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256,
                            private=False, allowed_modes={0o600, 0o640, 0o644})
    value = object_json(raw, "DEPLOY_CONTROL_MANIFEST_JSON")
    if (set(value) != {"schemaVersion", "kind", "dispositionId", "worktree", "entries"} or
            value.get("schemaVersion") != 1 or
            value.get("kind") != "CLOSED_DEPLOY_CONTROL_DERIVED_DISPOSITION" or
            value.get("dispositionId") != DEPLOY_CONTROL_DISPOSITION_ID or
            not isinstance(value.get("entries"), list) or len(value["entries"]) != 4):
        deny("DEPLOY_CONTROL_MANIFEST_SCHEMA")
    worktree = value.get("worktree")
    worktree_keys = {"root", "commit", "gitDir", "gitFileSha256", "identity",
                     "preservedTrackedPaths"}
    if (not isinstance(worktree, dict) or set(worktree) != worktree_keys or
            normalized_absolute(worktree.get("root"), "DEPLOY_CONTROL_ROOT") !=
            DEPLOY_CONTROL_ROOT or
            not re.fullmatch(r"[0-9a-f]{40}", str(worktree.get("commit", ""))) or
            not valid_sha(worktree.get("gitFileSha256")) or
            not isinstance(worktree.get("preservedTrackedPaths"), list) or
            not worktree["preservedTrackedPaths"] or
            len(set(worktree["preservedTrackedPaths"])) !=
            len(worktree["preservedTrackedPaths"])):
        deny("DEPLOY_CONTROL_WORKTREE_SCHEMA")
    _validate_directory_identity(worktree.get("identity"),
                                 "DEPLOY_CONTROL_WORKTREE_IDENTITY")
    git_dir = normalized_absolute(worktree.get("gitDir"), "DEPLOY_CONTROL_GITDIR")
    if git_dir != DEPLOY_CONTROL_GITDIR:
        deny("DEPLOY_CONTROL_GITDIR")
    for relative_path in worktree["preservedTrackedPaths"]:
        if (not isinstance(relative_path, str) or not relative_path or
                PurePosixPath(relative_path).is_absolute() or
                any(part in {"", ".", ".."} for part in PurePosixPath(relative_path).parts)):
            deny("DEPLOY_CONTROL_PRESERVED_PATH")
    entries: dict[str, dict[str, Any]] = {}
    expected_paths = {str(path) for path in DEPLOY_CONTROL_PATHS}
    entry_keys = {"path", "relativePath", "kind", "physicalBytes", "identity",
                  "derivationTrackedPaths"}
    for entry in value["entries"]:
        if (not isinstance(entry, dict) or set(entry) != entry_keys or
                entry.get("kind") not in {"DEPENDENCY_TREE", "COMPILED_TREE"} or
                not isinstance(entry.get("physicalBytes"), int) or
                entry["physicalBytes"] <= 0):
            deny("DEPLOY_CONTROL_ENTRY_SCHEMA")
        path = normalized_absolute(entry.get("path"), "DEPLOY_CONTROL_ENTRY_PATH")
        if str(path) not in expected_paths or str(path) in entries:
            deny("DEPLOY_CONTROL_ENTRY_SCOPE")
        relative_path = PurePosixPath(str(entry.get("relativePath", "")))
        if (relative_path.is_absolute() or relative_path.as_posix() !=
                path.relative_to(DEPLOY_CONTROL_ROOT).as_posix()):
            deny("DEPLOY_CONTROL_ENTRY_SCOPE")
        _validate_directory_identity(entry.get("identity"),
                                     "DEPLOY_CONTROL_ENTRY_IDENTITY")
        derivation = entry.get("derivationTrackedPaths")
        if (not isinstance(derivation, list) or not derivation or
                any(item not in worktree["preservedTrackedPaths"] for item in derivation)):
            deny("DEPLOY_CONTROL_DERIVATION_SCHEMA")
        entries[str(path)] = entry
    if set(entries) != expected_paths:
        deny("DEPLOY_CONTROL_EXACT_BATCH")
    return value, entries


def _git_run(worktree: Path, arguments: list[str]) -> str:
    environment = {"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C",
                   "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
                   "GIT_OPTIONAL_LOCKS": "0"}
    try:
        result = subprocess.run([str(GIT), "-C", str(worktree), *arguments],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, timeout=30, check=False, env=environment)
    except (OSError, subprocess.TimeoutExpired):
        deny("DEPLOY_CONTROL_GIT_EXECUTION")
    if result.returncode != 0 or result.stderr:
        deny("DEPLOY_CONTROL_GIT_EXECUTION")
    return result.stdout


def _deploy_control_worktree(manifest: dict[str, Any]) -> dict[str, Any]:
    worktree = manifest["worktree"]
    root = Path(worktree["root"])
    root_info = physical_directory(root, "DEPLOY_CONTROL_WORKTREE_ROOT")
    root_identity = _directory_identity(root_info)
    if (root_identity != worktree["identity"] or
            (root_info.st_uid, root_info.st_gid, stat.S_IMODE(root_info.st_mode)) !=
            (*deploy_identity(), 0o775) or deploy_group_principals() != ["deploy"]):
        deny("DEPLOY_CONTROL_WORKTREE_IDENTITY")
    git_file = root / ".git"
    git_raw, git_identity = stable_regular(
        git_file, worktree["gitFileSha256"], private=False,
        allowed_modes={0o600, 0o640, 0o644, 0o664},
        allowed_owner_pairs={deploy_identity()})
    expected_git_file = f"gitdir: {worktree['gitDir']}\n".encode()
    if git_raw != expected_git_file:
        deny("DEPLOY_CONTROL_GITDIR")
    git_dir = physical_directory(Path(worktree["gitDir"]), "DEPLOY_CONTROL_GITDIR")
    git_dir_mode = stat.S_IMODE(git_dir.st_mode)
    if ((git_dir.st_uid, git_dir.st_gid) != deploy_identity() or
            git_dir_mode not in {0o755, 0o775} or
            git_dir_mode & 0o002 or
            (git_dir_mode == 0o775 and deploy_group_principals() != ["deploy"])):
        deny("DEPLOY_CONTROL_GITDIR")
    if _git_run(root, ["rev-parse", "HEAD"]).strip() != worktree["commit"]:
        deny("DEPLOY_CONTROL_COMMIT")
    if _git_run(root, ["status", "--porcelain=v1", "--untracked-files=all"]):
        deny("DEPLOY_CONTROL_TRACKED_OR_UNTRACKED_DRIFT")
    registration = _git_run(root, ["worktree", "list", "--porcelain"])
    expected_registration = f"worktree {root}\nHEAD {worktree['commit']}\n"
    blocks = [block + "\n" for block in registration.strip().split("\n\n")]
    if not any(block.startswith(expected_registration) for block in blocks):
        deny("DEPLOY_CONTROL_WORKTREE_REGISTRATION")
    for relative in worktree["preservedTrackedPaths"]:
        if not (root / relative).exists():
            deny("DEPLOY_CONTROL_PRESERVED_PATH")
        _git_run(root, ["ls-files", "--error-unmatch", "--", relative])
    for entry in manifest["entries"]:
        relative = entry["relativePath"]
        if not _git_run(root, ["check-ignore", "--", relative]).strip():
            deny("DEPLOY_CONTROL_CANDIDATE_NOT_IGNORED")
    return {"root": str(root), "commit": worktree["commit"],
            "identity": root_identity, "gitFile": git_identity,
            "gitDir": worktree["gitDir"],
            "preservedTrackedPaths": worktree["preservedTrackedPaths"]}


def _deploy_control_protected(relative: str) -> None:
    parts = tuple(part.lower() for part in PurePosixPath(relative).parts)
    name = parts[-1] if parts else ""
    if (any(part in {".data", "tenant-data", "tenant-scoped", "runtime-data"}
            for part in parts) or name == ".env" or name.startswith(".env.") or
            any(name.endswith(suffix) for suffix in
                (".pem", ".key", ".p12", ".pfx", ".sqlite", ".sqlite3", ".db",
                 ".dump", ".session")) or
            name in {"credentials.json", "secrets.json"}):
        deny("DEPLOY_CONTROL_PROTECTED_MATERIAL")


def _deploy_control_inode_counts() -> dict[tuple[int, int], int]:
    counts: dict[tuple[int, int], int] = {}
    for root in DEPLOY_CONTROL_PATHS:
        stack = [root]
        while stack:
            current = stack.pop()
            try:
                info = current.lstat()
            except OSError:
                deny("DEPLOY_CONTROL_TREE_READ")
            if stat.S_ISREG(info.st_mode):
                key = (info.st_dev, info.st_ino)
                counts[key] = counts.get(key, 0) + 1
            elif stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                try:
                    with os.scandir(current) as children:
                        stack.extend(Path(child.path) for child in children)
                except OSError:
                    deny("DEPLOY_CONTROL_TREE_READ")
    return counts


def _stable_deploy_control_file(path: Path, root_device: int) -> tuple[dict[str, Any], str]:
    try:
        before = path.lstat()
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            digest = hashlib.sha256()
            while chunk := os.read(fd, 1024 * 1024):
                digest.update(chunk)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
    except OSError:
        deny("DEPLOY_CONTROL_TREE_READ")
    identities = {(item.st_dev, item.st_ino, item.st_mode, item.st_uid, item.st_gid,
                   item.st_size, item.st_mtime_ns, item.st_ctime_ns, item.st_nlink)
                  for item in (before, opened, after, current)}
    if (len(identities) != 1 or not stat.S_ISREG(opened.st_mode) or
            opened.st_dev != root_device or
            (opened.st_uid, opened.st_gid) != deploy_identity() or
            stat.S_IMODE(opened.st_mode) & 0o022):
        deny("DEPLOY_CONTROL_TREE_IDENTITY")
    return stat_identity(opened, include_nlink=True), digest.hexdigest()


def _stable_deploy_control_symlink(path: Path, root: Path,
                                   root_device: int) -> tuple[dict[str, Any], str]:
    try:
        before = path.lstat(); target = os.readlink(path); after = path.lstat()
    except OSError:
        deny("DEPLOY_CONTROL_TREE_SYMLINK")
    if ((before.st_dev, before.st_ino, before.st_mode, before.st_size,
         before.st_mtime_ns, before.st_ctime_ns) !=
            (after.st_dev, after.st_ino, after.st_mode, after.st_size,
             after.st_mtime_ns, after.st_ctime_ns) or
            not stat.S_ISLNK(before.st_mode) or before.st_dev != root_device or
            (before.st_uid, before.st_gid) != deploy_identity()):
        deny("DEPLOY_CONTROL_TREE_SYMLINK")
    if not target or Path(target).is_absolute() or any(ord(char) < 32 for char in target):
        deny("DEPLOY_CONTROL_TREE_SYMLINK")
    resolved = Path(os.path.normpath(str(path.parent / target)))
    try:
        resolved.relative_to(root)
    except ValueError:
        deny("DEPLOY_CONTROL_TREE_SYMLINK_ESCAPE")
    return stat_identity(before, include_nlink=True), target


def _authenticate_deploy_control_tree(path: Path, entry: dict[str, Any],
                                      inode_counts: dict[tuple[int, int], int]
                                      ) -> dict[str, Any]:
    root_info = physical_directory(path, "DEPLOY_CONTROL_TREE_ROOT")
    root_identity = _directory_identity(root_info)
    if (root_identity != entry["identity"] or root_info.st_dev !=
            DEPLOY_CONTROL_ROOT.lstat().st_dev or
            (root_info.st_uid, root_info.st_gid) != deploy_identity() or
            stat.S_IMODE(root_info.st_mode) & 0o022):
        deny("DEPLOY_CONTROL_TREE_IDENTITY")
    relation = FramedRelationDigest()
    directories: list[str] = []
    leaves: list[str] = []
    stack = [path]
    regular_count = 0; symlink_count = 0
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as opened:
                children = sorted(opened, key=lambda item: item.name)
        except OSError:
            deny("DEPLOY_CONTROL_TREE_READ")
        for child in children:
            child_path = Path(child.path)
            try:
                info = child_path.lstat()
            except OSError:
                deny("DEPLOY_CONTROL_TREE_READ")
            relative = child_path.relative_to(path).as_posix()
            _deploy_control_protected(relative)
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                if (info.st_dev != root_info.st_dev or
                        (info.st_uid, info.st_gid) != deploy_identity() or
                        stat.S_IMODE(info.st_mode) & 0o022):
                    deny("DEPLOY_CONTROL_TREE_IDENTITY")
                directories.append(relative); stack.append(child_path)
                relation.add({"type": "directory", "path": relative,
                              "identity": stat_identity(info, include_nlink=True)})
            elif stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                identity, file_sha = _stable_deploy_control_file(child_path,
                                                                  root_info.st_dev)
                key = (identity["device"], identity["inode"])
                if identity["nlink"] != inode_counts.get(key):
                    deny("DEPLOY_CONTROL_TREE_EXTERNAL_HARDLINK")
                leaves.append(relative); regular_count += 1
                relation.add({"type": "file", "path": relative,
                              "sha256": file_sha, "identity": identity})
            elif stat.S_ISLNK(info.st_mode):
                identity, target = _stable_deploy_control_symlink(
                    child_path, path, root_info.st_dev)
                leaves.append(relative); symlink_count += 1
                relation.add({"type": "symlink", "path": relative,
                              "target": target, "identity": identity})
            else:
                deny("DEPLOY_CONTROL_TREE_UNSAFE_LEAF")
    effects = [[*LITERAL_UNLINK, str(path / relative)]
               for relative in sorted(leaves, reverse=True)]
    effects.extend([*LITERAL_RMDIR, str(path / relative)]
                   for relative in sorted(
                       directories,
                       key=lambda value: (-len(PurePosixPath(value).parts), value)))
    effects.append([*LITERAL_RMDIR, str(path)])
    return {"regularLeafCount": regular_count, "symlinkCount": symlink_count,
            "directoryCount": len(directories) + 1,
            "relationSha256": relation.hexdigest(), "effects": effects}


def authenticate_deploy_control(candidate: dict[str, Any], operational: dict[str, Any],
                                process_data: ProcessScan, *,
                                sealed_manifest_binding: dict[str, Any] | None = None
                                ) -> dict[str, Any]:
    if set(candidate) != DEPLOY_CONTROL_CANDIDATE_KEYS:
        deny("DEPLOY_CONTROL_CANDIDATE_SCHEMA")
    manifest_binding = candidate.get("dispositionManifest")
    manifest, entries = _deploy_control_manifest(
        manifest_binding, sealed_binding=sealed_manifest_binding)
    path = normalized_absolute(candidate.get("path"), "DEPLOY_CONTROL_CANDIDATE_PATH")
    entry = entries.get(str(path))
    if entry is None:
        deny("DEPLOY_CONTROL_CANDIDATE_NOT_DECLARED")
    worktree = _deploy_control_worktree(manifest)
    process_summary = _disposition_reference_checks(path, operational, process_data)
    detail = _authenticate_deploy_control_tree(path, entry,
                                               _deploy_control_inode_counts())
    usage = physical_usage([path])[str(path)]
    if usage["allocatedBytes"] != entry["physicalBytes"]:
        deny("DEPLOY_CONTROL_PHYSICAL_BYTES_DIVERGED")
    return {"class": candidate["class"], "path": str(path),
            "dispositionId": manifest["dispositionId"],
            "dispositionManifest": manifest_binding, "entry": entry,
            "identity": stat_identity(path.lstat(), include_nlink=True),
            "detail": detail, "worktree": worktree, "processScan": process_summary}


def validate_candidate(candidate: Any, policy: dict[str, Any], operational: dict[str, Any],
                       process_data: ProcessScan, *,
                       sealed_manifest_binding: dict[str, Any] | None = None,
                       ) -> dict[str, Any]:
    if not isinstance(candidate, dict) or candidate.get("class") not in CLASSES:
        deny("CANDIDATE_CLASS")
    if candidate["class"] == "NPM_CACHE_MAINTENANCE":
        return authenticate_npm(candidate, process_data, operational)
    if candidate["class"] == "DERIVED_OUTPUT_RUNTIME":
        return authenticate_output(candidate, policy, operational, process_data)
    if candidate["class"] == "CLOSED_PREPARATION_DERIVED_ARCHIVE":
        return authenticate_preparation_archive(candidate, operational, process_data)
    if candidate["class"] == "CLOSED_DEPLOY_CONTROL_DERIVED_TREE":
        return authenticate_deploy_control(
            candidate, operational, process_data,
            sealed_manifest_binding=sealed_manifest_binding)
    return authenticate_manifest_disposition(
        candidate, operational, process_data,
        sealed_manifest_binding=sealed_manifest_binding)


def removal_command(observation: dict[str, Any]) -> list[str]:
    effects = observation.get("detail", {}).get("effects")
    if observation.get("class") in {
            "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
            "CLOSED_DEPLOY_CONTROL_DERIVED_TREE"}:
        if not isinstance(effects, list) or not effects:
            deny("DISPOSITION_EFFECTS_SCHEMA")
        if len(effects) != 1:
            deny("DISPOSITION_COMPOUND_EFFECT")
        return effects[0]
    if observation.get("class") == "CLOSED_PREPARATION_DERIVED_ARCHIVE":
        return [*LITERAL_UNLINK, observation["path"]]
    return [*LITERAL_RM, observation["path"]]


def removal_commands(observations: Iterable[dict[str, Any]]) -> list[list[str]]:
    commands: list[list[str]] = []
    for observation in observations:
        if observation.get("class") in {
                "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                "CLOSED_DEPLOY_CONTROL_DERIVED_TREE"}:
            effects = observation.get("detail", {}).get("effects")
            if not isinstance(effects, list) or not effects:
                deny("DISPOSITION_EFFECTS_SCHEMA")
            commands.extend(effects)
        else:
            commands.append(removal_command(observation))
    return commands


def validate_audit_request(value: dict[str, Any]) -> None:
    version = value.get("schemaVersion")
    expected = (AUDIT_REQUEST_KEYS if version == 1 else
                AUDIT_REQUEST_V2_KEYS if version == 2 else AUDIT_REQUEST_V3_KEYS)
    if (version not in {1, 2, 3} or set(value) != expected or
            value.get("kind") != "CAPACITY_RECOVERY_AUDIT_REQUEST"):
        deny("AUDIT_REQUEST_SCHEMA")
    for key in ("minimumRecoveryBytes", "targetAvailableBytes"):
        if not isinstance(value.get(key), int) or value[key] <= 0:
            deny(f"AUDIT_REQUEST_{key}")
    if not isinstance(value.get("candidates"), list) or not value["candidates"]:
        deny("AUDIT_REQUEST_CANDIDATES")
    if version in {2, 3}:
        _validate_proc_observer_binding(value["procObserver"])
    if version == 3 and value.get("incrementalBatch") is not True:
        deny("AUDIT_REQUEST_INCREMENTAL_BATCH")
    dispositions = [item for item in value["candidates"] if isinstance(item, dict) and
                    item.get("class") == "CLOSED_PREPARATION_MANIFEST_DISPOSITION"]
    if dispositions:
        if len(dispositions) != len(value["candidates"]):
            deny("DISPOSITION_MIXED_BATCH")
        manifest, entries = _disposition_manifest(dispositions[0].get("dispositionManifest"))
        del manifest
        requested = [item.get("path") for item in dispositions]
        if (len(requested) != len(entries) or len(set(requested)) != len(entries) or
                set(requested) != set(entries) or
                any(item.get("dispositionManifest") != dispositions[0].get("dispositionManifest")
                    for item in dispositions)):
            deny("DISPOSITION_EXACT_BATCH")
    deploy_control = [item for item in value["candidates"] if isinstance(item, dict) and
                      item.get("class") == "CLOSED_DEPLOY_CONTROL_DERIVED_TREE"]
    if deploy_control:
        if len(deploy_control) != len(value["candidates"]):
            deny("DEPLOY_CONTROL_MIXED_BATCH")
        _manifest, entries = _deploy_control_manifest(
            deploy_control[0].get("dispositionManifest"))
        requested = [item.get("path") for item in deploy_control]
        if (len(requested) != len(entries) or len(set(requested)) != len(entries) or
                set(requested) != set(entries) or
                any(item.get("dispositionManifest") !=
                    deploy_control[0].get("dispositionManifest")
                    for item in deploy_control)):
            deny("DEPLOY_CONTROL_EXACT_BATCH")


def audit_request(request: Path, request_sha: str, plan_output: Path) -> dict[str, Any]:
    raw, _ = stable_regular(request, request_sha)
    value = object_json(raw, "AUDIT_REQUEST_JSON")
    validate_audit_request(value)
    policy, policy_path, policy_sha = root_policy(value["rootPolicy"])
    op_path, op_sha, op_raw, _ = load_binding(value["operationalState"], "OPERATIONAL_STATE")
    operational = validate_operational(op_raw)
    telemetry("before_live_recapture")
    operational, live_recapture = capture_live_operational(operational)
    telemetry("after_live_recapture")
    candidate_paths = [str(normalized_absolute(item.get("path"), "CANDIDATE_PATH"))
                       for item in value["candidates"] if isinstance(item, dict)]
    if len(candidate_paths) != len(value["candidates"]):
        deny("CANDIDATE_SCHEMA")
    telemetry("before_process_recapture")
    if value["schemaVersion"] in {2, 3}:
        process_data, process_evidence = _privileged_proc_targets(
            value["procObserver"], candidate_paths, "audit")
    else:
        process_data, process_evidence = _proc_targets(), {"mechanism": "unprivileged-legacy"}
    telemetry("after_process_recapture")
    observations: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for ordinal, candidate in enumerate(value["candidates"], 1):
        try:
            observed = validate_candidate(candidate, policy, operational, process_data)
            if observed["path"] in seen_paths:
                deny("CANDIDATE_DUPLICATE")
            seen_paths.add(observed["path"])
            observations.append({"ordinal": ordinal, "source": candidate, "observation": observed})
        except Denied as exc:
            error: dict[str, Any] = {"ordinal": ordinal, "predicate": str(exc)}
            if str(exc) == "PROCESS_REFERENCE_SCAN_INCOMPLETE":
                error["processScan"] = process_data[3]
            errors.append(error)
    qualified_paths = [Path(item["observation"]["path"]) for item in observations]
    usage = physical_usage(qualified_paths) if qualified_paths else {}
    total = 0
    inodes = 0
    for item in observations:
        measured = usage[item["observation"]["path"]]
        item["observation"]["physical"] = measured
        total += measured["allocatedBytes"]
        inodes += measured["inodes"]
    filesystem = os.statvfs(policy["canonicalRoots"]["outputs"]["path"])
    available_before = filesystem.f_bavail * filesystem.f_frsize
    projected = available_before + total
    if total < value["minimumRecoveryBytes"]:
        errors.append({"ordinal": 0, "predicate": "MINIMUM_RECOVERY_NOT_MET"})
    incremental = value.get("incrementalBatch") is True
    if projected < value["targetAvailableBytes"] and not incremental:
        errors.append({"ordinal": 0, "predicate": "TARGET_AVAILABLE_NOT_MET"})
    state = "P00_CAPACITY_RECOVERY_AUDIT_PASS" if not errors else "P00_CAPACITY_RECOVERY_AUDIT_DENY"
    plan = {
        "schemaVersion": value["schemaVersion"], "kind": "CAPACITY_RECOVERY_PLAN", "state": state,
        "requestSha256": request_sha, "minimumRecoveryBytes": value["minimumRecoveryBytes"],
        "targetAvailableBytes": value["targetAvailableBytes"], "qualifiedBytes": total,
        "qualifiedInodes": inodes, "availableBytesBefore": available_before,
        "projectedAvailableBytes": projected, "minimumRecoverySatisfied": total >= value["minimumRecoveryBytes"],
        "targetAvailableSatisfied": projected >= value["targetAvailableBytes"],
        "classificationPolicy": {
            "sourcesOfTruth": "EVIDENCE_PRESERVE",
            "derivedCandidates": sorted(CLASSES),
            "unclassified": "NOT_QUALIFIED",
        },
        "rootPolicy": {"path": str(policy_path), "sha256": policy_sha},
        "operationalState": {"path": str(op_path), "sha256": op_sha},
        "liveRecapture": live_recapture,
        "deploymentLock": operational["deploymentLock"], "writerLock": operational["writerLock"],
        "candidates": observations, "errors": errors,
        "commands": removal_commands(item["observation"] for item in observations),
        "automaticExecutionPermitted": False,
    }
    if value["schemaVersion"] in {2, 3}:
        plan["procObserver"] = value["procObserver"]
        plan["processObservation"] = process_evidence
    if value["schemaVersion"] == 3:
        plan["incrementalBatch"] = True
    telemetry("before_plan_write")
    write_exclusive(plan_output, canonical(plan))
    telemetry("after_plan_write")
    return plan


def candidate_binding(observation: dict[str, Any]) -> dict[str, Any]:
    """Compare artifact state, while retaining fresh process telemetry as evidence.

    validate_candidate must authenticate every new scan before this projection:
    completeness, live references and active writers are never waived here.
    Only processScan counters/details are observational rather than artifact state.
    """
    return {key: value for key, value in observation.items() if key != "processScan"}


def candidate_bindings(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [candidate_binding(item) for item in observations]


def revalidate_plan(plan: dict[str, Any], *, plan_path: Path | None = None,
                    check_locks: bool = True, phase: str = "prepare",
                    include_process_evidence: bool = False) -> Any:
    required = {"schemaVersion", "kind", "state", "requestSha256", "minimumRecoveryBytes",
                "targetAvailableBytes", "qualifiedBytes", "qualifiedInodes", "availableBytesBefore",
                "projectedAvailableBytes", "minimumRecoverySatisfied", "targetAvailableSatisfied",
                "classificationPolicy", "rootPolicy",
                "operationalState", "liveRecapture", "deploymentLock", "writerLock", "candidates", "errors",
                "commands", "automaticExecutionPermitted"}
    version = plan.get("schemaVersion")
    if version in {2, 3}:
        required |= {"procObserver", "processObservation"}
    if version == 3:
        required |= {"incrementalBatch"}
    if set(plan) != required or version not in {1, 2, 3} or plan.get("kind") != "CAPACITY_RECOVERY_PLAN" or plan.get("state") != "P00_CAPACITY_RECOVERY_AUDIT_PASS" or plan.get("errors") != [] or plan.get("automaticExecutionPermitted") is not False or (version == 3 and plan.get("incrementalBatch") is not True):
        deny("PLAN_SCHEMA_OR_STATE")
    policy, _, _ = root_policy(plan["rootPolicy"])
    _, _, op_raw, _ = load_binding(plan["operationalState"], "OPERATIONAL_STATE")
    operational = validate_operational(op_raw)
    live_recapture: dict[str, Any] = {}
    errors: list[str] = []
    refreshed: list[dict[str, Any]] = []
    priors: list[dict[str, Any]] = []
    telemetry("before_live_recapture")
    try:
        operational, live_recapture = capture_live_operational(operational)
    except Denied as exc:
        errors.append(str(exc))
    telemetry("after_live_recapture")
    candidate_paths = [item.get("observation", {}).get("path") for item in plan.get("candidates", [])]
    if not candidate_paths or any(not isinstance(item, str) for item in candidate_paths):
        deny("PLAN_CANDIDATE_PATHS")
    if version in {2, 3}:
        telemetry("before_process_recapture")
        process_data, process_evidence = _privileged_proc_targets(
            plan["procObserver"], candidate_paths, phase)
        telemetry("after_process_recapture")
    else:
        telemetry("before_process_recapture")
        process_data, process_evidence = _proc_targets(), {"mechanism": "unprivileged-legacy"}
        telemetry("after_process_recapture")
    for item in plan.get("candidates", []):
        try:
            source = item["source"]
            prior = item["observation"]
            sealed_manifest_binding = (prior.get("dispositionManifest")
                                       if source.get("class") in {
                                           "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                                           "CLOSED_DEPLOY_CONTROL_DERIVED_TREE"}
                                       else None)
            if sealed_manifest_binding is not None:
                if plan_path is None:
                    deny("DISPOSITION_MANIFEST_FIXED_BINDING")
                if source.get("class") == "CLOSED_DEPLOY_CONTROL_DERIVED_TREE":
                    manifest_specs = ((DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH,
                                       DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256),)
                    fixed_predicate = "DEPLOY_CONTROL_MANIFEST_FIXED_BINDING"
                else:
                    manifest_specs = (
                        (DISPOSITION_MANIFEST_PATH, DISPOSITION_MANIFEST_SHA256),
                        (WORKER_PACKAGE_AUDIT_MANIFEST_PATH,
                         WORKER_PACKAGE_AUDIT_MANIFEST_SHA256),
                    )
                    fixed_predicate = "DISPOSITION_MANIFEST_FIXED_BINDING"
                manifest_spec = next(
                    ((path, digest) for path, digest in manifest_specs
                     if digest == sealed_manifest_binding.get("sha256")), None)
                if manifest_spec is None:
                    deny(fixed_predicate)
                try:
                    manifest_relative = manifest_spec[0].relative_to(ROOT)
                except ValueError:
                    deny(fixed_predicate)
                expected_manifest_binding = {
                    "path": str(plan_path.parent / "control" / manifest_relative),
                    "sha256": manifest_spec[1],
                }
                if sealed_manifest_binding != expected_manifest_binding:
                    deny(fixed_predicate)
            observed = validate_candidate(
                source, policy, operational, process_data,
                sealed_manifest_binding=sealed_manifest_binding)
            refreshed.append(observed)
            priors.append(prior)
        except (Denied, KeyError, TypeError) as exc:
            errors.append(str(exc))
    comparisons: list[dict[str, Any]] = []
    if refreshed:
        usage = physical_usage(Path(item["path"]) for item in refreshed)
        for observed, prior in zip(refreshed, priors):
            observed["physical"] = usage[observed["path"]]
            current_binding, prior_binding = candidate_binding(observed), candidate_binding(prior)
            changed_fields = sorted(key for key in current_binding.keys() | prior_binding.keys()
                                    if key not in current_binding or key not in prior_binding or
                                    current_binding[key] != prior_binding[key])
            comparisons.append({"path": observed["path"], "changedFields": changed_fields,
                                "previousProcessScan": prior.get("processScan"),
                                "currentProcessScan": observed.get("processScan")})
            if changed_fields:
                errors.append(f"CANDIDATE_CHANGED:{observed['path']}")
    process_evidence["candidateComparisons"] = comparisons
    if check_locks:
        for lock in (Path(plan["deploymentLock"]), Path(plan["writerLock"])):
            try:
                validate_lock_free(lock)
            except Denied as exc:
                errors.append(str(exc))
    expected_commands = removal_commands(refreshed)
    if expected_commands != plan.get("commands"):
        errors.append("PLAN_COMMANDS_DIVERGED")
    base = (refreshed, sorted(set(errors)), live_recapture)
    return (*base, process_evidence) if include_process_evidence else base


def prepare_plan(plan_path: Path, plan_sha: str, intent_output: Path,
                 commands_output: Path, manifest_output: Path) -> dict[str, Any]:
    raw, _ = stable_regular(plan_path, plan_sha)
    plan = object_json(raw, "PLAN_JSON")
    refreshed, errors, live_recapture, process_evidence = revalidate_plan(
        plan, plan_path=plan_path, include_process_evidence=True)
    if errors:
        result = {"state": "CAPACITY_RECOVERY_PREPARE_DENY", "errors": errors,
                  "processObservation": process_evidence}
        print(json.dumps(result, sort_keys=True))
        raise SystemExit(2)
    commands_raw = b"".join((" ".join(command) + "\n").encode() for command in plan["commands"])
    intent = {
        "schemaVersion": plan["schemaVersion"], "kind": "CAPACITY_RECOVERY_INTENT",
        "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "plan": {"path": str(plan_path), "sha256": plan_sha},
        "operationalState": plan["operationalState"], "rootPolicy": plan["rootPolicy"],
        "deploymentLock": plan["deploymentLock"], "writerLock": plan["writerLock"],
        "minimumRecoveryBytes": plan["minimumRecoveryBytes"], "expectedRecoveryBytes": plan["qualifiedBytes"],
        "expectedRecoveryInodes": plan["qualifiedInodes"], "candidates": refreshed,
        "preparedLiveRecapture": live_recapture,
        "commands": plan["commands"], "commandsSha256": digest_bytes(commands_raw),
        "automaticRetry": False, "forceAllowed": False, "pruneAllowed": False, "pathExpansionAllowed": False,
    }
    if plan["schemaVersion"] in {2, 3}:
        intent["procObserver"] = plan["procObserver"]
        intent["preparedProcessObservation"] = process_evidence
    if plan["schemaVersion"] == 3:
        intent["incrementalBatch"] = True
    intent_raw = canonical(intent)
    manifest = {
        "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_SEAL_MANIFEST",
        "planSha256": plan_sha, "intentSha256": digest_bytes(intent_raw),
        "commandsSha256": digest_bytes(commands_raw), "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
    }
    write_exclusive(commands_output, commands_raw)
    write_exclusive(intent_output, intent_raw)
    write_exclusive(manifest_output, canonical(manifest))
    return manifest


def acquire_lock(path: Path) -> int:
    info = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or
            info.st_uid != os.geteuid() or info.st_gid != os.getegid()):
        deny(f"LOCK_IDENTITY:{path}")
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    opened = os.fstat(fd)
    if (info.st_dev, info.st_ino) != (opened.st_dev, opened.st_ino):
        os.close(fd); deny(f"LOCK_CHANGED:{path}")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny(f"LOCK_BUSY:{path}")
    if os.pread(fd, len(FIXED_CURRENT_LOCK_PREFIX), 0).startswith(
            FIXED_CURRENT_LOCK_PREFIX):
        os.close(fd); deny(f"LOCK_BOUND_FIXED_CURRENT:{path}")
    return fd


def append_event(journal: Path, event: dict[str, Any]) -> None:
    fd = os.open(journal, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        os.write(fd, canonical(event)); os.fsync(fd)
    finally:
        os.close(fd)


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_authorization(value: dict[str, Any], intent_sha: str,
                           commands_sha: str, paths: list[str]) -> None:
    required = {"schemaVersion", "kind", "authorization", "intentSha256", "commandsSha256", "paths"}
    if (set(value) != required or value.get("schemaVersion") != 1 or
            value.get("kind") != "CAPACITY_RECOVERY_AUTHORIZATION" or
            value.get("authorization") != "AUTHORIZE_ONCE" or
            value.get("intentSha256") != intent_sha or value.get("commandsSha256") != commands_sha or
            value.get("paths") != paths):
        deny("AUTHORIZATION_DIVERGED")


def execute_intent(intent_path: Path, intent_sha: str, authorization_path: Path,
                   authorization_sha: str, receipt_root: Path) -> dict[str, Any]:
    intent_raw, _ = stable_regular(intent_path, intent_sha)
    intent = object_json(intent_raw, "INTENT_JSON")
    required = {"schemaVersion", "kind", "state", "plan", "operationalState", "rootPolicy",
                "deploymentLock", "writerLock", "minimumRecoveryBytes", "expectedRecoveryBytes",
                "expectedRecoveryInodes", "candidates", "preparedLiveRecapture", "commands", "commandsSha256", "automaticRetry",
                "forceAllowed", "pruneAllowed", "pathExpansionAllowed"}
    version = intent.get("schemaVersion")
    if version in {2, 3}:
        required |= {"procObserver", "preparedProcessObservation"}
    if version == 3:
        required |= {"incrementalBatch"}
    if (set(intent) != required or version not in {1, 2, 3} or
            intent.get("kind") != "CAPACITY_RECOVERY_INTENT" or
            intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            (version == 3 and intent.get("incrementalBatch") is not True) or
            any(intent.get(key) is not False for key in ("automaticRetry", "forceAllowed", "pruneAllowed", "pathExpansionAllowed"))):
        deny("INTENT_SCHEMA_OR_STATE")
    commands_raw = b"".join((" ".join(command) + "\n").encode() for command in intent["commands"])
    if digest_bytes(commands_raw) != intent["commandsSha256"]:
        deny("INTENT_COMMANDS_SHA256")
    paths = [item["path"] for item in intent["candidates"]]
    auth_raw, _ = stable_regular(authorization_path, authorization_sha)
    validate_authorization(object_json(auth_raw, "AUTHORIZATION_JSON"), intent_sha,
                           intent["commandsSha256"], paths)
    if receipt_root.exists() or receipt_root.is_symlink():
        deny("RECEIPT_ROOT_EXISTS")
    parent = receipt_root.parent
    parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            parent_info.st_uid != os.geteuid() or parent_info.st_gid != os.getegid() or
            stat.S_IMODE(parent_info.st_mode) & 0o022):
        deny("RECEIPT_PARENT_IDENTITY")
    os.mkdir(receipt_root, 0o700)
    journal = receipt_root / "command-journal.private.jsonl"
    write_exclusive(journal, b"")
    held: list[int] = []
    attempted = 0; completed = 0; removed: list[str] = []
    failure: str | None = None
    available_before: int | None = None
    available_after: int | None = None
    try:
        for lock_path in (Path(intent["deploymentLock"]), Path(intent["writerLock"])):
            held.append(acquire_lock(lock_path))
        # The plan itself is re-opened and every candidate is recaptured immediately
        # before the first durable ATTEMPT.
        plan_path = Path(intent["plan"]["path"])
        plan_raw, _ = stable_regular(plan_path, intent["plan"]["sha256"])
        plan_value = object_json(plan_raw, "PLAN_JSON")
        if version in {2, 3} and intent["procObserver"] != plan_value.get("procObserver"):
            deny("PROC_OBSERVER_BINDING_DIVERGED")
        refreshed, errors, live_recapture, process_evidence = revalidate_plan(
            plan_value, plan_path=plan_path, check_locks=False, phase="execute",
            include_process_evidence=True)
        candidates_changed = candidate_bindings(refreshed) != candidate_bindings(intent["candidates"])
        pre_attempt = {"event": "RECAPTURE_DENY" if errors or candidates_changed else "RECAPTURE_PASS",
                       "intentSha256": intent_sha,
                       "commandsSha256": intent["commandsSha256"], "candidates": refreshed,
                       "liveOperational": live_recapture,
                       "processObservation": process_evidence, "errors": errors,
                       "intentCandidatesChanged": candidates_changed}
        write_exclusive(receipt_root / "pre-attempt-recapture.private.json", canonical(pre_attempt))
        if errors or candidates_changed:
            primary = next((error for error in errors if error != "PLAN_COMMANDS_DIVERGED"),
                           errors[0] if errors else "CANDIDATE_CHANGED")
            deny("EXECUTE_RECAPTURE_DENY:" + primary)
        policy, _, _ = root_policy(intent["rootPolicy"])
        filesystem = os.statvfs(policy["canonicalRoots"]["outputs"]["path"])
        available_before = filesystem.f_bavail * filesystem.f_frsize
        expected_commands = removal_commands(intent["candidates"])
        if intent["commands"] != expected_commands:
            deny("COMMAND_LITERAL_DIVERGED")
        for ordinal, command in enumerate(intent["commands"], 1):
            path_text = command[-1]
            append_event(journal, {"event": "ATTEMPT", "ordinal": ordinal,
                                   "path": path_text, "argv": command})
            attempted += 1
            stdout = receipt_root / f"command-{ordinal}.stdout.private.txt"
            stderr = receipt_root / f"command-{ordinal}.stderr.private.txt"
            out_fd = os.open(stdout, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                err_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            except Exception:
                os.close(out_fd); raise
            try:
                result = subprocess.run(command, stdout=out_fd, stderr=err_fd, check=False)
                os.fsync(out_fd); os.fsync(err_fd)
            finally:
                os.close(out_fd); os.close(err_fd)
            append_event(journal, {"event": "RESULT", "ordinal": ordinal,
                                   "path": path_text, "exitCode": result.returncode,
                                   "stdoutSha256": sha256(stdout), "stderrSha256": sha256(stderr)})
            if result.returncode != 0:
                deny(f"COMMAND_FAILED:{ordinal}:{result.returncode}")
            path = Path(path_text)
            fsync_directory(path.parent)
            if path.exists() or path.is_symlink():
                deny(f"VERIFICATION_PRESENT:{ordinal}")
            completed += 1; removed.append(path_text)
            append_event(journal, {"event": "VERIFIED", "ordinal": ordinal,
                                   "path": path_text, "result": "ABSENT"})
        filesystem = os.statvfs(policy["canonicalRoots"]["outputs"]["path"])
        available_after = filesystem.f_bavail * filesystem.f_frsize
    except (Denied, OSError) as exc:
        failure = str(exc)
        append_event(journal, {"event": "DENY", "predicate": failure,
                               "attemptedCommands": attempted, "completedCommands": completed})
    if available_before is not None and available_after is None:
        filesystem = os.statvfs(policy["canonicalRoots"]["outputs"]["path"])
        available_after = filesystem.f_bavail * filesystem.f_frsize
    receipt = {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_RECEIPT",
               "state": "COMPLETED" if failure is None else "FAILED",
               "failurePredicate": failure, "intentSha256": intent_sha,
               "authorizationSha256": authorization_sha,
               "commandsSha256": intent["commandsSha256"], "attemptedCommands": attempted,
               "completedCommands": completed, "removedPaths": removed,
               "automaticRetry": False, "forceUsed": False, "pruneUsed": False,
               "pathExpansion": False, "journalSha256": sha256(journal)}
    receipt.update({
        "expectedRecoveryBytes": intent["expectedRecoveryBytes"],
        "availableBytesBefore": available_before,
        "availableBytesAfter": available_after,
        "recoveredBytes": (available_after - available_before
                           if available_before is not None and available_after is not None else None),
    })
    receipt_path = receipt_root / "execution-receipt.private.json"
    write_exclusive(receipt_path, canonical(receipt))
    write_exclusive(receipt_root / "execution-receipt.sha256",
                    f"{sha256(receipt_path)}  {receipt_path}\n".encode())
    fsync_directory(receipt_root)
    for fd in reversed(held):
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)
    if failure is not None:
        raise SystemExit(1)
    return receipt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    actions = parser.add_subparsers(dest="action", required=True)
    audit = actions.add_parser("audit")
    audit.add_argument("--request", type=Path, required=True)
    audit.add_argument("--request-sha256", required=True)
    audit.add_argument("--plan-output", type=Path, required=True)
    audit.add_argument("--telemetry-output", type=Path, required=True)
    prepare = actions.add_parser("prepare")
    prepare.add_argument("--plan", type=Path, required=True)
    prepare.add_argument("--plan-sha256", required=True)
    prepare.add_argument("--intent-output", type=Path, required=True)
    prepare.add_argument("--commands-output", type=Path, required=True)
    prepare.add_argument("--manifest-output", type=Path, required=True)
    prepare.add_argument("--telemetry-output", type=Path, required=True)
    execute = actions.add_parser("execute")
    execute.add_argument("--intent", type=Path, required=True)
    execute.add_argument("--intent-sha256", required=True)
    execute.add_argument("--authorization", type=Path, required=True)
    execute.add_argument("--authorization-sha256", required=True)
    execute.add_argument("--receipt-root", type=Path, required=True)
    execute.add_argument("--telemetry-output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    global _TELEMETRY
    os.umask(0o077)
    args = parse_args()
    telemetry_path = getattr(args, "telemetry_output", None)
    try:
        if telemetry_path is not None:
            _TELEMETRY = Telemetry(telemetry_path)
        if args.action == "audit":
            result = audit_request(args.request, args.request_sha256, args.plan_output)
        elif args.action == "prepare":
            result = prepare_plan(args.plan, args.plan_sha256, args.intent_output,
                                  args.commands_output, args.manifest_output)
        else:
            result = execute_intent(args.intent, args.intent_sha256, args.authorization,
                                    args.authorization_sha256, args.receipt_root)
        print(json.dumps(result, sort_keys=True))
        if (args.action == "audit" and
                result.get("state") == "P00_CAPACITY_RECOVERY_AUDIT_DENY"):
            raise SystemExit(2)
    except Denied as exc:
        print(json.dumps({"state": "CAPACITY_RECOVERY_DENY", "predicate": str(exc)}, sort_keys=True))
        raise SystemExit(2)
    finally:
        if _TELEMETRY is not None:
            _TELEMETRY.emit("process_terminating")
            _TELEMETRY.close()
            _TELEMETRY = None


if __name__ == "__main__":
    main()
