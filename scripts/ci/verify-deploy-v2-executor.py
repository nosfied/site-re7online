#!/usr/bin/env python3
"""Deterministic success, denial, rollback and replay fixtures for Deploy V2."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXECUTOR = ROOT / "scripts/deploy-v2.py"
MANIFEST = ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_DEPLOY_V2.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args: list[str], expected: int) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode != expected:
        raise SystemExit(
            f"DEPLOY_V2_FIXTURE_INVALID: expected {expected}, got {result.returncode}\n"
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def events(path: Path) -> list[str]:
    return [json.loads(line)["event"] + ":" + json.loads(line).get("action", "")
            for line in path.read_text().splitlines()]


with tempfile.TemporaryDirectory(prefix="deploy-v2-fixture-") as temporary:
    temp = Path(temporary)
    action_log = temp / "actions.log"
    adapter = temp / "adapter.py"
    adapter_source = """#!/usr/bin/env python3
import json, sys
from pathlib import Path
action = sys.argv[1]
work_dir = Path(sys.argv[sys.argv.index('--work-dir') + 1])
log = Path(__ACTION_LOG__)
with log.open('a') as handle:
    handle.write(action + '\\n')
scenario = work_dir.name
deny = ((scenario == 'api-deny' and action == 'verify_api') or
        (scenario == 'frontend-deny' and action == 'verify_frontend') or
        (scenario == 'select-api-deny' and action == 'select_api') or
        (scenario == 'select-frontend-deny' and action == 'select_frontend'))
print(json.dumps({'result': 'DENY' if deny else 'PASS',
                  'reason': 'fixture_denial' if deny else None}))
raise SystemExit(1 if deny else 0)
""".replace("__ACTION_LOG__", repr(str(action_log)))
    adapter.write_text(adapter_source, encoding="utf-8")
    adapter.chmod(0o700)

    manifest_sha = digest(MANIFEST)
    authorization = temp / "authorization.json"
    authorization.write_text(json.dumps({
        "schemaVersion": 1,
        "decision": "AUTHORIZED",
        "releaseId": "crm-contacts-list-recovery-f5028de1",
        "manifestSha256": manifest_sha,
        "executorSha256": digest(EXECUTOR),
        "notAfterUtc": "2099-01-01T00:00:00Z",
    }, sort_keys=True), encoding="utf-8")

    base = [
        str(EXECUTOR), "--manifest", str(MANIFEST), "--execute",
        "--adapter", str(adapter), "--adapter-sha256", digest(adapter),
        "--authorization", str(authorization),
        "--authorization-sha256", digest(authorization),
    ]
    environment = os.environ.copy()

    plan = run([str(EXECUTOR), "--manifest", str(MANIFEST)], 0)
    assert "DEPLOY_V2_PLAN_OK" in plan.stdout and not action_log.exists()

    success = temp / "success"
    result = subprocess.run(base + ["--work-dir", str(success)], env=environment,
                            text=True, capture_output=True, check=False)
    assert result.returncode == 0 and "DEPLOY_V2_EXECUTION_PASS" in result.stdout
    assert action_log.read_text().splitlines() == [
        "capture", "select_api", "verify_api", "select_frontend",
        "verify_frontend", "verify_worker", "save_pm2",
    ]
    success_result = json.loads((success / "result.json").read_text())
    assert success_result["status"] == "DEPLOYED_VERIFIED"
    assert success_result["pm2SavedExactlyOnce"] is True

    before_replay = action_log.read_text()
    replay = subprocess.run(base + ["--work-dir", str(success)], env=environment,
                            text=True, capture_output=True, check=False)
    assert replay.returncode == 64 and action_log.read_text() == before_replay

    action_log.write_text("")
    api_deny = temp / "api-deny"
    result = subprocess.run(base + ["--work-dir", str(api_deny)], env=environment,
                            text=True, capture_output=True, check=False)
    assert result.returncode == 1
    assert action_log.read_text().splitlines() == [
        "capture", "select_api", "verify_api", "rollback_api", "verify_rollback",
    ]
    assert json.loads((api_deny / "result.json").read_text())["status"] == "ROLLED_BACK"

    action_log.write_text("")
    frontend_deny = temp / "frontend-deny"
    result = subprocess.run(base + ["--work-dir", str(frontend_deny)], env=environment,
                            text=True, capture_output=True, check=False)
    assert result.returncode == 1
    assert action_log.read_text().splitlines() == [
        "capture", "select_api", "verify_api", "select_frontend",
        "verify_frontend", "rollback_frontend", "rollback_api", "verify_rollback",
    ]
    denied_result = json.loads((frontend_deny / "result.json").read_text())
    assert denied_result["status"] == "ROLLED_BACK" and denied_result["pm2Saved"] is False

    action_log.write_text("")
    select_api_deny = temp / "select-api-deny"
    result = subprocess.run(base + ["--work-dir", str(select_api_deny)], env=environment,
                            text=True, capture_output=True, check=False)
    assert result.returncode == 1
    assert action_log.read_text().splitlines() == [
        "capture", "select_api", "rollback_api", "verify_rollback",
    ]

    action_log.write_text("")
    select_frontend_deny = temp / "select-frontend-deny"
    result = subprocess.run(base + ["--work-dir", str(select_frontend_deny)], env=environment,
                            text=True, capture_output=True, check=False)
    assert result.returncode == 1
    assert action_log.read_text().splitlines() == [
        "capture", "select_api", "verify_api", "select_frontend",
        "rollback_frontend", "rollback_api", "verify_rollback",
    ]

    bad_sha = subprocess.run(
        [str(EXECUTOR), "--manifest", str(MANIFEST), "--execute",
         "--adapter", str(adapter), "--adapter-sha256", "0" * 64,
         "--authorization", str(authorization),
         "--authorization-sha256", digest(authorization),
         "--work-dir", str(temp / "bad-sha")],
        env=environment, text=True, capture_output=True, check=False,
    )
    assert bad_sha.returncode == 64 and not (temp / "bad-sha").exists()

    denied_authorization = temp / "denied-authorization.json"
    denied_authorization.write_text(json.dumps({
        "schemaVersion": 1,
        "decision": "DENIED",
        "releaseId": "crm-contacts-list-recovery-f5028de1",
        "manifestSha256": manifest_sha,
        "executorSha256": digest(EXECUTOR),
        "notAfterUtc": "2099-01-01T00:00:00Z",
    }, sort_keys=True), encoding="utf-8")
    denied = subprocess.run(
        [str(EXECUTOR), "--manifest", str(MANIFEST), "--execute",
         "--adapter", str(adapter), "--adapter-sha256", digest(adapter),
         "--authorization", str(denied_authorization),
         "--authorization-sha256", digest(denied_authorization),
         "--work-dir", str(temp / "authorization-denied")],
        env=environment, text=True, capture_output=True, check=False,
    )
    assert denied.returncode == 64 and not (temp / "authorization-denied").exists()

print("DEPLOY_V2_EXECUTOR_FIXTURE_PASS")

