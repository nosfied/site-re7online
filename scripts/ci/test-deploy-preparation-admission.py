import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "deploy-preparation-admission.py"
SPEC = importlib.util.spec_from_file_location("deploy_preparation_admission", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
AUTHORITY_SCRIPT = Path(__file__).resolve().parents[1] / "read-state-cutover-authority.py"
AUTHORITY_SPEC = importlib.util.spec_from_file_location("read_state_cutover_authority_admission_test", AUTHORITY_SCRIPT)
AUTHORITY = importlib.util.module_from_spec(AUTHORITY_SPEC)
AUTHORITY_SPEC.loader.exec_module(AUTHORITY)
GATE_SCRIPT = Path(__file__).resolve().parents[1] / "durable-runtime-persistence-gate.py"
GATE_SPEC = importlib.util.spec_from_file_location("durable_gate_admission_test", GATE_SCRIPT)
GATE = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(GATE)
H = "a" * 64
REQUIRED_CHECKS = {
    "contract", "lifecycle", "review-output", "intent-output", "commands-output",
    "transaction-root", "receipt-root", "deployment-lock", "writer-lock",
    "worktree-root", "output-root", "releases-root", "evidence-root",
    "pm2-dump", "release-graph",
}
REQUIRED_ASSERTIONS = {
    "target-qualified", "ci-qualified", "impact-classified", "migration-reviewed",
    "generation-gate", "release-graph-authenticated", "pm2-live-authenticated",
    "pm2-dump-authenticated", "health-local", "health-public",
    "capacity-budget", "inode-budget", "ancestors-authenticated",
    "installation-route-qualified", "no-partial-output",
}


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.base.chmod(0o700)
        self.sources = self.base / "sources"
        self.sources.mkdir(mode=0o700)
        self.private = self.base / "private"
        self.private.mkdir(mode=0o700)
        self.target = "1" * 40
        self.release = "immutable-11111111-vps-20261029T220000Z"
        self.generation = f"{self.release}-producer"
        self.controls = []
        for role, name in (
            ("generation-retirement", "generation-retirement.py"),
            ("converta-release", "converta-release.py"),
            ("root-policy", "deploy-artifact-roots.json"),
        ):
            path = self.sources / name
            path.write_text(f"{role}\n")
            path.chmod(0o644)
            self.controls.append({
                "role": role,
                "sourcePath": str(path),
                "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
        self.template = self.private / "operational-template.private.json"
        self.template.write_text(json.dumps({
            "schemaVersion": 2,
            "generationId": self.generation,
            "releaseId": self.release,
            "targetCommit": self.target,
            "controlPlaneArtifacts": [
                {"path": "/not/consumable", "sha256": H, "copied": False},
            ],
        }))
        self.template.chmod(0o600)
        self.assertion_evidence = {}
        for name in REQUIRED_ASSERTIONS:
            path = self.private / f"assertion-{name}.json"
            path.write_text(json.dumps({"assertion": name, "passed": True}))
            path.chmod(0o600)
            self.assertion_evidence[name] = path
        self.paths = {}
        for name in REQUIRED_CHECKS:
            path = self.private / name
            self.paths[name] = path
            if name in {"review-output", "intent-output", "commands-output",
                        "transaction-root", "receipt-root"}:
                continue
            if name in {"deployment-lock", "writer-lock"}:
                continue
            if name in {"worktree-root", "output-root", "releases-root", "evidence-root"}:
                path.mkdir(mode=0o700)
            else:
                path.write_text(name)
                path.chmod(0o600)
        self.staging = self.base / "staging"
        self.staging.mkdir(mode=0o700)
        self._write_operational_authorities()

    def _write_operational_authorities(self):
        roots = {
            "repository": str(self.sources),
            "worktrees": str(self.paths["worktree-root"]),
            "outputs": str(self.paths["output-root"]),
            "releases": str(self.paths["releases-root"]),
            "staging": str(self.staging),
            "evidence": [str(self.paths["evidence-root"])],
        }
        root_policy = next(
            Path(item["sourcePath"]) for item in self.controls if item["role"] == "root-policy"
        )
        policy = {"schemaVersion": 1, "canonicalRoots": {
            key: ([{"path": path, "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                    "allowedModes": ["0700"]} for path in value]
                  if key == "evidence" else
                  {"path": value, "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                   "allowedModes": ["0700"]})
            for key, value in roots.items()
        }}
        root_policy.write_text(json.dumps(policy, sort_keys=True, separators=(",", ":")) + "\n")
        root_policy.chmod(0o644)
        for item in self.controls:
            if item["role"] == "root-policy":
                item["sourceSha256"] = hashlib.sha256(root_policy.read_bytes()).hexdigest()
        operational = {
            "schemaVersion": 2,
            "generationId": self.generation,
            "releaseId": self.release,
            "targetCommit": self.target,
            "gitRepository": str(self.sources),
            "currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [],
            "activeReleases": [], "rollbackReleases": [],
            "transitiveReturnReleases": [], "candidateReleases": [self.release],
            "installedVerifiedReleases": [self.release], "supersededCandidates": [],
            "controlPlaneArtifacts": [
                {"path": "/not/consumable", "sha256": H, "copied": False},
            ],
            "dependencies": [], "deploymentState": {"state": "DEPLOYED"},
            "canonicalRoots": roots,
            "observations": {
                "currentLinks": [],
                "pm2": {"path": str(self.paths["pm2-dump"]), "sha256": H,
                        "fingerprintSha256": H},
                "dump": {"path": str(self.paths["pm2-dump"]), "sha256": H},
                "releaseGraph": {"path": str(self.paths["release-graph"]), "sha256": H},
            },
        }
        self.template.write_text(json.dumps(operational))
        self.template.chmod(0o600)

    def tearDown(self):
        self.temp.cleanup()

    def request(self):
        checks = []
        for name in sorted(REQUIRED_CHECKS):
            path = self.paths[name]
            if name in {"review-output", "intent-output", "commands-output",
                        "transaction-root", "receipt-root"}:
                checks.append({"name": name, "expectation": "absent", "path": str(path)})
            elif name in {"deployment-lock", "writer-lock"}:
                checks.append({"name": name, "expectation": "lock_free", "path": str(path),
                               "allowAbsent": True})
            elif name in {"worktree-root", "output-root", "releases-root", "evidence-root"}:
                checks.append({"name": name, "expectation": "directory", "path": str(path),
                               "allowedModes": [0o700], "ownerUid": os.geteuid(),
                               "groupGid": os.getegid()})
            else:
                checks.append({"name": name, "expectation": "regular", "path": str(path),
                               "allowedModes": [0o600], "ownerUid": os.geteuid(),
                               "groupGid": os.getegid(),
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        return {
            "schemaVersion": 1,
            "generationId": self.generation,
            "releaseId": self.release,
            "targetCommit": self.target,
            "finalRoot": str(self.private / "admitted-v1"),
            "operationalStateTemplate": {
                "path": str(self.template),
                "sha256": hashlib.sha256(self.template.read_bytes()).hexdigest(),
            },
            "operationalStateOutputName": "operational-state.private.json",
            "controlPlaneArtifacts": self.controls,
            "checks": checks,
            "assertions": [
                {
                    "name": name,
                    "passed": True,
                    "evidencePath": str(self.assertion_evidence[name]),
                    "evidenceSha256": hashlib.sha256(
                        self.assertion_evidence[name].read_bytes()
                    ).hexdigest(),
                }
                for name in sorted(REQUIRED_ASSERTIONS)
            ],
        }

    def producer_artifacts(self):
        root = SCRIPT.resolve().parents[1]
        roles = {
            "preparation-producer": "scripts/operational_preparers_v3.py",
            "preparation-review": "scripts/operational_preparation_review.py",
            "preparation-inventory": "scripts/operational-retention-report.py",
            "preparation-lifecycle": "scripts/preparation_artifact_lifecycle.py",
            "capacity-dependency": "docs/reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/capacity_budget.py",
            "capture-dependency": "docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/saved_reference_capture.py",
            "reference-dependency": "docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/third-withdrawal/references.py",
        }
        result = []
        for role, relative in roles.items():
            source = root / relative
            private = self.sources / 'producer-root' / relative
            private.parent.mkdir(parents=True, exist_ok=True)
            private.write_bytes(source.read_bytes()); private.chmod(0o600)
            result.append({"role": role, "sourcePath": str(private),
                           "sourceSha256": hashlib.sha256(private.read_bytes()).hexdigest()})
        return result

    def v3_request(self, components=("api", "frontend")):
        value = self.request()
        value.update({
            "schemaVersion": 3,
            "components": list(components),
            "finalRoot": str(self.private / ("admitted-v3-" + "-".join(components))),
            "preparationReservationRoot": str(self.private),
            "preparationProducerArtifacts": self.producer_artifacts(),
            "preparationArtifacts": [{
                "path": str(self.private / ("future-" + "-".join(components)) / "archive.tar"),
                "scope": ",".join(components) + ":fixture", "owner": "release-owner",
                "budgetBytes": 4096, "budgetInodes": 1,
                "protection": "DERIVED_WITH_AUTHORITY",
                "authority": {"path": str(self.paths["contract"]),
                              "sha256": hashlib.sha256(
                                  self.paths["contract"].read_bytes()).hexdigest()},
                "terminalDisposition": "SANITIZE_AFTER_USE", "equivalenceSha256": "b" * 64,
                "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                              "predictedBytes": 4096, "predictedInodes": 1},
            }],
        })
        if "api" not in components:
            value["durablePersistence"] = None
            return value
        persistent = self.base / ("durable-read-state-" + "-".join(components))
        persistent.mkdir(mode=0o700, exist_ok=True)
        authority = self.private / ("durable-persistence-" + "-".join(components) + ".json")
        authority.write_text(json.dumps({
            "schemaVersion": 2, "kind": "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V2",
            "requiredPhases": ["qualification", "admission", "preflight", "activation",
                               "acceptance", "finalize", "retirement"],
            "surface": "INBOX_READ_STATE_V1",
            "persistentRoot": {"path": str(persistent), "ownerUid": os.geteuid(),
                               "groupGid": os.getegid(), "mode": "0700"},
            "releaseRoots": [{"role": "candidate", "path": str(self.base / "candidate")},
                             {"role": "rollback", "path": str(self.base / "rollback")}],
            "reconciliation": {"required": False, "state": "NOT_REQUIRED", "receipt": None,
                               "receiptSha256": None, "operationId": None, "tenantId": None,
                               "scope": None, "destinationPath": None},
            "unreconciledReleaseDependencies": [],
        }, sort_keys=True, separators=(",", ":")) + "\n")
        authority.chmod(0o600)
        value["durablePersistence"] = {
            "request": str(authority),
            "requestSha256": hashlib.sha256(authority.read_bytes()).hexdigest(),
        }
        return value

    def seal_legacy(self, value):
        errors, controls, template_info, producer = MODULE.validate_request(value)
        self.assertEqual(errors, [])
        self.assertIsNotNone(template_info)
        MODULE.materialize(value, controls, template_info, producer)
        report = Path(value["finalRoot"]) / "admission-report.private.json"
        return hashlib.sha256(report.read_bytes()).hexdigest()

    def bind_identity(self, value, generation, target):
        value["generationId"] = generation
        value["releaseId"] = generation
        value["targetCommit"] = target
        operational = json.loads(self.template.read_text())
        operational.update({"generationId": generation, "releaseId": generation,
                            "targetCommit": target})
        self.write_template(operational)
        value["operationalStateTemplate"]["sha256"] = hashlib.sha256(
            self.template.read_bytes()).hexdigest()

    def run_request(self, value, historical_report_sha256=None):
        request = self.private / "request.private.json"
        request.write_text(json.dumps(value))
        request.chmod(0o600)
        sha = hashlib.sha256(request.read_bytes()).hexdigest()
        command = [sys.executable, "-B", str(SCRIPT), "--request", str(request),
                   "--request-sha256", sha]
        if historical_report_sha256 is not None:
            command.extend(["--historical-admission-report-sha256",
                            historical_report_sha256])
        result = subprocess.run(
            command,
            text=True, capture_output=True, check=False,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        return result, json.loads(result.stdout)

    def external_admission_fixture(self, persistent: Path):
        custody = self.private / "remote-provision"
        custody.mkdir(mode=0o700)
        uid, gid = os.getuid(), os.getgid()
        executor = Path("/usr/bin/install").resolve(strict=True)
        executor_info = executor.lstat()
        physical = lambda path: {"path": str(path), "device": path.lstat().st_dev,
                                 "inode": path.lstat().st_ino,
                                 "ownerUid": path.lstat().st_uid,
                                 "groupGid": path.lstat().st_gid,
                                 "mode": f"0{path.lstat().st_mode & 0o777:03o}"}
        created = [
            {"path": str(persistent.parent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
            {"path": str(persistent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
        ]
        commands = [[str(executor), "-d", "-o", str(uid), "-g", str(gid),
                     "-m", "0700", item["path"]] for item in created]
        plan = {
            "schemaVersion": 1,
            "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_PLAN_V1",
            "operationId": "two-host-provision-1",
            "root": {"path": str(persistent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
            "custodyRoot": physical(custody),
            "ancestors": [physical(self.base)],
            "createdDirectories": created,
            "executor": {"path": str(executor),
                         "sha256": hashlib.sha256(executor.read_bytes()).hexdigest(),
                         "device": executor_info.st_dev, "inode": executor_info.st_ino,
                         "ownerUid": executor_info.st_uid, "groupGid": executor_info.st_gid,
                         "mode": f"0{executor_info.st_mode & 0o777:03o}"},
            "commands": commands, "initialState": "ABSENT", "automaticExecution": False,
            "outputs": {"intentPath": str(custody / "intent.json"),
                        "journalPath": str(custody / "journal.json"),
                        "receiptPath": str(custody / "receipt.json"),
                        "lockPath": str(custody / "provision.lock")},
        }
        def put(path, value):
            path.write_bytes(AUTHORITY.canonical(value)); path.chmod(0o600)
            return hashlib.sha256(path.read_bytes()).hexdigest()
        old_root = AUTHORITY.ROOT
        AUTHORITY.ROOT = str(persistent)
        try:
            plan_path = custody / "plan.json"; plan_sha = put(plan_path, plan)
            prepared = AUTHORITY.prepare_provision(plan_path, plan_sha)
            intent_path = Path(plan["outputs"]["intentPath"])
            intent_sha = prepared["provisionIntentSha256"]
            owner_path = custody / "owner.json"
            owner_sha = put(owner_path, {
                "schemaVersion": 1,
                "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_AUTHORIZE_ONCE_V1",
                "decision": "AUTHORIZE_ONCE", "operationId": plan["operationId"],
                "planSha256": plan_sha, "provisionIntentSha256": intent_sha,
                "approvedRoot": str(persistent), "approvedCommands": commands,
                "owner": "fixture-owner",
            })
            provisioned = AUTHORITY.provision(intent_path, intent_sha, owner_path, owner_sha)
            authority_path = custody / "external-admission.json"
            materialization_request = custody / "external-admission-request.json"
            request_sha = put(materialization_request, {
                "schemaVersion": 1,
                "kind": "CONVERTA_DURABLE_READ_STATE_EXTERNAL_ADMISSION_AUTHORITY_REQUEST_V1",
                "operationId": plan["operationId"],
                "provisionIntent": {"path": str(intent_path), "sha256": intent_sha},
                "ownerAuthorization": {"path": str(owner_path), "sha256": owner_sha},
                "provisionReceipt": {"path": plan["outputs"]["receiptPath"],
                                     "sha256": provisioned["provisionReceiptSha256"]},
                "outputPath": str(authority_path),
            })
            result = AUTHORITY.materialize_external_admission_authority(
                materialization_request, request_sha)
        finally:
            AUTHORITY.ROOT = old_root
        imported = self.private / "builder-import" / authority_path.name
        imported.parent.mkdir(mode=0o700)
        imported.write_bytes(authority_path.read_bytes()); imported.chmod(0o600)
        self.assertEqual(hashlib.sha256(imported.read_bytes()).hexdigest(),
                         result["externalAdmissionAuthoritySha256"])
        return imported, result, plan, request_sha

    def write_template(self, value):
        self.template.write_text(json.dumps(value))
        self.template.chmod(0o600)

    def test_valid_admission_materializes_atomic_private_control_plane(self):
        value = self.v3_request(("frontend",))
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report["result"], "P00_AGGREGATE_ADMISSION_PASS")
        root = Path(value["finalRoot"])
        self.assertTrue(root.is_dir())
        self.assertEqual(root.stat().st_mode & 0o777, 0o700)
        operational = json.loads((root / "operational-state.private.json").read_text())
        self.assertEqual(
            [item["copied"] for item in operational["controlPlaneArtifacts"]],
            [True, True, True],
        )
        self.assertEqual(
            [Path(item["path"]).name for item in operational["controlPlaneArtifacts"]],
            ["generation-retirement.py", "converta-release.py", "deploy-artifact-roots.json"],
        )
        for name in ("generation-retirement.py", "converta-release.py",
                     "deploy-artifact-roots.json", "preparation_artifact_lifecycle.py",
                     "operational_state_contract.py",
                     "operational-state.private.json",
                     "admission-report.private.json"):
            self.assertEqual((root / name).stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(self.base.rglob("__pycache__")))

        second, reused = self.run_request(value)
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertEqual(reused["result"], "P00_AGGREGATE_ADMISSION_REUSED")
        self.assertTrue(reused["reusedExactDestination"])

    def test_new_generation_cannot_select_legacy_schema_before_mutation(self):
        for schema in (1, 2):
            with self.subTest(schema=schema):
                value = self.request()
                value["finalRoot"] = str(self.private / f"legacy-bypass-v{schema}")
                if schema == 2:
                    value.update({
                        "schemaVersion": 2,
                        "preparationReservationRoot": str(self.private),
                        "preparationProducerArtifacts": self.producer_artifacts(),
                        "preparationArtifacts": [],
                    })
                result, report = self.run_request(value)
                self.assertEqual(result.returncode, 2)
                self.assertIn("request:legacy_schema_new_generation", report["errors"])
                self.assertFalse(Path(value["finalRoot"]).exists())

    def test_historical_authority_cannot_be_rebound_to_new_generation(self):
        original = self.request()
        self.bind_identity(
            original, "immutable-41d70b53-external-20261118T214122Z",
            "41d70b5368bc413ea34ee517b79351d7b8cd526b")
        historical_report_sha256 = self.seal_legacy(original)
        changed = dict(original)
        changed["generationId"] = "immutable-new-api-generation"
        changed["releaseId"] = "immutable-new-api-generation"
        result, report = self.run_request(changed, historical_report_sha256)
        self.assertEqual(result.returncode, 2)
        self.assertIn("request:legacy_authority_identity", report["errors"])

    def test_v2_materializes_closed_preparation_artifact_contract(self):
        value = self.request()
        value["schemaVersion"] = 2
        value["finalRoot"] = str(self.private / "admitted-v2")
        value["preparationReservationRoot"] = str(self.private)
        value["preparationProducerArtifacts"] = self.producer_artifacts()
        value["preparationArtifacts"] = [{
            "path": str(self.private / "future/archive.tar"),
            "scope": "api:fixture", "owner": "release-owner",
            "budgetBytes": 4096, "budgetInodes": 1,
            "protection": "DERIVED_WITH_AUTHORITY",
            "authority": {"path": str(self.paths["contract"]),
                          "sha256": hashlib.sha256(self.paths["contract"].read_bytes()).hexdigest()},
            "terminalDisposition": "SANITIZE_AFTER_USE",
            "equivalenceSha256": "b" * 64,
            "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                          "predictedBytes": 4096, "predictedInodes": 1},
        }]
        self.bind_identity(
            value, "immutable-cb3721d4-external-20261120T220635Z",
            "cb3721d4db5c1c870c5c5fbdbab063a6e1c654b9")
        historical_report_sha256 = self.seal_legacy(value)
        result, report = self.run_request(value, historical_report_sha256)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report["result"], "P00_AGGREGATE_ADMISSION_REUSED")
        contract_path = Path(report["preparationArtifactContract"]["path"])
        self.assertEqual(hashlib.sha256(contract_path.read_bytes()).hexdigest(),
                         report["preparationArtifactContract"]["sha256"])
        self.assertEqual(json.loads(contract_path.read_text())["preparationArtifacts"],
                         value["preparationArtifacts"])
        self.assertEqual(len(report["preparationRuntimeDependencies"]), 2)
        for binding in report["preparationRuntimeDependencies"]:
            dependency = Path(binding["path"])
            self.assertEqual(dependency.parent, Path(value["finalRoot"]))
            self.assertEqual(hashlib.sha256(dependency.read_bytes()).hexdigest(),
                             binding["sha256"])

    def test_v3_invokes_qualification_and_admission_and_copies_enforcement(self):
        value = self.request()
        value["schemaVersion"] = 3
        value["components"] = ["api", "frontend"]
        value["finalRoot"] = str(self.private / "admitted-v3")
        value["preparationReservationRoot"] = str(self.private)
        value["preparationProducerArtifacts"] = self.producer_artifacts()
        value["preparationArtifacts"] = [{
            "path": str(self.private / "future-v3/archive.tar"), "scope": "api:fixture",
            "owner": "release-owner", "budgetBytes": 4096, "budgetInodes": 1,
            "protection": "DERIVED_WITH_AUTHORITY",
            "authority": {"path": str(self.paths["contract"]),
                          "sha256": hashlib.sha256(self.paths["contract"].read_bytes()).hexdigest()},
            "terminalDisposition": "SANITIZE_AFTER_USE", "equivalenceSha256": "b" * 64,
            "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                          "predictedBytes": 4096, "predictedInodes": 1},
        }]
        persistent = self.base / "durable-read-state"; persistent.mkdir(mode=0o700)
        authority = self.private / "durable-persistence.private.json"
        authority_value = {
            "schemaVersion": 2, "kind": "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V2",
            "requiredPhases": ["qualification", "admission", "preflight", "activation",
                               "acceptance", "finalize", "retirement"],
            "surface": "INBOX_READ_STATE_V1",
            "persistentRoot": {"path": str(persistent), "ownerUid": os.geteuid(),
                               "groupGid": os.getegid(), "mode": "0700"},
            "releaseRoots": [{"role": "candidate", "path": str(self.base / "candidate")},
                             {"role": "rollback", "path": str(self.base / "rollback")}],
            "reconciliation": {"required": False, "state": "NOT_REQUIRED", "receipt": None,
                               "receiptSha256": None, "operationId": None, "tenantId": None,
                               "scope": None, "destinationPath": None},
            "unreconciledReleaseDependencies": [],
        }
        authority.write_text(json.dumps(authority_value, sort_keys=True, separators=(",", ":")) + "\n")
        authority.chmod(0o600)
        value["durablePersistence"] = {"request": str(authority),
                                         "requestSha256": hashlib.sha256(authority.read_bytes()).hexdigest()}
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report["durablePersistenceEnforcement"], "CANONICALLY_ENFORCED")
        for name in ("durable-runtime-persistence-gate.py", "durable_persistence_enforcement.py"):
            self.assertTrue((Path(value["finalRoot"]) / name).is_file())

    def test_v3_external_builder_admission_uses_authenticated_remote_authority_only(self):
        value = self.v3_request(("api", "frontend"))
        old_request = Path(value["durablePersistence"]["request"])
        old_request.unlink()
        persistent = self.base / "remote-runtime-data/inbox-read-state"
        authority_path, result, plan, authority_request_sha = self.external_admission_fixture(persistent)
        remote_identity = json.loads(authority_path.read_text())["persistentRoot"]
        persistent.rmdir()
        persistent.parent.rmdir()
        gate_request = self.private / "durable-persistence-external.private.json"
        gate_value = {
            "schemaVersion": 4, "kind": GATE.KIND_V4,
            "requiredPhases": list(GATE.PHASES), "surface": "INBOX_READ_STATE_V1",
            "persistentRoot": plan["root"],
            "releaseRoots": [{"role": "candidate", "path": str(self.base / "candidate")},
                             {"role": "rollback", "path": str(self.base / "rollback")}],
            "reconciliation": {"required": False, "state": "NOT_REQUIRED", "receipt": None,
                               "receiptSha256": None, "operationId": None, "tenantId": None,
                               "scope": None, "destinationPath": None},
            "unreconciledReleaseDependencies": [],
            "externalAdmissionAuthority": {
                "path": str(authority_path),
                "sha256": hashlib.sha256(authority_path.read_bytes()).hexdigest(),
                "operationId": plan["operationId"],
                "provisionReceiptSha256": result["provisionReceiptSha256"],
                "ownerAuthorizationSha256": json.loads(authority_path.read_text())[
                    "provisioningAuthority"]["ownerAuthorizationSha256"],
                "materializationRequestSha256": authority_request_sha,
                "materializerSha256": result["materializerSha256"],
            },
        }
        gate_request.write_bytes(GATE.canonical(gate_value)); gate_request.chmod(0o600)
        value["durablePersistence"] = {
            "request": str(gate_request),
            "requestSha256": hashlib.sha256(gate_request.read_bytes()).hexdigest(),
        }
        result_process, report = self.run_request(value)
        self.assertEqual(result_process.returncode, 0,
                         result_process.stdout + result_process.stderr)
        self.assertEqual(report["durablePersistenceEnforcement"], "CANONICALLY_ENFORCED")
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_absent"):
            GATE.validate(gate_value, "preflight")
        copied_receipt = json.loads(json.dumps(gate_value))
        receipt_path = Path(plan["outputs"]["receiptPath"])
        copied_receipt["externalAdmissionAuthority"]["path"] = str(receipt_path)
        copied_receipt["externalAdmissionAuthority"]["sha256"] = hashlib.sha256(
            receipt_path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(GATE.Denied,
                                    "external_admission_authority_semantics"):
            GATE.validate(copied_receipt, "admission")
        tampered = json.loads(authority_path.read_text())
        tampered["persistentRoot"]["inode"] += 1
        authority_path.write_bytes(GATE.canonical(tampered)); authority_path.chmod(0o600)
        gate_value["externalAdmissionAuthority"]["sha256"] = hashlib.sha256(
            authority_path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(GATE.Denied, "external_admission_authority_created_directories"):
            GATE.validate(gate_value, "admission")
        self.assertEqual(remote_identity["path"], str(persistent))

    def test_v3_external_builder_admission_preserves_first_cutover_pending_contract(self):
        value = self.v3_request(("api", "frontend"))
        Path(value["durablePersistence"]["request"]).unlink()
        persistent = self.base / "remote-cutover-runtime-data/inbox-read-state"
        authority_path, result, plan, authority_request_sha = self.external_admission_fixture(persistent)
        external = json.loads(authority_path.read_text())
        persistent.rmdir(); persistent.parent.rmdir()
        cutover_authorization = self.private / "cutover-authorization.json"
        manifest_path = self.private / "cutover-manifest.json"
        receipt_path = self.private / "cutover-aggregate.json"
        seal_path = self.private / "cutover-seal.json"
        cutover_authorization.write_bytes(GATE.canonical({
            "schemaVersion": 3,
            "kind": "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V3",
            "operationId": "ab-first-cutover",
            "administrativeAuthority": {"path": str(self.private / "owner.json"),
                                        "sha256": "8" * 64},
            "custodyRoot": {}, "persistentRoot": external["persistentRoot"],
            "authorizedSourceReleases": ["immutable-cb"],
            "entries": [{"sources": [{"releaseId": "immutable-cb",
                                        "path": "/legacy/shared.json",
                                        "root": {"path": "/legacy", "mode": "0755"},
                                        "admission": "LEGACY_RELEASE_LOCAL_COPY_V1",
                                        "privateCopyPath": "/custody/legacy/shared.json"}]}],
            "inventoryPath": str(self.private / "inventory.json"),
            "manifestPath": str(manifest_path),
            "aggregateReceiptPath": str(receipt_path),
            "sealReceiptPath": str(seal_path),
        })); cutover_authorization.chmod(0o600)
        authorization_sha = hashlib.sha256(cutover_authorization.read_bytes()).hexdigest()
        gate_value = {
            "schemaVersion": 4, "kind": GATE.KIND_V4,
            "requiredPhases": list(GATE.PHASES), "surface": "INBOX_READ_STATE_V1",
            "persistentRoot": plan["root"],
            "releaseRoots": [{"role": "candidate", "path": str(self.base / "candidate-ab")},
                             {"role": "rollback", "path": str(self.base / "rollback-compatible")}],
            "reconciliation": {"required": True, "state": "PENDING",
                               "receipt": str(receipt_path), "operationId": "ab-first-cutover",
                               "manifest": str(manifest_path),
                               "authorization": str(cutover_authorization),
                               "authorizationSha256": authorization_sha,
                               "sealReceipt": str(seal_path), "destinationCount": 1},
            "unreconciledReleaseDependencies": [],
            "externalAdmissionAuthority": {
                "path": str(authority_path),
                "sha256": result["externalAdmissionAuthoritySha256"],
                "operationId": plan["operationId"],
                "provisionReceiptSha256": result["provisionReceiptSha256"],
                "ownerAuthorizationSha256": external["provisioningAuthority"][
                    "ownerAuthorizationSha256"],
                "materializationRequestSha256": authority_request_sha,
                "materializerSha256": result["materializerSha256"],
            },
            "cutover": {"mode": "FIRST_RELEASE_LOCAL_TO_DURABLE_V1",
                        "runner": {"path": str(self.base / "runner.js"), "sha256": "5" * 64},
                        "candidateStorage": {"path": str(self.base / "storage.js"),
                                             "sha256": "6" * 64},
                        "pm2": {"candidate": {}, "rollback": {}},
                        "rollbackCompatibility": {"path": str(self.base / "rollback.json"),
                                                  "sha256": "7" * 64}},
        }
        gate_request = self.private / "durable-persistence-cutover-external.private.json"
        gate_request.write_bytes(GATE.canonical(gate_value)); gate_request.chmod(0o600)
        value["finalRoot"] = str(self.private / "admitted-v4-cutover")
        value["durablePersistence"] = {
            "request": str(gate_request),
            "requestSha256": hashlib.sha256(gate_request.read_bytes()).hexdigest(),
        }
        process, report = self.run_request(value)
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
        self.assertEqual(report["durablePersistenceEnforcement"], "CANONICALLY_ENFORCED")
        self.assertEqual(GATE.validate(gate_value, "admission")["reconciliation"], "PENDING")
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_absent"):
            GATE.validate(gate_value, "preflight")
        persistent.mkdir(parents=True, mode=0o700); persistent.parent.chmod(0o700)
        with self.assertRaisesRegex(GATE.Denied,
                                    "persistent_root_remote_authority_divergence"):
            GATE.validate(gate_value, "preflight")
        without_external = dict(gate_value); without_external.pop("externalAdmissionAuthority")
        with self.assertRaisesRegex(GATE.Denied, "request_schema"):
            GATE.validate(without_external, "admission")
        historical_v3 = dict(without_external)
        historical_v3.update(schemaVersion=3, kind=GATE.KIND_V3)
        persistent.rmdir(); persistent.parent.rmdir()
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_absent"):
            GATE.validate(historical_v3, "admission")
        divergent_replay = json.loads(json.dumps(gate_value))
        divergent_replay["externalAdmissionAuthority"]["operationId"] = "other-provision"
        with self.assertRaisesRegex(GATE.Denied,
                                    "external_admission_authority_semantics"):
            GATE.validate(divergent_replay, "admission")

    def test_v3_frontend_only_does_not_require_read_state_authority(self):
        value = self.request(); value["schemaVersion"] = 3
        value["components"] = ["frontend"]; value["durablePersistence"] = None
        value["finalRoot"] = str(self.private / "admitted-v3-frontend")
        value["preparationReservationRoot"] = str(self.private)
        value["preparationProducerArtifacts"] = self.producer_artifacts()
        value["preparationArtifacts"] = [{
            "path": str(self.private / "future-frontend/archive.tar"), "scope": "frontend:fixture",
            "owner": "release-owner", "budgetBytes": 4096, "budgetInodes": 1,
            "protection": "DERIVED_WITH_AUTHORITY",
            "authority": {"path": str(self.paths["contract"]),
                          "sha256": hashlib.sha256(self.paths["contract"].read_bytes()).hexdigest()},
            "terminalDisposition": "SANITIZE_AFTER_USE", "equivalenceSha256": "b" * 64,
            "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                          "predictedBytes": 4096, "predictedInodes": 1},
        }]
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("durablePersistenceEnforcement", report)

    def test_copied_generation_retirement_reviews_preparation_without_checkout(self):
        value = self.v3_request(("frontend",))
        value["finalRoot"] = str(self.private / "copied-retirement")
        preparation_artifacts = [{
            "path": str(self.private / "future/absent.tar"), "scope": "api:fixture",
            "owner": "owner", "budgetBytes": 4096, "budgetInodes": 1,
            "protection": "DERIVED_WITH_AUTHORITY",
            "authority": {"path": str(self.paths["contract"]),
                          "sha256": hashlib.sha256(self.paths["contract"].read_bytes()).hexdigest()},
            "terminalDisposition": "SANITIZE_AFTER_USE", "equivalenceSha256": "b" * 64,
            "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                          "predictedBytes": 4096, "predictedInodes": 1}}]
        retirement_source = SCRIPT.parent / "generation-retirement.py"
        private_retirement = next(Path(item["sourcePath"]) for item in value["controlPlaneArtifacts"]
                                  if item["role"] == "generation-retirement")
        private_retirement.write_bytes(retirement_source.read_bytes()); private_retirement.chmod(0o644)
        for item in value["controlPlaneArtifacts"]:
            if item["role"] == "generation-retirement":
                item["sourceSha256"] = hashlib.sha256(private_retirement.read_bytes()).hexdigest()
        admitted, report = self.run_request(value)
        self.assertEqual(admitted.returncode, 0, admitted.stderr)
        root = Path(value["finalRoot"]); copied = root / "generation-retirement.py"
        dependency = root / "preparation_artifact_lifecycle.py"
        structural_dependency = root / "operational_state_contract.py"
        lifecycle = self.private / "synthetic-preparation-lifecycle.private.json"
        lifecycle.write_text(json.dumps({
            "schemaVersion": 1, "generationId": value["generationId"], "state": "OPEN",
            "event": "CREATION_COMPLETED", "reservationRoot": str(self.private),
            "preparationArtifacts": preparation_artifacts,
        }, sort_keys=True, separators=(",", ":")) + "\n"); lifecycle.chmod(0o600)
        evidence = self.private / "synthetic-review-evidence.private.json"
        evidence.write_text("{}\n"); evidence.chmod(0o600)
        environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        command = [sys.executable, "-B", str(copied), "review-preparation",
                   "--preparation-lifecycle", str(lifecycle),
                   "--preparation-lifecycle-sha256", hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
                   "--evidence", str(evidence),
                   "--evidence-sha256", hashlib.sha256(evidence.read_bytes()).hexdigest(),
                   "--state", "SANITIZED", "--reviewer", "fixture-owner",
                   "--reason", "synthetic copied-entrypoint review"]
        reviewed = subprocess.run(command, capture_output=True, text=True, env=environment)
        self.assertEqual(reviewed.returncode, 0, reviewed.stdout + reviewed.stderr)
        self.assertEqual(json.loads(lifecycle.read_text())["state"], "SANITIZED")
        help_result = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                     capture_output=True, text=True, env=environment)
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        for legacy in ("bootstrap-legacy", "prepare", "execute"):
            self.assertIn(legacy, help_result.stdout)
        original = dependency.read_bytes(); dependency.unlink()
        missing = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                 capture_output=True, text=True, env=environment)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("preparation_lifecycle_dependency_missing", missing.stderr)
        dependency.write_bytes(original); dependency.chmod(0o600)
        dependency.write_bytes(original + b"\n# drift\n")
        altered = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                 capture_output=True, text=True, env=environment)
        self.assertNotEqual(altered.returncode, 0)
        self.assertIn("preparation_lifecycle_dependency_drift", altered.stderr)
        dependency.write_bytes(original); dependency.chmod(0o600)
        structural_original = structural_dependency.read_bytes()
        structural_dependency.unlink()
        structural_missing = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                            capture_output=True, text=True, env=environment)
        self.assertNotEqual(structural_missing.returncode, 0)
        self.assertIn("operational_state_contract_dependency_missing", structural_missing.stderr)
        structural_dependency.write_bytes(structural_original); structural_dependency.chmod(0o600)
        structural_dependency.write_bytes(structural_original + b"\n# drift\n")
        structural_drift = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                          capture_output=True, text=True, env=environment)
        self.assertNotEqual(structural_drift.returncode, 0)
        self.assertIn("operational_state_contract_dependency_drift", structural_drift.stderr)

    def test_v2_rejects_open_schema_and_invalid_budget(self):
        value = self.request(); value["schemaVersion"] = 2
        value["preparationReservationRoot"] = str(self.private)
        value["preparationProducerArtifacts"] = []
        value["preparationArtifacts"] = [{"path": "/tmp/x", "extra": True}]
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertTrue(any(item.startswith("preparationArtifacts:") for item in report["errors"]))

    def test_v2_missing_runtime_dependency_denies_without_custody(self):
        value = self.request(); value["schemaVersion"] = 2
        value["finalRoot"] = str(self.private / "missing-dependency")
        value["preparationReservationRoot"] = str(self.private)
        value["preparationProducerArtifacts"] = self.producer_artifacts()[:-1]
        value["preparationArtifacts"] = [{
            "path": str(self.private / "future/archive.tar"), "scope": "api:fixture",
            "owner": "owner", "budgetBytes": 4096, "budgetInodes": 1,
            "protection": "DERIVED_WITH_AUTHORITY",
            "authority": {"path": str(self.paths["contract"]),
                          "sha256": hashlib.sha256(self.paths["contract"].read_bytes()).hexdigest()},
            "terminalDisposition": "SANITIZE_AFTER_USE", "equivalenceSha256": "b" * 64,
            "operation": {"name": "pack", "kind": "tar", "artifactIndex": 0,
                          "predictedBytes": 4096, "predictedInodes": 1}}]
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertTrue(any("reference-dependency:missing" in error for error in report["errors"]))
        self.assertFalse(Path(value["finalRoot"]).exists())

    def test_aggregate_denial_reports_all_known_defects_without_partial_root(self):
        value = self.request()
        source = Path(value["controlPlaneArtifacts"][2]["sourcePath"])
        source.chmod(0o664)
        value["assertions"] = [
            item for item in value["assertions"]
            if item["name"] != "capacity-budget"
        ]
        value["assertions"][0]["passed"] = False
        value["checks"] = [
            item for item in value["checks"]
            if item["name"] != "receipt-root"
        ]
        Path(self.paths["review-output"]).write_text("partial")
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report["result"], "P00_AGGREGATE_ADMISSION_DENY")
        joined = "\n".join(report["errors"])
        self.assertIn("control:root-policy:mode:0664", joined)
        self.assertIn("assertion:capacity-budget:missing", joined)
        self.assertIn("assertion:", joined)
        self.assertIn("check:receipt-root:missing", joined)
        self.assertIn("check:review-output:present", joined)
        self.assertFalse(Path(value["finalRoot"]).exists())
        self.assertFalse(any(self.private.glob(".*.partial.*")))

    def test_hash_drift_and_symlink_are_denied_before_materialization(self):
        value = self.request()
        value["controlPlaneArtifacts"][0]["sourceSha256"] = H
        link = self.private / "linked-dump"
        link.symlink_to(self.paths["pm2-dump"])
        for item in value["checks"]:
            if item["name"] == "pm2-dump":
                item["path"] = str(link)
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertIn("control:generation-retirement:sha256", report["errors"])
        self.assertIn("check:pm2-dump:symlink", report["errors"])
        self.assertFalse(Path(value["finalRoot"]).exists())

    def test_busy_lock_is_aggregated(self):
        value = self.request()
        lock = self.paths["deployment-lock"]
        lock.write_text("locked")
        lock.chmod(0o600)
        for item in value["checks"]:
            if item["name"] == "deployment-lock":
                item["allowAbsent"] = False
        fd = os.open(lock, os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result, report = self.run_request(value)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
        self.assertEqual(result.returncode, 2)
        self.assertIn("check:deployment-lock:lock_busy", report["errors"])
        self.assertFalse(Path(value["finalRoot"]).exists())

    def test_operational_identity_mismatch_denies(self):
        value = self.request()
        operational = json.loads(self.template.read_text())
        operational["targetCommit"] = "2" * 40
        self.template.write_text(json.dumps(operational))
        self.template.chmod(0o600)
        value["operationalStateTemplate"]["sha256"] = hashlib.sha256(
            self.template.read_bytes()
        ).hexdigest()
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertIn("operational_template:identity", report["errors"])
        self.assertFalse(Path(value["finalRoot"]).exists())

    def test_final_projection_denies_structural_drift_before_partial_publication(self):
        original = json.loads(self.template.read_text())
        cases = {
            "schema": lambda value: value.pop("deploymentState"),
            "canonical-roots": lambda value: value["canonicalRoots"].__setitem__(
                "outputs", str(self.base / "wrong-output")),
            "rollback": lambda value: value.update({
                "immediateRollbackReleases": {"api": "missing-return"}}),
            "pm2-fingerprint": lambda value: value["observations"]["pm2"].pop(
                "fingerprintSha256"),
        }
        predicates = {
            "schema": "operational_state_schema",
            "canonical-roots": "canonical_roots_policy_mismatch",
            "rollback": "operational_state_immediate_rollbacks",
            "pm2-fingerprint": "operational_pm2_observation",
        }
        for ordinal, (name, mutate) in enumerate(cases.items(), 1):
            with self.subTest(name=name):
                operational = json.loads(json.dumps(original))
                mutate(operational)
                self.write_template(operational)
                value = self.v3_request(("frontend",))
                value["finalRoot"] = str(self.private / f"structural-deny-{ordinal}")
                value["operationalStateTemplate"]["sha256"] = hashlib.sha256(
                    self.template.read_bytes()).hexdigest()
                result, report = self.run_request(value)
                self.assertEqual(result.returncode, 2)
                self.assertIn(
                    f"materialization:{predicates[name]}", report["errors"])
                self.assertFalse(Path(value["finalRoot"]).exists())
                self.assertFalse(any(self.private.glob(".*.partial.*")))
        self.write_template(original)

    def test_nonidentical_existing_destination_is_never_overwritten(self):
        value = self.v3_request(("frontend",))
        root = Path(value["finalRoot"])
        root.mkdir(mode=0o700)
        marker = root / "owner-data"
        marker.write_text("preserve")
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertTrue(any(
            "existing_destination_inventory" in error
            for error in report["errors"]
        ))
        self.assertEqual(marker.read_text(), "preserve")

    def test_authenticated_assertion_evidence_drift_is_denied(self):
        value = self.request()
        evidence = self.assertion_evidence["health-public"]
        evidence.write_text("drift")
        evidence.chmod(0o600)
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 2)
        self.assertIn(
            "assertion:health-public:evidence:sha256",
            report["errors"],
        )
        self.assertFalse(Path(value["finalRoot"]).exists())

    def test_source_bytes_remain_unchanged(self):
        value = self.v3_request(("frontend",))
        before = {
            item["sourcePath"]: Path(item["sourcePath"]).read_bytes()
            for item in value["controlPlaneArtifacts"]
        }
        result, _ = self.run_request(value)
        self.assertEqual(result.returncode, 0)
        for path, raw in before.items():
            self.assertEqual(Path(path).read_bytes(), raw)

    def test_materialized_projection_reaches_real_retirement_prepare_for_all_profiles(self):
        retirement_tests_path = SCRIPT.parent / "ci/test-generation-retirement.py"
        spec = importlib.util.spec_from_file_location(
            "p00d_generation_retirement_fixtures", retirement_tests_path)
        self.assertIsNotNone(spec); self.assertIsNotNone(spec.loader)
        retirement_tests = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(retirement_tests)

        source_by_role = {
            "generation-retirement": SCRIPT.parent / "generation-retirement.py",
            "converta-release": SCRIPT.parent / "converta-release.py",
        }
        for item in self.controls:
            if item["role"] in source_by_role:
                source = Path(item["sourcePath"])
                source.write_bytes(source_by_role[item["role"]].read_bytes())
                source.chmod(0o644)
                item["sourceSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()

        profiles = {
            "api": None,
            "api-frontend": {"api": "immutable-api-return",
                             "frontend": "immutable-frontend-return"},
            "api-frontend-worker": {"api": "immutable-api-return",
                                    "frontend": "immutable-frontend-return",
                                    "worker": "immutable-worker-return"},
        }
        for ordinal, (profile, immediate) in enumerate(profiles.items(), 1):
            fixture = retirement_tests.Fixture(
                active=False, rollback=False, candidate=True, installed=True,
                deployed=False, release_id=f"immutable-{ordinal:08x}-fixture")
            try:
                operational = json.loads(fixture.operational.read_text())
                graph = json.loads(fixture.graph.read_text())
                if immediate is not None:
                    operational["rollbackReleases"] = list(immediate.values())
                    operational["immediateRollbackReleases"] = immediate
                    graph["rollbackReleases"] = list(immediate.values())
                    graph["immediateRollbackReleases"] = immediate
                retirement_tests.private_json(fixture.graph, graph)
                operational["observations"]["releaseGraph"]["sha256"] = (
                    retirement_tests.sha(fixture.graph))
                self.write_template(operational)

                root_policy = next(
                    Path(item["sourcePath"]) for item in self.controls
                    if item["role"] == "root-policy")
                root_policy.write_bytes(fixture.policy.read_bytes()); root_policy.chmod(0o644)
                for item in self.controls:
                    if item["role"] == "root-policy":
                        item["sourceSha256"] = hashlib.sha256(root_policy.read_bytes()).hexdigest()

                components = tuple(profile.split("-"))
                value = self.v3_request(components)
                value.update({
                    "generationId": fixture.release_id,
                    "releaseId": fixture.release_id,
                    "targetCommit": fixture.target,
                    "finalRoot": str(self.private / f"integrated-{profile}"),
                })
                value["operationalStateTemplate"]["sha256"] = hashlib.sha256(
                    self.template.read_bytes()).hexdigest()
                admitted, report = self.run_request(value)
                self.assertEqual(admitted.returncode, 0, admitted.stdout + admitted.stderr)
                root = Path(value["finalRoot"])
                operational_path = root / "operational-state.private.json"
                copied_retirement = root / "generation-retirement.py"
                command = [
                    sys.executable, "-B", str(copied_retirement), "prepare",
                    "--contract", str(fixture.contract), "--contract-sha256",
                    retirement_tests.sha(fixture.contract),
                    "--lifecycle", str(fixture.lifecycle), "--lifecycle-sha256",
                    retirement_tests.sha(fixture.lifecycle),
                    "--operational-state", str(operational_path), "--operational-state-sha256",
                    hashlib.sha256(operational_path.read_bytes()).hexdigest(),
                    "--root-policy", str(root / "deploy-artifact-roots.json"),
                    "--root-policy-sha256", hashlib.sha256(
                        (root / "deploy-artifact-roots.json").read_bytes()).hexdigest(),
                    "--deployment-lock", str(fixture.deploy_lock),
                    "--intent-output", str(fixture.intent),
                    "--commands-output", str(fixture.commands),
                    "--review-output", str(fixture.review),
                    "--reviewer", "fixture-owner", "--reason", f"p00d {profile}",
                ]
                prepared = subprocess.run(
                    command, capture_output=True, text=True,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
                self.assertEqual(prepared.returncode, 0, prepared.stdout + prepared.stderr)
                self.assertEqual(json.loads(prepared.stdout)["result"],
                                 "GENERATION_RETIREMENT_PREPARED")
                self.assertEqual(report["operationalStateSha256"],
                                 hashlib.sha256(operational_path.read_bytes()).hexdigest())
            finally:
                fixture.close()


if __name__ == "__main__":
    unittest.main()
