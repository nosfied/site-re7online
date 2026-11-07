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
PRIOR_EVIDENCE_KEYS = {"intent", "receipt", "journal"}
LEGACY_P00_BATCH_ID = "p00-legacy-installed-releases-20261107-v1"
LEGACY_P00_RELEASES = {
    "immutable-ec2a9fde-vps-20261024T162005Z":
        "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z",
    "immutable-ef7db111-vps-20261024T174000Z":
        "/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z",
    "immutable-3630e16-vps-20261024T195842Z":
        "/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z",
    "immutable-d7de6453-vps-20261024T221500Z":
        "/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z",
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
    schema = value.get("schemaVersion") if isinstance(value, dict) else None
    required = ({"schemaVersion", "deploymentLock", "rootPolicy", "sourceReconciliation",
                 "generations"} if schema == 1 else
                {"schemaVersion", "deploymentLock", "rootPolicy", "sourceQualification",
                 "generations"} if schema == 2 else set())
    if not isinstance(value, dict) or not required or set(value) != required:
        deny("PREPARE_REQUEST_SCHEMA")
    lock = Path(str(value.get("deploymentLock", "")))
    if not lock.is_absolute() or lock != Path(os.path.normpath(str(lock))):
        deny("PREPARE_DEPLOYMENT_LOCK")
    if schema == 1:
        source = value.get("sourceReconciliation")
        if not isinstance(source, dict) or set(source) != {
                "request", "successorGraph", "projection", "receipt"}:
            deny("PREPARE_RECONCILIATION_BINDINGS")
    else:
        source = value.get("sourceQualification")
        if not isinstance(source, dict) or set(source) != {"proof"}:
            deny("PREPARE_QUALIFICATION_BINDING")
    generations = value.get("generations")
    expected_count = 4 if schema == 2 else None
    if (not isinstance(generations, list) or
            (schema == 1 and len(generations) not in {1, 2}) or
            (schema == 2 and len(generations) != expected_count)):
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
    if schema == 2 and releases != set(LEGACY_P00_RELEASES):
        deny("PREPARE_QUALIFICATION_GENERATIONS")
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


def _bound_file(binding: Any, predicate: str) -> dict[str, str]:
    if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
            not isinstance(binding.get("path"), str)):
        deny(predicate)
    require_sha256(binding.get("sha256"), predicate)
    path = Path(binding["path"])
    SUPPORT_MODULE.regular_identity(path, predicate)
    if sha256_file(path) != binding["sha256"]:
        deny(predicate)
    return {"path": str(path), "sha256": binding["sha256"]}


def _prior_evidence(entry: dict[str, Any], result: dict[str, Any]) -> dict[str, dict[str, str]]:
    closure = entry.get("closure")
    if result.get("closure") != closure:
        deny("PREPARE_RECONCILIATION_CLOSURE_DIVERGENCE")
    if (not isinstance(closure, dict) or set(closure) != {"kind", "chain"} or
            closure.get("kind") != "CANONICAL_RETIREMENT" or
            not isinstance(closure.get("chain"), list) or not closure["chain"]):
        deny("PREPARE_RECONCILIATION_CLOSURE")
    normalized = []
    for link in closure["chain"]:
        if not isinstance(link, dict) or set(link) != PRIOR_EVIDENCE_KEYS:
            deny("PREPARE_RECONCILIATION_CLOSURE")
        normalized.append({key: _bound_file(link[key],
                           f"PREPARE_PRIOR_{key.upper()}_BINDING")
                           for key in ("intent", "receipt", "journal")})
    return normalized[-1]


def _validate_reconciliation_bundle(
        request: dict[str, Any]) -> dict[str, dict[str, dict[str, str]]]:
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

    prior_by_release = {}
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
        prior_by_release[release] = _prior_evidence(entry, result)
    return prior_by_release


