#!/usr/bin/env python3
"""Build and verify deterministic immutable Converta releases off-host."""

from __future__ import annotations

import argparse
import datetime as dt
from contextlib import contextmanager
import fcntl
import hashlib
import io
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from typing import Any, Iterable


SHA40 = re.compile(r"[0-9a-f]{40}")
SHA256 = re.compile(r"[0-9a-f]{64}")
RELEASE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
COMPONENTS = ("api", "frontend")
RUNTIMES = ("api-runtime", "frontend-runtime")
A959_LEGACY_RELEASE_ID = "immutable-a959129e-vps-20261026T023100Z"
A959_LEGACY_TARGET = "a959129e39a07c52881fb7f5cbf21a7f6f1a80ff"
PRIVATE_DATA_OVERLAY = PurePosixPath("api-runtime/.data")
PRIVATE_DATA_POLICY = "PRIVATE_DATA_NEVER_RETIRE"
A959_PRIVATE_DATA_OVERLAY = PRIVATE_DATA_OVERLAY
F160_LEGACY_RELEASE_ID = "immutable-f1602787-vps-20261026T174702Z"
F160_LEGACY_TARGET = "f16027874e91c86e5f818d0888e6d735b07a6eda"
F160_RUNTIME_CACHE_OVERLAY = PurePosixPath("frontend-runtime/.next/cache")
P00_LEGACY_RUNTIME_CACHE_RELEASES = {
    "immutable-d7de6453-vps-20261024T221500Z":
        "d7de6453aeab6d117e8d79a1dc3a0722875f39cc",
    "immutable-ec2a9fde-vps-20261024T162005Z":
        "ec2a9fde99b6421a85256f14604bd469879f4f2a",
}
MANIFEST_FIELDS = {
    "schemaVersion", "producer", "releaseId", "targetCommit", "components",
    "sourceDateEpoch", "builtAt", "toolchain", "runtimes", "indexSha256",
    "reproducibility",
}
CAPACITY_FIELDS = {
    "schemaVersion", "contractId", "capturedAtUtc", "targetCommit", "releaseId",
    "filesystemPath", "buildWorkspaceGrowthBytes", "runtimePayloadBytes",
    "packageTemporaryBytes", "independentVerificationBytes", "failureEvidenceBytes",
    "operationalReserveBytes", "peakInodes", "operationalReserveInodes",
}
CAPACITY_BYTE_FIELDS = {
    "buildWorkspaceGrowthBytes", "runtimePayloadBytes", "packageTemporaryBytes",
    "independentVerificationBytes", "failureEvidenceBytes", "operationalReserveBytes",
}
CAPACITY_INODE_FIELDS = {"peakInodes", "operationalReserveInodes"}
CAPACITY_OBSERVATION_MARGIN_SOURCE = "failureEvidenceBytes"
CAPACITY_SAMPLE_INTERVAL_SECONDS = 0.25
P00_STATIC_FLOOR_OVERRIDE_REASON = "P00_TENANT_ISOLATION_RECOVERY"
P00_STATIC_FLOOR_OVERRIDE_MAX_LIFETIME = dt.timedelta(hours=6)
P00_STATIC_FLOOR_OVERRIDE_FIELDS = {
    "schemaVersion", "targetCommit", "releaseId", "capacityContractSha256",
    "reason", "responsible", "issuedAtUtc", "expiresAtUtc",
}
ARTIFACT_CLASSES = {
    "PACKAGE_PRESERVE", "EVIDENCE_PRESERVE", "RELEASE_RUNTIME",
    "DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING",
    "PRIVATE_DATA_NEVER_RETIRE",
}
REVIEW_STATES = {
    "ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY", "CANDIDATE_PENDING_ACTIVATION",
    "RETIREMENT_READY", "SANITIZED", "QUARANTINED", "PRESERVE_OVERRIDE",
}
ROOT_POLICY_KEYS = {"repository", "worktrees", "outputs", "releases", "staging", "evidence"}
ROOT_POLICY_ENTRY_KEYS = {"path", "ownerUid", "groupGid", "allowedModes"}
INSTALL_RECOVERY_FIELDS = {
    "schemaVersion", "targetCommit", "releaseId", "packagePath", "packageSha256",
    "stagingPath", "stagingDevice", "stagingInode", "ownerUid", "groupGid",
    "mode", "finalPath",
}


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_bytes(path: Path) -> tuple[bytes, os.stat_result]:
    try:
        before = path.lstat()
        if not stat.S_ISREG(before.st_mode) or path.is_symlink():
            deny(f"not_regular:{path.name}")
        with path.open("rb") as handle:
            value = handle.read()
        after = path.lstat()
    except OSError:
        deny(f"read_failed:{path.name}")
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                              value.st_mtime_ns, value.st_ctime_ns)
    if identity(before) != identity(after) or len(value) != after.st_size:
        deny(f"changed_during_read:{path.name}")
    return value, after


def read_capacity_contract(path: Path, repo: Path, output_parent: Path,
                           target: str, release_id: str,
                           p00_override_path: Path | None = None,
                           p00_override_sha256: str | None = None,
                           now: dt.datetime | None = None) -> dict[str, Any]:
    if not path.is_absolute():
        deny("capacity_contract_absolute")
    raw, info = stable_bytes(path)
    if stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid():
        deny("capacity_contract_private")
    contract = json_object(raw, "capacity-contract")
    if set(contract) != CAPACITY_FIELDS or contract.get("schemaVersion") != 1:
        deny("capacity_contract_schema")
    if (contract.get("targetCommit") != target or
            contract.get("releaseId") != release_id):
        deny("capacity_contract_identity")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", str(contract.get("contractId", ""))):
        deny("capacity_contract_id")
    try:
        captured = dt.datetime.fromisoformat(str(contract.get("capturedAtUtc", "")).replace("Z", "+00:00"))
    except ValueError:
        deny("capacity_contract_time")
    if captured.tzinfo is None or captured.utcoffset() != dt.timedelta(0):
        deny("capacity_contract_time")
    for field in CAPACITY_BYTE_FIELDS | CAPACITY_INODE_FIELDS:
        value = contract.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            deny(f"capacity_contract_value:{field}")
    filesystem = Path(str(contract.get("filesystemPath", "")))
    if not filesystem.is_absolute() or filesystem.is_symlink():
        deny("capacity_contract_filesystem")
    try:
        filesystem = filesystem.resolve(strict=True)
        repo_info = repo.stat()
        output_info = output_parent.resolve(strict=True).stat()
        filesystem_info = filesystem.stat()
    except OSError:
        deny("capacity_contract_filesystem")
    if (not filesystem.is_dir() or repo_info.st_dev != filesystem_info.st_dev or
            output_info.st_dev != filesystem_info.st_dev):
        deny("capacity_contract_filesystem")
    capacity_sha256 = sha256_bytes(raw)
    if (p00_override_path is None) != (p00_override_sha256 is None):
        deny("p00_static_floor_override_pair")
    override = None
    if p00_override_path is not None and p00_override_sha256 is not None:
        override = read_p00_static_floor_override(
            p00_override_path, p00_override_sha256, target, release_id,
            capacity_sha256, now,
        )
    usage = os.statvfs(filesystem)
    free_bytes = usage.f_bavail * usage.f_frsize
    free_inodes = usage.f_favail
    contract_required_bytes = sum(contract[field] for field in CAPACITY_BYTE_FIELDS)
    # Checkpoints are samples, not proof that a short-lived allocation was seen.
    # Keep one additional, contract-sized failure-evidence envelope available so
    # an unobserved excursion cannot consume the bytes needed to durably close the
    # lifecycle.  This is derived from the reviewed contract, not a host-wide
    # numeric floor.
    admission_margin_bytes = contract[CAPACITY_OBSERVATION_MARGIN_SOURCE]
    required_bytes = contract_required_bytes + admission_margin_bytes
    required_inodes = sum(contract[field] for field in CAPACITY_INODE_FIELDS)
    if free_bytes < required_bytes:
        deny(f"capacity_bytes:available={free_bytes}:required={required_bytes}")
    if free_inodes < required_inodes:
        deny(f"capacity_inodes:available={free_inodes}:required={required_inodes}")
    result = {
        "budgets": {field: contract[field] for field in CAPACITY_BYTE_FIELDS | CAPACITY_INODE_FIELDS},
        "device": filesystem_info.st_dev,
        "contractId": contract["contractId"],
        "contractSha256": capacity_sha256,
        "filesystemPath": str(filesystem),
        "availableBytes": free_bytes,
        "availableInodes": free_inodes,
        "requiredBytes": required_bytes,
        "contractRequiredBytes": contract_required_bytes,
        "requiredInodes": required_inodes,
        "operationalReserveBytes": contract["operationalReserveBytes"],
        "operationalReserveInodes": contract["operationalReserveInodes"],
        "admissionMarginBytes": admission_margin_bytes,
        "admissionMarginSource": CAPACITY_OBSERVATION_MARGIN_SOURCE,
        "admissionFormula": "sum(capacityByteFields)+failureEvidenceBytes",
    }
    if override is not None:
        result["p00StaticFloorOverride"] = override
    return result


@contextmanager
def generation_build_window(parent: Path):
    # Separate from the production deployment window. Serialize cooperating
    # producers sharing this output root; never unlink or expire the lock.
    lock = parent / ".generation-build.lock"
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            deny("generation_lock_identity")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            deny("generation_build_busy")
        yield
    finally:
        os.close(fd)


