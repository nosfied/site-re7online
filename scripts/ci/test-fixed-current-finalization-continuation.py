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

    def runtime_cache_request(self, attempt: int = 1) -> tuple[dict[str, str], dict[str, object]]:
        outputs = {
            name: str(self.tx / f"runtime-cache-finalize-v1-attempt-{attempt:02d}.{name}.private.txt")
            for name in ("stdout", "stderr", "exit")
        }
        self.request["action"] = "finalize_runtime_cache_continuation"
        self.request["attemptOrdinal"] = attempt
        self.request["evidenceOutputs"] = outputs
        reconciliation = self.root / "runtime-cache-reconciliation.private.json"
        private_json(reconciliation, {"schemaVersion": 1})
        self.request["finalizeArgv"].extend([
            "--target", "a" * 40,
            "--transaction-root", str(self.tx),
            "--generation-retirement-intent-sha256", "b" * 64,
            "--runtime-cache-reconciliation", str(reconciliation),
            "--runtime-cache-reconciliation-sha256", digest(reconciliation),
        ])
        private_json(self.request_path, self.request)
        return outputs, {
            "RUNTIME_CACHE_RELEASE": "immutable-test",
            "RUNTIME_CACHE_TARGET": "a" * 40,
            "RUNTIME_CACHE_TRANSACTION": self.tx,
            "RUNTIME_CACHE_INTENT_SHA256": "b" * 64,
        }

    def finalize_continuation_request(self, attempt: int = 2) -> tuple[Path, dict[str, str]]:
        repo = self.root / "control-plane"
        scripts = repo / "scripts"
        scripts.mkdir(parents=True)
        checkout_driver = scripts / "converta-deploy.py"
        checkout_driver.write_bytes(self.driver.read_bytes())
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "add", "scripts/converta-deploy.py"], check=True)
        subprocess.run([
            "git", "-C", str(repo), "-c", "user.name=Fixture",
            "-c", "user.email=fixture@example.invalid", "commit", "-qm", "control plane",
        ], check=True)
        control_plane = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], check=True,
            text=True, capture_output=True).stdout.strip()
        checkout_driver.chmod(0o600)

        self.request["finalizeArgv"].extend(["--control-plane", control_plane])
        prior_request = self.root / "prior-request.private.json"
        private_json(prior_request, self.request)
        prior_paths = {
            name: self.tx / f"fixed-current-finalize-continuation.{name}.private.txt"
            for name in ("stdout", "stderr", "exit")
        }
        prior_paths["stdout"].write_text("")
        prior_paths["stderr"].write_text("DEPLOY_DENY:control_plane_identity\n")
        prior_paths["exit"].write_text("2\n")
        for path in prior_paths.values():
            path.chmod(0o600)
        journal = self.tx / "transaction.v1.private.json"
        private_json(journal, {
            "state": "FAILED", "recoveryAction": "finalize", "saveCount": 0,
        })
        outputs = {
            name: str(self.tx /
                      f"fixed-current-finalize-continuation-attempt-{attempt:02d}.{name}.private.txt")
            for name in ("stdout", "stderr", "exit")
        }
        self.request = {
            "schemaVersion": 1, "action": "finalize_continuation",
            "attemptOrdinal": attempt, "lockPath": str(self.lock),
            "transactionRoot": str(self.tx), "driver": str(checkout_driver),
            "driverSha256": digest(checkout_driver),
            "evidenceOutputs": outputs,
            "finalizeArgv": [
                "/usr/bin/python3", "-B", str(checkout_driver), "finalize",
                "--release", "immutable-test", "--control-plane", control_plane,
            ],
            "recovery": {
                "priorRequest": str(prior_request),
                "priorRequestSha256": digest(prior_request),
                "negativeJournal": str(journal),
                "negativeJournalSha256": digest(journal),
                "priorEvidence": {
                    name: {"path": str(path), "sha256": digest(path)}
                    for name, path in prior_paths.items()
                },
            },
        }
        private_json(self.request_path, self.request)
        return repo, outputs

    def fa10_cache_continuation_request(self) -> tuple[dict[str, object], dict[str, str], Path]:
        repo, ordinal2_outputs = self.finalize_continuation_request(attempt=2)
        original_head = self.request["finalizeArgv"][
            self.request["finalizeArgv"].index("--control-plane") + 1]
        target = "a" * 40
        intent_sha256 = "b" * 64
        self.request["finalizeArgv"].extend([
            "--target", target,
            "--transaction-root", str(self.tx),
            "--generation-retirement-intent-sha256", intent_sha256,
        ])
        ordinal2_request = self.root / "ordinal-02-request.private.json"
        private_json(ordinal2_request, self.request)
        for name, path_value in ordinal2_outputs.items():
            path = Path(path_value)
            path.write_text("2\n" if name == "exit" else
                            ("DEPLOY_DENY:runtime_cache_reconciliation_binding\n"
                             if name == "stderr" else ""))
            path.chmod(0o600)

        driver = repo / "scripts/converta-deploy.py"
        driver.write_text("# successor driver\n")
        subprocess.run(["git", "-C", str(repo), "add", "scripts/converta-deploy.py"], check=True)
        subprocess.run([
            "git", "-C", str(repo), "-c", "user.name=Fixture",
            "-c", "user.email=fixture@example.invalid", "commit", "-qm", "successor",
        ], check=True)
        successor_head = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], check=True,
            text=True, capture_output=True).stdout.strip()
        driver.chmod(0o600)
        reconciliation = self.root / "fa10-runtime-cache-reconciliation.private.json"
        private_json(reconciliation, {
            "schemaVersion": 1,
            "kind": CONTINUATION.RUNTIME_CACHE_RECONCILIATION_KIND,
            "releaseId": "immutable-test",
            "targetCommit": target,
            "transactionRoot": str(self.tx),
            "indexSha256": "c" * 64,
            "manifestSha256": "d" * 64,
            "retirementIntentSha256": intent_sha256,
            "originalControlPlane": original_head,
            "continuationControlPlane": successor_head,
            "continuationDriverSha256": digest(driver),
            "negativeJournal": {"path": str(self.tx / "negative.private.json"),
                                "sha256": "e" * 64},
            "acceptanceSha256": "f" * 64,
            "lockSha256": "1" * 64,
            "cacheEntries": [],
        })
        outputs = {
            name: str(self.tx /
                      f"fixed-current-finalize-continuation-attempt-03.{name}.private.txt")
            for name in ("stdout", "stderr", "exit")
        }
        journal = self.tx / "transaction.v1.private.json"
        private_json(journal, {
            "state": "FAILED", "recoveryAction": "finalize", "saveCount": 0,
            "failure": "runtime_cache_reconciliation_binding",
        })
        current_argv = [
            "/usr/bin/python3", "-B", str(driver), "finalize",
            *self.request["finalizeArgv"][4:],
            "--runtime-cache-reconciliation", str(reconciliation),
            "--runtime-cache-reconciliation-sha256", digest(reconciliation),
        ]
        self.request = {
            "schemaVersion": 1, "action": "finalize_continuation",
            "attemptOrdinal": 3, "lockPath": str(self.lock),
            "transactionRoot": str(self.tx), "driver": str(driver),
            "driverSha256": digest(driver), "evidenceOutputs": outputs,
            "finalizeArgv": current_argv,
            "recovery": {
                "priorRequest": str(ordinal2_request),
                "priorRequestSha256": digest(ordinal2_request),
                "negativeJournal": str(journal),
                "negativeJournalSha256": digest(journal),
                "priorEvidence": {
                    name: {"path": path, "sha256": digest(Path(path))}
                    for name, path in ordinal2_outputs.items()
                },
            },
        }
        private_json(self.request_path, self.request)
        constants = {
            "FA10_RUNTIME_CACHE_RELEASE": "immutable-test",
            "FA10_RUNTIME_CACHE_TARGET": target,
            "FA10_RUNTIME_CACHE_TRANSACTION": self.tx,
            "FA10_RUNTIME_CACHE_INTENT_SHA256": intent_sha256,
        }
        return constants, outputs, ordinal2_request

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

    def test_runtime_cache_continuation_uses_three_new_exclusive_outputs(self):
        old = self.fixture.tx / "fixed-current-finalize-continuation.stdout.private.txt"
        old.write_text("preserved negative evidence\n"); old.chmod(0o600)
        outputs, constants = self.fixture.runtime_cache_request()
        with patch.multiple(CONTINUATION, **constants):
            loaded = CONTINUATION.load_request(
                self.fixture.request_path, digest(self.fixture.request_path))
        lock_fd = self.fixture.lock_fd()

        def runner(argv, **kwargs):
            os.write(kwargs["stdout"], b"terminal\n")
            return subprocess.CompletedProcess(argv, 0)

        self.assertEqual(CONTINUATION.run(loaded, lock_fd, runner=runner), 0)
        self.assertEqual(old.read_text(), "preserved negative evidence\n")
        self.assertEqual(Path(outputs["stdout"]).read_text(), "terminal\n")
        self.assertEqual(Path(outputs["stderr"]).read_text(), "")
        self.assertEqual(Path(outputs["exit"]).read_text(), "0\n")
        self.assertTrue(self.fixture.lock.is_file())

    def test_runtime_cache_continuation_rejects_crossed_or_reused_outputs(self):
        for variant in ("outside", "duplicate", "legacy"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                outputs, constants = self.fixture.runtime_cache_request()
                if variant == "outside":
                    self.fixture.request["evidenceOutputs"]["stdout"] = str(
                        self.fixture.root / "outside.private.txt")
                elif variant == "duplicate":
                    self.fixture.request["evidenceOutputs"]["stderr"] = outputs["stdout"]
                else:
                    self.fixture.request["evidenceOutputs"]["exit"] = str(
                        self.fixture.tx / "fixed-current-finalize-continuation.exit.private.txt")
                private_json(self.fixture.request_path, self.fixture.request)
                with patch.multiple(CONTINUATION, **constants):
                    with self.assertRaisesRegex(CONTINUATION.Denied, "request_evidence_outputs"):
                        CONTINUATION.load_request(
                            self.fixture.request_path, digest(self.fixture.request_path))

    def test_finalize_continuation_authenticates_checkout_and_preserves_prior_evidence(self):
        _, outputs = self.fixture.finalize_continuation_request()
        loaded = CONTINUATION.load_request(
            self.fixture.request_path, digest(self.fixture.request_path))
        prior = self.fixture.tx / "fixed-current-finalize-continuation.stderr.private.txt"
        prior_raw = prior.read_bytes()

        def runner(argv, **kwargs):
            os.write(kwargs["stdout"], b"terminal\n")
            return subprocess.CompletedProcess(argv, 0)

        self.assertEqual(CONTINUATION.run(loaded, self.fixture.lock_fd(), runner=runner), 0)
        self.assertEqual(prior.read_bytes(), prior_raw)
        self.assertEqual(Path(outputs["stdout"]).read_text(), "terminal\n")
        self.assertEqual(Path(outputs["stderr"]).read_text(), "")
        self.assertEqual(Path(outputs["exit"]).read_text(), "0\n")

    def test_finalize_continuation_rejects_private_driver_or_divergent_head(self):
        for variant in ("private", "head"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                repo, _ = self.fixture.finalize_continuation_request()
                if variant == "private":
                    self.fixture.request["driver"] = str(self.fixture.driver)
                    self.fixture.request["finalizeArgv"][2] = str(self.fixture.driver)
                else:
                    extra = repo / "extra.txt"
                    extra.write_text("successor\n")
                    subprocess.run(["git", "-C", str(repo), "add", "extra.txt"], check=True)
                    subprocess.run([
                        "git", "-C", str(repo), "-c", "user.name=Fixture",
                        "-c", "user.email=fixture@example.invalid", "commit", "-qm", "successor",
                    ], check=True)
                private_json(self.fixture.request_path, self.fixture.request)
                with self.assertRaisesRegex(CONTINUATION.Denied, "request_driver_checkout"):
                    CONTINUATION.load_request(
                        self.fixture.request_path, digest(self.fixture.request_path))

    def test_finalize_continuation_rejects_driver_mode_sha_and_recovery_drift(self):
        for variant in ("mode", "sha", "journal", "evidence"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                _, _ = self.fixture.finalize_continuation_request()
                driver = Path(self.fixture.request["driver"])
                if variant == "mode":
                    driver.chmod(0o644)
                elif variant == "sha":
                    self.fixture.request["driverSha256"] = "0" * 64
                elif variant == "journal":
                    journal = Path(self.fixture.request["recovery"]["negativeJournal"])
                    value = json.loads(journal.read_text()); value["saveCount"] = 2
                    private_json(journal, value)
                    self.fixture.request["recovery"]["negativeJournalSha256"] = digest(journal)
                else:
                    binding = self.fixture.request["recovery"]["priorEvidence"]["stderr"]
                    binding["sha256"] = "0" * 64
                private_json(self.fixture.request_path, self.fixture.request)
                with self.assertRaises(CONTINUATION.Denied):
                    CONTINUATION.load_request(
                        self.fixture.request_path, digest(self.fixture.request_path))

    def test_finalize_continuation_rejects_occupied_new_destination_before_child(self):
        _, outputs = self.fixture.finalize_continuation_request()
        loaded = CONTINUATION.load_request(
            self.fixture.request_path, digest(self.fixture.request_path))
        Path(outputs["stdout"]).write_text("occupied\n")
        Path(outputs["stdout"]).chmod(0o600)
        called = False
        def runner(*args, **kwargs):
            nonlocal called; called = True
            return subprocess.CompletedProcess(args, 0)
        with self.assertRaisesRegex(CONTINUATION.Denied, "evidence_exists"):
            CONTINUATION.run(loaded, self.fixture.lock_fd(), runner=runner)
        self.assertFalse(called)

    def test_finalize_continuation_accepts_durable_post_save_checkpoint(self):
        self.fixture.finalize_continuation_request()
        journal = Path(self.fixture.request["recovery"]["negativeJournal"])
        value = json.loads(journal.read_text()); value["saveCount"] = 1
        private_json(journal, value)
        self.fixture.request["recovery"]["negativeJournalSha256"] = digest(journal)
        private_json(self.fixture.request_path, self.fixture.request)
        loaded = CONTINUATION.load_request(
            self.fixture.request_path, digest(self.fixture.request_path))
        self.assertEqual(loaded["recovery"]["negativeJournalSha256"], digest(journal))

    def test_finalize_continuation_revalidates_recovery_under_lock(self):
        self.fixture.finalize_continuation_request()
        loaded = CONTINUATION.load_request(
            self.fixture.request_path, digest(self.fixture.request_path))
        journal = Path(loaded["recovery"]["negativeJournal"])
        value = json.loads(journal.read_text()); value["failure"] = "changed-after-load"
        private_json(journal, value)
        called = False
        def runner(*args, **kwargs):
            nonlocal called; called = True
            return subprocess.CompletedProcess(args, 0)
        with self.assertRaisesRegex(CONTINUATION.Denied, "request_recovery_sha256"):
            CONTINUATION.run(loaded, self.fixture.lock_fd(), runner=runner)
        self.assertFalse(called)

    def test_fa10_cache_continuation_binds_ordinal2_and_successor_checkout(self):
        constants, outputs, prior_request = self.fixture.fa10_cache_continuation_request()
        prior_raw = prior_request.read_bytes()
        prior_evidence = {
            name: Path(binding["path"]).read_bytes()
            for name, binding in self.fixture.request["recovery"]["priorEvidence"].items()
        }
        with patch.multiple(CONTINUATION, **constants):
            loaded = CONTINUATION.load_request(
                self.fixture.request_path, digest(self.fixture.request_path))

            def runner(argv, **kwargs):
                os.write(kwargs["stdout"], b"DEPLOYED_RETENTION_INCOMPLETE\n")
                return subprocess.CompletedProcess(argv, 0)

            self.assertEqual(CONTINUATION.run(
                loaded, self.fixture.lock_fd(), runner=runner), 0)
        self.assertEqual(prior_request.read_bytes(), prior_raw)
        for name, binding in self.fixture.request["recovery"]["priorEvidence"].items():
            self.assertEqual(Path(binding["path"]).read_bytes(), prior_evidence[name])
        self.assertEqual(Path(outputs["exit"]).read_text(), "0\n")

    def test_fa10_cache_continuation_rejects_argument_and_chain_drift(self):
        variants = ("missing_pair", "changed_argument", "crossed_prior", "wrong_head",
                    "wrong_driver", "occupied_output")
        for variant in variants:
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                constants, outputs, _ = self.fixture.fa10_cache_continuation_request()
                argv = self.fixture.request["finalizeArgv"]
                if variant == "missing_pair":
                    index = argv.index("--runtime-cache-reconciliation-sha256")
                    del argv[index:index + 2]
                elif variant == "changed_argument":
                    argv[argv.index("--target") + 1] = "9" * 40
                elif variant == "crossed_prior":
                    self.fixture.request["recovery"]["priorRequestSha256"] = "0" * 64
                elif variant == "wrong_head":
                    manifest = Path(argv[argv.index("--runtime-cache-reconciliation") + 1])
                    payload = json.loads(manifest.read_text())
                    payload["continuationControlPlane"] = "9" * 40
                    private_json(manifest, payload)
                    argv[argv.index("--runtime-cache-reconciliation-sha256") + 1] = digest(manifest)
                elif variant == "wrong_driver":
                    manifest = Path(argv[argv.index("--runtime-cache-reconciliation") + 1])
                    payload = json.loads(manifest.read_text())
                    payload["continuationDriverSha256"] = "9" * 64
                    private_json(manifest, payload)
                    argv[argv.index("--runtime-cache-reconciliation-sha256") + 1] = digest(manifest)
                else:
                    Path(outputs["stdout"]).write_text("occupied\n")
                    Path(outputs["stdout"]).chmod(0o600)
                private_json(self.fixture.request_path, self.fixture.request)
                called = False
                def runner(*args, **kwargs):
                    nonlocal called; called = True
                    return subprocess.CompletedProcess(args, 0)
                with patch.multiple(CONTINUATION, **constants):
                    with self.assertRaises(CONTINUATION.Denied):
                        loaded = CONTINUATION.load_request(
                            self.fixture.request_path, digest(self.fixture.request_path))
                        CONTINUATION.run(loaded, self.fixture.lock_fd(), runner=runner)
                self.assertFalse(called)


if __name__ == "__main__":
    unittest.main(verbosity=2)
