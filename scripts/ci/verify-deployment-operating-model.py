#!/usr/bin/env python3
"""Validate the two-lane deployment model and the normal contacts release manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{64}")


def require(value: bool, reason: str) -> None:
    if not value:
        raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")


model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text(encoding="utf-8")
for marker in ("NORMAL_RELEASE", "BREAK_GLASS", "produção viva", "tenant-scoped",
               "nenhum gate novo é criado durante a janela"):
    require(marker in model, f"operating model marker {marker}")

manifest = json.loads((ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_DEPLOY_V2.json").read_text(encoding="utf-8"))
require(manifest["deploymentClass"] == "NORMAL_RELEASE", "contacts release class")
require(manifest["deploymentOrder"] == ["api", "frontend"], "deployment order")
require(all(value is False for value in manifest["changeBoundary"].values()), "change boundary")
require(manifest["runtimeStatePolicy"]["embeddedRuntimeStateForbidden"] is True,
        "runtime state must be captured at execution")
require(manifest["promotionAuthorized"] is False, "manifest must not self-authorize")
executor = manifest.get("executorContract", {})
require(executor.get("path") == "scripts/deploy-v2.py", "stable executor path")
require(executor.get("adapterContract") == "docs/saas/DEPLOY_V2_ADAPTER_CONTRACT.md",
        "adapter contract")
require(executor.get("authorizationBinds") ==
        ["manifestSha256", "executorSha256", "adapterSha256"],
        "authorization identity binding")
require(executor.get("productionAdapter") == "NOT_IMPLEMENTED",
        "production adapter claim boundary")
require((ROOT / executor["path"]).is_file(), "stable executor exists")
require((ROOT / executor["adapterContract"]).is_file(), "adapter contract exists")
for artifact in manifest["artifacts"].values():
    for key, value in artifact.items():
        if key.endswith("Sha256"):
            require(bool(SHA.fullmatch(value)), f"valid {key}")

require(set(manifest["runtimeStatePolicy"]["captureAtExecution"]) == {
    "pid", "startTicks", "cwd", "entrypoint", "pm2Dump", "rollback",
    "reportPaths", "timestamps",
}, "complete execution-time state capture")
for forbidden_key in ("observedPid", "expectedPid", "startTicks", "dumpSha256"):
    require(forbidden_key not in manifest, f"embedded live value {forbidden_key}")

candidate = json.loads((ROOT / manifest["candidateRecord"]).read_text(encoding="utf-8"))
require(candidate["releaseId"] == manifest["releaseId"], "candidate identity")
require(candidate["deploymentClass"] == "NORMAL_RELEASE", "candidate class")
require(candidate["status"] == "STAGED_INERT_NOT_DEPLOYED", "candidate state")

print("DEPLOYMENT_OPERATING_MODEL_OK: normal release separated from break-glass")

