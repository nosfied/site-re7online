#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import fcntl
import os
from pathlib import Path
import py_compile
import shutil
import stat
import subprocess
import tempfile
import time
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
PRODUCER_SPEC = importlib.util.spec_from_file_location(
    "converta_release", ROOT / "scripts/converta-release.py")
assert PRODUCER_SPEC and PRODUCER_SPEC.loader
PRODUCER = importlib.util.module_from_spec(PRODUCER_SPEC)
PRODUCER_SPEC.loader.exec_module(PRODUCER)


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
        (self.repository / "scripts").mkdir()
        shutil.copyfile(ROOT / "scripts/preparation_artifact_lifecycle.py",
                        self.repository / MODULE.RESIDUE_SOURCE)
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

    def export_failure(self) -> dict:
        failure = Path(self.contract["roots"]["auxiliary"]) / "build-denied.private.json"
        failure.write_text("denied before npm\n")
        request = {"schemaVersion": 1, "generationId": self.contract["generationId"],
                   "contractSha256": self.contract_sha, "outcome": "FAILED",
                   "artifacts": [{"name": "failure-evidence", "source": str(failure),
                                  "destination": str(self.exports / failure.name),
                                  "sha256": sha(failure.read_bytes())}]}
        request_path = self.custody / "failure-export-request.private.json"
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

    def add_residue(self) -> Path:
        if (self.worktree / "node_modules").exists():
            shutil.rmtree(self.worktree / "node_modules")
        source = self.worktree / MODULE.RESIDUE_SOURCE
        residue = self.worktree / MODULE.RESIDUE_FILE
        if residue.exists() or residue.is_symlink():
            residue.unlink()
        generated = Path(py_compile.compile(str(source), doraise=True))
        if generated != residue:
            generated.rename(residue)
        residue.parent.chmod(0o775)
        residue.chmod(0o664)
        return residue

    def prepare_residue(self) -> dict:
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            return MODULE.prepare_residue(self.args())

    def authorize_residue(self, intent_sha: str, *, approved_paths=None,
                          name="residue-authorization.private.json") -> tuple[Path, str]:
        intent = json.loads((self.custody / "disposable-builder.residue-intent.private.json").read_bytes())
        value = {"schemaVersion": 1, "decision": "AUTHORIZE_ONCE",
                 "intentSha256": intent_sha,
                 "approvedPaths": (approved_paths if approved_paths is not None else
                                   [item["path"] for item in intent["commands"]]),
                 "owner": "synthetic-test"}
        path = self.custody / name
        return path, write(path, value)

    def execute_residue(self, intent_sha: str, authorization: Path, auth_sha: str):
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            return MODULE.execute_residue(self.args(
                intent=self.custody / "disposable-builder.residue-intent.private.json",
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

    def assert_new_cache_root_denied(self, cache_name: str) -> None:
        root = self.base / f"invalid-{cache_name}"
        custody = self.base / f"invalid-{cache_name}-custody"
        custody.mkdir(mode=0o700)
        contract = json.loads(json.dumps(self.contract))
        contract["generationId"] += f"-{cache_name}"
        contract["disposableRoot"] = str(root)
        contract["custodyRoot"] = str(custody)
        contract["roots"] = {
            key: str(root / (cache_name if key == "cache" else Path(value).name))
            for key, value in contract["roots"].items()
        }
        contract["worktreePath"] = str(Path(contract["roots"]["worktrees"]) / "source")
        contract["locks"] = {"lifecycle": str(custody / "lifecycle.lock"),
                             "writer": str(custody / "writer.lock")}
        path = custody / "contract.private.json"
        contract_sha = write(path, contract)
        args = type("Args", (), {"contract": path, "contract_sha256": contract_sha,
                                  "lifecycle_sha256": None})()
        with self.assertRaisesRegex(MODULE.Denied, "disposable_contract_cache_root"):
            MODULE.open_generation(args)
        self.assertFalse(root.exists())
        self.assertEqual([item.name for item in custody.iterdir()], [path.name])

    def test_new_generation_requires_canonical_npm_cache_before_allocation(self) -> None:
        self.assert_new_cache_root_denied("cache")
        self.assert_new_cache_root_denied("alternate-cache")

    def test_historical_contract_remains_parseable_for_retirement(self) -> None:
        historical = json.loads(json.dumps(self.contract))
        historical["roots"]["cache"] = str(self.root / "cache")
        self.assertIs(MODULE.validate_contract(historical), historical)

    def test_canonical_cache_root_is_accepted_by_real_producer(self) -> None:
        roots = self.contract["roots"]
        physical = {
            "repository": self.repository,
            "worktrees": Path(roots["worktrees"]),
            "outputs": Path(roots["outputs"]),
            "releases": Path(roots["releases"]),
            "staging": Path(roots["staging"]),
            "evidence": Path(roots["auxiliary"]),
        }
        policy = {"schemaVersion": 1, "canonicalRoots": {
            key: {"path": str(path), "ownerUid": path.stat().st_uid,
                  "groupGid": path.stat().st_gid,
                  "allowedModes": [f"0{stat.S_IMODE(path.stat().st_mode):03o}"]}
            for key, path in physical.items()
        }}
        policy_path = self.custody / "root-policy.private.json"
        policy_sha = write(policy_path, policy)
        args = type("Args", (), {
            "root_policy": policy_path, "root_policy_sha256": policy_sha,
            "output": Path(roots["outputs"]) / "producer-output",
            "installed_releases_root": Path(roots["releases"]),
            "repo": self.worktree, "npm_cache_root": Path(roots["cache"]),
            "temporary_root": Path(roots["temporary"]),
        })()
        authenticated = PRODUCER.validate_build_paths(args)
        self.assertEqual(authenticated["worktrees"], Path(roots["worktrees"]))

    def test_bytecode_residue_is_reconciled_then_normal_lifecycle_closes(self) -> None:
        historical = []
        for raw in self.contract["protectedPaths"]:
            path = Path(raw); path.mkdir(mode=0o700); (path / "sentinel").write_text("preserve\n")
            historical.append(path)
        residue = self.add_residue(); self.export_failure()
        prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        result = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertFalse(residue.exists())
        self.assertFalse(residue.parent.exists())
        self.assertEqual(run("git", "status", "--porcelain=v1", "--untracked-files=all",
                             cwd=self.worktree), "")
        receipt = json.loads((self.custody / "disposable-builder.residue-receipt.private.json").read_bytes())
        self.assertEqual(receipt["removedPaths"], [
            str(self.worktree / MODULE.RESIDUE_FILE), str(self.worktree / MODULE.RESIDUE_DIRECTORY)])
        normal = self.prepare(); normal_auth, normal_auth_sha = self.authorize(normal["intentSha256"])
        closed = self.execute(normal["intentSha256"], normal_auth, normal_auth_sha)
        self.assert_closed(closed)
        self.assertTrue(all((path / "sentinel").read_text() == "preserve\n" for path in historical))

    def test_bytecode_residue_content_symlink_and_hardlink_are_denied(self) -> None:
        self.export_failure()
        for mutation in ("content", "symlink", "hardlink"):
            with self.subTest(mutation=mutation):
                residue = self.add_residue()
                if mutation == "content":
                    residue.write_bytes(b"not bytecode")
                elif mutation == "symlink":
                    residue.unlink(); residue.symlink_to(self.worktree / MODULE.RESIDUE_SOURCE)
                else:
                    residue.unlink(); os.link(self.worktree / MODULE.RESIDUE_SOURCE, residue)
                with patch.object(MODULE, "process_observation", return_value={
                        "complete": True, "references": [], "writers": [], "failures": []}):
                    with self.assertRaises(MODULE.Denied):
                        MODULE.prepare_residue(self.args())
                self.assertFalse((self.custody / "disposable-builder.residue-intent.private.json").exists())

    def test_bytecode_residue_extra_ignored_tracked_and_index_drift_are_denied(self) -> None:
        residue = self.add_residue(); self.export_failure()
        (residue.parent / "other.pyc").write_bytes(b"extra")
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_git_status"):
                MODULE.prepare_residue(self.args())
        (residue.parent / "other.pyc").unlink()
        (self.worktree / "node_modules").mkdir()
        (self.worktree / "node_modules/ignored").write_text("extra\n")
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_git_status"):
                MODULE.prepare_residue(self.args())
        shutil.rmtree(self.worktree / "node_modules")
        (self.worktree / "tracked.txt").write_text("dirty\n")
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_git_status"):
                MODULE.prepare_residue(self.args())
        run("git", "checkout", "--", "tracked.txt", cwd=self.worktree)
        (self.worktree / "tracked.txt").write_text("staged\n")
        run("git", "add", "tracked.txt", cwd=self.worktree)
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}):
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_git_status"):
                MODULE.prepare_residue(self.args())

    def test_bytecode_residue_identity_drift_denies_before_attempt(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        original = residue.read_bytes(); descriptor = os.open(residue, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            residue.unlink(); residue.write_bytes(original); residue.chmod(0o664)
            authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_sealed_drift"):
                self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        finally:
            os.close(descriptor)
        self.assertFalse((self.custody / "disposable-builder.residue-journal.private.jsonl").exists())

    def test_bytecode_residue_mode_and_owner_binding_deny_before_attempt(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        residue.chmod(0o644)
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_sealed_drift"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        residue.chmod(0o664)
        intent_path = self.custody / "disposable-builder.residue-intent.private.json"
        intent = json.loads(intent_path.read_bytes())
        intent["sealedObservation"]["residue"]["ownerUid"] += 1
        intent_sha = write(intent_path, intent)
        authorization, auth_sha = self.authorize_residue(intent_sha, name="owner-authorization.private.json")
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_intent_binding"):
            self.execute_residue(intent_sha, authorization, auth_sha)
        self.assertFalse((self.custody / "disposable-builder.residue-journal.private.jsonl").exists())

    def test_bytecode_residue_process_and_lock_negatives(self) -> None:
        self.add_residue(); self.export_failure()
        for observed, predicate in ((
                {"complete": False, "references": [], "writers": [], "failures": [{"pid": 1}]},
                "disposable_process_observation_incomplete"), (
                {"complete": True, "references": [{"pid": 2}], "writers": [], "failures": []},
                "disposable_process_reference"), (
                {"complete": True, "references": [], "writers": [{"pid": 3}], "failures": []},
                "disposable_process_writer")):
            with self.subTest(predicate=predicate), \
                 patch.object(MODULE, "process_observation", return_value=observed):
                with self.assertRaisesRegex(MODULE.Denied, predicate):
                    MODULE.prepare_residue(self.args())
        lock = Path(self.contract["locks"]["lifecycle"])
        fd = os.open(lock, os.O_RDWR | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with self.assertRaisesRegex(MODULE.Denied, "disposable_lock_busy"):
                self.prepare_residue()
        finally:
            os.close(fd)

    def test_bytecode_residue_divergent_authorization_denies_before_attempt(self) -> None:
        self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(
            prepared["intentSha256"], approved_paths=[])
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_authorization_scope"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertFalse((self.custody / "disposable-builder.residue-journal.private.jsonl").exists())

    def test_bytecode_residue_resume_after_attempt_does_not_duplicate_attempt(self) -> None:
        self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        real_run = MODULE.subprocess.run
        interrupted = {"done": False}
        def run_once(argv, **kwargs):
            if argv[:1] == ["/usr/bin/rm"] and not interrupted["done"]:
                interrupted["done"] = True
                raise OSError("synthetic interruption after attempt")
            return real_run(argv, **kwargs)
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE.subprocess, "run", side_effect=run_once):
            with self.assertRaisesRegex(OSError, "synthetic interruption"):
                MODULE.execute_residue(self.args(
                    intent=self.custody / "disposable-builder.residue-intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        result = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual(result["state"], "COMPLETED")
        events = MODULE.read_events(self.custody / "disposable-builder.residue-journal.private.jsonl")
        self.assertEqual(sum(item["event"] == "ATTEMPT" and item["ordinal"] == 1 for item in events), 1)

    def test_bytecode_residue_reconciles_file_removed_before_result_without_repeating_rm(self) -> None:
        historical = []
        for raw in self.contract["protectedPaths"]:
            path = Path(raw); path.mkdir(mode=0o700); (path / "sentinel").write_text("preserve\n")
            historical.append(path)
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        real_run = MODULE.subprocess.run
        interrupted = {"done": False}
        def remove_then_stop(argv, **kwargs):
            result = real_run(argv, **kwargs)
            if argv[:1] == ["/usr/bin/rm"] and not interrupted["done"]:
                interrupted["done"] = True
                raise OSError("synthetic interruption after physical rm")
            return result
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE.subprocess, "run", side_effect=remove_then_stop):
            with self.assertRaisesRegex(OSError, "after physical rm"):
                MODULE.execute_residue(self.args(
                    intent=self.custody / "disposable-builder.residue-intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertFalse(residue.exists()); self.assertTrue(residue.parent.is_dir())
        before = MODULE.read_events(self.custody / "disposable-builder.residue-journal.private.jsonl")
        self.assertEqual([item["event"] for item in before], ["ATTEMPT"])
        repeated = []
        def record_commands(argv, **kwargs):
            if argv[:1] in (["/usr/bin/rm"], ["/usr/bin/rmdir"]):
                repeated.append(argv[0])
            return real_run(argv, **kwargs)
        with patch.object(MODULE.subprocess, "run", side_effect=record_commands):
            result = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual(repeated, ["/usr/bin/rmdir"])
        receipt = json.loads((self.custody / "disposable-builder.residue-receipt.private.json").read_bytes())
        self.assertEqual(receipt["reconciledOrdinals"], [1])
        self.assertTrue(self.worktree.is_dir())
        self.assertIn(str(self.worktree), run("git", "worktree", "list", "--porcelain",
                                             cwd=self.repository))
        self.assertTrue(all((path / "sentinel").read_text() == "preserve\n"
                            for path in historical))

    def test_bytecode_residue_reconciles_directory_removed_before_result_without_repeating(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        real_run = MODULE.subprocess.run
        interrupted = {"done": False}
        def remove_then_stop(argv, **kwargs):
            result = real_run(argv, **kwargs)
            if argv[:1] == ["/usr/bin/rmdir"] and not interrupted["done"]:
                interrupted["done"] = True
                raise OSError("synthetic interruption after physical rmdir")
            return result
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE.subprocess, "run", side_effect=remove_then_stop):
            with self.assertRaisesRegex(OSError, "after physical rmdir"):
                MODULE.execute_residue(self.args(
                    intent=self.custody / "disposable-builder.residue-intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertFalse(residue.exists()); self.assertFalse(residue.parent.exists())
        destructive = []
        def reject_repeat(argv, **kwargs):
            if argv[:1] in (["/usr/bin/rm"], ["/usr/bin/rmdir"]):
                destructive.append(argv)
                raise AssertionError("destructive command repeated")
            return real_run(argv, **kwargs)
        with patch.object(MODULE.subprocess, "run", side_effect=reject_repeat):
            result = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual(destructive, [])
        receipt = json.loads((self.custody / "disposable-builder.residue-receipt.private.json").read_bytes())
        self.assertEqual(receipt["reconciledOrdinals"], [2])
        events = MODULE.read_events(self.custody / "disposable-builder.residue-journal.private.jsonl")
        reconciled = [item for item in events if item.get("resultSource") == "RECONCILED_ABSENCE"]
        self.assertEqual([item["ordinal"] for item in reconciled], [2])

    def test_bytecode_residue_absence_without_attempt_is_denied(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        residue.unlink()
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_attempt_ambiguous"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertFalse((self.custody / "disposable-builder.residue-journal.private.jsonl").exists())

    def test_bytecode_residue_reconciliation_denies_unexpected_content_after_effect(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        journal = self.custody / "disposable-builder.residue-journal.private.jsonl"
        MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
            "kind": "remove-bytecode", "path": str(residue),
            "argv": ["/usr/bin/rm", "--", str(residue)]})
        residue.unlink(); (residue.parent / "unexpected.pyc").write_bytes(b"unexpected")
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_git_status"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual([item["event"] for item in MODULE.read_events(journal)], ["ATTEMPT"])

    def test_bytecode_residue_reconciliation_denies_directory_identity_drift(self) -> None:
        residue = self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        journal = self.custody / "disposable-builder.residue-journal.private.jsonl"
        MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
            "kind": "remove-bytecode", "path": str(residue),
            "argv": ["/usr/bin/rm", "--", str(residue)]})
        directory_fd = os.open(residue.parent, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            residue.unlink(); residue.parent.rmdir(); residue.parent.mkdir(mode=0o775)
            with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_sealed_drift_directory"):
                self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        finally:
            os.close(directory_fd)
        self.assertEqual([item["event"] for item in MODULE.read_events(journal)], ["ATTEMPT"])

    def test_bytecode_residue_resume_after_completed_effect_does_not_repeat_it(self) -> None:
        self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        real_append = MODULE.append_event
        interrupted = {"done": False}
        def stop_before_verified(path, value):
            if value == {"event": "VERIFIED", "ordinal": 1, "absent": True} and not interrupted["done"]:
                interrupted["done"] = True
                raise OSError("synthetic post-result interruption")
            real_append(path, value)
        with patch.object(MODULE, "process_observation", return_value={
                "complete": True, "references": [], "writers": [], "failures": []}), \
             patch.object(MODULE, "append_event", side_effect=stop_before_verified):
            with self.assertRaisesRegex(OSError, "synthetic post-result interruption"):
                MODULE.execute_residue(self.args(
                    intent=self.custody / "disposable-builder.residue-intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        destructive = []
        real_run = MODULE.subprocess.run
        def observe_commands(argv, **kwargs):
            if argv[:1] in (["/usr/bin/rm"], ["/usr/bin/rmdir"]):
                destructive.append(argv)
            return real_run(argv, **kwargs)
        with patch.object(MODULE.subprocess, "run", side_effect=observe_commands):
            result = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertEqual([item[0] for item in destructive], ["/usr/bin/rmdir"])

    def test_bytecode_residue_terminal_replay_requires_same_authorization(self) -> None:
        self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        first = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        journal = (self.custody / "disposable-builder.residue-journal.private.jsonl").read_bytes()
        replay = self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        self.assertTrue(replay["replayed"])
        self.assertEqual(first["receiptSha256"], replay["receiptSha256"])
        self.assertEqual(journal, (self.custody / "disposable-builder.residue-journal.private.jsonl").read_bytes())
        other, other_sha = self.authorize_residue(
            prepared["intentSha256"], name="other-residue-authorization.private.json")
        value = json.loads(other.read_bytes()); value["owner"] = "different-owner"; other_sha = write(other, value)
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_terminal_replay"):
            self.execute_residue(prepared["intentSha256"], other, other_sha)

    def test_bytecode_residue_terminal_replay_authenticates_receipt_and_journal(self) -> None:
        self.add_residue(); self.export_failure(); prepared = self.prepare_residue()
        authorization, auth_sha = self.authorize_residue(prepared["intentSha256"])
        self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        receipt_path = self.custody / "disposable-builder.residue-receipt.private.json"
        receipt_raw = receipt_path.read_bytes()
        receipt = json.loads(receipt_raw); receipt["automaticRetry"] = True
        write(receipt_path, receipt)
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_terminal_replay"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)
        receipt_path.write_bytes(receipt_raw); receipt_path.chmod(0o600)
        journal = self.custody / "disposable-builder.residue-journal.private.jsonl"
        journal.write_bytes(journal.read_bytes() + b"\n"); journal.chmod(0o600)
        with self.assertRaisesRegex(MODULE.Denied, "disposable_residue_journal_hash"):
            self.execute_residue(prepared["intentSha256"], authorization, auth_sha)

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

    def privileged_context(self, *, reference_phase=None):
        original_run = MODULE.subprocess.run
        observations = []
        report = self.custody / "observer-installation.private.json"
        helper = {"path": str(MODULE.PRIVILEGED_OBSERVER_PATH), "sha256": "a" * 64,
                  "device": 7, "inode": 11, "uid": 0, "gid": 0, "mode": "0500"}
        attested_helper = {
            "path": helper["path"], "sha256": helper["sha256"],
            "identity": {"device": helper["device"], "inode": helper["inode"],
                         "uid": helper["uid"], "gid": helper["gid"],
                         "mode": helper["mode"], "type": "regular", "size": 123,
                         "mtimeNs": 456, "ctimeNs": 789},
            "ancestors": [{"path": "/usr/local/libexec/re7online",
                           "identity": {"type": "directory"}}],
            "interpreter": {"path": "/usr/bin/python3.12",
                            "identity": {"type": "regular"}},
        }
        write(report, {"schemaVersion": 1,
                       "kind": "A838BD33_BUILDER_OBSERVER_INSTALLATION",
                       "state": "UPGRADED",
                       "installerSha256": MODULE.PRIVILEGED_INSTALLER_SHA256,
                       "helper": helper, "createdDirectories": [],
                       "sudoersChanged": False})

        def run_observer(command, **kwargs):
            if command[:4] != ["/usr/bin/sudo", "-n", "--", "/usr/bin/python3"]:
                return original_run(command, **kwargs)
            request_raw = kwargs["input"]
            request = json.loads(request_raw)
            observations.append(request)
            if reference_phase == request["phase"]:
                return subprocess.CompletedProcess(command, 1, b"", b"reference\n")
            now = time.time_ns()
            value = {
                "schemaVersion": 1, "kind": "DISPOSABLE_BUILDER_PROC_ATTESTATION",
                "state": "COMPLETE", "phase": request["phase"],
                "requestSha256": MODULE.digest(request_raw), "nonce": request["nonce"],
                "generationId": request["generationId"], "targetCommit": request["targetCommit"],
                "contractSha256": request["contractSha256"],
                "lifecycleSha256": request["lifecycleSha256"],
                "candidatePaths": [request["root"]["path"]], "root": request["root"],
                "locks": request["locks"], "consumer": request["consumer"],
                "capturedAtNs": now, "finishedAtNs": now,
                "observation": {"complete": True, "references": [], "activeWriters": [],
                                "failures": [], "failureDetailsTruncated": 0},
                "mechanism": attested_helper,
                "administrativeExecution": {
                    "mode": "AUTHENTICATED_SUDO", "uid": self.contract["ownerUid"],
                    "gid": self.contract["groupGid"],
                    "user": MODULE.pwd.getpwuid(self.contract["ownerUid"]).pw_name,
                    "commandSha256": MODULE.digest(("/usr/bin/python3 -I -B -E -s " +
                        str(MODULE.PRIVILEGED_OBSERVER_PATH) + " " +
                        MODULE.PRIVILEGED_OBSERVER_COMMAND).encode())},
            }
            return subprocess.CompletedProcess(command, 0, MODULE.canonical(value), b"")

        patches = (
            patch.object(MODULE, "PRIVILEGED_GENERATION", self.contract["generationId"]),
            patch.object(MODULE.subprocess, "run", side_effect=run_observer),
        )
        return patches, observations, report

    def test_privileged_attestation_requires_runtime_identity_bound_to_installation(self) -> None:
        installed = {"path": str(MODULE.PRIVILEGED_OBSERVER_PATH), "sha256": "a" * 64,
                     "device": 7, "inode": 11, "uid": 0, "gid": 0, "mode": "0500"}
        with self.assertRaisesRegex(MODULE.Denied, "disposable_privileged_attestation"):
            MODULE._attested_observer(installed, installed)
        mechanism = {
            "path": installed["path"], "sha256": installed["sha256"],
            "identity": {"device": installed["device"], "inode": installed["inode"],
                         "uid": 0, "gid": 0, "mode": "0500", "type": "regular",
                         "size": 123, "mtimeNs": 456, "ctimeNs": 789},
            "ancestors": [{"path": "/usr/local", "identity": {"type": "directory"}}],
            "interpreter": {"path": "/usr/bin/python3.12",
                            "identity": {"type": "regular"}},
        }
        MODULE._attested_observer(mechanism, installed)
        mechanism["identity"]["inode"] += 1
        with self.assertRaisesRegex(MODULE.Denied, "disposable_privileged_attestation"):
            MODULE._attested_observer(mechanism, installed)

    def test_privileged_profile_bridges_prepare_and_execute_to_sanitized(self) -> None:
        self.export()
        patches, observations, report = self.privileged_context()
        with patches[0], patches[1]:
            prepared = MODULE.prepare(self.args(
                process_observer=MODULE.PRIVILEGED_OBSERVER_PATH,
                process_observer_sha256="a" * 64,
                process_observer_installation_report=report,
                process_observer_installation_report_sha256=sha(report.read_bytes())))
            intent = json.loads((self.custody / "disposable-builder.intent.private.json").read_bytes())
            self.assertEqual(intent["processObservation"]["kind"], "PRIVILEGED")
            authorization, auth_sha = self.authorize(prepared["intentSha256"])
            result = MODULE.execute(self.args(
                process_observer=MODULE.PRIVILEGED_OBSERVER_PATH,
                process_observer_sha256="a" * 64,
                process_observer_installation_report=report,
                process_observer_installation_report_sha256=sha(report.read_bytes()),
                intent=self.custody / "disposable-builder.intent.private.json",
                intent_sha256=prepared["intentSha256"], authorization=authorization,
                authorization_sha256=auth_sha))
        self.assertEqual(result["state"], "SANITIZED")
        self.assertEqual([item["phase"] for item in observations], ["PREPARE", "EXECUTE"])
        self.assertNotEqual(observations[0]["nonce"], observations[1]["nonce"])
        receipt = json.loads((self.custody / "disposable-builder.terminal-receipt.private.json").read_bytes())
        self.assertEqual(receipt["processObservation"]["phase"], "EXECUTE")
        self.assertFalse(self.root.exists())
        self.assertNotIn(str(self.worktree),
                         run("git", "worktree", "list", "--porcelain", cwd=self.repository))

    def test_privileged_execute_reference_denies_before_first_attempt(self) -> None:
        self.export()
        patches, observations, report = self.privileged_context(reference_phase="EXECUTE")
        with patches[0], patches[1]:
            prepared = MODULE.prepare(self.args(
                process_observer=MODULE.PRIVILEGED_OBSERVER_PATH,
                process_observer_sha256="a" * 64,
                process_observer_installation_report=report,
                process_observer_installation_report_sha256=sha(report.read_bytes())))
            authorization, auth_sha = self.authorize(prepared["intentSha256"])
            with self.assertRaisesRegex(MODULE.Denied, "disposable_privileged_observer_execution"):
                MODULE.execute(self.args(
                    process_observer=MODULE.PRIVILEGED_OBSERVER_PATH,
                    process_observer_sha256="a" * 64,
                    process_observer_installation_report=report,
                    process_observer_installation_report_sha256=sha(report.read_bytes()),
                    intent=self.custody / "disposable-builder.intent.private.json",
                    intent_sha256=prepared["intentSha256"], authorization=authorization,
                    authorization_sha256=auth_sha))
        self.assertEqual([item["phase"] for item in observations], ["PREPARE", "EXECUTE"])
        self.assertFalse((self.custody / "disposable-builder.journal.private.jsonl").exists())
        self.assertTrue(self.root.exists())

    def test_privileged_profile_denies_divergent_installation_proof(self) -> None:
        self.export()
        patches, _, report = self.privileged_context()
        value = json.loads(report.read_bytes())
        value["helper"]["sha256"] = "b" * 64
        report_sha = write(report, value)
        with patches[0], patches[1], self.assertRaisesRegex(
                MODULE.Denied, "disposable_privileged_observer_installation"):
            MODULE.prepare(self.args(
                process_observer=MODULE.PRIVILEGED_OBSERVER_PATH,
                process_observer_sha256="a" * 64,
                process_observer_installation_report=report,
                process_observer_installation_report_sha256=report_sha))


if __name__ == "__main__":
    unittest.main(verbosity=2)
