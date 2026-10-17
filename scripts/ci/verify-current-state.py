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


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")


def main() -> None:
    data = json.loads(STATE.read_text(encoding="utf-8"))
    require(data.get("schemaVersion") == 1, "schemaVersion")
    require(data.get("canonicalBranch") == EXPECTED_BRANCH, "canonicalBranch")
    require(data.get("production", {}).get("certifiedByThisFile") is False,
            "documentation cannot certify live production")
    require(data.get("production", {}).get("status") == "LIVE_REVALIDATION_REQUIRED",
            "live state must remain explicitly unverified until a VPS receipt updates it")

    csv = data.get("csvDelivery", {})
    require(csv.get("state") == "LOCAL_VALIDATED_NOT_DEPLOYED", "csv state")
    require(csv.get("migrationRequired") is False, "unexpected migration")
    require(csv.get("workerChanged") is False, "unexpected worker delta")
    require(csv.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(csv.get("automaticReplayForbidden") is True, "replay guard")
    require(csv.get("nextAllowedAction") == "READ_ONLY_LIVE_PREFLIGHT", "next action")
    require(len(csv.get("liveExitCriteria", [])) >= 5, "live exit criteria")
    require(len(csv.get("postDeployCriteria", [])) >= 6, "post-deploy criteria")
    for field in SHA_FIELDS:
        value = csv.get(field, "")
        require(len(value) == 40 and all(c in "0123456789abcdef" for c in value), field)

    convergence = data.get("branchConvergence", {})
    require(convergence.get("state") == "CONTROLLED_DIVERGENCE", "branch state")
    forbidden = set(convergence.get("forbidden", []))
    require({"force push", "destructive rebase", "blind merge into main"} <= forbidden,
            "branch destructive-operation guards")
    print("CURRENT_STATE_OK: live revalidation required; CSV remains fail-closed")


if __name__ == "__main__":
    main()
