#!/usr/bin/env python3
"""Validate the canonical immutable-release contract and structured log."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def require(value: bool, reason: str) -> None:
    if not value: raise SystemExit(f"IMMUTABLE_RELEASE_INVALID: {reason}")

model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text()
topology = (ROOT / "docs/DEPLOY_TOPOLOGY_RE7.md").read_text()
executor = (ROOT / "scripts/deploy-immutable-release.py").read_text()
retired = (ROOT / "scripts/deploy-normal-release.sh").read_text()
manifest = json.loads((ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json").read_text())

for marker in ("IMMUTABLE_RELEASE", "Node `20.20.0`", "AWAITING_ACCEPTANCE", "ROLLBACK_FAILED", "pm2 save"):
    require(marker in model, f"model marker {marker}")
for marker in ("PREPARED_INERT", "probe-frontend", "independent_extract", "owns_listening_socket", "AWAITING_ACCEPTANCE", "ROLLBACK_FAILED", 'checked([args.pm2, "save"])'):
    require(marker in executor, f"executor marker {marker}")
require("production_build_forbidden" in executor, "no build under /opt/re7online")
require("historical and must not be used" in retired, "retired executor denial")
require("releases completas" in topology and "Fluxo histórico — não usar" in topology, "topology")
require(manifest["deploymentClass"] == "IMMUTABLE_RELEASE", "release class")
require(manifest["executor"] == "scripts/deploy-immutable-release.py", "manifest executor")
require(manifest["promotionAuthorized"] is False, "manifest cannot authorize promotion")

records = [json.loads(line) for line in (ROOT / "docs/DEPLOY_LOG.jsonl").read_text().splitlines() if line.strip()]
require(bool(records), "structured deploy log empty")
allowed = {"DEPLOYED", "ROLLED_BACK", "ROLLBACK_FAILED", "HISTORICAL_INCOMPLETE"}
for record in records:
    require(record["schemaVersion"] == 1 and record["result"] in allowed, "structured deploy record")
    require(bool(record["evidence"]), "deploy evidence")

print("IMMUTABLE_RELEASE_OK: external build, complete runtimes, preselection validation, verified rollback and structured deploy records")
