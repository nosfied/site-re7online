#!/usr/bin/python3
"""Closed installer for the a838bd33 external-builder /proc observer."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
from typing import Any


INSTALLER = Path(__file__).resolve()
SOURCE = INSTALLER.with_name("capacity-proc-observer-builder-a838bd33.py")
SOURCE_SHA256 = "30af1520bfcf1726674a57193b0f8c4b5178fc7be7aec5f0e97b982abd57630b"
TARGET_BASE = Path("/usr/local")
TARGET = TARGET_BASE / "libexec/re7online/capacity-proc-observer.py"
ROOT_UID = 0
ROOT_GID = 0


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable(path: Path, expected: str | None, modes: set[int]) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
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
    projection = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_uid,
                               item.st_gid, item.st_size, item.st_mtime_ns,
                               item.st_ctime_ns, item.st_nlink)
    raw = b"".join(blocks)
    if (len({projection(item) for item in (before, opened, after, current)}) != 1 or
            stat.S_IMODE(current.st_mode) not in modes or current.st_nlink != 1 or
            (expected is not None and digest(raw) != expected)):
        raise RuntimeError("IDENTITY:" + str(path))
    return raw, current


def directory(path: Path) -> os.stat_result:
    info = path.lstat()
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or
            (info.st_uid, info.st_gid) != (ROOT_UID, ROOT_GID) or
            stat.S_IMODE(info.st_mode) & 0o022):
        raise RuntimeError("DIRECTORY_IDENTITY:" + str(path))
    return info


def sync_directory_entry(parent: Path, child: Path, expected: os.stat_result) -> None:
    child_fd = os.open(child, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(child_fd)
        if (opened.st_dev, opened.st_ino) != (expected.st_dev, expected.st_ino):
            raise RuntimeError("DIRECTORY_CHANGED:" + str(child))
        os.fsync(child_fd)
    finally:
        os.close(child_fd)
    parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)


def ensure_target_parent() -> list[str]:
    directory(TARGET_BASE)
    created: list[str] = []
    current = TARGET_BASE
    for name in ("libexec", "re7online"):
        current /= name
        try:
            directory(current)
        except FileNotFoundError:
            os.mkdir(current, 0o755)
            os.chown(current, ROOT_UID, ROOT_GID)
            os.chmod(current, 0o755)
            current_info = directory(current)
            created.append(str(current))
        else:
            current_info = directory(current)
        sync_directory_entry(current.parent, current, current_info)
    if current != TARGET.parent:
        raise RuntimeError("TARGET_PARENT")
    return created


def target_projection(raw: bytes, info: os.stat_result) -> dict[str, Any]:
    return {"path": str(TARGET), "sha256": digest(raw), "device": info.st_dev,
            "inode": info.st_ino, "uid": info.st_uid, "gid": info.st_gid,
            "mode": f"{stat.S_IMODE(info.st_mode):04o}"}


def install() -> dict[str, Any]:
    if (os.geteuid(), os.getegid()) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("ROOT_REQUIRED")
    installer_raw, _ = stable(INSTALLER, None, {0o600})
    source_raw, _ = stable(SOURCE, SOURCE_SHA256, {0o600})
    created = ensure_target_parent()
    try:
        current_raw, current = stable(TARGET, SOURCE_SHA256, {0o500})
    except FileNotFoundError:
        fd = os.open(TARGET, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                     os.O_CLOEXEC, 0o500)
        try:
            view = memoryview(source_raw)
            while view:
                view = view[os.write(fd, view):]
            os.fchmod(fd, 0o500)
            os.fchown(fd, ROOT_UID, ROOT_GID)
            os.fsync(fd)
        finally:
            os.close(fd)
        parent = os.open(TARGET.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        current_raw, current = stable(TARGET, SOURCE_SHA256, {0o500})
        state = "INSTALLED"
    else:
        state = "RECOVERED"
    if (current.st_uid, current.st_gid) != (ROOT_UID, ROOT_GID):
        raise RuntimeError("TARGET_IDENTITY")
    return {"schemaVersion": 1, "kind": "A838BD33_BUILDER_OBSERVER_INSTALLATION",
            "state": state, "installerSha256": digest(installer_raw),
            "helper": target_projection(current_raw, current),
            "createdDirectories": created, "sudoersChanged": False}


def main() -> None:
    os.write(1, canonical(install()))


if __name__ == "__main__":
    main()
