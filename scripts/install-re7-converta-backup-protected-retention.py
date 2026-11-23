#!/usr/bin/python3
"""Closed installer for protected retention v1 plus read-state backup v2.

This installer is intentionally not invoked by CI or by the backup job.  A future
administrative authorization must authenticate this file and run it once as root.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess


SOURCE_DIR = Path(__file__).resolve().parent
BACKUP_SOURCE = SOURCE_DIR / "re7-converta-backup"
OBSERVER_SOURCE = SOURCE_DIR / "backup-retention-protected-observer.py"
SUDOERS_SOURCE = SOURCE_DIR.parent / "config/sudoers/re7online-backup-retention-protected-observer"
READ_STATE_CONTRACT_SOURCE = SOURCE_DIR.parent / "config/backup-read-state.v2.json"
READ_STATE_RESTORE_SOURCE = SOURCE_DIR / "read-state-backup-restore-isolated.py"
BACKUP_TARGET = Path("/usr/local/sbin/re7-converta-backup")
OBSERVER_TARGET = Path("/usr/local/libexec/re7online/backup-retention-protected-observer.py")
SUDOERS_TARGET = Path("/etc/sudoers.d/re7online-backup-retention-protected-observer")
CONTRACT_TARGET = Path("/etc/re7online/backup-retention-protected.v1.json")
READ_STATE_CONTRACT_TARGET = Path("/etc/re7online/backup-read-state.v2.json")
READ_STATE_RESTORE_TARGET = Path("/usr/local/libexec/re7online/read-state-backup-restore-isolated.py")
PREDECESSOR_BACKUP_SHA256 = "c796bc3e5379ade7e61e024eac33ec749e2956f85b94c35bdf92641cf1d134a4"
BACKUP_SOURCE_SHA256 = "632c0a5ce20700d5ab9be9a9e1da2826ecf735d5dca28629c1629c5e31cf8255"
OBSERVER_SOURCE_SHA256 = "08ef7300267bc8c3049b01f662fecc830f2ac372f1fd35638e449f6401bce79c"
SUDOERS_SOURCE_SHA256 = "55a5306c4ab3955d8787776c5652f4157c14fe15535230b12e0af8c4eb085bb0"
READ_STATE_CONTRACT_SOURCE_SHA256 = "261d5cf2e0358f5e48f2aea0643e0220292c314f6b8aa7f82ab8d839690d7d81"
READ_STATE_RESTORE_SOURCE_SHA256 = "40cedd778e45b60c0b2d3472dfb137272478ac6ddc3af1916177a0516552c3d6"


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


CONTRACT_RAW = canonical({
    "schemaVersion": 1,
    "kind": "CONVERTA_BACKUP_RETENTION_PROTECTION",
    "authorityVersion": "OWNER_CONVERTA_P1_20261121_V1",
    "decision": "RETAIN_REQUIRED",
    "reason": "UNIQUE_TRAINING_CONTENT_ONLY_COPY",
    "administrativeAuthority": "Owner CONVERTA — RETAIN_REQUIRED 20261121",
    "snapshot": {
        "snapshotId": "20260812T011558Z",
        "path": "/opt/re7online/backups/converta-persistent/snapshots/20260812T011558Z",
        "device": 64769,
        "inode": 788249,
        "uid": 0,
        "gid": 0,
        "mode": "0750",
        "nlink": 4,
        "manifestSha256": "71601150d1a7441787c4f6ff4b408087482f075195d1198ea66aaf367d272bf7",
        "checksumsSha256": "5f9d1e7157e764500f0a5a30f006285114c6485a7915bfe460048796d18da20e",
        "integrity": "SHA256SUMS_PASS",
        "pgRestoreList": "PASS_503_OBJECTS",
    },
})


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_regular(path: Path, expected: str | None, modes: set[int]) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd); blocks = []
        while block := os.read(fd, 1024 * 1024):
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_uid,
                             item.st_gid, item.st_size, item.st_mtime_ns,
                             item.st_ctime_ns, item.st_nlink)
    raw = b"".join(blocks)
    if (len({identity(item) for item in (before, opened, after, current)}) != 1 or
            stat.S_IMODE(opened.st_mode) not in modes or
            (expected is not None and digest(raw) != expected)):
        raise RuntimeError("IDENTITY:" + str(path))
    return raw, opened


def authenticate_parent(path: Path) -> None:
    info = path.lstat()
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or
            info.st_gid != 0 or stat.S_IMODE(info.st_mode) not in {0o755, 0o750, 0o700}):
        raise RuntimeError("PARENT_IDENTITY:" + str(path))


def install_file(target: Path, raw: bytes, mode: int, allowed_previous: set[str],
                 *, uid: int = 0, gid: int = 0) -> dict[str, object]:
    target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    authenticate_parent(target.parent)
    if target.exists() or target.is_symlink():
        current_raw, current = read_regular(target, None, {mode})
        current_sha = digest(current_raw)
        if current_sha == digest(raw) and (current.st_uid, current.st_gid) == (uid, gid):
            return {"state": "ALREADY_INSTALLED", "path": str(target), "sha256": current_sha,
                    "device": current.st_dev, "inode": current.st_ino, "mode": f"0{mode:03o}"}
        if current_sha not in allowed_previous or (current.st_uid, current.st_gid) != (uid, gid):
            raise RuntimeError("PREDECESSOR_NOT_ALLOWED:" + str(target))
    temporary = target.parent / ("." + target.name + ".installing")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    try:
        view = memoryview(raw)
        while view:
            view = view[os.write(fd, view):]
        os.fchmod(fd, mode); os.fchown(fd, uid, gid); os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, target)
    parent_fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    installed_raw, installed = read_regular(target, digest(raw), {mode})
    if (installed.st_uid, installed.st_gid) != (uid, gid):
        raise RuntimeError("INSTALLED_IDENTITY:" + str(target))
    return {"state": "INSTALLED", "path": str(target), "sha256": digest(installed_raw),
            "device": installed.st_dev, "inode": installed.st_ino, "mode": f"0{mode:03o}"}


def install() -> dict[str, object]:
    if (os.geteuid(), os.getegid()) != (0, 0):
        raise RuntimeError("ROOT_REQUIRED")
    backup_raw, _ = read_regular(BACKUP_SOURCE, BACKUP_SOURCE_SHA256, {0o755})
    observer_raw, _ = read_regular(OBSERVER_SOURCE, OBSERVER_SOURCE_SHA256, {0o755})
    sudoers_raw, _ = read_regular(SUDOERS_SOURCE, SUDOERS_SOURCE_SHA256, {0o644})
    read_state_contract_raw, _ = read_regular(READ_STATE_CONTRACT_SOURCE, READ_STATE_CONTRACT_SOURCE_SHA256, {0o644})
    read_state_restore_raw, _ = read_regular(READ_STATE_RESTORE_SOURCE, READ_STATE_RESTORE_SOURCE_SHA256, {0o755})
    check = subprocess.run(["/usr/sbin/visudo", "-cf", str(SUDOERS_SOURCE)],
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, check=False)
    if check.returncode != 0:
        raise RuntimeError("SUDOERS_INVALID")
    # Install authorities before the job, and expose sudo last.  Every step is
    # idempotently authenticated so interruption can be reconciled without overwrite.
    contract = install_file(CONTRACT_TARGET, CONTRACT_RAW, 0o600, set())
    observer = install_file(OBSERVER_TARGET, observer_raw, 0o500, set())
    sudoers = install_file(SUDOERS_TARGET, sudoers_raw, 0o440, set())
    read_state_contract = install_file(READ_STATE_CONTRACT_TARGET, read_state_contract_raw, 0o600, set())
    read_state_restore = install_file(READ_STATE_RESTORE_TARGET, read_state_restore_raw, 0o500, set())
    backup = install_file(BACKUP_TARGET, backup_raw, 0o750,
                          {PREDECESSOR_BACKUP_SHA256}, uid=0, gid=1000)
    return {"schemaVersion": 2, "kind": "CONVERTA_BACKUP_PROTECTED_RETENTION_AND_READ_STATE_INSTALLATION",
            "contractSha256": digest(CONTRACT_RAW), "contract": contract,
            "observer": observer, "sudoers": sudoers, "readStateContract": read_state_contract,
            "readStateRestore": read_state_restore, "backup": backup}


if __name__ == "__main__":
    print(canonical(install()).decode(), end="")
