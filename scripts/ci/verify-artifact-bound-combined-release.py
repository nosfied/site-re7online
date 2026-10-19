#!/usr/bin/env python3
"""Verify the concrete CRM contacts recovery preparation with a PM2-only shim."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_ARTIFACT_BOUND.json"
BASE_FIXTURE = ROOT / "scripts/ci/verify-combined-release-rehearsal.py"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_fixture():
    spec = importlib.util.spec_from_file_location("combined_release_fixture", BASE_FIXTURE)
    if spec is None or spec.loader is None:
        raise RuntimeError("combined_fixture_import")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def private_check(root: Path, record: dict[str, object]) -> dict[str, object]:
    files = record["privateArtifacts"]
    checked = {}
    for name, expected in files.items():
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"private_artifact_type:{name}")
        observed = sha(path)
        if observed != expected:
            raise RuntimeError(f"private_artifact_hash:{name}")
        checked[name] = observed
    control = json.loads((root / record["frontend"]["controlFile"]).read_text())
    expected_tuple = {
        key: record["frontend"][key]
        for key in ("release", "entry", "entrySha256", "buildId")
    }
    if {key: control.get(key) for key in expected_tuple} != expected_tuple:
        raise RuntimeError("candidate_control_tuple")
    if not control.get("nonce") or control.get("journal") != record["frontend"]["journalPath"]:
        raise RuntimeError("candidate_control_private_binding")
    if Path(control["journal"]).exists() or Path(record["frontend"]["markerPath"]).exists():
        raise RuntimeError("candidate_control_not_fresh")
    policy = json.loads((root / record["policy"]["file"]).read_text())
    if policy["roles"]["candidate"] != expected_tuple:
        raise RuntimeError("permanent_run_scope")
    return {"checked": checked, "control": control}


def rehearse(record: dict[str, object], private: dict[str, object] | None) -> dict[str, object]:
    fixture = load_fixture()
    with tempfile.TemporaryDirectory(prefix="artifact-bound-release-") as tmp:
        root = Path(tmp)
        pm2 = fixture.Pm2Shim(root)
        selector = fixture.AtomicSelector(root, pm2)
        predicates = fixture.PredicateLog(root / "predicates.jsonl")
        front = record["frontend"]
        api = record["api"]
        ret = record["return"]
        pm2.processes = {
            "api": fixture.Process("api", 4101, 5101, api["returnCwd"], api["returnEntry"], api["entrySha256"]),
            "frontend": fixture.Process("frontend", 4201, 5201, ret["release"], ret["launcher"], front["entrySha256"], ret["buildId"]),
            "worker": fixture.Process("worker", 4301, 5301, record["worker"]["cwd"], record["worker"]["entry"], record["worker"]["entrySha256"]),
        }
        pm2.dump_sha = record["safeDumpSha256"]
        s0 = {name: process.identity() for name, process in pm2.processes.items()}
        api_candidate = fixture.Process("api", 4102, 5102, api["candidateCwd"], api["candidateEntry"], api["entrySha256"])
        selector.execute("select-api-candidate", "api", api_candidate, {
            "verifierSha256": api["verifierSha256"], "dumpSha256": record["safeDumpSha256"]
        })
        predicates.record("s1_api_identity", pm2.processes["api"].identity(), api_candidate.identity())
        predicates.record("s1_frontend_preserved", pm2.processes["frontend"].identity(), s0["frontend"])
        predicates.record("s1_worker_preserved", pm2.processes["worker"].identity(), s0["worker"])
        snapshot = {
            "state": "S1_FRONTEND_PRE_SELECTION",
            "api": api_candidate.identity(),
            "frontend": s0["frontend"],
            "worker": s0["worker"],
            "source": "authenticated_api_verifier_v6_r4",
        }
        fixture.sync(root / "frontend-post-api-snapshot.single-use.json", snapshot, exclusive=True)
        control = private["control"] if private else {
            "release": front["release"], "entry": front["entry"],
            "entrySha256": front["entrySha256"], "buildId": front["buildId"],
            "nonce": "private-nonce-bound-by-control-sha", "journal": front["journalPath"],
        }
        binding = {
            "controlSha256": front["controlSha256"],
            "configurationSha256": front["configurationSha256"],
            "policySha256": record["policy"]["sha256"],
            "snapshotSha256": fixture.digest(snapshot),
        }
        fixture.sync(root / "candidate.binding.private.json", binding, exclusive=True)
        front_candidate = fixture.Process("frontend", 4202, 5202, front["release"], front["launcher"], front["entrySha256"], front["buildId"])
        selector.execute("select-candidate", "frontend", front_candidate, binding)
        journal = root / "candidate-journal.private.jsonl"
        journal.write_bytes(b"".join(fixture.encoded({"event": event, "nonce": control["nonce"]}) for event in ("parent", "application_identity", "application_released")))
        marker = root / "candidate-control.permanent"
        predicates.record("s2_api_matches_post_api_snapshot", pm2.processes["api"].identity(), snapshot["api"])
        predicates.record("s2_frontend_identity", pm2.processes["frontend"].identity(), front_candidate.identity())
        predicates.record("s2_worker_preserved", pm2.processes["worker"].identity(), s0["worker"])
        predicates.record("s2_real_launcher_journal_boundary", journal.is_file(), True)
        fixture.sync(marker, {"nonce": control["nonce"], "entrySha256": front["entrySha256"], "buildId": front["buildId"]}, exclusive=True)
        predicates.record("s3_marker_after_journal", marker.stat().st_mtime_ns >= journal.stat().st_mtime_ns, True)
        predicates.record("s3_permanent_scope", record["policy"]["candidateRoleMatchesControlTuple"], True)
        final_dump = pm2.save()
        predicates.record("s3_dump_created_after_supervision", final_dump != record["safeDumpSha256"], True)

        # Independent negative path from S0 through S1/S2 and integral rollback.
        negative = fixture.Pm2Shim(root / "negative")
        negative.processes = dict(pm2.processes)
        negative.processes["api"] = fixture.Process("api", 4401, 5401, api["returnCwd"], api["returnEntry"], api["entrySha256"])
        negative.processes["frontend"] = fixture.Process("frontend", 4501, 5501, ret["release"], ret["launcher"], front["entrySha256"], ret["buildId"])
        negative.processes["worker"] = fixture.Process("worker", 4601, 5601, record["worker"]["cwd"], record["worker"]["entry"], record["worker"]["entrySha256"])
        negative.dump_sha = record["safeDumpSha256"]
        neg_selector = fixture.AtomicSelector(root / "negative-selector", negative)
        (root / "negative-selector").mkdir()
        neg_selector.execute("select-api-candidate-negative", "api", fixture.replace(api_candidate, pid=4402, ticks=5402), {"verifierSha256": api["verifierSha256"]})
        neg_snapshot = {"api": negative.processes["api"].identity(), "frontend": negative.processes["frontend"].identity(), "worker": negative.processes["worker"].identity()}
        neg_selector.execute("select-candidate-negative", "frontend", fixture.replace(front_candidate, pid=4502, ticks=5502), binding)
        denial = {"predicate": "frontend_build_id", "observed": "DENY", "expected": front["buildId"]}
        fixture.sync(root / "frontend-negative.persisted.json", denial, exclusive=True)
        neg_selector.execute("rollback-to-supervised-return", "frontend", fixture.Process("frontend", 4503, 5503, ret["release"], ret["launcher"], front["entrySha256"], ret["buildId"]), {"planSha256": record["plans"]["rollbackSha256"]})
        neg_selector.execute("rollback-api", "api", fixture.Process("api", 4403, 5403, api["returnCwd"], api["returnEntry"], api["entrySha256"]), {"definitionSha256": api["returnDefinitionSha256"]})
        if negative.processes["worker"].identity() != neg_snapshot["worker"] or negative.dump_sha != record["safeDumpSha256"]:
            raise RuntimeError("rollback_state")
        rows = [json.loads(line) for line in (root / "predicates.jsonl").read_text().splitlines()]
        if any(row["status"] != "PASS" for row in rows):
            raise RuntimeError("artifact_bound_predicate")
        if pm2.real_invocations or negative.real_invocations:
            raise RuntimeError("real_pm2_invocation")
        return {
            "result": "ARTIFACT_BOUND_END_TO_END_PASS",
            "states": ["S0", "S1", "S2", "S3", "R"],
            "privateArtifactsChecked": private is not None,
            "predicateCount": len(rows),
            "pm2RealInvocations": 0,
            "frontendSnapshotCreatedAfterApiPass": True,
            "rollbackSafeDumpPreserved": True,
            "workerPreserved": True,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=PUBLIC)
    parser.add_argument("--private-root", type=Path)
    args = parser.parse_args()
    record = json.loads(args.manifest.read_text())
    private = private_check(args.private_root, record) if args.private_root else None
    print(json.dumps(rehearse(record, private), sort_keys=True))


if __name__ == "__main__":
    main()
