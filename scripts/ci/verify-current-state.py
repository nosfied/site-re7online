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
require(state["schemaVersion"] == 6, "schema")
require(state["production"]["status"] == "DEPLOYED_VERIFIED", "production status")
record_path = ROOT / state["activeDeploymentRecord"]
require(record_path.is_file(), "active record")
record = json.loads(record_path.read_text())
require(record["schemaVersion"] in (4, 5) and record["status"] == "DEPLOYED_VERIFIED",
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
if record["artifacts"]["worker"].get("preserved") is True:
    require(production["worker"]["changed"] is False and
            production["worker"]["preserved"] is True,
            "worker preservation")
    require(production["database"]["lastDeploymentMigration"] ==
            "NOT_APPLICABLE_NO_SCHEMA_CHANGE" and
            record["migration"]["classification"] ==
            "NOT_APPLICABLE_NO_SCHEMA_CHANGE",
            "no-schema-change deployment")
else:
    require(production["worker"]["changed"] is True and
            production["worker"]["preserved"] is False and
            production["worker"]["entrySha256"] ==
            record["artifacts"]["worker"]["entrySha256"], "worker target identity")
    require(production["database"]["migration"] == record["migration"]["name"] and
            production["database"]["appliedExactlyOnce"] is True and
            production["database"]["pendingMigrationCount"] == 0,
            "database migration state")
require(production["persistentStorage"]["templateMediaRoot"] ==
        record["persistentStorage"]["templateMediaRoot"] and
        production["persistentStorage"]["directoryMode"] == "0700",
        "persistent media storage")
require(bool(SHA.fullmatch(production["pm2"]["dumpSha256"])), "PM2 dump")
require(production["pm2"]["dumpSha256"] == record["pm2"]["dumpSha256"],
        "PM2 identity")
require(production["pm2"]["savedExactlyOnce"] is True, "PM2 save")
contacts = state["contactsListRecovery"]
require(contacts["state"] == "DEPLOYED_VERIFIED", "contacts state")
require((ROOT / contacts["deploymentRecord"]).is_file(), "historical contacts record")
media = state["templateCampaignMedia"]
require(media["state"] == "TECHNICALLY_DEPLOYED" and
        media["deploymentRecord"] == state["activeDeploymentRecord"],
        "media active record")
require(media["components"] in (["api", "frontend", "worker"],
                                ["api", "frontend", "worker_preserved"]) and
        media["migrationApplied"] is True and
        media["persistentStorageReady"] is True, "media deployment boundary")
require(media["metaFunctionalAcceptance"] == "PENDING" and
        media["commercialOperationalRelease"] == "PENDING" and
        media["craPrRelease"] == "PENDING", "media pending acceptance")
require(media["metaCallsExecuted"] is False and
        media["templatesCreatedOrSubmitted"] is False and
        media["campaignsExecuted"] is False and media["messagesSent"] is False,
        "media external effects")
tenant_app = state["tenantScopedMetaAppId"]
require(tenant_app["configurationState"] == "CONFIGURED_VERIFIED_FOR_CONVERTA_DEMO" and
        tenant_app["configuredTenantKey"] == "demo-converta" and
        tenant_app["currentTokenAppBinding"] == "CONFIRMED_BY_META_DEBUG_TOKEN" and
        tenant_app["historicalOnboardingRecovered"] is False,
        "tenant-scoped Meta App ID state")
require(tenant_app["globalFallbackUsed"] is False and
        tenant_app["metaDiagnosticGetCount"] == 1 and
        tenant_app["metaMutatingCallsExecuted"] is False,
        "tenant-scoped Meta effects")
require((ROOT / tenant_app["configurationRecord"]).is_file(),
        "tenant-scoped Meta configuration record")
required_obsolete = {"BUILD_IN_ACTIVE_RUNTIME", "LIVE_CHECKOUT_AS_RUNTIME",
                     "scripts/deploy-normal-release.sh",
                     "PR_190_EXPERIMENTAL_PIPELINE",
                     "NEXT_CLUSTER_MODE",
                     "DIRECT_PM2_PID_SOCKET_EQUALITY_GATE"}
require(required_obsolete <= set(state["obsoleteMechanisms"]), "obsolete mechanisms")
print("CURRENT_STATE_OK: immutable release, fixed paths and active record agree")
