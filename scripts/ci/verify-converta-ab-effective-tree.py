#!/usr/bin/env python3
"""Integration regression: the effective tree must retain BOTH merged Converta fronts.

PR #437 once replaced the effective tree while retaining PR #436 in Git ancestry.
Checking parent commits or individual PR CI is insufficient: inspect the checkout.
This guard is deliberately small; behavioral contracts remain in their test suites.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

REQUIRED = {
    # A: release-independent read-state and enforced deploy lifecycle.
    "apps/whatsapp-agent/src/inbox/readStateStore.ts": (
        "resolveInboxReadStateRoot", "withInboxReadStateWriteLock",
    ),
    "apps/whatsapp-agent/src/inbox/readStateReconciliation.ts": (
        "reconcileInboxReadStateRequest", "withInboxReadStateWriteLock",
    ),
    "apps/whatsapp-agent/src/inbox/readStateFileLock.ts": (
        "withInboxReadStateWriteLock",
    ),
    "scripts/durable-runtime-persistence-gate.py": (
        "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V2",
    ),
    "scripts/durable_persistence_enforcement.py": ("def enforce(",),
    "scripts/deploy-preparation-admission.py": (
        "validate_generation_boundary", "durablePersistence",
    ),
    "scripts/converta-deploy.py": ("_enforce_durable_persistence",),
    "scripts/fixed-current-acceptance-materialize.py": ("durable_persistence_enforcement",),
    "scripts/fixed-current-finalize-request-materialize.py": ("durable_persistence_enforcement",),
    "scripts/generation-retirement.py": ("enforce_durable_persistence",),
    "scripts/pm2-definition-env-allowlist.v1.json": ("INBOX_READ_STATE_ROOT",),
    "docs/saas/DURABLE_RUNTIME_PERSISTENCE_2026-11-21.md": ("INBOX_READ_STATE_ROOT",),
    # B: tenant-aware claim/assign, transactional transfers, and UX boundary.
    "apps/whatsapp-agent/src/queue/humanAssignmentDestination.ts": (
        "resolveHumanAssignmentDestination", "requireHumanAssignmentRuntimeToken",
    ),
    "apps/whatsapp-agent/src/conversation/runtimeWriteFence.ts": (
        "updateRuntimeIfUnchanged",
    ),
    "src/lib/inboxTransferDestination.ts": ("hasExplicitHumanTransferDestination",),
    "src/app/app/inbox/page.tsx": ("hasExplicitHumanTransferDestination",),
    "docs/saas/HUMAN_ASSIGNMENT_DESTINATION_INVARIANT_2026-11-21.md": (
        "HUMAN", "department",
    ),
}
missing = []
for relative, symbols in REQUIRED.items():
    file = ROOT / relative
    if not file.is_file():
        missing.append(f"{relative}: ABSENT")
        continue
    content = file.read_text(encoding="utf-8")
    for symbol in symbols:
        if symbol not in content:
            missing.append(f"{relative}: SYMBOL_MISSING:{symbol}")

if missing:
    for issue in missing:
        print(f"CONVERTA_AB_EFFECTIVE_TREE_DENY {issue}")
    raise SystemExit(1)
print(f"CONVERTA_AB_EFFECTIVE_TREE_PASS surfaces={len(REQUIRED)}")
