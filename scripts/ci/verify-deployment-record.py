#!/usr/bin/env python3
"""Validate a sanitized deployment record against repository contracts."""

from __future__ import annotations

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
    require(len(sys.argv) == 2, "usage: verify-deployment-record.py RECORD")
    record_path = (ROOT / sys.argv[1]).resolve()
    require(record_path.is_relative_to(ROOT), "record outside repository")
    record = read_json(record_path)

    require(record.get("schemaVersion") == 1, "schemaVersion")
    require(record.get("status") == "DEPLOYED_VERIFIED", "deployment status")
    require(record.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(not (walk_keys(record) & FORBIDDEN_KEYS), "sensitive or tenant key in sanitized record")

    source_path = (ROOT / record.get("sourceReleaseManifest", "")).resolve()
    require(source_path.is_relative_to(ROOT) and source_path.is_file(), "source manifest")
    source = read_json(source_path)
    require(record.get("candidateCommit") == source.get("candidateCommit"), "candidate commit drift")
    require(record.get("deploymentOrder") == source.get("deploymentOrder"), "source deployment order drift")
    require(source.get("migrationRequired") is False, "migration guard")
    require(source.get("workerChanged") is False, "worker guard")
    require(source.get("automaticReplayForbidden") is True, "replay guard")

    artifacts = record.get("artifacts", {})
    for dotted in (
        ("api", "packageSha256"),
        ("api", "manifestSha256"),
        ("api", "entrySha256"),
        ("frontend", "packageSha256"),
        ("frontend", "manifestSha256"),
        ("frontend", "launcherSha256"),
    ):
        require(bool(SHA256.fullmatch(artifacts.get(dotted[0], {}).get(dotted[1], ""))),
                f"invalid {'.'.join(dotted)}")
    require(bool(artifacts.get("frontend", {}).get("buildId")), "frontend buildId")
    require(artifacts.get("worker") == {"preserved": True}, "worker preservation")

    pm2 = record.get("pm2", {})
    require(pm2.get("savedExactlyOnce") is True, "pm2 save count")
    require(bool(SHA256.fullmatch(pm2.get("dumpSha256", ""))), "pm2 dump hash")
    require(bool(SHA256.fullmatch(pm2.get("rollbackSha256", ""))), "rollback hash")

    verification = record.get("verification", {})
    require(verification.get("namedPredicatesPersistedBeforeDecision") is True,
            "named predicate evidence")
    require(verification.get("consecutiveIdentitySamples") == 3, "identity samples")
    require(verification.get("apiHealthBeforeFrontend") is True, "API-before-frontend health")
    negative = verification.get("tenantNegativeIsolation", {})
    require(negative.get("method") == "GET_ONLY", "tenant isolation method")
    require(negative.get("result") == "HTTP_200_UNKNOWN_NO_CROSS_TENANT_DATA",
            "tenant isolation result")
    require(verification.get("authenticatedCrmAndInboxSmoke") is True, "authenticated smoke")

    mutations = record.get("windowMutations", {})
    require(mutations == {"postRequests": 0, "imports": 0, "sqlStatements": 0, "migrations": 0},
            "window must remain read-only for data")
    require(record.get("durablePositiveRecovery") ==
            "LIVE_DEFERRED_UNTIL_FIRST_LEGITIMATE_IMPORT_GET_ONLY",
            "positive recovery disposition")
    require(record.get("historical993") == "LEGACY_UNCORRELATED_NOT_CLAIMED",
            "historical 993 disposition")

    state = read_json(ROOT / "docs/saas/CURRENT_STATE.json")
    require(state.get("production", {}).get("status") == record.get("status"), "current state status")
    require(state.get("production", {}).get("api", {}).get("entrySha256") ==
            artifacts["api"]["entrySha256"], "current API identity")
    require(state.get("production", {}).get("frontend", {}).get("buildId") ==
            artifacts["frontend"]["buildId"], "current frontend identity")
    require(state.get("production", {}).get("pm2", {}).get("dumpSha256") ==
            pm2["dumpSha256"], "current PM2 dump")
    require(state.get("production", {}).get("pm2", {}).get("rollbackSha256") ==
            pm2["rollbackSha256"], "current rollback")

    print("DEPLOYMENT_RECORD_OK: artifact identities, read-only validation and rollback pinned")


if __name__ == "__main__":
    main()
