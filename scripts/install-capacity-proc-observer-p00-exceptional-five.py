#!/usr/bin/python3
"""Atomic closed installer for the P00 exceptional-five process observer."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
from typing import Any


SOURCE = Path(__file__).resolve().with_name("capacity-proc-observer.py")
SOURCE_SHA256 = "aedc012bda4cda9aeccaff709465b1783cd57e15fc1d8066346cd785d4b5e57a"
TARGET = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
TEMPORARY = TARGET.with_name(".capacity-proc-observer.py.p00-five.installing")
SUDOERS = Path("/etc/sudoers.d/re7online-capacity-proc-observer")
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
PREDECESSOR = {
    "path": str(TARGET), "sha256": "7522ceb4e8ab0594b6b5b57a2b74ea8fe38251d34d726c4ae0ef040da225718a",
    "device": 64769, "inode": 786634, "uid": 0, "gid": 0, "mode": "0500",
}
ROOT_UID = 0
ROOT_GID = 0


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable(path: Path, expected: str | None, modes: set[int],
           links: set[int] = {1}) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd); blocks: list[bytes] = []
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
            stat.S_IMODE(current.st_mode) not in modes or current.st_nlink not in links or
            (expected is not None and digest(raw) != expected)):
        raise RuntimeError("IDENTITY:" + str(path))
    return raw, current


def sync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def projection(raw: bytes, info: os.stat_result) -> dict[str, Any]:
    return {"path": str(TARGET), "sha256": digest(raw), "device": info.st_dev,
            "inode": info.st_ino, "uid": info.st_uid, "gid": info.st_gid,
            "mode": f"{stat.S_IMODE(info.st_mode):04o}"}


def target_parent() -> None:
    info = TARGET.parent.lstat()
    if (TARGET.parent.is_symlink() or not stat.S_ISDIR(info.st_mode) or
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
            (ROOT_UID, ROOT_GID, 0o755)):
        raise RuntimeError("TARGET_PARENT_IDENTITY")


def remove_interrupted_temporary() -> None:
    _raw, info = stable(TEMPORARY, None, {0o500})
    if (info.st_uid, info.st_gid) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("TEMPORARY_IDENTITY")
    os.unlink(TEMPORARY)
    sync_directory(TARGET.parent)


def publish(source_raw: bytes, predecessor: os.stat_result) -> os.stat_result:
    try:
        temporary_raw, temporary = stable(TEMPORARY, SOURCE_SHA256, {0o500})
    except FileNotFoundError:
        temporary_raw = b""; temporary = None
    except RuntimeError:
        remove_interrupted_temporary()
        temporary_raw = b""; temporary = None
    if temporary is None:
        fd = os.open(TEMPORARY, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                     os.O_CLOEXEC, 0o500)
        try:
            view = memoryview(source_raw)
            while view:
                view = view[os.write(fd, view):]
            os.fchmod(fd, 0o500); os.fchown(fd, ROOT_UID, ROOT_GID); os.fsync(fd)
        finally:
            os.close(fd)
        temporary_raw, temporary = stable(TEMPORARY, SOURCE_SHA256, {0o500})
    else:
        fd = os.open(TEMPORARY, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            if (opened.st_dev, opened.st_ino) != (temporary.st_dev, temporary.st_ino):
                raise RuntimeError("TEMPORARY_CHANGED")
            os.fsync(fd)
        finally:
            os.close(fd)
    if temporary_raw != source_raw or (temporary.st_uid, temporary.st_gid) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("TEMPORARY_CONTENT")
    current = TARGET.lstat()
    if ((current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns,
         current.st_ctime_ns) != (predecessor.st_dev, predecessor.st_ino,
                                  predecessor.st_size, predecessor.st_mtime_ns,
                                  predecessor.st_ctime_ns)):
        raise RuntimeError("TARGET_CHANGED")
    os.replace(TEMPORARY, TARGET)
    sync_directory(TARGET.parent)
    _raw, installed = stable(TARGET, SOURCE_SHA256, {0o500})
    return installed


def install() -> dict[str, Any]:
    if (os.geteuid(), os.getegid()) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("ROOT_REQUIRED")
    source_raw, source = stable(SOURCE, SOURCE_SHA256, {0o600})
    if (source.st_uid, source.st_gid) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("SOURCE_IDENTITY")
    sudoers_raw, sudoers = stable(SUDOERS, SUDOERS_SHA256, {0o440})
    del sudoers_raw
    if (sudoers.st_uid, sudoers.st_gid) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("SUDOERS_IDENTITY")
    target_parent()
    current_raw, current = stable(TARGET, None, {0o500})
    current_projection = projection(current_raw, current)
    if current_projection.get("sha256") == SOURCE_SHA256:
        if (current.st_uid, current.st_gid) != (ROOT_UID, ROOT_GID):
            raise RuntimeError("TARGET_IDENTITY")
        installed = current; state = "RECOVERED_ALREADY_INSTALLED"
    else:
        if current_projection != PREDECESSOR:
            raise RuntimeError("PREVIOUS_HELPER_NOT_ALLOWED")
        installed = publish(source_raw, current); state = "INSTALLED"
    result = {"schemaVersion": 1, "kind": "P00_EXCEPTIONAL_FIVE_OBSERVER_INSTALLATION",
              "state": state, "helper": projection(source_raw, installed),
              "previous": current_projection, "sudoersSha256": SUDOERS_SHA256,
              "sudoersChanged": False}
    return result


if __name__ == "__main__":
    os.write(1, canonical(install()))
