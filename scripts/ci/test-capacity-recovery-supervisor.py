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
            action="audit", request=Path("/request"), request_sha256="a" * 64,
            plan_output=Path("/plan"), telemetry_output=root / "child.jsonl",
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
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=Path("/plan"), telemetry_output=root / "child.jsonl",
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
