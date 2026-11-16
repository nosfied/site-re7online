#!/usr/bin/env python3
"""Integrated regressions for the fixed-current finalize request producer."""

from __future__ import annotations

import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]


def module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


deploy_tests = module("finalize_materializer_deploy_fixture",
                      ROOT / "scripts/ci/test-converta-deploy.py")
continuation = module("finalize_materializer_consumer",
                      ROOT / "scripts/fixed-current-finalization-continuation.py")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


class ProducerFixture:
    def __init__(self, test: unittest.TestCase, profile: str = "api_frontend"):
        self.test = test
        self.deploy = deploy_tests.DeployFixture(methodName="runTest")
        self.deploy.setUp()
        if profile == "api":
            self.deploy.api_only()
        elif profile == "api_frontend_worker":
            self.deploy.three_component()
        elif profile != "api_frontend":
            raise ValueError(profile)
        self.base = self.deploy.base
        self.repo = self.base / "control"
        scripts = self.repo / "scripts"
        scripts.mkdir(parents=True)
        for name in (
            "converta-deploy.py", "fixed-current-finalization-continuation.py",
            "fixed-current-finalize-request-materialize.py",
            "pm2-definition-env-allowlist.v1.json", "pm2-definition-control.py",
        ):
            shutil.copyfile(ROOT / "scripts" / name, scripts / name)
            if name.endswith(".py"):
                (scripts / name).chmod(0o600)
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        subprocess.run([
            "git", "-C", str(self.repo), "-c", "user.name=Fixture",
            "-c", "user.email=fixture@example.invalid", "commit", "-qm", "control plane",
        ], check=True)
        self.original_head = self.head()
        original_run = self.deploy.host.run

        def real_checkout(command: list[str], *, timeout: float = 40,
                          pass_fds: tuple[int, ...] = (), env: dict[str, str] | None = None
                          ) -> subprocess.CompletedProcess[str]:
            if command[:3] == ["git", "-C", str(self.repo)]:
                return subprocess.run(command, timeout=timeout, text=True,
                                      capture_output=True, check=False)
            return original_run(command, timeout=timeout, pass_fds=pass_fds, env=env)

        self.deploy.host.run = real_checkout  # type: ignore[method-assign]
        self._bind_control_plane(self.original_head)
        self.deploy.driver.preflight()
        self.deploy.driver.activate()
        self.deploy.acceptance()
        self.custody = self.base / "finalize-custody"
        self.custody.mkdir(mode=0o700)
        self.input = self.custody / "materialization-request.private.json"
        self.output = self.custody / "finalize-request.private.json"
        self.value = self._input_value()
        private_json(self.input, self.value)

    def close(self) -> None:
        self.deploy.tearDown()

    def head(self) -> str:
        return subprocess.run(["git", "-C", str(self.repo), "rev-parse", "HEAD"],
                              check=True, text=True, capture_output=True).stdout.strip()

    @property
    def driver(self) -> Path:
        return self.repo / "scripts/converta-deploy.py"

    @property
    def wrapper(self) -> Path:
        return self.repo / "scripts/fixed-current-finalization-continuation.py"

    @property
    def producer(self) -> Path:
        return self.repo / "scripts/fixed-current-finalize-request-materialize.py"

    def _bind_control_plane(self, head: str) -> None:
        runtime = json.loads(self.deploy.runtime_manifest.read_text())
        runtime["controlPlaneSha"] = head
        private_json(self.deploy.runtime_manifest, runtime)
        self.deploy.control_plane = head
        self.deploy.host.control_plane = head
        self.deploy.inputs = replace(
            self.deploy.inputs, control_plane=head,
            runtime_manifest_sha256=digest(self.deploy.runtime_manifest))
        self.deploy.driver = self.deploy._driver(self.repo)

    def _input_value(self) -> dict[str, object]:
        journal = self.deploy.transaction / "transaction.v1.private.json"
        acceptance = self.deploy.transaction / "acceptance.private.txt"
        return {
            "schemaVersion": 1,
            "action": "materialize_fixed_current_finalize_request",
            "transactionRoot": str(self.deploy.transaction),
            "transactionJournal": str(journal),
            "transactionJournalSha256": digest(journal),
            "acceptance": str(acceptance), "acceptanceSha256": digest(acceptance),
            "lockPath": str(self.deploy.lock), "lockSha256": digest(self.deploy.lock),
            "driver": str(self.driver), "driverSha256": digest(self.driver),
            "wrapper": str(self.wrapper), "wrapperSha256": digest(self.wrapper),
            "finalizeRequestOutput": str(self.output), "optionalAuthorities": {},
        }

    def run(self) -> subprocess.CompletedProcess[str]:
        environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        return subprocess.run([
            sys.executable, "-B", str(self.producer), "--request", str(self.input),
            "--request-sha256", digest(self.input),
        ], text=True, capture_output=True, check=False, env=environment)

    def add_runtime_cache(self) -> Path:
        authority = self.custody / "acceptance-journal.authenticated.private.json"
        authority.write_bytes((self.deploy.transaction / "transaction.v1.private.json").read_bytes())
        authority.chmod(0o600)
        # Advance only the authenticated executor checkout; the transaction keeps
        # the original control plane identity.
        marker = self.repo / "runtime-cache-successor.txt"
        marker.write_text("successor\n")
        subprocess.run(["git", "-C", str(self.repo), "add", marker.name], check=True)
        subprocess.run([
            "git", "-C", str(self.repo), "-c", "user.name=Fixture",
            "-c", "user.email=fixture@example.invalid", "commit", "-qm", "successor",
        ], check=True)
        successor = self.head()
        root = self.deploy.releases / self.deploy.candidate
        journal = json.loads((self.deploy.transaction / "transaction.v1.private.json").read_text())
        retirement = journal["binding"]["generationRetirement"]
        manifest = self.custody / "runtime-cache-reconciliation.private.json"
        private_json(manifest, {
            "schemaVersion": 1,
            "kind": "FIXED_CURRENT_RUNTIME_CACHE_FINALIZE_RECONCILIATION_V1",
            "releaseId": self.deploy.candidate, "targetCommit": self.deploy.target,
            "transactionRoot": str(self.deploy.transaction),
            "indexSha256": digest(root / "index.sha256"),
            "manifestSha256": digest(root / "manifest.json"),
            "retirementIntentSha256": retirement["intentSha256"],
            "originalControlPlane": self.original_head,
            "continuationControlPlane": successor,
            "continuationDriverSha256": digest(self.driver),
            "acceptanceJournal": {"path": str(authority), "sha256": digest(authority)},
            "acceptanceSha256": digest(self.deploy.transaction / "acceptance.private.txt"),
            "lockSha256": digest(self.deploy.lock), "cacheEntries": [],
        })
        self.value["optionalAuthorities"] = {
            "runtimeCacheReconciliation": {"path": str(manifest), "sha256": digest(manifest)}
        }
        self.value["driverSha256"] = digest(self.driver)
        self.value["wrapperSha256"] = digest(self.wrapper)
        private_json(self.input, self.value)
        return manifest


