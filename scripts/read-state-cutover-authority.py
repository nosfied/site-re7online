#!/usr/bin/python3
"""Offline preparation and authenticated materialization for the first read-state cutover."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import fcntl
from pathlib import Path
import stat
import subprocess


ROOT = "/opt/re7online/runtime-data/inbox-read-state"
PRIVACY_INVENTORY_SHA256 = "620833264d94ed9ce2433f4bada99ae4fd9c74702707665fe35c3e5ff269bacc"
PRIVACY_JOURNAL_SHA256 = "b461e4fa3d03cf066abfbab396262f183845228bfa955b8cbc19c6a0e137e572"
PRIVACY_CUSTODY_SHA256 = "8d54f3e7e70810f5629e30b1bd2f55e16ab270c0cca482887167f8cb6eb83980"


def canonical(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def file_digest(path: Path) -> str:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode):
        raise RuntimeError("provision_executor_identity")
    return digest(path.read_bytes())


def private_json(path: Path, expected_sha256: str) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise RuntimeError("authority_file_identity")
    raw = path.read_bytes()
    if digest(raw) != expected_sha256:
        raise RuntimeError("authority_file_sha256")
    value = json.loads(raw)
    if canonical(value) != raw:
        raise RuntimeError("authority_file_canonical")
    return value


def inside(child: str, root: str) -> bool:
    child_path = Path(child); root_path = Path(root)
    try: return child_path.is_absolute() and child_path != root_path and child_path.is_relative_to(root_path)
    except ValueError: return False


def publish(path: Path, value: object) -> str:
    raw = canonical(value); path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try: os.write(fd, raw); os.fsync(fd)
        finally: os.close(fd)
    except FileExistsError:
        if private_json(path, digest(raw)) != value: raise RuntimeError("authority_publication_conflict")
    return digest(raw)


def replace_private(path: Path, value: object) -> str:
    raw = canonical(value)
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
            raise RuntimeError("provision_journal_identity")
    temporary = path.with_name(f".{path.name}.{os.getpid()}.installing")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, raw); os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, path)
    parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(parent_fd)
    finally: os.close(parent_fd)
    return digest(raw)


def directory_authority(path: Path, error: str) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode):
        raise RuntimeError(error)
    return {"path": str(path), "device": info.st_dev, "inode": info.st_ino,
            "ownerUid": info.st_uid, "groupGid": info.st_gid,
            "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}


def validate_directory_authority(expected: dict, error: str) -> dict:
    keys = {"path", "device", "inode", "ownerUid", "groupGid", "mode"}
    if set(expected) != keys or not Path(expected.get("path", "")).is_absolute():
        raise RuntimeError(error)
    observed = directory_authority(Path(expected["path"]), error)
    if observed != expected:
        raise RuntimeError(error)
    return observed


def validate_provision_plan(value: dict) -> None:
    keys = {"schemaVersion", "kind", "operationId", "root", "custodyRoot", "ancestors",
            "createdDirectories", "executor", "commands", "initialState", "outputs",
            "automaticExecution"}
    if (set(value) != keys or value.get("schemaVersion") != 1 or
            value.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_PLAN_V1" or
            not isinstance(value.get("operationId"), str) or not value["operationId"].strip() or
            value.get("initialState") != "ABSENT" or value.get("automaticExecution") is not False):
        raise RuntimeError("provision_plan_schema")
    root = value["root"]
    root_keys = {"path", "ownerUid", "groupGid", "mode"}
    if (set(root) != root_keys or root.get("path") != ROOT or root.get("mode") != "0700" or
            not isinstance(root.get("ownerUid"), int) or not isinstance(root.get("groupGid"), int)):
        raise RuntimeError("provision_plan_root")
    custody = value["custodyRoot"]
    if set(custody) != {"path", "device", "inode", "ownerUid", "groupGid", "mode"}:
        raise RuntimeError("provision_plan_custody")
    validate_directory_authority(custody, "provision_plan_custody")
    ancestors = value["ancestors"]
    if not isinstance(ancestors, list) or not ancestors:
        raise RuntimeError("provision_plan_ancestors")
    for index, ancestor in enumerate(ancestors):
        validate_directory_authority(ancestor, "provision_plan_ancestor_identity")
        if index and Path(ancestor["path"]).parent != Path(ancestors[index - 1]["path"]):
            raise RuntimeError("provision_plan_ancestor_chain")
    root_path = Path(root["path"])
    if Path(ancestors[-1]["path"]) != root_path.parent.parent:
        raise RuntimeError("provision_plan_ancestor_chain")
    created = value["createdDirectories"]
    expected_created = [
        {"path": str(root_path.parent), "ownerUid": root["ownerUid"], "groupGid": root["groupGid"], "mode": "0700"},
        {"path": str(root_path), "ownerUid": root["ownerUid"], "groupGid": root["groupGid"], "mode": "0700"},
    ]
    if created != expected_created:
        raise RuntimeError("provision_plan_created_directories")
    executor = value["executor"]
    executor_keys = {"path", "sha256", "device", "inode", "ownerUid", "groupGid", "mode"}
    if set(executor) != executor_keys or not Path(executor.get("path", "")).is_absolute():
        raise RuntimeError("provision_executor_identity")
    executor_path = Path(executor["path"]); info = executor_path.lstat()
    observed_executor = {"path": str(executor_path), "sha256": file_digest(executor_path),
                         "device": info.st_dev, "inode": info.st_ino, "ownerUid": info.st_uid,
                         "groupGid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}
    if observed_executor != executor:
        raise RuntimeError("provision_executor_identity")
    expected_commands = [[executor["path"], "-d", "-o", str(root["ownerUid"]), "-g",
                          str(root["groupGid"]), "-m", "0700", item["path"]] for item in created]
    if value["commands"] != expected_commands:
        raise RuntimeError("provision_plan_commands")
    outputs = value["outputs"]
    output_keys = {"intentPath", "journalPath", "receiptPath", "lockPath"}
    if set(outputs) != output_keys or len(set(outputs.values())) != len(output_keys) or any(
            not inside(path, custody["path"]) for path in outputs.values()):
        raise RuntimeError("provision_plan_outputs")


def provision_intent(plan_path: Path, plan_sha256: str, plan: dict) -> dict:
    return {"schemaVersion": 2, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_INTENT_V2",
            "event": "PROVISION_INTENT_PREPARED", "state": "AWAITING_OWNER_AUTHORIZATION",
            "operationId": plan["operationId"], "planPath": str(plan_path),
            "planSha256": plan_sha256, "root": plan["root"], "ancestors": plan["ancestors"],
            "executor": plan["executor"], "commands": plan["commands"],
            "initialState": plan["initialState"], "outputs": plan["outputs"],
            "automaticExecution": False}


def prepare_provision(plan_path: Path, plan_sha256: str) -> dict:
    plan = private_json(plan_path, plan_sha256); validate_provision_plan(plan)
    for item in plan["createdDirectories"]:
        if Path(item["path"]).exists() or Path(item["path"]).is_symlink():
            raise RuntimeError("provision_initial_state")
    value = provision_intent(plan_path, plan_sha256, plan)
    intent_sha = publish(Path(plan["outputs"]["intentPath"]), value)
    return {"state": "PROVISION_INTENT_PREPARED", "nextState": "AWAITING_OWNER_AUTHORIZATION",
            "provisionIntentSha256": intent_sha, "automaticExecution": False}


def validate_provision_owner(owner: dict, plan: dict, plan_sha256: str,
                             intent_sha256: str) -> None:
    keys = {"schemaVersion", "kind", "decision", "operationId", "planSha256",
            "provisionIntentSha256", "approvedRoot", "approvedCommands", "owner"}
    if (set(owner) != keys or owner.get("schemaVersion") != 1 or
            owner.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_AUTHORIZE_ONCE_V1" or
            owner.get("decision") != "AUTHORIZE_ONCE" or
            owner.get("operationId") != plan["operationId"] or owner.get("planSha256") != plan_sha256 or
            owner.get("provisionIntentSha256") != intent_sha256 or
            owner.get("approvedRoot") != plan["root"]["path"] or
            owner.get("approvedCommands") != plan["commands"] or
            not isinstance(owner.get("owner"), str) or not owner["owner"].strip()):
        raise RuntimeError("provision_owner_authorization_binding")


def expected_created_authority(item: dict) -> dict:
    path = Path(item["path"]); info = path.lstat()
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or
            (info.st_uid, info.st_gid) != (item["ownerUid"], item["groupGid"]) or
            f"0{stat.S_IMODE(info.st_mode):03o}" != item["mode"]):
        raise RuntimeError("provision_created_directory_identity")
    return {"path": str(path), "device": info.st_dev, "inode": info.st_ino,
            "ownerUid": info.st_uid, "groupGid": info.st_gid,
            "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}


def validate_recorded_authority(recorded: object, item: dict, error: str) -> dict:
    keys = {"path", "device", "inode", "ownerUid", "groupGid", "mode"}
    if not isinstance(recorded, dict) or set(recorded) != keys:
        raise RuntimeError(error)
    observed = expected_created_authority(item)
    if recorded != observed:
        raise RuntimeError(error)
    return observed


def validate_provision_journal(journal: dict, plan: dict, plan_sha256: str,
                               intent_sha256: str, owner_sha256: str) -> dict:
    keys = {"schemaVersion", "kind", "operationId", "planSha256",
            "provisionIntentSha256", "ownerAuthorizationSha256", "state", "events"}
    if (set(journal) != keys or journal.get("schemaVersion") != 1 or
            journal.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_JOURNAL_V1" or
            journal.get("operationId") != plan["operationId"] or
            journal.get("planSha256") != plan_sha256 or
            journal.get("provisionIntentSha256") != intent_sha256 or
            journal.get("ownerAuthorizationSha256") != owner_sha256 or
            journal.get("state") not in {"IN_PROGRESS", "ROOT_PROVISIONED_VERIFIED"} or
            not isinstance(journal.get("events"), list)):
        raise RuntimeError("provision_journal_binding")
    stages = [0] * len(plan["commands"])
    authorities: list[dict | None] = [None] * len(plan["commands"])
    verified = False
    for index, event in enumerate(journal["events"]):
        if not isinstance(event, dict):
            raise RuntimeError("provision_journal_event_schema")
        event_type = event.get("event")
        if event_type == "VERIFIED":
            if (set(event) != {"event", "operationId", "createdDirectories"} or
                    event.get("operationId") != plan["operationId"] or
                    index != len(journal["events"]) - 1 or verified or
                    stages != [2] * len(stages) or event.get("createdDirectories") != authorities):
                raise RuntimeError("provision_journal_event_order")
            for recorded, item in zip(event["createdDirectories"], plan["createdDirectories"]):
                validate_recorded_authority(recorded, item, "provision_journal_verified_authority")
            verified = True
            continue
        ordinal = event.get("ordinal")
        if (not isinstance(ordinal, int) or isinstance(ordinal, bool) or
                ordinal < 1 or ordinal > len(stages)):
            raise RuntimeError("provision_journal_event_ordinal")
        item_index = ordinal - 1
        command = plan["commands"][item_index]
        common = {"operationId": plan["operationId"], "ordinal": ordinal, "command": command}
        if any(event.get(key) != value for key, value in common.items()):
            raise RuntimeError("provision_journal_event_binding")
        if event_type == "ATTEMPT":
            if set(event) != {"event", *common} or stages[item_index] != 0 or any(
                    stage != 2 for stage in stages[:item_index]) or any(
                    stage != 0 for stage in stages[item_index + 1:]):
                raise RuntimeError("provision_journal_event_order")
            stages[item_index] = 1
        elif event_type == "RESULT":
            if (set(event) != {"event", *common, "resultSource", "authority"} or
                    stages[item_index] != 1 or event.get("resultSource") not in
                    {"EXECUTED", "INTERRUPTED_COMMAND_PHYSICAL_READBACK"}):
                raise RuntimeError("provision_journal_event_order")
            authorities[item_index] = validate_recorded_authority(
                event.get("authority"), plan["createdDirectories"][item_index],
                "provision_journal_result_authority")
            stages[item_index] = 2
        else:
            raise RuntimeError("provision_journal_event_schema")
    if journal["state"] == "ROOT_PROVISIONED_VERIFIED":
        if not verified or stages != [2] * len(stages):
            raise RuntimeError("provision_journal_terminal_state")
    elif verified:
        raise RuntimeError("provision_journal_terminal_state")
    return {"stages": stages, "authorities": authorities, "verified": verified}


def provision(intent_path: Path, intent_sha256: str, owner_path: Path,
              owner_sha256: str) -> dict:
    intent = private_json(intent_path, intent_sha256)
    intent_keys = {"schemaVersion", "kind", "event", "state", "operationId", "planPath",
                   "planSha256", "root", "ancestors", "executor", "commands", "initialState",
                   "outputs", "automaticExecution"}
    if (set(intent) != intent_keys or intent.get("schemaVersion") != 2 or
            intent.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_INTENT_V2" or
            intent.get("event") != "PROVISION_INTENT_PREPARED" or
            intent.get("state") != "AWAITING_OWNER_AUTHORIZATION" or
            intent.get("automaticExecution") is not False):
        raise RuntimeError("provision_intent_schema")
    plan = private_json(Path(intent["planPath"]), intent["planSha256"]); validate_provision_plan(plan)
    if intent != provision_intent(Path(intent["planPath"]), intent["planSha256"], plan):
        raise RuntimeError("provision_intent_binding")
    owner = private_json(owner_path, owner_sha256)
    validate_provision_owner(owner, plan, intent["planSha256"], intent_sha256)
    lock_path = Path(plan["outputs"]["lockPath"])
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        lock_info = os.fstat(lock_fd)
        if (not stat.S_ISREG(lock_info.st_mode) or stat.S_IMODE(lock_info.st_mode) != 0o600 or
                lock_info.st_nlink != 1 or
                (lock_info.st_uid, lock_info.st_gid) !=
                (plan["custodyRoot"]["ownerUid"], plan["custodyRoot"]["groupGid"])):
            raise RuntimeError("provision_lock_identity")
        try: fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error: raise RuntimeError("provision_concurrent_execution") from error
        journal_path = Path(plan["outputs"]["journalPath"]); receipt_path = Path(plan["outputs"]["receiptPath"])
        if receipt_path.exists() or receipt_path.is_symlink():
            receipt_sha = digest(receipt_path.read_bytes()); receipt = private_json(receipt_path, receipt_sha)
            receipt_keys = {"schemaVersion", "kind", "event", "state", "operationId",
                            "planSha256", "provisionIntentSha256", "ownerAuthorizationSha256",
                            "journalPath", "journalSha256", "root", "createdDirectories",
                            "automaticExecution"}
            if (set(receipt) != receipt_keys or receipt.get("schemaVersion") != 1 or
                    receipt.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_RECEIPT_V1" or
                    receipt.get("event") != "ROOT_PROVISIONED_VERIFIED" or
                    receipt.get("state") != "ROOT_PROVISIONED_VERIFIED" or
                    receipt.get("operationId") != plan["operationId"] or
                    receipt.get("planSha256") != intent["planSha256"] or
                    receipt.get("provisionIntentSha256") != intent_sha256 or
                    receipt.get("ownerAuthorizationSha256") != owner_sha256 or
                    receipt.get("journalPath") != str(journal_path) or
                    receipt.get("automaticExecution") is not False):
                raise RuntimeError("provision_receipt_binding")
            authorities = [expected_created_authority(item) for item in plan["createdDirectories"]]
            if receipt.get("root") != authorities[-1] or receipt.get("createdDirectories") != authorities:
                raise RuntimeError("provision_receipt_physical_readback")
            journal = private_json(journal_path, receipt.get("journalSha256", ""))
            validate_provision_journal(journal, plan, intent["planSha256"], intent_sha256,
                                       owner_sha256)
            return {"state": "ROOT_PROVISIONED_VERIFIED", "provisionReceiptSha256": receipt_sha,
                    "replayed": True}
        if journal_path.exists() or journal_path.is_symlink():
            journal_raw = journal_path.read_bytes(); journal = private_json(journal_path, digest(journal_raw))
            journal_state = validate_provision_journal(
                journal, plan, intent["planSha256"], intent_sha256, owner_sha256)
        else:
            if any(Path(item["path"]).exists() or Path(item["path"]).is_symlink()
                   for item in plan["createdDirectories"]):
                raise RuntimeError("provision_unattributed_preexisting")
            journal = {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_JOURNAL_V1",
                       "operationId": plan["operationId"], "planSha256": intent["planSha256"],
                       "provisionIntentSha256": intent_sha256,
                       "ownerAuthorizationSha256": owner_sha256, "state": "IN_PROGRESS", "events": []}
            replace_private(journal_path, journal)
            journal_state = {"stages": [0] * len(plan["commands"]),
                             "authorities": [None] * len(plan["commands"]), "verified": False}
        for ordinal, (item, command) in enumerate(zip(plan["createdDirectories"], plan["commands"]), 1):
            stage = journal_state["stages"][ordinal - 1]
            if stage == 2:
                continue
            if stage == 0:
                journal["events"].append({"event": "ATTEMPT", "operationId": plan["operationId"],
                                          "ordinal": ordinal, "command": command})
                replace_private(journal_path, journal)
                new_attempt = True
            else:
                new_attempt = False
            path = Path(item["path"])
            if path.exists() or path.is_symlink():
                if new_attempt:
                    raise RuntimeError("provision_unattributed_preexisting")
                authority = expected_created_authority(item)
                result_source = "INTERRUPTED_COMMAND_PHYSICAL_READBACK"
            else:
                if not new_attempt:
                    raise RuntimeError("provision_interrupted_effect_unproven")
                subprocess.run(command, check=True, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                authority = expected_created_authority(item); result_source = "EXECUTED"
            journal["events"].append({"event": "RESULT", "operationId": plan["operationId"],
                                      "ordinal": ordinal, "command": command,
                                      "resultSource": result_source, "authority": authority})
            replace_private(journal_path, journal)
        authorities = [expected_created_authority(item) for item in plan["createdDirectories"]]
        if not journal_state["verified"]:
            journal["events"].append({"event": "VERIFIED", "operationId": plan["operationId"],
                                      "createdDirectories": authorities})
        journal["state"] = "ROOT_PROVISIONED_VERIFIED"
        validate_provision_journal(journal, plan, intent["planSha256"], intent_sha256,
                                   owner_sha256)
        journal_sha = replace_private(journal_path, journal)
        receipt = {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_RECEIPT_V1",
                   "event": "ROOT_PROVISIONED_VERIFIED", "state": "ROOT_PROVISIONED_VERIFIED",
                   "operationId": plan["operationId"], "planSha256": intent["planSha256"],
                   "provisionIntentSha256": intent_sha256, "ownerAuthorizationSha256": owner_sha256,
                   "journalPath": str(journal_path), "journalSha256": journal_sha,
                   "root": authorities[-1], "createdDirectories": authorities,
                   "automaticExecution": False}
        receipt_sha = publish(receipt_path, receipt)
        return {"state": "ROOT_PROVISIONED_VERIFIED", "provisionReceiptSha256": receipt_sha,
                "replayed": False}
    finally:
        os.close(lock_fd)


def validate_plan(value: dict) -> None:
    version = value.get("schemaVersion")
    keys = {"schemaVersion", "kind", "operationId", "persistentRoot", "custodyRoot", "authorizedSourceReleases", "entries", "privacyBatchAuthority", "outputs"}
    if version == 2:
        keys.add("provisionReceiptAuthority")
    if (set(value) != keys or version not in {1, 2} or
            value.get("kind") != f"CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V{version}" or
            not value.get("operationId")):
        raise RuntimeError("cutover_plan_schema")
    root = value["persistentRoot"]
    if set(root) != {"path", "ownerUid", "groupGid", "mode"} or root["path"] != ROOT or root["mode"] != "0700" or not isinstance(root["ownerUid"], int) or not isinstance(root["groupGid"], int):
        raise RuntimeError("cutover_plan_root")
    custody = value["custodyRoot"]
    if set(custody) != {"path", "ownerUid", "groupGid", "mode"} or not Path(custody["path"]).is_absolute() or custody["mode"] != "0700":
        raise RuntimeError("cutover_plan_custody")
    releases = value["authorizedSourceReleases"]
    if not isinstance(releases, list) or len(releases) != len(set(releases)) or not releases:
        raise RuntimeError("cutover_plan_releases")
    batch = value["privacyBatchAuthority"]
    if set(batch) != {"path", "sha256", "inventorySha256", "journalSha256", "custodyManifestSha256", "verifiedCount"} or batch["inventorySha256"] != PRIVACY_INVENTORY_SHA256 or batch["journalSha256"] != PRIVACY_JOURNAL_SHA256 or batch["custodyManifestSha256"] != PRIVACY_CUSTODY_SHA256 or batch["verifiedCount"] != 34:
        raise RuntimeError("cutover_plan_privacy_batch")
    outputs = value["outputs"]
    expected_outputs = ({"provisionIntentPath", "materializationRequestPath", "authorizationPath"}
                        if version == 1 else {"materializationRequestPath", "authorizationPath"})
    if set(outputs) != expected_outputs or any(not inside(path, custody["path"]) for path in outputs.values()):
        raise RuntimeError("cutover_plan_outputs")
    if version == 2:
        binding = value["provisionReceiptAuthority"]
        if (set(binding) != {"path", "sha256", "provisionIntentSha256"} or
                not inside(binding.get("path", ""), custody["path"])):
            raise RuntimeError("cutover_plan_provision_receipt")
        receipt = private_json(Path(binding["path"]), binding["sha256"])
        if (receipt.get("kind") != "CONVERTA_DURABLE_READ_STATE_PROVISION_RECEIPT_V1" or
                receipt.get("state") != "ROOT_PROVISIONED_VERIFIED" or
                receipt.get("provisionIntentSha256") != binding["provisionIntentSha256"] or
                receipt.get("root", {}).get("path") != root["path"] or
                receipt.get("root", {}).get("ownerUid") != root["ownerUid"] or
                receipt.get("root", {}).get("groupGid") != root["groupGid"] or
                receipt.get("root", {}).get("mode") != root["mode"]):
            raise RuntimeError("cutover_plan_provision_receipt")
    scopes: set[str] = set(); destinations: set[str] = set(); copies: set[str] = set()
    for entry in value["entries"]:
        required = {"operationId", "tenantId", "scope", "destinationPath", "sources", "anonymizationAuthority", "requestPath", "journalPath", "receiptPath"}
        if set(entry) != required or not entry["tenantId"] or not entry["sources"]:
            raise RuntimeError("cutover_plan_entry")
        scope = entry["scope"]
        if set(scope) != ({"type"} if scope.get("type") == "shared" else {"type", "assignedUserId"}) or scope.get("type") not in {"shared", "assigned"}:
            raise RuntimeError("cutover_plan_scope")
        scope_key = f'{entry["tenantId"]}:{scope["type"]}:{scope.get("assignedUserId", "")}'
        if scope_key in scopes or entry["destinationPath"] in destinations or not inside(entry["destinationPath"], ROOT):
            raise RuntimeError("cutover_plan_duplicate")
        scopes.add(scope_key); destinations.add(entry["destinationPath"])
        for field in ("requestPath", "journalPath", "receiptPath"):
            if not inside(entry[field], custody["path"]): raise RuntimeError("cutover_plan_custody_boundary")
        privacy = entry["anonymizationAuthority"]
        if set(privacy) != {"path", "sha256"} or not inside(privacy["path"], custody["path"]): raise RuntimeError("cutover_plan_privacy")
        for source in entry["sources"]:
            if set(source) != {"releaseId", "path", "rootPath", "privateCopyPath"} or source["releaseId"] not in releases or not inside(source["path"], source["rootPath"]) or not inside(source["privateCopyPath"], custody["path"]) or source["privateCopyPath"] in copies:
                raise RuntimeError("cutover_plan_source")
            copies.add(source["privateCopyPath"])


def prepare(plan_path: Path, plan_sha256: str) -> dict:
    plan = private_json(plan_path, plan_sha256); validate_plan(plan)
    if plan["schemaVersion"] == 2:
        binding = plan["provisionReceiptAuthority"]
        request = {"schemaVersion": 2, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORITY_MATERIALIZATION_REQUEST_V2",
                   "planPath": str(plan_path), "planSha256": plan_sha256,
                   "provisionReceiptPath": binding["path"], "provisionReceiptSha256": binding["sha256"],
                   "provisionIntentSha256": binding["provisionIntentSha256"],
                   "authorizationPath": plan["outputs"]["authorizationPath"]}
        request_sha = publish(Path(plan["outputs"]["materializationRequestPath"]), request)
        return {"state": "CUTOVER_PLAN_PREPARED", "materializationRequestSha256": request_sha,
                "provisionReceiptSha256": binding["sha256"]}
    provision = {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_INTENT_V1", "state": "AWAITING_OWNER_AUTHORIZATION", "planSha256": plan_sha256, "root": plan["persistentRoot"], "automaticExecution": False}
    provision_sha = publish(Path(plan["outputs"]["provisionIntentPath"]), provision)
    request = {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORITY_MATERIALIZATION_REQUEST_V1", "planPath": str(plan_path), "planSha256": plan_sha256, "provisionIntentPath": plan["outputs"]["provisionIntentPath"], "provisionIntentSha256": provision_sha, "authorizationPath": plan["outputs"]["authorizationPath"]}
    request_sha = publish(Path(plan["outputs"]["materializationRequestPath"]), request)
    return {"state": "PREPARED", "provisionIntentSha256": provision_sha, "materializationRequestSha256": request_sha}


def root_authority(path: Path, expected: dict, mode: int) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != mode or (info.st_uid, info.st_gid) != (expected["ownerUid"], expected["groupGid"]):
        raise RuntimeError("cutover_root_identity")
    return {"path": str(path), "device": info.st_dev, "inode": info.st_ino, "ownerUid": info.st_uid, "groupGid": info.st_gid, "mode": f"0{mode:03o}"}


def materialize(request_path: Path, request_sha256: str,
                owner_authorization_path: Path, owner_authorization_sha256: str) -> dict:
    request = private_json(request_path, request_sha256)
    request_version = request.get("schemaVersion")
    request_keys = ({"schemaVersion", "kind", "planPath", "planSha256", "provisionIntentPath", "provisionIntentSha256", "authorizationPath"}
                    if request_version == 1 else
                    {"schemaVersion", "kind", "planPath", "planSha256", "provisionReceiptPath", "provisionReceiptSha256", "provisionIntentSha256", "authorizationPath"})
    if (set(request) != request_keys or request_version not in {1, 2} or
            request.get("kind") != f"CONVERTA_READ_STATE_CUTOVER_AUTHORITY_MATERIALIZATION_REQUEST_V{request_version}"):
        raise RuntimeError("materialization_request_schema")
    plan = private_json(Path(request["planPath"]), request["planSha256"]); validate_plan(plan)
    if plan["schemaVersion"] != request_version:
        raise RuntimeError("materialization_request_plan_version")
    if request_version == 1:
        provision = private_json(Path(request["provisionIntentPath"]), request["provisionIntentSha256"])
        if provision.get("planSha256") != request["planSha256"] or provision.get("state") != "AWAITING_OWNER_AUTHORIZATION": raise RuntimeError("provision_intent_binding")
    else:
        receipt = private_json(Path(request["provisionReceiptPath"]), request["provisionReceiptSha256"])
        binding = plan["provisionReceiptAuthority"]
        if (request["provisionReceiptPath"] != binding["path"] or
                request["provisionReceiptSha256"] != binding["sha256"] or
                request["provisionIntentSha256"] != binding["provisionIntentSha256"] or
                receipt.get("state") != "ROOT_PROVISIONED_VERIFIED"):
            raise RuntimeError("provision_receipt_binding")
    owner = private_json(owner_authorization_path, owner_authorization_sha256)
    expected_owner_keys = {"schemaVersion", "kind", "decision", "planSha256", "provisionIntentSha256", "approvedPersistentRoot", "approvedTenants", "owner"}
    if (set(owner) != expected_owner_keys or owner.get("schemaVersion") != 1 or
            owner.get("kind") != "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1" or
            owner.get("decision") != "AUTHORIZE_ONCE" or
            owner.get("planSha256") != request["planSha256"] or
            owner.get("provisionIntentSha256") != request["provisionIntentSha256"] or
            owner.get("approvedPersistentRoot") != plan["persistentRoot"]["path"] or
            owner.get("approvedTenants") != sorted({entry["tenantId"] for entry in plan["entries"]}) or
            not isinstance(owner.get("owner"), str) or not owner["owner"].strip()):
        raise RuntimeError("owner_authorization_binding")
    persistent = root_authority(Path(plan["persistentRoot"]["path"]), plan["persistentRoot"], 0o700)
    custody = root_authority(Path(plan["custodyRoot"]["path"]), plan["custodyRoot"], 0o700)
    batch = private_json(Path(plan["privacyBatchAuthority"]["path"]), plan["privacyBatchAuthority"]["sha256"])
    if batch.get("inventorySha256") != PRIVACY_INVENTORY_SHA256 or batch.get("journalSha256") != PRIVACY_JOURNAL_SHA256 or batch.get("custodyManifestSha256") != PRIVACY_CUSTODY_SHA256 or batch.get("verifiedCount") != 34:
        raise RuntimeError("privacy_batch_binding")
    entries = []
    for entry in plan["entries"]:
        privacy = private_json(Path(entry["anonymizationAuthority"]["path"]), entry["anonymizationAuthority"]["sha256"])
        if privacy.get("kind") != "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS" or privacy.get("tenantId") != entry["tenantId"]:
            raise RuntimeError("privacy_tenant_binding")
        sources = []
        for source in entry["sources"]:
            source_root = Path(source["rootPath"]); info = source_root.lstat()
            expected = {"ownerUid": info.st_uid, "groupGid": info.st_gid}
            sources.append({"releaseId": source["releaseId"], "path": source["path"], "root": root_authority(source_root, expected, 0o755), "admission": "LEGACY_RELEASE_LOCAL_COPY_V1", "privateCopyPath": source["privateCopyPath"]})
        entries.append({"operationId": entry["operationId"], "tenantId": entry["tenantId"], "scope": entry["scope"], "destinationPath": entry["destinationPath"], "sources": sources, "anonymizationAuthority": entry["anonymizationAuthority"], "requestPath": entry["requestPath"], "journalPath": entry["journalPath"], "receiptPath": entry["receiptPath"]})
    authorization = {"schemaVersion": 3, "kind": "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V3", "operationId": plan["operationId"], "administrativeAuthority": {"path": str(owner_authorization_path), "sha256": owner_authorization_sha256}, "custodyRoot": custody, "persistentRoot": persistent, "authorizedSourceReleases": plan["authorizedSourceReleases"], "entries": entries, "inventoryPath": str(Path(custody["path"]) / "inventory.private.json"), "manifestPath": str(Path(custody["path"]) / "manifest.private.json"), "aggregateReceiptPath": str(Path(custody["path"]) / "aggregate/receipt.private.json"), "sealReceiptPath": str(Path(custody["path"]) / "snapshot-seal.private.json")}
    authorization_sha = publish(Path(request["authorizationPath"]), authorization)
    return {"state": ("MATERIALIZED" if request_version == 1 else "CUTOVER_PLAN_AUTHORIZED"),
            "authorizationSha256": authorization_sha, "entryCount": len(entries)}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("action", choices=("prepare-provision", "provision", "prepare", "materialize")); parser.add_argument("path"); parser.add_argument("sha256")
    parser.add_argument("--owner-authorization"); parser.add_argument("--owner-authorization-sha256")
    args = parser.parse_args()
    if args.action == "prepare-provision": result = prepare_provision(Path(args.path), args.sha256)
    elif args.action == "prepare": result = prepare(Path(args.path), args.sha256)
    else:
        if not args.owner_authorization or not args.owner_authorization_sha256: raise RuntimeError("owner_authorization_required")
        if args.action == "provision":
            result = provision(Path(args.path), args.sha256, Path(args.owner_authorization), args.owner_authorization_sha256)
        else:
            result = materialize(Path(args.path), args.sha256, Path(args.owner_authorization), args.owner_authorization_sha256)
    print(canonical(result).decode(), end="")


if __name__ == "__main__": main()
