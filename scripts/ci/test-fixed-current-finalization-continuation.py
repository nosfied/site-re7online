#!/usr/bin/env python3
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/fixed-current-finalization-continuation.py"
SPEC = importlib.util.spec_from_file_location("fixed_current_continuation", MODULE_PATH)
CONTINUATION = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(CONTINUATION)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


class Fixture:
    def __init__(self, root: Path):
        self.root = root
        self.tx = root / "transaction"; self.tx.mkdir(mode=0o700)
        self.lock = root / "deploy.lock"; self.lock.write_text("binding\n"); self.lock.chmod(0o600)
        self.driver = root / "converta-deploy.py"; self.driver.write_text("# driver\n"); self.driver.chmod(0o600)
        self.request_path = root / "request.private.json"
        self.request = {
            "schemaVersion": 1, "action": "finalize", "lockPath": str(self.lock),
            "transactionRoot": str(self.tx), "driver": str(self.driver),
            "driverSha256": digest(self.driver),
            "finalizeArgv": ["/usr/bin/python3", "-B", str(self.driver), "finalize", "--release", "immutable-test"],
        }
        private_json(self.request_path, self.request)

    def lock_fd(self) -> int:
        return CONTINUATION.acquire_lock(self.lock)


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.fixture = Fixture(Path(self.temporary.name))

    def tearDown(self):
        try:
            os.close(CONTINUATION.LOCK_FD)
        except OSError:
            pass
        self.temporary.cleanup()

    def test_absent_outputs_open_exclusively_and_child_receives_fds(self):
        lock_fd = self.fixture.lock_fd()
        observed = {}

        def runner(argv, **kwargs):
            observed.update(argv=argv, kwargs=kwargs)
            os.write(kwargs["stdout"], b"stdout-complete\n")
            os.write(kwargs["stderr"], b"stderr-complete\n")
            return subprocess.CompletedProcess(argv, 7)

        code = CONTINUATION.run(self.fixture.request, lock_fd, runner=runner)
        self.assertEqual(code, 7)
        self.assertEqual(observed["argv"][3], "finalize")
        self.assertEqual(observed["kwargs"]["pass_fds"], (CONTINUATION.LOCK_FD,))
        self.assertEqual(observed["kwargs"]["env"][CONTINUATION.LOCK_ENV], "1")
        self.assertEqual((self.fixture.tx / "fixed-current-finalize-continuation.stdout.private.txt").read_text(), "stdout-complete\n")
        self.assertEqual((self.fixture.tx / "fixed-current-finalize-continuation.stderr.private.txt").read_text(), "stderr-complete\n")
        self.assertEqual((self.fixture.tx / "fixed-current-finalize-continuation.exit.private.txt").read_text(), "7\n")
        self.assertTrue(self.fixture.lock.is_file())
        CONTINUATION.validate_lock(self.fixture.lock, lock_fd)

    def test_existing_stdout_or_stderr_denies_before_subprocess(self):
        for name in ("stdout", "stderr"):
            with self.subTest(name=name):
                self.tearDown(); self.setUp()
                path = self.fixture.tx / f"fixed-current-finalize-continuation.{name}.private.txt"
                path.write_text("existing\n"); path.chmod(0o600)
                called = False
                def runner(*args, **kwargs):
                    nonlocal called; called = True
                    return subprocess.CompletedProcess(args, 0)
                with self.assertRaisesRegex(CONTINUATION.Denied, "evidence_exists"):
                    CONTINUATION.run(self.fixture.request, self.fixture.lock_fd(), runner=runner)
                self.assertFalse(called)

    def test_symlink_output_denies_before_subprocess(self):
        target = self.fixture.root / "target"; target.write_text("")
        path = self.fixture.tx / "fixed-current-finalize-continuation.stdout.private.txt"
        path.symlink_to(target)
        called = False
        def runner(*args, **kwargs):
            nonlocal called; called = True
            return subprocess.CompletedProcess(args, 0)
        with self.assertRaisesRegex(CONTINUATION.Denied, "evidence_exists"):
            CONTINUATION.run(self.fixture.request, self.fixture.lock_fd(), runner=runner)
        self.assertFalse(called)

    def test_second_open_failure_closes_first_and_never_runs_child(self):
        first_fd = None
        calls = 0
        real_open = CONTINUATION._open_exclusive

        def controlled(path):
            nonlocal first_fd, calls
            calls += 1
            if calls == 2:
                raise CONTINUATION.Denied("injected_second_open")
            result = real_open(path)
            if calls == 1:
                first_fd = result
            return result

        with patch.object(CONTINUATION, "_open_exclusive", side_effect=controlled):
            with self.assertRaisesRegex(CONTINUATION.Denied, "injected_second_open"):
                CONTINUATION.run(self.fixture.request, self.fixture.lock_fd(),
                                 runner=lambda *args, **kwargs: self.fail("child executed"))
        self.assertIsNotNone(first_fd)
        with self.assertRaises(OSError):
            os.fstat(first_fd)

    def test_lock_not_held_or_wrong_inode_denies(self):
        for variant in ("unlocked", "inode"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                source = self.fixture.lock
                if variant == "inode":
                    source = self.fixture.root / "other.lock"; source.write_text(""); source.chmod(0o600)
                fd = os.open(source, os.O_RDWR | os.O_NOFOLLOW)
                if fd != CONTINUATION.LOCK_FD:
                    os.dup2(fd, CONTINUATION.LOCK_FD, inheritable=True); os.close(fd)
                else:
                    os.set_inheritable(fd, True)
                predicate = "external_lock_not_held" if variant == "unlocked" else "external_lock_identity"
                with self.assertRaisesRegex(CONTINUATION.Denied, predicate):
                    CONTINUATION.validate_lock(self.fixture.lock)

    def test_second_holder_is_denied_and_lock_file_is_preserved(self):
        self.fixture.lock_fd()
        probe = os.open(self.fixture.lock, os.O_RDWR | os.O_NOFOLLOW)
        try:
            with self.assertRaises(BlockingIOError):
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(probe)
        self.assertTrue(self.fixture.lock.is_file())

    def terminal_journal(self, *, state: str = "DEPLOYED_SANITIZED") -> Path:
        path = self.fixture.tx / "transaction.v1.private.json"
        private_json(path, {
            "state": state,
            "saveCount": 1,
            "deployedMarkerCreated": True,
            "generationRetirementState": state,
            "lockDigest": digest(self.fixture.lock),
            "finalize": {"lockReleaseStarted": True},
        })
        return path

    def test_terminal_finalize_releases_existing_lock_after_authenticated_state(self):
        journal = self.terminal_journal()
        lock_fd = self.fixture.lock_fd()
        receipt = CONTINUATION.release_terminal_lock(self.fixture.request, lock_fd)
        self.assertFalse(self.fixture.lock.exists())
        self.assertEqual(receipt["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(receipt["transactionJournalSha256"], digest(journal))

    def test_nonterminal_or_divergent_lock_is_preserved(self):
        for variant in ("state", "digest"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                journal = self.terminal_journal(
                    state="AWAITING_ACCEPTANCE" if variant == "state" else "DEPLOYED_SANITIZED")
                if variant == "digest":
                    value = json.loads(journal.read_text())
                    value["lockDigest"] = "0" * 64
                    private_json(journal, value)
                lock_fd = self.fixture.lock_fd()
                with self.assertRaises(CONTINUATION.Denied):
                    CONTINUATION.release_terminal_lock(self.fixture.request, lock_fd)
                self.assertTrue(self.fixture.lock.is_file())

    def test_release_terminal_lock_request_is_closed_and_hash_bound(self):
        journal = self.terminal_journal()
        receipt = self.fixture.root / "receipt.private.json"
        request = {
            "schemaVersion": 1,
            "action": "release_terminal_lock",
            "lockPath": str(self.fixture.lock),
            "transactionRoot": str(self.fixture.tx),
            "transactionJournalSha256": digest(journal),
            "lockSha256": digest(self.fixture.lock),
            "receiptOutput": str(receipt),
        }
        private_json(self.fixture.request_path, request)
        loaded = CONTINUATION.load_request(
            self.fixture.request_path, digest(self.fixture.request_path))
        lock_fd = self.fixture.lock_fd()
        result = CONTINUATION.release_terminal_lock(loaded, lock_fd)
        self.assertFalse(self.fixture.lock.exists())
        self.assertTrue(receipt.is_file())
        self.assertEqual(result, json.loads(receipt.read_text()))

    def test_request_rejects_non_finalize_action(self):
        self.fixture.request["finalizeArgv"][3] = "activate"
        private_json(self.fixture.request_path, self.fixture.request)
        with self.assertRaisesRegex(CONTINUATION.Denied, "request_finalize_argv"):
            CONTINUATION.load_request(self.fixture.request_path, digest(self.fixture.request_path))


if __name__ == "__main__":
    unittest.main(verbosity=2)