def parse_utc(value: object, predicate: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        deny(predicate)
    if parsed.tzinfo is None or parsed.utcoffset() != dt.timedelta(0):
        deny(predicate)
    return parsed


def read_p00_static_floor_override(path: Path, expected_sha256: str, target: str,
                                   release_id: str, capacity_sha256: str,
                                   now: dt.datetime | None = None) -> dict[str, Any]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha256):
        deny("p00_static_floor_override_identity")
    raw, info = stable_bytes(path)
    if (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or
            sha256_bytes(raw) != expected_sha256):
        deny("p00_static_floor_override_identity")
    override = json_object(raw, "p00-static-floor-override")
    if (set(override) != P00_STATIC_FLOOR_OVERRIDE_FIELDS or
            override.get("schemaVersion") != 1):
        deny("p00_static_floor_override_schema")
    if (override.get("targetCommit") != target or
            override.get("releaseId") != release_id or
            override.get("capacityContractSha256") != capacity_sha256):
        deny("p00_static_floor_override_binding")
    if override.get("reason") != P00_STATIC_FLOOR_OVERRIDE_REASON:
        deny("p00_static_floor_override_reason")
    responsible = override.get("responsible")
    if not isinstance(responsible, str) or not responsible.strip():
        deny("p00_static_floor_override_responsible")
    issued = parse_utc(override.get("issuedAtUtc"), "p00_static_floor_override_time")
    expires = parse_utc(override.get("expiresAtUtc"), "p00_static_floor_override_time")
    current = now or dt.datetime.now(dt.timezone.utc)
    if (issued > current or expires <= current or expires <= issued or
            expires - issued > P00_STATIC_FLOOR_OVERRIDE_MAX_LIFETIME):
        deny("p00_static_floor_override_time")
    return {
        "path": str(path), "sha256": expected_sha256,
        "capacityContractSha256": capacity_sha256,
        "reason": P00_STATIC_FLOOR_OVERRIDE_REASON,
        "responsible": responsible,
        "issuedAtUtc": override["issuedAtUtc"],
        "expiresAtUtc": override["expiresAtUtc"],
        "historicalWaiver": "MINIMUM_BUILD_FREE_BYTES",
        "effectiveAdmissionWaiver": False,
    }


def require_generation_reviews(parent: Path, now: dt.datetime | None = None) -> list[dict[str, str]]:
    now = now or dt.datetime.now(dt.timezone.utc)
    accepted = []
    pending_candidates = 0
    for directory in sorted(parent.iterdir()):
        if directory.is_symlink():
            deny("generation_directory_symlink")
        if not directory.is_dir():
            continue
        lifecycle_file = directory / "generation-lifecycle.private.json"
        if not lifecycle_file.exists() and not lifecycle_file.is_symlink():
            continue  # Legacy roots require the separate operational inventory.
        raw, info = stable_bytes(lifecycle_file)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
            deny("generation_lifecycle_private")
        lifecycle = json_object(raw, "generation-lifecycle")
        generation = lifecycle.get("generationId")
        if (lifecycle.get("schemaVersion") != 1 or not isinstance(generation, str) or
                not RELEASE_ID.fullmatch(generation) or lifecycle.get("state") not in {"COMPLETE", "FAILED"}):
            deny("generation_not_terminal")
        review_path = directory / "generation-review.private.json"
        if not review_path.exists() and not review_path.is_symlink():
            deny(f"generation_review_pending:{generation}")
        review_raw, review_info = stable_bytes(review_path)
        if review_info.st_uid != os.geteuid() or stat.S_IMODE(review_info.st_mode) != 0o600:
            deny("generation_review_private")
        review = json_object(review_raw, "generation-review")
        common = {"schemaVersion", "generationId", "lifecycleSha256", "reviewer", "reason", "evidenceSha256"}
        version = review.get("schemaVersion")
        debt_reason = None
        if (review.get("generationId") != generation or
                review.get("lifecycleSha256") != sha256_bytes(raw) or
                not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip() or
                not isinstance(review.get("reason"), str) or not review["reason"].strip() or
                not isinstance(review.get("evidenceSha256"), str) or not SHA256.fullmatch(review["evidenceSha256"])):
            deny(f"generation_review_invalid:{generation}")
        if version == 1:
            if set(review) != common | {"decision"} or review.get("decision") not in {"PRESERVE", "SANITIZED"}:
                deny(f"generation_review_invalid:{generation}")
            state = "SANITIZED" if review["decision"] == "SANITIZED" else "RETENTION_DEBT"
            debt_reason = "v1_preserve" if review["decision"] == "PRESERVE" else None
        elif version == 2:
            state = review.get("state")
            expected = common | {"state"}
            if state == "PRESERVE_OVERRIDE":
                expected |= {"retainedBytes", "responsible", "expiresAtUtc"}
            if set(review) != expected or state not in REVIEW_STATES:
                deny(f"generation_review_invalid:{generation}")
            if state == "PRESERVE_OVERRIDE":
                if (not isinstance(review.get("retainedBytes"), int) or isinstance(review["retainedBytes"], bool) or
                        review["retainedBytes"] < 0 or not isinstance(review.get("responsible"), str) or
                        not review["responsible"].strip()):
                    deny(f"generation_override_invalid:{generation}")
                if parse_utc(review.get("expiresAtUtc"), f"generation_override_invalid:{generation}") <= now:
                    deny(f"generation_override_expired:{generation}")
        else:
            deny(f"generation_review_invalid:{generation}")
        if state in {"RETENTION_DEBT", "RETIREMENT_READY", "QUARANTINED"}:
            deny(f"retention_debt:{generation}:{debt_reason or state.lower()}")
        if state == "CANDIDATE_PENDING_ACTIVATION":
            pending_candidates += 1
            if pending_candidates:
                # This build would create the second not-yet-installed candidate.
                deny(f"second_candidate_pending:{generation}")
        accepted.append({"generationId": generation, "directory": str(directory),
                         "lifecycleSha256": sha256_bytes(raw),
                         "reviewSha256": sha256_bytes(review_raw), "state": state})
    return accepted


def path_metrics(path: Path) -> dict[str, Any]:
    if not path.exists() and not path.is_symlink():
        return {"identity": None, "sizeBytes": 0, "allocatedBytes": 0, "inodes": 0,
                "structuralSha256": None}
    root = path.lstat()
    seen: set[tuple[int, int]] = set()
    size = allocated = inodes = 0
    items = [path]
    if stat.S_ISDIR(root.st_mode) and not path.is_symlink():
        items.extend(path.rglob("*"))
    structure = hashlib.sha256()
    for item in sorted(items, key=lambda candidate: os.fsencode(str(candidate.relative_to(path.parent)))):
        info = item.lstat()
        identity = (info.st_dev, info.st_ino)
        relative = "." if item == path else item.relative_to(path).as_posix()
        kind = "symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "regular" if stat.S_ISREG(info.st_mode) else "other"
        link = os.readlink(item) if kind == "symlink" else None
        structure.update(canonical_json({"path": relative, "type": kind,
                                         "mode": stat.S_IMODE(info.st_mode),
                                         "size": info.st_size, "mtimeNs": info.st_mtime_ns,
                                         "link": link}))
        if identity in seen:
            continue
        seen.add(identity)
        size += info.st_size
        allocated += info.st_blocks * 512
        inodes += 1
    return {
        "identity": {"device": root.st_dev, "inode": root.st_ino},
        "sizeBytes": size,
        "allocatedBytes": allocated,
        "inodes": inodes,
        "structuralSha256": structure.hexdigest(),
    }


def artifact_entry(path: Path, release_id: str, target: str, expected_type: str,
                   artifact_class: str, retirable_on: str,
                   dependencies: list[str], digest: dict[str, str] | None = None,
                   state: str = "ACTIVE_DEPENDENCY") -> dict[str, Any]:
    if artifact_class not in ARTIFACT_CLASSES or not path.is_absolute():
        deny("artifact_contract_entry")
    return {
        "path": str(path), "releaseId": release_id, "targetCommit": target,
        "expectedType": expected_type, **path_metrics(path), "digest": digest,
        "class": artifact_class, "state": state, "retirableOn": retirable_on,
        "dependencies": dependencies,
    }


def build_artifact_contract(args: argparse.Namespace, lifecycle_path: Path,
                            state: str, verified: dict[str, Any] | None = None,
                            package_sha: str | None = None,
                            staging: dict[str, Any] | None = None) -> dict[str, Any]:
    release_root = args.output / args.release_id
    installed_release_root = args.installed_releases_root / args.release_id
    package = args.output / f"{args.release_id}.tar.xz"
    package_verified = verified is not None and package_sha is not None
    entries = [
        artifact_entry(package, args.release_id, args.target, "regular_file", "PACKAGE_PRESERVE",
                       "NEVER_AUTOMATIC", ["transport_identity"],
                       {"sha256": package_sha} if package_sha else None, "ACTIVE_DEPENDENCY"),
        artifact_entry(release_root / "manifest.json", args.release_id, args.target, "regular_file",
                       "PACKAGE_PRESERVE", "NEVER_AUTOMATIC", ["release_identity"],
                       {"sha256": verified["manifestSha256"]} if verified else None),
        artifact_entry(release_root / "index.sha256", args.release_id, args.target, "regular_file",
                       "PACKAGE_PRESERVE", "NEVER_AUTOMATIC", ["integral_inventory"],
                       {"sha256": verified["indexSha256"]} if verified else None),
        artifact_entry(lifecycle_path, args.release_id, args.target, "regular_file", "EVIDENCE_PRESERVE",
                       "NEVER_AUTOMATIC", ["generation_audit"],
                       {"sha256": sha256_bytes(stable_bytes(lifecycle_path)[0])}),
        artifact_entry(args.capacity_contract.resolve(strict=True), args.release_id, args.target,
                       "regular_file", "EVIDENCE_PRESERVE", "NEVER_AUTOMATIC",
                       ["capacity_authorization"],
                       {"sha256": sha256_bytes(stable_bytes(args.capacity_contract)[0])}),
        artifact_entry(args.output / "failure-evidence.private", args.release_id, args.target, "directory",
                       "EVIDENCE_PRESERVE", "NEVER_AUTOMATIC", ["failure_diagnostics"]),
        artifact_entry(installed_release_root, args.release_id, args.target, "directory", "RELEASE_RUNTIME",
                       "OUTSIDE_ACTIVE_ROLLBACK_TRANSITIVE_GRAPH", ["active_rollback_graph"],
                       {"indexSha256": verified["indexSha256"]} if verified else None,
                       "CANDIDATE_PENDING_ACTIVATION" if package_verified else "ACTIVE_DEPENDENCY"),
        artifact_entry(args.repo.resolve(strict=True), args.release_id, args.target, "directory",
                       "DERIVED_WORKTREE", "PACKAGE_VERIFIED_CONTROL_PLANE_COPIED_NO_WRITER",
                       ["package_verified", "control_plane_authenticated", "writer_lock_free"],
                       {"gitCommit": args.target}, "ACTIVE_DEPENDENCY"),
        artifact_entry(release_root / "api-runtime", args.release_id, args.target, "directory",
                       "DERIVED_OUTPUT_RUNTIME", "RELEASE_INSTALLED_VERIFIED_OR_CANDIDATE_SUPERSEDED",
                       ["candidate_activation_or_supersession"],
                       {"indexSha256": verified["indexSha256"]} if verified else None,
                       "CANDIDATE_PENDING_ACTIVATION" if package_verified else "ACTIVE_DEPENDENCY"),
        artifact_entry(release_root / "frontend-runtime", args.release_id, args.target, "directory",
                       "DERIVED_OUTPUT_RUNTIME", "RELEASE_INSTALLED_VERIFIED_OR_CANDIDATE_SUPERSEDED",
                       ["candidate_activation_or_supersession"],
                       {"indexSha256": verified["indexSha256"]} if verified else None,
                       "CANDIDATE_PENDING_ACTIVATION" if package_verified else "ACTIVE_DEPENDENCY"),
    ]
    if getattr(args, "p00_static_floor_override", None) is not None:
        override_raw, override_info = stable_bytes(args.p00_static_floor_override)
        if (override_info.st_uid != os.geteuid() or
                stat.S_IMODE(override_info.st_mode) != 0o600 or
                sha256_bytes(override_raw) != args.p00_static_floor_override_sha256):
            deny("p00_static_floor_override_identity")
        entries.append(artifact_entry(
            args.p00_static_floor_override.resolve(strict=True), args.release_id, args.target,
            "regular_file", "EVIDENCE_PRESERVE", "NEVER_AUTOMATIC",
            ["p00_static_floor_authorization", "capacity_authorization"],
            {"sha256": sha256_bytes(override_raw)},
        ))
    if staging is not None:
        entries.append(staging)
    previous_initial: dict[str, Any] = {}
    contract_path = args.output / "generation-artifacts.private.json"
    if contract_path.exists() and not contract_path.is_symlink():
        prior = json_object(stable_bytes(contract_path)[0], "generation-artifacts")
        previous_initial = {
            item["path"]: item.get("initialIdentity", item.get("identity"))
            for item in prior.get("artifacts", []) if isinstance(item, dict) and isinstance(item.get("path"), str)
        }
    for entry in entries:
        observed = entry.pop("identity")
        initial = previous_initial.get(entry["path"])
        entry["initialIdentity"] = initial if initial is not None else observed
        entry["observedIdentity"] = observed
    return {
        "schemaVersion": 1, "generationId": args.release_id,
        "releaseId": args.release_id, "targetCommit": args.target, "state": state,
        "writerLockPath": str(args.output.parent / ".generation-build.lock"),
        "classes": sorted(ARTIFACT_CLASSES), "artifacts": entries,
        "privateDataPolicy": PRIVATE_DATA_POLICY,
        "privateDataOverlay": {
            "path": PRIVATE_DATA_OVERLAY.as_posix(),
            "classification": PRIVATE_DATA_POLICY,
            "state": "ACTIVE_DEPENDENCY",
            "retirableOn": "NEVER_AUTOMATIC",
        },
    }


