#!/usr/bin/python3
"""Atomic closed installer for the b58ed195 preservation observer."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat

SOURCE = Path(__file__).resolve().with_name("capacity-proc-observer.py")
SOURCE_SHA256 = "3ca0cf56593679df5709962ca59bc19b07c524180b025f413605cb8c1537175e"
TARGET = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
SUDOERS = Path("/etc/sudoers.d/re7online-capacity-proc-observer")
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
PREDECESSOR = {
    "path": str(TARGET),
    "sha256": "fb83ba7c15fbac564a4bbe0d7d1bfd0d0a8ba2e79231d8b133e67b12a8c86d6f",
    "device": 64769, "inode": 835066, "uid": 0, "gid": 0, "mode": "0500",
}


def stable(path: Path, expected: str | None, modes: set[int]) -> tuple[bytes, os.stat_result]:
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
            stat.S_IMODE(current.st_mode) not in modes or
            (expected is not None and hashlib.sha256(raw).hexdigest() != expected)):
        raise RuntimeError("IDENTITY:" + str(path))
    return raw, current


def projection(path: Path, raw: bytes, info: os.stat_result) -> dict[str, object]:
    return {"path": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
            "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
            "gid": info.st_gid, "mode": f"{stat.S_IMODE(info.st_mode):04o}"}


def install() -> dict[str, object]:
    if (os.geteuid(), os.getegid()) != (0, 0):
        raise RuntimeError("ROOT_REQUIRED")
    source_raw, _ = stable(SOURCE, SOURCE_SHA256, {0o600})
    _sudoers_raw, sudoers = stable(SUDOERS, SUDOERS_SHA256, {0o440})
    if (sudoers.st_uid, sudoers.st_gid) != (0, 0):
        raise RuntimeError("SUDOERS_IDENTITY")
    current_raw, current_info = stable(TARGET, None, {0o500})
    current = projection(TARGET, current_raw, current_info)
    successor = (current["sha256"] == SOURCE_SHA256 and
                 (current["uid"], current["gid"], current["mode"]) == (0, 0, "0500"))
    if not successor and current != PREDECESSOR:
        raise RuntimeError("PREVIOUS_HELPER_NOT_ALLOWED")
    parent = TARGET.parent; parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            (parent_info.st_uid, parent_info.st_gid,
             stat.S_IMODE(parent_info.st_mode)) != (0, 0, 0o755)):
        raise RuntimeError("TARGET_PARENT_IDENTITY")
    if successor:
        _raw, confirmed = stable(TARGET, SOURCE_SHA256, {0o500})
        if (confirmed.st_dev, confirmed.st_ino) != (current_info.st_dev, current_info.st_ino):
            raise RuntimeError("TARGET_IDENTITY")
        state = "RECOVERED_ALREADY_INSTALLED"
    else:
        temporary = parent / ".capacity-proc-observer.py.b58ed195.installing"
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
        _raw, confirmed = stable(TARGET, SOURCE_SHA256, {0o500})
        state = "INSTALLED"
    if (confirmed.st_uid, confirmed.st_gid) != (0, 0):
        raise RuntimeError("TARGET_IDENTITY")
    return {"path": str(TARGET), "sha256": SOURCE_SHA256,
            "installationState": state, "previous": current,
            "identity": {"device": confirmed.st_dev, "inode": confirmed.st_ino,
                         "uid": confirmed.st_uid, "gid": confirmed.st_gid,
                         "mode": "0500"}, "sudoersSha256": SUDOERS_SHA256}


def main() -> None:
    result = install()
    previous = result["previous"]; identity = result["identity"]
    if result["installationState"] == "INSTALLED":
        print("BEFORE|{path}|{sha256}|{uid}:{gid}|{mode}|{device}:{inode}".format(**previous))
    label = "INSTALLED" if result["installationState"] == "INSTALLED" else "RECOVERED"
    print(f"{label}|{result['path']}|{result['sha256']}|{identity['uid']}:{identity['gid']}|"
          f"{identity['mode']}|{identity['device']}:{identity['inode']}")
    print(f"PRESERVED|{SUDOERS}|{SUDOERS_SHA256}|0:0|0440")


if __name__ == "__main__":
    main()
