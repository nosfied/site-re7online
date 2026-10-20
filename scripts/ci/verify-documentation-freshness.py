#!/usr/bin/env python3
"""Reject contradictions on the active documentation surface."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())


def require(value, reason):
    if not value:
        raise SystemExit(f"DOCUMENTATION_FRESHNESS_INVALID: {reason}")


record = "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json"
require(state["activeDeploymentRecord"] == record, "active deployment record")
require(state["activeOperationalRecord"] == record, "active operational record")
require(state["contactsListRecovery"]["state"] == "DEPLOYED_VERIFIED",
        "contacts deployed")
active_paths = (
    "docs/saas/CURRENT_STATE.md",
    "docs/saas/DOCUMENTATION_INDEX.md",
    "docs/saas/DEPLOYMENT_OPERATING_MODEL.md",
    "docs/DEPLOY_TOPOLOGY_RE7.md",
)
active = "\n".join((ROOT / p).read_text() for p in active_paths)
for marker in (
    "f5028de1e530666623dcc95519e744350671cb02",
    "immutable-f5028de1-20261020T181603Z",
    "/opt/re7online/current/api",
    "/opt/re7online/current/frontend",
    "fork_mode",
    "ba18a647d15fdc176ce72a81b229ae1c0a821d69196c989ca78c12aeac65a0e2",
):
    require(marker in active, f"active marker {marker}")
for stale in (
    "a correção de contatos está staged, não implantada",
    "correção da listagem de contatos continua pronta, mas ainda não implantada",
    "Release pendente",
):
    require(stale not in active, f"stale active claim {stale}")
require("scripts/deploy-normal-release.sh" in active and "obsoleto" in active,
        "obsolete executor classification")
require("PR #190" in active and "cluster_mode" in active,
        "obsolete pipeline and frontend mode")
print("DOCUMENTATION_FRESHNESS_OK: active surfaces describe the deployed immutable release")
