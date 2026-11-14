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
    "install_p00_nine_private_tests",
    ROOT / "install-capacity-proc-observer-p00-nine-private-releases.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InstallerTest(unittest.TestCase):
    def fixture(self, raw: str):
        root = Path(raw)
        parent = root / "usr/local/libexec/re7online"; parent.mkdir(parents=True, mode=0o755)
        target = parent / "capacity-proc-observer.py"
        target.write_bytes(b"predecessor\n"); target.chmod(0o500)
        source = root / "source.py"
        source.write_bytes(b"successor\n"); source.chmod(0o600)
        sudoers = root / "sudoers"
        sudoers.write_bytes(b"sudoers\n"); sudoers.chmod(0o440)
        raw_target, info = MODULE.stable(target, None, {0o500})
        predecessor = {"path": str(target), "sha256": hashlib.sha256(raw_target).hexdigest(),
                       "device": info.st_dev, "inode": info.st_ino,
                       "uid": info.st_uid, "gid": info.st_gid, "mode": "0500"}
        return source, target, sudoers, predecessor

    def bindings(self, source: Path, target: Path, sudoers: Path, predecessor: dict):
        return mock.patch.multiple(
            MODULE, SOURCE=source, SOURCE_SHA256=hashlib.sha256(source.read_bytes()).hexdigest(),
            TARGET=target,
            TEMPORARY=target.with_name(".capacity-proc-observer.py.p00-nine-private.installing"),
            SUDOERS=sudoers, SUDOERS_SHA256=hashlib.sha256(sudoers.read_bytes()).hexdigest(),
            PREDECESSOR=predecessor, ROOT_UID=os.geteuid(), ROOT_GID=os.getegid())

    def test_exact_predecessor_installs_and_preserves_sudoers(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            before = sudoers.read_bytes()
            with self.bindings(source, target, sudoers, predecessor):
                result = MODULE.install(); recovered = MODULE.install()
            self.assertEqual(result["state"], "INSTALLED")
            self.assertEqual(recovered["state"], "RECOVERED_ALREADY_INSTALLED")
            self.assertEqual(result["kind"], "P00_NINE_PRIVATE_RELEASES_OBSERVER_INSTALLATION")
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o500)
            self.assertEqual(sudoers.read_bytes(), before)
            self.assertFalse(result["sudoersChanged"])

    def test_divergent_predecessor_is_denied_without_replacement(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            original = target.read_bytes(); predecessor["inode"] += 1
            with self.bindings(source, target, sudoers, predecessor):
                with self.assertRaisesRegex(RuntimeError, "PREVIOUS_HELPER_NOT_ALLOWED"):
                    MODULE.install()
            self.assertEqual(target.read_bytes(), original)

    def test_partial_temporary_is_replaced_atomically(self):
        with tempfile.TemporaryDirectory() as raw:
            source, target, sudoers, predecessor = self.fixture(raw)
            temporary = target.with_name(".capacity-proc-observer.py.p00-nine-private.installing")
            temporary.write_bytes(b"partial"); temporary.chmod(0o500)
            with self.bindings(source, target, sudoers, predecessor):
                MODULE.install()
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertFalse(temporary.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
