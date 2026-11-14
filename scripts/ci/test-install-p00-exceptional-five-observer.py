#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
from unittest import mock
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "install_p00_exceptional_five_tests",
    ROOT / "install-capacity-proc-observer-p00-exceptional-five.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InstallerTest(unittest.TestCase):
    def fixture(self, raw):
        root = Path(raw)
        target_parent = root / "usr/local/libexec/re7online"
        target_parent.mkdir(parents=True, mode=0o755)
        target = target_parent / "capacity-proc-observer.py"
        target.write_bytes(b"predecessor\n"); target.chmod(0o500)
        source = root / "source.py"
        source.write_bytes(b"successor\n"); source.chmod(0o600)
        sudoers = root / "sudoers"
        sudoers.write_bytes(b"sudoers\n"); sudoers.chmod(0o440)
        predecessor_raw, predecessor_info = MODULE.stable(target, None, {0o500})
        predecessor = {"path": str(target), "sha256": hashlib.sha256(predecessor_raw).hexdigest(),
                       "device": predecessor_info.st_dev, "inode": predecessor_info.st_ino,
                       "uid": predecessor_info.st_uid, "gid": predecessor_info.st_gid,
                       "mode": "0500"}
        return source, target, sudoers, predecessor

    def bindings(self, source, target, sudoers, predecessor):
        return mock.patch.multiple(
            MODULE, SOURCE=source, SOURCE_SHA256=hashlib.sha256(source.read_bytes()).hexdigest(),
            TARGET=target, TEMPORARY=target.with_name(".capacity-proc-observer.py.p00-five.installing"),
            SUDOERS=sudoers, SUDOERS_SHA256=hashlib.sha256(sudoers.read_bytes()).hexdigest(),
            PREDECESSOR=predecessor, ROOT_UID=os.geteuid(), ROOT_GID=os.getegid())

    def test_installs_atomically_and_preserves_sudoers(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            sudoers_before = sudoers.read_bytes()
            with self.bindings(source, target, sudoers, predecessor):
                result = MODULE.install()
                recovered = MODULE.install()
            self.assertEqual(result["state"], "INSTALLED")
            self.assertEqual(recovered["state"], "RECOVERED_ALREADY_INSTALLED")
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o500)
            self.assertEqual(sudoers.read_bytes(), sudoers_before)
            self.assertFalse(result["sudoersChanged"])

    def test_interrupted_partial_is_replaced_before_atomic_publish(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            temporary = target.with_name(".capacity-proc-observer.py.p00-five.installing")
            temporary.write_bytes(b"partial"); temporary.chmod(0o500)
            with self.bindings(source, target, sudoers, predecessor):
                result = MODULE.install()
            self.assertEqual(result["state"], "INSTALLED")
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertFalse(temporary.exists())

    def test_unknown_predecessor_is_denied_without_replacement(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            original = target.read_bytes()
            predecessor["sha256"] = "0" * 64
            with self.bindings(source, target, sudoers, predecessor):
                with self.assertRaisesRegex(RuntimeError, "PREVIOUS_HELPER_NOT_ALLOWED"):
                    MODULE.install()
            self.assertEqual(target.read_bytes(), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
