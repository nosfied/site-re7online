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
require(state["schemaVersion"] in (6, 7), "schema")
require(state["production"]["status"] == "DEPLOYED_VERIFIED", "production status")
record_path = ROOT / state["activeDeploymentRecord"]
require(record_path.is_file(), "active record")
record = json.loads(record_path.read_text())
require(record["status"] == "DEPLOYED_VERIFIED", "record status")
require(state["activeOperationalRecord"] == state["activeDeploymentRecord"],
        "single active record")
production = state["production"]

if record.get("recordType") == "FRONTEND_ONLY_IMMUTABLE_RELEASE_DEPLOYMENT":
    require(record["schemaVersion"] == 1, "frontend record schema")
    require(production["targetCommit"] == record["release"]["target"], "target")
    require(production["releaseId"] == record["release"]["id"], "release")
    require(production["frontend"]["buildId"] ==
            record["release"]["buildId"], "frontend identity")
    require(production["frontend"]["selectedReleaseId"] ==
            record["release"]["id"], "frontend selected release")
    api_record_path = ROOT / state["activeApiDeploymentRecord"]
    require(api_record_path.is_file(), "active API record")
    api_record = json.loads(api_record_path.read_text())
    require(production["api"]["entrySha256"] ==
            api_record["artifacts"]["api"]["entrySha256"], "API identity")
    require(production["api"]["selectedReleaseId"] ==
            api_record["releaseId"], "API selected release")
    require(record["impact"]["apiPreserved"] is True and
            record["impact"]["workerPreserved"] is True and
            production["worker"]["changed"] is False and
            production["worker"]["preserved"] is True,
            "frontend-only preservation")
    require(production["database"]["lastDeploymentMigration"] ==
            "NOT_APPLICABLE_NO_SCHEMA_CHANGE" and
            record["release"]["migration"] ==
            "NOT_APPLICABLE_NO_SCHEMA_CHANGE",
            "no-schema-change deployment")
    require(production["persistentStorage"]["templateMediaRoot"] ==
            api_record["persistentStorage"]["templateMediaRoot"] and
            production["persistentStorage"]["directoryMode"] == "0700",
            "persistent media storage")
    require(production["pm2"]["dumpSha256"] ==
            record["pm2"]["dumpSha256"], "PM2 identity")
else:
    require(record["schemaVersion"] in (4, 5), "record schema")
    require(production["targetCommit"] == record["targetCommit"], "target")
    require(production["releaseId"] == record["releaseId"], "release")
    require(production["api"]["entrySha256"] ==
            record["artifacts"]["api"]["entrySha256"], "API identity")
    require(production["frontend"]["buildId"] ==
            record["artifacts"]["frontend"]["buildId"], "frontend identity")
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
    require(production["pm2"]["dumpSha256"] == record["pm2"]["dumpSha256"],
            "PM2 identity")

require(production["frontend"]["execMode"] == "fork_mode" and
        production["frontend"]["instances"] == 1, "frontend mode")
require(bool(SHA.fullmatch(production["pm2"]["dumpSha256"])), "PM2 dump")
require(production["pm2"]["savedExactlyOnce"] is True, "PM2 save")
contacts = state["contactsListRecovery"]
require(contacts["state"] == "DEPLOYED_VERIFIED", "contacts state")
require((ROOT / contacts["deploymentRecord"]).is_file(), "historical contacts record")
media = state["templateCampaignMedia"]
require(media["state"] == "TECHNICALLY_DEPLOYED", "media state")
if record.get("recordType") == "FRONTEND_ONLY_IMMUTABLE_RELEASE_DEPLOYMENT":
    require(media["deploymentRecord"] == state["activeApiDeploymentRecord"] and
            media["frontendPresentationDeploymentRecord"] ==
            state["activeDeploymentRecord"],
            "media split deployment records")
else:
    require(media["deploymentRecord"] == state["activeDeploymentRecord"],
            "media active record")
require(media["components"] in (["api", "frontend", "worker"],
                                ["api", "frontend", "worker_preserved"]) and
        media["migrationApplied"] is True and
        media["persistentStorageReady"] is True, "media deployment boundary")
if media["metaFunctionalAcceptance"] == "PENDING":
    require(media["commercialOperationalRelease"] == "PENDING" and
            media["campaignsExecuted"] is False and
            media["messagesSent"] is False,
            "media pending acceptance")
else:
    require(media["metaFunctionalAcceptance"] == "PASS_IMAGE_VIDEO_CONTROLLED" and
            media["commercialOperationalRelease"] == "GENERAL_OPERATIONS_OPEN" and
            media["campaignsExecuted"] is True and
            media["messagesSent"] is True and
            media["latestCampaignHomologationState"] ==
            "IMAGE_AND_VIDEO_CONTROLLED_SENDS_PASS_GENERAL_OPERATIONS_OPEN",
            "media accepted state")
require(media["craPrRelease"] == "PENDING", "CRA-PR acceptance boundary")
require(media["metaCallsExecuted"] is True and
        media["templatesCreatedOrSubmitted"] is True,
        "media external effects")
require(media["lastHomologationAttempt"] ==
        "FAILED_DETERMINISTIC_PROVIDER_REJECTION", "media homologation result")
homologation_path = ROOT / media["lastHomologationRecord"]
require(homologation_path.is_file(), "media homologation record")
homologation = json.loads(homologation_path.read_text())
require(homologation["status"] == "FAILED_DETERMINISTIC_PROVIDER_REJECTION" and
        homologation["operations"]["metaSubmissionCount"] == 1 and
        homologation["operations"]["retryCount"] == 0 and
        homologation["providerResult"]["stage"] == "binary_upload" and
        homologation["request"]["finalStatus"] == "failed",
        "media homologation result truth")
tenant_app = state["tenantScopedMetaAppId"]
require(tenant_app["configurationState"] == "CONFIGURED_VERIFIED_FOR_CONVERTA_DEMO" and
        tenant_app["configuredTenantKey"] == "demo-converta" and
        tenant_app["currentTokenAppBinding"] == "CONFIRMED_BY_META_DEBUG_TOKEN" and
        tenant_app["historicalOnboardingRecovered"] is False,
        "tenant-scoped Meta App ID state")
require(tenant_app["globalFallbackUsed"] is False and
        tenant_app["metaDiagnosticGetCount"] == 1 and
        tenant_app["metaMutatingCallsExecuted"] is True and
        tenant_app["lastMetaMutationScope"] ==
        "SINGLE_TEMPLATE_MEDIA_SUBMISSION_ATTEMPT",
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
