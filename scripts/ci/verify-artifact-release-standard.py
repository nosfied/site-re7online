#!/usr/bin/env python3
"""Keep permanent artifact-release safeguards present in canonical documentation."""

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
    ],
    "handoff": [
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

print("ARTIFACT_RELEASE_STANDARD_OK: runbook, engineering standard and active handoff")
