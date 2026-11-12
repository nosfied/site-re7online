#!/usr/bin/env python3
"""Closed lifecycle for one independent disposable builder generation.

This is not a deployment driver.  It opens an isolated builder root, exports
the package/evidence authority to custody outside that root, and retires only
the sealed derived tree.  Installation, activation, rollback and release
retirement continue to use their existing canonical consumers.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
from typing import Any

import preparation_artifact_lifecycle as common


HEX = set("0123456789abcdef")
ROOT_KEYS = ("worktrees", "outputs", "releases", "staging", "cache", "temporary", "auxiliary")
CONTRACT_KEYS = {
    "schemaVersion", "generationId", "targetCommit", "repository",
    "disposableRoot", "custodyRoot", "ownerUid", "groupGid", "rootMode",
    "budget", "roots", "worktreePath", "locks", "protectedPaths",
}
EXPORT_NAMES_SUCCESS = {"package", "manifest", "index", "generation-contract", "generation-lifecycle"}
EXPORT_NAMES_FAILURE = {"failure-evidence"}


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def require(value: bool, predicate: str) -> None:
    if not value:
        deny(predicate)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value: Any) -> bytes:
    return common.canonical(value)


def is_digest(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and set(value) <= HEX


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def stable_bytes(path: Path, expected: str, predicate: str,
                 *, mode: int | None = None) -> bytes:
    require(path.is_absolute() and is_digest(expected), predicate)
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode), predicate)
    if mode is not None:
        require(stat.S_IMODE(before.st_mode) == mode, predicate + "_mode")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd); chunks: list[bytes] = []
        while chunk := os.read(fd, 1024 * 1024):
            chunks.append(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    require(identity(before) == identity(opened) == identity(after) == identity(path.lstat()),
            predicate + "_changed")
    raw = b"".join(chunks)
    require(digest(raw) == expected, predicate + "_hash")
    return raw


def stable_json(path: Path, expected: str, predicate: str,
                *, mode: int = 0o600) -> tuple[dict[str, Any], bytes]:
    raw = stable_bytes(path, expected, predicate, mode=mode)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        deny(predicate + "_json")
    require(isinstance(value, dict), predicate + "_json")
    return value, raw


def stable_file_hash(path: Path, expected: str, predicate: str,
                     *, mode: int | None = None) -> os.stat_result:
    require(path.is_absolute() and is_digest(expected), predicate)
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode), predicate)
    if mode is not None:
        require(stat.S_IMODE(before.st_mode) == mode, predicate + "_mode")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    calculated = hashlib.sha256()
    try:
        opened = os.fstat(fd)
        while chunk := os.read(fd, 1024 * 1024):
            calculated.update(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    require(identity(before) == identity(opened) == identity(after) == identity(path.lstat()),
            predicate + "_changed")
    require(calculated.hexdigest() == expected, predicate + "_hash")
    return after


def calculate_stable_hash(path: Path, predicate: str) -> str:
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode), predicate)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    calculated = hashlib.sha256()
    try:
        opened = os.fstat(fd)
        while chunk := os.read(fd, 1024 * 1024):
            calculated.update(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    require(identity(before) == identity(opened) == identity(after) == identity(path.lstat()),
            predicate + "_changed")
    return calculated.hexdigest()


def exclusive_bytes(path: Path, raw: bytes, predicate: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        view = memoryview(raw)
        while view:
            written = os.write(fd, view)
            require(written > 0, predicate + "_short_write")
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def replace_json(path: Path, value: dict[str, Any]) -> bytes:
    raw = canonical(value)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    exclusive_bytes(temporary, raw, "disposable_replace")
    os.replace(temporary, path)
    fsync_dir(path.parent)
    return raw


def private_directory(path: Path, predicate: str) -> os.stat_result:
    info = path.lstat()
    require(not path.is_symlink() and stat.S_ISDIR(info.st_mode) and
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o700), predicate)
    return info


def strict_child(child: Path, parent: Path, predicate: str) -> None:
    require(child.is_absolute() and parent.is_absolute() and child != parent and parent in child.parents,
            predicate)


def disjoint(left: Path, right: Path) -> bool:
    return left != right and left not in right.parents and right not in left.parents


def no_symlink_ancestors(path: Path, boundary: Path, predicate: str) -> None:
    current = path
    while current != boundary:
        require(boundary in current.parents and not current.is_symlink(), predicate)
        current = current.parent
    require(not boundary.is_symlink(), predicate)


def validate_contract(value: dict[str, Any]) -> dict[str, Any]:
    require(set(value) == CONTRACT_KEYS and value.get("schemaVersion") == 1,
            "disposable_contract_schema")
    generation = value.get("generationId")
    target = value.get("targetCommit")
    require(isinstance(generation, str) and generation.startswith("immutable-") and
            isinstance(target, str) and len(target) == 40 and set(target) <= HEX,
            "disposable_contract_identity")
    repository = Path(str(value.get("repository", "")))
    root = Path(str(value.get("disposableRoot", "")))
    custody = Path(str(value.get("custodyRoot", "")))
    require(all(path.is_absolute() for path in (repository, root, custody)) and
            disjoint(repository, root) and disjoint(repository, custody) and disjoint(root, custody),
            "disposable_contract_root_isolation")
    require(value.get("ownerUid") == os.geteuid() and value.get("groupGid") == os.getegid() and
            value.get("rootMode") == "0700", "disposable_contract_owner")
    roots = value.get("roots")
    require(isinstance(roots, dict) and set(roots) == set(ROOT_KEYS),
            "disposable_contract_roots")
    root_paths = [Path(str(roots[key])) for key in ROOT_KEYS]
    require(len(set(root_paths)) == len(ROOT_KEYS), "disposable_contract_roots")
    for path in root_paths:
        require(path.parent == root, "disposable_contract_roots")
    worktree = Path(str(value.get("worktreePath", "")))
    require(worktree.parent == Path(roots["worktrees"]) and worktree.name == "source",
            "disposable_contract_worktree")
    locks = value.get("locks")
    require(isinstance(locks, dict) and set(locks) == {"lifecycle", "writer"} and
            all(Path(str(path)).parent == custody for path in locks.values()) and
            len(set(locks.values())) == 2, "disposable_contract_locks")
    budget = value.get("budget")
    require(isinstance(budget, dict) and set(budget) == {
                "requiredFreeBytes", "requiredFreeInodes", "operationalReserveBytes",
                "operationalReserveInodes"} and
            all(type(item) is int and item > 0 for item in budget.values()),
            "disposable_contract_budget")
    protected = value.get("protectedPaths")
    require(isinstance(protected, list) and len(protected) == len(set(protected)),
            "disposable_contract_protected")
    for raw in protected:
        protected_path = Path(str(raw))
        require(protected_path.is_absolute() and disjoint(root, protected_path) and
                disjoint(custody, protected_path), "disposable_contract_protected")
    return value


def contract_from_args(args: argparse.Namespace) -> tuple[dict[str, Any], bytes]:
    value, raw = stable_json(args.contract, args.contract_sha256,
                             "disposable_contract")
    validate_contract(value)
    custody = Path(value["custodyRoot"])
    private_directory(custody, "disposable_custody")
    require(args.contract.parent == custody, "disposable_contract_location")
    return value, raw


def lifecycle_path(contract: dict[str, Any]) -> Path:
    return Path(contract["custodyRoot"]) / "disposable-builder.lifecycle.private.json"


def journal_path(contract: dict[str, Any]) -> Path:
    return Path(contract["custodyRoot"]) / "disposable-builder.journal.private.jsonl"


def write_lifecycle(contract: dict[str, Any], contract_sha: str, state: str,
                    event: str, **extra: Any) -> bytes:
    value = {"schemaVersion": 1, "generationId": contract["generationId"],
             "targetCommit": contract["targetCommit"], "contractSha256": contract_sha,
             "state": state, "event": event, **extra}
    return replace_json(lifecycle_path(contract), value)


def read_lifecycle(contract: dict[str, Any], expected: str) -> tuple[dict[str, Any], bytes]:
    value, raw = stable_json(lifecycle_path(contract), expected,
                             "disposable_lifecycle")
    require(value.get("schemaVersion") == 1 and
            value.get("generationId") == contract["generationId"] and
            value.get("targetCommit") == contract["targetCommit"],
            "disposable_lifecycle_binding")
    return value, raw


def ensure_lock_file(path: Path) -> None:
    if not path.exists():
        exclusive_bytes(path, b"", "disposable_lock")
    info = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(info.st_mode) and
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o600), "disposable_lock_identity")


def acquire_locks(contract: dict[str, Any]) -> list[int]:
    descriptors = []
    try:
        for key in ("lifecycle", "writer"):
            path = Path(contract["locks"][key])
            ensure_lock_file(path)
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            descriptors.append(fd)
        return descriptors
    except BaseException:
        for fd in reversed(descriptors):
            os.close(fd)
        deny("disposable_lock_busy")


def close_locks(descriptors: list[int]) -> None:
    for fd in reversed(descriptors):
        os.close(fd)


def git(repository: Path, *arguments: str) -> str:
    result = subprocess.run(["git", "-C", str(repository), *arguments],
                            text=True, capture_output=True, check=False)
    require(result.returncode == 0, "disposable_git_" + arguments[0].replace("-", "_"))
    return result.stdout.strip()


def worktree_registration(repository: Path, worktree: Path) -> dict[str, str] | None:
    raw = git(repository, "worktree", "list", "--porcelain")
    matches = []
    for block in raw.split("\n\n") if raw else []:
        fields = {}
        for line in block.splitlines():
            key, _, value = line.partition(" ")
            fields[key] = value
        if fields.get("worktree") == str(worktree):
            matches.append(fields)
    require(len(matches) <= 1, "disposable_worktree_registration")
    return matches[0] if matches else None


def directory_identity(path: Path) -> dict[str, Any]:
    info = private_directory(path, "disposable_root_identity")
    return {"path": str(path), "device": info.st_dev, "inode": info.st_ino,
            "ownerUid": info.st_uid, "groupGid": info.st_gid,
            "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}


def measure(path: Path) -> dict[str, int]:
    seen: set[tuple[int, int]] = set(); allocated = inodes = 0
    pending = [path]
    while pending:
        current = pending.pop(); info = current.lstat()
        identity = (info.st_dev, info.st_ino)
        if identity in seen:
            continue
        seen.add(identity); allocated += info.st_blocks * 512; inodes += 1
        if stat.S_ISDIR(info.st_mode) and not current.is_symlink():
            with os.scandir(current) as entries:
                pending.extend(Path(item.path) for item in entries)
    return {"allocatedBytes": allocated, "allocatedInodes": inodes}


def open_generation(args: argparse.Namespace) -> dict[str, Any]:
    contract, raw = contract_from_args(args)
    root = Path(contract["disposableRoot"])
    repository = Path(contract["repository"]).resolve(strict=True)
    require(not repository.is_symlink(), "disposable_repository")
    usage = os.statvfs(root.parent)
    budget = contract["budget"]
    require(usage.f_bavail * usage.f_frsize >=
            budget["requiredFreeBytes"] + budget["operationalReserveBytes"],
            "disposable_capacity_bytes")
    require(usage.f_favail >=
            budget["requiredFreeInodes"] + budget["operationalReserveInodes"],
            "disposable_capacity_inodes")
    for protected in contract["protectedPaths"]:
        require(Path(protected) != root, "disposable_protected_overlap")
    descriptors = acquire_locks(contract)
    try:
        lifecycle_file = lifecycle_path(contract)
        if lifecycle_file.exists() or lifecycle_file.is_symlink():
            require(args.lifecycle_sha256 is not None, "disposable_open_resume_lifecycle")
            lifecycle, lifecycle_raw = read_lifecycle(contract, args.lifecycle_sha256)
            require(lifecycle.get("contractSha256") == digest(raw) and
                    ((lifecycle.get("state") == "OPEN" and
                      lifecycle.get("event") in {"ALLOCATION_STARTED", "ROOT_ALLOCATED"}) or
                     (lifecycle.get("state") == "RETENTION_DEBT" and
                      lifecycle.get("event") == "ROOT_ALLOCATION_INTERRUPTED")),
                    "disposable_open_resume_lifecycle")
            if lifecycle.get("event") == "ROOT_ALLOCATED":
                require(directory_identity(root) == lifecycle.get("rootIdentity"),
                        "disposable_root_drift")
                for key in ROOT_KEYS:
                    require(directory_identity(Path(contract["roots"][key])) ==
                            lifecycle["rootIdentities"][key], "disposable_root_drift")
                return {"state": "OPEN", "generationId": contract["generationId"],
                        "rootIdentity": lifecycle["rootIdentity"],
                        "lifecycleSha256": digest(lifecycle_raw), "replayed": True}
        else:
            require(args.lifecycle_sha256 is None, "disposable_open_resume_lifecycle")
            require(not root.exists() and not root.is_symlink(), "disposable_root_exists")
            # The identity and OPEN lifecycle are durable before the first byte
            # is allocated under the disposable root.
            write_lifecycle(contract, digest(raw), "OPEN", "ALLOCATION_STARTED",
                            plannedRoot=str(root), plannedRoots=contract["roots"])
        if root.exists() or root.is_symlink():
            private_directory(root, "disposable_root_identity")
            allowed = {Path(path).name for path in contract["roots"].values()}
            require({item.name for item in root.iterdir()} <= allowed,
                    "disposable_root_allocation_extra")
        else:
            os.mkdir(root, 0o700); fsync_dir(root.parent)
        try:
            for key in ROOT_KEYS:
                path = Path(contract["roots"][key])
                if path.exists() or path.is_symlink():
                    private_directory(path, "disposable_root_identity")
                else:
                    os.mkdir(path, 0o700); fsync_dir(root)
            identities = {key: directory_identity(Path(contract["roots"][key]))
                          for key in ROOT_KEYS}
            root_identity = directory_identity(root)
            lifecycle_raw = write_lifecycle(
                contract, digest(raw), "OPEN", "ROOT_ALLOCATED",
                rootIdentity=root_identity, rootIdentities=identities,
                initialCapacity={"freeBytes": usage.f_bavail * usage.f_frsize,
                                 "freeInodes": usage.f_favail})
            return {"state": "OPEN", "generationId": contract["generationId"],
                    "rootIdentity": root_identity,
                    "lifecycleSha256": digest(lifecycle_raw)}
        except BaseException as error:
            write_lifecycle(contract, digest(raw), "RETENTION_DEBT",
                            "ROOT_ALLOCATION_INTERRUPTED", failurePredicate=str(error))
            raise
    finally:
        close_locks(descriptors)


def copy_durable(source: Path, destination: Path, expected: str) -> None:
    source_info = stable_file_hash(source, expected, "disposable_export_source")
    temporary = destination.with_name(f".{destination.name}.{expected}.tmp")
    if destination.exists() or destination.is_symlink():
        stable_file_hash(destination, expected, "disposable_export_destination", mode=0o600)
        if temporary.exists() or temporary.is_symlink():
            stable_file_hash(temporary, expected, "disposable_export_temporary", mode=0o600)
            temporary.unlink(); fsync_dir(destination.parent)
        return
    flags = os.O_WRONLY | os.O_NOFOLLOW
    if temporary.exists() or temporary.is_symlink():
        temporary_info = temporary.lstat()
        require(not temporary.is_symlink() and stat.S_ISREG(temporary_info.st_mode) and
                stat.S_IMODE(temporary_info.st_mode) == 0o600 and
                temporary_info.st_size <= source_info.st_size,
                "disposable_export_temporary")
        target_fd = os.open(temporary, flags | os.O_APPEND)
    else:
        temporary_info = None
        target_fd = os.open(temporary, flags | os.O_CREAT | os.O_EXCL, 0o600)
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    existing_fd = (os.open(temporary, os.O_RDONLY | os.O_NOFOLLOW)
                   if temporary_info is not None else None)
    calculated = hashlib.sha256(); offset = 0
    try:
        opened_source = os.fstat(source_fd)
        while chunk := os.read(source_fd, 1024 * 1024):
            calculated.update(chunk)
            if existing_fd is not None and offset < temporary_info.st_size:
                expected_prefix = os.read(existing_fd, min(len(chunk), temporary_info.st_size - offset))
                require(len(expected_prefix) == min(len(chunk), temporary_info.st_size - offset) and
                        chunk[:len(expected_prefix)] == expected_prefix,
                        "disposable_export_temporary_prefix")
                remainder = chunk[len(expected_prefix):]
            else:
                remainder = chunk
            view = memoryview(remainder)
            while view:
                written = os.write(target_fd, view)
                require(written > 0, "disposable_export_short_write")
                view = view[written:]
            offset += len(chunk)
        os.fsync(target_fd)
        after_source = os.fstat(source_fd)
    finally:
        if existing_fd is not None:
            os.close(existing_fd)
        os.close(source_fd); os.close(target_fd)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    require(identity(source_info) == identity(opened_source) == identity(after_source) ==
            identity(source.lstat()) and calculated.hexdigest() == expected,
            "disposable_export_source_changed")
    stable_file_hash(temporary, expected, "disposable_export_temporary", mode=0o600)
    try:
        os.link(temporary, destination, follow_symlinks=False)
    except FileExistsError:
        stable_bytes(destination, expected, "disposable_export_destination", mode=0o600)
    fsync_dir(destination.parent)
    temporary.unlink(); fsync_dir(destination.parent)


def validate_export_request(value: dict[str, Any], contract: dict[str, Any]) -> list[dict[str, Any]]:
    require(set(value) == {"schemaVersion", "generationId", "contractSha256",
                           "outcome", "artifacts"} and value.get("schemaVersion") == 1 and
            value.get("generationId") == contract["generationId"] and
            value.get("outcome") in {"SUCCESS", "FAILED"},
            "disposable_export_schema")
    artifacts = value.get("artifacts")
    require(isinstance(artifacts, list) and bool(artifacts), "disposable_export_artifacts")
    names = set(); destinations = set(); result = []
    root = Path(contract["disposableRoot"]); custody = Path(contract["custodyRoot"])
    for item in artifacts:
        require(isinstance(item, dict) and set(item) == {"name", "source", "destination", "sha256"}
                and isinstance(item["name"], str) and item["name"] not in names and
                is_digest(item["sha256"]), "disposable_export_artifact")
        source = Path(str(item["source"])); destination = Path(str(item["destination"]))
        require(source.is_absolute() and destination.is_absolute(), "disposable_export_path")
        strict_child(source, root, "disposable_export_source_scope")
        strict_child(destination, custody, "disposable_export_destination_scope")
        no_symlink_ancestors(source, root, "disposable_export_source_symlink")
        no_symlink_ancestors(destination.parent, custody, "disposable_export_destination_symlink")
        private_directory(destination.parent, "disposable_export_destination_parent")
        require(str(destination) not in destinations, "disposable_export_destination_scope")
        names.add(item["name"]); destinations.add(str(destination)); result.append(item)
    required = EXPORT_NAMES_SUCCESS if value["outcome"] == "SUCCESS" else EXPORT_NAMES_FAILURE
    require(required.issubset(names), "disposable_export_required")
    if value["outcome"] == "SUCCESS":
        by_name = {item["name"]: item for item in result}
        release_root = Path(by_name["manifest"]["source"]).parent
        output = release_root.parent
        require(release_root.name == contract["generationId"] and
                Path(by_name["index"]["source"]) == release_root / "index.sha256" and
                Path(by_name["manifest"]["source"]) == release_root / "manifest.json" and
                Path(by_name["package"]["source"]) ==
                output / f"{contract['generationId']}.tar.xz" and
                Path(by_name["generation-contract"]["source"]) ==
                output / "generation-artifacts.private.json" and
                Path(by_name["generation-lifecycle"]["source"]) ==
                output / "generation-lifecycle.private.json" and
                Path(contract["roots"]["outputs"]) in output.parents,
                "disposable_export_producer_layout")
    if value["outcome"] == "FAILED":
        require(not ({"package", "manifest", "index"} & names),
                "disposable_failed_package_unexpected")
    return result


def export_generation(args: argparse.Namespace) -> dict[str, Any]:
    contract, contract_raw = contract_from_args(args)
    lifecycle, _ = read_lifecycle(contract, args.lifecycle_sha256)
    require(lifecycle.get("state") in {"OPEN", "RETENTION_DEBT"},
            "disposable_export_lifecycle")
    request, request_raw = stable_json(args.export_request, args.export_request_sha256,
                                       "disposable_export_request")
    require(request.get("contractSha256") == digest(contract_raw),
            "disposable_export_contract")
    artifacts = validate_export_request(request, contract)
    descriptors = acquire_locks(contract)
    exported = []
    try:
        root = Path(contract["disposableRoot"])
        require(root.exists() and directory_identity(root) == lifecycle["rootIdentity"],
                "disposable_root_drift")
        for item in artifacts:
            copy_durable(Path(item["source"]), Path(item["destination"]), item["sha256"])
            exported.append({"name": item["name"], "path": item["destination"],
                             "sha256": item["sha256"]})
        receipt = {"schemaVersion": 1, "kind": "DISPOSABLE_BUILDER_EXPORT",
                   "generationId": contract["generationId"], "outcome": request["outcome"],
                   "contractSha256": digest(contract_raw),
                   "requestSha256": digest(request_raw), "artifacts": exported}
        receipt_raw = canonical(receipt)
        receipt_path = Path(contract["custodyRoot"]) / "disposable-builder.export-receipt.private.json"
        if receipt_path.exists():
            stable_bytes(receipt_path, digest(receipt_raw), "disposable_export_receipt", mode=0o600)
        else:
            exclusive_bytes(receipt_path, receipt_raw, "disposable_export_receipt")
        lifecycle_raw = write_lifecycle(
            contract, digest(contract_raw), "EXPORTED", "AUTHORITY_EXPORTED",
            rootIdentity=lifecycle["rootIdentity"], rootIdentities=lifecycle["rootIdentities"],
            outcome=request["outcome"], exportReceiptSha256=digest(receipt_raw))
        return {"state": "EXPORTED", "exportReceiptSha256": digest(receipt_raw),
                "lifecycleSha256": digest(lifecycle_raw), "exportedArtifacts": len(exported)}
    except BaseException as error:
        write_lifecycle(contract, digest(contract_raw), "RETENTION_DEBT",
                        "EXPORT_INTERRUPTED", rootIdentity=lifecycle.get("rootIdentity"),
                        rootIdentities=lifecycle.get("rootIdentities"),
                        failurePredicate=str(error))
        raise
    finally:
        close_locks(descriptors)


def inventory(root: Path) -> tuple[list[dict[str, Any]], dict[str, int]]:
    entries = []; seen: set[tuple[int, int]] = set(); allocated = inodes = 0
    paths = sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix())
    for path in paths:
        info = path.lstat(); relative = path.relative_to(root).as_posix()
        identity = (info.st_dev, info.st_ino)
        if identity not in seen:
            seen.add(identity); allocated += info.st_blocks * 512; inodes += 1
        base = {"path": relative, "device": info.st_dev, "inode": info.st_ino,
                "mode": f"0{stat.S_IMODE(info.st_mode):03o}", "size": info.st_size}
        if stat.S_ISDIR(info.st_mode):
            base["type"] = "directory"
        elif stat.S_ISREG(info.st_mode):
            base.update(type="file", sha256=calculate_stable_hash(path, "disposable_inventory"))
        elif stat.S_ISLNK(info.st_mode):
            base.update(type="symlink", target=os.readlink(path))
        else:
            deny("disposable_inventory_type")
        entries.append(base)
    root_info = root.lstat(); root_identity = (root_info.st_dev, root_info.st_ino)
    if root_identity not in seen:
        allocated += root_info.st_blocks * 512; inodes += 1
    return entries, {"allocatedBytes": allocated, "allocatedInodes": inodes}


def process_observation(root: Path) -> dict[str, Any]:
    references = []; writers = []; failures = []
    for process in sorted(Path("/proc").glob("[0-9]*"), key=lambda item: int(item.name)):
        pid = int(process.name)
        if pid == os.getpid():
            continue
        for label in ("cwd", "root", "exe"):
            try:
                target = Path(os.path.normpath(os.readlink(process / label)))
                if target == root or root in target.parents:
                    references.append({"pid": pid, "kind": label, "path": str(target)})
            except FileNotFoundError:
                continue
            except PermissionError:
                failures.append({"pid": pid, "kind": label})
        try:
            for line in (process / "maps").read_text(errors="replace").splitlines():
                fields = line.split(maxsplit=5)
                if len(fields) != 6 or not fields[5].startswith("/"):
                    continue
                target = Path(os.path.normpath(fields[5].removesuffix(" (deleted)")))
                if target == root or root in target.parents:
                    references.append({"pid": pid, "kind": "maps", "path": str(target)})
        except FileNotFoundError:
            continue
        except PermissionError:
            failures.append({"pid": pid, "kind": "maps"})
        fd_root = process / "fd"
        try:
            descriptors = list(fd_root.iterdir())
        except FileNotFoundError:
            continue
        except PermissionError:
            failures.append({"pid": pid, "kind": "fd"}); continue
        for descriptor in descriptors:
            try:
                target = Path(os.path.normpath(os.readlink(descriptor)))
            except FileNotFoundError:
                continue
            except PermissionError:
                failures.append({"pid": pid, "kind": "fd-entry"}); continue
            if target != root and root not in target.parents:
                continue
            item = {"pid": pid, "kind": "fd", "path": str(target)}
            references.append(item)
            try:
                flags_line = next(line for line in (process / "fdinfo" / descriptor.name).read_text().splitlines()
                                  if line.startswith("flags:"))
                flags = int(flags_line.split()[1], 8)
                if flags & os.O_ACCMODE in {os.O_WRONLY, os.O_RDWR}:
                    writers.append(item)
            except (FileNotFoundError, PermissionError, StopIteration, ValueError):
                failures.append({"pid": pid, "kind": "fdinfo"})
    return {"complete": not failures, "references": references,
            "writers": writers, "failures": failures}


def validate_no_processes(root: Path) -> dict[str, Any]:
    observed = process_observation(root)
    require(observed["complete"], "disposable_process_observation_incomplete")
    require(not observed["references"], "disposable_process_reference")
    require(not observed["writers"], "disposable_process_writer")
    return observed


def validate_export_receipt(contract: dict[str, Any], expected: str) -> dict[str, Any]:
    path = Path(contract["custodyRoot"]) / "disposable-builder.export-receipt.private.json"
    receipt, _ = stable_json(path, expected, "disposable_export_receipt")
    require(receipt.get("schemaVersion") == 1 and
            receipt.get("kind") == "DISPOSABLE_BUILDER_EXPORT" and
            receipt.get("generationId") == contract["generationId"],
            "disposable_export_receipt_schema")
    for item in receipt.get("artifacts", []):
        stable_file_hash(Path(item["path"]), item["sha256"],
                         "disposable_exported_artifact", mode=0o600)
    return receipt


def prepare(args: argparse.Namespace) -> dict[str, Any]:
    contract, contract_raw = contract_from_args(args)
    lifecycle, _ = read_lifecycle(contract, args.lifecycle_sha256)
    require(lifecycle.get("state") == "EXPORTED", "disposable_prepare_lifecycle")
    validate_export_receipt(contract, lifecycle["exportReceiptSha256"])
    descriptors = acquire_locks(contract)
    try:
        root = Path(contract["disposableRoot"])
        require(directory_identity(root) == lifecycle["rootIdentity"], "disposable_root_drift")
        observation = validate_no_processes(root)
        items, usage = inventory(root)
        require(usage["allocatedBytes"] <= contract["budget"]["requiredFreeBytes"] and
                usage["allocatedInodes"] <= contract["budget"]["requiredFreeInodes"],
                "disposable_realized_budget")
        worktree = Path(contract["worktreePath"]); repository = Path(contract["repository"])
        registration = worktree_registration(repository, worktree)
        commands = []
        if worktree.exists() or registration is not None:
            require(worktree.is_dir() and not worktree.is_symlink() and registration is not None and
                    registration.get("HEAD") == contract["targetCommit"],
                    "disposable_worktree_identity")
            require(not git(worktree, "status", "--porcelain=v1", "--untracked-files=all"),
                    "disposable_worktree_dirty")
            commands.append({"ordinal": 1, "kind": "git-worktree-remove", "path": str(worktree),
                             "argv": ["git", "-C", str(repository), "worktree", "remove", str(worktree)]})
        commands.append({"ordinal": len(commands) + 1, "kind": "dispose-root", "path": str(root),
                         "argv": [str(Path(__file__).resolve()), "internal-dispose-root", str(root)]})
        intent = {"schemaVersion": 1, "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
                  "generationId": contract["generationId"], "targetCommit": contract["targetCommit"],
                  "contractSha256": digest(contract_raw), "lifecycleSha256": args.lifecycle_sha256,
                  "exportReceiptSha256": lifecycle["exportReceiptSha256"],
                  "rootIdentity": lifecycle["rootIdentity"], "inventory": items,
                  "usage": usage, "processObservation": observation,
                  "commands": commands, "automaticRetry": False}
        raw = canonical(intent); output = Path(contract["custodyRoot"]) / "disposable-builder.intent.private.json"
        if output.exists():
            stable_bytes(output, digest(raw), "disposable_intent", mode=0o600)
        else:
            exclusive_bytes(output, raw, "disposable_intent")
        return {"state": intent["state"], "intentSha256": digest(raw),
                "commands": len(commands), **usage}
    finally:
        close_locks(descriptors)


def append_event(path: Path, value: dict[str, Any]) -> None:
    raw = canonical(value)
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, raw); os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def read_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    info = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(info.st_mode) and
            stat.S_IMODE(info.st_mode) == 0o600, "disposable_journal")
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def entry_matches(path: Path, item: dict[str, Any]) -> bool:
    if not path.exists() and not path.is_symlink():
        return False
    info = path.lstat()
    if (info.st_dev, info.st_ino, f"0{stat.S_IMODE(info.st_mode):03o}", info.st_size) != (
            item["device"], item["inode"], item["mode"], item["size"]):
        return False
    if item["type"] == "directory":
        return stat.S_ISDIR(info.st_mode)
    if item["type"] == "symlink":
        return stat.S_ISLNK(info.st_mode) and os.readlink(path) == item["target"]
    return (stat.S_ISREG(info.st_mode) and
            calculate_stable_hash(path, "disposable_inventory") == item["sha256"])


def validate_inventory(root: Path, sealed: list[dict[str, Any]], *, allow_missing: bool,
                       ignored_prefix: str | None = None) -> None:
    expected = {item["path"]: item for item in sealed
                if ignored_prefix is None or not (item["path"] == ignored_prefix or
                                                   item["path"].startswith(ignored_prefix + "/"))}
    current = {path.relative_to(root).as_posix(): path for path in root.rglob("*")}
    require(not (set(current) - set(expected)), "disposable_inventory_extra")
    if not allow_missing:
        require(set(current) == set(expected), "disposable_inventory_missing")
    for relative, path in current.items():
        require(entry_matches(path, expected[relative]), "disposable_inventory_drift")


def remove_tree_contents(root: Path) -> None:
    paths = sorted(root.rglob("*"), key=lambda item: len(item.relative_to(root).parts), reverse=True)
    for path in paths:
        if path.is_symlink() or not path.is_dir():
            path.unlink()
        else:
            path.rmdir()
    root.rmdir()
    fsync_dir(root.parent)


def authorization(args: argparse.Namespace, intent_sha: str) -> dict[str, Any]:
    value, _ = stable_json(args.authorization, args.authorization_sha256,
                           "disposable_authorization")
    require(set(value) == {"schemaVersion", "decision", "intentSha256", "approvedPaths", "owner"}
            and value.get("schemaVersion") == 1 and value.get("decision") == "AUTHORIZE_ONCE" and
            value.get("intentSha256") == intent_sha and isinstance(value.get("owner"), str) and
            value["owner"].strip(), "disposable_authorization_schema")
    return value


def expected_commands(contract: dict[str, Any], intent: dict[str, Any]) -> list[dict[str, Any]]:
    root = Path(contract["disposableRoot"])
    worktree = Path(contract["worktreePath"])
    repository = Path(contract["repository"])
    relative = worktree.relative_to(root).as_posix()
    sealed = intent.get("inventory")
    require(isinstance(sealed, list), "disposable_intent_inventory")
    had_worktree = any(isinstance(item, dict) and
                       (item.get("path") == relative or
                        str(item.get("path", "")).startswith(relative + "/"))
                       for item in sealed)
    result = []
    if had_worktree:
        result.append({"ordinal": 1, "kind": "git-worktree-remove", "path": str(worktree),
                       "argv": ["git", "-C", str(repository), "worktree", "remove", str(worktree)]})
    result.append({"ordinal": len(result) + 1, "kind": "dispose-root", "path": str(root),
                   "argv": [str(Path(__file__).resolve()), "internal-dispose-root", str(root)]})
    return result


def execute(args: argparse.Namespace) -> dict[str, Any]:
    contract, contract_raw = contract_from_args(args)
    lifecycle, _ = read_lifecycle(contract, args.lifecycle_sha256)
    require(lifecycle.get("state") in {"EXPORTED", "RETENTION_DEBT", "SANITIZED"},
            "disposable_execute_lifecycle")
    intent, intent_raw = stable_json(args.intent, args.intent_sha256, "disposable_intent")
    require(intent.get("state") == "SEALED_FOR_EXPLICIT_AUTHORIZATION" and
            intent.get("generationId") == contract["generationId"] and
            intent.get("contractSha256") == digest(contract_raw) and
            intent.get("exportReceiptSha256") == lifecycle.get("exportReceiptSha256"),
            "disposable_intent_binding")
    auth = authorization(args, digest(intent_raw))
    commands = intent.get("commands")
    require(isinstance(commands, list) and commands == expected_commands(contract, intent) and
            auth["approvedPaths"] == [item["path"] for item in commands],
            "disposable_authorization_scope")
    validate_export_receipt(contract, intent["exportReceiptSha256"])
    if lifecycle["state"] == "SANITIZED":
        receipt_path = Path(contract["custodyRoot"]) / "disposable-builder.terminal-receipt.private.json"
        receipt_sha = lifecycle.get("terminalReceiptSha256")
        receipt, _ = stable_json(receipt_path, receipt_sha, "disposable_terminal_receipt")
        worktree = Path(contract["worktreePath"]); root = Path(contract["disposableRoot"])
        require(receipt.get("state") == "SANITIZED" and receipt.get("intentSha256") == digest(intent_raw) and
                not root.exists() and not root.is_symlink() and
                worktree_registration(Path(contract["repository"]), worktree) is None,
                "disposable_terminal_replay")
        return {"state": "SANITIZED", "receiptSha256": receipt_sha,
                "journalSha256": receipt["journalSha256"],
                "lifecycleSha256": args.lifecycle_sha256,
                "attemptedCommands": receipt["attemptedCommands"],
                "completedCommands": receipt["completedCommands"], "replayed": True}
    descriptors = acquire_locks(contract); root = Path(contract["disposableRoot"])
    journal = journal_path(contract); attempted = completed = 0
    try:
        events = read_events(journal)
        verified = {item["ordinal"] for item in events if item.get("event") == "VERIFIED" and item.get("absent") is True}
        root_attempted = any(item.get("event") == "ATTEMPT" and item.get("kind") == "dispose-root"
                             for item in events)
        worktree = Path(contract["worktreePath"]); repository = Path(contract["repository"])
        worktree_attempted = any(item.get("event") == "ATTEMPT" and
                                 item.get("kind") == "git-worktree-remove" for item in events)
        worktree_absent_after_attempt = (worktree_attempted and not worktree.exists() and
                                         worktree_registration(repository, worktree) is None)
        ignored_prefix = worktree.relative_to(root).as_posix() if any(
            item["kind"] == "git-worktree-remove" and item["ordinal"] in verified
            for item in commands) or worktree_absent_after_attempt else None
        if root.exists():
            require(directory_identity(root) == intent["rootIdentity"], "disposable_root_drift")
            validate_no_processes(root)
            validate_inventory(root, intent["inventory"], allow_missing=root_attempted,
                               ignored_prefix=ignored_prefix)
        else:
            require(root_attempted, "disposable_root_absent_without_attempt")
        for command in commands:
            ordinal = command["ordinal"]
            if ordinal in verified:
                continue
            attempted += 1
            prior_attempt = any(item.get("event") == "ATTEMPT" and item.get("ordinal") == ordinal
                                for item in events)
            if not prior_attempt:
                append_event(journal, {"event": "ATTEMPT", "ordinal": ordinal,
                                       "kind": command["kind"], "path": command["path"],
                                       "argv": command["argv"]})
            if command["kind"] == "git-worktree-remove":
                if worktree.exists() or worktree_registration(repository, worktree) is not None:
                    require(worktree.is_dir() and worktree_registration(repository, worktree) is not None,
                            "disposable_worktree_resume")
                    result = subprocess.run(command["argv"], capture_output=True)
                    append_event(journal, {"event": "RESULT", "ordinal": ordinal,
                                           "exitCode": result.returncode,
                                           "stdoutSha256": digest(result.stdout),
                                           "stderrSha256": digest(result.stderr)})
                    require(result.returncode == 0, "disposable_worktree_remove")
                require(not worktree.exists() and not worktree.is_symlink() and
                        worktree_registration(repository, worktree) is None,
                        "disposable_worktree_remains")
            else:
                if root.exists():
                    validate_inventory(root, intent["inventory"], allow_missing=prior_attempt,
                                       ignored_prefix=worktree.relative_to(root).as_posix())
                    remove_tree_contents(root)
                append_event(journal, {"event": "RESULT", "ordinal": ordinal, "exitCode": 0,
                                       "stdoutSha256": digest(b""), "stderrSha256": digest(b"")})
                require(not root.exists() and not root.is_symlink(), "disposable_root_remains")
            append_event(journal, {"event": "VERIFIED", "ordinal": ordinal, "absent": True})
            completed += 1; events = read_events(journal); verified.add(ordinal)
        require(len(verified) == len(commands) and not root.exists() and
                worktree_registration(repository, worktree) is None,
                "disposable_terminal_absence")
        receipt = {"schemaVersion": 1, "state": "SANITIZED",
                   "generationId": contract["generationId"], "intentSha256": digest(intent_raw),
                   "authorizationSha256": args.authorization_sha256,
                   "journalSha256": digest(journal.read_bytes()),
                   "attemptedCommands": len(commands), "completedCommands": len(commands),
                   "remainingPaths": [], "rootAbsent": True, "worktreeRegistrationAbsent": True,
                   "retiredBytes": intent["usage"]["allocatedBytes"],
                   "retiredInodes": intent["usage"]["allocatedInodes"],
                   "automaticRetry": False}
        receipt_raw = canonical(receipt)
        receipt_path = Path(contract["custodyRoot"]) / "disposable-builder.terminal-receipt.private.json"
        if receipt_path.exists():
            stable_bytes(receipt_path, digest(receipt_raw), "disposable_terminal_receipt", mode=0o600)
        else:
            exclusive_bytes(receipt_path, receipt_raw, "disposable_terminal_receipt")
        lifecycle_raw = write_lifecycle(contract, digest(contract_raw), "SANITIZED",
                                        "CLOSURE_RECORDED", terminalReceiptSha256=digest(receipt_raw),
                                        exportReceiptSha256=intent["exportReceiptSha256"],
                                        rootAbsent=True, worktreeRegistrationAbsent=True)
        return {"state": "SANITIZED", "receiptSha256": digest(receipt_raw),
                "journalSha256": receipt["journalSha256"],
                "lifecycleSha256": digest(lifecycle_raw),
                "attemptedCommands": len(commands), "completedCommands": len(commands)}
    except BaseException as error:
        if root.exists():
            write_lifecycle(contract, digest(contract_raw), "RETENTION_DEBT",
                            "RETIREMENT_INTERRUPTED", rootIdentity=intent.get("rootIdentity"),
                            rootIdentities=lifecycle.get("rootIdentities"),
                            exportReceiptSha256=intent.get("exportReceiptSha256"),
                            failurePredicate=str(error))
        raise
    finally:
        close_locks(descriptors)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    sub = result.add_subparsers(dest="command", required=True)
    for name in ("open", "export", "prepare", "execute"):
        command = sub.add_parser(name)
        command.add_argument("--contract", type=Path, required=True)
        command.add_argument("--contract-sha256", required=True)
        if name == "open":
            command.add_argument("--lifecycle-sha256")
        else:
            command.add_argument("--lifecycle-sha256", required=True)
        if name == "export":
            command.add_argument("--export-request", type=Path, required=True)
            command.add_argument("--export-request-sha256", required=True)
        if name == "execute":
            command.add_argument("--intent", type=Path, required=True)
            command.add_argument("--intent-sha256", required=True)
            command.add_argument("--authorization", type=Path, required=True)
            command.add_argument("--authorization-sha256", required=True)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        value = (open_generation(args) if args.command == "open" else
                 export_generation(args) if args.command == "export" else
                 prepare(args) if args.command == "prepare" else execute(args))
        print(canonical(value).decode(), end="")
        return 0
    except (Denied, OSError, json.JSONDecodeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
