#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def physical(self, path: Path) -> dict:
        info = path.lstat()
        return {"path": str(path), "device": info.st_dev, "inode": info.st_ino,
                "ownerUid": info.st_uid, "groupGid": info.st_gid,
                "mode": f"0{info.st_mode & 0o777:03o}"}

    def provision_fixture(self):
        uid, gid = os.getuid(), os.getgid()
        executor = Path("/usr/bin/install").resolve(strict=True); executor_info = executor.lstat()
        executor_authority = {
            "path": str(executor), "sha256": hashlib.sha256(executor.read_bytes()).hexdigest(),
            "device": executor_info.st_dev, "inode": executor_info.st_ino,
            "ownerUid": executor_info.st_uid, "groupGid": executor_info.st_gid,
            "mode": f"0{executor_info.st_mode & 0o777:03o}"}
        created = [
            {"path": str(self.persistent.parent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
            {"path": str(self.persistent), "ownerUid": uid, "groupGid": gid, "mode": "0700"},
        ]
        commands = [[str(executor), "-d", "-o", str(uid), "-g", str(gid), "-m", "0700", item["path"]]
                    for item in created]
        plan = {"schemaVersion": 1, "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_PLAN_V1",
                "operationId": "provision-1", "root": self.plan["persistentRoot"],
                "custodyRoot": self.physical(self.custody), "ancestors": [self.physical(self.base)],
                "createdDirectories": created, "executor": executor_authority, "commands": commands,
                "initialState": "ABSENT", "automaticExecution": False,
                "outputs": {"intentPath": str(self.custody / "provision-v2.json"),
                            "journalPath": str(self.custody / "provision-journal.json"),
                            "receiptPath": str(self.custody / "provision-receipt.json"),
                            "lockPath": str(self.custody / "provision.lock")}}
        plan_path = self.custody / "provision-plan.json"; plan_sha = put(plan_path, plan)
        prepared = AUTH.prepare_provision(plan_path, plan_sha)
        intent_path = Path(plan["outputs"]["intentPath"]); intent_sha = prepared["provisionIntentSha256"]
        owner_path = self.custody / "provision-owner.json"
        owner_value = {"schemaVersion": 1,
                       "kind": "CONVERTA_DURABLE_READ_STATE_PROVISION_AUTHORIZE_ONCE_V1",
                       "decision": "AUTHORIZE_ONCE", "operationId": plan["operationId"],
                       "planSha256": plan_sha, "provisionIntentSha256": intent_sha,
                       "approvedRoot": str(self.persistent), "approvedCommands": commands,
                       "owner": "fixture-owner"}
        owner_sha = put(owner_path, owner_value)
        return plan, plan_path, plan_sha, prepared, intent_path, intent_sha, owner_path, owner_sha, owner_value

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

    def test_minimal_provision_intent_has_no_physical_effect_and_requires_owner(self):
        fixture = self.provision_fixture()
        plan, _, _, prepared, intent, intent_sha, *_ = fixture
        self.assertEqual(prepared["state"], "PROVISION_INTENT_PREPARED")
        self.assertEqual(prepared["nextState"], "AWAITING_OWNER_AUTHORIZATION")
        self.assertFalse(self.persistent.parent.exists())
        result = subprocess.run([sys.executable, str(ROOT / "scripts/read-state-cutover-authority.py"),
                                 "provision", str(intent), intent_sha], text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("owner_authorization_required", result.stderr)
        self.assertFalse(self.persistent.exists())
        self.assertFalse(Path(plan["outputs"]["journalPath"]).exists())

    def test_provision_verified_replay_and_cutover_v2_bind_physical_receipt(self):
        plan, _, _, _, intent, intent_sha, owner, owner_sha, _ = self.provision_fixture()
        result = AUTH.provision(intent, intent_sha, owner, owner_sha)
        self.assertEqual(result["state"], "ROOT_PROVISIONED_VERIFIED")
        self.assertFalse(result["replayed"])
        replay = AUTH.provision(intent, intent_sha, owner, owner_sha)
        self.assertEqual(replay["provisionReceiptSha256"], result["provisionReceiptSha256"])
        self.assertTrue(replay["replayed"])
        receipt_path = Path(plan["outputs"]["receiptPath"])
        plan_v2 = dict(self.plan)
        plan_v2.update(schemaVersion=2, kind="CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V2",
                       provisionReceiptAuthority={"path": str(receipt_path),
                                                  "sha256": result["provisionReceiptSha256"],
                                                  "provisionIntentSha256": intent_sha})
        plan_v2["outputs"] = {"materializationRequestPath": str(self.custody / "materialize-v2.json"),
                              "authorizationPath": str(self.custody / "authorization-v2.json")}
        plan_path = self.custody / "cutover-plan-v2.json"; plan_sha = put(plan_path, plan_v2)
        prepared = AUTH.prepare(plan_path, plan_sha)
        request_path = Path(plan_v2["outputs"]["materializationRequestPath"])
        request_sha = hashlib.sha256(request_path.read_bytes()).hexdigest()
        cutover_owner = self.custody / "cutover-owner-v2.json"
        cutover_owner_sha = put(cutover_owner, {
            "schemaVersion": 1, "kind": "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1",
            "decision": "AUTHORIZE_ONCE", "planSha256": plan_sha,
            "provisionIntentSha256": intent_sha, "approvedPersistentRoot": str(self.persistent),
            "approvedTenants": ["tenant-a"], "owner": "fixture-owner"})
        materialized = AUTH.materialize(request_path, request_sha, cutover_owner, cutover_owner_sha)
        self.assertEqual(prepared["state"], "CUTOVER_PLAN_PREPARED")
        self.assertEqual(materialized["state"], "CUTOVER_PLAN_AUTHORIZED")

    def test_provision_denies_tampered_divergent_path_mode_ancestor_and_symlink(self):
        cases = ("owner", "path", "mode", "ancestor", "symlink")
        for case in cases:
            with self.subTest(case=case):
                self.setUp(); fixture = self.provision_fixture()
                plan, plan_path, _, _, intent, intent_sha, owner, owner_sha, owner_value = fixture
                if case == "owner":
                    bad = self.custody / "bad-owner.json"; owner_sha = put(bad, {**owner_value, "approvedRoot": str(self.persistent) + "-other"}); owner = bad
                    expected = "provision_owner_authorization_binding"
                elif case in {"path", "mode"}:
                    changed = json.loads(plan_path.read_text())
                    if case == "path": changed["root"]["path"] = str(self.persistent) + "-other"
                    else: changed["root"]["mode"] = "0755"
                    plan_path.write_bytes(AUTH.canonical(changed)); plan_path.chmod(0o600)
                    expected = "authority_file_sha256"
                elif case == "ancestor":
                    os.chmod(self.base, 0o755); expected = "provision_plan_ancestor_identity"
                else:
                    self.persistent.parent.mkdir(mode=0o700)
                    self.persistent.symlink_to(self.custody, target_is_directory=True)
                    expected = "provision_unattributed_preexisting"
                with self.assertRaisesRegex(RuntimeError, expected):
                    AUTH.provision(intent, intent_sha, owner, owner_sha)

    def test_preexisting_compatible_without_journal_is_denied(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, _ = fixture
        self.persistent.mkdir(parents=True, mode=0o700); self.persistent.parent.chmod(0o700); self.persistent.chmod(0o700)
        with self.assertRaisesRegex(RuntimeError, "provision_unattributed_preexisting"):
            AUTH.provision(intent, intent_sha, owner, owner_sha)

    def test_physical_mode_divergence_is_denied(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, _ = fixture
        real_run = AUTH.subprocess.run
        def wrong_mode(command, **kwargs):
            result = real_run(command, **kwargs)
            os.chmod(command[-1], 0o755)
            return result
        with patch.object(AUTH.subprocess, "run", side_effect=wrong_mode):
            with self.assertRaisesRegex(RuntimeError, "provision_created_directory_identity"):
                AUTH.provision(intent, intent_sha, owner, owner_sha)

    def test_divergent_replay_authority_is_denied(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, owner_value = fixture
        AUTH.provision(intent, intent_sha, owner, owner_sha)
        divergent = self.custody / "divergent-provision-owner.json"
        divergent_sha = put(divergent, {**owner_value, "owner": "different-owner"})
        with self.assertRaisesRegex(RuntimeError, "provision_receipt_binding"):
            AUTH.provision(intent, intent_sha, divergent, divergent_sha)

    def test_interruption_resumes_without_repeating_completed_effect(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, _ = fixture
        real_run = AUTH.subprocess.run; calls = []
        def interrupted(command, **kwargs):
            calls.append(command)
            result = real_run(command, **kwargs)
            if len(calls) == 1: raise RuntimeError("synthetic_interruption")
            return result
        with patch.object(AUTH.subprocess, "run", side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, "synthetic_interruption"):
                AUTH.provision(intent, intent_sha, owner, owner_sha)
        result = AUTH.provision(intent, intent_sha, owner, owner_sha)
        journal = json.loads((self.custody / "provision-journal.json").read_text())
        first = [event for event in journal["events"] if event.get("ordinal") == 1 and event.get("event") == "RESULT"]
        self.assertEqual(result["state"], "ROOT_PROVISIONED_VERIFIED")
        self.assertEqual(first[0]["resultSource"], "INTERRUPTED_COMMAND_PHYSICAL_READBACK")
        self.assertEqual(len(calls), 1)

    def test_interrupted_attempt_without_physical_effect_is_denied_without_retry(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, _ = fixture
        calls = []
        def interrupted_before_effect(command, **_kwargs):
            calls.append(command)
            raise RuntimeError("synthetic_pre_effect_interruption")
        with patch.object(AUTH.subprocess, "run", side_effect=interrupted_before_effect):
            with self.assertRaisesRegex(RuntimeError, "synthetic_pre_effect_interruption"):
                AUTH.provision(intent, intent_sha, owner, owner_sha)
        with patch.object(AUTH.subprocess, "run", side_effect=AssertionError("must not retry")):
            with self.assertRaisesRegex(RuntimeError, "provision_interrupted_effect_unproven"):
                AUTH.provision(intent, intent_sha, owner, owner_sha)
        self.assertEqual(len(calls), 1)

    def test_existing_result_requires_same_physical_inode_and_intact_result_passes(self):
        for replace_identity in (False, True):
            with self.subTest(replace_identity=replace_identity):
                self.setUp()
                plan, _, _, _, intent, intent_sha, owner, owner_sha, _ = self.provision_fixture()
                original = AUTH.provision(intent, intent_sha, owner, owner_sha)
                Path(plan["outputs"]["receiptPath"]).unlink()
                if replace_identity:
                    replacement = self.persistent.with_name("replacement-read-state")
                    replacement.mkdir(mode=0o700)
                    self.persistent.rmdir(); replacement.rename(self.persistent)
                    with self.assertRaisesRegex(RuntimeError, "provision_journal_result_authority"):
                        AUTH.provision(intent, intent_sha, owner, owner_sha)
                else:
                    resumed = AUTH.provision(intent, intent_sha, owner, owner_sha)
                    self.assertEqual(resumed["state"], "ROOT_PROVISIONED_VERIFIED")
                    self.assertEqual(resumed["provisionReceiptSha256"], original["provisionReceiptSha256"])

    def test_tampered_duplicated_or_inconsistent_journal_is_denied(self):
        cases = ("duplicate", "command", "order")
        for case in cases:
            with self.subTest(case=case):
                self.setUp()
                plan, _, _, _, intent, intent_sha, owner, owner_sha, _ = self.provision_fixture()
                AUTH.provision(intent, intent_sha, owner, owner_sha)
                Path(plan["outputs"]["receiptPath"]).unlink()
                journal_path = Path(plan["outputs"]["journalPath"])
                journal = json.loads(journal_path.read_text())
                if case == "duplicate":
                    journal["events"].insert(1, dict(journal["events"][0]))
                    expected = "provision_journal_event_order"
                elif case == "command":
                    journal["events"][1]["command"] = ["/bin/false"]
                    expected = "provision_journal_event_binding"
                else:
                    journal["events"][0], journal["events"][1] = journal["events"][1], journal["events"][0]
                    expected = "provision_journal_event_order"
                put(journal_path, journal)
                with self.assertRaisesRegex(RuntimeError, expected):
                    AUTH.provision(intent, intent_sha, owner, owner_sha)

    def test_terminal_receipt_denies_replaced_physical_identity(self):
        fixture = self.provision_fixture(); _, _, _, _, intent, intent_sha, owner, owner_sha, _ = fixture
        AUTH.provision(intent, intent_sha, owner, owner_sha)
        replacement = self.persistent.with_name("replacement-read-state")
        replacement.mkdir(mode=0o700)
        self.persistent.rmdir(); replacement.rename(self.persistent)
        with self.assertRaisesRegex(RuntimeError, "provision_receipt_physical_readback"):
            AUTH.provision(intent, intent_sha, owner, owner_sha)

    def test_concurrent_execution_is_denied(self):
        plan, _, _, _, intent, intent_sha, owner, owner_sha, _ = self.provision_fixture()
        lock_path = Path(plan["outputs"]["lockPath"])
        fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            AUTH.fcntl.flock(fd, AUTH.fcntl.LOCK_EX | AUTH.fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "provision_concurrent_execution"):
                AUTH.provision(intent, intent_sha, owner, owner_sha)
        finally:
            os.close(fd)

    def test_cutover_v2_denies_missing_or_divergent_receipt(self):
        plan, _, _, _, intent, intent_sha, owner, owner_sha, _ = self.provision_fixture()
        result = AUTH.provision(intent, intent_sha, owner, owner_sha)
        receipt = Path(plan["outputs"]["receiptPath"])
        value = dict(self.plan)
        value.update(schemaVersion=2, kind="CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V2",
                     provisionReceiptAuthority={"path": str(receipt), "sha256": result["provisionReceiptSha256"],
                                                "provisionIntentSha256": "f" * 64})
        value["outputs"] = {"materializationRequestPath": str(self.custody / "bad-request.json"),
                            "authorizationPath": str(self.custody / "bad-authorization.json")}
        path = self.custody / "bad-cutover-v2.json"; sha = put(path, value)
        with self.assertRaisesRegex(RuntimeError, "cutover_plan_provision_receipt"):
            AUTH.prepare(path, sha)


if __name__ == "__main__": unittest.main()
