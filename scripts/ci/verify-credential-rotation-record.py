#!/usr/bin/env python3
"""Validate the sanitized active OBS-2 rotation record."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {
    "variableName", "value", "secret", "token", "authorization", "cookie",
    "tenantId", "operationUuid",
}


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"CREDENTIAL_ROTATION_RECORD_INVALID: {reason}")


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


def main() -> None:
    require(len(sys.argv) == 2,
            "usage: verify-credential-rotation-record.py RECORD")
    path = (ROOT / sys.argv[1]).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), "record path")
    record = read_json(path)
    require(record.get("schemaVersion") == 1, "schemaVersion")
    require(record.get("status") ==
            "OBS2_CONTINGENCY_CLOSED_SAFE_RETURN_READY_OBS1_PENDING",
            "status")
    require(record.get("operationType") == "CREDENTIAL_ROTATION",
            "operation type")
    require(not (walk_keys(record) & FORBIDDEN_KEYS),
            "sensitive key in sanitized record")

    base = record.get("baseDeploymentRecord", {})
    base_path = (ROOT / base.get("path", "")).resolve()
    require(base_path.is_relative_to(ROOT) and base_path.is_file(), "base record")
    require(base.get("sha256") == sha256(base_path), "base record hash")

    scope = record.get("scope", {})
    require(scope == {
        "alias": "OBS-2",
        "genericType": "LOCAL_OAUTH_STATE_HMAC_SECRET",
        "exposureCategoryMeaning":
            "OBSERVABILITY_WAS_THE_EXPOSURE_CHANNEL_NOT_THE_CREDENTIAL_TYPE",
        "obs1": "PENDING_UNTOUCHED",
        "providerCredentialChanged": False,
        "frontendChanged": False,
        "workerChanged": False,
    }, "scope and OBS-1 exclusion")

    artifacts = record.get("artifactsPreserved", {})
    require(bool(SHA256.fullmatch(
        artifacts.get("api", {}).get("entrySha256", ""))), "API entry identity")
    require(bool(artifacts.get("frontend", {}).get("buildId")),
            "frontend build identity")
    require(artifacts.get("worker") == {"preserved": True},
            "worker preservation")

    observed = record.get("observedProcesses", {})
    require(all(isinstance(observed.get(key), int) and observed[key] > 0 for key in (
        "apiPid", "apiStartTicks", "frontendPid", "frontendStartTicks",
        "workerPid", "workerStartTicks",
    )), "dated process observations")

    verification = record.get("verification", {})
    require(verification.get("result") == "OBS2_ROTATED_VERIFIED" and
            verification.get("samples") == 3 and
            verification.get("allNamedPredicatesPassed") is True and
            verification.get("candidateOwnsListeningSocket") is True and
            verification.get("listeningPort") == 3001 and
            verification.get("localHealthHttp") == 200 and
            verification.get("publicHealthHttp") == 200 and
            verification.get("frontendAndWorkerIdentitiesPreserved") is True and
            verification.get("oauthErrorsObserved") == 0 and
            verification.get("rollbackExecuted") is False,
            "runtime verification")
    oauth = verification.get("oauthStateStart", {})
    require(oauth == {
        "httpStatus": 200,
        "statePresent": True,
        "stateValueRecorded": False,
        "providerAuthorizationCompleted": False,
    }, "OAuth state proof boundary")

    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True and pm2.get("dumpMode") == "0600",
            "PM2 save and mode")
    require(all(bool(SHA256.fullmatch(pm2.get(key, ""))) for key in (
        "dumpSha256", "rollbackSha256",
    )), "PM2 identities")
    require(pm2.get("dumpSha256") == pm2.get("rollbackSha256"),
            "post-rotation return must match current dump")
    closure = record.get("contingencyClosure", {})
    require(closure.get("status") == "OBS2_PREVIOUS_VALUE_DESTROYED" and
            closure.get("previousValueDestroyed") is True and
            closure.get("knownPreviousCopiesRemoved") == 10 and
            closure.get("restartExecuted") is False and
            closure.get("pm2SaveExecuted") is False,
            "contingency closure")
    previous = closure.get("previousRollback", {})
    require(previous.get("classification") ==
            "NON_EXECUTABLE_EXPOSED_SECRET" and
            previous.get("disposition") == "REMOVED",
            "previous rollback disposition")

    mutations = record.get("windowMutations", {})
    require(mutations == {
        "oauthStateStartRequests": 1,
        "providerAuthorizationsCompleted": 0,
        "csvPostRequests": 0,
        "imports": 0,
        "sqlStatements": 0,
        "migrations": 0,
        "frontendChanges": 0,
        "workerChanges": 0,
    }, "window mutation boundary")
    require(bool(SHA256.fullmatch(record.get("privateEvidenceSha256", ""))),
            "private evidence identity")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(
        state.get("credentialInspectionIncident", {}).get("obs2Record")
        == path.relative_to(ROOT).as_posix(),
        "OBS-2 historical record link",
    )
    require(state.get("credentialInspectionIncident", {}).get("obs2") ==
            "CONTINGENCY_CLOSED_SAFE_RETURN_READY", "OBS-2 canonical status")
    production = state.get("production", {})
    require(production.get("api", {}).get("entrySha256") ==
            artifacts.get("api", {}).get("entrySha256"), "preserved API identity")
    require(production.get("frontend", {}).get("buildId") ==
            artifacts.get("frontend", {}).get("buildId"), "preserved frontend identity")
    require(production.get("worker", {}).get("preserved") is True,
            "preserved worker identity")
    require(production.get("pm2", {}).get("previousRollbackSha256") ==
            pm2.get("dumpSha256"), "OBS-2 return retained in rollback lineage")
    print("CREDENTIAL_ROTATION_RECORD_OK: OBS-2 contingency closed; OBS-1 untouched")


if __name__ == "__main__":
    main()
