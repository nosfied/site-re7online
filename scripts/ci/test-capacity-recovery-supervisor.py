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


class SupervisorTests(unittest.TestCase):
    def run_real_child(self, source, expected_code):
        folder = tempfile.TemporaryDirectory(prefix="capacity-supervisor-")
        self.addCleanup(folder.cleanup)
        root = Path(folder.name)
        args = SimpleNamespace(
            action="prepare", plan=Path("/plan"), plan_sha256="a" * 64,
            intent_output=Path("/intent"), commands_output=Path("/commands"),
            manifest_output=Path("/manifest"), telemetry_output=root / "child.jsonl",
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
        self.assertIn(MODULE.INTERNAL_ACTION, argv)
        self.assertNotIn("prepare", argv)
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

    def test_audit_terminal_reasons_are_nominal(self):
        passed = {"state": "PASS"}
        cases = (
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "oom-kill", "containment": passed, "exit_code": -9},
             "AUDIT_MEMORY_MAX"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "timeout", "containment": passed, "exit_code": -9},
             "AUDIT_TIMEOUT"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": None, "containment": None, "exit_code": 1},
             "AUDIT_CONTAINMENT_NOT_APPLIED"),
            ({"received_signal": None, "fail_safe_kill": False,
              "scope_result": "success", "containment": passed, "exit_code": 0},
             "COMPLETED"),
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

    def test_audit_scope_launch_failure_denies_before_executor(self):
        with tempfile.TemporaryDirectory(prefix="capacity-supervisor-deny-") as folder:
            root = Path(folder)
            failed_run = root / "systemd-run"
            executor_marker = root / "executor-ran"
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
                    mock.patch.object(MODULE, "scope_properties",
                                      return_value={"LoadState": "not-found"}), \
                    mock.patch.object(MODULE, "executor_argv",
                                      return_value=["/bin/sh", "-c",
                                                    f"touch {executor_marker}"]), \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, 78)
            self.assertFalse(executor_marker.exists())
            self.assertFalse(args.plan_output.exists())
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["reason"], "AUDIT_CONTAINMENT_NOT_APPLIED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
