#!/usr/bin/env python3
"""Seal a built CB-compatible release for the canonical durable read-state rollback gate."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

SHA256 = re.compile(r"^[0-9a-f]{64}$")


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def stable(path: Path) -> bytes:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise RuntimeError("rollback_compatibility_file_identity")
    raw = path.read_bytes(); after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise RuntimeError("rollback_compatibility_file_drift")
    return raw


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-root", required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--persistent-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    release = Path(args.release_root)
    if not release.is_absolute() or release.is_symlink() or not release.is_dir():
        raise RuntimeError("rollback_compatibility_release_root")
    persistent = Path(args.persistent_root)
    if not persistent.is_absolute() or persistent == release or release in persistent.parents or persistent in release.parents:
        raise RuntimeError("rollback_compatibility_persistent_root")
    manifest_path = release / "manifest.json"; index_path = release / "index.sha256"
    entry_path = release / "api-runtime/dist/index.js"
    store_path = release / "api-runtime/dist/inbox/readStateStore.js"
    manifest_raw = stable(manifest_path); index_raw = stable(index_path)
    entry_raw = stable(entry_path); store_raw = stable(store_path)
    manifest = json.loads(manifest_raw)
    if canonical(manifest) != manifest_raw or manifest.get("releaseId") != args.release_id or manifest.get("components") != ["api", "frontend"]:
        raise RuntimeError("rollback_compatibility_manifest")
    api = manifest.get("runtimes", {}).get("api", {})
    if api != {"entrypoint": "api-runtime/dist/index.js", "entrySha256": digest(entry_raw)}:
        raise RuntimeError("rollback_compatibility_entrypoint")
    if manifest.get("indexSha256") != digest(index_raw):
        raise RuntimeError("rollback_compatibility_index")
    if b"INBOX_READ_STATE_ROOT" not in store_raw or b"inbox_read_state_root_required" not in store_raw:
        raise RuntimeError("rollback_compatibility_storage_behavior")
    value = {
        "schemaVersion": 1,
        "kind": "CONVERTA_DURABLE_READ_STATE_ROLLBACK_COMPATIBILITY_V1",
        "releaseId": args.release_id,
        "manifestSha256": digest(manifest_raw),
        "indexSha256": digest(index_raw),
        "apiEntrySha256": digest(entry_raw),
        "readStateStore": {"path": str(store_path), "sha256": digest(store_raw)},
        "persistentRoot": str(persistent),
        "environment": {"INBOX_READ_STATE_ROOT": str(persistent)},
    }
    raw = canonical(value); output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try: os.write(fd, raw); os.fsync(fd)
        finally: os.close(fd)
    except FileExistsError:
        if stable(output) != raw or stat.S_IMODE(output.stat().st_mode) != 0o600:
            raise RuntimeError("rollback_compatibility_publication_conflict")
    print(canonical({"result": "ROLLBACK_COMPATIBILITY_SEALED", "sha256": digest(raw), "path": str(output)}).decode(), end="")


if __name__ == "__main__": main()
