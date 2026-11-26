#!/usr/bin/env python3
"""Validate the canonical immutable-release operating model."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAX_DEPLOY_RUNBOOK_LINES = 340


def require(value, reason):
    if not value:
        raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")


def markdown_section(document, heading):
    """Return one exact Markdown section instead of searching the whole file."""
    match = re.search(
        rf"(?ms)^{re.escape(heading)}\n(?P<body>.*?)(?=^#{{2,3}}\s|\Z)",
        document,
    )
    if match is None:
        raise ValueError(f"missing section: {heading}")
    return match.group("body")


def validate_first_cutover_temporal_roles(section):
    """Validate authority ownership and time, not merely marker presence."""
    blocks = re.findall(
        r"(?ms)^\*\*([A-D])\.\s+([^*]+)\*\*\s*(.*?)"
        r"(?=^\*\*[A-D]\.\s|\Z)",
        section,
    )
    if [label for label, _title, _body in blocks] != list("ABCD"):
        raise ValueError("temporal authority blocks must be ordered A through D")
    roles = {label: (title.strip(), body.strip()) for label, title, body in blocks}
    historical = " ".join(roles["A"])
    future = " ".join(roles["B"])
    journal = " ".join(roles["C"])
    successor = " ".join(roles["D"])
    if not all(value in historical for value in (
        "CB3721D4", "ED74", "41D", "`immediateRollbackReleases=41D`",
        "`rollbackReleases` continua protegendo 41D",
    )):
        raise ValueError("historical graph does not preserve CB/ED74/41D roles")
    if "#444" in historical or "candidate=A+B" in historical:
        raise ValueError("future roles leaked into the historical graph")
    if not all(value in future for value in (
        "schema 6", "`predecessorReleases=CB3721D4`", "`candidate=A+B`",
        "`runtimeManifest.rollbackReleases=#444`", "não reescrevem o grafo histórico",
    )):
        raise ValueError("future transition roles are incomplete or misbound")
    if not all(value in journal for value in (
        "quiesce", "fotografia final", "aggregate", "promoção", "rollback",
        "compromisso durável",
    )):
        raise ValueError("operation journal does not own every transition effect")
    if not all(value in successor for value in (
        "depois dos efeitos comprovados", "autoridade canônica",
        "nunca é requisito retroativo",
    )):
        raise ValueError("successor graph publication boundary is incomplete")


def validate_first_cutover_document_set(documents):
    """Cross-check the same temporal boundary at each canonical consumer."""
    durable = markdown_section(
        documents["durable"], "### Papéis temporais do primeiro cutover"
    )
    validate_first_cutover_temporal_roles(durable)

    runbook = markdown_section(documents["runbook"], "## Preflight (`preflight`)")
    if not (runbook.index("última ativação concluída") <
            runbook.index("não substituir antecipadamente") <
            runbook.index("runtime schema 6") <
            runbook.index("efeitos concluídos")):
        raise ValueError("runbook does not preserve historical → plan → successor order")

    model_start = documents["model"].index(
        "No primeiro cutover durável, a fotografia operacional de entrada"
    )
    model_end = documents["model"].index("\n\n1. Produzir", model_start)
    model = documents["model"][model_start:model_end]
    if not all(value in model for value in (
        "`activeReleases` e `immediateRollbackReleases`",
        "runtime schema 6", "não pode exigir", "efeitos canônicos",
    )):
        raise ValueError("operating model temporal boundary is incomplete")

    lifecycle = markdown_section(
        documents["lifecycle"],
        "## Matriz obrigatória produtor → consumidor → fase → host",
    )
    authority_positions = [lifecycle.index(f"({label})") for label in "ABCD"]
    if authority_positions != sorted(authority_positions):
        raise ValueError("artifact lifecycle authority order is inconsistent")
    if not all(value in lifecycle for value in (
        "41D é o rollback imediato", "CB é predecessora", "A+B",
        "#444", "efeitos realmente observados", "efeitos comprovados",
    )):
        raise ValueError("artifact lifecycle omits a temporal authority binding")

    backlog_start = documents["backlog"].index(
        "O preflight deve distinguir quatro fotografias"
    )
    backlog_end = documents["backlog"].index("\n\n## ", backlog_start)
    backlog = documents["backlog"][backlog_start:backlog_end]
    ordered = (
        "estado operacional vigente", "plano de\ntransição futura",
        "journal\nregistra", "fechamento\ncanônico posterior",
    )
    positions = [backlog.index(value) for value in ordered]
    if positions != sorted(positions) or "É regressão P00-D exigir" not in backlog:
        raise ValueError("P00-D backlog does not preserve the four photographs")


def validate_first_cutover_rollback_windows(documents):
    """Reject release-local recovery after aggregate, including outside A-D."""
    contract = (
        "Contrato temporal de recuperação: antes de `AGGREGATE_VERIFIED`, CB "
        "somente quando segura; de `AGGREGATE_VERIFIED` até "
        "`CANDIDATE_API_HEALTHY`, #444 sem retorno release-local; depois de "
        "`CANDIDATE_API_HEALTHY`, somente rollback durável. "
        "`AGGREGATE_VERIFIED` não é o compromisso irrevogável."
    )
    contradiction = re.compile(
        r"(?is)antes\s+(?:dela|do\s+compromisso|de\s+`?CANDIDATE_API_HEALTHY`?)"
        r".{0,160}?(?:retoma|retorna|recupera).{0,40}?\bCB\b"
    )
    for name, document in documents.items():
        normalized = " ".join(document.split())
        if contract not in normalized:
            raise ValueError(f"rollback_window_contract_missing:{name}")
        if contradiction.search(document):
            raise ValueError(f"rollback_window_release_local_after_aggregate:{name}")


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
require("predecessorReleases" in runbook and "CANDIDATE_API_HEALTHY" in runbook,
        "first durable cutover temporal roles")
for marker in ("preflight", "activate", "finalize", "rollback", "status",
               "PREFLIGHT PASS", "AWAITING_ACCEPTANCE", "DEPLOYED", "ROLLED_BACK",
               "generation-retirement.py", "DEPLOYED_SANITIZED",
               "failureEvidenceBytes", "P00"):
    require(marker in runbook, f"deploy runbook marker {marker}")
for marker in ('choices=("preflight", "activate", "finalize", "rollback", "status")',
               "pm2-definition-control.py", '"wait-existing-readiness"',
               '"--runtime-manifest"', '["restart", name]', '"ACEITE TÉCNICO PASS"',
               'SUPPORTED_COMPONENT_SETS = (("api",), COMPONENTS, THREE_COMPONENTS)',
               'payload["components"] = list(self.inputs.components)',
               'if component == "worker":',
               '["delete", name]', '["start", str(definition), "--only", name]',
               '"validate-pair", *arguments',
               '"--deployment-lock-fd", str(EXTERNAL_LOCK_FD)',
               'pass_fds=(EXTERNAL_LOCK_FD,), env=environment',
               '"predecessorReleases"', '"durableRollbackReleases"',
               '"boundary": "CANDIDATE_API_HEALTHY"'):
    require(marker in driver, f"minimal deploy driver marker {marker}")
for forbidden in ('"--update-env"',):
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
    'READINESS_DEADLINES = {"api": 30.0, "frontend": 30.0, "worker": 30.0}',
    "READINESS_POLL_MAX_SECONDS = 0.5",
    "READINESS_STABLE_SAMPLES = 3",
    'commands.add_parser("wait-readiness")',
    'commands.add_parser("wait-worker-readiness")',
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
lifecycle = (ROOT / "docs/saas/DEPLOY_ARTIFACT_LIFECYCLE.md").read_text()
for marker in (
    "Matriz obrigatória produtor → consumidor → fase → host",
    "JSON com LF fora da serialização canônica",
    "Gate V5 ausente no host consumidor",
    "predecessora confundida com rollback durável",
    "CI verde isolada não substitui essa prova",
):
    require(marker in lifecycle, f"P00-D interface matrix marker {marker}")

durable_persistence = (
    ROOT / "docs/saas/DURABLE_RUNTIME_PERSISTENCE_2026-11-21.md"
).read_text()
p00d_backlog = (
    ROOT / "docs/saas/backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md"
).read_text()
first_cutover_documents = {
    "runbook": runbook,
    "model": model,
    "durable": durable_persistence,
    "lifecycle": lifecycle,
    "backlog": p00d_backlog,
}
try:
    validate_first_cutover_document_set(first_cutover_documents)
    validate_first_cutover_rollback_windows(first_cutover_documents)
except (ValueError, KeyError) as error:
    require(False, f"first cutover documentary semantics: {error}")

negative_fixture = (
    ROOT / "scripts/ci/fixtures/first-cutover-temporal-role-contradiction.md"
).read_text()
try:
    validate_first_cutover_temporal_roles(markdown_section(
        negative_fixture, "### Papéis temporais do primeiro cutover"
    ))
except ValueError:
    pass
else:
    require(False, "contradictory first-cutover documentary fixture was accepted")

rollback_window_fixture = (
    ROOT / "scripts/ci/fixtures/first-cutover-rollback-window-contradiction.md"
).read_text()
try:
    validate_first_cutover_rollback_windows({"fixture": rollback_window_fixture})
except ValueError as error:
    require(str(error) == "rollback_window_release_local_after_aggregate:fixture",
            f"unexpected rollback-window negative predicate: {error}")
else:
    require(False, "release-local recovery after aggregate was accepted")

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
