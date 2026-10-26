#!/usr/bin/env python3
"""Contract and tamper tests for the external immutable release producer."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
PRODUCER = ROOT / "scripts/converta-release.py"
COMPONENTS = "api,frontend"
EPOCH = "1792713600"
SPEC = importlib.util.spec_from_file_location("converta_release", PRODUCER)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def invoke(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(PRODUCER), *args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)


def write(path: Path, value: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value)
    path.chmod(mode)


def capacity_contract(path: Path, filesystem: Path, target: str, release_id: str,
                      *, reserve_bytes: int = 4096) -> Path:
    value = {
        "schemaVersion": 1,
        "contractId": f"capacity-{release_id}",
        "capturedAtUtc": "2026-10-25T00:00:00Z",
        "targetCommit": target,
        "releaseId": release_id,
        "filesystemPath": str(filesystem.resolve()),
        "buildWorkspaceGrowthBytes": 4096,
        "runtimePayloadBytes": 4096,
        "packageTemporaryBytes": 4096,
        "independentVerificationBytes": 4096,
        "failureEvidenceBytes": 4096,
        "operationalReserveBytes": reserve_bytes,
        "peakInodes": 10,
        "operationalReserveInodes": 10,
    }
    write(path, json.dumps(value, sort_keys=True) + "\n", 0o600)
    return path


def fixture_repo(root: Path) -> tuple[Path, str, dict[str, str]]:
    repo = root / "source"
    repo.mkdir()
    write(repo / "package.json", '{"scripts":{"build":"fixture"}}\n')
    write(repo / "package-lock.json", '{"lockfileVersion":3}\n')
    write(repo / ".gitignore", "node_modules/\n.next/\napps/*/dist/\n")
    write(repo / "next.config.ts", "export default {};\n")
    write(repo / "public/logo.txt", "public\n")
    api = repo / "apps/whatsapp-agent"
    write(api / "package.json", '{"scripts":{"build":"fixture","db:generate":"fixture"}}\n')
    write(api / "package-lock.json", '{"lockfileVersion":3}\n')
    write(api / "src/index.ts", "fixture\n")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Fixture"], cwd=repo, check=True)
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    environment = os.environ.copy()
    environment.update(GIT_AUTHOR_DATE="2026-10-23T00:00:00Z", GIT_COMMITTER_DATE="2026-10-23T00:00:00Z")
    subprocess.run(["git", "commit", "-qm", "fixture"], cwd=repo, check=True, env=environment)
    target = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

    shims = root / "shims"
    shims.mkdir()
    write(shims / "node", "#!/bin/sh\n[ \"$1\" = --version ] && { echo v20.20.0; exit 0; }\nexit 64\n", 0o755)
    npm = r'''#!/bin/sh
set -eu
if [ "${1:-}" = --version ]; then echo 10.8.2; exit 0; fi
case "$PWD:$*" in
  */apps/whatsapp-agent:*db:generate*)
    mkdir -p node_modules/.prisma/client
    printf 'generated\n' > node_modules/.prisma/client/index.js
    ;;
  */apps/whatsapp-agent:*build*)
    mkdir -p dist
    printf 'console.log("api fixture");\n' > dist/index.js
    ;;
  */apps/whatsapp-agent:*ci*)
    mkdir -p node_modules/.bin node_modules/runtime-package
    printf 'runtime\n' > node_modules/runtime-package/index.js
    ln -sf ../runtime-package/index.js node_modules/.bin/runtime-tool
    ;;
  *:*ci*)
    mkdir -p node_modules/.bin node_modules/next/dist/bin
    printf '#!/usr/bin/env node\n' > node_modules/next/dist/bin/next
    chmod 755 node_modules/next/dist/bin/next
    ln -sf ../next/dist/bin/next node_modules/.bin/next
    ;;
  *:*build*)
    mkdir -p .next/static/chunks .next/server
    printf 'fixture-build-id\n' > .next/BUILD_ID
    printf 'asset\n' > .next/static/chunks/app.js
    printf 'server\n' > .next/server/app.js
    ;;
  *) exit 65 ;;
esac
'''
    write(shims / "npm", npm, 0o755)
    environment["PATH"] = f"{shims}:{environment['PATH']}"
    return repo, target, environment


class ReleaseProducerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="converta-release-test-")
        cls.base = Path(cls.temp.name)
        cls.repo, cls.target, cls.env = fixture_repo(cls.base)
        cls.release_id = "immutable-fixture-20261023T000000Z"
        cls.output_a = cls.base / "output-a"
        cls.capacity = capacity_contract(
            cls.base / "capacity.private.json", cls.base, cls.target, cls.release_id
        )
        command = [sys.executable, str(PRODUCER), "build", "--repo", str(cls.repo),
                   "--target", cls.target, "--release-id", cls.release_id,
                   "--components", COMPONENTS, "--output", str(cls.output_a),
                   "--source-date-epoch", EPOCH,
                   "--capacity-contract", str(cls.capacity)]
        result = subprocess.run(["sh", "-c", "umask 077; exec \"$@\"", "fixture", *command],
                                env=cls.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode:
            raise AssertionError((result.stdout, result.stderr))
        cls.release = cls.output_a / cls.release_id
        cls.package = cls.output_a / f"{cls.release_id}.tar.xz"
        # Preserve the original PENDING lifecycle; a separate operator review
        # records why this authenticated fixture is retained for verification.
        raw = (cls.output_a / "generation-lifecycle.private.json").read_bytes()
        write(cls.output_a / "generation-review.private.json", json.dumps({
            "schemaVersion": 1, "generationId": cls.release_id,
            "lifecycleSha256": hashlib.sha256(raw).hexdigest(),
            "decision": "PRESERVE", "reviewer": "synthetic-test",
            "reason": "retained fixture", "evidenceSha256": "a" * 64,
        }) + "\n", 0o600)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def copy_release(self, name: str) -> Path:
        destination = self.base / name / self.release_id
        destination.parent.mkdir()
        shutil.copytree(self.release, destination, symlinks=True)
        return destination

    def verify(self, root: Path) -> subprocess.CompletedProcess[str]:
        return invoke("verify", "--release-root", str(root), "--target", self.target,
                      "--release-id", self.release_id, "--components", COMPONENTS)

    def assert_denied(self, result: subprocess.CompletedProcess[str], predicate: str) -> None:
        self.assertEqual(result.returncode, 2, (result.stdout, result.stderr))
        self.assertIn(f"RELEASE_DENY:{predicate}", result.stderr)

    def test_build_once_verify_and_same_payload_packaging_is_reproducible(self) -> None:
        result = self.verify(self.release)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["result"], "RELEASE VERIFIED")
        package_result = invoke("verify", "--package", str(self.package), "--target", self.target,
                                "--release-id", self.release_id, "--components", COMPONENTS)
        self.assertEqual(package_result.returncode, 0, package_result.stderr)
        packaging = self.base / "same-payload-packaging"
        packaging.mkdir()
        tar_a, tar_b = packaging / "a.tar", packaging / "b.tar"
        self.assertEqual(MODULE.write_tar(self.release, tar_a, int(EPOCH)),
                         MODULE.write_tar(self.release, tar_b, int(EPOCH)))
        self.assertEqual(tar_a.read_bytes(), tar_b.read_bytes())
        package_a, package_b = packaging / "a.tar.xz", packaging / "b.tar.xz"
        self.assertEqual(MODULE.compress_tar(tar_a, package_a),
                         MODULE.compress_tar(tar_b, package_b))
        self.assertEqual(package_a.read_bytes(), package_b.read_bytes())
        self.assertEqual(package_a.read_bytes(), self.package.read_bytes())
        manifest_before = (self.release / "manifest.json").read_bytes()
        index_before = (self.release / "index.sha256").read_bytes()
        self.assertEqual(manifest_before, (self.release / "manifest.json").read_bytes())
        self.assertEqual(index_before, (self.release / "index.sha256").read_bytes())
        lifecycle = json.loads((self.output_a / "generation-lifecycle.private.json").read_text())
        self.assertEqual(lifecycle["state"], "COMPLETE")
        self.assertEqual(lifecycle["classification"], "PENDING")
        self.assertEqual(lifecycle["packageSha256"], hashlib.sha256(self.package.read_bytes()).hexdigest())
        self.assertEqual(stat.S_IMODE((self.output_a / "generation-lifecycle.private.json").stat().st_mode), 0o600)

    def test_failed_command_preserves_private_output_without_printing_it(self) -> None:
        root = self.base / "failed-command-evidence"
        root.mkdir()
        secret_output = "private diagnostic value must not reach stderr\n"
        with self.assertRaises(MODULE.Denied) as caught:
            MODULE.run(
                ["sh", "-c", f"printf '{secret_output}'; exit 37"],
                self.repo,
                os.environ.copy(),
                failure_root=root,
                stage="root_npm_ci",
            )
        message = str(caught.exception)
        evidence = root / "failure-evidence.private"
        metadata_path = evidence / "root_npm_ci.private.json"
        output_path = evidence / "root_npm_ci.output.private.log"
        self.assertIn("command_failed:root_npm_ci", message)
        self.assertIn(f"cwd={self.repo}", message)
        self.assertIn("exit=37", message)
        self.assertIn(f"evidence={metadata_path}", message)
        self.assertNotIn(secret_output.strip(), message)
        self.assertEqual(stat.S_IMODE(evidence.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(metadata_path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(output_path.stat().st_mode), 0o600)
        self.assertEqual(output_path.read_text(), secret_output)
        metadata = json.loads(metadata_path.read_text())
        self.assertEqual(metadata["schemaVersion"], 1)
        self.assertEqual(metadata["stage"], "root_npm_ci")
        self.assertEqual(metadata["cwd"], str(self.repo))
        self.assertEqual(metadata["exitCode"], 37)
        self.assertEqual(metadata["outputFile"], output_path.name)
        self.assertEqual(metadata["outputSize"], len(secret_output.encode()))
        self.assertEqual(metadata["outputSha256"], hashlib.sha256(secret_output.encode()).hexdigest())

    def test_runtime_addition_denied(self) -> None:
        root = self.copy_release("extra")
        write(root / "api-runtime/extra.js", "extra\n")
        self.assert_denied(self.verify(root), "release_index_inventory")

    def test_runtime_removal_denied(self) -> None:
        root = self.copy_release("missing")
        (root / "api-runtime/dist/index.js").unlink()
        self.assert_denied(self.verify(root), "release_index_inventory")

    def test_runtime_modification_denied(self) -> None:
        root = self.copy_release("modified")
        write(root / "api-runtime/dist/index.js", "changed\n")
        self.assert_denied(self.verify(root), "release_index_mismatch:api-runtime/dist/index.js")

    def test_directory_mode_denied(self) -> None:
        root = self.copy_release("mode")
        (root / "frontend-runtime/.next").chmod(0o700)
        self.assert_denied(self.verify(root), "release_index_mismatch:frontend-runtime/.next")

    def test_broken_symlink_denied(self) -> None:
        root = self.copy_release("broken-link")
        link = root / "frontend-runtime/node_modules/.bin/next"
        link.unlink()
        link.symlink_to("../missing/next")
        self.assert_denied(self.verify(root), "release_symlink_broken:frontend-runtime/node_modules/.bin/next")

    def test_escaping_symlink_denied(self) -> None:
        root = self.copy_release("escape-link")
        link = root / "frontend-runtime/node_modules/.bin/next"
        link.unlink()
        link.symlink_to("/etc/passwd")
        self.assert_denied(self.verify(root), "release_symlink_escape:frontend-runtime/node_modules/.bin/next")

    def test_stale_manifest_metadata_denied(self) -> None:
        root = self.copy_release("stale")
        manifest = json.loads((root / "manifest.json").read_text())
        manifest["runtimes"]["frontend"]["buildId"] = "stale"
        (root / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n")
        self.assert_denied(self.verify(root), "release_frontend_build_id")

    def test_missing_build_id_denied(self) -> None:
        root = self.copy_release("missing-build-id")
        (root / "frontend-runtime/.next/BUILD_ID").unlink()
        self.assert_denied(self.verify(root), "release_index_inventory")

    def test_invalid_build_id_denied(self) -> None:
        root = self.copy_release("invalid-build-id")
        write(root / "frontend-runtime/.next/BUILD_ID", "bad\ninternal\n")
        self.assert_denied(self.verify(root), "release_index_mismatch:frontend-runtime/.next/BUILD_ID")

    def test_build_id_reader_rejects_empty_internal_newline_and_non_ascii(self) -> None:
        root = self.base / "build-id-format-cases"
        root.mkdir()
        for index, raw in enumerate((b"", b"bad\ninternal", b"bad value", b"\xff")):
            path = root / str(index)
            path.write_bytes(raw)
            with self.assertRaises(MODULE.Denied):
                MODULE.read_build_id(path)
        valid = root / "valid"
        valid.write_bytes(b"valid_BUILD-ID_1\n")
        self.assertEqual(MODULE.read_build_id(valid), "valid_BUILD-ID_1")

    def test_different_runtime_identity_denied(self) -> None:
        root = self.copy_release("different-runtime")
        write(root / "frontend-runtime/.next/BUILD_ID", "different\n")
        self.assert_denied(self.verify(root), "release_index_mismatch:frontend-runtime/.next/BUILD_ID")

    def test_truncated_package_denied(self) -> None:
        package = self.base / "truncated.tar.xz"
        package.write_bytes(self.package.read_bytes()[:1024])
        result = invoke("verify", "--package", str(package), "--target", self.target,
                        "--release-id", self.release_id, "--components", COMPONENTS)
        self.assert_denied(result, "package_integrity")

    def test_incomplete_or_reused_output_denied(self) -> None:
        existing = self.base / "existing-output"
        existing.mkdir()
        release_id = "immutable-incomplete"
        capacity = capacity_contract(
            self.base / "incomplete-capacity.private.json",
            self.base, self.target, release_id,
        )
        result = invoke("build", "--repo", str(self.repo), "--target", self.target,
                        "--release-id", release_id, "--components", COMPONENTS,
                        "--output", str(existing), "--source-date-epoch", EPOCH,
                        "--capacity-contract", str(capacity), env=self.env)
        self.assert_denied(result, "output_exists")

    def test_capacity_denied_before_output_or_npm(self) -> None:
        release_id = "immutable-capacity-denied"
        output = self.base / "capacity-denied-output"
        usage = os.statvfs(self.base)
        capacity = capacity_contract(
            self.base / "capacity-denied.private.json", self.base, self.target, release_id,
            reserve_bytes=usage.f_bavail * usage.f_frsize + 1,
        )
        result = invoke(
            "build", "--repo", str(self.repo), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--source-date-epoch", EPOCH,
            "--capacity-contract", str(capacity), env=self.env,
        )
        self.assert_denied(result, "capacity_bytes:")
        self.assertFalse(output.exists())

    def test_capacity_contract_rejects_zero_budget(self) -> None:
        release_id = "immutable-zero-budget"
        capacity = capacity_contract(
            self.base / "zero-budget.private.json", self.base, self.target, release_id
        )
        value = json.loads(capacity.read_text())
        value["operationalReserveBytes"] = 0
        write(capacity, json.dumps(value, sort_keys=True) + "\n", 0o600)
        with self.assertRaises(MODULE.Denied) as caught:
            MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id
            )
        self.assertIn("capacity_contract_value:operationalReserveBytes", str(caught.exception))

    def test_failed_generation_is_closed_as_failed(self) -> None:
        release_id = "immutable-failed-generation"
        output = self.base / "failed-generation-output"
        capacity = capacity_contract(
            self.base / "failed-generation-capacity.private.json",
            self.base, self.target, release_id,
        )
        args = MODULE.parser().parse_args([
            "build", "--repo", str(self.repo), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--source-date-epoch", EPOCH,
            "--capacity-contract", str(capacity),
        ])
        with patch.object(MODULE, "toolchain", side_effect=MODULE.Denied("fixture_failure")):
            with self.assertRaises(MODULE.Denied):
                MODULE.build(args)
        lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
        self.assertEqual(lifecycle["state"], "FAILED")
        self.assertEqual(lifecycle["failureClass"], "Denied")
        self.assertEqual(lifecycle["classification"], "PENDING")

    def test_pending_generation_blocks_before_output_or_command(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-pending-") as temp:
            parent = Path(temp)
            previous = parent / "previous"
            previous.mkdir()
            write(previous / "generation-lifecycle.private.json", json.dumps({
                "schemaVersion": 1, "generationId": "previous",
                "state": "COMPLETE", "classification": "PENDING",
            }), 0o600)
            capacity = capacity_contract(parent / "capacity.json", parent, self.target, "next")
            output = parent / "next"
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", "next", "--components", COMPONENTS,
                "--output", str(output), "--source-date-epoch", EPOCH,
                "--capacity-contract", str(capacity),
            ])
            with patch.object(MODULE, "toolchain") as tool:
                with self.assertRaisesRegex(MODULE.Denied, "generation_review_pending:previous"):
                    MODULE.build(args)
                tool.assert_not_called()
            self.assertFalse(output.exists())

    def test_generation_review_is_bound_to_terminal_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-review-") as temp:
            parent = Path(temp)
            old = parent / "old"
            old.mkdir()
            lifecycle = old / "generation-lifecycle.private.json"
            write(lifecycle, json.dumps({"schemaVersion": 1, "generationId": "old", "state": "FAILED"}), 0o600)
            review = {"schemaVersion": 1, "generationId": "old",
                      "lifecycleSha256": hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
                      "decision": "PRESERVE", "reviewer": "synthetic-test",
                      "reason": "diagnosis retained", "evidenceSha256": "a" * 64}
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            MODULE.require_generation_reviews(parent)
            review["lifecycleSha256"] = "b" * 64
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "generation_review_invalid"):
                MODULE.require_generation_reviews(parent)
            write(lifecycle, json.dumps({"schemaVersion": 1, "generationId": "old", "state": "BUILDING"}), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "generation_not_terminal"):
                MODULE.require_generation_reviews(parent)

    def test_build_window_contention_never_unlinks_lock(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-lock-") as temp:
            parent = Path(temp)
            with MODULE.generation_build_window(parent):
                with self.assertRaisesRegex(MODULE.Denied, "generation_build_busy"):
                    with MODULE.generation_build_window(parent):
                        self.fail("second producer entered")
            self.assertTrue((parent / ".generation-build.lock").is_file())
            with MODULE.generation_build_window(parent):
                pass

    def test_capacity_loss_stops_before_next_command_and_records_failed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="capacity-phase-") as temp:
            parent = Path(temp)
            capacity = capacity_contract(parent / "capacity.json", parent, self.target, "phase-test")
            output = parent / "next"
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", "phase-test", "--components", COMPONENTS,
                "--output", str(output), "--source-date-epoch", EPOCH,
                "--capacity-contract", str(capacity),
            ])
            commands = []
            original_run = MODULE.run
            def run(*args, **kwargs):
                if "stage" not in kwargs:
                    return original_run(*args, **kwargs)
                commands.append(kwargs["stage"])
                return ""
            def checkpoint(_capacity, phase, _remaining=()):
                if phase == "after_root_npm_ci":
                    raise MODULE.Denied("capacity_checkpoint:after_root_npm_ci")
                return {"phase": phase}
            with patch.object(MODULE, "toolchain", return_value={}), \
                 patch.object(MODULE, "run", side_effect=run), \
                 patch.object(MODULE, "capacity_checkpoint", side_effect=checkpoint):
                with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint"):
                    MODULE.build(args)
            self.assertEqual(commands, ["root_npm_ci"])
            self.assertEqual(json.loads((output / "generation-lifecycle.private.json").read_text())["state"], "FAILED")

    def test_capacity_checkpoint_reserves_future_copy_and_inodes(self) -> None:
        from types import SimpleNamespace
        capacity = {"filesystemPath": str(self.base), "device": self.base.stat().st_dev,
                    "budgets": {"operationalReserveBytes": 100, "failureEvidenceBytes": 50,
                                "operationalReserveInodes": 10, "runtimePayloadBytes": 500}}
        with patch.object(MODULE.os, "statvfs", return_value=SimpleNamespace(f_bavail=200, f_frsize=1, f_favail=20)):
            MODULE.capacity_checkpoint(capacity, "between_commands")
            with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint:before_copy"):
                MODULE.capacity_checkpoint(capacity, "before_copy", ("runtimePayloadBytes",))
        with patch.object(MODULE.os, "statvfs", return_value=SimpleNamespace(f_bavail=1000, f_frsize=1, f_favail=9)):
            with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint:inodes"):
                MODULE.capacity_checkpoint(capacity, "inodes")

    def test_package_inventory_excludes_source_worker_and_sensitive_files(self) -> None:
        with tarfile.open(self.package, "r:xz") as archive:
            names = [member.name for member in archive.getmembers()]
        self.assertFalse(any("worker" in name.casefold() for name in names))
        self.assertFalse(any("/.git/" in name or "/.env" in name or name.endswith(".log") for name in names))
        self.assertEqual({Path(name).parts[1] for name in names if len(Path(name).parts) > 1},
                         {"api-runtime", "frontend-runtime", "manifest.json", "index.sha256"})

    def test_dependency_uploads_directory_is_runtime_content(self) -> None:
        self.assertFalse(MODULE.forbidden(
            MODULE.PurePosixPath("node_modules/openai/resources/uploads/uploads.mjs")
        ))
        self.assertTrue(MODULE.forbidden(MODULE.PurePosixPath("uploads/customer-media.bin")))

    def test_cache_secret_and_worker_entries_are_denied(self) -> None:
        for label, relative in (("cache-entry", "api-runtime/cache/value"),
                                ("secret-entry", "api-runtime/.env.production"),
                                ("worker-entry", "api-runtime/worker/value")):
            root = self.copy_release(label)
            write(root / relative, "forbidden\n")
            result = self.verify(root)
            self.assertEqual(result.returncode, 2)
            self.assertIn("RELEASE_DENY:forbidden_release_entry:", result.stderr)

    def test_manifest_and_index_are_closed_contracts(self) -> None:
        manifest = json.loads((self.release / "manifest.json").read_text())
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(manifest["components"], ["api", "frontend"])
        self.assertEqual(manifest["toolchain"], {"node": "v20.20.0", "npm": "10.8.2"})
        index = json.loads((self.release / "index.sha256").read_text())
        self.assertEqual(set(index), {"schemaVersion", "scope", "entries"})
        self.assertEqual(index["scope"], ["api-runtime", "frontend-runtime"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