class FixedCurrentFinalizeRequestMaterializerTests(unittest.TestCase):
    def test_profiles_derive_exact_scope_and_consumer_accepts_request(self) -> None:
        for profile, expected in (
            ("api", "api"), ("api_frontend", "api,frontend"),
            ("api_frontend_worker", "api,frontend,worker"),
        ):
            with self.subTest(profile=profile):
                fixture = ProducerFixture(self, profile)
                try:
                    before = fixture.deploy.driver._journal_read()
                    result = fixture.run()
                    self.assertEqual(result.returncode, 0, result.stderr)
                    produced = json.loads(fixture.output.read_text())
                    argv = produced["finalizeArgv"]
                    self.assertEqual(argv[argv.index("--components") + 1], expected)
                    self.assertNotIn("finalizeArgv", fixture.value)
                    self.assertEqual(continuation.load_request(
                        fixture.output, digest(fixture.output)), produced)
                    self.assertEqual(fixture.deploy.driver._journal_read(), before)
                    self.assertEqual(fixture.deploy.host.save_calls, 0)
                finally:
                    fixture.close()

    def test_real_producer_wrapper_driver_chain_finalizes_once_in_isolation(self) -> None:
        fixture = ProducerFixture(self, "api_frontend_worker")
        try:
            result = fixture.run()
            self.assertEqual(result.returncode, 0, result.stderr)
            request = continuation.load_request(fixture.output, digest(fixture.output))
            lock_fd = continuation.acquire_lock(fixture.deploy.lock)

            def real_driver(argv, **kwargs):
                previous = os.environ.get(continuation.LOCK_ENV)
                os.environ[continuation.LOCK_ENV] = kwargs["env"][continuation.LOCK_ENV]
                try:
                    fixture.deploy.driver.finalize()
                finally:
                    if previous is None:
                        os.environ.pop(continuation.LOCK_ENV, None)
                    else:
                        os.environ[continuation.LOCK_ENV] = previous
                return subprocess.CompletedProcess(argv, 0)

            try:
                self.assertEqual(continuation.run(request, lock_fd, runner=real_driver), 0)
                continuation.release_terminal_lock(request, lock_fd)
            finally:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                os.close(lock_fd)
            self.assertEqual(fixture.deploy.host.save_calls, 1)
            self.assertEqual(fixture.deploy.driver._journal_read()["saveCount"], 1)
        finally:
            fixture.close()

    def test_three_component_runtime_cache_successor_is_derived_and_consumed(self) -> None:
        fixture = ProducerFixture(self, "api_frontend_worker")
        try:
            manifest = fixture.add_runtime_cache()
            result = fixture.run()
            self.assertEqual(result.returncode, 0, result.stderr)
            produced = json.loads(fixture.output.read_text())
            argv = produced["finalizeArgv"]
            self.assertEqual(argv[argv.index("--components") + 1], "api,frontend,worker")
            self.assertEqual(argv[argv.index("--runtime-cache-reconciliation") + 1],
                             str(manifest))
            retirement = fixture.deploy.retirement
            assert retirement is not None
            with patch.multiple(
                continuation,
                ED74_RUNTIME_CACHE_RELEASE=fixture.deploy.candidate,
                ED74_RUNTIME_CACHE_TARGET=fixture.deploy.target,
                ED74_RUNTIME_CACHE_TRANSACTION=fixture.deploy.transaction,
                ED74_RUNTIME_CACHE_INTENT_SHA256=retirement.intent_sha256,
            ):
                self.assertEqual(continuation.load_request(
                    fixture.output, digest(fixture.output)), produced)
            self.assertEqual(fixture.deploy.host.save_calls, 0)
        finally:
            fixture.close()

    def test_denies_authority_drift_cross_transaction_arbitrary_argv_and_replay(self) -> None:
        variants = ("sha", "path", "identity", "journal", "scope", "cross", "argv")
        for variant in variants:
            with self.subTest(variant=variant):
                fixture = ProducerFixture(self)
                try:
                    if variant == "sha":
                        fixture.value["acceptanceSha256"] = "0" * 64
                    elif variant == "path":
                        fixture.value["transactionJournal"] = str(
                            fixture.custody / "missing.private.json")
                    elif variant == "identity":
                        fixture.driver.chmod(0o644)
                    elif variant == "journal":
                        journal_path = fixture.deploy.transaction / "transaction.v1.private.json"
                        journal = json.loads(journal_path.read_text()); journal["state"] = "FAILED"
                        private_json(journal_path, journal)
                        fixture.value["transactionJournalSha256"] = digest(journal_path)
                    elif variant == "scope":
                        journal_path = fixture.deploy.transaction / "transaction.v1.private.json"
                        journal = json.loads(journal_path.read_text())
                        journal["binding"]["components"] = ["frontend"]
                        private_json(journal_path, journal)
                        fixture.value["transactionJournalSha256"] = digest(journal_path)
                    elif variant == "cross":
                        other = fixture.base / "other-transaction"; other.mkdir(mode=0o700)
                        copied = other / "transaction.v1.private.json"
                        copied.write_bytes((fixture.deploy.transaction /
                                            "transaction.v1.private.json").read_bytes())
                        copied.chmod(0o600)
                        fixture.value["transactionRoot"] = str(other)
                        fixture.value["transactionJournal"] = str(copied)
                        fixture.value["transactionJournalSha256"] = digest(copied)
                        fixture.value["acceptance"] = str(other / "acceptance.private.txt")
                    else:
                        fixture.value["finalizeArgv"] = ["/bin/true"]
                    private_json(fixture.input, fixture.value)
                    result = fixture.run()
                    self.assertEqual(result.returncode, 2)
                    self.assertFalse(fixture.output.exists())
                finally:
                    fixture.close()

        fixture = ProducerFixture(self)
        try:
            first = fixture.run(); second = fixture.run()
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 2)
            self.assertIn("finalize_request_output", second.stderr)
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
