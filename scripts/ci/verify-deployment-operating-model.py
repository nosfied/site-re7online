#!/usr/bin/env python3
"""Validate the canonical immutable-release operating model."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def require(value, reason):
    if not value:
        raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")


model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text()
for marker in (
    "única fonte de instrução operacional vigente",
    "build ocorre fora da VPS",
    "/opt/re7online/releases",
    "/opt/re7online/current/api",
    "/opt/re7online/current/frontend",
    "fork_mode",
    "uma instância",
    "GET/read-only",
    "pm2 save",
    "scripts/deploy-normal-release.sh",
    "pipeline experimental da PR #190",
    "cluster_mode",
    "Metadados de introspecção do PM2 nunca são uma definição executável",
    "pm2-definition-control.py",
    "validate-pair",
    "O digest da configuração não é autenticação da fonte",
    "identidades imutáveis de release",
    "pm_cwd`/`pm_exec_path` lexicais",
    "-<pm_id>.log",
    "wait-readiness",
    "READINESS_TIMEOUT:<component>:<port>",
    "prazo monotônico de 30",
    "polling de no máximo 500 ms",
    "três amostras consecutivas",
):
    require(marker in model, f"operating model marker {marker}")
require("não utilizáveis" in model, "obsolete mechanisms")
require("executor de ativação temporário em `/tmp`" in model,
        "temporary activation executor retired")
control = (ROOT / "scripts/pm2-definition-control.py").read_text()
for marker in (
    'READINESS_DEADLINES = {"api": 30.0, "frontend": 30.0}',
    "READINESS_POLL_MAX_SECONDS = 0.5",
    "READINESS_STABLE_SAMPLES = 3",
    'commands.add_parser("wait-readiness")',
    'READINESS_TIMEOUT:{component}:{port}',
):
    require(marker in control, f"versioned readiness marker {marker}")
fixture = json.loads((ROOT / "scripts/ci/fixtures/pm2-readiness-race.sanitized.json").read_text())
require(fixture["classification"] == "READINESS_RACE_SINGLE_SAMPLE",
        "readiness incident classification")
require(fixture["observedDelaySeconds"] >= 4 and not fixture["containsEnvironmentValues"],
        "sanitized readiness evidence")
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
require(state["canonicalTopology"] == {
    "build": "EXTERNAL_LINUX_X86_64_NODE_20_20_0_NPM_10_8_2",
    "releaseModel": "IMMUTABLE_VERSIONED_RELEASE",
    "promotionOrder": ["api", "frontend", "worker_when_impacted"],
    "frontendMode": "FORK_MODE_SINGLE_INSTANCE_DIRECT_NEXT",
    "smoke": "GET_ONLY",
    "rollback": "RESTORE_SYMLINKS_AND_FULL_PM2_DEFINITIONS",
}, "canonical topology")
require(state["historicalDeployV2"]["status"] ==
        "FROZEN_FUTURE_IMPROVEMENT_NOT_RELEASE_GATE", "Deploy V2 frozen")
print("DEPLOYMENT_OPERATING_MODEL_OK: immutable fixed-path release is the sole active route")
