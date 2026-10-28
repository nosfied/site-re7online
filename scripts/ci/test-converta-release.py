#!/usr/bin/env python3
"""Contract and tamper tests for the external immutable release producer."""

from __future__ import annotations

import hashlib
import datetime as dt
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


def p00_static_floor_override(path: Path, capacity: Path, target: str, release_id: str,
                              *, issued: dt.datetime | None = None,
                              expires: dt.datetime | None = None) -> tuple[Path, str]:
    issued = issued or dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)
    expires = expires or issued + dt.timedelta(hours=2)
    value = {
        "schemaVersion": 1,
        "targetCommit": target,
        "releaseId": release_id,
        "capacityContractSha256": hashlib.sha256(capacity.read_bytes()).hexdigest(),
        "reason": "P00_TENANT_ISOLATION_RECOVERY",
        "responsible": "fixture-owner",
        "issuedAtUtc": issued.isoformat().replace("+00:00", "Z"),
        "expiresAtUtc": expires.isoformat().replace("+00:00", "Z"),
    }
    write(path, json.dumps(value, sort_keys=True) + "\n", 0o600)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def fixture_repo(root: Path) -> tuple[Path, str, dict[str, str]]:
    worktrees = root / "build-worktrees"
    worktrees.mkdir()
    repo = worktrees / "source"
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
        worktrees = cls.base / "build-worktrees"
        cls.outputs = cls.base / "build-output"; cls.outputs.mkdir()
        cls.releases = cls.base / "releases"; cls.releases.mkdir()
        repository = cls.base / "repository"; repository.mkdir()
        staging = cls.base / "staging"; staging.mkdir()
        evidence = cls.base / "evidence"; evidence.mkdir()
        def policy_entry(path: Path) -> dict:
            info = path.lstat()
            return {"path": str(path), "ownerUid": info.st_uid, "groupGid": info.st_gid,
                    "allowedModes": [f"0{stat.S_IMODE(info.st_mode):03o}"]}
        cls.root_policy = cls.base / "root-policy.private.json"
        write(cls.root_policy, json.dumps({"schemaVersion": 1, "canonicalRoots": {
            "repository": policy_entry(repository), "worktrees": policy_entry(worktrees),
            "outputs": policy_entry(cls.outputs), "releases": policy_entry(cls.releases),
            "staging": policy_entry(staging), "evidence": [policy_entry(evidence)],
        }}, sort_keys=True) + "\n", 0o600)
        cls.root_policy_sha = hashlib.sha256(cls.root_policy.read_bytes()).hexdigest()
        cls.output_a = cls.outputs / "output-a"
        cls.capacity = capacity_contract(
            cls.base / "capacity.private.json", cls.base, cls.target, cls.release_id
        )
        # Synthetic tests must not depend on transient hosted-runner capacity.
        # The production value is restored and proved explicitly below.
        cls.production_minimum_build_free_bytes = MODULE.MINIMUM_BUILD_FREE_BYTES
        MODULE.MINIMUM_BUILD_FREE_BYTES = 1
        command = [sys.executable, str(PRODUCER), "build", "--repo", str(cls.repo),
                   "--target", cls.target, "--release-id", cls.release_id,
                   "--components", COMPONENTS, "--output", str(cls.output_a),
                   "--installed-releases-root", str(cls.releases),
                   "--source-date-epoch", EPOCH,
                   "--capacity-contract", str(cls.capacity),
                   "--root-policy", str(cls.root_policy), "--root-policy-sha256", cls.root_policy_sha]
        # The production 12 GiB floor is proved independently below with a
        # controlled statvfs result. Building this tiny synthetic fixture must
        # not depend on the transient free space of a shared CI runner.
        args = MODULE.parser().parse_args(command[2:])
        with patch.dict(os.environ, cls.env, clear=True):
            args.handler(args)
        cls.release = cls.output_a / cls.release_id
        cls.package = cls.output_a / f"{cls.release_id}.tar.xz"
        # Preserve the original PENDING lifecycle; a separate operator review
        # records why this authenticated fixture is retained for verification.
        raw = (cls.output_a / "generation-lifecycle.private.json").read_bytes()
        write(cls.output_a / "generation-review.private.json", json.dumps({
            "schemaVersion": 1, "generationId": cls.release_id,
            "lifecycleSha256": hashlib.sha256(raw).hexdigest(),
            "decision": "SANITIZED", "reviewer": "synthetic-test",
            "reason": "derived fixture artifacts sanitized", "evidenceSha256": "a" * 64,
        }) + "\n", 0o600)

    @classmethod
    def tearDownClass(cls) -> None:
        MODULE.MINIMUM_BUILD_FREE_BYTES = cls.production_minimum_build_free_bytes
        cls.temp.cleanup()

    def copy_release(self, name: str) -> Path:
        destination = self.base / name / self.release_id
        destination.parent.mkdir()
        shutil.copytree(self.release, destination, symlinks=True)
        return destination

    def verify(self, root: Path, marker_sha256: str | None = None) -> subprocess.CompletedProcess[str]:
        arguments = ["verify", "--release-root", str(root), "--target", self.target,
                     "--release-id", self.release_id, "--components", COMPONENTS]
        if marker_sha256 is not None:
            arguments.extend(("--deployed-marker-sha256", marker_sha256))
        return invoke(*arguments)

    def copy_a959_release(self, name: str) -> tuple[Path, str]:
        destination = self.base / name / MODULE.A959_LEGACY_RELEASE_ID
        destination.parent.mkdir()
        shutil.copytree(self.release, destination, symlinks=True)
        manifest = json.loads((destination / "manifest.json").read_text())
        manifest["releaseId"] = MODULE.A959_LEGACY_RELEASE_ID
        manifest["targetCommit"] = MODULE.A959_LEGACY_TARGET
        (destination / "manifest.json").write_text(
            json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
        )
        marker = destination / "DEPLOYED"
        write(marker, '{"state":"DEPLOYED"}\n', 0o600)
        return destination, hashlib.sha256(marker.read_bytes()).hexdigest()

    def verify_a959_overlay(self, root: Path, marker_sha256: str) -> subprocess.CompletedProcess[str]:
        return invoke(
            "verify", "--release-root", str(root), "--target", MODULE.A959_LEGACY_TARGET,
            "--release-id", MODULE.A959_LEGACY_RELEASE_ID, "--components", COMPONENTS,
            "--deployed-marker-sha256", marker_sha256,
            "--legacy-a959-private-data-overlay",
        )

    def copy_f160_release(self, name: str) -> tuple[Path, str]:
        destination = self.base / name / MODULE.F160_LEGACY_RELEASE_ID
        destination.parent.mkdir()
        shutil.copytree(self.release, destination, symlinks=True)
        manifest = json.loads((destination / "manifest.json").read_text())
        manifest["releaseId"] = MODULE.F160_LEGACY_RELEASE_ID
        manifest["targetCommit"] = MODULE.F160_LEGACY_TARGET
        (destination / "manifest.json").write_text(
            json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
        )
        marker = destination / "DEPLOYED"
        write(marker, '{"state":"DEPLOYED"}\n', 0o600)
        return destination, hashlib.sha256(marker.read_bytes()).hexdigest()

    def verify_f160_overlay(self, root: Path, marker_sha256: str) -> subprocess.CompletedProcess[str]:
        return invoke(
            "verify", "--release-root", str(root), "--target", MODULE.F160_LEGACY_TARGET,
            "--release-id", MODULE.F160_LEGACY_RELEASE_ID, "--components", COMPONENTS,
            "--deployed-marker-sha256", marker_sha256,
            "--legacy-f160-runtime-cache-overlay",
        )

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
        artifact_contract = json.loads((self.output_a / "generation-artifacts.private.json").read_text())
        self.assertEqual(artifact_contract["schemaVersion"], 1)
        self.assertEqual(artifact_contract["state"], "COMPLETE")
        self.assertEqual({item["class"] for item in artifact_contract["artifacts"]}, {
            "PACKAGE_PRESERVE", "EVIDENCE_PRESERVE", "RELEASE_RUNTIME",
            "DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING",
        })
        self.assertTrue(all("initialIdentity" in item and "observedIdentity" in item
                            for item in artifact_contract["artifacts"]))

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

    def test_authenticated_deployed_marker_is_the_only_allowed_operational_addition(self) -> None:
        root = self.copy_release("deployed-marker")
        marker = root / "DEPLOYED"
        write(marker, '{"state":"DEPLOYED"}\n', 0o600)
        marker_sha256 = hashlib.sha256(marker.read_bytes()).hexdigest()
        self.assert_denied(self.verify(root), "release_root_inventory")
        accepted = self.verify(root, marker_sha256)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertEqual(json.loads(accepted.stdout)["operationalMarkerSha256"], marker_sha256)
        self.assert_denied(self.verify(root, "0" * 64), "deployed_marker_mismatch")
        marker.chmod(0o644)
        self.assert_denied(self.verify(root, marker_sha256), "deployed_marker_identity")

    def test_deployed_marker_symlink_and_package_override_are_denied(self) -> None:
        root = self.copy_release("deployed-marker-symlink")
        marker = root / "DEPLOYED"
        marker.symlink_to(root / "manifest.json")
        self.assert_denied(self.verify(root, hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest()),
                           "not_regular:DEPLOYED")
        package_result = invoke(
            "verify", "--package", str(self.package), "--target", self.target,
            "--release-id", self.release_id, "--components", COMPONENTS,
            "--deployed-marker-sha256", "a" * 64,
        )
        self.assert_denied(package_result, "deployed_marker_package")

    def test_runtime_addition_denied(self) -> None:
        root = self.copy_release("extra")
        write(root / "api-runtime/extra.js", "extra\n")
        self.assert_denied(self.verify(root), "release_index_inventory")

    def test_a959_installed_overlay_is_closed_and_does_not_relax_package_inventory(self) -> None:
        root, marker_sha = self.copy_a959_release("a959-overlay-valid")
        write(root / "api-runtime/.data/private/state.json", "fixture-private-state\n", 0o600)
        (root / "api-runtime/.data").chmod(0o755)
        accepted = self.verify_a959_overlay(root, marker_sha)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        result = json.loads(accepted.stdout)
        self.assertEqual(result["indexEntries"], len(json.loads((root / "index.sha256").read_text())["entries"]))
        self.assertEqual(result["privateDataOverlay"]["path"], "api-runtime/.data")
        self.assertEqual(result["privateDataOverlay"]["classification"], "PRIVATE_DATA_NEVER_RETIRE")
        self.assertEqual(result["privateDataOverlay"]["state"], "ACTIVE_DEPENDENCY")

        strict = invoke("verify", "--release-root", str(root), "--target", MODULE.A959_LEGACY_TARGET,
                        "--release-id", MODULE.A959_LEGACY_RELEASE_ID, "--components", COMPONENTS,
                        "--deployed-marker-sha256", marker_sha)
        self.assert_denied(strict, "forbidden_release_entry:api-runtime/.data")
        package = invoke("verify", "--package", str(self.package), "--target", MODULE.A959_LEGACY_TARGET,
                         "--release-id", MODULE.A959_LEGACY_RELEASE_ID, "--components", COMPONENTS,
                         "--legacy-a959-private-data-overlay")
        self.assert_denied(package, "legacy_a959_private_data_overlay_package")

        contaminated = self.copy_release("package-with-private-data")
        write(contaminated / "api-runtime/.data/state.json", "must-not-ship\n", 0o600)
        contaminated_package = contaminated.parent / "contaminated.tar.xz"
        MODULE.write_package(contaminated, contaminated_package, int(EPOCH))
        package_result = invoke("verify", "--package", str(contaminated_package),
                                "--target", self.target, "--release-id", self.release_id,
                                "--components", COMPONENTS)
        self.assert_denied(package_result, "forbidden_release_entry:api-runtime/.data")

    def test_a959_overlay_denies_wrong_path_symlink_escape_and_unrelated_addition(self) -> None:
        wrong, marker_sha = self.copy_a959_release("a959-overlay-wrong-path")
        write(wrong / "api-runtime/.private-data/state.json", "state\n", 0o600)
        self.assert_denied(self.verify_a959_overlay(wrong, marker_sha),
                           "legacy_a959_private_data_overlay_missing")

        linked, marker_sha = self.copy_a959_release("a959-overlay-symlink")
        target = linked / "api-runtime/private-target"; target.mkdir()
        (linked / "api-runtime/.data").symlink_to(target)
        self.assert_denied(self.verify_a959_overlay(linked, marker_sha),
                           "legacy_a959_private_data_overlay_identity")

        escaped, marker_sha = self.copy_a959_release("a959-overlay-escape")
        overlay = escaped / "api-runtime/.data"; overlay.mkdir(mode=0o755); overlay.chmod(0o755)
        (overlay / "outside").symlink_to("/etc/passwd")
        self.assert_denied(self.verify_a959_overlay(escaped, marker_sha),
                           "legacy_a959_private_data_overlay_symlink")

        writable, marker_sha = self.copy_a959_release("a959-overlay-writable")
        writable_overlay = writable / "api-runtime/.data"; writable_overlay.mkdir(mode=0o775)
        writable_overlay.chmod(0o775)
        self.assert_denied(self.verify_a959_overlay(writable, marker_sha),
                           "legacy_a959_private_data_overlay_identity")

        extra, marker_sha = self.copy_a959_release("a959-overlay-extra")
        (extra / "api-runtime/.data").mkdir(mode=0o755)
        (extra / "api-runtime/.data").chmod(0o755)
        write(extra / "api-runtime/unindexed.txt", "extra\n")
        self.assert_denied(self.verify_a959_overlay(extra, marker_sha), "release_index_inventory")

    def test_f160_cache_overlay_is_exact_mutable_and_forbidden_from_packages(self) -> None:
        root, marker_sha = self.copy_f160_release("f160-cache-valid")
        cache = root / "frontend-runtime/.next/cache"
        write(cache / "webpack/state.bin", "mutable-cache\n", 0o600)
        cache.chmod(0o755)
        accepted = self.verify_f160_overlay(root, marker_sha)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        observed = json.loads(accepted.stdout)["runtimeCacheOverlay"]
        self.assertEqual((observed["path"], observed["classification"], observed["state"]),
                         ("frontend-runtime/.next/cache", "EPHEMERAL_RUNTIME_CACHE",
                          "ACTIVE_DEPENDENCY"))
        write(cache / "webpack/state.bin", "changed-cache\n", 0o600)
        self.assertEqual(self.verify_f160_overlay(root, marker_sha).returncode, 0)

        wrong, wrong_marker = self.copy_f160_release("f160-cache-wrong-path")
        write(wrong / "frontend-runtime/.next/runtime-cache/state", "wrong\n", 0o600)
        self.assert_denied(self.verify_f160_overlay(wrong, wrong_marker),
                           "legacy_f160_runtime_cache_overlay_missing")

        linked, linked_marker = self.copy_f160_release("f160-cache-symlink")
        target = linked / "frontend-runtime/cache-target"; target.mkdir()
        (linked / "frontend-runtime/.next/cache").symlink_to(target)
        self.assert_denied(self.verify_f160_overlay(linked, linked_marker),
                           "legacy_f160_runtime_cache_overlay_identity")

        contaminated = self.copy_release("package-with-runtime-cache")
        write(contaminated / "frontend-runtime/.next/cache/state", "must-not-ship\n", 0o600)
        contaminated_package = contaminated.parent / "contaminated.tar.xz"
        MODULE.write_package(contaminated, contaminated_package, int(EPOCH))
        package_result = invoke("verify", "--package", str(contaminated_package),
                                "--target", self.target, "--release-id", self.release_id,
                                "--components", COMPONENTS)
        self.assert_denied(package_result,
                           "forbidden_release_entry:frontend-runtime/.next/cache")

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
        existing = self.outputs / "existing-output"
        existing.mkdir()
        release_id = "immutable-incomplete"
        capacity = capacity_contract(
            self.base / "incomplete-capacity.private.json",
            self.base, self.target, release_id,
        )
        result = invoke("build", "--repo", str(self.repo), "--target", self.target,
                        "--release-id", release_id, "--components", COMPONENTS,
                        "--output", str(existing), "--source-date-epoch", EPOCH,
                        "--installed-releases-root", str(self.releases),
                        "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
                        "--root-policy-sha256", self.root_policy_sha, env=self.env)
        self.assert_denied(result, "output_exists")

    def test_clean_target_repo_outside_canonical_worktrees_is_denied(self) -> None:
        external = self.base / "external-clean-repo"
        subprocess.run(["git", "clone", "-q", str(self.repo), str(external)], check=True)
        release_id = "immutable-external-repo"
        output = self.outputs / "external-output"
        capacity = capacity_contract(self.base / "external-capacity.private.json",
                                     self.base, self.target, release_id)
        result = invoke(
            "build", "--repo", str(external), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--source-date-epoch", EPOCH,
            "--installed-releases-root", str(self.releases),
            "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
            "--root-policy-sha256", self.root_policy_sha, env=self.env,
        )
        self.assert_denied(result, "repo_outside_canonical_build_worktrees")
        self.assertFalse(output.exists())

    def test_external_output_and_release_root_are_denied_before_build(self) -> None:
        external_parent = self.base / "external-output-parent"
        external_parent.mkdir()
        external_releases = self.base / "external-releases"
        external_releases.mkdir()
        for release_id, output, releases, predicate in (
            ("immutable-external-output", external_parent / "generation", self.releases,
             "output_outside_canonical_outputs"),
            ("immutable-external-releases", self.outputs / "external-releases-generation",
             external_releases, "installed_releases_root_mismatch"),
        ):
            capacity = capacity_contract(
                self.base / f"{release_id}.capacity.private.json",
                self.base, self.target, release_id,
            )
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", release_id, "--components", COMPONENTS,
                "--output", str(output), "--installed-releases-root", str(releases),
                "--source-date-epoch", EPOCH, "--capacity-contract", str(capacity),
                "--root-policy", str(self.root_policy),
                "--root-policy-sha256", self.root_policy_sha,
            ])
            with patch.object(MODULE, "toolchain") as tool:
                with self.assertRaisesRegex(MODULE.Denied, predicate):
                    MODULE.build(args)
                tool.assert_not_called()
            self.assertFalse(output.exists())
        self.assertFalse((external_parent / ".generation-build.lock").exists())

    def test_capacity_denied_before_output_or_npm(self) -> None:
        release_id = "immutable-capacity-denied"
        output = self.outputs / "capacity-denied-output"
        usage = os.statvfs(self.base)
        capacity = capacity_contract(
            self.base / "capacity-denied.private.json", self.base, self.target, release_id,
            reserve_bytes=usage.f_blocks * usage.f_frsize + 1,
        )
        result = invoke(
            "build", "--repo", str(self.repo), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--source-date-epoch", EPOCH,
            "--installed-releases-root", str(self.releases),
            "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
            "--root-policy-sha256", self.root_policy_sha, env=self.env,
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

    def test_capacity_contract_requires_twelve_gib_free(self) -> None:
        release_id = "immutable-capacity-floor"
        capacity = capacity_contract(
            self.base / "capacity-floor.private.json", self.base, self.target, release_id
        )
        from types import SimpleNamespace
        floor = self.production_minimum_build_free_bytes
        self.assertEqual(12 * 1024 * 1024 * 1024, floor)
        usage = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE, "MINIMUM_BUILD_FREE_BYTES", floor), \
                patch.object(MODULE.os, "statvfs", return_value=usage):
            with self.assertRaisesRegex(MODULE.Denied, "minimum_build_free_bytes"):
                MODULE.read_capacity_contract(
                    capacity, self.repo, self.base, self.target, release_id
                )

    def test_p00_override_waives_only_static_floor(self) -> None:
        from types import SimpleNamespace
        release_id = "immutable-p00-capacity-floor"
        capacity = capacity_contract(
            self.base / "p00-capacity-floor.private.json", self.base, self.target, release_id
        )
        current = dt.datetime(2026, 10, 28, 12, tzinfo=dt.timezone.utc)
        override, override_sha = p00_static_floor_override(
            self.base / "p00-static-floor-override.private.json", capacity,
            self.target, release_id, issued=current - dt.timedelta(minutes=5),
            expires=current + dt.timedelta(hours=1),
        )
        floor = self.production_minimum_build_free_bytes
        sufficient = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE, "MINIMUM_BUILD_FREE_BYTES", floor), \
                patch.object(MODULE.os, "statvfs", return_value=sufficient):
            result = MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id,
                override, override_sha, current,
            )
        self.assertEqual(result["availableBytes"], floor - 1)
        self.assertEqual(result["p00StaticFloorOverride"]["waivesOnly"],
                         "MINIMUM_BUILD_FREE_BYTES")
        self.assertEqual(result["p00StaticFloorOverride"]["sha256"], override_sha)

        below_budget = SimpleNamespace(f_bavail=1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE.os, "statvfs", return_value=below_budget), \
                self.assertRaisesRegex(MODULE.Denied, "capacity_bytes"):
            MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id,
                override, override_sha, current,
            )
        low_inodes = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1)
        with patch.object(MODULE, "MINIMUM_BUILD_FREE_BYTES", floor), \
                patch.object(MODULE.os, "statvfs", return_value=low_inodes), \
                self.assertRaisesRegex(MODULE.Denied, "capacity_inodes"):
            MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id,
                override, override_sha, current,
            )

        checkpoint_usage = SimpleNamespace(f_bavail=1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE.os, "statvfs", return_value=checkpoint_usage), \
                self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint"):
            MODULE.capacity_checkpoint(result, "after_override")

    def test_p00_override_rejects_expiry_binding_identity_and_open_schema(self) -> None:
        from types import SimpleNamespace
        release_id = "immutable-p00-invalid"
        capacity = capacity_contract(
            self.base / "p00-invalid-capacity.private.json", self.base, self.target, release_id
        )
        current = dt.datetime(2026, 10, 28, 12, tzinfo=dt.timezone.utc)
        floor = self.production_minimum_build_free_bytes
        usage = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)

        def denied(name: str, mutate, predicate: str, *, expected_sha: str | None = None,
                   symlink: bool = False, mode: int = 0o600) -> None:
            path, digest = p00_static_floor_override(
                self.base / f"p00-{name}.private.json", capacity, self.target, release_id,
                issued=current - dt.timedelta(minutes=5), expires=current + dt.timedelta(hours=1),
            )
            if mutate is not None:
                value = json.loads(path.read_text())
                mutate(value)
                write(path, json.dumps(value, sort_keys=True) + "\n", mode)
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            elif mode != 0o600:
                path.chmod(mode)
            if symlink:
                target = path.with_suffix(".target")
                path.rename(target)
                path.symlink_to(target)
            with patch.object(MODULE, "MINIMUM_BUILD_FREE_BYTES", floor), \
                    patch.object(MODULE.os, "statvfs", return_value=usage), \
                    self.assertRaisesRegex(MODULE.Denied, predicate):
                MODULE.read_capacity_contract(
                    capacity, self.repo, self.base, self.target, release_id,
                    path, expected_sha or digest, current,
                )

        denied("expired", lambda value: value.update(
            issuedAtUtc="2026-10-28T10:00:00Z", expiresAtUtc="2026-10-28T11:00:00Z"
        ), "p00_static_floor_override_time")
        denied("target", lambda value: value.update(targetCommit="f" * 40),
               "p00_static_floor_override_binding")
        denied("release", lambda value: value.update(releaseId="immutable-other"),
               "p00_static_floor_override_binding")
        denied("capacity", lambda value: value.update(capacityContractSha256="f" * 64),
               "p00_static_floor_override_binding")
        denied("extra", lambda value: value.update(extra=True),
               "p00_static_floor_override_schema")
        denied("mode", None, "p00_static_floor_override_identity", mode=0o664)
        denied("symlink", None, "not_regular", symlink=True)
        denied("hash", None, "p00_static_floor_override_identity", expected_sha="f" * 64)

    def test_p00_override_is_recorded_in_lifecycle_and_artifact_contract(self) -> None:
        from types import SimpleNamespace
        release_id = "immutable-p00-evidence"
        output = self.outputs / "p00-evidence-output"
        capacity = capacity_contract(
            self.base / "p00-evidence-capacity.private.json", self.base, self.target, release_id
        )
        override, override_sha = p00_static_floor_override(
            self.base / "p00-evidence-override.private.json", capacity, self.target, release_id
        )
        args = MODULE.parser().parse_args([
            "build", "--repo", str(self.repo), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--installed-releases-root", str(self.releases),
            "--source-date-epoch", EPOCH, "--capacity-contract", str(capacity),
            "--p00-static-floor-override", str(override),
            "--p00-static-floor-override-sha256", override_sha,
            "--root-policy", str(self.root_policy),
            "--root-policy-sha256", self.root_policy_sha,
        ])
        floor = self.production_minimum_build_free_bytes
        usage = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)
        try:
            with patch.dict(os.environ, self.env, clear=True), \
                    patch.object(MODULE, "MINIMUM_BUILD_FREE_BYTES", floor), \
                    patch.object(MODULE.os, "statvfs", return_value=usage):
                args.handler(args)
            lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
            self.assertEqual(lifecycle["capacity"]["p00StaticFloorOverride"]["sha256"],
                             override_sha)
            contract = json.loads((output / "generation-artifacts.private.json").read_text())
            evidence = [item for item in contract["artifacts"]
                        if item["path"] == str(override)]
            self.assertEqual(len(evidence), 1)
            self.assertEqual(evidence[0]["class"], "EVIDENCE_PRESERVE")
            self.assertEqual(evidence[0]["digest"], {"sha256": override_sha})
        finally:
            shutil.rmtree(output, ignore_errors=True)

    def test_failed_generation_is_closed_as_failed(self) -> None:
        release_id = "immutable-failed-generation"
        output = self.outputs / "failed-generation-output"
        capacity = capacity_contract(
            self.base / "failed-generation-capacity.private.json",
            self.base, self.target, release_id,
        )
        args = MODULE.parser().parse_args([
            "build", "--repo", str(self.repo), "--target", self.target,
            "--release-id", release_id, "--components", COMPONENTS,
            "--output", str(output), "--source-date-epoch", EPOCH,
            "--installed-releases-root", str(self.releases),
            "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
            "--root-policy-sha256", self.root_policy_sha,
        ])
        with patch.object(MODULE, "toolchain", side_effect=MODULE.Denied("fixture_failure")):
            with self.assertRaises(MODULE.Denied):
                MODULE.build(args)
        lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
        self.assertEqual(lifecycle["state"], "FAILED")
        self.assertEqual(lifecycle["failureClass"], "Denied")
        self.assertEqual(lifecycle["classification"], "PENDING")

    def test_pending_generation_blocks_before_output_or_command(self) -> None:
        parent = self.outputs / "generation-pending"
        parent.mkdir()
        try:
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
                "--installed-releases-root", str(self.releases),
                "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
                "--root-policy-sha256", self.root_policy_sha,
            ])
            with patch.object(MODULE, "toolchain") as tool:
                with self.assertRaisesRegex(MODULE.Denied, "generation_review_pending:previous"):
                    MODULE.build(args)
                tool.assert_not_called()
            self.assertFalse(output.exists())
        finally:
            shutil.rmtree(parent)

    def test_generation_review_is_bound_to_terminal_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-review-") as temp:
            parent = Path(temp)
            old = parent / "old"
            old.mkdir()
            lifecycle = old / "generation-lifecycle.private.json"
            write(lifecycle, json.dumps({"schemaVersion": 1, "generationId": "old", "state": "FAILED"}), 0o600)
            review = {"schemaVersion": 1, "generationId": "old",
                      "lifecycleSha256": hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
                      "decision": "SANITIZED", "reviewer": "synthetic-test",
                      "reason": "diagnosis retained", "evidenceSha256": "a" * 64}
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            MODULE.require_generation_reviews(parent)
            review["lifecycleSha256"] = "b" * 64
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "generation_review_invalid"):
                MODULE.require_generation_reviews(parent)

    def test_v1_preserve_is_retention_debt_and_sanitized_allows(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-v1-review-") as temp:
            parent = Path(temp); old = parent / "old"; old.mkdir()
            lifecycle = old / "generation-lifecycle.private.json"
            write(lifecycle, json.dumps({"schemaVersion": 1, "generationId": "old", "state": "COMPLETE"}), 0o600)
            review = {"schemaVersion": 1, "generationId": "old",
                      "lifecycleSha256": hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
                      "decision": "PRESERVE", "reviewer": "owner", "reason": "legacy",
                      "evidenceSha256": "a" * 64}
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "retention_debt:old:v1_preserve"):
                MODULE.require_generation_reviews(parent)
            review["decision"] = "SANITIZED"
            write(old / "generation-review.private.json", json.dumps(review), 0o600)
            self.assertEqual(MODULE.require_generation_reviews(parent)[0]["state"], "SANITIZED")

    def test_pending_candidate_and_expired_override_deny_next_build(self) -> None:
        with tempfile.TemporaryDirectory(prefix="generation-v2-review-") as temp:
            parent = Path(temp); old = parent / "old"; old.mkdir()
            lifecycle = old / "generation-lifecycle.private.json"
            write(lifecycle, json.dumps({"schemaVersion": 1, "generationId": "old", "state": "COMPLETE"}), 0o600)
            base = {"schemaVersion": 2, "generationId": "old",
                    "lifecycleSha256": hashlib.sha256(lifecycle.read_bytes()).hexdigest(),
                    "reviewer": "owner", "reason": "candidate", "evidenceSha256": "a" * 64}
            write(old / "generation-review.private.json",
                  json.dumps({**base, "state": "CANDIDATE_PENDING_ACTIVATION"}), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "second_candidate_pending:old"):
                MODULE.require_generation_reviews(parent)
            write(old / "generation-review.private.json", json.dumps({
                **base, "state": "PRESERVE_OVERRIDE", "retainedBytes": 1,
                "responsible": "owner", "expiresAtUtc": "2026-01-01T00:00:00Z",
            }), 0o600)
            with self.assertRaisesRegex(MODULE.Denied, "generation_override_expired:old"):
                MODULE.require_generation_reviews(
                    parent, dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc)
                )
            write(old / "generation-review.private.json", json.dumps({
                **base, "state": "PRESERVE_OVERRIDE", "retainedBytes": 4096,
                "responsible": "owner", "expiresAtUtc": "2026-11-01T00:00:00Z",
            }), 0o600)
            accepted = MODULE.require_generation_reviews(
                parent, dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc)
            )
            self.assertEqual(accepted[0]["state"], "PRESERVE_OVERRIDE")
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
        parent = self.outputs / "capacity-phase"
        parent.mkdir()
        try:
            capacity = capacity_contract(parent / "capacity.json", parent, self.target, "phase-test")
            output = parent / "next"
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", "phase-test", "--components", COMPONENTS,
                "--output", str(output), "--source-date-epoch", EPOCH,
                "--installed-releases-root", str(self.releases),
                "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
                "--root-policy-sha256", self.root_policy_sha,
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
        finally:
            shutil.rmtree(parent)

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

