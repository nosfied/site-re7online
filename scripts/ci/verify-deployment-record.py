#!/usr/bin/env python3
"""Validate a sanitized deployment record against repository contracts."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {"tenantId", "operationUuid", "token", "authorization", "cookie"}


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"DEPLOYMENT_RECORD_INVALID: {reason}")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        result = set(value)
        for child in value.values():
            result.update(walk_keys(child))
        return result
    if isinstance(value, list):
        result: set[str] = set()
        for child in value:
            result.update(walk_keys(child))
        return result
    return set()


def positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def verify_socket_owner(observed: dict, component: str) -> None:
    pm2_pid = observed.get("pid")
    owner_pid = observed.get("socketOwnerPid")
    relation = observed.get("socketOwnerRelation")
    chain = observed.get("socketOwnerChain")
    require(positive_int(pm2_pid), f"{component} PM2 PID")
    require(positive_int(owner_pid), f"{component} socket owner PID")
    require(isinstance(chain, list) and chain and
            all(positive_int(pid) for pid in chain),
            f"{component} socket owner chain")
    require(len(chain) == len(set(chain)), f"{component} socket owner chain loop")
    require(chain[0] == owner_pid, f"{component} socket owner chain start")
    require(chain[-1] == pm2_pid, f"{component} socket owner chain end")
    if relation == "DIRECT":
        require(len(chain) == 1 and owner_pid == pm2_pid,
                f"{component} DIRECT socket relation")
    elif relation == "DESCENDANT":
        require(len(chain) >= 2 and owner_pid != pm2_pid,
                f"{component} DESCENDANT socket relation")
    else:
        require(False, f"{component} socket owner relation")


def verify_immutable_release(record_path: Path, record: dict) -> None:
    require(record.get("recordType") == "IMMUTABLE_RELEASE_DEPLOYMENT",
            "immutable record type")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment status")
    require(record.get("result") ==
            "DEPLOYED_FIXED_CURRENT_RUNTIME_ESTABLISHED_PRODUCTION_HEALTHY",
            "deployment result")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized record")
    for field in ("baseCommit", "targetCommit"):
        require(bool(re.fullmatch(r"[0-9a-f]{40}", record.get(field, ""))), field)
    require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",
                              record.get("releaseId", ""))), "releaseId")
    require(record.get("components") == ["api", "frontend"], "components")
    build = record.get("build", {})
    common_build = {
        "platform": "linux", "architecture": "x86_64",
        "nodeVersion": "v20.20.0", "npmVersion": "10.8.2",
    }
    if build.get("location") == "OFF_HOST":
        require(build == {"location": "OFF_HOST", **common_build},
                "off-host build identity")
    else:
        require(build == {
            "location": "PRODUCTION_HOST_ISOLATED_WORKTREE", **common_build,
            "ownerAuthorization": "EXPLICIT_AFTER_RAM_UPGRADE",
            "activeRuntimeStoppedForBuild": False,
            "singleBuild": True,
        }, "authorized isolated production-host build identity")
    artifacts = record.get("artifacts", {})
    for field in ("packageSha256", "manifestSha256", "indexSha256"):
        require(bool(SHA256.fullmatch(artifacts.get(field, ""))), field)
    release_path = Path(artifacts.get("releasePath", ""))
    require(release_path.is_absolute() and
            release_path.parent == Path("/opt/re7online/releases") and
            release_path.name == record.get("releaseId"), "release path")
    api = artifacts.get("api", {})
    frontend = artifacts.get("frontend", {})
    require(Path(api.get("stablePath", "")).is_absolute() and
            bool(SHA256.fullmatch(api.get("entrySha256", ""))), "API artifact")
    require(Path(frontend.get("stablePath", "")).is_absolute() and
            isinstance(frontend.get("buildId"), str) and
            bool(frontend.get("buildId")) and
            frontend.get("execMode") == "fork_mode" and
            frontend.get("instances") == 1 and
            frontend.get("entrypoint") == "node_modules/next/dist/bin/next" and
            frontend.get("args") == ["start", "-p", "3000"],
            "frontend artifact")
    require(artifacts.get("worker") == {"preserved": True}, "worker artifact")
    require(record.get("deploymentOrder") == ["api", "frontend"], "order")
    verification = record.get("verification", {})
    for component, port in (("api", 3001), ("frontend", 3000)):
        observed = verification.get(component, {})
        require(observed.get("samples") == 3 and
                observed.get("socketPort") == port and
                positive_int(observed.get("startTicks")), f"{component} samples")
        verify_socket_owner(observed, component)
    worker = verification.get("worker", {})
    require(worker.get("preserved") is True and
            worker.get("restartCount") == 0 and
            positive_int(worker.get("pid")) and
            positive_int(worker.get("startTicks")),
            "worker verification")
    require(verification.get("smoke") == "GET_ONLY", "GET-only smoke")
    if "controlPlane" in record:
        control_plane = record.get("controlPlane", {})
        require(bool(re.fullmatch(r"[0-9a-f]{40}", control_plane.get("commit", ""))) and
                positive_int(control_plane.get("workflowDispatchRun")) and
                control_plane.get("ciJobs") == 4 and
                control_plane.get("ciResult") == "PASS", "control plane identity")
        readiness = record.get("readiness", {})
        if readiness.get("command") == "scripts/pm2-definition-control.py wait-readiness":
            require(readiness.get("controlPlaneCommit") == control_plane.get("commit") and
                    readiness.get("deadlineSeconds") == 30 and
                    readiness.get("maximumPollingMilliseconds") == 500 and
                    readiness.get("requiredStableSamples") == 3 and
                    readiness.get("healthEvaluatedAfterSocketStability") is True,
                    "versioned readiness contract")
            for component in ("api", "frontend"):
                result = readiness.get(component, {})
                require(result.get("totalSamples") == 3 and
                        result.get("stabilityResets") == 0 and
                        isinstance(result.get("elapsedSeconds"), (int, float)) and
                        result.get("elapsedSeconds") > 0,
                        f"{component} readiness result")
        else:
            require(record.get("activation") == {
                "method": "DIRECTED_EXISTING_PM2_FIXED_CURRENT",
                "selection": "ATOMIC_FIXED_CURRENT_SYMLINK",
                "pm2Operation": "RESTART_EXISTING_RECORD_BY_NAME_WITHOUT_UPDATE_ENV",
                "fullStoredPrivateEnvironmentPreserved": True,
                "driverAttemptsRetainedAsHistoricalEvidence": True,
            }, "directed fixed-current activation")
            require(readiness.get("method") ==
                    "THREE_CONSECUTIVE_STABLE_SAMPLES" and
                    readiness.get("requiredStableSamples") == 3 and
                    readiness.get("healthEvaluatedAfterSocketStability") is True,
                    "directed readiness contract")
            for component in ("api", "frontend"):
                result = readiness.get(component, {})
                require(result == {"totalSamples": 3, "identityStable": True,
                                   "listenerCount": 1},
                        f"{component} directed readiness result")
        migration = record.get("migration", {})
        require(migration == {
            "classification": "NOT_APPLICABLE_NO_SCHEMA_CHANGE",
            "sqlExecuted": False,
            "migrationExecuted": False,
        }, "no-schema-change boundary")
        marker = record.get("marker", {})
        require(marker.get("name") == "DEPLOYED" and
                marker.get("createdAfterDumpValidation") is True and
                bool(SHA256.fullmatch(marker.get("sha256", ""))),
                "authenticated deployed marker")
    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True and pm2.get("dumpMode") == "0600",
            "PM2 save and mode")
    if "saveCount" in pm2:
        require(pm2.get("saveCount") == 1 and pm2.get("saveExitCode") == 0 and
                pm2.get("dumpOwner") == "deploy" and
                pm2.get("dumpGroup") == "deploy", "PM2 committed save")
    require(bool(SHA256.fullmatch(pm2.get("dumpSha256", ""))) and
            bool(SHA256.fullmatch(pm2.get("rollbackSha256", ""))), "PM2 hashes")
    require(all(value == 0 for value in record.get("windowMutations", {}).values()),
            "window mutations")
    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record")
    production = state.get("production", {})
    require(production.get("releaseId") == record.get("releaseId"), "active release")
    require(production.get("releasePath") == artifacts.get("releasePath"),
            "active release path")
    require(production.get("targetCommit") == record.get("targetCommit"),
            "active target")
    require(production.get("api", {}).get("stablePath") == api.get("stablePath") and
            production.get("api", {}).get("entrySha256") == api.get("entrySha256"),
            "active API")
    require(production.get("frontend", {}).get("stablePath") ==
            frontend.get("stablePath") and
            production.get("frontend", {}).get("buildId") ==
            frontend.get("buildId") and
            production.get("frontend", {}).get("execMode") ==
            frontend.get("execMode") and
            production.get("frontend", {}).get("instances") ==
            frontend.get("instances"), "active frontend")
    state_pm2 = production.get("pm2", {})
    require(state_pm2.get("dumpSha256") == pm2.get("dumpSha256") and
            state_pm2.get("rollbackSha256") == pm2.get("rollbackSha256") and
            state_pm2.get("mode") == pm2.get("dumpMode") and
            state_pm2.get("savedExactlyOnce") == pm2.get("savedExactlyOnce"),
            "active PM2 state")
    print("DEPLOYMENT_RECORD_OK: immutable artifacts, fixed paths and live verification agree")



def verify_current_frontend_layout(record_path: Path, record: dict) -> None:
    require(record.get("recordType") ==
            "FRONTEND_ONLY_IMMUTABLE_RELEASE_DEPLOYMENT",
            "frontend current record type")
    require(record.get("status") == "DEPLOYED_VERIFIED",
            "frontend current deployment status")
    require(record.get("result") ==
            "CAMPAIGN_MEDIA_LAYOUT_ACCEPTED_PRODUCTION_HEALTHY",
            "frontend current deployment result")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized frontend record")

    functional = record.get("functionalTarget", {})
    control = record.get("controlPlane", {})
    for value, reason in (
        (functional.get("commit"), "functional commit"),
        (functional.get("testedHead"), "functional tested head"),
        (functional.get("treeSha"), "functional tree"),
        (control.get("mergeCommit"), "control merge"),
        (control.get("testedHead"), "control tested head"),
        (control.get("treeSha"), "control tree"),
    ):
        require(bool(re.fullmatch(r"[0-9a-f]{40}", value or "")), reason)
    require(functional.get("treeDifferenceCount") == 0 and
            functional.get("ciResult") == "PASS_4_OF_4" and
            positive_int(functional.get("ciRun")),
            "functional CI identity")
    require(control.get("ciResult") == "PASS_4_OF_4" and
            positive_int(control.get("ciRun")),
            "control CI identity")
    for field in ("executorSha256", "producerSha256", "readinessControlSha256"):
        require(bool(SHA256.fullmatch(control.get(field, ""))),
                f"control {field}")

    release = record.get("release", {})
    release_id = release.get("id", "")
    release_path = Path(release.get("path", ""))
    require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", release_id)),
            "frontend current releaseId")
    require(release_path.is_absolute() and
            release_path.parent == Path("/opt/re7online/releases") and
            release_path.name == release_id, "frontend current release path")
    require(release.get("target") == functional.get("commit"),
            "frontend current target")
    for field in ("packageSha256", "manifestSha256", "indexSha256",
                  "tarSha256", "apiEntrypointSha256",
                  "frontendEntrypointSha256"):
        require(bool(SHA256.fullmatch(release.get(field, ""))),
                f"release {field}")
    require(bool(release.get("buildId")) and
            release.get("indexEntries") == 34351 and
            release.get("buildCount") == 1 and
            release.get("packageVerified") is True and
            release.get("extractedTreeVerified") is True and
            release.get("migration") == "NOT_APPLICABLE_NO_SCHEMA_CHANGE",
            "frontend current release contract")

    impact = record.get("impact", {})
    require(impact.get("activatedComponents") == ["frontend"] and
            impact.get("apiPreserved") is True and
            impact.get("workerPreserved") is True and
            impact.get("pm2BindingsRequired") is False and
            impact.get("validatePairExecuted") is False,
            "frontend current impact")

    runtime = record.get("runtime", {})
    frontend = runtime.get("frontend", {})
    require(frontend.get("releaseId") == release_id and
            frontend.get("buildId") == release.get("buildId") and
            frontend.get("execMode") == "fork_mode" and
            frontend.get("instances") == 1 and
            frontend.get("socketPort") == 3000 and
            frontend.get("socketOwnerRelation") == "DIRECT" and
            frontend.get("socketOwnerPid") == frontend.get("pid") and
            positive_int(frontend.get("pid")) and
            positive_int(frontend.get("startTicks")),
            "frontend current runtime")
    require(runtime.get("api", {}).get("preserved") is True and
            runtime.get("worker", {}).get("preserved") is True and
            runtime.get("worker", {}).get("restartCount") == 0,
            "frontend current preserved processes")

    readiness = record.get("readiness", {})
    require(readiness.get("result") == "READINESS_PASS" and
            readiness.get("totalSamples") == 4 and
            readiness.get("stableSamples") == 3 and
            readiness.get("initialListenerAbsent") is True and
            readiness.get("stderrEmpty") is True and
            bool(SHA256.fullmatch(readiness.get("reportSha256", ""))),
            "frontend current readiness")
    require(record.get("acceptance", {}).get("technical") == "PASS" and
            record.get("acceptance", {}).get("visual") == "PASS",
            "frontend current acceptance")

    pm2 = record.get("pm2", {})
    require(pm2.get("version") == "6.0.14" and
            pm2.get("saveCount") == 1 and
            pm2.get("saveAttemptCount") == 1 and
            pm2.get("saveExitCode") == 0 and
            pm2.get("dumpValidation") == "PASS_THREE_RECORDS" and
            pm2.get("secondSaveExecuted") is False and
            bool(SHA256.fullmatch(pm2.get("dumpSha256", ""))) and
            bool(SHA256.fullmatch(pm2.get("dumpValidationSha256", ""))),
            "frontend current PM2 state")
    finalization = record.get("finalization", {})
    for field in ("journalSha256", "markerSha256", "receiptSha256",
                  "saveEvidenceSha256"):
        require(bool(SHA256.fullmatch(finalization.get(field, ""))),
                f"finalization {field}")
    require(finalization.get("markerCreatedAfterDumpValidation") is True,
            "frontend current marker order")
    require(record.get("campaignGuard") == {
        "open": True, "generation": 41, "tasks": 0, "fault": None,
    }, "frontend current campaign guard")
    require(record.get("lock", {}).get("releasedByAuthenticatedToken") is True and
            record.get("lock", {}).get("holderExited") is True and
            record.get("lock", {}).get("filePreserved") is True,
            "frontend current lock")
    require(all(value in (0, False)
                for value in record.get("deploymentEffects", {}).values()),
            "frontend current deployment effects")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(),
            "frontend current active record")
    production = state.get("production", {})
    require(production.get("targetCommit") == release.get("target") and
            production.get("releaseId") == release_id and
            production.get("releasePath") == str(release_path),
            "frontend current production release")
    require(production.get("frontend", {}).get("selectedReleaseId") ==
            release_id and
            production.get("frontend", {}).get("buildId") ==
            release.get("buildId"), "frontend current production identity")
    require(production.get("pm2", {}).get("dumpSha256") ==
            pm2.get("dumpSha256"), "frontend current production dump")
    print("DEPLOYMENT_RECORD_OK: frontend-only f160, split topology and finalization agree")


def verify_frontend_operational_closure(record_path: Path, record: dict) -> None:
    require(record.get("schemaVersion") == 1 and
            record.get("recordType") == "FRONTEND_ONLY_OPERATIONAL_CLOSURE" and
            record.get("status") == "DEPLOYED_SANITIZED",
            "frontend closure identity")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "frontend closure sensitive keys")
    release = record.get("release", {})
    require(bool(re.fullmatch(r"[0-9a-f]{40}", release.get("target", ""))),
            "frontend closure target")
    closure = release.get("id")
    known = {
        "immutable-b96eb779-vps-20261028T025159Z": {
            "buildId": "jRFzvE9WaHEtDCwGbV-EH",
            "api": "immutable-708f018c-vps-20261027T152109Z",
            "scope": "CAMPAIGN_AUDIENCE_AND_TERMINAL_PRESENTATION_FULLY_ACCEPTED",
        },
        "immutable-aa9527cc-vps-20261029T222733Z": {
            "buildId": "lHKJnVlp6Onz0FpycKR_Z",
            "api": "immutable-754281d3-vps-20261029T174145Z",
            "scope": "CONSENT_PROMPT_POSITIVE_AND_NEGATIVE_VISIBLE_IN_AUTHORIZED_AUTOMATION_WITHOUT_REGRESSION_IN_OTHER_FILTERS",
        },
    }
    require(closure in known and release.get("buildId") == known[closure]["buildId"],
            "frontend closure release")
    topology = record.get("topology", {})
    require(topology.get("frontend") == closure and
            topology.get("api") == known[closure]["api"] and
            topology.get("apiPreserved") is True and
            topology.get("workerPreserved") is True,
            "frontend closure topology")
    acceptance = record.get("acceptance", {})
    require(acceptance.get("technical") == acceptance.get("visual") == "PASS" and
            acceptance.get("scope") == known[closure]["scope"],
            "frontend closure acceptance")
    finalization = record.get("finalization", {})
    require(finalization.get("state") == "DEPLOYED_SANITIZED" and
            finalization.get("saveCount") == 1,
            "frontend closure finalization")
    common_hashes = ("dumpSha256", "saveIntentSha256", "saveExecutionSha256",
                     "dumpValidationSha256", "receiptSha256", "markerSha256")
    for field in common_hashes:
        require(bool(SHA256.fullmatch(finalization.get(field, ""))),
                f"frontend closure {field}")
    journal_field = ("journalSha256" if closure.startswith("immutable-b96")
                     else "transactionStateSha256")
    require(bool(SHA256.fullmatch(finalization.get(journal_field, ""))),
            f"frontend closure {journal_field}")
    retirement = record.get("retention", {})
    require(retirement.get("state") == "SANITIZED" and
            retirement.get("attempted") == retirement.get("completed") == 3 and
            bool(SHA256.fullmatch(retirement.get("receiptSha256", ""))),
            "frontend closure retention")
    if closure.startswith("immutable-b96"):
        require(bool(SHA256.fullmatch(retirement.get("reviewSha256", ""))),
                "frontend closure review")
        capacity = record.get("capacity", {})
        require(capacity == {
            "availableBytes": 12402286592, "availableGiB": 11.55,
            "minimumBuildBytes": 12884901888, "minimumBuildGiB": 12,
            "newBuildAllowed": False,
            "readOnlyAuditsAndNoBuildAcceptanceAllowed": True,
        }, "frontend closure capacity")
    else:
        require(retirement.get("remaining") == 0 and
                bool(SHA256.fullmatch(retirement.get("commandLogSha256", ""))),
                "frontend closure command log")
    effects = record.get("effects", {})
    require(effects.get("metaCalls") == 0 and
            effects.get("additionalRestartsDuringFinalization") == 0 and
            effects.get("guardChanges") == 0,
            "frontend closure effects")
    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "frontend closure active record")
    production = state.get("production", {})
    active_api_record = read_json(ROOT / state.get("activeApiDeploymentRecord", ""))
    require(production.get("releaseId") == closure and
            production.get("targetCommit") == release.get("target") and
            production.get("frontend", {}).get("buildId") == release.get("buildId") and
            production.get("api", {}).get("selectedReleaseId") ==
            active_api_record.get("release", {}).get("id") and
            production.get("pm2", {}).get("dumpSha256") ==
            finalization.get("dumpSha256"),
            "frontend closure current state")
    print(f"DEPLOYMENT_RECORD_OK: {closure} frontend closure, save and retention agree")

def verify_template_media_release(record_path: Path, record: dict) -> None:
    require(record.get("recordType") == "IMMUTABLE_RELEASE_DEPLOYMENT",
            "media immutable record type")
    require(record.get("status") == "DEPLOYED_VERIFIED", "media deployment status")
    require(record.get("result") == "DEPLOYED_PRODUCTION_TECHNICALLY_HEALTHY",
            "media deployment result")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized media record")
    for field in ("baseCommit", "targetCommit", "reviewedHead"):
        require(bool(re.fullmatch(r"[0-9a-f]{40}", record.get(field, ""))), field)
    release_id = record.get("releaseId", "")
    require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", release_id)),
            "media releaseId")
    require(record.get("components") == ["api", "frontend", "worker"],
            "media components")
    require(record.get("deploymentOrder") == ["api", "frontend", "worker"],
            "media deployment order")
    require(record.get("build") == {
        "location": "OFF_HOST", "platform": "linux", "architecture": "x86_64",
        "nodeVersion": "v20.20.0", "npmVersion": "10.8.2",
    }, "media build identity")

    artifacts = record.get("artifacts", {})
    for field in ("packageSha256", "manifestSha256", "indexSha256"):
        require(bool(SHA256.fullmatch(artifacts.get(field, ""))),
                f"media artifact {field}")
    require(positive_int(artifacts.get("indexEntries")), "media artifact index entries")
    release_path = Path(artifacts.get("releasePath", ""))
    require(release_path.is_absolute() and
            release_path.parent == Path("/opt/re7online/releases") and
            release_path.name == release_id, "media release path")
    api = artifacts.get("api", {})
    frontend = artifacts.get("frontend", {})
    worker = artifacts.get("worker", {})
    require(Path(api.get("stablePath", "")).is_absolute() and
            api.get("entrypoint") == "dist/index.js" and
            bool(SHA256.fullmatch(api.get("entrySha256", ""))), "media API artifact")
    require(Path(frontend.get("stablePath", "")).is_absolute() and
            bool(frontend.get("buildId")) and
            frontend.get("execMode") == "fork_mode" and
            frontend.get("instances") == 1 and
            frontend.get("entrypoint") == "node_modules/next/dist/bin/next" and
            frontend.get("args") == ["start", "-p", "3000"],
            "media frontend artifact")
    worker_path = Path(worker.get("releasePath", ""))
    require(worker_path.is_absolute() and worker_path.is_relative_to(release_path) and
            worker.get("entrypoint") == "dist/whatsapp-web-worker/src/index.js" and
            bool(SHA256.fullmatch(worker.get("entrySha256", ""))),
            "media worker artifact")

    migration = record.get("migration", {})
    require(bool(migration.get("name")) and
            migration.get("method") == "PRISMA_MIGRATE_DEPLOY" and
            migration.get("appliedExactlyOnce") is True and
            positive_int(migration.get("appliedMigrationCount")) and
            migration.get("pendingMigrationCount") == 0 and
            migration.get("firstClientTermination") ==
            "SIGABRT_AFTER_MIGRATION_PERSISTED" and
            migration.get("restrictedVerificationExitCode") == 0 and
            migration.get("schemaMutationRepeated") is False,
            "media migration disposition")
    backup = record.get("databaseBackup", {})
    require(bool(SHA256.fullmatch(backup.get("sha256", ""))) and
            backup.get("mode") == "0600" and backup.get("nonEmpty") is True and
            backup.get("restoreList") == "PASS" and
            backup.get("contentVersioned") is False, "media database backup")
    storage = record.get("persistentStorage", {})
    storage_path = Path(storage.get("templateMediaRoot", ""))
    require(storage_path.is_absolute() and
            not storage_path.is_relative_to(release_path) and
            storage.get("owner") == "deploy" and storage.get("group") == "deploy" and
            storage.get("directoryMode") == "0700" and
            storage.get("outsideImmutableRelease") is True and
            storage.get("writeReadProbe") == "PASS", "media persistent storage")

    verification = record.get("verification", {})
    for component, port in (("api", 3001), ("frontend", 3000)):
        observed = verification.get(component, {})
        require(observed.get("samples") == 3 and observed.get("socketPort") == port and
                positive_int(observed.get("startTicks")),
                f"media {component} samples")
        verify_socket_owner(observed, component)
    observed_worker = verification.get("worker", {})
    require(observed_worker.get("targetRelease") is True and
            observed_worker.get("restartCount") == 0 and
            positive_int(observed_worker.get("pid")) and
            positive_int(observed_worker.get("startTicks")),
            "media worker verification")
    require(verification.get("smoke") == "GET_ONLY" and
            verification.get("technicalAcceptance") == "PASS",
            "media technical acceptance")

    readiness = record.get("releaseReadiness", {})
    require(readiness == {
        "technicalDeployment": "DEPLOYED",
        "productionHealth": "HEALTHY",
        "metaFunctionalAcceptance": "PENDING",
        "commercialOperationalRelease": "PENDING",
        "craPrRelease": "PENDING",
    }, "media release readiness boundary")
    mutations = record.get("windowMutations", {})
    require(mutations == {
        "functionalPostRequests": 0, "metaCalls": 0,
        "templateCreatesOrSubmissions": 0, "campaigns": 0, "imports": 0,
        "messagesSent": 0, "authorizedMigrations": 1, "otherMigrations": 0,
    }, "media window mutation boundary")
    backlog = record.get("knownNonBlockingBacklog", {})
    require(backlog.get("id") == "PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE" and
            backlog.get("blocksTechnicalDeployment") is False and
            (ROOT / backlog.get("path", "")).is_file(), "media backlog boundary")

    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True and pm2.get("saveExitCode") == 0 and
            pm2.get("dumpMode") == "0600" and pm2.get("dumpOwner") == "deploy" and
            pm2.get("dumpGroup") == "deploy" and
            bool(SHA256.fullmatch(pm2.get("dumpSha256", ""))) and
            bool(SHA256.fullmatch(pm2.get("previousDumpSha256", ""))),
            "media PM2 state")
    require(bool(SHA256.fullmatch(record.get("marker", {}).get("sha256", ""))),
            "media marker")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active media record")
    production = state.get("production", {})
    require(production.get("releaseId") == release_id and
            production.get("releasePath") == str(release_path) and
            production.get("targetCommit") == record.get("targetCommit"),
            "active media release")
    require(production.get("api", {}).get("entrySha256") == api.get("entrySha256") and
            production.get("frontend", {}).get("buildId") == frontend.get("buildId") and
            production.get("worker", {}).get("entrySha256") == worker.get("entrySha256"),
            "active media component identities")
    require(production.get("pm2", {}).get("dumpSha256") == pm2.get("dumpSha256") and
            production.get("pm2", {}).get("rollbackSha256") ==
            pm2.get("previousDumpSha256"), "active media PM2 lineage")
    require(state.get("templateCampaignMedia", {}).get("deploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active media state link")
    print("DEPLOYMENT_RECORD_OK: technical media release, migration, storage and pending provider acceptance agree")


def verify_frontend_only(record_path: Path, record: dict) -> None:
    require(record.get("releaseType") == "FRONTEND_ONLY", "frontend release type")
    require(record.get("deploymentOrder") == ["frontend"], "frontend deployment order")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized record")

    source_path = (ROOT / record.get("sourceReleaseManifest", "")).resolve()
    require(source_path.is_relative_to(ROOT) and source_path.is_file(), "source manifest")
    source = read_json(source_path)
    require(source.get("statusAtCreation") == "LOCAL_VALIDATED_NOT_DEPLOYED",
            "source creation status")
    require(source.get("deploymentRecord") == record_path.relative_to(ROOT).as_posix(),
            "source deployment record link")
    require(source.get("sourceCommits") == record.get("sourceCommits") and
            len(record.get("sourceCommits", [])) == 2,
            "source commit chain")
    require(source.get("deploymentOrder") == ["frontend"], "source deployment order")
    require(source.get("apiChanged") is False and source.get("workerChanged") is False,
            "API and worker preservation")
    require(source.get("migrationRequired") is False and source.get("sqlRequired") is False,
            "database guards")
    require(source.get("csvPostForbidden") is True and
            source.get("automaticReplayForbidden") is True, "CSV mutation guards")
    runtime_sources = source.get("runtimeSources", [])
    require([x.get("path") for x in runtime_sources] == [
        "src/app/app/crm/page.tsx", "src/lib/crmImportRecovery.ts"
    ], "runtime source allowlist")
    for item in runtime_sources:
        require(bool(SHA256.fullmatch(item.get("sha256", ""))) and
                bool(re.fullmatch(r"[0-9a-f]{40}", item.get("gitBlobSha", ""))) and
                item.get("bytes", 0) > 0, "runtime source identity")

    base = record.get("baseDeploymentRecord", {})
    base_path = (ROOT / base.get("path", "")).resolve()
    require(base_path.is_relative_to(ROOT) and base_path.is_file(), "base deployment record")
    require(sha256(base_path) == base.get("sha256"), "base deployment record hash")

    artifacts = record.get("artifacts", {})
    api = artifacts.get("api", {})
    require(api.get("preserved") is True and
            bool(SHA256.fullmatch(api.get("entrySha256", ""))) and
            bool(api.get("entrypoint")), "preserved API identity")
    require(artifacts.get("worker") == {"preserved": True}, "worker preservation")
    frontend = artifacts.get("frontend", {})
    for field in ("packageSha256", "manifestSha256", "indexSha256",
                  "launcherSha256", "controlledEntrySha256", "controlSha256"):
        require(bool(SHA256.fullmatch(frontend.get(field, ""))),
                f"invalid frontend.{field}")
    require(frontend.get("reproducible") is True and
            frontend.get("independentExtractionEqual") is True and
            frontend.get("testModulesInRuntime") is False and
            frontend.get("indexEntries", 0) > 0 and frontend.get("packageBytes", 0) > 0,
            "frontend package contract")
    require(bool(frontend.get("buildId")), "frontend buildId")

    verification = record.get("frontendVerification", {})
    require(verification.get("result") == "FRONTEND_CANDIDATE_STABLE" and
            verification.get("identityStable") is True and
            verification.get("healthStable") is True and
            verification.get("cwdLauncherControlNonceJournalVerified") is True and
            verification.get("rollbackExecuted") is False,
            "frontend verification")
    samples = verification.get("samples", [])
    require(len(samples) == 3, "frontend sample count")
    for number, sample in enumerate(samples, 1):
        require(sample.get("sample") == number and sample.get("result") == "PASS" and
                sample.get("fromUtc") and sample.get("toUtc"),
                f"frontend sample {number}")
    require(verification.get("journalEvents") == [
        "parent", "application_identity", "application_released"
    ], "launcher journal events")
    require(verification.get("loginInboxCrmHttp200") is True and
            verification.get("publicAssets") == {"checked": 13, "http200": 13, "http404": 0},
            "frontend HTTP verification")

    functional = record.get("functionalVerification", {})
    require(functional.get("method") == "GET_ONLY_REENTRY" and
            functional.get("terminalStateObserved") == "COMPLETED" and
            functional.get("terminalReferenceRemoved") is True and
            functional.get("otherTenantOrUserReferencesModified") is False and
            functional.get("modalOpened") is False and
            functional.get("pageLoaded") == 1 and
            functional.get("activeFiltersPreserved") is True and
            functional.get("awayAndBackReentryObserved") is True and
            functional.get("csvPostRequests") == 0,
            "terminal reentry behavior")
    require(functional.get("operationTotalsPersistedVerified") is False and
            functional.get("operationTotalsEvidence") == "NOT_RECORDED_NO_INFERENCE" and
            functional.get("durablePositiveRecovery") == "LIVE_VERIFIED" and
            functional.get("terminalReferenceProof") ==
            "CONSUMED_AS_EXPECTED_NOT_REPEATABLE" and
            functional.get("proofRepetition") ==
            "NOT_REPEATED_REFERENCE_CORRECTLY_CONSUMED",
            "durable recovery and totals claim boundary")
    for digest in functional.get("privateEvidenceSha256", {}).values():
        require(bool(SHA256.fullmatch(digest)), "private evidence hash")

    require(record.get("windowMutations") == {
        "csvPostRequests": 0, "imports": 0, "sqlStatements": 0,
        "migrations": 0, "apiChanges": 0, "workerChanges": 0,
    }, "window mutation guards")
    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True, "PM2 save count")
    for field in ("dumpSha256", "rollbackSha256", "finalizationReportSha256"):
        require(bool(SHA256.fullmatch(pm2.get(field, ""))), f"PM2 {field}")

    observed = record.get("observedProcesses", {})
    require(observed.get("frontendPid") == verification.get("pid") and
            all(isinstance(observed.get(k), int) and observed[k] > 0
                for k in ("apiPid", "frontendPid", "workerPid")),
            "dated process observations")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record selection")
    require(state.get("production", {}).get("api", {}).get("entrySha256") ==
            api.get("entrySha256"), "current API identity")
    require(state.get("production", {}).get("frontend", {}).get("buildId") ==
            frontend.get("buildId"), "current frontend identity")
    operation_path_value = state.get("activeOperationalRecord")
    if operation_path_value:
        operation_path = (ROOT / operation_path_value).resolve()
        require(operation_path.is_relative_to(ROOT) and operation_path.is_file(),
                "active operational record")
        operation = read_json(operation_path)
        current_pm2 = operation.get("production", {}).get(
            "pm2", operation.get("pm2", {})
        )
    else:
        current_pm2 = pm2
    state_pm2 = state.get("production", {}).get("pm2", {})
    require(state_pm2.get("dumpSha256") == current_pm2.get("dumpSha256"),
            "current PM2 dump")
    expected_previous = (
        current_pm2.get("previousRollbackSha256")
        or current_pm2.get("rollbackSha256")
    )
    require(
        state_pm2.get("previousRollbackSha256", state_pm2.get("rollbackSha256"))
        == expected_previous,
        "current rollback lineage",
    )
    print("DEPLOYMENT_RECORD_OK: frontend-only identities, samples and terminal reentry agree")



def verify_fixed_current_sanitized(record_path: Path, record: dict) -> None:
    require(record.get("schemaVersion") == 1, "fixed-current schema")
    require(record.get("recordType") ==
            "API_FRONTEND_FIXED_CURRENT_IMMUTABLE_RELEASE_DEPLOYMENT",
            "fixed-current record type")
    require(record.get("status") == "DEPLOYED_SANITIZED",
            "fixed-current terminal state")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized fixed-current record")

    release = record.get("release", {})
    require(bool(re.fullmatch(r"[0-9a-f]{40}", release.get("target", ""))),
            "fixed-current target")
    require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",
                              release.get("id", ""))), "fixed-current release")
    for field in ("packageSha256", "manifestSha256", "indexSha256",
                  "apiEntrypointSha256"):
        require(bool(SHA256.fullmatch(release.get(field, ""))),
                f"fixed-current {field}")
    require(release.get("indexEntries") == 34353 and
            release.get("buildCount") == 1 and
            release.get("migration") == "NOT_APPLICABLE_NO_SCHEMA_CHANGE" and
            bool(release.get("buildId")), "fixed-current release contract")

    runtime = record.get("runtime", {})
    for component, port in (("api", 3001), ("frontend", 3000)):
        observed = runtime.get(component, {})
        require(positive_int(observed.get("pid")) and
                positive_int(observed.get("startTicks")) and
                observed.get("listener") == port,
                f"fixed-current {component} runtime")
    require(runtime.get("worker", {}).get("preserved") is True and
            runtime.get("worker", {}).get("restartCount") == 0,
            "fixed-current worker preservation")

    finalization = record.get("finalization", {})
    require(finalization.get("pm2SaveCount") == 1 and
            finalization.get("secondSaveExecuted") is False,
            "fixed-current save count")
    for field in ("dumpSha256", "dumpValidationSha256", "markerSha256",
                  "journalSha256", "receiptSha256"):
        require(bool(SHA256.fullmatch(finalization.get(field, ""))),
                f"fixed-current finalization {field}")

    retirement = record.get("retirement", {})
    require(retirement.get("state") == "DEPLOYED_SANITIZED" and
            retirement.get("ordinals") == [8, 9, 10] and
            retirement.get("commandsAttempted") ==
            retirement.get("commandsCompleted") == 3 and
            retirement.get("failures") == 0 and
            retirement.get("automaticRetry") is False and
            retirement.get("remainingDerivedArtifacts") == 0 and
            retirement.get("installedReleasePreserved") is True,
            "fixed-current retirement")
    for field in ("receiptSha256", "journalSha256", "reviewSha256"):
        require(bool(SHA256.fullmatch(retirement.get(field, ""))),
                f"fixed-current retirement {field}")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record")
    production = state.get("production", {})
    require(production.get("status") == "DEPLOYED_SANITIZED" and
            production.get("releaseId") == release.get("id") and
            production.get("targetCommit") == release.get("target"),
            "active fixed-current release")
    require(production.get("api", {}).get("selectedReleaseId") ==
            release.get("id") and
            production.get("frontend", {}).get("selectedReleaseId") ==
            release.get("id") and
            production.get("frontend", {}).get("buildId") ==
            release.get("buildId"), "active fixed-current components")
    require(production.get("pm2", {}).get("dumpSha256") ==
            finalization.get("dumpSha256") and
            production.get("currentMarkerSha256") ==
            finalization.get("markerSha256"), "active fixed-current evidence")
    print("DEPLOYMENT_RECORD_OK: fixed-current release deployed and generation sanitized")

def main() -> None:
    require(len(sys.argv) in (1, 2),
            "usage: verify-deployment-record.py [RECORD]")
    if len(sys.argv) == 2:
        record_value = sys.argv[1]
    else:
        state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
        record_value = state.get("activeDeploymentRecord", "")
    record_path = (ROOT / record_value).resolve()
    require(record_path.is_relative_to(ROOT) and record_path.is_file(),
            "record outside repository or missing")
    record = read_json(record_path)

    if (record.get("schemaVersion") == 1 and
            record.get("recordType") ==
            "API_FRONTEND_FIXED_CURRENT_IMMUTABLE_RELEASE_DEPLOYMENT"):
        verify_fixed_current_sanitized(record_path, record)
        return

    if (record.get("schemaVersion") == 1 and
            record.get("recordType") ==
            "FRONTEND_ONLY_IMMUTABLE_RELEASE_DEPLOYMENT"):
        verify_current_frontend_layout(record_path, record)
        return

    if (record.get("schemaVersion") == 1 and
            record.get("recordType") == "FRONTEND_ONLY_OPERATIONAL_CLOSURE"):
        verify_frontend_operational_closure(record_path, record)
        return

    if record.get("schemaVersion") == 5:
        verify_template_media_release(record_path, record)
        return

    if record.get("schemaVersion") == 4:
        verify_immutable_release(record_path, record)
        return

    if record.get("schemaVersion") == 3:
        verify_frontend_only(record_path, record)
        return

    require(record.get("schemaVersion") == 2, "schemaVersion")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment status")
    require(record.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive identifier key in sanitized record")

    source_path = (ROOT / record.get("sourceReleaseManifest", "")).resolve()
    require(source_path.is_relative_to(ROOT) and source_path.is_file(), "source manifest")
    source = read_json(source_path)
    require(source.get("status") is None and bool(source.get("statusAtCreation")),
            "source status must be historical")
    require(source.get("deploymentRecord") == record_path.relative_to(ROOT).as_posix(),
            "source deployment record link")
    require(record.get("candidateCommit") == source.get("candidateCommit"),
            "candidate commit drift")
    require(record.get("deploymentOrder") == source.get("deploymentOrder"),
            "source deployment order drift")
    require(source.get("migrationRequired") is False, "migration guard")
    require(source.get("workerChanged") is False, "worker guard")
    require(source.get("automaticReplayForbidden") is True, "replay guard")

    artifacts = record.get("artifacts", {})
    for component, field in (
        ("api", "packageSha256"), ("api", "manifestSha256"),
        ("api", "entrySha256"), ("frontend", "packageSha256"),
        ("frontend", "manifestSha256"), ("frontend", "launcherSha256"),
        ("frontend", "controlledEntrySha256"), ("frontend", "controlSha256"),
    ):
        require(bool(SHA256.fullmatch(artifacts.get(component, {}).get(field, ""))),
                f"invalid {component}.{field}")
    require(bool(artifacts.get("api", {}).get("entrypoint")), "API entrypoint")
    require(bool(artifacts.get("frontend", {}).get("buildId")), "frontend buildId")
    require(artifacts.get("worker") == {"preserved": True}, "worker preservation")

    api = record.get("apiVerification", {})
    require(api.get("result") == "API_CANDIDATE_STABLE", "API verification")
    require(api.get("rollbackExecuted") is False, "unexpected API rollback")
    require(len(api.get("samples", [])) == 3, "API sample count")
    for number, sample in enumerate(api["samples"], 1):
        require(sample.get("sample") == number and sample.get("result") == "PASS",
                f"API sample {number}")
        require(sample.get("candidateOwnsListeningSocket") is True and
                sample.get("listeningPort") == 3001, f"API socket sample {number}")
        require(sample.get("localHealthHttp") == 200 and
                sample.get("publicHealthHttp") == 200, f"API health sample {number}")
        require(sample.get("pid") == api.get("pid") and
                sample.get("startTicks") == api.get("startTicks"),
                f"API identity sample {number}")
    socket = api.get("socketBinding", {})
    require(socket.get("pid") == api.get("pid") and socket.get("port") == 3001 and
            socket.get("samples") == 3 and socket.get("result") == "PASS",
            "PID/socket/port binding")

    frontend = record.get("frontendVerification", {})
    require(frontend.get("result") == "FRONTEND_CANDIDATE_STABLE",
            "frontend verification")
    require(frontend.get("samples") == 3 and frontend.get("identityStable") is True and
            frontend.get("healthStable") is True, "frontend samples")
    require(frontend.get("rollbackExecuted") is False, "unexpected frontend rollback")

    get_validation = record.get("getValidation", {})
    require(get_validation.get("method") == "GET_ONLY", "GET validation method")
    nonexistent = get_validation.get("nonexistentOperation", {})
    require(nonexistent == {
        "httpStatus": 200,
        "state": "UNKNOWN",
        "progress": None,
        "summary": None,
        "total": None,
        "crossTenantMetadataPresent": False,
        "result": "PASS",
    }, "nonexistent GET contract")
    cross = get_validation.get("crossTenant", {})
    require(cross.get("evidenceMode") == "REUSED_LIVE_PROOF" and
            cross.get("executedInThisWindow") is False, "reused cross-tenant proof")
    prior_path = (ROOT / cross.get("sourceRecord", "")).resolve()
    require(prior_path.is_relative_to(ROOT) and prior_path.is_file(),
            "cross-tenant source record")
    require(sha256(prior_path) == cross.get("sourceRecordSha256"),
            "cross-tenant source record hash")
    require(cross.get("result") == "HTTP_200_UNKNOWN_NO_CROSS_TENANT_DATA",
            "cross-tenant result")

    posts = record.get("httpPostObservations", {})
    require(posts.get("csvPostRequests") == 0, "CSV POST count")
    automatic = posts.get("automaticNonCsvPostRequests", [])
    require(len(automatic) == 1 and
            automatic[0].get("classification") == "AUTOMATIC_NON_CSV_POST" and
            automatic[0].get("component") == "Inbox" and
            automatic[0].get("path") == "/agent-api/app/inbox/events" and
            automatic[0].get("httpStatus") == 200,
            "automatic non-CSV POST classification")
    require(bool(SHA256.fullmatch(posts.get("privateNetworkEvidenceSha256", ""))),
            "private network evidence hash")

    require(record.get("windowMutations") == {
        "csvPostRequests": 0, "imports": 0, "sqlStatements": 0, "migrations": 0,
    }, "window data mutations")
    require(record.get("durablePositiveRecovery") ==
            "LIVE_DEFERRED_UNTIL_FIRST_LEGITIMATE_IMPORT_GET_ONLY",
            "positive recovery disposition")
    require(record.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993 disposition")

    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True, "PM2 save count")
    for field in ("dumpSha256", "rollbackSha256", "finalizationReportSha256"):
        require(bool(SHA256.fullmatch(pm2.get(field, ""))), f"PM2 {field}")

    observed = record.get("observedProcesses", {})
    require(observed.get("apiPid") == api.get("pid"), "observed API PID")
    require(observed.get("frontendPid") == frontend.get("pid"), "observed frontend PID")
    require(isinstance(observed.get("workerPid"), int) and observed["workerPid"] > 0,
            "observed worker PID")

    require(record.get("credentialInspectionIncident") == {
        "status": "RECORDED_PRIVATELY",
        "values": "NOT_VERSIONED",
        "rotationAssessment": "PENDING",
    }, "credential incident disposition")
    require(record.get("nextActions") == [
        "SANITIZED_CREDENTIAL_EXPOSURE_ASSESSMENT",
        "DEMO_TENANT_MANUAL_PREVIEW_WITHOUT_IMPORT_CONFIRMATION",
    ], "next actions")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("activeDeploymentRecord") ==
            record_path.relative_to(ROOT).as_posix(), "active record selection")
    require(state.get("production", {}).get("status") == record.get("status"),
            "current state status")
    require(state.get("production", {}).get("api", {}).get("entrySha256") ==
            artifacts["api"]["entrySha256"], "current API identity")
    require(state.get("production", {}).get("frontend", {}).get("buildId") ==
            artifacts["frontend"]["buildId"], "current frontend identity")
    require(state.get("production", {}).get("pm2", {}).get("dumpSha256") ==
            pm2["dumpSha256"], "current PM2 dump")
    require(state.get("production", {}).get("pm2", {}).get("rollbackSha256") ==
            pm2["rollbackSha256"], "current rollback")

    print("DEPLOYMENT_RECORD_OK: active identities, samples, GET proofs and POST classes agree")


if __name__ == "__main__":
    main()
