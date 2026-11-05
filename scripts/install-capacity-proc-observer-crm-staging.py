#!/usr/bin/python3
"""Atomic closed installer for the inactive CRM staging observer revision."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat

SOURCE = Path(__file__).resolve().with_name("capacity-proc-observer.py")
SOURCE_SHA256 = "fb83ba7c15fbac564a4bbe0d7d1bfd0d0a8ba2e79231d8b133e67b12a8c86d6f"
TARGET = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
SUDOERS = Path("/etc/sudoers.d/re7online-capacity-proc-observer")
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
PREVIOUS_HELPERS = ({
    "path": str(TARGET),
    "sha256": "89650e6207cb4524f69ba6d0bdeea8d682b336cdb5424d4bcc7831cb58b57387",
    "device": 64769,
    "inode": 803452,
    "uid": 0,
    "gid": 0,
    "mode": "0500",
},)


def stable_regular(path: Path, expected_sha256: str | None,
                   allowed_modes: set[int]) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd); digest = hashlib.sha256(); blocks = []
        while block := os.read(fd, 1024 * 1024):
            digest.update(block); blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode,
                              value.st_uid, value.st_gid, value.st_size,
                              value.st_mtime_ns, value.st_ctime_ns, value.st_nlink)
    if (len({identity(item) for item in (before, opened, after, current)}) != 1 or
            stat.S_IMODE(opened.st_mode) not in allowed_modes or
            (expected_sha256 is not None and digest.hexdigest() != expected_sha256)):
        raise RuntimeError("IDENTITY:" + str(path))
    return b"".join(blocks), opened


def install() -> dict[str, object]:
    if os.geteuid() != 0 or os.getegid() != 0:
        raise RuntimeError("ROOT_REQUIRED")
    source_raw, _ = stable_regular(SOURCE, SOURCE_SHA256, {0o600})
    _sudoers_raw, sudoers_info = stable_regular(SUDOERS, SUDOERS_SHA256, {0o440})
    if (sudoers_info.st_uid, sudoers_info.st_gid) != (0, 0):
        raise RuntimeError("SUDOERS_IDENTITY")
    previous_raw, previous_info = stable_regular(TARGET, None, {0o500})
    previous = {"path": str(TARGET), "sha256": hashlib.sha256(previous_raw).hexdigest(),
                "device": previous_info.st_dev, "inode": previous_info.st_ino,
                "uid": previous_info.st_uid, "gid": previous_info.st_gid,
                "mode": f"{stat.S_IMODE(previous_info.st_mode):04o}"}
    successor_present = (previous["sha256"] == SOURCE_SHA256 and
                         (previous["uid"], previous["gid"], previous["mode"]) ==
                         (0, 0, "0500"))
    if not successor_present and previous not in PREVIOUS_HELPERS:
        raise RuntimeError("PREVIOUS_HELPER_NOT_ALLOWED")
    parent = TARGET.parent; parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            (parent_info.st_uid, parent_info.st_gid,
             stat.S_IMODE(parent_info.st_mode)) != (0, 0, 0o755)):
        raise RuntimeError("TARGET_PARENT_IDENTITY")
    if successor_present:
        # A process may die after the durable os.replace()/directory fsync and
        # before its stdout is captured as the private installation proof.  In
        # that state, authenticate the exact successor twice and emit a new
        # consumable observation without replacing it or changing its inode.
        _installed_raw, installed = stable_regular(TARGET, SOURCE_SHA256, {0o500})
        if ((installed.st_uid, installed.st_gid) != (0, 0) or
                (installed.st_dev, installed.st_ino) !=
                (previous_info.st_dev, previous_info.st_ino)):
            raise RuntimeError("TARGET_IDENTITY")
        return {"path": str(TARGET), "sha256": SOURCE_SHA256,
                "installationState": "RECOVERED_ALREADY_INSTALLED",
                "previous": previous,
                "identity": {"device": installed.st_dev, "inode": installed.st_ino,
                             "uid": installed.st_uid, "gid": installed.st_gid,
                             "mode": "0500"}, "sudoersSha256": SUDOERS_SHA256}
    temporary = parent / ".capacity-proc-observer.py.crm-staging.installing"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 os.O_NOFOLLOW | os.O_CLOEXEC, 0o500)
    try:
        view = memoryview(source_raw)
        while view:
            view = view[os.write(fd, view):]
        os.fchmod(fd, 0o500); os.fchown(fd, 0, 0); os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, TARGET)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    _installed_raw, installed = stable_regular(TARGET, SOURCE_SHA256, {0o500})
    if (installed.st_uid, installed.st_gid) != (0, 0):
        raise RuntimeError("TARGET_IDENTITY")
    return {"path": str(TARGET), "sha256": SOURCE_SHA256,
            "installationState": "INSTALLED", "previous": previous,
            "identity": {"device": installed.st_dev, "inode": installed.st_ino,
                         "uid": installed.st_uid, "gid": installed.st_gid,
                         "mode": "0500"}, "sudoersSha256": SUDOERS_SHA256}


def result_lines(result: dict[str, object]) -> tuple[str, ...]:
    lines = []
    if result["installationState"] == "INSTALLED":
        lines.append("BEFORE|{path}|{sha256}|{uid}:{gid}|{mode}|{device}:{inode}".format(
            **result["previous"]))
        label = "INSTALLED"
    else:
        label = "RECOVERED"
    lines.append((label + "|{path}|{sha256}|{uid}:{gid}|{mode}|{device}:{inode}").format(
        **result, **result["identity"]))
    lines.append(f"PRESERVED|{SUDOERS}|{SUDOERS_SHA256}|0:0|0440")
    return tuple(lines)


if __name__ == "__main__":
    for line in result_lines(install()):
        print(line)
