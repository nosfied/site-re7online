#!/usr/bin/env python3
"""Reject contradictions on the active documentation surface."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
def require(value, reason):
    if not value: raise SystemExit(f"DOCUMENTATION_FRESHNESS_INVALID: {reason}")

require(state["activeOperationalRecord"] == "docs/saas/releases/FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json", "active record")
require(state["contactsListRecovery"]["state"] == "STAGED_INERT_NOT_DEPLOYED", "candidate not live")
active = "\n".join((ROOT / p).read_text() for p in (
    "docs/saas/CURRENT_STATE.md", "docs/saas/DOCUMENTATION_INDEX.md", "docs/saas/DEPLOYMENT_OPERATING_MODEL.md"))
for marker in (
    "20bb96ce1b79c8c358960ba18edee676b147a8343955a88784b48349f128cc4e",
    "a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0",
    "STAGED_INERT / NOT DEPLOYED", "scripts/deploy-normal-release.sh"):
    require(marker in active, f"active marker {marker}")
require("Deploy V2 histórico" in active or "Deploy V2`" in active, "Deploy V2 historical classification")
print("DOCUMENTATION_FRESHNESS_OK: one normal path and historical evidence are explicit")
