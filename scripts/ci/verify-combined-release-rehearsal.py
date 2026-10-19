#!/usr/bin/env python3
"""Rehearse the coordinated API -> frontend release with an in-memory PM2 shim.

This fixture is deliberately self-contained.  It never imports PM2, reads /proc,
opens a network connection, or writes outside its temporary directory.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path


SAFE_DUMP = "a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0"
API_ENTRY = "304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1"
FRONT_ENTRY = "c230a7297ba9dd98b5f57855846c186521346ce06a3a33d86faff15386c916fc"
RETURN_BUILD = "2nrVvTyK7pcyD_oMa_fOv"
CANDIDATE_BUILD = "bt9-BI1dCQD7_gj8ktOvz"
POLICY_SHA = "10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a"


def encoded(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(value: object) -> str:
    raw = value if isinstance(value, bytes) else encoded(value)
    return hashlib.sha256(raw).hexdigest()


def sync(path: Path, value: object, *, exclusive: bool = False) -> None:
    if exclusive and path.exists():
        raise RuntimeError(f"single_use_destination:{path.name}")
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(encoded(value))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


@dataclass(frozen=True)
class Process:
    name: str
    pid: int
    ticks: int
    cwd: str
    entry: str
    entry_sha: str
    build_id: str | None = None
    status: str = "online"

    def identity(self) -> dict[str, object]:
        return {
            "name": self.name,
            "pid": self.pid,
            "startTicks": self.ticks,
            "cwd": self.cwd,
            "entry": self.entry,
            "entrySha256": self.entry_sha,
            "buildId": self.build_id,
            "status": self.status,
        }


class PredicateLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.sequence = 0

    def record(self, name: str, observed: object, expected: object) -> bool:
        self.sequence += 1
        item = {
            "sequence": self.sequence,
            "name": name,
            "observed": observed,
            "expected": expected,
            "status": "PASS" if observed == expected else "FAIL",
        }
        fd = os.open(
            self.path,
            os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW,
            0o600,
        )
        with os.fdopen(fd, "ab") as stream:
            stream.write(encoded(item))
            stream.flush()
            os.fsync(stream.fileno())
        return item["status"] == "PASS"


class Pm2Shim:
    """Minimal stateful substitute; it cannot resolve or invoke a real PM2 binary."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.calls: list[dict[str, object]] = []
        self.processes = {
            "api": Process("api", 1001, 10001, "/runtime/api-original", "/runtime/api-original/index.js", API_ENTRY),
            "frontend": Process(
                "frontend", 2001, 20001, "/runtime/front-return", "/launcher.cjs", FRONT_ENTRY, RETURN_BUILD
            ),
            "worker": Process("worker", 3001, 30001, "/runtime/worker", "/runtime/worker/index.js", "worker-sha"),
        }
        self.dump_sha = SAFE_DUMP
        self.real_invocations = 0
        self.health = {
            "apiLocal": 200,
            "apiPublic": 200,
            "frontendLocal": 200,
            "frontendPublic": 200,
            "login": 200,
            "inbox": 200,
            "crm": 200,
            "assets": 200,
        }

    def select(self, component: str, process: Process, action: str) -> None:
        self.calls.append({"action": action, "step": "delete", "component": component})
        del self.processes[component]
        self.calls.append({"action": action, "step": "start", "component": component, "pid": process.pid})
        self.processes[component] = process

    def save(self) -> str:
        self.calls.append({"action": "save", "step": "pm2-save-shim"})
        self.dump_sha = digest({name: proc.identity() for name, proc in sorted(self.processes.items())})
        return self.dump_sha


