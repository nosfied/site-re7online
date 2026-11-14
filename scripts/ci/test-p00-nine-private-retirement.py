#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import stat
import tempfile
import time
from types import SimpleNamespace
from unittest import mock
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "generation_retirement_nine_tests", ROOT / "generation-retirement.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
OBSERVER_SPEC = importlib.util.spec_from_file_location(
    "capacity_proc_observer_nine_integration", ROOT / "capacity-proc-observer.py")
OBSERVER = importlib.util.module_from_spec(OBSERVER_SPEC)
assert OBSERVER_SPEC.loader is not None
OBSERVER_SPEC.loader.exec_module(OBSERVER)


def nine_receipt() -> dict:
    releases = []
    for path, package in zip(MODULE.EXCEPTIONAL_NINE_PATHS,
                             MODULE.EXCEPTIONAL_NINE_PACKAGE_SHA256S):
        releases.append({
            "schemaVersion": 1, "kind": "P00_NINE_PRIVATE_RELEASE_RESTORE",
            "state": "RESTORE_PASS", "candidatePath": path,
            "packageSha256": package,
            "sourcePrivateDataManifestSha256": MODULE.EXCEPTIONAL_NINE_SUPPLEMENT_SHA256,
            "externalSymlinksFollowed": False, "productionModified": False,
            "privateDataArchiveSha256": "a" * 64,
            "privateDataAuthority": {
                "sourceIdentity": MODULE.EXCEPTIONAL_NINE_DATA_IDENTITIES[path][:2],
                "archiveOwnershipVerified": True,
            },
        })
    return {
        "schemaVersion": 1, "kind": "P00_NINE_PRIVATE_RELEASES_PRESERVATION",
        "batchId": MODULE.EXCEPTIONAL_NINE_BATCH_ID,
        "state": "PRESERVATION_VERIFIED", "restoreState": "RESTORE_9_OF_9_PASS",
        "inventorySha256": MODULE.EXCEPTIONAL_NINE_INVENTORY_SHA256,
        "sourcePrivateDataManifestSha256": MODULE.EXCEPTIONAL_NINE_SUPPLEMENT_SHA256,
        "externalSymlinksFollowed": False, "productionModified": False,
        "destructiveEffects": 0, "releases": releases,
        "totals": {"candidateAllocatedBytes": 8_897_130_496,
                   "packageBytes": 1_351_376_292,
                   "privateDataArchiveBytes": 747_520, "releaseCount": 9,
                   "restoredAllocatedBytes": 8_899_563_520,
                   "uniqueTransportBytes": 1_352_123_812},
    }


