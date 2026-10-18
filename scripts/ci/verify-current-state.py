#!/usr/bin/env python3
"""Fail closed when canonical state drifts from the active deployment record."""

from __future__ import annotations

import json
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
    require(record.get("schemaVersion") == 2, "deployment record schema")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment record status")

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

    observed = record.get("observedProcesses", {})
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
    record_pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True and
            record_pm2.get("savedExactlyOnce") is True, "PM2 save")
    for key in ("dumpSha256", "rollbackSha256"):
        require(pm2.get(key) == record_pm2.get(key) and
                bool(SHA256.fullmatch(str(pm2.get(key, "")))), f"PM2 {key}")

    csv = state.get("csvDelivery", {})
    require(csv.get("state") == "DEPLOYED_VERIFIED", "CSV state")
    require(csv.get("candidateCommit") == record.get("candidateCommit"),
            "candidate commit")
    require(csv.get("releaseManifest") == record.get("sourceReleaseManifest"),
            "release manifest")
    require(csv.get("migrationRequired") is False, "migration guard")
    require(csv.get("workerChanged") is False, "worker guard")
    require(csv.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(csv.get("automaticReplayForbidden") is True, "replay guard")
    require(csv.get("windowActivity") == {
        "csvPostRequests": 0,
        "automaticNonCsvPostRequests": 1,
        "imports": 0,
        "sqlStatements": 0,
        "migrations": 0,
    }, "window activity classification")
    require(csv.get("tenantNegativeIsolation") == "LIVE_VERIFIED", "tenant isolation")
    require(csv.get("durablePositiveRecovery") ==
            "LIVE_DEFERRED_UNTIL_FIRST_LEGITIMATE_IMPORT", "durable recovery")
    require(csv.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993")
    require(csv.get("demoPreview") == "PENDING_WITHOUT_IMPORT_CONFIRMATION",
            "Demo preview")

    incident = state.get("credentialInspectionIncident", {})
    require(incident == {
        "status": "RECORDED_PRIVATELY",
        "values": "NOT_VERSIONED",
        "rotationAssessment": "PENDING",
    }, "credential inspection incident")
    require(len(state.get("nextActions", [])) == 2, "next actions")

    convergence = state.get("branchConvergence", {})
    require(convergence.get("state") == "CONTROLLED_DIVERGENCE", "branch state")
    forbidden = set(convergence.get("forbidden", []))
    require({"force push", "destructive rebase", "blind merge into main"} <= forbidden,
            "branch destructive-operation guards")
    print("CURRENT_STATE_OK: active deployment record and durable identities agree")


if __name__ == "__main__":
    main()