class AtomicSelector:
    """Single-read authorization model used for every simulated delete -> start."""

    def __init__(self, root: Path, pm2: Pm2Shim) -> None:
        self.root = root
        self.pm2 = pm2
        self.consumed: set[str] = set()

    def execute(self, action: str, component: str, process: Process, binding: dict[str, object]) -> None:
        if action in self.consumed:
            raise RuntimeError(f"authorization_replay:{action}")
        authorization = True  # fixture-owned gate, read exactly once
        if not authorization:
            raise RuntimeError(f"execution_not_authorized:{action}")
        record_path = self.root / f"{action}.authorization-committed.private.json"
        record = {
            "state": "AUTHORIZED_COMMITTED",
            "authorizationReadCount": 1,
            "action": action,
            "component": component,
            "binding": binding,
            "commands": [["pm2-shim", "delete", component], ["pm2-shim", "start", component]],
        }
        sync(record_path, record, exclusive=True)
        self.consumed.add(action)
        self.pm2.select(component, process, action)
        record["state"] = "COMPLETED"
        sync(record_path, record)


def safe_return_control(root: Path) -> dict[str, object]:
    journal = root / "return.journal.private.jsonl"
    control = {
        "release": "/runtime/front-return",
        "entry": "/runtime/front-return/node_modules/next/dist/bin/next",
        "entrySha256": FRONT_ENTRY,
        "buildId": RETURN_BUILD,
        "nonce": "return-permanent-nonce",
        "journal": journal.name,
    }
    events = [
        {"event": "parent", "nonce": control["nonce"]},
        {"event": "application_identity", "nonce": control["nonce"]},
        {"event": "application_released", "nonce": control["nonce"]},
    ]
    journal.write_bytes(b"".join(encoded(event) for event in events))
    os.chmod(journal, 0o600)
    sync(root / "return.control.permanent", {
        "nonce": control["nonce"], "entrySha256": FRONT_ENTRY, "buildId": RETURN_BUILD
    }, exclusive=True)
    return control


def fresh_candidate_control(root: Path, nonce: str) -> dict[str, object]:
    return {
        "release": "/runtime/front-candidate",
        "entry": "/runtime/front-candidate/node_modules/next/dist/bin/next",
        "entrySha256": FRONT_ENTRY,
        "buildId": CANDIDATE_BUILD,
        "nonce": nonce,
        "journal": f"candidate-{nonce}.journal.private.jsonl",
    }


