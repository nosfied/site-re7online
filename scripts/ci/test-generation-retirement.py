#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
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
    def __init__(self, *, active=False, rollback=False, candidate=False, installed=True, deployed=True,
                 release_id="immutable-fixture"):
        self.temp = tempfile.TemporaryDirectory(prefix="generation-retirement-")
        self.root = Path(self.temp.name)
        self.output_root = self.root / "build-output"; self.output_root.mkdir(mode=0o755)
        self.output = self.output_root / "generation"; self.output.mkdir()
        self.worktrees_root = self.root / "build-worktrees"; self.worktrees_root.mkdir(mode=0o755)
        self.releases_root = self.root / "releases"; self.releases_root.mkdir(mode=0o755)
        self.staging_root = self.root / "staging-root"; self.staging_root.mkdir(mode=0o755)
        self.evidence_root = self.root / "evidence"; self.evidence_root.mkdir(mode=0o750)
        self.release_id = release_id
        self.target = "a" * 40
        self.writer_lock = self.root / ".generation-build.lock"; self.writer_lock.write_text(""); self.writer_lock.chmod(0o600)
        self.deploy_lock = self.root / ".deployment-window.lock"; self.deploy_lock.write_text(""); self.deploy_lock.chmod(0o600)
        self.repo = self.root / "repo"; self.repo.mkdir(mode=0o755)
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.repo, check=True)
        (self.repo / "tracked").write_text("x\n")
        subprocess.run(["git", "add", "."], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.repo, check=True)
        self.worktree = self.worktrees_root / "build-worktree"
        subprocess.run(["git", "-C", str(self.repo), "worktree", "add", "--detach", str(self.worktree)],
                       check=True, stdout=subprocess.DEVNULL)
        self.api = self.output / self.release_id / "api-runtime"; self.api.mkdir(parents=True); (self.api / "app").write_text("api")
        self.frontend = self.output / self.release_id / "frontend-runtime"; self.frontend.mkdir(); (self.frontend / "app").write_text("front")
        self.staging = self.staging_root / "staging"; self.staging.mkdir(); (self.staging / "item").write_text("stage")
        self.installed_release = self.releases_root / self.release_id
        self.installed_release.mkdir(parents=True); (self.installed_release / "installed").write_text("verified")
        self.package = self.output / f"{self.release_id}.tar.xz"; self.package.write_bytes(b"package")
        self.manifest = self.output / self.release_id / "manifest.json"; self.manifest.write_text("{}\n")
        self.index = self.output / self.release_id / "index.sha256"; self.index.write_text("{}\n")
        self.lifecycle = self.output / "generation-lifecycle.private.json"
        private_json(self.lifecycle, {"schemaVersion": 1, "generationId": self.release_id,
                                      "targetCommit": self.target, "state": "COMPLETE"})
        self.control = self.root / "control.py"; self.control.write_text("# control\n"); self.control.chmod(0o600)
        self.pm2_rows = [{"name": "api", "pid": 101, "pm2_env": {"pm_cwd": "/runtime/api",
                          "pm_exec_path": "/runtime/api/index.js", "exec_mode": "fork_mode",
                          "instances": 1, "args": [], "namespace": "default"}}]
        self.pm2_state = self.root / "pm2-state.json"
        self.pm2_state.write_text(json.dumps(self.pm2_rows))
        self.pm2 = self.root / "pm2"
        self.pm2.write_text("#!/usr/bin/env python3\nfrom pathlib import Path\nprint(Path(" + repr(str(self.pm2_state)) + ").read_text())\n")
        self.pm2.chmod(0o700)
        self.dump = self.root / "dump.pm2"; private_json(self.dump, {"fixture": "dump"})
        self.current = self.root / "current-frontend"
        os.symlink(self.installed_release, self.current)
        def policy_entry(path: Path) -> dict:
            info = path.lstat()
            return {"path": str(path), "ownerUid": info.st_uid, "groupGid": info.st_gid,
                    "allowedModes": [f"0{stat.S_IMODE(info.st_mode):03o}"]}
        self.policy = self.root / "root-policy.private.json"
        private_json(self.policy, {"schemaVersion": 1, "canonicalRoots": {
            "repository": policy_entry(self.repo), "worktrees": policy_entry(self.worktrees_root),
            "outputs": policy_entry(self.output_root), "releases": policy_entry(self.releases_root),
            "staging": policy_entry(self.staging_root), "evidence": [{
                **policy_entry(self.evidence_root), "allowedModes": ["0700", "0750"]}]}})

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
        self.graph = self.root / "release-graph.private.json"
        effective_active = active or deployed
        graph = {"activeReleases": [self.release_id] if effective_active else [],
                 "rollbackReleases": [self.release_id] if rollback else [],
                 "transitiveReturnReleases": [], "candidateReleases": [self.release_id] if candidate else [],
                 "installedVerifiedReleases": [self.release_id] if installed else [],
                 "supersededCandidates": []}
        private_json(self.graph, graph)
        self.operational = self.root / "operational.private.json"
        private_json(self.operational, {"schemaVersion": 2, "generationId": self.release_id,
                     "releaseId": self.release_id, "targetCommit": self.target,
                     "gitRepository": str(self.repo), "currentPaths": [str(self.installed_release)], "pm2LivePaths": [],
                     "pm2DumpPaths": [], "activeReleases": [self.release_id] if effective_active else [],
                     "rollbackReleases": [self.release_id] if rollback else [], "transitiveReturnReleases": [],
                     "candidateReleases": [self.release_id] if candidate else [],
                     "installedVerifiedReleases": [self.release_id] if installed else [],
                     "supersededCandidates": [], "dependencies": [],
                     "controlPlaneArtifacts": [{"path": str(self.control), "sha256": sha(self.control), "copied": True}],
                     "deploymentState": {"state": "DEPLOYED" if deployed else "PENDING"},
                     "canonicalRoots": {"repository": str(self.repo), "worktrees": str(self.worktrees_root),
                         "outputs": str(self.output_root), "releases": str(self.releases_root),
                         "staging": str(self.staging_root), "evidence": [str(self.evidence_root)]},
                     "observations": {"currentLinks": [{"path": str(self.current), "target": str(self.installed_release)}],
                         "pm2": {"path": str(self.pm2), "sha256": sha(self.pm2),
                                 "fingerprintSha256": MODULE._pm2_fingerprint(self.pm2_rows)},
                         "dump": {"path": str(self.dump), "sha256": sha(self.dump)},
                         "releaseGraph": {"path": str(self.graph), "sha256": sha(self.graph)}}})
        self.intent = self.evidence_root / "intent.private.json"
        self.commands = self.evidence_root / "commands.private.txt"
        self.review = self.evidence_root / "generation-review.private.json"

    def prepare(self, *extra: str):
        return invoke("prepare", "--contract", str(self.contract), "--contract-sha256", sha(self.contract),
                      "--lifecycle", str(self.lifecycle), "--lifecycle-sha256", sha(self.lifecycle),
                      "--operational-state", str(self.operational), "--operational-state-sha256", sha(self.operational),
                      "--root-policy", str(self.policy), "--root-policy-sha256", sha(self.policy),
                      "--deployment-lock", str(self.deploy_lock), "--intent-output", str(self.intent),
                      "--commands-output", str(self.commands), "--review-output", str(self.review),
                      "--reviewer", "fixture-owner", "--reason", "fixture close", *extra)

    def authorize(self, name="fixture-once"):
        intent = json.loads(self.intent.read_text())
        authorization = self.evidence_root / f"{name}.private.json"
        private_json(authorization, {"schemaVersion": 1, "authorizationId": name,
                     "decision": "AUTHORIZE_ONCE", "intentSha256": sha(self.intent),
                     "approvedPaths": [item["path"] for item in intent["commands"]], "owner": "fixture-owner"})
        return authorization

    def execute(self, authorization: Path, receipt_name="receipt"):
        receipt = self.evidence_root / receipt_name
        result = invoke("execute", "--intent", str(self.intent), "--intent-sha256", sha(self.intent),
                        "--authorization", str(authorization), "--authorization-sha256", sha(authorization),
                        "--operational-state", str(self.operational), "--operational-state-sha256", sha(self.operational),
                        "--root-policy", str(self.policy), "--root-policy-sha256", sha(self.policy),
                        "--deployment-lock", str(self.deploy_lock), "--receipt-root", str(receipt),
                        "--review-output", str(self.review))
        return result, receipt

    def mark_deployed(self):
        operational = json.loads(self.operational.read_text())
        operational["deploymentState"] = {"state": "DEPLOYED"}
        operational["installedVerifiedReleases"] = [self.release_id]
        operational["candidateReleases"] = []
        operational["activeReleases"] = [self.release_id]
        graph = {key: operational[key] for key in ("activeReleases", "rollbackReleases",
                 "transitiveReturnReleases", "candidateReleases", "installedVerifiedReleases",
                 "supersededCandidates")}
        private_json(self.graph, graph)
        operational["observations"]["releaseGraph"]["sha256"] = sha(self.graph)
        private_json(self.operational, operational)

    def close(self):
        self.temp.cleanup()


class LegacyBootstrapFixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="legacy-generation-bootstrap-")
        self.root = Path(self.temp.name)
        self.repository = self.root / "repository"; self.repository.mkdir(mode=0o755)
        self.worktrees = self.root / "build-worktrees"; self.worktrees.mkdir(mode=0o755)
        self.outputs = self.root / "build-output"; self.outputs.mkdir(mode=0o755)
        self.releases = self.root / "releases"; self.releases.mkdir(mode=0o755)
        self.staging = self.root / "optional-staging"
        self.evidence = self.root / "evidence"; self.evidence.mkdir(mode=0o750)
        self.release_id = "immutable-legacy-fixture"
        self.output = self.outputs / "legacy-producer"; self.output.mkdir(mode=0o700)
        self.worktree = self.worktrees / "legacy-source"; self.worktree.mkdir(mode=0o755)
        subprocess.run(["git", "init", "-q"], cwd=self.worktree, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.worktree, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.worktree, check=True)
        (self.worktree / "tracked").write_text("legacy\n")
        subprocess.run(["git", "add", "."], cwd=self.worktree, check=True)
        subprocess.run(["git", "commit", "-qm", "legacy fixture"], cwd=self.worktree, check=True)
        self.target = subprocess.check_output(["git", "-C", str(self.worktree), "rev-parse", "HEAD"],
                                              text=True).strip()
        self.release_root = self.output / self.release_id
        self.api = self.release_root / "api-runtime"; self.api.mkdir(parents=True)
        self.frontend = self.release_root / "frontend-runtime"; self.frontend.mkdir()
        (self.api / "index.js").write_text("api\n")
        (self.frontend / "server.js").write_text("frontend\n")
        self.package = self.output / f"{self.release_id}.tar.xz"; self.package.write_bytes(b"fixture-package"); self.package.chmod(0o644)
        self.manifest = self.release_root / "manifest.json"; self.manifest.write_text("{}\n"); self.manifest.chmod(0o644)
        self.index = self.release_root / "index.sha256"; self.index.write_text("fixture-index\n"); self.index.chmod(0o644)
        self.lifecycle = self.output / "generation-lifecycle.private.json"
        private_json(self.lifecycle, {"schemaVersion": 1, "generationId": self.release_id,
                                      "targetCommit": self.target, "state": "COMPLETE"})
        self.writer_lock = self.outputs / ".generation-build.lock"
        self.writer_lock.write_text(""); self.writer_lock.chmod(0o600)
        self.installed = self.releases / self.release_id
        self.contract = self.output / "generation-artifacts.private.json"
        self.bootstrap_review = self.output / "generation-review.private.json"
        self.receipt = self.evidence / "legacy-bootstrap" / "bootstrap-receipt.private.json"

        self.verifier = self.root / "fake-converta-release.py"
        verification = {"result": "RELEASE VERIFIED", "releaseId": self.release_id,
                        "targetCommit": self.target, "manifestSha256": sha(self.manifest),
                        "indexSha256": sha(self.index), "apiEntrySha256": "a" * 64,
                        "buildId": "fixture-build", "indexEntries": 4}
        self.verifier.write_text("#!/usr/bin/env python3\nimport json\nprint(json.dumps(" + repr(verification) + "))\n")
        self.verifier.chmod(0o600)

        def policy_entry(path: Path) -> dict:
            info = path.lstat()
            return {"path": str(path), "ownerUid": info.st_uid, "groupGid": info.st_gid,
                    "allowedModes": [f"0{stat.S_IMODE(info.st_mode):03o}"]}
        self.policy = self.root / "root-policy.private.json"
        private_json(self.policy, {"schemaVersion": 1, "canonicalRoots": {
            "repository": policy_entry(self.repository), "worktrees": policy_entry(self.worktrees),
            "outputs": policy_entry(self.outputs), "releases": policy_entry(self.releases),
            "staging": {"path": str(self.staging), "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                        "allowedModes": ["0700"]},
            "evidence": [{**policy_entry(self.evidence), "allowedModes": ["0700", "0750"]}],
        }})

        self.other_release = self.releases / "immutable-current-fixture"; self.other_release.mkdir()
        self.current = self.root / "current"; os.symlink(self.other_release, self.current)
        self.pm2_rows = [{"name": "current", "pid": 101, "pm2_env": {
            "pm_cwd": str(self.other_release), "pm_exec_path": str(self.other_release / "server.js"),
            "exec_mode": "fork_mode", "instances": 1, "args": [], "namespace": "default"}}]
        self.pm2_state = self.root / "pm2-state.json"; self.pm2_state.write_text(json.dumps(self.pm2_rows))
        self.pm2 = self.root / "pm2"
        self.pm2.write_text("#!/usr/bin/env python3\nfrom pathlib import Path\nprint(Path(" +
                            repr(str(self.pm2_state)) + ").read_text())\n")
        self.pm2.chmod(0o700)
        self.dump = self.root / "dump.pm2"; private_json(self.dump, {"fixture": "dump"})
        self.graph = self.root / "release-graph.private.json"
        graph = {"activeReleases": [self.other_release.name], "rollbackReleases": [],
                 "transitiveReturnReleases": [], "candidateReleases": [],
                 "installedVerifiedReleases": [self.other_release.name],
                 "supersededCandidates": [self.release_id]}
        private_json(self.graph, graph)
        self.control = self.root / "control.py"; self.control.write_text("# fixture\n"); self.control.chmod(0o600)
        self.operational = self.evidence / "operational.private.json"
        private_json(self.operational, {"schemaVersion": 2, "generationId": self.release_id,
                     "releaseId": self.release_id, "targetCommit": self.target,
                     "gitRepository": str(self.repository), "currentPaths": [str(self.other_release)],
                     "pm2LivePaths": [str(self.other_release)], "pm2DumpPaths": [str(self.other_release)],
                     **graph, "dependencies": [],
                     "controlPlaneArtifacts": [{"path": str(self.control), "sha256": sha(self.control), "copied": True}],
                     "deploymentState": {"state": "SUPERSEDED"},
                     "canonicalRoots": {"repository": str(self.repository), "worktrees": str(self.worktrees),
                         "outputs": str(self.outputs), "releases": str(self.releases),
                         "staging": str(self.staging), "evidence": [str(self.evidence)]},
                     "observations": {"currentLinks": [{"path": str(self.current), "target": str(self.other_release)}],
                         "pm2": {"path": str(self.pm2), "sha256": sha(self.pm2),
                                 "fingerprintSha256": MODULE._pm2_fingerprint(self.pm2_rows)},
                         "dump": {"path": str(self.dump), "sha256": sha(self.dump)},
                         "releaseGraph": {"path": str(self.graph), "sha256": sha(self.graph)}}})
        self.descriptor_value = {
            "schemaVersion": 1, "sourceState": "LEGACY_PRE_CONTRACT", "releaseId": self.release_id,
            "targetCommit": self.target, "supersededPullRequest": 240,
            "outputPath": str(self.output), "worktreePath": str(self.worktree),
            "installedReleasePath": str(self.installed),
            "lifecycle": {"path": str(self.lifecycle), "sha256": sha(self.lifecycle)},
            "package": {"path": str(self.package), "sha256": sha(self.package)},
            "manifest": {"path": str(self.manifest), "sha256": sha(self.manifest)},
            "index": {"path": str(self.index), "sha256": sha(self.index)},
            "canonicalVerifierSha256": sha(self.verifier), "contractOutput": str(self.contract),
            "reviewOutput": str(self.bootstrap_review), "receiptOutput": str(self.receipt),
        }
        self.descriptor = self.root / "legacy-descriptor.json"; private_json(self.descriptor, self.descriptor_value)

    def arguments(self):
        return SimpleNamespace(descriptor=self.descriptor, descriptor_sha256=sha(self.descriptor),
                               root_policy=self.policy, root_policy_sha256=sha(self.policy),
                               operational_state=self.operational, operational_state_sha256=sha(self.operational),
                               reviewer="fixture-owner", reason="legacy candidate superseded")

    def bootstrap(self):
        with patch.object(MODULE, "LEGACY_123BA_BINDING", self.descriptor_value), \
                patch.object(MODULE, "canonical_release_verifier", return_value=self.verifier):
            MODULE.bootstrap_legacy(self.arguments())

    def close(self):
        self.temp.cleanup()


class GenerationRetirementTest(unittest.TestCase):
    def test_versioned_legacy_descriptor_is_closed_and_binds_canonical_verifier(self):
        descriptor_path = ROOT / "config/legacy-generation-123ba7bd.json"
        descriptor = json.loads(descriptor_path.read_text())
        self.assertEqual(descriptor, MODULE.LEGACY_123BA_BINDING)
        self.assertEqual(descriptor["canonicalVerifierSha256"],
                         sha(ROOT / "scripts/converta-release.py"))

    def test_legacy_pre_contract_bootstrap_then_canonical_prepare_passes(self):
        fixture = LegacyBootstrapFixture()
        try:
            # The normal path remains fail-closed while the authenticated
            # pre-contract bootstrap has not materialized the contract.
            missing = invoke("prepare", "--contract", str(fixture.contract),
                             "--contract-sha256", "0" * 64,
                             "--lifecycle", str(fixture.lifecycle), "--lifecycle-sha256", sha(fixture.lifecycle),
                             "--operational-state", str(fixture.operational),
                             "--operational-state-sha256", sha(fixture.operational),
                             "--root-policy", str(fixture.policy), "--root-policy-sha256", sha(fixture.policy),
                             "--deployment-lock", str(fixture.writer_lock),
                             "--intent-output", str(fixture.evidence / "missing-intent.json"),
                             "--commands-output", str(fixture.evidence / "missing-commands.txt"),
                             "--review-output", str(fixture.evidence / "missing-review.json"),
                             "--reviewer", "fixture-owner", "--reason", "must not infer legacy contract")
            self.assertEqual(missing.returncode, 2)
            self.assertIn("private_read:generation-artifacts.private.json", missing.stderr)

            fixture.bootstrap()
            self.assertTrue(fixture.contract.is_file())
            self.assertTrue(fixture.bootstrap_review.is_file())
            receipt = json.loads(fixture.receipt.read_text())
            self.assertEqual(receipt["state"], "LEGACY_CONTRACT_MATERIALIZED")
            self.assertEqual(receipt["scope"], "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN")
            self.assertFalse(receipt["authorizationGranted"])
            self.assertFalse(receipt["executionPermitted"])
            self.assertEqual(receipt["destructiveCommands"], 0)
            contract = json.loads(fixture.contract.read_text())
            self.assertEqual({item["path"] for item in contract["artifacts"]}, {
                str(fixture.package), str(fixture.manifest), str(fixture.index), str(fixture.lifecycle),
                str(fixture.worktree), str(fixture.api), str(fixture.frontend),
            })
            self.assertEqual({item["path"] for item in contract["artifacts"]
                              if item["state"] == "RETIREMENT_READY"},
                             {str(fixture.worktree), str(fixture.api), str(fixture.frontend)})

            retirement = fixture.evidence / "retirement"; retirement.mkdir(mode=0o700)
            intent = retirement / "intent.private.json"
            commands = retirement / "commands.private.txt"
            review = retirement / "generation-review.private.json"
            result = invoke("prepare", "--contract", str(fixture.contract),
                            "--contract-sha256", sha(fixture.contract),
                            "--lifecycle", str(fixture.lifecycle), "--lifecycle-sha256", sha(fixture.lifecycle),
                            "--operational-state", str(fixture.operational),
                            "--operational-state-sha256", sha(fixture.operational),
                            "--root-policy", str(fixture.policy), "--root-policy-sha256", sha(fixture.policy),
                            "--deployment-lock", str(fixture.writer_lock),
                            "--intent-output", str(intent), "--commands-output", str(commands),
                            "--review-output", str(review), "--reviewer", "fixture-owner",
                            "--reason", "sealed after authenticated legacy bootstrap")
            self.assertEqual(result.returncode, 0, result.stderr)
            sealed = json.loads(intent.read_text())
            self.assertEqual(sealed["state"], "SEALED_FOR_EXPLICIT_AUTHORIZATION")
            self.assertFalse(sealed["authorizationGranted"])
            self.assertEqual({item["path"] for item in sealed["commands"]},
                             {str(fixture.worktree), str(fixture.api), str(fixture.frontend)})
        finally:
            fixture.close()

    def test_legacy_bootstrap_denies_descriptor_and_authenticated_file_drift(self):
        mutations = (
            ("releaseId", "immutable-wrong"),
            ("targetCommit", "f" * 40),
            ("outputPath", "/outside/output"),
        )
        for field, value in mutations:
            fixture = LegacyBootstrapFixture()
            try:
                changed = json.loads(fixture.descriptor.read_text()); changed[field] = value
                private_json(fixture.descriptor, changed)
                with patch.object(MODULE, "LEGACY_123BA_BINDING", fixture.descriptor_value), \
                        patch.object(MODULE, "canonical_release_verifier", return_value=fixture.verifier):
                    with self.assertRaisesRegex(MODULE.Denied, "legacy_descriptor_binding"):
                        MODULE.bootstrap_legacy(fixture.arguments())
            finally:
                fixture.close()

        for name in ("lifecycle", "package", "manifest", "index"):
            fixture = LegacyBootstrapFixture()
            try:
                getattr(fixture, name).write_bytes(getattr(fixture, name).read_bytes() + b"drift")
                with self.assertRaisesRegex(MODULE.Denied, f"legacy_{name}_hash_or_drift"):
                    fixture.bootstrap()
            finally:
                fixture.close()

    def test_legacy_bootstrap_denies_installed_referenced_symlink_and_existing_outputs(self):
        fixture = LegacyBootstrapFixture()
        try:
            fixture.installed.mkdir()
            with self.assertRaisesRegex(MODULE.Denied, "legacy_release_installed"):
                fixture.bootstrap()
        finally:
            fixture.close()

        fixture = LegacyBootstrapFixture()
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["activeReleases"].append(fixture.release_id)
            private_json(fixture.operational, operational)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_release_referenced"):
                fixture.bootstrap()
        finally:
            fixture.close()

        fixture = LegacyBootstrapFixture()
        try:
            actual = fixture.root / "legacy-source-actual"
            fixture.worktree.rename(actual); os.symlink(actual, fixture.worktree)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_path_symlink:worktrees"):
                fixture.bootstrap()
        finally:
            fixture.close()

        fixture = LegacyBootstrapFixture()
        try:
            fixture.contract.write_text("occupied\n")
            with self.assertRaisesRegex(MODULE.Denied, "legacy_destination_exists"):
                fixture.bootstrap()
        finally:
            fixture.close()

    def test_legacy_bootstrap_denies_tree_drift_and_never_invokes_destructive_commands(self):
        fixture = LegacyBootstrapFixture()
        try:
            real_observation = MODULE._tree_observation
            calls = 0
            def mutate_before_second_output(path, label):
                nonlocal calls
                calls += 1
                if calls == 3:
                    (fixture.output / "late-file").write_text("late\n")
                return real_observation(path, label)
            with patch.object(MODULE, "LEGACY_123BA_BINDING", fixture.descriptor_value), \
                    patch.object(MODULE, "canonical_release_verifier", return_value=fixture.verifier), \
                    patch.object(MODULE, "_tree_observation", side_effect=mutate_before_second_output):
                with self.assertRaisesRegex(MODULE.Denied, "legacy_tree_drift_between_samples"):
                    MODULE.bootstrap_legacy(fixture.arguments())
        finally:
            fixture.close()

        fixture = LegacyBootstrapFixture()
        try:
            real_run = subprocess.run
            observed = []
            def record(command, **kwargs):
                observed.append([str(item) for item in command])
                return real_run(command, **kwargs)
            with patch.object(MODULE, "LEGACY_123BA_BINDING", fixture.descriptor_value), \
                    patch.object(MODULE, "canonical_release_verifier", return_value=fixture.verifier), \
                    patch.object(MODULE.subprocess, "run", side_effect=record):
                MODULE.bootstrap_legacy(fixture.arguments())
            flattened = [" ".join(command) for command in observed]
            self.assertFalse(any("/usr/bin/rm" in command for command in flattened))
            self.assertFalse(any("worktree remove" in command for command in flattened))
            receipt = json.loads(fixture.receipt.read_text())
            self.assertFalse(receipt["globalInventory"])
        finally:
            fixture.close()

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

        fixture = Fixture(rollback=True, deployed=False)
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
            # The sealed conditional scope already contains post-DEPLOYED
            # outputs, but their preparation-time eligibility remains pending.
            api_command = next(item for item in intent["commands"] if item["path"] == str(fixture.api))
            self.assertEqual(api_command["eligibilityAtPrepare"], "CANDIDATE_PENDING_ACTIVATION")
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
            command = next(item for item in intent["commands"] if item["path"] == str(fixture.api))
            self.assertEqual(command["eligibilityAtPrepare"], "ACTIVE_DEPENDENCY")
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
            receipt = fixture.evidence_root / "receipt"
            result = invoke("execute", "--intent", str(fixture.intent), "--intent-sha256", sha(fixture.intent),
                            "--authorization", str(authorization), "--authorization-sha256", sha(authorization),
                            "--operational-state", str(fixture.operational), "--operational-state-sha256", sha(fixture.operational),
                            "--root-policy", str(fixture.policy), "--root-policy-sha256", sha(fixture.policy),
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

    def test_worktree_only_removal_is_not_sanitized(self):
        fixture = Fixture(candidate=True, installed=False, deployed=False)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            result, receipt = fixture.execute(fixture.authorize(), "worktree-only")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["result"], "RETENTION_INCOMPLETE")
            saved = json.loads((receipt / "execution-receipt.private.json").read_text())
            self.assertGreaterEqual(len(saved["remainingDerivedPaths"]), 2)
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "QUARANTINED")
        finally:
            fixture.close()

    def test_same_predeploy_intent_covers_outputs_after_deployed(self):
        fixture = Fixture(candidate=True, installed=False, deployed=False)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            authorization = fixture.authorize()
            fixture.mark_deployed()
            result, _ = fixture.execute(authorization, "post-deployed")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["result"], "DEPLOYED_SANITIZED")
            self.assertFalse(fixture.worktree.exists())
            self.assertFalse(fixture.api.exists())
            self.assertFalse(fixture.frontend.exists())
        finally:
            fixture.close()

    def test_current_or_pm2_change_after_prepare_denies_before_attempt(self):
        for drift in ("current", "pm2"):
            fixture = Fixture()
            try:
                self.assertEqual(fixture.prepare().returncode, 0)
                authorization = fixture.authorize(drift)
                if drift == "current":
                    fixture.current.unlink(); os.symlink(fixture.repo, fixture.current)
                else:
                    changed = [{**fixture.pm2_rows[0], "pid": 999}]
                    fixture.pm2_state.write_text(json.dumps(changed))
                result, receipt = fixture.execute(authorization, f"drift-{drift}")
                self.assertEqual(result.returncode, 2)
                self.assertFalse(receipt.exists())
                self.assertTrue(fixture.worktree.exists())
            finally:
                fixture.close()

    def test_paths_outside_canonical_roots_and_canonical_checkout_are_denied(self):
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            worktree = next(item for item in contract["artifacts"] if item["class"] == "DERIVED_WORKTREE")
            worktree["path"] = str(fixture.repo)
            worktree.update(MODULE.structural_metrics(fixture.repo))
            info = fixture.repo.lstat()
            worktree["initialIdentity"] = worktree["observedIdentity"] = {"device": info.st_dev, "inode": info.st_ino}
            private_json(fixture.contract, contract)
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertRegex(result.stderr, "artifact_outside_canonical_root|canonical_checkout_not_retirable")
        finally:
            fixture.close()

    def test_symlinked_canonical_root_is_denied(self):
        fixture = Fixture()
        try:
            alias = fixture.root / "worktrees-alias"
            os.symlink(fixture.worktrees_root, alias)
            operational = json.loads(fixture.operational.read_text())
            operational["canonicalRoots"]["worktrees"] = str(alias)
            private_json(fixture.operational, operational)
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertRegex(result.stderr, "canonical_roots_policy_mismatch|canonical_root:worktrees")
        finally:
            fixture.close()

    def test_optional_staging_root_is_authenticated_only_for_pending_artifacts(self):
        # No staging artifact participates in this operation: the fully
        # authenticated policy may name an optional root that is absent.
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            contract["artifacts"] = [item for item in contract["artifacts"]
                                     if item["class"] != "DERIVED_STAGING"]
            private_json(fixture.contract, contract)
            shutil.rmtree(fixture.staging_root)
            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertNotIn(str(fixture.staging), fixture.commands.read_text())
        finally:
            fixture.close()

        # A producer-confirmed, already removed staging artifact is terminal
        # and likewise does not make its historical root physically required.
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            staging = next(item for item in contract["artifacts"]
                           if item["class"] == "DERIVED_STAGING")
            staging["state"] = "SANITIZED"
            staging["removedAtProducerCompletion"] = True
            private_json(fixture.contract, contract)
            shutil.rmtree(fixture.staging_root)
            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertNotIn(str(fixture.staging), fixture.commands.read_text())
        finally:
            fixture.close()

        # A pending staging artifact is destructive scope. Its absent root is
        # denied before lock acquisition and before commands are published.
        fixture = Fixture()
        try:
            shutil.rmtree(fixture.staging_root)
            with patch.object(MODULE, "acquire_existing_lock",
                              side_effect=AssertionError("lock must not be acquired")) as acquire:
                args = MODULE.parser().parse_args([
                    "prepare", "--contract", str(fixture.contract),
                    "--contract-sha256", sha(fixture.contract), "--lifecycle", str(fixture.lifecycle),
                    "--lifecycle-sha256", sha(fixture.lifecycle), "--operational-state", str(fixture.operational),
                    "--operational-state-sha256", sha(fixture.operational), "--root-policy", str(fixture.policy),
                    "--root-policy-sha256", sha(fixture.policy), "--deployment-lock", str(fixture.deploy_lock),
                    "--intent-output", str(fixture.intent), "--commands-output", str(fixture.commands),
                    "--review-output", str(fixture.review), "--reviewer", "fixture-owner",
                    "--reason", "fixture close",
                ])
                with self.assertRaisesRegex(MODULE.Denied, "root_policy_directory:staging"):
                    MODULE.prepare(args)
                acquire.assert_not_called()
            self.assertFalse(fixture.commands.exists())
        finally:
            fixture.close()

        # The same pending artifact remains valid when its authenticated root
        # exists and has the declared identity.
        fixture = Fixture()
        try:
            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertIn(str(fixture.staging), fixture.commands.read_text())
        finally:
            fixture.close()

    def test_pending_staging_denies_symlink_or_root_identity_drift(self):
        fixture = Fixture()
        try:
            actual = fixture.root / "staging-actual"
            fixture.staging_root.rename(actual)
            os.symlink(actual, fixture.staging_root)
            denied = fixture.prepare()
            self.assertEqual(denied.returncode, 2)
            self.assertIn("root_policy_directory:staging", denied.stderr)
        finally:
            fixture.close()

        fixture = Fixture()
        try:
            fixture.staging_root.chmod(0o700)
            denied = fixture.prepare()
            self.assertEqual(denied.returncode, 2)
            self.assertIn("root_policy_identity:staging", denied.stderr)
        finally:
            fixture.close()

    def test_evidence_root_accepts_0750_but_denies_group_writable_mode(self):
        fixture = Fixture()
        try:
            self.assertEqual(stat.S_IMODE(fixture.evidence_root.stat().st_mode), 0o750)
            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
        finally:
            fixture.close()

        fixture = Fixture()
        try:
            fixture.evidence_root.chmod(0o770)
            policy = json.loads(fixture.policy.read_text())
            policy["canonicalRoots"]["evidence"][0]["allowedModes"] = ["0700", "0750", "0770"]
            private_json(fixture.policy, policy)
            denied = fixture.prepare()
            self.assertEqual(denied.returncode, 2)
            self.assertIn("root_policy_identity:evidence", denied.stderr)
        finally:
            fixture.close()

    def test_known_v1_preserve_migrates_deterministically_without_global_scan(self):
        fixture = Fixture(release_id="immutable-123ba7bd-vps-20261026T200100Z")
        try:
            legacy = {"schemaVersion": 1, "generationId": fixture.release_id,
                      "lifecycleSha256": sha(fixture.lifecycle), "reviewer": "historical-owner",
                      "reason": "legacy candidate", "evidenceSha256": "f" * 64,
                      "decision": "PRESERVE"}
            private_json(fixture.review, legacy)
            decoy = fixture.root / "not-in-contract"; decoy.mkdir(); (decoy / "unique").write_text("untouched")
            legacy_sha = sha(fixture.review)
            denied = fixture.prepare()
            self.assertEqual(denied.returncode, 2)
            self.assertIn("legacy_migration_binding_required", denied.stderr)
            passed = fixture.prepare("--legacy-review-sha256", legacy_sha)
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertEqual(json.loads(fixture.intent.read_text())["legacyMigration"]["reviewSha256"], legacy_sha)
            self.assertEqual((decoy / "unique").read_text(), "untouched")
            self.assertTrue(any(fixture.evidence_root.glob(f"generation-review.private.json.previous.{legacy_sha}")))
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
            receipt = fixture.evidence_root / "partial-receipt"
            args = SimpleNamespace(intent=fixture.intent, intent_sha256=sha(fixture.intent),
                                   authorization=authorization, authorization_sha256=sha(authorization),
                                   operational_state=fixture.operational,
                                   operational_state_sha256=sha(fixture.operational),
                                   root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                                   deployment_lock=fixture.deploy_lock, receipt_root=receipt,
                                   review_output=fixture.review)
            real_run = subprocess.run
            calls = 0
            def fail_second(command, **kwargs):
                nonlocal calls
                if command[0] in {"/usr/bin/git", "/usr/bin/rm"}:
                    calls += 1
                if calls == 2:
                    return subprocess.CompletedProcess(command, 7, b"", b"synthetic failure")
                return real_run(command, **kwargs)
            with patch.object(MODULE.subprocess, "run", side_effect=fail_second):
                with self.assertRaisesRegex(MODULE.Denied, "retirement_command:.*:exit_7"):
                    MODULE.execute(args)
            saved = json.loads((receipt / "execution-receipt.private.json").read_text())
            self.assertEqual(saved["state"], "DEPLOYED_RETENTION_INCOMPLETE")
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "QUARANTINED")
        finally:
            fixture.close()

    def test_two_partial_failures_reconcile_transitively_without_repeating_commands(self):
        fixture = Fixture()
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            first_intent = fixture.intent
            authorization = fixture.authorize("partial-first")
            receipt = fixture.evidence_root / "partial-first-receipt"
            args = SimpleNamespace(intent=first_intent, intent_sha256=sha(first_intent),
                                   authorization=authorization, authorization_sha256=sha(authorization),
                                   operational_state=fixture.operational,
                                   operational_state_sha256=sha(fixture.operational),
                                   root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                                   deployment_lock=fixture.deploy_lock, receipt_root=receipt,
                                   review_output=fixture.review)
            real_run = subprocess.run
            calls = 0
            def fail_second(command, **kwargs):
                nonlocal calls
                if command[0] in {"/usr/bin/git", "/usr/bin/rm"}:
                    calls += 1
                    if calls == 2:
                        return subprocess.CompletedProcess(command, 9, b"", b"stop")
                return real_run(command, **kwargs)
            with patch.object(MODULE.subprocess, "run", side_effect=fail_second):
                with self.assertRaisesRegex(MODULE.Denied, "retirement_command"):
                    MODULE.execute(args)
            prior_receipt = receipt / "execution-receipt.private.json"
            prior_journal = receipt / "command-results.private.jsonl"
            original = json.loads(first_intent.read_text())
            first_path = original["commands"][0]["path"]
            self.assertFalse(Path(first_path).exists())

            fixture.intent = fixture.evidence_root / "intent-reconciled.private.json"
            fixture.commands = fixture.evidence_root / "commands-reconciled.private.txt"
            prepared = fixture.prepare(
                "--prior-intent", str(first_intent), "--prior-intent-sha256", sha(first_intent),
                "--prior-receipt", str(prior_receipt), "--prior-receipt-sha256", sha(prior_receipt),
                "--prior-journal", str(prior_journal), "--prior-journal-sha256", sha(prior_journal),
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            reconciled = json.loads(fixture.intent.read_text())
            self.assertEqual([item["path"] for item in reconciled["reconciliation"]["completed"]], [first_path])
            self.assertNotIn(first_path, [item["path"] for item in reconciled["commands"]])
            second_intent = fixture.intent
            second_authorization = fixture.authorize("partial-second")
            second_receipt = fixture.evidence_root / "partial-second-receipt"
            second_args = SimpleNamespace(
                intent=second_intent, intent_sha256=sha(second_intent),
                authorization=second_authorization, authorization_sha256=sha(second_authorization),
                operational_state=fixture.operational, operational_state_sha256=sha(fixture.operational),
                root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                deployment_lock=fixture.deploy_lock, receipt_root=second_receipt,
                review_output=fixture.review,
            )
            calls = 0
            with patch.object(MODULE.subprocess, "run", side_effect=fail_second):
                with self.assertRaisesRegex(MODULE.Denied, "retirement_command"):
                    MODULE.execute(second_args)
            second_path = reconciled["commands"][0]["path"]
            self.assertFalse(Path(second_path).exists())

            fixture.intent = fixture.evidence_root / "intent-reconciled-twice.private.json"
            fixture.commands = fixture.evidence_root / "commands-reconciled-twice.private.txt"
            prepared = fixture.prepare(
                "--prior-intent", str(second_intent), "--prior-intent-sha256", sha(second_intent),
                "--prior-receipt", str(second_receipt / "execution-receipt.private.json"),
                "--prior-receipt-sha256", sha(second_receipt / "execution-receipt.private.json"),
                "--prior-journal", str(second_receipt / "command-results.private.jsonl"),
                "--prior-journal-sha256", sha(second_receipt / "command-results.private.jsonl"),
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            reconciled_twice = json.loads(fixture.intent.read_text())
            self.assertEqual([item["path"] for item in reconciled_twice["reconciliation"]["completed"]],
                             [first_path, second_path])
            self.assertEqual(len(reconciled_twice["reconciliation"]["chain"]), 2)
            self.assertTrue({first_path, second_path}.isdisjoint(
                item["path"] for item in reconciled_twice["commands"]))
            result, final_receipt = fixture.execute(fixture.authorize("partial-final"), "partial-final")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["result"], "DEPLOYED_SANITIZED")
            receipt_value = json.loads((final_receipt / "execution-receipt.private.json").read_text())
            self.assertEqual(receipt_value["state"], "DEPLOYED_SANITIZED")
            self.assertEqual(receipt_value["removedPaths"][:2], [first_path, second_path])
        finally:
            fixture.close()

    def test_operational_roots_must_match_authenticated_policy(self):
        fixture = Fixture()
        try:
            alternative = fixture.root / "alternative-worktrees"; alternative.mkdir()
            operational = json.loads(fixture.operational.read_text())
            operational["canonicalRoots"]["worktrees"] = str(alternative)
            private_json(fixture.operational, operational)
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertIn("canonical_roots_policy_mismatch", result.stderr)
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
