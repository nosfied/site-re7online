#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest import mock

TOOL = Path(__file__).resolve().parents[1] / "capacity-recovery-supervisor.py"
SPEC = importlib.util.spec_from_file_location("capacity_recovery_supervisor", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

PROFILE_TOOL = Path(__file__).resolve().parent / "capacity-recovery-cold-profile.py"
PROFILE_SPEC = importlib.util.spec_from_file_location("capacity_recovery_cold_profile",
                                                      PROFILE_TOOL)
PROFILE = importlib.util.module_from_spec(PROFILE_SPEC)
assert PROFILE_SPEC.loader is not None
PROFILE_SPEC.loader.exec_module(PROFILE)


class SupervisorTests(unittest.TestCase):
    class FakeChild:
        def __init__(self, code=None):
            self.pid = 4242
            self.code = code
            self.terminated = False
            self.killed = False

        def poll(self):
            return self.code

        def terminate(self):
            self.terminated = True
            self.code = -15

        def kill(self):
            self.killed = True
            self.code = -9

        def wait(self, timeout=None):
            if self.code is None:
                raise MODULE.subprocess.TimeoutExpired("fake", timeout)
            return self.code

    def run_real_child(self, source, expected_code):
        folder = tempfile.TemporaryDirectory(prefix="capacity-supervisor-")
        self.addCleanup(folder.cleanup)
        root = Path(folder.name)
        args = SimpleNamespace(
            action="execute", intent=Path("/intent"), intent_sha256="a" * 64,
            authorization=Path("/authorization"), authorization_sha256="b" * 64,
            receipt_root=Path("/receipt"), telemetry_output=root / "child.jsonl",
            stdout_output=root / "stdout", stderr_output=root / "stderr",
            terminal_output=root / "terminal.json",
            supervisor_telemetry_output=root / "supervisor.jsonl")
        with mock.patch.object(MODULE, "parser") as parser, \
                mock.patch.object(MODULE, "executor_argv",
                                  return_value=[sys.executable, "-c", source]), \
                self.assertRaises(SystemExit) as stopped:
            parser.return_value.parse_args.return_value = args
            MODULE.main()
        self.assertEqual(stopped.exception.code, expected_code)
        rows = [json.loads(line) for line in
                args.supervisor_telemetry_output.read_text().splitlines()]
        terminal = json.loads(args.terminal_output.read_text())
        return rows, terminal

    def test_closed_argv_always_uses_canonical_executor(self):
        args = SimpleNamespace(action="audit", request=Path("/request"),
                               request_sha256="a" * 64, plan_output=Path("/plan"),
                               telemetry_output=Path("/telemetry"))
        argv = MODULE.executor_argv(args)
        self.assertEqual(argv[:4], ["/usr/bin/python3", "-B", str(MODULE.EXECUTOR), "audit"])
        self.assertNotIn("-c", argv)
        self.assertEqual(argv[-2:], ["--telemetry-output", "/telemetry"])

    def test_execute_argv_retains_historical_direct_executor_contract(self):
        args = SimpleNamespace(
            action="execute", intent=Path("/intent"), intent_sha256="a" * 64,
            authorization=Path("/authorization"), authorization_sha256="b" * 64,
            receipt_root=Path("/receipt"), telemetry_output=Path("/telemetry"))
        argv = MODULE.executor_argv(args)
        self.assertEqual(argv[:4], ["/usr/bin/python3", "-B", str(MODULE.EXECUTOR),
                                    "execute"])
        self.assertNotIn("--containment-output", argv)
        self.assertNotIn("--memory-max-bytes", argv)
        self.assertNotIn("--timeout-seconds", argv)

    def test_audit_scope_argv_is_closed_and_kernel_enforced(self):
        args = SimpleNamespace(
            action="audit", request=Path("/request"), request_sha256="a" * 64,
            plan_output=Path("/plan"), telemetry_output=Path("/telemetry"),
            containment_output=Path("/containment"),
            memory_max_bytes=256 * 1024 * 1024, timeout_seconds=900)
        argv = MODULE.systemd_scope_argv(args, "re7-capacity-audit-test.scope")
        self.assertEqual(argv[0:4], ["/usr/bin/systemd-run", "--user", "--scope",
                                     "--quiet"])
        self.assertIn("--property=MemoryMax=268435456", argv)
        self.assertIn("--property=MemorySwapMax=0", argv)
        self.assertIn("--property=OOMPolicy=kill", argv)
        self.assertIn("--property=RuntimeMaxSec=900s", argv)
        self.assertIn("--property=KillMode=control-group", argv)
        self.assertIn(MODULE.INTERNAL_AUDIT_ACTION, argv)
        self.assertNotIn("prepare", argv)
        self.assertNotIn("execute", argv)

    def test_prepare_scope_argv_reuses_closed_kernel_containment(self):
        args = SimpleNamespace(
            action="prepare", plan=Path("/plan"), plan_sha256="a" * 64,
            intent_output=Path("/intent"), commands_output=Path("/commands"),
            manifest_output=Path("/manifest"), telemetry_output=Path("/telemetry"),
            containment_output=Path("/containment"),
            memory_max_bytes=512 * 1024 * 1024, timeout_seconds=1800)
        argv = MODULE.systemd_scope_argv(args, "re7-capacity-prepare-test.scope")
        self.assertIn(MODULE.INTERNAL_PREPARE_ACTION, argv)
        self.assertIn("--property=MemoryMax=536870912", argv)
        self.assertIn("--property=MemorySwapMax=0", argv)
        self.assertIn("--property=RuntimeMaxSec=1800s", argv)
        self.assertIn("--property=KillMode=control-group", argv)
        self.assertIn("--plan", argv)
        self.assertIn("--plan-sha256", argv)
        self.assertIn("--intent-output", argv)
        self.assertIn("--commands-output", argv)
        self.assertIn("--manifest-output", argv)
        self.assertNotIn("execute", argv)

    def test_internal_prepare_authenticates_scope_before_exact_executor(self):
        with tempfile.TemporaryDirectory(prefix="capacity-contained-prepare-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action=MODULE.INTERNAL_PREPARE_ACTION,
                unit="re7-capacity-prepare-test.scope",
                memory_max_bytes=512 * 1024 * 1024,
                containment_output=root / "containment.json",
                telemetry_output=root / "telemetry.jsonl",
                request=None, request_sha256=None, plan_output=None,
                plan=root / "plan.json", plan_sha256="a" * 64,
                intent_output=root / "intent.json", commands_output=root / "commands.txt",
                manifest_output=root / "manifest.json")
            projection = {"memoryMaxBytes": 512 * 1024 * 1024,
                          "memorySwapMaxBytes": 0, "memoryOomGroup": True}
            with mock.patch.object(MODULE, "internal_parser") as parser, \
                    mock.patch.object(MODULE, "verify_contained_cgroup",
                                      return_value=("/exact.scope", projection)), \
                    mock.patch.object(MODULE.os, "execv") as execute:
                parser.return_value.parse_args.return_value = args
                MODULE.contained_phase_main()
            evidence = json.loads(args.containment_output.read_text())
            self.assertEqual(evidence["state"], "PASS")
            argv = execute.call_args.args[1]
            self.assertEqual(argv[:4], ["/usr/bin/python3", "-B",
                                        str(MODULE.EXECUTOR), "prepare"])
            self.assertIn(str(args.plan), argv)
            self.assertIn(str(args.intent_output), argv)
            self.assertNotIn("execute", argv)

    def test_contained_cgroup_requires_exact_aggregate_limits(self):
        with tempfile.TemporaryDirectory(prefix="capacity-cgroup-") as folder:
            root = Path(folder)
            relative = "/user.slice/re7-capacity-audit-test.scope"
            group = root / relative.lstrip("/")
            group.mkdir(parents=True)
            (group / "memory.max").write_text(str(256 * 1024 * 1024))
            (group / "memory.swap.max").write_text("0")
            (group / "memory.oom.group").write_text("1")
            with mock.patch.object(MODULE, "unified_cgroup", return_value=relative):
                observed, projection = MODULE.verify_contained_cgroup(
                    "re7-capacity-audit-test.scope", 256 * 1024 * 1024, root)
                self.assertEqual(observed, relative)
                self.assertEqual(projection["memoryMaxBytes"], 256 * 1024 * 1024)
                (group / "memory.max").write_text(str(512 * 1024 * 1024))
                with self.assertRaisesRegex(RuntimeError,
                                             "AUDIT_CONTAINMENT_NOT_APPLIED"):
                    MODULE.verify_contained_cgroup(
                        "re7-capacity-audit-test.scope", 256 * 1024 * 1024, root)

    def test_audit_budget_is_explicit_and_bounded(self):
        valid = SimpleNamespace(memory_max_bytes=256 * 1024 * 1024,
                                timeout_seconds=900)
        MODULE.validate_audit_limits(valid)
        for memory, timeout in ((64 * 1024 * 1024, 900),
                                (1024 * 1024 * 1024, 900),
                                (256 * 1024 * 1024, 1),
                                (256 * 1024 * 1024, 3600)):
            with self.subTest(memory=memory, timeout=timeout), \
                    self.assertRaises(RuntimeError):
                MODULE.validate_audit_limits(
                    SimpleNamespace(memory_max_bytes=memory, timeout_seconds=timeout))

    def test_scope_resource_snapshot_is_bounded_sanitized_and_correlated(self):
        with tempfile.TemporaryDirectory(prefix="capacity-resource-sample-") as folder:
            root = Path(folder)
            cgroup = root / "cgroup" / "user.slice" / "exact.scope"
            cgroup.mkdir(parents=True)
            (cgroup / "memory.current").write_text("12345\n")
            (cgroup / "memory.peak").write_text("23456\n")
            (cgroup / "memory.events").write_text("low 0\noom 1\n")
            (cgroup / "memory.stat").write_text(
                "anon 4096\nfile 8192\nkernel 2048\nunknown_private 99\n")
            (cgroup / "cgroup.procs").write_text("42\n")
            process = root / "proc" / "42"
            process.mkdir(parents=True)
            stat_tail = ["S", *(["0"] * 18), "987654", "0", "0"]
            (process / "stat").write_text("42 (name with ) delimiter) " +
                                            " ".join(stat_tail) + "\n")
            (process / "status").write_text(
                "Name:\tsanitized\nUid:\t1000\t1000\t1000\t1000\nVmRSS:\t321 kB\n")
            telemetry = root / "executor.jsonl"
            telemetry.write_text(json.dumps({
                "schemaVersion": 1, "phase": "tar_scan_progress",
                "monotonicNs": 111, "memberCount": 9,
                "progressKind": "archive_payload", "progressBytes": 1048576,
                "candidate": "/private/not-forwarded",
            }) + "\n")
            telemetry.chmod(0o600)
            observed = MODULE.scope_resource_snapshot(
                {"state": "PASS", "cgroup": "/user.slice/exact.scope"},
                telemetry, cgroup_fs=root / "cgroup", proc_root=root / "proc")
        self.assertEqual(observed["scopeMemoryStat"], {
            "anon": 4096, "file": 8192, "kernel": 2048})
        self.assertEqual(observed["scopeProcesses"], [{
            "pid": 42, "startTicks": 987654, "uids": [1000] * 4,
            "rssBytes": 321 * 1024}])
        self.assertEqual(observed["executorCorrelation"]["phase"],
                         "tar_scan_progress")
        serialized = json.dumps(observed)
        self.assertNotIn("cmdline", serialized)
        self.assertNotIn("environment", serialized)
        self.assertNotIn("/private/not-forwarded", serialized)
        self.assertEqual(observed["observationGaps"], [])

    def test_scope_resource_snapshot_records_collection_gaps_and_pid_limit(self):
        with tempfile.TemporaryDirectory(prefix="capacity-resource-gap-") as folder:
            root = Path(folder)
            cgroup = root / "cgroup" / "exact.scope"
            cgroup.mkdir(parents=True)
            (cgroup / "memory.current").write_text("1\n")
            (cgroup / "memory.peak").write_text("2\n")
            (cgroup / "memory.events").write_text("oom 0\n")
            (cgroup / "cgroup.procs").write_text("1\n2\n")
            telemetry = root / "missing.jsonl"
            with mock.patch.object(MODULE, "AUDIT_SCOPE_PID_LIMIT", 1):
                observed = MODULE.scope_resource_snapshot(
                    {"state": "PASS", "cgroup": "/exact.scope"}, telemetry,
                    cgroup_fs=root / "cgroup", proc_root=root / "proc")
        self.assertTrue(observed["scopeProcessesTruncated"])
        self.assertIn("cgroup.procs:TRUNCATED", observed["observationGaps"])
        self.assertIn("memory.stat:NOT_FOUND", observed["observationGaps"])
        self.assertIn("pid:1:PROCESS_VANISHED", observed["observationGaps"])
        self.assertIn("executorTelemetry:NOT_FOUND", observed["observationGaps"])
        self.assertLessEqual(MODULE.AUDIT_RESOURCE_SAMPLE_LIMIT,
                             MODULE.AUDIT_TIMEOUT_MAX_SECONDS + 2)

    def test_synthetic_cold_preparation_syncs_and_measures_residency(self):
        with tempfile.TemporaryDirectory(prefix="capacity-cold-proof-") as folder:
            root = Path(folder)
            authority = root / "authority"
            authority.mkdir()
            leaf = authority / "candidate-1.bin"
            archive = root / "candidate-1.tar.gz"
            leaf.write_bytes(b"a" * (2 * 1024 * 1024))
            archive.write_bytes(b"b" * (2 * 1024 * 1024))
            # Bring only these synthetic files into cache before proving that
            # the bounded preparation can observe and evict their clean pages.
            self.assertEqual(len(leaf.read_bytes()), 2 * 1024 * 1024)
            self.assertEqual(len(archive.read_bytes()), 2 * 1024 * 1024)
            result = PROFILE.evict_own_files([{
                "path": str(archive), "authority": str(authority)}])
        self.assertEqual(result["gaps"], [])
        self.assertGreater(result["residentPagesBefore"], 0)
        self.assertEqual(result["residentPagesAfter"], 0)
        self.assertEqual(len(result["files"]), 2)

    def test_audit_terminal_reasons_are_nominal(self):
        passed = {"state": "PASS"}
        common = {"executor_state": "EXECUTOR_STARTED",
                  "termination_state": "TERMINATED_CONFIRMED",
                  "post_launch_failure": False,
                  "launcher_exited_scope_active": False}
        cases = (
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "oom-kill", "containment": passed, "exit_code": -9,
              **common},
             "AUDIT_MEMORY_MAX"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "timeout", "containment": passed, "exit_code": -9,
              **common},
             "AUDIT_TIMEOUT"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": None, "containment": {"state": "DENY"}, "exit_code": 1,
              **{**common, "executor_state": "EXECUTOR_NOT_STARTED"}},
             "AUDIT_CONTAINMENT_NOT_APPLIED"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "success", "containment": passed, "exit_code": 0,
              **common},
             "COMPLETED"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": None, "containment": None, "exit_code": 78,
              **{**common, "executor_state": "EXECUTOR_STATE_INCONCLUSIVE"}},
             "AUDIT_LAUNCH_STATE_INCONCLUSIVE"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": None, "containment": passed, "exit_code": 78,
              **{**common, "termination_state": "RECOVERY_PENDING"}},
             "AUDIT_RECOVERY_PENDING"),
        )
        for arguments, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(MODULE.audit_terminal_reason(**arguments), expected)

    def test_scope_kill_targets_only_exact_unit(self):
        completed = SimpleNamespace(returncode=0)
        with mock.patch.object(MODULE, "systemctl", return_value=completed) as command:
            self.assertTrue(MODULE.kill_scope("re7-capacity-audit-exact.scope", "SIGTERM"))
        command.assert_called_once_with([
            "kill", "--kill-whom=all", "--signal=SIGTERM",
            "re7-capacity-audit-exact.scope"])

    def test_executor_started_requires_authenticated_first_telemetry_event(self):
        with tempfile.TemporaryDirectory(prefix="capacity-start-proof-") as folder:
            path = Path(folder) / "telemetry.jsonl"
            path.write_text('{"phase":"telemetry_started","schemaVersion":1}\n')
            path.chmod(0o600)
            self.assertEqual(MODULE.executor_execution_state(
                launcher_started=True, containment={"state": "PASS"},
                telemetry_path=path), "EXECUTOR_STARTED")
            path.write_text('{"phase":"later","schemaVersion":1}\n')
            self.assertEqual(MODULE.executor_execution_state(
                launcher_started=True, containment={"state": "PASS"},
                telemetry_path=path), "EXECUTOR_STATE_INCONCLUSIVE")

    def test_executor_started_authenticates_first_line_of_large_telemetry(self):
        with tempfile.TemporaryDirectory(prefix="capacity-start-proof-large-") as folder:
            path = Path(folder) / "telemetry.jsonl"
            first = '{"phase":"telemetry_started","schemaVersion":1}\n'
            path.write_text(first + ('{"phase":"later"}\n' * 5000))
            path.chmod(0o600)
            self.assertGreater(path.stat().st_size, MODULE.EXECUTOR_PROOF_MAX_BYTES)
            self.assertEqual(MODULE.executor_execution_state(
                launcher_started=True, containment={"state": "PASS"},
                telemetry_path=path), "EXECUTOR_STARTED")

            path.write_text('{"phase":"' + ('x' * MODULE.EXECUTOR_PROOF_MAX_BYTES) +
                            '","schemaVersion":1}\n')
            self.assertEqual(MODULE.executor_execution_state(
                launcher_started=True, containment={"state": "PASS"},
                telemetry_path=path), "EXECUTOR_STATE_INCONCLUSIVE")

    def test_kill_failure_is_bounded_and_keeps_recovery_pending(self):
        child = self.FakeChild()
        active = {"state": "ACTIVE", "properties": {"ActiveState": "active"},
                  "cgroupMembers": 1, "cgroupAbsent": False}
        with tempfile.TemporaryFile() as evidence, \
                mock.patch.object(MODULE, "scope_termination_snapshot",
                                  return_value=active), \
                mock.patch.object(MODULE, "kill_scope", return_value=False):
            started = MODULE.time.monotonic()
            result = MODULE.close_supervised_scope(
                "re7-capacity-audit-exact.scope", {"state": "PASS"}, child,
                evidence.fileno(), deadline_seconds=0)
            elapsed = MODULE.time.monotonic() - started
        self.assertEqual(result["state"], "RECOVERY_PENDING")
        self.assertEqual(result["killAttempts"], [
            {"signal": "SIGTERM", "succeeded": False},
            {"signal": "SIGKILL", "succeeded": False},
        ])
        self.assertLess(elapsed, 1)
        self.assertFalse(child.terminated)
        self.assertFalse(child.killed)

    def test_launcher_exit_with_live_descendant_closes_exact_scope(self):
        child = self.FakeChild(code=0)
        active = {"state": "ACTIVE", "properties": {"ActiveState": "active"},
                  "cgroupMembers": 1, "cgroupAbsent": False}
        stopped = {"state": "TERMINATED_CONFIRMED",
                   "properties": {"ActiveState": "failed", "LoadState": "loaded"},
                   "cgroupMembers": 0, "cgroupAbsent": False}
        with tempfile.TemporaryFile() as evidence, \
                mock.patch.object(MODULE, "scope_termination_snapshot",
                                  side_effect=[active, stopped]), \
                mock.patch.object(MODULE, "kill_scope", return_value=True) as killed:
            result = MODULE.close_supervised_scope(
                "re7-capacity-audit-exact.scope", {"state": "PASS"}, child,
                evidence.fileno(), deadline_seconds=1)
        self.assertEqual(result["state"], "TERMINATED_CONFIRMED")
        killed.assert_called_once_with("re7-capacity-audit-exact.scope", "SIGTERM")

    def test_post_launch_exception_after_containment_closes_scope(self):
        with tempfile.TemporaryDirectory(prefix="capacity-post-launch-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=root / "plan", telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=256 * 1024 * 1024, timeout_seconds=10,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            child = self.FakeChild()
            active = {"state": "ACTIVE", "properties": {"ActiveState": "active"},
                      "cgroupMembers": 1, "cgroupAbsent": False}
            stopped = {"state": "TERMINATED_CONFIRMED",
                       "properties": {"ActiveState": "failed", "LoadState": "loaded",
                                      "Result": "failed"},
                       "cgroupMembers": 0, "cgroupAbsent": False}

            def launch(*_unused, **_ignored):
                args.containment_output.write_text(json.dumps({
                    "schemaVersion": 1, "state": "PASS",
                    "unit": "re7-capacity-audit-test.scope",
                    "cgroup": "/user.slice/re7-capacity-audit-test.scope",
                }) + "\n")
                args.containment_output.chmod(0o600)
                args.telemetry_output.write_text(
                    '{"phase":"telemetry_started","schemaVersion":1}\n')
                args.telemetry_output.chmod(0o600)
                return child

            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE, "contained_scope_unit",
                                      return_value="re7-capacity-audit-test.scope"), \
                    mock.patch.object(MODULE.subprocess, "Popen", side_effect=launch), \
                    mock.patch.object(MODULE, "scope_memory_snapshot",
                                      side_effect=RuntimeError("sample failed")), \
                    mock.patch.object(MODULE, "scope_termination_snapshot",
                                      side_effect=[active, stopped]), \
                    mock.patch.object(MODULE, "kill_scope", return_value=True), \
                    mock.patch.object(MODULE, "cleanup_scope", return_value=True), \
                    self.assertRaises(SystemExit) as exited:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(exited.exception.code, 78)
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["reason"], "AUDIT_POST_LAUNCH_FAILURE")
            self.assertEqual(terminal["executorState"], "EXECUTOR_STARTED")
            self.assertEqual(terminal["terminationState"], "TERMINATED_CONFIRMED")
            self.assertTrue(child.terminated)

    def test_post_launch_unconfirmed_termination_is_recovery_pending(self):
        with tempfile.TemporaryDirectory(prefix="capacity-recovery-pending-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=root / "plan", telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=256 * 1024 * 1024, timeout_seconds=10,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            child = self.FakeChild()

            def launch(*_unused, **_ignored):
                args.containment_output.write_text(json.dumps({
                    "schemaVersion": 1, "state": "PASS", "unit": "exact.scope",
                    "cgroup": "/user.slice/exact.scope",
                }) + "\n")
                args.containment_output.chmod(0o600)
                args.telemetry_output.write_text(
                    '{"phase":"telemetry_started","schemaVersion":1}\n')
                args.telemetry_output.chmod(0o600)
                return child

            pending = {"state": "RECOVERY_PENDING",
                       "scope": {"state": "ACTIVE",
                                 "properties": {"ActiveState": "active"},
                                 "cgroupMembers": 1},
                       "killAttempts": [{"signal": "SIGKILL", "succeeded": False}],
                       "launcherExitCode": None, "evidenceErrors": 0}
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE.subprocess, "Popen", side_effect=launch), \
                    mock.patch.object(MODULE, "scope_memory_snapshot",
                                      side_effect=RuntimeError("sample failed")), \
                    mock.patch.object(MODULE, "close_supervised_scope",
                                      return_value=pending), \
                    self.assertRaises(SystemExit) as exited:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(exited.exception.code, 78)
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["state"], "RECOVERY_PENDING")
            self.assertEqual(terminal["reason"], "AUDIT_RECOVERY_PENDING")
            self.assertEqual(terminal["executorState"], "EXECUTOR_STARTED")
            self.assertFalse(terminal["scopeCleanupOk"])

    def test_real_normal_child_records_peak_rss_after_wait(self):
        rows, terminal = self.run_real_child(
            "payload=bytearray(8*1024*1024)", 0)
        self.assertEqual([row["phase"] for row in rows], ["before_child", "after_child"])
        self.assertEqual(rows[-1]["exitCode"], 0)
        self.assertGreater(rows[-1]["childRssPeakBytes"], 0)
        self.assertEqual(terminal["childRssPeakBytes"], rows[-1]["childRssPeakBytes"])
        self.assertIsNone(terminal["signal"])

    def test_real_sigkill_child_records_peak_rss_and_signal_after_wait(self):
        rows, terminal = self.run_real_child(
            "import os,signal; payload=bytearray(8*1024*1024); "
            "os.kill(os.getpid(),signal.SIGKILL)", -9)
        self.assertEqual([row["phase"] for row in rows], ["before_child", "after_child"])
        self.assertEqual(rows[-1]["exitCode"], -9)
        self.assertGreater(rows[-1]["childRssPeakBytes"], 0)
        self.assertEqual(terminal["childRssPeakBytes"], rows[-1]["childRssPeakBytes"])
        self.assertEqual(terminal["signal"], 9)

    def test_existing_channel_denies_before_child(self):
        with tempfile.TemporaryDirectory(prefix="capacity-supervisor-") as folder:
            root = Path(folder)
            stdout = root / "stdout"
            stdout.write_text("preserved")
            args = SimpleNamespace(
                action="prepare", plan=Path("/plan"), plan_sha256="a" * 64,
                intent_output=Path("/intent"), commands_output=Path("/commands"),
                manifest_output=Path("/manifest"), telemetry_output=root / "child.jsonl",
                stdout_output=stdout, stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE.subprocess, "Popen") as child, \
                    self.assertRaises(FileExistsError):
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            child.assert_not_called()
            self.assertEqual(stdout.read_text(), "preserved")

    def test_prelaunch_failure_proves_executor_not_started(self):
        with tempfile.TemporaryDirectory(prefix="capacity-supervisor-deny-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=root / "plan", telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=256 * 1024 * 1024, timeout_seconds=10,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE.subprocess, "Popen",
                                      side_effect=OSError("launch denied")), \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, 78)
            self.assertFalse(args.plan_output.exists())
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["reason"], "AUDIT_CONTAINMENT_NOT_APPLIED")
            self.assertEqual(terminal["executorState"], "EXECUTOR_NOT_STARTED")

    def test_prepare_existing_sealed_output_denies_before_child(self):
        with tempfile.TemporaryDirectory(prefix="capacity-prepare-existing-") as folder:
            root = Path(folder)
            intent = root / "intent.json"
            intent.write_text("preserved\n")
            args = SimpleNamespace(
                action="prepare", plan=root / "plan.json", plan_sha256="a" * 64,
                intent_output=intent, commands_output=root / "commands.txt",
                manifest_output=root / "manifest.json",
                telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=512 * 1024 * 1024, timeout_seconds=1800,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE.subprocess, "Popen") as child, \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, 78)
            child.assert_not_called()
            self.assertEqual(intent.read_text(), "preserved\n")
            self.assertFalse(args.commands_output.exists())
            self.assertFalse(args.manifest_output.exists())
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["action"], "prepare")
            self.assertEqual(terminal["executorState"], "EXECUTOR_NOT_STARTED")

    def test_prepare_containment_launch_failure_denies_before_executor(self):
        with tempfile.TemporaryDirectory(prefix="capacity-prepare-deny-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action="prepare", plan=root / "plan.json", plan_sha256="a" * 64,
                intent_output=root / "intent.json", commands_output=root / "commands.txt",
                manifest_output=root / "manifest.json",
                telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=512 * 1024 * 1024, timeout_seconds=1800,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE.subprocess, "Popen",
                                      side_effect=OSError("launch denied")), \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, 78)
            self.assertFalse(args.intent_output.exists())
            self.assertFalse(args.commands_output.exists())
            self.assertFalse(args.manifest_output.exists())
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["action"], "prepare")
            self.assertEqual(terminal["reason"], "AUDIT_CONTAINMENT_NOT_APPLIED")
            self.assertEqual(terminal["executorState"], "EXECUTOR_NOT_STARTED")

    def test_launcher_started_without_proof_is_inconclusive_not_not_started(self):
        with tempfile.TemporaryDirectory(prefix="capacity-supervisor-inconclusive-") as folder:
            root = Path(folder)
            failed_run = root / "systemd-run"
            failed_run.write_text("#!/bin/sh\nexit 1\n")
            failed_run.chmod(0o700)
            args = SimpleNamespace(
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=root / "plan", telemetry_output=root / "child.jsonl",
                containment_output=root / "containment.json",
                memory_max_bytes=256 * 1024 * 1024, timeout_seconds=10,
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")
            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE, "SYSTEMD_RUN", failed_run), \
                    mock.patch.object(MODULE, "trusted_system_binary"), \
                    mock.patch.object(MODULE, "scope_termination_snapshot",
                                      return_value={"state": "TERMINATED_CONFIRMED",
                                                    "properties": {"LoadState": "not-found"},
                                                    "cgroupMembers": None,
                                                    "cgroupAbsent": True}), \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, 78)
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["reason"], "AUDIT_LAUNCH_STATE_INCONCLUSIVE")
            self.assertEqual(terminal["executorState"],
                             "EXECUTOR_STATE_INCONCLUSIVE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
