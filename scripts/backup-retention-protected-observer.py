#!/usr/bin/env python3
"""Read-only verifier for the single protected historical backup snapshot."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any


CONTRACT = Path("/etc/re7online/backup-retention-protected.v1.json")
HELPER_PATH = Path("/usr/local/libexec/re7online/backup-retention-protected-observer.py")
SNAPSHOT_ROOT = Path("/opt/re7online/backups/converta-persistent/snapshots")
SNAPSHOT_ID = "20260812T011558Z"
SNAPSHOT_PATH = SNAPSHOT_ROOT / SNAPSHOT_ID
KIND = "CONVERTA_BACKUP_RETENTION_PROTECTION"
REASON = "UNIQUE_TRAINING_CONTENT_ONLY_COPY"
DECISION = "RETAIN_REQUIRED"
CONTRACT_UID = 0
CONTRACT_GID = 0
HELPER_UID = 0
HELPER_GID = 0
HELPER_MODE = 0o500
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_file(path: Path) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        deny("FILE_TYPE")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        digest = hashlib.sha256(); blocks: list[bytes] = []
        while block := os.read(fd, 1024 * 1024):
            digest.update(block); blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_uid,
                             item.st_gid, item.st_size, item.st_mtime_ns,
                             item.st_ctime_ns, item.st_nlink)
    if len({identity(item) for item in (before, opened, after, current)}) != 1:
        deny("FILE_IDENTITY_CHANGED")
    return b"".join(blocks), opened


def exact_keys(value: Any, keys: set[str], predicate: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        deny(predicate)
    return value


def load_contract() -> tuple[dict[str, Any], str]:
    raw, info = stable_file(CONTRACT)
    if ((info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode), info.st_nlink) !=
            (CONTRACT_UID, CONTRACT_GID, 0o600, 1)):
        deny("CONTRACT_IDENTITY")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("CONTRACT_JSON")
    if raw != canonical(value):
        deny("CONTRACT_CANONICAL")
    value = exact_keys(value, {
        "schemaVersion", "kind", "authorityVersion", "decision", "reason",
        "administrativeAuthority", "snapshot",
    }, "CONTRACT_SCHEMA")
    if (value["schemaVersion"], value["kind"], value["decision"], value["reason"]) != (
            1, KIND, DECISION, REASON):
        deny("CONTRACT_POLICY")
    if not isinstance(value["authorityVersion"], str) or not value["authorityVersion"]:
        deny("CONTRACT_AUTHORITY_VERSION")
    if not isinstance(value["administrativeAuthority"], str) or not value["administrativeAuthority"]:
        deny("CONTRACT_ADMINISTRATIVE_AUTHORITY")
    snapshot = exact_keys(value["snapshot"], {
        "snapshotId", "path", "device", "inode", "uid", "gid", "mode", "nlink",
        "manifestSha256", "checksumsSha256", "integrity", "pgRestoreList",
    }, "CONTRACT_SNAPSHOT_SCHEMA")
    if snapshot["snapshotId"] != SNAPSHOT_ID or snapshot["path"] != str(SNAPSHOT_PATH):
        deny("CONTRACT_SNAPSHOT_SCOPE")
    if snapshot["integrity"] != "SHA256SUMS_PASS" or snapshot["pgRestoreList"] != "PASS_503_OBJECTS":
        deny("CONTRACT_INTEGRITY_AUTHORITY")
    if not SHA_RE.fullmatch(snapshot["manifestSha256"]) or not SHA_RE.fullmatch(snapshot["checksumsSha256"]):
        deny("CONTRACT_DIGEST")
    return value, sha256(raw)


def validate_tree(contract: dict[str, Any]) -> dict[str, Any]:
    root_info = SNAPSHOT_ROOT.lstat()
    if SNAPSHOT_ROOT.is_symlink() or not stat.S_ISDIR(root_info.st_mode):
        deny("SNAPSHOT_ROOT_IDENTITY")
    info = SNAPSHOT_PATH.lstat()
    if SNAPSHOT_PATH.is_symlink() or not stat.S_ISDIR(info.st_mode):
        deny("SNAPSHOT_TYPE")
    expected = contract["snapshot"]
    actual = (info.st_dev, info.st_ino, info.st_uid, info.st_gid,
              f"0{stat.S_IMODE(info.st_mode):03o}", info.st_nlink)
    wanted = (expected["device"], expected["inode"], expected["uid"], expected["gid"],
              expected["mode"], expected["nlink"])
    if actual != wanted:
        deny("SNAPSHOT_IDENTITY")

    regular: set[str] = set()
    for directory, dirs, files in os.walk(SNAPSHOT_PATH, topdown=True, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            item = path.lstat()
            if stat.S_ISLNK(item.st_mode):
                deny("SNAPSHOT_SYMLINK")
            if stat.S_ISREG(item.st_mode):
                if item.st_nlink != 1:
                    deny("SNAPSHOT_HARDLINK")
                regular.add("./" + path.relative_to(SNAPSHOT_PATH).as_posix())
            elif not stat.S_ISDIR(item.st_mode):
                deny("SNAPSHOT_ENTRY_TYPE")

    manifest_raw, manifest_info = stable_file(SNAPSHOT_PATH / "manifest.json")
    sums_raw, sums_info = stable_file(SNAPSHOT_PATH / "SHA256SUMS")
    if sha256(manifest_raw) != expected["manifestSha256"]:
        deny("MANIFEST_DIGEST")
    if sha256(sums_raw) != expected["checksumsSha256"]:
        deny("CHECKSUMS_DIGEST")

    listed: set[str] = set()
    for line in sums_raw.decode("utf-8", errors="strict").splitlines():
        if len(line) < 68 or line[64:66] not in {"  ", " *"}:
            deny("CHECKSUMS_SCHEMA")
        digest, relative = line[:64], line[66:]
        if not SHA_RE.fullmatch(digest) or not relative.startswith("./"):
            deny("CHECKSUMS_SCHEMA")
        parts = Path(relative).parts
        if relative == "./SHA256SUMS" or ".." in parts or relative in listed:
            deny("CHECKSUMS_SCOPE")
        path = SNAPSHOT_PATH / relative[2:]
        raw, _ = stable_file(path)
        if sha256(raw) != digest:
            deny("CHECKSUMS_CONTENT")
        listed.add(relative)
    if listed != regular - {"./SHA256SUMS"}:
        deny("CHECKSUMS_COVERAGE")
    return {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        "nlink": info.st_nlink, "manifestDevice": manifest_info.st_dev,
        "manifestInode": manifest_info.st_ino, "checksumsDevice": sums_info.st_dev,
        "checksumsInode": sums_info.st_ino,
    }


def verify() -> dict[str, Any]:
    if os.geteuid() != 0 or os.getegid() != 0:
        deny("ROOT_REQUIRED")
    helper_raw, helper_info = stable_file(HELPER_PATH)
    if ((helper_info.st_uid, helper_info.st_gid, stat.S_IMODE(helper_info.st_mode),
         helper_info.st_nlink) != (HELPER_UID, HELPER_GID, HELPER_MODE, 1)):
        deny("HELPER_IDENTITY")
    contract, contract_sha = load_contract()
    observed = validate_tree(contract)
    return {
        "schemaVersion": 1,
        "kind": "CONVERTA_BACKUP_RETENTION_PROTECTION_ATTESTATION",
        "state": "VERIFIED",
        "decision": DECISION,
        "reason": REASON,
        "snapshotId": SNAPSHOT_ID,
        "path": str(SNAPSHOT_PATH),
        "contractPath": str(CONTRACT),
        "contractSha256": contract_sha,
        "authorityVersion": contract["authorityVersion"],
        "manifestSha256": contract["snapshot"]["manifestSha256"],
        "checksumsSha256": contract["snapshot"]["checksumsSha256"],
        "integrity": "SHA256SUMS_PASS",
        "identity": observed,
        "mechanism": {
            "path": str(HELPER_PATH), "sha256": sha256(helper_raw),
            "device": helper_info.st_dev, "inode": helper_info.st_ino,
            "uid": helper_info.st_uid, "gid": helper_info.st_gid,
            "mode": f"0{stat.S_IMODE(helper_info.st_mode):03o}",
        },
    }


def main(argv: list[str]) -> int:
    if argv != ["verify-v1"]:
        print("DENY:ARGV", file=sys.stderr); return 2
    try:
        sys.stdout.buffer.write(canonical(verify()))
        return 0
    except (Denied, FileNotFoundError, PermissionError, OSError, UnicodeError) as error:
        predicate = str(error) if isinstance(error, Denied) else type(error).__name__.upper()
        print("DENY:" + predicate, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
