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
    "no-partial-output",
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
                     "deploy-artifact-roots.json", "operational-state.private.json",
                     "admission-report.private.json"):
            self.assertEqual((root / name).stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(self.base.rglob("__pycache__")))

        second, reused = self.run_request(value)
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertEqual(reused["result"], "P00_AGGREGATE_ADMISSION_REUSED")
        self.assertTrue(reused["reusedExactDestination"])

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
