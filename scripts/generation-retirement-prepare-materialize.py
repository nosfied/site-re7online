#!/usr/bin/env python3
"""Materialize an authenticated generation-retirement prepare bundle.

The materializer preserves the prior reviews, copies the integrated consumers,
authenticates every supplied binding and emits closed argv arrays for the real
``generation-retirement.py prepare`` entrypoint.  It does not execute prepare.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SUPPORT = HERE / "release-graph-reconciliation-materialize.py"
SPEC = importlib.util.spec_from_file_location("authenticated_materialization_support", SUPPORT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("MATERIALIZATION_SUPPORT_IMPORT")
SUPPORT_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPORT_MODULE)

MaterializationDenied = SUPPORT_MODULE.MaterializationDenied
deny = SUPPORT_MODULE.deny
sha256_file = SUPPORT_MODULE.sha256_file
file_binding = SUPPORT_MODULE.file_binding
copy_exclusive = SUPPORT_MODULE.copy_exclusive
write_json_exclusive = SUPPORT_MODULE.write_json_exclusive
request_binding_readback = SUPPORT_MODULE.request_binding_readback
require_sha256 = SUPPORT_MODULE.require_sha256

GIT_SHA1 = re.compile(r"[0-9a-f]{40}")
CONTROL_FILES = (
    "scripts/generation-retirement.py",
    "scripts/preparation_artifact_lifecycle.py",
    "scripts/capacity-recovery.py",
    "scripts/converta-release.py",
)
GENERATION_KEYS = {
    "name", "releaseId", "targetCommit", "contract", "lifecycle",
    "operationalState", "review", "reviewer", "reason",
}
RICH_GRAPH_KEYS = {
    "activeReleases", "rollbackReleases", "transitiveReturnReleases",
    "candidateReleases", "installedVerifiedReleases", "supersededCandidates",
}


def _closed_request(path: Path, expected_sha256: str) -> dict[str, Any]:
    require_sha256(expected_sha256, "PREPARE_REQUEST_SHA256_FORMAT")
    SUPPORT_MODULE.regular_identity(path, "PREPARE_REQUEST_IDENTITY")
    if sha256_file(path) != expected_sha256:
        deny("PREPARE_REQUEST_SHA256_DIVERGENCE")
    try:
        value = json.loads(path.read_bytes())
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("PREPARE_REQUEST_JSON")
    required = {"schemaVersion", "deploymentLock", "rootPolicy", "sourceReconciliation",
                "generations"}
    if not isinstance(value, dict) or set(value) != required or value.get("schemaVersion") != 1:
        deny("PREPARE_REQUEST_SCHEMA")
    lock = Path(str(value.get("deploymentLock", "")))
    if not lock.is_absolute() or lock != Path(os.path.normpath(str(lock))):
        deny("PREPARE_DEPLOYMENT_LOCK")
    source = value.get("sourceReconciliation")
    if not isinstance(source, dict) or set(source) != {
            "request", "successorGraph", "projection", "receipt"}:
        deny("PREPARE_RECONCILIATION_BINDINGS")
    generations = value.get("generations")
    if not isinstance(generations, list) or len(generations) not in {1, 2}:
        deny("PREPARE_GENERATIONS")
    names: set[str] = set()
    releases: set[str] = set()
    for item in generations:
        if not isinstance(item, dict) or set(item) != GENERATION_KEYS:
            deny("PREPARE_GENERATION_SCHEMA")
        name = item.get("name")
        release = item.get("releaseId")
        target = item.get("targetCommit")
        if (not isinstance(name, str) or not re.fullmatch(r"[a-z0-9-]+", name) or
                name in names or not isinstance(release, str) or not release or
                release in releases or not isinstance(target, str) or not GIT_SHA1.fullmatch(target) or
                not isinstance(item.get("reviewer"), str) or not item["reviewer"].strip() or
                not isinstance(item.get("reason"), str) or not item["reason"].strip()):
            deny("PREPARE_GENERATION_IDENTITY")
        names.add(name); releases.add(release)
    request_binding_readback(value)
    return value


def _bound_json(binding: Any, predicate: str) -> dict[str, Any]:
    if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
            not isinstance(binding.get("path"), str)):
        deny(predicate)
    require_sha256(binding.get("sha256"), predicate)
    path = Path(binding["path"])
    SUPPORT_MODULE.regular_identity(path, predicate)
    if sha256_file(path) != binding["sha256"]:
        deny(predicate)
    try:
        value = json.loads(path.read_bytes())
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(predicate)
    if not isinstance(value, dict):
        deny(predicate)
    return value


def _validate_reconciliation_bundle(request: dict[str, Any]) -> None:
    source = request["sourceReconciliation"]
    original = _bound_json(source["request"], "PREPARE_RECONCILIATION_REQUEST")
    successor = _bound_json(source["successorGraph"], "PREPARE_SUCCESSOR_GRAPH")
    projection = _bound_json(source["projection"], "PREPARE_PROJECTION")
    receipt = _bound_json(source["receipt"], "PREPARE_RECONCILIATION_RECEIPT")
    request_binding_readback(original)

    expected_projection = {"schemaVersion", "sourceGraph", "successorGraph",
                           "reconciliationReceipt", "protectedGraphPaths", "inventoryPaths"}
    if (set(successor) != RICH_GRAPH_KEYS or
            any(not isinstance(successor.get(key), list) for key in RICH_GRAPH_KEYS)):
        deny("PREPARE_SUCCESSOR_GRAPH")
    if (set(projection) != expected_projection or projection.get("schemaVersion") != 2 or
            projection.get("successorGraph") != source["successorGraph"] or
            projection.get("reconciliationReceipt") != source["receipt"]):
        deny("PREPARE_PROJECTION_DIVERGENCE")
    if (receipt.get("schemaVersion") != 2 or
            receipt.get("state") != "RECONCILED_NO_EFFECT" or
            receipt.get("requestSha256") != source["request"]["sha256"] or
            receipt.get("successorGraph") != source["successorGraph"] or
            receipt.get("sourceGraph") != projection.get("sourceGraph") or
            receipt.get("operationalState") != original.get("operationalState") or
            receipt.get("reconciliationId") != original.get("reconciliationId") or
            receipt.get("releaseRoot") != original.get("releaseRoot") or
            receipt.get("originalsModified") is not False or
            receipt.get("destructiveCommands") != 0):
        deny("PREPARE_RECONCILIATION_RECEIPT_DIVERGENCE")
    if original.get("sourceGraph") != projection.get("sourceGraph"):
        deny("PREPARE_RECONCILIATION_REQUEST_DIVERGENCE")
    if (not isinstance(original.get("entries"), list) or
            not isinstance(receipt.get("results"), list)):
        deny("PREPARE_RECONCILIATION_GENERATIONS")

    generation_by_release = {item["releaseId"]: item for item in request["generations"]}
    entry_by_release = {item.get("releaseId"): item for item in original["entries"]
                        if isinstance(item, dict) and isinstance(item.get("releaseId"), str)}
    result_by_release = {item.get("releaseId"): item for item in receipt["results"]
                         if isinstance(item, dict) and isinstance(item.get("releaseId"), str)}
    expected_releases = set(generation_by_release)
    if (set(entry_by_release) != expected_releases or set(result_by_release) != expected_releases or
            len(entry_by_release) != len(original["entries"]) or
            len(result_by_release) != len(receipt["results"])):
        deny("PREPARE_RECONCILIATION_GENERATIONS")

    for release, generation in generation_by_release.items():
        entry = entry_by_release[release]
        result = result_by_release[release]
        contract = _bound_json(generation["contract"], "PREPARE_CONTRACT_BINDING")
        operational = _bound_json(generation["operationalState"],
                                  "PREPARE_OPERATIONAL_BINDING")
        if (entry.get("contract") != generation["contract"] or
                entry.get("lifecycle") != generation["lifecycle"] or
                entry.get("review") != generation["review"] or
                result.get("contract") != generation["contract"] or
                result.get("lifecycleSha256") != generation["lifecycle"]["sha256"] or
                result.get("reviewSha256") != generation["review"]["sha256"] or
                result.get("result") != "HISTORICAL_EVIDENCE_ONLY" or
                contract.get("releaseId") != release or
                contract.get("targetCommit") != generation["targetCommit"] or
                operational.get("releaseId") != release or
                operational.get("targetCommit") != generation["targetCommit"] or
                operational.get("observations", {}).get("releaseGraph") !=
                source["successorGraph"] or
                any(operational.get(key) != successor.get(key) for key in RICH_GRAPH_KEYS)):
            deny("PREPARE_RECONCILIATION_GENERATION_DIVERGENCE")


def materialize(control_root: Path, custody: Path, source_commit: str,
                request_path: Path, request_sha256: str) -> dict[str, Any]:
    if not GIT_SHA1.fullmatch(source_commit):
        deny("CONTROL_SOURCE_COMMIT_FORMAT")
    request = _closed_request(request_path, request_sha256)
    _validate_reconciliation_bundle(request)
    if custody.exists() or custody.is_symlink():
        deny("PREPARE_CUSTODY_EXISTS")
    custody.mkdir(mode=0o700, parents=False)
    control = custody / "control"; control.mkdir(mode=0o700)
    preserved = custody / "preserved-evidence"; preserved.mkdir(mode=0o700)
    controls = []
    for relative in CONTROL_FILES:
        source = control_root / relative
        digest = sha256_file(source)
        if SUPPORT_MODULE.integrated_blob_sha256(control_root, source_commit, relative) != digest:
            deny("CONTROL_WORKTREE_INTEGRATED_DIVERGENCE")
        target = control / Path(relative).name
        copy_exclusive(source, target)
        if sha256_file(source) != digest or sha256_file(target) != digest:
            deny("CONTROL_SOURCE_CHANGED")
        controls.append(file_binding(target))
    root_policy = Path(request["rootPolicy"]["path"])
    policy_target = control / "deploy-artifact-roots.json"
    copy_exclusive(root_policy, policy_target)
    if sha256_file(policy_target) != request["rootPolicy"]["sha256"]:
        deny("ROOT_POLICY_COPY_DIVERGENCE")
    controls.append(file_binding(policy_target))

    plans = []
    for item in request["generations"]:
        review = Path(item["review"]["path"])
        preserved_review = preserved / f"{item['name']}-generation-review.before.private.json"
        copy_exclusive(review, preserved_review)
        if sha256_file(preserved_review) != item["review"]["sha256"]:
            deny("PREPARE_REVIEW_COPY_DIVERGENCE")
        intent = custody / f"{item['name']}-intent.private.json"
        commands = custody / f"{item['name']}-commands.private.txt"
        argv = [
            "/usr/bin/python3", "-B", str(control / "generation-retirement.py"), "prepare",
            "--contract", item["contract"]["path"], "--contract-sha256", item["contract"]["sha256"],
            "--lifecycle", item["lifecycle"]["path"], "--lifecycle-sha256", item["lifecycle"]["sha256"],
            "--operational-state", item["operationalState"]["path"],
            "--operational-state-sha256", item["operationalState"]["sha256"],
            "--root-policy", str(policy_target), "--root-policy-sha256", request["rootPolicy"]["sha256"],
            "--deployment-lock", request["deploymentLock"],
            "--intent-output", str(intent), "--commands-output", str(commands),
            "--review-output", item["review"]["path"],
            "--reviewer", item["reviewer"], "--reason", item["reason"],
        ]
        plans.append({"name": item["name"], "releaseId": item["releaseId"],
                      "targetCommit": item["targetCommit"], "argv": argv,
                      "priorReview": file_binding(preserved_review),
                      "intentOutput": str(intent), "commandsOutput": str(commands)})
    reopened_request = _closed_request(request_path, request_sha256)
    if reopened_request != request:
        deny("PREPARE_REQUEST_DRIFT")
    _validate_reconciliation_bundle(reopened_request)
    result = {"schemaVersion": 1, "state": "READY_FOR_RETIREMENT_PREPARE",
              "sourceCommit": source_commit,
              "request": {"path": str(request_path), "sha256": request_sha256},
              "controls": controls, "sourceReconciliation": request["sourceReconciliation"],
              "prepares": plans, "executionAuthorized": False}
    request_binding_readback(result)
    manifest = custody / "prepare-materialization.private.json"
    write_json_exclusive(manifest, result)
    reopened = json.loads(manifest.read_bytes())
    if reopened != result or request_binding_readback(reopened) != request_binding_readback(result):
        deny("PREPARE_MATERIALIZATION_READBACK")
    directory_fd = os.open(custody, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return {"manifest": file_binding(manifest), "prepares": plans}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--control-root", type=Path, required=True)
    parser.add_argument("--custody", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        result = materialize(args.control_root.resolve(strict=True), args.custody,
                             args.source_commit, args.request, args.request_sha256)
    except MaterializationDenied as exc:
        print(f"PREPARE_MATERIALIZATION_DENY:{exc}")
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
