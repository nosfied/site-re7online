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
        cls.release_id = f"immutable-{cls.target[:8]}-external-20261023T000000Z"
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
        command = [sys.executable, str(PRODUCER), "build", "--repo", str(cls.repo),
                   "--target", cls.target, "--release-id", cls.release_id,
                   "--components", COMPONENTS, "--output", str(cls.output_a),
                   "--installed-releases-root", str(cls.releases),
                   "--source-date-epoch", EPOCH,
                   "--capacity-contract", str(cls.capacity),
                   "--root-policy", str(cls.root_policy), "--root-policy-sha256", cls.root_policy_sha]
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

    def verify_contract_overlay(self, root: Path) -> subprocess.CompletedProcess[str]:
        contract = self.output_a / "generation-artifacts.private.json"
        return invoke(
            "verify", "--release-root", str(root), "--target", self.target,
            "--release-id", self.release_id, "--components", COMPONENTS,
            "--artifact-contract", str(contract),
            "--artifact-contract-sha256", hashlib.sha256(contract.read_bytes()).hexdigest(),
        )

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
        self.assertEqual(artifact_contract["privateDataOverlay"], {
            "path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
            "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
        })

    def install_arguments(self) -> list[str]:
        return [
            "install", "--package", str(self.package), "--target", self.target,
            "--release-id", self.release_id, "--components", COMPONENTS,
            "--installed-releases-root", str(self.releases),
            "--root-policy", str(self.root_policy),
            "--root-policy-sha256", self.root_policy_sha,
        ]

    def recovery_manifest(self, staged: Path, *, inode: int | None = None) -> tuple[Path, str]:
        info = staged.lstat()
        path = self.base / "install-recovery.private.json"
        value = {
            "schemaVersion": 1,
            "targetCommit": self.target,
            "releaseId": self.release_id,
            "packagePath": str(self.package.resolve()),
            "packageSha256": hashlib.sha256(self.package.read_bytes()).hexdigest(),
            "stagingPath": str(staged),
            "stagingDevice": info.st_dev,
            "stagingInode": info.st_ino if inode is None else inode,
            "ownerUid": info.st_uid,
            "groupGid": info.st_gid,
            "mode": 0o700,
            "finalPath": str(self.releases / self.release_id),
        }
        write(path, json.dumps(value, sort_keys=True) + "\n", 0o600)
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def test_canonical_install_extracts_under_release_name_and_preserves_root_mode(self) -> None:
        final = self.releases / self.release_id
        self.assertFalse(final.exists())
        try:
            result = invoke(*self.install_arguments())
            self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
            payload = json.loads(result.stdout)
            self.assertEqual(payload["result"], "RELEASE INSTALLED")
            self.assertFalse(payload["recoveredExistingStaging"])
            self.assertEqual(stat.S_IMODE(final.stat().st_mode), 0o755)
            self.assertEqual(self.verify(final).returncode, 0)
            self.assertFalse(any(self.releases.glob(f".{self.release_id}.installing.*")))
        finally:
            if final.exists():
                shutil.rmtree(final)

    def test_external_handoff_requires_builder_closure_and_reverifies_installed_release(self) -> None:
        retirement_tool = ROOT / "scripts/generation-retirement.py"
        with tempfile.TemporaryDirectory(prefix="external-handoff-receiver-") as directory:
            receiver = Path(directory)
            policy = json.loads(self.root_policy.read_bytes())
            for key, definition in policy["canonicalRoots"].items():
                entry = definition[0] if key == "evidence" else definition
                path = receiver / key
                path.mkdir(mode=0o700 if key == "evidence" else 0o755)
                entry.update(path=str(path), allowedModes=["0700" if key == "evidence" else "0755"])
            evidence = receiver / "evidence"
            receiver_policy = receiver / "policy.private.json"
            write(receiver_policy, json.dumps(policy), 0o600)
            bind = lambda path: {"path": str(path), "sha256": MODULE.sha256_bytes(path.read_bytes())}
            package = evidence / self.package.name
            shutil.copyfile(self.package, package)
            install = invoke("install", "--package", str(package), "--target", self.target,
                             "--release-id", self.release_id, "--components", COMPONENTS,
                             "--installed-releases-root", str(receiver / "releases"),
                             "--root-policy", str(receiver_policy),
                             "--root-policy-sha256", bind(receiver_policy)["sha256"])
            self.assertEqual(install.returncode, 0, install.stderr)
            installation = evidence / "installation.private.json"
            write(installation, install.stdout, 0o600)
            contract = self.output_a / "generation-artifacts.private.json"
            lifecycle = self.output_a / "generation-lifecycle.private.json"
            producer = json.loads(contract.read_bytes())
            roots = json.loads(self.root_policy.read_bytes())["canonicalRoots"]
            source_roots = {key: ([item["path"] for item in value] if key == "evidence" else value["path"])
                            for key, value in roots.items()}
            # The builder closure is synthetic. Build, transport, install and
            # verification use the real producer and distinct receiver roots.
            commands = []
            events = []
            for ordinal, artifact in enumerate(producer["artifacts"], 1):
                kind = artifact["class"]
                path = artifact["path"]
                if kind == "DERIVED_WORKTREE":
                    argv = ["/usr/bin/git", "-C", source_roots["repository"], "worktree", "remove", path]
                elif kind == "DERIVED_OUTPUT_RUNTIME":
                    argv = ["/usr/bin/rm", "-r", "--", path]
                else:
                    continue
                commands.append({"ordinal": ordinal, "path": path, "class": kind, "argv": argv,
                                 "literal": " ".join(argv), "allocatedBytes": artifact["allocatedBytes"],
                                 "eligibilityAtPrepare": "RETIREMENT_READY"})
                events.extend([{"event": "ATTEMPT", "ordinal": ordinal, "path": path, "argv": argv},
                               {"event": "RESULT", "ordinal": ordinal, "exitCode": 0,
                                "stdoutSha256": MODULE.sha256_bytes(b""), "stderrSha256": MODULE.sha256_bytes(b"")},
                               {"event": "VERIFIED", "ordinal": ordinal, "absent": True}])
            paths = [item["path"] for item in commands]
            intent = evidence / "intent.private.json"
            write(intent, json.dumps({
                "schemaVersion": 3, "generationId": self.release_id, "releaseId": self.release_id,
                "targetCommit": self.target, "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
                "authorizationGranted": False, "contractSha256": bind(contract)["sha256"],
                "lifecycleSha256": bind(lifecycle)["sha256"], "operationalStateSha256": "f" * 64,
                "rootPolicySha256": self.root_policy_sha, "canonicalRoots": source_roots,
                "reviewOutput": str(self.output_a / "generation-review.private.json"),
                "controlPlaneArtifacts": [], "freshObservation": {}, "legacyMigration": None,
                "reconciliation": {"chain": [], "completed": [], "subordinateAbsences": []},
                "artifacts": [{**item, "retentionState": "RETIREMENT_READY" if item["path"] in paths
                               else item["state"]} for item in producer["artifacts"]],
                "commands": commands, "commandsSha256": MODULE.sha256_bytes(
                    "".join(item["literal"] + "\n" for item in commands).encode()),
                "executionContract": {"canonicalLock": str(self.base / ".deployment-window.lock"),
                                      "writerLock": producer["writerLockPath"], "attemptBeforeCommand": True,
                                      "stopOnFirstFailure": True, "automaticRetry": False, "force": False,
                                      "prune": False, "globExpansion": False, "receiptFsync": True},
            }), 0o600)
            auth = evidence / "authorization.private.json"
            write(auth, json.dumps({"schemaVersion": 1, "authorizationId": "fixture-once",
                                    "decision": "AUTHORIZE_ONCE", "intentSha256": bind(intent)["sha256"],
                                    "approvedPaths": paths, "owner": "fixture"}), 0o600)
            journal = evidence / "journal.private.jsonl"
            write(journal, "".join(json.dumps(event) + "\n" for event in events), 0o600)
            receipt = evidence / "receipt.private.json"
            receipt_value = {"schemaVersion": 1, "state": "SANITIZED", "failurePredicate": None,
                             "attemptedCommands": 3, "completedCommands": 3, "removedPaths": paths,
                             "intentSha256": bind(intent)["sha256"], "commandLogSha256": bind(journal)["sha256"],
                             "automaticRetry": False, "remainingDerivedPaths": [],
                             "lock": {"canonicalHeldThroughReceiptFsync": True,
                                      "writerHeldThroughReceiptFsync": True}}
            write(receipt, json.dumps(receipt_value), 0o600)
            for original in (self.root_policy, contract, lifecycle):
                copy = evidence / original.name
                shutil.copyfile(original, copy)
                copy.chmod(0o600)
            manifest = evidence / "handoff.private.json"
            descriptor = {
                "schemaVersion": 1, "builderPolicy": bind(evidence / self.root_policy.name),
                "contract": bind(evidence / contract.name), "lifecycle": bind(evidence / lifecycle.name),
                "intent": bind(intent), "authorization": bind(auth), "receipt": bind(receipt),
                "journal": bind(journal), "installation": bind(installation), "packagePath": str(package),
                "canonicalVerifierSha256": bind(PRODUCER)["sha256"],
            }

            def verify(value: dict, policy_path: Path = receiver_policy) -> subprocess.CompletedProcess[str]:
                write(manifest, json.dumps(value), 0o600)
                return subprocess.run(
                    [sys.executable, str(retirement_tool), "verify-external-handoff",
                     "--handoff", str(manifest), "--handoff-sha256", bind(manifest)["sha256"],
                     "--root-policy", str(policy_path), "--root-policy-sha256", bind(policy_path)["sha256"]],
                    text=True, capture_output=True)

            result = verify(descriptor)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["result"], "EXTERNAL_HANDOFF_EVIDENCE_VERIFIED")
            self.check_external_retirement_route(receiver, receiver_policy, policy, manifest, bind)
            with self.subTest("missing builder evidence"):
                denied = verify({key: value for key, value in descriptor.items() if key != "receipt"})
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_schema", denied.stderr)
            with self.subTest("same host"):
                overlapping = receiver / "overlapping-policy.private.json"
                overlapping_policy = json.loads(receiver_policy.read_bytes())
                overlapping_policy["canonicalRoots"]["releases"] = roots["releases"]
                write(overlapping, json.dumps(overlapping_policy), 0o600)
                denied = verify(descriptor, overlapping)
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_host_roots_overlap", denied.stderr)
            with self.subTest("incomplete receipt with matching hash"):
                write(receipt, json.dumps({**receipt_value, "remainingDerivedPaths": paths[1:]}), 0o600)
                denied = verify({**descriptor, "receipt": bind(receipt)})
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_retention_incomplete", denied.stderr)
                write(receipt, json.dumps(receipt_value), 0o600)
            with self.subTest("journal reordered with matching hashes"):
                old_journal = journal.read_text()
                write(journal, "".join(json.dumps(event) + "\n" for event in events[1:] + events[:1]), 0o600)
                write(receipt, json.dumps({**receipt_value, "commandLogSha256": bind(journal)["sha256"]}), 0o600)
                denied = verify({**descriptor, "receipt": bind(receipt), "journal": bind(journal)})
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_journal_order", denied.stderr)
                write(journal, old_journal, 0o600)
                write(receipt, json.dumps(receipt_value), 0o600)
            with self.subTest("installed runtime drift"):
                entry = receiver / "releases" / self.release_id / "api-runtime/dist/index.js"
                entry.write_bytes(entry.read_bytes() + b"// changed\n")
                denied = verify(descriptor)
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_installation_verification", denied.stderr)
            with self.subTest("package drift"):
                package.write_bytes(b"changed")
                denied = verify(descriptor)
                self.assertEqual(denied.returncode, 2, denied.stderr)
                self.assertIn("external_handoff_package_hash_or_drift", denied.stderr)

    def test_preserved_builder_handoff_closes_with_explicit_retention_debt(self) -> None:
        tool = ROOT / "scripts/generation-retirement.py"
        bind = lambda path: {"path": str(path), "sha256": MODULE.sha256_bytes(path.read_bytes())}
        custody = self.base / "evidence" / "preservation"
        custody.mkdir(mode=0o700)
        lock = self.base / ".deployment-window.lock"
        write(lock, "", 0o600)
        contract = self.output_a / "generation-artifacts.private.json"
        lifecycle = self.output_a / "generation-lifecycle.private.json"
        review = self.output_a / "generation-review.private.json"
        original_review = review.read_bytes()
        request = custody / "request.private.json"
        write(request, json.dumps({
            "schemaVersion": 1, "contract": bind(contract), "lifecycle": bind(lifecycle),
            "rootPolicy": bind(self.root_policy), "deploymentLock": str(lock),
            "responsible": "fixture-owner", "expiresAtUtc": "2099-01-01T00:00:00Z",
            "reason": "retain source custody without historical inventory",
        }), 0o600)
        intent = custody / "intent.private.json"

        def run(command, **inputs):
            argv = [sys.executable, "-B", str(tool), command]
            for key, path in inputs.items():
                argv.extend([f"--{key.replace('_', '-')}", str(path)])
                if key in {"request", "intent", "authorization", "handoff", "root_policy"}:
                    argv.extend([f"--{key.replace('_', '-')}-sha256", bind(path)["sha256"]])
            return subprocess.run(argv, text=True, capture_output=True)

        prepared = run("prepare-builder-preservation", request=request, intent_output=intent)
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        self.assertEqual(json.loads(intent.read_bytes())["commands"], [])
        authorization = custody / "authorization.private.json"
        value = {"schemaVersion": 1, "authorizationId": "preserve-once", "decision": "AUTHORIZE_ONCE",
                 "intentSha256": bind(intent)["sha256"], "approvedPaths": [], "owner": "fixture-owner"}
        write(authorization, json.dumps({**value, "approvedPaths": [str(self.repo)]}), 0o600)
        receipt_root = custody / "receipt"
        denied = run("record-builder-preservation", intent=intent, authorization=authorization, receipt_root=receipt_root)
        self.assertEqual(denied.returncode, 2, denied.stderr)
        self.assertFalse(receipt_root.exists())
        write(authorization, json.dumps(value), 0o600)
        recorded = run("record-builder-preservation", intent=intent, authorization=authorization, receipt_root=receipt_root)
        self.assertEqual(recorded.returncode, 0, recorded.stderr)
        self.assertEqual(json.loads(recorded.stdout)["result"], "PRESERVED_RETENTION_DEBT")
        try:
            # Other tests deliberately leave unrelated failed generations in outputs.
            # Check the real producer gate against only this generation's closure.
            with tempfile.TemporaryDirectory(prefix="preservation-review-gate-") as gate:
                generation = Path(gate) / self.release_id
                generation.mkdir()
                for source in (lifecycle, review):
                    write(generation / source.name, source.read_text(), 0o600)
                MODULE.require_generation_reviews(Path(gate))
            with tempfile.TemporaryDirectory(prefix="preserved-builder-receiver-") as directory:
                receiver = Path(directory)
                policy = json.loads(self.root_policy.read_bytes())
                for key, definition in policy["canonicalRoots"].items():
                    entry = definition[0] if key == "evidence" else definition
                    destination = receiver / key
                    destination.mkdir(mode=0o700 if key == "evidence" else 0o755)
                    entry.update(path=str(destination), allowedModes=["0700" if key == "evidence" else "0755"])
                receiver_policy = receiver / "policy.private.json"
                write(receiver_policy, json.dumps(policy), 0o600)
                evidence = receiver / "evidence"
                package = evidence / self.package.name
                shutil.copyfile(self.package, package)
                installed = invoke("install", "--package", str(package), "--target", self.target,
                                   "--release-id", self.release_id, "--components", COMPONENTS,
                                   "--installed-releases-root", str(receiver / "releases"),
                                   "--root-policy", str(receiver_policy),
                                   "--root-policy-sha256", bind(receiver_policy)["sha256"])
                self.assertEqual(installed.returncode, 0, installed.stderr)
                installation = evidence / "installation.private.json"
                write(installation, installed.stdout, 0o600)
                descriptor = {"schemaVersion": 2, "installation": bind(installation),
                              "packagePath": str(package), "canonicalVerifierSha256": bind(PRODUCER)["sha256"]}
                for key, source in {
                    "builderPolicy": self.root_policy, "contract": contract, "lifecycle": lifecycle,
                    "intent": intent, "authorization": authorization, "review": review,
                    "receipt": receipt_root / "preservation-receipt.private.json",
                    "journal": receipt_root / "preservation-journal.private.jsonl",
                }.items():
                    destination = evidence / f"{key}.private.json"
                    shutil.copyfile(source, destination)
                    destination.chmod(0o600)
                    descriptor[key] = bind(destination)
                manifest = evidence / "handoff.private.json"
                write(manifest, json.dumps(descriptor), 0o600)
                verified = run("verify-external-handoff", handoff=manifest, root_policy=receiver_policy)
                self.assertEqual(verified.returncode, 0, verified.stderr)
                debt = json.loads(verified.stdout)["externalRetentionDebt"]
                self.assertEqual(debt["state"], "PRESERVED_RETENTION_DEBT")
                self.assertEqual(len(debt["preservedPaths"]), 3)
                self.check_preserved_builder_driver(receiver, receiver_policy, policy, manifest, bind, debt)
                descriptor = json.loads(manifest.read_bytes())
                source_intent = Path(descriptor["intent"]["path"])
                intent_value = json.loads(source_intent.read_bytes())
                intent_value["request"]["expiresAtUtc"] = "2000-01-01T00:00:00Z"
                write(source_intent, json.dumps(intent_value), 0o600)
                write(manifest, json.dumps({**descriptor, "intent": bind(source_intent)}), 0o600)
                expired = run("verify-external-handoff", handoff=manifest, root_policy=receiver_policy)
                self.assertEqual(expired.returncode, 2, expired.stderr)
                self.assertIn("builder_preservation_expiry", expired.stderr)
        finally:
            review.write_bytes(original_review)
        self.assertTrue(self.repo.exists())
        self.assertTrue((self.release / "api-runtime").exists())
        self.assertTrue((self.release / "frontend-runtime").exists())

    def check_preserved_builder_driver(self, receiver, policy_path, policy, manifest, bind, debt) -> None:
        import dataclasses

        spec = importlib.util.spec_from_file_location("preserved_builder_driver_tests",
                                                      ROOT / "scripts/ci/test-converta-deploy.py")
        driver_tests = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(driver_tests)
        case = driver_tests.DriverTests()
        case.setUp()
        try:
            # Use the already installed, verified payload in the simulated host.
            candidate = case.releases / self.release_id
            shutil.copytree(receiver / "releases" / self.release_id, candidate, symlinks=True)
            local_policy = json.loads(policy_path.read_bytes())
            local_policy["canonicalRoots"]["releases"]["path"] = str(case.releases)
            write(policy_path, json.dumps(local_policy), 0o600)
            handoff = json.loads(manifest.read_bytes())
            installation = Path(handoff["installation"]["path"])
            report = json.loads(installation.read_bytes())
            report["releasePath"] = str(candidate)
            write(installation, json.dumps(report), 0o600)
            handoff["installation"] = bind(installation)
            write(manifest, json.dumps(handoff), 0o600)
            evidence = receiver / "evidence"
            control = evidence / "control"
            control.mkdir(mode=0o700)
            for name in ("generation-retirement.py", "preparation_artifact_lifecycle.py",
                         "converta-release.py", "converta-deploy.py"):
                shutil.copyfile(ROOT / "scripts" / name, control / name)
                (control / name).chmod(0o600)
            rows = evidence / "pm2-rows.private.json"
            write(rows, json.dumps(case.host.pm2_rows(case.pm2)), 0o600)
            pm2_reader = evidence / "pm2-reader"
            write(pm2_reader, "#!/usr/bin/env python3\nfrom pathlib import Path\nprint(Path(" +
                  repr(str(rows)) + ").read_text())\n", 0o700)
            graph = evidence / "graph.private.json"
            graph_value = {"activeReleases": [case.rollback], "rollbackReleases": [case.rollback],
                           "immediateRollbackReleases": {"api": case.rollback, "frontend": case.rollback},
                           "transitiveReturnReleases": [], "candidateReleases": [self.release_id],
                           "installedVerifiedReleases": [case.rollback, self.release_id], "supersededCandidates": []}
            write(graph, json.dumps(graph_value), 0o600)
            operational = evidence / "operational.private.json"
            roots = {key: ([item["path"] for item in value] if key == "evidence" else value["path"])
                     for key, value in local_policy["canonicalRoots"].items()}
            write(operational, json.dumps({
                "schemaVersion": 2, "generationId": self.release_id, "releaseId": self.release_id,
                "targetCommit": self.target, "gitRepository": roots["repository"], "canonicalRoots": roots,
                "currentPaths": [str(path.resolve()) for path in case.stable.values()],
                "pm2LivePaths": [], "pm2DumpPaths": [], "dependencies": [],
                "controlPlaneArtifacts": [{**bind(control / "generation-retirement.py"), "copied": True}],
                **graph_value, "deploymentState": {"state": "PENDING"},
                "observations": {
                    "currentLinks": [{"path": str(path), "target": str(path.resolve())} for path in case.stable.values()],
                    "pm2": {**bind(pm2_reader), "fingerprintSha256":
                            driver_tests.deploy.Driver._retirement_pm2_fingerprint(case.host.pm2_rows(case.pm2))},
                    "dump": bind(case.dump), "releaseGraph": bind(graph)},
            }), 0o600)
            writer_lock = receiver / "outputs/.generation-build.lock"
            write(writer_lock, "", 0o600)
            tool = control / "generation-retirement.py"
            materialized = subprocess.run(
                [sys.executable, "-B", str(tool), "materialize-external-retirement",
                 "--handoff", str(manifest), "--handoff-sha256", bind(manifest)["sha256"],
                 "--root-policy", str(policy_path), "--root-policy-sha256", bind(policy_path)["sha256"]],
                text=True, capture_output=True)
            self.assertEqual(materialized.returncode, 0, materialized.stderr)
            projection = json.loads(materialized.stdout)
            contract = Path(projection["contract"]); lifecycle = Path(projection["lifecycle"])
            review = contract.parent / "generation-review.private.json"
            intent = evidence / "local-intent.private.json"
            prepared = subprocess.run(
                [sys.executable, "-B", str(tool), "prepare",
                 "--contract", str(contract), "--contract-sha256", bind(contract)["sha256"],
                 "--lifecycle", str(lifecycle), "--lifecycle-sha256", bind(lifecycle)["sha256"],
                 "--operational-state", str(operational), "--operational-state-sha256", bind(operational)["sha256"],
                 "--root-policy", str(policy_path), "--root-policy-sha256", bind(policy_path)["sha256"],
                 "--deployment-lock", str(case.lock), "--intent-output", str(intent),
                 "--commands-output", str(evidence / "commands.private.txt"), "--review-output", str(review),
                 "--reviewer", "fixture-owner", "--reason", "external preservation rollout"],
                text=True, capture_output=True)
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            authorization = evidence / "local-authorization.private.json"
            write(authorization, json.dumps({"schemaVersion": 1, "authorizationId": "local-once",
                  "decision": "AUTHORIZE_ONCE", "intentSha256": bind(intent)["sha256"],
                  "approvedPaths": [], "owner": "fixture-owner"}), 0o600)
            binding = driver_tests.deploy.RetirementBinding(
                tool, bind(tool)["sha256"], intent, bind(intent)["sha256"],
                authorization, bind(authorization)["sha256"], operational, bind(operational)["sha256"],
                policy_path, bind(policy_path)["sha256"], evidence / "local-receipt", review, case.lock)
            case.candidate = self.release_id
            case.retirement = binding
            case.inputs = dataclasses.replace(case.inputs, release=self.release_id, target=self.target, retirement=binding)
            original_run = case.host.run
            executions = []

            def run(argv, **kwargs):
                if argv[2:3] in (["check-external-retirement"], ["execute"]):
                    write(rows, json.dumps(case.host.pm2_rows(case.pm2)), 0o600)
                    if argv[2] == "execute":
                        executions.append(argv)
                    return subprocess.run(argv, text=True, capture_output=True, **kwargs)
                return original_run(argv, **kwargs)

            case.host.run = run
            driver = case.api_only()
            frontend_pid = case.host.rows[driver_tests.deploy.PROCESS_NAMES["frontend"]]["pid"]
            worker_pid = case.host.rows[driver_tests.deploy.PROCESS_NAMES["worker"]]["pid"]
            driver.preflight(); driver.activate(); case.acceptance()
            continuation = driver_tests.continuation
            copied_driver = control / "converta-deploy.py"
            continuation_request = {
                "schemaVersion": 1, "action": "finalize", "lockPath": str(case.lock),
                "transactionRoot": str(case.transaction), "driver": str(copied_driver),
                "driverSha256": bind(copied_driver)["sha256"],
                "finalizeArgv": [sys.executable, "-B", str(copied_driver), "finalize"],
            }
            lock_fd = continuation.acquire_lock(case.lock)

            def finalize(argv, **kwargs):
                with patch.dict(os.environ, {continuation.LOCK_ENV: kwargs["env"][continuation.LOCK_ENV]}):
                    driver.finalize()
                return subprocess.CompletedProcess(argv, 0)

            try:
                self.assertEqual(continuation.run(continuation_request, lock_fd, runner=finalize), 0)
                continuation.release_terminal_lock(continuation_request, lock_fd)
            finally:
                os.close(lock_fd)
            journal = driver._journal_read()
            self.assertEqual(journal["state"], "DEPLOYED_RETENTION_INCOMPLETE")
            self.assertEqual(journal["saveCount"], 1)
            self.assertEqual(case.host.save_calls, 1)
            self.assertEqual(len(executions), 1)
            self.assertFalse(case.lock.exists())
            self.assertEqual(journal["generationRetirement"].get("executionEvidence", {}).get("exitCode"),
                             0, journal["generationRetirement"])
            receipt = json.loads((binding.receipt_root / "execution-receipt.private.json").read_bytes())
            self.assertEqual(receipt["externalRetentionDebt"], debt)
            self.assertEqual(receipt["attemptedCommands"], 0)
            self.assertEqual(case.host.rows[driver_tests.deploy.PROCESS_NAMES["frontend"]]["pid"], frontend_pid)
            self.assertEqual(case.host.rows[driver_tests.deploy.PROCESS_NAMES["worker"]]["pid"], worker_pid)
        finally:
            case.tearDown()

    def check_external_retirement_route(self, receiver, policy_path, policy, manifest, bind, debt=None) -> None:
        evidence = receiver / "evidence"
        output = receiver / "outputs"
        for path in (receiver / ".deployment-window.lock", output / ".generation-build.lock"):
            write(path, "", 0o600)
        lock = receiver / ".deployment-window.lock"
        pm2 = receiver / "pm2"
        write(pm2, "#!/bin/sh\nprintf '[]\\n'\n", 0o700)
        dump = evidence / "dump.pm2"
        write(dump, "[]\n", 0o600)
        graph = evidence / "graph.private.json"
        operational = evidence / "operational.private.json"
        installed = receiver / "releases" / self.release_id
        previous = receiver / "releases" / "immutable-fixture-previous"
        previous.mkdir()
        current = receiver / "current-api"
        current.symlink_to(previous)
        roots = {key: ([item["path"] for item in value] if key == "evidence" else value["path"])
                 for key, value in policy["canonicalRoots"].items()}
        control = evidence / "control.py"
        write(control, "# fixture\n", 0o600)

        def snapshot(deployed):
            active = installed if deployed else previous
            graph_value = {"activeReleases": [active.name], "rollbackReleases": [previous.name],
                           "transitiveReturnReleases": [], "candidateReleases": [] if deployed else [self.release_id],
                           "installedVerifiedReleases": [self.release_id], "supersededCandidates": []}
            write(graph, json.dumps(graph_value), 0o600)
            write(operational, json.dumps({
                "schemaVersion": 2, "generationId": self.release_id, "releaseId": self.release_id,
                "targetCommit": self.target, "gitRepository": roots["repository"], "canonicalRoots": roots,
                "currentPaths": [str(active)], "pm2LivePaths": [], "pm2DumpPaths": [], "dependencies": [],
                "controlPlaneArtifacts": [{**bind(control), "copied": True}], **graph_value,
                "deploymentState": {"state": "DEPLOYED" if deployed else "PENDING"},
                "observations": {"currentLinks": [{"path": str(current), "target": str(active)}],
                                 "pm2": {**bind(pm2), "fingerprintSha256": MODULE.sha256_bytes(b"[]\n")},
                                 "dump": bind(dump), "releaseGraph": bind(graph)},
            }), 0o600)

        def retirement(command, **inputs):
            argv = [sys.executable, str(ROOT / "scripts/generation-retirement.py"), command]
            for name, value in {"root-policy": policy_path, **inputs}.items():
                argv.extend([f"--{name.replace('_', '-')}", str(value)])
                if name in {"root-policy", "handoff", "contract", "lifecycle", "operational_state",
                            "intent", "authorization"}:
                    argv.extend([f"--{name.replace('_', '-')}-sha256", bind(value)["sha256"]])
            return subprocess.run(argv, text=True, capture_output=True)

        materialized = retirement("materialize-external-retirement", handoff=manifest)
        self.assertEqual(materialized.returncode, 0, materialized.stderr)
        projection = json.loads(materialized.stdout)
        contract = Path(projection["contract"])
        lifecycle = Path(projection["lifecycle"])
        review = contract.parent / "generation-review.private.json"
        intent = evidence / "local-intent.private.json"
        commands = evidence / "local-commands.private.txt"
        snapshot(deployed=False)
        prepared = retirement("prepare", contract=contract, lifecycle=lifecycle,
                              operational_state=operational, deployment_lock=lock, intent_output=intent,
                              commands_output=commands, review_output=review,
                              reviewer="fixture", reason="external import")
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        self.assertEqual(commands.read_bytes(), b"")
        authorization = evidence / "local-authorization.private.json"
        auth = {"schemaVersion": 1, "authorizationId": "fixture", "decision": "AUTHORIZE_ONCE",
                "intentSha256": bind(intent)["sha256"], "approvedPaths": [], "owner": "fixture"}
        write(authorization, json.dumps({**auth, "approvedPaths": [str(installed)]}), 0o600)
        denied = retirement("check-external-retirement", intent=intent, authorization=authorization,
                            deployment_lock=lock)
        self.assertEqual(denied.returncode, 2, denied.stderr)
        self.assertIn("external_projection_authorization", denied.stderr)
        write(authorization, json.dumps(auth), 0o600)
        checked = retirement("check-external-retirement", intent=intent, authorization=authorization,
                             deployment_lock=lock)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)["result"], "EXTERNAL_RETIREMENT_READY")
        current.unlink()
        current.symlink_to(installed)
        snapshot(deployed=True)
        marker = installed / "DEPLOYED"
        write(marker, json.dumps({"release": self.release_id, "target": self.target,
                                  "accepted": "ACEITE TÉCNICO PASS", "dumpSha256": bind(dump)["sha256"]}), 0o600)
        receipt = evidence / "local-receipt"
        executed = retirement("execute", intent=intent, authorization=authorization, operational_state=operational,
                              deployment_lock=lock, receipt_root=receipt, review_output=review)
        self.assertEqual(executed.returncode, 0, executed.stderr)
        closure = json.loads((receipt / "execution-receipt.private.json").read_bytes())
        self.assertEqual(closure["state"], "DEPLOYED_RETENTION_INCOMPLETE" if debt else "DEPLOYED_SANITIZED")
        self.assertEqual(closure["attemptedCommands"], 0)
        self.assertEqual(closure["removedPaths"], [])
        self.assertEqual((receipt / "command-results.private.jsonl").read_bytes(), b"")
        self.assertEqual(json.loads(review.read_bytes())["state"], "QUARANTINED" if debt else "SANITIZED")
        if debt:
            self.assertEqual(closure["externalRetentionDebt"], debt)
        marker.unlink()

    def test_recovery_install_reuses_exact_staging_without_reextracting(self) -> None:
        final = self.releases / self.release_id
        staged = self.releases / f".{self.release_id}.installing"
        shutil.copytree(self.release, staged, symlinks=True)
        staged.chmod(0o700)
        inode = staged.stat().st_ino
        manifest, manifest_sha = self.recovery_manifest(staged)
        try:
            result = invoke(
                *self.install_arguments(),
                "--recovery-manifest", str(manifest),
                "--recovery-manifest-sha256", manifest_sha,
            )
            self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
            payload = json.loads(result.stdout)
            self.assertTrue(payload["recoveredExistingStaging"])
            self.assertFalse(staged.exists())
            self.assertEqual(final.stat().st_ino, inode)
            self.assertEqual(stat.S_IMODE(final.stat().st_mode), 0o755)
            self.assertEqual(self.verify(final).returncode, 0)
        finally:
            if final.exists():
                shutil.rmtree(final)
            if staged.exists():
                shutil.rmtree(staged)

    def test_recovery_identity_drift_denies_without_mutating_staging(self) -> None:
        staged = self.releases / f".{self.release_id}.installing"
        shutil.copytree(self.release, staged, symlinks=True)
        staged.chmod(0o700)
        manifest, manifest_sha = self.recovery_manifest(
            staged, inode=staged.stat().st_ino + 1)
        before = (staged.stat().st_ino, stat.S_IMODE(staged.stat().st_mode))
        try:
            result = invoke(
                *self.install_arguments(),
                "--recovery-manifest", str(manifest),
                "--recovery-manifest-sha256", manifest_sha,
            )
            self.assert_denied(result, "install_recovery_staging_identity")
            self.assertEqual(
                (staged.stat().st_ino, stat.S_IMODE(staged.stat().st_mode)),
                before,
            )
            self.assertFalse((self.releases / self.release_id).exists())
        finally:
            if staged.exists():
                shutil.rmtree(staged)

    def test_release_root_mode_is_part_of_verified_identity(self) -> None:
        root = self.copy_release("invalid-release-root-mode")
        root.chmod(0o700)
        self.assert_denied(self.verify(root), "release_directory_identity")

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

    def test_current_release_contract_allows_only_literal_private_data_overlay(self) -> None:
        root = self.copy_release("current-overlay-valid")
        overlay = root / "api-runtime/.data"
        write(overlay / "private/state.json", "mutable\n", 0o600)
        overlay.chmod(0o755)
        accepted = self.verify_contract_overlay(root)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        observed = json.loads(accepted.stdout)["privateDataOverlay"]
        self.assertEqual((observed["present"], observed["path"], observed["mode"]),
                         (True, "api-runtime/.data", 0o755))

        (overlay / "private/state.json").write_text("changed\n")
        self.assertEqual(self.verify_contract_overlay(root).returncode, 0)
        write(root / "api-runtime/unindexed.txt", "extra\n")
        self.assert_denied(self.verify_contract_overlay(root), "release_index_inventory")

    def test_current_release_contract_accepts_absent_overlay_and_denies_appearance_during_scan(self) -> None:
        root = self.copy_release("current-overlay-absent")
        accepted = self.verify_contract_overlay(root)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertEqual(json.loads(accepted.stdout)["privateDataOverlay"], {
            "present": False,
            "path": "api-runtime/.data",
            "classification": "PRIVATE_DATA_NEVER_RETIRE",
            "state": "ACTIVE_DEPENDENCY",
        })

        absent = MODULE.validate_private_data_overlay(root)
        appeared = {
            "present": True,
            "path": "api-runtime/.data",
            "classification": "PRIVATE_DATA_NEVER_RETIRE",
            "state": "ACTIVE_DEPENDENCY",
            "rootIdentity": {"device": 1, "inode": 2},
            "ownerUid": root.stat().st_uid,
            "groupGid": root.stat().st_gid,
            "mode": 0o755,
            "observedEntries": 1,
        }
        with patch.object(MODULE, "validate_private_data_overlay",
                          side_effect=[absent, appeared]):
            with self.assertRaises(MODULE.Denied) as caught:
                MODULE.scan_runtime(root, allow_private_data_overlay=True)
        self.assertIn("legacy_overlay_changed", str(caught.exception))

    def test_current_release_contract_denies_overlay_symlink_and_unsafe_identity(self) -> None:
        linked = self.copy_release("current-overlay-symlink")
        target = linked / "api-runtime/private-target"; target.mkdir()
        (linked / "api-runtime/.data").symlink_to(target)
        self.assert_denied(self.verify_contract_overlay(linked), "private_data_overlay_identity")

        writable = self.copy_release("current-overlay-writable")
        overlay = writable / "api-runtime/.data"; overlay.mkdir(mode=0o775); overlay.chmod(0o775)
        self.assert_denied(self.verify_contract_overlay(writable), "private_data_overlay_identity")

    def test_private_data_overlay_contract_is_installed_only_and_hash_bound(self) -> None:
        contract = self.output_a / "generation-artifacts.private.json"
        package = invoke(
            "verify", "--package", str(self.package), "--target", self.target,
            "--release-id", self.release_id, "--components", COMPONENTS,
            "--artifact-contract", str(contract),
            "--artifact-contract-sha256", hashlib.sha256(contract.read_bytes()).hexdigest(),
        )
        self.assert_denied(package, "private_data_contract_binding")
        root = self.copy_release("current-overlay-bad-contract-hash")
        bad = invoke(
            "verify", "--release-root", str(root), "--target", self.target,
            "--release-id", self.release_id, "--components", COMPONENTS,
            "--artifact-contract", str(contract), "--artifact-contract-sha256", "0" * 64,
        )
        self.assert_denied(bad, "private_data_contract_identity")

        missing = json.loads(contract.read_text())
        missing.pop("privateDataOverlay")
        write(contract, json.dumps(missing, sort_keys=True, separators=(",", ":")) + "\n", 0o600)
        absent = self.verify_contract_overlay(root)
        self.assert_denied(absent, "private_data_contract_schema")

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

    def test_p00_cache_overlay_is_closed_to_known_releases_and_denies_external_drift(self) -> None:
        release_id, target = next(iter(MODULE.P00_LEGACY_RUNTIME_CACHE_RELEASES.items()))
        root = self.base / "p00-cache" / release_id
        root.parent.mkdir()
        shutil.copytree(self.release, root, symlinks=True)
        manifest = json.loads((root / "manifest.json").read_text())
        manifest["releaseId"] = release_id; manifest["targetCommit"] = target
        (root / "manifest.json").write_text(
            json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n")
        marker = root / "DEPLOYED"; write(marker, '{"state":"DEPLOYED"}\n', 0o600)
        cache = root / "frontend-runtime/.next/cache"
        write(cache / "webpack/state.bin", "derived\n", 0o600); cache.chmod(0o755)
        args = ("verify", "--release-root", str(root), "--target", target,
                "--release-id", release_id, "--components", COMPONENTS,
                "--deployed-marker-sha256", hashlib.sha256(marker.read_bytes()).hexdigest(),
                "--legacy-p00-runtime-cache-overlay")
        accepted = invoke(*args)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertEqual(json.loads(accepted.stdout)["runtimeCacheOverlay"]["path"],
                         "frontend-runtime/.next/cache")
        write(root / "frontend-runtime/unclassified.extra", "drift\n", 0o600)
        self.assert_denied(invoke(*args), "release_index_inventory")
        wrong = list(args); wrong[wrong.index("--release-id") + 1] = "immutable-unknown"
        self.assert_denied(invoke(*wrong), "legacy_p00_runtime_cache_overlay_binding")

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

    def test_capacity_contract_uses_contract_derived_observation_margin(self) -> None:
        release_id = "immutable-capacity-derived"
        capacity = capacity_contract(
            self.base / "capacity-derived.private.json", self.base, self.target, release_id
        )
        from types import SimpleNamespace
        contract = json.loads(capacity.read_text())
        contracted = sum(contract[field] for field in MODULE.CAPACITY_BYTE_FIELDS)
        margin = contract["failureEvidenceBytes"]
        usage = SimpleNamespace(
            f_bavail=contracted + margin - 1, f_frsize=1, f_favail=1_000_000
        )
        with patch.object(MODULE.os, "statvfs", return_value=usage):
            with self.assertRaisesRegex(MODULE.Denied, "capacity_bytes"):
                MODULE.read_capacity_contract(
                    capacity, self.repo, self.base, self.target, release_id
                )

        below_historical_floor = SimpleNamespace(
            f_bavail=contracted + margin, f_frsize=1, f_favail=1_000_000
        )
        with patch.object(MODULE.os, "statvfs", return_value=below_historical_floor):
            accepted = MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id
            )
        self.assertEqual(accepted["contractRequiredBytes"], contracted)
        self.assertEqual(accepted["admissionMarginBytes"], margin)
        self.assertEqual(accepted["requiredBytes"], contracted + margin)
        self.assertEqual(accepted["admissionMarginSource"], "failureEvidenceBytes")
        self.assertEqual(
            accepted["admissionFormula"],
            "sum(capacityByteFields)+failureEvidenceBytes",
        )

    def test_p00_override_is_historical_evidence_and_never_waives_derived_gate(self) -> None:
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
        floor = 12 * 1024 * 1024 * 1024
        sufficient = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE.os, "statvfs", return_value=sufficient):
            result = MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id,
                override, override_sha, current,
            )
        self.assertEqual(result["availableBytes"], floor - 1)
        self.assertEqual(result["p00StaticFloorOverride"]["historicalWaiver"],
                         "MINIMUM_BUILD_FREE_BYTES")
        self.assertFalse(result["p00StaticFloorOverride"]["effectiveAdmissionWaiver"])
        self.assertEqual(result["p00StaticFloorOverride"]["sha256"], override_sha)

        below_budget = SimpleNamespace(f_bavail=1, f_frsize=1, f_favail=1_000_000)
        with patch.object(MODULE.os, "statvfs", return_value=below_budget), \
                self.assertRaisesRegex(MODULE.Denied, "capacity_bytes"):
            MODULE.read_capacity_contract(
                capacity, self.repo, self.base, self.target, release_id,
                override, override_sha, current,
            )
        low_inodes = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1)
        with patch.object(MODULE.os, "statvfs", return_value=low_inodes), \
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
        floor = 12 * 1024 * 1024 * 1024
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
            with patch.object(MODULE.os, "statvfs", return_value=usage), \
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
        parent = self.outputs / "p00-evidence-parent"
        parent.mkdir()
        output = parent / "p00-evidence-output"
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
        floor = 12 * 1024 * 1024 * 1024
        usage = SimpleNamespace(f_bavail=floor - 1, f_frsize=1, f_favail=1_000_000)
        try:
            with patch.dict(os.environ, self.env, clear=True), \
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
            shutil.rmtree(parent, ignore_errors=True)

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
        self.assertEqual(lifecycle["dispositionState"], "RETENTION_DEBT")

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
            def checkpoint(_capacity, phase, _remaining=(), _overrides=None,
                           _remaining_peak_inodes=None):
                if phase == "before_api_npm_ci":
                    raise MODULE.Denied("capacity_checkpoint:after_root_npm_ci")
                return {"phase": phase, "requiredBytes": 1, "requiredInodes": 1,
                        "remainingPeakInodes": 0,
                        "remainingBudgets": {field: 0 for field in _remaining}}
            with patch.object(MODULE, "toolchain", return_value={}), \
                 patch.object(MODULE, "run", side_effect=run), \
                 patch.object(MODULE, "capacity_checkpoint", side_effect=checkpoint):
                with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint"):
                    MODULE.build(args)
            self.assertEqual(commands, ["root_npm_ci"])
            lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
            self.assertEqual(lifecycle["state"], "FAILED")
            self.assertEqual(lifecycle["dispositionState"], "RETENTION_DEBT")
        finally:
            shutil.rmtree(parent)

    def test_capacity_checkpoint_reserves_future_copy_and_inodes(self) -> None:
        from types import SimpleNamespace
        capacity = {"filesystemPath": str(self.base), "device": self.base.stat().st_dev,
                    "budgets": {"operationalReserveBytes": 100, "failureEvidenceBytes": 50,
                                "operationalReserveInodes": 10, "peakInodes": 10,
                                "runtimePayloadBytes": 500}}
        capacity.update(admissionMarginBytes=50, requiredInodes=20)
        with patch.object(MODULE.os, "statvfs", return_value=SimpleNamespace(f_bavail=250, f_frsize=1, f_favail=20)):
            MODULE.capacity_checkpoint(capacity, "between_commands")
            with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint:before_copy"):
                MODULE.capacity_checkpoint(capacity, "before_copy", ("runtimePayloadBytes",))
        with patch.object(MODULE.os, "statvfs", return_value=SimpleNamespace(f_bavail=1000, f_frsize=1, f_favail=9)):
            with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint:inodes"):
                MODULE.capacity_checkpoint(capacity, "inodes")

    def test_phase_monitor_invasion_preserves_residue_as_retention_debt(self) -> None:
        parent = self.outputs / "capacity-monitor-invasion"
        parent.mkdir()
        output = parent / "next"
        residue = output / "authorized-workspace-residue.fixture"
        try:
            capacity = capacity_contract(
                parent / "capacity.json", parent, self.target, "monitor-invasion"
            )
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", "monitor-invasion", "--components", COMPONENTS,
                "--output", str(output), "--source-date-epoch", EPOCH,
                "--installed-releases-root", str(self.releases),
                "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
                "--root-policy-sha256", self.root_policy_sha,
            ])
            commands = []
            original_run = MODULE.run
            def run(*arguments, **kwargs):
                if "stage" not in kwargs:
                    return original_run(*arguments, **kwargs)
                commands.append(kwargs["stage"])
                residue.write_text("preserved\n")
                return ""
            def checkpoint(_capacity, phase, remaining=(), _overrides=None,
                           _remaining_peak_inodes=None):
                return {"phase": phase, "requiredBytes": 800, "requiredInodes": 50,
                        "remainingPeakInodes": 20,
                        "remainingBudgets": {field: 300 for field in remaining}}
            class InvadedMonitor:
                def __init__(self, *_args, **_kwargs): pass
                def start(self): pass
                def finish(self):
                    return {"phase": "root_npm_ci", "sampleCount": 2,
                            "observationGaps": 0, "observedBelowProtected": True,
                            "minAvailableBytesObserved": 499,
                            "protectedBytesDuringPhase": 500,
                            "minAvailableInodesObserved": 29,
                            "protectedInodesDuringPhase": 30}
            with patch.object(MODULE, "toolchain", return_value={}), \
                 patch.object(MODULE, "run", side_effect=run), \
                 patch.object(MODULE, "capacity_checkpoint", side_effect=checkpoint), \
                 patch.object(MODULE, "CapacityPhaseMonitor", InvadedMonitor):
                with self.assertRaisesRegex(
                        MODULE.Denied, "capacity_observed_below_protected:root_npm_ci"):
                    MODULE.build(args)
            self.assertEqual(commands, ["root_npm_ci"])
            lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
            self.assertEqual(lifecycle["state"], "FAILED")
            self.assertEqual(lifecycle["dispositionState"], "RETENTION_DEBT")
            self.assertTrue(residue.is_file())
        finally:
            shutil.rmtree(parent, ignore_errors=True)

    def test_capacity_checkpoint_detects_concurrent_consumption_before_next_phase(self) -> None:
        from types import SimpleNamespace
        capacity = {
            "filesystemPath": str(self.base),
            "device": self.base.stat().st_dev,
            "budgets": {
                "operationalReserveBytes": 100,
                "failureEvidenceBytes": 50,
                "operationalReserveInodes": 10,
                "peakInodes": 10,
            },
            "admissionMarginBytes": 50,
            "requiredInodes": 20,
        }
        observations = [
            SimpleNamespace(f_bavail=250, f_frsize=1, f_favail=30),
            SimpleNamespace(f_bavail=199, f_frsize=1, f_favail=30),
        ]
        with patch.object(MODULE.os, "statvfs", side_effect=observations):
            MODULE.capacity_checkpoint(capacity, "after_phase_a")
            with self.assertRaisesRegex(MODULE.Denied, "capacity_checkpoint:before_phase_b"):
                MODULE.capacity_checkpoint(capacity, "before_phase_b")

    def test_capacity_monitor_allows_active_budget_and_denies_protected_balance_loss(self) -> None:
        from types import SimpleNamespace
        capacity = {"filesystemPath": str(self.base), "device": self.base.stat().st_dev}
        monitor = MODULE.CapacityPhaseMonitor(
            capacity, "workspace", admission_required_bytes=9663676416,
            admission_required_inodes=800000, active_budget_bytes=1610612736,
            active_budget_inodes=400000, interval=60
        )
        samples = [
            SimpleNamespace(f_bavail=10731368448, f_frsize=1, f_favail=900000),
            SimpleNamespace(f_bavail=9120755712, f_frsize=1, f_favail=500000),
            SimpleNamespace(f_bavail=9120755712, f_frsize=1, f_favail=500000),
            SimpleNamespace(f_bavail=9120755712, f_frsize=1, f_favail=500000),
        ]
        with patch.object(MODULE.os, "statvfs", side_effect=samples):
            monitor._sample()
            monitor._sample()
            monitor._sample()
            result = monitor.finish()
        self.assertEqual(result["minAvailableBytesObserved"], 9120755712)
        self.assertEqual(result["minAvailableInodesObserved"], 500000)
        self.assertFalse(result["observedBelowProtected"])
        self.assertEqual(result["admissionRequiredBytesBeforePhase"], 9663676416)
        self.assertEqual(result["activePhaseBudgetBytes"], 1610612736)
        self.assertEqual(result["protectedBytesDuringPhase"], 8053063680)
        self.assertEqual(result["proofLimit"],
                         "SAMPLED_MINIMUM_NOT_CONTINUOUS_PEAK_GUARANTEE")

        invaded = MODULE.CapacityPhaseMonitor(
            capacity, "workspace", admission_required_bytes=9663676416,
            admission_required_inodes=800000, active_budget_bytes=1610612736,
            active_budget_inodes=400000, interval=60
        )
        invaded_samples = [
            SimpleNamespace(f_bavail=9663676416, f_frsize=1, f_favail=800000),
            SimpleNamespace(f_bavail=8053063679, f_frsize=1, f_favail=399999),
            SimpleNamespace(f_bavail=8053063679, f_frsize=1, f_favail=399999),
        ]
        with patch.object(MODULE.os, "statvfs", side_effect=invaded_samples):
            invaded._sample()
            invaded._sample()
            invaded_result = invaded.finish()
        self.assertTrue(invaded_result["observedBelowProtected"])
        self.assertEqual(invaded_result["minAvailableBytesObserved"], 8053063679)
        self.assertEqual(invaded_result["minAvailableInodesObserved"], 399999)

    def test_capacity_monitor_records_collection_gap(self) -> None:
        capacity = {"filesystemPath": str(self.base), "device": self.base.stat().st_dev}
        monitor = MODULE.CapacityPhaseMonitor(
            capacity, "frontend_build", admission_required_bytes=1,
            admission_required_inodes=1, active_budget_bytes=0,
            active_budget_inodes=0, interval=60
        )
        with patch.object(MODULE.os, "statvfs", side_effect=OSError("fixture gap")):
            monitor._sample()
            result = monitor.finish()
        self.assertEqual(result["sampleCount"], 0)
        self.assertEqual(result["observationGaps"], 2)
        self.assertIsNone(result["minAvailableBytesObserved"])

    def test_interruption_preserves_residue_and_closes_retention_debt(self) -> None:
        parent = self.outputs / "interrupted-phase"
        parent.mkdir()
        residue = parent / "next" / "partial.fixture"
        try:
            capacity = capacity_contract(parent / "capacity.json", parent, self.target,
                                         "interrupted")
            output = parent / "next"
            args = MODULE.parser().parse_args([
                "build", "--repo", str(self.repo), "--target", self.target,
                "--release-id", "interrupted", "--components", COMPONENTS,
                "--output", str(output), "--source-date-epoch", EPOCH,
                "--installed-releases-root", str(self.releases),
                "--capacity-contract", str(capacity), "--root-policy", str(self.root_policy),
                "--root-policy-sha256", self.root_policy_sha,
            ])
            original_run = MODULE.run
            def interrupted_run(*arguments, **kwargs):
                if kwargs.get("stage") == "root_npm_ci":
                    residue.write_text("partial\n")
                    raise KeyboardInterrupt()
                return original_run(*arguments, **kwargs)
            with patch.object(MODULE, "toolchain", return_value={}), \
                 patch.object(MODULE, "run", side_effect=interrupted_run):
                with self.assertRaises(KeyboardInterrupt):
                    MODULE.build(args)
            lifecycle = json.loads((output / "generation-lifecycle.private.json").read_text())
            self.assertEqual(lifecycle["state"], "FAILED")
            self.assertEqual(lifecycle["dispositionState"], "RETENTION_DEBT")
            self.assertEqual(lifecycle["failureClass"], "KeyboardInterrupt")
            self.assertEqual(len(lifecycle["capacityObservations"]), 1)
            self.assertEqual(lifecycle["capacityObservations"][0]["phase"], "root_npm_ci")
            self.assertTrue(residue.is_file())
        finally:
            shutil.rmtree(parent, ignore_errors=True)

    def test_911a_reviewed_budget_passes_contract_derived_admission(self) -> None:
        target = "911a970838233ae92e00a45ef371f619511d8602"
        release_id = "immutable-911a9708-budget-qualification"
        budgets = {
            "buildWorkspaceGrowthBytes": 1610612736,
            "runtimePayloadBytes": 1342177280,
            "packageTemporaryBytes": 536870912,
            "independentVerificationBytes": 1342177280,
            "failureEvidenceBytes": 268435456,
            "operationalReserveBytes": 4294967296,
        }
        contracted = sum(budgets.values())
        margin = budgets[MODULE.CAPACITY_OBSERVATION_MARGIN_SOURCE]
        self.assertEqual(contracted, 9395240960)
        self.assertEqual(contracted + margin, 9663676416)
        self.assertGreaterEqual(10731368448, contracted + margin)
        contract_path = self.base / "capacity-911a.private.json"
        write(contract_path, json.dumps({
            "schemaVersion": 1,
            "contractId": "capacity-911a-reviewed",
            "capturedAtUtc": "2026-11-02T00:00:00Z",
            "targetCommit": target,
            "releaseId": release_id,
            "filesystemPath": str(self.base.resolve()),
            **budgets,
            "peakInodes": 400000,
            "operationalReserveInodes": 400000,
        }, sort_keys=True) + "\n", 0o600)
        from types import SimpleNamespace
        observation = SimpleNamespace(
            f_bavail=10731368448, f_frsize=1, f_favail=800000
        )
        with patch.object(MODULE.os, "statvfs", return_value=observation):
            qualified = MODULE.read_capacity_contract(
                contract_path, self.repo, self.base, target, release_id
            )
        self.assertEqual(qualified["requiredBytes"], 9663676416)
        self.assertEqual(qualified["availableBytes"], 10731368448)
        self.assertEqual(qualified["requiredInodes"], 800000)

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

