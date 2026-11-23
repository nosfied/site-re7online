#!/usr/bin/python3
"""Authenticate and restore inbox read-state only into an isolated empty root."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def private_json(path: Path, expected_sha256: str) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise RuntimeError("private_authority_identity")
    raw = path.read_bytes()
    if digest(raw) != expected_sha256:
        raise RuntimeError("private_authority_sha256")
    value = json.loads(raw)
    if raw != canonical(value):
        raise RuntimeError("private_authority_canonical")
    return value


def verify_tree(root: Path, *, isolated: bool) -> list[Path]:
    root_info = root.lstat()
    if root.is_symlink() or not stat.S_ISDIR(root_info.st_mode) or stat.S_IMODE(root_info.st_mode) != 0o700:
        raise RuntimeError("read_state_root_identity")
    owner = (root_info.st_uid, root_info.st_gid); files: list[Path] = []
    for current, dirs, names in os.walk(root, followlinks=False):
        current_path = Path(current); current_info = current_path.lstat()
        if stat.S_IMODE(current_info.st_mode) != 0o700 or (current_info.st_uid, current_info.st_gid) != owner:
            raise RuntimeError("read_state_directory_mode")
        for name in dirs:
            item = current_path / name; info = item.lstat()
            if item.is_symlink() or not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or (info.st_uid, info.st_gid) != owner:
                raise RuntimeError("read_state_directory_identity")
        for name in names:
            item = current_path / name; info = item.lstat()
            if item.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or (info.st_uid, info.st_gid) != owner or (isolated and info.st_nlink != 1):
                raise RuntimeError("read_state_file_identity")
            files.append(item)
    return sorted(files)


def authenticate_checksums(snapshot: Path, expected_manifest: str, expected_checksums: str) -> None:
    manifest = snapshot / "manifest.json"; checksums = snapshot / "SHA256SUMS"
    if digest(manifest.read_bytes()) != expected_manifest or digest(checksums.read_bytes()) != expected_checksums:
        raise RuntimeError("snapshot_authority_sha256")
    for line in checksums.read_text(encoding="utf-8").splitlines():
        checksum, relative = line.split("  ", 1); target = snapshot / relative.removeprefix("./")
        if not target.is_file() or target.is_symlink() or digest(target.read_bytes()) != checksum:
            raise RuntimeError("snapshot_checksums")


def restore(request_path: Path, request_sha256: str) -> dict:
    request = private_json(request_path, request_sha256)
    required = {"schemaVersion", "kind", "snapshot", "destinationRoot", "anonymizationAuthorities", "receiptPath"}
    if set(request) != required or request.get("schemaVersion") != 1 or request.get("kind") != "CONVERTA_READ_STATE_ISOLATED_RESTORE_REQUEST_V1":
        raise RuntimeError("restore_request_schema")
    snapshot_value = request["snapshot"]
    if set(snapshot_value) != {"path", "manifestSha256", "checksumsSha256", "subtree"} or snapshot_value["subtree"] != "runtime-data/inbox-read-state":
        raise RuntimeError("restore_snapshot_schema")
    snapshot = Path(snapshot_value["path"]); source = snapshot / snapshot_value["subtree"]
    authenticate_checksums(snapshot, snapshot_value["manifestSha256"], snapshot_value["checksumsSha256"])
    source_files = verify_tree(source, isolated=False)
    exclusions: dict[str, set[str]] = {}
    for authority in request["anonymizationAuthorities"]:
        if set(authority) != {"path", "sha256"}:
            raise RuntimeError("restore_anonymization_binding")
        value = private_json(Path(authority["path"]), authority["sha256"])
        if set(value) != {"schemaVersion", "kind", "tenantId", "conversationKeys"} or value.get("schemaVersion") != 1 or value.get("kind") != "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS" or not isinstance(value.get("conversationKeys"), list):
            raise RuntimeError("restore_anonymization_authority")
        exclusions.setdefault(value["tenantId"], set()).update(value["conversationKeys"])
    destination_value = request["destinationRoot"]
    if set(destination_value) != {"path", "ownerUid", "groupGid", "mode"} or destination_value["mode"] != "0700":
        raise RuntimeError("restore_destination_schema")
    destination = Path(destination_value["path"])
    destination_info = destination.lstat()
    if destination.is_symlink() or not stat.S_ISDIR(destination_info.st_mode) or stat.S_IMODE(destination_info.st_mode) != 0o700 or (destination_info.st_uid, destination_info.st_gid) != (destination_value["ownerUid"], destination_value["groupGid"]) or any(destination.iterdir()):
        raise RuntimeError("restore_destination_not_empty_private")
    prepared = []
    for source_file in source_files:
        relative = source_file.relative_to(source); raw = source_file.read_bytes(); value = json.loads(raw)
        tenant_id = relative.parts[0] if relative.parts else ""
        forbidden = exclusions.get(tenant_id, set())
        observed = set(value.get("lastReadAtByConversationKey", {})) | set(value.get("manuallyUnreadByConversationKey", {}))
        if observed & forbidden:
            raise RuntimeError("restore_anonymized_key_reintroduction")
        prepared.append((relative, raw))
    for relative, raw in prepared:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700); os.chmod(target.parent, 0o700); os.chown(target.parent, destination_value["ownerUid"], destination_value["groupGid"])
        with target.open("xb") as handle:
            os.fchmod(handle.fileno(), 0o600); os.fchown(handle.fileno(), destination_value["ownerUid"], destination_value["groupGid"]); handle.write(raw); handle.flush(); os.fsync(handle.fileno())
    restored_files = verify_tree(destination, isolated=True)
    inventory = [{"path": str(item.relative_to(destination)), "sha256": digest(item.read_bytes())} for item in restored_files]
    receipt = {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_ISOLATED_RESTORE_RECEIPT_V1", "state": "VERIFIED", "requestSha256": request_sha256, "destinationRoot": str(destination), "fileCount": len(inventory), "inventory": inventory}
    receipt_path = Path(request["receiptPath"])
    fd = os.open(receipt_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, canonical(receipt)); os.fsync(fd)
    finally:
        os.close(fd)
    return {"state": "VERIFIED", "receiptSha256": digest(canonical(receipt)), "fileCount": len(inventory)}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("request"); parser.add_argument("sha256")
    args = parser.parse_args(); print(canonical(restore(Path(args.request), args.sha256)).decode(), end="")


if __name__ == "__main__":
    main()
