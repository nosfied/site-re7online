#!/usr/bin/env python3
"""Fail-closed gate for persistent operational data used across immutable releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
from pathlib import Path
from typing import Any

SHA256 = re.compile(r"^[a-f0-9]{64}$")
KIND = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V1"
KIND_V2 = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V2"
KIND_V3 = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V3"
KIND_V4 = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V4"
KIND_V5 = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V5"
COMPILED_AUTHORITY_KIND = "CONVERTA_DURABLE_READ_STATE_COMPILED_AUTHORITY_V1"
PENDING_COMPILED_STATE = "PENDING_BUILD_VERIFY"
COMPILED_RELATIVE_PATHS = {
    "runner": "api-runtime/dist/inbox/readStateReconciliationBatch.js",
    "candidateStorage": "api-runtime/dist/inbox/readStateStore.js",
}
PHASES = ("qualification", "admission", "preflight", "activation", "acceptance",
          "finalize", "retirement")
ENFORCEMENT_STATE = "CANONICALLY_ENFORCED"


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def private_json(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha256):
        deny("request_binding")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        deny("request_identity")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        deny("request_sha256")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("request_json")
    if not isinstance(value, dict) or raw != canonical(value):
        deny("request_canonical")
    return value


def confined_outside(root: Path, release_roots: list[Path]) -> None:
    if not root.is_absolute() or root == Path("/"):
        deny("persistent_root_absolute")
    for release_root in release_roots:
        if not release_root.is_absolute():
            deny("release_root_absolute")
        if root == release_root or release_root in root.parents or root in release_root.parents:
            deny("persistent_root_release_overlap")


def validate_external_admission_authority(binding: Any, root_value: dict[str, Any]) -> dict[str, Any]:
    keys = {"path", "sha256", "operationId", "provisionReceiptSha256",
            "ownerAuthorizationSha256", "materializationRequestSha256",
            "materializerSha256"}
    if (not isinstance(binding, dict) or set(binding) != keys or
            not isinstance(binding.get("operationId"), str) or not binding["operationId"] or
            not SHA256.fullmatch(str(binding.get("provisionReceiptSha256", ""))) or
            not SHA256.fullmatch(str(binding.get("ownerAuthorizationSha256", ""))) or
            not SHA256.fullmatch(str(binding.get("materializationRequestSha256", ""))) or
            not SHA256.fullmatch(str(binding.get("materializerSha256", "")))):
        deny("external_admission_authority_binding")
    authority = private_json(Path(str(binding.get("path", ""))),
                             str(binding.get("sha256", "")))
    authority_keys = {"schemaVersion", "kind", "state", "operationId",
                      "sourceCustody", "persistentRoot", "createdDirectories",
                      "provisioningAuthority", "materializer", "automaticExecution"}
    if (set(authority) != authority_keys or authority.get("schemaVersion") != 1 or
            authority.get("kind") !=
            "CONVERTA_DURABLE_READ_STATE_EXTERNAL_ADMISSION_AUTHORITY_V1" or
            authority.get("state") != "ROOT_PROVISIONED_VERIFIED" or
            authority.get("operationId") != binding["operationId"] or
            authority.get("automaticExecution") is not False):
        deny("external_admission_authority_semantics")
    materializer = authority.get("materializer")
    if (not isinstance(materializer, dict) or
            set(materializer) != {"kind", "sha256"} or
            materializer.get("kind") != "READ_STATE_CUTOVER_AUTHORITY_V1" or
            materializer.get("sha256") != binding["materializerSha256"]):
        deny("external_admission_authority_materializer")
    provisioning = authority.get("provisioningAuthority")
    provisioning_keys = {"planSha256", "provisionIntentSha256",
                         "ownerAuthorizationSha256", "journalSha256",
                         "provisionReceiptSha256", "materializationRequestSha256"}
    if (not isinstance(provisioning, dict) or set(provisioning) != provisioning_keys or
            any(not SHA256.fullmatch(str(provisioning.get(key, "")))
                for key in provisioning_keys) or
            provisioning.get("provisionReceiptSha256") !=
            binding["provisionReceiptSha256"] or
            provisioning.get("ownerAuthorizationSha256") !=
            binding["ownerAuthorizationSha256"] or
            provisioning.get("materializationRequestSha256") !=
            binding["materializationRequestSha256"]):
        deny("external_admission_authority_provenance")
    source_custody = authority.get("sourceCustody")
    physical_keys = {"path", "device", "inode", "ownerUid", "groupGid", "mode"}
    if (not isinstance(source_custody, dict) or set(source_custody) != physical_keys or
            not Path(str(source_custody.get("path", ""))).is_absolute() or
            source_custody.get("mode") != "0700"):
        deny("external_admission_authority_custody")
    physical = authority.get("persistentRoot")
    if (not isinstance(physical, dict) or set(physical) != physical_keys or
            physical.get("path") != root_value["path"] or
            physical.get("ownerUid") != root_value["ownerUid"] or
            physical.get("groupGid") != root_value["groupGid"] or
            physical.get("mode") != root_value["mode"] or
            not isinstance(physical.get("device"), int) or
            not isinstance(physical.get("inode"), int)):
        deny("external_admission_authority_root")
    created = authority.get("createdDirectories")
    if (not isinstance(created, list) or not created or created[-1] != physical or
            any(not isinstance(item, dict) or set(item) != physical_keys for item in created)):
        deny("external_admission_authority_created_directories")
    return authority


def validate_aggregate_materialization(reconciliation: dict[str, Any], manifest_sha: str,
                                       receipt_value: dict[str, Any] | None,
                                       cutover: bool) -> None:
    manifest = private_json(Path(str(reconciliation.get("manifest", ""))), manifest_sha)
    if (manifest.get("schemaVersion") != 1 or manifest.get("kind") != "CONVERTA_INBOX_READ_STATE_RECONCILIATION_MANIFEST_V1"
            or manifest.get("operationId") != reconciliation["operationId"] or not isinstance(manifest.get("entries"), list)
            or len(manifest["entries"]) != reconciliation.get("destinationCount")):
        deny("reconciliation_manifest_semantics")
    inventory_authority = manifest.get("inventoryAuthority")
    if not isinstance(inventory_authority, dict) or set(inventory_authority) != {"path", "sha256"}:
        deny("reconciliation_inventory_binding")
    inventory = private_json(Path(str(inventory_authority.get("path", ""))), str(inventory_authority.get("sha256", "")))
    if (inventory.get("schemaVersion") != 1 or inventory.get("kind") != "CONVERTA_INBOX_READ_STATE_AUTHORIZED_DESTINATION_INVENTORY_V1"
            or not isinstance(inventory.get("destinations"), list)):
        deny("reconciliation_inventory_semantics")
    if receipt_value is not None and (receipt_value.get("schemaVersion") != 1 or receipt_value.get("kind") != "CONVERTA_INBOX_READ_STATE_RECONCILIATION_AGGREGATE_RECEIPT_V1"
            or receipt_value.get("state") != "VERIFIED" or receipt_value.get("operationId") != reconciliation["operationId"]
            or receipt_value.get("manifestSha256") != manifest_sha or not isinstance(receipt_value.get("entries"), list)
            or receipt_value.get("inventorySha256") != inventory_authority["sha256"]
            or len(receipt_value["entries"]) != len(manifest["entries"])):
        deny("reconciliation_receipt_semantics")
    inventory_entries = {(entry.get("tenantId"), canonical(entry.get("scope")), entry.get("destinationPath"), canonical(entry.get("sourceAuthorities")), entry.get("anonymizationAuthoritySha256")) for entry in inventory["destinations"] if isinstance(entry, dict)}
    manifest_inventory_entries = {(entry.get("tenantId"), canonical(entry.get("scope")), entry.get("destinationPath"), canonical(entry.get("sourceAuthorities")), entry.get("anonymizationAuthoritySha256")) for entry in manifest["entries"] if isinstance(entry, dict)}
    if len(inventory_entries) != len(inventory["destinations"]) or inventory_entries != manifest_inventory_entries:
        deny("reconciliation_inventory_completeness")
    manifest_entries = {(entry.get("tenantId"), canonical(entry.get("scope")), entry.get("destinationPath"), entry.get("requestSha256"), entry.get("receiptPath"), canonical(entry.get("sourceAuthorities")), entry.get("anonymizationAuthoritySha256")) for entry in manifest["entries"] if isinstance(entry, dict)}
    if receipt_value is not None:
        receipt_entries = {(entry.get("tenantId"), canonical(entry.get("scope")), entry.get("destinationPath"), entry.get("requestSha256"), entry.get("receiptPath"), canonical(entry.get("sourceAuthorities")), entry.get("anonymizationAuthoritySha256")) for entry in receipt_value["entries"] if isinstance(entry, dict)}
        if len(manifest_entries) != len(manifest["entries"]) or manifest_entries != receipt_entries:
            deny("reconciliation_receipt_completeness")
        for entry in receipt_value["entries"]:
            individual = private_json(Path(str(entry.get("receiptPath", ""))), str(entry.get("receiptSha256", "")))
            if (individual.get("schemaVersion") != 2 or individual.get("kind") != "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2"
                    or individual.get("state") != "VERIFIED" or individual.get("tenantId") != entry.get("tenantId")
                    or individual.get("scope") != entry.get("scope") or individual.get("destinationPath") != entry.get("destinationPath")
                    or individual.get("requestSha256") != entry.get("requestSha256")):
                deny("reconciliation_individual_receipt_semantics")
            if cutover:
                destination = Path(str(entry.get("destinationPath", "")))
                try:
                    destination_raw = destination.read_bytes()
                except OSError:
                    deny("reconciliation_destination_readback")
                if hashlib.sha256(destination_raw).hexdigest() != individual.get("destinationSha256"):
                    deny("reconciliation_destination_readback")


def _candidate_root(request: dict[str, Any]) -> Path:
    return Path(next(item["path"] for item in request["releaseRoots"]
                     if item["role"] == "candidate"))


def validate_pending_compiled_bindings(request: dict[str, Any]) -> None:
    identity = request.get("candidateIdentity")
    candidate = _candidate_root(request)
    if (not isinstance(identity, dict) or set(identity) != {"generationId", "targetCommit"} or
            not isinstance(identity.get("generationId"), str) or
            candidate.name != identity.get("generationId") or
            not re.fullmatch(r"[0-9a-f]{40}", str(identity.get("targetCommit", "")))):
        deny("cutover_candidate_identity")
    cutover = request["cutover"]
    for label, relative in COMPILED_RELATIVE_PATHS.items():
        binding = cutover.get(label)
        expected_path = candidate / relative
        if (not isinstance(binding, dict) or
                set(binding) != {"path", "relativePath", "state"} or
                binding.get("state") != PENDING_COMPILED_STATE or
                binding.get("relativePath") != relative or
                Path(str(binding.get("path", ""))) != expected_path):
            deny(f"cutover_{label}_pending_binding")


def validate(request: dict[str, Any], invoked_phase: str | None = None) -> dict[str, Any]:
    common = {"schemaVersion", "kind", "surface", "persistentRoot", "releaseRoots",
              "reconciliation", "unreconciledReleaseDependencies"}
    legacy = request.get("schemaVersion") == 1
    external = request.get("schemaVersion") in {4, 5}
    cutover = (request.get("schemaVersion") == 3 or
               (external and "cutover" in request))
    pending_compiled = request.get("schemaVersion") == 5
    required = common | ({"phase"} if legacy else {"requiredPhases"}) | ({"cutover"} if cutover else set()) | ({"externalAdmissionAuthority"} if external else set()) | ({"candidateIdentity"} if pending_compiled else set())
    if (set(request) != required or
            (legacy and request.get("kind") != KIND) or
            (not legacy and not cutover and not external and
             (request.get("schemaVersion") != 2 or request.get("kind") != KIND_V2)) or
            (request.get("schemaVersion") == 3 and request.get("kind") != KIND_V3) or
            (request.get("schemaVersion") == 4 and request.get("kind") != KIND_V4) or
            (pending_compiled and request.get("kind") != KIND_V5)):
        deny("request_schema")
    if legacy:
        declared_phases = (request.get("phase"),)
    else:
        phases = request.get("requiredPhases")
        if phases != list(PHASES):
            deny("request_phases")
        declared_phases = tuple(phases)
    phase = invoked_phase or declared_phases[0]
    if phase not in PHASES or phase not in declared_phases:
        deny("request_phase")
    if request.get("surface") != "INBOX_READ_STATE_V1":
        deny("request_surface")
    root_value = request.get("persistentRoot")
    if not isinstance(root_value, dict) or set(root_value) != {"path", "ownerUid", "groupGid", "mode"}:
        deny("persistent_root_schema")
    root = Path(str(root_value.get("path", "")))
    release_values = request.get("releaseRoots")
    if (not isinstance(release_values, list) or {item.get("role") for item in release_values if isinstance(item, dict)} != {"candidate", "rollback"}
            or not all(isinstance(item, dict) and set(item) == {"role", "path"} and item["role"] in {"candidate", "rollback"} for item in release_values)):
        deny("release_roots_schema")
    release_roots = [Path(item["path"]) for item in release_values]
    confined_outside(root, release_roots)
    if root_value.get("mode") != "0700" or not isinstance(root_value.get("ownerUid"), int) or not isinstance(root_value.get("groupGid"), int):
        deny("persistent_root_policy")
    external_authority = (validate_external_admission_authority(
        request.get("externalAdmissionAuthority"), root_value) if external else None)

    reconciliation = request.get("reconciliation")
    individual_keys = {"required", "state", "receipt", "receiptSha256", "operationId", "tenantId", "scope", "destinationPath"}
    aggregate_keys = {"required", "state", "receipt", "receiptSha256", "operationId",
                      "manifest", "manifestSha256", "destinationCount"}
    cutover_aggregate_keys = {"required", "state", "receipt", "operationId", "manifest",
                              "authorization", "authorizationSha256", "sealReceipt",
                              "destinationCount"}
    allowed_reconciliation_keys = (individual_keys, cutover_aggregate_keys) if cutover else (individual_keys, aggregate_keys)
    if not isinstance(reconciliation, dict) or set(reconciliation) not in allowed_reconciliation_keys:
        deny("reconciliation_schema")
    required_reconciliation = reconciliation.get("required") is True
    expected_state = ("PENDING" if cutover and required_reconciliation else
                      "VERIFIED" if required_reconciliation else "NOT_REQUIRED")
    if reconciliation.get("state") != expected_state:
        deny("reconciliation_state")
    receipt_value: dict[str, Any] | None = None
    if required_reconciliation:
        receipt = Path(str(reconciliation.get("receipt", "")))
        receipt_sha = str(reconciliation.get("receiptSha256", ""))
        if cutover and set(reconciliation) != cutover_aggregate_keys:
            deny("reconciliation_cutover_requires_aggregate")
        final_phase = phase in {"activation", "acceptance", "finalize", "retirement"}
        if not cutover or final_phase or receipt.exists() or receipt.is_symlink():
            if cutover:
                receipt_sha = hashlib.sha256(receipt.read_bytes()).hexdigest()
            receipt_value = private_json(receipt, receipt_sha)
        if set(reconciliation) == individual_keys:
            expected = {"schemaVersion": 2, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2", "state": "VERIFIED", "operationId": reconciliation["operationId"], "tenantId": reconciliation["tenantId"], "scope": reconciliation["scope"], "destinationPath": reconciliation["destinationPath"]}
            if receipt_value is None or any(receipt_value.get(key) != value for key, value in expected.items()):
                deny("reconciliation_receipt_semantics")
        else:
            manifest_sha = str(reconciliation.get("manifestSha256", ""))
            if cutover:
                authorization = private_json(Path(str(reconciliation.get("authorization", ""))),
                                             str(reconciliation.get("authorizationSha256", "")))
                authorization_version = (authorization.get("schemaVersion"), authorization.get("kind"))
                if (authorization_version not in {
                        (1, "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V1"),
                        (2, "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V2"),
                        (3, "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V3")} or
                        authorization.get("operationId") != reconciliation["operationId"] or
                        len(authorization.get("entries", [])) != reconciliation.get("destinationCount") or
                        authorization.get("manifestPath") != reconciliation.get("manifest") or
                        authorization.get("aggregateReceiptPath") != reconciliation.get("receipt") or
                        authorization.get("sealReceiptPath") != reconciliation.get("sealReceipt")):
                    deny("reconciliation_snapshot_authorization_semantics")
                if authorization_version[0] in {2, 3}:
                    for entry in authorization["entries"]:
                        sources = entry.get("sources") if isinstance(entry, dict) else None
                        if (not isinstance(sources, list) or not sources or any(
                                not isinstance(source, dict) or
                                set(source) != {"releaseId", "path", "root", "admission", "privateCopyPath"} or
                                source.get("admission") != "LEGACY_RELEASE_LOCAL_COPY_V1" or
                                not isinstance(source.get("root"), dict) or
                                source["root"].get("mode") != "0755"
                                for source in sources)):
                            deny("reconciliation_snapshot_legacy_authorization")
                seal_path = Path(str(reconciliation.get("sealReceipt", "")))
                if final_phase or seal_path.exists() or seal_path.is_symlink():
                    seal_sha = hashlib.sha256(seal_path.read_bytes()).hexdigest()
                    seal = private_json(seal_path, seal_sha)
                    if (seal.get("schemaVersion") != 1 or seal.get("kind") !=
                            "CONVERTA_INBOX_READ_STATE_FINAL_SNAPSHOT_SEAL_V1" or
                            seal.get("state") != "SEALED" or
                            seal.get("operationId") != reconciliation["operationId"] or
                            seal.get("authorizationSha256") != reconciliation["authorizationSha256"] or
                            seal.get("manifestPath") != reconciliation["manifest"] or
                            seal.get("aggregateReceiptPath") != reconciliation["receipt"] or
                            len(seal.get("entries", [])) != reconciliation.get("destinationCount") or
                            not SHA256.fullmatch(str(seal.get("manifestSha256", "")))):
                        deny("reconciliation_snapshot_seal_semantics")
                    manifest_sha = seal["manifestSha256"]
                elif final_phase:
                    deny("reconciliation_snapshot_seal_absent")
            if manifest_sha:
                validate_aggregate_materialization(reconciliation, manifest_sha,
                                                   receipt_value, cutover)
    elif any(reconciliation.get(key) is not None for key in set(reconciliation) - {"required", "state"}):
        deny("reconciliation_unnecessary")

    dependencies = request.get("unreconciledReleaseDependencies")
    if not isinstance(dependencies, list) or not all(isinstance(item, str) and item for item in dependencies):
        deny("release_dependencies_schema")
    if phase == "retirement" and dependencies:
        deny("release_persistent_dependency")

    observation = None
    if phase not in {"qualification", "admission"} or not external:
        try:
            info = root.lstat()
            resolved = root.resolve(strict=True)
        except OSError:
            deny("persistent_root_absent")
        if (not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or resolved != root or
                info.st_uid != root_value["ownerUid"] or info.st_gid != root_value["groupGid"] or
                stat.S_IMODE(info.st_mode) != 0o700):
            deny("persistent_root_identity")
        for parent in [root, *root.parents]:
            if parent == Path("/"):
                break
            parent_info = parent.lstat()
            writable = stat.S_IMODE(parent_info.st_mode) & 0o022
            if stat.S_ISLNK(parent_info.st_mode) or (writable and not parent_info.st_mode & stat.S_ISVTX):
                deny("persistent_root_ancestor")
        observation = {"device": info.st_dev, "inode": info.st_ino, "mode": "0700",
                       "ownerUid": info.st_uid, "groupGid": info.st_gid}
        if external and observation != {key: external_authority["persistentRoot"][key]
                                        for key in ("device", "inode", "mode", "ownerUid", "groupGid")}:
            deny("persistent_root_remote_authority_divergence")
    elif phase == "admission":
        observation = dict(external_authority["persistentRoot"])
    if cutover:
        cutover_value = request.get("cutover")
        cutover_keys = {"mode", "runner", "candidateStorage", "pm2",
                        "rollbackCompatibility"}
        if (not isinstance(cutover_value, dict) or set(cutover_value) != cutover_keys or
                cutover_value.get("mode") != "FIRST_RELEASE_LOCAL_TO_DURABLE_V1"):
            deny("cutover_schema")
        labels = (("rollbackCompatibility",) if pending_compiled else
                  ("runner", "candidateStorage", "rollbackCompatibility"))
        for label in labels:
            binding = cutover_value.get(label)
            if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
                    not Path(str(binding.get("path", ""))).is_absolute() or
                    not SHA256.fullmatch(str(binding.get("sha256", "")))):
                deny(f"cutover_{label}_binding")
        if pending_compiled:
            validate_pending_compiled_bindings(request)
            if phase not in {"qualification", "admission"}:
                deny("compiled_authority_pending")
        pm2 = cutover_value.get("pm2")
        if not isinstance(pm2, dict) or set(pm2) != {"candidate", "rollback"}:
            deny("cutover_pm2_binding")
    enforcement = (ENFORCEMENT_STATE if not legacy and invoked_phase is not None
                   else "LEGACY_VALIDATED_NOT_ENFORCED")
    report = {"schemaVersion": 1,
              "kind": "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_REPORT",
              "result": "PASS", "phase": phase, "surface": request["surface"],
              "persistentRoot": str(root), "observation": observation,
              "reconciliation": ("VERIFIED" if receipt_value is not None else
                                 reconciliation["state"]),
              "cutoverMode": request.get("cutover", {}).get("mode"),
              "enforcementState": enforcement}
    if pending_compiled:
        report["candidateIdentity"] = request["candidateIdentity"]
        report["compiledArtifactState"] = PENDING_COMPILED_STATE
    if external:
        report["observationSource"] = (
            "AUTHENTICATED_REMOTE_PROVISION_RECEIPT" if phase == "admission" else
            "LOCAL_PHYSICAL_READBACK" if observation is not None else None)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate",))
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    parser.add_argument("--phase", choices=PHASES)
    args = parser.parse_args()
    try:
        request = private_json(args.request, args.request_sha256)
        print(json.dumps(validate(request, args.phase), sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError) as error:
        print(f"PERSISTENCE_GATE_DENY:{error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