def capacity_checkpoint(capacity: dict[str, Any], phase: str,
                        remaining: Iterable[str] = (),
                        remaining_overrides: dict[str, int] | None = None,
                        remaining_peak_inodes: int | None = None) -> dict[str, Any]:
    filesystem = Path(capacity["filesystemPath"])
    if filesystem.stat().st_dev != capacity["device"]:
        deny(f"capacity_filesystem_changed:{phase}")
    usage = os.statvfs(filesystem)
    free_bytes, free_inodes = usage.f_bavail * usage.f_frsize, usage.f_favail
    budget = capacity["budgets"]
    remaining_overrides = remaining_overrides or {}
    if not set(remaining_overrides).issubset(set(remaining)):
        deny(f"capacity_checkpoint_override:{phase}")
    required_bytes = (budget["operationalReserveBytes"] + budget["failureEvidenceBytes"] +
                      capacity["admissionMarginBytes"])
    required_bytes += sum(remaining_overrides.get(field, budget[field]) for field in remaining)
    if remaining_peak_inodes is None:
        remaining_peak_inodes = budget["peakInodes"]
    if (not isinstance(remaining_peak_inodes, int) or isinstance(remaining_peak_inodes, bool) or
            remaining_peak_inodes < 0 or remaining_peak_inodes > budget["peakInodes"]):
        deny(f"capacity_checkpoint_inode_override:{phase}")
    required_inodes = budget["operationalReserveInodes"] + remaining_peak_inodes
    if free_bytes < required_bytes or free_inodes < required_inodes:
        deny(f"capacity_checkpoint:{phase}:bytes={free_bytes}:required={required_bytes}:"
             f"inodes={free_inodes}:requiredInodes={required_inodes}")
    return {"phase": phase, "availableBytes": free_bytes, "availableInodes": free_inodes,
            "requiredBytes": required_bytes, "requiredInodes": required_inodes,
            "remainingPeakInodes": remaining_peak_inodes,
            "remainingBudgets": {
                field: remaining_overrides.get(field, budget[field]) for field in remaining
            }}


class CapacityPhaseMonitor:
    """Bounded summary telemetry; sampling is an observed minimum, never a peak proof."""

    def __init__(self, capacity: dict[str, Any], phase: str,
                 admission_required_bytes: int, admission_required_inodes: int,
                 active_budget_bytes: int, active_budget_inodes: int,
                 interval: float = CAPACITY_SAMPLE_INTERVAL_SECONDS) -> None:
        self.filesystem = Path(capacity["filesystemPath"])
        self.device = capacity["device"]
        self.phase = phase
        self.admission_required_bytes = admission_required_bytes
        self.admission_required_inodes = admission_required_inodes
        self.active_budget_bytes = active_budget_bytes
        self.active_budget_inodes = active_budget_inodes
        self.protected_bytes = admission_required_bytes - active_budget_bytes
        self.protected_inodes = admission_required_inodes - active_budget_inodes
        if (self.protected_bytes < 0 or self.protected_inodes < 0 or
                active_budget_bytes < 0 or active_budget_inodes < 0):
            deny(f"capacity_phase_budget:{phase}")
        self.interval = interval
        self.started_ns = time.monotonic_ns()
        self.finished_ns = self.started_ns
        self.samples = 0
        self.gaps = 0
        self.min_bytes: int | None = None
        self.min_inodes: int | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _sample(self) -> None:
        try:
            if self.filesystem.stat().st_dev != self.device:
                self.gaps += 1
                return
            usage = os.statvfs(self.filesystem)
            available_bytes = usage.f_bavail * usage.f_frsize
            available_inodes = usage.f_favail
        except OSError:
            self.gaps += 1
            return
        self.samples += 1
        self.min_bytes = (available_bytes if self.min_bytes is None
                          else min(self.min_bytes, available_bytes))
        self.min_inodes = (available_inodes if self.min_inodes is None
                           else min(self.min_inodes, available_inodes))

    def _poll(self) -> None:
        while not self._stop.wait(self.interval):
            self._sample()

    def start(self) -> None:
        self._sample()
        self._thread = threading.Thread(
            target=self._poll, name=f"capacity-{self.phase}", daemon=True
        )
        self._thread.start()

    def finish(self) -> dict[str, Any]:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(1.0, self.interval * 4))
            if self._thread.is_alive():
                self.gaps += 1
        self._sample()
        self.finished_ns = time.monotonic_ns()
        observed_below = (
            self.min_bytes is not None and self.min_inodes is not None and
            (self.min_bytes < self.protected_bytes or
             self.min_inodes < self.protected_inodes)
        )
        return {
            "phase": self.phase,
            "startedMonotonicNs": self.started_ns,
            "finishedMonotonicNs": self.finished_ns,
            "durationMonotonicNs": self.finished_ns - self.started_ns,
            "sampleIntervalMilliseconds": int(self.interval * 1000),
            "sampleCount": self.samples,
            "observationGaps": self.gaps,
            "minAvailableBytesObserved": self.min_bytes,
            "minAvailableInodesObserved": self.min_inodes,
            "admissionRequiredBytesBeforePhase": self.admission_required_bytes,
            "admissionRequiredInodesBeforePhase": self.admission_required_inodes,
            "activePhaseBudgetBytes": self.active_budget_bytes,
            "activePhaseBudgetInodes": self.active_budget_inodes,
            "protectedBytesDuringPhase": self.protected_bytes,
            "protectedInodesDuringPhase": self.protected_inodes,
            "observedBelowProtected": observed_below,
            "proofLimit": "SAMPLED_MINIMUM_NOT_CONTINUOUS_PEAK_GUARANTEE",
        }


def allocated_bytes(path: Path) -> int:
    total = 0
    for item in [path, *path.rglob("*")]:
        total += item.lstat().st_blocks * 512
    return total


def allocated_inode_identities(*paths: Path) -> set[tuple[int, int]]:
    identities: set[tuple[int, int]] = set()
    for path in paths:
        if not path.exists() or path.is_symlink():
            continue
        for item in [path, *path.rglob("*")]:
            info = item.lstat()
            identities.add((info.st_dev, info.st_ino))
    return identities


def write_lifecycle(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    if temporary.exists() or temporary.is_symlink():
        deny("lifecycle_temporary_exists")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(canonical_json(value))
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)
    os.replace(temporary, path)
    directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def read_build_id(path: Path) -> str:
    raw, _ = stable_bytes(path)
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError:
        deny("frontend_build_id_encoding")
    if text.endswith("\n"):
        text = text[:-1]
    if not text or "\n" in text or "\r" in text or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", text):
        deny("frontend_build_id_format")
    return text


