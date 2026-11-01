#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

TOOL = Path(__file__).resolve().parents[1] / "capacity-recovery-supervisor.py"
SPEC = importlib.util.spec_from_file_location("capacity_recovery_supervisor", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SupervisorTests(unittest.TestCase):
    def test_closed_argv_always_uses_canonical_executor(self):
        args = SimpleNamespace(action="audit", request=Path("/request"),
                               request_sha256="a" * 64, plan_output=Path("/plan"),
                               telemetry_output=Path("/telemetry"))
        argv = MODULE.executor_argv(args)
        self.assertEqual(argv[:4], ["/usr/bin/python3", "-B", str(MODULE.EXECUTOR), "audit"])
        self.assertNotIn("-c", argv)
        self.assertEqual(argv[-2:], ["--telemetry-output", "/telemetry"])

    def test_post_signal_cgroup_snapshot_and_terminal_marker_are_durable(self):
        with tempfile.TemporaryDirectory(prefix="capacity-supervisor-") as folder:
            root = Path(folder)
            args = SimpleNamespace(
                action="audit", request=Path("/request"), request_sha256="a" * 64,
                plan_output=Path("/plan"), telemetry_output=root / "child.jsonl",
                stdout_output=root / "stdout", stderr_output=root / "stderr",
                terminal_output=root / "terminal.json",
                supervisor_telemetry_output=root / "supervisor.jsonl")

            class Killed:
                pid = 4321
                def __init__(self, *_args, **_kwargs): pass
                def wait(self): return -9
                def poll(self): return -9
                def send_signal(self, _signal): raise AssertionError("already terminal")

            with mock.patch.object(MODULE, "parser") as parser, \
                    mock.patch.object(MODULE.subprocess, "Popen", Killed), \
                    mock.patch.object(MODULE.signal, "signal", return_value=None), \
                    mock.patch.object(MODULE, "memory_snapshot", return_value={
                        "memoryCurrentBytes": 123, "memoryPeakBytes": 456,
                        "memoryEvents": {"oom_kill": 1}}), \
                    self.assertRaises(SystemExit) as stopped:
                parser.return_value.parse_args.return_value = args
                MODULE.main()
            self.assertEqual(stopped.exception.code, -9)
            rows = [json.loads(line) for line in
                    args.supervisor_telemetry_output.read_text().splitlines()]
            self.assertEqual([row["phase"] for row in rows], ["before_child", "after_child"])
            self.assertEqual(rows[-1]["exitCode"], -9)
            self.assertEqual(rows[-1]["memoryEvents"]["oom_kill"], 1)
            terminal = json.loads(args.terminal_output.read_text())
            self.assertEqual(terminal["signal"], 9)
            self.assertEqual(terminal["exitCode"], -9)

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
