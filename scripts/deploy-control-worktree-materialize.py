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
MATERIALIZATION_KEYS = {"schemaVersion", "kind", "operationId", "controlPath",
                        "controlCommit", "controlTree", "contractSha256",
                        "reservation", "realized"}
CONSUME_KEYS_V1 = {"schemaVersion", "kind", "operationId", "controlPath",
                   "controlCommit", "materializationReceiptSha256", "outputRoot",
                   "controls"}
CONSUME_KEYS_V2 = CONSUME_KEYS_V1 | {"derivedCopies"}
CONTROL_KEYS = {"source", "destination", "sha256"}
DERIVED_COPY_KEYS = {"path", "sha256", "authoritySource"}
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
    os.mkdir(custody, 0o700)
    lifecycle_path = custody / "preparation-artifacts.lifecycle.private.json"
    lifecycle.replace_lifecycle(lifecycle_path,
        lifecycle.lifecycle_value(contract, "OPEN", "CREATION_STARTED"))
    try:
        git(repo, "worktree", "add", "--detach", str(destination), commit)
        realized = lifecycle.measure_realized(contract)
        lifecycle.replace_lifecycle(lifecycle_path,
            lifecycle.lifecycle_value(contract, "OPEN", "CREATION_COMPLETED", realized=realized))
        receipt = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_WORKTREE_MATERIALIZED",
                   "operationId": contract["generationId"],
                   "controlPath": str(destination), "controlCommit": commit,
                   "controlTree": tree, "contractSha256": digest(contract_raw),
                   "reservation": reservation, "realized": realized}
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
                        Path, Path, list[dict[str, Any]], list[dict[str, Any]]]:
    schema = value.get("schemaVersion")
    require((schema == 1 and set(value) == CONSUME_KEYS_V1) or
            (schema == 2 and set(value) == CONSUME_KEYS_V2),
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
    return control, output, normalized, normalized_copies


def worktree_registered(repo: Path, control: Path) -> bool:
    lines = git(repo, "worktree", "list", "--porcelain").splitlines()
    return f"worktree {control}" in lines


def validate_control_worktree(repo: Path, control: Path, commit: str,
                              controls: list[dict[str, Any]],
                              present_derived_copies: list[dict[str, Any]] | None = None
                              ) -> list[tuple[dict[str, Any], bytes]]:
    require(control.exists() and not control.is_symlink() and control.is_dir(),
            "deploy_control_consume_worktree")
    require(worktree_registered(repo, control), "deploy_control_consume_registration")
    require(git(control, "rev-parse", "HEAD") == commit,
            "deploy_control_consume_drift")
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
    require(set(materialization) == MATERIALIZATION_KEYS and
            materialization.get("schemaVersion") == 1 and
            materialization.get("kind") == "DEPLOY_CONTROL_WORKTREE_MATERIALIZED" and
            materialization.get("operationId") == current.get("generationId") and
            materialization.get("controlPath") == artifacts[0]["path"] and
            materialization.get("controlCommit") == artifacts[0]["scope"].split(":", 1)[1],
            "deploy_control_materialization_receipt_schema")
    request, request_raw = stable_private(args.request, args.request_sha256,
                                          "deploy_control_consume_request")
    control, output, controls, derived_copies = consume_request(
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
            result = lifecycle.close_lifecycle(
                args.lifecycle, args.lifecycle_sha256, "SANITIZED",
                digest(terminal_raw), args.owner, args.reason)
            return {"state": result["state"], "controlPath": str(control),
                    "operationReceiptSha256": digest(operation_raw),
                    "terminalReceiptSha256": digest(terminal_raw), "controls": controls,
                    "derivedCopyReceipts": disposition_receipts}
        require(registered, "deploy_control_consume_registration")
        require(not terminal_exists, "deploy_control_terminal_before_disposition")
        if not operation_exists:
            require_no_derived_copy_evidence(output, derived_copies)
            sources = validate_control_worktree(
                repo, control, commit, controls, derived_copies)
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
        validate_control_worktree(repo, control, commit, controls, present_copies)
        disposition_receipts = dispose_derived_copies(
            control, output, current["generationId"], commit,
            digest(request_raw), derived_copies)
        if control.exists() or control.is_symlink():
            validate_control_worktree(repo, control, commit, controls)
            git(repo, "worktree", "remove", str(control))
        require(not control.exists() and not control.is_symlink() and
                not worktree_registered(repo, control), "deploy_control_disposition_incomplete")
        exclusive_bytes(output, terminal_receipt, terminal_raw)
        result = lifecycle.close_lifecycle(args.lifecycle, args.lifecycle_sha256, "SANITIZED",
                                           digest(terminal_raw), args.owner, args.reason)
        return {"state": result["state"], "controlPath": str(control),
                "operationReceiptSha256": digest(operation_raw),
                "terminalReceiptSha256": digest(terminal_raw), "controls": controls,
                "derivedCopyReceipts": disposition_receipts}
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
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        value = (materialize(args) if args.command == "materialize" else
                 consume(args) if args.command == "consume" else close(args))
        print(lifecycle.canonical(value).decode(), end="")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
