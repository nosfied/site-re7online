#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


RECOVERY = load("capacity_recovery_observer_tests", ROOT / "capacity-recovery.py")
OBSERVER = load("capacity_proc_observer_tests", ROOT / "capacity-proc-observer.py")


class ProcObserverTests(unittest.TestCase):
    def binding(self):
        return {"path": str(RECOVERY.PROC_OBSERVER_PATH), "sha256": "a" * 64}

    def installed(self):
        identity = {"device": 1, "inode": 2, "uid": 0, "gid": 0, "mode": "0500",
                    "type": "regular", "size": 10, "mtimeNs": 1, "ctimeNs": 1}
        return {"path": str(RECOVERY.PROC_OBSERVER_PATH), "identity": identity,
                "ancestors": [{"path": "/usr", "identity": {"root": True}}]}

    def completed_response(self, request_raw, installed, *, references=None, nonce=None):
        request = json.loads(request_raw)
        now = time.time_ns()
        mechanism = dict(installed)
        mechanism["sha256"] = "a" * 64
        mechanism["interpreter"] = {"path": "/usr/bin/python3", "identity": {"root": True}}
        observation = {
            "complete": True, "references": references or [], "activeWriters": [],
            "failures": [], "failureDetailsTruncated": 0,
            "summary": {"processesObserved": 1, "referenceReadFailures": 0},
        }
        value = {
            "schemaVersion": 1, "kind": "CAPACITY_PROC_OBSERVATION", "state": "COMPLETE",
            "phase": request["phase"], "nonce": nonce or request["nonce"],
            "requestSha256": hashlib.sha256(request_raw).hexdigest(),
            "candidatePaths": request["candidatePaths"], "deployUid": request["deployUid"],
            "consumer": request["consumer"], "mechanism": mechanism,
            "capturedAtNs": now, "finishedAtNs": now, "durationMs": 0,
            "observation": observation,
        }
        return RECOVERY.canonical(value)

    def invoke(self, *, mutate=None, timeout=False):
        installed = self.installed()
        def runner(_argv, **kwargs):
            if timeout:
                raise subprocess.TimeoutExpired(_argv, 15)
            raw = self.completed_response(kwargs["input"], installed)
            if mutate:
                value = json.loads(raw)
                mutate(value)
                raw = RECOVERY.canonical(value)
            return SimpleNamespace(returncode=0, stdout=raw, stderr=b"")
        with mock.patch.object(RECOVERY, "_proc_observer_installation", return_value=installed), \
             mock.patch.object(RECOVERY, "deploy_identity", return_value=(1000, 1000)), \
             mock.patch.object(RECOVERY, "_read_start_ticks", return_value=44), \
             mock.patch.object(RECOVERY.subprocess, "run", side_effect=runner):
            return RECOVERY._privileged_proc_targets(self.binding(), ["/tmp/candidate"], "audit")

    def test_unprivileged_eacces_can_be_replaced_only_by_direct_complete_helper_result(self):
        scan, evidence = self.invoke()
        self.assertTrue(scan[2])
        self.assertEqual(evidence["candidatePaths"], ["/tmp/candidate"])
        self.assertEqual(evidence["mechanism"]["sha256"], "a" * 64)

    def test_tampered_or_replayed_response_is_denied(self):
        with self.assertRaisesRegex(RECOVERY.Denied, "PROC_OBSERVER_RESPONSE_BINDING"):
            self.invoke(mutate=lambda value: value.__setitem__("nonce", "0" * 64))

    def test_helper_failure_or_timeout_is_denied(self):
        with self.assertRaisesRegex(RECOVERY.Denied, "PROC_OBSERVER_TIMEOUT"):
            self.invoke(timeout=True)

    def test_deploy_modifiable_helper_is_denied(self):
        fake = SimpleNamespace(st_mode=stat.S_IFREG | 0o500, st_uid=1000, st_gid=1000,
                               st_dev=1, st_ino=2, st_size=1, st_mtime_ns=1, st_ctime_ns=1)
        with mock.patch.object(Path, "lstat", return_value=fake):
            with self.assertRaisesRegex(RECOVERY.Denied, "PROC_OBSERVER_INSTALLATION_IDENTITY"):
                RECOVERY._proc_observer_installation(self.binding())

    def test_real_process_reference_is_reported_and_denies_candidate(self):
        with tempfile.TemporaryDirectory() as raw:
            candidate = Path(raw) / "_cacache"
            candidate.mkdir()
            child = subprocess.Popen(["/usr/bin/sleep", "5"], cwd=candidate)
            try:
                observation = OBSERVER.scan_proc([str(candidate)], os.getuid())
            finally:
                child.terminate(); child.wait()
            self.assertTrue(any(item["pid"] == child.pid for item in observation["references"]))
            targets = [(item["pid"], item["startTicks"], item["source"], item["target"])
                       for item in observation["references"]]
            process_scan = (targets, [], observation["complete"], observation["summary"])
            candidate.parent.chmod(0o775)
            with mock.patch.object(RECOVERY, "NPM_CACHE", candidate), \
                 mock.patch.object(RECOVERY, "NPM_PARENT", candidate.parent), \
                 mock.patch.object(RECOVERY, "deploy_identity", return_value=(os.getuid(), os.getgid())), \
                 mock.patch.object(RECOVERY, "deploy_group_principals", return_value=["deploy"]):
                candidate.chmod(0o700)
                with self.assertRaisesRegex(RECOVERY.Denied, "NPM_CACHE_REFERENCED"):
                    RECOVERY.authenticate_npm(
                        {"class": "NPM_CACHE_MAINTENANCE", "path": str(candidate)},
                        process_scan,
                        {"currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [],
                         "openTransactionPaths": [], "protectedGraphPaths": []})

    def test_pid_identity_change_is_incomplete(self):
        with tempfile.TemporaryDirectory() as raw:
            proc_root = Path(raw)
            proc = proc_root / "42"; (proc / "fd").mkdir(parents=True)
            (proc / "status").write_text("Uid:\t1000\t1000\t1000\t1000\n")
            (proc / "cmdline").write_bytes(b"worker\0")
            (proc / "maps").write_bytes(b"")
            for leaf in ("cwd", "root", "exe"):
                os.symlink("/", proc / leaf)
            ticks = iter((10, 11))
            with mock.patch.object(OBSERVER, "start_ticks", side_effect=lambda _p: next(ticks)):
                observation = OBSERVER.scan_proc(["/tmp/candidate"], 1000, proc_root)
            self.assertFalse(observation["complete"])
            self.assertEqual(observation["summary"]["identityChanges"], 1)

    def test_failure_detail_limit_is_explicit_and_never_implies_completeness(self):
        failures = []; truncated = [0]
        for pid in range(OBSERVER.MAX_FAILURE_DETAILS + 3):
            OBSERVER.add_failure(failures, truncated, pid=pid, ticks=1,
                                 uids=(1000, 1000, 1000, 1000), operation="read:maps",
                                 predicate="PROCESS_REFERENCE_UNREADABLE",
                                 error=PermissionError(13, "denied"))
        self.assertEqual(len(failures), OBSERVER.MAX_FAILURE_DETAILS)
        self.assertEqual(truncated[0], 3)

    def test_execute_phase_uses_fresh_observation_and_sees_new_reference(self):
        scan, evidence = self.invoke()
        self.assertEqual(evidence["phase"], "audit")
        installed = self.installed()
        def runner(_argv, **kwargs):
            request = json.loads(kwargs["input"])
            reference = {"candidatePath": "/tmp/candidate", "pid": 77, "startTicks": 88,
                         "uids": {"real": 1000, "effective": 1000, "saved": 1000, "fs": 1000},
                         "source": "fd/9", "target": "/tmp/candidate/file"}
            raw = self.completed_response(kwargs["input"], installed, references=[reference])
            return SimpleNamespace(returncode=0, stdout=raw, stderr=b"")
        with mock.patch.object(RECOVERY, "_proc_observer_installation", return_value=installed), \
             mock.patch.object(RECOVERY, "deploy_identity", return_value=(1000, 1000)), \
             mock.patch.object(RECOVERY, "_read_start_ticks", return_value=44), \
             mock.patch.object(RECOVERY.subprocess, "run", side_effect=runner):
            fresh, evidence = RECOVERY._privileged_proc_targets(
                self.binding(), ["/tmp/candidate"], "execute")
        self.assertEqual(evidence["phase"], "execute")
        self.assertEqual(fresh[0], [(77, 88, "fd/9", "/tmp/candidate/file")])


if __name__ == "__main__":
    unittest.main(verbosity=2)
