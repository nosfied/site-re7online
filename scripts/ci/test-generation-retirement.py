#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts/generation-retirement.py"
SPEC = importlib.util.spec_from_file_location("generation_retirement", TOOL)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


def invoke(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(TOOL), *args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


class Fixture:
    def __init__(self, *, active=False, rollback=False, candidate=False, installed=True, deployed=True):
        self.temp = tempfile.TemporaryDirectory(prefix="generation-retirement-")
        self.root = Path(self.temp.name)
        self.output = self.root / "output"; self.output.mkdir()
        self.release_id = "immutable-fixture"
        self.target = "a" * 40
        self.writer_lock = self.root / ".generation-build.lock"; self.writer_lock.write_text(""); self.writer_lock.chmod(0o600)
        self.deploy_lock = self.root / ".deployment-window.lock"; self.deploy_lock.write_text(""); self.deploy_lock.chmod(0o600)
        self.repo = self.root / "repo"; self.repo.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.repo, check=True)
        (self.repo / "tracked").write_text("x\n")
        subprocess.run(["git", "add", "."], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.repo, check=True)
        self.worktree = self.root / "build-worktree"
        subprocess.run(["git", "-C", str(self.repo), "worktree", "add", "--detach", str(self.worktree)],
                       check=True, stdout=subprocess.DEVNULL)
        self.api = self.output / "immutable-fixture/api-runtime"; self.api.mkdir(parents=True); (self.api / "app").write_text("api")
        self.frontend = self.output / "immutable-fixture/frontend-runtime"; self.frontend.mkdir(); (self.frontend / "app").write_text("front")
        self.staging = self.root / "staging"; self.staging.mkdir(); (self.staging / "item").write_text("stage")
        self.installed_release = self.root / "releases" / self.release_id
        self.installed_release.mkdir(parents=True); (self.installed_release / "installed").write_text("verified")
        self.package = self.output / "immutable-fixture.tar.xz"; self.package.write_bytes(b"package")
        self.manifest = self.output / "immutable-fixture/manifest.json"; self.manifest.write_text("{}\n")
        self.index = self.output / "immutable-fixture/index.sha256"; self.index.write_text("{}\n")
        self.lifecycle = self.output / "generation-lifecycle.private.json"
        private_json(self.lifecycle, {"schemaVersion": 1, "generationId": self.release_id,
                                      "targetCommit": self.target, "state": "COMPLETE"})
        self.control = self.root / "control.py"; self.control.write_text("# control\n"); self.control.chmod(0o600)

        def artifact(path: Path, cls: str, state: str = "ACTIVE_DEPENDENCY") -> dict:
            info = path.lstat()
            return {"path": str(path), "releaseId": self.release_id, "targetCommit": self.target,
                    "expectedType": "directory" if path.is_dir() else "regular_file",
                    "initialIdentity": {"device": info.st_dev, "inode": info.st_ino},
                    "observedIdentity": {"device": info.st_dev, "inode": info.st_ino},
                    **MODULE.structural_metrics(path),
                    "digest": {"sha256": sha(path)} if path.is_file() else {"structural": "fixture"},
                    "class": cls, "state": state, "retirableOn": "fixture", "dependencies": []}
        artifacts = [
            artifact(self.package, "PACKAGE_PRESERVE"),
            artifact(self.manifest, "PACKAGE_PRESERVE"),
            artifact(self.index, "PACKAGE_PRESERVE"),
            artifact(self.lifecycle, "EVIDENCE_PRESERVE"),
            artifact(self.installed_release, "RELEASE_RUNTIME", "CANDIDATE_PENDING_ACTIVATION"),
            artifact(self.worktree, "DERIVED_WORKTREE"),
            artifact(self.api, "DERIVED_OUTPUT_RUNTIME", "CANDIDATE_PENDING_ACTIVATION"),
            artifact(self.frontend, "DERIVED_OUTPUT_RUNTIME", "CANDIDATE_PENDING_ACTIVATION"),
            artifact(self.staging, "DERIVED_STAGING"),
        ]
        self.contract = self.output / "generation-artifacts.private.json"
        private_json(self.contract, {"schemaVersion": 1, "generationId": self.release_id,
                     "releaseId": self.release_id, "targetCommit": self.target, "state": "COMPLETE",
                     "writerLockPath": str(self.writer_lock),
                     "classes": sorted(MODULE.PRESERVE_CLASSES | MODULE.DERIVED_CLASSES | {"RELEASE_RUNTIME", "PRIVATE_DATA_NEVER_RETIRE"}),
                     "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"})
        self.operational = self.root / "operational.private.json"
        private_json(self.operational, {"schemaVersion": 1, "generationId": self.release_id,
                     "releaseId": self.release_id, "targetCommit": self.target,
                     "gitRepository": str(self.repo), "currentPaths": [], "pm2LivePaths": [],
                     "pm2DumpPaths": [], "activeReleases": [self.release_id] if active else [],
                     "rollbackReleases": [self.release_id] if rollback else [], "transitiveReturnReleases": [],
                     "candidateReleases": [self.release_id] if candidate else [],
                     "installedVerifiedReleases": [self.release_id] if installed else [],
                     "supersededCandidates": [], "dependencies": [],
                     "controlPlaneArtifacts": [{"path": str(self.control), "sha256": sha(self.control), "copied": True}],
                     "deploymentState": {"state": "DEPLOYED" if deployed else "PENDING"}})
        self.intent = self.root / "intent.private.json"
        self.commands = self.root / "commands.private.txt"
        self.review = self.output / "generation-review.private.json"

    def prepare(self):
        return invoke("prepare", "--contract", str(self.contract), "--contract-sha256", sha(self.contract),
                      "--lifecycle", str(self.lifecycle), "--lifecycle-sha256", sha(self.lifecycle),
                      "--operational-state", str(self.operational), "--operational-state-sha256", sha(self.operational),
                      "--deployment-lock", str(self.deploy_lock), "--intent-output", str(self.intent),
                      "--commands-output", str(self.commands), "--review-output", str(self.review),
                      "--reviewer", "fixture-owner", "--reason", "fixture close")

    def close(self):
        self.temp.cleanup()