def json_object(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(f"json_invalid:{label}")
    if not isinstance(value, dict):
        deny(f"json_object:{label}")
    return value


def write_private_failure_evidence(root: Path, stage: str, cwd: Path,
                                   exit_code: int, output: str) -> Path:
    if not re.fullmatch(r"[a-z0-9_]+", stage):
        deny("failure_stage")
    evidence = root / "failure-evidence.private"
    try:
        evidence.mkdir(mode=0o700)
    except FileExistsError:
        info = evidence.lstat()
        if not stat.S_ISDIR(info.st_mode) or evidence.is_symlink() or stat.S_IMODE(info.st_mode) != 0o700:
            deny("failure_evidence_directory")
    output_path = evidence / f"{stage}.output.private.log"
    metadata_path = evidence / f"{stage}.private.json"

    def exclusive_write(path: Path, raw: bytes) -> None:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(path, flags, 0o600)
        try:
            with os.fdopen(fd, "wb", closefd=False) as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
        finally:
            os.close(fd)

    raw = output.encode("utf-8", errors="backslashreplace")
    exclusive_write(output_path, raw)
    metadata = canonical_json({
        "schemaVersion": 1,
        "stage": stage,
        "cwd": str(cwd),
        "exitCode": exit_code,
        "outputFile": output_path.name,
        "outputSize": len(raw),
        "outputSha256": sha256_bytes(raw),
    })
    exclusive_write(metadata_path, metadata)
    directory_fd = os.open(evidence, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return metadata_path


def run(command: list[str], cwd: Path, env: dict[str, str], *,
        failure_root: Path | None = None, stage: str | None = None) -> str:
    result = subprocess.run(command, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        if failure_root is not None and stage is not None:
            evidence = write_private_failure_evidence(
                failure_root, stage, cwd, result.returncode, result.stdout
            )
            deny(f"command_failed:{stage}:cwd={cwd}:exit={result.returncode}:evidence={evidence}")
        deny(f"command_failed:{command[0]}:{result.returncode}")
    return result.stdout.strip()


def build_environment() -> dict[str, str]:
    allowed = {
        "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "XDG_CACHE_HOME",
        "npm_config_cache", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
    }
    return {name: value for name, value in os.environ.items() if name in allowed}


def ensure_clean_repo(repo: Path, target: str) -> None:
    if not repo.is_absolute() or not repo.is_dir():
        deny("repo_absolute_directory")
    head = run(["git", "rev-parse", "HEAD"], repo, os.environ.copy())
    if head != target:
        deny("target_head_mismatch")
    status = run(["git", "status", "--porcelain", "--untracked-files=normal"], repo, os.environ.copy())
    if status:
        deny("worktree_not_clean")


def toolchain(repo: Path, env: dict[str, str], failure_root: Path | None = None) -> dict[str, str]:
    node = run(["node", "--version"], repo, env, failure_root=failure_root, stage="node_version")
    npm = run(["npm", "--version"], repo, env, failure_root=failure_root, stage="npm_version")
    if node != "v20.20.0":
        deny(f"node_version:{node}")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", npm):
        deny("npm_version")
    return {"node": node, "npm": npm}


def forbidden(relative: PurePosixPath) -> bool:
    lowered = [part.casefold() for part in relative.parts]
    name = lowered[-1] if lowered else ""
    # Runtime dependencies are copied from a clean npm install. Package-internal
    # directories such as openai/resources/uploads are executable dependency
    # content, not application uploads. Apply the operational-data denylist only
    # outside node_modules; the top-level runtime inventory remains allowlisted.
    application_parts = lowered if "node_modules" not in lowered else lowered[:lowered.index("node_modules")]
    if any(part in {".git", ".cache", "cache", ".data", "coverage", "logs", "log", "evidence",
                    "evidences", "uploads", "upload", "worker", "worker-runtime",
                    "whatsapp-web-worker"} for part in application_parts):
        return True
    if name == ".env" or name.startswith(".env.") or name.endswith(".log"):
        return True
    if name.endswith((".tar", ".tar.xz", ".tmp")):
        return True
    return False


def copy_entry(source: Path, destination: Path, relative: PurePosixPath) -> None:
    if forbidden(relative):
        return
    info = source.lstat()
    if stat.S_ISLNK(info.st_mode):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.symlink_to(os.readlink(source))
    elif stat.S_ISDIR(info.st_mode):
        destination.mkdir(parents=True, exist_ok=True)
        for child in sorted(source.iterdir(), key=lambda item: item.name):
            copy_entry(child, destination / child.name, relative / child.name)
    elif stat.S_ISREG(info.st_mode):
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination, follow_symlinks=False)
        os.chmod(destination, 0o755 if info.st_mode & 0o111 else 0o644)
    else:
        deny(f"source_entry_type:{relative.as_posix()}")


def copy_allowlist(source_root: Path, destination: Path, names: Iterable[str]) -> None:
    destination.mkdir(mode=0o755)
    for name in names:
        source = source_root / name
        if not source.exists() and not source.is_symlink():
            if name in {"public", "next.config.js", "next.config.mjs", "next.config.ts"}:
                continue
            deny(f"runtime_source_missing:{name}")
        copy_entry(source, destination / name, PurePosixPath(name))


def normalize_tree(root: Path, epoch: int) -> None:
    paths = [root, *sorted(root.rglob("*"), key=lambda item: item.as_posix())]
    for path in paths:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            continue
        if stat.S_ISDIR(info.st_mode):
            os.chmod(path, 0o755)
        elif stat.S_ISREG(info.st_mode):
            os.chmod(path, 0o755 if info.st_mode & 0o111 else 0o644)
        else:
            deny(f"release_entry_type:{path.relative_to(root)}")
        os.utime(path, (epoch, epoch), follow_symlinks=False)


def inside(child: Path, parent: Path) -> bool:
    return child == parent or parent in child.parents


def validate_private_data_overlay(release_root: Path) -> dict[str, Any]:
    overlay = release_root / PRIVATE_DATA_OVERLAY
    if not overlay.exists() and not overlay.is_symlink():
        return {"present": False, "path": PRIVATE_DATA_OVERLAY.as_posix(),
                "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY"}
    try:
        release_resolved = release_root.resolve(strict=True)
        release_info = release_root.lstat()
        before = overlay.lstat()
        resolved = overlay.resolve(strict=True)
    except OSError:
        deny("private_data_overlay_read")
    if (overlay.is_symlink() or not stat.S_ISDIR(before.st_mode) or resolved != overlay or
            not inside(resolved, release_resolved) or
            (before.st_uid, before.st_gid) != (release_info.st_uid, release_info.st_gid) or
            stat.S_IMODE(before.st_mode) & 0o022):
        deny("private_data_overlay_identity")
    entry_count = 1
    for path in sorted(overlay.rglob("*"), key=lambda item: item.as_posix()):
        try:
            info = path.lstat()
            path_resolved = path.resolve(strict=True)
        except OSError:
            deny("private_data_overlay_read")
        if (stat.S_ISLNK(info.st_mode) or
                not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)) or
                not inside(path_resolved, resolved)):
            deny("private_data_overlay_symlink")
        entry_count += 1
    try:
        after = overlay.lstat()
    except OSError:
        deny("private_data_overlay_read")
    if ((before.st_dev, before.st_ino, before.st_mode, before.st_uid, before.st_gid) !=
            (after.st_dev, after.st_ino, after.st_mode, after.st_uid, after.st_gid)):
        deny("private_data_overlay_changed")
    return {"present": True, "path": PRIVATE_DATA_OVERLAY.as_posix(),
            "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY",
            "rootIdentity": {"device": after.st_dev, "inode": after.st_ino},
            "ownerUid": after.st_uid, "groupGid": after.st_gid,
            "mode": stat.S_IMODE(after.st_mode), "observedEntries": entry_count}


def validate_a959_private_data_overlay(release_root: Path) -> dict[str, Any]:
    overlay = release_root / A959_PRIVATE_DATA_OVERLAY
    try:
        release_resolved = release_root.resolve(strict=True)
        release_info = release_root.lstat()
        before = overlay.lstat()
        resolved = overlay.resolve(strict=True)
    except OSError:
        deny("legacy_a959_private_data_overlay_missing")
    if (overlay.is_symlink() or not stat.S_ISDIR(before.st_mode) or
            resolved != overlay or not inside(resolved, release_resolved) or
            (before.st_uid, before.st_gid) != (release_info.st_uid, release_info.st_gid) or
            stat.S_IMODE(before.st_mode) & 0o022):
        deny("legacy_a959_private_data_overlay_identity")
    entry_count = 1
    for path in sorted(overlay.rglob("*"), key=lambda item: item.as_posix()):
        try:
            info = path.lstat()
            path_resolved = path.resolve(strict=True)
        except OSError:
            deny("legacy_a959_private_data_overlay_read")
        if (stat.S_ISLNK(info.st_mode) or
                not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)) or
                not inside(path_resolved, resolved)):
            deny("legacy_a959_private_data_overlay_symlink")
        entry_count += 1
    try:
        after = overlay.lstat()
    except OSError:
        deny("legacy_a959_private_data_overlay_read")
    if ((before.st_dev, before.st_ino, before.st_mode) !=
            (after.st_dev, after.st_ino, after.st_mode)):
        deny("legacy_a959_private_data_overlay_changed")
    return {
        "path": A959_PRIVATE_DATA_OVERLAY.as_posix(),
        "classification": "PRIVATE_DATA_NEVER_RETIRE",
        "state": "ACTIVE_DEPENDENCY",
        "rootIdentity": {"device": after.st_dev, "inode": after.st_ino},
        "ownerUid": after.st_uid,
        "groupGid": after.st_gid,
        "mode": stat.S_IMODE(after.st_mode),
        "observedEntries": entry_count,
    }


def validate_f160_runtime_cache_overlay(release_root: Path) -> dict[str, Any]:
    overlay = release_root / F160_RUNTIME_CACHE_OVERLAY
    try:
        release_resolved = release_root.resolve(strict=True)
        release_info = release_root.lstat()
        before = overlay.lstat()
        resolved = overlay.resolve(strict=True)
    except OSError:
        deny("legacy_f160_runtime_cache_overlay_missing")
    if (overlay.is_symlink() or not stat.S_ISDIR(before.st_mode) or resolved != overlay or
            not inside(resolved, release_resolved) or
            (before.st_uid, before.st_gid) != (release_info.st_uid, release_info.st_gid) or
            stat.S_IMODE(before.st_mode) & 0o022):
        deny("legacy_f160_runtime_cache_overlay_identity")
    entry_count = 1
    for path in sorted(overlay.rglob("*"), key=lambda item: item.as_posix()):
        try:
            info = path.lstat(); path_resolved = path.resolve(strict=True)
        except OSError:
            deny("legacy_f160_runtime_cache_overlay_read")
        if (stat.S_ISLNK(info.st_mode) or
                not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)) or
                not inside(path_resolved, resolved)):
            deny("legacy_f160_runtime_cache_overlay_symlink")
        entry_count += 1
    after = overlay.lstat()
    if ((before.st_dev, before.st_ino, before.st_mode) !=
            (after.st_dev, after.st_ino, after.st_mode)):
        deny("legacy_f160_runtime_cache_overlay_changed")
    return {"path": F160_RUNTIME_CACHE_OVERLAY.as_posix(),
            "classification": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
            "rootIdentity": {"device": after.st_dev, "inode": after.st_ino},
            "ownerUid": after.st_uid, "groupGid": after.st_gid,
            "mode": stat.S_IMODE(after.st_mode), "observedEntries": entry_count}


