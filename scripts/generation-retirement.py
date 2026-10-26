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
DERIVED_CLASSES = {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING"}
ARTIFACT_STATES = {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY", "CANDIDATE_PENDING_ACTIVATION",
                   "RETIREMENT_READY", "SANITIZED", "QUARANTINED", "PRESERVE_OVERRIDE"}


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


def validate_contract(value: dict[str, Any]) -> None:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "writerLockPath", "classes", "artifacts", "privateDataPolicy"}
    if set(value) != required or value.get("schemaVersion") != 1 or value.get("state") not in {"COMPLETE", "FAILED"}:
        deny("artifact_contract_schema")
    if value.get("privateDataPolicy") != "PRIVATE_DATA_NEVER_RETIRE":
        deny("artifact_contract_private_data")
    expected_classes = PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}
    if value.get("classes") != sorted(expected_classes):
        deny("artifact_contract_classes")
    if not Path(str(value.get("writerLockPath", ""))).is_absolute():
        deny("artifact_contract_writer_lock")
    if not isinstance(value.get("artifacts"), list) or not value["artifacts"]:
        deny("artifact_contract_artifacts")
    paths = set()
    for artifact in value["artifacts"]:
        required_entry = {"path", "releaseId", "targetCommit", "expectedType", "initialIdentity", "observedIdentity",
                          "sizeBytes", "allocatedBytes", "inodes", "digest", "class", "state",
                          "retirableOn", "dependencies", "structuralSha256"}
        allowed = required_entry | {"removedAtProducerCompletion"}
        if not isinstance(artifact, dict) or (set(artifact) != required_entry and set(artifact) != allowed):
            deny("artifact_contract_entry")
        path = Path(str(artifact.get("path", "")))
        if (not path.is_absolute() or str(path) in paths or artifact.get("releaseId") != value["releaseId"] or
                artifact.get("targetCommit") != value["targetCommit"]):
            deny("artifact_contract_path")
        paths.add(str(path))
        if artifact.get("class") not in PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}:
            deny("artifact_contract_class")
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


def validate_operational(value: dict[str, Any], contract: dict[str, Any]) -> None:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "gitRepository",
                "currentPaths", "pm2LivePaths", "pm2DumpPaths", "activeReleases",
                "rollbackReleases", "transitiveReturnReleases", "candidateReleases",
                "installedVerifiedReleases", "supersededCandidates", "controlPlaneArtifacts",
                "dependencies", "deploymentState"}
    if set(value) != required or value.get("schemaVersion") != 1:
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
        observed = structural_metrics(path)
        for field in ("sizeBytes", "allocatedBytes", "inodes", "structuralSha256"):
            if observed[field] != artifact.get(field):
                deny(f"artifact_drift:{path}:{field}")
    digest = artifact.get("digest")
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


def classify(artifact: dict[str, Any], contract: dict[str, Any], operational: dict[str, Any]) -> str:
    kind = artifact["class"]
    release = contract["releaseId"]
    path = artifact["path"]
    if kind in PRESERVE_CLASSES:
        return "ACTIVE_DEPENDENCY"
    if kind == "RELEASE_RUNTIME":
        if release in operational["activeReleases"]:
            return "ACTIVE_DEPENDENCY"
        if release in operational["rollbackReleases"] or release in operational["transitiveReturnReleases"]:
            return "ROLLBACK_DEPENDENCY"
        if release in operational["candidateReleases"]:
            return "CANDIDATE_PENDING_ACTIVATION"
        return "RETIREMENT_READY"
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