class GenerationRetirementTest(unittest.TestCase):
    def test_prepare_classifies_only_derived_paths_and_never_copies_runtime(self):
        fixture = Fixture()
        try:
            result = fixture.prepare(); self.assertEqual(result.returncode, 0, result.stderr)
            intent = json.loads(fixture.intent.read_text())
            selected = {item["class"] for item in intent["commands"]}
            self.assertEqual(selected, {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING"})
            command_text = fixture.commands.read_text()
            self.assertNotIn(str(fixture.package), command_text)
            self.assertNotIn(str(fixture.manifest), command_text)
            self.assertNotIn(str(fixture.index), command_text)
            self.assertLess(fixture.intent.stat().st_size + fixture.commands.stat().st_size, 100_000)
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "RETIREMENT_READY")
        finally:
            fixture.close()

    def test_prepare_outputs_cannot_be_placed_inside_a_runtime(self):
        fixture = Fixture()
        try:
            fixture.intent = fixture.api / "intent.private.json"
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertIn("evidence_destination_inside_artifact", result.stderr)
        finally:
            fixture.close()

    def test_structural_drift_denies_sealed_preparation(self):
        fixture = Fixture()
        try:
            (fixture.api / "new-runtime-byte").write_text("not contracted")
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertIn("artifact_drift", result.stderr)
        finally:
            fixture.close()

    def test_active_and_rollback_release_never_enter_retirement(self):
        fixture = Fixture(active=True)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"] if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "ACTIVE_DEPENDENCY")
            command_paths = [item["path"] for item in intent["commands"]]
            self.assertNotIn(str(fixture.installed_release), command_paths)
        finally:
            fixture.close()

        fixture = Fixture(rollback=True)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"] if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "ROLLBACK_DEPENDENCY")
            self.assertNotIn(str(fixture.installed_release),
                             [item["path"] for item in intent["commands"]])
        finally:
            fixture.close()

    def test_candidate_output_waits_for_install_or_supersession(self):
        fixture = Fixture(candidate=True, installed=False, deployed=False)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            outputs = [item for item in intent["artifacts"] if item["class"] == "DERIVED_OUTPUT_RUNTIME"]
            self.assertTrue(all(item["retentionState"] == "CANDIDATE_PENDING_ACTIVATION" for item in outputs))
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "RETIREMENT_READY")
            # The worktree is independently ready; output runtimes are not.
            self.assertNotIn(str(fixture.api), fixture.commands.read_text())
        finally:
            fixture.close()

    def test_reference_inside_derived_tree_prevents_retirement(self):
        fixture = Fixture()
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["pm2LivePaths"] = [str(fixture.api / "app")]
            private_json(fixture.operational, operational)
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            api = next(item for item in intent["artifacts"] if item["path"] == str(fixture.api))
            self.assertEqual(api["retentionState"], "ACTIVE_DEPENDENCY")
            self.assertNotIn(str(fixture.api), [item["path"] for item in intent["commands"]])
        finally:
            fixture.close()

    def test_execute_is_authorized_once_and_finishes_deployed_sanitized(self):
        fixture = Fixture()
        try:
            prepared = fixture.prepare(); self.assertEqual(prepared.returncode, 0, prepared.stderr)
            intent = json.loads(fixture.intent.read_text())
            authorization = fixture.root / "authorization.private.json"
            private_json(authorization, {"schemaVersion": 1, "authorizationId": "fixture-once",
                         "decision": "AUTHORIZE_ONCE", "intentSha256": sha(fixture.intent),
                         "approvedPaths": [item["path"] for item in intent["commands"]], "owner": "fixture-owner"})
            receipt = fixture.root / "receipt"
            result = invoke("execute", "--intent", str(fixture.intent), "--intent-sha256", sha(fixture.intent),
                            "--authorization", str(authorization), "--authorization-sha256", sha(authorization),
                            "--operational-state", str(fixture.operational), "--operational-state-sha256", sha(fixture.operational),
                            "--deployment-lock", str(fixture.deploy_lock), "--receipt-root", str(receipt),
                            "--review-output", str(fixture.review))
            self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
            self.assertEqual(json.loads(result.stdout)["result"], "DEPLOYED_SANITIZED")
            self.assertTrue(all(not Path(item["path"]).exists() for item in intent["commands"]))
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "SANITIZED")
            saved = json.loads((receipt / "execution-receipt.private.json").read_text())
            self.assertEqual(saved["attemptedCommands"], saved["completedCommands"])
        finally:
            fixture.close()

    def test_partial_failure_is_durable_and_blocks_following_build(self):
        fixture = Fixture()
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            authorization = fixture.root / "authorization.private.json"
            private_json(authorization, {"schemaVersion": 1, "authorizationId": "fixture-partial",
                         "decision": "AUTHORIZE_ONCE", "intentSha256": sha(fixture.intent),
                         "approvedPaths": [item["path"] for item in intent["commands"]], "owner": "fixture-owner"})
            receipt = fixture.root / "partial-receipt"
            args = SimpleNamespace(intent=fixture.intent, intent_sha256=sha(fixture.intent),
                                   authorization=authorization, authorization_sha256=sha(authorization),
                                   operational_state=fixture.operational,
                                   operational_state_sha256=sha(fixture.operational),
                                   deployment_lock=fixture.deploy_lock, receipt_root=receipt,
                                   review_output=fixture.review)
            real_run = subprocess.run
            calls = 0
            def fail_second(command, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 2:
                    return subprocess.CompletedProcess(command, 7, b"", b"synthetic failure")
                return real_run(command, **kwargs)
            with patch.object(MODULE.subprocess, "run", side_effect=fail_second):
                with self.assertRaisesRegex(MODULE.Denied, "retirement_command:2:exit_7"):
                    MODULE.execute(args)
            saved = json.loads((receipt / "execution-receipt.private.json").read_text())
            self.assertEqual(saved["state"], "DEPLOYED_RETENTION_INCOMPLETE")
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "QUARANTINED")
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