def scan_runtime(release_root: Path, *, allow_private_data_overlay: bool = False,
                 allow_a959_private_data_overlay: bool = False,
                 allow_f160_runtime_cache_overlay: bool = False
                 ) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    resolved_root = release_root.resolve(strict=True)
    entries: list[dict[str, Any]] = []
    overlay = (validate_private_data_overlay(release_root)
               if allow_private_data_overlay else
               validate_a959_private_data_overlay(release_root)
               if allow_a959_private_data_overlay else
               validate_f160_runtime_cache_overlay(release_root)
               if allow_f160_runtime_cache_overlay else None)
    for runtime_name in RUNTIMES:
        root = release_root / runtime_name
        if not root.is_dir() or root.is_symlink():
            deny(f"release_runtime_missing:{runtime_name}")
        for path in [root, *sorted(root.rglob("*"), key=lambda item: item.as_posix())]:
            relative = path.relative_to(release_root)
            allowed_overlay = (PRIVATE_DATA_OVERLAY if allow_private_data_overlay else
                               A959_PRIVATE_DATA_OVERLAY if allow_a959_private_data_overlay else
                               F160_RUNTIME_CACHE_OVERLAY if allow_f160_runtime_cache_overlay else None)
            if allowed_overlay is not None and (relative == allowed_overlay or
                                                allowed_overlay in relative.parents):
                continue
            if forbidden(PurePosixPath(relative.as_posix())):
                deny(f"forbidden_release_entry:{relative.as_posix()}")
            info = path.lstat()
            item: dict[str, Any] = {"path": relative.as_posix(), "mode": stat.S_IMODE(info.st_mode)}
            if stat.S_ISREG(info.st_mode):
                raw, stable = stable_bytes(path)
                item.update(type="file", size=stable.st_size, sha256=sha256_bytes(raw))
            elif stat.S_ISDIR(info.st_mode):
                item["type"] = "directory"
            elif stat.S_ISLNK(info.st_mode):
                item.update(type="symlink", target=os.readlink(path))
                try:
                    resolved = path.resolve(strict=True)
                except OSError:
                    deny(f"release_symlink_broken:{relative.as_posix()}")
                if not inside(resolved, resolved_root):
                    deny(f"release_symlink_escape:{relative.as_posix()}")
            else:
                deny(f"release_entry_type:{relative.as_posix()}")
            entries.append(item)
    if allow_private_data_overlay or allow_a959_private_data_overlay or allow_f160_runtime_cache_overlay:
        overlay_after = (validate_private_data_overlay(release_root)
                         if allow_private_data_overlay else
                         validate_a959_private_data_overlay(release_root)
                         if allow_a959_private_data_overlay else
                         validate_f160_runtime_cache_overlay(release_root))
        stable_fields = ("path", "classification", "state")
        if allow_private_data_overlay:
            stable_fields += ("present",)
            if overlay["present"]:
                stable_fields += ("rootIdentity", "ownerUid", "groupGid", "mode")
        else:
            stable_fields += ("rootIdentity", "ownerUid", "groupGid", "mode")
        if any(overlay_after[field] != overlay[field] for field in stable_fields):
            deny("legacy_overlay_changed")
        overlay = overlay_after
    return entries, overlay


def validate_index(release_root: Path, raw: bytes, *, allow_private_data_overlay: bool = False,
                   allow_a959_private_data_overlay: bool = False,
                   allow_f160_runtime_cache_overlay: bool = False
                   ) -> tuple[str, int, dict[str, Any] | None]:
    index = json_object(raw, "index.sha256")
    if set(index) != {"schemaVersion", "scope", "entries"}:
        deny("release_index_fields")
    if index["schemaVersion"] != 1 or index["scope"] != list(RUNTIMES):
        deny("release_index_schema")
    entries = index["entries"]
    if not isinstance(entries, list):
        deny("release_index_entries")
    paths: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            deny("release_index_entry")
        relative = PurePosixPath(entry["path"])
        if relative.is_absolute() or not relative.parts or any(part in {"", ".", ".."} for part in relative.parts):
            deny("release_index_path")
        if relative.parts[0] not in RUNTIMES or entry["path"] in paths:
            deny("release_index_scope")
        paths.add(entry["path"])
        kind = entry.get("type")
        allowed = {"path", "type", "mode"}
        if kind == "file":
            allowed |= {"size", "sha256"}
            if not isinstance(entry.get("size"), int) or entry["size"] < 0 or not SHA256.fullmatch(str(entry.get("sha256", ""))):
                deny("release_index_file")
        elif kind == "symlink":
            allowed.add("target")
            if not isinstance(entry.get("target"), str):
                deny("release_index_symlink")
        elif kind != "directory":
            deny("release_index_type")
        if set(entry) != allowed or not isinstance(entry.get("mode"), int):
            deny("release_index_entry_fields")
    observed, overlay = scan_runtime(
        release_root, allow_private_data_overlay=allow_private_data_overlay,
        allow_a959_private_data_overlay=allow_a959_private_data_overlay,
        allow_f160_runtime_cache_overlay=allow_f160_runtime_cache_overlay,
    )
    if observed != entries:
        expected_by_path = {entry["path"]: entry for entry in entries}
        actual_by_path = {entry["path"]: entry for entry in observed}
        if set(expected_by_path) != set(actual_by_path):
            deny("release_index_inventory")
        mismatch = next(path for path in expected_by_path if expected_by_path[path] != actual_by_path[path])
        deny(f"release_index_mismatch:{mismatch}")
    return sha256_bytes(raw), len(entries), overlay


