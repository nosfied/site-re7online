#!/usr/bin/env python3
"""Lifecycle-bound materialization for isolated deploy-control worktrees.

The tool never removes a worktree.  A separate, authenticated operation removes
the derived tree; ``close`` only records SANITIZED after absence is proved, or
RETENTION_DEBT while residue remains.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from typing import Any

import preparation_artifact_lifecycle as lifecycle


TERMINAL_KEYS = {"schemaVersion", "kind", "operationId", "controlPath",
                 "controlCommit", "materializationReceiptSha256", "outcome"}
MATERIALIZATION_KEYS_V1 = {"schemaVersion", "kind", "operationId", "controlPath",
                           "controlCommit", "controlTree", "contractSha256",
                           "reservation", "realized"}
MATERIALIZATION_KEYS_V2 = MATERIALIZATION_KEYS_V1 | {"physicalTreeSha256"}
CONSUME_KEYS_V1 = {"schemaVersion", "kind", "operationId", "controlPath",
                   "controlCommit", "materializationReceiptSha256", "outputRoot",
                   "controls"}
CONSUME_KEYS_V2 = CONSUME_KEYS_V1 | {"derivedCopies"}
CONSUME_KEYS_V3 = CONSUME_KEYS_V2 | {"driverExecution"}
CONTROL_KEYS = {"source", "destination", "sha256"}
DERIVED_COPY_KEYS = {"path", "sha256", "authoritySource"}
DRIVER_EXECUTION_KEYS = {"source", "destination", "authorityDestination"}
CONSUMED_DRIVER_AUTHORITY_KEYS = {
    "schemaVersion", "kind", "operationId", "controlCommit", "controlTree",
    "physicalTreeSha256", "custody", "driver", "materializationReceipt",
    "consumeRequest", "operationReceipt", "terminalReceipt",
}
CONSUMED_DRIVER_EXECUTION_KEYS = {
    "schemaVersion", "kind", "controlCommit", "controlTree", "driver",
    "controlPlaneSuccession", "runtimeManifest", "transactionRoot",
}
HEX = set("0123456789abcdef")


def require(condition: bool, predicate: str) -> None:
    if not condition:
        raise ValueError(predicate)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_private(path: Path, expected: str, predicate: str) -> tuple[dict[str, Any], bytes]:
    require(path.is_absolute() and len(expected) == 64 and set(expected) <= HEX, predicate)
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode) and
            stat.S_IMODE(before.st_mode) == 0o600, predicate)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd); chunks = []
        while chunk := os.read(fd, 1024 * 1024):
            chunks.append(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    key = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                         value.st_mtime_ns, value.st_ctime_ns)
    require(key(before) == key(opened) == key(after) == key(path.lstat()),
            predicate + "_changed")
    raw = b"".join(chunks)
    require(digest(raw) == expected, predicate + "_hash")
    value = json.loads(raw)
    require(isinstance(value, dict), predicate + "_json")
    return value, raw


def exclusive_json(path: Path, value: dict[str, Any]) -> bytes:
    raw = lifecycle.canonical(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        require(os.write(fd, raw) == len(raw), "deploy_control_short_write")
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return raw


def stable_source(path: Path, expected: str, predicate: str) -> bytes:
    require(len(expected) == 64 and set(expected) <= HEX, predicate + "_hash")
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode), predicate)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd); chunks = []
        while chunk := os.read(fd, 1024 * 1024):
            chunks.append(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    key = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                         value.st_mtime_ns, value.st_ctime_ns)
    require(key(before) == key(opened) == key(after) == key(path.lstat()),
            predicate + "_changed")
    raw = b"".join(chunks)
    require(digest(raw) == expected, predicate + "_hash")
    return raw


def exclusive_bytes(root: Path, path: Path, raw: bytes) -> None:
    relative = path.relative_to(root)
    current = root
    for part in relative.parts[:-1]:
        current = current / part
        try:
            os.mkdir(current, 0o700)
        except FileExistsError:
            pass
        info = current.lstat()
        require(not current.is_symlink() and stat.S_ISDIR(info.st_mode) and
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
                (os.geteuid(), os.getegid(), 0o700), "deploy_control_output_parent")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        view = memoryview(raw)
        while view:
            written = os.write(fd, view)
            require(written > 0, "deploy_control_short_write")
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def git(repo: Path, *arguments: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *arguments], text=True,
                            capture_output=True, check=False)
    require(result.returncode == 0, "deploy_control_git_" + arguments[0].replace("-", "_"))
    return result.stdout.strip()


def git_raw(repo: Path, *arguments: str) -> bytes:
    result = subprocess.run(["git", "-C", str(repo), *arguments],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    require(result.returncode == 0,
            "deploy_control_git_" + arguments[0].replace("-", "_"))
    return result.stdout


def stable_tracked_file(path: Path, expected_mode: int) -> bytes:
    before = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(before.st_mode) and
            (before.st_uid, before.st_gid, stat.S_IMODE(before.st_mode)) ==
            (os.geteuid(), os.getegid(), expected_mode),
            "deploy_control_tracked_mode")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd); chunks = []
        while chunk := os.read(fd, 1024 * 1024):
            chunks.append(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    current = path.lstat()
    key = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                         value.st_gid, value.st_size, value.st_mtime_ns,
                         value.st_ctime_ns, value.st_nlink)
    require(key(before) == key(opened) == key(after) == key(current),
            "deploy_control_tracked_changed")
    return b"".join(chunks)


def physical_tree_sha256(repo: Path, control: Path, commit: str) -> str:
    root = control.lstat()
    require(not control.is_symlink() and stat.S_ISDIR(root.st_mode) and
            (root.st_uid, root.st_gid, stat.S_IMODE(root.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o755), "deploy_control_root_mode")
    gitfile = control / ".git"
    stable_tracked_file(gitfile, 0o644)
    entries = []
    directories = {Path(".")}
    raw_tree = git_raw(repo, "ls-tree", "-rz", "--full-tree", commit)
    for record in raw_tree.split(b"\0"):
        if not record:
            continue
        metadata, raw_path = record.split(b"\t", 1)
        mode, object_type, object_id = metadata.decode("ascii").split()
        require(object_type == "blob" and mode in {"100644", "100755"},
                "deploy_control_tracked_mode")
        relative = Path(os.fsdecode(raw_path))
        require(not relative.is_absolute() and relative != Path(".") and
                ".." not in relative.parts, "deploy_control_tracked_path")
        expected_mode = 0o755 if mode == "100755" else 0o644
        content = stable_tracked_file(control / relative, expected_mode)
        entries.append({"path": str(relative), "mode": f"0{expected_mode:03o}",
                        "sha256": digest(content), "gitObject": object_id})
        directories.update(relative.parents)
    require(bool(entries), "deploy_control_tracked_empty")
    for relative in directories:
        directory = control if relative == Path(".") else control / relative
        info = directory.lstat()
        require(not directory.is_symlink() and stat.S_ISDIR(info.st_mode) and
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
                (os.geteuid(), os.getegid(), 0o755), "deploy_control_directory_mode")
    return digest(lifecycle.canonical(entries))


def binding(contract: dict[str, Any], repo: Path, destination: Path,
            requested_commit: str) -> tuple[dict[str, Any], str, str]:
    artifacts = lifecycle.validate_contract(contract)
    require(len(artifacts) == 1, "deploy_control_single_artifact")
    item = artifacts[0]
    commit = git(repo, "rev-parse", f"{requested_commit}^{{commit}}")
    tree = git(repo, "rev-parse", f"{commit}^{{tree}}")
    expected_equivalence = digest(lifecycle.canonical(
        {"repository": str(repo), "commit": commit, "tree": tree}))
    expected_authority = digest((commit + "\n").encode())
    require(Path(contract["reservationRoot"]) == destination.parent,
            "deploy_control_reservation_root")
    require(destination.is_absolute() and destination.name == commit[:12],
            "deploy_control_literal_destination")
    require(item["path"] == str(destination) and
            item["scope"] == "deploy-control:" + commit and
            item["protection"] == "DERIVED_WITH_AUTHORITY" and
            item["authority"] == {"path": str(repo), "sha256": expected_authority} and
            item["terminalDisposition"] == "SANITIZE_AFTER_USE" and
            item["equivalenceSha256"] == expected_equivalence and
            item["operation"] == {
                "name": "materialize-deploy-control-worktree", "kind": "git-worktree",
                "artifactIndex": 0, "predictedBytes": item["budgetBytes"],
                "predictedInodes": item["budgetInodes"]},
            "deploy_control_contract_binding")
    return item, commit, tree


def materialize(args: argparse.Namespace) -> dict[str, Any]:
    repo = args.repository.resolve(strict=True)
    destination = args.destination
    contract, contract_raw = lifecycle.stable_contract(args.contract, args.contract_sha256)
    item, commit, tree = binding(contract, repo, destination, args.commit)
    require(not destination.exists() and not destination.is_symlink(),
            "deploy_control_destination_exists")
    reservation = lifecycle.validate_existing_lifecycles(destination.parent, contract)
    custody = destination.parent / ("." + destination.name + ".lifecycle")
    if custody.exists() or custody.is_symlink():
        prior = custody / "preparation-artifacts.lifecycle.private.json"
        require(custody.resolve(strict=True) == custody and
                stat.S_IMODE(custody.lstat().st_mode) == 0o700 and
                prior.is_file() and not prior.is_symlink(), "deploy_control_prior_custody")
        previous, _ = stable_private(prior, digest(prior.read_bytes()), "deploy_control_prior_lifecycle")
        require(previous["state"] == "SANITIZED" and
                previous["generationId"] != contract["generationId"] and
                any(old["path"] == item["path"] and old["scope"] == item["scope"] and
                    old["equivalenceSha256"] == item["equivalenceSha256"]
                    for old in lifecycle.validate_artifacts(previous["preparationArtifacts"])),
                "deploy_control_prior_lifecycle")
        custody = custody.with_name(custody.name + "-" + digest(contract_raw))
    os.mkdir(custody, 0o700)
    lifecycle_path = custody / "preparation-artifacts.lifecycle.private.json"
    lifecycle.replace_lifecycle(lifecycle_path,
        lifecycle.lifecycle_value(contract, "OPEN", "CREATION_STARTED"))
    try:
        previous_umask = os.umask(0o022)
        try:
            git(repo, "-c", "core.sharedRepository=false", "worktree", "add",
                "--detach", str(destination), commit)
        finally:
            os.umask(previous_umask)
        physical_tree = physical_tree_sha256(repo, destination, commit)
        require(git(destination, "status", "--porcelain=v1", "--untracked-files=all",
                    "--ignored=matching") == "", "deploy_control_materialization_drift")
        realized = lifecycle.measure_realized(contract)
        lifecycle.replace_lifecycle(lifecycle_path,
            lifecycle.lifecycle_value(contract, "OPEN", "CREATION_COMPLETED", realized=realized))
        receipt = {"schemaVersion": 2, "kind": "DEPLOY_CONTROL_WORKTREE_MATERIALIZED",
                   "operationId": contract["generationId"],
                   "controlPath": str(destination), "controlCommit": commit,
                   "controlTree": tree, "contractSha256": digest(contract_raw),
                   "reservation": reservation, "realized": realized,
                   "physicalTreeSha256": physical_tree}
        receipt_raw = exclusive_json(custody / "materialization-receipt.private.json", receipt)
        return {**receipt, "materializationReceiptSha256": digest(receipt_raw),
                "lifecyclePath": str(lifecycle_path),
                "lifecycleSha256": digest(lifecycle_path.read_bytes())}
    except BaseException as error:
        residue = destination.exists() or destination.is_symlink()
        state = "RETENTION_DEBT" if residue else "SANITIZED"
        lifecycle.replace_lifecycle(lifecycle_path,
            lifecycle.lifecycle_value(contract, state, "CREATION_INTERRUPTED",
                                      type(error).__name__,
                                      lifecycle.measure_realized(contract, require_all=False,
                                                                 enforce_budget=False)))
        raise


def relative_path(value: Any, predicate: str) -> Path:
    require(isinstance(value, str) and value, predicate)
    path = Path(value)
    require(not path.is_absolute() and path != Path(".") and ".." not in path.parts,
            predicate)
    return path


def consume_request(value: dict[str, Any], materialization: dict[str, Any], materialization_sha: str,
                    lifecycle_value: dict[str, Any]) -> tuple[
                        Path, Path, list[dict[str, Any]], list[dict[str, Any]],
                        dict[str, str] | None]:
    schema = value.get("schemaVersion")
    require((schema == 1 and set(value) == CONSUME_KEYS_V1) or
            (schema == 2 and set(value) == CONSUME_KEYS_V2) or
            (schema == 3 and set(value) == CONSUME_KEYS_V3),
            "deploy_control_consume_schema")
    require(
            value.get("kind") == "DEPLOY_CONTROL_MATERIALIZE_CONTROLS" and
            value.get("operationId") == lifecycle_value.get("generationId") and
            value.get("operationId") == materialization.get("operationId") and
            value.get("controlPath") == materialization.get("controlPath") and
            value.get("controlCommit") == materialization.get("controlCommit") and
            value.get("materializationReceiptSha256") == materialization_sha,
            "deploy_control_consume_binding")
    control = Path(value["controlPath"])
    output = Path(value["outputRoot"])
    require(control.is_absolute() and output.is_absolute() and
            output != control and control not in output.parents and output not in control.parents,
            "deploy_control_consume_roots")
    info = output.lstat()
    require(not output.is_symlink() and stat.S_ISDIR(info.st_mode) and
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o700), "deploy_control_output_root")
    controls = value.get("controls")
    require(isinstance(controls, list) and bool(controls), "deploy_control_controls")
    sources: set[str] = set(); destinations: set[str] = set(); normalized = []
    for item in controls:
        require(isinstance(item, dict) and set(item) == CONTROL_KEYS and
                isinstance(item.get("sha256"), str) and len(item["sha256"]) == 64 and
                set(item["sha256"]) <= HEX, "deploy_control_control_schema")
        source = relative_path(item["source"], "deploy_control_control_source")
        destination = relative_path(item["destination"], "deploy_control_control_destination")
        require(str(source) not in sources and str(destination) not in destinations,
                "deploy_control_control_duplicate")
        sources.add(str(source)); destinations.add(str(destination))
        normalized.append({"source": str(source), "destination": str(destination),
                           "sha256": item["sha256"]})
    copies = value.get("derivedCopies", [])
    require(isinstance(copies, list), "deploy_control_derived_copies")
    normalized_copies = []
    copy_paths: set[str] = set()
    for item in copies:
        require(isinstance(item, dict) and set(item) == DERIVED_COPY_KEYS and
                isinstance(item.get("sha256"), str) and
                len(item["sha256"]) == 64 and set(item["sha256"]) <= HEX,
                "deploy_control_derived_copy_schema")
        path = relative_path(item["path"], "deploy_control_derived_copy_path")
        authority = relative_path(
            item["authoritySource"], "deploy_control_derived_copy_authority")
        require(str(path) not in copy_paths and str(path) not in sources and
                str(authority) in sources and path != authority,
                "deploy_control_derived_copy_binding")
        copy_paths.add(str(path))
        normalized_copies.append({"path": str(path), "sha256": item["sha256"],
                                  "authoritySource": str(authority)})
    driver_execution = value.get("driverExecution")
    normalized_driver = None
    if schema == 3:
        require(isinstance(driver_execution, dict) and
                set(driver_execution) == DRIVER_EXECUTION_KEYS,
                "deploy_control_driver_execution_schema")
        driver_source = relative_path(
            driver_execution["source"], "deploy_control_driver_execution_source")
        driver_destination = relative_path(
            driver_execution["destination"], "deploy_control_driver_execution_destination")
        authority_destination = relative_path(
            driver_execution["authorityDestination"],
            "deploy_control_driver_execution_authority")
        matching = [item for item in normalized
                    if item["source"] == str(driver_source) and
                    item["destination"] == str(driver_destination)]
        require(len(matching) == 1 and
                driver_source == Path("scripts/converta-deploy.py") and
                authority_destination not in {Path(item) for item in destinations} and
                str(authority_destination) not in copy_paths,
                "deploy_control_driver_execution_binding")
        normalized_driver = {
            "source": str(driver_source), "destination": str(driver_destination),
            "authorityDestination": str(authority_destination),
            "sha256": matching[0]["sha256"],
        }
    else:
        require(driver_execution is None, "deploy_control_driver_execution_unversioned")
    return control, output, normalized, normalized_copies, normalized_driver


def worktree_registered(repo: Path, control: Path) -> bool:
    lines = git(repo, "worktree", "list", "--porcelain").splitlines()
    return f"worktree {control}" in lines


def validate_control_worktree(repo: Path, control: Path, commit: str,
                              controls: list[dict[str, Any]],
                              present_derived_copies: list[dict[str, Any]] | None = None,
                              expected_physical_tree: str | None = None,
                              ) -> list[tuple[dict[str, Any], bytes]]:
    require(control.exists() and not control.is_symlink() and control.is_dir(),
            "deploy_control_consume_worktree")
    require(worktree_registered(repo, control), "deploy_control_consume_registration")
    require(git(control, "rev-parse", "HEAD") == commit,
            "deploy_control_consume_drift")
    if expected_physical_tree is not None:
        require(physical_tree_sha256(repo, control, commit) == expected_physical_tree,
                "deploy_control_physical_tree_hash")
    status = git(control, "status", "--porcelain=v1", "--untracked-files=all",
                 "--ignored=matching")
    expected_status = sorted(
        f"?? {item['path']}" for item in (present_derived_copies or []))
    require(sorted(status.splitlines()) == expected_status,
            "deploy_control_consume_drift")
    result = []
    for item in controls:
        source = control / item["source"]
        require(git(control, "ls-files", "--error-unmatch", item["source"]) == item["source"],
                "deploy_control_control_untracked")
        result.append((item, stable_source(source, item["sha256"],
                                           "deploy_control_control_source")))
    return result


def validate_derived_copy(control: Path, item: dict[str, Any]) -> None:
    path = control / item["path"]
    authority = control / item["authoritySource"]
    root = control.resolve(strict=True)
    require(path.resolve(strict=True).is_relative_to(root) and
            authority.resolve(strict=True).is_relative_to(root),
            "deploy_control_derived_copy_root")
    require(git(control, "ls-files", "--", item["path"]) == "" and
            git(control, "ls-files", "--error-unmatch", item["authoritySource"]) ==
            item["authoritySource"], "deploy_control_derived_copy_tracking")
    info = path.lstat()
    require(not path.is_symlink() and stat.S_ISREG(info.st_mode) and
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o600),
            "deploy_control_derived_copy_identity")
    copy_raw = stable_source(path, item["sha256"], "deploy_control_derived_copy")
    authority_raw = stable_source(
        authority, item["sha256"], "deploy_control_derived_copy_authority")
    require(copy_raw == authority_raw, "deploy_control_derived_copy_equivalence")


def derived_copy_attempt(operation_id: str, control: Path, commit: str,
                         request_sha: str, ordinal: int,
                         item: dict[str, Any]) -> tuple[dict[str, Any], bytes]:
    value = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_DERIVED_COPY_ATTEMPT",
        "operationId": operation_id, "controlPath": str(control),
        "controlCommit": commit, "requestSha256": request_sha,
        "ordinal": ordinal, **item}
    return value, lifecycle.canonical(value)


def derived_copy_receipt(operation_id: str, control: Path, commit: str,
                         request_sha: str, ordinal: int,
                         item: dict[str, Any], attempt_raw: bytes
                         ) -> tuple[dict[str, Any], bytes]:
    value = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_DERIVED_COPY_SANITIZED",
        "operationId": operation_id, "controlPath": str(control),
        "controlCommit": commit, "requestSha256": request_sha,
        "attemptSha256": digest(attempt_raw), "ordinal": ordinal,
        **item, "absent": True}
    return value, lifecycle.canonical(value)


def present_derived_copies(control: Path, output: Path, operation_id: str,
                           commit: str, request_sha: str,
                           copies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Authenticate every present copy and every already-attempted absence."""
    present = []
    for ordinal, item in enumerate(copies, 1):
        path = control / item["path"]
        _, attempt_raw = derived_copy_attempt(
            operation_id, control, commit, request_sha, ordinal, item)
        attempt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-attempt.private.json"
        _, receipt_raw = derived_copy_receipt(
            operation_id, control, commit, request_sha, ordinal, item, attempt_raw)
        receipt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-receipt.private.json"
        attempt_exists = attempt_path.exists() or attempt_path.is_symlink()
        receipt_exists = receipt_path.exists() or receipt_path.is_symlink()
        if attempt_exists:
            _, observed = stable_private(
                attempt_path, digest(attempt_raw), "deploy_control_derived_copy_attempt")
            require(observed == attempt_raw, "deploy_control_derived_copy_attempt")
        if receipt_exists:
            _, observed = stable_private(
                receipt_path, digest(receipt_raw), "deploy_control_derived_copy_receipt")
            require(observed == receipt_raw, "deploy_control_derived_copy_receipt")
        require(not receipt_exists or attempt_exists,
                "deploy_control_derived_copy_receipt_without_attempt")
        if path.exists() or path.is_symlink():
            require(not receipt_exists,
                    "deploy_control_derived_copy_receipt_present_path")
            validate_derived_copy(control, item)
            present.append(item)
            continue
        require(attempt_exists,
                "deploy_control_derived_copy_absent_without_attempt")
    return present


