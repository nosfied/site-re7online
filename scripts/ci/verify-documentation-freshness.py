#!/usr/bin/env python3
"""Reject stale release identities and superseded status in active documentation."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEW_RECORD = "docs/saas/releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json"
OLD_RECORD = "CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json"
OLD_BUILD_ID = "7IRWBhOwtCfwsLkfI9S0K"
STALE_STATUSES = ("NOT DEPLOYED", "CSV SUSPENSO")


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"DOCUMENTATION_FRESHNESS_INVALID: {reason}")


def active_prefix(path: Path, historical_heading: str | None = None) -> str:
    text = path.read_text(encoding="utf-8")
    if historical_heading and historical_heading in text:
        return text.split(historical_heading, 1)[0]
    return text


def reject_stale(label: str, text: str) -> None:
    require(OLD_BUILD_ID not in text, f"{label}: previous BUILD_ID")
    require(OLD_RECORD not in text, f"{label}: previous deployment record is active")
    for status in STALE_STATUSES:
        require(status not in text, f"{label}: stale status {status}")


def main() -> None:
    state_path = ROOT / "docs/saas/CURRENT_STATE.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    require(state.get("activeDeploymentRecord") == NEW_RECORD, "active deployment record")
    require(state.get("production", {}).get("status") == "DEPLOYED_VERIFIED",
            "active production status")
    reject_stale("CURRENT_STATE.json", state_path.read_text(encoding="utf-8"))
    reject_stale("CURRENT_STATE.md",
                 active_prefix(ROOT / "docs/saas/CURRENT_STATE.md"))
    reject_stale("DOCUMENTATION_INDEX.md",
                 active_prefix(ROOT / "docs/saas/DOCUMENTATION_INDEX.md",
                               "## Arquivo histórico — não executar"))
    reject_stale("CRM_CSV_UX_REVIEW_2026-10-18.md",
                 active_prefix(ROOT / "docs/saas/CRM_CSV_UX_REVIEW_2026-10-18.md",
                               "## Negativa de build e correção"))

    manifest = json.loads((ROOT / "docs/saas/releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18.json").read_text(encoding="utf-8"))
    require("status" not in manifest, "release manifest has ambiguous current status")
    require(bool(manifest.get("statusAtCreation")), "release manifest creation status")
    require(manifest.get("deploymentRecord") == NEW_RECORD,
            "release manifest active deployment link")

    handoff = (ROOT / "docs/saas/releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_HANDOFF.md").read_text(encoding="utf-8")
    require("Status: `COMPLETED / HISTORICAL / DO NOT EXECUTE`." in handoff,
            "handoff historical status")
    print("DOCUMENTATION_FRESHNESS_OK: active surfaces identify the current deployment")


if __name__ == "__main__":
    main()