def validate_manifest(release_root: Path, expected_target: str, expected_release: str, *,
                      allow_private_data_overlay: bool = False,
                      allow_a959_private_data_overlay: bool = False,
                      allow_f160_runtime_cache_overlay: bool = False) -> dict[str, Any]:
    manifest_raw, _ = stable_bytes(release_root / "manifest.json")
    index_raw, _ = stable_bytes(release_root / "index.sha256")
    manifest = json_object(manifest_raw, "manifest.json")
    if set(manifest) != MANIFEST_FIELDS or manifest.get("schemaVersion") != 1:
        deny("release_manifest_schema")
    if manifest.get("producer") != {"name": "converta-release.py", "formatVersion": 1}:
        deny("release_manifest_producer")
    if manifest.get("releaseId") != expected_release or manifest.get("targetCommit") != expected_target:
        deny("release_manifest_identity")
    if manifest.get("components") != list(COMPONENTS):
        deny("release_manifest_components")
    epoch = manifest.get("sourceDateEpoch")
    if not isinstance(epoch, int) or epoch < 0:
        deny("release_manifest_epoch")
    expected_time = dt.datetime.fromtimestamp(epoch, dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if manifest.get("builtAt") != expected_time:
        deny("release_manifest_time")
    tools = manifest.get("toolchain")
    if not isinstance(tools, dict) or set(tools) != {"node", "npm"} or tools.get("node") != "v20.20.0":
        deny("release_manifest_toolchain")
    reproducibility = manifest.get("reproducibility")
    if reproducibility != {"deterministic": True, "nonReproducibleFields": []}:
        deny("release_manifest_reproducibility")
    index_sha, entry_count, overlay = validate_index(
        release_root, index_raw,
        allow_private_data_overlay=allow_private_data_overlay,
        allow_a959_private_data_overlay=allow_a959_private_data_overlay,
        allow_f160_runtime_cache_overlay=allow_f160_runtime_cache_overlay,
    )
    if manifest.get("indexSha256") != index_sha:
        deny("release_manifest_index")
    runtimes = manifest.get("runtimes")
    if not isinstance(runtimes, dict) or set(runtimes) != set(COMPONENTS):
        deny("release_manifest_runtimes")
    api = runtimes["api"]
    frontend = runtimes["frontend"]
    if not isinstance(api, dict) or set(api) != {"entrypoint", "entrySha256"}:
        deny("release_manifest_api")
    if api.get("entrypoint") != "api-runtime/dist/index.js" or not SHA256.fullmatch(str(api.get("entrySha256", ""))):
        deny("release_manifest_api")
    entry_raw, _ = stable_bytes(release_root / api["entrypoint"])
    if sha256_bytes(entry_raw) != api["entrySha256"]:
        deny("release_api_entrypoint")
    if not isinstance(frontend, dict) or set(frontend) != {"buildId"}:
        deny("release_manifest_frontend")
    build_id = read_build_id(release_root / "frontend-runtime/.next/BUILD_ID")
    if not build_id or frontend.get("buildId") != build_id:
        deny("release_frontend_build_id")
    result = {"manifestSha256": sha256_bytes(manifest_raw), "indexSha256": index_sha,
              "indexEntries": entry_count, "buildId": build_id,
              "apiEntrySha256": api["entrySha256"]}
    if overlay is not None:
        result["privateDataOverlay" if (allow_private_data_overlay or
                                         allow_a959_private_data_overlay) else
               "runtimeCacheOverlay"] = overlay
    return result


def tar_filter(epoch: int):
    def normalize(member: tarfile.TarInfo) -> tarfile.TarInfo:
        member.uid = member.gid = 0
        member.uname = member.gname = ""
        member.mtime = epoch
        member.pax_headers = {}
        return member
    return normalize


def write_tar(release_root: Path, tar_path: Path, epoch: int) -> str:
    if tar_path.exists():
        deny("tar_destination_exists")
    with tarfile.open(tar_path, "w", format=tarfile.PAX_FORMAT, dereference=False) as archive:
        archive.add(release_root, arcname=release_root.name, recursive=True,
                    filter=tar_filter(epoch))
    with tar_path.open("rb") as handle:
        os.fsync(handle.fileno())
    return sha256_bytes(stable_bytes(tar_path)[0])


def compress_tar(tar_path: Path, package_path: Path) -> str:
    temporary = package_path.with_name(f".{package_path.name}.{os.getpid()}.tmp")
    if package_path.exists() or temporary.exists():
        deny("package_destination_exists")
    with tar_path.open("rb") as source, lzma.open(temporary, "wb", preset=9) as compressed:
        shutil.copyfileobj(source, compressed, length=1024 * 1024)
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    try:
        with lzma.open(temporary, "rb") as handle:
            while handle.read(1024 * 1024):
                pass
        with tarfile.open(temporary, "r:xz") as archive:
            archive.getmembers()
    except (OSError, EOFError, lzma.LZMAError, tarfile.TarError):
        deny("package_integrity")
    for command, predicate in ((["xz", "-t", "--", str(temporary)], "package_xz_test"),
                               (["tar", "-tJf", str(temporary)], "package_tar_test")):
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            deny(predicate)
    os.replace(temporary, package_path)
    directory_fd = os.open(package_path.parent, os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return sha256_bytes(stable_bytes(package_path)[0])


def write_package(release_root: Path, package_path: Path, epoch: int) -> dict[str, str]:
    tar_path = package_path.with_name(f".{package_path.name}.{os.getpid()}.tar.tmp")
    if tar_path.exists():
        deny("tar_destination_exists")
    try:
        tar_sha = write_tar(release_root, tar_path, epoch)
        package_sha = compress_tar(tar_path, package_path)
    finally:
        if tar_path.exists():
            tar_path.unlink()
    return {"tarSha256": tar_sha, "packageSha256": package_sha}


def safe_extract(package: Path, destination: Path, expected_release: str) -> Path:
    if not package.is_file() or package.is_symlink():
        deny("package_missing")
    package_raw, _ = stable_bytes(package)
    try:
        with tarfile.open(fileobj=io.BytesIO(package_raw), mode="r:xz") as archive:
            members = archive.getmembers()
            if not members:
                deny("package_empty")
            for member in members:
                relative = PurePosixPath(member.name)
                if relative.is_absolute() or not relative.parts or relative.parts[0] != expected_release or any(part in {"", ".", ".."} for part in relative.parts):
                    deny("package_path")
                if member.isdev() or member.isfifo() or member.islnk():
                    deny("package_entry_type")
                if member.issym():
                    logical = PurePosixPath(member.name).parent / member.linkname
                    normalized = Path("/") / logical
                    normalized = Path(os.path.normpath(normalized.as_posix()))
                    if not normalized.parts or len(normalized.parts) < 2 or normalized.parts[1] != expected_release:
                        deny("package_symlink_escape")
            archive.extractall(destination, filter="data")
    except Denied:
        raise
    except (OSError, EOFError, lzma.LZMAError, tarfile.TarError):
        deny("package_integrity")
    root = destination / expected_release
    if not root.is_dir() or root.is_symlink():
        deny("package_release_root")
    return root


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def package_root_identity(package: Path, expected_release: str) -> tuple[str, int]:
    package_raw, _ = stable_bytes(package)
    try:
        with tarfile.open(fileobj=io.BytesIO(package_raw), mode="r:xz") as archive:
            roots = [
                member for member in archive.getmembers()
                if member.name.rstrip("/") == expected_release
            ]
    except (OSError, EOFError, lzma.LZMAError, tarfile.TarError):
        deny("package_integrity")
    if len(roots) != 1 or not roots[0].isdir():
        deny("package_release_root")
    mode = stat.S_IMODE(roots[0].mode)
    if mode != 0o755:
        deny("package_release_root_mode")
    return sha256_bytes(package_raw), mode


def authenticated_install_recovery(
        path: Path, expected_sha256: str, *,
        target: str, release_id: str, package: Path,
        package_sha256: str, releases_root: Path) -> tuple[dict[str, Any], Path, Path]:
    raw, info = stable_bytes(path)
    if (not path.is_absolute() or not SHA256.fullmatch(expected_sha256) or
            info.st_uid != os.geteuid() or info.st_gid != os.getegid() or
            stat.S_IMODE(info.st_mode) != 0o600 or
            sha256_bytes(raw) != expected_sha256):
        deny("install_recovery_manifest_identity")
    recovery = json_object(raw, "install-recovery")
    if set(recovery) != INSTALL_RECOVERY_FIELDS or recovery.get("schemaVersion") != 1:
        deny("install_recovery_manifest_schema")
    staging = Path(str(recovery.get("stagingPath", "")))
    final = releases_root / release_id
    if (recovery.get("targetCommit") != target or
            recovery.get("releaseId") != release_id or
            recovery.get("packagePath") != str(package) or
            recovery.get("packageSha256") != package_sha256 or
            recovery.get("finalPath") != str(final) or
            not staging.is_absolute() or staging.parent != releases_root or
            staging.name != f".{release_id}.installing"):
        deny("install_recovery_manifest_binding")
    try:
        observed = staging.lstat()
        resolved = staging.resolve(strict=True)
    except OSError:
        deny("install_recovery_staging_identity")
    mode = stat.S_IMODE(observed.st_mode)
    if (staging.is_symlink() or resolved != staging or
            not stat.S_ISDIR(observed.st_mode) or
            observed.st_dev != recovery.get("stagingDevice") or
            observed.st_ino != recovery.get("stagingInode") or
            observed.st_uid != recovery.get("ownerUid") or
            observed.st_gid != recovery.get("groupGid") or
            mode != recovery.get("mode") or mode != 0o700 or mode & 0o022):
        deny("install_recovery_staging_identity")
    return recovery, staging, final


def authenticate_private_data_contract(path: Path, expected_sha256: str,
                                       target: str, release_id: str) -> dict[str, Any]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha256):
        deny("private_data_contract_binding")
    raw, info = stable_bytes(path)
    if (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or
            sha256_bytes(raw) != expected_sha256):
        deny("private_data_contract_identity")
    contract = json_object(raw, "generation-artifacts")
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "writerLockPath", "classes", "artifacts", "privateDataPolicy",
                "privateDataOverlay"}
    if (set(contract) != required or
            contract.get("schemaVersion") != 1 or contract.get("state") != "COMPLETE" or
            contract.get("generationId") != release_id or contract.get("releaseId") != release_id or
            contract.get("targetCommit") != target or
            contract.get("privateDataPolicy") != PRIVATE_DATA_POLICY):
        deny("private_data_contract_schema")
    declared = contract["privateDataOverlay"]
    expected = {"path": PRIVATE_DATA_OVERLAY.as_posix(),
                "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY",
                "retirableOn": "NEVER_AUTOMATIC"}
    if declared != expected:
        deny("private_data_contract_overlay")
    return contract


def verify_root(root: Path, target: str, release_id: str,
                deployed_marker_sha256: str | None = None, *,
                allow_private_data_overlay: bool = False,
                allow_a959_private_data_overlay: bool = False,
                allow_f160_runtime_cache_overlay: bool = False,
                physical_name: str | None = None,
                expected_root_mode: int = 0o755) -> dict[str, Any]:
    if not root.is_absolute() or not root.is_dir() or root.is_symlink():
        deny("release_root")
    root_info = root.lstat()
    if (root.name != (physical_name or release_id) or
            root_info.st_uid != os.geteuid() or root_info.st_gid != os.getegid() or
            stat.S_IMODE(root_info.st_mode) != expected_root_mode or
            expected_root_mode & 0o022):
        deny("release_directory_identity")
    allowed = {"manifest.json", "index.sha256", *RUNTIMES}
    if deployed_marker_sha256 is not None:
        if not SHA256.fullmatch(deployed_marker_sha256):
            deny("deployed_marker_sha256")
        allowed.add("DEPLOYED")
    if {entry.name for entry in root.iterdir()} != allowed:
        deny("release_root_inventory")
    marker_sha256 = None
    if deployed_marker_sha256 is not None:
        marker_raw, marker_info = stable_bytes(root / "DEPLOYED")
        if marker_info.st_uid != os.geteuid() or stat.S_IMODE(marker_info.st_mode) != 0o600:
            deny("deployed_marker_identity")
        marker_sha256 = sha256_bytes(marker_raw)
        if marker_sha256 != deployed_marker_sha256:
            deny("deployed_marker_mismatch")
    result = validate_manifest(
        root, target, release_id,
        allow_private_data_overlay=allow_private_data_overlay,
        allow_a959_private_data_overlay=allow_a959_private_data_overlay,
        allow_f160_runtime_cache_overlay=allow_f160_runtime_cache_overlay,
    )
    if marker_sha256 is not None:
        result["operationalMarkerSha256"] = marker_sha256
    return result


def build(args: argparse.Namespace) -> None:
    roots = validate_build_paths(args)
    with generation_build_window(args.output.parent):
        build_in_generation_window(args, roots)


def authenticated_build_roots(path: Path, expected_sha256: str) -> dict[str, Path]:
    raw, info = stable_bytes(path)
    if (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) not in {0o600, 0o644} or
            sha256_bytes(raw) != expected_sha256):
        deny("root_policy_identity")
    try:
        policy = json.loads(raw)
        roots = policy["canonicalRoots"]
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError):
        deny("root_policy_schema")
    if (policy.get("schemaVersion") != 1 or set(policy) != {"schemaVersion", "canonicalRoots"} or
            not isinstance(roots, dict) or set(roots) != ROOT_POLICY_KEYS):
        deny("root_policy_schema")
    authenticated: dict[str, Path] = {}
    for name in ("worktrees", "outputs", "releases"):
        entry = roots.get(name)
        if not isinstance(entry, dict) or set(entry) != ROOT_POLICY_ENTRY_KEYS:
            deny(f"root_policy_{name}")
        root = Path(str(entry.get("path", "")))
        modes = entry.get("allowedModes")
        try:
            root_info = root.lstat()
            resolved = root.resolve(strict=True)
        except OSError:
            deny(f"root_policy_{name}")
        mode = f"0{stat.S_IMODE(root_info.st_mode):03o}"
        if (not root.is_absolute() or root.is_symlink() or not stat.S_ISDIR(root_info.st_mode) or
                resolved != root or root_info.st_uid != entry.get("ownerUid") or
                root_info.st_gid != entry.get("groupGid") or not isinstance(modes, list) or
                mode not in modes):
            deny(f"root_policy_{name}")
        current = root.parent
        while True:
            ancestor = current.lstat(); ancestor_mode = stat.S_IMODE(ancestor.st_mode)
            if stat.S_ISLNK(ancestor.st_mode) or not stat.S_ISDIR(ancestor.st_mode) or (
                    ancestor_mode & 0o022 and not ancestor_mode & stat.S_ISVTX):
                deny(f"root_policy_{name}_ancestor")
            if current == current.parent:
                break
            current = current.parent
        authenticated[name] = root
    return authenticated


