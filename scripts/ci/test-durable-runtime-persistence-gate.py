#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("gate", ROOT / "scripts/durable-runtime-persistence-gate.py")
assert SPEC and SPEC.loader
GATE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(GATE)
RETIREMENT_SPEC = importlib.util.spec_from_file_location(
    "generation_retirement_persistence_test", ROOT / "scripts/generation-retirement.py")
assert RETIREMENT_SPEC and RETIREMENT_SPEC.loader
RETIREMENT = importlib.util.module_from_spec(RETIREMENT_SPEC); RETIREMENT_SPEC.loader.exec_module(RETIREMENT)


def put(path: Path, value: dict) -> str:
    path.write_bytes(GATE.canonical(value)); path.chmod(0o600)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PersistenceGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / "persistent/read-state"; self.root.mkdir(parents=True, mode=0o700)
        self.root.chmod(0o700); self.root.parent.chmod(0o700)
        self.release = self.base / "releases/candidate"; self.release.mkdir(parents=True)

    def request(self, phase="preflight", dependencies=None, reconciliation=None):
        info = self.root.stat()
        return {"schemaVersion": 1, "kind": GATE.KIND, "phase": phase, "surface": "INBOX_READ_STATE_V1",
                "persistentRoot": {"path": str(self.root), "ownerUid": info.st_uid, "groupGid": info.st_gid, "mode": "0700"},
                "releaseRoots": [{"role": "candidate", "path": str(self.release)}, {"role": "rollback", "path": str(self.base / "releases/rollback")}],
                "reconciliation": reconciliation or {"required": False, "state": "NOT_REQUIRED", "receipt": None, "receiptSha256": None, "operationId": None, "tenantId": None, "scope": None, "destinationPath": None},
                "unreconciledReleaseDependencies": dependencies or []}

    def test_preflight_accepts_private_external_root(self):
        report = GATE.validate(self.request())
        self.assertEqual(report["result"], "PASS")
        self.assertEqual(report["enforcementState"], "LEGACY_VALIDATED_NOT_ENFORCED")

    def test_release_local_or_symlink_root_is_denied(self):
        request = self.request(); request["persistentRoot"]["path"] = str(self.release / ".data")
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_release_overlap"): GATE.validate(request)
        link = self.base / "linked"; link.symlink_to(self.root, target_is_directory=True)
        request = self.request(); request["persistentRoot"]["path"] = str(link)
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_identity"): GATE.validate(request)

    def test_retirement_denies_unreconciled_dependency(self):
        with self.assertRaisesRegex(GATE.Denied, "release_persistent_dependency"):
            GATE.validate(self.request("retirement", [str(self.release / ".data/app-read-state")]))

    def test_required_reconciliation_authenticates_private_receipt(self):
        receipt = self.base / "receipt.json"
        receipt_value = {"schemaVersion": 2, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2", "state": "VERIFIED", "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")}
        sha = put(receipt, receipt_value)
        request = self.request(reconciliation={"required": True, "state": "VERIFIED", "receipt": str(receipt), "receiptSha256": sha, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")})
        self.assertEqual(GATE.validate(request)["reconciliation"], "VERIFIED")
        request["reconciliation"]["receiptSha256"] = "0" * 64
        with self.assertRaisesRegex(GATE.Denied, "request_sha256"): GATE.validate(request)

    def test_aggregate_reconciliation_requires_complete_individual_receipts(self):
        individual_path = self.base / "individual.json"
        destination = str(self.root / "tenant-a/shared.json")
        individual = {"schemaVersion": 2, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2", "state": "VERIFIED", "operationId": "tenant-op", "requestSha256": "1" * 64, "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": destination}
        individual_sha = put(individual_path, individual)
        manifest_path = self.base / "manifest.json"
        manifest = {"schemaVersion": 1, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_MANIFEST_V1", "operationId": "aggregate-op", "custodyRoot": {}, "entries": [{"requestPath": str(self.base / "request.json"), "requestSha256": "1" * 64, "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": destination, "receiptPath": str(individual_path)}], "aggregateReceiptPath": str(self.base / "aggregate.json")}
        manifest_sha = put(manifest_path, manifest)
        aggregate_path = self.base / "aggregate.json"
        aggregate = {"schemaVersion": 1, "kind": "CONVERTA_INBOX_READ_STATE_RECONCILIATION_AGGREGATE_RECEIPT_V1", "operationId": "aggregate-op", "manifestSha256": manifest_sha, "state": "VERIFIED", "entries": [{"tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": destination, "requestSha256": "1" * 64, "receiptPath": str(individual_path), "receiptSha256": individual_sha}]}
        aggregate_sha = put(aggregate_path, aggregate)
        reconciliation = {"required": True, "state": "VERIFIED", "receipt": str(aggregate_path), "receiptSha256": aggregate_sha, "operationId": "aggregate-op", "manifest": str(manifest_path), "manifestSha256": manifest_sha, "destinationCount": 1}
        self.assertEqual(GATE.validate(self.request(reconciliation=reconciliation))["reconciliation"], "VERIFIED")
        aggregate["entries"] = []
        reconciliation["receiptSha256"] = put(aggregate_path, aggregate)
        with self.assertRaisesRegex(GATE.Denied, "reconciliation_receipt_semantics"):
            GATE.validate(self.request(reconciliation=reconciliation))

    def test_ambiguous_or_absent_source_is_fail_closed_by_contract(self):
        request = self.request(reconciliation={"required": True, "state": "PENDING", "receipt": None, "receiptSha256": None, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")})
        with self.assertRaisesRegex(GATE.Denied, "reconciliation_state"): GATE.validate(request)

    def test_arbitrary_private_json_is_not_a_reconciliation_receipt(self):
        receipt = self.base / "receipt.json"
        sha = put(receipt, {"schemaVersion": 2, "kind": "ARBITRARY", "state": "VERIFIED"})
        reconciliation = {"required": True, "state": "VERIFIED", "receipt": str(receipt), "receiptSha256": sha, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")}
        with self.assertRaisesRegex(GATE.Denied, "reconciliation_receipt_semantics"): GATE.validate(self.request(reconciliation=reconciliation))

    def test_v2_authority_is_bound_to_every_canonical_phase(self):
        request = self.request()
        request.pop("phase")
        request.update(schemaVersion=2, kind=GATE.KIND_V2, requiredPhases=list(GATE.PHASES))
        for phase in GATE.PHASES:
            self.assertEqual(GATE.validate(request, phase)["enforcementState"],
                             "CANONICALLY_ENFORCED")
        request["requiredPhases"] = list(GATE.PHASES[:-1])
        with self.assertRaisesRegex(GATE.Denied, "request_phases"):
            GATE.validate(request, "preflight")

    def test_v2_missing_root_invalid_receipt_and_dependency_fail_closed(self):
        request = self.request(); request.pop("phase")
        request.update(schemaVersion=2, kind=GATE.KIND_V2, requiredPhases=list(GATE.PHASES))
        request["persistentRoot"]["path"] = str(self.base / "absent")
        with self.assertRaisesRegex(GATE.Denied, "persistent_root_absent"):
            GATE.validate(request, "preflight")
        request = self.request(reconciliation={"required": True, "state": "VERIFIED", "receipt": str(self.base / "absent.json"), "receiptSha256": "0" * 64, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")})
        request.pop("phase"); request.update(schemaVersion=2, kind=GATE.KIND_V2, requiredPhases=list(GATE.PHASES))
        with self.assertRaises((GATE.Denied, FileNotFoundError)):
            GATE.validate(request, "acceptance")
        request = self.request(dependencies=["release-local/.data"]); request.pop("phase")
        request.update(schemaVersion=2, kind=GATE.KIND_V2, requiredPhases=list(GATE.PHASES))
        with self.assertRaisesRegex(GATE.Denied, "release_persistent_dependency"):
            GATE.validate(request, "retirement")

    def test_real_retirement_consumer_invokes_gate_before_disposition(self):
        request = self.request(dependencies=["candidate/.data/app-read-state"])
        request.pop("phase"); request.update(schemaVersion=2, kind=GATE.KIND_V2,
                                              requiredPhases=list(GATE.PHASES))
        authority = self.base / "retirement-persistence.private.json"
        authority_sha = put(authority, request)
        contract = {"durablePersistence": {"request": str(authority),
                                             "requestSha256": authority_sha}}
        with self.assertRaisesRegex(RETIREMENT.Denied, "release_persistent_dependency"):
            RETIREMENT.enforce_durable_persistence(contract)


if __name__ == "__main__": unittest.main()
