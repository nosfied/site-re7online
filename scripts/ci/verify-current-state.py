#!/usr/bin/env python3
"""Fail closed when the canonical Converta continuation contract becomes ambiguous."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "docs/saas/CURRENT_STATE.json"
EXPECTED_BRANCH = "review/campaign-recovery-20260926"
SHA_FIELDS = (
    "functionalBackendCommit",
    "functionalFrontendCommit",
    "staticPreparationCommit",
)
SHA256_FIELDS = (
    ("production.api.entrySha256", ("production", "api", "entrySha256")),
    ("production.pm2.dumpSha256", ("production", "pm2", "dumpSha256")),
    ("production.pm2.rollbackSha256", ("production", "pm2", "rollbackSha256")),
)


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")


def main() -> None:
    data = json.loads(STATE.read_text(encoding="utf-8"))
    require(data.get("schemaVersion") == 1, "schemaVersion")
    require(data.get("canonicalBranch") == EXPECTED_BRANCH, "canonicalBranch")
    require(data.get("production", {}).get("certifiedByThisFile") is False,
            "documentation cannot certify live production")
    production = data.get("production", {})
    require(production.get("status") == "DEPLOYED_VERIFIED", "production status")
    require(isinstance(production.get("api", {}).get("pid"), int) and
            production["api"]["pid"] > 0, "API PID evidence")
    require(isinstance(production.get("frontend", {}).get("pid"), int) and
            production["frontend"]["pid"] > 0, "frontend PID evidence")
    require(production.get("frontend", {}).get("buildId") == "7IRWBhOwtCfwsLkfI9S0K",
            "frontend BUILD_ID")
    worker = production.get("worker", {})
    require(isinstance(worker.get("pid"), int) and worker["pid"] > 0 and
            worker.get("preserved") is True, "worker preservation")
    semantics = production.get("processIdentitySemantics", {})
    require(semantics.get("pids") ==
            "dated observational evidence; revalidate after any process restart",
            "PID observation semantics")
    require(production.get("pm2", {}).get("savedOnce") is True, "PM2 save")

    csv = data.get("csvDelivery", {})
    require(csv.get("state") == "DEPLOYED_VERIFIED", "csv state")
    require(csv.get("migrationRequired") is False, "unexpected migration")
    require(csv.get("workerChanged") is False, "unexpected worker delta")
    require(csv.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(csv.get("automaticReplayForbidden") is True, "replay guard")
    require(csv.get("nextAllowedAction") == "OBSERVE_FIRST_LEGITIMATE_IMPORT_BY_GET_ONLY",
            "next action")
    require(csv.get("tenantNegativeIsolation") == "LIVE_VERIFIED", "tenant isolation")
    require(csv.get("durablePositiveRecovery") ==
            "LIVE_DEFERRED_UNTIL_FIRST_LEGITIMATE_IMPORT", "durable recovery")
    require(csv.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993")
    require(set(csv.get("windowMutations", {}).values()) == {0}, "window mutations")
    require(len(csv.get("liveExitCriteria", [])) >= 5, "live exit criteria")
    post_deploy = csv.get("postDeployCriteria", [])
    require(len(post_deploy) >= 6, "post-deploy criteria")
    require(any("durable positive recovery remains deferred" in item
                for item in post_deploy), "deferred positive recovery criterion")
    require(any("historical 993-row evidence remains uncorrelated" in item
                for item in post_deploy), "historical 993 criterion")
    require(not any("993-row reference totals remain internally reconciled" in item
                    for item in post_deploy), "stale 993 claim")
    for field in SHA_FIELDS:
        value = csv.get(field, "")
        require(len(value) == 40 and all(c in "0123456789abcdef" for c in value), field)
    for label, path in SHA256_FIELDS:
        value = data
        for key in path:
            value = value.get(key, {})
        require(isinstance(value, str) and len(value) == 64 and
                all(c in "0123456789abcdef" for c in value), label)

    convergence = data.get("branchConvergence", {})
    require(convergence.get("state") == "CONTROLLED_DIVERGENCE", "branch state")
    forbidden = set(convergence.get("forbidden", []))
    require({"force push", "destructive rebase", "blind merge into main"} <= forbidden,
            "branch destructive-operation guards")
    print("CURRENT_STATE_OK: CRM/CSV deployed and verified; positive live recovery deferred")


if __name__ == "__main__":
    main()