def validate_build_paths(args: argparse.Namespace) -> dict[str, Path]:
    roots = authenticated_build_roots(args.root_policy, args.root_policy_sha256)
    output = args.output
    if not output.is_absolute() or ".." in output.parts:
        deny("output_absolute")
    if output == roots["outputs"] or roots["outputs"] not in output.parents:
        deny("output_outside_canonical_outputs")
    if output.exists() or output.is_symlink():
        deny("output_exists")
    try:
        output_parent = output.parent.resolve(strict=True)
    except OSError:
        deny("output_parent")
    if (output_parent != output.parent or
            not output_parent.is_dir() or
            (output_parent != roots["outputs"] and roots["outputs"] not in output_parent.parents)):
        deny("output_unsafe_ancestor")
    if args.installed_releases_root != roots["releases"]:
        deny("installed_releases_root_mismatch")
    if args.installed_releases_root.is_symlink():
        deny("installed_releases_root_unsafe")
    if args.repo.is_symlink():
        deny("repo_unsafe_ancestor")
    repo = args.repo.resolve(strict=True)
    if repo == roots["worktrees"] or roots["worktrees"] not in repo.parents:
        deny("repo_outside_canonical_build_worktrees")
    current = repo
    while current != roots["worktrees"]:
        if current.is_symlink():
            deny("repo_unsafe_ancestor")
        current = current.parent
    return roots


def build_in_generation_window(args: argparse.Namespace,
                               roots: dict[str, Path] | None = None) -> None:
    roots = roots or validate_build_paths(args)
    repo = args.repo.resolve(strict=True)
    worktrees_root = roots["worktrees"]
    if repo == worktrees_root or worktrees_root not in repo.parents:
        deny("repo_outside_canonical_build_worktrees")
    current = repo
    while current != worktrees_root:
        if current.is_symlink():
            deny("repo_unsafe_ancestor")
        current = current.parent
    ensure_clean_repo(repo, args.target)
    if args.components != ",".join(COMPONENTS):
        deny("components")
    capacity = read_capacity_contract(
        args.capacity_contract, repo, args.output.parent, args.target, args.release_id,
        args.p00_static_floor_override, args.p00_static_floor_override_sha256,
    )
    previous_reviews = require_generation_reviews(args.output.parent)
    args.output.mkdir(mode=0o700, parents=False)
    lifecycle_path = args.output / "generation-lifecycle.private.json"
    artifact_contract_path = args.output / "generation-artifacts.private.json"
    lifecycle: dict[str, Any] = {
        "schemaVersion": 1,
        "generationId": args.release_id,
        "targetCommit": args.target,
        "state": "BUILDING",
        "capacity": capacity,
        "capacityCheckpoints": [],
        "capacityObservations": [],
        "previousGenerationReviews": previous_reviews,
        "releaseRoot": str(args.output / args.release_id),
        "package": str(args.output / f"{args.release_id}.tar.xz"),
        "classification": "PENDING",
        "dispositionState": "OPEN",
        "replacement": None,
        "artifactContract": str(artifact_contract_path),
    }
    write_lifecycle(lifecycle_path, lifecycle)
    write_lifecycle(
        artifact_contract_path,
        build_artifact_contract(args, lifecycle_path, "BUILDING"),
    )
    env = build_environment()
    env.update(SOURCE_DATE_EPOCH=str(args.source_date_epoch), TZ="UTC", LANG="C.UTF-8",
               LC_ALL="C.UTF-8", CI="1", NEXT_TELEMETRY_DISABLED="1")
    workspace_baseline_bytes = allocated_bytes(repo)
    allocation_inode_baseline = allocated_inode_identities(repo, args.output)

    def remaining_workspace_bytes() -> int:
        growth = max(0, allocated_bytes(repo) - workspace_baseline_bytes)
        return max(0, capacity["budgets"]["buildWorkspaceGrowthBytes"] - growth)

    def remaining_peak_inodes() -> int:
        current = allocated_inode_identities(repo, args.output)
        growth = len(current - allocation_inode_baseline)
        return max(0, capacity["budgets"]["peakInodes"] - growth)

    def checkpoint(phase: str, remaining: Iterable[str] = ()) -> dict[str, Any]:
        remaining = tuple(remaining)
        overrides = ({"buildWorkspaceGrowthBytes": remaining_workspace_bytes()}
                     if "buildWorkspaceGrowthBytes" in remaining else None)
        observed = capacity_checkpoint(
            capacity, phase, remaining, overrides, remaining_peak_inodes()
        )
        lifecycle["capacityCheckpoints"].append(observed)
        write_lifecycle(lifecycle_path, lifecycle)
        return observed

    def monitored_phase(phase: str, action, before_remaining: Iterable[str],
                        after_remaining: Iterable[str], active_budget: str):
        before = checkpoint(f"before_{phase}", before_remaining)
        if active_budget not in before["remainingBudgets"]:
            deny(f"capacity_phase_budget:{phase}")
        monitor = CapacityPhaseMonitor(
            capacity, phase,
            before["requiredBytes"], before["requiredInodes"],
            before["remainingBudgets"][active_budget], before["remainingPeakInodes"],
        )
        monitor.start()
        try:
            result = action()
        finally:
            observation = monitor.finish()
            lifecycle["capacityObservations"].append(observation)
            write_lifecycle(lifecycle_path, lifecycle)
        if observation["observationGaps"] or not observation["sampleCount"]:
            deny(f"capacity_telemetry_incomplete:{phase}")
        if observation["observedBelowProtected"]:
            deny(f"capacity_observed_below_protected:{phase}:"
                 f"bytes={observation['minAvailableBytesObserved']}:"
                 f"protected={observation['protectedBytesDuringPhase']}:"
                 f"inodes={observation['minAvailableInodesObserved']}:"
                 f"protectedInodes={observation['protectedInodesDuringPhase']}")
        checkpoint(f"after_{phase}", after_remaining)
        return result

    staging_artifact = None
    try:
        workspace_and_payload = (
            "buildWorkspaceGrowthBytes", "runtimePayloadBytes",
            "packageTemporaryBytes", "independentVerificationBytes",
        )
        checkpoint("before_toolchain", workspace_and_payload)
        tools = toolchain(repo, env, args.output)
        checkpoint("after_toolchain", workspace_and_payload)
        monitored_phase(
            "root_npm_ci",
            lambda: run(["npm", "ci"], repo, env, failure_root=args.output,
                        stage="root_npm_ci"),
            workspace_and_payload, workspace_and_payload, "buildWorkspaceGrowthBytes",
        )
        api_source = repo / "apps/whatsapp-agent"
        monitored_phase(
            "api_npm_ci",
            lambda: run(["npm", "ci", "--include=dev"], api_source, env,
                        failure_root=args.output, stage="api_npm_ci"),
            workspace_and_payload, workspace_and_payload, "buildWorkspaceGrowthBytes",
        )
        monitored_phase(
            "prisma_generate",
            lambda: run(["npm", "run", "db:generate"], api_source, env,
                        failure_root=args.output, stage="prisma_generate"),
            workspace_and_payload, workspace_and_payload, "buildWorkspaceGrowthBytes",
        )
        monitored_phase(
            "api_build",
            lambda: run(["npm", "run", "build"], api_source, env,
                        failure_root=args.output, stage="api_build"),
            workspace_and_payload, workspace_and_payload, "buildWorkspaceGrowthBytes",
        )
        monitored_phase(
            "frontend_build",
            lambda: run(["npm", "run", "build"], repo, env,
                        failure_root=args.output, stage="frontend_build"),
            workspace_and_payload, workspace_and_payload, "buildWorkspaceGrowthBytes",
        )

        release_root = args.output / args.release_id
        def copy_runtime() -> None:
            release_root.mkdir(mode=0o755)
            copy_allowlist(api_source, release_root / "api-runtime",
                           ("dist", "node_modules", "package.json", "package-lock.json"))
            copy_allowlist(repo, release_root / "frontend-runtime",
                           (".next", "node_modules", "public", "package.json", "package-lock.json",
                            "next.config.js", "next.config.mjs", "next.config.ts"))
        monitored_phase(
            "runtime_copy", copy_runtime,
            ("runtimePayloadBytes", "packageTemporaryBytes", "independentVerificationBytes"),
            ("packageTemporaryBytes", "independentVerificationBytes"),
            "runtimePayloadBytes",
        )
        ensure_clean_repo(repo, args.target)
        normalize_tree(release_root, args.source_date_epoch)
        entries, _ = scan_runtime(release_root)
        index_raw = canonical_json({"schemaVersion": 1, "scope": list(RUNTIMES), "entries": entries})
        (release_root / "index.sha256").write_bytes(index_raw)
        entry_raw, _ = stable_bytes(release_root / "api-runtime/dist/index.js")
        build_id = read_build_id(release_root / "frontend-runtime/.next/BUILD_ID")
        timestamp = dt.datetime.fromtimestamp(args.source_date_epoch, dt.timezone.utc).isoformat().replace("+00:00", "Z")
        manifest = {
            "schemaVersion": 1,
            "producer": {"name": "converta-release.py", "formatVersion": 1},
            "releaseId": args.release_id,
            "targetCommit": args.target,
            "components": list(COMPONENTS),
            "sourceDateEpoch": args.source_date_epoch,
            "builtAt": timestamp,
            "toolchain": tools,
            "runtimes": {
                "api": {
                    "entrypoint": "api-runtime/dist/index.js",
                    "entrySha256": sha256_bytes(entry_raw),
                },
                "frontend": {"buildId": build_id},
            },
            "indexSha256": sha256_bytes(index_raw),
            "reproducibility": {"deterministic": True, "nonReproducibleFields": []},
        }
        (release_root / "manifest.json").write_bytes(canonical_json(manifest))
        normalize_tree(release_root, args.source_date_epoch)
        verified = verify_root(release_root, args.target, args.release_id)
        package = args.output / f"{args.release_id}.tar.xz"
        package_identity = monitored_phase(
            "package",
            lambda: write_package(release_root, package, args.source_date_epoch),
            ("packageTemporaryBytes", "independentVerificationBytes"),
            ("independentVerificationBytes",),
            "packageTemporaryBytes",
        )
        def independent_extraction() -> dict[str, Any]:
            temporary = Path(tempfile.mkdtemp(
                prefix=f".{args.release_id}.verify-", dir=args.output.parent
            ))
            try:
                extracted = safe_extract(package, temporary, args.release_id)
                extracted_verified = verify_root(extracted, args.target, args.release_id)
                if (extracted_verified != verified or
                        canonical_json(scan_runtime(extracted)) !=
                        canonical_json(scan_runtime(release_root))):
                    deny("independent_extraction_mismatch")
                return artifact_entry(
                    temporary, args.release_id, args.target, "directory", "DERIVED_STAGING",
                    "INDEPENDENT_VERIFICATION_COMPLETE", ["verification_in_progress"],
                    {"packageSha256": package_identity["packageSha256"]}, "RETIREMENT_READY",
                )
            finally:
                shutil.rmtree(temporary)
        staging_artifact = monitored_phase(
            "independent_extraction", independent_extraction,
            ("independentVerificationBytes",), (),
            "independentVerificationBytes",
        )
        staging_artifact["state"] = "SANITIZED"
        staging_artifact["removedAtProducerCompletion"] = True
    except BaseException as error:
        lifecycle.update(state="FAILED", classification="PENDING",
                         dispositionState="RETENTION_DEBT",
                         failureClass=type(error).__name__)
        write_lifecycle(lifecycle_path, lifecycle)
        write_lifecycle(
            artifact_contract_path,
            build_artifact_contract(args, lifecycle_path, "FAILED", staging=staging_artifact),
        )
        raise
    lifecycle.update(
        state="COMPLETE",
        classification="PENDING",
        dispositionState="OPEN",
        packageSha256=package_identity["packageSha256"],
        manifestSha256=verified["manifestSha256"],
        indexSha256=verified["indexSha256"],
        allocatedBytes=allocated_bytes(args.output),
    )
    write_lifecycle(lifecycle_path, lifecycle)
    write_lifecycle(
        artifact_contract_path,
        build_artifact_contract(
            args, lifecycle_path, "COMPLETE", verified,
            package_identity["packageSha256"], staging_artifact,
        ),
    )
    print(canonical_json({"result": "RELEASE BUILT", "releaseId": args.release_id,
                          "targetCommit": args.target, "package": str(package),
                          **package_identity, **verified}).decode().strip())


