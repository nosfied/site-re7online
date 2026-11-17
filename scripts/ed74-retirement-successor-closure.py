#!/usr/bin/env python3
"""ED74 append-only retirement successor, never a deploy or journal rewrite.

The deployed transaction remains DEPLOYED_RETENTION_INCOMPLETE historically.
A separate, hash-linked closure proves its later zero-command retirement.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from typing import Any

RELEASE = "immutable-ed74c483-external-20261115T162015Z"
TARGET = "ed74c483b35c6cfebbdaa1a0a16e233101c46dd4"
JOURNAL_SHA = "2a625c3aa326bb9a868a7ef5c8655abae6e6d5e4fc299b97f83a837e62f5bab2"
DUMP_SHA = "04674bf54bb55d86db9494d8475b8835163329f0872d53be5f535a6b1f66cc20"
MARKER_SHA = "2bf0d3bb8e5c2183a2dbd365a53e6b8d517f0a9368ab8a8c66e8d048c2e52b7a"
OLD_CONSUMER_SHA = "7c37cb2435ae3e374f2f247e792ffccb97a9564d2f59361acac95777d2994ba0"
NEW_CONSUMER_SHA = "5fc630108a4da143068b8c66b80ea8122a418745a7c1d8fc9b91b71a76e7ee02"
SUCCESSOR_HEAD = "c2beccb2d6d9ef617cc3c1b840ea352dcb3f5735"
SUCCESSOR_TREE = "a93dcf5e14f2f292698e7b6c48ac5991af1973dd"
FAILURE = "GENERATION_RETIREMENT_DENY:operational_state_immediate_rollbacks"
SHA = re.compile(r"^[0-9a-f]{64}$")


class Denied(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise Denied(reason)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def private(path: Path, expected: str) -> bytes:
    require(path.is_absolute() and bool(SHA.fullmatch(expected)), "input_binding")
    before = path.lstat()
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        require(not stat.S_ISLNK(before.st_mode) and stat.S_ISREG(opened.st_mode) and
                (opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino) and
                (opened.st_uid, opened.st_gid) == (os.geteuid(), os.getegid()) and
                stat.S_IMODE(opened.st_mode) == 0o600 and opened.st_nlink == 1,
                "input_identity")
        content = bytearray()
        while chunk := os.read(fd, 1024 * 1024):
            content.extend(chunk)
        after = os.fstat(fd)
        require((opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns,
                 opened.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
                 after.st_ctime_ns), "input_changed")
        raw = bytes(content)
        require(digest(raw) == expected, "input_sha256")
        return raw
    finally:
        os.close(fd)


def json_object(raw: bytes) -> dict[str, Any]:
    obj = json.loads(raw)
    require(isinstance(obj, dict), "input_json_object")
    return obj


def safe_parent(path: Path) -> None:
    parent = path.parent
    value = parent.lstat()
    require(not parent.is_symlink() and stat.S_ISDIR(value.st_mode) and
            (value.st_uid, value.st_gid, stat.S_IMODE(value.st_mode)) ==
            (os.geteuid(), os.getegid(), 0o700), "output_parent")
    require(not path.exists() and not path.is_symlink(), "output_already_exists")


def exclusive(path: Path, raw: bytes) -> None:
    safe_parent(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.fchmod(fd, 0o600)
        cursor = 0
        while cursor < len(raw):
            length = os.write(fd, raw[cursor:])
            require(length > 0, "short_write")
            cursor += length
        os.fsync(fd)
    finally:
        os.close(fd)
    directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def tracked_successor(checkout: Path) -> Path:
    require(checkout.is_absolute() and checkout.is_dir() and not checkout.is_symlink(),
            "successor_checkout")
    def git(*args: str) -> str:
        result = subprocess.run(["git", "-C", str(checkout), *args],
                                capture_output=True, text=True, check=False)
        require(result.returncode == 0, "successor_git")
        return result.stdout.strip()
    require(git("rev-parse", "HEAD") == SUCCESSOR_HEAD and
            git("rev-parse", "HEAD^{tree}") == SUCCESSOR_TREE,
            "successor_head_tree")
    require(not git("status", "--porcelain", "--untracked-files=all"),
            "successor_checkout_dirty")
    consumer = checkout / "scripts/generation-retirement.py"
    require(consumer.is_file() and not consumer.is_symlink(),
            "successor_consumer_missing")
    require(digest(consumer.read_bytes()) == NEW_CONSUMER_SHA,
            "successor_consumer_sha256")
    require(git("ls-files", "--error-unmatch", "scripts/generation-retirement.py") ==
            "scripts/generation-retirement.py", "successor_consumer_untracked")
    return consumer


def qualify(request: dict[str, Any]) -> dict[str, Any]:
    expected = {"schemaVersion", "action", "transactionRoot", "journalSha256",
                "successorCheckout", "originalConsumerSha256",
                "successorConsumerSha256", "operationalStateSha256",
                "intentSha256", "authorizationSha256", "rootPolicySha256",
                "dumpPath", "dumpSha256", "markerSha256", "receiptRoot",
                "closureOutput"}
    require(set(request) == expected and request.get("schemaVersion") == 1 and
            request.get("action") == "ED74_RETIREMENT_SUCCESSOR_V1", "request_schema")
    for key, value in (("journalSha256", JOURNAL_SHA),
                       ("originalConsumerSha256", OLD_CONSUMER_SHA),
                       ("successorConsumerSha256", NEW_CONSUMER_SHA),
                       ("dumpSha256", DUMP_SHA), ("markerSha256", MARKER_SHA)):
        require(request[key] == value, f"request_authority:{key}")
    transaction = Path(request["transactionRoot"])
    require(transaction.is_absolute() and transaction.is_dir() and
            stat.S_IMODE(transaction.stat().st_mode) == 0o700,
            "transaction_root")
    journal = json_object(private(transaction / "transaction.v1.private.json", JOURNAL_SHA))
    require(journal.get("state") == "DEPLOYED_RETENTION_INCOMPLETE" and
            journal.get("generationRetirementState") == "DEPLOYED_RETENTION_INCOMPLETE" and
            journal.get("saveCount") == 1 and
            journal.get("deployedMarkerCreated") is True and
            journal.get("deployedMarkerSha256") == MARKER_SHA and
            journal.get("finalDumpSha256") == DUMP_SHA,
            "historical_journal_state")
    binding = journal.get("binding")
    require(isinstance(binding, dict) and
            binding.get("release") == RELEASE and binding.get("target") == TARGET and
            binding.get("components") == ["api", "frontend", "worker"],
            "historical_journal_release")
    retirement = binding.get("generationRetirement")
    require(isinstance(retirement, dict), "historical_retirement_binding")
    require(retirement.get("toolSha256") == OLD_CONSUMER_SHA, "original_consumer_binding")
    for k, sha_key, arg_name in (
        ("tool", "toolSha256", "originalConsumerSha256"),
        ("intent", "intentSha256", "intentSha256"),
        ("authorization", "authorizationSha256", "authorizationSha256"),
        ("rootPolicy", "rootPolicySha256", "rootPolicySha256"),
    ):
        require(retirement.get(sha_key) == request[arg_name], f"historical_binding:{k}")
    require(Path(retirement["receiptRoot"]) == Path(request["receiptRoot"]),
            "historical_receipt_scope")
    historical_retirement = journal.get("generationRetirement")
    require(isinstance(historical_retirement, dict) and
            historical_retirement.get("failurePredicate") == FAILURE,
            "historical_retirement_failure")
    require(Path(request["closureOutput"]) ==
            transaction / "generation-retirement-successor-closure.private.json",
            "closure_output_scope")
    for key in ("receiptRoot", "closureOutput"):
        require(Path(request[key]).is_absolute(), f"output_path:{key}")
    safe_parent(Path(request["receiptRoot"]))
    safe_parent(Path(request["closureOutput"]))
    for name in ("stdout", "stderr", "exit"):
        safe_parent(transaction / f"retirement-successor-01.{name}.private.txt")
    original = Path(retirement["tool"])
    private(original, OLD_CONSUMER_SHA)
    for key, original_key in (("intent", "intentSha256"),
                              ("authorization", "authorizationSha256")):
        private(Path(retirement[key]), request[original_key])
    policy_path = Path(retirement["rootPolicy"])
    policy_before = policy_path.lstat()
    policy_fd = os.open(policy_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        policy_opened = os.fstat(policy_fd)
        require(not stat.S_ISLNK(policy_before.st_mode) and
                stat.S_ISREG(policy_opened.st_mode) and
                (policy_opened.st_dev, policy_opened.st_ino) ==
                (policy_before.st_dev, policy_before.st_ino) and
                stat.S_IMODE(policy_opened.st_mode) in {0o600, 0o644} and
                (policy_opened.st_uid, policy_opened.st_gid) ==
                (os.geteuid(), os.getegid()), "root_policy_identity")
        policy_bytes = bytearray()
        while block := os.read(policy_fd, 1024 * 1024):
            policy_bytes.extend(block)
        policy_after = os.fstat(policy_fd)
        require((policy_opened.st_dev, policy_opened.st_ino, policy_opened.st_size,
                 policy_opened.st_mtime_ns, policy_opened.st_ctime_ns) ==
                (policy_after.st_dev, policy_after.st_ino, policy_after.st_size,
                 policy_after.st_mtime_ns, policy_after.st_ctime_ns),
                "root_policy_drift")
        require(digest(bytes(policy_bytes)) == request["rootPolicySha256"],
                "root_policy_sha256")
    finally:
        os.close(policy_fd)
    operational = transaction / "generation-operational.final.private.json"
    operational_raw = private(operational, request["operationalStateSha256"])
    op = json_object(operational_raw)
    require(op.get("immediateRollbackReleases") is not None and
            set(op["immediateRollbackReleases"]) == {"api", "frontend", "worker"} and
            op.get("deploymentState") == {"state": "DEPLOYED"},
            "operational_three_component")
    intent = json_object(private(Path(retirement["intent"]), request["intentSha256"]))
    authorization = json_object(private(
        Path(retirement["authorization"]), request["authorizationSha256"]))
    require(intent.get("commands") == [] and authorization.get("approvedPaths") == [] and
            authorization.get("intentSha256") == request["intentSha256"],
            "zero_command_scope")
    require(digest(private(Path(request["dumpPath"]), DUMP_SHA)) == DUMP_SHA,
            "dump_sha256")
    marker = Path("/opt/re7online/releases") / RELEASE / "DEPLOYED"
    private(marker, MARKER_SHA)
    consumer = tracked_successor(Path(request["successorCheckout"]))
    return {"transaction": transaction, "retirement": retirement, "consumer": consumer,
            "operational": operational, "journal": journal}


def execute(request: dict[str, Any]) -> dict[str, Any]:
    context = qualify(request)
    transaction, retirement = context["transaction"], context["retirement"]
    arguments = [
        "/usr/bin/python3", "-B", str(context["consumer"]), "execute",
        "--intent", retirement["intent"], "--intent-sha256", retirement["intentSha256"],
        "--authorization", retirement["authorization"],
        "--authorization-sha256", retirement["authorizationSha256"],
        "--operational-state", str(context["operational"]),
        "--operational-state-sha256", request["operationalStateSha256"],
        "--root-policy", retirement["rootPolicy"],
        "--root-policy-sha256", retirement["rootPolicySha256"],
        "--deployment-lock", retirement["deploymentLock"],
        "--receipt-root", retirement["receiptRoot"],
        "--review-output", retirement["reviewOutput"],
    ]
    # The predecessor journal remains immutable. Capture each execution exactly once.
    out_paths = {k: transaction / f"retirement-successor-01.{k}.private.txt"
                 for k in ("stdout", "stderr", "exit")}
    safe_parent(out_paths["stdout"])
    safe_parent(out_paths["stderr"])
    safe_parent(out_paths["exit"])
    # No retry after a subprocess error or loss of connection.
    done = subprocess.run(arguments, capture_output=True, check=False)
    exclusive(out_paths["stdout"], done.stdout)
    exclusive(out_paths["stderr"], done.stderr)
    exclusive(out_paths["exit"], f"{done.returncode}\n".encode())
    require(done.returncode == 0, "retirement_execute_exit")
    report = json_object(done.stdout)
    require(report.get("result") == "DEPLOYED_SANITIZED" and
            report.get("removedPaths") == 0, "retirement_nonterminal")
    receipt = Path(retirement["receiptRoot"]) / "execution-receipt.private.json"
    receipt_raw = private(receipt, report["receiptSha256"])
    receipt_value = json_object(receipt_raw)
    require(receipt_value.get("state") == "DEPLOYED_SANITIZED" and
            receipt_value.get("attemptedCommands") == 0 and
            receipt_value.get("completedCommands") == 0 and
            receipt_value.get("removedPaths") == [] and
            receipt_value.get("intentSha256") == retirement["intentSha256"],
            "retirement_receipt_scope")
    # Reauthenticate the historical snapshot *after* the consumer has returned.
    private(transaction / "transaction.v1.private.json", JOURNAL_SHA)
    private(Path(request["dumpPath"]), DUMP_SHA)
    private(Path("/opt/re7online/releases") / RELEASE / "DEPLOYED", MARKER_SHA)
    # The separate closure is an append-only terminal successor, not a journal edit.
    closure = {
        "schemaVersion": 1, "kind": "ED74_RETIREMENT_SUCCESSOR_CLOSURE_V1",
        "result": "ED74_RETIREMENT_CLOSED_BY_SUCCESSOR",
        "releaseId": RELEASE, "targetCommit": TARGET,
        "historicalJournal": {"path": str(transaction / "transaction.v1.private.json"),
                              "sha256": JOURNAL_SHA, "state": "DEPLOYED_RETENTION_INCOMPLETE"},
        "originalConsumerSha256": OLD_CONSUMER_SHA,
        "successor": {"head": SUCCESSOR_HEAD, "tree": SUCCESSOR_TREE,
                      "consumerSha256": NEW_CONSUMER_SHA},
        "deployment": {"saveCount": 1, "dumpSha256": DUMP_SHA, "markerSha256": MARKER_SHA},
        "retirement": {"intentSha256": retirement["intentSha256"],
                       "authorizationSha256": retirement["authorizationSha256"],
                       "operationalStateSha256": request["operationalStateSha256"],
                       "receipt": {"path": str(receipt), "sha256": digest(receipt_raw)},
                       "attemptedCommands": 0, "completedCommands": 0, "removedPaths": []},
        "executionEvidence": {
            k: {"path": str(path), "sha256": digest(path.read_bytes())}
            for k, path in out_paths.items()
        },
    }
    exclusive(Path(request["closureOutput"]), canonical(closure))
    return {"result": closure["result"],
            "closureSha256": digest(canonical(closure)),
            "receiptSha256": digest(receipt_raw),
            "historicalJournalUnchanged": True}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    parser.add_argument("--mode", choices=("qualify", "execute"), required=True)
    args = parser.parse_args()
    try:
        request = json_object(private(args.request, args.request_sha256))
        if args.mode == "qualify":
            qualify(request)
            print(json.dumps({"result": "ED74_RETIREMENT_SUCCESSOR_PRECHECK_PASS",
                              "executionAuthorized": False}, sort_keys=True))
            return 0
        print(json.dumps(execute(request), sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"ED74_RETIREMENT_SUCCESSOR_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
