#!/usr/bin/env python3
"""Fail-closed gate for persistent operational data used across immutable releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
from pathlib import Path
from typing import Any

SHA256 = re.compile(r"^[a-f0-9]{64}$")
KIND = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V1"
ENFORCEMENT_STATE = "IMPLEMENTED_NOT_ENFORCED"


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def private_json(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha256):
        deny("request_binding")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        deny("request_identity")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        deny("request_sha256")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("request_json")
    if not isinstance(value, dict) or raw != canonical(value):
        deny("request_canonical")
    return value


def confined_outside(root: Path, release_roots: list[Path]) -> None:
    if not root.is_absolute() or root == Path("/"):
        deny("persistent_root_absolute")
    for release_root in release_roots:
        if not release_root.is_absolute():
            deny("release_root_absolute")
        if root == release_root or release_root in root.parents or root in release_root.parents:
            deny("persistent_root_release_overlap")


def validate(request: dict[str, Any]) -> dict[str, Any]:
    required = {"schemaVersion", "kind", "phase", "surface", "persistentRoot", "releaseRoots",
                "reconciliation", "unreconciledReleaseDependencies"}
    if set(request) != required or request.get("schemaVersion") != 1 or request.get("kind") != KIND:
        deny("request_schema")
    if request.get("phase") not in {"qualification", "preflight", "acceptance", "retirement"}:
        deny("request_phase")
    if request.get("surface") != "INBOX_READ_STATE_V1":
        deny("request_surface")
    root_value = request.get("persistentRoot")
    if not isinstance(root_value, dict) or set(root_value) != {"path", "ownerUid", "groupGid", "mode"}:
        deny("persistent_root_schema")
    root = Path(str(root_value.get("path", "")))
    release_values = request.get("releaseRoots")
    if (not isinstance(release_values, list) or {item.get("role") for item in release_values if isinstance(item, dict)} != {"candidate", "rollback"}
            or not all(isinstance(item, dict) and set(item) == {"role", "path"} and item["role"] in {"candidate", "rollback"} for item in release_values)):
        deny("release_roots_schema")
    release_roots = [Path(item["path"]) for item in release_values]
    confined_outside(root, release_roots)
    if root_value.get("mode") != "0700" or not isinstance(root_value.get("ownerUid"), int) or not isinstance(root_value.get("groupGid"), int):
        deny("persistent_root_policy")

    reconciliation = request.get("reconciliation")
    reconciliation_keys = {"required", "state", "receipt", "receiptSha256", "operationId", "tenantId", "scope", "destinationPath"}
    if not isinstance(reconciliation, dict) or set(reconciliation) != reconciliation_keys:
        deny("reconciliation_schema")
    required_reconciliation = reconciliation.get("required") is True
    expected_state = "VERIFIED" if required_reconciliation else "NOT_REQUIRED"
    if reconciliation.get("state") != expected_state:
        deny("reconciliation_state")
    if required_reconciliation:
        receipt = Path(str(reconciliation.get("receipt", "")))
        receipt_sha = str(reconciliation.get("receiptSha256", ""))
        receipt_value = private_json(receipt, receipt_sha)
        expected = {"schemaVersion": 2, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2", "state": "VERIFIED", "operationId": reconciliation["operationId"], "tenantId": reconciliation["tenantId"], "scope": reconciliation["scope"], "destinationPath": reconciliation["destinationPath"]}
        if any(receipt_value.get(key) != value for key, value in expected.items()):
            deny("reconciliation_receipt_semantics")
    elif any(reconciliation.get(key) is not None for key in reconciliation_keys - {"required", "state"}):
        deny("reconciliation_unnecessary")

    dependencies = request.get("unreconciledReleaseDependencies")
    if not isinstance(dependencies, list) or not all(isinstance(item, str) and item for item in dependencies):
        deny("release_dependencies_schema")
    if request["phase"] == "retirement" and dependencies:
        deny("release_persistent_dependency")

    observation = None
    if request["phase"] in {"preflight", "acceptance", "retirement"}:
        try:
            info = root.lstat()
            resolved = root.resolve(strict=True)
        except OSError:
            deny("persistent_root_absent")
        if (not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or resolved != root or
                info.st_uid != root_value["ownerUid"] or info.st_gid != root_value["groupGid"] or
                stat.S_IMODE(info.st_mode) != 0o700):
            deny("persistent_root_identity")
        for parent in [root, *root.parents]:
            if parent == Path("/"):
                break
            parent_info = parent.lstat()
            writable = stat.S_IMODE(parent_info.st_mode) & 0o022
            if stat.S_ISLNK(parent_info.st_mode) or (writable and not parent_info.st_mode & stat.S_ISVTX):
                deny("persistent_root_ancestor")
        observation = {"device": info.st_dev, "inode": info.st_ino, "mode": "0700",
                       "ownerUid": info.st_uid, "groupGid": info.st_gid}
    return {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_REPORT",
            "result": "PASS", "phase": request["phase"], "surface": request["surface"],
            "persistentRoot": str(root), "observation": observation,
            "reconciliation": reconciliation["state"], "enforcementState": ENFORCEMENT_STATE}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate",))
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        request = private_json(args.request, args.request_sha256)
        print(json.dumps(validate(request), sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError) as error:
        print(f"PERSISTENCE_GATE_DENY:{error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
