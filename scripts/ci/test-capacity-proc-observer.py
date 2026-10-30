#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
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

    def fake_proc(self, root, pid, *, uid=1000, arguments=(), flags=0,
                  cwd="/", fds=(), maps=()):
        proc = root / str(pid); (proc / "fd").mkdir(parents=True)
        fields = ["S", "0", "0", "0", "0", "0", str(flags), *("0" for _ in range(12)), "10"]
        (proc / "stat").write_text(f"{pid} (fixture) " + " ".join(fields) + "\n")
        (proc / "status").write_text(f"Uid:\t{uid}\t{uid}\t{uid}\t{uid}\n")
        (proc / "cmdline").write_bytes(
            b"\0".join(item.encode() for item in arguments) + (b"\0" if arguments else b""))
        os.symlink(cwd, proc / "cwd"); os.symlink("/", proc / "root")
        os.symlink("/usr/bin/node", proc / "exe")
        for number, target in enumerate(fds, 3):
            os.symlink(target, proc / "fd" / str(number))
        (proc / "maps").write_text("".join(
            f"0000-1000 r--p 0 00:00 0 {target}\n" for target in maps))
        return proc

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
            identities = iter((("S", 0, 10), ("S", 0, 11)))
            with mock.patch.object(OBSERVER, "process_stat", side_effect=lambda _p: next(identities)):
                observation = OBSERVER.scan_proc(["/tmp/candidate"], 1000, proc_root)
            self.assertFalse(observation["complete"])
            self.assertEqual(observation["summary"]["identityChanges"], 1)

    def test_initial_missing_file_with_pid_present_is_incomplete(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); proc = self.fake_proc(root, 61, arguments=("worker",))
            (proc / "stat").unlink()
            observation = OBSERVER.scan_proc([OBSERVER.NPM_CACHE], 1000, root)
        self.assertFalse(observation["complete"])
        self.assertEqual(observation["summary"]["vanishedProcesses"], 0)
        self.assertEqual(observation["failures"][0]["operation"], "identity:initial")

    def test_empty_cmdline_revalidation_missing_file_with_pid_present_is_incomplete(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); proc = self.fake_proc(root, 62)
            initial = OBSERVER.process_stat(proc)
            missing = FileNotFoundError(2, "missing", str(proc / "stat"))
            with mock.patch.object(OBSERVER, "process_stat", side_effect=[initial, missing]):
                observation = OBSERVER.scan_proc([OBSERVER.NPM_CACHE], 1000, root)
        self.assertFalse(observation["complete"])
        self.assertEqual(observation["summary"]["vanishedProcesses"], 0)
        self.assertEqual(observation["failures"][0]["operation"],
                         "identity:empty-cmdline-revalidation")

    def test_final_revalidation_missing_file_with_pid_present_is_incomplete(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); proc = self.fake_proc(root, 63, arguments=("worker",))
            initial = OBSERVER.process_stat(proc)
            missing = FileNotFoundError(2, "missing", str(proc / "stat"))
            with mock.patch.object(OBSERVER, "process_stat", side_effect=[initial, missing]):
                observation = OBSERVER.scan_proc([OBSERVER.NPM_CACHE], 1000, root)
        self.assertFalse(observation["complete"])
        self.assertEqual(observation["summary"]["vanishedProcesses"], 0)
        self.assertEqual(observation["failures"][0]["operation"],
                         "identity:final-revalidation")

    def test_missing_file_is_vanished_only_after_pid_directory_absence_is_confirmed(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); proc = self.fake_proc(root, 64, arguments=("worker",))
            def vanish(_proc):
                shutil.rmtree(proc)
                raise FileNotFoundError(2, "missing", str(proc / "stat"))
            with mock.patch.object(OBSERVER, "process_stat", side_effect=vanish):
                observation = OBSERVER.scan_proc([OBSERVER.NPM_CACHE], 1000, root)
        self.assertTrue(observation["complete"])
        self.assertEqual(observation["summary"]["vanishedProcesses"], 1)
        self.assertEqual(observation["failures"], [])

    def test_empty_cmdline_user_process_is_fully_inspected(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); candidate = OBSERVER.NPM_CACHE
            self.fake_proc(root, 51, cwd=candidate, fds=[candidate + "/fd"],
                           maps=[candidate + "/mapped"])
            observation = OBSERVER.scan_proc([candidate], 1000, root)
        sources = {item["source"] for item in observation["references"]}
        self.assertTrue({"cwd", "fd/3", "maps"}.issubset(sources))
        self.assertTrue(observation["complete"])
        self.assertEqual(observation["summary"]["emptyCmdlineProcessesInspected"], 1)

    def test_kernel_thread_requires_positive_flag_and_root_identity(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            self.fake_proc(root, 52, uid=0, flags=OBSERVER.PF_KTHREAD)
            observation = OBSERVER.scan_proc([OBSERVER.NPM_CACHE], 1000, root)
        self.assertTrue(observation["complete"])
        self.assertEqual(observation["summary"]["kernelThreadsIgnored"], 1)
        self.assertEqual(observation["summary"]["emptyCmdlineProcessesInspected"], 0)

    def test_helper_rejects_roots_and_accepts_only_canonical_candidates(self):
        def request(paths):
            value = {"schemaVersion": 1, "kind": "CAPACITY_PROC_OBSERVATION_REQUEST",
                     "phase": "audit", "nonce": "0" * 64, "deployUid": 1000,
                     "candidatePaths": sorted(paths), "consumer": {"pid": 99, "startTicks": 1}}
            return OBSERVER.canonical(value)
        rejected = ["/", "/home/deploy/.npm", "/tmp/runtime",
                    "/opt/re7online/build-output"]
        for path in rejected:
            with self.subTest(path=path), self.assertRaisesRegex(OBSERVER.Refused, "CANDIDATE_SCOPE"):
                OBSERVER.validate_request(request([path]))
        release = "immutable-d7de6453-vps-20261024T221500Z"
        producer = f"/opt/re7online/build-output/{release}-producer/{release}"
        preparation = "/opt/re7online/backups/converta-persistent/preparations/automation-20260929T220203Z"
        accepted = [OBSERVER.NPM_CACHE, producer + "/api-runtime", producer + "/frontend-runtime",
                    preparation + "/api-frontend-return.private.tar.gz",
                    preparation + "/worker-return.private.tar.gz"]
        self.assertEqual(OBSERVER.validate_request(request(accepted))["candidatePaths"], sorted(accepted))
        for path in (preparation, preparation + "/content.private.tar.gz",
                     preparation + "/nested/api-frontend-return.private.tar.gz"):
            with self.subTest(path=path), self.assertRaisesRegex(OBSERVER.Refused, "CANDIDATE_SCOPE"):
                OBSERVER.validate_request(request([path]))

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
