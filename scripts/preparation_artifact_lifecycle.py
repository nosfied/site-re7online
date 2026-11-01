"""Closed lifecycle contract for large preparation artifacts; never removes data."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
from typing import Any

SHA = set("0123456789abcdef")
STATES = {"OPEN", "SANITIZED", "RETENTION_DEBT"}
PROTECTIONS = {"DERIVED_WITH_AUTHORITY", "UNIQUE_PROTECTED", "EVIDENCE_PRESERVE"}
DISPOSITIONS = {"SANITIZE_AFTER_USE", "PRESERVE_AS_RETENTION_DEBT"}
ARTIFACT_KEYS = {"path", "scope", "owner", "budgetBytes", "budgetInodes",
                 "protection", "authority", "terminalDisposition", "equivalenceSha256",
                 "operation"}
OPERATION_KEYS = {"name", "kind", "artifactIndex", "predictedBytes", "predictedInodes"}


def _require(condition: bool, predicate: str) -> None:
    if not condition:
        raise ValueError(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _digest(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and set(value) <= SHA


def validate_artifacts(items: Any) -> list[dict[str, Any]]:
    _require(isinstance(items, list) and bool(items), "preparation_artifacts_required")
    paths: set[str] = set()
    result = []
    for item in items:
        _require(isinstance(item, dict) and set(item) == ARTIFACT_KEYS,
                 "preparation_artifact_schema")
        path = Path(item["path"]) if isinstance(item.get("path"), str) else Path(".")
        _require(path.is_absolute() and Path(os.path.abspath(path)) == path and str(path) not in paths,
                 "preparation_artifact_path")
        paths.add(str(path))
        _require(isinstance(item["scope"], str) and item["scope"].strip(),
                 "preparation_artifact_scope")
        _require(isinstance(item["owner"], str) and item["owner"].strip(),
                 "preparation_artifact_owner")
        for key in ("budgetBytes", "budgetInodes"):
            _require(type(item[key]) is int and item[key] >= 0,
                     "preparation_artifact_budget")
        _require(item["protection"] in PROTECTIONS,
                 "preparation_artifact_protection")
        _require(item["terminalDisposition"] in DISPOSITIONS,
                 "preparation_artifact_disposition")
        _require(_digest(item["equivalenceSha256"]),
                 "preparation_artifact_equivalence")
        operation = item["operation"]
        _require(isinstance(operation, dict) and set(operation) == OPERATION_KEYS and
                 isinstance(operation["name"], str) and operation["name"] and
                 operation["kind"] in {"copy", "tar"} and
                 type(operation["artifactIndex"]) is int and operation["artifactIndex"] >= 0 and
                 type(operation["predictedBytes"]) is int and operation["predictedBytes"] > 0 and
                 type(operation["predictedInodes"]) is int and operation["predictedInodes"] > 0 and
                 item["budgetBytes"] >= operation["predictedBytes"] and
                 item["budgetInodes"] >= operation["predictedInodes"],
                 "preparation_artifact_operation_budget")
        authority = item["authority"]
        if item["protection"] == "DERIVED_WITH_AUTHORITY":
            _require(isinstance(authority, dict) and set(authority) == {"path", "sha256"},
                     "preparation_artifact_authority")
            authority_path = Path(authority["path"])
            _require(authority_path.is_absolute() and _digest(authority["sha256"]),
                     "preparation_artifact_authority")
        else:
            _require(authority is None, "preparation_artifact_authority_unexpected")
        result.append(item)
    return result


def validate_contract(value: Any) -> list[dict[str, Any]]:
    _require(isinstance(value, dict) and set(value) == {
        "schemaVersion", "generationId", "reservationRoot", "preparationArtifacts"
    } and value.get("schemaVersion") == 1 and
             isinstance(value.get("generationId"), str) and value["generationId"] and
             isinstance(value.get("reservationRoot"), str) and
             Path(value["reservationRoot"]).is_absolute(),
             "preparation_artifact_contract_schema")
    return validate_artifacts(value["preparationArtifacts"])


def stable_contract(path: Path, expected_sha256: str) -> tuple[dict[str, Any], bytes]:
    _require(path.is_absolute() and _digest(expected_sha256), "preparation_contract_identity")
    before = path.lstat()
    _require(not path.is_symlink() and stat.S_ISREG(before.st_mode) and
             stat.S_IMODE(before.st_mode) == 0o600, "preparation_contract_private")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd); raw = b""
        while chunk := os.read(fd, 1024 * 1024): raw += chunk
        after = os.fstat(fd)
    finally:
        os.close(fd)
    key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    _require(key(before) == key(opened) == key(after) == key(path.lstat()),
             "preparation_contract_changed")
    _require(sha256(raw) == expected_sha256, "preparation_contract_hash")
    value = json.loads(raw)
    validate_contract(value)
    return value, raw


def lifecycle_value(contract: dict[str, Any], state: str, event: str,
                    failure: str | None = None,
                    realized: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    _require(state in STATES, "preparation_lifecycle_state")
    value = {"schemaVersion": 1, "generationId": contract["generationId"],
             "state": state, "event": event,
             "reservationRoot": contract["reservationRoot"],
             "preparationArtifacts": contract["preparationArtifacts"]}
    if failure is not None:
        value["failureClass"] = failure
    if realized is not None:
        value["realized"] = realized
    return value


def validate_existing_lifecycles(parent: Path, contract: dict[str, Any]) -> dict[str, int]:
    """Scope blocks duplicates; reservations share one authenticated domain root."""
    _require(Path(contract["reservationRoot"]) == parent,
             "preparation_reservation_root_mismatch")
    reserved_bytes = reserved_inodes = 0
    requested = contract["preparationArtifacts"]
    for path in sorted(parent.glob("*/preparation-artifacts.lifecycle.private.json")):
        before = path.lstat()
        _require(not path.is_symlink() and stat.S_ISREG(before.st_mode) and
                 stat.S_IMODE(before.st_mode) == 0o600 and
                 before.st_uid == os.geteuid(), "preparation_lifecycle_private")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd); chunks = []
            while chunk := os.read(fd, 1024 * 1024): chunks.append(chunk)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        _require(key(before) == key(opened) == key(after) == key(path.lstat()),
                 "preparation_lifecycle_changed")
        raw = b"".join(chunks)
        value = json.loads(raw)
        _require(isinstance(value, dict) and value.get("state") in STATES and
                 value.get("schemaVersion") == 1 and
                 value.get("reservationRoot") == contract["reservationRoot"],
                 "preparation_lifecycle_invalid")
        artifacts = validate_artifacts(value.get("preparationArtifacts"))
        if value["state"] in {"OPEN", "RETENTION_DEBT"}:
            reserved_bytes += sum(item["budgetBytes"] for item in artifacts)
            reserved_inodes += sum(item["budgetInodes"] for item in artifacts)
            for old in artifacts:
                for new in requested:
                    if (old["scope"] == new["scope"] and
                            old["equivalenceSha256"] == new["equivalenceSha256"]):
                        raise ValueError("equivalent_preparation_pending")
    usage = os.statvfs(parent)
    needed_bytes = reserved_bytes + sum(item["budgetBytes"] for item in requested)
    needed_inodes = reserved_inodes + sum(item["budgetInodes"] for item in requested)
    _require(usage.f_bavail * usage.f_frsize >= needed_bytes,
             "preparation_shared_capacity_bytes")
    _require(usage.f_favail >= needed_inodes, "preparation_shared_capacity_inodes")
    return {"reservedBytes": reserved_bytes, "reservedInodes": reserved_inodes,
            "requiredBytes": needed_bytes, "requiredInodes": needed_inodes}


def authenticate_operations(contract: dict[str, Any], operations: list[dict[str, Any]],
                            generation: Path) -> None:
    _require(all(op["kind"] in {"copy", "tar"} for op in operations),
             "preparation_untracked_operation")
    declared = {item["path"]: item for item in contract["preparationArtifacts"]}
    relevant = [op for op in operations if op["kind"] in {"copy", "tar"}]
    actual = {str(generation / op["target"]) for op in relevant}
    _require(actual == set(declared), "preparation_operation_contract_mismatch")
    for op in relevant:
        item = declared[str(generation / op["target"])]
        expected = item["operation"]
        _require(expected == {"name": op["name"], "kind": op["kind"],
                              "artifactIndex": op["artifactIndex"],
                              "predictedBytes": op["allocatedBudgetBytes"],
                              "predictedInodes": 1},
                 "preparation_operation_binding_drift")


def measure_realized(contract: dict[str, Any], require_all: bool = True,
                     enforce_budget: bool = True) -> list[dict[str, Any]]:
    result = []
    for item in contract["preparationArtifacts"]:
        path = Path(item["path"])
        if not path.exists() and not path.is_symlink():
            _require(not require_all, "preparation_realized_missing")
            continue
        info = path.lstat()
        _require(not path.is_symlink() and stat.S_ISREG(info.st_mode),
                 "preparation_realized_type")
        observed = {"path": str(path), "allocatedBytes": info.st_blocks * 512,
                    "allocatedInodes": 1}
        result.append(observed)
        if enforce_budget:
            _require(observed["allocatedBytes"] <= item["budgetBytes"] and
                     observed["allocatedInodes"] <= item["budgetInodes"],
                     "preparation_realized_budget_exceeded")
    return result


def replace_lifecycle(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        raw = canonical(value)
        if os.write(fd, raw) != len(raw):
            raise OSError("preparation_lifecycle_short_write")
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def close_lifecycle(path: Path, expected_sha256: str, state: str,
                    evidence_sha256: str, owner: str, reason: str) -> dict[str, Any]:
    _require(state in {"SANITIZED", "RETENTION_DEBT"} and _digest(evidence_sha256),
             "preparation_closure_schema")
    _require(owner.strip() and reason.strip(), "preparation_closure_responsibility")
    raw = path.read_bytes()
    _require(sha256(raw) == expected_sha256, "preparation_lifecycle_hash")
    current = json.loads(raw)
    artifacts = validate_artifacts(current.get("preparationArtifacts"))
    _require(current.get("state") in {"OPEN", "RETENTION_DEBT"},
             "preparation_lifecycle_not_closable")
    present = [item["path"] for item in artifacts
               if Path(item["path"]).exists() or Path(item["path"]).is_symlink()]
    if state == "SANITIZED":
        _require(not present, "preparation_sanitized_artifact_present")
    else:
        _require(bool(present), "preparation_debt_without_residue")
    value = {**current, "state": state, "event": "CLOSURE_RECORDED",
             "closure": {"owner": owner, "reason": reason,
                         "evidenceSha256": evidence_sha256,
                         "remainingPaths": present}}
    replace_lifecycle(path, value)
    return value
