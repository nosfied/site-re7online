#!/usr/bin/env python3
"""Keep the artifact process available as break-glass, never as the default lane."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
paths = (
    ROOT / "docs/saas/ARTIFACT_RELEASE_RUNBOOK.md",
    ROOT / "docs/saas/ARTIFACT_RELEASE_ENGINEERING_STANDARD.md",
)
for path in paths:
    text = path.read_text(encoding="utf-8")
    for marker in ("BREAK_GLASS", "NOT DEFAULT", "DEPLOYMENT_OPERATING_MODEL.md"):
        if marker not in text[:1200]:
            raise SystemExit(f"ARTIFACT_RELEASE_STANDARD_INVALID: {path.name} missing {marker}")
    for safeguard in ("pm2 save", "rollback"):
        if safeguard.lower() not in text.lower():
            raise SystemExit(f"ARTIFACT_RELEASE_STANDARD_INVALID: {path.name} missing {safeguard}")

print("ARTIFACT_RELEASE_STANDARD_OK: break-glass guidance retained outside normal releases")

