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
require(record.get("status") in (
            "DEPLOYED_VERIFIED", "DEPLOYED_SANITIZED",
            "DEPLOYED_RETENTION_INCOMPLETE"),
        "active record deployed")
require(state["contactsListRecovery"]["state"] == "DEPLOYED_VERIFIED",
        "contacts deployed")
require((ROOT / state["contactsListRecovery"]["deploymentRecord"]).is_file(),
        "historical contacts deployment record")
require(state["templateCampaignMedia"]["state"] == "TECHNICALLY_DEPLOYED",
        "media technically deployed")
media = state["templateCampaignMedia"]
require(media["deploymentRecord"] == state["activeApiDeploymentRecord"],
        "media API deployment record")
if record.get("recordType") == "API_ONLY_FIXED_CURRENT_IMMUTABLE_RELEASE_DEPLOYMENT":
    require((ROOT / media["frontendPresentationDeploymentRecord"]).is_file(),
            "preserved frontend presentation deployment record")
else:
    require(media["frontendPresentationDeploymentRecord"] == record_value,
            "media frontend presentation deployment record")
require(media["metaFunctionalAcceptance"] == "PASS_IMAGE_VIDEO_CONTROLLED" and
        media["commercialOperationalRelease"] == "GENERAL_OPERATIONS_OPEN",
        "media functional acceptance and general operations")
require(media["frontendPresentationState"] == "DEPLOYED_VISUAL_ACCEPTANCE_PASS",
        "media frontend presentation acceptance")
require(media["latestCampaignHomologationState"] ==
        "IMAGE_AND_VIDEO_CONTROLLED_SENDS_PASS_GENERAL_OPERATIONS_OPEN" and
        (ROOT / media["latestCampaignHomologationRecord"]).is_file(),
        "current media campaign acceptance")
require(media["lastHomologationAttempt"] ==
        "FAILED_DETERMINISTIC_PROVIDER_REJECTION" and
        (ROOT / media["lastHomologationRecord"]).is_file(),
        "historical media homologation attempt")
tenant_app = state["tenantScopedMetaAppId"]
require(tenant_app["configurationState"] == "CONFIGURED_VERIFIED_FOR_CONVERTA_DEMO" and
        tenant_app["currentTokenAppBinding"] == "CONFIRMED_BY_META_DEBUG_TOKEN" and
        tenant_app["historicalOnboardingRecovered"] is False,
        "tenant-scoped Meta configuration")
require((ROOT / tenant_app["configurationRecord"]).is_file(),
        "tenant-scoped Meta configuration record")

active_paths = (
    "docs/saas/CURRENT_STATE.md",
    "docs/saas/DOCUMENTATION_INDEX.md",
    "docs/saas/DEPLOYMENT_OPERATING_MODEL.md",
    "docs/saas/META_TEMPLATE_MEDIA_SUPPORT.md",
    "docs/DEPLOY_TOPOLOGY_RE7.md",
)
active_by_path = {p: (ROOT / p).read_text() for p in active_paths}
active = "\n".join(active_by_path.values())

production = state["production"]
recovery = state.get("capacityRecoveryControlPlane", {})
if recovery.get("state") == "COMPLETED_REPORTED":
    completed = recovery.get("lastCompleted", {})
    count = completed.get("commandsCompleted")
    require(completed.get("state") == "COMPLETED" and isinstance(count, int) and
            count > 0 and completed.get("pathsVerifiedAbsent") == count and
            completed.get("repeatPermitted") is False,
            "reported capacity recovery has a terminal non-repeatable receipt")
    for key in ("planSha256", "receiptSha256", "journalSha256"):
        value = completed.get(key)
        require(isinstance(value, str) and len(value) == 64 and
                all(char in "0123456789abcdef" for char in value),
                f"reported capacity recovery binding {key}")
pending = state.get("pendingOperationalChange")
if isinstance(pending, dict) and pending.get("active") is False:
    active_releases = {production.get("releaseId")}
    active_releases.update(production.get(component, {}).get("selectedReleaseId")
                           for component in ("api", "frontend", "worker"))
    worker_path = production.get("worker", {}).get("releasePath")
    if worker_path:
        active_releases.add(Path(worker_path).parent.name)
    require(pending.get("releaseId") not in active_releases,
            "inert pending release must not be documented as active")
markers = (
    production["targetCommit"],
    production["releaseId"],
    production["api"]["stablePath"],
    production["frontend"]["stablePath"],
    production["frontend"]["buildId"],
    production["frontend"]["execMode"],
    production["pm2"]["dumpSha256"],
    state["templateCampaignMedia"]["knownNonBlockingBacklog"],
    Path(tenant_app["configurationRecord"]).name,
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
    "Status produtivo: **NOT DEPLOYED**",
    "MIGRATION LOCAL ONLY",
    "PRODUCTION NOT AUTHORIZED",
):
    require(stale not in active, f"stale active claim {stale}")
require("scripts/deploy-normal-release.sh" in active and "obsoleto" in active,
        "obsolete executor classification")
require("PR #190" in active and "cluster_mode" in active,
        "obsolete pipeline and frontend mode")
print("DOCUMENTATION_FRESHNESS_OK: active surfaces derive from CURRENT_STATE and the active deployment record")
