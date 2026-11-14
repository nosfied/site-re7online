#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
from types import SimpleNamespace
from unittest import mock
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "generation_retirement_exceptional_tests", ROOT / "generation-retirement.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def commands():
    return [{"ordinal": ordinal, "path": path, "class": "RELEASE_RUNTIME",
             "argv": ["/usr/bin/rm", "-r", "--one-file-system", "--", path]}
            for ordinal, path in enumerate(MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS, 1)]


class ExceptionalCampaignApiRetirementTest(unittest.TestCase):
    def run_commands(self, state, journal, *, resume=False):
        real_exists = Path.exists
        real_symlink = Path.is_symlink
        calls = []

        def exists(path):
            value = state.get(str(path))
            return value if value is not None else real_exists(path)

        def symlink(path):
            return False if str(path) in state else real_symlink(path)

        def runner(argv, **_kwargs):
            calls.append(argv)
            state[argv[-1]] = False
            return subprocess.CompletedProcess(argv, 0, b"", b"")

        with mock.patch.object(Path, "exists", exists), \
                mock.patch.object(Path, "is_symlink", symlink), \
                mock.patch.object(MODULE.subprocess, "run", side_effect=runner):
            result = MODULE._exceptional_execute_commands(
                {"commands": commands()}, journal, resume=resume)
        return result, calls

    def test_closed_batch_executes_exactly_one_and_journals_every_checkpoint(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw); parent.chmod(0o700)
            journal = parent / "journal.private.jsonl"
            MODULE.write_exclusive(journal, b"")
            state = {path: True for path in MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS}
            result, calls = self.run_commands(state, journal)
            self.assertEqual(result, (1, 1))
            self.assertEqual([item[-1] for item in calls], list(MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS))
            events = [json.loads(line) for line in journal.read_text().splitlines()]
            self.assertEqual([item["event"] for item in events],
                             ["ATTEMPT", "RESULT", "VERIFIED"])
            self.assertTrue(all(not value for value in state.values()))

    def test_interruption_after_effect_is_reconciled_without_repeating_command(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw); parent.chmod(0o700)
            journal = parent / "journal.private.jsonl"
            MODULE.write_exclusive(journal, b"")
            first = commands()[0]
            MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
                                          "path": first["path"], "argv": first["argv"]})
            state = {path: True for path in MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS}
            state[first["path"]] = False
            result, calls = self.run_commands(state, journal, resume=True)
            self.assertEqual(result, (1, 1))
            self.assertNotIn(first["argv"], calls)
            events = [json.loads(line) for line in journal.read_text().splitlines()]
            first_result = next(item for item in events
                                if item["event"] == "RESULT" and item["ordinal"] == 1)
            self.assertTrue(first_result["reconciledAbsent"])
            self.assertIsNone(first_result["exitCode"])

    def test_absence_without_attempt_is_denied_without_effect(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw); parent.chmod(0o700)
            journal = parent / "journal.private.jsonl"
            MODULE.write_exclusive(journal, b"")
            state = {path: True for path in MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS}
            state[MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS[0]] = False
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_absent_without_attempt"):
                self.run_commands(state, journal)
            self.assertEqual(journal.read_bytes(), b"")

    def test_attempt_with_object_still_present_is_ambiguous_and_never_replayed(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw); parent.chmod(0o700)
            journal = parent / "journal.private.jsonl"
            MODULE.write_exclusive(journal, b"")
            first = commands()[0]
            MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
                                          "path": first["path"], "argv": first["argv"]})
            state = {path: True for path in MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS}
            with self.assertRaisesRegex(MODULE.Denied,
                                        "exceptional_interrupted_effect_ambiguous"):
                self.run_commands(state, journal, resume=True)
            self.assertEqual(len(journal.read_text().splitlines()), 1)

    def test_tampered_path_in_journal_is_denied(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw); parent.chmod(0o700)
            journal = parent / "journal.private.jsonl"
            MODULE.write_exclusive(journal, b"")
            MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
                                          "path": "/opt/re7online/releases/not-approved",
                                          "argv": ["/usr/bin/rm", "-r", "--one-file-system",
                                                   "--", "/opt/re7online/releases/not-approved"]})
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_journal_attempt"):
                MODULE._exceptional_journal_state(journal)

    def test_graph_reference_to_any_candidate_is_denied(self):
        graph = {"activeReleases": [Path(MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS[0]).name],
                 "rollbackReleases": [], "transitiveReturnReleases": [],
                 "candidateReleases": [], "immediateRollbackReleases": {}}
        raw = MODULE.canonical(graph)
        with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_graph_reference"):
                MODULE._exceptional_graph(Path("/fixture/private.json"),
                                          MODULE.EXCEPTIONAL_CAMPAIGN_API_GRAPH_SHA256)

    def test_root_identity_accepts_authenticated_json_device_inode_list(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "legacy-api"; root.mkdir(mode=0o700)
            data_parent = root / "apps/whatsapp-agent"; data_parent.mkdir(parents=True)
            data_target = Path(raw) / "external-data"; data_target.mkdir()
            (data_parent / ".data").symlink_to(data_target)
            info = root.lstat()
            with mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_IDENTITIES",
                                   {str(root): [info.st_dev, info.st_ino]}), \
                    mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_MODES", {str(root): 0o700}), \
                    mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_DATA_LINKS",
                                      {str(root): {"apps/whatsapp-agent/.data":
                                                   str(data_target)}}):
                MODULE._exceptional_roots({str(root)})

    def test_external_data_link_target_drift_is_denied(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "campaign-api"; root.mkdir(mode=0o700)
            data_parent = root / "apps/whatsapp-agent"; data_parent.mkdir(parents=True)
            expected = Path(raw) / "expected-data"; expected.mkdir()
            different = Path(raw) / "different-data"; different.mkdir()
            (data_parent / ".data").symlink_to(different)
            info = root.lstat()
            with mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_IDENTITIES",
                                   {str(root): [info.st_dev, info.st_ino]}), \
                    mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_MODES",
                                      {str(root): 0o700}), \
                    mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_DATA_LINKS",
                                      {str(root): {"apps/whatsapp-agent/.data": str(expected)}}):
                with self.assertRaisesRegex(MODULE.Denied, "exceptional_data_link"):
                    MODULE._exceptional_roots({str(root)})

    def test_exact_preservation_receipt_is_accepted_and_scope_drift_is_denied(self):
        receipt = {
            "schemaVersion": 1, "kind": "P00_CAMPAIGN_API_INCREMENTAL_PRESERVATION",
            "batchId": MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID,
            "state": "PRESERVATION_VERIFIED",
            "candidate": MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS[0],
            "candidateIdentity": MODULE.EXCEPTIONAL_CAMPAIGN_API_IDENTITIES[
                MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS[0]],
            "candidateAllocatedBytes": 363_339_776,
            "candidateInodesIncludingRoot": 9_842,
            "archiveSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_QUALIFICATION_SHA256,
            "archiveBytes": 105_917_138,
            "historicalManifestSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_INDEX_SHA256,
            "supplementSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_SUPPLEMENT_SHA256,
            "productionModified": False,
            "restoration": {"state": "RESTORE_PASS", "historicalManifestFiles": 8_820,
                            "supplementalLeaves": 1, "symlinks": 11,
                            "allocatedBytes": 363_376_640, "inodesIncludingRoot": 9_842,
                            "externalDataFollowed": False,
                            "externalDataLink":
                            "/opt/re7online/site-re7online/apps/whatsapp-agent/.data"},
        }
        raw = MODULE.canonical(receipt)
        with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
            self.assertEqual(MODULE._exceptional_preservation(
                Path("/fixture/private.json"),
                MODULE.EXCEPTIONAL_CAMPAIGN_API_PRESERVATION_SHA256), receipt)
            receipt["candidate"] = "/opt/re7online/releases/not-approved"
            tampered = MODULE.canonical(receipt)
            with mock.patch.object(MODULE, "stable_private",
                                   return_value=(tampered, mock.Mock())):
                with self.assertRaisesRegex(MODULE.Denied,
                                            "exceptional_preservation_content"):
                    MODULE._exceptional_preservation(
                        Path("/fixture/private.json"),
                        MODULE.EXCEPTIONAL_CAMPAIGN_API_PRESERVATION_SHA256)

    def test_expired_external_custody_attestation_is_denied(self):
        value = {"schemaVersion": 1, "kind": "EXCEPTIONAL_EXTERNAL_CUSTODY_ATTESTATION",
                 "batchId": MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID, "phase": "execute",
                 "nonce": "a" * 64, "capturedAtNs": time.time_ns() - 61_000_000_000,
                 "preservationReceiptSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_PRESERVATION_SHA256,
                 "indexSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_INDEX_SHA256,
                 "supplementSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_SUPPLEMENT_SHA256,
                 "packageSha256s": [MODULE.EXCEPTIONAL_CAMPAIGN_API_QUALIFICATION_SHA256],
                 "restoreCompare": "PASS",
                 "sshBinding": {"direction": "builder_to_vps", "host": "admin.re7online.com",
                                "principal": "deploy", "hostKeyFingerprint":
                                "SHA256:+rTaH6fXSuhNP65KZ5f3gMt3sAm5jCjzNSrYzkdKdEE",
                                "clientKeyFingerprint":
                                "SHA256:PMzqpz35ZQ1XnNzAaatXufF989gbsKZR+uoPBP6c11w",
                                "strictHostKeyChecking": True}}
        raw = MODULE.canonical(value)
        with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_custody_attestation"):
                MODULE._exceptional_attestation(Path("/fixture/private.json"),
                                                MODULE.digest_bytes(raw), "execute")

    def test_installation_report_binds_exact_installed_helper(self):
        value = {"schemaVersion": 1, "kind": "P00_CAMPAIGN_API_OBSERVER_INSTALLATION",
                 "state": "INSTALLED", "helper": {
                     "path": "/usr/local/libexec/re7online/capacity-proc-observer.py",
                     "sha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_HELPER_SHA256, "device": 64769,
                     "inode": 786900, "uid": 0, "gid": 0, "mode": "0500"},
                 "previous": {"sha256":
                     "e47ae66c9855e989e6f0c97a7b82c21714797ce4823842bec5ab9b5d431c04aa"},
                 "sudoersChanged": False, "sudoersSha256":
                 "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"}
        raw = MODULE.canonical(value)
        with mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_HELPER_INODE", 786900), \
                mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
            self.assertEqual(MODULE._exceptional_installation_report(
                Path("/fixture/private.json"), "b" * 64), value)
            value["helper"]["sha256"] = "0" * 64
            tampered = MODULE.canonical(value)
            with mock.patch.object(MODULE, "stable_private",
                                   return_value=(tampered, mock.Mock())):
                with self.assertRaisesRegex(MODULE.Denied,
                                            "exceptional_observer_installation"):
                    MODULE._exceptional_installation_report(
                        Path("/fixture/private.json"),
                        "b" * 64)

    def test_authorization_cannot_add_a_second_path(self):
        expected_commands = commands()
        commands_raw = ("\n".join(" ".join(item["argv"]) for item in expected_commands) + "\n").encode()
        intent = {"schemaVersion": 1, "kind": "EXCEPTIONAL_OWNER_AUTHORIZED_RETIREMENT",
                  "batchId": MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID,
                  "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
                  "preservationReceiptSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_PRESERVATION_SHA256,
                  "custodyAttestationSha256": "a" * 64,
                  "inventorySha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_INVENTORY_SHA256,
                  "qualificationProofSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_QUALIFICATION_SHA256,
                  "graphSha256": MODULE.EXCEPTIONAL_CAMPAIGN_API_GRAPH_SHA256,
                  "processObservation": {}, "identities": MODULE.EXCEPTIONAL_CAMPAIGN_API_IDENTITIES,
                  "commands": expected_commands, "operationalSnapshot": {},
                  "automaticRetry": False, "canonicalQualificationClaimed": False,
                  "commandsSha256": MODULE.digest_bytes(commands_raw)}
        intent_raw = MODULE.canonical(intent); intent_sha = MODULE.digest_bytes(intent_raw)
        authorization = {"schemaVersion": 1, "authorizationId": "fixture",
                         "decision": "AUTHORIZE_ONCE", "intentSha256": intent_sha,
                         "approvedPaths": list(MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS) +
                         ["/opt/re7online/releases/eleventh"], "owner": "fixture-owner",
                         "authorityClass": "EXCEPTIONAL_OWNER_AUTHORIZED"}
        auth_raw = MODULE.canonical(authorization)
        values = [(intent_raw, mock.Mock()), (auth_raw, mock.Mock())]
        args = SimpleNamespace(intent=Path("/intent"), intent_sha256=intent_sha,
                               authorization=Path("/authorization"),
                               authorization_sha256=MODULE.digest_bytes(auth_raw))
        with mock.patch.object(MODULE, "stable_private", side_effect=values):
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_authorization"):
                MODULE._exceptional_authorities(args)


if __name__ == "__main__":
    unittest.main(verbosity=2)
