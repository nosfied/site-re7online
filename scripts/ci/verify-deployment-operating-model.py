#!/usr/bin/env python3
"""Validate the canonical immutable-release operating model."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def require(value, reason):
    if not value:
        raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")


model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text()
for marker in (
    "única fonte de instrução operacional vigente",
    "build ocorre fora da VPS",
    "/opt/re7online/releases",
    "/opt/re7online/current/api",
    "/opt/re7online/current/frontend",
    "fork_mode",
    "uma instância",
    "GET/read-only",
    "pm2 save",
    "scripts/deploy-normal-release.sh",
    "pipeline experimental da PR #190",
    "cluster_mode",
    "Metadados de introspecção do PM2 nunca são uma definição executável",
    "pm2-definition-control.py",
):
    require(marker in model, f"operating model marker {marker}")
require("não utilizáveis" in model, "obsolete mechanisms")
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
require(state["canonicalTopology"] == {
    "build": "EXTERNAL_LINUX_X86_64_NODE_20_20_0_NPM_10_8_2",
    "releaseModel": "IMMUTABLE_VERSIONED_RELEASE",
    "promotionOrder": ["api", "frontend", "worker_when_impacted"],
    "frontendMode": "FORK_MODE_SINGLE_INSTANCE_DIRECT_NEXT",
    "smoke": "GET_ONLY",
    "rollback": "RESTORE_SYMLINKS_AND_FULL_PM2_DEFINITIONS",
}, "canonical topology")
require(state["historicalDeployV2"]["status"] ==
        "FROZEN_FUTURE_IMPROVEMENT_NOT_RELEASE_GATE", "Deploy V2 frozen")
print("DEPLOYMENT_OPERATING_MODEL_OK: immutable fixed-path release is the sole active route")
