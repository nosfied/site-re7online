#!/usr/bin/env python3
"""Materialize the closed release-graph reconciliation control bundle.

Hashes are derived from the authenticated integrated source bytes.  No digest
from an operator prompt or review summary is accepted as a source of truth.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Any

SHA256 = re.compile(r"[0-9a-f]{64}")
GIT_SHA1 = re.compile(r"[0-9a-f]{40}")
CONTROL_FILES = (
    "scripts/generation-retirement.py",
    "scripts/preparation_artifact_lifecycle.py",
    "scripts/capacity-recovery.py",
    "config/legacy-generation-d436239e-v1-preserve.json",
    "config/legacy-generation-f1602787-v1-preserve.json",
)
DESCRIPTORS = CONTROL_FILES[-2:]


class MaterializationDenied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise MaterializationDenied(predicate)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def integrated_blob_sha256(control_root: Path, source_commit: str,
                           relative: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(control_root), "show", f"{source_commit}:{relative}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        deny("CONTROL_INTEGRATED_SOURCE_READ")
    if result.returncode != 0:
        deny("CONTROL_INTEGRATED_SOURCE_READ")
    return hashlib.sha256(result.stdout).hexdigest()


def require_sha256(value: Any, predicate: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value):
        deny(predicate)
    return value


def regular_identity(path: Path, predicate: str) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError:
        deny(predicate)
    if path.is_symlink() or not stat.S_ISREG(info.st_mode):
        deny(predicate)
    return info


def file_binding(path: Path) -> dict[str, str]:
    regular_identity(path, "REQUEST_BINDING_IDENTITY")
    return {"path": str(path), "sha256": sha256_file(path)}


def request_binding_readback(value: Any) -> list[dict[str, str]]:
    bindings: list[dict[str, str]] = []
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            if set(current) == {"path", "sha256"}:
                digest = require_sha256(current.get("sha256"),
                                        "REQUEST_BINDING_SHA256_FORMAT")
                raw_path = current.get("path")
                if not isinstance(raw_path, str):
                    deny("REQUEST_BINDING_PATH")
                path = Path(raw_path)
                regular_identity(path, "REQUEST_BINDING_IDENTITY")
                if sha256_file(path) != digest:
                    deny("REQUEST_BINDING_SHA256_DIVERGENCE")
                bindings.append({"path": str(path), "sha256": digest})
            else:
                stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    if not bindings:
        deny("REQUEST_BINDINGS_EMPTY")
    return sorted(bindings, key=lambda item: (item["path"], item["sha256"]))


def seal_request(path: Path, request: dict[str, Any]) -> dict[str, Any]:
    before = request_binding_readback(request)
    write_json_exclusive(path, request)
    raw = path.read_bytes()
    try:
        reopened = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("REQUEST_READBACK_JSON")
    if reopened != request:
        deny("REQUEST_READBACK_DIVERGENCE")
    after = request_binding_readback(reopened)
    if after != before:
        deny("REQUEST_BINDING_DRIFT")
    return {"path": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
            "bindings": after}


def copy_exclusive(source: Path, target: Path) -> None:
    regular_identity(source, "CONTROL_SOURCE_IDENTITY")
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        target_fd = os.open(
            target,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
        )
        try:
            while True:
                block = os.read(source_fd, 1024 * 1024)
                if not block:
                    break
                view = memoryview(block)
                while view:
                    written = os.write(target_fd, view)
                    view = view[written:]
            os.fsync(target_fd)
        finally:
            os.close(target_fd)
    finally:
        os.close(source_fd)


def write_json_exclusive(path: Path, value: Any) -> None:
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
        0o600,
    )
    try:
        view = memoryview(raw)
        while view:
            written = os.write(fd, view)
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)


def load_copied_consumer(custody: Path):
    path = custody / "scripts/generation-retirement.py"
    spec = importlib.util.spec_from_file_location("sealed_generation_retirement", path)
    if spec is None or spec.loader is None:
        deny("CONTROL_CONSUMER_IMPORT")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def descriptor_cross_readback(consumer: Any, custody: Path, relative: str,
                              expected_sha256: str) -> dict[str, Any]:
    path = custody / relative
    require_sha256(expected_sha256, "CONTROL_BINDING_SHA256_FORMAT")
    if sha256_file(path) != expected_sha256:
        deny("CONTROL_BINDING_SHA256_DIVERGENCE")
    raw = path.read_bytes()
    descriptor = consumer.validate_batch_legacy_descriptor(raw, expected_sha256)
    prior = descriptor.get("priorRetention")
    if not isinstance(prior, dict):
        deny("DESCRIPTOR_PRIOR_RETENTION")
    for key in ("receiptSha256", "journalSha256", "sampleASha256", "sampleBSha256"):
        require_sha256(prior.get(key), f"DESCRIPTOR_{key.upper()}_FORMAT")
    for section in ("review", "lifecycle"):
        value = descriptor.get(section)
        if not isinstance(value, dict):
            deny(f"DESCRIPTOR_{section.upper()}_BINDING")
        require_sha256(value.get("sha256"), f"DESCRIPTOR_{section.upper()}_SHA256_FORMAT")
    sha_bindings: dict[str, str] = {}
    stack: list[tuple[str, Any]] = [("descriptor", descriptor)]
    while stack:
        prefix, value = stack.pop()
        if isinstance(value, dict):
            for key, child in value.items():
                name = f"{prefix}.{key}"
                if key.endswith("Sha256"):
                    sha_bindings[name] = require_sha256(
                        child, f"DESCRIPTOR_SHA256_FORMAT:{name}")
                else:
                    stack.append((name, child))
        elif isinstance(value, list):
            stack.extend((f"{prefix}[{index}]", child)
                         for index, child in enumerate(value))
    return {
        "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"],
        "descriptorSha256": expected_sha256,
        "priorRetentionReceiptSha256": prior["receiptSha256"],
        "priorRetentionJournalSha256": prior["journalSha256"],
        "contractOutput": descriptor["contractOutput"],
        "lifecycle": descriptor["lifecycle"],
        "review": descriptor["review"],
        "allSha256Bindings": dict(sorted(sha_bindings.items())),
    }


def readback_index(custody: Path, index: dict[str, Any]) -> dict[str, Any]:
    if set(index) != {"schemaVersion", "state", "sourceCommit", "files"}:
        deny("CONTROL_INDEX_SCHEMA")
    if index.get("schemaVersion") != 1 or index.get("state") != "SEALED_CONTROL_BUNDLE":
        deny("CONTROL_INDEX_STATE")
    if (not isinstance(index.get("sourceCommit"), str) or
            not GIT_SHA1.fullmatch(index["sourceCommit"])):
        deny("CONTROL_SOURCE_COMMIT_FORMAT")
    files = index.get("files")
    if not isinstance(files, list) or [item.get("relativePath") for item in files] != list(CONTROL_FILES):
        deny("CONTROL_INDEX_FILES")
    for item in files:
        if not isinstance(item, dict) or set(item) != {"relativePath", "sha256", "size"}:
            deny("CONTROL_INDEX_FILE_SCHEMA")
        digest = require_sha256(item["sha256"], "CONTROL_BINDING_SHA256_FORMAT")
        path = custody / item["relativePath"]
        info = regular_identity(path, "CONTROL_BINDING_IDENTITY")
        if stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != item["size"]:
            deny("CONTROL_BINDING_IDENTITY")
        if sha256_file(path) != digest:
            deny("CONTROL_BINDING_SHA256_DIVERGENCE")
    consumer = load_copied_consumer(custody)
    descriptors = [
        descriptor_cross_readback(
            consumer, custody, relative,
            next(item["sha256"] for item in files if item["relativePath"] == relative),
        )
        for relative in DESCRIPTORS
    ]
    return {"files": files, "descriptors": descriptors}


def materialize(control_root: Path, custody: Path, source_commit: str) -> dict[str, Any]:
    if not isinstance(source_commit, str) or not GIT_SHA1.fullmatch(source_commit):
        deny("CONTROL_SOURCE_COMMIT_FORMAT")
    if custody.exists() or custody.is_symlink():
        deny("CONTROL_CUSTODY_EXISTS")
    custody.mkdir(mode=0o700, parents=False)
    (custody / "scripts").mkdir(mode=0o700)
    (custody / "config").mkdir(mode=0o700)
    files = []
    for relative in CONTROL_FILES:
        source = control_root / relative
        target = custody / relative
        digest_before = sha256_file(source)
        if integrated_blob_sha256(control_root, source_commit, relative) != digest_before:
            deny("CONTROL_WORKTREE_INTEGRATED_DIVERGENCE")
        copy_exclusive(source, target)
        digest_after = sha256_file(source)
        if digest_before != digest_after or sha256_file(target) != digest_before:
            deny("CONTROL_SOURCE_CHANGED")
        files.append({"relativePath": relative, "sha256": digest_before,
                      "size": target.stat().st_size})
    index = {"schemaVersion": 1, "state": "SEALED_CONTROL_BUNDLE",
             "sourceCommit": source_commit, "files": files}
    readback = readback_index(custody, index)
    write_json_exclusive(custody / "control-bindings.private.json", index)
    write_json_exclusive(custody / "control-readback.private.json", readback)
    directory_fd = os.open(custody, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return {"index": index, "readback": readback,
            "indexSha256": sha256_file(custody / "control-bindings.private.json"),
            "readbackSha256": sha256_file(custody / "control-readback.private.json")}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--control-root", type=Path, required=True)
    parser.add_argument("--custody", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    try:
        result = materialize(args.control_root.resolve(strict=True), args.custody,
                             args.source_commit)
    except MaterializationDenied as exc:
        print(f"MATERIALIZATION_DENY:{exc}")
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
