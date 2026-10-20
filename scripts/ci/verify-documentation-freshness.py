#!/usr/bin/env python3
"""Reject contradictions on the small active documentation surface."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "docs/saas/CURRENT_STATE.json"
SAFE_RETURN = "docs/saas/releases/FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json"


def require(value: bool, reason: str) -> None:
    if not value:
        raise SystemExit(f"DOCUMENTATION_FRESHNESS_INVALID: {reason}")


state = json.loads(STATE.read_text(encoding="utf-8"))
require(state["activeOperationalRecord"] == SAFE_RETURN, "active safe return record")
require(state["production"]["pm2"]["dumpSha256"] ==
        "a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0",
        "safe PM2 dump")
require(state["contactsListRecovery"]["state"] == "STAGED_INERT_NOT_DEPLOYED",
        "contacts candidate is not live")

active = "\n".join((ROOT / path).read_text(encoding="utf-8") for path in (
    "docs/saas/CURRENT_STATE.md", "docs/saas/DOCUMENTATION_INDEX.md",
    "docs/saas/DEPLOYMENT_OPERATING_MODEL.md"))
require("20bb96ce1b79c8c358960ba18edee676b147a8343955a88784b48349f128cc4e" in active,
        "previous dump preserved as history")
require("a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0" in active,
        "current dump documented")
require("STAGED_INERT / NOT DEPLOYED" in active, "contacts status visible")
print("DOCUMENTATION_FRESHNESS_OK: active state is concise and current")