def require_no_derived_copy_evidence(output: Path,
                                     copies: list[dict[str, Any]]) -> None:
    for ordinal, _ in enumerate(copies, 1):
        for label in ("attempt", "receipt"):
            path = output / f"deploy-control-derived-copy-{ordinal:02d}-{label}.private.json"
            require(not path.exists() and not path.is_symlink(),
                    "deploy_control_derived_copy_evidence_without_operation")


def unlink_exact_copy(path: Path, expected_sha256: str) -> None:
    parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            before = os.fstat(fd); chunks = []
            while chunk := os.read(fd, 1024 * 1024):
                chunks.append(chunk)
            after = os.fstat(fd)
            observed = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
            key = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                                 value.st_mtime_ns, value.st_ctime_ns)
            require(key(before) == key(after) == key(observed) and
                    stat.S_ISREG(before.st_mode) and
                    stat.S_IMODE(before.st_mode) == 0o600 and
                    (before.st_uid, before.st_gid) == (os.geteuid(), os.getegid()) and
                    digest(b"".join(chunks)) == expected_sha256,
                    "deploy_control_derived_copy_changed")
        finally:
            os.close(fd)
        os.unlink(path.name, dir_fd=parent_fd)
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    require(not path.exists() and not path.is_symlink(),
            "deploy_control_derived_copy_present")