def _validate_legacy_p00_qualification(request: dict[str, Any]) -> None:
    """Bind the closed four-release qualification to canonical prepare inputs.

    Contracts and lifecycles remain one-per-generation.  This adapter only proves
    that all four were derived from the same authenticated qualification and the
    same live graph; it does not create an authorization or execute prepare.
    """
    proof_binding = request["sourceQualification"]["proof"]
    proof = _bound_json(proof_binding, "PREPARE_QUALIFICATION_PROOF")
    expected_proof_keys = {
        "schemaVersion", "kind", "batchId", "sourceGraph",
        "canonicalVerifierSha256", "chainEvidence", "releases",
        "totalAllocatedBytes", "capacityBudget", "authorizationGranted", "executionPermitted",
        "destructiveCommands", "nextRequiredStep",
    }
    if (set(proof) != expected_proof_keys or proof.get("schemaVersion") != 1 or
            proof.get("kind") != "LEGACY_P00_INSTALLED_BATCH_QUALIFICATION" or
            proof.get("batchId") != LEGACY_P00_BATCH_ID or
            proof.get("authorizationGranted") is not False or
            proof.get("executionPermitted") is not False or
            proof.get("destructiveCommands") != 0 or
            proof.get("nextRequiredStep") != "CANONICAL_CONTRACT_LIFECYCLE_MATERIALIZATION" or
            not isinstance(proof.get("chainEvidence"), list) or
            not proof["chainEvidence"]):
        deny("PREPARE_QUALIFICATION_PROOF")
    source_graph = _bound_json(proof.get("sourceGraph"),
                               "PREPARE_QUALIFICATION_GRAPH")
    graph_keys = {"activeReleases", "rollbackReleases", "transitiveReturnReleases",
                  "candidateReleases", "installedVerifiedReleases", "supersededCandidates"}
    if (not graph_keys.issubset(source_graph) or
            any(not isinstance(source_graph.get(key), list) for key in graph_keys) or
            ("immediateRollbackReleases" in source_graph and
             not isinstance(source_graph["immediateRollbackReleases"], dict))):
        deny("PREPARE_QUALIFICATION_GRAPH")
    releases = proof.get("releases")
    if not isinstance(releases, list) or len(releases) != 4:
        deny("PREPARE_QUALIFICATION_GENERATIONS")
    proof_by_release = {item.get("releaseId"): item for item in releases
                        if isinstance(item, dict)}
    if (set(proof_by_release) != set(LEGACY_P00_RELEASES) or
            len(proof_by_release) != len(releases) or
            proof.get("totalAllocatedBytes") !=
            sum(item.get("allocatedBytes", -1) for item in releases)):
        deny("PREPARE_QUALIFICATION_GENERATIONS")
    total_allocated = proof["totalAllocatedBytes"]
    capacity = proof.get("capacityBudget")
    if capacity != {
            "packageExtractionPeakBytes": max(item["allocatedBytes"] for item in releases),
            "custodyAndClosureReserveBytes": 16 * 1024 * 1024,
            "grossRecoverableBytes": total_allocated,
            "netRecoverableBytes": total_allocated - 16 * 1024 * 1024,
            }:
        deny("PREPARE_QUALIFICATION_CAPACITY")
    expected_dependency = f"legacy_p00_qualification:{proof_binding['sha256']}"
    for generation in request["generations"]:
        release = generation["releaseId"]
        qualified = proof_by_release[release]
        if (qualified.get("classification") != "RETIREMENT_READY" or
                qualified.get("targetCommit") != generation["targetCommit"] or
                any(not isinstance(qualified.get(key), int) or qualified[key] < 0
                    for key in ("sizeBytes", "allocatedBytes", "inodes"))):
            deny("PREPARE_QUALIFICATION_RELEASE")
        contract = _bound_json(generation["contract"], "PREPARE_CONTRACT_BINDING")
        lifecycle = _bound_json(generation["lifecycle"], "PREPARE_LIFECYCLE_BINDING")
        operational = _bound_json(generation["operationalState"],
                                  "PREPARE_OPERATIONAL_BINDING")
        review = _bound_json(generation["review"], "PREPARE_REVIEW_BINDING")
        artifacts = contract.get("artifacts")
        if (contract.get("generationId") != release or
                contract.get("releaseId") != release or
                contract.get("targetCommit") != generation["targetCommit"] or
                not isinstance(artifacts, list) or len(artifacts) != 2):
            deny("PREPARE_QUALIFICATION_CONTRACT")
        by_class = {item.get("class"): item for item in artifacts if isinstance(item, dict)}
        if set(by_class) != {"EVIDENCE_PRESERVE", "RELEASE_RUNTIME"}:
            deny("PREPARE_QUALIFICATION_CONTRACT")
        release_artifact = by_class["RELEASE_RUNTIME"]
        lifecycle_artifact = by_class["EVIDENCE_PRESERVE"]
        if (release_artifact.get("path") != qualified["path"] or
                release_artifact.get("releaseId") != release or
                release_artifact.get("targetCommit") != generation["targetCommit"] or
                any(release_artifact.get(key) != qualified[key]
                    for key in ("sizeBytes", "allocatedBytes", "inodes",
                                "structuralSha256")) or
                expected_dependency not in release_artifact.get("dependencies", []) or
                lifecycle_artifact.get("path") != generation["lifecycle"]["path"] or
                lifecycle_artifact.get("releaseId") != release or
                lifecycle_artifact.get("targetCommit") != generation["targetCommit"] or
                lifecycle_artifact.get("expectedType") != "regular_file" or
                lifecycle_artifact.get("state") != "ACTIVE_DEPENDENCY" or
                lifecycle_artifact.get("retirableOn") != "NEVER_AUTOMATIC" or
                lifecycle_artifact.get("digest") != {
                    "sha256": generation["lifecycle"]["sha256"]} or
                expected_dependency not in lifecycle_artifact.get("dependencies", [])):
            deny("PREPARE_QUALIFICATION_CONTRACT")
        if (lifecycle.get("schemaVersion") != 1 or
                lifecycle.get("generationId") != release or
                lifecycle.get("targetCommit") != generation["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("PREPARE_QUALIFICATION_LIFECYCLE")
        if (review.get("schemaVersion") != 2 or
                review.get("generationId") != release or
                review.get("lifecycleSha256") != generation["lifecycle"]["sha256"] or
                review.get("state") != "RETIREMENT_READY" or
                review.get("evidenceSha256") != proof_binding["sha256"]):
            deny("PREPARE_QUALIFICATION_REVIEW")
        observations = operational.get("observations", {})
        expected_release_path = str(Path(operational.get("canonicalRoots", {}).get(
            "releases", "")) / release)
        if (operational.get("releaseId") != release or
                operational.get("targetCommit") != generation["targetCommit"] or
                qualified.get("path") != expected_release_path or
                observations.get("releaseGraph") != proof["sourceGraph"] or
                not isinstance(observations.get("dependencies"), dict) or
                any(operational.get(key) != source_graph.get(key) for key in graph_keys) or
                any(release in operational.get(key, []) for key in
                    ("activeReleases", "rollbackReleases", "transitiveReturnReleases",
                     "candidateReleases")) or
                release not in operational.get("installedVerifiedReleases", [])):
            deny("PREPARE_QUALIFICATION_OPERATIONAL")


def materialize(control_root: Path, custody: Path, source_commit: str,
                request_path: Path, request_sha256: str) -> dict[str, Any]:
    if not GIT_SHA1.fullmatch(source_commit):
        deny("CONTROL_SOURCE_COMMIT_FORMAT")
    request = _closed_request(request_path, request_sha256)
    legacy_qualification = request["schemaVersion"] == 2
    if legacy_qualification:
        _validate_legacy_p00_qualification(request)
        prior_by_release = {}
    else:
        prior_by_release = _validate_reconciliation_bundle(request)
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
        prior = prior_by_release.get(item["releaseId"])
        if prior is not None:
            for name in ("intent", "receipt", "journal"):
                argv.extend([f"--prior-{name}", prior[name]["path"],
                             f"--prior-{name}-sha256", prior[name]["sha256"]])
        plan = {"name": item["name"], "releaseId": item["releaseId"],
                "targetCommit": item["targetCommit"], "argv": argv,
                "priorReview": file_binding(preserved_review),
                "intentOutput": str(intent), "commandsOutput": str(commands)}
        if prior is not None:
            plan["priorEvidence"] = prior
        plans.append(plan)
    reopened_request = _closed_request(request_path, request_sha256)
    if reopened_request != request:
        deny("PREPARE_REQUEST_DRIFT")
    if legacy_qualification:
        _validate_legacy_p00_qualification(reopened_request)
    elif _validate_reconciliation_bundle(reopened_request) != prior_by_release:
        deny("PREPARE_RECONCILIATION_EVIDENCE_DRIFT")
    result = {"schemaVersion": 1, "state": "READY_FOR_RETIREMENT_PREPARE",
              "sourceCommit": source_commit,
              "request": {"path": str(request_path), "sha256": request_sha256},
              "controls": controls,
              "prepares": plans, "executionAuthorized": False}
    if legacy_qualification:
        result["sourceQualification"] = request["sourceQualification"]
    else:
        result["sourceReconciliation"] = request["sourceReconciliation"]
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
