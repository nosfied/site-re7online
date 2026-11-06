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
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        value = materialize(args) if args.command == "materialize" else close(args)
        print(lifecycle.canonical(value).decode(), end="")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
