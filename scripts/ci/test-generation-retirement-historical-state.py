#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("base_tests", HERE / "test-generation-retirement.py")
assert SPEC and SPEC.loader
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)


def derive_historical_state(release: str, successor: dict, receipt: dict) -> str:
    protected = ("activeReleases", "rollbackReleases", "transitiveReturnReleases", "candidateReleases")
    results = [item for item in receipt.get("results", []) if item.get("releaseId") == release]
    if len(results) != 1 or results[0].get("result") != "HISTORICAL_EVIDENCE_ONLY":
        raise ValueError("historical closure missing")
    if release not in successor.get("installedVerifiedReleases", []):
        raise ValueError("installed verification missing")
    if any(release in successor.get(role, []) for role in protected):
        raise ValueError("operational role remains")
    return "SUPERSEDED"


class HistoricalOperationalTransition(unittest.TestCase):
    def make_fixture(self, release: str):
        f = BASE.Fixture(deployed=True, release_id=release)
        contract = json.loads(f.contract.read_text())
        contract["artifacts"] = [item for item in contract["artifacts"]
                                 if item["class"] in BASE.MODULE.PRESERVE_CLASSES | {"RELEASE_RUNTIME"}]
        BASE.private_json(f.contract, contract)

        active = f.releases_root / "immutable-active"
        active.mkdir()
        private_parent = f.releases_root / "immutable-private-rollback"
        (private_parent / "api-runtime" / ".data").mkdir(parents=True)
        (private_parent / "api-runtime" / ".data" / "tenant-state").write_text("private\n")
        f.current.unlink()
        os.symlink(active, f.current)
        operational = json.loads(f.operational.read_text())
        graph = {
            "activeReleases": [active.name],
            "rollbackReleases": [private_parent.name],
            "transitiveReturnReleases": [],
            "candidateReleases": [],
            "installedVerifiedReleases": [release, active.name, private_parent.name],
            "supersededCandidates": [],
        }
        operational.update(graph)
        operational["currentPaths"] = [str(active)]
        operational["observations"]["currentLinks"] = [{"path": str(f.current), "target": str(active)}]
        BASE.private_json(f.graph, graph)
        operational["observations"]["releaseGraph"]["sha256"] = BASE.sha(f.graph)
        operational["deploymentState"] = {"state": "DEPLOYED"}
        BASE.private_json(f.operational, operational)
        successor = graph
        receipt = {"results": [{"releaseId": release, "result": "HISTORICAL_EVIDENCE_ONLY"}]}
        return f, active, private_parent, successor, receipt

    def exercise(self, release: str):
        f, active, private_parent, successor, receipt = self.make_fixture(release)
        self.addCleanup(f.close)
        prepared = f.prepare()
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        original_intent = f.intent.read_bytes()
        original_commands = f.commands.read_bytes()
        intent = json.loads(original_intent)
        self.assertEqual([item["path"] for item in intent["commands"]], [str(f.installed_release)])

        successor_operational = f.evidence_root / "operational-successor.private.json"
        operational = json.loads(f.operational.read_text())
        operational["deploymentState"] = {
            "state": derive_historical_state(release, successor, receipt)
        }
        BASE.private_json(successor_operational, operational)
        authorization = f.authorize("historical-successor-once")
        result = BASE.invoke(
            "execute", "--intent", str(f.intent), "--intent-sha256", BASE.sha(f.intent),
            "--authorization", str(authorization), "--authorization-sha256", BASE.sha(authorization),
            "--operational-state", str(successor_operational),
            "--operational-state-sha256", BASE.sha(successor_operational),
            "--root-policy", str(f.policy), "--root-policy-sha256", BASE.sha(f.policy),
            "--deployment-lock", str(f.deploy_lock),
            "--receipt-root", str(f.evidence_root / "successor-receipt"),
            "--review-output", str(f.review),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(f.installed_release.exists())
        self.assertTrue(active.is_dir())
        self.assertEqual((private_parent / "api-runtime" / ".data" / "tenant-state").read_text(), "private\n")
        self.assertEqual(f.intent.read_bytes(), original_intent)
        self.assertEqual(f.commands.read_bytes(), original_commands)

    def test_d436_successor_state(self):
        self.exercise("immutable-d436239e-vps-20261026T131821Z")

    def test_f160_successor_state(self):
        self.exercise("immutable-f1602787-vps-20261026T174702Z")

    def test_deployed_without_active_selection_denies(self):
        f, active, private_parent, successor, receipt = self.make_fixture("immutable-d436-negative")
        self.addCleanup(f.close)
        prepared = f.prepare()
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        authorization = f.authorize("stale-deployed-once")
        result, receipt_root = f.execute(authorization, "stale-receipt")
        self.assertEqual(result.returncode, 2)
        self.assertIn("fresh_deployed_release_graph", result.stderr)
        self.assertTrue(f.installed_release.is_dir())
        self.assertTrue(active.is_dir())
        self.assertTrue((private_parent / "api-runtime" / ".data" / "tenant-state").is_file())
        self.assertFalse(receipt_root.exists())

    def test_derivation_denies_remaining_role(self):
        release = "immutable-d436"
        graph = {"activeReleases": [], "rollbackReleases": [release],
                 "transitiveReturnReleases": [], "candidateReleases": [],
                 "installedVerifiedReleases": [release]}
        receipt = {"results": [{"releaseId": release, "result": "HISTORICAL_EVIDENCE_ONLY"}]}
        with self.assertRaisesRegex(ValueError, "operational role remains"):
            derive_historical_state(release, graph, receipt)

    def test_terminal_closure_correlates_verified_by_ordinal(self):
        release = "immutable-d436-terminal-validation"
        f, active, private_parent, successor, receipt = self.make_fixture(release)
        self.addCleanup(f.close)
        prepared = f.prepare()
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        operational = json.loads(f.operational.read_text())
        operational["deploymentState"] = {
            "state": derive_historical_state(release, successor, receipt)
        }
        successor_operational = f.evidence_root / "operational-successor.private.json"
        BASE.private_json(successor_operational, operational)
        authorization = f.authorize("terminal-validation-once")
        receipt_root = f.evidence_root / "terminal-validation-receipt"
        result = BASE.invoke(
            "execute", "--intent", str(f.intent), "--intent-sha256", BASE.sha(f.intent),
            "--authorization", str(authorization), "--authorization-sha256", BASE.sha(authorization),
            "--operational-state", str(successor_operational),
            "--operational-state-sha256", BASE.sha(successor_operational),
            "--root-policy", str(f.policy), "--root-policy-sha256", BASE.sha(f.policy),
            "--deployment-lock", str(f.deploy_lock), "--receipt-root", str(receipt_root),
            "--review-output", str(f.review),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt_path = receipt_root / "execution-receipt.private.json"
        journal_path = receipt_root / "command-results.private.jsonl"
        closure = {"kind": "CANONICAL_RETIREMENT", "chain": [{
            "intent": {"path": str(f.intent), "sha256": BASE.sha(f.intent)},
            "receipt": {"path": str(receipt_path), "sha256": BASE.sha(receipt_path)},
            "journal": {"path": str(journal_path), "sha256": BASE.sha(journal_path)},
        }]}
        review = json.loads(f.review.read_text())
        normalized = BASE.MODULE._canonical_retirement_closure(
            closure, release, f.target, BASE.sha(f.contract), BASE.sha(f.lifecycle), review
        )
        events = [json.loads(line) for line in journal_path.read_text().splitlines()]
        self.assertEqual([event["ordinal"] for event in events], [5, 5, 5])
        self.assertEqual(events[-1], {"event": "VERIFIED", "ordinal": 5, "absent": True})
        self.assertNotIn("path", events[-1])
        self.assertEqual(normalized["chain"][0]["receipt"]["sha256"], BASE.sha(receipt_path))


if __name__ == "__main__":
    unittest.main(verbosity=2)
