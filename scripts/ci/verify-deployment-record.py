#!/usr/bin/env python3
"""Validate a sanitized deployment record against repository contracts."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {"tenantId", "operationUuid", "token", "authorization", "cookie"}


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"DEPLOYMENT_RECORD_INVALID: {reason}")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        result = set(value)
        for child in value.values():
            result.update(walk_keys(child))
        return result
    if isinstance(value, list):
        result: set[str] = set()
        for child in value:
            result.update(walk_keys(child))
        return result
    return set()


def verify_frontend_only(record_path: Path, record: dict) -> None:
    require(record.get("releaseType") == "FRONTEND_ONLY", "frontend release type")
    require(record.get("deploymentOrder") == ["frontend"], "frontend deployment order")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized record")

    source_path = (ROOT / record.get("sourceReleaseManifest", "")).resolve()
    require(source_path.is_relative_to(ROOT) and source_path.is_file(), "source manifest")
    source = read_json(source_path)
    require(source.get("statusAtCreation") == "LOCAL_VALIDATED_NOT_DEPLOYED",
            "source creation status")
    require(source.get("deploymentRecord") == record_path.relative_to(ROOT).as_posix(),
            "source deployment record link")
    require(source.get("sourceCommits") == record.get("sourceCommits") and
            len(record.get("sourceCommits", [])) == 2,
            "source commit chain")
    require(source.get("deploymentOrder") == ["frontend"], "source deployment order")
    require(source.get("apiChanged") is False and source.get("workerChanged") is False,
            "API and worker preservation")
    require(source.get("migrationRequired") is False and source.get("sqlRequired") is False,
            "database guards")
    require(source.get("csvPostForbidden") is True and
            source.get("automaticReplayForbidden") is True, "CSV mutation guards")
    runtime_sources = source.get("runtimeSources", [])
    require([x.get("path") for x in runtime_sources] == [
        "src/app/app/crm/page.tsx", "src/lib/crmImportRecovery.ts"
    ], "runtime source allowlist")
    for item in runtime_sources:
        require(bool(SHA256.fullmatch(item.get("sha256", ""))) and
                bool(re.fullmatch(r"[0-9a-f]{40}", item.get("gitBlobSha", ""))) and
                item.get("bytes", 0) > 0, "runtime source identity")

    base = record.get("baseDeploymentRecord", {})
    base_path = (ROOT / base.get("path", "")).resolve()
    require(base_path.is_relative_to(ROOT) and base_path.is_file(), "base deployment record")
    require(sha256(base_path) == base.get("sha256"), "base deployment record hash")

    artifacts = record.get("artifacts", {})
    api = artifacts.get("api", {})
    require(api.get("preserved") is True and
            bool(SHA256.fullmatch(api.get("entrySha256", ""))) and
            bool(api.get("entrypoint")), "preserved API identity")
    require(artifacts.get("worker") == {"preserved": True}, "worker preservation")
    frontend = artifacts.get("frontend", {})
    for field in ("packageSha256", "manifestSha256", "indexSha256",
                  "launcherSha256", "controlledEntrySha256", "controlSha256"):
        require(bool(SHA256.fullmatch(frontend.get(field, ""))),
                f"invalid frontend.{field}")
    require(frontend.get("reproducible") is True and
            frontend.get("independentExtractionEqual") is True and
            frontend.get("testModulesInRuntime") is False and
            frontend.get("indexEntries", 0) > 0 and frontend.get("packageBytes", 0) > 0,
            "frontend package contract")
    require(bool(frontend.get("buildId")), "frontend buildId")

    verification = record.get("frontendVerification", {})
    require(verification.get("result") == "FRONTEND_CANDIDATE_STABLE" and
            verification.get("identityStable") is True and
            verification.get("healthStable") is True and
            verification.get("cwdLauncherControlNonceJournalVerified") is True and
            verification.get("rollbackExecuted") is False,
            "frontend verification")
    samples = verification.get("samples", [])
    require(len(samples) == 3, "frontend sample count")
    for number, sample in enumerate(samples, 1):
        require(sample.get("sample") == number and sample.get("result") == "PASS" and
                sample.get("fromUtc") and sample.get("toUtc"),
                f"frontend sample {number}")
    require(verification.get("journalEvents") == [
        "parent", "application_identity", "application_released"
    ], "launcher journal events")
    require(verification.get("loginInboxCrmHttp200") is True and
            verification.get("publicAssets") == {"checked": 13, "http200": 13, "http404": 0},
            "frontend HTTP verification")

    functional = record.get("functionalVerification", {})
    require(functional.get("method") == "GET_ONLY_REENTRY" and
            functional.get("terminalStateObserved") == "COMPLETED" and
            functional.get("terminalReferenceRemoved") is True and
            functional.get("otherTenantOrUserReferencesModified") is False and
            functional.get("modalOpened") is False and
            functional.get("pageLoaded") == 1 and
            functional.get("activeFiltersPreserved") is True and
            functional.get("awayAndBackReentryObserved") is True and
            functional.get("csvPostRequests") == 0,
            "terminal reentry behavior")
    require(functional.get("operationTotalsPersistedVerified") is False and
            functional.get("operationTotalsEvidence") == "NOT_RECORDED_NO_INFERENCE" and
            functional.get("durablePositiveRecovery") == "LIVE_VERIFIED" and
            functional.get("terminalReferenceProof") ==
            "CONSUMED_AS_EXPECTED_NOT_REPEATABLE" and
            functional.get("proofRepetition") ==
            "NOT_REPEATED_REFERENCE_CORRECTLY_CONSUMED",
            "durable recovery and totals claim boundary")
    for digest in functional.get("privateEvidenceSha256", {}).values():
        require(bool(SHA256.fullmatch(digest)), "private evidence hash")

    require(record.get("windowMutations") == {
        "csvPostRequests": 0, "imports": 0, "sqlStatements": 0,
        "migrations": 0, "apiChanges": 0, "workerChanges": 0,
    }, "window mutation guards")
    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True, "PM2 save count")
    for field in ("dumpSha256", "rollbackSha256", "finalizationReportSha256"):
        require(bool(SHA256.fullmatch(pm2.get(field, ""))), f"PM2 {field}")

    observed = record.get("observedProcesses", {})
    require(observed.get("frontendPid") == verification.get("pid") and
            all(isinstance(observed.get(k), int) and observed[k] > 0
                for k in ("apiPid", "frontendPid", "workerPid")),
            "dated process observations")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record selection")
    require(state.get("production", {}).get("api", {}).get("entrySha256") ==
            api.get("entrySha256"), "current API identity")
    require(state.get("production", {}).get("frontend", {}).get("buildId") ==
            frontend.get("buildId"), "current frontend identity")
    operation_path_value = state.get("activeOperationalRecord")
    if operation_path_value:
        operation_path = (ROOT / operation_path_value).resolve()
        require(operation_path.is_relative_to(ROOT) and operation_path.is_file(),
                "active operational record")
        operation = read_json(operation_path)
        current_pm2 = operation.get("production", {}).get(
            "pm2", operation.get("pm2", {})
        )
    else:
        current_pm2 = pm2
    state_pm2 = state.get("production", {}).get("pm2", {})
    require(state_pm2.get("dumpSha256") == current_pm2.get("dumpSha256"),
            "current PM2 dump")
    expected_previous = (
        current_pm2.get("previousRollbackSha256")
        or current_pm2.get("rollbackSha256")
    )
    require(
        state_pm2.get("previousRollbackSha256", state_pm2.get("rollbackSha256"))
        == expected_previous,
        "current rollback lineage",
    )
    print("DEPLOYMENT_RECORD_OK: frontend-only identities, samples and terminal reentry agree")


def main() -> None:
    require(len(sys.argv) == 2, "usage: verify-deployment-record.py RECORD")
    record_path = (ROOT / sys.argv[1]).resolve()
    require(record_path.is_relative_to(ROOT) and record_path.is_file(),
            "record outside repository or missing")
    record = read_json(record_path)

    if record.get("schemaVersion") == 3:
        verify_frontend_only(record_path, record)
        return

    require(record.get("schemaVersion") == 2, "schemaVersion")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment status")
    require(record.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized record")

    source_path = (ROOT / record.get("sourceReleaseManifest", "")).resolve()
    require(source_path.is_relative_to(ROOT) and source_path.is_file(), "source manifest")
    source = read_json(source_path)
    require(source.get("status") is None and bool(source.get("statusAtCreation")),
            "source status must be historical")
    require(source.get("deploymentRecord") == record_path.relative_to(ROOT).as_posix(),
            "source deployment record link")
    require(record.get("candidateCommit") == source.get("candidateCommit"),
            "candidate commit drift")
    require(record.get("deploymentOrder") == source.get("deploymentOrder"),
            "source deployment order drift")
    require(source.get("migrationRequired") is False, "migration guard")
    require(source.get("workerChanged") is False, "worker guard")
    require(source.get("automaticReplayForbidden") is True, "replay guard")

    artifacts = record.get("artifacts", {})
    for component, field in (
        ("api", "packageSha256"), ("api", "manifestSha256"),
        ("api", "entrySha256"), ("frontend", "packageSha256"),
        ("frontend", "manifestSha256"), ("frontend", "launcherSha256"),
        ("frontend", "controlledEntrySha256"), ("frontend", "controlSha256"),
    ):
        require(bool(SHA256.fullmatch(artifacts.get(component, {}).get(field, ""))),
                f"invalid {component}.{field}")
    require(bool(artifacts.get("api", {}).get("entrypoint")), "API entrypoint")
    require(bool(artifacts.get("frontend", {}).get("buildId")), "frontend buildId")
    require(artifacts.get("worker") == {"preserved": True}, "worker preservation")

    api = record.get("apiVerification", {})
    require(api.get("result") == "API_CANDIDATE_STABLE", "API verification")
    require(api.get("rollbackExecuted") is False, "unexpected API rollback")
    require(len(api.get("samples", [])) == 3, "API sample count")
    for number, sample in enumerate(api["samples"], 1):
        require(sample.get("sample") == number and sample.get("result") == "PASS",
                f"API sample {number}")
        require(sample.get("candidateOwnsListeningSocket") is True and
                sample.get("listeningPort") == 3001, f"API socket sample {number}")
        require(sample.get("localHealthHttp") == 200 and
                sample.get("publicHealthHttp") == 200, f"API health sample {number}")
        require(sample.get("pid") == api.get("pid") and
                sample.get("startTicks") == api.get("startTicks"),
                f"API identity sample {number}")
    socket = api.get("socketBinding", {})
    require(socket.get("pid") == api.get("pid") and socket.get("port") == 3001 and
            socket.get("samples") == 3 and socket.get("result") == "PASS",
            "PID/socket/port binding")

    frontend = record.get("frontendVerification", {})
    require(frontend.get("result") == "FRONTEND_CANDIDATE_STABLE",
            "frontend verification")
    require(frontend.get("samples") == 3 and frontend.get("identityStable") is True and
            frontend.get("healthStable") is True, "frontend samples")
    require(frontend.get("rollbackExecuted") is False, "unexpected frontend rollback")

    get_validation = record.get("getValidation", {})
    require(get_validation.get("method") == "GET_ONLY", "GET validation method")
    nonexistent = get_validation.get("nonexistentOperation", {})
    require(nonexistent == {
        "httpStatus": 200,
        "state": "UNKNOWN",
        "progress": None,
        "summary": None,
        "total": None,
        "crossTenantMetadataPresent": False,
        "result": "PASS",
    }, "nonexistent GET contract")
    cross = get_validation.get("crossTenant", {})
    require(cross.get("evidenceMode") == "REUSED_LIVE_PROOF" and
            cross.get("executedInThisWindow") is False, "reused cross-tenant proof")
    prior_path = (ROOT / cross.get("sourceRecord", "")).resolve()
    require(prior_path.is_relative_to(ROOT) and prior_path.is_file(),
            "cross-tenant source record")
    require(sha256(prior_path) == cross.get("sourceRecordSha256"),
            "cross-tenant source record hash")
    require(cross.get("result") == "HTTP_200_UNKNOWN_NO_CROSS_TENANT_DATA",
            "cross-tenant result")

    posts = record.get("httpPostObservations", {})
    require(posts.get("csvPostRequests") == 0, "CSV POST count")
    automatic = posts.get("automaticNonCsvPostRequests", [])
    require(len(automatic) == 1 and
            automatic[0].get("classification") == "AUTOMATIC_NON_CSV_POST" and
            automatic[0].get("component") == "Inbox" and
            automatic[0].get("path") == "/agent-api/app/inbox/events" and
            automatic[0].get("httpStatus") == 200,
            "automatic non-CSV POST classification")
    require(bool(SHA256.fullmatch(posts.get("privateNetworkEvidenceSha256", ""))),
            "private network evidence hash")

    require(record.get("windowMutations") == {
        "csvPostRequests": 0, "imports": 0, "sqlStatements": 0, "migrations": 0,
    }, "window data mutations")
    require(record.get("durablePositiveRecovery") ==
            "LIVE_DEFERRED_UNTIL_FIRST_LEGITIMATE_IMPORT_GET_ONLY",
            "positive recovery disposition")
    require(record.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993 disposition")

    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True, "PM2 save count")
    for field in ("dumpSha256", "rollbackSha256", "finalizationReportSha256"):
        require(bool(SHA256.fullmatch(pm2.get(field, ""))), f"PM2 {field}")

    observed = record.get("observedProcesses", {})
    require(observed.get("apiPid") == api.get("pid"), "observed API PID")
    require(observed.get("frontendPid") == frontend.get("pid"), "observed frontend PID")
    require(isinstance(observed.get("workerPid"), int) and observed["workerPid"] > 0,
            "observed worker PID")

    require(record.get("credentialInspectionIncident") == {
        "status": "RECORDED_PRIVATELY",
        "values": "NOT_VERSIONED",
        "rotationAssessment": "PENDING",
    }, "credential incident disposition")
    require(record.get("nextActions") == [
        "SANITIZED_CREDENTIAL_EXPOSURE_ASSESSMENT",
        "DEMO_TENANT_MANUAL_PREVIEW_WITHOUT_IMPORT_CONFIRMATION",
    ], "next actions")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record selection")
    require(state.get("production", {}).get("status") == record.get("status"),
            "current state status")
    require(state.get("production", {}).get("api", {}).get("entrySha256") ==
            artifacts["api"]["entrySha256"], "current API identity")
    require(state.get("production", {}).get("frontend", {}).get("buildId") ==
            artifacts["frontend"]["buildId"], "current frontend identity")
    require(state.get("production", {}).get("pm2", {}).get("dumpSha256") ==
            pm2["dumpSha256"], "current PM2 dump")
    require(state.get("production", {}).get("pm2", {}).get("rollbackSha256") ==
            pm2["rollbackSha256"], "current rollback")

    print("DEPLOYMENT_RECORD_OK: active identities, samples, GET proofs and POST classes agree")


if __name__ == "__main__":
    main()
