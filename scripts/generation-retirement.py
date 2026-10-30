#!/usr/bin/env python3
"""Prepare or execute deterministic retirement for one build generation."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from typing import Any

SHA256 = re.compile(r"[0-9a-f]{64}")
TERMINAL_DEPLOYMENT = {"DEPLOYED", "ROLLED_BACK", "SUPERSEDED"}
PRESERVE_CLASSES = {"PACKAGE_PRESERVE", "EVIDENCE_PRESERVE", "PRIVATE_DATA_NEVER_RETIRE"}
F160_CACHE_CLASS = "EPHEMERAL_RUNTIME_CACHE"
DERIVED_CLASSES = {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING"}
RETIRABLE_CLASSES = DERIVED_CLASSES | {"RELEASE_RUNTIME"}
ARTIFACT_STATES = {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY", "CANDIDATE_PENDING_ACTIVATION",
                   "RETIREMENT_READY", "SANITIZED", "QUARANTINED", "PRESERVE_OVERRIDE"}
ROOT_KEYS = {"repository", "worktrees", "outputs", "releases", "staging", "evidence"}
POLICY_ENTRY_KEYS = {"path", "ownerUid", "groupGid", "allowedModes"}
A959_RETENTION_EVENT_SCHEMAS = {
    "ATTEMPT": frozenset({"event", "kind", "ordinal", "path", "result"}),
    "RESULT": frozenset({"event", "exitCode", "inspectionPath", "inspectionSha256", "kind",
                         "ordinal", "path", "result", "worktreeRegistration"}),
    "VERIFIED": frozenset({"event", "kind", "ordinal", "path", "result"}),
}
A959_RETENTION_COMMAND_KINDS = (
    "git_worktree_remove", "git_worktree_remove", "git_worktree_remove",
    "rm", "rm", "rm", "rm", "rm", "rm", "rm",
)
LEGACY_123BA_BINDING = {
    "schemaVersion": 1,
    "sourceState": "LEGACY_PRE_CONTRACT",
    "releaseId": "immutable-123ba7bd-vps-20261026T200100Z",
    "targetCommit": "123ba7bd78b2568ee982bf8590840de029a80072",
    "supersededPullRequest": 240,
    "outputPath": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer",
    "worktreePath": "/opt/re7online/build-worktrees/immutable-123ba7bd-vps-20261026T200100Z-source",
    "installedReleasePath": "/opt/re7online/releases/immutable-123ba7bd-vps-20261026T200100Z",
    "lifecycle": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-lifecycle.private.json",
        "sha256": "99fe6d231cd646ce442ecf6b26fe9cbba4745448a7d4e74944a0b965f561482d",
    },
    "package": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z.tar.xz",
        "sha256": "dbe0925e79eb492b566812a0b257fc8adf50479d2b9c56b399f3de463f23097e",
    },
    "manifest": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z/manifest.json",
        "sha256": "d3334a7754853566d24acadfc9991eec02ae9e163d14dc87759a5c9a3d2f79ef",
    },
    "index": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z/index.sha256",
        "sha256": "a91323272cdcd3a91c207a18a953f11f93e346cf3bde1f976e3229829fa0e69b",
    },
    "canonicalVerifierSha256": "ec620c16425a38317ca25f8efa5f08b080bb7f7436f4924dabed4790d426ff47",
    "contractOutput": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-artifacts.private.json",
    "reviewOutput": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-review.private.json",
    "receiptOutput": "/opt/re7online/backups/converta-persistent/preparations/immutable-123ba7bd-vps-20261026T200100Z-legacy-bootstrap/bootstrap-receipt.private.json",
}
LEGACY_A959_V1_PRESERVE_BINDING = {
    "schemaVersion": 1,
    "sourceState": "LEGACY_V1_PRESERVE_NO_CONTRACT",
    "releaseId": "immutable-a959129e-vps-20261026T023100Z",
    "targetCommit": "a959129e39a07c52881fb7f5cbf21a7f6f1a80ff",
    "outputPath": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer",
    "worktreePath": "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
    "installedReleasePath": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z",
    "privateDataOverlay": {
        "path": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z/api-runtime/.data",
        "classification": "PRIVATE_DATA_NEVER_RETIRE",
        "state": "ACTIVE_DEPENDENCY",
    },
    "lifecycle": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-lifecycle.private.json",
        "sha256": "b585d6cab251b8578cf808a080fe3794c5debef7408929562408fbc9c1c2498a",
    },
    "review": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-review.private.json",
        "sha256": "6c550cdf53d8bffa55886e8a998638646cb869cc29e7615b65e3c4455134e98b",
    },
    "package": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z.tar.xz",
        "sha256": "dd3057637d90df996663d8a602067e971d2038b6d285d2fed203e59471c273b0",
    },
    "manifest": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/manifest.json",
        "sha256": "6b93078b51e6e1067e62b872885c65ff48ef74732f6a4bd4f28ca8500875820b",
    },
    "index": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/index.sha256",
        "sha256": "6ccb64900cf13a954b7885d57c450443022e3f59db404eb262513bc4f9a46570",
    },
    "deployedMarker": {
        "path": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z/DEPLOYED",
        "sha256": "9da2428b15f8eb8b307603556fffb0ef75536829109e4be282ce03caa19cdb80",
    },
    "priorRetention": {
        "batchId": "retention-recent-generations-qualification-20261026T213341Z-v3",
        "receiptSha256": "19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74",
        "journalSha256": "e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985",
        "sampleASha256": "11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612",
        "sampleBSha256": "94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8",
        "removedPaths": [
            "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
            "/opt/re7online/build-worktrees/immutable-d436239e-vps-20261026T131821Z-source",
            "/opt/re7online/build-worktrees/immutable-f1602787-vps-20261026T174702Z-source",
            "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/api-runtime",
            "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/frontend-runtime",
            "/opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/api-runtime",
            "/opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/frontend-runtime",
            "/opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/api-runtime",
            "/opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/frontend-runtime",
            "/opt/re7online/releases/.immutable-a959129e-vps-20261026T023100Z.extracting.436891",
        ],
        "a959Ordinals": {
            "1": "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
            "4": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/api-runtime",
            "5": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/frontend-runtime",
        },
    },
    "canonicalVerifierSha256": "ec620c16425a38317ca25f8efa5f08b080bb7f7436f4924dabed4790d426ff47",
    "contractOutput": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-artifacts.private.json",
    "receiptOutput": "/opt/re7online/backups/converta-persistent/preparations/immutable-a959129e-vps-20261026T023100Z-legacy-v1-bootstrap/bootstrap-receipt.private.json",
}
LEGACY_RETENTION_BATCH = {
    "batchId": "retention-recent-generations-qualification-20261026T213341Z-v3",
    "receiptSha256": "19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74",
    "journalSha256": "e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985",
    "sampleASha256": "11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612",
    "sampleBSha256": "94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8",
    "removedPaths": LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]["removedPaths"],
}
LEGACY_D436_F160_BINDINGS = {
    "immutable-d436239e-vps-20261026T131821Z": {
        "descriptorSha256": "0628da3e9592b30a55f0c515e856d3aad618d48be9534ed35669499dbd8ed964", "role": "ROLLBACK_DEPENDENCY",
        "targetCommit": "d436239e13764b65642b37a4310082acd3a6a485", "ordinals": (2, 6, 7),
    },
    "immutable-f1602787-vps-20261026T174702Z": {
        "descriptorSha256": "12b59f97dd337ff32a48b979063dd5fecce432483945024a34bc9cdd4db05023", "role": "ACTIVE_DEPENDENCY",
        "targetCommit": "f16027874e91c86e5f818d0888e6d735b07a6eda", "ordinals": (3, 8, 9),
        "overlayPath": "/opt/re7online/releases/immutable-f1602787-vps-20261026T174702Z/frontend-runtime/.next/cache",
    },
}


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_private(path: Path, expected_sha: str | None = None) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha or "0" * 64):
        deny("authenticated_input")
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or
                before.st_uid != os.geteuid() or stat.S_IMODE(before.st_mode) != 0o600):
            deny(f"private_identity:{path.name}")
        value = path.read_bytes()
        after = path.lstat()
    except OSError:
        deny(f"private_read:{path.name}")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if identity(before) != identity(after) or len(value) != after.st_size:
        deny(f"private_changed:{path.name}")
    if expected_sha is not None and digest_bytes(value) != expected_sha:
        deny(f"private_hash:{path.name}")
    return value, after


def stable_policy(path: Path, expected_sha: str) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha):
        deny("root_policy_authenticated_input")
    try:
        before = path.lstat(); value = path.read_bytes(); after = path.lstat()
    except OSError:
        deny("root_policy_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
            stat.S_IMODE(before.st_mode) not in {0o600, 0o644} or identity(before) != identity(after) or
            len(value) != after.st_size or digest_bytes(value) != expected_sha):
        deny("root_policy_identity")
    return value, after


def stable_regular_hash(path: Path, expected_sha: str, predicate: str) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha):
        deny(f"{predicate}_authenticated_input")
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
                stat.S_IMODE(before.st_mode) & 0o022):
            deny(f"{predicate}_identity")
        value = path.read_bytes()
        after = path.lstat()
    except OSError:
        deny(f"{predicate}_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if (identity(before) != identity(after) or len(value) != after.st_size or
            digest_bytes(value) != expected_sha):
        deny(f"{predicate}_hash_or_drift")
    return value, after


def object_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(f"json_invalid:{label}")
    if not isinstance(value, dict):
        deny(f"json_object:{label}")
    return value


def write_exclusive(path: Path, value: bytes) -> None:
    if not path.is_absolute() or path.exists() or path.is_symlink():
        deny(f"destination_exists:{path.name}")
    path.parent.mkdir(mode=0o700, parents=False, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(value):
            count = os.write(fd, value[offset:])
            if count <= 0:
                deny("short_write")
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def write_or_verify_exact(path: Path, value: bytes, predicate: str) -> bool:
    """Publish once, or prove an earlier publication is byte-identical."""
    if path.exists() or path.is_symlink():
        existing, _ = stable_private(path)
        if existing != value:
            deny(f"{predicate}_divergent")
        return False
    write_exclusive(path, value)
    return True


def replace_private(path: Path, value: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.partial")
    if temporary.exists() or temporary.is_symlink():
        deny("temporary_exists")
    if path.exists() or path.is_symlink():
        old, _ = stable_private(path)
        previous = path.with_name(f"{path.name}.previous.{digest_bytes(old)}")
        if not previous.exists() and not previous.is_symlink():
            os.link(path, previous, follow_symlinks=False)
            fsync_dir(path.parent)
    write_exclusive(temporary, value)
    os.replace(temporary, path)
    fsync_dir(path.parent)


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def acquire_existing_lock(path: Path):
    before = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
            stat.S_IMODE(before.st_mode) != 0o600):
        deny(f"lock_identity:{path.name}")
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    opened = os.fstat(fd)
    if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
        os.close(fd); deny(f"lock_changed:{path.name}")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny(f"lock_busy:{path.name}")
    return fd


def acquire_or_authenticate_lock(path: Path, inherited_fd: int | None,
                                 creation_binding: str | None = None):
    if inherited_fd is None:
        if not path.exists() and not path.is_symlink():
            if not isinstance(creation_binding, str) or not SHA256.fullmatch(creation_binding):
                deny("lock_creation_binding")
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
            try:
                fd = os.open(path, flags, 0o600)
            except FileExistsError:
                deny(f"lock_creation_race:{path.name}")
            try:
                value = (creation_binding + "\n").encode()
                if os.write(fd, value) != len(value):
                    deny(f"lock_short_write:{path.name}")
                os.fsync(fd)
                opened = os.fstat(fd)
                if (not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.geteuid() or
                        opened.st_gid != os.getegid() or stat.S_IMODE(opened.st_mode) != 0o600):
                    deny(f"lock_identity:{path.name}")
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fsync_dir(path.parent)
                return fd
            except Exception:
                os.close(fd)
                raise
        return acquire_existing_lock(path)
    try:
        before = path.lstat()
        fd = os.dup(inherited_fd)
        opened = os.fstat(fd)
        target = Path(f"/proc/self/fd/{fd}").resolve(strict=True)
    except OSError:
        deny("inherited_lock_identity")
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or target != path or
            (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino)):
        os.close(fd); deny("inherited_lock_identity")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny("inherited_lock_not_held")
    return fd


def validate_contract(value: dict[str, Any]) -> None:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "writerLockPath", "classes", "artifacts", "privateDataPolicy"}
    optional = {"privateDataOverlay"}
    if (not required.issubset(value) or not set(value).issubset(required | optional) or
            value.get("schemaVersion") != 1 or value.get("state") not in {"COMPLETE", "FAILED"}):
        deny("artifact_contract_schema")
    if value.get("privateDataPolicy") != "PRIVATE_DATA_NEVER_RETIRE":
        deny("artifact_contract_private_data")
    overlay = value.get("privateDataOverlay")
    if overlay is not None and overlay != {
        "path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
        "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
    }:
        deny("artifact_contract_private_data_overlay")
    is_f160 = (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
               value["targetCommit"] ==
               LEGACY_D436_F160_BINDINGS[value["releaseId"]]["targetCommit"])
    expected_classes = PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}
    if is_f160:
        expected_classes.add(F160_CACHE_CLASS)
    if value.get("classes") != sorted(expected_classes):
        deny("artifact_contract_classes")
    if not Path(str(value.get("writerLockPath", ""))).is_absolute():
        deny("artifact_contract_writer_lock")
    if not isinstance(value.get("artifacts"), list) or not value["artifacts"]:
        deny("artifact_contract_artifacts")
    paths = set()
    authenticated_retention_paths: set[str] = set()
    a959_overlay_paths: set[str] = set()
    f160_cache_paths: set[str] = set()
    retention_binding = None
    if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"]):
        retention_binding = LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]
        retention_binding = {**retention_binding,
                             "ordinals": tuple(int(item) for item in retention_binding["a959Ordinals"])}
    elif value["releaseId"] in LEGACY_D436_F160_BINDINGS:
        candidate = LEGACY_D436_F160_BINDINGS[value["releaseId"]]
        if value["targetCommit"] == candidate["targetCommit"]:
            retention_binding = {**LEGACY_RETENTION_BATCH, "ordinals": candidate["ordinals"]}
    retention_expected_by_path = ({retention_binding["removedPaths"][ordinal - 1]: ordinal
                                   for ordinal in retention_binding["ordinals"]}
                                  if retention_binding else {})
    for artifact in value["artifacts"]:
        required_entry = {"path", "releaseId", "targetCommit", "expectedType", "initialIdentity", "observedIdentity",
                          "sizeBytes", "allocatedBytes", "inodes", "digest", "class", "state",
                          "retirableOn", "dependencies", "structuralSha256"}
        optional = {"removedAtProducerCompletion", "removedByAuthenticatedRetention"}
        if (not isinstance(artifact, dict) or not required_entry.issubset(artifact) or
                not set(artifact).issubset(required_entry | optional)):
            deny("artifact_contract_entry")
        path = Path(str(artifact.get("path", "")))
        if (not path.is_absolute() or str(path) in paths or artifact.get("releaseId") != value["releaseId"] or
                artifact.get("targetCommit") != value["targetCommit"]):
            deny("artifact_contract_path")
        paths.add(str(path))
        if artifact.get("class") not in expected_classes:
            deny("artifact_contract_class")
        if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
                value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"] and
                (str(path) == LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"] or
                 artifact.get("class") == "PRIVATE_DATA_NEVER_RETIRE")):
            if (str(path) != LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"] or
                    artifact.get("class") != "PRIVATE_DATA_NEVER_RETIRE" or
                    artifact.get("state") != "ACTIVE_DEPENDENCY" or
                    artifact.get("retirableOn") != "NEVER_AUTOMATIC" or
                    artifact.get("expectedType") != "directory" or
                    artifact.get("initialIdentity") is None or
                    artifact.get("observedIdentity") is None or
                    artifact.get("structuralSha256") is not None):
                deny("artifact_contract_a959_private_data_overlay")
            a959_overlay_paths.add(str(path))
        f160 = LEGACY_D436_F160_BINDINGS["immutable-f1602787-vps-20261026T174702Z"]
        if (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
                value["targetCommit"] == f160["targetCommit"] and
                (str(path) == f160["overlayPath"] or artifact.get("class") == "EPHEMERAL_RUNTIME_CACHE")):
            if (str(path) != f160["overlayPath"] or artifact.get("class") != "EPHEMERAL_RUNTIME_CACHE" or
                    artifact.get("state") != "ACTIVE_DEPENDENCY" or
                    artifact.get("retirableOn") != "WITH_PARENT_RELEASE_ONLY" or
                    artifact.get("expectedType") != "directory" or
                    artifact.get("initialIdentity") is None or
                    artifact.get("observedIdentity") is None or
                    artifact.get("structuralSha256") is not None):
                deny("artifact_contract_f160_runtime_cache_overlay")
            f160_cache_paths.add(str(path))
        if (artifact.get("state") not in ARTIFACT_STATES or
                not isinstance(artifact.get("retirableOn"), str) or not artifact["retirableOn"] or
                not isinstance(artifact.get("dependencies"), list) or
                any(not isinstance(item, str) or not item for item in artifact["dependencies"])):
            deny("artifact_contract_policy")
        for identity_name in ("initialIdentity", "observedIdentity"):
            identity = artifact.get(identity_name)
            if identity is not None and (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
                                         any(not isinstance(identity.get(key), int) or identity[key] < 0
                                             for key in ("device", "inode"))):
                deny("artifact_contract_identity")
        for field in ("sizeBytes", "allocatedBytes", "inodes"):
            if not isinstance(artifact.get(field), int) or artifact[field] < 0:
                deny("artifact_contract_metrics")
        structural = artifact.get("structuralSha256")
        if structural is not None and not SHA256.fullmatch(str(structural)):
            deny("artifact_contract_structural_digest")
        retention = artifact.get("removedByAuthenticatedRetention")
        if retention is not None:
            expected_retention = {"batchId", "receiptSha256", "journalSha256", "ordinal"}
            expected_ordinal = retention_expected_by_path.get(str(path))
            expected_class = "DERIVED_WORKTREE" if expected_ordinal in {1, 2, 3} else "DERIVED_OUTPUT_RUNTIME"
            if (retention_binding is None or
                    set(retention) != expected_retention or expected_ordinal is None or
                    retention != {"batchId": retention_binding["batchId"],
                                  "receiptSha256": retention_binding["receiptSha256"],
                                  "journalSha256": retention_binding["journalSha256"],
                                  "ordinal": expected_ordinal} or
                    artifact["class"] != expected_class or artifact.get("state") != "SANITIZED"):
                deny("artifact_contract_authenticated_retention")
            authenticated_retention_paths.add(str(path))
    if (authenticated_retention_paths and
            authenticated_retention_paths != set(retention_expected_by_path)):
        deny("artifact_contract_authenticated_retention_scope")
    if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"] and
            a959_overlay_paths != {LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"]}):
        deny("artifact_contract_a959_private_data_overlay")
    if (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
            value["targetCommit"] == LEGACY_D436_F160_BINDINGS[value["releaseId"]]["targetCommit"] and
            f160_cache_paths != {LEGACY_D436_F160_BINDINGS[value["releaseId"]]["overlayPath"]}):
        deny("artifact_contract_f160_runtime_cache_overlay")


def _strict_child(path: Path, root: Path, predicate: str) -> None:
    if (not path.is_absolute() or ".." in path.parts or
            Path(os.path.normpath(str(path))) != path or
            any(ord(character) < 32 for character in str(path)) or
            path == root or root not in path.parents):
        deny(predicate)


def _protected_directory(path: Path, predicate: str) -> Path:
    if not path.is_absolute():
        deny(predicate)
    try:
        info = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError:
        deny(predicate)
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path:
        deny(predicate)
    return resolved


def _validate_ancestors(path: Path, owner_uid: int, predicate: str) -> None:
    current = path
    while True:
        try:
            info = current.lstat()
        except OSError:
            deny(predicate)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            deny(predicate)
        mode = stat.S_IMODE(info.st_mode)
        # A root-owned sticky directory (normally /tmp) is the only writable
        # ancestor accepted by synthetic/offline fixtures.
        writable = mode & 0o022
        if writable and not (mode & stat.S_ISVTX):
            deny(predicate)
        if current == current.parent:
            break
        current = current.parent


def validate_root_policy(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("root_policy_hash")
    policy = object_json(raw, "root-policy")
    if set(policy) != {"schemaVersion", "canonicalRoots"} or policy.get("schemaVersion") != 1:
        deny("root_policy_schema")
    roots = policy.get("canonicalRoots")
    if not isinstance(roots, dict) or set(roots) != ROOT_KEYS:
        deny("root_policy_schema")
    entries: dict[str, Any] = {}
    definitions: dict[str, Any] = {}
    for key in ROOT_KEYS:
        raw_entries = roots[key] if key == "evidence" else [roots[key]]
        if not isinstance(raw_entries, list) or not raw_entries:
            deny(f"root_policy_entry:{key}")
        parsed = []
        parsed_definitions = []
        for entry in raw_entries:
            if not isinstance(entry, dict) or set(entry) != POLICY_ENTRY_KEYS:
                deny(f"root_policy_entry:{key}")
            path = Path(str(entry.get("path", "")))
            modes = entry.get("allowedModes")
            if (not path.is_absolute() or ".." in path.parts or
                    not isinstance(entry.get("ownerUid"), int) or entry["ownerUid"] < 0 or
                    not isinstance(entry.get("groupGid"), int) or entry["groupGid"] < 0 or
                    not isinstance(modes, list) or not modes or
                    any(not isinstance(mode, str) or not re.fullmatch(r"0[0-7]{3}", mode) for mode in modes)):
                deny(f"root_policy_entry:{key}")
            if Path(os.path.normpath(str(path))) != path:
                deny(f"root_policy_entry:{key}")
            parsed.append(str(path))
            parsed_definitions.append(entry)
        entries[key] = parsed if key == "evidence" else parsed[0]
        definitions[key] = parsed_definitions if key == "evidence" else parsed_definitions[0]
    return {"schemaVersion": 1, "canonicalRoots": entries,
            "definitions": definitions, "sha256": expected_sha256}


def authenticate_policy_root(policy: dict[str, Any], key: str) -> list[Path]:
    raw_entries = policy["definitions"][key] if key == "evidence" else [policy["definitions"][key]]
    authenticated = []
    for entry in raw_entries:
        path = Path(entry["path"])
        resolved = _protected_directory(path, f"root_policy_directory:{key}")
        info = resolved.lstat()
        mode = stat.S_IMODE(info.st_mode)
        if (info.st_uid != entry["ownerUid"] or info.st_gid != entry["groupGid"] or
                f"0{mode:03o}" not in entry["allowedModes"] or mode & 0o022):
            deny(f"root_policy_identity:{key}")
        _validate_ancestors(resolved.parent, entry["ownerUid"], f"root_policy_ancestor:{key}")
        authenticated.append(resolved)
    return authenticated


def validate_operational(value: dict[str, Any], contract: dict[str, Any], policy: dict[str, Any]) -> None:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "gitRepository",
                "currentPaths", "pm2LivePaths", "pm2DumpPaths", "activeReleases",
                "rollbackReleases", "transitiveReturnReleases", "candidateReleases",
                "installedVerifiedReleases", "supersededCandidates", "controlPlaneArtifacts",
                "dependencies", "deploymentState", "canonicalRoots", "observations"}
    if set(value) != required or value.get("schemaVersion") != 2:
        deny("operational_state_schema")
    for key in ("generationId", "releaseId", "targetCommit"):
        if value.get(key) != contract[key]:
            deny(f"operational_state_identity:{key}")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "activeReleases",
                "rollbackReleases", "transitiveReturnReleases", "candidateReleases",
                "installedVerifiedReleases", "supersededCandidates", "dependencies"):
        if not isinstance(value.get(key), list) or any(not isinstance(item, str) for item in value[key]):
            deny(f"operational_state_list:{key}")
    if not Path(str(value.get("gitRepository", ""))).is_absolute():
        deny("operational_git_repository")
    roots = value.get("canonicalRoots")
    if not isinstance(roots, dict) or set(roots) != ROOT_KEYS:
        deny("canonical_roots_schema")
    if roots != policy["canonicalRoots"]:
        deny("canonical_roots_policy_mismatch")
    if (not isinstance(roots["evidence"], list) or not roots["evidence"] or
            any(not isinstance(item, str) for item in roots["evidence"])):
        deny("canonical_root:evidence")
    resolved_roots = {key: authenticate_policy_root(policy, key)[0]
                      for key in ("repository", "worktrees", "outputs", "releases")}
    resolved_roots["staging"] = Path(roots["staging"])
    evidence_roots = authenticate_policy_root(policy, "evidence")
    if len(set(evidence_roots)) != len(evidence_roots):
        deny("canonical_root:evidence_duplicate")
    if resolved_roots["repository"] != Path(value["gitRepository"]):
        deny("canonical_repository_identity")
    compared_roots = {**resolved_roots, **{f"evidence[{index}]": path
                      for index, path in enumerate(evidence_roots)}}
    for first, first_path in compared_roots.items():
        for second, second_path in compared_roots.items():
            if first >= second:
                continue
            if first_path in second_path.parents or second_path in first_path.parents:
                if ((first == "outputs" and second.startswith("evidence[") or
                     second == "outputs" and first.startswith("evidence[")) and
                        resolved_roots["outputs"] in
                        (second_path if second.startswith("evidence[") else first_path).parents):
                    continue
                deny(f"canonical_roots_overlap:{first}:{second}")
    controls = value.get("controlPlaneArtifacts")
    if not isinstance(controls, list) or not controls:
        deny("operational_control_plane")
    for item in controls:
        if (not isinstance(item, dict) or set(item) != {"path", "sha256", "copied"} or
                not Path(str(item["path"])).is_absolute() or not SHA256.fullmatch(str(item["sha256"])) or
                item["copied"] is not True):
            deny("operational_control_plane")
        path = Path(item["path"])
        try:
            info = path.lstat()
            if path.is_symlink() or not stat.S_ISREG(info.st_mode) or digest_bytes(path.read_bytes()) != item["sha256"]:
                deny("operational_control_plane_hash")
        except OSError:
            deny("operational_control_plane_hash")
    deployment = value.get("deploymentState")
    if not isinstance(deployment, dict) or set(deployment) != {"state"} or not isinstance(deployment["state"], str):
        deny("operational_deployment_state")
    observations = value.get("observations")
    if not isinstance(observations, dict) or set(observations) != {"currentLinks", "pm2", "dump", "releaseGraph"}:
        deny("operational_observations")
    links = observations.get("currentLinks")
    if not isinstance(links, list) or any(not isinstance(item, dict) or set(item) != {"path", "target"}
                                          or not Path(str(item["path"])).is_absolute()
                                          or not Path(str(item["target"])).is_absolute() for item in links):
        deny("operational_current_links")
    pm2 = observations.get("pm2")
    if (not isinstance(pm2, dict) or set(pm2) != {"path", "sha256", "fingerprintSha256"} or
            not Path(str(pm2.get("path", ""))).is_absolute() or
            not SHA256.fullmatch(str(pm2.get("sha256", ""))) or
            not SHA256.fullmatch(str(pm2.get("fingerprintSha256", "")))):
        deny("operational_pm2_observation")
    for label in ("dump", "releaseGraph"):
        item = observations.get(label)
        if (not isinstance(item, dict) or set(item) != {"path", "sha256"} or
                not Path(str(item.get("path", ""))).is_absolute() or
                not SHA256.fullmatch(str(item.get("sha256", "")))):
            deny(f"operational_{label}_observation")


def _path_has_symlink(path: Path, root: Path) -> bool:
    current = path
    while current != root:
        try:
            if current.is_symlink():
                return True
        except OSError:
            return True
        current = current.parent
    return root.is_symlink()


def validate_artifact_roots(contract: dict[str, Any], operational: dict[str, Any],
                            policy: dict[str, Any]) -> None:
    roots = {key: Path(value) for key, value in operational["canonicalRoots"].items()
             if key != "evidence"}
    class_root = {
        "DERIVED_WORKTREE": roots["worktrees"],
        "DERIVED_OUTPUT_RUNTIME": roots["outputs"],
        "DERIVED_STAGING": roots["staging"],
        "RELEASE_RUNTIME": roots["releases"],
    }
    staging_root_required = any(
        artifact.get("class") == "DERIVED_STAGING" and not (
            artifact.get("state") == "SANITIZED" and
            artifact.get("removedAtProducerCompletion") is True and
            not Path(str(artifact.get("path", ""))).exists() and
            not Path(str(artifact.get("path", ""))).is_symlink()
        )
        for artifact in contract["artifacts"]
    )
    if staging_root_required:
        authenticate_policy_root(policy, "staging")
    for artifact in contract["artifacts"]:
        kind = artifact["class"]
        if kind not in class_root:
            continue
        path = Path(artifact["path"])
        root = class_root[kind]
        staging_already_removed = (kind == "DERIVED_STAGING" and
                                   artifact.get("state") == "SANITIZED" and
                                   artifact.get("removedAtProducerCompletion") is True and
                                   not path.exists() and not path.is_symlink())
        if staging_already_removed:
            # The producer's independent verification extraction historically
            # lived directly below build-output and was removed before contract
            # publication. It is evidence only: no command may target it.
            allowed_roots = (roots["staging"], roots["outputs"])
            if not any(path != candidate and candidate in path.parents
                       for candidate in allowed_roots):
                deny(f"artifact_outside_canonical_root:{kind}")
        else:
            _strict_child(path, root, f"artifact_outside_canonical_root:{kind}")
            if _path_has_symlink(path, root):
                deny(f"artifact_unsafe_ancestor:{kind}")
        if kind == "DERIVED_WORKTREE" and path == roots["repository"]:
            deny("canonical_checkout_not_retirable")


def _pm2_fingerprint(rows: Any) -> str:
    if not isinstance(rows, list):
        deny("fresh_pm2_shape")
    projected = []
    for row in rows:
        if not isinstance(row, dict):
            deny("fresh_pm2_row")
        env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
        projected.append({key: row.get(key, env.get(key)) for key in
                          ("name", "pid", "status", "restart_time", "pm_cwd", "pm_exec_path",
                           "exec_mode", "instances", "args", "node_args", "namespace",
                           "out_file", "error_file")})
    return digest_bytes(canonical(sorted(projected, key=lambda item: str(item.get("name")))))


def capture_fresh_operational(operational: dict[str, Any]) -> dict[str, Any]:
    observations = operational["observations"]
    links = []
    for item in observations["currentLinks"]:
        path = Path(item["path"])
        try:
            observed_target = path.resolve(strict=True)
            if not path.is_symlink() or observed_target != Path(item["target"]).resolve(strict=True):
                deny(f"fresh_current_changed:{path.name}")
        except OSError:
            deny(f"fresh_current_changed:{path.name}")
        links.append({"path": str(path), "target": str(observed_target)})
    pm2 = observations["pm2"]
    pm2_path = Path(pm2["path"])
    try:
        fd = os.open(pm2_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        info = os.fstat(fd)
        chunks = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            chunks.append(block)
        raw = b"".join(chunks)
    except OSError:
        deny("fresh_pm2_binary")
    try:
        if not stat.S_ISREG(info.st_mode) or digest_bytes(raw) != pm2["sha256"]:
            deny("fresh_pm2_binary")
        # Invoke the already-authenticated inode, not the mutable pathname.
        result = subprocess.run([f"/proc/self/fd/{fd}", "jlist"], text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=30, pass_fds=(fd,))
    finally:
        os.close(fd)
    if result.returncode:
        deny("fresh_pm2_jlist")
    try:
        rows = json.loads(result.stdout)
    except json.JSONDecodeError:
        deny("fresh_pm2_jlist")
    fingerprint = _pm2_fingerprint(rows)
    if fingerprint != pm2["fingerprintSha256"]:
        deny("fresh_pm2_changed")
    captured = {"currentLinks": links, "pm2FingerprintSha256": fingerprint}
    for label in ("dump", "releaseGraph"):
        item = observations[label]
        raw, _ = stable_private(Path(item["path"]), item["sha256"])
        captured[f"{label}Sha256"] = digest_bytes(raw)
        if label == "releaseGraph":
            graph = object_json(raw, "release-graph")
            expected = {key: operational[key] for key in ("activeReleases", "rollbackReleases",
                        "transitiveReturnReleases", "candidateReleases", "installedVerifiedReleases",
                        "supersededCandidates")}
            if graph != expected:
                deny("fresh_release_graph_changed")
    return captured


def known_references(operational: dict[str, Any]) -> set[str]:
    return set(operational["currentPaths"] + operational["pm2LivePaths"] +
               operational["pm2DumpPaths"] + operational["dependencies"])


def path_referenced(path: str, operational: dict[str, Any]) -> bool:
    candidate = os.path.normpath(path)
    for raw in known_references(operational):
        reference = os.path.normpath(raw)
        try:
            common = os.path.commonpath((candidate, reference))
        except ValueError:
            continue
        if common in {candidate, reference}:
            return True
    return False


def authenticate_artifact(artifact: dict[str, Any]) -> None:
    path = Path(artifact["path"])
    if not path.exists() and not path.is_symlink():
        if (artifact.get("removedAtProducerCompletion") is True or
                artifact.get("removedByAuthenticatedRetention") is not None or
                artifact["class"] in {"EVIDENCE_PRESERVE", "RELEASE_RUNTIME"}):
            return
        deny(f"artifact_missing:{path}")
    info = path.lstat()
    if path.is_symlink():
        deny(f"artifact_symlink:{path}")
    expected_type = artifact["expectedType"]
    if ((expected_type == "directory" and not stat.S_ISDIR(info.st_mode)) or
            (expected_type == "regular_file" and not stat.S_ISREG(info.st_mode))):
        deny(f"artifact_type:{path}")
    expected = artifact.get("observedIdentity")
    if expected is not None and (info.st_dev, info.st_ino) != (expected.get("device"), expected.get("inode")):
        deny(f"artifact_identity:{path}")
    if artifact.get("structuralSha256") is not None:
        a959_binding = LEGACY_A959_V1_PRESERVE_BINDING
        is_a959_installed_runtime = (
            artifact.get("releaseId") == a959_binding["releaseId"] and
            artifact.get("targetCommit") == a959_binding["targetCommit"] and
            artifact.get("class") == "RELEASE_RUNTIME" and
            path == Path(a959_binding["installedReleasePath"])
        )
        is_f160_installed_runtime = (
            artifact.get("releaseId") == "immutable-f1602787-vps-20261026T174702Z" and
            artifact.get("targetCommit") == LEGACY_D436_F160_BINDINGS[artifact["releaseId"]]["targetCommit"] and
            artifact.get("class") == "RELEASE_RUNTIME" and
            path == Path(LEGACY_D436_F160_BINDINGS[artifact["releaseId"]].get(
                "installedReleasePath",
                "/opt/re7online/releases/immutable-f1602787-vps-20261026T174702Z"))
        )
        observed = (_legacy_structural_metrics(
            path, {Path(a959_binding["privateDataOverlay"]["path"])}
        ) if is_a959_installed_runtime else _legacy_structural_metrics(
            path, {Path(LEGACY_D436_F160_BINDINGS[artifact["releaseId"]]["overlayPath"])}
        ) if is_f160_installed_runtime else structural_metrics(path))
        for field in ("sizeBytes", "allocatedBytes", "inodes", "structuralSha256"):
            if observed[field] != artifact.get(field):
                deny(f"artifact_drift:{path}:{field}")
    digest = artifact.get("digest")
    if artifact["class"] == "PRIVATE_DATA_NEVER_RETIRE":
        expected_digest = {"policy", "scope", "ownerUid", "groupGid", "mode"}
        if (not isinstance(digest, dict) or set(digest) != expected_digest or
                digest.get("policy") != "PRIVATE_DATA_NEVER_RETIRE" or
                digest.get("scope") != "ROOT_IDENTITY_ONLY" or
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
                (digest.get("ownerUid"), digest.get("groupGid"), digest.get("mode"))):
            deny(f"artifact_private_data_identity:{path}")
        release_root = Path(artifact["path"]).parents[1]
        try:
            release_info = release_root.lstat()
            resolved_root = path.resolve(strict=True)
        except OSError:
            deny(f"artifact_private_data_identity:{path}")
        if ((info.st_uid, info.st_gid) != (release_info.st_uid, release_info.st_gid) or
                stat.S_IMODE(info.st_mode) & 0o022 or resolved_root != path):
            deny(f"artifact_private_data_identity:{path}")
        for item in path.rglob("*"):
            try:
                item_info = item.lstat()
                item_resolved = item.resolve(strict=True)
            except OSError:
                deny(f"artifact_private_data_read:{path}")
            if (stat.S_ISLNK(item_info.st_mode) or
                    not (stat.S_ISDIR(item_info.st_mode) or stat.S_ISREG(item_info.st_mode)) or
                    not (item_resolved == resolved_root or resolved_root in item_resolved.parents)):
                deny(f"artifact_private_data_symlink:{path}")
    if artifact["class"] == "EPHEMERAL_RUNTIME_CACHE":
        expected_digest = {"policy", "scope", "ownerUid", "groupGid", "mode"}
        if (not isinstance(digest, dict) or set(digest) != expected_digest or
                digest.get("policy") != "EPHEMERAL_RUNTIME_CACHE" or
                digest.get("scope") != "ROOT_IDENTITY_ONLY" or
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
                (digest.get("ownerUid"), digest.get("groupGid"), digest.get("mode")) or
                stat.S_IMODE(info.st_mode) & 0o022):
            deny(f"artifact_runtime_cache_identity:{path}")
        resolved_root = path.resolve(strict=True)
        for item in path.rglob("*"):
            item_info = item.lstat(); item_resolved = item.resolve(strict=True)
            if (stat.S_ISLNK(item_info.st_mode) or
                    not (stat.S_ISDIR(item_info.st_mode) or stat.S_ISREG(item_info.st_mode)) or
                    not (item_resolved == resolved_root or resolved_root in item_resolved.parents)):
                deny(f"artifact_runtime_cache_symlink:{path}")
    if stat.S_ISREG(info.st_mode) and isinstance(digest, dict) and digest.get("sha256"):
        if digest_bytes(path.read_bytes()) != digest["sha256"]:
            deny(f"artifact_hash:{path}")


def structural_metrics(path: Path) -> dict[str, Any]:
    root = path.lstat()
    items = [path]
    if stat.S_ISDIR(root.st_mode):
        items.extend(path.rglob("*"))
    seen: set[tuple[int, int]] = set()
    size = allocated = inodes = 0
    structure = hashlib.sha256()
    for item in sorted(items, key=lambda candidate: os.fsencode(str(candidate.relative_to(path.parent)))):
        info = item.lstat()
        identity = (info.st_dev, info.st_ino)
        relative = "." if item == path else item.relative_to(path).as_posix()
        kind = "symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "regular" if stat.S_ISREG(info.st_mode) else "other"
        link = os.readlink(item) if kind == "symlink" else None
        structure.update(canonical({"path": relative, "type": kind,
                                    "mode": stat.S_IMODE(info.st_mode), "size": info.st_size,
                                    "mtimeNs": info.st_mtime_ns, "link": link}))
        if identity in seen:
            continue
        seen.add(identity)
        size += info.st_size; allocated += info.st_blocks * 512; inodes += 1
    return {"sizeBytes": size, "allocatedBytes": allocated, "inodes": inodes,
            "structuralSha256": structure.hexdigest()}


def outside_artifacts(destination: Path, artifacts: list[dict[str, Any]]) -> None:
    try:
        resolved = destination.parent.resolve(strict=True) / destination.name
    except OSError:
        deny(f"evidence_destination_parent:{destination.name}")
    for artifact in artifacts:
        source = Path(artifact["path"])
        try:
            resolved.relative_to(source)
        except ValueError:
            continue
        deny(f"evidence_destination_inside_artifact:{destination.name}")


def evidence_destination(destination: Path, operational: dict[str, Any]) -> None:
    for raw in operational["canonicalRoots"]["evidence"]:
        root = Path(raw)
        try:
            _strict_child(destination, root, f"evidence_destination_root:{destination.name}")
        except Denied:
            continue
        if _path_has_symlink(destination.parent, root):
            deny(f"evidence_destination_unsafe:{destination.name}")
        try:
            parent = destination.parent.lstat()
        except FileNotFoundError:
            deny(f"evidence_destination_parent_missing:{destination.name}")
        if (destination.parent.is_symlink() or not stat.S_ISDIR(parent.st_mode) or
                parent.st_uid != os.geteuid() or parent.st_gid != os.getegid() or
                stat.S_IMODE(parent.st_mode) not in {0o700, 0o750}):
            deny(f"evidence_destination_parent_identity:{destination.name}")
        if destination.exists() or destination.is_symlink():
            deny(f"evidence_destination_exists:{destination.name}")
        return
    deny(f"evidence_destination_root:{destination.name}")


def evidence_input(path: Path, operational: dict[str, Any]) -> None:
    for raw in operational["canonicalRoots"]["evidence"]:
        root = Path(raw)
        try:
            _strict_child(path, root, f"evidence_input_root:{path.name}")
        except Denied:
            continue
        if _path_has_symlink(path.parent, root) or path.is_symlink():
            deny(f"evidence_input_unsafe:{path.name}")
        try:
            parent = path.parent.lstat()
        except FileNotFoundError:
            deny(f"evidence_input_parent_missing:{path.name}")
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or
                parent.st_gid != os.getegid() or
                stat.S_IMODE(parent.st_mode) not in {0o700, 0o750}):
            deny(f"evidence_input_parent_identity:{path.name}")
        if not path.is_file():
            deny(f"evidence_input_missing:{path.name}")
        return
    deny(f"evidence_input_root:{path.name}")


def canonical_review_destination(review: Path, contract: Path, lifecycle: Path,
                                 policy: dict[str, Any]) -> None:
    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    if (contract.name != "generation-artifacts.private.json" or
            lifecycle.name != "generation-lifecycle.private.json" or
            contract.parent != lifecycle.parent or
            review != contract.parent / "generation-review.private.json"):
        deny("generation_review_destination")
    _strict_child(review, outputs_root, "generation_review_output_root")
    if _path_has_symlink(review.parent, outputs_root):
        deny("generation_review_unsafe_ancestor")
    definition = policy["definitions"]["outputs"]
    current = review.parent
    while current != outputs_root:
        try:
            info = current.lstat()
        except OSError:
            deny("generation_review_unsafe_ancestor")
        if (current.is_symlink() or not stat.S_ISDIR(info.st_mode) or
                info.st_uid != definition["ownerUid"] or info.st_gid != definition["groupGid"] or
                stat.S_IMODE(info.st_mode) & 0o022):
            deny("generation_review_unsafe_ancestor")
        current = current.parent
    if review.exists() or review.is_symlink():
        stable_private(review)


def classify(artifact: dict[str, Any], contract: dict[str, Any], operational: dict[str, Any]) -> str:
    kind = artifact["class"]
    release = contract["releaseId"]
    path = artifact["path"]
    if kind in PRESERVE_CLASSES:
        return "ACTIVE_DEPENDENCY"
    if kind == F160_CACHE_CLASS:
        return "ACTIVE_DEPENDENCY"
    if kind == "RELEASE_RUNTIME":
        if release in operational["activeReleases"]:
            return "ACTIVE_DEPENDENCY"
        if release in operational["rollbackReleases"] or release in operational["transitiveReturnReleases"]:
            return "ROLLBACK_DEPENDENCY"
        if release in operational["candidateReleases"]:
            return "CANDIDATE_PENDING_ACTIVATION"
        return "RETIREMENT_READY"
    if artifact.get("removedByAuthenticatedRetention") is not None:
        path = Path(path)
        if path.exists() or path.is_symlink():
            deny(f"authenticated_retention_path_reappeared:{path}")
        return "SANITIZED"
    if artifact.get("removedAtProducerCompletion") is True and not Path(path).exists():
        return "SANITIZED"
    if path_referenced(path, operational):
        return "ACTIVE_DEPENDENCY"
    if kind == "DERIVED_WORKTREE":
        package_ok = any(item["class"] == "PACKAGE_PRESERVE" and item.get("digest") for item in contract["artifacts"])
        controls_ok = all(item["copied"] for item in operational["controlPlaneArtifacts"])
        return "RETIREMENT_READY" if package_ok and controls_ok else "ACTIVE_DEPENDENCY"
    if kind == "DERIVED_OUTPUT_RUNTIME":
        if release in operational["installedVerifiedReleases"] or release in operational["supersededCandidates"]:
            return "RETIREMENT_READY"
        return "CANDIDATE_PENDING_ACTIVATION"
    if kind == "DERIVED_STAGING":
        return "RETIREMENT_READY" if operational["deploymentState"]["state"] in TERMINAL_DEPLOYMENT else "ACTIVE_DEPENDENCY"
    deny("artifact_classification")


def review_state(states: list[str]) -> str:
    if "RETIREMENT_READY" in states:
        return "RETIREMENT_READY"
    if "QUARANTINED" in states:
        return "QUARANTINED"
    if "CANDIDATE_PENDING_ACTIVATION" in states:
        return "CANDIDATE_PENDING_ACTIVATION"
    if "ROLLBACK_DEPENDENCY" in states:
        return "ROLLBACK_DEPENDENCY"
    if "ACTIVE_DEPENDENCY" in states:
        return "ACTIVE_DEPENDENCY"
    return "SANITIZED"


def command_for(artifact: dict[str, Any], operational: dict[str, Any]) -> tuple[list[str], str]:
    path = artifact["path"]
    if artifact["class"] == "DERIVED_WORKTREE":
        command = ["/usr/bin/git", "-C", operational["gitRepository"], "worktree", "remove", path]
    else:
        command = ["/usr/bin/rm", "-r", "--", path]
    return command, " ".join(command)


def _read_journal(raw: bytes) -> list[dict[str, Any]]:
    events = []
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError):
            deny("reconciliation_journal_invalid")
        if not isinstance(event, dict):
            deny("reconciliation_journal_invalid")
        events.append(event)
    return events


def validate_reconciliation(value: Any, artifacts: Any, *, require_absent: bool) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"chain", "completed"}:
        deny("reconciliation_schema")
    chain = value.get("chain")
    completed = value.get("completed")
    if not isinstance(chain, list) or not isinstance(completed, list):
        deny("reconciliation_schema")
    links: list[dict[str, str]] = []
    for link in chain:
        if (not isinstance(link, dict) or
                set(link) != {"intentSha256", "receiptSha256", "journalSha256"} or
                any(not SHA256.fullmatch(str(link.get(key, ""))) for key in link)):
            deny("reconciliation_chain")
        if link in links:
            deny("reconciliation_chain_duplicate")
        links.append(link)
    if not isinstance(artifacts, list):
        deny("reconciliation_artifacts")
    by_path = {item.get("path"): (ordinal, item) for ordinal, item in enumerate(artifacts, 1)
               if isinstance(item, dict) and isinstance(item.get("path"), str)}
    if len(by_path) != len(artifacts):
        deny("reconciliation_artifacts")
    seen_paths: set[str] = set()
    normalized = []
    expected_keys = {"ordinal", "path", "observedIdentity",
                     "intentSha256", "receiptSha256", "journalSha256"}
    for item in completed:
        if not isinstance(item, dict) or set(item) != expected_keys:
            deny("reconciliation_completed")
        path = item.get("path")
        binding = {key: item.get(key) for key in
                   ("intentSha256", "receiptSha256", "journalSha256")}
        artifact_entry = by_path.get(path)
        if (path in seen_paths or artifact_entry is None or binding not in links or
                item.get("ordinal") != artifact_entry[0] or
                artifact_entry[1].get("class") not in RETIRABLE_CLASSES or
                item.get("observedIdentity") != artifact_entry[1].get("observedIdentity")):
            deny("reconciliation_completed_identity")
        if require_absent and (Path(path).exists() or Path(path).is_symlink()):
            deny("reconciliation_removed_identity")
        seen_paths.add(path)
        normalized.append(item)
    if completed and not chain:
        deny("reconciliation_chain_missing")
    return {"chain": links, "completed": normalized}


def authenticate_reconciliation(args: argparse.Namespace, contract: dict[str, Any],
                                policy_sha256: str) -> dict[str, Any]:
    supplied = [args.prior_intent, args.prior_intent_sha256, args.prior_receipt,
                args.prior_receipt_sha256, args.prior_journal, args.prior_journal_sha256]
    if not any(supplied):
        return {"chain": [], "completed": []}
    if not all(supplied):
        deny("reconciliation_binding_incomplete")
    prior_intent_raw, _ = stable_private(args.prior_intent, args.prior_intent_sha256)
    prior_receipt_raw, _ = stable_private(args.prior_receipt, args.prior_receipt_sha256)
    prior_journal_raw, _ = stable_private(args.prior_journal, args.prior_journal_sha256)
    prior_intent = object_json(prior_intent_raw, "prior-intent")
    prior_receipt = object_json(prior_receipt_raw, "prior-receipt")
    if (prior_intent.get("generationId") != contract["generationId"] or
            prior_intent.get("releaseId") != contract["releaseId"] or
            prior_intent.get("targetCommit") != contract["targetCommit"] or
            prior_intent.get("contractSha256") != args.contract_sha256 or
            prior_intent.get("rootPolicySha256") != policy_sha256):
        deny("reconciliation_intent_identity")
    if (prior_receipt.get("intentSha256") != args.prior_intent_sha256 or
            prior_receipt.get("commandLogSha256") != args.prior_journal_sha256 or
            prior_receipt.get("state") not in {"QUARANTINED", "RETENTION_INCOMPLETE",
                                               "DEPLOYED_RETENTION_INCOMPLETE"}):
        deny("reconciliation_receipt_identity")
    inherited = validate_reconciliation(prior_intent.get("reconciliation"),
                                        prior_intent.get("artifacts", []), require_absent=True)
    inherited_paths = [item["path"] for item in inherited["completed"]]
    prior_commands = {item.get("ordinal"): item for item in prior_intent.get("commands", [])
                      if isinstance(item, dict) and isinstance(item.get("ordinal"), int)}
    artifacts = {item["path"]: item for item in contract["artifacts"]}
    progress: dict[int, list[dict[str, Any]]] = {}
    for event in _read_journal(prior_journal_raw):
        ordinal = event.get("ordinal")
        if not isinstance(ordinal, int) or ordinal not in prior_commands:
            deny("reconciliation_journal_ordinal")
        progress.setdefault(ordinal, []).append(event)
    link = {"intentSha256": args.prior_intent_sha256,
            "receiptSha256": args.prior_receipt_sha256,
            "journalSha256": args.prior_journal_sha256}
    completed = []
    for ordinal, events in sorted(progress.items()):
        command = prior_commands[ordinal]
        if not events or events[0] != {"event": "ATTEMPT", "ordinal": ordinal,
                                      "path": command["path"], "argv": command["argv"]}:
            deny("reconciliation_attempt_identity")
        results = [item for item in events if item.get("event") == "RESULT"]
        verified = [item for item in events if item.get("event") == "VERIFIED"]
        if not results or results[-1].get("exitCode") != 0 or not verified or verified[-1] != {
                "event": "VERIFIED", "ordinal": ordinal, "absent": True}:
            continue
        path = command["path"]
        artifact = artifacts.get(path)
        prior_artifact = next((item for item in prior_intent.get("artifacts", [])
                               if item.get("path") == path), None)
        if (artifact is None or prior_artifact is None or
                artifact.get("observedIdentity") != prior_artifact.get("observedIdentity") or
                Path(path).exists() or Path(path).is_symlink()):
            deny("reconciliation_removed_identity")
        if path in inherited_paths:
            deny("reconciliation_duplicate_completion")
        completed.append({"ordinal": ordinal, "path": path,
                          "observedIdentity": artifact.get("observedIdentity"), **link})
    aggregate = inherited["completed"] + completed
    if ([item["path"] for item in aggregate] != prior_receipt.get("removedPaths") or
            len(aggregate) != prior_receipt.get("completedCommands")):
        deny("reconciliation_receipt_progress")
    return {"chain": inherited["chain"] + [link], "completed": aggregate}


def canonical_release_verifier() -> Path:
    return Path(__file__).resolve().with_name("converta-release.py")


def validate_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_descriptor_hash")
    descriptor = object_json(raw, "legacy-descriptor")
    if descriptor != LEGACY_123BA_BINDING:
        deny("legacy_descriptor_binding")
    return descriptor


def validate_a959_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_a959_descriptor_hash")
    descriptor = object_json(raw, "legacy-a959-descriptor")
    if descriptor != LEGACY_A959_V1_PRESERVE_BINDING:
        deny("legacy_a959_descriptor_binding")
    return descriptor


def validate_batch_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_batch_descriptor_hash")
    descriptor = object_json(raw, "legacy-batch-descriptor")
    release_id = descriptor.get("releaseId")
    binding = LEGACY_D436_F160_BINDINGS.get(release_id)
    if binding is None or expected_sha256 != binding["descriptorSha256"]:
        deny("legacy_batch_descriptor_binding")
    expected_paths = LEGACY_RETENTION_BATCH["removedPaths"]
    expected_ordinals = {str(ordinal): expected_paths[ordinal - 1]
                         for ordinal in binding["ordinals"]}
    expected_overlay = ({"path": binding["overlayPath"],
                         "classification": "EPHEMERAL_RUNTIME_CACHE",
                         "state": "ACTIVE_DEPENDENCY",
                         "retirableOn": "WITH_PARENT_RELEASE_ONLY"}
                        if binding.get("overlayPath") else None)
    required = {"schemaVersion", "sourceState", "releaseId", "targetCommit",
                "operationalRole", "outputPath", "worktreePath", "installedReleasePath",
                "lifecycle", "review", "package", "manifest", "index", "deployedMarker",
                "priorRetention", "canonicalVerifierSha256", "contractOutput", "receiptOutput"}
    if expected_overlay is not None:
        required.add("runtimeCacheOverlay")
    if (set(descriptor) != required or descriptor.get("schemaVersion") != 1 or
            descriptor.get("sourceState") != "LEGACY_V1_PRESERVE_BATCH_MEMBER_NO_CONTRACT" or
            descriptor.get("targetCommit") != binding["targetCommit"] or
            descriptor.get("operationalRole") != binding["role"] or
            descriptor.get("runtimeCacheOverlay") != expected_overlay):
        deny("legacy_batch_descriptor_binding")
    prior = descriptor.get("priorRetention")
    if (not isinstance(prior, dict) or
            prior != {**LEGACY_RETENTION_BATCH, "generationOrdinals": expected_ordinals}):
        deny("legacy_batch_descriptor_retention_binding")
    release_path = binding.get("installedReleasePath", f"/opt/re7online/releases/{release_id}")
    output_path = binding.get("outputPath", f"/opt/re7online/build-output/{release_id}-producer")
    worktree_path = binding.get("worktreePath", f"/opt/re7online/build-worktrees/{release_id}-source")
    if (descriptor["installedReleasePath"] != release_path or
            descriptor["outputPath"] != output_path or
            descriptor["worktreePath"] != worktree_path or
            descriptor["contractOutput"] != f"{output_path}/generation-artifacts.private.json" or
            descriptor["review"]["path"] != f"{output_path}/generation-review.private.json" or
            descriptor["lifecycle"]["path"] != f"{output_path}/generation-lifecycle.private.json"):
        deny("legacy_batch_descriptor_path_binding")
    return descriptor


def _legacy_tree_root(path: Path, root: Path, policy: dict[str, Any], key: str) -> None:
    _strict_child(path, root, f"legacy_path_outside_root:{key}")
    if _path_has_symlink(path, root):
        deny(f"legacy_path_symlink:{key}")
    try:
        info = path.lstat()
    except OSError:
        deny(f"legacy_path_missing:{key}")
    definition = policy["definitions"][key]
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != definition["ownerUid"] or
            info.st_gid != definition["groupGid"]):
        deny(f"legacy_path_identity:{key}")


def _legacy_structural_metrics(path: Path, ignored: set[Path]) -> dict[str, Any]:
    root = path.lstat()
    items = [path]
    if stat.S_ISDIR(root.st_mode):
        items.extend(path.rglob("*"))
    normalized_ancestors = {parent for destination in ignored for parent in destination.parents
                            if parent == path or path in parent.parents}
    seen: set[tuple[int, int]] = set()
    size = allocated = inodes = 0
    structure = hashlib.sha256()
    for item in sorted(items, key=lambda candidate: os.fsencode(str(candidate.relative_to(path.parent)))):
        if item in ignored or any(destination in item.parents for destination in ignored):
            continue
        info = item.lstat()
        identity = (info.st_dev, info.st_ino)
        relative = "." if item == path else item.relative_to(path).as_posix()
        kind = ("symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode)
                else "regular" if stat.S_ISREG(info.st_mode) else "other")
        link = os.readlink(item) if kind == "symlink" else None
        mutable_directory = item in normalized_ancestors and kind == "directory"
        structure.update(canonical({"path": relative, "type": kind,
                                    "mode": stat.S_IMODE(info.st_mode),
                                    "size": None if mutable_directory else info.st_size,
                                    "mtimeNs": None if mutable_directory else info.st_mtime_ns,
                                    "link": link}))
        if identity in seen:
            continue
        seen.add(identity)
        if not mutable_directory:
            size += info.st_size
            allocated += info.st_blocks * 512
        inodes += 1
    return {"sizeBytes": size, "allocatedBytes": allocated, "inodes": inodes,
            "structuralSha256": structure.hexdigest()}


def _tree_observation(path: Path, label: str, ignored: set[Path] | None = None) -> dict[str, Any]:
    ignored = ignored or set()
    try:
        before = path.lstat()
        metrics = _legacy_structural_metrics(path, ignored)
        after = path.lstat()
    except OSError:
        deny(f"legacy_tree_read:{label}")
    identity = ((lambda item: (item.st_dev, item.st_ino, item.st_mode)) if ignored else
                (lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                               item.st_mtime_ns, item.st_ctime_ns)))
    if identity(before) != identity(after):
        deny(f"legacy_tree_drift:{label}")
    return {"identity": {"device": after.st_dev, "inode": after.st_ino}, **metrics}


def _legacy_artifact(path: Path, descriptor: dict[str, Any], artifact_class: str,
                     state: str, digest: dict[str, str]) -> dict[str, Any]:
    info = path.lstat()
    metrics = structural_metrics(path)
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"],
        "expectedType": "directory" if stat.S_ISDIR(info.st_mode) else "regular_file",
        "initialIdentity": {"device": info.st_dev, "inode": info.st_ino},
        "observedIdentity": {"device": info.st_dev, "inode": info.st_ino},
        **metrics, "digest": digest, "class": artifact_class, "state": state,
        "retirableOn": ("NEVER_AUTOMATIC" if artifact_class in PRESERVE_CLASSES
                         else "LEGACY_PRE_CONTRACT_SUPERSEDED"),
        "dependencies": (["legacy_bootstrap_authenticated"] if artifact_class in PRESERVE_CLASSES
                         else ["package_verified", "superseded_not_installed"]),
    }


def _run_legacy_package_verifier(descriptor: dict[str, Any]) -> dict[str, Any]:
    return _run_legacy_verifier(descriptor, ["--package", descriptor["package"]["path"]],
                                "legacy_package_verification")


def _run_legacy_installed_verifier(descriptor: dict[str, Any]) -> dict[str, Any]:
    overlay_flag = (["--legacy-a959-private-data-overlay"]
                    if descriptor["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] else
                    ["--legacy-f160-runtime-cache-overlay"]
                    if descriptor["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" else [])
    return _run_legacy_verifier(
        descriptor,
        ["--release-root", descriptor["installedReleasePath"],
         "--deployed-marker-sha256", descriptor["deployedMarker"]["sha256"], *overlay_flag],
        "legacy_installed_release_verification",
    )


def _run_legacy_verifier(descriptor: dict[str, Any], source: list[str], predicate: str) -> dict[str, Any]:
    verifier = canonical_release_verifier()
    try:
        before = verifier.lstat()
        fd = os.open(verifier, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        opened = os.fstat(fd)
        chunks = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            chunks.append(block)
        raw = b"".join(chunks)
        os.lseek(fd, 0, os.SEEK_SET)
    except OSError:
        deny("legacy_verifier_identity")
    if (verifier.is_symlink() or not stat.S_ISREG(before.st_mode) or
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
            (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) or
            digest_bytes(raw) != descriptor["canonicalVerifierSha256"]):
        os.close(fd)
        deny("legacy_verifier_identity")
    command = [sys.executable, f"/proc/self/fd/{fd}", "verify", *source,
               "--target", descriptor["targetCommit"],
               "--release-id", descriptor["releaseId"],
               "--components", "api,frontend"]
    try:
        try:
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=180, pass_fds=(fd,))
        except (OSError, subprocess.TimeoutExpired):
            deny(predicate)
    finally:
        os.close(fd)
    if result.returncode:
        nominal = next((line for line in result.stderr.splitlines()
                        if line.startswith("RELEASE_DENY:")), None)
        deny(f"{predicate}:{nominal}" if nominal else predicate)
    try:
        verified = json.loads(result.stdout)
    except json.JSONDecodeError:
        deny(predicate)
    if (not isinstance(verified, dict) or verified.get("result") != "RELEASE VERIFIED" or
            verified.get("releaseId") != descriptor["releaseId"] or
            verified.get("targetCommit") != descriptor["targetCommit"] or
            verified.get("manifestSha256") != descriptor["manifest"]["sha256"] or
            verified.get("indexSha256") != descriptor["index"]["sha256"]):
        deny(f"{predicate}_identity")
    return {"stdoutSha256": digest_bytes(result.stdout.encode()),
            "stderrSha256": digest_bytes(result.stderr.encode()),
            "apiEntrySha256": verified.get("apiEntrySha256"),
            "buildId": verified.get("buildId"),
            "indexEntries": verified.get("indexEntries"),
            "privateDataOverlay": verified.get("privateDataOverlay"),
            "runtimeCacheOverlay": verified.get("runtimeCacheOverlay")}


def _legacy_reference_absence(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    protected_lists = ("activeReleases", "rollbackReleases", "transitiveReturnReleases",
                       "candidateReleases", "installedVerifiedReleases")
    if any(release in operational[key] for key in protected_lists):
        deny("legacy_release_referenced")
    if operational["supersededCandidates"] != [release]:
        deny("legacy_release_not_uniquely_superseded")
    forbidden = (release, descriptor["outputPath"], descriptor["worktreePath"])
    path_lists = ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies")
    if any(any(token in value for token in forbidden)
           for key in path_lists for value in operational[key]):
        deny("legacy_runtime_reference")
    if any(any(token in str(item[field]) for token in forbidden)
           for item in operational["observations"]["currentLinks"]
           for field in ("path", "target")):
        deny("legacy_current_reference")


def _legacy_a959_active_reference(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    installed = descriptor["installedReleasePath"]
    if (release not in operational["activeReleases"] or
            release not in operational["installedVerifiedReleases"] or
            release in operational["supersededCandidates"]):
        deny("legacy_a959_active_release_graph")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths"):
        if not any(installed in value for value in operational[key]):
            deny(f"legacy_a959_active_reference:{key}")
    if not any(installed in str(item["target"])
               for item in operational["observations"]["currentLinks"]):
        deny("legacy_a959_current_reference")
    derived = (descriptor["outputPath"], descriptor["worktreePath"])
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
        if any(any(path in value for path in derived) for value in operational[key]):
            deny("legacy_a959_derived_reference")


def _legacy_batch_operational_reference(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    installed = descriptor["installedReleasePath"]
    role = descriptor["operationalRole"]
    required_graph = "activeReleases" if role == "ACTIVE_DEPENDENCY" else "rollbackReleases"
    if (release not in operational[required_graph] or
            release not in operational["installedVerifiedReleases"] or
            release in operational["supersededCandidates"]):
        deny("legacy_batch_operational_role")
    if role == "ACTIVE_DEPENDENCY":
        for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths"):
            if not any(installed in value for value in operational[key]):
                deny(f"legacy_batch_active_reference:{key}")
        if not any(installed in str(item["target"])
                   for item in operational["observations"]["currentLinks"]):
            deny("legacy_batch_active_current_reference")
    forbidden = (descriptor["outputPath"], descriptor["worktreePath"])
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
        if any(any(path in value for path in forbidden) for value in operational[key]):
            deny("legacy_batch_derived_reference")


def _authenticate_a959_prior_retention(args: argparse.Namespace, descriptor: dict[str, Any],
                                        operational: dict[str, Any]) -> dict[str, dict[str, Any]]:
    expected = descriptor["priorRetention"]
    if (args.retention_receipt_sha256 != expected["receiptSha256"] or
            args.retention_journal_sha256 != expected["journalSha256"]):
        deny("legacy_a959_retention_external_hash")
    evidence_input(args.retention_receipt, operational)
    evidence_input(args.retention_journal, operational)
    receipt_raw, _ = stable_private(args.retention_receipt, args.retention_receipt_sha256)
    journal_raw, _ = stable_private(args.retention_journal, args.retention_journal_sha256)
    receipt = object_json(receipt_raw, "legacy-a959-retention-receipt")
    required_receipt = {
        "state": "COMPLETED", "failurePredicate": None, "attemptedCommands": 10,
        "completedCommands": 10, "removedPaths": 10, "automaticRetry": False,
        "pathExpansion": False, "forceUsed": False, "pruneUsed": False,
        "commandLogSha256": expected["journalSha256"],
    }
    if any(receipt.get(key) != value for key, value in required_receipt.items()):
        deny("legacy_a959_retention_receipt_contract")
    samples = receipt.get("freshSamples")
    if (not isinstance(samples, dict) or samples.get("aSha256") != expected["sampleASha256"] or
            samples.get("bSha256") != expected["sampleBSha256"]):
        deny("legacy_a959_retention_samples")
    lock = receipt.get("lock")
    if (not isinstance(lock, dict) or lock.get("acquired") is not True or
            lock.get("heldThroughFinalInspection") is not True or
            lock.get("heldThroughReceiptFsync") is not True or lock.get("unlink") is not False or
            lock.get("foreignLockReleased") is not False):
        deny("legacy_a959_retention_lock")

    events = _read_journal(journal_raw)
    if len(events) != 30:
        deny("legacy_a959_retention_event_count")
    removed_paths = expected["removedPaths"]
    for ordinal in range(1, 11):
        attempt, result, verified = events[(ordinal - 1) * 3:ordinal * 3]
        expected_path = removed_paths[ordinal - 1]
        expected_kind = A959_RETENTION_COMMAND_KINDS[ordinal - 1]
        common = {"ordinal": ordinal, "path": expected_path, "kind": expected_kind}
        if (set(attempt) != A959_RETENTION_EVENT_SCHEMAS["ATTEMPT"] or
                attempt.get("event") != "ATTEMPT" or attempt.get("result") != "PENDING" or
                any(attempt.get(key) != value for key, value in common.items())):
            deny(f"legacy_a959_retention_attempt:{ordinal}")
        expected_registration = "ABSENT" if expected_kind == "git_worktree_remove" else "NOT_APPLICABLE"
        if (set(result) != A959_RETENTION_EVENT_SCHEMAS["RESULT"] or
                result.get("event") != "RESULT" or result.get("result") != "COMMAND_EXITED_ZERO" or
                any(result.get(key) != value for key, value in common.items()) or
                type(result.get("exitCode")) is not int or result["exitCode"] != 0 or
                result.get("worktreeRegistration") != expected_registration or
                not isinstance(result.get("inspectionPath"), str) or not result["inspectionPath"] or
                not isinstance(result.get("inspectionSha256"), str) or
                SHA256.fullmatch(result["inspectionSha256"]) is None):
            deny(f"legacy_a959_retention_result:{ordinal}")
        if (set(verified) != A959_RETENTION_EVENT_SCHEMAS["VERIFIED"] or
                verified.get("event") != "VERIFIED" or verified.get("result") != "PASS" or
                any(verified.get(key) != value for key, value in common.items())):
            deny(f"legacy_a959_retention_verified:{ordinal}")
    proven = {}
    for raw_ordinal, path in expected["a959Ordinals"].items():
        ordinal = int(raw_ordinal)
        if removed_paths[ordinal - 1] != path:
            deny("legacy_a959_retention_descriptor_ordinal")
        candidate = Path(path)
        if candidate.exists() or candidate.is_symlink():
            deny(f"legacy_a959_retention_path_reappeared:{ordinal}")
        proven[path] = {"batchId": expected["batchId"],
                        "receiptSha256": expected["receiptSha256"],
                        "journalSha256": expected["journalSha256"], "ordinal": ordinal}
    return proven


def _authenticate_batch_prior_retention(args: argparse.Namespace, descriptor: dict[str, Any],
                                        operational: dict[str, Any]) -> dict[str, dict[str, Any]]:
    expected = descriptor["priorRetention"]
    if (args.retention_receipt_sha256 != expected["receiptSha256"] or
            args.retention_journal_sha256 != expected["journalSha256"]):
        deny("legacy_batch_retention_external_hash")
    evidence_input(args.retention_receipt, operational)
    evidence_input(args.retention_journal, operational)
    receipt_raw, _ = stable_private(args.retention_receipt, args.retention_receipt_sha256)
    journal_raw, _ = stable_private(args.retention_journal, args.retention_journal_sha256)
    receipt = object_json(receipt_raw, "legacy-batch-retention-receipt")
    required_receipt = {
        "state": "COMPLETED", "failurePredicate": None, "attemptedCommands": 10,
        "completedCommands": 10, "removedPaths": 10, "automaticRetry": False,
        "pathExpansion": False, "forceUsed": False, "pruneUsed": False,
        "commandLogSha256": expected["journalSha256"],
    }
    if any(receipt.get(key) != value for key, value in required_receipt.items()):
        deny("legacy_batch_retention_receipt_contract")
    samples = receipt.get("freshSamples")
    lock = receipt.get("lock")
    if (not isinstance(samples, dict) or samples != {
            "aSha256": expected["sampleASha256"], "bSha256": expected["sampleBSha256"]} or
            not isinstance(lock, dict) or lock.get("acquired") is not True or
            lock.get("heldThroughFinalInspection") is not True or
            lock.get("heldThroughReceiptFsync") is not True or lock.get("unlink") is not False or
            lock.get("foreignLockReleased") is not False):
        deny("legacy_batch_retention_receipt_evidence")
    events = _read_journal(journal_raw)
    if len(events) != 30:
        deny("legacy_batch_retention_event_count")
    removed_paths = expected["removedPaths"]
    for ordinal in range(1, 11):
        attempt, result, verified = events[(ordinal - 1) * 3:ordinal * 3]
        common = {"ordinal": ordinal, "path": removed_paths[ordinal - 1],
                  "kind": A959_RETENTION_COMMAND_KINDS[ordinal - 1]}
        if (set(attempt) != A959_RETENTION_EVENT_SCHEMAS["ATTEMPT"] or
                attempt.get("event") != "ATTEMPT" or attempt.get("result") != "PENDING" or
                any(attempt.get(key) != value for key, value in common.items())):
            deny(f"legacy_batch_retention_attempt:{ordinal}")
        expected_registration = ("ABSENT" if common["kind"] == "git_worktree_remove"
                                 else "NOT_APPLICABLE")
        if (set(result) != A959_RETENTION_EVENT_SCHEMAS["RESULT"] or
                result.get("event") != "RESULT" or result.get("result") != "COMMAND_EXITED_ZERO" or
                any(result.get(key) != value for key, value in common.items()) or
                result.get("exitCode") != 0 or
                result.get("worktreeRegistration") != expected_registration or
                not isinstance(result.get("inspectionPath"), str) or not result["inspectionPath"] or
                not isinstance(result.get("inspectionSha256"), str) or
                SHA256.fullmatch(result["inspectionSha256"]) is None):
            deny(f"legacy_batch_retention_result:{ordinal}")
        if (set(verified) != A959_RETENTION_EVENT_SCHEMAS["VERIFIED"] or
                verified.get("event") != "VERIFIED" or verified.get("result") != "PASS" or
                any(verified.get(key) != value for key, value in common.items())):
            deny(f"legacy_batch_retention_verified:{ordinal}")
    proven = {}
    for raw_ordinal, path in expected["generationOrdinals"].items():
        ordinal = int(raw_ordinal)
        if removed_paths[ordinal - 1] != path:
            deny("legacy_batch_retention_descriptor_ordinal")
        candidate = Path(path)
        if candidate.exists() or candidate.is_symlink():
            deny(f"legacy_batch_retention_path_reappeared:{ordinal}")
        proven[path] = {"batchId": expected["batchId"],
                        "receiptSha256": expected["receiptSha256"],
                        "journalSha256": expected["journalSha256"], "ordinal": ordinal}
    return proven


def _authenticated_retired_artifact(path: Path, descriptor: dict[str, Any], artifact_class: str,
                                    evidence: dict[str, Any], digest: dict[str, str]) -> dict[str, Any]:
    if path.exists() or path.is_symlink():
        deny(f"legacy_a959_retention_path_reappeared:{evidence['ordinal']}")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": None, "observedIdentity": None, "sizeBytes": 0,
        "allocatedBytes": 0, "inodes": 0, "structuralSha256": None, "digest": digest,
        "class": artifact_class, "state": "SANITIZED",
        "retirableOn": "AUTHENTICATED_PRIOR_RETENTION_COMPLETED",
        "dependencies": ["prior_retention_receipt_authenticated",
                         "prior_retention_journal_authenticated"],
        "removedByAuthenticatedRetention": evidence,
    }


def _a959_private_data_artifact(descriptor: dict[str, Any],
                                installed_verification: dict[str, Any]) -> dict[str, Any]:
    binding = descriptor["privateDataOverlay"]
    path = Path(binding["path"])
    installed = Path(descriptor["installedReleasePath"])
    expected_relative = Path("api-runtime/.data")
    if (path != installed / expected_relative or binding != {
            "path": str(installed / expected_relative),
            "classification": "PRIVATE_DATA_NEVER_RETIRE",
            "state": "ACTIVE_DEPENDENCY",
    }):
        deny("legacy_a959_private_data_binding")
    observed = installed_verification.get("privateDataOverlay")
    required = {"path", "classification", "state", "rootIdentity", "ownerUid", "groupGid",
                "mode", "observedEntries"}
    if (not isinstance(observed, dict) or set(observed) != required or
            observed.get("path") != expected_relative.as_posix() or
            observed.get("classification") != "PRIVATE_DATA_NEVER_RETIRE" or
            observed.get("state") != "ACTIVE_DEPENDENCY"):
        deny("legacy_a959_private_data_verification")
    identity = observed.get("rootIdentity")
    if (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
            any(not isinstance(identity.get(key), int) or identity[key] < 0
                for key in ("device", "inode")) or
            any(not isinstance(observed.get(key), int) or observed[key] < 0
                for key in ("ownerUid", "groupGid", "mode", "observedEntries"))):
        deny("legacy_a959_private_data_verification")
    try:
        info = path.lstat()
        installed_info = installed.lstat()
        resolved = path.resolve(strict=True)
    except OSError:
        deny("legacy_a959_private_data_identity")
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path or
            (info.st_dev, info.st_ino) != (identity["device"], identity["inode"]) or
            (info.st_uid, info.st_gid) != (installed_info.st_uid, installed_info.st_gid) or
            stat.S_IMODE(info.st_mode) & 0o022):
        deny("legacy_a959_private_data_identity")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": identity, "observedIdentity": identity,
        "sizeBytes": info.st_size, "allocatedBytes": info.st_blocks * 512, "inodes": 1,
        "structuralSha256": None,
        "digest": {"policy": "PRIVATE_DATA_NEVER_RETIRE", "scope": "ROOT_IDENTITY_ONLY",
                   "ownerUid": info.st_uid, "groupGid": info.st_gid,
                   "mode": stat.S_IMODE(info.st_mode)},
        "class": "PRIVATE_DATA_NEVER_RETIRE", "state": "ACTIVE_DEPENDENCY",
        "retirableOn": "NEVER_AUTOMATIC",
        "dependencies": ["legacy_a959_installed_overlay_verified", "active_release_preserved"],
    }


def _f160_runtime_cache_artifact(descriptor: dict[str, Any],
                                 installed_verification: dict[str, Any]) -> dict[str, Any]:
    binding = descriptor["runtimeCacheOverlay"]
    path = Path(binding["path"])
    installed = Path(descriptor["installedReleasePath"])
    expected_relative = Path("frontend-runtime/.next/cache")
    if (path != installed / expected_relative or binding != {
            "path": str(installed / expected_relative),
            "classification": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
            "retirableOn": "WITH_PARENT_RELEASE_ONLY"}):
        deny("legacy_f160_runtime_cache_binding")
    observed = installed_verification.get("runtimeCacheOverlay")
    required = {"path", "classification", "state", "rootIdentity", "ownerUid", "groupGid",
                "mode", "observedEntries"}
    if (not isinstance(observed, dict) or set(observed) != required or
            observed.get("path") != expected_relative.as_posix() or
            observed.get("classification") != "EPHEMERAL_RUNTIME_CACHE" or
            observed.get("state") != "ACTIVE_DEPENDENCY"):
        deny("legacy_f160_runtime_cache_verification")
    identity = observed.get("rootIdentity")
    if (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
            any(type(identity.get(key)) is not int or identity[key] < 0
                for key in ("device", "inode"))):
        deny("legacy_f160_runtime_cache_verification")
    try:
        info = path.lstat(); installed_info = installed.lstat(); resolved = path.resolve(strict=True)
    except OSError:
        deny("legacy_f160_runtime_cache_identity")
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path or
            (info.st_dev, info.st_ino) != (identity["device"], identity["inode"]) or
            (info.st_uid, info.st_gid) != (installed_info.st_uid, installed_info.st_gid) or
            stat.S_IMODE(info.st_mode) & 0o022):
        deny("legacy_f160_runtime_cache_identity")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": identity, "observedIdentity": identity,
        "sizeBytes": info.st_size, "allocatedBytes": info.st_blocks * 512, "inodes": 1,
        "structuralSha256": None,
        "digest": {"policy": "EPHEMERAL_RUNTIME_CACHE", "scope": "ROOT_IDENTITY_ONLY",
                   "ownerUid": info.st_uid, "groupGid": info.st_gid,
                   "mode": stat.S_IMODE(info.st_mode)},
        "class": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
        "retirableOn": "WITH_PARENT_RELEASE_ONLY",
        "dependencies": ["legacy_f160_installed_overlay_verified", "active_release_preserved"],
    }


def _legacy_contract_is_fully_sanitized(contract: dict[str, Any],
                                         classified: list[dict[str, Any]]) -> bool:
    if (contract.get("releaseId") == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            contract.get("targetCommit") == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"]):
        retention = LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]
        expected_by_path = {path: int(ordinal)
                            for ordinal, path in retention["a959Ordinals"].items()}
    elif (contract.get("releaseId") in LEGACY_D436_F160_BINDINGS and
          contract.get("targetCommit") ==
          LEGACY_D436_F160_BINDINGS[contract["releaseId"]]["targetCommit"]):
        binding = LEGACY_D436_F160_BINDINGS[contract["releaseId"]]
        retention = LEGACY_RETENTION_BATCH
        expected_by_path = {retention["removedPaths"][ordinal - 1]: ordinal
                            for ordinal in binding["ordinals"]}
    else:
        return False
    derived = [item for item in classified if item["class"] in DERIVED_CLASSES]
    return (set(item["path"] for item in derived) == set(expected_by_path) and
            all(item.get("retentionState") == "SANITIZED" and
                item.get("removedByAuthenticatedRetention") == {
                    "batchId": retention["batchId"],
                    "receiptSha256": retention["receiptSha256"],
                    "journalSha256": retention["journalSha256"],
                    "ordinal": expected_by_path[item["path"]],
                } for item in derived))


def bootstrap_legacy_a959_v1_preserve(args: argparse.Namespace) -> None:
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_a959_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_a959_active_reference(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(installed, releases_root, policy, "releases")
    _strict_child(worktree, worktrees_root, "legacy_a959_worktree_outside_root")
    if (_path_has_symlink(worktree.parent, worktrees_root) or worktree.exists() or
            worktree.is_symlink()):
        deny("legacy_a959_worktree_not_retired")

    lifecycle_path = Path(descriptor["lifecycle"]["path"])
    review_path = Path(descriptor["review"]["path"])
    contract_output = Path(descriptor["contractOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if (contract_output != output / "generation-artifacts.private.json" or
            lifecycle_path != output / "generation-lifecycle.private.json" or
            review_path != output / "generation-review.private.json"):
        deny("legacy_a959_destination_binding")
    canonical_review_destination(review_path, contract_output, lifecycle_path, policy)
    evidence_destination(receipt_output, operational)

    writer_lock = outputs_root / ".generation-build.lock"
    writer_fd = acquire_existing_lock(writer_lock)
    try:
        retired = _authenticate_a959_prior_retention(args, descriptor, operational)
        lifecycle_raw, _ = stable_regular_hash(lifecycle_path, descriptor["lifecycle"]["sha256"],
                                               "legacy_a959_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-a959-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or
                lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_a959_lifecycle_identity")
        review_raw, review_info = stable_private(review_path, descriptor["review"]["sha256"])
        review = object_json(review_raw, "legacy-a959-review")
        expected_review = {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                           "reason", "evidenceSha256", "decision"}
        if (set(review) != expected_review or review.get("schemaVersion") != 1 or
                review.get("generationId") != descriptor["releaseId"] or
                review.get("lifecycleSha256") != descriptor["lifecycle"]["sha256"] or
                review.get("decision") != "PRESERVE"):
            deny("legacy_a959_review_identity")
        for name in ("package", "manifest", "index", "deployedMarker"):
            stable_regular_hash(Path(descriptor[name]["path"]), descriptor[name]["sha256"],
                                f"legacy_a959_{name}")
        package_verification = _run_legacy_package_verifier(descriptor)
        installed_verification = _run_legacy_installed_verifier(descriptor)
        comparable = ("apiEntrySha256", "buildId", "indexEntries")
        if any(package_verification.get(field) != installed_verification.get(field)
               for field in comparable):
            deny("legacy_a959_package_installed_mismatch")
        private_data_artifact = _a959_private_data_artifact(descriptor, installed_verification)
        private_data_path = Path(descriptor["privateDataOverlay"]["path"])
        fresh = capture_fresh_operational(operational)
        ignored = {contract_output}
        observation_a = {"output": _tree_observation(output, "a959-output", ignored),
                         "installed": _tree_observation(
                             installed, "a959-installed", {private_data_path}),
                         "absentDerived": sorted(retired)}
        release_root = output / descriptor["releaseId"]
        installed_info = installed.lstat()
        installed_artifact = {
            "path": str(installed), "releaseId": descriptor["releaseId"],
            "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
            "initialIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            "observedIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            **_legacy_structural_metrics(installed, {private_data_path}),
            "digest": {"manifestSha256": descriptor["manifest"]["sha256"],
                       "indexSha256": descriptor["index"]["sha256"],
                       "operationalMarkerSha256": descriptor["deployedMarker"]["sha256"]},
            "class": "RELEASE_RUNTIME", "state": "ACTIVE_DEPENDENCY",
            "retirableOn": "LEGACY_PRE_CONTRACT_SUPERSEDED",
            "dependencies": ["package_verified", "superseded_not_installed"],
        }
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(lifecycle_path, descriptor, "EVIDENCE_PRESERVE", "ACTIVE_DEPENDENCY",
                             {"sha256": descriptor["lifecycle"]["sha256"]}),
            installed_artifact,
            private_data_artifact,
            _authenticated_retired_artifact(worktree, descriptor, "DERIVED_WORKTREE",
                                            retired[str(worktree)],
                                            {"gitCommit": descriptor["targetCommit"]}),
            _authenticated_retired_artifact(
                release_root / "api-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "api-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
            _authenticated_retired_artifact(
                release_root / "frontend-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "frontend-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        for artifact in artifacts:
            if artifact["class"] in PRESERVE_CLASSES:
                artifact["retirableOn"] = "NEVER_AUTOMATIC"
                artifact["dependencies"] = ["legacy_a959_bootstrap_authenticated"]
            elif artifact["class"] == "RELEASE_RUNTIME":
                artifact["retirableOn"] = "NEVER_WHILE_OPERATIONALLY_REFERENCED"
                artifact["dependencies"] = ["installed_release_verified", "active_release_preserved"]
            elif artifact.get("removedByAuthenticatedRetention") is None:
                artifact["retirableOn"] = "LEGACY_V1_PRESERVE_CONTRACT_MATERIALIZED"
                artifact["dependencies"] = ["package_verified", "installed_release_verified",
                                              "active_release_excluded_from_retirement"]
        observation_b = {"output": _tree_observation(output, "a959-output", ignored),
                         "installed": _tree_observation(
                             installed, "a959-installed", {private_data_path}),
                         "absentDerived": sorted(retired)}
        if observation_a != observation_b:
            deny("legacy_a959_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_a959_operational_drift")
        review_after, after_info = stable_private(review_path, descriptor["review"]["sha256"])
        if (review_after != review_raw or
                (review_info.st_dev, review_info.st_ino) != (after_info.st_dev, after_info.st_ino)):
            deny("legacy_a959_review_changed")

        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(writer_lock),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": "LEGACY_V1_PRESERVE_NO_CONTRACT",
                   "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN", "releaseId": descriptor["releaseId"],
                   "targetCommit": descriptor["targetCommit"], "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw),
                   "preservedReviewSha256": descriptor["review"]["sha256"],
                   "priorRetentionReceiptSha256": descriptor["priorRetention"]["receiptSha256"],
                   "priorRetentionJournalSha256": descriptor["priorRetention"]["journalSha256"],
                   "packageVerification": package_verification,
                   "installedVerification": installed_verification,
                   "observations": [observation_a, observation_b], "authorizationGranted": False,
                   "executionPermitted": False, "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_a959_contract")
        # The v1 review is authenticated input. Bootstrap never rewrites it.
        stable_private(review_path, descriptor["review"]["sha256"])
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_a959_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["preservedReviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw), "authorizationGranted": False,
                         "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def bootstrap_legacy_batch_v1_preserve(args: argparse.Namespace) -> None:
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_batch_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_batch_operational_reference(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(installed, releases_root, policy, "releases")
    _strict_child(worktree, worktrees_root, "legacy_batch_worktree_outside_root")
    if (_path_has_symlink(worktree.parent, worktrees_root) or worktree.exists() or
            worktree.is_symlink()):
        deny("legacy_batch_worktree_not_retired")

    lifecycle_path = Path(descriptor["lifecycle"]["path"])
    review_path = Path(descriptor["review"]["path"])
    contract_output = Path(descriptor["contractOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if (contract_output != output / "generation-artifacts.private.json" or
            lifecycle_path != output / "generation-lifecycle.private.json" or
            review_path != output / "generation-review.private.json"):
        deny("legacy_batch_destination_binding")
    canonical_review_destination(review_path, contract_output, lifecycle_path, policy)
    evidence_destination(receipt_output, operational)

    writer_fd = acquire_existing_lock(outputs_root / ".generation-build.lock")
    try:
        retired = _authenticate_batch_prior_retention(args, descriptor, operational)
        lifecycle_raw, _ = stable_regular_hash(lifecycle_path, descriptor["lifecycle"]["sha256"],
                                               "legacy_batch_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-batch-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or
                lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_batch_lifecycle_identity")
        review_raw, review_info = stable_private(review_path, descriptor["review"]["sha256"])
        review = object_json(review_raw, "legacy-batch-review")
        if (set(review) != {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                           "reason", "evidenceSha256", "decision"} or
                review.get("schemaVersion") != 1 or
                review.get("generationId") != descriptor["releaseId"] or
                review.get("lifecycleSha256") != descriptor["lifecycle"]["sha256"] or
                review.get("decision") != "PRESERVE"):
            deny("legacy_batch_review_identity")
        for name in ("package", "manifest", "index", "deployedMarker"):
            stable_regular_hash(Path(descriptor[name]["path"]), descriptor[name]["sha256"],
                                f"legacy_batch_{name}")
        package_verification = _run_legacy_package_verifier(descriptor)
        installed_verification = _run_legacy_installed_verifier(descriptor)
        if any(package_verification.get(field) != installed_verification.get(field)
               for field in ("apiEntrySha256", "buildId", "indexEntries")):
            deny("legacy_batch_package_installed_mismatch")
        cache_artifact = (_f160_runtime_cache_artifact(descriptor, installed_verification)
                          if "runtimeCacheOverlay" in descriptor else None)
        ignored_installed = ({Path(descriptor["runtimeCacheOverlay"]["path"])}
                             if cache_artifact else set())
        fresh = capture_fresh_operational(operational)
        ignored_output = {contract_output}
        observation_a = {"output": _tree_observation(output, "legacy-batch-output", ignored_output),
                         "installed": _tree_observation(installed, "legacy-batch-installed",
                                                        ignored_installed),
                         "absentDerived": sorted(retired)}
        installed_info = installed.lstat()
        installed_artifact = {
            "path": str(installed), "releaseId": descriptor["releaseId"],
            "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
            "initialIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            "observedIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            **_legacy_structural_metrics(installed, ignored_installed),
            "digest": {"manifestSha256": descriptor["manifest"]["sha256"],
                       "indexSha256": descriptor["index"]["sha256"],
                       "operationalMarkerSha256": descriptor["deployedMarker"]["sha256"]},
            "class": "RELEASE_RUNTIME", "state": descriptor["operationalRole"],
            "retirableOn": "NEVER_WHILE_OPERATIONALLY_REFERENCED",
            "dependencies": ["installed_release_verified", "operational_role_preserved"],
        }
        release_root = output / descriptor["releaseId"]
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(lifecycle_path, descriptor, "EVIDENCE_PRESERVE", "ACTIVE_DEPENDENCY",
                             {"sha256": descriptor["lifecycle"]["sha256"]}),
            installed_artifact,
            _authenticated_retired_artifact(worktree, descriptor, "DERIVED_WORKTREE",
                                            retired[str(worktree)],
                                            {"gitCommit": descriptor["targetCommit"]}),
            _authenticated_retired_artifact(
                release_root / "api-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "api-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
            _authenticated_retired_artifact(
                release_root / "frontend-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "frontend-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        if cache_artifact:
            artifacts.insert(5, cache_artifact)
        for artifact in artifacts:
            if artifact["class"] in {"PACKAGE_PRESERVE", "EVIDENCE_PRESERVE"}:
                artifact["retirableOn"] = "NEVER_AUTOMATIC"
                artifact["dependencies"] = ["legacy_batch_bootstrap_authenticated"]
        observation_b = {"output": _tree_observation(output, "legacy-batch-output", ignored_output),
                         "installed": _tree_observation(installed, "legacy-batch-installed",
                                                        ignored_installed),
                         "absentDerived": sorted(retired)}
        if observation_a != observation_b:
            deny("legacy_batch_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_batch_operational_drift")
        review_after, after_info = stable_private(review_path, descriptor["review"]["sha256"])
        if (review_after != review_raw or
                (review_info.st_dev, review_info.st_ino) != (after_info.st_dev, after_info.st_ino)):
            deny("legacy_batch_review_changed")
        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(outputs_root / ".generation-build.lock"),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"} |
                                      ({F160_CACHE_CLASS} if cache_artifact else set())),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": descriptor["sourceState"],
                   "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN", "releaseId": descriptor["releaseId"],
                   "targetCommit": descriptor["targetCommit"], "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw),
                   "preservedReviewSha256": descriptor["review"]["sha256"],
                   "priorRetentionReceiptSha256": descriptor["priorRetention"]["receiptSha256"],
                   "priorRetentionJournalSha256": descriptor["priorRetention"]["journalSha256"],
                   "packageVerification": package_verification,
                   "installedVerification": installed_verification,
                   "observations": [observation_a, observation_b], "authorizationGranted": False,
                   "executionPermitted": False, "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_batch_contract")
        stable_private(review_path, descriptor["review"]["sha256"])
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_batch_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["preservedReviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw), "authorizationGranted": False,
                         "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def bootstrap_legacy(args: argparse.Namespace) -> None:
    if not args.reviewer.strip() or not args.reason.strip():
        deny("legacy_review_identity")
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_reference_absence(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(worktree, worktrees_root, policy, "worktrees")
    _strict_child(installed, releases_root, "legacy_installed_release_path")
    if installed.exists() or installed.is_symlink():
        deny("legacy_release_installed")

    contract_output = Path(descriptor["contractOutput"])
    review_output = Path(descriptor["reviewOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if contract_output != output / "generation-artifacts.private.json" or \
            review_output != output / "generation-review.private.json":
        deny("legacy_destination_binding")
    canonical_review_destination(review_output, contract_output,
                                 Path(descriptor["lifecycle"]["path"]), policy)
    evidence_destination(receipt_output, operational)

    writer_lock = outputs_root / ".generation-build.lock"
    writer_fd = acquire_existing_lock(writer_lock)
    try:
        if installed.exists() or installed.is_symlink():
            deny("legacy_release_installed")
        lifecycle_raw, _ = stable_regular_hash(Path(descriptor["lifecycle"]["path"]),
                                               descriptor["lifecycle"]["sha256"], "legacy_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_lifecycle_identity")
        stable_regular_hash(Path(descriptor["package"]["path"]), descriptor["package"]["sha256"],
                            "legacy_package")
        stable_regular_hash(Path(descriptor["manifest"]["path"]), descriptor["manifest"]["sha256"],
                            "legacy_manifest")
        stable_regular_hash(Path(descriptor["index"]["path"]), descriptor["index"]["sha256"],
                            "legacy_index")
        verification = _run_legacy_package_verifier(descriptor)
        try:
            head = subprocess.run(["/usr/bin/git", "-C", str(worktree), "rev-parse", "HEAD"],
                                  text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired):
            deny("legacy_worktree_head")
        if head.returncode or head.stdout.strip() != descriptor["targetCommit"]:
            deny("legacy_worktree_head")
        fresh = capture_fresh_operational(operational)
        ignored_bootstrap_outputs = {contract_output, review_output}
        observation_a = {"output": _tree_observation(output, "output", ignored_bootstrap_outputs),
                         "worktree": _tree_observation(worktree, "worktree")}

        release_root = output / descriptor["releaseId"]
        api = release_root / "api-runtime"
        frontend = release_root / "frontend-runtime"
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(Path(descriptor["lifecycle"]["path"]), descriptor, "EVIDENCE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["lifecycle"]["sha256"]}),
            _legacy_artifact(worktree, descriptor, "DERIVED_WORKTREE", "RETIREMENT_READY",
                             {"gitCommit": descriptor["targetCommit"]}),
            _legacy_artifact(api, descriptor, "DERIVED_OUTPUT_RUNTIME", "RETIREMENT_READY",
                             {"indexSha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(frontend, descriptor, "DERIVED_OUTPUT_RUNTIME", "RETIREMENT_READY",
                             {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        observation_b = {"output": _tree_observation(output, "output", ignored_bootstrap_outputs),
                         "worktree": _tree_observation(worktree, "worktree")}
        if observation_a != observation_b:
            deny("legacy_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_operational_drift")
        if installed.exists() or installed.is_symlink():
            deny("legacy_release_installed")

        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(writer_lock),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        review = {"schemaVersion": 2, "generationId": descriptor["releaseId"],
                  "lifecycleSha256": descriptor["lifecycle"]["sha256"],
                  "state": "RETIREMENT_READY", "reviewer": args.reviewer,
                  "reason": args.reason, "evidenceSha256": digest_bytes(contract_raw)}
        review_raw = canonical(review)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": "LEGACY_PRE_CONTRACT", "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN",
                   "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                   "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw), "reviewSha256": digest_bytes(review_raw),
                   "verification": verification, "observations": [observation_a, observation_b],
                   "authorizationGranted": False, "executionPermitted": False,
                   "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_contract")
        write_or_verify_exact(review_output, review_raw, "legacy_review")
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["reviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw),
                         "authorizationGranted": False, "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def prepare(args: argparse.Namespace) -> None:
    contract_raw, _ = stable_private(args.contract, args.contract_sha256)
    lifecycle_raw, _ = stable_private(args.lifecycle, args.lifecycle_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    contract = object_json(contract_raw, "artifact-contract")
    lifecycle = object_json(lifecycle_raw, "generation-lifecycle")
    operational = object_json(operational_raw, "operational-state")
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    validate_contract(contract); validate_operational(operational, contract, policy)
    validate_artifact_roots(contract, operational, policy)
    canonical_review_destination(args.review_output, args.contract, args.lifecycle, policy)
    reconciliation = authenticate_reconciliation(args, contract, args.root_policy_sha256)
    reconciled_paths = {item["path"] for item in reconciliation["completed"]}
    legacy_migration = None
    if args.review_output.exists() or args.review_output.is_symlink():
        existing_raw, _ = stable_private(args.review_output)
        existing = object_json(existing_raw, "generation-review")
        if existing.get("schemaVersion") == 1 and existing.get("decision") == "PRESERVE":
            if not args.legacy_review_sha256 or digest_bytes(existing_raw) != args.legacy_review_sha256:
                deny("legacy_migration_binding_required")
            expected = {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                        "reason", "evidenceSha256", "decision"}
            if (set(existing) != expected or existing.get("generationId") != contract["generationId"] or
                    existing.get("lifecycleSha256") != args.lifecycle_sha256):
                deny("legacy_migration_identity")
            legacy_migration = {"fromSchemaVersion": 1, "fromDecision": "PRESERVE",
                                "reviewSha256": args.legacy_review_sha256,
                                "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN"}
    elif args.legacy_review_sha256:
        deny("legacy_migration_review_missing")
    for destination in (args.intent_output, args.commands_output):
        outside_artifacts(destination, contract["artifacts"])
        evidence_destination(destination, operational)
    if (lifecycle.get("generationId") != contract["generationId"] or
            lifecycle.get("state") not in {"COMPLETE", "FAILED"}):
        deny("lifecycle_not_terminal")
    writer_fd = acquire_existing_lock(Path(contract["writerLockPath"]))
    try:
        fresh = capture_fresh_operational(operational)
        classified = []
        commands = []
        for artifact in contract["artifacts"]:
            if artifact["path"] not in reconciled_paths:
                authenticate_artifact(artifact)
            state = "SANITIZED" if artifact["path"] in reconciled_paths else classify(artifact, contract, operational)
            if (artifact["class"] == "RELEASE_RUNTIME" and
                    state in {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY"} and
                    not Path(artifact["path"]).is_dir()):
                deny("protected_release_missing")
            item = {**artifact, "retentionState": state}
            classified.append(item)
            # Derived artifacts remain conditionally authorized because their
            # eligibility is re-evaluated under both locks at execution time.
            # An installed release is narrower: it enters the authorization only
            # when prepare proves it is already outside every protected graph.
            command_required = (
                artifact["class"] in DERIVED_CLASSES and state != "SANITIZED"
            ) or (
                artifact["class"] == "RELEASE_RUNTIME" and state == "RETIREMENT_READY"
            )
            if command_required and artifact["path"] not in reconciled_paths:
                command, text = command_for(artifact, operational)
                original_ordinal = next(index for index, item in enumerate(contract["artifacts"], 1)
                                        if item["path"] == artifact["path"])
                commands.append({"ordinal": original_ordinal, "path": artifact["path"],
                                 "class": artifact["class"], "argv": command, "literal": text,
                                 "allocatedBytes": artifact["allocatedBytes"],
                                 "eligibilityAtPrepare": state})
        state = ("SANITIZED" if _legacy_contract_is_fully_sanitized(contract, classified)
                 else review_state([item["retentionState"] for item in classified]))
        intent = {
            "schemaVersion": 3, "generationId": contract["generationId"],
            "releaseId": contract["releaseId"], "targetCommit": contract["targetCommit"],
            "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "authorizationGranted": False,
            "contractSha256": args.contract_sha256, "lifecycleSha256": args.lifecycle_sha256,
            "operationalStateSha256": args.operational_state_sha256,
            "rootPolicySha256": args.root_policy_sha256,
            "reviewOutput": str(args.review_output),
            "canonicalRoots": operational["canonicalRoots"],
            "controlPlaneArtifacts": operational["controlPlaneArtifacts"],
            "freshObservation": fresh,
            "legacyMigration": legacy_migration,
            "reconciliation": reconciliation,
            "artifacts": classified, "commands": commands,
            "executionContract": {"canonicalLock": str(args.deployment_lock),
                                  "writerLock": contract["writerLockPath"],
                                  "attemptBeforeCommand": True, "stopOnFirstFailure": True,
                                  "automaticRetry": False, "force": False, "prune": False,
                                  "globExpansion": False, "receiptFsync": True},
        }
        intent_raw = canonical(intent)
        commands_raw = ("\n".join(command["literal"] for command in commands) + ("\n" if commands else "")).encode()
        write_exclusive(args.commands_output, commands_raw)
        intent["commandsSha256"] = digest_bytes(commands_raw)
        intent_raw = canonical(intent)
        write_exclusive(args.intent_output, intent_raw)
        review = {"schemaVersion": 2, "generationId": contract["generationId"],
                  "lifecycleSha256": args.lifecycle_sha256, "state": state,
                  "reviewer": args.reviewer, "reason": args.reason,
                  "evidenceSha256": digest_bytes(intent_raw)}
        replace_private(args.review_output, canonical(review))
        print(canonical({"result": "GENERATION_RETIREMENT_PREPARED", "state": state,
                         "intentSha256": digest_bytes(intent_raw),
                         "commandsSha256": digest_bytes(commands_raw),
                         "commandCount": len(commands)}).decode().strip())
    finally:
        os.close(writer_fd)


def append_event(path: Path, value: dict[str, Any]) -> None:
    encoded = canonical(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    try:
        write = os.write(fd, encoded)
        if write != len(encoded):
            deny("journal_short_write")
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def validate_intent(intent: dict[str, Any], operational: dict[str, Any], policy_sha256: str) -> list[dict[str, Any]]:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "authorizationGranted", "contractSha256", "lifecycleSha256",
                "operationalStateSha256", "artifacts", "commands", "commandsSha256",
                "executionContract", "canonicalRoots", "controlPlaneArtifacts", "freshObservation",
                "rootPolicySha256", "reviewOutput", "reconciliation"}
    required.add("legacyMigration")
    if (set(intent) != required or intent.get("schemaVersion") != 3 or
            intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("authorizationGranted") is not False):
        deny("intent_schema")
    if intent.get("rootPolicySha256") != policy_sha256:
        deny("intent_root_policy")
    if intent.get("canonicalRoots") != operational.get("canonicalRoots"):
        deny("intent_canonical_roots")
    if intent.get("controlPlaneArtifacts") != operational.get("controlPlaneArtifacts"):
        deny("intent_control_plane")
    if not Path(str(intent.get("reviewOutput", ""))).is_absolute():
        deny("intent_review_output")
    execution = intent.get("executionContract")
    expected_execution = {"canonicalLock", "writerLock", "attemptBeforeCommand",
                          "stopOnFirstFailure", "automaticRetry", "force", "prune",
                          "globExpansion", "receiptFsync"}
    if (not isinstance(execution, dict) or set(execution) != expected_execution or
            execution.get("attemptBeforeCommand") is not True or
            execution.get("stopOnFirstFailure") is not True or
            execution.get("automaticRetry") is not False or execution.get("force") is not False or
            execution.get("prune") is not False or execution.get("globExpansion") is not False or
            execution.get("receiptFsync") is not True):
        deny("intent_execution_contract")
    artifacts = intent.get("artifacts")
    commands = intent.get("commands")
    if not isinstance(artifacts, list) or not isinstance(commands, list):
        deny("intent_content")
    by_path = {item.get("path"): item for item in artifacts if isinstance(item, dict)}
    if len(by_path) != len(artifacts):
        deny("intent_artifacts")
    validate_reconciliation(intent.get("reconciliation"), artifacts, require_absent=True)
    literals = []
    previous_ordinal = 0
    for item in commands:
        if not isinstance(item, dict) or set(item) != {"ordinal", "path", "class", "argv", "literal", "allocatedBytes", "eligibilityAtPrepare"}:
            deny("intent_command")
        artifact = by_path.get(item["path"])
        if (not isinstance(item["ordinal"], int) or item["ordinal"] <= previous_ordinal or not artifact or
                artifact.get("class") not in RETIRABLE_CLASSES or item["class"] != artifact["class"]):
            deny("intent_command_scope")
        previous_ordinal = item["ordinal"]
        if item.get("eligibilityAtPrepare") != artifact.get("retentionState"):
            deny("intent_command_eligibility")
        if (item["class"] == "RELEASE_RUNTIME" and
                item.get("eligibilityAtPrepare") != "RETIREMENT_READY"):
            deny("intent_release_runtime_not_retirement_ready")
        expected, literal = command_for(artifact, operational)
        if item["argv"] != expected or item["literal"] != literal:
            deny("intent_command_literal")
        literals.append(literal)
    commands_raw = ("\n".join(literals) + ("\n" if literals else "")).encode()
    if digest_bytes(commands_raw) != intent.get("commandsSha256"):
        deny("intent_commands_hash")
    return commands


def execute(args: argparse.Namespace) -> None:
    intent_raw, _ = stable_private(args.intent, args.intent_sha256)
    authorization_raw, _ = stable_private(args.authorization, args.authorization_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    intent = object_json(intent_raw, "intent")
    authorization = object_json(authorization_raw, "authorization")
    operational = object_json(operational_raw, "operational-state")
    contract_identity = {
        "generationId": intent.get("generationId"),
        "releaseId": intent.get("releaseId"),
        "targetCommit": intent.get("targetCommit"),
    }
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    validate_operational(operational, contract_identity, policy)
    required_auth = {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"}
    if (set(authorization) != required_auth or authorization.get("schemaVersion") != 1 or
            authorization.get("decision") != "AUTHORIZE_ONCE" or
            authorization.get("intentSha256") != args.intent_sha256 or
            not isinstance(authorization.get("owner"), str) or not authorization["owner"].strip()):
        deny("authorization_invalid")
    commands = validate_intent(intent, operational, args.root_policy_sha256)
    if not isinstance(commands, list) or authorization.get("approvedPaths") != [item["path"] for item in commands]:
        deny("authorization_scope")
    validate_artifact_roots({"artifacts": intent["artifacts"]}, operational, policy)
    lifecycle_artifacts = [item for item in intent["artifacts"]
                           if Path(item["path"]).name == "generation-lifecycle.private.json"]
    if len(lifecycle_artifacts) != 1:
        deny("intent_lifecycle_artifact")
    lifecycle_path = Path(lifecycle_artifacts[0]["path"])
    contract_path = lifecycle_path.parent / "generation-artifacts.private.json"
    stable_private(contract_path, intent["contractSha256"])
    stable_private(lifecycle_path, intent["lifecycleSha256"])
    canonical_review_destination(args.review_output, contract_path, lifecycle_path, policy)
    if str(args.review_output) != intent["reviewOutput"]:
        deny("intent_review_output")
    canonical_fd = acquire_or_authenticate_lock(
        args.deployment_lock, getattr(args, "deployment_lock_fd", None), args.intent_sha256)
    writer_fd = acquire_existing_lock(Path(intent["executionContract"]["writerLock"]))
    attempted = completed = 0
    removed: list[str] = []
    receipt_state = "DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED" else "SANITIZED"
    try:
        # These observations happen only after both locks and before the first
        # ATTEMPT. A stale prepare snapshot cannot authorize a deletion.
        validate_artifact_roots({"artifacts": intent["artifacts"]}, operational, policy)
        fresh = capture_fresh_operational(operational)
        if operational["deploymentState"]["state"] == "DEPLOYED":
            release = intent["releaseId"]
            if (release not in operational["activeReleases"] or
                    release not in operational["installedVerifiedReleases"] or
                    not any(release in Path(item["target"]).parts
                            for item in operational["observations"]["currentLinks"])):
                deny("fresh_deployed_release_graph")
        reconciled_paths = {item["path"] for item in intent["reconciliation"]["completed"]}
        for artifact in intent["artifacts"]:
            if artifact["path"] not in reconciled_paths:
                authenticate_artifact(artifact)
            elif Path(artifact["path"]).exists() or Path(artifact["path"]).is_symlink():
                deny("reconciled_path_reappeared")
        evidence_destination(args.receipt_root, operational)
        args.receipt_root.mkdir(mode=0o700, parents=False)
        journal = args.receipt_root / "command-results.private.jsonl"
        try:
            fresh_before_attempt = capture_fresh_operational(operational)
            if fresh_before_attempt != fresh:
                deny("fresh_operational_changed_before_attempt")
            by_path = {item["path"]: item for item in intent["artifacts"]}
            execution_contract = {**contract_identity, "artifacts": intent["artifacts"]}
            executable = []
            for item in commands:
                state = classify(by_path[item["path"]], execution_contract, operational)
                if state == "RETIREMENT_READY":
                    executable.append(item)
            for item in executable:
                attempted += 1
                append_event(journal, {"event": "ATTEMPT", "ordinal": item["ordinal"],
                                       "path": item["path"], "argv": item["argv"]})
                result = subprocess.run(item["argv"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                append_event(journal, {"event": "RESULT", "ordinal": item["ordinal"],
                                       "exitCode": result.returncode,
                                       "stdoutSha256": digest_bytes(result.stdout),
                                       "stderrSha256": digest_bytes(result.stderr)})
                if result.returncode:
                    deny(f"retirement_command:{item['ordinal']}:exit_{result.returncode}")
                if Path(item["path"]).exists() or Path(item["path"]).is_symlink():
                    deny(f"retirement_path_remains:{item['ordinal']}")
                completed += 1; removed.append(item["path"])
                append_event(journal, {"event": "VERIFIED", "ordinal": item["ordinal"], "absent": True})
            removed_set = set(removed) | reconciled_paths
            for artifact in intent["artifacts"]:
                if artifact["path"] not in removed_set:
                    authenticate_artifact(artifact)
            fresh_final = capture_fresh_operational(operational)
            if fresh_final != fresh_before_attempt:
                deny("fresh_operational_changed_during_retirement")
        except BaseException as error:
            receipt_state = "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED" else "QUARANTINED"
            all_removed = [item["path"] for item in intent["reconciliation"]["completed"]] + removed
            receipt = {"schemaVersion": 1, "state": receipt_state,
                       "failurePredicate": str(error), "attemptedCommands": attempted,
                       "completedCommands": len(all_removed), "removedPaths": all_removed,
                       "intentSha256": args.intent_sha256, "automaticRetry": False,
                       "commandLogSha256": digest_bytes(journal.read_bytes()) if journal.exists() else digest_bytes(b""),
                       "freshObservation": fresh}
            write_exclusive(args.receipt_root / "execution-receipt.private.json", canonical(receipt))
            review = {"schemaVersion": 2, "generationId": intent["generationId"],
                      "lifecycleSha256": intent["lifecycleSha256"], "state": "QUARANTINED",
                      "reviewer": authorization["owner"], "reason": "partial retirement requires review",
                      "evidenceSha256": digest_bytes(canonical(receipt))}
            replace_private(args.review_output, canonical(review))
            raise
        # Recompute every retirable path in the generation contract. A successful
        # subset is retention-incomplete, never SANITIZED.
        remaining = []
        authorized_paths = {item["path"] for item in commands}
        for artifact in intent["artifacts"]:
            if artifact["path"] in authorized_paths:
                path = Path(artifact["path"])
                if path.exists() or path.is_symlink():
                    remaining.append(artifact["path"])
        receipt_state = ("DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "SANITIZED") if not remaining else (
                         "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "RETENTION_INCOMPLETE")
        journal_sha = digest_bytes(journal.read_bytes()) if journal.exists() else digest_bytes(b"")
        all_removed = [item["path"] for item in intent["reconciliation"]["completed"]] + removed
        receipt = {"schemaVersion": 1, "state": receipt_state, "failurePredicate": None,
                   "attemptedCommands": attempted, "completedCommands": len(all_removed),
                   "removedPaths": all_removed, "intentSha256": args.intent_sha256,
                   "commandLogSha256": journal_sha, "automaticRetry": False,
                   "remainingDerivedPaths": remaining, "freshObservation": fresh,
                   "lock": {"canonicalHeldThroughReceiptFsync": True,
                            "writerHeldThroughReceiptFsync": True}}
        receipt_raw = canonical(receipt)
        write_exclusive(args.receipt_root / "execution-receipt.private.json", receipt_raw)
        review_terminal = "SANITIZED" if not remaining else "QUARANTINED"
        review = {"schemaVersion": 2, "generationId": intent["generationId"],
                  "lifecycleSha256": intent["lifecycleSha256"], "state": review_terminal,
                  "reviewer": authorization["owner"], "reason": "derived artifacts retired",
                  "evidenceSha256": digest_bytes(receipt_raw)}
        replace_private(args.review_output, canonical(review))
        fsync_dir(args.receipt_root)
        print(canonical({"result": receipt_state, "receiptSha256": digest_bytes(receipt_raw),
                         "removedPaths": len(removed), "remainingDerivedPaths": len(remaining)}).decode().strip())
    finally:
        os.close(writer_fd); os.close(canonical_fd)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    bootstrap_parser = commands.add_parser("bootstrap-legacy")
    bootstrap_parser.add_argument("--descriptor", type=Path, required=True)
    bootstrap_parser.add_argument("--descriptor-sha256", required=True)
    bootstrap_parser.add_argument("--root-policy", type=Path, required=True)
    bootstrap_parser.add_argument("--root-policy-sha256", required=True)
    bootstrap_parser.add_argument("--operational-state", type=Path, required=True)
    bootstrap_parser.add_argument("--operational-state-sha256", required=True)
    bootstrap_parser.add_argument("--reviewer", required=True)
    bootstrap_parser.add_argument("--reason", required=True)
    bootstrap_parser.set_defaults(handler=bootstrap_legacy)
    a959_parser = commands.add_parser("bootstrap-legacy-a959-v1-preserve")
    a959_parser.add_argument("--descriptor", type=Path, required=True)
    a959_parser.add_argument("--descriptor-sha256", required=True)
    a959_parser.add_argument("--root-policy", type=Path, required=True)
    a959_parser.add_argument("--root-policy-sha256", required=True)
    a959_parser.add_argument("--operational-state", type=Path, required=True)
    a959_parser.add_argument("--operational-state-sha256", required=True)
    a959_parser.add_argument("--retention-receipt", type=Path, required=True)
    a959_parser.add_argument("--retention-receipt-sha256", required=True)
    a959_parser.add_argument("--retention-journal", type=Path, required=True)
    a959_parser.add_argument("--retention-journal-sha256", required=True)
    a959_parser.set_defaults(handler=bootstrap_legacy_a959_v1_preserve)
    batch_parser = commands.add_parser("bootstrap-legacy-batch-v1-preserve")
    batch_parser.add_argument("--descriptor", type=Path, required=True)
    batch_parser.add_argument("--descriptor-sha256", required=True)
    batch_parser.add_argument("--root-policy", type=Path, required=True)
    batch_parser.add_argument("--root-policy-sha256", required=True)
    batch_parser.add_argument("--operational-state", type=Path, required=True)
    batch_parser.add_argument("--operational-state-sha256", required=True)
    batch_parser.add_argument("--retention-receipt", type=Path, required=True)
    batch_parser.add_argument("--retention-receipt-sha256", required=True)
    batch_parser.add_argument("--retention-journal", type=Path, required=True)
    batch_parser.add_argument("--retention-journal-sha256", required=True)
    batch_parser.set_defaults(handler=bootstrap_legacy_batch_v1_preserve)
    prepare_parser = commands.add_parser("prepare")
    for name in ("contract", "lifecycle", "operational-state"):
        prepare_parser.add_argument(f"--{name}", type=Path, required=True)
        prepare_parser.add_argument(f"--{name}-sha256", required=True)
    prepare_parser.add_argument("--root-policy", type=Path, required=True)
    prepare_parser.add_argument("--root-policy-sha256", required=True)
    prepare_parser.add_argument("--deployment-lock", type=Path, required=True)
    prepare_parser.add_argument("--intent-output", type=Path, required=True)
    prepare_parser.add_argument("--commands-output", type=Path, required=True)
    prepare_parser.add_argument("--review-output", type=Path, required=True)
    prepare_parser.add_argument("--reviewer", required=True)
    prepare_parser.add_argument("--reason", required=True)
    prepare_parser.add_argument("--legacy-review-sha256")
    for name in ("prior-intent", "prior-receipt", "prior-journal"):
        prepare_parser.add_argument(f"--{name}", type=Path)
        prepare_parser.add_argument(f"--{name}-sha256")
    prepare_parser.set_defaults(handler=prepare)
    execute_parser = commands.add_parser("execute")
    for name in ("intent", "authorization", "operational-state"):
        execute_parser.add_argument(f"--{name}", type=Path, required=True)
        execute_parser.add_argument(f"--{name}-sha256", required=True)
    execute_parser.add_argument("--root-policy", type=Path, required=True)
    execute_parser.add_argument("--root-policy-sha256", required=True)
    execute_parser.add_argument("--deployment-lock", type=Path, required=True)
    execute_parser.add_argument("--deployment-lock-fd", type=int)
    execute_parser.add_argument("--receipt-root", type=Path, required=True)
    execute_parser.add_argument("--review-output", type=Path, required=True)
    execute_parser.set_defaults(handler=execute)
    return root


def main() -> int:
    try:
        args = parser().parse_args()
        args.handler(args)
        return 0
    except Denied as error:
        print(f"GENERATION_RETIREMENT_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
