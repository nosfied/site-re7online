#!/usr/bin/python3
"""Closed successor installer for the worker-package capacity observer."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat


SOURCE = Path(__file__).resolve().with_name(
    "capacity-proc-observer-worker-package.py")
SOURCE_SHA256 = "a7f1a0680d19561086923b77162ab3710fbd2c890ccf823aa517d42ccea9a1c2"
TARGET = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
SUDOERS = Path("/etc/sudoers.d/re7online-capacity-proc-observer")
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
ROOT_UID = ROOT_GID = 0
SOURCE_UID = SOURCE_GID = 1000
PREDECESSOR = {
    "path": str(TARGET),
    "sha256": "1d808c3955d5d7db4902200b8669e02ec4ae7718e65bd62cd6b20b697c5e306e",
    "device": 64769,
    "inode": 786791,
    "uid": ROOT_UID,
    "gid": ROOT_GID,
    "mode": "0500",
}


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_regular(path: Path, expected_sha256: str | None,
                   allowed_modes: set[int], *, uid: int = ROOT_UID,
                   gid: int = ROOT_GID) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        blocks = []
        while block := os.read(fd, 1024 * 1024):
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    identity = lambda value: (
        value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid,
        value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_nlink)
    raw = b"".join(blocks)
    if (len({identity(item) for item in (before, opened, after, current)}) != 1 or
            stat.S_IMODE(opened.st_mode) not in allowed_modes or
            (opened.st_uid, opened.st_gid, opened.st_nlink) != (uid, gid, 1) or
            (expected_sha256 is not None and digest(raw) != expected_sha256)):
        raise RuntimeError("IDENTITY:" + str(path))
    return raw, opened


def observed(path: Path, raw: bytes, info: os.stat_result) -> dict[str, object]:
    return {"path": str(path), "sha256": digest(raw),
            "device": info.st_dev, "inode": info.st_ino,
            "uid": info.st_uid, "gid": info.st_gid,
            "mode": f"{stat.S_IMODE(info.st_mode):04o}"}


def install() -> dict[str, object]:
    if os.geteuid() != ROOT_UID or os.getegid() != ROOT_GID:
        raise RuntimeError("ROOT_REQUIRED")
    source_raw, _source_info = stable_regular(
        SOURCE, SOURCE_SHA256, {0o600}, uid=SOURCE_UID, gid=SOURCE_GID)
    sudoers_before, sudoers_info = stable_regular(
        SUDOERS, SUDOERS_SHA256, {0o440}, uid=ROOT_UID, gid=ROOT_GID)
    previous_raw, previous_info = stable_regular(
        TARGET, None, {0o500}, uid=ROOT_UID, gid=ROOT_GID)
    previous = observed(TARGET, previous_raw, previous_info)
    successor_present = previous["sha256"] == SOURCE_SHA256
    if not successor_present and previous != PREDECESSOR:
        raise RuntimeError("PREVIOUS_HELPER_NOT_ALLOWED")
    parent = TARGET.parent
    parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            (parent_info.st_uid, parent_info.st_gid,
             stat.S_IMODE(parent_info.st_mode)) != (ROOT_UID, ROOT_GID, 0o755)):
        raise RuntimeError("TARGET_PARENT_IDENTITY")
    state = "RECOVERED_ALREADY_INSTALLED"
    if not successor_present:
        temporary = parent / (
            ".capacity-proc-observer.py.worker-package." + str(os.getpid()) +
            ".installing")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o500)
        published = False
        try:
            view = memoryview(source_raw)
            while view:
                view = view[os.write(fd, view):]
            os.fchmod(fd, 0o500)
            os.fchown(fd, ROOT_UID, ROOT_GID)
            os.fsync(fd)
            os.close(fd)
            fd = -1
            predecessor_raw, predecessor_info = stable_regular(
                TARGET, PREDECESSOR["sha256"], {0o500},
                uid=ROOT_UID, gid=ROOT_GID)
            if observed(TARGET, predecessor_raw, predecessor_info) != PREDECESSOR:
                raise RuntimeError("PREDECESSOR_CHANGED")
            sudoers_current, sudoers_current_info = stable_regular(
                SUDOERS, SUDOERS_SHA256, {0o440}, uid=ROOT_UID, gid=ROOT_GID)
            if (sudoers_current != sudoers_before or
                    (sudoers_current_info.st_dev, sudoers_current_info.st_ino,
                     sudoers_current_info.st_uid, sudoers_current_info.st_gid,
                     sudoers_current_info.st_mode) !=
                    (sudoers_info.st_dev, sudoers_info.st_ino,
                     sudoers_info.st_uid, sudoers_info.st_gid,
                     sudoers_info.st_mode)):
                raise RuntimeError("SUDOERS_CHANGED")
            os.replace(temporary, TARGET)
            published = True
            directory = os.open(
                parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if fd >= 0:
                os.close(fd)
            if not published:
                try:
                    temporary.unlink()
                except FileNotFoundError:
                    pass
        state = "INSTALLED"
    installed_raw, installed_info = stable_regular(
        TARGET, SOURCE_SHA256, {0o500}, uid=ROOT_UID, gid=ROOT_GID)
    sudoers_after, sudoers_after_info = stable_regular(
        SUDOERS, SUDOERS_SHA256, {0o440}, uid=ROOT_UID, gid=ROOT_GID)
    if (sudoers_before != sudoers_after or
            (sudoers_info.st_dev, sudoers_info.st_ino, sudoers_info.st_uid,
             sudoers_info.st_gid, sudoers_info.st_mode) !=
            (sudoers_after_info.st_dev, sudoers_after_info.st_ino,
             sudoers_after_info.st_uid, sudoers_after_info.st_gid,
             sudoers_after_info.st_mode)):
        raise RuntimeError("SUDOERS_CHANGED")
    return {"installationState": state, "previous": previous,
            "installed": observed(TARGET, installed_raw, installed_info),
            "sudoersSha256": SUDOERS_SHA256}


def result_lines(result: dict[str, object]) -> tuple[str, ...]:
    installed = result["installed"]
    lines = []
    if result["installationState"] == "INSTALLED":
        lines.append(
            "BEFORE|{path}|{sha256}|{uid}:{gid}|{mode}|{device}:{inode}".format(
                **result["previous"]))
        label = "INSTALLED"
    else:
        label = "RECOVERED"
    lines.append(
        (label + "|{path}|{sha256}|{uid}:{gid}|{mode}|{device}:{inode}").format(
            **installed))
    lines.append(
        f"PRESERVED|{SUDOERS}|{SUDOERS_SHA256}|{ROOT_UID}:{ROOT_GID}|0440")
    return tuple(lines)


if __name__ == "__main__":
    for line in result_lines(install()):
        print(line)
