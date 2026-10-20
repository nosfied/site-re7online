#!/usr/bin/env python3
"""Validate concise canonical production state and the pending normal release."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{64}")

def require(value, reason):
    if not value: raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")

state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
require(state["schemaVersion"] == 4, "schema")
record = json.loads((ROOT / state["activeOperationalRecord"]).read_text())
require(record["status"] == "SAFE_RETURN_LIVE_VERIFIED_RESTARTABLE", "safe return")
production = state["production"]
require(production["api"]["entrySha256"] == record["production"]["api"]["entrySha256"], "API identity")
require(production["frontend"]["buildId"] == record["production"]["frontend"]["buildId"], "frontend identity")
require(production["worker"]["preserved"] is True, "worker preserved")
require(bool(SHA.fullmatch(production["pm2"]["dumpSha256"])), "PM2 dump hash")
candidate = state["contactsListRecovery"]
require(candidate["state"] == "STAGED_INERT_NOT_DEPLOYED", "candidate state")
require(candidate["deploymentClass"] == "NORMAL_RELEASE", "candidate class")
require(candidate["components"] == ["api", "frontend"], "components")
require(candidate["workerChanged"] is False and candidate["databaseChanged"] is False, "change boundary")
require(state["normalReleaseExecutor"] == "scripts/deploy-normal-release.sh", "executor")
require((ROOT / state["normalReleaseExecutor"]).is_file(), "executor file")
require(len(state["nextActions"]) == 3, "focused next actions")
print("CURRENT_STATE_OK: production identity and pending normal release agree")
