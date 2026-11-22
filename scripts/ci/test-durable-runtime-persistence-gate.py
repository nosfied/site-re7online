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
        self.assertEqual(GATE.validate(self.request())["result"], "PASS")

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

    def test_ambiguous_or_absent_source_is_fail_closed_by_contract(self):
        request = self.request(reconciliation={"required": True, "state": "PENDING", "receipt": None, "receiptSha256": None, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")})
        with self.assertRaisesRegex(GATE.Denied, "reconciliation_state"): GATE.validate(request)

    def test_arbitrary_private_json_is_not_a_reconciliation_receipt(self):
        receipt = self.base / "receipt.json"
        sha = put(receipt, {"schemaVersion": 2, "kind": "ARBITRARY", "state": "VERIFIED"})
        reconciliation = {"required": True, "state": "VERIFIED", "receipt": str(receipt), "receiptSha256": sha, "operationId": "op", "tenantId": "tenant-a", "scope": {"type": "shared"}, "destinationPath": str(self.root / "tenant-a/shared.json")}
        with self.assertRaisesRegex(GATE.Denied, "reconciliation_receipt_semantics"): GATE.validate(self.request(reconciliation=reconciliation))

    def test_report_is_explicitly_not_executor_enforced(self):
        self.assertEqual(GATE.validate(self.request())["enforcementState"], "IMPLEMENTED_NOT_ENFORCED")


if __name__ == "__main__": unittest.main()
