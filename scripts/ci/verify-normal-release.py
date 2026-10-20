#!/usr/bin/env python3
"""Validate the small, stable NORMAL_RELEASE contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def require(value: bool, reason: str) -> None:
    if not value:
        raise SystemExit(f"NORMAL_RELEASE_INVALID: {reason}")


model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text(encoding="utf-8")
script = (ROOT / "scripts/deploy-normal-release.sh").read_text(encoding="utf-8")
manifest = json.loads((ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json").read_text(encoding="utf-8"))

for marker in ("NORMAL_RELEASE", "BREAK_GLASS", "produção viva", "DEPLOY_APPROVED_SHA", "rollback"):
    require(marker in model, f"model marker {marker}")
for marker in ("PREPARED_INERT", "DEPLOY_APPROVED_SHA", "flock -n", "pm2 save", "rollback_all", "worker was not touched"):
    require(marker in script, f"executor marker {marker}")
require("http://127.0.0.1:3000/app/login" in script, "canonical frontend health URL")
require("/opt/re7online/site-re7online" not in script, "executor must not default to the live checkout")
require('rev-parse --is-inside-work-tree' in script, "linked worktree support")
require("run db:generate" in script, "Prisma Client generation before API build")
require(
    script.index("ci --include=dev") < script.index("run db:generate") < script.index("run build"),
    "API preparation order",
)
require("/opt/re7online/deploy-control" in model, "detached control worktree")
require("failed-preparations" in model, "interrupted preparation quarantine")
require(manifest["deploymentClass"] == "NORMAL_RELEASE", "release class")
require(manifest["components"] == ["api", "frontend"], "component order")
require(all(value is False for value in manifest["changeBoundary"].values()), "change boundary")
require(manifest["executor"] == "scripts/deploy-normal-release.sh", "executor")
require(manifest["promotionAuthorized"] is False, "manifest cannot authorize itself")
require(manifest["state"] == "STAGED_INERT_NOT_DEPLOYED", "candidate state")

print("NORMAL_RELEASE_OK: isolated Prisma-generated prepare, exact-SHA activation and rollback contract")
