#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "backup_retention_protected_observer",
    ROOT / "backup-retention-protected-observer.py")
OBSERVER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(OBSERVER)
INSTALLER_SPEC = importlib.util.spec_from_file_location(
    "backup_retention_protected_installer",
    ROOT / "install-re7-converta-backup-protected-retention.py")
INSTALLER = importlib.util.module_from_spec(INSTALLER_SPEC)
assert INSTALLER_SPEC.loader is not None
INSTALLER_SPEC.loader.exec_module(INSTALLER)


class ProtectedRetentionObserverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "snapshots"
        self.snapshot = self.root / OBSERVER.SNAPSHOT_ID
        (self.snapshot / "database").mkdir(parents=True)
        (self.snapshot / "content" / "training").mkdir(parents=True)
        (self.snapshot / "database" / "database.dump").write_bytes(b"dump")
        (self.snapshot / "content" / "training" / "unique.bin").write_bytes(b"unique")
        (self.snapshot / "manifest.json").write_text('{"snapshotId":"20260812T011558Z"}\n')
        lines = []
        for path in sorted(self.snapshot.rglob("*")):
            if path.is_file() and path.name != "SHA256SUMS":
                relative = "./" + path.relative_to(self.snapshot).as_posix()
                lines.append(f"{OBSERVER.sha256(path.read_bytes())}  {relative}\n")
        (self.snapshot / "SHA256SUMS").write_text("".join(lines))
        self.snapshot.chmod(0o750)
        self.contract = Path(self.temp.name) / "authority.json"
        self.write_contract()

    def tearDown(self):
        self.temp.cleanup()

    def contract_value(self):
        info = self.snapshot.stat()
        return {
            "schemaVersion": 1,
            "kind": OBSERVER.KIND,
            "authorityVersion": "P1-20261121",
            "decision": OBSERVER.DECISION,
            "reason": OBSERVER.REASON,
            "administrativeAuthority": "Owner CONVERTA",
            "snapshot": {
                "snapshotId": OBSERVER.SNAPSHOT_ID,
                "path": str(self.snapshot),
                "device": info.st_dev,
                "inode": info.st_ino,
                "uid": info.st_uid,
                "gid": info.st_gid,
                "mode": "0750",
                "nlink": info.st_nlink,
                "manifestSha256": OBSERVER.sha256((self.snapshot / "manifest.json").read_bytes()),
                "checksumsSha256": OBSERVER.sha256((self.snapshot / "SHA256SUMS").read_bytes()),
                "integrity": "SHA256SUMS_PASS",
                "pgRestoreList": "PASS_503_OBJECTS",
            },
        }

    def write_contract(self, mutate=None, canonical=True):
        value = self.contract_value()
        if mutate:
            mutate(value)
        raw = OBSERVER.canonical(value)
        if not canonical:
            raw = json.dumps(value, indent=2).encode()
        self.contract.write_bytes(raw)
        self.contract.chmod(0o600)

    def verify(self):
        with mock.patch.object(OBSERVER, "CONTRACT", self.contract), \
             mock.patch.object(OBSERVER, "SNAPSHOT_ROOT", self.root), \
             mock.patch.object(OBSERVER, "SNAPSHOT_PATH", self.snapshot), \
             mock.patch.object(OBSERVER, "HELPER_PATH", ROOT / "backup-retention-protected-observer.py"), \
             mock.patch.object(OBSERVER, "CONTRACT_UID", os.getuid()), \
             mock.patch.object(OBSERVER, "CONTRACT_GID", os.getgid()), \
             mock.patch.object(OBSERVER, "HELPER_UID", os.getuid()), \
             mock.patch.object(OBSERVER, "HELPER_GID", os.getgid()), \
             mock.patch.object(OBSERVER, "HELPER_MODE", 0o755), \
             mock.patch.object(OBSERVER.os, "geteuid", return_value=0), \
             mock.patch.object(OBSERVER.os, "getegid", return_value=0):
            return OBSERVER.verify()

    def test_valid_closed_authority_verifies_entire_tree(self):
        result = self.verify()
        self.assertEqual(result["state"], "VERIFIED")
        self.assertEqual(result["decision"], "RETAIN_REQUIRED")
        self.assertEqual(result["integrity"], "SHA256SUMS_PASS")

    def test_snapshot_identity_drift_denies(self):
        self.write_contract(lambda value: value["snapshot"].__setitem__("inode", 1))
        with self.assertRaisesRegex(OBSERVER.Denied, "SNAPSHOT_IDENTITY"):
            self.verify()

    def test_manifest_or_checksums_drift_denies(self):
        (self.snapshot / "manifest.json").write_bytes(b"changed")
        with self.assertRaisesRegex(OBSERVER.Denied, "MANIFEST_DIGEST"):
            self.verify()
        self.setUp_manifest_again()
        (self.snapshot / "SHA256SUMS").write_bytes(b"changed")
        with self.assertRaisesRegex(OBSERVER.Denied, "CHECKSUMS_DIGEST"):
            self.verify()

    def setUp_manifest_again(self):
        (self.snapshot / "manifest.json").write_text('{"snapshotId":"20260812T011558Z"}\n')

    def test_missing_malformed_noncanonical_or_modifiable_authority_denies(self):
        self.write_contract(canonical=False)
        with self.assertRaisesRegex(OBSERVER.Denied, "CONTRACT_CANONICAL"):
            self.verify()
        self.write_contract(); self.contract.chmod(0o660)
        with self.assertRaisesRegex(OBSERVER.Denied, "CONTRACT_IDENTITY"):
            self.verify()
        self.contract.unlink()
        with self.assertRaises(FileNotFoundError):
            self.verify()

    def test_contract_cannot_expand_snapshot_scope(self):
        self.write_contract(lambda value: value["snapshot"].__setitem__("path", "/tmp/other"))
        with self.assertRaisesRegex(OBSERVER.Denied, "CONTRACT_SNAPSHOT_SCOPE"):
            self.verify()

    def test_symlink_or_unexpected_hardlink_denies(self):
        link = self.snapshot / "content" / "link"
        link.symlink_to(self.snapshot / "manifest.json")
        with self.assertRaisesRegex(OBSERVER.Denied, "SNAPSHOT_SYMLINK"):
            self.verify()
        link.unlink()
        os.link(self.snapshot / "manifest.json", self.snapshot / "content" / "hard")
        with self.assertRaisesRegex(OBSERVER.Denied, "SNAPSHOT_HARDLINK"):
            self.verify()

    def test_integrity_authority_cannot_be_claimed_without_exact_contract(self):
        self.write_contract(lambda value: value["snapshot"].__setitem__("integrity", "UNKNOWN"))
        with self.assertRaisesRegex(OBSERVER.Denied, "CONTRACT_INTEGRITY_AUTHORITY"):
            self.verify()

    def test_installer_seals_exact_sources_and_private_contract(self):
        self.assertEqual(INSTALLER.digest(INSTALLER.BACKUP_SOURCE.read_bytes()),
                         INSTALLER.BACKUP_SOURCE_SHA256)
        self.assertEqual(INSTALLER.digest(INSTALLER.OBSERVER_SOURCE.read_bytes()),
                         INSTALLER.OBSERVER_SOURCE_SHA256)
        self.assertEqual(INSTALLER.digest(INSTALLER.SUDOERS_SOURCE.read_bytes()),
                         INSTALLER.SUDOERS_SOURCE_SHA256)
        self.assertEqual(INSTALLER.digest(INSTALLER.READ_STATE_CONTRACT_SOURCE.read_bytes()),
                         INSTALLER.READ_STATE_CONTRACT_SOURCE_SHA256)
        self.assertEqual(INSTALLER.digest(INSTALLER.READ_STATE_RESTORE_SOURCE.read_bytes()),
                         INSTALLER.READ_STATE_RESTORE_SOURCE_SHA256)
        value = json.loads(INSTALLER.CONTRACT_RAW)
        self.assertEqual(INSTALLER.CONTRACT_RAW, OBSERVER.canonical(value))
        self.assertEqual(value["snapshot"]["manifestSha256"],
                         "71601150d1a7441787c4f6ff4b408087482f075195d1198ea66aaf367d272bf7")
        self.assertEqual(value["snapshot"]["checksumsSha256"],
                         "5f9d1e7157e764500f0a5a30f006285114c6485a7915bfe460048796d18da20e")


if __name__ == "__main__":
    unittest.main()
