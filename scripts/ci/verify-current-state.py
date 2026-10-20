#!/usr/bin/env python3
"""Validate the concise canonical state without treating dated PIDs as identity."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{64}")


def require(value: bool, reason: str) -> None:
    if not value:
        raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")


state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text(encoding="utf-8"))
require(state["schemaVersion"] == 3, "schema")
record_path = ROOT / state["activeOperationalRecord"]
require(record_path.is_file(), "active operational record")
record = json.loads(record_path.read_text(encoding="utf-8"))
require(record["status"] == "SAFE_RETURN_LIVE_VERIFIED_RESTARTABLE", "safe return status")
production = state["production"]
require(production["status"] == "DEPLOYED_VERIFIED_SAFE_RETURN", "production status")
require(production["api"]["entrySha256"] == record["production"]["api"]["entrySha256"], "API identity")
require(production["frontend"]["buildId"] == record["production"]["frontend"]["buildId"], "frontend identity")
require(production["worker"]["preserved"] is True, "worker preserved")
require(production["pm2"]["dumpSha256"] == record["production"]["pm2"]["dumpSha256"], "PM2 dump")
require(bool(SHA.fullmatch(production["pm2"]["dumpSha256"])), "PM2 dump hash")
require(state["contactsListRecovery"]["state"] == "STAGED_INERT_NOT_DEPLOYED", "contacts candidate state")
require(state["contactsListRecovery"]["deploymentClass"] == "NORMAL_RELEASE", "contacts release class")
require(state["deploymentOperatingModel"] == "docs/saas/DEPLOYMENT_OPERATING_MODEL.md", "operating model")
require(len(state["nextActions"]) == 3, "focused next actions")
print("CURRENT_STATE_OK: durable identities, safe return and next release agree")

