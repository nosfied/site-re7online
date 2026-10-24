#!/usr/bin/env python3
"""Ensure the retired normal-release path is not presented as canonical."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text()
topology = (ROOT / "docs/DEPLOY_TOPOLOGY_RE7.md").read_text()
checklist = (ROOT / "docs/saas/RELEASE_CHECKLIST.md").read_text()


def require(value, reason):
    if not value:
        raise SystemExit(f"DEPLOY_ROUTE_INVALID: {reason}")


for marker in (
    "build ocorre uma única vez",
    "/opt/re7online/current/api",
    "/opt/re7online/current/frontend",
    "fork_mode",
    "pm2 save",
    "scripts/deploy-normal-release.sh",
    "PR #190",
):
    require(marker in model, f"model marker {marker}")
require("não utilizáveis" in model, "obsolete classification")
require("checkout produtivo não é runtime" in topology, "checkout retirement")
require("Não executar build no checkout/runtime ativo" in checklist and
        "Build na VPS é o padrão autorizado pelo owner" in checklist,
        "isolated build boundary")
require("wait-readiness" in checklist and "READINESS_TIMEOUT:<component>:<port>" in checklist,
        "versioned readiness gate")
print("DEPLOY_ROUTE_OK: immutable fixed-path topology is canonical; normal-release is obsolete")