def dispose_derived_copies(control: Path, output: Path, operation_id: str,
                           commit: str, request_sha: str,
                           copies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    receipts = []
    for ordinal, item in enumerate(copies, 1):
        _, attempt_raw = derived_copy_attempt(
            operation_id, control, commit, request_sha, ordinal, item)
        attempt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-attempt.private.json"
        receipt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-receipt.private.json"
        if attempt_path.exists() or attempt_path.is_symlink():
            _, observed = stable_private(
                attempt_path, digest(attempt_raw), "deploy_control_derived_copy_attempt")
            require(observed == attempt_raw, "deploy_control_derived_copy_attempt")
        else:
            exclusive_bytes(output, attempt_path, attempt_raw)
        copy_path = control / item["path"]
        if copy_path.exists() or copy_path.is_symlink():
            validate_derived_copy(control, item)
            unlink_exact_copy(copy_path, item["sha256"])
        require(not copy_path.exists() and not copy_path.is_symlink(),
                "deploy_control_derived_copy_present")
        _, receipt_raw = derived_copy_receipt(
            operation_id, control, commit, request_sha, ordinal, item, attempt_raw)
        if receipt_path.exists() or receipt_path.is_symlink():
            _, observed = stable_private(
                receipt_path, digest(receipt_raw), "deploy_control_derived_copy_receipt")
            require(observed == receipt_raw, "deploy_control_derived_copy_receipt")
        else:
            exclusive_bytes(output, receipt_path, receipt_raw)
        receipts.append({"path": str(receipt_path), "sha256": digest(receipt_raw),
                         "ordinal": ordinal})
    return receipts


def validate_materialized_controls(operation_receipt: Path, operation_raw: bytes,
                                   output: Path,
                                   controls: list[dict[str, Any]]) -> None:
    _, observed_operation_raw = stable_private(
        operation_receipt, digest(operation_raw), "deploy_control_operation_receipt")
    require(observed_operation_raw == operation_raw,
            "deploy_control_operation_receipt")
    for item in controls:
        destination = output / item["destination"]
        info = destination.lstat()
        require((info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
                (os.geteuid(), os.getegid(), 0o600),
                "deploy_control_output_identity")
        stable_source(destination, item["sha256"], "deploy_control_output")


def consumed_driver_authority_value(
        output: Path, driver: dict[str, str], materialization: dict[str, Any],
        materialization_path: Path, materialization_raw: bytes,
        request_path: Path, request_raw: bytes, operation_receipt: Path,
        operation_raw: bytes, terminal_receipt: Path, terminal_raw: bytes,
        operation_id: str) -> dict[str, Any]:
    info = output.lstat()
    driver_path = output / driver["destination"]
    stable_source(driver_path, driver["sha256"], "deploy_control_consumed_driver")
    return {
        "schemaVersion": 1,
        "kind": "CONVERTA_CONSUMED_CONTROL_PLANE_AUTHORITY_V1",
        "operationId": operation_id,
        "controlCommit": materialization["controlCommit"],
        "controlTree": materialization["controlTree"],
        "physicalTreeSha256": materialization["physicalTreeSha256"],
        "custody": {
            "path": str(output), "device": info.st_dev, "inode": info.st_ino,
            "uid": info.st_uid, "gid": info.st_gid, "mode": "0700",
        },
        "driver": {"path": str(driver_path), "sha256": driver["sha256"]},
        "materializationReceipt": {
            "path": str(materialization_path), "sha256": digest(materialization_raw)},
        "consumeRequest": {"path": str(request_path), "sha256": digest(request_raw)},
        "operationReceipt": {
            "path": str(operation_receipt), "sha256": digest(operation_raw)},
        "terminalReceipt": {
            "path": str(terminal_receipt), "sha256": digest(terminal_raw)},
    }


def publish_consumed_driver_authority(
        output: Path, driver: dict[str, str] | None, materialization: dict[str, Any],
        materialization_path: Path, materialization_raw: bytes,
        request_path: Path, request_raw: bytes, operation_receipt: Path,
        operation_raw: bytes, terminal_receipt: Path, terminal_raw: bytes,
        operation_id: str) -> dict[str, str] | None:
    if driver is None:
        return None
    require(materialization.get("schemaVersion") == 2,
            "deploy_control_driver_materialization_schema")
    value = consumed_driver_authority_value(
        output, driver, materialization, materialization_path, materialization_raw,
        request_path, request_raw, operation_receipt, operation_raw,
        terminal_receipt, terminal_raw, operation_id)
    raw = lifecycle.canonical(value)
    path = output / driver["authorityDestination"]
    if path.exists() or path.is_symlink():
        observed, observed_raw = stable_private(
            path, digest(raw), "deploy_control_consumed_driver_authority")
        require(observed == value and observed_raw == raw,
                "deploy_control_consumed_driver_authority")
    else:
        exclusive_bytes(output, path, raw)
    return {"path": str(path), "sha256": digest(raw)}


def consumed_driver_authority(path: Path, expected: str) -> tuple[dict[str, Any], bytes]:
    value, raw = stable_private(path, expected, "consumed_control_plane_authority")
    require(set(value) == CONSUMED_DRIVER_AUTHORITY_KEYS and
            value.get("schemaVersion") == 1 and
            value.get("kind") == "CONVERTA_CONSUMED_CONTROL_PLANE_AUTHORITY_V1" and
            all(isinstance(value.get(key), str) and len(value[key]) == 40 and
                set(value[key]) <= HEX for key in ("controlCommit", "controlTree")) and
            isinstance(value.get("physicalTreeSha256"), str) and
            len(value["physicalTreeSha256"]) == 64 and
            set(value["physicalTreeSha256"]) <= HEX,
            "consumed_control_plane_authority_schema")
    custody = value.get("custody")
    require(isinstance(custody, dict) and set(custody) == {
        "path", "device", "inode", "uid", "gid", "mode"},
        "consumed_control_plane_authority_custody")
    root = Path(str(custody.get("path", "")))
    info = root.lstat()
    require(root.is_absolute() and not root.is_symlink() and stat.S_ISDIR(info.st_mode) and
            (info.st_dev, info.st_ino, info.st_uid, info.st_gid,
             format(stat.S_IMODE(info.st_mode), "04o")) ==
            (custody.get("device"), custody.get("inode"), custody.get("uid"),
             custody.get("gid"), custody.get("mode")),
            "consumed_control_plane_authority_custody")
    bound_values: dict[str, dict[str, Any] | bytes] = {}
    for label in ("driver", "materializationReceipt", "consumeRequest",
                  "operationReceipt", "terminalReceipt"):
        binding = value.get(label)
        require(isinstance(binding, dict) and set(binding) == {"path", "sha256"} and
                isinstance(binding.get("sha256"), str) and
                len(binding["sha256"]) == 64 and set(binding["sha256"]) <= HEX,
                f"consumed_control_plane_authority_{label}")
        bound_path = Path(str(binding["path"]))
        require(bound_path.is_absolute() and
                (label not in {"driver", "operationReceipt", "terminalReceipt"} or
                 bound_path.is_relative_to(root)),
                f"consumed_control_plane_authority_{label}_root")
        if label == "driver":
            bound_values[label] = stable_source(
                bound_path, binding["sha256"],
                "consumed_control_plane_authority_driver")
        else:
            bound_values[label], _ = stable_private(
                bound_path, binding["sha256"],
                f"consumed_control_plane_authority_{label}")
    materialization = bound_values["materializationReceipt"]
    request = bound_values["consumeRequest"]
    operation = bound_values["operationReceipt"]
    terminal = bound_values["terminalReceipt"]
    require(isinstance(materialization, dict) and
            materialization.get("schemaVersion") == 2 and
            materialization.get("kind") == "DEPLOY_CONTROL_WORKTREE_MATERIALIZED" and
            materialization.get("operationId") == value.get("operationId") and
            materialization.get("controlCommit") == value.get("controlCommit") and
            materialization.get("controlTree") == value.get("controlTree") and
            materialization.get("physicalTreeSha256") == value.get("physicalTreeSha256"),
            "consumed_control_plane_authority_materialization")
    require(isinstance(request, dict) and request.get("schemaVersion") == 3 and
            request.get("kind") == "DEPLOY_CONTROL_MATERIALIZE_CONTROLS" and
            request.get("operationId") == value.get("operationId") and
            request.get("controlCommit") == value.get("controlCommit") and
            request.get("materializationReceiptSha256") ==
            value["materializationReceipt"]["sha256"] and
            request.get("outputRoot") == str(root),
            "consumed_control_plane_authority_request")
    driver_execution = request.get("driverExecution")
    driver_path = Path(value["driver"]["path"])
    authority_path = path
    require(driver_execution == {
        "source": "scripts/converta-deploy.py",
        "destination": str(driver_path.relative_to(root)),
        "authorityDestination": str(authority_path.relative_to(root))},
        "consumed_control_plane_authority_driver_binding")
    require(isinstance(operation, dict) and operation.get("schemaVersion") == 1 and
            operation.get("kind") == "DEPLOY_CONTROL_CONTROLS_MATERIALIZED" and
            operation.get("operationId") == value.get("operationId") and
            operation.get("controlCommit") == value.get("controlCommit") and
            operation.get("materializationReceiptSha256") ==
            value["materializationReceipt"]["sha256"] and
            operation.get("requestSha256") == value["consumeRequest"]["sha256"] and
            operation.get("controls") == request.get("controls"),
            "consumed_control_plane_authority_operation")
    require(isinstance(terminal, dict) and terminal.get("schemaVersion") == 1 and
            terminal.get("kind") == "DEPLOY_CONTROL_OPERATION_TERMINAL_RECEIPT" and
            terminal.get("operationId") == value.get("operationId") and
            terminal.get("controlCommit") == value.get("controlCommit") and
            terminal.get("materializationReceiptSha256") ==
            value["materializationReceipt"]["sha256"] and
            terminal.get("outcome") == "TERMINAL_SUCCESS",
            "consumed_control_plane_authority_terminal")
    return value, raw


def bind_driver_execution(args: argparse.Namespace) -> dict[str, Any]:
    authority, authority_raw = consumed_driver_authority(
        args.consumed_authority, args.consumed_authority_sha256)
    runtime, runtime_raw = stable_private(
        args.runtime_manifest, args.runtime_manifest_sha256,
        "consumed_driver_runtime_manifest")
    require(runtime.get("controlPlaneSha") == authority["controlCommit"],
            "consumed_driver_runtime_binding")
    transaction = args.transaction_root
    require(transaction.is_absolute() and not transaction.exists() and
            not transaction.is_symlink(), "consumed_driver_transaction_root")
    custody = Path(authority["custody"]["path"])
    require(args.output.parent == custody and not args.output.exists() and
            not args.output.is_symlink(), "consumed_driver_execution_output")
    value = {
        "schemaVersion": 1,
        "kind": "CONVERTA_CONSUMED_CONTROL_PLANE_EXECUTION_V1",
        "controlCommit": authority["controlCommit"],
        "controlTree": authority["controlTree"],
        "driver": authority["driver"],
        "controlPlaneSuccession": {
            "path": str(args.consumed_authority), "sha256": digest(authority_raw)},
        "runtimeManifest": {
            "path": str(args.runtime_manifest), "sha256": digest(runtime_raw)},
        "transactionRoot": str(transaction),
    }
    raw = lifecycle.canonical(value)
    exclusive_bytes(custody, args.output, raw)
    observed, observed_raw = stable_private(
        args.output, digest(raw), "consumed_driver_execution_authority")
    require(observed == value and observed_raw == raw,
            "consumed_driver_execution_authority")
    return {"state": "CONSUMED_CONTROL_PLANE_EXECUTION_BOUND",
            "authorityPath": str(args.output), "authoritySha256": digest(raw),
            "controlCommit": authority["controlCommit"],
            "controlTree": authority["controlTree"]}


def validate_completed_copy_receipts(control: Path, output: Path,
                                     operation_id: str, commit: str,
                                     request_sha: str,
                                     copies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    receipts = []
    for ordinal, item in enumerate(copies, 1):
        _, attempt_raw = derived_copy_attempt(
            operation_id, control, commit, request_sha, ordinal, item)
        attempt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-attempt.private.json"
        receipt_path = output / f"deploy-control-derived-copy-{ordinal:02d}-receipt.private.json"
        require(attempt_path.exists() and not attempt_path.is_symlink(),
                "deploy_control_derived_copy_attempt_missing")
        _, observed_attempt = stable_private(
            attempt_path, digest(attempt_raw), "deploy_control_derived_copy_attempt")
        require(observed_attempt == attempt_raw, "deploy_control_derived_copy_attempt")
        _, receipt_raw = derived_copy_receipt(
            operation_id, control, commit, request_sha, ordinal, item, attempt_raw)
        require(receipt_path.exists() and not receipt_path.is_symlink(),
                "deploy_control_derived_copy_receipt_missing")
        _, observed_receipt = stable_private(
            receipt_path, digest(receipt_raw), "deploy_control_derived_copy_receipt")
        require(observed_receipt == receipt_raw, "deploy_control_derived_copy_receipt")
        receipts.append({"path": str(receipt_path), "sha256": digest(receipt_raw),
                         "ordinal": ordinal})
    return receipts


def consume(args: argparse.Namespace) -> dict[str, Any]:
    current, _ = stable_private(args.lifecycle, args.lifecycle_sha256,
                                "deploy_control_lifecycle")
    require(current.get("state") == "OPEN" and current.get("event") == "CREATION_COMPLETED",
            "deploy_control_consume_lifecycle")
    artifacts = lifecycle.validate_artifacts(current.get("preparationArtifacts"))
    require(len(artifacts) == 1 and artifacts[0]["operation"]["kind"] == "git-worktree",
            "deploy_control_consume_lifecycle")
    expected_materialization = args.lifecycle.parent / "materialization-receipt.private.json"
    require(args.materialization_receipt == expected_materialization,
            "deploy_control_materialization_receipt_path")
    materialization, materialization_raw = stable_private(
        args.materialization_receipt, args.materialization_receipt_sha256,
        "deploy_control_materialization_receipt")
    materialization_schema = materialization.get("schemaVersion")
    require(((materialization_schema == 1 and
              set(materialization) == MATERIALIZATION_KEYS_V1) or
             (materialization_schema == 2 and
              set(materialization) == MATERIALIZATION_KEYS_V2 and
              isinstance(materialization.get("physicalTreeSha256"), str) and
              len(materialization["physicalTreeSha256"]) == 64 and
              set(materialization["physicalTreeSha256"]) <= HEX)) and
            materialization.get("kind") == "DEPLOY_CONTROL_WORKTREE_MATERIALIZED" and
            materialization.get("operationId") == current.get("generationId") and
            materialization.get("controlPath") == artifacts[0]["path"] and
            materialization.get("controlCommit") == artifacts[0]["scope"].split(":", 1)[1],
            "deploy_control_materialization_receipt_schema")
    expected_physical_tree = (materialization["physicalTreeSha256"]
                              if materialization_schema == 2 else None)
    request, request_raw = stable_private(args.request, args.request_sha256,
                                          "deploy_control_consume_request")
    control, output, controls, derived_copies, driver_execution = consume_request(
        request, materialization, digest(materialization_raw), current)
    repo = Path(current["preparationArtifacts"][0]["authority"]["path"])
    require(output != repo and repo not in output.parents and output not in repo.parents,
            "deploy_control_consume_output_authority")
    commit = materialization["controlCommit"]
    operation_receipt = output / "deploy-control-operation-receipt.private.json"
    terminal_receipt = output / "deploy-control-terminal-receipt.private.json"
    operation_value = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_CONTROLS_MATERIALIZED",
                       "operationId": current["generationId"], "controlPath": str(control),
                       "controlCommit": commit,
                       "materializationReceiptSha256": digest(materialization_raw),
                       "requestSha256": digest(request_raw), "controls": controls}
    operation_raw = lifecycle.canonical(operation_value)
    terminal_value = {"schemaVersion": 1,
        "kind": "DEPLOY_CONTROL_OPERATION_TERMINAL_RECEIPT",
        "operationId": current["generationId"], "controlPath": str(control),
        "controlCommit": commit,
        "materializationReceiptSha256": digest(materialization_raw),
        "outcome": "TERMINAL_SUCCESS"}
    terminal_raw = lifecycle.canonical(terminal_value)
    bound = True
    try:
        terminal_exists = terminal_receipt.exists() or terminal_receipt.is_symlink()
        if terminal_exists:
            _, observed_terminal_raw = stable_private(
                terminal_receipt, digest(terminal_raw), "deploy_control_terminal_receipt")
            require(observed_terminal_raw == terminal_raw,
                    "deploy_control_terminal_receipt")
        operation_exists = operation_receipt.exists() or operation_receipt.is_symlink()
        if operation_exists:
            validate_materialized_controls(operation_receipt, operation_raw, output, controls)
        control_exists = control.exists() or control.is_symlink()
        registered = worktree_registered(repo, control)
        if not control_exists:
            require(not registered, "deploy_control_disposition_incomplete")
            require(operation_exists, "deploy_control_operation_receipt_missing")
            disposition_receipts = validate_completed_copy_receipts(
                control, output, current["generationId"], commit,
                digest(request_raw), derived_copies)
            if not terminal_exists:
                exclusive_bytes(output, terminal_receipt, terminal_raw)
            driver_authority = publish_consumed_driver_authority(
                output, driver_execution, materialization,
                args.materialization_receipt, materialization_raw,
                args.request, request_raw, operation_receipt, operation_raw,
                terminal_receipt, terminal_raw, current["generationId"])
            result = lifecycle.close_lifecycle(
                args.lifecycle, args.lifecycle_sha256, "SANITIZED",
                digest(terminal_raw), args.owner, args.reason)
            return {"state": result["state"], "controlPath": str(control),
                    "operationReceiptSha256": digest(operation_raw),
                    "terminalReceiptSha256": digest(terminal_raw), "controls": controls,
                    "derivedCopyReceipts": disposition_receipts,
                    "driverAuthority": driver_authority}
        require(registered, "deploy_control_consume_registration")
        require(not terminal_exists, "deploy_control_terminal_before_disposition")
        if not operation_exists:
            require_no_derived_copy_evidence(output, derived_copies)
            sources = validate_control_worktree(
                repo, control, commit, controls, derived_copies,
                expected_physical_tree)
            require(not terminal_receipt.exists() and not terminal_receipt.is_symlink(),
                    "deploy_control_terminal_exists")
            for item, raw in sources:
                exclusive_bytes(output, output / item["destination"], raw)
            exclusive_bytes(output, operation_receipt, operation_raw)
        # Revalidate the entire worktree and every prior disposition record on
        # both first execution and resume before the first unlink.
        present_copies = present_derived_copies(
            control, output, current["generationId"], commit,
            digest(request_raw), derived_copies)
        validate_control_worktree(repo, control, commit, controls, present_copies,
                                  expected_physical_tree)
        disposition_receipts = dispose_derived_copies(
            control, output, current["generationId"], commit,
            digest(request_raw), derived_copies)
        if control.exists() or control.is_symlink():
            validate_control_worktree(repo, control, commit, controls,
                                      expected_physical_tree=expected_physical_tree)
            git(repo, "worktree", "remove", str(control))
        require(not control.exists() and not control.is_symlink() and
                not worktree_registered(repo, control), "deploy_control_disposition_incomplete")
        exclusive_bytes(output, terminal_receipt, terminal_raw)
        driver_authority = publish_consumed_driver_authority(
            output, driver_execution, materialization,
            args.materialization_receipt, materialization_raw,
            args.request, request_raw, operation_receipt, operation_raw,
            terminal_receipt, terminal_raw, current["generationId"])
        result = lifecycle.close_lifecycle(args.lifecycle, args.lifecycle_sha256, "SANITIZED",
                                           digest(terminal_raw), args.owner, args.reason)
        return {"state": result["state"], "controlPath": str(control),
                "operationReceiptSha256": digest(operation_raw),
                "terminalReceiptSha256": digest(terminal_raw), "controls": controls,
                "derivedCopyReceipts": disposition_receipts,
                "driverAuthority": driver_authority}
    except BaseException as error:
        if bound and (control.exists() or control.is_symlink()) and not terminal_receipt.exists():
            failure = {**terminal_value, "outcome": "TERMINAL_FAILURE"}
            failure_raw = lifecycle.canonical(failure)
            exclusive_bytes(output, terminal_receipt, failure_raw)
            try:
                lifecycle.close_lifecycle(args.lifecycle, args.lifecycle_sha256,
                                           "RETENTION_DEBT", digest(failure_raw),
                                           args.owner, type(error).__name__)
            except BaseException:
                pass
        raise


def retire_failed_materialization(args: argparse.Namespace) -> dict[str, Any]:
    contract, contract_raw = lifecycle.stable_contract(args.contract, args.contract_sha256)
    current, current_raw = stable_private(args.lifecycle, args.lifecycle_sha256,
                                          "deploy_control_failed_lifecycle")
    require(current.get("schemaVersion") == 1 and current.get("state") == "RETENTION_DEBT" and
            current.get("event") == "CREATION_INTERRUPTED" and
            current.get("generationId") == contract["generationId"] and
            current.get("reservationRoot") == contract["reservationRoot"] and
            current.get("preparationArtifacts") == contract["preparationArtifacts"],
            "deploy_control_failed_lifecycle_binding")
    require(args.owner.strip() and args.reason.strip(), "preparation_closure_responsibility")
    item = lifecycle.validate_contract(contract)[0]
    control = Path(item["path"])
    repo = Path(item["authority"]["path"]).resolve(strict=True)
    item, commit, tree = binding(contract, repo, control, item["scope"].removeprefix("deploy-control:"))
    custody = args.lifecycle.parent
    name = "." + control.name + ".lifecycle"
    info = custody.lstat()
    require(custody.parent == control.parent and
            custody.name in {name, name + "-" + digest(contract_raw)} and
            args.lifecycle.name == "preparation-artifacts.lifecycle.private.json" and
            custody.resolve(strict=True) == custody and stat.S_ISDIR(info.st_mode) and
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o700), "deploy_control_failed_custody")
    success = custody / "materialization-receipt.private.json"
    require(not success.exists() and not success.is_symlink(), "deploy_control_failed_receipt_present")
    realized = current.get("realized")
    require(isinstance(realized, list) and len(realized) == 1 and
            realized[0].get("path") == str(control) and
            (realized[0]["allocatedBytes"] > item["budgetBytes"] or
             realized[0]["allocatedInodes"] > item["budgetInodes"]),
            "deploy_control_failed_budget_evidence")
    attempt = custody / "failed-materialization-retirement-attempt.private.json"
    receipt = custody / "failed-materialization-retirement-receipt.private.json"
    evidence = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_FAILED_MATERIALIZATION_RETIREMENT",
                "contractSha256": digest(contract_raw), "lifecycleSha256": digest(current_raw),
                "operationId": contract["generationId"], "path": str(control),
                "commit": commit, "tree": tree, "owner": args.owner, "reason": args.reason}
    attempt_raw = lifecycle.canonical(evidence)
    present = control.exists() or control.is_symlink()
    if attempt.exists() or attempt.is_symlink():
        stable_private(attempt, digest(attempt_raw), "deploy_control_failed_attempt")
    else:
        require(present, "deploy_control_failed_absent_without_attempt")
    if present:
        require(not receipt.exists() and not receipt.is_symlink(),
                "deploy_control_failed_receipt_present")
        validate_control_worktree(repo, control, commit, [])
        require(lifecycle.measure_realized(contract, enforce_budget=False) == realized,
                "deploy_control_failed_realization_drift")
        original = custody / "failed-materialization.lifecycle.private.json"
        if original.exists() or original.is_symlink():
            stable_private(original, args.lifecycle_sha256, "deploy_control_failed_original")
        else:
            require(lifecycle.canonical(current) == current_raw, "deploy_control_failed_original")
            exclusive_json(original, current)
        if not attempt.exists():
            exclusive_json(attempt, evidence)
        git(repo, "worktree", "remove", str(control))
    require(not control.exists() and not control.is_symlink() and
            not worktree_registered(repo, control), "deploy_control_failed_disposition_incomplete")
    stable_private(custody / "failed-materialization.lifecycle.private.json",
                   args.lifecycle_sha256, "deploy_control_failed_original")
    result = {**evidence, "state": "SANITIZED", "attemptSha256": digest(attempt_raw)}
    result_sha = digest(lifecycle.canonical(result))
    if receipt.exists() or receipt.is_symlink():
        stable_private(receipt, result_sha, "deploy_control_failed_retirement_receipt")
    else:
        exclusive_json(receipt, result)
    lifecycle.close_lifecycle(args.lifecycle, args.lifecycle_sha256, "SANITIZED",
                              result_sha, args.owner, args.reason)
    return {**result, "retirementReceiptSha256": result_sha}


