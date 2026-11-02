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
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts/generation-retirement-prepare-materialize.py"
SUPPORT = ROOT / "scripts/release-graph-reconciliation-materialize.py"
RETIRE = ROOT / "scripts/generation-retirement.py"
SOURCE_COMMIT = "99c1ef24bd4d6fe7043d60ad378aca0ba59ce03f"
SPEC = importlib.util.spec_from_file_location("retirement", RETIRE)
RETIREMENT = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(RETIREMENT)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def private_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


def binding(path: Path) -> dict[str, str]:
    return {"path": str(path), "sha256": sha(path)}


class PrepareMaterializationFixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="retirement-prepare-materialized-")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"; self.repo.mkdir(mode=0o755)
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.repo, check=True)
        (self.repo / "tracked").write_text("fixture\n")
        subprocess.run(["git", "add", "."], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.repo, check=True)
        self.outputs = self.root / "outputs"; self.outputs.mkdir(mode=0o755)
        self.worktrees = self.root / "worktrees"; self.worktrees.mkdir(mode=0o755)
        self.releases = self.root / "releases"; self.releases.mkdir(mode=0o755)
        self.staging = self.root / "staging"; self.staging.mkdir(mode=0o755)
        self.evidence = self.root / "evidence"; self.evidence.mkdir(mode=0o750)
        self.writer_lock = self.outputs / ".generation-build.lock"; self.writer_lock.write_text(""); self.writer_lock.chmod(0o600)
        self.deploy_lock = self.evidence / ".deployment-window.lock"; self.deploy_lock.write_text(""); self.deploy_lock.chmod(0o600)
        self.control = self.root / "control-source"; self.control.mkdir(mode=0o700)
        (self.control / "copied.py").write_text("# fixture\n"); (self.control / "copied.py").chmod(0o600)
        self.pm2_rows = [{"name": "fixture", "pid": 44, "pm2_env": {"status": "online",
                          "pm_cwd": str(self.root / "unrelated"), "pm_exec_path": str(self.root / "unrelated/index.js"),
                          "exec_mode": "fork_mode", "instances": 1, "args": [], "namespace": "default"}}]
        self.pm2_state = self.root / "pm2-state.json"; self.pm2_state.write_text(json.dumps(self.pm2_rows))
        self.pm2 = self.root / "pm2"
        self.pm2.write_text("#!/usr/bin/env python3\nfrom pathlib import Path\nprint(Path(" + repr(str(self.pm2_state)) + ").read_text())\n")
        self.pm2.chmod(0o700)
        self.dump = self.root / "dump.pm2"; private_json(self.dump, [])
        self.graph = self.evidence / "successor-graph.private.json"
        self.projection = self.evidence / "projection.private.json"
        self.receipt = self.evidence / "receipt.private.json"
        self.generations = [
            self.make_generation("d436", "immutable-synthetic-d436", "a" * 40),
            self.make_generation("f160", "immutable-synthetic-f160", "b" * 40),
        ]
        graph = {"activeReleases": [], "rollbackReleases": [], "transitiveReturnReleases": [],
                 "candidateReleases": [],
                 "installedVerifiedReleases": sorted(item["releaseId"] for item in self.generations),
                 "supersededCandidates": []}
        private_json(self.graph, graph)
        private_json(self.receipt, {"schemaVersion": 2, "state": "RECONCILED_NO_EFFECT",
                                    "originalsModified": False, "destructiveCommands": 0})
        private_json(self.projection, {"schemaVersion": 2, "sourceGraph": binding(self.graph),
                                      "successorGraph": binding(self.graph),
                                      "reconciliationReceipt": binding(self.receipt),
                                      "protectedGraphPaths": [],
                                      "inventoryPaths": [str(item["release"]) for item in self.generations]})
        self.policy = self.root / "policy.private.json"
        def policy_entry(path: Path):
            info = path.lstat()
            return {"path": str(path), "ownerUid": info.st_uid, "groupGid": info.st_gid,
                    "allowedModes": [f"0{stat.S_IMODE(info.st_mode):03o}"]}
        private_json(self.policy, {"schemaVersion": 1, "canonicalRoots": {
            "repository": policy_entry(self.repo), "worktrees": policy_entry(self.worktrees),
            "outputs": policy_entry(self.outputs), "releases": policy_entry(self.releases),
            "staging": policy_entry(self.staging),
            "evidence": [{**policy_entry(self.evidence), "allowedModes": ["0700", "0750"]}]}})
        self.custody = self.evidence / "custody"
        for item in self.generations:
            operational = {"schemaVersion": 2, "generationId": item["releaseId"],
                "releaseId": item["releaseId"], "targetCommit": item["targetCommit"],
                "gitRepository": str(self.repo), "currentPaths": [], "pm2LivePaths": [],
                "pm2DumpPaths": [], **graph,
                "controlPlaneArtifacts": [
                    {"path": str(self.custody / "control" / name), "sha256": sha(ROOT / "scripts" / name), "copied": True}
                    for name in ("generation-retirement.py", "preparation_artifact_lifecycle.py",
                                 "capacity-recovery.py", "converta-release.py")],
                "dependencies": [], "deploymentState": {"state": "DEPLOYED"},
                "canonicalRoots": {"repository": str(self.repo), "worktrees": str(self.worktrees),
                    "outputs": str(self.outputs), "releases": str(self.releases),
                    "staging": str(self.staging), "evidence": [str(self.evidence)]},
                "observations": {"currentLinks": [],
                    "pm2": {"path": str(self.pm2), "sha256": sha(self.pm2),
                            "fingerprintSha256": RETIREMENT._pm2_fingerprint(self.pm2_rows)},
                    "dump": binding(self.dump), "releaseGraph": binding(self.graph)}}
            op = self.evidence / f"operational-{item['name']}.private.json"
            private_json(op, operational); item["operational"] = op
        self.request = self.evidence / "request.private.json"
        private_json(self.request, {"schemaVersion": 1, "deploymentLock": str(self.deploy_lock),
            "rootPolicy": binding(self.policy),
            "sourceReconciliation": {"successorGraph": binding(self.graph),
                                     "projection": binding(self.projection), "receipt": binding(self.receipt)},
            "generations": [{"name": item["name"], "releaseId": item["releaseId"],
                "targetCommit": item["targetCommit"], "contract": binding(item["contract"]),
                "lifecycle": binding(item["lifecycle"]), "operationalState": binding(item["operational"]),
                "review": binding(item["review"]), "reviewer": "fixture-owner",
                "reason": "materialized prepare fixture"} for item in self.generations]})
        self.entrypoint = self.root / "outside" / TOOL.name; self.entrypoint.parent.mkdir(mode=0o700)
        shutil.copy2(TOOL, self.entrypoint); shutil.copy2(SUPPORT, self.entrypoint.parent / SUPPORT.name)

    def make_generation(self, name: str, release_id: str, target: str):
        output = self.outputs / name; output.mkdir(mode=0o755)
        release = self.releases / release_id; release.mkdir(mode=0o755); (release / "app").write_text(name)
        package = output / f"{release_id}.tar.xz"; package.write_bytes(b"package-" + name.encode())
        lifecycle = output / "generation-lifecycle.private.json"
        private_json(lifecycle, {"schemaVersion": 1, "generationId": release_id,
                                 "targetCommit": target, "state": "COMPLETE"})
        def artifact(path: Path, cls: str, state="ACTIVE_DEPENDENCY"):
            info = path.lstat(); metrics = RETIREMENT.structural_metrics(path)
            return {"path": str(path), "releaseId": release_id, "targetCommit": target,
                "expectedType": "directory" if path.is_dir() else "regular_file",
                "initialIdentity": {"device": info.st_dev, "inode": info.st_ino},
                "observedIdentity": {"device": info.st_dev, "inode": info.st_ino},
                **metrics, "digest": {"sha256": sha(path)} if path.is_file() else {"structural": "fixture"},
                "class": cls, "state": state, "retirableOn": "fixture", "dependencies": []}
        contract = output / "generation-artifacts.private.json"
        private_json(contract, {"schemaVersion": 1, "generationId": release_id,
            "releaseId": release_id, "targetCommit": target, "state": "COMPLETE",
            "writerLockPath": str(self.writer_lock),
            "classes": sorted(RETIREMENT.PRESERVE_CLASSES | RETIREMENT.DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
            "artifacts": [artifact(package, "PACKAGE_PRESERVE"), artifact(lifecycle, "EVIDENCE_PRESERVE"),
                          artifact(release, "RELEASE_RUNTIME", "ROLLBACK_DEPENDENCY")],
            "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"})
        review = output / "generation-review.private.json"
        private_json(review, {"schemaVersion": 2, "generationId": release_id,
            "lifecycleSha256": sha(lifecycle), "state": "SANITIZED", "reviewer": "prior-owner",
            "reason": "prior evidence", "evidenceSha256": "0" * 64})
        return {"name": name, "releaseId": release_id, "targetCommit": target,
                "release": release, "contract": contract, "lifecycle": lifecycle, "review": review}

    def materialize(self):
        return subprocess.run(["/usr/bin/python3", "-B", str(self.entrypoint),
            "--control-root", str(ROOT), "--custody", str(self.custody),
            "--source-commit", SOURCE_COMMIT, "--request", str(self.request),
            "--request-sha256", sha(self.request)], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def close(self): self.temp.cleanup()


class GenerationRetirementPrepareMaterializeTest(unittest.TestCase):
    def test_outside_checkout_materialization_and_real_prepare_for_both_generations(self):
        fixture = PrepareMaterializationFixture()
        try:
            prior = {item["name"]: item["review"].read_bytes() for item in fixture.generations}
            result = fixture.materialize()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            manifest = json.loads((fixture.custody / "prepare-materialization.private.json").read_text())
            self.assertEqual(len(manifest["prepares"]), 2)
            for plan in manifest["prepares"]:
                completed = subprocess.run(plan["argv"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
                intent = json.loads(Path(plan["intentOutput"]).read_text())
                self.assertEqual(len(intent["commands"]), 1)
                self.assertEqual(intent["commands"][0]["path"],
                                 next(item["release"] for item in fixture.generations if item["name"] == plan["name"]).__str__())
                self.assertEqual(intent["commands"][0]["literal"],
                                 f"/usr/bin/rm -r -- {intent['commands'][0]['path']}")
                preserved = Path(plan["priorReview"]["path"])
                self.assertEqual(preserved.read_bytes(), prior[plan["name"]])
                self.assertNotEqual(next(item["review"] for item in fixture.generations
                                         if item["name"] == plan["name"]).read_bytes(), prior[plan["name"]])
        finally:
            fixture.close()

    def test_binding_drift_denies_before_custody(self):
        fixture = PrepareMaterializationFixture()
        try:
            fixture.generations[0]["contract"].write_bytes(
                fixture.generations[0]["contract"].read_bytes() + b"\n")
            result = fixture.materialize()
            self.assertEqual(result.returncode, 2)
            self.assertIn("REQUEST_BINDING_SHA256_DIVERGENCE", result.stdout)
            self.assertFalse(fixture.custody.exists())
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main()
