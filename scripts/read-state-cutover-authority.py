#!/usr/bin/python3
"""Offline preparation and authenticated materialization for the first read-state cutover."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat


ROOT = "/opt/re7online/runtime-data/inbox-read-state"
PRIVACY_INVENTORY_SHA256 = "620833264d94ed9ce2433f4bada99ae4fd9c74702707665fe35c3e5ff269bacc"
PRIVACY_JOURNAL_SHA256 = "b461e4fa3d03cf066abfbab396262f183845228bfa955b8cbc19c6a0e137e572"
PRIVACY_CUSTODY_SHA256 = "8d54f3e7e70810f5629e30b1bd2f55e16ab270c0cca482887167f8cb6eb83980"


def canonical(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def private_json(path: Path, expected_sha256: str) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise RuntimeError("authority_file_identity")
    raw = path.read_bytes()
    if digest(raw) != expected_sha256:
        raise RuntimeError("authority_file_sha256")
    value = json.loads(raw)
    if canonical(value) != raw:
        raise RuntimeError("authority_file_canonical")
    return value


def inside(child: str, root: str) -> bool:
    child_path = Path(child); root_path = Path(root)
    try: return child_path.is_absolute() and child_path != root_path and child_path.is_relative_to(root_path)
    except ValueError: return False


def publish(path: Path, value: object) -> str:
    raw = canonical(value); path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try: os.write(fd, raw); os.fsync(fd)
        finally: os.close(fd)
    except FileExistsError:
        if private_json(path, digest(raw)) != value: raise RuntimeError("authority_publication_conflict")
    return digest(raw)


def validate_plan(value: dict) -> None:
    keys = {"schemaVersion", "kind", "operationId", "persistentRoot", "custodyRoot", "authorizedSourceReleases", "entries", "privacyBatchAuthority", "outputs"}
    if set(value) != keys or value.get("schemaVersion") != 1 or value.get("kind") != "CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V1" or not value.get("operationId"):
        raise RuntimeError("cutover_plan_schema")
    root = value["persistentRoot"]
    if set(root) != {"path", "ownerUid", "groupGid", "mode"} or root["path"] != ROOT or root["mode"] != "0700" or not isinstance(root["ownerUid"], int) or not isinstance(root["groupGid"], int):
        raise RuntimeError("cutover_plan_root")
    custody = value["custodyRoot"]
    if set(custody) != {"path", "ownerUid", "groupGid", "mode"} or not Path(custody["path"]).is_absolute() or custody["mode"] != "0700":
        raise RuntimeError("cutover_plan_custody")
    releases = value["authorizedSourceReleases"]
    if not isinstance(releases, list) or len(releases) != len(set(releases)) or not releases:
        raise RuntimeError("cutover_plan_releases")
    batch = value["privacyBatchAuthority"]
    if set(batch) != {"path", "sha256", "inventorySha256", "journalSha256", "custodyManifestSha256", "verifiedCount"} or batch["inventorySha256"] != PRIVACY_INVENTORY_SHA256 or batch["journalSha256"] != PRIVACY_JOURNAL_SHA256 or batch["custodyManifestSha256"] != PRIVACY_CUSTODY_SHA256 or batch["verifiedCount"] != 34:
        raise RuntimeError("cutover_plan_privacy_batch")
    outputs = value["outputs"]
    if set(outputs) != {"provisionIntentPath", "materializationRequestPath", "authorizationPath"} or any(not inside(path, custody["path"]) for path in outputs.values()):
        raise RuntimeError("cutover_plan_outputs")
    scopes: set[str] = set(); destinations: set[str] = set(); copies: set[str] = set()
    for entry in value["entries"]:
        required = {"operationId", "tenantId", "scope", "destinationPath", "sources", "anonymizationAuthority", "requestPath", "journalPath", "receiptPath"}
        if set(entry) != required or not entry["tenantId"] or not entry["sources"]:
            raise RuntimeError("cutover_plan_entry")
        scope = entry["scope"]
        if set(scope) != ({"type"} if scope.get("type") == "shared" else {"type", "assignedUserId"}) or scope.get("type") not in {"shared", "assigned"}:
            raise RuntimeError("cutover_plan_scope")
        scope_key = f'{entry["tenantId"]}:{scope["type"]}:{scope.get("assignedUserId", "")}'
        if scope_key in scopes or entry["destinationPath"] in destinations or not inside(entry["destinationPath"], ROOT):
            raise RuntimeError("cutover_plan_duplicate")
        scopes.add(scope_key); destinations.add(entry["destinationPath"])
        for field in ("requestPath", "journalPath", "receiptPath"):
            if not inside(entry[field], custody["path"]): raise RuntimeError("cutover_plan_custody_boundary")
        privacy = entry["anonymizationAuthority"]
        if set(privacy) != {"path", "sha256"} or not inside(privacy["path"], custody["path"]): raise RuntimeError("cutover_plan_privacy")
        for source in entry["sources"]:
            if set(source) != {"releaseId", "path", "rootPath", "privateCopyPath"} or source["releaseId"] not in releases or not inside(source["path"], source["rootPath"]) or not inside(source["privateCopyPath"], custody["path"]) or source["privateCopyPath"] in copies:
                raise RuntimeError("cutover_plan_source")
            copies.add(source["privateCopyPath"])


def prepare(plan_path: Path, plan_sha256: str) -> dict:
    plan = private_json(plan_path, plan_sha256); validate_plan(plan)
    provision = {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_INTENT_V1", "state": "AWAITING_OWNER_AUTHORIZATION", "planSha256": plan_sha256, "root": plan["persistentRoot"], "automaticExecution": False}
    provision_sha = publish(Path(plan["outputs"]["provisionIntentPath"]), provision)
    request = {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORITY_MATERIALIZATION_REQUEST_V1", "planPath": str(plan_path), "planSha256": plan_sha256, "provisionIntentPath": plan["outputs"]["provisionIntentPath"], "provisionIntentSha256": provision_sha, "authorizationPath": plan["outputs"]["authorizationPath"]}
    request_sha = publish(Path(plan["outputs"]["materializationRequestPath"]), request)
    return {"state": "PREPARED", "provisionIntentSha256": provision_sha, "materializationRequestSha256": request_sha}


def root_authority(path: Path, expected: dict, mode: int) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != mode or (info.st_uid, info.st_gid) != (expected["ownerUid"], expected["groupGid"]):
        raise RuntimeError("cutover_root_identity")
    return {"path": str(path), "device": info.st_dev, "inode": info.st_ino, "ownerUid": info.st_uid, "groupGid": info.st_gid, "mode": f"0{mode:03o}"}


def materialize(request_path: Path, request_sha256: str,
                owner_authorization_path: Path, owner_authorization_sha256: str) -> dict:
    request = private_json(request_path, request_sha256)
    if set(request) != {"schemaVersion", "kind", "planPath", "planSha256", "provisionIntentPath", "provisionIntentSha256", "authorizationPath"} or request.get("schemaVersion") != 1 or request.get("kind") != "CONVERTA_READ_STATE_CUTOVER_AUTHORITY_MATERIALIZATION_REQUEST_V1":
        raise RuntimeError("materialization_request_schema")
    plan = private_json(Path(request["planPath"]), request["planSha256"]); validate_plan(plan)
    provision = private_json(Path(request["provisionIntentPath"]), request["provisionIntentSha256"])
    if provision.get("planSha256") != request["planSha256"] or provision.get("state") != "AWAITING_OWNER_AUTHORIZATION": raise RuntimeError("provision_intent_binding")
    owner = private_json(owner_authorization_path, owner_authorization_sha256)
    expected_owner_keys = {"schemaVersion", "kind", "decision", "planSha256", "provisionIntentSha256", "approvedPersistentRoot", "approvedTenants", "owner"}
    if (set(owner) != expected_owner_keys or owner.get("schemaVersion") != 1 or
            owner.get("kind") != "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1" or
            owner.get("decision") != "AUTHORIZE_ONCE" or
            owner.get("planSha256") != request["planSha256"] or
            owner.get("provisionIntentSha256") != request["provisionIntentSha256"] or
            owner.get("approvedPersistentRoot") != plan["persistentRoot"]["path"] or
            owner.get("approvedTenants") != sorted({entry["tenantId"] for entry in plan["entries"]}) or
            not isinstance(owner.get("owner"), str) or not owner["owner"].strip()):
        raise RuntimeError("owner_authorization_binding")
    persistent = root_authority(Path(plan["persistentRoot"]["path"]), plan["persistentRoot"], 0o700)
    custody = root_authority(Path(plan["custodyRoot"]["path"]), plan["custodyRoot"], 0o700)
    batch = private_json(Path(plan["privacyBatchAuthority"]["path"]), plan["privacyBatchAuthority"]["sha256"])
    if batch.get("inventorySha256") != PRIVACY_INVENTORY_SHA256 or batch.get("journalSha256") != PRIVACY_JOURNAL_SHA256 or batch.get("custodyManifestSha256") != PRIVACY_CUSTODY_SHA256 or batch.get("verifiedCount") != 34:
        raise RuntimeError("privacy_batch_binding")
    entries = []
    for entry in plan["entries"]:
        privacy = private_json(Path(entry["anonymizationAuthority"]["path"]), entry["anonymizationAuthority"]["sha256"])
        if privacy.get("kind") != "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS" or privacy.get("tenantId") != entry["tenantId"]:
            raise RuntimeError("privacy_tenant_binding")
        sources = []
        for source in entry["sources"]:
            source_root = Path(source["rootPath"]); info = source_root.lstat()
            expected = {"ownerUid": info.st_uid, "groupGid": info.st_gid}
            sources.append({"releaseId": source["releaseId"], "path": source["path"], "root": root_authority(source_root, expected, 0o755), "admission": "LEGACY_RELEASE_LOCAL_COPY_V1", "privateCopyPath": source["privateCopyPath"]})
        entries.append({"operationId": entry["operationId"], "tenantId": entry["tenantId"], "scope": entry["scope"], "destinationPath": entry["destinationPath"], "sources": sources, "anonymizationAuthority": entry["anonymizationAuthority"], "requestPath": entry["requestPath"], "journalPath": entry["journalPath"], "receiptPath": entry["receiptPath"]})
    authorization = {"schemaVersion": 2, "kind": "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V2", "operationId": plan["operationId"], "administrativeAuthority": {"path": str(owner_authorization_path), "sha256": owner_authorization_sha256}, "custodyRoot": custody, "persistentRoot": persistent, "authorizedSourceReleases": plan["authorizedSourceReleases"], "entries": entries, "inventoryPath": str(Path(custody["path"]) / "inventory.private.json"), "manifestPath": str(Path(custody["path"]) / "manifest.private.json"), "aggregateReceiptPath": str(Path(custody["path"]) / "aggregate/receipt.private.json"), "sealReceiptPath": str(Path(custody["path"]) / "snapshot-seal.private.json")}
    authorization_sha = publish(Path(request["authorizationPath"]), authorization)
    return {"state": "MATERIALIZED", "authorizationSha256": authorization_sha, "entryCount": len(entries)}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("action", choices=("prepare", "materialize")); parser.add_argument("path"); parser.add_argument("sha256")
    parser.add_argument("--owner-authorization"); parser.add_argument("--owner-authorization-sha256")
    args = parser.parse_args()
    if args.action == "prepare": result = prepare(Path(args.path), args.sha256)
    else:
        if not args.owner_authorization or not args.owner_authorization_sha256: raise RuntimeError("owner_authorization_required")
        result = materialize(Path(args.path), args.sha256, Path(args.owner_authorization), args.owner_authorization_sha256)
    print(canonical(result).decode(), end="")


if __name__ == "__main__": main()
