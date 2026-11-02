#!/usr/bin/env python3
"""Validate the canonical immutable-release operating model."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAX_DEPLOY_RUNBOOK_LINES = 340


def require(value, reason):
    if not value:
        raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")


model = (ROOT / "docs/saas/DEPLOYMENT_OPERATING_MODEL.md").read_text()
for marker in (
    "define a arquitetura e os princípios vigentes",
    "build ocorre uma única vez",
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
    "DEPLOY_RUNBOOK.md",
    "scripts/converta-deploy.py",
    "scripts/converta-release.py",
    "P00_TENANT_ISOLATION_RECOVERY",
):
    require(marker in model, f"operating model marker {marker}")
require("não utilizáveis" in model, "obsolete mechanisms")
require("executor de ativação temporário em `/tmp`" in model,
        "temporary activation executor retired")
require("scripts/frontend-finalization-continuation.py" in model and
        "scripts/fixed-current-finalization-continuation.py" in model and
        "Wrappers inline ou improvisados são proibidos" in model,
        "canonical continuation entries")
runbook = (ROOT / "docs/saas/DEPLOY_RUNBOOK.md").read_text()
driver = (ROOT / "scripts/converta-deploy.py").read_text()
producer = (ROOT / "scripts/converta-release.py").read_text()
capacity_recovery = (ROOT / "scripts/capacity-recovery.py").read_text()
root_policy = json.loads((ROOT / "config/deploy-artifact-roots.json").read_text())
require(root_policy.get("schemaVersion") == 1, "deployment artifact root policy schema")
require({key: value["path"] for key, value in root_policy["canonicalRoots"].items() if key != "evidence"} == {
    "repository": "/opt/re7online/site-re7online",
    "worktrees": "/opt/re7online/build-worktrees",
    "outputs": "/opt/re7online/build-output",
    "releases": "/opt/re7online/releases",
    "staging": "/opt/re7online/staging",
}, "deployment artifact root policy paths")
require([item["path"] for item in root_policy["canonicalRoots"]["evidence"]] ==
        ["/opt/re7online/backups/converta-persistent"], "deployment evidence root policy")
require(len(runbook.splitlines()) <= MAX_DEPLOY_RUNBOOK_LINES,
        f"bounded deploy runbook size (maximum {MAX_DEPLOY_RUNBOOK_LINES} lines)")
require("scripts/frontend-finalization-continuation.py" in runbook and
        "scripts/fixed-current-finalization-continuation.py" in runbook and
        "wrappers inline" in runbook,
        "runbook continuation entries")
for marker in ("preflight", "activate", "finalize", "rollback", "status",
               "PREFLIGHT PASS", "AWAITING_ACCEPTANCE", "DEPLOYED", "ROLLED_BACK",
               "generation-retirement.py", "DEPLOYED_SANITIZED",
               "failureEvidenceBytes", "P00"):
    require(marker in runbook, f"deploy runbook marker {marker}")
for marker in ('choices=("preflight", "activate", "finalize", "rollback", "status")',
               "pm2-definition-control.py", '"wait-existing-readiness"',
               '"--runtime-manifest"', '["restart", name]', '"ACEITE TÉCNICO PASS"',
               'SUPPORTED_COMPONENT_SETS = (("api",), COMPONENTS)',
               'payload["components"] = ["api"]',
               '"--deployment-lock-fd", str(EXTERNAL_LOCK_FD)',
               'pass_fds=(EXTERNAL_LOCK_FD,), env=environment'):
    require(marker in driver, f"minimal deploy driver marker {marker}")
for forbidden in ('pm2_mutate(pm2, ["delete"', 'pm2_mutate(pm2, ["start"',
                  '"--update-env"', '"validate-pair"'):
    require(forbidden not in driver, f"fixed-current driver forbidden marker {forbidden}")
for marker in ('add_parser("build")', 'add_parser("verify")', 'SOURCE_DATE_EPOCH',
               '"schemaVersion": 1', 'RELEASE VERIFIED',
               'generation-artifacts.private.json', 'CAPACITY_OBSERVATION_MARGIN_SOURCE',
               'CapacityPhaseMonitor', 'observedBelowProtected',
               'repo_outside_canonical_build_worktrees',
               '--p00-static-floor-override', 'P00_TENANT_ISOLATION_RECOVERY'):
    require(marker in producer, f"external release producer marker {marker}")
for marker in ('add_parser("audit")', 'add_parser("prepare")', 'add_parser("execute")',
               'NPM_CACHE_MAINTENANCE', 'DERIVED_OUTPUT_RUNTIME',
               'CLOSED_PREPARATION_MANIFEST_DISPOSITION',
               'capture_live_operational', 'npm-cli.js',
               '_status_uids', '_proc_start_ticks', 'kernelThreadsIgnored',
               'NPM_CACHE_ALLOWED_MODES = {0o700, 0o750, 0o755}',
               'LITERAL_RM = ("/usr/bin/rm", "-r", "--")',
               'SEALED_FOR_EXPLICIT_AUTHORIZATION', 'AUTHORIZE_ONCE'):
    require(marker in capacity_recovery, f"capacity recovery marker {marker}")
require("CAPACITY_RECOVERY_POLICY.md" in runbook,
        "runbook canonical capacity recovery policy")
control = (ROOT / "scripts/pm2-definition-control.py").read_text()
for marker in (
    'READINESS_DEADLINES = {"api": 30.0, "frontend": 30.0}',
    "READINESS_POLL_MAX_SECONDS = 0.5",
    "READINESS_STABLE_SAMPLES = 3",
    'commands.add_parser("wait-readiness")',
    'READINESS_TIMEOUT:{component}:{port}',
):
    require(marker in control, f"versioned readiness marker {marker}")
frontend_executor = (ROOT / "scripts/frontend-only-activation.sh").read_text()
for marker in (
    "wait-existing-readiness", "--report", "READINESS_OBSERVABILITY_DEFECT",
    "AWAITING_ACCEPTANCE", "ROLLED_BACK", "handoff_lock", "finalize_frontend_only",
    "DEPLOYED_RETENTION_INCOMPLETE",
):
    require(marker in frontend_executor, f"frontend-only executor marker {marker}")
continuation = (ROOT / "scripts/frontend-finalization-continuation.py").read_text()
for marker in (
    "os.O_RDWR | getattr(os, \"O_NOFOLLOW\", 0)",
    "fcntl.LOCK_EX | fcntl.LOCK_NB",
    "os.dup2(fd, 9, inheritable=True)",
    'environment["RE7_DEPLOYMENT_LOCK_HELD"] = "1"',
    'if state.get("state") != "AWAITING_ACCEPTANCE" or state.get("saveCount") != 0',
    '["/usr/bin/bash", "--noprofile", "--norc", str(executor), "finalize"]',
):
    require(marker in continuation, f"frontend continuation marker {marker}")
fixed_continuation = (ROOT / "scripts/fixed-current-finalization-continuation.py").read_text()
for marker in (
    "os.O_WRONLY | os.O_CREAT | os.O_EXCL",
    "fcntl.LOCK_EX | fcntl.LOCK_NB",
    "os.dup2(fd, LOCK_FD, inheritable=True)",
    'environment[LOCK_ENV] = "1"',
    "stdout=stdout_fd, stderr=stderr_fd",
    "pass_fds=(lock_fd,)",
):
    require(marker in fixed_continuation, f"fixed-current continuation marker {marker}")
fixture = json.loads((ROOT / "scripts/ci/fixtures/pm2-readiness-race.sanitized.json").read_text())
require(fixture["classification"] == "READINESS_RACE_SINGLE_SAMPLE",
        "readiness incident classification")
require(fixture["observedDelaySeconds"] >= 4 and not fixture["containsEnvironmentValues"],
        "sanitized readiness evidence")
state = json.loads((ROOT / "docs/saas/CURRENT_STATE.json").read_text())
require(state["canonicalTopology"] == {
    "build": "BUILD_ONCE_ISOLATED_NODE_20_20_0_NPM_10_8_2",
    "releaseModel": "IMMUTABLE_VERSIONED_RELEASE",
    "promotionOrder": ["api", "frontend", "worker_when_impacted"],
    "frontendMode": "FORK_MODE_SINGLE_INSTANCE_DIRECT_NEXT",
    "smoke": "GET_ONLY",
    "rollback": "RESTORE_SYMLINKS_AND_RESTART_EXISTING_PM2_RECORDS",
}, "canonical topology")
require(state["historicalDeployV2"]["status"] ==
        "FROZEN_FUTURE_IMPROVEMENT_NOT_RELEASE_GATE", "Deploy V2 frozen")
print("DEPLOYMENT_OPERATING_MODEL_OK: immutable fixed-path release is the sole active route")
