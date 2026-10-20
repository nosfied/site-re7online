#!/usr/bin/env python3
"""Validate the concise canonical production state and active deployment record."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"^[0-9a-f]{64}$")


def require(value, reason):
    if not value:
        raise SystemExit(f"CURRENT_STATE_INVALID: {reason}")


state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
require(state["schemaVersion"] == 5, "schema")
require(state["production"]["status"] == "DEPLOYED_VERIFIED", "production status")
record_path = ROOT / state["activeDeploymentRecord"]
require(record_path.is_file(), "active record")
record = json.loads(record_path.read_text())
require(record["schemaVersion"] == 4 and record["status"] == "DEPLOYED_VERIFIED",
        "record status")
require(state["activeOperationalRecord"] == state["activeDeploymentRecord"],
        "single active record")
production = state["production"]
require(production["targetCommit"] == record["targetCommit"], "target")
require(production["releaseId"] == record["releaseId"], "release")
require(production["api"]["entrySha256"] ==
        record["artifacts"]["api"]["entrySha256"], "API identity")
require(production["frontend"]["buildId"] ==
        record["artifacts"]["frontend"]["buildId"], "frontend identity")
require(production["frontend"]["execMode"] == "fork_mode" and
        production["frontend"]["instances"] == 1, "frontend mode")
require(production["worker"]["preserved"] is True, "worker preserved")
require(bool(SHA.fullmatch(production["pm2"]["dumpSha256"])), "PM2 dump")
require(production["pm2"]["dumpSha256"] == record["pm2"]["dumpSha256"],
        "PM2 identity")
require(production["pm2"]["savedExactlyOnce"] is True, "PM2 save")
candidate = state["contactsListRecovery"]
require(candidate["state"] == "DEPLOYED_VERIFIED", "contacts state")
require(candidate["deploymentRecord"] == state["activeDeploymentRecord"],
        "contacts record")
require(candidate["components"] == ["api", "frontend"], "components")
require(candidate["workerChanged"] is False and candidate["databaseChanged"] is False,
        "change boundary")
required_obsolete = {"BUILD_ON_VPS", "LIVE_CHECKOUT_AS_RUNTIME",
                     "scripts/deploy-normal-release.sh",
                     "PR_190_EXPERIMENTAL_PIPELINE",
                     "NEXT_CLUSTER_MODE",
                     "DIRECT_PM2_PID_SOCKET_EQUALITY_GATE"}
require(required_obsolete <= set(state["obsoleteMechanisms"]), "obsolete mechanisms")
print("CURRENT_STATE_OK: immutable release, fixed paths and active record agree")
