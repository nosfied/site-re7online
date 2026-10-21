#!/usr/bin/env python3
"""Reject contradictions on the active documentation surface."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())


def require(value, reason):
    if not value:
        raise SystemExit(f"DOCUMENTATION_FRESHNESS_INVALID: {reason}")


record_value = state["activeDeploymentRecord"]
require(state["activeOperationalRecord"] == record_value,
        "active operational record")
record_path = ROOT / record_value
require(record_path.is_file(), "active deployment record exists")
record = json.loads(record_path.read_text())
require(record.get("status") == "DEPLOYED_VERIFIED", "active record deployed")
require(state["contactsListRecovery"]["state"] == "DEPLOYED_VERIFIED",
        "contacts deployed")
require(state["contactsListRecovery"]["deploymentRecord"] == record_value,
        "contacts deployment record")

active_paths = (
    "docs/saas/CURRENT_STATE.md",
    "docs/saas/DOCUMENTATION_INDEX.md",
    "docs/saas/DEPLOYMENT_OPERATING_MODEL.md",
    "docs/DEPLOY_TOPOLOGY_RE7.md",
)
active_by_path = {p: (ROOT / p).read_text() for p in active_paths}
active = "\n".join(active_by_path.values())

production = state["production"]
markers = (
    production["targetCommit"],
    production["releaseId"],
    production["api"]["stablePath"],
    production["frontend"]["stablePath"],
    production["frontend"]["buildId"],
    production["frontend"]["execMode"],
    production["pm2"]["dumpSha256"],
)
for marker in markers:
    require(marker in active, f"active marker {marker}")
for path in (
    "docs/saas/CURRENT_STATE.md",
    "docs/saas/DOCUMENTATION_INDEX.md",
    "docs/saas/DEPLOYMENT_OPERATING_MODEL.md",
):
    require(Path(record_value).name in active_by_path[path],
            f"active record link in {path}")
for stale in (
    "a correção de contatos está staged, não implantada",
    "correção da listagem de contatos continua pronta, mas ainda não implantada",
    "Release pendente",
    "LOCAL VALIDATED / NOT DEPLOYED",
    "DEPLOYMENT PENDING",
):
    require(stale not in active, f"stale active claim {stale}")
require("scripts/deploy-normal-release.sh" in active and "obsoleto" in active,
        "obsolete executor classification")
require("PR #190" in active and "cluster_mode" in active,
        "obsolete pipeline and frontend mode")
print("DOCUMENTATION_FRESHNESS_OK: active surfaces derive from CURRENT_STATE and the active deployment record")