def prepare(args: argparse.Namespace) -> None:
    contract_raw, _ = stable_private(args.contract, args.contract_sha256)
    lifecycle_raw, _ = stable_private(args.lifecycle, args.lifecycle_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    contract = object_json(contract_raw, "artifact-contract")
    lifecycle = object_json(lifecycle_raw, "generation-lifecycle")
    operational = object_json(operational_raw, "operational-state")
    validate_contract(contract); validate_operational(operational, contract)
    for destination in (args.intent_output, args.commands_output, args.review_output):
        outside_artifacts(destination, contract["artifacts"])
    if (lifecycle.get("generationId") != contract["generationId"] or
            lifecycle.get("state") not in {"COMPLETE", "FAILED"}):
        deny("lifecycle_not_terminal")
    writer_fd = acquire_existing_lock(Path(contract["writerLockPath"]))
    try:
        classified = []
        commands = []
        for artifact in contract["artifacts"]:
            authenticate_artifact(artifact)
            state = classify(artifact, contract, operational)
            if (artifact["class"] == "RELEASE_RUNTIME" and
                    state in {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY"} and
                    not Path(artifact["path"]).is_dir()):
                deny("protected_release_missing")
            item = {**artifact, "retentionState": state}
            classified.append(item)
            if state == "RETIREMENT_READY" and artifact["class"] in DERIVED_CLASSES:
                command, text = command_for(artifact, operational)
                commands.append({"ordinal": len(commands) + 1, "path": artifact["path"],
                                 "class": artifact["class"], "argv": command, "literal": text,
                                 "allocatedBytes": artifact["allocatedBytes"]})
        state = review_state([item["retentionState"] for item in classified])
        intent = {
            "schemaVersion": 1, "generationId": contract["generationId"],
            "releaseId": contract["releaseId"], "targetCommit": contract["targetCommit"],
            "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "authorizationGranted": False,
            "contractSha256": args.contract_sha256, "lifecycleSha256": args.lifecycle_sha256,
            "operationalStateSha256": args.operational_state_sha256,
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


def validate_intent(intent: dict[str, Any], operational: dict[str, Any]) -> list[dict[str, Any]]:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "authorizationGranted", "contractSha256", "lifecycleSha256",
                "operationalStateSha256", "artifacts", "commands", "commandsSha256",
                "executionContract"}
    if (set(intent) != required or intent.get("schemaVersion") != 1 or
            intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("authorizationGranted") is not False):
        deny("intent_schema")
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
    literals = []
    for ordinal, item in enumerate(commands, 1):
        if not isinstance(item, dict) or set(item) != {"ordinal", "path", "class", "argv", "literal", "allocatedBytes"}:
            deny("intent_command")
        artifact = by_path.get(item["path"])
        if (item["ordinal"] != ordinal or not artifact or
                artifact.get("retentionState") != "RETIREMENT_READY" or
                artifact.get("class") not in DERIVED_CLASSES or item["class"] != artifact["class"]):
            deny("intent_command_scope")
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
    intent = object_json(intent_raw, "intent")
    authorization = object_json(authorization_raw, "authorization")
    operational = object_json(operational_raw, "operational-state")
    contract_identity = {
        "generationId": intent.get("generationId"),
        "releaseId": intent.get("releaseId"),
        "targetCommit": intent.get("targetCommit"),
    }
    validate_operational(operational, contract_identity)
    if intent.get("operationalStateSha256") != args.operational_state_sha256:
        deny("intent_state")
    required_auth = {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"}
    if (set(authorization) != required_auth or authorization.get("schemaVersion") != 1 or
            authorization.get("decision") != "AUTHORIZE_ONCE" or
            authorization.get("intentSha256") != args.intent_sha256 or
            not isinstance(authorization.get("owner"), str) or not authorization["owner"].strip()):
        deny("authorization_invalid")
    commands = validate_intent(intent, operational)
    if not isinstance(commands, list) or authorization.get("approvedPaths") != [item["path"] for item in commands]:
        deny("authorization_scope")
    canonical_fd = acquire_existing_lock(args.deployment_lock)
    writer_fd = acquire_existing_lock(Path(intent["executionContract"]["writerLock"]))
    attempted = completed = 0
    removed: list[str] = []
    receipt_state = "DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED" else "SANITIZED"
    try:
        for artifact in intent["artifacts"]:
            authenticate_artifact(artifact)
        args.receipt_root.mkdir(mode=0o700, parents=False)
        journal = args.receipt_root / "command-results.private.jsonl"
        try:
            for item in commands:
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
            removed_set = set(removed)
            for artifact in intent["artifacts"]:
                if artifact["path"] not in removed_set:
                    authenticate_artifact(artifact)
        except BaseException as error:
            receipt_state = "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED" else "QUARANTINED"
            receipt = {"schemaVersion": 1, "state": receipt_state,
                       "failurePredicate": str(error), "attemptedCommands": attempted,
                       "completedCommands": completed, "removedPaths": removed,
                       "intentSha256": args.intent_sha256, "automaticRetry": False}
            write_exclusive(args.receipt_root / "execution-receipt.private.json", canonical(receipt))
            review = {"schemaVersion": 2, "generationId": intent["generationId"],
                      "lifecycleSha256": intent["lifecycleSha256"], "state": "QUARANTINED",
                      "reviewer": authorization["owner"], "reason": "partial retirement requires review",
                      "evidenceSha256": digest_bytes(canonical(receipt))}
            replace_private(args.review_output, canonical(review))
            raise
        journal_sha = digest_bytes(journal.read_bytes())
        receipt = {"schemaVersion": 1, "state": receipt_state, "failurePredicate": None,
                   "attemptedCommands": attempted, "completedCommands": completed,
                   "removedPaths": removed, "intentSha256": args.intent_sha256,
                   "commandLogSha256": journal_sha, "automaticRetry": False,
                   "lock": {"canonicalHeldThroughReceiptFsync": True,
                            "writerHeldThroughReceiptFsync": True}}
        receipt_raw = canonical(receipt)
        write_exclusive(args.receipt_root / "execution-receipt.private.json", receipt_raw)
        review = {"schemaVersion": 2, "generationId": intent["generationId"],
                  "lifecycleSha256": intent["lifecycleSha256"], "state": "SANITIZED",
                  "reviewer": authorization["owner"], "reason": "derived artifacts retired",
                  "evidenceSha256": digest_bytes(receipt_raw)}
        replace_private(args.review_output, canonical(review))
        fsync_dir(args.receipt_root)
        print(canonical({"result": receipt_state, "receiptSha256": digest_bytes(receipt_raw),
                         "removedPaths": len(removed)}).decode().strip())
    finally:
        os.close(writer_fd); os.close(canonical_fd)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    prepare_parser = commands.add_parser("prepare")
    for name in ("contract", "lifecycle", "operational-state"):
        prepare_parser.add_argument(f"--{name}", type=Path, required=True)
        prepare_parser.add_argument(f"--{name}-sha256", required=True)
    prepare_parser.add_argument("--deployment-lock", type=Path, required=True)
    prepare_parser.add_argument("--intent-output", type=Path, required=True)
    prepare_parser.add_argument("--commands-output", type=Path, required=True)
    prepare_parser.add_argument("--review-output", type=Path, required=True)
    prepare_parser.add_argument("--reviewer", required=True)
    prepare_parser.add_argument("--reason", required=True)
    prepare_parser.set_defaults(handler=prepare)
    execute_parser = commands.add_parser("execute")
    for name in ("intent", "authorization", "operational-state"):
        execute_parser.add_argument(f"--{name}", type=Path, required=True)
        execute_parser.add_argument(f"--{name}-sha256", required=True)
    execute_parser.add_argument("--deployment-lock", type=Path, required=True)
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