def verify(args: argparse.Namespace) -> None:
    if args.components != ",".join(COMPONENTS):
        deny("components")
    if bool(args.release_root) == bool(args.package):
        deny("verify_source")
    if args.package and args.deployed_marker_sha256 is not None:
        deny("deployed_marker_package")
    contract_bound = args.artifact_contract is not None or args.artifact_contract_sha256 is not None
    if contract_bound:
        if args.package or args.artifact_contract is None or args.artifact_contract_sha256 is None:
            deny("private_data_contract_binding")
        authenticate_private_data_contract(
            args.artifact_contract, args.artifact_contract_sha256, args.target, args.release_id)
    if args.legacy_a959_private_data_overlay:
        if args.package:
            deny("legacy_a959_private_data_overlay_package")
        if (args.release_id != A959_LEGACY_RELEASE_ID or args.target != A959_LEGACY_TARGET or
                args.deployed_marker_sha256 is None):
            deny("legacy_a959_private_data_overlay_binding")
    if args.legacy_f160_runtime_cache_overlay:
        if args.package:
            deny("legacy_f160_runtime_cache_overlay_package")
        if (args.release_id != F160_LEGACY_RELEASE_ID or args.target != F160_LEGACY_TARGET or
                args.deployed_marker_sha256 is None):
            deny("legacy_f160_runtime_cache_overlay_binding")
    if args.legacy_p00_runtime_cache_overlay:
        if args.package:
            deny("legacy_p00_runtime_cache_overlay_package")
        if (P00_LEGACY_RUNTIME_CACHE_RELEASES.get(args.release_id) != args.target or
                args.deployed_marker_sha256 is None):
            deny("legacy_p00_runtime_cache_overlay_binding")
    if sum((contract_bound, args.legacy_a959_private_data_overlay,
            args.legacy_f160_runtime_cache_overlay,
            args.legacy_p00_runtime_cache_overlay)) > 1:
        deny("legacy_overlay_conflict")
    if args.release_root:
        result = verify_root(
            args.release_root.resolve(strict=True), args.target, args.release_id,
            args.deployed_marker_sha256,
            allow_private_data_overlay=contract_bound,
            allow_a959_private_data_overlay=args.legacy_a959_private_data_overlay,
            allow_f160_runtime_cache_overlay=(args.legacy_f160_runtime_cache_overlay or
                                               args.legacy_p00_runtime_cache_overlay),
        )
    else:
        with tempfile.TemporaryDirectory(prefix="converta-release-verify-") as temporary:
            root = safe_extract(args.package.resolve(strict=True), Path(temporary), args.release_id)
            result = verify_root(root, args.target, args.release_id)
    print(canonical_json({"result": "RELEASE VERIFIED", "releaseId": args.release_id,
                          "targetCommit": args.target, **result}).decode().strip())


def install(args: argparse.Namespace) -> None:
    if args.components != ",".join(COMPONENTS):
        deny("components")
    roots = authenticated_build_roots(args.root_policy, args.root_policy_sha256)
    releases_root = args.installed_releases_root
    if releases_root != roots["releases"]:
        deny("installed_releases_root_mismatch")
    package = args.package.resolve(strict=True)
    package_sha256, package_root_mode = package_root_identity(package, args.release_id)
    final = releases_root / args.release_id
    if final.exists() or final.is_symlink():
        deny("installed_release_exists")
    recovery_pair = (
        args.recovery_manifest is not None,
        args.recovery_manifest_sha256 is not None,
    )
    if recovery_pair[0] != recovery_pair[1]:
        deny("install_recovery_manifest_pair")
    if args.recovery_manifest is not None:
        _, staged, bound_final = authenticated_install_recovery(
            args.recovery_manifest, args.recovery_manifest_sha256,
            target=args.target, release_id=args.release_id, package=package,
            package_sha256=package_sha256, releases_root=releases_root,
        )
        if bound_final != final:
            deny("install_recovery_manifest_binding")
        result = verify_root(
            staged, args.target, args.release_id,
            physical_name=staged.name, expected_root_mode=0o700,
        )
        before = staged.lstat()
        os.chmod(staged, package_root_mode)
        after = staged.lstat()
        if ((before.st_dev, before.st_ino, before.st_uid, before.st_gid) !=
                (after.st_dev, after.st_ino, after.st_uid, after.st_gid) or
                stat.S_IMODE(after.st_mode) != package_root_mode):
            deny("install_recovery_mode_transition")
        if final.exists() or final.is_symlink():
            deny("installed_release_exists")
        os.rename(staged, final)
        fsync_directory(releases_root)
        final_result = verify_root(final, args.target, args.release_id)
        if final_result != result:
            deny("installed_release_postrename_mismatch")
        result = final_result
        recovered = True
    else:
        temporary = releases_root / f".{args.release_id}.installing.{os.getpid()}"
        if temporary.exists() or temporary.is_symlink():
            deny("install_temporary_exists")
        os.mkdir(temporary, 0o700)
        extracted: Path | None = None
        try:
            extracted = safe_extract(package, temporary, args.release_id)
            result = verify_root(extracted, args.target, args.release_id)
            if final.exists() or final.is_symlink():
                deny("installed_release_exists")
            os.rename(extracted, final)
            fsync_directory(releases_root)
            temporary.rmdir()
            result = verify_root(final, args.target, args.release_id)
        except BaseException:
            if extracted is not None and extracted.exists():
                shutil.rmtree(extracted)
            try:
                temporary.rmdir()
            except OSError:
                pass
            raise
        recovered = False
    print(canonical_json({
        "result": "RELEASE INSTALLED",
        "releaseId": args.release_id,
        "targetCommit": args.target,
        "packageSha256": package_sha256,
        "releasePath": str(final),
        "recoveredExistingStaging": recovered,
        **result,
    }).decode().strip())


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    build_parser = commands.add_parser("build")
    build_parser.add_argument("--repo", type=Path, required=True)
    build_parser.add_argument("--target", required=True)
    build_parser.add_argument("--release-id", required=True)
    build_parser.add_argument("--components", required=True)
    build_parser.add_argument("--output", type=Path, required=True)
    build_parser.add_argument("--installed-releases-root", type=Path,
                              default=Path("/opt/re7online/releases"))
    build_parser.add_argument("--source-date-epoch", type=int, required=True)
    build_parser.add_argument("--capacity-contract", type=Path, required=True)
    build_parser.add_argument("--p00-static-floor-override", type=Path)
    build_parser.add_argument("--p00-static-floor-override-sha256")
    build_parser.add_argument("--root-policy", type=Path, required=True)
    build_parser.add_argument("--root-policy-sha256", required=True)
    build_parser.set_defaults(handler=build)
    verify_parser = commands.add_parser("verify")
    source = verify_parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--release-root", type=Path)
    source.add_argument("--package", type=Path)
    verify_parser.add_argument("--target", required=True)
    verify_parser.add_argument("--release-id", required=True)
    verify_parser.add_argument("--components", required=True)
    verify_parser.add_argument("--deployed-marker-sha256")
    verify_parser.add_argument("--artifact-contract", type=Path)
    verify_parser.add_argument("--artifact-contract-sha256")
    verify_parser.add_argument("--legacy-a959-private-data-overlay", action="store_true")
    verify_parser.add_argument("--legacy-f160-runtime-cache-overlay", action="store_true")
    verify_parser.add_argument("--legacy-p00-runtime-cache-overlay", action="store_true")
    verify_parser.set_defaults(handler=verify)
    install_parser = commands.add_parser("install")
    install_parser.add_argument("--package", type=Path, required=True)
    install_parser.add_argument("--target", required=True)
    install_parser.add_argument("--release-id", required=True)
    install_parser.add_argument("--components", required=True)
    install_parser.add_argument("--installed-releases-root", type=Path, required=True)
    install_parser.add_argument("--root-policy", type=Path, required=True)
    install_parser.add_argument("--root-policy-sha256", required=True)
    install_parser.add_argument("--recovery-manifest", type=Path)
    install_parser.add_argument("--recovery-manifest-sha256")
    install_parser.set_defaults(handler=install)
    return root


def main() -> int:
    args = parser().parse_args()
    if not SHA40.fullmatch(args.target):
        deny("target_format")
    if not RELEASE_ID.fullmatch(args.release_id):
        deny("release_id_format")
    if getattr(args, "source_date_epoch", 0) < 0:
        deny("source_date_epoch")
    try:
        # Extraction and creation must not inherit an operator-specific umask;
        # relevant modes are authenticated by the index itself.
        previous_umask = os.umask(0o022)
        try:
            args.handler(args)
        finally:
            os.umask(previous_umask)
        return 0
    except Denied as error:
        print(f"RELEASE_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

