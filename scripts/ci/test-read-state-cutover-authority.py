#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("authority", ROOT / "scripts/read-state-cutover-authority.py")
assert SPEC and SPEC.loader
AUTH = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(AUTH)


def put(path: Path, value: dict) -> str:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    path.write_bytes(AUTH.canonical(value)); path.chmod(0o600)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CutoverAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.custody = self.base / "custody"; self.custody.mkdir(mode=0o700)
        self.persistent = self.base / "runtime-data/inbox-read-state"
        self.source_root = self.base / "releases/cb/api-runtime/.data/app-read-state"
        self.source_root.mkdir(parents=True, mode=0o755); self.source_root.chmod(0o755)
        self.source = self.source_root / "tenant-a.shared.json"; self.source.write_text("{}\n")
        AUTH.ROOT = str(self.persistent)
        self.privacy = self.custody / "privacy/tenant-a.json"
        privacy_sha = put(self.privacy, {"schemaVersion": 1, "kind": "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", "tenantId": "tenant-a", "keys": []})
        self.batch = self.custody / "privacy/batch.json"
        batch_sha = put(self.batch, {"inventorySha256": AUTH.PRIVACY_INVENTORY_SHA256, "journalSha256": AUTH.PRIVACY_JOURNAL_SHA256, "custodyManifestSha256": AUTH.PRIVACY_CUSTODY_SHA256, "verifiedCount": 34})
        uid, gid = os.getuid(), os.getgid()
        self.plan = {
            "schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V1", "operationId": "cutover-1",
            "persistentRoot": {"path": str(self.persistent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
            "custodyRoot": {"path": str(self.custody), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
            "authorizedSourceReleases": ["immutable-cb"],
            "entries": [{"operationId": "tenant-a-shared", "tenantId": "tenant-a", "scope": {"type": "shared"},
                         "destinationPath": str(self.persistent / "tenant-a/shared.json"),
                         "sources": [{"releaseId": "immutable-cb", "path": str(self.source), "rootPath": str(self.source_root), "privateCopyPath": str(self.custody / "copies/cb.json")}],
                         "anonymizationAuthority": {"path": str(self.privacy), "sha256": privacy_sha},
                         "requestPath": str(self.custody / "reconcile/request.json"), "journalPath": str(self.custody / "reconcile/journal.json"), "receiptPath": str(self.custody / "reconcile/receipt.json")}],
            "privacyBatchAuthority": {"path": str(self.batch), "sha256": batch_sha, "inventorySha256": AUTH.PRIVACY_INVENTORY_SHA256, "journalSha256": AUTH.PRIVACY_JOURNAL_SHA256, "custodyManifestSha256": AUTH.PRIVACY_CUSTODY_SHA256, "verifiedCount": 34},
            "outputs": {"provisionIntentPath": str(self.custody / "provision.json"), "materializationRequestPath": str(self.custody / "materialize.json"), "authorizationPath": str(self.custody / "authorization.json")}}
        self.plan_path = self.custody / "plan.json"; self.plan_sha = put(self.plan_path, self.plan)

    def prepare(self):
        result = AUTH.prepare(self.plan_path, self.plan_sha)
        request = self.custody / "materialize.json"
        request_sha = hashlib.sha256(request.read_bytes()).hexdigest()
        owner = self.custody / "owner-authorization.json"
        owner_sha = put(owner, {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1", "decision": "AUTHORIZE_ONCE",
                                "planSha256": self.plan_sha, "provisionIntentSha256": result["provisionIntentSha256"],
                                "approvedPersistentRoot": str(self.persistent), "approvedTenants": ["tenant-a"], "owner": "fixture-owner"})
        return result, request, request_sha, owner, owner_sha

    def test_prepare_has_no_provisioning_effect_and_materialize_binds_physical_authorities(self):
        prepared, request, request_sha, owner, owner_sha = self.prepare()
        self.assertEqual(prepared["state"], "PREPARED")
        self.assertFalse(self.persistent.exists())
        self.persistent.mkdir(parents=True, mode=0o700); self.persistent.chmod(0o700)
        result = AUTH.materialize(request, request_sha, owner, owner_sha)
        self.assertEqual(result, {"state": "MATERIALIZED", "authorizationSha256": result["authorizationSha256"], "entryCount": 1})
        authority = json.loads((self.custody / "authorization.json").read_text())
        self.assertEqual(authority["kind"], "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V3")
        self.assertEqual(authority["schemaVersion"], 3)
        self.assertEqual(authority["administrativeAuthority"], {"path": str(owner), "sha256": owner_sha})
        self.assertEqual(authority["entries"][0]["sources"][0]["admission"], "LEGACY_RELEASE_LOCAL_COPY_V1")
        self.assertEqual(AUTH.materialize(request, request_sha, owner, owner_sha), result)

    def test_admin_plan_cannot_expand_source_release(self):
        self.plan["entries"][0]["sources"][0]["releaseId"] = "unapproved"
        path = self.custody / "bad-plan.json"; sha = put(path, self.plan)
        with self.assertRaisesRegex(RuntimeError, "cutover_plan_source"):
            AUTH.prepare(path, sha)

    def test_privacy_batch_must_be_exactly_34_verified(self):
        self.plan["privacyBatchAuthority"]["verifiedCount"] = 33
        path = self.custody / "bad-privacy.json"; sha = put(path, self.plan)
        with self.assertRaisesRegex(RuntimeError, "cutover_plan_privacy_batch"):
            AUTH.prepare(path, sha)

    def test_divergent_preexisting_authority_is_denied(self):
        _, request, request_sha, owner, owner_sha = self.prepare()
        self.persistent.mkdir(parents=True, mode=0o700); self.persistent.chmod(0o700)
        put(self.custody / "authorization.json", {"divergent": True})
        with self.assertRaisesRegex(RuntimeError, "authority_file_sha256"):
            AUTH.materialize(request, request_sha, owner, owner_sha)

    def test_materialize_denies_owner_scope_expansion(self):
        _, request, request_sha, owner, _ = self.prepare()
        self.persistent.mkdir(parents=True, mode=0o700); self.persistent.chmod(0o700)
        owner_sha = put(self.custody / "bad-owner.json", {"schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1", "decision": "AUTHORIZE_ONCE",
                                                          "planSha256": self.plan_sha, "provisionIntentSha256": json.loads(request.read_text())["provisionIntentSha256"],
                                                          "approvedPersistentRoot": str(self.persistent), "approvedTenants": ["tenant-a", "tenant-b"], "owner": "fixture-owner"})
        with self.assertRaisesRegex(RuntimeError, "owner_authorization_binding"):
            AUTH.materialize(request, request_sha, self.custody / "bad-owner.json", owner_sha)


if __name__ == "__main__": unittest.main()
