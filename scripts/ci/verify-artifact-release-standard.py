#!/usr/bin/env python3
"""Keep permanent artifact-release safeguards present in canonical documentation."""

import hashlib
import json

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "runbook": ROOT / "docs/saas/ARTIFACT_RELEASE_RUNBOOK.md",
    "standard": ROOT / "docs/saas/ARTIFACT_RELEASE_ENGINEERING_STANDARD.md",
    "handoff": ROOT / "docs/saas/releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_HANDOFF.md",
}
REQUIRED = {
    "runbook": [
        "PRE_SELECTION_SNAPSHOT",
        "nunca relê o PID original",
        "candidate_owns_listening_socket",
        "server.started",
        "allowlist fixa",
        "sincronizado antes de qualquer rollback",
        "END_TO_END_COMBINED_RELEASE_FIXTURE_PASS",
        "snapshot frontend é state-bound ao S1",
    ],
    "standard": [
        "CANONICAL / CI GUARDED",
        "TS6059",
        "Turbopack",
        "tarfile.data_filter",
        "umask 0022",
        "FileExistsError",
        "PRE_SELECTION_SNAPSHOT",
        "proibido de reler",
        "candidate_owns_listening_socket",
        "server.started",
        "allowlist fixa",
        "Fixtures obrigatórios",
        "Encadeamento state-bound API → frontend",
        "END_TO_END_COMBINED_RELEASE_FIXTURE_PASS",
    ],
    "handoff": [
        "COMPLETED / HISTORICAL / DO NOT EXECUTE",
        "Correção do verificador antes de nova seleção API",
        "PRE_SELECTION_SNAPSHOT",
        "nenhuma função tenta reler",
        "candidate_owns_listening_socket",
        "allowlist fixa",
        "relatório completo antes de decidir",
    ],
}

for label, path in FILES.items():
    if not path.is_file():
        raise SystemExit(f"ARTIFACT_RELEASE_STANDARD_INVALID: missing {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")
    for marker in REQUIRED[label]:
        if marker not in text:
            raise SystemExit(
                f"ARTIFACT_RELEASE_STANDARD_INVALID: {label} missing marker {marker!r}"
            )

rehearsal_record = (
    ROOT
    / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_COMBINED_REHEARSAL.json"
)
if not rehearsal_record.is_file():
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: combined rehearsal record missing")
record = json.loads(rehearsal_record.read_text(encoding="utf-8"))
fixture = ROOT / record["fixture"]["path"]
fixture_sha = hashlib.sha256(fixture.read_bytes()).hexdigest()
if fixture_sha != record["fixture"]["sha256"]:
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: combined fixture hash")
if record["fixture"]["result"] != "END_TO_END_COMBINED_RELEASE_FIXTURE_PASS":
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: combined fixture result")
if record["stateTransitions"] != {
    "success": ["S0", "S1", "S2", "S3"],
    "negativeAndRollback": ["S0", "S1", "S2_DENIED", "R"],
}:
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: combined state transitions")

artifact_record_path = (
    ROOT
    / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_ARTIFACT_BOUND.json"
)
artifact_record = json.loads(artifact_record_path.read_text(encoding="utf-8"))
artifact_fixture = ROOT / "scripts/ci/verify-artifact-bound-combined-release.py"
if hashlib.sha256(artifact_fixture.read_bytes()).hexdigest() != (
    "63fdd2e1c5f8b9eab4e480853e6127f2a914ba012a3ef9355885f6817fdcad8f"
):
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: artifact-bound fixture hash")
if artifact_record["status"] != "ARTIFACT_BOUND_COMBINED_RELEASE_READY":
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: artifact-bound status")
if artifact_record["policy"] != {
    "file": "permanent-policy.proposed.private.json",
    "sha256": "10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a",
    "fixesPriorControlHash": False,
    "acceptsFreshControlWithoutChange": True,
    "candidateRoleMatchesControlTuple": True,
    "predicate": "permanent_run_scope",
}:
    raise SystemExit("ARTIFACT_RELEASE_STANDARD_INVALID: artifact-bound policy")

print("ARTIFACT_RELEASE_STANDARD_OK: documentation, combined and artifact-bound rehearsals")
