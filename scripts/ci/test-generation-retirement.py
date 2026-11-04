#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts/generation-retirement.py"
SPEC = importlib.util.spec_from_file_location("generation_retirement", TOOL)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)
RELEASE_TOOL = ROOT / "scripts/converta-release.py"
RELEASE_SPEC = importlib.util.spec_from_file_location("converta_release", RELEASE_TOOL)
assert RELEASE_SPEC and RELEASE_SPEC.loader
RELEASE_MODULE = importlib.util.module_from_spec(RELEASE_SPEC); RELEASE_SPEC.loader.exec_module(RELEASE_MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


def invoke(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(TOOL), *args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def invoke_tool(tool: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, "-B", str(tool), *args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


class Fixture:
    def __init__(self, *, active=False, rollback=False, candidate=False, installed=True, deployed=True,
                 release_id="immutable-fixture"):
        self.temp = tempfile.TemporaryDirectory(prefix="generation-retirement-")
        self.root = Path(self.temp.name)
        self.output_root = self.root / "build-output"; self.output_root.mkdir(mode=0o755)
        self.output = self.output_root / "generation"; self.output.mkdir(mode=0o755)
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
                     "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE",
                     "privateDataOverlay": {
                         "path": "api-runtime/.data",
                         "classification": "PRIVATE_DATA_NEVER_RETIRE",
                         "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
                     }})
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
        self.review = self.output / "generation-review.private.json"

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
        subprocess.run(["git", "init", "-q"], cwd=self.repository, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.repository, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.repository, check=True)
        (self.repository / "tracked").write_text("legacy\n")
        subprocess.run(["git", "add", "."], cwd=self.repository, check=True)
        subprocess.run(["git", "commit", "-qm", "legacy fixture"], cwd=self.repository, check=True)
        self.worktrees = self.root / "build-worktrees"; self.worktrees.mkdir(mode=0o755)
        self.outputs = self.root / "build-output"; self.outputs.mkdir(mode=0o755)
        self.releases = self.root / "releases"; self.releases.mkdir(mode=0o755)
        self.staging = self.root / "optional-staging"
        self.evidence = self.root / "evidence"; self.evidence.mkdir(mode=0o750)
        self.release_id = "immutable-legacy-fixture"
        self.output = self.outputs / "legacy-producer"; self.output.mkdir(mode=0o700)
        self.worktree = self.worktrees / "legacy-source"
        subprocess.run(["git", "-C", str(self.repository), "worktree", "add", "--detach", str(self.worktree)],
                       check=True, stdout=subprocess.DEVNULL)
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
        self.deploy_lock = self.root / ".deployment-window.lock"
        self.deploy_lock.write_text(""); self.deploy_lock.chmod(0o600)
        self.installed = self.releases / self.release_id
        self.contract = self.output / "generation-artifacts.private.json"
        self.bootstrap_review = self.output / "generation-review.private.json"
        self.receipt = self.evidence / "legacy-bootstrap" / "bootstrap-receipt.private.json"
        self.receipt.parent.mkdir(mode=0o700)

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


class LegacyA959V1PreserveFixture(LegacyBootstrapFixture):
    def __init__(self):
        super().__init__()
        self.installed.mkdir(mode=0o700)
        installed_api = self.installed / "api-runtime"; installed_api.mkdir()
        installed_frontend = self.installed / "frontend-runtime"; installed_frontend.mkdir()
        (installed_api / "index.js").write_text("api\n")
        (installed_frontend / "server.js").write_text("frontend\n")
        self.private_data = installed_api / ".data"; self.private_data.mkdir(mode=0o755)
        self.private_data.chmod(0o755)
        private_json(self.private_data / "state.json", {"fixture": "private-state"})
        self.marker = self.installed / "DEPLOYED"; self.marker.write_text("deployed\n"); self.marker.chmod(0o600)
        private_info = self.private_data.lstat()
        verification = {"result": "RELEASE VERIFIED", "releaseId": self.release_id,
                        "targetCommit": self.target, "manifestSha256": sha(self.manifest),
                        "indexSha256": sha(self.index), "apiEntrySha256": "a" * 64,
                        "buildId": "fixture-build", "indexEntries": 4}
        overlay = {"path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
                   "state": "ACTIVE_DEPENDENCY",
                   "rootIdentity": {"device": private_info.st_dev, "inode": private_info.st_ino},
                   "ownerUid": private_info.st_uid, "groupGid": private_info.st_gid,
                   "mode": stat.S_IMODE(private_info.st_mode), "observedEntries": 2}
        self.verifier.write_text(
            "#!/usr/bin/env python3\nimport json,sys\nvalue=" + repr(verification) +
            "\nif '--legacy-a959-private-data-overlay' in sys.argv: value['privateDataOverlay']=" +
            repr(overlay) + "\nprint(json.dumps(value))\n"
        )
        self.verifier.chmod(0o600)
        self.v1_review = self.output / "generation-review.private.json"
        private_json(self.v1_review, {"schemaVersion": 1, "generationId": self.release_id,
                     "lifecycleSha256": sha(self.lifecycle), "reviewer": "legacy-owner",
                     "reason": "preserved before generation contracts", "evidenceSha256": "e" * 64,
                     "decision": "PRESERVE"})
        self.bootstrap_review = self.v1_review
        self.receipt = self.evidence / "legacy-a959-bootstrap" / "bootstrap-receipt.private.json"
        self.receipt.parent.mkdir(mode=0o700)
        self.prior_journal = self.evidence / "prior-command-results.private.jsonl"
        self.prior_receipt = self.evidence / "prior-execution-receipt.private.json"

        self.current.unlink(); os.symlink(self.installed, self.current)
        self.pm2_rows = [{"name": "api", "pid": 101, "pm2_env": {
            "pm_cwd": str(self.installed / "api-runtime"),
            "pm_exec_path": str(self.installed / "api-runtime" / "index.js"),
            "exec_mode": "fork_mode", "instances": 1, "args": [], "namespace": "default"}}]
        self.pm2_state.write_text(json.dumps(self.pm2_rows))
        graph = {"activeReleases": [self.release_id], "rollbackReleases": [],
                 "transitiveReturnReleases": [], "candidateReleases": [],
                 "installedVerifiedReleases": [self.release_id], "supersededCandidates": []}
        private_json(self.graph, graph)
        operational = json.loads(self.operational.read_text())
        operational.update({**graph, "currentPaths": [str(self.installed)],
                            "pm2LivePaths": [str(self.installed)],
                            "pm2DumpPaths": [str(self.installed)], "deploymentState": {"state": "DEPLOYED"}})
        operational["observations"]["currentLinks"] = [{"path": str(self.current),
                                                          "target": str(self.installed)}]
        operational["observations"]["pm2"]["fingerprintSha256"] = MODULE._pm2_fingerprint(self.pm2_rows)
        operational["observations"]["releaseGraph"]["sha256"] = sha(self.graph)
        private_json(self.operational, operational)
        removed_paths = [
            str(self.worktree), str(self.root / "other-worktree-a"), str(self.root / "other-worktree-b"),
            str(self.api), str(self.frontend), str(self.root / "other-output-a"),
            str(self.root / "other-output-b"), str(self.root / "other-output-c"),
            str(self.root / "other-output-d"), str(self.root / "other-staging"),
        ]
        events = []
        for ordinal, path in enumerate(removed_paths, 1):
            kind = "git_worktree_remove" if ordinal <= 3 else "rm"
            inspection = self.evidence / f"command-{ordinal}-inspection.private.json"
            events.extend((
                {"event": "ATTEMPT", "kind": kind, "ordinal": ordinal, "path": path,
                 "result": "PENDING"},
                {"event": "RESULT", "exitCode": 0, "inspectionPath": str(inspection),
                 "inspectionSha256": f"{ordinal:064x}", "kind": kind, "ordinal": ordinal,
                 "path": path, "result": "COMMAND_EXITED_ZERO",
                 "worktreeRegistration": "ABSENT" if ordinal <= 3 else "NOT_APPLICABLE"},
                {"event": "VERIFIED", "kind": kind, "ordinal": ordinal, "path": path,
                 "result": "PASS"},
            ))
        self.prior_journal.write_bytes(b"".join(MODULE.canonical(event) for event in events))
        self.prior_journal.chmod(0o600)
        prior = {"state": "COMPLETED", "failurePredicate": None, "attemptedCommands": 10,
                 "completedCommands": 10, "removedPaths": 10, "automaticRetry": False,
                 "pathExpansion": False, "forceUsed": False, "pruneUsed": False,
                 "commandLogSha256": sha(self.prior_journal),
                 "freshSamples": {"aSha256": "a" * 64, "bSha256": "b" * 64},
                 "lock": {"acquired": True, "heldThroughFinalInspection": True,
                          "heldThroughReceiptFsync": True, "unlink": False,
                          "foreignLockReleased": False}}
        private_json(self.prior_receipt, prior)
        prior_retention = {
            "batchId": "fixture-retention-10-of-10", "receiptSha256": sha(self.prior_receipt),
            "journalSha256": sha(self.prior_journal), "sampleASha256": "a" * 64,
            "sampleBSha256": "b" * 64, "removedPaths": removed_paths,
            "a959Ordinals": {"1": str(self.worktree), "4": str(self.api), "5": str(self.frontend)},
        }
        self.descriptor_value = {
            "schemaVersion": 1, "sourceState": "LEGACY_V1_PRESERVE_NO_CONTRACT",
            "releaseId": self.release_id, "targetCommit": self.target,
            "outputPath": str(self.output), "worktreePath": str(self.worktree),
            "installedReleasePath": str(self.installed),
            "privateDataOverlay": {"path": str(self.private_data),
                                   "classification": "PRIVATE_DATA_NEVER_RETIRE",
                                   "state": "ACTIVE_DEPENDENCY"},
            "lifecycle": {"path": str(self.lifecycle), "sha256": sha(self.lifecycle)},
            "review": {"path": str(self.v1_review), "sha256": sha(self.v1_review)},
            "package": {"path": str(self.package), "sha256": sha(self.package)},
            "manifest": {"path": str(self.manifest), "sha256": sha(self.manifest)},
            "index": {"path": str(self.index), "sha256": sha(self.index)},
            "deployedMarker": {"path": str(self.marker), "sha256": sha(self.marker)},
            "priorRetention": prior_retention,
            "canonicalVerifierSha256": sha(self.verifier), "contractOutput": str(self.contract),
            "receiptOutput": str(self.receipt),
        }
        private_json(self.descriptor, self.descriptor_value)
        subprocess.run(["git", "-C", str(self.repository), "worktree", "remove", str(self.worktree)],
                       check=True, stdout=subprocess.DEVNULL)
        shutil.rmtree(self.api); shutil.rmtree(self.frontend)

    def arguments(self):
        value = super().arguments()
        value.retention_receipt = self.prior_receipt
        value.retention_receipt_sha256 = sha(self.prior_receipt)
        value.retention_journal = self.prior_journal
        value.retention_journal_sha256 = sha(self.prior_journal)
        return value

    def bootstrap_a959(self):
        before = (self.v1_review.stat().st_ino, sha(self.v1_review))
        with patch.object(MODULE, "LEGACY_A959_V1_PRESERVE_BINDING", self.descriptor_value), \
                patch.object(MODULE, "canonical_release_verifier", return_value=self.verifier):
            MODULE.bootstrap_legacy_a959_v1_preserve(self.arguments())
        self.assert_review_preserved(before)

    def rebind_prior_retention(self) -> None:
        prior = json.loads(self.prior_receipt.read_text())
        prior["commandLogSha256"] = sha(self.prior_journal)
        private_json(self.prior_receipt, prior)
        self.descriptor_value["priorRetention"]["journalSha256"] = sha(self.prior_journal)
        self.descriptor_value["priorRetention"]["receiptSha256"] = sha(self.prior_receipt)
        private_json(self.descriptor, self.descriptor_value)

    def mutate_prior_event(self, event_name: str, ordinal: int, mutate) -> None:
        events = MODULE._read_journal(self.prior_journal.read_bytes())
        event = next(item for item in events
                     if item.get("event") == event_name and item.get("ordinal") == ordinal)
        mutate(event)
        self.prior_journal.write_bytes(b"".join(MODULE.canonical(item) for item in events))
        self.rebind_prior_retention()

    def prepare_a959(self, intent: Path, commands: Path, review_sha256: str) -> str:
        args = SimpleNamespace(
            contract=self.contract, contract_sha256=sha(self.contract),
            lifecycle=self.lifecycle, lifecycle_sha256=sha(self.lifecycle),
            operational_state=self.operational, operational_state_sha256=sha(self.operational),
            root_policy=self.policy, root_policy_sha256=sha(self.policy),
            deployment_lock=self.deploy_lock, intent_output=intent, commands_output=commands,
            review_output=self.v1_review, legacy_review_sha256=review_sha256,
            prior_intent=None, prior_intent_sha256=None, prior_receipt=None,
            prior_receipt_sha256=None, prior_journal=None, prior_journal_sha256=None,
            reviewer="fixture-owner", reason="retire only derived a959 build artifacts")
        output = io.StringIO()
        with patch.object(MODULE, "LEGACY_A959_V1_PRESERVE_BINDING", self.descriptor_value), \
                redirect_stdout(output):
            MODULE.prepare(args)
        return output.getvalue()

    def assert_review_preserved(self, before):
        if (self.v1_review.stat().st_ino, sha(self.v1_review)) != before:
            raise AssertionError("bootstrap changed the legacy v1 review")


class LegacyBatchV1PreserveFixture(LegacyA959V1PreserveFixture):
    def __init__(self, role: str):
        super().__init__()
        old_release_id = self.release_id
        self.role = role
        self.release_id = ("immutable-f1602787-vps-20261026T174702Z"
                           if role == "ACTIVE_DEPENDENCY" else
                           "immutable-d436239e-vps-20261026T131821Z")
        self.target = (MODULE.LEGACY_D436_F160_BINDINGS[
            "immutable-f1602787-vps-20261026T174702Z"]["targetCommit"]
            if role == "ACTIVE_DEPENDENCY" else
            MODULE.LEGACY_D436_F160_BINDINGS[
                "immutable-d436239e-vps-20261026T131821Z"]["targetCommit"])
        old_installed = self.installed
        self.installed = self.releases / self.release_id
        old_installed.rename(self.installed)
        old_release_root = self.output / old_release_id
        self.release_root = self.output / self.release_id
        old_release_root.rename(self.release_root)
        old_package = self.package
        self.package = self.output / f"{self.release_id}.tar.xz"
        old_package.rename(self.package)
        self.manifest = self.release_root / "manifest.json"
        self.index = self.release_root / "index.sha256"
        self.api = self.release_root / "api-runtime"
        self.frontend = self.release_root / "frontend-runtime"
        self.private_data = self.installed / "api-runtime/.data"
        shutil.rmtree(self.private_data)
        self.cache = self.installed / "frontend-runtime/.next/cache"
        if role == "ACTIVE_DEPENDENCY":
            self.cache.mkdir(parents=True, mode=0o755)
            private_json(self.cache / "state.json", {"fixture": "runtime-cache"})
        self.marker = self.installed / "DEPLOYED"
        private_json(self.lifecycle, {"schemaVersion": 1, "generationId": self.release_id,
                                     "targetCommit": self.target, "state": "COMPLETE"})
        private_json(self.v1_review, {"schemaVersion": 1, "generationId": self.release_id,
                     "lifecycleSha256": sha(self.lifecycle), "reviewer": "legacy-owner",
                     "reason": "preserved before generation contracts", "evidenceSha256": "e" * 64,
                     "decision": "PRESERVE"})
        self.current.unlink(); os.symlink(self.installed, self.current)
        self.pm2_rows = [{"name": "frontend" if role == "ACTIVE_DEPENDENCY" else "api",
                          "pid": 101, "pm2_env": {
            "pm_cwd": str(self.installed / "frontend-runtime"),
            "pm_exec_path": str(self.installed / "frontend-runtime/server.js"),
            "exec_mode": "fork_mode", "instances": 1, "args": [], "namespace": "default"}}]
        self.pm2_state.write_text(json.dumps(self.pm2_rows))
        graph = {"activeReleases": [self.release_id] if role == "ACTIVE_DEPENDENCY" else [],
                 "rollbackReleases": [self.release_id] if role == "ROLLBACK_DEPENDENCY" else [],
                 "transitiveReturnReleases": [], "candidateReleases": [],
                 "installedVerifiedReleases": [self.release_id], "supersededCandidates": []}
        private_json(self.graph, graph)
        operational = json.loads(self.operational.read_text())
        operational.update({"generationId": self.release_id, "releaseId": self.release_id,
                            "targetCommit": self.target, **graph,
                            "currentPaths": [str(self.installed)] if role == "ACTIVE_DEPENDENCY" else [],
                            "pm2LivePaths": [str(self.installed)] if role == "ACTIVE_DEPENDENCY" else [],
                            "pm2DumpPaths": [str(self.installed)] if role == "ACTIVE_DEPENDENCY" else [],
                            "deploymentState": {"state": "DEPLOYED"}})
        operational["observations"]["currentLinks"] = ([{"path": str(self.current),
                                                            "target": str(self.installed)}]
                                                          if role == "ACTIVE_DEPENDENCY" else [])
        operational["observations"]["pm2"]["fingerprintSha256"] = MODULE._pm2_fingerprint(self.pm2_rows)
        operational["observations"]["releaseGraph"]["sha256"] = sha(self.graph)
        private_json(self.operational, operational)

        ordinals = (3, 8, 9) if role == "ACTIVE_DEPENDENCY" else (2, 6, 7)
        removed_paths = [str(self.root / f"other-{ordinal}") for ordinal in range(1, 11)]
        removed_paths[ordinals[0] - 1] = str(self.worktree)
        removed_paths[ordinals[1] - 1] = str(self.api)
        removed_paths[ordinals[2] - 1] = str(self.frontend)
        events = []
        for ordinal, path in enumerate(removed_paths, 1):
            kind = "git_worktree_remove" if ordinal <= 3 else "rm"
            events.extend((
                {"event": "ATTEMPT", "kind": kind, "ordinal": ordinal, "path": path,
                 "result": "PENDING"},
                {"event": "RESULT", "exitCode": 0,
                 "inspectionPath": str(self.evidence / f"inspection-{ordinal}.json"),
                 "inspectionSha256": f"{ordinal:064x}", "kind": kind, "ordinal": ordinal,
                 "path": path, "result": "COMMAND_EXITED_ZERO",
                 "worktreeRegistration": "ABSENT" if ordinal <= 3 else "NOT_APPLICABLE"},
                {"event": "VERIFIED", "kind": kind, "ordinal": ordinal, "path": path,
                 "result": "PASS"},
            ))
        self.prior_journal.write_bytes(b"".join(MODULE.canonical(event) for event in events))
        prior = json.loads(self.prior_receipt.read_text())
        prior["commandLogSha256"] = sha(self.prior_journal)
        private_json(self.prior_receipt, prior)
        prior_retention = {"batchId": "fixture-retention-10-of-10",
                           "receiptSha256": sha(self.prior_receipt),
                           "journalSha256": sha(self.prior_journal),
                           "sampleASha256": "a" * 64, "sampleBSha256": "b" * 64,
                           "removedPaths": removed_paths,
                           "generationOrdinals": {str(ordinal): removed_paths[ordinal - 1]
                                                  for ordinal in ordinals}}
        cache_binding = ({"runtimeCacheOverlay": {"path": str(self.cache),
                          "classification": "EPHEMERAL_RUNTIME_CACHE",
                          "state": "ACTIVE_DEPENDENCY", "retirableOn": "WITH_PARENT_RELEASE_ONLY"}}
                         if role == "ACTIVE_DEPENDENCY" else {})
        self.receipt = self.evidence / f"legacy-{self.release_id}-bootstrap" / "bootstrap-receipt.private.json"
        self.receipt.parent.mkdir(mode=0o700)
        self.descriptor_value = {
            "schemaVersion": 1, "sourceState": "LEGACY_V1_PRESERVE_BATCH_MEMBER_NO_CONTRACT",
            "releaseId": self.release_id, "targetCommit": self.target, "operationalRole": role,
            "outputPath": str(self.output), "worktreePath": str(self.worktree),
            "installedReleasePath": str(self.installed), **cache_binding,
            "lifecycle": {"path": str(self.lifecycle), "sha256": sha(self.lifecycle)},
            "review": {"path": str(self.v1_review), "sha256": sha(self.v1_review)},
            "package": {"path": str(self.package), "sha256": sha(self.package)},
            "manifest": {"path": str(self.manifest), "sha256": sha(self.manifest)},
            "index": {"path": str(self.index), "sha256": sha(self.index)},
            "deployedMarker": {"path": str(self.marker), "sha256": sha(self.marker)},
            "priorRetention": prior_retention, "canonicalVerifierSha256": sha(self.verifier),
            "contractOutput": str(self.contract), "receiptOutput": str(self.receipt),
        }
        private_json(self.descriptor, self.descriptor_value)
        verification = {"result": "RELEASE VERIFIED", "releaseId": self.release_id,
                        "targetCommit": self.target, "manifestSha256": sha(self.manifest),
                        "indexSha256": sha(self.index), "apiEntrySha256": "a" * 64,
                        "buildId": "fixture-build", "indexEntries": 4}
        overlay = None
        if role == "ACTIVE_DEPENDENCY":
            info = self.cache.lstat()
            overlay = {"path": "frontend-runtime/.next/cache",
                       "classification": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
                       "rootIdentity": {"device": info.st_dev, "inode": info.st_ino},
                       "ownerUid": info.st_uid, "groupGid": info.st_gid,
                       "mode": stat.S_IMODE(info.st_mode), "observedEntries": 2}
        self.verifier.write_text(
            "#!/usr/bin/env python3\nimport json,sys\nvalue=" + repr(verification) +
            "\nif '--legacy-f160-runtime-cache-overlay' in sys.argv: value['runtimeCacheOverlay']=" +
            repr(overlay) + "\nprint(json.dumps(value))\n")
        self.verifier.chmod(0o600)
        self.descriptor_value["canonicalVerifierSha256"] = sha(self.verifier)
        private_json(self.descriptor, self.descriptor_value)
        self.binding = {"descriptorSha256": sha(self.descriptor), "role": role,
                        "targetCommit": self.target, "ordinals": ordinals,
                        "outputPath": str(self.output), "worktreePath": str(self.worktree),
                        "installedReleasePath": str(self.installed)}
        if role == "ACTIVE_DEPENDENCY":
            self.binding["overlayPath"] = str(self.cache)
        self.batch = {key: prior_retention[key] for key in
                      ("batchId", "receiptSha256", "journalSha256", "sampleASha256",
                       "sampleBSha256", "removedPaths")}

    def bootstrap_batch(self):
        bindings = {**MODULE.LEGACY_D436_F160_BINDINGS, self.release_id: self.binding}
        with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                patch.object(MODULE, "LEGACY_RETENTION_BATCH", self.batch), \
                patch.object(MODULE, "canonical_release_verifier", return_value=self.verifier):
            MODULE.bootstrap_legacy_batch_v1_preserve(self.arguments())

    def prepare_batch(self, intent: Path, commands: Path, review_sha256: str) -> str:
        bindings = {**MODULE.LEGACY_D436_F160_BINDINGS, self.release_id: self.binding}
        args = SimpleNamespace(
            contract=self.contract, contract_sha256=sha(self.contract), lifecycle=self.lifecycle,
            lifecycle_sha256=sha(self.lifecycle), operational_state=self.operational,
            operational_state_sha256=sha(self.operational), root_policy=self.policy,
            root_policy_sha256=sha(self.policy), deployment_lock=self.deploy_lock,
            intent_output=intent, commands_output=commands, review_output=self.v1_review,
            legacy_review_sha256=review_sha256, prior_intent=None, prior_intent_sha256=None,
            prior_receipt=None, prior_receipt_sha256=None, prior_journal=None,
            prior_journal_sha256=None, reviewer="fixture-owner", reason="batch member reconciled")
        output = io.StringIO()
        with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                patch.object(MODULE, "LEGACY_RETENTION_BATCH", self.batch), redirect_stdout(output):
            MODULE.prepare(args)
        return output.getvalue()


class GenerationRetirementTest(unittest.TestCase):
    def test_rich_graph_preserves_component_rollbacks_and_denies_omission(self):
        graph = {
            "activeReleases": ["active"],
            "rollbackReleases": ["api-return", "frontend-return", "historical"],
            "transitiveReturnReleases": [], "candidateReleases": [],
            "installedVerifiedReleases": ["active", "api-return", "frontend-return", "historical"],
            "supersededCandidates": [],
            "immediateRollbackReleases": {
                "api": "api-return", "frontend": "frontend-return"},
        }
        self.assertEqual(MODULE._rich_graph(graph, "fixture")["immediateRollbackReleases"],
                         {"api": "api-return", "frontend": "frontend-return"})
        graph["immediateRollbackReleases"].pop("frontend")
        with self.assertRaisesRegex(MODULE.Denied, "release_reconciliation_graph"):
            MODULE._rich_graph(graph, "fixture")

    def test_versioned_d436_f160_descriptors_are_closed_and_use_exact_batch_ordinals(self):
        expected = {
            "immutable-d436239e-vps-20261026T131821Z": ("2", "6", "7"),
            "immutable-f1602787-vps-20261026T174702Z": ("3", "8", "9"),
        }
        for release_id, ordinals in expected.items():
            short = "d436239e" if "d436" in release_id else "f1602787"
            path = ROOT / f"config/legacy-generation-{short}-v1-preserve.json"
            value = json.loads(path.read_text())
            self.assertEqual(sha(path), MODULE.LEGACY_D436_F160_BINDINGS[release_id]["descriptorSha256"])
            self.assertEqual(tuple(value["priorRetention"]["generationOrdinals"]), ordinals)
            self.assertEqual(value["priorRetention"]["receiptSha256"],
                             MODULE.LEGACY_RETENTION_BATCH["receiptSha256"])
            self.assertEqual(value["priorRetention"]["journalSha256"],
                             MODULE.LEGACY_RETENTION_BATCH["journalSha256"])

    def test_d436_f160_bootstrap_and_prepare_zero_commands_then_single_global_gate(self):
        fixtures = [LegacyBatchV1PreserveFixture("ROLLBACK_DEPENDENCY"),
                    LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")]
        combined = Path(tempfile.mkdtemp(prefix="legacy-batch-global-gate-"))
        try:
            produced = []
            for fixture in fixtures:
                review_sha = sha(fixture.v1_review)
                fixture.bootstrap_batch()
                retirement = fixture.evidence / "retirement"; retirement.mkdir(mode=0o700)
                result = fixture.prepare_batch(retirement / "intent.json",
                                               retirement / "commands.txt", review_sha)
                self.assertIn('"commandCount":0', result)
                self.assertEqual((retirement / "commands.txt").read_bytes(), b"")
                self.assertEqual(json.loads(fixture.v1_review.read_text())["state"], "SANITIZED")
                closure = {"kind": "LEGACY_BATCH",
                    "descriptor": {"path": str(fixture.descriptor),
                                   "sha256": sha(fixture.descriptor)},
                    "bootstrapReceipt": {"path": str(fixture.receipt),
                                         "sha256": sha(fixture.receipt)},
                    "priorRetentionReceipt": {"path": str(fixture.prior_receipt),
                                              "sha256": sha(fixture.prior_receipt)},
                    "priorRetentionJournal": {"path": str(fixture.prior_journal),
                                              "sha256": sha(fixture.prior_journal)},
                    "intent": {"path": str(retirement / "intent.json"),
                               "sha256": sha(retirement / "intent.json")}}
                bindings = {**MODULE.LEGACY_D436_F160_BINDINGS,
                            fixture.release_id: fixture.binding}
                with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                        patch.object(MODULE, "LEGACY_RETENTION_BATCH", fixture.batch):
                    normalized = MODULE._legacy_batch_closure(
                        closure, fixture.release_id, fixture.target, fixture.contract,
                        sha(fixture.contract), sha(fixture.lifecycle),
                        json.loads(fixture.v1_review.read_text()),
                        json.loads(fixture.operational.read_text()))
                self.assertEqual(normalized["intent"]["sha256"],
                                 sha(retirement / "intent.json"))
                produced.append((fixture, closure))
                contract = json.loads(fixture.contract.read_text())
                runtime = next(item for item in contract["artifacts"]
                               if item["class"] == "RELEASE_RUNTIME")
                self.assertEqual(runtime["state"], fixture.role)
                destination = combined / fixture.release_id
                shutil.copytree(fixture.output, destination)
            accepted = RELEASE_MODULE.require_generation_reviews(combined)
            self.assertEqual(len(accepted), 2)
            self.assertTrue(all(item["state"] == "SANITIZED" for item in accepted))
            first, first_closure = produced[0]
            second, second_closure = produced[1]
            crossed = dict(second_closure)
            crossed["intent"] = first_closure["intent"]
            bindings = {**MODULE.LEGACY_D436_F160_BINDINGS,
                        second.release_id: second.binding}
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                    patch.object(MODULE, "LEGACY_RETENTION_BATCH", second.batch), \
                    self.assertRaisesRegex(MODULE.Denied,
                                            "release_reconciliation_legacy_intent_identity"):
                MODULE._legacy_batch_closure(
                    crossed, second.release_id, second.target, second.contract,
                    sha(second.contract), sha(second.lifecycle),
                    json.loads(second.v1_review.read_text()),
                    json.loads(second.operational.read_text()))
        finally:
            for fixture in fixtures:
                fixture.close()
            shutil.rmtree(combined)

    def test_f160_prepare_denies_immutable_drift_but_allows_cache_mutation(self):
        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            review_sha = sha(fixture.v1_review)
            fixture.bootstrap_batch()
            private_json(fixture.cache / "state.json", {"fixture": "changed-cache"})
            retirement = fixture.evidence / "cache-change"; retirement.mkdir(mode=0o700)
            self.assertIn('"commandCount":0', fixture.prepare_batch(
                retirement / "intent.json", retirement / "commands.txt", review_sha))
        finally:
            fixture.close()

        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            fixture.bootstrap_batch()
            (fixture.installed / "frontend-runtime/server.js").write_text("immutable drift\n")
            retirement = fixture.evidence / "immutable-drift"; retirement.mkdir(mode=0o700)
            with self.assertRaisesRegex(MODULE.Denied, "artifact_drift:"):
                fixture.prepare_batch(retirement / "intent.json", retirement / "commands.txt",
                                      sha(fixture.v1_review))
        finally:
            fixture.close()

    def test_f160_cache_wrong_path_or_symlink_is_denied(self):
        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            fixture.descriptor_value["runtimeCacheOverlay"]["path"] = str(
                fixture.installed / "frontend-runtime/.next/not-cache")
            private_json(fixture.descriptor, fixture.descriptor_value)
            fixture.binding["descriptorSha256"] = sha(fixture.descriptor)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_batch_descriptor_binding"):
                fixture.bootstrap_batch()
        finally:
            fixture.close()

    def test_f160_parent_removal_reconciles_subordinate_cache_without_new_command(self):
        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            fixture.bootstrap_batch()
            original_review_sha = sha(fixture.v1_review)

            # The historical release becomes superseded, but its contract still
            # contains the real parent/cache layout emitted for f160.
            fixture.current.unlink()
            os.symlink(fixture.other_release, fixture.current)
            fixture.pm2_rows = [{"name": "current", "pid": 202, "pm2_env": {
                "pm_cwd": str(fixture.other_release),
                "pm_exec_path": str(fixture.other_release / "server.js"),
                "exec_mode": "fork_mode", "instances": 1, "args": [],
                "namespace": "default"}}]
            fixture.pm2_state.write_text(json.dumps(fixture.pm2_rows))
            graph = {"activeReleases": [fixture.other_release.name], "rollbackReleases": [],
                     "transitiveReturnReleases": [], "candidateReleases": [],
                     "installedVerifiedReleases": [fixture.other_release.name],
                     "supersededCandidates": [fixture.release_id]}
            private_json(fixture.graph, graph)
            operational = json.loads(fixture.operational.read_text())
            operational.update({**graph, "currentPaths": [str(fixture.other_release)],
                                "pm2LivePaths": [str(fixture.other_release)],
                                "pm2DumpPaths": [str(fixture.other_release)],
                                "deploymentState": {"state": "SUPERSEDED"}})
            operational["observations"]["currentLinks"] = [
                {"path": str(fixture.current), "target": str(fixture.other_release)}]
            operational["observations"]["pm2"]["fingerprintSha256"] = \
                MODULE._pm2_fingerprint(fixture.pm2_rows)
            operational["observations"]["releaseGraph"]["sha256"] = sha(fixture.graph)
            private_json(fixture.operational, operational)

            bindings = {**MODULE.LEGACY_D436_F160_BINDINGS,
                        fixture.release_id: fixture.binding}
            first_root = fixture.evidence / "f160-first"; first_root.mkdir(mode=0o700)
            first_intent = first_root / "intent.private.json"
            first_commands = first_root / "commands.private.txt"
            fixture.prepare_batch(first_intent, first_commands, original_review_sha)
            first_value = json.loads(first_intent.read_text())
            self.assertEqual([item["path"] for item in first_value["commands"]],
                             [str(fixture.installed)])
            first_authorization = first_root / "authorization.private.json"
            private_json(first_authorization, {
                "schemaVersion": 1, "authorizationId": "f160-first", "decision": "AUTHORIZE_ONCE",
                "intentSha256": sha(first_intent), "approvedPaths": [str(fixture.installed)],
                "owner": "fixture-owner"})
            first_receipt_root = first_root / "receipt"
            execute_args = SimpleNamespace(
                intent=first_intent, intent_sha256=sha(first_intent),
                authorization=first_authorization, authorization_sha256=sha(first_authorization),
                operational_state=fixture.operational,
                operational_state_sha256=sha(fixture.operational),
                root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                deployment_lock=fixture.deploy_lock, deployment_lock_fd=None,
                receipt_root=first_receipt_root, review_output=fixture.v1_review)
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                    patch.object(MODULE, "LEGACY_RETENTION_BATCH", fixture.batch), \
                    self.assertRaisesRegex(MODULE.Denied, "artifact_missing:.*\\.next/cache"):
                MODULE.execute(execute_args)
            first_receipt = first_receipt_root / "execution-receipt.private.json"
            first_journal = first_receipt_root / "command-results.private.jsonl"
            first_receipt_sha = sha(first_receipt)
            first_journal_sha = sha(first_journal)
            original_receipt_bytes = first_receipt.read_bytes()
            original_journal_bytes = first_journal.read_bytes()
            partial = json.loads(original_receipt_bytes)
            self.assertEqual(partial["attemptedCommands"], 1)
            self.assertEqual(partial["completedCommands"], 1)
            self.assertEqual(partial["removedPaths"], [str(fixture.installed)])
            self.assertNotIn("subordinateAbsences", partial)
            self.assertFalse(fixture.installed.exists())
            self.assertFalse(fixture.cache.exists())

            successor_root = fixture.evidence / "f160-successor"; successor_root.mkdir(mode=0o700)
            successor_intent = successor_root / "intent.private.json"
            successor_commands = successor_root / "commands.private.txt"
            prepare_args = SimpleNamespace(
                contract=fixture.contract, contract_sha256=sha(fixture.contract),
                lifecycle=fixture.lifecycle, lifecycle_sha256=sha(fixture.lifecycle),
                operational_state=fixture.operational,
                operational_state_sha256=sha(fixture.operational),
                root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                deployment_lock=fixture.deploy_lock, intent_output=successor_intent,
                commands_output=successor_commands, review_output=fixture.v1_review,
                legacy_review_sha256=None, prior_intent=first_intent,
                prior_intent_sha256=sha(first_intent), prior_receipt=first_receipt,
                prior_receipt_sha256=first_receipt_sha, prior_journal=first_journal,
                prior_journal_sha256=first_journal_sha, reviewer="fixture-owner",
                reason="reconcile f160 subordinate absence")
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                    patch.object(MODULE, "LEGACY_RETENTION_BATCH", fixture.batch):
                MODULE.prepare(prepare_args)
            successor = json.loads(successor_intent.read_text())
            self.assertEqual(successor["commands"], [])
            self.assertEqual(successor_commands.read_bytes(), b"")
            self.assertEqual([item["path"] for item in successor["reconciliation"]["completed"]],
                             [str(fixture.installed)])
            subordinate = successor["reconciliation"]["subordinateAbsences"]
            self.assertEqual(len(subordinate), 1)
            self.assertEqual(subordinate[0]["path"], str(fixture.cache))
            self.assertEqual(subordinate[0]["parentPath"], str(fixture.installed))
            self.assertEqual(subordinate[0]["retirableOn"], "WITH_PARENT_RELEASE_ONLY")

            successor_authorization = successor_root / "authorization.private.json"
            private_json(successor_authorization, {
                "schemaVersion": 1, "authorizationId": "f160-reconcile", "decision": "AUTHORIZE_ONCE",
                "intentSha256": sha(successor_intent), "approvedPaths": [], "owner": "fixture-owner"})
            successor_receipt_root = successor_root / "receipt"
            successor_execute = SimpleNamespace(
                intent=successor_intent, intent_sha256=sha(successor_intent),
                authorization=successor_authorization,
                authorization_sha256=sha(successor_authorization),
                operational_state=fixture.operational,
                operational_state_sha256=sha(fixture.operational),
                root_policy=fixture.policy, root_policy_sha256=sha(fixture.policy),
                deployment_lock=fixture.deploy_lock, deployment_lock_fd=None,
                receipt_root=successor_receipt_root, review_output=fixture.v1_review)
            destructive = []
            real_run = subprocess.run
            def record_successor(command, **kwargs):
                if command and command[0] in {"/usr/bin/rm", "/usr/bin/git"}:
                    destructive.append(command)
                return real_run(command, **kwargs)
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                    patch.object(MODULE, "LEGACY_RETENTION_BATCH", fixture.batch), \
                    patch.object(MODULE.subprocess, "run", side_effect=record_successor):
                MODULE.execute(successor_execute)
            self.assertEqual(destructive, [])
            terminal = json.loads((successor_receipt_root /
                                   "execution-receipt.private.json").read_text())
            self.assertEqual(terminal["state"], "SANITIZED")
            self.assertEqual(terminal["attemptedCommands"], 0)
            self.assertEqual(terminal["completedCommands"], 1)
            self.assertEqual(terminal["removedPaths"], [str(fixture.installed)])
            self.assertEqual(terminal["subordinateAbsences"], [{
                "path": str(fixture.cache), "parentPath": str(fixture.installed),
                "retirableOn": "WITH_PARENT_RELEASE_ONLY"}])
            self.assertEqual((successor_receipt_root /
                              "command-results.private.jsonl").read_bytes(), b"")
            self.assertEqual(terminal["commandLogSha256"], MODULE.digest_bytes(b""))
            self.assertEqual(first_receipt.read_bytes(), original_receipt_bytes)
            self.assertEqual(first_journal.read_bytes(), original_journal_bytes)
            closure = {"kind": "CANONICAL_RETIREMENT", "chain": [
                {"intent": {"path": str(first_intent), "sha256": sha(first_intent)},
                 "receipt": {"path": str(first_receipt), "sha256": sha(first_receipt)},
                 "journal": {"path": str(first_journal), "sha256": sha(first_journal)}},
                {"intent": {"path": str(successor_intent), "sha256": sha(successor_intent)},
                 "receipt": {"path": str(successor_receipt_root /
                                            "execution-receipt.private.json"),
                             "sha256": sha(successor_receipt_root /
                                            "execution-receipt.private.json")},
                 "journal": {"path": str(successor_receipt_root /
                                            "command-results.private.jsonl"),
                             "sha256": MODULE.digest_bytes(b"")}},
            ]}
            empty_journal = successor_receipt_root / "command-results.private.jsonl"
            review = json.loads(fixture.v1_review.read_text())
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings):
                normalized = MODULE._canonical_retirement_closure(
                    closure, fixture.release_id, fixture.target, sha(fixture.contract),
                    sha(fixture.lifecycle), review)
            self.assertEqual(len(normalized["chain"]), 2)
        finally:
            fixture.close()

    def test_f160_subordinate_absence_requires_exact_parent_proof_and_confinement(self):
        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            fixture.bootstrap_batch()
            contract = json.loads(fixture.contract.read_text())
            cache = next(item for item in contract["artifacts"]
                         if item["class"] == MODULE.F160_CACHE_CLASS)
            parent = next(item for item in contract["artifacts"]
                          if item["class"] == "RELEASE_RUNTIME")
            link = {"intentSha256": "1" * 64, "receiptSha256": "2" * 64,
                    "journalSha256": "3" * 64}
            subordinate = {"ordinal": contract["artifacts"].index(cache) + 1,
                           "path": cache["path"], "parentPath": parent["path"],
                           "retirableOn": "WITH_PARENT_RELEASE_ONLY",
                           "observedIdentity": cache["observedIdentity"], **link}
            # Absence alone is insufficient: no canonically completed parent.
            with self.assertRaisesRegex(MODULE.Denied,
                                        "reconciliation_subordinate_identity"):
                MODULE.validate_reconciliation(
                    {"chain": [link], "completed": [],
                     "subordinateAbsences": [subordinate]},
                    contract["artifacts"], require_absent=False)

            escaped = dict(cache)
            escaped["path"] = str(fixture.root / "outside-cache")
            escaped["retirableOn"] = "WITH_PARENT_RELEASE_ONLY"
            binding = dict(MODULE.LEGACY_D436_F160_BINDINGS[fixture.release_id])
            binding["overlayPath"] = escaped["path"]
            bindings = {**MODULE.LEGACY_D436_F160_BINDINGS,
                        fixture.release_id: binding}
            with patch.object(MODULE, "LEGACY_D436_F160_BINDINGS", bindings), \
                    self.assertRaisesRegex(MODULE.Denied,
                                            "reconciliation_subordinate_confinement"):
                MODULE._f160_subordinate_parent(escaped, [parent, escaped])

            wrong_policy = dict(cache); wrong_policy["retirableOn"] = "NEVER_AUTOMATIC"
            self.assertIsNone(MODULE._f160_subordinate_parent(
                wrong_policy, contract["artifacts"]))
            shutil.rmtree(fixture.cache)
            with self.assertRaisesRegex(MODULE.Denied, "artifact_missing:"):
                MODULE.authenticate_artifact(cache)
        finally:
            fixture.close()

        fixture = LegacyBatchV1PreserveFixture("ACTIVE_DEPENDENCY")
        try:
            shutil.rmtree(fixture.cache)
            fixture.cache.symlink_to(fixture.installed / "frontend-runtime")
            with self.assertRaisesRegex(MODULE.Denied, "legacy_f160_runtime_cache"):
                fixture.bootstrap_batch()
        finally:
            fixture.close()

    def test_ephemeral_runtime_cache_class_is_denied_outside_f160(self):
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            contract["classes"].append("EPHEMERAL_RUNTIME_CACHE")
            contract["classes"].sort()
            with self.assertRaisesRegex(MODULE.Denied, "artifact_contract_classes"):
                MODULE.validate_contract(contract)
        finally:
            fixture.close()

    def test_versioned_legacy_descriptor_is_closed_and_binds_canonical_verifier(self):
        descriptor_path = ROOT / "config/legacy-generation-123ba7bd.json"
        descriptor = json.loads(descriptor_path.read_text())
        self.assertEqual(descriptor, MODULE.LEGACY_123BA_BINDING)
        self.assertEqual(descriptor["canonicalVerifierSha256"],
                         sha(ROOT / "scripts/converta-release.py"))

    def test_versioned_a959_descriptor_is_closed_and_distinct_from_123ba(self):
        descriptor_path = ROOT / "config/legacy-generation-a959129e-v1-preserve.json"
        descriptor = json.loads(descriptor_path.read_text())
        self.assertEqual(descriptor, MODULE.LEGACY_A959_V1_PRESERVE_BINDING)
        self.assertEqual(descriptor["sourceState"], "LEGACY_V1_PRESERVE_NO_CONTRACT")
        self.assertEqual(descriptor["lifecycle"]["sha256"],
                         "b585d6cab251b8578cf808a080fe3794c5debef7408929562408fbc9c1c2498a")
        self.assertEqual(descriptor["review"]["sha256"],
                         "6c550cdf53d8bffa55886e8a998638646cb869cc29e7615b65e3c4455134e98b")
        self.assertEqual(descriptor["canonicalVerifierSha256"], sha(ROOT / "scripts/converta-release.py"))

    def test_authenticated_prior_retention_is_denied_for_non_a959_contract(self):
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            artifact = next(item for item in contract["artifacts"]
                            if item["class"] == "DERIVED_WORKTREE")
            artifact["state"] = "SANITIZED"
            artifact["removedByAuthenticatedRetention"] = {
                "batchId": MODULE.LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]["batchId"],
                "receiptSha256": MODULE.LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]["receiptSha256"],
                "journalSha256": MODULE.LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]["journalSha256"],
                "ordinal": 1,
            }
            with self.assertRaisesRegex(MODULE.Denied,
                                        "artifact_contract_authenticated_retention"):
                MODULE.validate_contract(contract)
        finally:
            fixture.close()

    def test_a959_bootstrap_prepare_sanitizes_review_without_execute_or_active_release_retirement(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            original_review_sha = sha(fixture.v1_review)
            original_review_inode = fixture.v1_review.stat().st_ino
            fixture.bootstrap_a959()
            self.assertTrue(fixture.contract.is_file())
            self.assertEqual((fixture.v1_review.stat().st_ino, sha(fixture.v1_review)),
                             (original_review_inode, original_review_sha))
            receipt = json.loads(fixture.receipt.read_text())
            self.assertEqual(receipt["sourceState"], "LEGACY_V1_PRESERVE_NO_CONTRACT")
            self.assertEqual(receipt["preservedReviewSha256"], original_review_sha)
            self.assertFalse(receipt["globalInventory"])
            self.assertFalse(receipt["authorizationGranted"])
            self.assertFalse(receipt["executionPermitted"])
            contract = json.loads(fixture.contract.read_text())
            installed = next(item for item in contract["artifacts"]
                             if item["path"] == str(fixture.installed))
            self.assertEqual((installed["class"], installed["state"]),
                             ("RELEASE_RUNTIME", "ACTIVE_DEPENDENCY"))
            self.assertRegex(installed["structuralSha256"], r"^[0-9a-f]{64}$")
            self.assertGreater(installed["inodes"], 1)
            private_data = next(item for item in contract["artifacts"]
                                if item["path"] == str(fixture.private_data))
            self.assertEqual((private_data["class"], private_data["state"],
                              private_data["retirableOn"], private_data["structuralSha256"]),
                             ("PRIVATE_DATA_NEVER_RETIRE", "ACTIVE_DEPENDENCY",
                              "NEVER_AUTOMATIC", None))
            derived = [item for item in contract["artifacts"] if item["class"] in MODULE.DERIVED_CLASSES]
            self.assertEqual({item["path"] for item in derived},
                             {str(fixture.worktree), str(fixture.api), str(fixture.frontend)})
            self.assertTrue(all(item["state"] == "SANITIZED" and
                                item["removedByAuthenticatedRetention"]["journalSha256"] ==
                                sha(fixture.prior_journal) for item in derived))

            retirement = fixture.evidence / "a959-retirement"; retirement.mkdir(mode=0o700)
            intent = retirement / "intent.private.json"
            commands = retirement / "commands.private.txt"
            prepared = fixture.prepare_a959(intent, commands, original_review_sha)
            self.assertIn('"commandCount":0', prepared)
            sealed = json.loads(intent.read_text())
            self.assertEqual(sealed["commands"], [])
            self.assertEqual(commands.read_bytes(), b"")
            self.assertEqual(sealed["state"], "SEALED_FOR_EXPLICIT_AUTHORIZATION")
            migrated_review = json.loads(fixture.v1_review.read_text())
            self.assertEqual((migrated_review["schemaVersion"], migrated_review["state"]),
                             (2, "SANITIZED"))
            self.assertTrue(fixture.installed.is_dir())
            self.assertTrue(fixture.marker.is_file())
            accepted = RELEASE_MODULE.require_generation_reviews(fixture.outputs)
            self.assertEqual(accepted[0]["generationId"], fixture.release_id)
            self.assertEqual(accepted[0]["state"], "SANITIZED")
        finally:
            fixture.close()

    def test_a959_private_data_overlay_cannot_be_reclassified_for_retirement(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.bootstrap_a959()
            contract = json.loads(fixture.contract.read_text())
            private_data = next(item for item in contract["artifacts"]
                                if item["path"] == str(fixture.private_data))
            private_data.update({"class": "DERIVED_OUTPUT_RUNTIME", "state": "RETIREMENT_READY",
                                 "retirableOn": "LEGACY_V1_PRESERVE_CONTRACT_MATERIALIZED"})
            with patch.object(MODULE, "LEGACY_A959_V1_PRESERVE_BINDING",
                              fixture.descriptor_value):
                with self.assertRaisesRegex(MODULE.Denied,
                                            "artifact_contract_a959_private_data_overlay"):
                    MODULE.validate_contract(contract)
        finally:
            fixture.close()

    def test_a959_bootstrap_never_uses_unprojected_installed_release_metrics(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            original = MODULE.structural_metrics

            def guarded_metrics(path):
                if Path(path) == fixture.installed:
                    raise AssertionError("unprojected installed release traversal")
                return original(path)

            with patch.object(MODULE, "structural_metrics", side_effect=guarded_metrics):
                fixture.bootstrap_a959()
            contract = json.loads(fixture.contract.read_text())
            installed = next(item for item in contract["artifacts"]
                             if item["path"] == str(fixture.installed))
            self.assertRegex(installed["structuralSha256"], r"^[0-9a-f]{64}$")
        finally:
            fixture.close()

    def test_a959_prepare_denies_immutable_file_drift_after_bootstrap(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.bootstrap_a959()
            (fixture.installed / "api-runtime/index.js").write_text("changed immutable api\n")
            retirement = fixture.evidence / "immutable-drift"; retirement.mkdir(mode=0o700)
            with self.assertRaisesRegex(MODULE.Denied, "artifact_drift:"):
                fixture.prepare_a959(retirement / "intent.private.json",
                                     retirement / "commands.private.txt", sha(fixture.v1_review))
        finally:
            fixture.close()

    def test_a959_prepare_denies_immutable_addition_after_bootstrap(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.bootstrap_a959()
            (fixture.installed / "api-runtime/unindexed.js").write_text("new immutable entry\n")
            retirement = fixture.evidence / "immutable-addition"; retirement.mkdir(mode=0o700)
            with self.assertRaisesRegex(MODULE.Denied, "artifact_drift:"):
                fixture.prepare_a959(retirement / "intent.private.json",
                                     retirement / "commands.private.txt", sha(fixture.v1_review))
        finally:
            fixture.close()

    def test_a959_prepare_allows_private_data_content_change_with_zero_commands(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            original_review_sha = sha(fixture.v1_review)
            fixture.bootstrap_a959()
            private_json(fixture.private_data / "state.json", {"fixture": "updated-private-state"})
            retirement = fixture.evidence / "private-data-change"; retirement.mkdir(mode=0o700)
            prepared = fixture.prepare_a959(retirement / "intent.private.json",
                                             retirement / "commands.private.txt",
                                             original_review_sha)
            self.assertIn('"commandCount":0', prepared)
            self.assertEqual((retirement / "commands.private.txt").read_bytes(), b"")
        finally:
            fixture.close()

    def test_a959_installed_verifier_preserves_nominal_release_denial(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.verifier.write_text(
                "#!/usr/bin/env python3\nimport sys\n"
                "print('RELEASE_DENY:legacy_a959_private_data_overlay_symlink', file=sys.stderr)\n"
                "raise SystemExit(2)\n"
            )
            fixture.verifier.chmod(0o600)
            fixture.descriptor_value["canonicalVerifierSha256"] = sha(fixture.verifier)
            with patch.object(MODULE, "canonical_release_verifier", return_value=fixture.verifier):
                with self.assertRaisesRegex(
                        MODULE.Denied,
                        "legacy_installed_release_verification:RELEASE_DENY:"
                        "legacy_a959_private_data_overlay_symlink"):
                    MODULE._run_legacy_installed_verifier(fixture.descriptor_value)
        finally:
            fixture.close()

    def test_a959_bootstrap_denies_descriptor_review_or_active_release_drift(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            changed = json.loads(fixture.descriptor.read_text())
            changed["releaseId"] = "immutable-not-a959"
            private_json(fixture.descriptor, changed)
            with patch.object(MODULE, "LEGACY_A959_V1_PRESERVE_BINDING", fixture.descriptor_value):
                with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_descriptor_binding"):
                    MODULE.bootstrap_legacy_a959_v1_preserve(fixture.arguments())
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.v1_review.write_bytes(fixture.v1_review.read_bytes() + b"drift")
            with self.assertRaisesRegex(MODULE.Denied, "private_hash:generation-review.private.json"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["activeReleases"] = []
            private_json(fixture.operational, operational)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_active_release_graph"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_bootstrap_denies_prior_retention_hash_or_literal_event_drift(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.prior_receipt.write_bytes(fixture.prior_receipt.read_bytes() + b"\n")
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_external_hash"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.mutate_prior_event("RESULT", 4, lambda event: event.update(exitCode=1))
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_result:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_literal_real_journal_schema_passes(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            events = MODULE._read_journal(fixture.prior_journal.read_bytes())
            self.assertEqual(len(events), 30)
            self.assertEqual({event["event"] for event in events},
                             {"ATTEMPT", "RESULT", "VERIFIED"})
            self.assertNotIn("absent", events[2])
            fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_verified_requires_pass_and_matching_kind(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.mutate_prior_event("VERIFIED", 4,
                                       lambda event: event.update(result="FAILED"))
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_verified:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.mutate_prior_event("VERIFIED", 4,
                                       lambda event: event.update(kind="git_worktree_remove"))
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_verified:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_verified_denies_ordinal_or_path_drift(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.mutate_prior_event("VERIFIED", 4,
                                       lambda event: event.update(path="/not/the/command/path"))
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_verified:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.mutate_prior_event("VERIFIED", 4, lambda event: event.update(ordinal=5))
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_verified:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_old_absent_fixture_without_pass_is_denied(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            def old_synthetic(event):
                event.pop("result")
                event["absent"] = True
            fixture.mutate_prior_event("VERIFIED", 4, old_synthetic)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_verified:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

    def test_a959_bootstrap_denies_incomplete_receipt_or_reappeared_derived_path(self):
        fixture = LegacyA959V1PreserveFixture()
        try:
            receipt = json.loads(fixture.prior_receipt.read_text())
            receipt["completedCommands"] = 9
            private_json(fixture.prior_receipt, receipt)
            fixture.descriptor_value["priorRetention"]["receiptSha256"] = sha(fixture.prior_receipt)
            private_json(fixture.descriptor, fixture.descriptor_value)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_receipt_contract"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

        fixture = LegacyA959V1PreserveFixture()
        try:
            fixture.api.mkdir(parents=True)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_a959_retention_path_reappeared:4"):
                fixture.bootstrap_a959()
        finally:
            fixture.close()

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
            result = invoke("prepare", "--contract", str(fixture.contract),
                            "--contract-sha256", sha(fixture.contract),
                            "--lifecycle", str(fixture.lifecycle), "--lifecycle-sha256", sha(fixture.lifecycle),
                            "--operational-state", str(fixture.operational),
                            "--operational-state-sha256", sha(fixture.operational),
                            "--root-policy", str(fixture.policy), "--root-policy-sha256", sha(fixture.policy),
                            "--deployment-lock", str(fixture.deploy_lock),
                            "--intent-output", str(intent), "--commands-output", str(commands),
                            "--review-output", str(fixture.bootstrap_review), "--reviewer", "fixture-owner",
                            "--reason", "sealed after authenticated legacy bootstrap")
            self.assertEqual(result.returncode, 0, result.stderr)
            sealed = json.loads(intent.read_text())
            self.assertEqual(sealed["state"], "SEALED_FOR_EXPLICIT_AUTHORIZATION")
            self.assertFalse(sealed["authorizationGranted"])
            self.assertEqual({item["path"] for item in sealed["commands"]},
                             {str(fixture.worktree), str(fixture.api), str(fixture.frontend)})

            authorization = fixture.evidence / "authorization.private.json"
            private_json(authorization, {"schemaVersion": 1, "authorizationId": "legacy-once",
                         "decision": "AUTHORIZE_ONCE", "intentSha256": sha(intent),
                         "approvedPaths": [item["path"] for item in sealed["commands"]],
                         "owner": "fixture-owner"})
            execution_receipt = fixture.evidence / "retirement-execution"
            executed = invoke("execute", "--intent", str(intent), "--intent-sha256", sha(intent),
                               "--authorization", str(authorization),
                               "--authorization-sha256", sha(authorization),
                               "--operational-state", str(fixture.operational),
                               "--operational-state-sha256", sha(fixture.operational),
                               "--root-policy", str(fixture.policy),
                               "--root-policy-sha256", sha(fixture.policy),
                               "--deployment-lock", str(fixture.deploy_lock),
                               "--receipt-root", str(execution_receipt),
                               "--review-output", str(fixture.bootstrap_review))
            self.assertEqual(executed.returncode, 0, executed.stderr)
            self.assertEqual(json.loads(fixture.bootstrap_review.read_text())["state"], "SANITIZED")
            accepted = RELEASE_MODULE.require_generation_reviews(fixture.outputs)
            self.assertEqual(accepted[0]["generationId"], fixture.release_id)
            self.assertEqual(accepted[0]["state"], "SANITIZED")
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

    def test_legacy_bootstrap_denies_installed_referenced_symlink_and_divergent_outputs(self):
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
            fixture.contract.chmod(0o600)
            with self.assertRaisesRegex(MODULE.Denied, "legacy_contract_divergent"):
                fixture.bootstrap()
        finally:
            fixture.close()

    def test_legacy_bootstrap_resumes_exactly_after_contract_or_review_publication(self):
        for failure_after in (1, 2):
            fixture = LegacyBootstrapFixture()
            try:
                real_publish = MODULE.write_or_verify_exact
                publications = 0

                def fail_after_publication(path, value, predicate):
                    nonlocal publications
                    result = real_publish(path, value, predicate)
                    publications += 1
                    if publications == failure_after:
                        raise MODULE.Denied(f"injected_after_{predicate}")
                    return result

                with patch.object(MODULE, "LEGACY_123BA_BINDING", fixture.descriptor_value), \
                        patch.object(MODULE, "canonical_release_verifier", return_value=fixture.verifier), \
                        patch.object(MODULE, "write_or_verify_exact", side_effect=fail_after_publication):
                    with self.assertRaisesRegex(MODULE.Denied, "injected_after"):
                        MODULE.bootstrap_legacy(fixture.arguments())
                self.assertTrue(fixture.contract.is_file())
                if failure_after == 1:
                    self.assertFalse(fixture.bootstrap_review.exists())
                else:
                    self.assertTrue(fixture.bootstrap_review.is_file())
                self.assertFalse(fixture.receipt.exists())
                preserved = {path: (path.stat().st_ino, sha(path)) for path in
                             (fixture.contract, fixture.bootstrap_review) if path.exists()}

                fixture.bootstrap()
                for path, identity in preserved.items():
                    self.assertEqual((path.stat().st_ino, sha(path)), identity)
                receipt = json.loads(fixture.receipt.read_text())
                self.assertEqual(receipt["state"], "LEGACY_CONTRACT_MATERIALIZED")
                self.assertFalse(receipt["authorizationGranted"])
                self.assertFalse(receipt["executionPermitted"])
                self.assertEqual(receipt["destructiveCommands"], 0)
            finally:
                fixture.close()

    def test_write_or_verify_exact_denies_divergent_symlink_type_owner_and_mode(self):
        expected = b"expected\n"
        with tempfile.TemporaryDirectory(prefix="legacy-exact-publication-") as raw:
            root = Path(raw)
            for label in ("divergent", "symlink", "type", "owner", "mode"):
                path = root / label
                if label == "divergent":
                    path.write_bytes(b"different\n"); path.chmod(0o600)
                elif label == "symlink":
                    target = root / "target"; target.write_bytes(expected); target.chmod(0o600)
                    os.symlink(target, path)
                elif label == "type":
                    path.mkdir(mode=0o700)
                else:
                    path.write_bytes(expected); path.chmod(0o644 if label == "mode" else 0o600)
                context = (patch.object(MODULE.os, "geteuid", return_value=os.geteuid() + 1)
                           if label == "owner" else patch.object(MODULE.os, "geteuid", wraps=os.geteuid))
                with context, self.assertRaises(MODULE.Denied):
                    MODULE.write_or_verify_exact(path, expected, f"legacy_{label}")

    def test_legacy_bootstrap_denies_tree_drift_and_never_invokes_destructive_commands(self):
        fixture = LegacyBootstrapFixture()
        try:
            real_observation = MODULE._tree_observation
            calls = 0
            def mutate_before_second_output(path, label, ignored=None):
                nonlocal calls
                calls += 1
                if calls == 3:
                    (fixture.output / "late-file").write_text("late\n")
                return real_observation(path, label, ignored)
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
            self.assertNotIn("api-runtime/.data", command_text)
            self.assertLess(fixture.intent.stat().st_size + fixture.commands.stat().st_size, 100_000)
            self.assertEqual(json.loads(fixture.review.read_text())["state"], "RETIREMENT_READY")
        finally:
            fixture.close()

    def test_current_private_data_overlay_policy_is_closed_and_never_a_command(self):
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            contract["privateDataOverlay"]["path"] = "api-runtime/.other"
            private_json(fixture.contract, contract)
            result = fixture.prepare()
            self.assertEqual(result.returncode, 2)
            self.assertIn("artifact_contract_private_data_overlay", result.stderr)
            self.assertFalse(fixture.commands.exists())
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

    def test_review_is_canonical_while_other_outputs_remain_private_evidence(self):
        fixture = Fixture()
        try:
            wrong_review = fixture.evidence_root / "generation-review.private.json"
            result = invoke("prepare", "--contract", str(fixture.contract),
                            "--contract-sha256", sha(fixture.contract),
                            "--lifecycle", str(fixture.lifecycle),
                            "--lifecycle-sha256", sha(fixture.lifecycle),
                            "--operational-state", str(fixture.operational),
                            "--operational-state-sha256", sha(fixture.operational),
                            "--root-policy", str(fixture.policy),
                            "--root-policy-sha256", sha(fixture.policy),
                            "--deployment-lock", str(fixture.deploy_lock),
                            "--intent-output", str(fixture.intent),
                            "--commands-output", str(fixture.commands),
                            "--review-output", str(wrong_review),
                            "--reviewer", "fixture-owner", "--reason", "wrong review")
            self.assertEqual(result.returncode, 2)
            self.assertIn("generation_review_destination", result.stderr)
            self.assertFalse(wrong_review.exists())
            self.assertFalse(fixture.intent.exists())
            self.assertFalse(fixture.commands.exists())

            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertEqual(Path(json.loads(fixture.intent.read_text())["reviewOutput"]), fixture.review)
            self.assertTrue(fixture.review.is_file())
            self.assertEqual(fixture.intent.parent, fixture.evidence_root)
            self.assertEqual(fixture.commands.parent, fixture.evidence_root)
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

        fixture = Fixture(active=False, rollback=False, candidate=False,
                          installed=True, deployed=False,
                          release_id="immutable-current-reference-fixture")
        try:
            prepared = fixture.prepare()
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"]
                           if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "ACTIVE_DEPENDENCY")
            self.assertNotIn(str(fixture.installed_release),
                             [item["path"] for item in intent["commands"]])
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

    def test_inactive_release_runtime_is_literal_and_retired_once(self):
        fixture = Fixture(active=False, rollback=False, candidate=False,
                          installed=True, deployed=False)
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["currentPaths"] = []
            operational["observations"]["currentLinks"] = []
            operational["deploymentState"] = {"state": "SUPERSEDED"}
            private_json(fixture.operational, operational)

            result = fixture.prepare()
            self.assertEqual(result.returncode, 0, result.stderr)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"]
                           if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "RETIREMENT_READY")
            release_command = next(item for item in intent["commands"]
                                   if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release_command["path"], str(fixture.installed_release))
            self.assertEqual(release_command["argv"],
                             ["/usr/bin/rm", "-r", "--", str(fixture.installed_release)])
            self.assertEqual(release_command["literal"],
                             f"/usr/bin/rm -r -- {fixture.installed_release}")

            authorization = fixture.authorize("retire-release-runtime-once")
            executed, receipt_root = fixture.execute(authorization)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            self.assertFalse(fixture.installed_release.exists())
            receipt = json.loads((receipt_root / "execution-receipt.private.json").read_text())
            self.assertEqual(receipt["state"], "SANITIZED")
            self.assertIn(str(fixture.installed_release), receipt["removedPaths"])
            self.assertEqual(receipt["remainingDerivedPaths"], [])
        finally:
            fixture.close()

    def test_private_overlay_protects_parent_at_prepare_and_execute(self):
        fixture = Fixture(active=False, rollback=False, candidate=False,
                          installed=True, deployed=False,
                          release_id="immutable-0fdec-private-fixture")
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["currentPaths"] = []
            operational["observations"]["currentLinks"] = []
            operational["deploymentState"] = {"state": "SUPERSEDED"}
            private_json(fixture.operational, operational)

            overlay = fixture.installed_release / "api-runtime/.data"
            overlay.mkdir(parents=True)
            contract = json.loads(fixture.contract.read_text())
            release = next(item for item in contract["artifacts"]
                           if item["class"] == "RELEASE_RUNTIME")
            release.update(MODULE.structural_metrics(fixture.installed_release))
            private_json(fixture.contract, contract)
            prepared = fixture.prepare()
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"]
                           if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "ACTIVE_DEPENDENCY")
            self.assertNotIn(str(fixture.installed_release),
                             [item["path"] for item in intent["commands"]])
        finally:
            fixture.close()

        fixture = Fixture(active=False, rollback=False, candidate=False,
                          installed=True, deployed=False,
                          release_id="immutable-a959-execute-drift-fixture")
        try:
            operational = json.loads(fixture.operational.read_text())
            operational["currentPaths"] = []
            operational["observations"]["currentLinks"] = []
            operational["deploymentState"] = {"state": "SUPERSEDED"}
            private_json(fixture.operational, operational)
            self.assertEqual(fixture.prepare().returncode, 0)
            authorization = fixture.authorize("private-parent-drift")
            (fixture.installed_release / "api-runtime/.data").mkdir(parents=True)
            executed, _ = fixture.execute(authorization)
            self.assertEqual(executed.returncode, 2)
            self.assertTrue(fixture.installed_release.is_dir())
            self.assertIn("DENY", executed.stderr)
        finally:
            fixture.close()

    def test_release_graph_reconciliation_uses_emitted_chain_and_active_selection(self):
        fixture = Fixture(active=False, rollback=True, candidate=False, installed=True,
                          deployed=False,
                          release_id="immutable-708f018c-vps-20261027T152109Z")
        try:
            materialized = fixture.root / "materialized-reconciliation-control"
            materialized.mkdir(mode=0o700)
            copied_tool = materialized / "generation-retirement.py"
            copied_dependency = materialized / "preparation_artifact_lifecycle.py"
            copied_consumer = materialized / "capacity-recovery.py"
            shutil.copyfile(TOOL, copied_tool)
            shutil.copyfile(ROOT / "scripts/preparation_artifact_lifecycle.py",
                            copied_dependency)
            shutil.copyfile(ROOT / "scripts/capacity-recovery.py", copied_consumer)
            copied_tool.chmod(0o500); copied_dependency.chmod(0o600)
            copied_consumer.chmod(0o600)
            self.assertEqual(sha(copied_tool), sha(TOOL))
            self.assertEqual(sha(copied_consumer), sha(ROOT / "scripts/capacity-recovery.py"))
            consumer_spec = importlib.util.spec_from_file_location(
                "materialized_capacity_recovery", copied_consumer)
            self.assertIsNotNone(consumer_spec)
            self.assertIsNotNone(consumer_spec.loader)
            consumer = importlib.util.module_from_spec(consumer_spec)
            consumer_spec.loader.exec_module(consumer)
            producer_operational = json.loads(fixture.operational.read_text())
            producer_operational["deploymentState"] = {"state": "SUPERSEDED"}
            private_json(fixture.operational, producer_operational)
            producer_contract = json.loads(fixture.contract.read_text())
            producer_contract["artifacts"] = [
                item for item in producer_contract["artifacts"]
                if item["class"] in MODULE.PRESERVE_CLASSES |
                {"RELEASE_RUNTIME", "DERIVED_WORKTREE"}]
            private_json(fixture.contract, producer_contract)
            prepared = fixture.prepare()
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            authorization = fixture.authorize("producer-chain-once")
            executed, receipt_root = fixture.execute(authorization, "producer-chain-receipt")
            self.assertEqual(executed.returncode, 0, executed.stderr)
            terminal_review_raw = fixture.review.read_bytes()
            receipt_path = receipt_root / "execution-receipt.private.json"
            journal_path = receipt_root / "command-results.private.jsonl"
            self.assertEqual(json.loads(fixture.review.read_text())["evidenceSha256"],
                             sha(receipt_path))
            self.assertEqual(json.loads(receipt_path.read_text())["intentSha256"],
                             sha(fixture.intent))
            self.assertEqual(json.loads(receipt_path.read_text())["commandLogSha256"],
                             sha(journal_path))

            active_api = "immutable-current-api"
            active_frontend = "immutable-current-frontend"
            immediate_api = "immutable-immediate-api"
            immediate_frontend = "immutable-immediate-frontend"
            source = {
                "activeReleases": [active_api, active_frontend],
                "rollbackReleases": [immediate_api, immediate_frontend, fixture.release_id],
                "transitiveReturnReleases": [], "candidateReleases": [],
                "installedVerifiedReleases": [active_api, active_frontend,
                                               immediate_api, immediate_frontend,
                                               fixture.release_id],
                "supersededCandidates": [],
                "immediateRollbackReleases": {
                    "api": immediate_api, "frontend": immediate_frontend},
            }
            private_json(fixture.graph, source)
            operational_path = fixture.evidence_root / "reconciliation-operational.json"
            private_json(operational_path, {
                "schemaVersion": 1, "currentPaths": [], "pm2LivePaths": [],
                "pm2DumpPaths": [], "dependencies": [],
                "observations": {"releaseGraph": {"path": str(fixture.graph),
                                                    "sha256": sha(fixture.graph)}}})
            runtime_manifest = fixture.evidence_root / "active-runtime-manifest.json"
            private_json(runtime_manifest, {"schemaVersion": 1,
                "rollbackReleases": {"api": {"releaseId": immediate_api}}})
            transaction = fixture.evidence_root / "active-transaction.json"
            private_json(transaction, {"schemaVersion": 1, "state": "DEPLOYED",
                "components": ["api"],
                "binding": {"release": active_api, "components": ["api"],
                            "runtimeManifestSha256": sha(runtime_manifest)},
                "preflight": {"selections": {
                    "api": {"releaseId": immediate_api},
                    "frontend": {"releaseId": active_frontend}}},
                "previous": {"releases": {"api": immediate_api,
                                             "frontend": active_frontend}}})
            frontend_transaction_root = fixture.evidence_root / "frontend-only-transaction"
            frontend_transaction_root.mkdir(mode=0o700)
            frontend_executor = fixture.evidence_root / "frontend-only-activation.sh"
            shutil.copyfile(ROOT / "scripts/frontend-only-activation.sh", frontend_executor)
            frontend_executor.chmod(0o600)
            frontend_target = "f" * 40
            selection_intent = frontend_transaction_root / "selection-intent.private.json"
            private_json(selection_intent, {"frontend": "candidate",
                "expectedCurrent": str(fixture.releases_root / immediate_frontend /
                                       "frontend-runtime"),
                "target": str(fixture.releases_root / active_frontend / "frontend-runtime")})
            activation_intent = fixture.evidence_root / "activation-intent.private.json"
            private_json(activation_intent, {"schemaVersion": 1,
                "state": "SEALED_AWAITING_EXPLICIT_ACTIVATION_AUTHORIZATION",
                "activationExecuted": False, "authorizationReady": True,
                "automaticRetry": False, "deployedMarkerBeforeAcceptance": False,
                "saveCountBeforeAcceptance": 0, "retirementReceiptAbsent": True,
                "buildId": "frontend-only-build", "release": active_frontend,
                "rollbackRelease": immediate_frontend, "target": frontend_target,
                "transactionRoot": str(frontend_transaction_root),
                "executorSha256": sha(frontend_executor)})
            awaiting_state = frontend_transaction_root / (
                "window-state.private.json.previous." + "0" * 64)
            private_json(awaiting_state, {"state": "AWAITING_ACCEPTANCE",
                "target": frontend_target, "release": active_frontend,
                "buildId": "frontend-only-build", "saveCount": 0,
                "acceptance": False, "deployedMarker": False})
            awaiting_bound = frontend_transaction_root / (
                "window-state.private.json.previous." + sha(awaiting_state))
            awaiting_state.rename(awaiting_bound)
            acceptance = frontend_transaction_root / "technical-acceptance.private.json"
            private_json(acceptance, {"accepted": True,
                "acceptedAt": "2026-10-30T00:02:28.657234+00:00",
                "decision": "TECHNICAL_ACCEPTANCE_PASS",
                "ownerDecision": "TECHNICAL_ACCEPTANCE_GRANTED",
                "release": active_frontend, "schemaVersion": 1,
                "scope": "frontend-only technical acceptance",
                "source": "owner_confirmation_in_active_window", "target": frontend_target})
            finalization = frontend_transaction_root / "frontend-finalization-receipt.private.json"
            final_common = {"state": "DEPLOYED_SANITIZED", "saveCount": 1,
                "dumpSha256": "d" * 64, "retirementReceiptSha256": "e" * 64,
                "restartCountDuringFinalize": 0}
            private_json(finalization, final_common)
            final_window = frontend_transaction_root / "window-state.private.json"
            private_json(final_window, {**final_common, "acceptance": True,
                                        "deployedMarker": True})
            frontend_evidence = {"kind": "FRONTEND_ONLY_V1",
                "executor": {"path": str(frontend_executor), "sha256": sha(frontend_executor)},
                "selectionIntent": {"path": str(selection_intent),
                                    "sha256": sha(selection_intent)},
                "activationIntent": {"path": str(activation_intent),
                                     "sha256": sha(activation_intent)},
                "awaitingAcceptanceState": {"path": str(awaiting_bound),
                                            "sha256": sha(awaiting_bound)},
                "technicalAcceptance": {"path": str(acceptance), "sha256": sha(acceptance)},
                "finalizationReceipt": {"path": str(finalization),
                                        "sha256": sha(finalization)},
                "finalWindowState": {"path": str(final_window),
                                     "sha256": sha(final_window)}}
            request = fixture.evidence_root / "reconcile-request.json"
            private_json(request, {"schemaVersion": 2,
                "reconciliationId": "emitted-producer-chain",
                "releaseRoot": str(fixture.releases_root),
                "sourceGraph": {"path": str(fixture.graph), "sha256": sha(fixture.graph)},
                "operationalState": {"path": str(operational_path),
                                     "sha256": sha(operational_path)},
                "activationEvidence": {"api": {
                    "runtimeManifest": {"path": str(runtime_manifest),
                                        "sha256": sha(runtime_manifest)},
                    "transactionJournal": {"path": str(transaction),
                                           "sha256": sha(transaction)}},
                    "frontend": frontend_evidence},
                "entries": [{"releaseId": fixture.release_id,
                    "installedReleasePath": str(fixture.installed_release),
                    "expectedRole": "rollbackReleases",
                    "decision": "CLOSE_OPERATIONAL_DEPENDENCY",
                    "contract": {"path": str(fixture.contract),
                                 "sha256": sha(fixture.contract)},
                    "lifecycle": {"path": str(fixture.lifecycle),
                                  "sha256": sha(fixture.lifecycle)},
                    "review": {"path": str(fixture.review), "sha256": sha(fixture.review)},
                    "closure": {"kind": "CANONICAL_RETIREMENT", "chain": [{
                        "intent": {"path": str(fixture.intent), "sha256": sha(fixture.intent)},
                        "receipt": {"path": str(receipt_path), "sha256": sha(receipt_path)},
                        "journal": {"path": str(journal_path), "sha256": sha(journal_path)}}]}}]})

            def reconcile(name: str, request_path: Path = request):
                return invoke_tool(copied_tool, "reconcile-release-graph",
                    "--request", str(request_path),
                    "--request-sha256", sha(request_path),
                    "--graph-output", str(fixture.evidence_root / f"{name}-graph.json"),
                    "--projection-output", str(fixture.evidence_root / f"{name}-projection.json"),
                    "--receipt-output", str(fixture.evidence_root / f"{name}-receipt.json"))

            result = reconcile("accepted")
            self.assertEqual(result.returncode, 0, result.stderr)
            successor = fixture.evidence_root / "accepted-graph.json"
            successor_value = json.loads(successor.read_text())
            self.assertNotIn(fixture.release_id, successor_value["rollbackReleases"])
            self.assertEqual(successor_value["immediateRollbackReleases"], {
                "api": immediate_api, "frontend": immediate_frontend})
            accepted_receipt = json.loads(
                (fixture.evidence_root / "accepted-receipt.json").read_text())
            self.assertEqual(accepted_receipt["activationEvidence"]["api"]["kind"],
                             "FIXED_CURRENT")
            self.assertEqual(accepted_receipt["activationEvidence"]["frontend"]["kind"],
                             "FRONTEND_ONLY_V1")
            self.assertEqual(
                accepted_receipt["activationEvidence"]["frontend"]["immediateRollback"],
                immediate_frontend)

            accepted_projection = fixture.evidence_root / "accepted-projection.json"
            live_pm2 = fixture.evidence_root / "live-pm2"
            live_pm2.write_text("#!/bin/sh\nprintf '[]\\n'\n")
            live_pm2.chmod(0o500)
            live_dump = fixture.evidence_root / "live-dump.json"
            private_json(live_dump, [])
            live_transactions = fixture.evidence_root / "live-transactions"
            live_transactions.mkdir(mode=0o700)

            def capture_projection(projection_path: Path):
                pm2_projection = consumer._pm2_projection([])
                capacity_operational = {"schemaVersion": 2,
                    "currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [],
                    "openTransactionPaths": [], "protectedGraphPaths": [],
                    "deploymentLock": str(fixture.deploy_lock),
                    "writerLock": str(fixture.writer_lock),
                    "liveObservations": {"currentLinks": [],
                        "pm2": {"path": str(live_pm2), "sha256": sha(live_pm2),
                            "fingerprintSha256": consumer.digest_bytes(
                                consumer.canonical(pm2_projection))},
                        "dump": {"path": str(live_dump), "sha256": sha(live_dump)},
                        "releaseGraph": {"path": str(projection_path),
                                         "sha256": sha(projection_path)},
                        "transactionsRoot": {"path": str(live_transactions),
                            "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                            "allowedModes": ["0700"]}}}
                return consumer.capture_live_operational(capacity_operational)

            captured, _ = capture_projection(accepted_projection)
            self.assertIn(str(fixture.releases_root / active_frontend),
                          captured["protectedGraphPaths"])
            self.assertIn(str(fixture.releases_root / immediate_api),
                          captured["protectedGraphPaths"])
            self.assertIn(str(fixture.releases_root / immediate_frontend),
                          captured["protectedGraphPaths"])

            def denied_projection(name: str, mutate):
                receipt_value = json.loads(
                    (fixture.evidence_root / "accepted-receipt.json").read_text())
                mutate(receipt_value)
                receipt_variant = fixture.evidence_root / f"{name}-consumer-receipt.json"
                private_json(receipt_variant, receipt_value)
                projection_value = json.loads(accepted_projection.read_text())
                projection_value["reconciliationReceipt"] = {
                    "path": str(receipt_variant), "sha256": sha(receipt_variant)}
                projection_variant = fixture.evidence_root / f"{name}-consumer-projection.json"
                private_json(projection_variant, projection_value)
                with self.assertRaises(consumer.Denied):
                    capture_projection(projection_variant)

            denied_projection("missing-frontend-binding", lambda value:
                value["activationEvidence"]["frontend"].pop("technicalAcceptance"))
            denied_projection("crossed-frontend-binding", lambda value:
                value["activationEvidence"]["frontend"].update({
                    "technicalAcceptance":
                        value["activationEvidence"]["frontend"]["selectionIntent"]}))
            acceptance_raw = acceptance.read_bytes()
            acceptance.write_bytes(acceptance_raw + b" ")
            acceptance.chmod(0o600)
            with self.assertRaises(consumer.Denied):
                capture_projection(accepted_projection)
            acceptance.write_bytes(acceptance_raw)
            acceptance.chmod(0o600)

            operational = json.loads(fixture.operational.read_text())
            successor_value = json.loads(successor.read_text())
            for key in MODULE.RICH_GRAPH_KEYS:
                operational[key] = successor_value[key]
            operational["immediateRollbackReleases"] = (
                successor_value["immediateRollbackReleases"])
            operational["currentPaths"] = []
            operational["observations"]["currentLinks"] = []
            operational["observations"]["releaseGraph"] = {
                "path": str(successor), "sha256": sha(successor)}
            operational["deploymentState"] = {"state": "SUPERSEDED"}
            private_json(fixture.operational, operational)
            post_intent = fixture.evidence_root / "post-reconciliation-intent.json"
            post_commands = fixture.evidence_root / "post-reconciliation-commands.txt"
            post = invoke_tool(copied_tool, "prepare", "--contract", str(fixture.contract),
                "--contract-sha256", sha(fixture.contract),
                "--lifecycle", str(fixture.lifecycle),
                "--lifecycle-sha256", sha(fixture.lifecycle),
                "--operational-state", str(fixture.operational),
                "--operational-state-sha256", sha(fixture.operational),
                "--root-policy", str(fixture.policy),
                "--root-policy-sha256", sha(fixture.policy),
                "--deployment-lock", str(fixture.deploy_lock),
                "--intent-output", str(post_intent), "--commands-output", str(post_commands),
                "--review-output", str(fixture.review), "--reviewer", "fixture-owner",
                "--reason", "reconciled fixture",
                "--prior-intent", str(fixture.intent),
                "--prior-intent-sha256", sha(fixture.intent),
                "--prior-receipt", str(receipt_path),
                "--prior-receipt-sha256", sha(receipt_path),
                "--prior-journal", str(journal_path),
                "--prior-journal-sha256", sha(journal_path))
            self.assertEqual(post.returncode, 0, post.stderr)
            self.assertIn(str(fixture.installed_release),
                          [item["path"] for item in json.loads(post_intent.read_text())["commands"]])
            fixture.review.write_bytes(terminal_review_raw)
            fixture.review.chmod(0o600)

            incompatible = json.loads(request.read_text())
            bad_receipt = fixture.evidence_root / "bad-receipt.json"
            bad_value = json.loads(receipt_path.read_text())
            bad_value["intentSha256"] = "0" * 64
            private_json(bad_receipt, bad_value)
            incompatible["entries"][0]["closure"]["chain"][0]["receipt"] = {
                "path": str(bad_receipt), "sha256": sha(bad_receipt)}
            incompatible_path = fixture.evidence_root / "incompatible-request.json"
            private_json(incompatible_path, incompatible)
            denied = reconcile("incompatible", incompatible_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_receipt_identity", denied.stderr)

            missing_component = json.loads(request.read_text())
            missing_journal = fixture.evidence_root / "missing-component.json"
            missing_value = json.loads(transaction.read_text())
            del missing_value["preflight"]["selections"]["frontend"]
            private_json(missing_journal, missing_value)
            missing_component["activationEvidence"]["api"]["transactionJournal"] = {
                "path": str(missing_journal), "sha256": sha(missing_journal)}
            missing_path = fixture.evidence_root / "missing-component-request.json"
            private_json(missing_path, missing_component)
            denied = reconcile("missing-component", missing_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_activation_identity", denied.stderr)

            omitted = json.loads(request.read_text())
            del omitted["activationEvidence"]["frontend"]
            omitted_path = fixture.evidence_root / "omitted-component-request.json"
            private_json(omitted_path, omitted)
            denied = reconcile("omitted-component", omitted_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_activation_schema", denied.stderr)

            historical = json.loads(request.read_text())
            historical_intent = fixture.evidence_root / "historical-activation-intent.json"
            historical_value = json.loads(activation_intent.read_text())
            historical_value["release"] = "immutable-old-frontend"
            private_json(historical_intent, historical_value)
            historical["activationEvidence"]["frontend"]["activationIntent"] = {
                "path": str(historical_intent), "sha256": sha(historical_intent)}
            historical_path = fixture.evidence_root / "historical-request.json"
            private_json(historical_path, historical)
            denied = reconcile("historical", historical_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_frontend_selection_identity", denied.stderr)

            crossed = json.loads(request.read_text())
            crossed_acceptance = fixture.evidence_root / "crossed-acceptance.json"
            crossed_value = json.loads(acceptance.read_text())
            crossed_value["release"] = active_api
            private_json(crossed_acceptance, crossed_value)
            crossed["activationEvidence"]["frontend"]["technicalAcceptance"] = {
                "path": str(crossed_acceptance), "sha256": sha(crossed_acceptance)}
            crossed_path = fixture.evidence_root / "crossed-request.json"
            private_json(crossed_path, crossed)
            denied = reconcile("crossed", crossed_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_frontend_transaction_identity", denied.stderr)

            divergent = json.loads(request.read_text())
            divergent_selection = fixture.evidence_root / "divergent-selection.json"
            divergent_value = json.loads(selection_intent.read_text())
            divergent_value["expectedCurrent"] = str(
                fixture.releases_root / "immutable-other-frontend" / "frontend-runtime")
            private_json(divergent_selection, divergent_value)
            divergent["activationEvidence"]["frontend"]["selectionIntent"] = {
                "path": str(divergent_selection), "sha256": sha(divergent_selection)}
            divergent_path = fixture.evidence_root / "divergent-request.json"
            private_json(divergent_path, divergent)
            denied = reconcile("divergent", divergent_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_frontend_selection_identity", denied.stderr)

            frontend_rollback = json.loads(request.read_text())
            frontend_rollback_root = fixture.evidence_root / "frontend-rollback-transaction"
            frontend_rollback_root.mkdir(mode=0o700)
            rollback_control_root = fixture.evidence_root / "frontend-rollback-control"
            rollback_control_root.mkdir(mode=0o700)
            rollback_executor = rollback_control_root / "frontend-only-activation.sh"
            shutil.copyfile(frontend_executor, rollback_executor)
            rollback_executor.chmod(0o600)
            rollback_activation = rollback_control_root / "activation-intent.private.json"
            rollback_activation_value = json.loads(activation_intent.read_text())
            rollback_activation_value["rollbackRelease"] = fixture.release_id
            rollback_activation_value["transactionRoot"] = str(frontend_rollback_root)
            private_json(rollback_activation, rollback_activation_value)
            rollback_selection = frontend_rollback_root / "selection-intent.private.json"
            rollback_selection_value = json.loads(selection_intent.read_text())
            rollback_selection_value["expectedCurrent"] = str(
                fixture.releases_root / fixture.release_id / "frontend-runtime")
            private_json(rollback_selection, rollback_selection_value)
            rollback_awaiting = frontend_rollback_root / awaiting_bound.name
            shutil.copyfile(awaiting_bound, rollback_awaiting); rollback_awaiting.chmod(0o600)
            rollback_acceptance = frontend_rollback_root / acceptance.name
            shutil.copyfile(acceptance, rollback_acceptance); rollback_acceptance.chmod(0o600)
            rollback_finalization = frontend_rollback_root / finalization.name
            shutil.copyfile(finalization, rollback_finalization); rollback_finalization.chmod(0o600)
            rollback_final_window = frontend_rollback_root / final_window.name
            shutil.copyfile(final_window, rollback_final_window); rollback_final_window.chmod(0o600)
            frontend_rollback["activationEvidence"]["frontend"]["activationIntent"] = {
                "path": str(rollback_activation), "sha256": sha(rollback_activation)}
            frontend_rollback["activationEvidence"]["frontend"]["executor"] = {
                "path": str(rollback_executor), "sha256": sha(rollback_executor)}
            frontend_rollback["activationEvidence"]["frontend"]["selectionIntent"] = {
                "path": str(rollback_selection), "sha256": sha(rollback_selection)}
            frontend_rollback["activationEvidence"]["frontend"]["awaitingAcceptanceState"] = {
                "path": str(rollback_awaiting), "sha256": sha(rollback_awaiting)}
            frontend_rollback["activationEvidence"]["frontend"]["technicalAcceptance"] = {
                "path": str(rollback_acceptance), "sha256": sha(rollback_acceptance)}
            frontend_rollback["activationEvidence"]["frontend"]["finalizationReceipt"] = {
                "path": str(rollback_finalization), "sha256": sha(rollback_finalization)}
            frontend_rollback["activationEvidence"]["frontend"]["finalWindowState"] = {
                "path": str(rollback_final_window), "sha256": sha(rollback_final_window)}
            frontend_rollback_path = fixture.evidence_root / "frontend-rollback-request.json"
            private_json(frontend_rollback_path, frontend_rollback)
            denied = reconcile("frontend-rollback", frontend_rollback_path)
            self.assertEqual(denied.returncode, 2)
            self.assertIn("release_reconciliation_immediate_rollback_close", denied.stderr)

            for component, candidate in (("frontend", active_frontend),
                                         ("api", active_api)):
                protected_manifest = fixture.evidence_root / f"{component}-protected-manifest.json"
                private_json(protected_manifest, {"rollbackReleases": {
                    component: {"releaseId": fixture.release_id}}})
                protected_journal = fixture.evidence_root / f"{component}-protected-journal.json"
                selections = {"api": {"releaseId": active_api},
                              "frontend": {"releaseId": active_frontend}}
                selections[component] = {"releaseId": fixture.release_id}
                private_json(protected_journal, {"components": [component],
                    "binding": {"release": candidate, "components": [component],
                                "runtimeManifestSha256": sha(protected_manifest)},
                    "preflight": {"selections": selections},
                    "previous": {"releases": {
                        "api": fixture.release_id if component == "api" else active_api,
                        "frontend": (fixture.release_id if component == "frontend"
                                     else active_frontend)}}})
                protected = json.loads(request.read_text())
                protected["activationEvidence"][component] = {
                    "runtimeManifest": {"path": str(protected_manifest),
                                        "sha256": sha(protected_manifest)},
                    "transactionJournal": {"path": str(protected_journal),
                                           "sha256": sha(protected_journal)}}
                protected_path = fixture.evidence_root / f"{component}-protected-request.json"
                private_json(protected_path, protected)
                denied = reconcile(f"{component}-protected", protected_path)
                self.assertEqual(denied.returncode, 2)
                self.assertIn("release_reconciliation_immediate_rollback_close", denied.stderr)
        finally:
            fixture.close()

    def test_candidate_release_runtime_never_enters_authorization(self):
        fixture = Fixture(candidate=True, installed=True, deployed=False)
        try:
            self.assertEqual(fixture.prepare().returncode, 0)
            intent = json.loads(fixture.intent.read_text())
            release = next(item for item in intent["artifacts"]
                           if item["class"] == "RELEASE_RUNTIME")
            self.assertEqual(release["retentionState"], "CANDIDATE_PENDING_ACTIVATION")
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

    def test_terminal_rollback_absent_lock_is_created_and_four_of_four_are_retired(self):
        fixture = Fixture()
        try:
            prepared = fixture.prepare(); self.assertEqual(prepared.returncode, 0, prepared.stderr)
            intent = json.loads(fixture.intent.read_text())
            self.assertEqual(len(intent["commands"]), 4)
            authorization = fixture.authorize("post-rollback-once")
            fixture.deploy_lock.unlink()

            result, receipt = fixture.execute(authorization, "post-rollback-receipt")

            self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
            saved = json.loads((receipt / "execution-receipt.private.json").read_text())
            self.assertEqual(saved["attemptedCommands"], 4)
            self.assertEqual(saved["completedCommands"], 4)
            self.assertTrue(fixture.deploy_lock.is_file())
            self.assertEqual(stat.S_IMODE(fixture.deploy_lock.stat().st_mode), 0o600)
            self.assertEqual(fixture.deploy_lock.read_text(), sha(fixture.intent) + "\n")
            probe = os.open(fixture.deploy_lock, os.O_RDWR | os.O_NOFOLLOW)
            try:
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(probe, fcntl.LOCK_UN)
            finally:
                os.close(probe)
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

        # The producer currently places its already removed independent
        # verification extraction below build-output. This historical,
        # non-destructive evidence is accepted without creating staging.
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            staging = next(item for item in contract["artifacts"]
                           if item["class"] == "DERIVED_STAGING")
            staging["path"] = str(fixture.output_root / ".release.verify-removed")
            staging["state"] = "SANITIZED"
            staging["removedAtProducerCompletion"] = True
            private_json(fixture.contract, contract)
            shutil.rmtree(fixture.staging_root)
            passed = fixture.prepare()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertNotIn(staging["path"], fixture.commands.read_text())
        finally:
            fixture.close()

        # Even terminal evidence remains confined to the authenticated staging
        # or output roots; an arbitrary absent path is not trusted.
        fixture = Fixture()
        try:
            contract = json.loads(fixture.contract.read_text())
            staging = next(item for item in contract["artifacts"]
                           if item["class"] == "DERIVED_STAGING")
            staging["path"] = str(fixture.root / "outside-roots.verify-removed")
            staging["state"] = "SANITIZED"
            staging["removedAtProducerCompletion"] = True
            private_json(fixture.contract, contract)
            denied = fixture.prepare()
            self.assertEqual(denied.returncode, 2)
            self.assertIn("artifact_outside_canonical_root:DERIVED_STAGING",
                          denied.stderr)
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
            self.assertTrue(any(fixture.output.glob(f"generation-review.private.json.previous.{legacy_sha}")))
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


    def test_evidence_destination_requires_existing_private_parent(self):
        with tempfile.TemporaryDirectory(prefix="retirement-evidence-parent-") as raw:
            root = Path(raw) / "evidence"
            root.mkdir(mode=0o700)
            operational = {"canonicalRoots": {"evidence": [str(root)]}}
            destination = root / "receipts" / "generation"

            with self.assertRaisesRegex(MODULE.Denied, "evidence_destination_parent_missing"):
                MODULE.evidence_destination(destination, operational)

            destination.parent.mkdir(mode=0o700)
            MODULE.evidence_destination(destination, operational)

            destination.parent.chmod(0o750)
            MODULE.evidence_destination(destination, operational)

            destination.parent.chmod(0o770)
            with self.assertRaisesRegex(MODULE.Denied, "evidence_destination_parent_identity"):
                MODULE.evidence_destination(destination, operational)



if __name__ == "__main__":
    unittest.main(verbosity=2)