def close(args: argparse.Namespace) -> dict[str, Any]:
    current, _ = stable_private(args.lifecycle, args.lifecycle_sha256,
                                "deploy_control_lifecycle")
    artifacts = lifecycle.validate_artifacts(current.get("preparationArtifacts"))
    require(len(artifacts) == 1 and artifacts[0]["operation"]["kind"] == "git-worktree",
            "deploy_control_lifecycle_artifact")
    terminal, _ = stable_private(args.terminal_receipt, args.terminal_receipt_sha256,
                                 "deploy_control_terminal_receipt")
    require(set(terminal) == TERMINAL_KEYS and terminal.get("schemaVersion") == 1 and
            terminal.get("kind") == "DEPLOY_CONTROL_OPERATION_TERMINAL_RECEIPT",
            "deploy_control_terminal_receipt_schema")
    require(terminal.get("operationId") == current.get("generationId"),
            "deploy_control_terminal_operation")
    require(terminal.get("controlPath") == artifacts[0]["path"],
            "deploy_control_terminal_path")
    require(terminal.get("controlCommit") == artifacts[0]["scope"].split(":", 1)[1],
            "deploy_control_terminal_commit")
    require(terminal.get("outcome") in {"TERMINAL_SUCCESS", "TERMINAL_FAILURE"},
            "deploy_control_terminal_outcome")
    materialization = args.lifecycle.parent / "materialization-receipt.private.json"
    stable_private(
        materialization, terminal["materializationReceiptSha256"],
        "deploy_control_materialization_receipt")
    state = "SANITIZED" if terminal["outcome"] == "TERMINAL_SUCCESS" else "RETENTION_DEBT"
    result = lifecycle.close_lifecycle(args.lifecycle, args.lifecycle_sha256, state,
                                       args.terminal_receipt_sha256, args.owner, args.reason)
    return {"state": result["state"], "controlPath": artifacts[0]["path"],
            "operationId": terminal["operationId"],
            "terminalReceiptSha256": args.terminal_receipt_sha256}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    sub = result.add_subparsers(dest="command", required=True)
    create = sub.add_parser("materialize")
    create.add_argument("--repository", type=Path, required=True)
    create.add_argument("--destination", type=Path, required=True)
    create.add_argument("--commit", required=True)
    create.add_argument("--contract", type=Path, required=True)
    create.add_argument("--contract-sha256", required=True)
    finish = sub.add_parser("close")
    finish.add_argument("--lifecycle", type=Path, required=True)
    finish.add_argument("--lifecycle-sha256", required=True)
    finish.add_argument("--terminal-receipt", type=Path, required=True)
    finish.add_argument("--terminal-receipt-sha256", required=True)
    finish.add_argument("--owner", required=True)
    finish.add_argument("--reason", required=True)
    consume_parser = sub.add_parser("consume")
    consume_parser.add_argument("--lifecycle", type=Path, required=True)
    consume_parser.add_argument("--lifecycle-sha256", required=True)
    consume_parser.add_argument("--materialization-receipt", type=Path, required=True)
    consume_parser.add_argument("--materialization-receipt-sha256", required=True)
    consume_parser.add_argument("--request", type=Path, required=True)
    consume_parser.add_argument("--request-sha256", required=True)
    consume_parser.add_argument("--owner", required=True)
    consume_parser.add_argument("--reason", required=True)
    execution = sub.add_parser("bind-driver-execution")
    execution.add_argument("--consumed-authority", type=Path, required=True)
    execution.add_argument("--consumed-authority-sha256", required=True)
    execution.add_argument("--runtime-manifest", type=Path, required=True)
    execution.add_argument("--runtime-manifest-sha256", required=True)
    execution.add_argument("--transaction-root", type=Path, required=True)
    execution.add_argument("--output", type=Path, required=True)
    retire = sub.add_parser("retire-failed-materialization")
    retire.add_argument("--contract", type=Path, required=True)
    retire.add_argument("--contract-sha256", required=True)
    retire.add_argument("--lifecycle", type=Path, required=True)
    retire.add_argument("--lifecycle-sha256", required=True)
    retire.add_argument("--owner", required=True)
    retire.add_argument("--reason", required=True)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        value = (materialize(args) if args.command == "materialize" else
                 consume(args) if args.command == "consume" else
                 bind_driver_execution(args) if args.command == "bind-driver-execution" else
                 retire_failed_materialization(args) if args.command == "retire-failed-materialization" else
                 close(args))
        print(lifecycle.canonical(value).decode(), end="")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