class NinePrivateRetirementTest(unittest.TestCase):
    def in_profile(self, callback):
        return MODULE._with_exceptional_nine(lambda _args: callback(), SimpleNamespace())

    def test_profile_is_literal_and_restores_campaign_bindings(self):
        campaign = (MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID,
                    MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS,
                    MODULE.EXCEPTIONAL_CAMPAIGN_API_HELPER_SHA256)
        captured = {}
        self.in_profile(lambda: captured.update({
            "batch": MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID,
            "paths": MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS,
            "helper": MODULE.EXCEPTIONAL_CAMPAIGN_API_HELPER_SHA256,
            "data": MODULE.EXCEPTIONAL_PHYSICAL_DATA_IDENTITIES,
        }))
        self.assertEqual(captured["batch"], MODULE.EXCEPTIONAL_NINE_BATCH_ID)
        self.assertEqual(captured["paths"], MODULE.EXCEPTIONAL_NINE_PATHS)
        self.assertEqual(captured["helper"], MODULE.EXCEPTIONAL_NINE_HELPER_SHA256)
        self.assertEqual(captured["data"], MODULE.EXCEPTIONAL_NINE_DATA_IDENTITIES)
        self.assertEqual((MODULE.EXCEPTIONAL_CAMPAIGN_API_BATCH_ID,
                          MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS,
                          MODULE.EXCEPTIONAL_CAMPAIGN_API_HELPER_SHA256), campaign)

    def test_exact_preservation_receipt_and_all_private_data_are_required(self):
        receipt = nine_receipt(); raw = MODULE.canonical(receipt)
        def verify():
            with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
                self.assertEqual(MODULE._exceptional_preservation(
                    Path("/fixture/receipt.private.json"),
                    MODULE.EXCEPTIONAL_NINE_PRESERVATION_SHA256), receipt)
        self.in_profile(verify)
        receipt["releases"][4]["privateDataAuthority"]["sourceIdentity"][1] += 1
        tampered = MODULE.canonical(receipt)
        def deny():
            with mock.patch.object(MODULE, "stable_private",
                                   return_value=(tampered, mock.Mock())):
                with self.assertRaisesRegex(MODULE.Denied,
                                            "exceptional_preservation_content"):
                    MODULE._exceptional_preservation(
                        Path("/fixture/receipt.private.json"),
                        MODULE.EXCEPTIONAL_NINE_PRESERVATION_SHA256)
        self.in_profile(deny)

    def test_installation_proof_requires_exact_successor_and_predecessor(self):
        value = {
            "schemaVersion": 1, "kind": "P00_NINE_PRIVATE_RELEASES_OBSERVER_INSTALLATION",
            "state": "INSTALLED",
            "helper": {"path": "/usr/local/libexec/re7online/capacity-proc-observer.py",
                       "sha256": MODULE.EXCEPTIONAL_NINE_HELPER_SHA256,
                       "device": 64769, "inode": 900001, "uid": 0, "gid": 0,
                       "mode": "0500"},
            "previous": {
                "path": "/usr/local/libexec/re7online/capacity-proc-observer.py",
                "sha256": "1d808c3955d5d7db4902200b8669e02ec4ae7718e65bd62cd6b20b697c5e306e",
                "device": 64769, "inode": 786791, "uid": 0, "gid": 0, "mode": "0500",
            },
            "sudoersChanged": False,
            "sudoersSha256":
                "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26",
        }
        def check(current):
            raw = MODULE.canonical(current)
            with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
                return MODULE._exceptional_installation_report(
                    Path("/fixture/install.private.json"), "b" * 64)
        self.in_profile(lambda: self.assertEqual(check(value), value))
        value["previous"]["sha256"] = "0" * 64
        def deny():
            with self.assertRaisesRegex(MODULE.Denied,
                                        "exceptional_observer_installation"):
                check(value)
        self.in_profile(deny)

    def test_attestation_binds_nine_packages_and_fresh_phase(self):
        value = {"schemaVersion": 1, "kind": "EXCEPTIONAL_EXTERNAL_CUSTODY_ATTESTATION",
                 "batchId": MODULE.EXCEPTIONAL_NINE_BATCH_ID, "phase": "prepare",
                 "nonce": "c" * 64, "capturedAtNs": time.time_ns(),
                 "preservationReceiptSha256": MODULE.EXCEPTIONAL_NINE_PRESERVATION_SHA256,
                 "indexSha256": MODULE.EXCEPTIONAL_NINE_INDEX_SHA256,
                 "supplementSha256": MODULE.EXCEPTIONAL_NINE_SUPPLEMENT_SHA256,
                 "packageSha256s": MODULE.EXCEPTIONAL_NINE_PACKAGE_SHA256S,
                 "restoreCompare": "PASS",
                 "sshBinding": {"direction": "builder_to_vps", "host": "admin.re7online.com",
                                "principal": "deploy", "hostKeyFingerprint":
                                "SHA256:+rTaH6fXSuhNP65KZ5f3gMt3sAm5jCjzNSrYzkdKdEE",
                                "clientKeyFingerprint":
                                "SHA256:PMzqpz35ZQ1XnNzAaatXufF989gbsKZR+uoPBP6c11w",
                                "strictHostKeyChecking": True}}
        def check():
            raw = MODULE.canonical(value)
            with mock.patch.object(MODULE, "stable_private", return_value=(raw, mock.Mock())):
                MODULE._exceptional_attestation(Path("/fixture/attestation.private.json"),
                                                "d" * 64, "prepare")
        self.in_profile(check)
        value["packageSha256s"] = value["packageSha256s"][:-1]
        def deny():
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_custody_attestation"):
                check()
        self.in_profile(deny)

    def test_physical_private_data_identity_is_revalidated(self):
        root = "/fixture/release"; data = root + "/api-runtime/.data"
        identities = {root: [64769, 77]}; modes = {root: 0o755}
        physical = {root: [64769, 88, 0o775]}
        def info(inode, mode):
            return SimpleNamespace(st_dev=64769, st_ino=inode, st_uid=1000, st_gid=1000,
                                   st_mode=stat.S_IFDIR | mode)
        def lstat(path):
            if str(path) == root:
                return info(77, 0o755)
            if str(path) == data:
                return info(88, 0o775)
            raise FileNotFoundError(str(path))
        with mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_IDENTITIES", identities), \
                mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_MODES", modes), \
                mock.patch.object(MODULE, "EXCEPTIONAL_CAMPAIGN_API_DATA_LINKS", {}), \
                mock.patch.object(MODULE, "EXCEPTIONAL_PHYSICAL_DATA_IDENTITIES", physical), \
                mock.patch.object(Path, "lstat", lstat), \
                mock.patch.object(Path, "is_symlink", return_value=False):
            MODULE._exceptional_roots({root})
            physical[root][1] += 1
            with self.assertRaisesRegex(MODULE.Denied,
                                        "exceptional_private_data_identity"):
                MODULE._exceptional_roots({root})

    def test_observer_request_is_sorted_and_accepted_by_real_helper_contract(self):
        captured = {}
        def exercise():
            output = MODULE.EXCEPTIONAL_NINE_RECEIPT_PARENT / (
                "process-observation-prepare-attempt-02.private.json")
            args = SimpleNamespace(
                process_observer=Path("/usr/local/libexec/re7online/capacity-proc-observer.py"),
                process_observer_sha256=MODULE.EXCEPTIONAL_NINE_HELPER_SHA256)
            def runner(_command, **kwargs):
                request = OBSERVER.validate_request(kwargs["input"])
                captured["paths"] = request["candidatePaths"]
                response = {
                    "kind": "CAPACITY_PROC_OBSERVATION", "state": "COMPLETE",
                    "phase": "prepare", "candidatePaths": request["candidatePaths"],
                    "requestSha256": MODULE.digest_bytes(kwargs["input"]),
                    "mechanism": {
                        "path": str(args.process_observer),
                        "sha256": args.process_observer_sha256,
                        "identity": {"device": 64769, "inode": 900002,
                                     "uid": 0, "gid": 0, "mode": "0500"},
                    },
                    "observation": {"complete": True, "references": [],
                                    "activeWriters": [], "failures": []},
                }
                return subprocess.CompletedProcess(_command, 0, MODULE.canonical(response), b"")
            with mock.patch.object(MODULE.subprocess, "run", side_effect=runner), \
                    mock.patch.object(MODULE, "write_exclusive"):
                MODULE._exceptional_observe(
                    args, "prepare", output, {"inode": 900002})
        self.in_profile(exercise)
        self.assertEqual(captured["paths"], sorted(MODULE.EXCEPTIONAL_NINE_PATHS))

    def test_nine_profile_uses_attempt_02_without_changing_literal_effect_order(self):
        def exercise():
            parent = MODULE.EXCEPTIONAL_NINE_RECEIPT_PARENT
            args = SimpleNamespace(
                preservation_receipt=parent / "preservation-receipt.private.json",
                observer_installation_report=parent / "observer-installation.private.json",
                custody_attestation=parent /
                    "custody-attestation-prepare-attempt-02.private.json",
                process_observation_output=parent /
                    "process-observation-prepare-attempt-02.private.json",
                release_graph=MODULE.EXCEPTIONAL_CAMPAIGN_API_GRAPH_PATH,
                pm2=Path("/home/deploy/.npm-global/bin/pm2"),
                pm2_dump=Path("/home/deploy/.pm2/dump.pm2"),
                deployment_lock=Path("/opt/re7online/.deploy-canonical.lock"),
                generation_lock=Path("/opt/re7online/build-output/.generation-build.lock"),
                receipt_root=parent / "execution-v2",
                intent_output=parent / "retirement-intent-attempt-02.private.json",
                commands_output=parent / "retirement-commands-attempt-02.private.txt",
            )
            MODULE._exceptional_bindings(args, "prepare")
            args.custody_attestation = (
                parent / "custody-attestation-prepare-attempt-01.private.json")
            with self.assertRaisesRegex(MODULE.Denied, "exceptional_literal_binding"):
                MODULE._exceptional_bindings(args, "prepare")
        self.in_profile(exercise)

    def test_nine_commands_and_interruption_reconcile_without_repeating(self):
        def exercise():
            commands = [{"ordinal": ordinal, "path": path, "class": "RELEASE_RUNTIME",
                         "argv": ["/usr/bin/rm", "-r", "--one-file-system", "--", path]}
                        for ordinal, path in enumerate(MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS, 1)]
            with tempfile.TemporaryDirectory() as raw:
                parent = Path(raw); parent.chmod(0o700)
                journal = parent / "journal.private.jsonl"; MODULE.write_exclusive(journal, b"")
                first = commands[0]
                MODULE.append_event(journal, {"event": "ATTEMPT", "ordinal": 1,
                                              "path": first["path"], "argv": first["argv"]})
                state = {path: True for path in MODULE.EXCEPTIONAL_CAMPAIGN_API_PATHS}
                state[first["path"]] = False; calls = []
                real_exists = Path.exists; real_symlink = Path.is_symlink
                def exists(path):
                    return state.get(str(path), real_exists(path))
                def symlink(path):
                    return False if str(path) in state else real_symlink(path)
                def runner(argv, **_kwargs):
                    calls.append(argv); state[argv[-1]] = False
                    return subprocess.CompletedProcess(argv, 0, b"", b"")
                with mock.patch.object(Path, "exists", exists), \
                        mock.patch.object(Path, "is_symlink", symlink), \
                        mock.patch.object(MODULE.subprocess, "run", side_effect=runner):
                    result = MODULE._exceptional_execute_commands(
                        {"commands": commands}, journal, resume=True)
                self.assertEqual(result, (9, 9))
                self.assertEqual(len(calls), 8)
                self.assertNotIn(first["argv"], calls)
                events = [json.loads(line) for line in journal.read_text().splitlines()]
                self.assertEqual(len([event for event in events
                                      if event["event"] == "VERIFIED"]), 9)
        self.in_profile(exercise)

    def test_cli_exposes_only_closed_prepare_and_execute(self):
        names = MODULE.parser()._subparsers._group_actions[0].choices
        self.assertIn("prepare-exceptional-owner-authorized-nine-private-releases", names)
        self.assertIn("execute-exceptional-owner-authorized-nine-private-releases", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)
