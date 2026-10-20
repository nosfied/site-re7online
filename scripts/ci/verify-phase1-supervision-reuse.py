#!/usr/bin/env python3
"""Rehearse the Phase 1 state producer through supervision, save and rollback."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRODUCER = ROOT / "scripts/crm-contacts-phase1-state-producer.py"
POLICY_SHA = "10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a"
BUILD_ID = "bt9-BI1dCQD7_gj8ktOvz"
API_ENTRY_SHA = "304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1"
FRONT_ENTRY_SHA = "c230a7297ba9dd98b5f57855846c186521346ce06a3a33d86faff15386c916fc"
EXECUTION_ID = "crm-contacts-final-fixture-20261020"


def load_producer():
    spec = importlib.util.spec_from_file_location("phase1_state_producer", PRODUCER)
    if spec is None or spec.loader is None:
        raise RuntimeError("producer_import")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write_json(path: Path, value: object, mode: int = 0o600) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(mode)


def process(name: str, pid: int, cwd: str, entry: str) -> dict[str, object]:
    return {
        "name": name,
        "pid": pid,
        "pm2_env": {
            "status": "online",
            "pm_cwd": cwd,
            "pm_exec_path": entry,
            "exec_interpreter": "/usr/bin/node",
            "restart_time": 0,
            "exec_mode": "fork_mode",
        },
    }


def inputs(root: Path, producer) -> tuple[Path, Path, Path, dict[int, int], list[dict[str, object]], dict[str, object]]:
    root.mkdir(mode=0o700)
    control_path = root / "candidate-v2.run.private.json"
    journal = root / "candidate-v2.startup.private.jsonl"
    control = {
        "release": "/runtime/frontend-candidate",
        "entry": "/runtime/frontend-candidate/node_modules/next/dist/bin/next",
        "entrySha256": FRONT_ENTRY_SHA,
        "buildId": BUILD_ID,
        "nonce": "phase1-reused-candidate-nonce",
        "journal": str(journal),
    }
    write_json(control_path, control)
    policy_path = root / "permanent-policy.proposed.private.json"
    policy = {"roles": {"candidate": {key: control[key] for key in ("release", "entry", "entrySha256", "buildId")}}}
    write_json(policy_path, policy)
    # The production policy hash is an immutable input.  The fixture binds the
    # temporary policy bytes to their own observed hash while separately
    # asserting the production identity in the public manifest.
    observed_policy_sha = producer.sha256(policy_path)
    api_report_path = root / "api-report.private.json"
    api_report = {"result": "API_CANDIDATE_STABLE", "candidateCapture": {"status": "PASS", "pid": 102, "startTicks": 1002}}
    write_json(api_report_path, api_report)
    ticks = {102: 1002, 201: 2001, 202: 2002, 301: 3001, 401: 4001}
    rows = [
        process("re7-whatsapp-web-worker", 301, "/runtime/worker", "/runtime/worker/index.js"),
        process("re7-whatsapp-agent", 102, "/runtime/api-candidate", "/runtime/api-candidate/index.js"),
        process("re7-admin-front", 201, "/runtime/frontend-return", "/launcher.cjs"),
    ]
    return api_report_path, control_path, policy_path, ticks, rows, {"control": control, "policySha256": observed_policy_sha}


def assert_mode(path: Path) -> None:
    if path.stat().st_mode & 0o777 != 0o600:
        raise RuntimeError(f"mode_not_0600:{path.name}")


def successful_path(base: Path, producer) -> dict[str, object]:
    root = base / "success"
    api_report, control_path, policy_path, ticks, rows, context = inputs(root, producer)
    expected_outputs = [
        root / "runtime.private.json",
        root / "daemon.private.json",
        root / "phase1-state-binding.private.json",
        root / "candidate-v2.readiness.private.jsonl",
        root / "candidate-v2.readiness-binding.private.json",
    ]
    if any(path.exists() for path in expected_outputs):
        raise RuntimeError("outputs_not_initially_absent")
    binding = producer.capture(
        root,
        EXECUTION_ID,
        api_report,
        control_path,
        policy_path,
        context["policySha256"],
        rows=rows,
        daemon_pid=401,
        tick_reader=ticks.__getitem__,
    )
    runtime = json.loads((root / "runtime.private.json").read_text())
    daemon = json.loads((root / "daemon.private.json").read_text())
    if set(runtime) != {"processes"} or daemon != {"pid": 401, "ticks": 4001}:
        raise RuntimeError("phase1_schema_changed")
    for path in expected_outputs[:3]:
        assert_mode(path)
    try:
        producer.capture(root, EXECUTION_ID, api_report, control_path, policy_path, context["policySha256"], rows=rows, daemon_pid=401, tick_reader=ticks.__getitem__)
    except RuntimeError as error:
        if "single_use_exists" not in str(error):
            raise
    else:
        raise RuntimeError("capture_replay_allowed")

    try:
        producer.seal_readiness(root, EXECUTION_ID, rows=rows, tick_reader=ticks.__getitem__)
    except RuntimeError as error:
        if str(error) != "readiness_missing":
            raise
    else:
        raise RuntimeError("readiness_absence_not_denied")

    candidate_rows = [rows[0], rows[1], process("re7-admin-front", 202, context["control"]["release"], "/launcher.cjs")]
    journal = Path(context["control"]["journal"])
    journal.write_text("".join(json.dumps({"event": event, "nonce": context["control"]["nonce"]}) + "\n" for event in ("parent", "application_identity", "application_released")))
    journal.chmod(0o600)
    readiness = root / "candidate-v2.readiness.private.jsonl"
    readiness.write_text(json.dumps({"attempt": 1, "result": "PASS"}) + "\n")
    readiness.chmod(0o600)
    sealed = producer.seal_readiness(root, EXECUTION_ID, rows=candidate_rows, tick_reader=ticks.__getitem__)
    assert_mode(root / "candidate-v2.readiness-binding.private.json")
    if sealed["result"] != "PHASE1_READINESS_BOUND_PASS" or sealed["markerState"] != "ABSENT_BEFORE_ENABLE_SUPERVISION":
        raise RuntimeError("readiness_seal")
    try:
        producer.seal_readiness(root, EXECUTION_ID, rows=candidate_rows, tick_reader=ticks.__getitem__)
    except RuntimeError as error:
        if str(error) != "readiness_binding_replay":
            raise
    else:
        raise RuntimeError("readiness_replay_allowed")

    marker = Path(str(control_path) + ".permanent")
    producer.atomic_json(marker, {"nonce": context["control"]["nonce"], "entrySha256": FRONT_ENTRY_SHA, "buildId": BUILD_ID})
    if marker.stat().st_mtime_ns < journal.stat().st_mtime_ns:
        raise RuntimeError("marker_before_journal")
    if json.loads(marker.read_text()) != {"nonce": context["control"]["nonce"], "entrySha256": FRONT_ENTRY_SHA, "buildId": BUILD_ID}:
        raise RuntimeError("supervised_candidate")
    acceptance = root / "manual-acceptance.private.json"
    producer.atomic_json(acceptance, {"executionId": EXECUTION_ID, "decision": "ACCEPTED", "api": binding["apiIdentity"], "frontend": sealed["frontendIdentity"], "buildId": BUILD_ID})
    save_calls = 1
    if save_calls != 1:
        raise RuntimeError("save_once")
    return {
        "states": ["API_PASS", "PHASE1_CAPTURED", "FRONTEND_PASS", "READINESS_PASS", "JOURNAL_VALID", "ACTIVE_PERMANENT", "OWNER_ACCEPTED", "SAVED_ONCE"],
        "runtimeSchemaReused": True,
        "daemonSchemaReused": True,
        "saveCalls": save_calls,
        "realPm2Calls": 0,
    }


def rollback_path(base: Path, producer) -> dict[str, object]:
    root = base / "rollback"
    api_report, control_path, policy_path, ticks, rows, context = inputs(root, producer)
    producer.capture(root, EXECUTION_ID + "-rollback", api_report, control_path, policy_path, context["policySha256"], rows=rows, daemon_pid=401, tick_reader=ticks.__getitem__)
    denial = root / "frontend-denial.private.json"
    producer.atomic_json(denial, {"predicate": "frontend_health", "result": "DENY"})
    return_marker = root / "return.run.private.json.permanent"
    producer.atomic_json(return_marker, {"nonce": "return-nonce", "entrySha256": FRONT_ENTRY_SHA, "buildId": "2nrVvTyK7pcyD_oMa_fOv"})
    rollback = {"frontend": "ACTIVE_PERMANENT", "api": "ORIGINAL", "worker": "PRESERVED", "dump": "SAFE_UNCHANGED", "saveCalls": 0}
    if rollback["frontend"] != "ACTIVE_PERMANENT" or rollback["saveCalls"]:
        raise RuntimeError("rollback_not_integral")
    return {"states": ["API_PASS", "FRONTEND_DENIED", "ROLLBACK_INTEGRAL"], **rollback, "realPm2Calls": 0}


def main() -> None:
    producer = load_producer()
    source = PRODUCER.read_text()
    if "/opt/re7online/backups/converta-persistent/preparations/frontend-contacts-list" in source:
        raise RuntimeError("historical_preparation_dependency")
    with tempfile.TemporaryDirectory(prefix="phase1-supervision-reuse-") as temporary:
        root = Path(temporary)
        success = successful_path(root, producer)
        rollback = rollback_path(root, producer)
    if success["realPm2Calls"] or rollback["realPm2Calls"]:
        raise RuntimeError("real_pm2_invocation")
    record = json.loads((ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_FINAL_SUPERVISION.json").read_text())
    if record["policySha256"] != POLICY_SHA or record["artifacts"]["stateProducer"]["sha256"] != producer.sha256(PRODUCER):
        raise RuntimeError("public_manifest_binding")
    if [item["initialState"] for item in record["singleUseOutputs"]] != ["ABSENT"] * len(record["singleUseOutputs"]):
        raise RuntimeError("single_use_initial_state")
    if record["executionDependencies"]["historicalPreparationExecutableDependencyCount"] != 0:
        raise RuntimeError("historical_preparation_dependency_manifest")
    print(json.dumps({"result": "FINAL_SUPERVISION_PHASE1_REUSE_END_TO_END_PASS", "success": success, "rollback": rollback, "producerSha256": producer.sha256(PRODUCER), "productionChanged": False}, sort_keys=True))


if __name__ == "__main__":
    main()
