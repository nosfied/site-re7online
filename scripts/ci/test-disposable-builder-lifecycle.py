#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "disposable_builder_lifecycle", ROOT / "scripts/disposable-builder-lifecycle.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def write(path: Path, value, mode: int = 0o600) -> str:
    raw = value if isinstance(value, bytes) else MODULE.canonical(value)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.write_bytes(raw); path.chmod(mode)
    return sha(raw)


def run(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode:
        raise AssertionError((args, result.stdout, result.stderr))
    return result.stdout.strip()


class DisposableLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="disposable-lifecycle-test-")
        self.base = Path(self.temporary.name)
        self.repository = self.base / "repository"; self.repository.mkdir(mode=0o700)
        run("git", "init", "-q", str(self.repository))
        run("git", "config", "user.email", "fixture@example.invalid", cwd=self.repository)
        run("git", "config", "user.name", "fixture", cwd=self.repository)
        (self.repository / ".gitignore").write_text("node_modules/\n")
        (self.repository / "tracked.txt").write_text("authority\n")
        run("git", "add", ".", cwd=self.repository); run("git", "commit", "-qm", "fixture", cwd=self.repository)
        self.target = run("git", "rev-parse", "HEAD", cwd=self.repository)
        self.root = self.base / "disposable-generation"
        self.custody = self.base / "custody"; self.custody.mkdir(mode=0o700)
        self.exports = self.custody / "exports"; self.exports.mkdir(mode=0o700)
        roots = {
            "worktrees": str(self.root / "build-worktrees"),
            "outputs": str(self.root / "build-output"),
            "releases": str(self.root / "releases"),
            "staging": str(self.root / "staging"),
            "cache": str(self.root / "npm-cache"),
            "temporary": str(self.root / "temporary"),
            "auxiliary": str(self.root / "auxiliary"),
        }
        self.contract = {
            "schemaVersion": 1,
            "generationId": f"immutable-{self.target[:8]}-external-20261112T000000Z",
            "targetCommit": self.target,
            "repository": str(self.repository),
            "disposableRoot": str(self.root),
            "custodyRoot": str(self.custody),
            "ownerUid": os.geteuid(), "groupGid": os.getegid(), "rootMode": "0700",
            "budget": {"requiredFreeBytes": 64 * 1024 * 1024,
                       "requiredFreeInodes": 8192,
                       "operationalReserveBytes": 16 * 1024 * 1024,
                       "operationalReserveInodes": 1024},
            "roots": roots,
            "worktreePath": str(Path(roots["worktrees"]) / "source"),
            "locks": {"lifecycle": str(self.custody / "lifecycle.lock"),
                      "writer": str(self.custody / "writer.lock")},
            "protectedPaths": [str(self.base / "historical-v1"),
                               str(self.base / "historical-v2")],
        }
        self.contract_path = self.custody / "contract.private.json"
        self.contract_sha = write(self.contract_path, self.contract)
        opened = MODULE.open_generation(self.args())
        self.lifecycle_sha = opened["lifecycleSha256"]
        self.worktree = Path(self.contract["worktreePath"])
        run("git", "worktree", "add", "--detach", str(self.worktree), self.target,
            cwd=self.repository)
        (self.worktree / "node_modules").mkdir()
        (self.worktree / "node_modules/module.bin").write_text("derived\n")
        self.populate_success_artifacts()

    def tearDown(self) -> None:
        if self.worktree.exists():
            subprocess.run(["git", "-C", str(self.repository), "worktree", "remove", "--force",
                            str(self.worktree)], capture_output=True)
        self.temporary.cleanup()

    def args(self, **values):
        defaults = {"contract": self.contract_path, "contract_sha256": self.contract_sha,
                    "lifecycle_sha256": getattr(self, "lifecycle_sha", None)}
        defaults.update(values)
        return type("Args", (), defaults)()

    def populate_success_artifacts(self) -> None:
        output = (Path(self.contract["roots"]["outputs"]) /
                  f"{self.contract['generationId']}-producer")
        release = output / self.contract["generationId"]
        release.mkdir(mode=0o700, parents=True)
        self.sources = {
            "package": output / f"{self.contract['generationId']}.tar.xz",
            "manifest": release / "manifest.json",
            "index": release / "index.sha256",
            "generation-contract": output / "generation-artifacts.private.json",
            "generation-lifecycle": output / "generation-lifecycle.private.json",
        }
        for name, path in self.sources.items():
            path.write_text(name + "\n")
        for key in ("cache", "staging", "temporary", "auxiliary", "releases"):
            path = Path(self.contract["roots"][key]) / f"{key}.derived"
            path.write_text("derived\n")

    def export(self, outcome="SUCCESS", include_failure=False) -> dict:
        artifacts = []
        sources = dict(self.sources)
        if include_failure:
            failure = Path(self.contract["roots"]["auxiliary"]) / "downstream-failure.log"
            failure.write_text("synthetic downstream failure\n")
            sources["failure-evidence"] = failure
        for name, source in sources.items():
            artifacts.append({"name": name, "source": str(source),
                              "destination": str(self.exports / source.name),
                              "sha256": sha(source.read_bytes())})
        request = {"schemaVersion": 1, "generationId": self.contract["generationId"],
                   "contractSha256": self.contract_sha, "outcome": outcome,
                   "artifacts": artifacts}
        request_path = self.custody / "export-request.private.json"
        request_sha = write(request_path, request)
        result = MODULE.export_generation(self.args(
            export_request=request_path, export_request_sha256=request_sha))
        self.lifecycle_sha = result["lifecycleSha256"]
        return result

    def prepare(self) -> dict:
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            return MODULE.prepare(self.args())

    def authorize(self, intent_sha: str) -> tuple[Path, str]:
        intent = json.loads((self.custody / "disposable-builder.intent.private.json").read_bytes())
        value = {"schemaVersion": 1, "decision": "AUTHORIZE_ONCE",
                 "intentSha256": intent_sha,
                 "approvedPaths": [item["path"] for item in intent["commands"]],
                 "owner": "synthetic-test"}
        path = self.custody / "authorization.private.json"
        return path, write(path, value)

    def execute(self, intent_sha: str, authorization: Path, auth_sha: str):
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            return MODULE.execute(self.args(
                intent=self.custody / "disposable-builder.intent.private.json",
                intent_sha256=intent_sha, authorization=authorization,
                authorization_sha256=auth_sha))

    def complete(self, include_failure=False) -> dict:
        self.export(include_failure=include_failure)
        prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        return self.execute(prepared["intentSha256"], authorization, auth_sha)

    def assert_closed(self, result: dict) -> None:
        self.assertEqual(result["state"], "SANITIZED")
        self.assertFalse(self.root.exists())
        registry = run("git", "worktree", "list", "--porcelain", cwd=self.repository)
        self.assertNotIn(str(self.worktree), registry)
        for path in self.exports.iterdir():
            self.assertTrue(path.is_file())
        receipt = json.loads((self.custody / "disposable-builder.terminal-receipt.private.json").read_bytes())
        self.assertTrue(receipt["rootAbsent"] and receipt["worktreeRegistrationAbsent"])

    def test_success_exports_authority_and_leaves_zero_disposable_residue(self) -> None:
        historical = []
        for raw in self.contract["protectedPaths"]:
            path = Path(raw); path.mkdir(mode=0o700); (path / "sentinel").write_text("preserve\n")
            historical.append(path)
        before = MODULE.measure(self.root)
        result = self.complete()
        self.assert_closed(result)
        self.assertTrue(all((path / "sentinel").read_text() == "preserve\n" for path in historical))
        self.assertGreater(before["allocatedBytes"], 0)
        self.assertGreater(before["allocatedInodes"], 0)
        exported = MODULE.measure(self.custody)
        print("DISPOSABLE_LIFECYCLE_MEASURE",
              json.dumps({"beforeBytes": 0, "peakBytes": before["allocatedBytes"],
                          "afterBytes": 0, "peakInodes": before["allocatedInodes"],
                          "afterInodes": 0, "protectedCustodyBytes": exported["allocatedBytes"],
                          "protectedCustodyInodes": exported["allocatedInodes"]}, sort_keys=True))

    def test_terminal_replay_is_read_only_and_idempotent(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        first = self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.lifecycle_sha = sha((self.custody / "disposable-builder.lifecycle.private.json").read_bytes())
        journal = (self.custody / "disposable-builder.journal.private.jsonl").read_bytes()
        second = self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.assertTrue(second["replayed"])
        self.assertEqual(first["receiptSha256"], second["receiptSha256"])
        self.assertEqual(journal, (self.custody / "disposable-builder.journal.private.jsonl").read_bytes())

    def test_build_failure_before_package_exports_failure_evidence_and_closes(self) -> None:
        for path in self.sources.values():
            path.unlink()
        failure = Path(self.contract["roots"]["auxiliary"]) / "build-failure.log"
        failure.write_text("build denied\n")
        request = {"schemaVersion": 1, "generationId": self.contract["generationId"],
                   "contractSha256": self.contract_sha, "outcome": "FAILED",
                   "artifacts": [{"name": "failure-evidence", "source": str(failure),
                                  "destination": str(self.exports / failure.name),
                                  "sha256": sha(failure.read_bytes())}]}
        request_path = self.custody / "export-request.private.json"
        request_sha = write(request_path, request)
        exported = MODULE.export_generation(self.args(
            export_request=request_path, export_request_sha256=request_sha))
        self.lifecycle_sha = exported["lifecycleSha256"]
        prepared = self.prepare(); auth, auth_sha = self.authorize(prepared["intentSha256"])
        result = self.execute(prepared["intentSha256"], auth, auth_sha)
        self.assert_closed(result)
        self.assertEqual((self.exports / failure.name).read_text(), "build denied\n")

    def test_export_failure_preserves_root_as_retention_debt(self) -> None:
        request = {"schemaVersion": 1, "generationId": self.contract["generationId"],
                   "contractSha256": self.contract_sha, "outcome": "SUCCESS",
                   "artifacts": [{"name": name, "source": str(path),
                                  "destination": str(self.exports / path.name),
                                  "sha256": ("f" * 64 if name == "index" else sha(path.read_bytes()))}
                                 for name, path in self.sources.items()]}
        path = self.custody / "export-request.private.json"; request_sha = write(path, request)
        with self.assertRaisesRegex(MODULE.Denied, "disposable_export_source_hash"):
            MODULE.export_generation(self.args(export_request=path,
                                               export_request_sha256=request_sha))
        self.assertTrue(self.root.exists())
        lifecycle = json.loads((self.custody / "disposable-builder.lifecycle.private.json").read_bytes())
        self.assertEqual(lifecycle["state"], "RETENTION_DEBT")

    def test_partial_export_temporary_is_resumed_and_removed(self) -> None:
        source = self.sources["package"]
        destination = self.exports / source.name
        expected = sha(source.read_bytes())
        temporary = destination.with_name(f".{destination.name}.{expected}.tmp")
        temporary.write_bytes(source.read_bytes()[:3]); temporary.chmod(0o600)
        MODULE.copy_durable(source, destination, expected)
        self.assertEqual(destination.read_bytes(), source.read_bytes())
        self.assertFalse(temporary.exists())

    def test_interrupted_root_allocation_resumes_without_replacing_existing_directories(self) -> None:
        fresh = self.base / "second-root"
        custody = self.base / "second-custody"; custody.mkdir(mode=0o700)
        contract = json.loads(json.dumps(self.contract))
        contract["generationId"] = contract["generationId"] + "-resume"
        contract["disposableRoot"] = str(fresh)
        contract["custodyRoot"] = str(custody)
        contract["roots"] = {key: str(fresh / Path(value).name)
                             for key, value in contract["roots"].items()}
        contract["worktreePath"] = str(Path(contract["roots"]["worktrees"]) / "source")
        contract["locks"] = {"lifecycle": str(custody / "lifecycle.lock"),
                             "writer": str(custody / "writer.lock")}
        path = custody / "contract.private.json"; contract_sha = write(path, contract)
        lifecycle = {"schemaVersion": 1, "generationId": contract["generationId"],
                     "targetCommit": contract["targetCommit"],
                     "contractSha256": contract_sha, "state": "OPEN",
                     "event": "ALLOCATION_STARTED", "plannedRoot": str(fresh),
                     "plannedRoots": contract["roots"]}
        lifecycle_path = custody / "disposable-builder.lifecycle.private.json"
        lifecycle_sha = write(lifecycle_path, lifecycle)
        fresh.mkdir(mode=0o700)
        first = Path(contract["roots"]["worktrees"]); first.mkdir(mode=0o700)
        inode = first.stat().st_ino
        args = type("Args", (), {"contract": path, "contract_sha256": contract_sha,
                                  "lifecycle_sha256": lifecycle_sha})()
        result = MODULE.open_generation(args)
        self.assertEqual(result["state"], "OPEN")
        self.assertEqual(first.stat().st_ino, inode)
        self.assertTrue(all(Path(item).is_dir() for item in contract["roots"].values()))

    def test_transfer_failure_after_export_can_close_without_losing_package(self) -> None:
        result = self.complete(include_failure=True)
        self.assert_closed(result)
        self.assertTrue((self.exports / self.sources["package"].name).is_file())
        self.assertTrue((self.exports / "downstream-failure.log").is_file())

    def test_installation_failure_after_export_can_close_without_losing_package(self) -> None:
        result = self.complete(include_failure=True)
        self.assert_closed(result)
        self.assertEqual((self.exports / self.sources["package"].name).read_text(), "package\n")

    def test_interruption_during_finalization_resumes_without_repeating_worktree_effect(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        original = MODULE.remove_tree_contents
        calls = {"count": 0}
        def interrupted(root: Path) -> None:
            calls["count"] += 1
            victim = next(path for path in root.rglob("*") if path.is_file() and
                          self.worktree not in path.parents)
            victim.unlink()
            raise OSError("synthetic interruption")
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE, "remove_tree_contents", side_effect=interrupted):
            with self.assertRaisesRegex(OSError, "synthetic interruption"):
                MODULE.execute(self.args(
                    intent=self.custody / "disposable-builder.intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertFalse(self.worktree.exists())
        self.lifecycle_sha = sha((self.custody / "disposable-builder.lifecycle.private.json").read_bytes())
        with patch.object(MODULE, "remove_tree_contents", side_effect=original):
            result = self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.assert_closed(result)
        attempts = [item for item in MODULE.read_events(self.custody / "disposable-builder.journal.private.jsonl")
                    if item["event"] == "ATTEMPT" and item["kind"] == "git-worktree-remove"]
        self.assertEqual(len(attempts), 1)

    def test_interruption_after_worktree_removal_resumes_without_repeating_effect(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        original = MODULE.append_event
        interrupted = {"done": False}
        def stop_before_verified(path: Path, value: dict) -> None:
            if (value.get("event") == "VERIFIED" and value.get("ordinal") == 1 and
                    not interrupted["done"]):
                interrupted["done"] = True
                raise OSError("synthetic post-remove interruption")
            original(path, value)
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE, "append_event", side_effect=stop_before_verified):
            with self.assertRaisesRegex(OSError, "synthetic post-remove interruption"):
                MODULE.execute(self.args(
                    intent=self.custody / "disposable-builder.intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertFalse(self.worktree.exists())
        self.assertNotIn(str(self.worktree),
                         run("git", "worktree", "list", "--porcelain", cwd=self.repository))
        self.lifecycle_sha = sha((self.custody / "disposable-builder.lifecycle.private.json").read_bytes())
        result = self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.assert_closed(result)
        attempts = [item for item in MODULE.read_events(
            self.custody / "disposable-builder.journal.private.jsonl")
                    if item["event"] == "ATTEMPT" and item["kind"] == "git-worktree-remove"]
        self.assertEqual(len(attempts), 1)

    def test_intent_cannot_omit_authenticated_worktree_command(self) -> None:
        self.export(); prepared = self.prepare()
        intent_path = self.custody / "disposable-builder.intent.private.json"
        intent = json.loads(intent_path.read_bytes())
        intent["commands"] = intent["commands"][1:]
        intent_sha = write(intent_path, intent)
        authorization, auth_sha = self.authorize(intent_sha)
        with self.assertRaisesRegex(MODULE.Denied, "disposable_authorization_scope"):
            self.execute(intent_sha, authorization, auth_sha)
        self.assertTrue(self.worktree.exists())
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())

    def test_protected_historical_generation_cannot_overlap(self) -> None:
        value = dict(self.contract)
        value["protectedPaths"] = [str(self.root / "historical-v2")]
        with self.assertRaisesRegex(MODULE.Denied, "disposable_contract_protected"):
            MODULE.validate_contract(value)

    def test_missing_exported_evidence_denies_before_first_retirement_attempt(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        (self.exports / self.sources["package"].name).unlink()
        with self.assertRaisesRegex((MODULE.Denied, FileNotFoundError), ""):
            self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.assertTrue(self.root.exists())
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())

    def test_process_reference_denies_prepare(self) -> None:
        self.export()
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [{"pid": 9}], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_process_reference"):
                MODULE.prepare(self.args())
        self.assertTrue(self.root.exists())

    def test_new_reference_after_prepare_denies_before_first_attempt(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [{"pid": 10}], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_process_reference"):
                MODULE.execute(self.args(
                    intent=self.custody / "disposable-builder.intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())
        self.assertTrue(self.root.exists())

    def test_extra_content_after_prepare_denies_before_first_attempt(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        (Path(self.contract["roots"]["auxiliary"]) / "late-extra").write_text("drift\n")
        with self.assertRaisesRegex(MODULE.Denied, "disposable_inventory_extra"):
            self.execute(prepared["intentSha256"], authorization, auth_sha)
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())

    def test_root_identity_drift_denies_before_first_attempt(self) -> None:
        self.export(); prepared = self.prepare()
        authorization, auth_sha = self.authorize(prepared["intentSha256"])
        self.root.chmod(0o755)
        try:
            with self.assertRaisesRegex(MODULE.Denied, "disposable_root_identity"):
                self.execute(prepared["intentSha256"], authorization, auth_sha)
        finally:
            self.root.chmod(0o700)
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())

    def test_untracked_worktree_content_denies_prepare(self) -> None:
        self.export(); (self.worktree / "private-untracked.txt").write_text("unique\n")
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_worktree_dirty"):
                MODULE.prepare(self.args())

    def test_incomplete_process_observation_denies_prepare(self) -> None:
        self.export()
        with patch.object(MODULE, "process_observation", return_value={
                "complete": False, "references": [], "writers": [], "failures": [{"pid": 9}]}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_process_observation_incomplete"):
                MODULE.prepare(self.args())


if __name__ == "__main__":
    unittest.main(verbosity=2)
