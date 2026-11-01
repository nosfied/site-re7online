import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "deploy-preparation-admission.py"
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

    def run_request(self, value):
        request = self.private / "request.private.json"
        request.write_text(json.dumps(value))
        request.chmod(0o600)
        sha = hashlib.sha256(request.read_bytes()).hexdigest()
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "--request", str(request),
             "--request-sha256", sha],
            text=True, capture_output=True, check=False,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        return result, json.loads(result.stdout)

    def test_valid_admission_materializes_atomic_private_control_plane(self):
        value = self.request()
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
                     "operational-state.private.json",
                     "admission-report.private.json"):
            self.assertEqual((root / name).stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(self.base.rglob("__pycache__")))

        second, reused = self.run_request(value)
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertEqual(reused["result"], "P00_AGGREGATE_ADMISSION_REUSED")
        self.assertTrue(reused["reusedExactDestination"])

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
        result, report = self.run_request(value)
        self.assertEqual(result.returncode, 0, result.stderr)
        contract_path = Path(report["preparationArtifactContract"]["path"])
        self.assertEqual(hashlib.sha256(contract_path.read_bytes()).hexdigest(),
                         report["preparationArtifactContract"]["sha256"])
        self.assertEqual(json.loads(contract_path.read_text())["preparationArtifacts"],
                         value["preparationArtifacts"])
        dependency = Path(report["preparationRuntimeDependencies"][0]["path"])
        self.assertEqual(dependency.parent, Path(value["finalRoot"]))
        self.assertEqual(hashlib.sha256(dependency.read_bytes()).hexdigest(),
                         report["preparationRuntimeDependencies"][0]["sha256"])

    def test_copied_generation_retirement_reviews_preparation_without_checkout(self):
        value = self.request()
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

    def test_nonidentical_existing_destination_is_never_overwritten(self):
        value = self.request()
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
        value = self.request()
        before = {
            item["sourcePath"]: Path(item["sourcePath"]).read_bytes()
            for item in value["controlPlaneArtifacts"]
        }
        result, _ = self.run_request(value)
        self.assertEqual(result.returncode, 0)
        for path, raw in before.items():
            self.assertEqual(Path(path).read_bytes(), raw)


if __name__ == "__main__":
    unittest.main()
