#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SOURCE_COMMIT = subprocess.check_output(
    ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True
).strip()
SOURCE = ROOT / "scripts/release-graph-reconciliation-materialize.py"
SPEC = importlib.util.spec_from_file_location("reconciliation_materializer", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ReconciliationMaterializerTest(unittest.TestCase):
    def synthetic_request(self, custody: Path, result):
        evidence = custody / "synthetic-evidence.json"
        evidence.write_text('{"state":"synthetic"}\n')
        evidence.chmod(0o600)
        binding = MODULE.file_binding(evidence)
        files = {item["relativePath"]: item for item in result["index"]["files"]}
        return {
            "schemaVersion": 2,
            "reconciliationId": "synthetic-local-readback",
            "releaseRoot": str(custody / "releases"),
            "sourceGraph": binding,
            "operationalState": binding,
            "activationEvidence": {
                "api": {"runtimeManifest": binding, "transactionJournal": binding},
                "frontend": {"runtimeManifest": binding, "transactionJournal": binding},
            },
            "entries": [
                {"releaseId": "immutable-d436", "contract": binding,
                 "descriptor": {
                     "path": str(custody / "config/legacy-generation-d436239e-v1-preserve.json"),
                     "sha256": files["config/legacy-generation-d436239e-v1-preserve.json"]["sha256"]}},
                {"releaseId": "immutable-f160", "contract": binding,
                 "descriptor": {
                     "path": str(custody / "config/legacy-generation-f1602787-v1-preserve.json"),
                     "sha256": files["config/legacy-generation-f1602787-v1-preserve.json"]["sha256"]}},
            ],
        }

    def test_materializes_integrated_controls_and_both_descriptors(self):
        with tempfile.TemporaryDirectory() as temporary:
            custody = Path(temporary) / "custody"
            result = MODULE.materialize(ROOT, custody, SOURCE_COMMIT)
            self.assertEqual(len(result["readback"]["files"]), 5)
            releases = {item["releaseId"] for item in result["readback"]["descriptors"]}
            self.assertEqual(releases, {
                "immutable-d436239e-vps-20261026T131821Z",
                "immutable-f1602787-vps-20261026T174702Z",
            })
            for item in result["readback"]["files"]:
                source = ROOT / item["relativePath"]
                self.assertEqual(item["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
            for descriptor in result["readback"]["descriptors"]:
                self.assertTrue(descriptor["allSha256Bindings"])
                self.assertTrue(all(len(value) == 64 for value in
                                    descriptor["allSha256Bindings"].values()))
            # This is the exact copied consumer that a successor custody runs.
            consumer = MODULE.load_copied_consumer(custody)
            for descriptor in result["readback"]["descriptors"]:
                relative = next(
                    item["relativePath"] for item in result["readback"]["files"]
                    if item["sha256"] == descriptor["descriptorSha256"])
                consumer.validate_batch_legacy_descriptor(
                    (custody / relative).read_bytes(), descriptor["descriptorSha256"])
            request = self.synthetic_request(custody, result)
            sealed = MODULE.seal_request(custody / "request.private.json", request)
            self.assertEqual(sealed["sha256"],
                             hashlib.sha256((custody / "request.private.json").read_bytes()).hexdigest())
            self.assertGreaterEqual(len(sealed["bindings"]), 3)

    def test_truncated_hash_denies(self):
        with tempfile.TemporaryDirectory() as temporary:
            custody = Path(temporary) / "custody"
            result = MODULE.materialize(ROOT, custody, SOURCE_COMMIT)
            index = copy.deepcopy(result["index"])
            index["files"][0]["sha256"] = index["files"][0]["sha256"][:12]
            with self.assertRaisesRegex(MODULE.MaterializationDenied,
                                        "CONTROL_BINDING_SHA256_FORMAT"):
                MODULE.readback_index(custody, index)

    def test_divergent_hash_denies(self):
        with tempfile.TemporaryDirectory() as temporary:
            custody = Path(temporary) / "custody"
            result = MODULE.materialize(ROOT, custody, SOURCE_COMMIT)
            index = copy.deepcopy(result["index"])
            index["files"][0]["sha256"] = "0" * 64
            with self.assertRaisesRegex(MODULE.MaterializationDenied,
                                        "CONTROL_BINDING_SHA256_DIVERGENCE"):
                MODULE.readback_index(custody, index)

    def test_request_truncated_and_divergent_hashes_deny(self):
        with tempfile.TemporaryDirectory() as temporary:
            custody = Path(temporary) / "custody"
            result = MODULE.materialize(
                ROOT, custody, SOURCE_COMMIT)
            request = self.synthetic_request(custody, result)
            request["sourceGraph"]["sha256"] = request["sourceGraph"]["sha256"][:16]
            with self.assertRaisesRegex(MODULE.MaterializationDenied,
                                        "REQUEST_BINDING_SHA256_FORMAT"):
                MODULE.request_binding_readback(request)
            request = self.synthetic_request(custody, result)
            request["sourceGraph"]["sha256"] = "0" * 64
            with self.assertRaisesRegex(MODULE.MaterializationDenied,
                                        "REQUEST_BINDING_SHA256_DIVERGENCE"):
                MODULE.request_binding_readback(request)

    def test_request_binding_drift_during_seal_denies(self):
        with tempfile.TemporaryDirectory() as temporary:
            custody = Path(temporary) / "custody"
            result = MODULE.materialize(
                ROOT, custody, SOURCE_COMMIT)
            request = self.synthetic_request(custody, result)
            evidence = custody / "synthetic-evidence.json"
            original_write = MODULE.write_json_exclusive

            def write_then_drift(path, value):
                original_write(path, value)
                evidence.write_text('{"state":"drifted"}\n')

            with mock.patch.object(MODULE, "write_json_exclusive",
                                   side_effect=write_then_drift):
                with self.assertRaisesRegex(MODULE.MaterializationDenied,
                                            "REQUEST_BINDING_SHA256_DIVERGENCE"):
                    MODULE.seal_request(custody / "request.private.json", request)


if __name__ == "__main__":
    unittest.main()
