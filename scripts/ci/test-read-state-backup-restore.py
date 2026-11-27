#!/usr/bin/python3
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("read_state_restore", ROOT / "scripts/read-state-backup-restore-isolated.py")
MODULE = importlib.util.module_from_spec(SPEC); assert SPEC.loader; SPEC.loader.exec_module(MODULE)


def raw(value): return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
def sha(value: bytes) -> str: return hashlib.sha256(value).hexdigest()


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.snapshot = self.root / "snapshot"; self.source = self.snapshot / "runtime-data/inbox-read-state"
        self.state = self.source / "tenant-a/shared.json"; self.state.parent.mkdir(parents=True, mode=0o700); self.source.chmod(0o700); self.state.parent.chmod(0o700)
        self.state.write_bytes(raw({"lastReadAtByConversationKey": {"safe": "2026-11-23T00:00:00.000Z", "safe-alias": "2026-11-23T00:00:00.000Z"}, "manuallyUnreadByConversationKey": {"safe-alias": True}})); self.state.chmod(0o600)
        self.manifest = self.snapshot / "manifest.json"; self.manifest.write_bytes(raw({"snapshotId": "fixture", "runtimeData": {"inboxReadState": {"files": 1}}}))
        lines = [f"{sha(item.read_bytes())}  ./{item.relative_to(self.snapshot)}\n" for item in (self.manifest, self.state)]
        self.checksums = self.snapshot / "SHA256SUMS"; self.checksums.write_text("".join(lines))
        self.authority = self.root / "privacy.json"; self.authority.write_bytes(raw({"schemaVersion": 1, "kind": "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", "tenantId": "tenant-a", "conversationKeys": []})); self.authority.chmod(0o600)

    def tearDown(self): self.temp.cleanup()

    def request(self, destination: Path, receipt: Path) -> tuple[Path, str]:
        destination.mkdir(mode=0o700); info = destination.lstat()
        value = {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_ISOLATED_RESTORE_REQUEST_V1", "snapshot": {"path": str(self.snapshot), "manifestSha256": sha(self.manifest.read_bytes()), "checksumsSha256": sha(self.checksums.read_bytes()), "subtree": "runtime-data/inbox-read-state"}, "destinationRoot": {"path": str(destination), "ownerUid": info.st_uid, "groupGid": info.st_gid, "mode": "0700"}, "anonymizationAuthorities": [{"path": str(self.authority), "sha256": sha(self.authority.read_bytes())}], "receiptPath": str(receipt)}
        path = self.root / f"{destination.name}.request.json"; payload = raw(value); path.write_bytes(payload); path.chmod(0o600); return path, sha(payload)

    def test_restore_isolated_preserves_layout_modes_hashes_and_owner(self):
        destination = self.root / "restore"; request, request_sha = self.request(destination, self.root / "receipt.json")
        result = MODULE.restore(request, request_sha); self.assertEqual(result["state"], "VERIFIED")
        restored = destination / "tenant-a/shared.json"; self.assertEqual(restored.read_bytes(), self.state.read_bytes())
        self.assertEqual(restored.stat().st_mode & 0o777, 0o600); self.assertEqual(restored.stat().st_uid, self.state.stat().st_uid)

    def test_restore_denies_anonymized_key_before_publication(self):
        self.authority.write_bytes(raw({"schemaVersion": 1, "kind": "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", "tenantId": "tenant-a", "conversationKeys": ["safe"]}))
        destination = self.root / "denied"; request, request_sha = self.request(destination, self.root / "denied-receipt.json")
        with self.assertRaisesRegex(RuntimeError, "restore_anonymized_key_reintroduction"): MODULE.restore(request, request_sha)
        self.assertEqual(list(destination.iterdir()), [])

    def test_restore_denies_non_private_snapshot_file(self):
        self.state.chmod(0o644); destination = self.root / "bad-mode"; request, request_sha = self.request(destination, self.root / "bad-mode-receipt.json")
        with self.assertRaisesRegex(RuntimeError, "read_state_file_identity"): MODULE.restore(request, request_sha)


if __name__ == "__main__": unittest.main()