def launcher_start(root: Path, control: dict[str, object]) -> None:
    """Simulate the real launcher's journal-producing boundary."""
    journal = root / str(control["journal"])
    if journal.exists():
        raise RuntimeError("first_run_replay")
    events = [
        {"event": "parent", "nonce": control["nonce"]},
        {"event": "application_identity", "nonce": control["nonce"]},
        {"event": "application_released", "nonce": control["nonce"]},
    ]
    fd = os.open(journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        for event in events:
            stream.write(encoded(event))
        stream.flush()
        os.fsync(stream.fileno())


def validate_journal(root: Path, control: dict[str, object]) -> bool:
    journal = root / str(control["journal"])
    if not journal.is_file():
        return False
    events = [json.loads(line) for line in journal.read_text().splitlines()]
    names = [event.get("event") for event in events]
    return (
        names == ["parent", "application_identity", "application_released"]
        and all(event.get("nonce") == control["nonce"] for event in events)
    )


def activate_permanent(root: Path, control: dict[str, object], predicates: PredicateLog) -> Path:
    marker = root / "candidate.control.permanent"
    if not predicates.record("journal_valid_before_marker", validate_journal(root, control), True):
        raise RuntimeError("journal_invalid_before_marker")
    sync(marker, {
        "nonce": control["nonce"],
        "entrySha256": control["entrySha256"],
        "buildId": control["buildId"],
    }, exclusive=True)
    predicates.record("marker_created_after_journal", marker.stat().st_mtime_ns >= (root / str(control["journal"])).stat().st_mtime_ns, True)
    return marker


def supervised(root: Path, control: dict[str, object], marker: Path) -> bool:
    expected = {
        "nonce": control["nonce"],
        "entrySha256": control["entrySha256"],
        "buildId": control["buildId"],
    }
    return marker.is_file() and json.loads(marker.read_text()) == expected and validate_journal(root, control)


def api_select_and_verify(root: Path, pm2: Pm2Shim, selector: AtomicSelector, predicates: PredicateLog) -> dict[str, object]:
    s0 = {name: proc.identity() for name, proc in pm2.processes.items()}
    candidate = Process("api", 1002, 10002, "/runtime/api-candidate", "/runtime/api-candidate/index.js", API_ENTRY)
    selector.execute("select-api-candidate", "api", candidate, {"entrySha256": API_ENTRY, "dumpSha256": SAFE_DUMP})
    checks = [
        predicates.record("api_pid_changed", candidate.pid != s0["api"]["pid"], True),
        predicates.record("api_identity", pm2.processes["api"].identity(), candidate.identity()),
        predicates.record("frontend_preserved_at_s1", pm2.processes["frontend"].identity(), s0["frontend"]),
        predicates.record("worker_preserved_at_s1", pm2.processes["worker"].identity(), s0["worker"]),
        predicates.record("api_health_at_s1", [pm2.health["apiLocal"], pm2.health["apiPublic"]], [200, 200]),
    ]
    if not all(checks):
        raise RuntimeError("api_verification_failed")
    report = {
        "result": "API_CANDIDATE_STABLE",
        "state": "S1",
        "identity": candidate.identity(),
        "preserved": {"frontend": s0["frontend"], "worker": s0["worker"]},
        "expectedDumpSha256": SAFE_DUMP,
        "reportDestination": "api-verifier-current-bound.single-use.json",
        "snapshotDestination": "api-pre-selection-snapshot.single-use.json",
    }
    sync(root / "api-authenticated-result.json", report, exclusive=True)
    return report


def frontend_snapshot_after_api(root: Path, pm2: Pm2Shim, api_report: dict[str, object]) -> dict[str, object]:
    if api_report.get("result") != "API_CANDIDATE_STABLE":
        raise RuntimeError("api_result_not_authenticated")
    if pm2.processes["api"].identity() != api_report["identity"]:
        raise RuntimeError("api_identity_changed_before_frontend_snapshot")
    snapshot = {
        "state": "S1_FRONTEND_PRE_SELECTION",
        "api": api_report["identity"],
        "frontend": pm2.processes["frontend"].identity(),
        "worker": pm2.processes["worker"].identity(),
        "source": "authenticated_api_verifier_result",
    }
    sync(root / "frontend-post-api-snapshot.single-use.json", snapshot, exclusive=True)
    return snapshot


def select_frontend(
    root: Path,
    pm2: Pm2Shim,
    selector: AtomicSelector,
    snapshot: dict[str, object],
    control: dict[str, object],
    predicates: PredicateLog,
    *,
    inject_failure: bool = False,
) -> bool:
    binding = {
        "policySha256": POLICY_SHA,
        "controlSha256": digest(control),
        "configurationSha256": digest({"cwd": control["release"], "control": "candidate-v2"}),
        "nonce": control["nonce"],
        "snapshotSha256": digest(snapshot),
    }
    sync(root / "candidate-v2.binding.private.json", binding, exclusive=True)
    candidate = Process("frontend", 2002, 20002, str(control["release"]), "/launcher.cjs", FRONT_ENTRY, CANDIDATE_BUILD)
    selector.execute("select-frontend-candidate-atomic", "frontend", candidate, binding)
    launcher_start(root, control)
    observed_build = "wrong-build" if inject_failure else candidate.build_id
    checks = [
        predicates.record("frontend_expected_api_identity", pm2.processes["api"].identity(), snapshot["api"]),
        predicates.record("frontend_pid_changed", candidate.pid != snapshot["frontend"]["pid"], True),
        predicates.record("frontend_build_id", observed_build, CANDIDATE_BUILD),
        predicates.record("frontend_journal_real", validate_journal(root, control), True),
        predicates.record("worker_preserved_at_s2", pm2.processes["worker"].identity(), snapshot["worker"]),
        predicates.record(
            "frontend_http_at_s2",
            [pm2.health[key] for key in ("frontendLocal", "frontendPublic", "login", "inbox", "crm", "assets")],
            [200, 200, 200, 200, 200, 200],
        ),
    ]
    return all(checks)


def rollback_integral(root: Path, pm2: Pm2Shim, selector: AtomicSelector, return_control: dict[str, object], predicates: PredicateLog) -> None:
    returned_frontend = Process("frontend", 2003, 20003, str(return_control["release"]), "/launcher.cjs", FRONT_ENTRY, RETURN_BUILD)
    selector.execute(
        "rollback-to-supervised-return-atomic",
        "frontend",
        returned_frontend,
        {"controlSha256": digest(return_control), "lifecycle": "ACTIVE_PERMANENT"},
    )
    returned_api = Process("api", 1003, 10003, "/runtime/api-original", "/runtime/api-original/index.js", API_ENTRY)
    selector.execute("rollback-api-atomic", "api", returned_api, {"entrySha256": API_ENTRY, "dumpSha256": SAFE_DUMP})
    return_marker = root / "return.control.permanent"
    checks = [
        predicates.record("rollback_frontend_supervised", supervised(root, return_control, return_marker), True),
        predicates.record("rollback_frontend_identity", pm2.processes["frontend"].build_id, RETURN_BUILD),
        predicates.record("rollback_api_original", pm2.processes["api"].cwd, "/runtime/api-original"),
        predicates.record("rollback_worker_preserved", pm2.processes["worker"].pid, 3001),
        predicates.record("rollback_safe_dump_unchanged", pm2.dump_sha, SAFE_DUMP),
        predicates.record(
            "rollback_health",
            [pm2.health[key] for key in ("apiLocal", "apiPublic", "frontendLocal", "frontendPublic")],
            [200, 200, 200, 200],
        ),
    ]
    if not all(checks):
        raise RuntimeError("rollback_verification_failed")


def success_scenario(root: Path) -> dict[str, object]:
    root.mkdir(mode=0o700)
    pm2 = Pm2Shim(root)
    selector = AtomicSelector(root, pm2)
    predicates = PredicateLog(root / "predicates.jsonl")
    return_control = safe_return_control(root)
    predicates.record("s0_safe_dump", pm2.dump_sha, SAFE_DUMP)
    predicates.record("s0_safe_return_supervised", supervised(root, return_control, root / "return.control.permanent"), True)
    predicates.record("s0_worker", pm2.processes["worker"].pid, 3001)
    api_report = api_select_and_verify(root, pm2, selector, predicates)
    snapshot = frontend_snapshot_after_api(root, pm2, api_report)
    control = fresh_candidate_control(root, "candidate-v2-success-nonce")
    if not select_frontend(root, pm2, selector, snapshot, control, predicates):
        raise RuntimeError("unexpected_frontend_failure")
    marker = activate_permanent(root, control, predicates)
    predicates.record("supervised_candidate", supervised(root, control, marker), True)
    predicates.record("worker_preserved_at_s3", pm2.processes["worker"].pid, 3001)
    final_dump = pm2.save()
    predicates.record("final_dump_changed", final_dump != SAFE_DUMP, True)
    return {
        "states": ["S0", "S1", "S2", "S3"],
        "candidateControlSha256": digest(control),
        "candidateBindingSha256": digest(json.loads((root / "candidate-v2.binding.private.json").read_text())),
        "frontendSnapshotSha256": digest(json.loads((root / "frontend-post-api-snapshot.single-use.json").read_text())),
        "finalDumpSha256": final_dump,
        "pm2ShimCalls": pm2.calls,
        "pm2RealInvocations": pm2.real_invocations,
    }


def rollback_scenario(root: Path) -> dict[str, object]:
    root.mkdir(mode=0o700)
    pm2 = Pm2Shim(root)
    selector = AtomicSelector(root, pm2)
    predicates = PredicateLog(root / "predicates.jsonl")
    return_control = safe_return_control(root)
    api_report = api_select_and_verify(root, pm2, selector, predicates)
    snapshot = frontend_snapshot_after_api(root, pm2, api_report)
    control = fresh_candidate_control(root, "candidate-v2-negative-nonce")
    accepted = select_frontend(root, pm2, selector, snapshot, control, predicates, inject_failure=True)
    predicates.record("frontend_negative_recorded_before_rollback", accepted, False)
    if accepted:
        raise RuntimeError("negative_scenario_did_not_deny")
    predicates.record("failed_control_has_journal", validate_journal(root, control), True)
    predicates.record("failed_control_has_no_marker", (root / "candidate.control.permanent").exists(), False)
    predicate_count_before_rollback = len((root / "predicates.jsonl").read_text().splitlines())
    rollback_integral(root, pm2, selector, return_control, predicates)
    return {
        "states": ["S0", "S1", "S2_DENIED", "R"],
        "consumedControlSha256": digest(control),
        "failedControlReusable": False,
        "dumpSha256": pm2.dump_sha,
        "predicateCountBeforeRollback": predicate_count_before_rollback,
        "pm2ShimCalls": pm2.calls,
        "pm2RealInvocations": pm2.real_invocations,
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="combined-release-fixture-") as temporary:
        root = Path(temporary)
        success = success_scenario(root / "success")
        rollback = rollback_scenario(root / "rollback")
        if success["pm2RealInvocations"] or rollback["pm2RealInvocations"]:
            raise RuntimeError("real_pm2_invocation")
        success_predicates = [json.loads(line) for line in (root / "success/predicates.jsonl").read_text().splitlines()]
        rollback_predicates = [json.loads(line) for line in (root / "rollback/predicates.jsonl").read_text().splitlines()]
        if any(item["status"] != "PASS" for item in success_predicates):
            raise RuntimeError("success_predicate_failed")
        failures = [item for item in rollback_predicates if item["status"] == "FAIL"]
        if [item["name"] for item in failures] != ["frontend_build_id"]:
            raise RuntimeError("rollback_failure_not_individualized")
        if failures[0]["sequence"] >= rollback["predicateCountBeforeRollback"]:
            raise RuntimeError("rollback_started_before_failure_persisted")
        expected_success_steps = [
            ("select-api-candidate", "delete"), ("select-api-candidate", "start"),
            ("select-frontend-candidate-atomic", "delete"), ("select-frontend-candidate-atomic", "start"),
            ("save", "pm2-save-shim"),
        ]
        if [(call["action"], call["step"]) for call in success["pm2ShimCalls"]] != expected_success_steps:
            raise RuntimeError("success_sequence_changed")
        expected_rollback_steps = [
            ("select-api-candidate", "delete"), ("select-api-candidate", "start"),
            ("select-frontend-candidate-atomic", "delete"), ("select-frontend-candidate-atomic", "start"),
            ("rollback-to-supervised-return-atomic", "delete"), ("rollback-to-supervised-return-atomic", "start"),
            ("rollback-api-atomic", "delete"), ("rollback-api-atomic", "start"),
        ]
        if [(call["action"], call["step"]) for call in rollback["pm2ShimCalls"]] != expected_rollback_steps:
            raise RuntimeError("rollback_sequence_changed")
        authorization_records = list(root.glob("*/*.authorization-committed.private.json"))
        if len(authorization_records) != 6:
            raise RuntimeError("authorization_record_count")
        for path in authorization_records:
            record = json.loads(path.read_text())
            if record["state"] != "COMPLETED" or record["authorizationReadCount"] != 1:
                raise RuntimeError(f"authorization_record_invalid:{path.name}")
        summary = {
            "result": "END_TO_END_COMBINED_RELEASE_FIXTURE_PASS",
            "success": success,
            "rollback": rollback,
            "rules": {
                "frontendSnapshotCreatedAfterApiPass": True,
                "pidProtectionChanged": False,
                "journalWithoutMarkerInvalidatesFirstRunControl": True,
                "privateDestinationsSingleUse": True,
                "policySha256": POLICY_SHA,
                "successPredicatesPersisted": len(success_predicates),
                "rollbackPredicatesPersisted": len(rollback_predicates),
                "rollbackFailurePersistedBeforeEffects": True,
                "atomicAuthorizationsSingleRead": len(authorization_records),
            },
        }
        print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
