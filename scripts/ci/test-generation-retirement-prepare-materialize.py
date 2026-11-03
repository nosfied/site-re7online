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
SOURCE_COMMIT = "bab3a1e0f105b1551fb9b7447bebd270e6867a9a"
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
    def __init__(self, single_generation: bool = False):
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
        self.transactions = self.root / "transactions"; self.transactions.mkdir(mode=0o700)
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
        if single_generation:
            self.generations = [self.make_generation(
                "b96", "immutable-synthetic-b96", "c" * 40,
                "rollbackReleases", "SUPERSEDED")]
        else:
            self.generations = [
                self.make_generation("d436", "immutable-synthetic-d436", "a" * 40,
                                     "rollbackReleases", "DEPLOYED"),
                self.make_generation("f160", "immutable-synthetic-f160", "b" * 40,
                                     "transitiveReturnReleases", "DEPLOYED"),
            ]
        self.active_api = "immutable-current-api"
        self.active_frontend = "immutable-current-frontend"
        self.immediate_api = "immutable-immediate-api"
        self.immediate_frontend = "immutable-immediate-frontend"
        self.source_graph = self.evidence / "source-graph.private.json"
        source_graph = {"activeReleases": [self.active_api, self.active_frontend],
            "rollbackReleases": [self.immediate_api, self.immediate_frontend] +
                [item["releaseId"] for item in self.generations
                 if item["expectedRole"] == "rollbackReleases"],
            "transitiveReturnReleases": [item["releaseId"] for item in self.generations
                                           if item["expectedRole"] == "transitiveReturnReleases"],
            "candidateReleases": [],
            "installedVerifiedReleases": sorted([self.active_api, self.active_frontend,
                self.immediate_api, self.immediate_frontend] +
                [item["releaseId"] for item in self.generations]),
            "supersededCandidates": []}
        private_json(self.source_graph, source_graph)
        for item in self.generations:
            self.make_terminal_closure(item)
        self.reconciliation_operational = self.evidence / "reconciliation-operational.private.json"
        private_json(self.reconciliation_operational, {"schemaVersion": 1,
            "currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [], "dependencies": [],
            "observations": {"releaseGraph": binding(self.source_graph)}})
        activation = self.make_activation_evidence()
        self.reconciliation_request = self.evidence / "reconciliation-request.private.json"
        private_json(self.reconciliation_request, {"schemaVersion": 2,
            "reconciliationId": "prepare-materializer-real-producer",
            "releaseRoot": str(self.releases), "sourceGraph": binding(self.source_graph),
            "operationalState": binding(self.reconciliation_operational),
            "activationEvidence": activation,
            "entries": [{"releaseId": item["releaseId"],
                "installedReleasePath": str(item["release"]),
                "expectedRole": item["expectedRole"],
                "decision": "CLOSE_OPERATIONAL_DEPENDENCY",
                "contract": binding(item["contract"]), "lifecycle": binding(item["lifecycle"]),
                "review": binding(item["review"]), "closure": item["closure"]}
                for item in self.generations]})
        reconciled = subprocess.run(["/usr/bin/python3", "-B", str(RETIRE),
            "reconcile-release-graph", "--request", str(self.reconciliation_request),
            "--request-sha256", sha(self.reconciliation_request),
            "--graph-output", str(self.graph), "--projection-output", str(self.projection),
            "--receipt-output", str(self.receipt)], text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if reconciled.returncode != 0:
            raise RuntimeError(reconciled.stdout + reconciled.stderr)
        graph = json.loads(self.graph.read_text())
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
                "dependencies": [],
                "deploymentState": {"state": item["deploymentState"]},
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
            "sourceReconciliation": {"request": binding(self.reconciliation_request),
                                     "successorGraph": binding(self.graph),
                                     "projection": binding(self.projection), "receipt": binding(self.receipt)},
            "generations": [{"name": item["name"], "releaseId": item["releaseId"],
                "targetCommit": item["targetCommit"], "contract": binding(item["contract"]),
                "lifecycle": binding(item["lifecycle"]), "operationalState": binding(item["operational"]),
                "review": binding(item["review"]), "reviewer": "fixture-owner",
                "reason": "materialized prepare fixture"} for item in self.generations]})
        self.entrypoint = self.root / "outside" / TOOL.name; self.entrypoint.parent.mkdir(mode=0o700)
        shutil.copy2(TOOL, self.entrypoint); shutil.copy2(SUPPORT, self.entrypoint.parent / SUPPORT.name)

    def make_terminal_closure(self, item):
        intent = self.evidence / f"{item['name']}-prior-intent.private.json"
        journal = self.evidence / f"{item['name']}-prior-journal.private.jsonl"
        receipt = self.evidence / f"{item['name']}-prior-receipt.private.json"
        journal.write_bytes(b""); journal.chmod(0o600)
        contract = json.loads(item["contract"].read_text())
        private_json(intent, {"generationId": item["releaseId"],
            "releaseId": item["releaseId"], "targetCommit": item["targetCommit"],
            "contractSha256": sha(item["contract"]), "lifecycleSha256": sha(item["lifecycle"]),
            "reconciliation": {"chain": [], "completed": []},
            "artifacts": contract["artifacts"], "commands": []})
        private_json(receipt, {"schemaVersion": 1, "state": "SANITIZED",
            "failurePredicate": None, "attemptedCommands": 0, "completedCommands": 0,
            "removedPaths": [], "intentSha256": sha(intent),
            "commandLogSha256": sha(journal), "automaticRetry": False,
            "remainingDerivedPaths": [], "freshObservation": {},
            "lock": {"canonicalHeldThroughReceiptFsync": True,
                     "writerHeldThroughReceiptFsync": True}})
        private_json(item["review"], {"schemaVersion": 2,
            "generationId": item["releaseId"], "lifecycleSha256": sha(item["lifecycle"]),
            "state": "SANITIZED", "reviewer": "prior-owner",
            "reason": "terminal synthetic closure", "evidenceSha256": sha(receipt)})
        item["closure"] = {"kind": "CANONICAL_RETIREMENT", "chain": [{
            "intent": binding(intent), "receipt": binding(receipt), "journal": binding(journal)}]}

    def make_activation_evidence(self):
        result = {}
        selections = {"api": self.immediate_api, "frontend": self.immediate_frontend}
        active = {"api": self.active_api, "frontend": self.active_frontend}
        for component in ("api", "frontend"):
            manifest = self.evidence / f"{component}-runtime-manifest.private.json"
            private_json(manifest, {"schemaVersion": 1,
                "rollbackReleases": {component: {"releaseId": selections[component]}}})
            journal = self.evidence / f"{component}-transaction.private.json"
            private_json(journal, {"schemaVersion": 1, "state": "DEPLOYED",
                "components": [component], "binding": {"release": active[component],
                    "components": [component], "runtimeManifestSha256": sha(manifest)},
                "preflight": {"selections": {
                    "api": {"releaseId": selections["api"]},
                    "frontend": {"releaseId": selections["frontend"]}}},
                "previous": {"releases": {"api": selections["api"],
                                             "frontend": selections["frontend"]}}})
            result[component] = {"runtimeManifest": binding(manifest),
                                 "transactionJournal": binding(journal)}
        return result

    def make_generation(self, name: str, release_id: str, target: str,
                        expected_role: str, deployment_state: str):
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
                "expectedRole": expected_role, "deploymentState": deployment_state,
                "release": release, "contract": contract, "lifecycle": lifecycle, "review": review}

    def materialize(self):
        return subprocess.run(["/usr/bin/python3", "-B", str(self.entrypoint),
            "--control-root", str(ROOT), "--custody", str(self.custody),
            "--source-commit", SOURCE_COMMIT, "--request", str(self.request),
            "--request-sha256", sha(self.request)], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def consume_projection(self):
        consumer_path = self.custody / "control/capacity-recovery.py"
        spec = importlib.util.spec_from_file_location("materialized_capacity_consumer", consumer_path)
        consumer = importlib.util.module_from_spec(spec); spec.loader.exec_module(consumer)
        projection = consumer._pm2_projection(self.pm2_rows)
        operational = {"schemaVersion": 2, "currentPaths": [], "pm2LivePaths": [],
            "pm2DumpPaths": [], "openTransactionPaths": [], "protectedGraphPaths": [],
            "deploymentLock": str(self.deploy_lock), "writerLock": str(self.writer_lock),
            "liveObservations": {"currentLinks": [],
                "pm2": {"path": str(self.pm2), "sha256": sha(self.pm2),
                    "fingerprintSha256": consumer.digest_bytes(consumer.canonical(projection))},
                "dump": binding(self.dump), "releaseGraph": binding(self.projection),
                "transactionsRoot": {"path": str(self.transactions),
                    "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                    "allowedModes": ["0700"]}}}
        return consumer.capture_live_operational(operational)

    def close(self): self.temp.cleanup()


class GenerationRetirementPrepareMaterializeTest(unittest.TestCase):
    def test_single_reconciled_generation_materializes_and_real_prepare_uses_superseded_state(self):
        fixture = PrepareMaterializationFixture(single_generation=True)
        try:
            item = fixture.generations[0]
            prior_review = item["review"].read_bytes()
            operational = json.loads(item["operational"].read_text())
            self.assertEqual(operational["deploymentState"], {"state": "SUPERSEDED"})

            result = fixture.materialize()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            manifest = json.loads(
                (fixture.custody / "prepare-materialization.private.json").read_text())
            self.assertEqual([plan["releaseId"] for plan in manifest["prepares"]],
                             [item["releaseId"]])
            self.assertEqual(manifest["sourceReconciliation"]["receipt"],
                             binding(fixture.receipt))

            plan = manifest["prepares"][0]
            completed = subprocess.run(plan["argv"], text=True,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            intent = json.loads(Path(plan["intentOutput"]).read_text())
            self.assertEqual(intent["releaseId"], item["releaseId"])
            self.assertEqual(len(intent["commands"]), 1)
            self.assertEqual(intent["commands"][0]["class"], "RELEASE_RUNTIME")
            self.assertEqual(intent["commands"][0]["path"], str(item["release"]))
            self.assertEqual(intent["commands"][0]["literal"],
                             f"/usr/bin/rm -r -- {item['release']}")
            self.assertEqual(Path(plan["priorReview"]["path"]).read_bytes(), prior_review)
        finally:
            fixture.close()

    def test_generation_cardinality_and_exact_set_are_closed(self):
        mutations = {
            "omitted": lambda generations: [],
            "duplicate": lambda generations: generations + [dict(generations[0])],
            "additional": lambda generations: generations + [{
                **generations[0], "name": "extra", "releaseId": "immutable-extra"}],
        }
        expected = {
            "omitted": "PREPARE_GENERATIONS",
            "duplicate": "PREPARE_GENERATION_IDENTITY",
            "additional": "PREPARE_RECONCILIATION_GENERATIONS",
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                fixture = PrepareMaterializationFixture(single_generation=True)
                try:
                    request = json.loads(fixture.request.read_text())
                    request["generations"] = mutate(request["generations"])
                    private_json(fixture.request, request)
                    result = fixture.materialize()
                    self.assertEqual(result.returncode, 2)
                    self.assertIn(expected[label], result.stdout)
                    self.assertFalse(fixture.custody.exists())
                finally:
                    fixture.close()

    def test_outside_checkout_materialization_and_real_prepare_for_both_generations(self):
        fixture = PrepareMaterializationFixture()
        try:
            prior = {item["name"]: item["review"].read_bytes() for item in fixture.generations}
            result = fixture.materialize()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            manifest = json.loads((fixture.custody / "prepare-materialization.private.json").read_text())
            self.assertEqual(len(manifest["prepares"]), 2)
            captured, _ = fixture.consume_projection()
            self.assertEqual(captured["protectedGraphPaths"],
                             json.loads(fixture.projection.read_text())["protectedGraphPaths"])
            self.assertEqual(manifest["request"], binding(fixture.request))
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

    def test_prepare_operational_graph_must_equal_successor(self):
        fixture = PrepareMaterializationFixture()
        try:
            item = fixture.generations[0]
            operational = json.loads(item["operational"].read_text())
            operational["rollbackReleases"].append(item["releaseId"])
            private_json(item["operational"], operational)
            request = json.loads(fixture.request.read_text())
            request["generations"][0]["operationalState"] = binding(item["operational"])
            private_json(fixture.request, request)
            result = fixture.materialize()
            self.assertEqual(result.returncode, 2)
            self.assertIn("PREPARE_RECONCILIATION_GENERATION_DIVERGENCE", result.stdout)
            self.assertFalse(fixture.custody.exists())
        finally:
            fixture.close()

    def test_unreconciled_generation_denies(self):
        fixture = PrepareMaterializationFixture()
        try:
            receipt = json.loads(fixture.receipt.read_text())
            receipt["results"] = receipt["results"][:1]
            receipt_variant = fixture.evidence / "receipt-missing-generation.private.json"
            private_json(receipt_variant, receipt)
            projection = json.loads(fixture.projection.read_text())
            projection["reconciliationReceipt"] = binding(receipt_variant)
            projection_variant = fixture.evidence / "projection-missing-generation.private.json"
            private_json(projection_variant, projection)
            request = json.loads(fixture.request.read_text())
            request["sourceReconciliation"]["receipt"] = binding(receipt_variant)
            request["sourceReconciliation"]["projection"] = binding(projection_variant)
            for generation in fixture.generations:
                operational = json.loads(generation["operational"].read_text())
                operational["observations"]["releaseGraph"] = binding(fixture.graph)
                private_json(generation["operational"], operational)
            for index, generation in enumerate(fixture.generations):
                request["generations"][index]["operationalState"] = binding(
                    generation["operational"])
            private_json(fixture.request, request)
            result = fixture.materialize()
            self.assertEqual(result.returncode, 2)
            self.assertIn("PREPARE_RECONCILIATION_GENERATIONS", result.stdout)
            self.assertFalse(fixture.custody.exists())
        finally:
            fixture.close()

    def test_operational_photograph_drift_denies_before_custody(self):
        fixture = PrepareMaterializationFixture()
        try:
            fixture.generations[1]["operational"].write_bytes(
                fixture.generations[1]["operational"].read_bytes() + b"\n")
            result = fixture.materialize()
            self.assertEqual(result.returncode, 2)
            self.assertIn("REQUEST_BINDING_SHA256_DIVERGENCE", result.stdout)
            self.assertFalse(fixture.custody.exists())
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main()
