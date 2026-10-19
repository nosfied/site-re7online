#!/usr/bin/env python3
"""Fail closed when canonical state drifts from the active deployment record."""

from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "docs/saas/CURRENT_STATE.json"
EXPECTED_BRANCH = "review/campaign-recovery-20260926"
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    state = read_json(STATE)
    require(state.get("schemaVersion") == 2, "schemaVersion")
    require(state.get("canonicalBranch") == EXPECTED_BRANCH, "canonicalBranch")
    require(state.get("production", {}).get("certifiedByThisFile") is False,
            "documentation cannot certify live production")

    record_path = (ROOT / state.get("activeDeploymentRecord", "")).resolve()
    require(record_path.is_relative_to(ROOT) and record_path.is_file(),
            "active deployment record")
    record = read_json(record_path)
    require(record.get("schemaVersion") in (2, 3), "deployment record schema")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment record status")

    operation_path = (ROOT / state.get("activeOperationalRecord", "")).resolve()
    require(operation_path.is_relative_to(ROOT) and operation_path.is_file(),
            "active operational record")
    operation = read_json(operation_path)
    require(operation.get("schemaVersion") == 1 and
            operation.get("operationType") == "CREDENTIAL_ROTATION" and
            operation.get("status") ==
            "OBS2_CONTINGENCY_CLOSED_SAFE_RETURN_READY_OBS1_PENDING",
            "operational record identity")
    base = operation.get("baseDeploymentRecord", {})
    require((ROOT / base.get("path", "")).resolve() == record_path and
            base.get("sha256") == sha256(record_path), "operational base record")

    production = state.get("production", {})
    require(production.get("status") == record.get("status"), "production status")
    require(production.get("promotedAtUtc") == record.get("deployedAtUtc"),
            "promotion timestamp")
    artifacts = record.get("artifacts", {})
    require(production.get("api", {}).get("entrypoint") ==
            artifacts.get("api", {}).get("entrypoint"), "API entrypoint")
    require(production.get("api", {}).get("entrySha256") ==
            artifacts.get("api", {}).get("entrySha256"), "API identity")
    require(production.get("frontend", {}).get("buildId") ==
            artifacts.get("frontend", {}).get("buildId"), "frontend identity")
    require(production.get("worker", {}).get("preserved") is True and
            artifacts.get("worker") == {"preserved": True}, "worker preservation")

    observed = operation.get("observedProcesses", {})
    for component, key in (("api", "apiPid"), ("frontend", "frontendPid"),
                           ("worker", "workerPid")):
        require(production.get(component, {}).get("observedPid") == observed.get(key) and
                isinstance(observed.get(key), int) and observed[key] > 0,
                f"{component} dated PID observation")
        require(production.get(component, {}).get("observedAtUtc") ==
                observed.get("observedAtUtc"), f"{component} observation time")
    semantics = production.get("identitySemantics", {})
    require(semantics.get("pids") ==
            "dated observational evidence; revalidate after any process restart",
            "PID observation semantics")
    require(set(semantics.get("durable", [])) == {
        "api.entrySha256", "frontend.buildId", "pm2.dumpSha256",
        "pm2.rollbackSha256"}, "durable identity fields")

    pm2 = production.get("pm2", {})
    record_pm2 = operation.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True and
            record_pm2.get("savedExactlyOnce") is True, "PM2 save")
    for key in ("dumpSha256", "rollbackSha256"):
        require(pm2.get(key) == record_pm2.get(key) and
                bool(SHA256.fullmatch(str(pm2.get(key, "")))), f"PM2 {key}")
    require(pm2.get("dumpSha256") == pm2.get("rollbackSha256"),
            "post-OBS-2 return identity")
    require(pm2.get("previousRollback") == {
        "sha256": "33e3d65e78b4e4bd27349a06e28ff125551535085e0721281f3848dece5590d1",
        "classification": "NON_EXECUTABLE_EXPOSED_SECRET",
        "disposition": "REMOVED",
    }, "previous rollback is not executable")

    csv = state.get("csvDelivery", {})
    require(csv.get("state") == "DEPLOYED_VERIFIED", "CSV state")
    record_commit = (record.get("sourceCommits") or [record.get("candidateCommit")])[-1]
    require(csv.get("candidateCommit") == record_commit, "candidate commit")
    require(csv.get("releaseManifest") == record.get("sourceReleaseManifest"),
            "release manifest")
    require(csv.get("migrationRequired") is False, "migration guard")
    require(csv.get("workerChanged") is False, "worker guard")
    require(csv.get("deploymentOrder") == record.get("deploymentOrder"),
            "deployment order")
    require(csv.get("automaticReplayForbidden") is True, "replay guard")
    require(csv.get("windowActivity") == {
        "csvPostRequests": 0,
        "automaticNonCsvPostRequests": 0,
        "imports": 0,
        "sqlStatements": 0,
        "migrations": 0,
    }, "window activity classification")
    require(csv.get("tenantNegativeIsolation") == "LIVE_VERIFIED", "tenant isolation")
    require(csv.get("durablePositiveRecovery") == "LIVE_VERIFIED",
            "durable recovery")
    require(csv.get("operationTotalsEvidence") == "NOT_RECORDED_NO_INFERENCE",
            "operation totals claim boundary")
    require(csv.get("terminalReferenceProof") ==
            "CONSUMED_AS_EXPECTED_NOT_REPEATABLE", "terminal reference proof")
    require(csv.get("terminalReentry") == "LIVE_VERIFIED", "terminal reentry")
    require(csv.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993")
    require(csv.get("demoPreview") == "COMPLETED_REFERENCE_CLEARED_LIST_RESTORED",
            "Demo terminal reentry")

    incident = state.get("credentialInspectionIncident", {})
    obs1_record = "docs/saas/releases/OBS1_META_APP_SECRET_ROTATION_2026-10-19_PREPARED.json"
    require(incident == {
        "status": "RECORDED_PRIVATELY",
        "values": "NOT_VERSIONED",
        "rotationAssessment": "PARTIAL",
        "obs2": "CONTINGENCY_CLOSED_SAFE_RETURN_READY",
        "obs1": "PREPARED_SCHEDULED_WINDOW_REQUIRED_NO_CHANGE",
        "activeRecord": state.get("activeOperationalRecord"),
        "obs1Record": obs1_record,
    }, "credential inspection incident")
    obs1_path = (ROOT / obs1_record).resolve()
    require(obs1_path.is_relative_to(ROOT) and obs1_path.is_file(),
            "OBS-1 preparation record")
    obs1 = read_json(obs1_path)
    require(obs1.get("status") ==
            "PREPARED_SCHEDULED_WINDOW_REQUIRED_NO_CHANGE" and
            obs1.get("readiness", {}).get("providerReset") == "NOT_STARTED" and
            obs1.get("readiness", {}).get("productionChange") is False,
            "OBS-1 no-change boundary")
    window = obs1.get("changeWindow", {})
    require(window.get("timezone") == "America/Fortaleza" and
            window.get("protectedBusinessHours") == {
                "days": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
                "start": "08:00",
                "end": "17:00",
                "mutationPolicy": "DENY_PROVIDER_RESET_API_RESTART_OR_PM2_SAVE",
            }, "OBS-1 protected business hours")
    require(state.get("obs1Rotation", {}).get("record") == obs1_record and
            state.get("obs1Rotation", {}).get("productionChange") is False and
            state.get("obs1Rotation", {}).get("providerReset") == "NOT_STARTED",
            "OBS-1 canonical state")
    product_map = state.get("activeProductMap", "")
    require(product_map == "docs/saas/PRODUCT_MAP_CURRENT_2026-10-19.md" and
            (ROOT / product_map).is_file(), "active product map")
    require(len(state.get("nextActions", [])) == 4, "next actions")

    convergence = state.get("branchConvergence", {})
    require(convergence.get("state") == "CONTROLLED_DIVERGENCE", "branch state")
    forbidden = set(convergence.get("forbidden", []))
    require({"force push", "destructive rebase", "blind merge into main"} <= forbidden,
            "branch destructive-operation guards")
    print("CURRENT_STATE_OK: active deployment record and durable identities agree")


if __name__ == "__main__":
    main()
