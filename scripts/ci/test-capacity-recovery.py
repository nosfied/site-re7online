#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import resource
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import tarfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock

TOOL = Path(__file__).resolve().parents[1] / "capacity-recovery.py"
SPEC = importlib.util.spec_from_file_location("capacity_recovery", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
PRODUCER_TOOL = Path(__file__).resolve().parents[1] / "converta-release.py"
PRODUCER_SPEC = importlib.util.spec_from_file_location("converta_release", PRODUCER_TOOL)
PRODUCER = importlib.util.module_from_spec(PRODUCER_SPEC)
assert PRODUCER_SPEC.loader is not None
PRODUCER_SPEC.loader.exec_module(PRODUCER)
SUPERVISOR_TOOL = Path(__file__).resolve().parents[1] / "capacity-recovery-supervisor.py"
SUPERVISOR_SPEC = importlib.util.spec_from_file_location(
    "capacity_recovery_supervisor", SUPERVISOR_TOOL)
SUPERVISOR = importlib.util.module_from_spec(SUPERVISOR_SPEC)
assert SUPERVISOR_SPEC.loader is not None
SUPERVISOR_SPEC.loader.exec_module(SUPERVISOR)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, sort_keys=True))
    path.chmod(0o600)


def scan(targets=None, writers=None, complete=True, **summary):
    counts = {"deployProcessesInspected": 0, "otherProcessesInspected": 0,
              "permissionLimitedOtherProcesses": 0, "kernelThreadsIgnored": 0,
              "vanishedProcesses": 0, "identityFailures": 0,
              "referenceReadFailures": 0, "transientFdClosures": 0,
              "referenceReadFailureDetails": [],
              "referenceReadFailureDetailsTruncated": 0,
              "transientFdClosureDetails": [],
              "transientFdClosureDetailsTruncated": 0}
    counts.update(summary)
    return (targets or [], writers or [], complete, counts)


class CapacityRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="capacity-recovery-")
        self.base = Path(self.temp.name)
        self.base.chmod(0o700)
        self.cache_parent = self.base / "home" / "deploy" / ".npm"
        self.cache_parent.mkdir(parents=True, mode=0o775)
        self.cache_parent.chmod(0o775)
        self.cache = self.cache_parent / "_cacache"
        self.cache.mkdir(mode=0o755)
        (self.cache / "cache.bin").write_bytes(b"cache")

        self.outputs = self.base / "build-output"
        self.outputs.mkdir(mode=0o755)
        self.producer = self.outputs / "immutable-abc-producer"
        self.producer.mkdir(mode=0o755)
        self.payload = self.producer / "immutable-abc"
        self.payload.mkdir(mode=0o755)
        self.runtime = self.payload / "api-runtime"
        self.runtime.mkdir(mode=0o755)
        (self.runtime / "app.js").write_bytes(b"same runtime")
        (self.runtime / "app.js").chmod(0o644)
        self.preparations = self.base / "preparations"
        self.preparations.mkdir(mode=0o700)
        self.preparation = self.preparations / "automation-20260929T220203Z"
        self.preparation.mkdir(mode=0o700)
        self.archive = self.preparation / "api-frontend-return.private.tar.gz"
        with tarfile.open(self.archive, "w:gz") as archive:
            payload = b"derived runtime"
            item = tarfile.TarInfo("apps/whatsapp-agent/dist/index.js")
            item.size = len(payload)
            archive.addfile(item, io.BytesIO(payload))
        self.archive.chmod(0o600)
        self.docs = self.base / "control" / "docs" / "saas"
        self.docs.mkdir(parents=True, mode=0o755)
        self.archive_record = self.docs / "AUTOMATION_RELEASE_PREPARATION_2026-09-29.md"
        self.write_archive_record(self.archive)
        self.releases = self.base / "releases"
        self.releases.mkdir(mode=0o755)
        self.release = self.releases / "immutable-abc"
        self.release.mkdir(mode=0o755)
        release_runtime = self.release / "api-runtime"
        release_runtime.mkdir(mode=0o755)
        (release_runtime / "app.js").write_bytes(b"same runtime")
        (release_runtime / "app.js").chmod(0o644)

        self.package = self.producer / "immutable-abc.tar.xz"
        self.package.write_bytes(b"authenticated-package")
        self.package.chmod(0o600)
        self.manifest = self.payload / "manifest.json"
        private_json(self.manifest, {"releaseId": "immutable-abc", "targetCommit": "a" * 40})
        self.index = self.payload / "index.sha256"
        private_json(self.index, {"schemaVersion": 1, "entries": [
            {"path": "api-runtime", "type": "directory", "mode": "0755", "size": 0, "sha256": None},
            {"path": "api-runtime/app.js", "type": "file", "mode": "0644", "size": 12,
             "sha256": hashlib.sha256(b"same runtime").hexdigest()},
        ]})
        self.contract = self.producer / "generation-artifacts.private.json"
        def artifact(path, cls, digest=None):
            value = {"path": str(path), "class": cls, "releaseId": "immutable-abc",
                     "targetCommit": "a" * 40}
            if digest is not None:
                value["digest"] = {"sha256": digest}
            return value
        private_json(self.contract, {
            "schemaVersion": 1, "releaseId": "immutable-abc", "targetCommit": "a" * 40,
            "artifacts": [artifact(self.runtime, "DERIVED_OUTPUT_RUNTIME"),
                          artifact(self.release, "RELEASE_RUNTIME"),
                          artifact(self.package, "PACKAGE_PRESERVE", sha(self.package)),
                          artifact(self.manifest, "PACKAGE_PRESERVE", sha(self.manifest)),
                          artifact(self.index, "PACKAGE_PRESERVE", sha(self.index))],
            "privateDataOverlay": {"path": "api-runtime/.data"},
        })
        self.policy = self.base / "root-policy.private.json"
        private_json(self.policy, {"schemaVersion": 1, "canonicalRoots": {
            "outputs": {"path": str(self.outputs), "ownerUid": os.geteuid(),
                        "groupGid": os.getegid(), "allowedModes": ["0755"]}
        }})
        self.deployment_lock = self.base / "deployment.lock"
        self.writer_lock = self.base / "writer.lock"
        for path in (self.deployment_lock, self.writer_lock):
            path.write_bytes(b"")
            path.chmod(0o600)
        self.pm2 = self.base / "pm2.private"
        self.pm2.write_text("#!/bin/sh\nprintf '[]\\n'\n")
        self.pm2.chmod(0o500)
        self.dump = self.base / "dump.private.json"
        private_json(self.dump, [])
        self.release_graph = self.base / "release-graph.private.json"
        private_json(self.release_graph, {"schemaVersion": 1, "protectedGraphPaths": []})
        self.transactions = self.base / "transactions"
        self.transactions.mkdir(mode=0o700)
        self.operational = self.base / "operational.private.json"
        self.write_operational()
        self.request = self.base / "audit-request.private.json"
        self.plan = self.base / "plan.private.json"
        self.intent = self.base / "intent.private.json"
        self.commands = self.base / "commands.private.txt"
        self.seal_manifest = self.base / "seal-manifest.private.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_operational(self, **overrides):
        value = {"schemaVersion": 2, "currentPaths": [], "pm2LivePaths": [],
                 "pm2DumpPaths": [], "openTransactionPaths": [], "protectedGraphPaths": [],
                 "deploymentLock": str(self.deployment_lock), "writerLock": str(self.writer_lock),
                 "liveObservations": {
                     "currentLinks": [],
                     "pm2": {"path": str(self.pm2), "sha256": sha(self.pm2),
                             "fingerprintSha256": hashlib.sha256(b"[]\n").hexdigest()},
                     "dump": {"path": str(self.dump), "sha256": sha(self.dump)},
                     "transactionsRoot": {"path": str(self.transactions),
                                          "ownerUid": os.geteuid(), "groupGid": os.getegid(),
                                          "allowedModes": ["0700"]},
                     "releaseGraph": {"path": str(self.release_graph),
                                      "sha256": sha(self.release_graph)},
                 }}
        value.update(overrides)
        private_json(self.operational, value)

    def window_value(self, state, save_count):
        keys = {
            "AWAITING_ACCEPTANCE": {
                "state", "target", "release", "buildId", "api", "frontend", "worker",
                "availableBytes", "guard", "retirement", "saveCount", "acceptance",
                "deployedMarker",
            },
            "DEPLOYED": {
                "state", "target", "release", "buildId", "api", "frontend", "worker",
                "guard", "saveCount", "acceptance", "acceptanceSha256", "deployedMarker",
                "markerSha256", "dumpSha256", "dumpValidationSha256", "saveExecutionSha256",
                "automaticRetry",
            },
            "DEPLOYED_SANITIZED": {
                "state", "saveCount", "acceptance", "deployedMarker", "dumpSha256",
                "retirementReceiptSha256", "restartCountDuringFinalize",
            },
            "ROLLED_BACK_TECHNICAL_REJECTION": {
                "state", "failurePredicate", "restored", "frontend", "release", "saveCount",
                "automaticRetry", "deployedMarker", "apiPreserved", "workerPreserved",
                "lockReleasedOnControllerExit",
            },
        }.get(state, {"state", "saveCount"})
        value = {key: None for key in keys}
        value.update(state=state, saveCount=save_count)
        return value

    def window_transaction(self, name, state, save_count):
        transaction = self.transactions / name
        transaction.mkdir(mode=0o700)
        private_json(transaction / "window-state.private.json",
                     self.window_value(state, save_count))
        return transaction

    def real_legacy_transaction_layouts(self):
        self.window_transaction(
            "immutable-aa9527cc-vps-20261029T222733Z-frontend-final-aa9527cc-v1-once",
            "DEPLOYED_SANITIZED", 1)
        self.window_transaction(
            "immutable-b96eb779-vps-20261028T025159Z-frontend-final-b96eb779-v1-once",
            "DEPLOYED_SANITIZED", 1)
        self.window_transaction(
            "immutable-d436239e-vps-20261026T131821Z-frontend-final-da2cd8fb-v2-once",
            "DEPLOYED", 1)
        rollback = self.transactions / "immutable-d436239e-vps-20261026T131821Z-frontend-once"
        rollback.mkdir(mode=0o700)
        for name, raw in MODULE.LEGACY_ROLLBACK_SENTINELS.items():
            path = rollback / name
            path.write_bytes(raw)
            path.chmod(0o600)
        self.window_transaction(
            "immutable-ef3a2128-vps-20261028T001820Z-frontend-final-1908284e-v1-once",
            "ROLLED_BACK_TECHNICAL_REJECTION", 0)
        self.window_transaction(
            "immutable-f1602787-vps-20261026T174702Z-frontend-final-c48cb303-v1-once",
            "DEPLOYED", 1)
        protected = self.transactions / "immutable-f5028de1-20261020T181603Z"
        protected.mkdir(mode=0o700)
        for name in MODULE.LEGACY_PROTECTED_SENTINELS:
            private_json(protected / name, {
                "legacyReference": "/opt/re7online/releases/immutable-f5028de1-20261020T181603Z",
            })
        (protected / "probe-pm2-home").mkdir(mode=0o700)
        (protected / "probe-pm2").symlink_to(protected / "probe-pm2-home")
        (self.transactions / "preflight-7e968da7-20261023T164304Z").mkdir(mode=0o700)

    def npm_candidate(self, path=None, principals=None):
        return {"class": "NPM_CACHE_MAINTENANCE", "path": str(path or self.cache)}

    def output_candidate(self, path=None):
        return {"class": "DERIVED_OUTPUT_RUNTIME", "path": str(path or self.runtime),
                "runtimeRelativePath": "api-runtime", "releaseRoot": str(self.release),
                "contract": {"path": str(self.contract), "sha256": sha(self.contract)},
                "package": {"path": str(self.package), "sha256": sha(self.package)},
                "manifest": {"path": str(self.manifest), "sha256": sha(self.manifest)},
                "index": {"path": str(self.index), "sha256": sha(self.index)}}

    def write_archive_record(self, archive):
        self.archive_record.write_text(
            f"| {archive.name} | {archive.stat().st_size} | `{sha(archive)}` |\n\n"
            "`tar -tzf` dos arquivos compactados PASS\n")
        self.archive_record.chmod(0o644)

    def archive_candidate(self, path=None, record=None):
        selected = path or self.archive
        evidence = record or self.archive_record
        return {"class": "CLOSED_PREPARATION_DERIVED_ARCHIVE", "path": str(selected),
                "sha256": sha(selected), "proof": {
                    "kind": "VERSIONED_PREPARATION_RECORD",
                    "record": {"path": str(evidence), "sha256": sha(evidence)},
                    "recordEntry": selected.name,
                }}

    def b9_duplicate_candidates(self):
        roots = []
        for name in ("incident-6683-v4-hybrid-b9b58177-20261005T025100Z",
                     "incident-6683-v4-hybrid-b9-capture-20261005T143500Z",
                     "incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z"):
            window = self.preparations / name / "window"
            window.mkdir(parents=True, mode=0o700)
            window.parent.chmod(0o700); window.chmod(0o700)
            archive = window / "worker-minimal-b9-v3.tar.gz"
            archive.write_bytes(self.archive.read_bytes()); archive.chmod(0o600)
            roots.append(archive)
        authority, *duplicates = roots
        candidates = [{"class": "CLOSED_PREPARATION_DERIVED_ARCHIVE",
                       "path": str(path), "sha256": sha(path), "proof": {
                           "kind": "DUPLICATE_COPY",
                           "authoritativeCopy": {
                               "path": str(authority), "sha256": sha(authority),
                           },
                       }} for path in duplicates]
        return authority, duplicates, candidates

    def manifest_disposition_fixture(self, suffix="default"):
        control = self.base / f"disposition-control-{suffix}" / "control"
        env = control / "apps/whatsapp-agent/.env.example"
        env.parent.mkdir(parents=True)
        env.write_bytes(b"EXAMPLE_ONLY=yes\n"); env.chmod(0o644)
        record = control / "docs/evidence.md"
        record.parent.mkdir(parents=True)
        record.write_text("authenticated historical record\n"); record.chmod(0o644)
        authority_root = self.releases / f"disposition-authorities-{suffix}"
        authority_root.mkdir()
        entries = []
        paths = []

        archive_specs = [
            ("reactive/window/worker.tar.gz", False),
            ("night/candidate.tar.gz", True),
        ]
        for ordinal, (relative, night) in enumerate(archive_specs, 1):
            candidate = self.preparations / f"disposition-{suffix}" / relative
            candidate.parent.mkdir(parents=True, exist_ok=True)
            current = candidate.parent
            while current != self.preparations:
                current.chmod(0o700); current = current.parent
            authority = authority_root / f"archive-{ordinal}"
            (authority / "dist").mkdir(parents=True)
            (authority / "dist/app.js").write_bytes(f"archive-{ordinal}".encode())
            (authority / "dist/app.js").chmod(0o644)
            members = [("dist/app.js", f"archive-{ordinal}".encode())]
            if night:
                (authority / "apps/whatsapp-agent").mkdir(parents=True)
                (authority / "apps/whatsapp-agent/.env.example").write_bytes(env.read_bytes())
                (authority / "apps/whatsapp-agent/.env.example").chmod(0o644)
                upload = authority / "node_modules/openai/resources/uploads/client.js"
                upload.parent.mkdir(parents=True)
                upload.write_bytes(b"library code"); upload.chmod(0o644)
                members.extend([
                    ("apps/whatsapp-agent/.env.example", env.read_bytes()),
                    ("node_modules/openai/resources/uploads/client.js", b"library code"),
                ])
            with tarfile.open(candidate, "w:gz") as archive:
                for name, payload in members:
                    item = tarfile.TarInfo(name); item.size = len(payload)
                    archive.addfile(item, io.BytesIO(payload))
            candidate.chmod(0o600)
            info = candidate.lstat()
            entry = {
                "path": str(candidate), "type": "ARCHIVE_FILE",
                "physicalBytes": info.st_blocks * 512, "sha256": sha(candidate),
                "identity": {"device": info.st_dev, "inode": info.st_ino, "nlink": 1,
                             "uid": info.st_uid, "gid": info.st_gid,
                             "mode": f"0{stat.S_IMODE(info.st_mode):03o}"},
                "proof": "ARCHIVE_AUTHORITY_TREE", "authority": str(authority),
                "historicalRecords": [{"path": "docs/evidence.md", "sha256": sha(record)}],
            }
            if night:
                entry["protectedMemberExceptions"] = [
                    {"kind": "VERSIONED_ENV_EXAMPLE",
                     "path": "apps/whatsapp-agent/.env.example"},
                    {"kind": "OPENAI_LIBRARY_CODE",
                     "pathPrefix": "node_modules/openai/resources/uploads/"},
                ]
            entries.append(entry)
            paths.append(candidate)

        tree = self.preparations / f"disposition-{suffix}" / "reactive/window/worker-package-audit"
        (tree / "dist").mkdir(parents=True)
        current = tree
        while current != self.preparations:
            current.chmod(0o700); current = current.parent
        authority = authority_root / "tree"
        (authority / "dist").mkdir(parents=True)
        for root in (tree, authority):
            (root / "dist/worker.js").write_bytes(b"worker-code")
            (root / "dist/worker.js").chmod(0o644)
            (root / "PACKAGE_SYMLINKS.txt").write_bytes(b"")
            (root / "PACKAGE_SYMLINKS.txt").chmod(0o600)
        package_raw = (f"{sha(tree / 'PACKAGE_SYMLINKS.txt')}  PACKAGE_SYMLINKS.txt\n"
                       f"{sha(tree / 'dist/worker.js')}  dist/worker.js\n")
        for root in (tree, authority):
            (root / "PACKAGE_FILES.sha256").write_text(package_raw)
            (root / "PACKAGE_FILES.sha256").chmod(0o600)
        for directory, subdirectories, _files in os.walk(tree):
            Path(directory).chmod(0o700)
            for subdirectory in subdirectories:
                (Path(directory) / subdirectory).chmod(0o700)
        info = tree.lstat()
        physical = MODULE.physical_usage([tree])[str(tree)]["allocatedBytes"]
        tree_entry = {
            "path": str(tree), "type": "ENUMERATED_TREE", "physicalBytes": physical,
            "sha256": None, "identity": {"device": info.st_dev, "inode": info.st_ino,
                                           "nlink": info.st_nlink, "uid": info.st_uid,
                                           "gid": info.st_gid,
                                           "mode": f"0{stat.S_IMODE(info.st_mode):03o}"},
            "proof": "ENUMERATED_TREE_AUTHORITY", "authority": str(authority),
            "historicalRecords": [{"path": "docs/evidence.md", "sha256": sha(record)}],
            "packageFilesSha256": sha(tree / "PACKAGE_FILES.sha256"),
        }
        entries.insert(1, tree_entry); paths.insert(1, tree)
        for directory, subdirectories, _files in os.walk(authority_root):
            Path(directory).chmod(0o755)
            for subdirectory in subdirectories:
                (Path(directory) / subdirectory).chmod(0o755)
        def directory_binding(directory):
            info = Path(directory).lstat()
            return {"device": info.st_dev, "inode": info.st_ino,
                    "uid": info.st_uid, "gid": info.st_gid,
                    "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}
        for entry in entries:
            candidate = Path(entry["path"])
            ancestors = []
            current = candidate.parent
            while True:
                ancestors.append({"path": str(current), **directory_binding(current)})
                if current == self.preparations:
                    break
                current = current.parent
            entry["candidateAncestors"] = ancestors
            entry["authorityState"] = "PRESENT"
            entry["authorityIdentity"] = directory_binding(Path(entry["authority"]))
        manifest = control / "config/disposition.json"
        manifest.parent.mkdir(parents=True)
        disposition_id = "fixture-disposition-v1"
        private_json(manifest, {
            "schemaVersion": 2, "kind": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
            "dispositionId": disposition_id, "entries": entries,
            "versionedEnvExample": {"path": "apps/whatsapp-agent/.env.example",
                                    "sha256": sha(env)},
        })
        binding = {"path": str(manifest), "sha256": sha(manifest)}
        candidates = [{"class": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                       "path": str(path), "dispositionManifest": binding} for path in paths]
        patches = mock.patch.multiple(
            MODULE, ROOT=control, PREPARATIONS_ROOT=self.preparations,
            RELEASES_ROOT=self.releases,
            DISPOSITION_MANIFEST_PATH=manifest, DISPOSITION_MANIFEST_SHA256=sha(manifest),
            DISPOSITION_ID=disposition_id)
        return {"control": control, "manifest": manifest, "entries": entries,
                "paths": paths, "candidates": candidates, "patches": patches,
                "authorityRoot": authority_root, "record": record}

    def worker_tree_fixture(self, suffix="worker-tree", *, payload_count=3,
                            largest_size=0, link_count=2):
        root = self.preparations / suffix / "window/worker-package-audit"
        authority = self.releases / f"{suffix}-authority"
        for base, mode in ((root, 0o700), (authority, 0o755)):
            (base / "payload").mkdir(parents=True)
            (base / "node_modules/.bin").mkdir(parents=True)
            (base / "node_modules/tools").mkdir(parents=True)
            for directory, subdirectories, _files in os.walk(base):
                Path(directory).chmod(mode)
                for subdirectory in subdirectories:
                    (Path(directory) / subdirectory).chmod(mode)
        payloads = {f"payload/file-{index:05d}.bin": f"payload-{index}".encode()
                    for index in range(payload_count)}
        if largest_size:
            payloads["payload/largest.bin"] = None
        for index in range(link_count):
            payloads[f"node_modules/tools/tool-{index:02d}.js"] = f"tool-{index}".encode()
        for relative, payload in payloads.items():
            for base in (root, authority):
                destination = base / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if payload is None:
                    with destination.open("wb") as stream:
                        remaining = largest_size
                        block = b"x" * (1024 * 1024)
                        while remaining:
                            piece = block[:min(len(block), remaining)]
                            stream.write(piece); remaining -= len(piece)
                else:
                    destination.write_bytes(payload)
                destination.chmod(0o644)
        links = []
        for index in range(link_count):
            relative = f"node_modules/.bin/tool-{index:02d}"
            target = f"../tools/tool-{index:02d}.js"
            links.append((relative, target))
            for base in (root, authority):
                (base / relative).symlink_to(target)
        link_raw = "".join(f"{relative}\t{target}\n" for relative, target in links).encode()
        for base in (root, authority):
            (base / "PACKAGE_SYMLINKS.txt").write_bytes(link_raw)
            (base / "PACKAGE_SYMLINKS.txt").chmod(0o600)
        listed = ["PACKAGE_SYMLINKS.txt", *sorted(payloads)]
        package_raw = "".join(
            f"{sha(root / relative)}  {relative}\n" for relative in listed).encode()
        for base in (root, authority):
            (base / "PACKAGE_FILES.sha256").write_bytes(package_raw)
            (base / "PACKAGE_FILES.sha256").chmod(0o600)
        (authority / ".data").symlink_to("/persistent/worker-data")
        root_info = root.lstat(); authority_info = authority.lstat()
        entry = {
            "identity": {"device": root_info.st_dev, "inode": root_info.st_ino,
                         "nlink": root_info.st_nlink, "uid": root_info.st_uid,
                         "gid": root_info.st_gid,
                         "mode": f"0{stat.S_IMODE(root_info.st_mode):03o}"},
            "authority": str(authority), "authorityState": "PRESENT",
            "authorityIdentity": MODULE._directory_identity(authority_info),
            "packageFilesSha256": sha(root / "PACKAGE_FILES.sha256"),
        }
        return root, authority, entry, links

    def worker_package_audit_disposition_fixture(self, suffix="worker-binding"):
        root, authority, entry, links = self.worker_tree_fixture(suffix)
        control = self.base / f"worker-control-{suffix}" / "control"
        env = control / "apps/whatsapp-agent/.env.example"
        env.parent.mkdir(parents=True)
        env.write_bytes(b"EXAMPLE_ONLY=yes\n"); env.chmod(0o644)
        record = control / "docs/evidence.md"
        record.parent.mkdir(parents=True)
        record.write_text("worker package audit historical evidence\n"); record.chmod(0o644)
        current = root.parent
        ancestors = []
        while True:
            current.chmod(0o700)
            info = current.lstat()
            ancestors.append({"path": str(current), "device": info.st_dev,
                              "inode": info.st_ino, "uid": info.st_uid,
                              "gid": info.st_gid,
                              "mode": f"0{stat.S_IMODE(info.st_mode):03o}"})
            if current == self.preparations:
                break
            current = current.parent
        entry.update({
            "path": str(root), "type": "ENUMERATED_TREE",
            "physicalBytes": MODULE.physical_usage([root])[str(root)]["allocatedBytes"],
            "sha256": None, "proof": "ENUMERATED_TREE_AUTHORITY",
            "candidateAncestors": ancestors,
            "historicalRecords": [{"path": "docs/evidence.md", "sha256": sha(record)}],
            "packageSymlinksSha256": sha(root / "PACKAGE_SYMLINKS.txt"),
        })
        manifest = control / "config/capacity-recovery/worker-package-audit-disposition.v1.json"
        manifest.parent.mkdir(parents=True)
        private_json(manifest, {
            "schemaVersion": 2, "kind": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
            "dispositionId": "fixture-worker-package-audit-v1", "entries": [entry],
            "versionedEnvExample": {"path": "apps/whatsapp-agent/.env.example",
                                    "sha256": sha(env)},
        })
        binding = {"path": str(manifest), "sha256": sha(manifest)}
        candidate = {"class": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                     "path": str(root), "dispositionManifest": binding}
        patches = mock.patch.multiple(
            MODULE, ROOT=control, PREPARATIONS_ROOT=self.preparations,
            RELEASES_ROOT=self.releases,
            WORKER_PACKAGE_AUDIT_MANIFEST_PATH=manifest,
            WORKER_PACKAGE_AUDIT_MANIFEST_SHA256=sha(manifest),
            WORKER_PACKAGE_AUDIT_DISPOSITION_ID="fixture-worker-package-audit-v1")
        return {"root": root, "authority": authority, "entry": entry,
                "links": links, "control": control, "manifest": manifest,
                "binding": binding, "candidate": candidate, "patches": patches,
                "record": record, "env": env}

    def request_value(self, candidates=None, minimum=1):
        return {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUDIT_REQUEST",
                "minimumRecoveryBytes": minimum, "targetAvailableBytes": minimum,
                "rootPolicy": {"path": str(self.policy), "sha256": sha(self.policy)},
                "operationalState": {"path": str(self.operational), "sha256": sha(self.operational)},
                "candidates": candidates or [self.npm_candidate(), self.output_candidate()]}

    def crm_staging_fixture(self):
        incoming = self.base / "crm-incoming"; incoming.mkdir(mode=0o700)
        candidates = []; bindings = {}
        for index, name in enumerate(("frontend-candidate", "frontend-compatible-return"), 1):
            candidate = self.releases / f"crm-staging-{index}"
            candidate.mkdir(mode=0o700)
            payload = candidate / "payload.js"; payload.write_bytes(f"payload-{index}".encode())
            payload.chmod(0o644)
            (candidate / "payload-link").symlink_to("payload.js")
            archive = incoming / f"{name}.tar.gz"
            archive.write_bytes(f"archive-{index}".encode()); archive.chmod(0o600)
            manifest = incoming / f"{name}.manifest.private.json"
            info = payload.lstat()
            private_json(manifest, {"filesCount": 1, "linksCount": 1,
                "tarBytes": archive.stat().st_size, "tarSha256": sha(archive), "files": [
                    {"path": "payload.js", "sha256": sha(payload), "bytes": info.st_size,
                     "allocatedBytes": info.st_blocks * 512, "mode": 0o664},
                    {"path": "payload-link", "target": "payload.js"},
                ]})
            relation = hashlib.sha256()
            for values in (("payload.js", "regular", oct(0o644), str(info.st_size),
                            str(info.st_blocks * 512), sha(payload)),
                           ("payload-link", "symlink", "payload.js")):
                for value in values:
                    MODULE._crm_relation_field(relation, value)
            bindings[str(candidate)] = {
                "authorityName": name,
                "allocatedBytes": MODULE.physical_usage([candidate])[str(candidate)]["allocatedBytes"],
                "archiveSha256": sha(archive), "archiveBytes": archive.stat().st_size,
                "manifestSha256": sha(manifest), "incomingIndexSha256": "pending",
                "stagingReceiptSha256": "pending", "relationSha256": relation.hexdigest(),
                "modeTransition": {"from": 0o664, "to": 0o644, "count": 1},
                "blockDeltas": [],
            }
            candidates.append(candidate)
        index = incoming / "incoming-index.private.json"
        index_value = {}
        for binding in bindings.values():
            for suffix in (".tar.gz", ".manifest.private.json"):
                source = incoming / f"{binding['authorityName']}{suffix}"
                index_value[source.name] = {"bytes": source.stat().st_size, "sha256": sha(source)}
        private_json(index, index_value)
        receipt = incoming / "staging.receipt.private.json"
        private_json(receipt, {"result": "CSV_INACTIVE_STAGING_COMPLETE",
                               "gatesAdmitted": False, "processActions": 0})
        for binding in bindings.values():
            binding["incomingIndexSha256"] = sha(index)
            binding["stagingReceiptSha256"] = sha(receipt)
        requested = [{"class": "CLOSED_INACTIVE_CRM_STAGING_TREE", "path": str(path)}
                     for path in candidates]
        return incoming, candidates, bindings, requested

    def test_crm_staging_reuses_canonical_references_and_authenticates_authority(self):
        incoming, candidates, bindings, requested = self.crm_staging_fixture()
        operational = {"currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [],
                       "openTransactionPaths": [], "protectedGraphPaths": []}
        with mock.patch.multiple(MODULE, CRM_STAGING_ROOT=incoming,
                                 CRM_INACTIVE_STAGING_BINDINGS=bindings), \
                mock.patch.object(MODULE, "deploy_identity",
                                  return_value=(os.geteuid(), os.getegid())):
            MODULE.validate_audit_request(self.request_value(requested))
            observations = [MODULE.validate_candidate(item, {}, operational, scan())
                            for item in requested]
            self.assertEqual([item["path"] for item in observations],
                             [str(item) for item in candidates])
            self.assertEqual(MODULE.removal_commands(observations),
                             [["/usr/bin/rm", "-r", "--", str(item)]
                              for item in candidates])
            private_json(self.request, self.request_value(requested))
            with self.process_patch():
                plan = MODULE.audit_request(self.request, sha(self.request), self.plan)
            self.assertEqual(plan["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
            transaction = self.transactions / "crm-open-after-audit"
            transaction.mkdir(mode=0o700)
            private_json(transaction / "transaction.v1.private.json", {
                "schemaVersion": 1, "state": "AWAITING_ACCEPTANCE",
                "runtimePath": str(candidates[0]),
            })
            with self.process_patch(), self.assertRaises(SystemExit) as stopped:
                MODULE.prepare_plan(self.plan, sha(self.plan), self.intent,
                                    self.commands, self.seal_manifest)
            self.assertEqual(stopped.exception.code, 2)
            self.assertFalse(self.intent.exists())
            self.assertTrue(all(item.is_dir() for item in candidates))
            (transaction / "transaction.v1.private.json").unlink(); transaction.rmdir()
            referenced = {**operational, "openTransactionPaths": [str(candidates[0] / "x")]}
            with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_REFERENCED_OR_PROTECTED"):
                MODULE.validate_candidate(requested[0], {}, referenced, scan())
            process_reference = scan(targets=[(17, 99, "fd/3", str(candidates[1] / "payload.js"))])
            with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_PROCESS_REFERENCE"):
                MODULE.validate_candidate(requested[1], {}, operational, process_reference)
            with self.assertRaisesRegex(MODULE.Denied, "PROCESS_REFERENCE_SCAN_INCOMPLETE"):
                MODULE.validate_candidate(requested[0], {}, operational, scan(complete=False))
            (candidates[0] / "payload.js").write_bytes(b"drift")
            with self.assertRaisesRegex(MODULE.Denied,
                                       "(CRM_STAGING_REGULAR_IDENTITY|FILE_SHA256)"):
                MODULE.validate_candidate(requested[0], {}, operational, scan())

        with mock.patch.object(MODULE, "CRM_INACTIVE_STAGING_BINDINGS", bindings):
            with self.assertRaisesRegex(MODULE.Denied, "CRM_STAGING_EXACT_BATCH"):
                MODULE.validate_audit_request(self.request_value(requested[:1]))

    def process_patch(self, *, targets=None, writers=None, complete=True):
        return mock.patch.object(MODULE, "_proc_targets",
                                 return_value=scan(targets, writers, complete))

    def fake_process(self, proc_root, pid, uid, arguments, *, start_ticks=100, flags=0,
                     inaccessible_cmdline=False, include_maps=True):
        process = proc_root / str(pid)
        (process / "fd").mkdir(parents=True)
        (process / "status").write_text(f"Name:\tfixture\nUid:\t{uid}\t{uid}\t{uid}\t{uid}\n")
        suffix = ["S", "0", "0", "0", "0", "0", str(flags),
                  *("0" for _ in range(12)), str(start_ticks), "0"]
        (process / "stat").write_text(f"{pid} (fixture process) " + " ".join(suffix) + "\n")
        if inaccessible_cmdline:
            (process / "cmdline").mkdir()
        else:
            (process / "cmdline").write_bytes(
                b"\0".join(item.encode() for item in arguments) + (b"\0" if arguments else b""))
        for leaf in ("cwd", "root", "exe"):
            (process / leaf).symlink_to(self.base)
        if include_maps:
            (process / "maps").write_text("")
        return process

    def identity_patches(self, principals=None):
        return mock.patch.multiple(MODULE, NPM_CACHE=self.cache, NPM_PARENT=self.cache_parent,
                                   deploy_identity=mock.DEFAULT, deploy_group_principals=mock.DEFAULT)

    def audit(self, candidates=None):
        private_json(self.request, self.request_value(candidates))
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            return MODULE.audit_request(self.request, sha(self.request), self.plan)

    def prepare(self):
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            return MODULE.prepare_plan(self.plan, sha(self.plan), self.intent,
                                       self.commands, self.seal_manifest)

    def test_cache_parent_deploy_0775_passes(self):
        candidate = self.npm_candidate()
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]):
            observed = MODULE.authenticate_npm(candidate, scan())
        self.assertEqual(observed["parentIdentity"]["mode"], "0775")

    def authenticate_archive(self, candidate=None, operational=None, process=None):
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations):
            return MODULE.authenticate_preparation_archive(
                candidate or self.archive_candidate(),
                operational or json.loads(self.operational.read_text()),
                process or scan())

    def test_closed_preparation_derived_archive_passes(self):
        observed = self.authenticate_archive()
        self.assertEqual(observed["class"], "CLOSED_PREPARATION_DERIVED_ARCHIVE")
        self.assertEqual(observed["identity"]["nlink"], 1)
        self.assertFalse(observed["archive"]["protectedMaterialFound"])

    def test_manifest_disposition_exact_three_passes_and_uses_physical_blocks(self):
        fixture = self.manifest_disposition_fixture()
        private_json(self.request, self.request_value(fixture["candidates"]))
        with fixture["patches"], self.process_patch():
            plan = MODULE.audit_request(self.request, sha(self.request), self.plan)
        self.assertEqual(plan["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
        self.assertEqual(len(plan["candidates"]), 3)
        expected = sum(item["physicalBytes"] for item in fixture["entries"])
        self.assertEqual(plan["qualifiedBytes"], expected)
        self.assertTrue(any(command[0] == "/usr/bin/rmdir" for command in plan["commands"]))
        self.assertTrue(all(command[0] in {"/usr/bin/unlink", "/usr/bin/rmdir"}
                            for command in plan["commands"]))

    def test_manifest_disposition_missing_extra_or_swapped_path_is_denied(self):
        for mutation in ("missing", "extra", "swapped"):
            fixture = self.manifest_disposition_fixture(mutation)
            candidates = json.loads(json.dumps(fixture["candidates"]))
            if mutation == "missing":
                candidates.pop()
            elif mutation == "extra":
                candidates.append(json.loads(json.dumps(candidates[0])))
                candidates[-1]["path"] += ".extra"
            else:
                candidates[0]["path"] = candidates[1]["path"]
            value = self.request_value(candidates)
            with self.subTest(mutation=mutation), fixture["patches"], \
                    self.assertRaisesRegex(MODULE.Denied,
                                           "DISPOSITION_EXACT_BATCH"):
                MODULE.validate_audit_request(value)

    def test_manifest_disposition_extra_manifest_field_is_denied(self):
        fixture = self.manifest_disposition_fixture("manifest-extra-field")
        value = json.loads(fixture["manifest"].read_text())
        value["invented"] = True
        private_json(fixture["manifest"], value)
        binding = {"path": str(fixture["manifest"]), "sha256": sha(fixture["manifest"])}
        with mock.patch.multiple(
                MODULE, ROOT=fixture["control"], PREPARATIONS_ROOT=self.preparations,
                RELEASES_ROOT=self.releases, DISPOSITION_MANIFEST_PATH=fixture["manifest"],
                DISPOSITION_MANIFEST_SHA256=sha(fixture["manifest"]),
                DISPOSITION_ID="fixture-disposition-v1"), \
                self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_MANIFEST_SCHEMA"):
            MODULE._disposition_manifest(binding)

    def versioned_manifest_fixture(self, source: Path) -> tuple[Path, Path]:
        root = self.base / ("versioned-" + source.stem)
        manifest = json.loads(source.read_text())
        relatives = {source.relative_to(MODULE.ROOT),
                     Path(manifest["versionedEnvExample"]["path"])}
        for entry in manifest["entries"]:
            relatives.update(Path(item["path"]) for item in entry["historicalRecords"])
        for relative in relatives:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((MODULE.ROOT / relative).read_bytes())
            destination.chmod(0o644)
        return root, root / source.relative_to(MODULE.ROOT)

    def test_production_disposition_manifest_and_versioned_evidence_are_exact(self):
        manifest_path = MODULE.DISPOSITION_MANIFEST_PATH
        self.assertEqual(
            MODULE.DISPOSITION_MANIFEST_SHA256,
            "b2b5bff4adeec32f12e9f32e0487a75f85fa334a3273931c88b62338b6d9f78d",
        )
        self.assertEqual(
            sha(manifest_path),
            "b2b5bff4adeec32f12e9f32e0487a75f85fa334a3273931c88b62338b6d9f78d",
        )
        manifest = json.loads(manifest_path.read_text())
        versioned_root, fixture_manifest = self.versioned_manifest_fixture(manifest_path)
        with mock.patch.multiple(MODULE, ROOT=versioned_root,
                                 DISPOSITION_MANIFEST_PATH=fixture_manifest):
            parsed, parsed_entries = MODULE._disposition_manifest({
                "path": str(fixture_manifest), "sha256": MODULE.DISPOSITION_MANIFEST_SHA256,
            })
        self.assertEqual(parsed, manifest)
        self.assertEqual(len(parsed_entries), 3)
        self.assertEqual(set(manifest), {
            "schemaVersion", "kind", "dispositionId", "entries",
            "versionedEnvExample",
        })
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertEqual(manifest["kind"], "CLOSED_PREPARATION_MANIFEST_DISPOSITION")
        self.assertEqual(manifest["dispositionId"], MODULE.DISPOSITION_ID)
        entries = manifest["entries"]
        self.assertEqual(len(entries), 3)
        self.assertEqual(len({entry["path"] for entry in entries}), 3)
        self.assertEqual(sum(entry["physicalBytes"] for entry in entries),
                         458_973_184)
        self.assertEqual({entry["path"] for entry in entries}, {
            "/opt/re7online/backups/converta-persistent/preparations/"
            "incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/"
            "worker-reactive-afbb7455.tar.gz",
            "/opt/re7online/backups/converta-persistent/preparations/"
            "frontend-9f4cbe0f-20261007T012803Z/frontend-9f4cbe0f-v2.tar.gz",
            "/opt/re7online/backups/converta-persistent/preparations/"
            "frontend-fa60-css-supervision-20261007T224500Z/"
            "frontend-fa60-css-corrected.tar.gz",
        })
        self.assertTrue(all(entry["type"] == "ARCHIVE_FILE" for entry in entries))
        env = manifest["versionedEnvExample"]
        self.assertEqual(env, {
            "path": "apps/whatsapp-agent/.env.example",
            "sha256": "55aa02b4c26882cac130c71d009d1e6204a0e9a1586c94bf51e1e1f6eb5a496f",
        })
        self.assertEqual(sha(MODULE.ROOT / env["path"]), env["sha256"])
        for entry in entries:
            for record in entry["historicalRecords"]:
                record_path = MODULE.ROOT / record["path"]
                self.assertTrue(record_path.is_file(), record["path"])
                self.assertEqual(sha(record_path), record["sha256"])
        self.assertTrue(all("protectedMemberExceptions" not in entry for entry in entries))
        self.assertTrue(all("candidateAncestors" in entry for entry in entries))
        present = [entry for entry in entries if entry["authorityState"] == "PRESENT"]
        self.assertEqual(len(present), 3)
        self.assertTrue(all(entry["authorityIdentity"] is not None for entry in present))
        self.assertFalse(any(entry["authorityState"] == "ABSENT" for entry in entries))

    def test_worker_package_audit_manifest_is_closed_and_binds_existing_proofs(self):
        path = MODULE.WORKER_PACKAGE_AUDIT_MANIFEST_PATH
        self.assertEqual(
            MODULE.WORKER_PACKAGE_AUDIT_MANIFEST_SHA256,
            "40727a3c5f6c685ffa0169366310b6f4d92a203ade522835da0c83fbb3868c76",
        )
        self.assertEqual(sha(path), MODULE.WORKER_PACKAGE_AUDIT_MANIFEST_SHA256)
        versioned_root, fixture_manifest = self.versioned_manifest_fixture(path)
        with mock.patch.multiple(MODULE, ROOT=versioned_root,
                                 WORKER_PACKAGE_AUDIT_MANIFEST_PATH=fixture_manifest):
            manifest, entries = MODULE._disposition_manifest({
                "path": str(fixture_manifest),
                "sha256": MODULE.WORKER_PACKAGE_AUDIT_MANIFEST_SHA256,
            })
        self.assertEqual(manifest["dispositionId"],
                         MODULE.WORKER_PACKAGE_AUDIT_DISPOSITION_ID)
        self.assertEqual(len(entries), 1)
        expected_path = (
            "/opt/re7online/backups/converta-persistent/preparations/"
            "incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/"
            "worker-package-audit")
        self.assertEqual(set(entries), {expected_path})
        entry = entries[expected_path]
        self.assertEqual(entry["authority"],
                         "/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified")
        self.assertEqual(entry["physicalBytes"], 365_674_496)
        self.assertEqual(entry["packageFilesSha256"],
                         "650b2a216b595f858c4b9b5110d2dbcd8909bc4a7ec655c3560734c5641ca398")
        self.assertEqual(entry["packageSymlinksSha256"],
                         "2699e8641f1eb28fdfd963c2fea413866edd6eab62e5bd1ad71f1f8606251fc4")
        self.assertEqual(entry["identity"], {
            "device": 64769, "inode": 3161329, "nlink": 3,
            "uid": 1000, "gid": 1000, "mode": "0700",
        })
        for record in entry["historicalRecords"]:
            record_path = MODULE.ROOT / record["path"]
            self.assertEqual(sha(record_path), record["sha256"])
        historical = json.loads((
            MODULE.ROOT / "docs/reviews/automation-freeform-window-release-af26/"
            "worker-reactive-transport-20261005.manifest.json").read_text())
        self.assertEqual(historical["manifestSha256"], entry["packageFilesSha256"])
        self.assertEqual(historical["symlinkCount"], 11)
        relation = MODULE.ROOT / (
            "docs/reviews/automation-freeform-window-release-af26/"
            "worker-reactive-transport-20261005.symlinks.txt")
        self.assertEqual(sha(relation), entry["packageSymlinksSha256"])
        self.assertEqual(len(relation.read_text().splitlines()), 11)

    def test_worker_package_audit_closed_contract_full_lifecycle_and_negatives(self):
        fixture = self.worker_package_audit_disposition_fixture("worker-closed")
        private_json(self.request, self.request_value([fixture["candidate"]]))
        plan = fixture["control"].parent / "worker-plan.private.json"
        intent = self.base / "worker-intent.private.json"
        commands = self.base / "worker-commands.private.json"
        seal = self.base / "worker-seal.private.json"
        with fixture["patches"], self.process_patch():
            audited = MODULE.audit_request(self.request, sha(self.request), plan)
            self.assertEqual(audited["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS",
                             audited["errors"])
            MODULE.prepare_plan(plan, sha(plan), intent, commands, seal)
        sealed = json.loads(intent.read_text())
        self.assertEqual(len(sealed["candidates"]), 1)
        self.assertEqual(sealed["candidates"][0]["path"], str(fixture["root"]))
        self.assertEqual(sealed["candidates"][0]["detail"]["symlinkCount"],
                         len(fixture["links"]))
        self.assertTrue(all(command[0] in {"/usr/bin/unlink", "/usr/bin/rmdir"}
                            for command in sealed["commands"]))
        self.assertFalse(any(str(fixture["authority"]) in argument
                             for command in sealed["commands"] for argument in command))
        self.assertFalse(any(".data" in argument
                             for command in sealed["commands"] for argument in command))

        for name in ("path", "manifest-hash", "identity", "authority-identity",
                     "link", "dependency"):
            negative = self.worker_package_audit_disposition_fixture("worker-negative-" + name)
            candidate = negative["candidate"]
            if name == "path":
                candidate["path"] += ".other"
            elif name == "manifest-hash":
                candidate["dispositionManifest"]["sha256"] = "0" * 64
            elif name == "identity":
                negative["root"].chmod(0o755)
            elif name == "authority-identity":
                negative["authority"].chmod(0o700)
            elif name == "link":
                (negative["root"] / negative["links"][0][0]).unlink()
            else:
                negative["record"].write_text("changed\n")
            private_json(self.request, self.request_value([candidate]))
            expected = {
                "path": "DISPOSITION_EXACT_BATCH",
                "manifest-hash": "DISPOSITION_MANIFEST_FIXED_BINDING",
                "identity": "DISPOSITION_IDENTITY_DIVERGED",
                "authority-identity": "DISPOSITION_AUTHORITY_IDENTITY",
                "link": "DISPOSITION_TREE_LEAF_SET",
                "dependency": "FILE_SHA256",
            }[name]
            with self.subTest(name=name), negative["patches"], self.process_patch():
                try:
                    denied = MODULE.audit_request(
                        self.request, sha(self.request), self.base / f"negative-{name}.json")
                except MODULE.Denied as exc:
                    self.assertIn(expected, str(exc))
                else:
                    self.assertEqual(denied["state"], "P00_CAPACITY_RECOVERY_AUDIT_DENY")
                    self.assertTrue(any(expected in error["predicate"]
                                        for error in denied["errors"]))

        reference = self.worker_package_audit_disposition_fixture("worker-negative-reference")
        private_json(self.request, self.request_value([reference["candidate"]]))
        targets = [(77, 88, "fd/4",
                    str(reference["root"] / "payload/file-00000.bin"))]
        with reference["patches"], self.process_patch(targets=targets):
            denied = MODULE.audit_request(
                self.request, sha(self.request), self.base / "negative-reference.json")
            self.assertEqual(denied["state"], "P00_CAPACITY_RECOVERY_AUDIT_DENY")
            self.assertTrue(any(error["predicate"] == "DISPOSITION_PROCESS_REFERENCE"
                                for error in denied["errors"]))

    def test_worker_package_audit_materialized_controls_cross_phase_lifecycle(self):
        fixture = self.worker_package_audit_disposition_fixture("worker-materialized")

        def phase_module(name):
            root = self.preparations / name / "control"
            sources = {
                "apps/whatsapp-agent/.env.example": fixture["env"],
                "docs/evidence.md": fixture["record"],
                "config/capacity-recovery/worker-package-audit-disposition.v1.json":
                    fixture["manifest"],
                "scripts/capacity-recovery.py": TOOL,
            }
            for relative, source in sources.items():
                destination = root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read_bytes())
                destination.chmod(stat.S_IMODE(source.stat().st_mode))
            spec = importlib.util.spec_from_file_location(
                "worker_materialized_" + name.replace("-", "_"),
                root / "scripts/capacity-recovery.py")
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None
            spec.loader.exec_module(module)
            return root, module

        audit_root, audit_module = phase_module("worker-phase-audit")
        _prepare_root, prepare_module = phase_module("worker-phase-prepare")
        _execute_root, execute_module = phase_module("worker-phase-execute")
        audit_manifest = audit_module.WORKER_PACKAGE_AUDIT_MANIFEST_PATH
        binding = {"path": str(audit_manifest), "sha256": sha(audit_manifest)}
        candidate = {**fixture["candidate"], "dispositionManifest": binding}
        private_json(self.request, self.request_value([candidate]))
        plan = audit_root.parent / "plan.private.json"
        intent = self.base / "materialized-intent.private.json"
        commands = self.base / "materialized-commands.private.json"
        seal = self.base / "materialized-seal.private.json"
        common = dict(
            PREPARATIONS_ROOT=self.preparations, RELEASES_ROOT=self.releases,
            WORKER_PACKAGE_AUDIT_MANIFEST_SHA256=sha(audit_manifest),
            WORKER_PACKAGE_AUDIT_DISPOSITION_ID="fixture-worker-package-audit-v1")
        with mock.patch.multiple(audit_module, **common), \
                mock.patch.object(audit_module, "_proc_targets", return_value=scan()):
            audited = audit_module.audit_request(self.request, sha(self.request), plan)
        self.assertEqual(audited["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
        with mock.patch.multiple(prepare_module, **common), \
                mock.patch.object(prepare_module, "_proc_targets", return_value=scan()):
            prepare_module.prepare_plan(plan, sha(plan), intent, commands, seal)
        sealed = json.loads(intent.read_text())
        authorization = self.base / "materialized-authorization.private.json"
        private_json(authorization, {
            "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUTHORIZATION",
            "authorization": "AUTHORIZE_ONCE", "intentSha256": sha(intent),
            "commandsSha256": sealed["commandsSha256"],
            "paths": [item["path"] for item in sealed["candidates"]],
        })
        receipt = self.base / "receipts/worker-materialized"
        receipt.parent.mkdir(mode=0o700)
        with mock.patch.multiple(execute_module, **common), \
                mock.patch.object(execute_module, "_proc_targets", return_value=scan()):
            result = execute_module.execute_intent(
                intent, sha(intent), authorization, sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertFalse(fixture["root"].exists())
        self.assertTrue(fixture["authority"].exists())
        self.assertTrue((fixture["authority"] / ".data").is_symlink())

    def test_manifest_identity_model_accepts_exact_root_or_deploy_authority(self):
        fixture = self.manifest_disposition_fixture("authority-owner")
        entry = fixture["entries"][0]
        authority = Path(entry["authority"])
        real = MODULE.physical_directory
        original = authority.lstat()
        values = list(original)
        values[4] = 0
        values[5] = 0
        root_owned = os.stat_result(values)
        entry["authorityIdentity"] = MODULE._directory_identity(root_owned)

        def physical(path, predicate):
            return root_owned if path == authority else real(path, predicate)

        with mock.patch.object(MODULE, "physical_directory", side_effect=physical):
            _info, identity = MODULE._authority_root(authority, entry)
        self.assertEqual((identity["uid"], identity["gid"]), (0, 0))

        for field, value in (("device", original.st_dev + 1),
                             ("inode", original.st_ino + 1),
                             ("uid", os.geteuid()), ("gid", os.getegid()),
                             ("mode", "0700" if entry["authorityIdentity"]["mode"] != "0700"
                              else "0755")):
            divergent = json.loads(json.dumps(entry))
            divergent["authorityIdentity"][field] = value
            if divergent["authorityIdentity"] == entry["authorityIdentity"]:
                continue
            with self.subTest(field=field), \
                    mock.patch.object(MODULE, "physical_directory", side_effect=physical), \
                    self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_AUTHORITY_IDENTITY"):
                MODULE._authority_root(authority, divergent)

    def test_manifest_archive_tar_mode_may_differ_from_exact_authority_leaf_mode(self):
        fixture = self.manifest_disposition_fixture("authority-leaf-mode")
        authority_leaf = fixture["authorityRoot"] / "archive-1/dist/app.js"
        authority_leaf.chmod(0o600)
        with fixture["patches"]:
            observed = MODULE.authenticate_manifest_disposition(
                fixture["candidates"][0], json.loads(self.operational.read_text()), scan())
        self.assertEqual(observed["detail"]["memberCount"], 1)

    def test_manifest_candidate_ancestors_are_exact_and_group_write_remains_denied(self):
        fixture = self.manifest_disposition_fixture("ancestor-binding")
        candidate = Path(fixture["entries"][0]["path"])
        expected = fixture["entries"][0]["candidateAncestors"]
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations):
            observed = MODULE._preparation_archive_ancestors(candidate, expected)
        self.assertEqual(observed, expected)

        for field, value in (("device", expected[0]["device"] + 1),
                             ("inode", expected[0]["inode"] + 1),
                             ("uid", 0 if expected[0]["uid"] != 0 else os.geteuid()),
                             ("gid", 0 if expected[0]["gid"] != 0 else os.getegid()),
                             ("mode", "0755" if expected[0]["mode"] != "0755" else "0700")):
            changed = json.loads(json.dumps(expected))
            changed[0][field] = value
            with self.subTest(field=field), \
                    mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                    self.assertRaisesRegex(MODULE.Denied,
                                           "PREPARATION_ARCHIVE_ANCESTOR_IDENTITY"):
                MODULE._preparation_archive_ancestors(candidate, changed)

        candidate.parent.chmod(0o775)
        changed = json.loads(json.dumps(expected))
        changed[0]["mode"] = "0775"
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                self.assertRaisesRegex(MODULE.Denied,
                                       "PREPARATION_ARCHIVE_ANCESTOR_IDENTITY"):
            MODULE._preparation_archive_ancestors(candidate, changed)

    def test_manifest_tree_directory_owner_may_differ_but_group_write_denies(self):
        fixture = self.manifest_disposition_fixture("tree-directory-owner")
        tree = fixture["paths"][1]
        target = tree / "dist"
        original = target.lstat()
        values = list(original); values[4] = 0; values[5] = 0
        root_owned = os.stat_result(values)
        real = MODULE.physical_directory

        def physical(path, predicate):
            return root_owned if path == target else real(path, predicate)

        with fixture["patches"], \
                mock.patch.object(MODULE, "physical_directory", side_effect=physical):
            observed = MODULE.authenticate_manifest_disposition(
                fixture["candidates"][1], json.loads(self.operational.read_text()), scan())
        self.assertEqual(observed["detail"]["leafCount"], 3)

        fixture = self.manifest_disposition_fixture("tree-directory-write")
        (fixture["paths"][1] / "dist").chmod(0o775)
        with fixture["patches"], \
                self.assertRaisesRegex(MODULE.Denied,
                                       "DISPOSITION_TREE_DIRECTORY_IDENTITY"):
            MODULE.authenticate_manifest_disposition(
                fixture["candidates"][1], json.loads(self.operational.read_text()), scan())

    def test_manifest_absent_authority_is_a_closed_material_denial(self):
        fixture = self.manifest_disposition_fixture("authority-absent-state")
        entry = fixture["entries"][0]
        entry["authorityState"] = "ABSENT"
        entry["authorityIdentity"] = None
        with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_AUTHORITY_ABSENT"):
            MODULE._authority_root(Path(entry["authority"]), entry)

    def test_audit_semantic_deny_exits_nonzero_after_printing_plan(self):
        args = SimpleNamespace(action="audit", request=Path("/request"),
                               request_sha256="a" * 64, plan_output=Path("/plan"))
        output = io.StringIO()
        with mock.patch.object(MODULE, "parse_args", return_value=args), \
                mock.patch.object(MODULE, "audit_request", return_value={
                    "state": "P00_CAPACITY_RECOVERY_AUDIT_DENY", "errors": [
                        {"predicate": "MATERIAL_DENY"}
                    ]}), mock.patch.object(MODULE.sys, "stdout", output), \
                mock.patch.object(MODULE.os, "umask"), \
                self.assertRaises(SystemExit) as stopped:
            MODULE.main()
        self.assertEqual(stopped.exception.code, 2)
        self.assertIn("P00_CAPACITY_RECOVERY_AUDIT_DENY", output.getvalue())

    def test_manifest_disposition_byte_inode_authority_manifest_and_record_drift_deny(self):
        mutations = ("byte", "inode", "authority", "authority-absent",
                     "authority-symlink", "manifest", "record")
        for mutation in mutations:
            fixture = self.manifest_disposition_fixture(mutation)
            candidate = fixture["candidates"][0]
            if mutation == "byte":
                Path(candidate["path"]).write_bytes(b"drift")
            elif mutation == "inode":
                path = Path(candidate["path"]); replacement = path.with_suffix(".new")
                replacement.write_bytes(path.read_bytes()); replacement.chmod(0o600)
                path.unlink(); replacement.rename(path)
            elif mutation == "authority":
                (fixture["authorityRoot"] / "archive-1/dist/app.js").write_bytes(b"drift")
            elif mutation == "authority-absent":
                (fixture["authorityRoot"] / "archive-1").rename(
                    fixture["authorityRoot"] / "archive-1-absent")
            elif mutation == "authority-symlink":
                authority = fixture["authorityRoot"] / "archive-1"
                moved = fixture["authorityRoot"] / "archive-1-physical"
                authority.rename(moved)
                authority.symlink_to(moved)
            elif mutation == "manifest":
                fixture["manifest"].write_bytes(fixture["manifest"].read_bytes() + b" ")
            else:
                fixture["record"].write_text("drift\n")
            with self.subTest(mutation=mutation), fixture["patches"], \
                    self.assertRaises(MODULE.Denied):
                MODULE.authenticate_manifest_disposition(
                    candidate, json.loads(self.operational.read_text()), scan())

    def test_manifest_disposition_protected_env_and_upload_exceptions_are_digest_scoped(self):
        fixture = self.manifest_disposition_fixture("exceptions-pass")
        night = fixture["candidates"][2]
        with fixture["patches"]:
            observed = MODULE.authenticate_manifest_disposition(
                night, json.loads(self.operational.read_text()), scan())
        self.assertGreater(observed["detail"]["memberCount"], 1)

        fixture = self.manifest_disposition_fixture("exceptions-deny")
        regular = Path(fixture["candidates"][0]["path"])
        with tarfile.open(regular, "w:gz") as archive:
            payload = b"secret"
            item = tarfile.TarInfo("apps/whatsapp-agent/.env.production")
            item.size = len(payload); archive.addfile(item, io.BytesIO(payload))
        regular.chmod(0o600)
        entry = fixture["entries"][0]; info = regular.lstat()
        entry["sha256"] = sha(regular); entry["physicalBytes"] = info.st_blocks * 512
        entry["identity"] = {"device": info.st_dev, "inode": info.st_ino, "nlink": 1,
                             "uid": info.st_uid, "gid": info.st_gid,
                             "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}
        private_json(fixture["manifest"], {
            "schemaVersion": 2, "kind": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
            "dispositionId": "fixture-disposition-v1", "entries": fixture["entries"],
            "versionedEnvExample": {"path": "apps/whatsapp-agent/.env.example",
                                    "sha256": sha(fixture["control"] / "apps/whatsapp-agent/.env.example")},
        })
        with mock.patch.multiple(
                MODULE, ROOT=fixture["control"], PREPARATIONS_ROOT=self.preparations,
                RELEASES_ROOT=self.releases,
                DISPOSITION_MANIFEST_PATH=fixture["manifest"],
                DISPOSITION_MANIFEST_SHA256=sha(fixture["manifest"]),
                DISPOSITION_ID="fixture-disposition-v1"), \
                self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_ARCHIVE_PROTECTED_MATERIAL"):
            MODULE.authenticate_manifest_disposition(
                {**fixture["candidates"][0], "dispositionManifest": {
                    "path": str(fixture["manifest"]), "sha256": sha(fixture["manifest"])}},
                json.loads(self.operational.read_text()), scan())

        manifest = {"versionedEnvExample": {"sha256": "a" * 64}}
        with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_ARCHIVE_PROTECTED_MATERIAL"):
            MODULE._protected_archive_member(
                "uploads/customer.bin", {"protectedMemberExceptions": [
                    {"kind": "OPENAI_LIBRARY_CODE",
                     "pathPrefix": "node_modules/openai/resources/uploads/"}]},
                "a" * 64, manifest)
        with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_ARCHIVE_PROTECTED_MATERIAL"):
            MODULE._protected_archive_member(
                "apps/whatsapp-agent/.env", {"protectedMemberExceptions": []},
                "a" * 64, manifest)
        unsafe = tarfile.TarInfo("node_modules/link")
        unsafe.type = tarfile.SYMTYPE; unsafe.linkname = "../../../outside"
        with self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_ARCHIVE_SYMLINK"):
            MODULE._safe_archive_link(unsafe, PurePosixPath(unsafe.name))

    def test_manifest_disposition_tree_extra_symlink_and_hardlink_are_denied(self):
        for mutation in ("extra", "missing", "symlink", "hardlink"):
            fixture = self.manifest_disposition_fixture("tree-" + mutation)
            tree = fixture["paths"][1]
            if mutation == "extra":
                (tree / "extra").write_bytes(b"extra")
            elif mutation == "missing":
                (tree / "dist/worker.js").unlink()
            elif mutation == "symlink":
                (tree / "link").symlink_to("dist/worker.js")
            else:
                os.link(tree / "dist/worker.js", tree / "hardlink")
            with self.subTest(mutation=mutation), fixture["patches"], \
                    self.assertRaisesRegex(MODULE.Denied,
                                           "DISPOSITION_TREE_LEAF_SET|DISPOSITION_TREE_UNSAFE_LEAF|DISPOSITION_TREE_HARDLINK"):
                MODULE.authenticate_manifest_disposition(
                    fixture["candidates"][1], json.loads(self.operational.read_text()), scan())

    def test_manifest_disposition_tree_authenticates_declared_links_and_preserves_overlay(self):
        tree, authority, entry, links = self.worker_tree_fixture("tree-links-pass")
        overlay_before = os.readlink(authority / ".data")
        first = MODULE._authenticate_disposition_tree(tree, entry)
        second = MODULE._authenticate_disposition_tree(tree, entry)
        self.assertEqual(first["symlinkCount"], len(links))
        self.assertEqual(first["relationSha256"], second["relationSha256"])
        self.assertEqual(os.readlink(authority / ".data"), overlay_before)
        commands = first["effects"]
        link_commands = {tuple(command) for command in commands
                         if Path(command[-1]).is_symlink()}
        self.assertEqual(link_commands, {
            ("/usr/bin/unlink", "--", str(tree / relative))
            for relative, _target in links
        })
        self.assertTrue(all(command[0] in {"/usr/bin/unlink", "/usr/bin/rmdir"}
                            for command in commands))
        self.assertFalse(any(str(authority) in argument
                             for command in commands for argument in command))

    def test_worker_package_materializer_matches_consumer_outside_checkout(self):
        fixture = self.worker_package_audit_disposition_fixture("materializer-e2e")
        external = self.base / "external-custody"
        control = external / "control"
        scripts = control / "scripts"
        config = control / "config/capacity-recovery"
        scripts.mkdir(parents=True); config.mkdir(parents=True)
        source = Path(__file__).resolve().parents[1]
        shutil.copy2(source / "capacity-recovery-worker-package-materialize.py",
                     scripts / "capacity-recovery-worker-package-materialize.py")
        shutil.copy2(source / "capacity-recovery.py", scripts / "capacity-recovery.py")
        (scripts / "capacity-recovery.py").chmod(0o644)
        shutil.copy2(fixture["manifest"], config / "worker-package-audit-disposition.v1.json")
        shutil.copytree(fixture["control"] / "apps", control / "apps")
        shutil.copytree(fixture["control"] / "docs", control / "docs")
        materializer_spec = importlib.util.spec_from_file_location(
            "external_materializer", scripts / "capacity-recovery-worker-package-materialize.py")
        materializer = importlib.util.module_from_spec(materializer_spec)
        assert materializer_spec.loader is not None; materializer_spec.loader.exec_module(materializer)
        consumer_spec = importlib.util.spec_from_file_location(
            "external_consumer", scripts / "capacity-recovery.py")
        consumer = importlib.util.module_from_spec(consumer_spec)
        assert consumer_spec.loader is not None; consumer_spec.loader.exec_module(consumer)

        def configure_consumer(module):
            module.ROOT = control
            module.PREPARATIONS_ROOT = self.preparations
            module.RELEASES_ROOT = self.releases
            module.WORKER_PACKAGE_AUDIT_MANIFEST_PATH = manifest
            module.WORKER_PACKAGE_AUDIT_MANIFEST_SHA256 = sha(manifest)
            module.WORKER_PACKAGE_AUDIT_DISPOSITION_ID = "fixture-worker-package-audit-v1"
            module.PROC_OBSERVER_PATH = helper
            return module

        node = external / "node"; node.write_text("#!/bin/sh\necho v20.20.0\n"); node.chmod(0o755)
        rows = [{"name": "api", "pid": 7, "pm2_env": {"status": "online",
                 "restart_time": 1, "pm_cwd": "/release", "pm_exec_path": "/release/app.js"}}]
        pm2 = external / "pm2"; pm2.write_text(
            "#!/usr/bin/python3\nimport json\nprint(json.dumps(" + repr(rows) + "))\n"); pm2.chmod(0o700)
        dump = external / "dump.json"; private_json(dump, [])
        graph = external / "release-graph.private.json"; private_json(
            graph, {"schemaVersion": 1, "protectedGraphPaths": []})
        policy = external / "deploy-artifact-roots.json"; shutil.copy2(self.policy, policy); policy.chmod(0o600)
        helper = external / "helper"; helper.write_bytes(b"helper"); helper.chmod(0o500)
        helper_info = helper.lstat()
        proof = external / "helper-installation-proof.private.json"
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": materializer.INSTALLER_SHA256,
            "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper), "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        current = external / "current"; current.mkdir()
        api = external / "api"; frontend = external / "frontend"; api.mkdir(); frontend.mkdir()
        (current / "api").symlink_to(api); (current / "frontend").symlink_to(frontend)
        transactions = external / "transactions"; transactions.mkdir(mode=0o700)
        deployment_lock = external / "deploy.lock"; deployment_lock.write_bytes(b"")
        writer_lock = external / "writer.lock"; writer_lock.write_bytes(b"")
        manifest = config / "worker-package-audit-disposition.v1.json"
        configure_consumer(consumer)
        load_authenticated = materializer.authenticated_consumer

        def load_configured_consumer():
            return configure_consumer(load_authenticated())

        fd_identity_checks = []
        confirm_identity = materializer.confirm_open_identity

        def confirm_same_fd(fd, path, expected):
            fd_identity_checks.append((os.fstat(fd).st_dev, os.fstat(fd).st_ino,
                                       path.lstat().st_dev, path.lstat().st_ino))
            return confirm_identity(fd, path, expected)

        with mock.patch.multiple(materializer, CUSTODY=external, ROOT=control, PM2=pm2,
                PM2_SHA256=sha(pm2), NODE=node, NODE_SHA256=sha(node), DUMP=dump,
                GRAPH=graph, POLICY=policy, MANIFEST=manifest, HELPER=helper,
                HELPER_SHA256=sha(helper), WORKER_HELPER_SHA256=sha(helper),
                HELPER_PROOF=proof, CANDIDATE=fixture["root"],
                CURRENT=current, TRANSACTIONS=transactions, DEPLOYMENT_LOCK=deployment_lock,
                WRITER_LOCK=writer_lock, MINIMUM_RECOVERY_BYTES=1,
                authenticated_consumer=load_configured_consumer,
                confirm_open_identity=confirm_same_fd):
            result = materializer.materialize()
        self.assertEqual(fd_identity_checks, [(pm2.stat().st_dev, pm2.stat().st_ino,
                                               pm2.stat().st_dev, pm2.stat().st_ino)])
        request_path = external / "audit-request.private.json"
        request = json.loads(request_path.read_text())
        binding_readback = json.loads((external / "binding-readback.private.json").read_text())
        self.assertEqual(binding_readback["requestSha256"], sha(request_path))
        self.assertEqual(binding_readback["operationalStateSha256"],
                         request["operationalState"]["sha256"])
        self.assertEqual(binding_readback["manifestSha256"],
                         request["candidates"][0]["dispositionManifest"]["sha256"])
        self.assertEqual(binding_readback["rootPolicySha256"], request["rootPolicy"]["sha256"])
        self.assertEqual(result["pm2FingerprintSha256"],
            consumer.digest_bytes(consumer.canonical(consumer._pm2_projection(rows))))
        plan_path = external / "plan.private.json"
        process_evidence = {"mechanism": "synthetic-privileged-boundary"}
        with mock.patch.object(consumer, "_privileged_proc_targets",
                               return_value=(scan(), process_evidence)):
            plan = consumer.audit_request(request_path, sha(request_path), plan_path)
        self.assertEqual(plan["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
        self.assertEqual(plan["errors"], [])
        self.assertEqual(len(plan["candidates"]), 1)
        self.assertEqual(plan["candidates"][0]["observation"]["path"], str(fixture["root"]))
        self.assertEqual(plan["processObservation"], process_evidence)
        self.assertEqual(json.loads(plan_path.read_text()), plan)

        bad_operational = json.loads((external / "operational-state.schema2.private.json").read_text())
        bad_operational["liveObservations"]["pm2"]["fingerprintSha256"] = "0" * 64
        bad_operational_path = external / "operational-state.bad-fingerprint.private.json"
        private_json(bad_operational_path, bad_operational)
        bad_request = json.loads(request_path.read_text())
        bad_request["operationalState"] = {"path": str(bad_operational_path),
                                           "sha256": sha(bad_operational_path)}
        bad_request_path = external / "audit-request.bad-fingerprint.private.json"
        bad_request_path.write_bytes(consumer.canonical(bad_request)); bad_request_path.chmod(0o600)
        with mock.patch.object(consumer, "_privileged_proc_targets",
                               return_value=(scan(), process_evidence)), \
                self.assertRaisesRegex(consumer.Denied, "LIVE_PM2_CHANGED"):
            consumer.audit_request(bad_request_path, sha(bad_request_path),
                                   external / "bad-plan.private.json")

        operational_path = external / "operational-state.schema2.private.json"
        operational_raw = operational_path.read_bytes()
        binding_path = external / "binding-readback.private.json"
        binding_path.unlink()
        operational_path.write_bytes(operational_raw + b"\n")
        with self.assertRaises(consumer.Denied):
            materializer.final_readback(consumer, request_path, sha(request_path),
                                        request["procObserver"])
        self.assertFalse(binding_path.exists())
        operational_path.write_bytes(operational_raw)
        manifest_raw = manifest.read_bytes()
        manifest.write_bytes(manifest_raw + b"\n")
        with self.assertRaises(consumer.Denied):
            consumer.validate_audit_request(request)
        manifest.write_bytes(manifest_raw)
        consumer_path = scripts / "capacity-recovery.py"
        consumer_raw = consumer_path.read_bytes()
        consumer_path.write_bytes(consumer_raw + b"\n")
        with self.assertRaisesRegex(RuntimeError, "SHA256"):
            materializer.authenticated_consumer()
        consumer_path.write_bytes(consumer_raw); consumer_path.chmod(0o644)
        proof.unlink()
        with mock.patch.multiple(materializer, HELPER_PROOF=proof):
            with self.assertRaises((FileNotFoundError, RuntimeError)):
                materializer.helper_binding()
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": "0" * 64,
            "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper), "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_SHA256=sha(helper)), \
                self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
            materializer.helper_binding()
        proof.unlink()
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": materializer.INSTALLER_SHA256,
            "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper) + ".other", "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_SHA256=sha(helper)), \
                self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
            materializer.helper_binding()
        proof.unlink()
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": materializer.INSTALLER_SHA256,
            "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper), "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino + 1,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_SHA256=sha(helper)), \
                self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_IDENTITY"):
            materializer.helper_binding()

    def test_materializer_profiles_preserve_worker_and_close_ef7_and_crm_scope(self):
        source = Path(__file__).resolve().parents[1] / (
            "capacity-recovery-worker-package-materialize.py")
        spec = importlib.util.spec_from_file_location("closed_profile_materializer", source)
        materializer = importlib.util.module_from_spec(spec)
        assert spec.loader is not None; spec.loader.exec_module(materializer)
        worker = materializer.profile_contract(materializer.WORKER_PROFILE)
        self.assertEqual(worker, {
            "manifest": materializer.MANIFEST,
            "minimumRecoveryBytes": materializer.MINIMUM_RECOVERY_BYTES,
            "installerSha256": materializer.INSTALLER_SHA256,
            "helperSha256": materializer.HELPER_SHA256,
            "candidates": [{"class": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                            "path": str(materializer.CANDIDATE)}],
        })
        ef7 = materializer.profile_contract(materializer.EF7_PROFILE)
        self.assertEqual(ef7["manifest"], materializer.EF7_MANIFEST)
        self.assertEqual(ef7["minimumRecoveryBytes"],
                         materializer.EF7_MINIMUM_RECOVERY_BYTES)
        self.assertEqual(ef7["installerSha256"], materializer.EF7_INSTALLER_SHA256)
        self.assertEqual(ef7["helperSha256"], materializer.EF7_HELPER_SHA256)
        self.assertEqual(ef7["candidates"], [
            {"class": "CLOSED_DEPLOY_CONTROL_DERIVED_TREE", "path": str(path)}
            for path in materializer.EF7_CANDIDATES])
        crm = materializer.profile_contract(materializer.CRM_PROFILE)
        self.assertIsNone(crm["manifest"])
        self.assertEqual(crm["minimumRecoveryBytes"],
                         materializer.CRM_MINIMUM_RECOVERY_BYTES)
        self.assertEqual(crm["installerSha256"], materializer.CRM_INSTALLER_SHA256)
        self.assertEqual(crm["helperSha256"], materializer.CRM_HELPER_SHA256)
        self.assertEqual(crm["candidates"], [
            {"class": "CLOSED_INACTIVE_CRM_STAGING_TREE", "path": str(path)}
            for path in materializer.CRM_CANDIDATES])
        with self.assertRaisesRegex(RuntimeError, "PROFILE_DENY"):
            materializer.profile_contract("/opt/re7online/deploy-control")

        installer_path = Path(__file__).resolve().parents[1] / (
            "install-capacity-proc-observer-ef7.py")
        self.assertEqual(sha(installer_path), materializer.EF7_INSTALLER_SHA256)
        installer_spec = importlib.util.spec_from_file_location(
            "ef7_closed_helper_installer", installer_path)
        installer = importlib.util.module_from_spec(installer_spec)
        assert installer_spec.loader is not None
        installer_spec.loader.exec_module(installer)
        self.assertEqual(installer.SOURCE_SHA256, materializer.EF7_HELPER_SHA256)
        self.assertEqual(installer.PREVIOUS_HELPERS, ({
            "path": str(materializer.HELPER),
            "sha256": materializer.WORKER_HELPER_SHA256,
            "device": 64769, "inode": 800988, "uid": 0, "gid": 0,
            "mode": "0500",
        },))
        self.assertEqual(installer.SUDOERS_SHA256, materializer.SUDOERS_SHA256)
        self.assertEqual(installer.TARGET, materializer.HELPER)

        crm_installer_path = Path(__file__).resolve().parents[1] / (
            "install-capacity-proc-observer-crm-staging.py")
        self.assertEqual(sha(crm_installer_path), materializer.CRM_INSTALLER_SHA256)
        crm_installer_spec = importlib.util.spec_from_file_location(
            "crm_closed_helper_installer", crm_installer_path)
        crm_installer = importlib.util.module_from_spec(crm_installer_spec)
        assert crm_installer_spec.loader is not None
        crm_installer_spec.loader.exec_module(crm_installer)
        self.assertEqual(crm_installer.SOURCE_SHA256, materializer.CRM_HELPER_SHA256)
        self.assertEqual(crm_installer.PREVIOUS_HELPERS, ({
            "path": str(materializer.HELPER),
            "sha256": materializer.EF7_HELPER_SHA256,
            "device": 64769, "inode": 803452, "uid": 0, "gid": 0,
            "mode": "0500",
        },))
        self.assertEqual(crm_installer.SUDOERS_SHA256, materializer.SUDOERS_SHA256)

    def test_worker_ef7_and_crm_helper_proofs_are_not_interchangeable(self):
        source = Path(__file__).resolve().parents[1] / (
            "capacity-recovery-worker-package-materialize.py")
        spec = importlib.util.spec_from_file_location("profile_proof_materializer", source)
        materializer = importlib.util.module_from_spec(spec)
        assert spec.loader is not None; spec.loader.exec_module(materializer)
        helper = self.base / "closed-helper"; helper.write_bytes(b"root-owned-unreadable-fixture")
        helper.chmod(0o500); info = helper.lstat()
        proof = self.base / "helper-proof.private.json"
        def write_proof(installer_sha, helper_sha):
            private_json(proof, {"schemaVersion": 1,
                "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
                "installerSha256": installer_sha,
                "sudoersSha256": materializer.SUDOERS_SHA256,
                "helper": {"path": str(helper), "sha256": helper_sha,
                    "identity": {"device": info.st_dev, "inode": info.st_ino,
                        "uid": info.st_uid, "gid": info.st_gid, "mode": "0500"}}})
        write_proof(materializer.WORKER_INSTALLER_SHA256,
                    materializer.WORKER_HELPER_SHA256)
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_PROOF=proof):
            binding, _ = materializer.helper_binding(
                materializer.WORKER_INSTALLER_SHA256,
                materializer.WORKER_HELPER_SHA256)
            self.assertEqual(binding, {"path": str(helper),
                "sha256": materializer.WORKER_HELPER_SHA256})
            with self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
                materializer.helper_binding(materializer.EF7_INSTALLER_SHA256,
                                            materializer.EF7_HELPER_SHA256)
        proof.unlink(); write_proof(materializer.EF7_INSTALLER_SHA256,
                                    materializer.EF7_HELPER_SHA256)
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_PROOF=proof):
            binding, _ = materializer.helper_binding(
                materializer.EF7_INSTALLER_SHA256, materializer.EF7_HELPER_SHA256)
            self.assertEqual(binding, {"path": str(helper),
                "sha256": materializer.EF7_HELPER_SHA256})
            with self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
                materializer.helper_binding(materializer.WORKER_INSTALLER_SHA256,
                                            materializer.WORKER_HELPER_SHA256)
            with self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
                materializer.helper_binding(materializer.CRM_INSTALLER_SHA256,
                                            materializer.CRM_HELPER_SHA256)
        proof.unlink(); write_proof(materializer.CRM_INSTALLER_SHA256,
                                    materializer.CRM_HELPER_SHA256)
        with mock.patch.multiple(materializer, HELPER=helper, HELPER_PROOF=proof):
            binding, _ = materializer.helper_binding(
                materializer.CRM_INSTALLER_SHA256, materializer.CRM_HELPER_SHA256)
            self.assertEqual(binding, {"path": str(helper),
                "sha256": materializer.CRM_HELPER_SHA256})
            with self.assertRaisesRegex(RuntimeError, "HELPER_PROOF_BINDING"):
                materializer.helper_binding(materializer.EF7_INSTALLER_SHA256,
                                            materializer.EF7_HELPER_SHA256)

    def test_crm_materializer_emits_exact_schema3_request_without_manifest(self):
        source = Path(__file__).resolve().parents[1]
        materializer_path = source / "capacity-recovery-worker-package-materialize.py"
        spec = importlib.util.spec_from_file_location("crm_profile_materializer", materializer_path)
        materializer = importlib.util.module_from_spec(spec)
        assert spec.loader is not None; spec.loader.exec_module(materializer)
        custody = self.base / "crm-materializer"; custody.mkdir(mode=0o700)
        control = custody / "control"; (control / "scripts").mkdir(parents=True)
        consumer_copy = control / "scripts/capacity-recovery.py"
        shutil.copy2(source / "capacity-recovery.py", consumer_copy); consumer_copy.chmod(0o644)
        node = custody / "node"; node.write_text("#!/bin/sh\necho v20.20.0\n"); node.chmod(0o755)
        pm2 = custody / "pm2"; pm2.write_text("#!/bin/sh\nprintf '[]\\n'\n"); pm2.chmod(0o700)
        dump = custody / "dump.json"; private_json(dump, [])
        graph = custody / "release-graph.private.json"
        private_json(graph, {"schemaVersion": 1, "protectedGraphPaths": []})
        policy = custody / "deploy-artifact-roots.json"
        shutil.copy2(self.policy, policy); policy.chmod(0o600)
        helper = custody / "helper"; helper.write_bytes(b"crm-helper"); helper.chmod(0o500)
        helper_info = helper.lstat(); proof = custody / "helper-installation-proof.private.json"
        installer_sha = "c" * 64
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": installer_sha, "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper), "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        current = custody / "current"; current.mkdir()
        for component in ("api", "frontend"):
            target = custody / component; target.mkdir(); (current / component).symlink_to(target)
        transactions = custody / "transactions"; transactions.mkdir(mode=0o700)
        deployment_lock = custody / "deploy.lock"; deployment_lock.write_bytes(b"")
        writer_lock = custody / "writer.lock"; writer_lock.write_bytes(b"")
        original_loader = materializer.authenticated_consumer
        def configured_consumer():
            consumer = original_loader(); consumer.PROC_OBSERVER_PATH = helper
            return consumer
        with mock.patch.multiple(materializer, CUSTODY=custody,
                CONSUMER=consumer_copy, CONSUMER_SHA256=sha(consumer_copy),
                PM2=pm2, PM2_SHA256=sha(pm2), NODE=node, NODE_SHA256=sha(node),
                DUMP=dump, GRAPH=graph, POLICY=policy, HELPER=helper,
                HELPER_PROOF=proof, CRM_INSTALLER_SHA256=installer_sha,
                CRM_HELPER_SHA256=sha(helper), CURRENT=current,
                TRANSACTIONS=transactions, DEPLOYMENT_LOCK=deployment_lock,
                WRITER_LOCK=writer_lock, authenticated_consumer=configured_consumer):
            result = materializer.materialize(materializer.CRM_PROFILE)
        request_path = custody / "audit-request.private.json"
        request = json.loads(request_path.read_text())
        self.assertEqual(result["requestSha256"], sha(request_path))
        self.assertEqual(request["schemaVersion"], 3)
        self.assertTrue(request["incrementalBatch"])
        self.assertEqual(request["candidates"], [
            {"class": "CLOSED_INACTIVE_CRM_STAGING_TREE", "path": str(path)}
            for path in materializer.CRM_CANDIDATES])
        self.assertTrue(all("dispositionManifest" not in item
                            for item in request["candidates"]))
        readback = json.loads((custody / "binding-readback.private.json").read_text())
        self.assertIsNone(readback["manifestSha256"])
        self.assertEqual(readback["requestSha256"], sha(request_path))

    def test_ef7_installer_denies_unknown_existing_helper_before_replacement(self):
        installer_path = Path(__file__).resolve().parents[1] / (
            "install-capacity-proc-observer-ef7.py")
        spec = importlib.util.spec_from_file_location("closed_ef7_installer", installer_path)
        installer = importlib.util.module_from_spec(spec)
        assert spec.loader is not None; spec.loader.exec_module(installer)
        root_info = SimpleNamespace(st_dev=1, st_ino=2, st_mode=stat.S_IFREG | 0o600,
            st_uid=0, st_gid=0, st_size=1, st_mtime_ns=1, st_ctime_ns=1, st_nlink=1)
        sudoers_info = SimpleNamespace(**{**root_info.__dict__, "st_ino": 3,
            "st_mode": stat.S_IFREG | 0o440})
        unknown_info = SimpleNamespace(**{**root_info.__dict__, "st_dev": 64769,
            "st_ino": 999999, "st_mode": stat.S_IFREG | 0o500})
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
                mock.patch.object(installer.os, "getegid", return_value=0), \
                mock.patch.object(installer, "stable_regular", side_effect=[
                    (b"source", root_info), (b"sudoers", sudoers_info),
                    (b"unknown helper", unknown_info)]), \
                mock.patch.object(installer.os, "open") as opened, \
                self.assertRaisesRegex(RuntimeError, "PREVIOUS_HELPER_NOT_ALLOWED"):
            installer.install()
        opened.assert_not_called()

    def test_crm_installer_denies_unknown_existing_helper_before_replacement(self):
        installer_path = Path(__file__).resolve().parents[1] / (
            "install-capacity-proc-observer-crm-staging.py")
        spec = importlib.util.spec_from_file_location("closed_crm_installer", installer_path)
        installer = importlib.util.module_from_spec(spec)
        assert spec.loader is not None; spec.loader.exec_module(installer)
        root_info = SimpleNamespace(st_dev=1, st_ino=2, st_mode=stat.S_IFREG | 0o600,
            st_uid=0, st_gid=0, st_size=1, st_mtime_ns=1, st_ctime_ns=1, st_nlink=1)
        sudoers_info = SimpleNamespace(**{**root_info.__dict__, "st_ino": 3,
            "st_mode": stat.S_IFREG | 0o440})
        unknown_info = SimpleNamespace(**{**root_info.__dict__, "st_dev": 64769,
            "st_ino": 999999, "st_mode": stat.S_IFREG | 0o500})
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
                mock.patch.object(installer.os, "getegid", return_value=0), \
                mock.patch.object(installer, "stable_regular", side_effect=[
                    (b"source", root_info), (b"sudoers", sudoers_info),
                    (b"unknown helper", unknown_info)]), \
                mock.patch.object(installer.os, "open") as opened, \
                self.assertRaisesRegex(RuntimeError, "PREVIOUS_HELPER_NOT_ALLOWED"):
            installer.install()
        opened.assert_not_called()

    def test_ef7_materializer_schema3_to_real_audit_outside_checkout(self):
        fixture = self.ef7_fixture("ef7-materializer-e2e")
        custody = fixture["base"] / "custody"
        control = custody / "control"
        scripts = control / "scripts"
        config = control / "config/capacity-recovery"
        scripts.mkdir(parents=True); config.mkdir(parents=True)
        source = Path(__file__).resolve().parents[1]
        materializer_path = scripts / "capacity-recovery-worker-package-materialize.py"
        consumer_path = scripts / "capacity-recovery.py"
        shutil.copy2(source / materializer_path.name, materializer_path)
        shutil.copy2(source / consumer_path.name, consumer_path); consumer_path.chmod(0o644)
        manifest = config / "ef7db111-deploy-control-disposition.v1.json"
        shutil.copy2(fixture["manifest"], manifest); manifest.chmod(0o600)
        materializer_spec = importlib.util.spec_from_file_location(
            "ef7_external_materializer", materializer_path)
        materializer = importlib.util.module_from_spec(materializer_spec)
        assert materializer_spec.loader is not None
        materializer_spec.loader.exec_module(materializer)

        def configured_consumer():
            spec = importlib.util.spec_from_file_location("ef7_external_consumer", consumer_path)
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None; spec.loader.exec_module(module)
            for key, value in fixture["patches"].items(): setattr(module, key, value)
            module.ROOT = control
            module.DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH = manifest
            module.DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256 = sha(manifest)
            module.PROC_OBSERVER_PATH = helper
            return module

        node = custody / "node"; node.write_text("#!/bin/sh\necho v20.20.0\n"); node.chmod(0o755)
        rows = [{"name": "api", "pid": 7, "pm2_env": {"status": "online",
                 "restart_time": 1, "pm_cwd": "/release", "pm_exec_path": "/release/app.js"}}]
        pm2 = custody / "pm2"; pm2.write_text(
            "#!/usr/bin/python3\nimport json\nprint(json.dumps(" + repr(rows) + "))\n"); pm2.chmod(0o700)
        dump = custody / "dump.json"; private_json(dump, [])
        graph = custody / "release-graph.private.json"
        private_json(graph, {"schemaVersion": 1, "protectedGraphPaths": []})
        policy = custody / "deploy-artifact-roots.json"; shutil.copy2(self.policy, policy); policy.chmod(0o600)
        helper = custody / "helper"; helper.write_bytes(b"helper"); helper.chmod(0o500)
        helper_info = helper.lstat()
        proof = custody / "helper-installation-proof.private.json"
        private_json(proof, {"schemaVersion": 1,
            "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
            "installerSha256": materializer.EF7_INSTALLER_SHA256,
            "sudoersSha256": materializer.SUDOERS_SHA256,
            "helper": {"path": str(helper), "sha256": sha(helper),
                "identity": {"device": helper_info.st_dev, "inode": helper_info.st_ino,
                    "uid": helper_info.st_uid, "gid": helper_info.st_gid, "mode": "0500"}}})
        current = custody / "current"; current.mkdir()
        for component in ("api", "frontend"):
            target = custody / component; target.mkdir(); (current / component).symlink_to(target)
        transactions = custody / "transactions"; transactions.mkdir(mode=0o700)
        deployment_lock = custody / "deploy.lock"; deployment_lock.write_bytes(b"")
        writer_lock = custody / "writer.lock"; writer_lock.write_bytes(b"")

        load_consumer = materializer.authenticated_consumer
        def load_configured_consumer():
            module = load_consumer()
            for key, value in fixture["patches"].items(): setattr(module, key, value)
            module.ROOT = control
            module.DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH = manifest
            module.DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256 = sha(manifest)
            module.PROC_OBSERVER_PATH = helper
            return module

        with mock.patch.multiple(materializer, CUSTODY=custody, ROOT=control,
                CONSUMER=consumer_path, CONSUMER_SHA256=sha(consumer_path), PM2=pm2,
                PM2_SHA256=sha(pm2), NODE=node, NODE_SHA256=sha(node), DUMP=dump,
                GRAPH=graph, POLICY=policy, EF7_MANIFEST=manifest,
                EF7_MINIMUM_RECOVERY_BYTES=1,
                EF7_CANDIDATES=tuple(fixture["candidates"]), HELPER=helper,
                HELPER_SHA256=sha(helper), EF7_HELPER_SHA256=sha(helper),
                HELPER_PROOF=proof, CURRENT=current,
                TRANSACTIONS=transactions, DEPLOYMENT_LOCK=deployment_lock,
                WRITER_LOCK=writer_lock, authenticated_consumer=load_configured_consumer):
            materialized = materializer.materialize(materializer.EF7_PROFILE)
        request_path = custody / "audit-request.private.json"
        request = json.loads(request_path.read_text())
        self.assertEqual(request["schemaVersion"], 3)
        self.assertTrue(request["incrementalBatch"])
        self.assertEqual([item["path"] for item in request["candidates"]],
                         [str(path) for path in fixture["candidates"]])
        self.assertEqual(materialized["requestSha256"], sha(request_path))
        readback = json.loads((custody / "binding-readback.private.json").read_text())
        self.assertEqual(readback["requestSha256"], sha(request_path))
        self.assertEqual(readback["manifestSha256"], sha(manifest))
        supervisor_args = SimpleNamespace(
            action="audit", request=request_path, request_sha256=sha(request_path),
            plan_output=custody / "plan.private.json",
            telemetry_output=custody / "executor-telemetry.private.jsonl",
            containment_output=custody / "containment.private.json",
            memory_max_bytes=512 * 1024 * 1024, timeout_seconds=1800)
        SUPERVISOR.validate_audit_limits(supervisor_args)
        supervisor_argv = SUPERVISOR.systemd_scope_argv(
            supervisor_args, "re7-capacity-audit-ef7-fixture.scope")
        self.assertIn(str(request_path), supervisor_argv)
        self.assertIn(sha(request_path), supervisor_argv)
        self.assertIn("--property=MemoryMax=536870912", supervisor_argv)
        self.assertIn("--property=MemorySwapMax=0", supervisor_argv)
        self.assertIn("--property=RuntimeMaxSec=1800s", supervisor_argv)
        consumer = configured_consumer()
        plan = custody / "plan.private.json"
        with mock.patch.object(consumer, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(consumer, "deploy_group_principals", return_value=["deploy"]), \
                mock.patch.object(consumer, "_privileged_proc_targets",
                                  return_value=(scan(), {"mechanism": "synthetic-privileged-boundary"})):
            value = consumer.audit_request(request_path, sha(request_path), plan)
        self.assertEqual(value["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS",
                         value["errors"])
        self.assertEqual(len(value["candidates"]), 4)
        self.assertEqual(value["errors"], [])

    def test_manifest_disposition_tree_link_set_target_type_and_escape_deny(self):
        for mutation, predicate in (
                ("extra", "DISPOSITION_TREE_LEAF_SET"),
                ("missing", "DISPOSITION_TREE_LEAF_SET"),
                ("target", "DISPOSITION_TREE_SYMLINK_DIVERGED"),
                ("authority-target", "DISPOSITION_TREE_AUTHORITY_DIVERGED"),
                ("type", "DISPOSITION_TREE_LEAF_SET"),
                ("unbound", "FILE_SHA256"),
                ("duplicate", "DISPOSITION_PACKAGE_SYMLINKS_SCHEMA"),
                ("escape", "DISPOSITION_ARCHIVE_SYMLINK")):
            tree, authority, entry, links = self.worker_tree_fixture("tree-link-" + mutation)
            relative, target = links[0]
            link = tree / relative
            if mutation == "extra":
                (tree / "node_modules/.bin/extra").symlink_to("../tools/tool-00.js")
            elif mutation == "missing":
                link.unlink()
            elif mutation == "target":
                link.unlink(); link.symlink_to("../tools/tool-01.js")
            elif mutation == "authority-target":
                authority_link = authority / relative
                authority_link.unlink(); authority_link.symlink_to("../tools/tool-01.js")
            elif mutation == "type":
                link.unlink(); link.write_bytes(b"not-a-link"); link.chmod(0o644)
            elif mutation == "unbound":
                relation = tree / "PACKAGE_SYMLINKS.txt"
                relation.write_bytes(relation.read_bytes() + b"invalid-without-binding\n")
            else:
                relation = tree / "PACKAGE_SYMLINKS.txt"
                authority_relation = authority / "PACKAGE_SYMLINKS.txt"
                raw = relation.read_bytes()
                if mutation == "duplicate":
                    raw += f"{relative}\t{target}\n".encode()
                else:
                    raw = raw.replace(f"{relative}\t{target}".encode(),
                                      f"{relative}\t../../../outside".encode())
                for path in (relation, authority_relation):
                    path.write_bytes(raw); path.chmod(0o600)
                package = tree / "PACKAGE_FILES.sha256"
                authority_package = authority / "PACKAGE_FILES.sha256"
                lines = package.read_text().splitlines()
                lines[0] = f"{sha(relation)}  PACKAGE_SYMLINKS.txt"
                package_raw = ("\n".join(lines) + "\n").encode()
                for path in (package, authority_package):
                    path.write_bytes(package_raw); path.chmod(0o600)
                entry["packageFilesSha256"] = sha(package)
            with self.subTest(mutation=mutation), \
                    self.assertRaisesRegex(MODULE.Denied, predicate):
                MODULE._authenticate_disposition_tree(tree, entry)

    def test_manifest_disposition_tree_symlink_identity_drift_denies(self):
        tree, _authority, entry, links = self.worker_tree_fixture("tree-link-drift")
        target_path = tree / links[0][0]
        real_readlink = os.readlink
        changed = False
        def drifting_readlink(path):
            nonlocal changed
            value = real_readlink(path)
            if Path(path) == target_path and not changed:
                changed = True
                target_path.unlink(); target_path.symlink_to(value)
            return value
        with mock.patch.object(MODULE.os, "readlink", side_effect=drifting_readlink), \
                self.assertRaisesRegex(MODULE.Denied,
                                       "DISPOSITION_TREE_SYMLINK_DIVERGED"):
            MODULE._authenticate_disposition_tree(tree, entry)

    def test_manifest_disposition_tree_regular_drift_and_whole_reader_deny(self):
        tree, _authority, entry, _links = self.worker_tree_fixture("tree-streaming")
        with mock.patch.object(MODULE, "stable_regular",
                               side_effect=AssertionError("whole reader forbidden")):
            observed = MODULE._authenticate_disposition_tree(tree, entry)
        self.assertGreater(observed["regularLeafCount"], 1)
        (tree / "payload/file-00000.bin").write_bytes(b"drift")
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            MODULE._authenticate_disposition_tree(tree, entry)

    def test_worker_package_cardinality_largest_leaf_and_links_fit_memory_limit(self):
        tree, authority, entry, links = self.worker_tree_fixture(
            "tree-worker-cardinality", payload_count=7031,
            largest_size=19_631_784, link_count=11)
        entry_path = self.base / "worker-tree-entry.json"
        entry_path.write_text(json.dumps(entry)); entry_path.chmod(0o600)
        program = """
import importlib.util,json,pathlib,resource,sys
spec=importlib.util.spec_from_file_location('capacity_recovery',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
entry=json.loads(pathlib.Path(sys.argv[3]).read_text())
result=module._authenticate_disposition_tree(pathlib.Path(sys.argv[2]),entry)
print(json.dumps({'leafCount':result['leafCount'],'regularLeafCount':result['regularLeafCount'],
 'symlinkCount':result['symlinkCount'],'relationSha256':result['relationSha256'],
 'rssPeakBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024},sort_keys=True))
"""
        maximum = 256 * 1024 * 1024
        def limit_memory():
            resource.setrlimit(resource.RLIMIT_AS, (maximum, maximum))
        result = subprocess.run(
            [sys.executable, "-B", "-c", program, str(TOOL), str(tree), str(entry_path)],
            capture_output=True, text=True, timeout=120, preexec_fn=limit_memory,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        observed = json.loads(result.stdout)
        self.assertEqual(observed["regularLeafCount"], 7045)
        self.assertEqual(observed["symlinkCount"], 11)
        self.assertEqual(observed["leafCount"], 7056)
        self.assertLess(observed["rssPeakBytes"], maximum)
        self.assertEqual((tree / "payload/largest.bin").stat().st_size, 19_631_784)
        self.assertEqual((authority / "payload/largest.bin").stat().st_size, 19_631_784)
        self.assertEqual(len(links), 11)
        self.assertTrue((authority / ".data").is_symlink())
        print("WORKER_TREE_MEMORY=" + json.dumps({
            "payloadFiles": 7044, "physicalRegularLeaves": 7045,
            "symlinks": 11, "largestLeafBytes": 19_631_784,
            "rssPeakBytes": observed["rssPeakBytes"], "rlimitAsBytes": maximum,
        }, sort_keys=True))

    def test_manifest_disposition_tree_cross_device_directory_and_leaf_are_denied(self):
        for kind in ("directory", "leaf"):
            fixture = self.manifest_disposition_fixture("cross-device-" + kind)
            tree = fixture["paths"][1]
            divergent = tree / ("dist" if kind == "directory" else "dist/worker.js")
            real_lstat = Path.lstat

            def cross_device_lstat(current, *, _target=divergent):
                info = real_lstat(current)
                if current == _target:
                    values = list(info)
                    values[2] = info.st_dev + 1
                    return os.stat_result(values)
                return info

            with self.subTest(kind=kind), fixture["patches"], \
                    mock.patch.object(Path, "lstat", new=cross_device_lstat), \
                    self.assertRaisesRegex(MODULE.Denied,
                                           "DISPOSITION_TREE_CROSS_DEVICE"):
                MODULE.authenticate_manifest_disposition(
                    fixture["candidates"][1], json.loads(self.operational.read_text()), scan())

    def _seal_manifest_disposition(self, fixture):
        private_json(self.request, self.request_value(fixture["candidates"]))
        plan = fixture["control"].parent / "plan.private.json"
        patch_values = dict(
            ROOT=fixture["control"], PREPARATIONS_ROOT=self.preparations,
            RELEASES_ROOT=self.releases,
            DISPOSITION_MANIFEST_PATH=fixture["manifest"],
            DISPOSITION_MANIFEST_SHA256=sha(fixture["manifest"]),
            DISPOSITION_ID="fixture-disposition-v1")
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch():
            MODULE.audit_request(self.request, sha(self.request), plan)
            MODULE.prepare_plan(plan, sha(plan), self.intent,
                                self.commands, self.seal_manifest)
        intent = json.loads(self.intent.read_text())
        authorization = self.base / "disposition-authorization.private.json"
        private_json(authorization, {
            "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUTHORIZATION",
            "authorization": "AUTHORIZE_ONCE", "intentSha256": sha(self.intent),
            "commandsSha256": intent["commandsSha256"],
            "paths": [item["path"] for item in intent["candidates"]],
        })
        return patch_values, authorization

    def test_manifest_disposition_nonempty_directory_denies_rmdir(self):
        fixture = self.manifest_disposition_fixture("nonempty-rmdir")
        patch_values, authorization = self._seal_manifest_disposition(fixture)
        receipt = self.base / "receipts/disposition-nonempty"; receipt.parent.mkdir(mode=0o700)
        tree = fixture["paths"][1]
        real_run = subprocess.run
        def runner(argv, **kwargs):
            if argv[0] == "/usr/bin/rmdir" and argv[-1] == str(tree):
                (tree / "late-entry").write_bytes(b"late")
            return real_run(argv, **kwargs)
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch(), \
                mock.patch.object(MODULE.subprocess, "run", side_effect=runner), \
                self.assertRaises(SystemExit):
            MODULE.execute_intent(self.intent, sha(self.intent), authorization,
                                  sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertIn("COMMAND_FAILED", result["failurePredicate"])
        self.assertTrue(tree.exists())

    def test_manifest_disposition_exact_three_complete_lifecycle_passes(self):
        fixture = self.manifest_disposition_fixture("complete")
        patch_values, authorization = self._seal_manifest_disposition(fixture)
        receipt = self.base / "receipts/disposition-complete"; receipt.parent.mkdir(mode=0o700)
        sealed_intent_sha = sha(self.intent)
        sealed_authorization_sha = sha(authorization)
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch():
            result = MODULE.execute_intent(self.intent, sealed_intent_sha, authorization,
                                           sealed_authorization_sha, receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertEqual(sha(self.intent), sealed_intent_sha)
        self.assertEqual(sha(authorization), sealed_authorization_sha)
        self.assertTrue(all(not path.exists() for path in fixture["paths"]))
        self.assertTrue(all(Path(entry["authority"]).exists() for entry in fixture["entries"]))
        events = [json.loads(line) for line in
                  (receipt / "command-journal.private.jsonl").read_text().splitlines()]
        self.assertEqual(sum(item["event"] == "VERIFIED" for item in events),
                         result["completedCommands"])
        evidence = SUPERVISOR.execution_effect_evidence(
            receipt, self.intent, sealed_intent_sha, sealed_authorization_sha)
        self.assertEqual(evidence["state"], "COMPLETED_RECONCILED")
        self.assertEqual((evidence["attemptedCommands"],
                          evidence["completedCommands"]),
                         (result["attemptedCommands"], result["completedCommands"]))

    def test_manifest_disposition_complete_lifecycle_preserves_sealed_binding_across_roots(self):
        fixture = self.manifest_disposition_fixture("relocated-lifecycle")

        def phase_module(name):
            root = self.preparations / name / "control"
            sources = {
                "apps/whatsapp-agent/.env.example":
                    fixture["control"] / "apps/whatsapp-agent/.env.example",
                "docs/evidence.md": fixture["control"] / "docs/evidence.md",
                "config/capacity-recovery/closed-preparation-manifest-disposition.v1.json":
                    fixture["manifest"],
                "scripts/capacity-recovery.py": TOOL,
            }
            for relative, source in sources.items():
                destination = root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read_bytes())
                destination.chmod(stat.S_IMODE(source.stat().st_mode))
            spec = importlib.util.spec_from_file_location(
                "capacity_recovery_" + name.replace("-", "_"),
                root / "scripts/capacity-recovery.py")
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None
            spec.loader.exec_module(module)
            self.assertEqual(Path(module.__file__).resolve(),
                             (root / "scripts/capacity-recovery.py").resolve())
            self.assertEqual(module.ROOT, root.resolve())
            return root, module

        audit_root, audit_module = phase_module("phase-audit")
        prepare_root, prepare_module = phase_module("phase-prepare")
        execute_root, execute_module = phase_module("phase-execute")
        self.assertEqual(len({audit_root, prepare_root, execute_root}), 3)
        audit_manifest = audit_module.DISPOSITION_MANIFEST_PATH
        binding = {"path": str(audit_manifest), "sha256": sha(audit_manifest)}
        candidates = [{**candidate, "dispositionManifest": binding}
                      for candidate in fixture["candidates"]]
        private_json(self.request, self.request_value(candidates))
        plan = audit_root.parent / "plan.private.json"

        common = dict(PREPARATIONS_ROOT=self.preparations, RELEASES_ROOT=self.releases,
                      DISPOSITION_MANIFEST_SHA256=sha(audit_manifest),
                      DISPOSITION_ID="fixture-disposition-v1")
        with mock.patch.multiple(
                audit_module, **common), \
                mock.patch.object(audit_module, "_proc_targets", return_value=scan()):
            audit_module.audit_request(self.request, sha(self.request), plan)

        with mock.patch.multiple(
                prepare_module, **common), \
                mock.patch.object(prepare_module, "_proc_targets", return_value=scan()):
            with self.assertRaisesRegex(prepare_module.Denied,
                                        "DISPOSITION_MANIFEST_FIXED_BINDING"):
                prepare_module._disposition_manifest(binding)
            prepare_module.prepare_plan(plan, sha(plan), self.intent,
                                        self.commands, self.seal_manifest)

        intent = json.loads(self.intent.read_text())
        self.assertTrue(all(item["dispositionManifest"] == binding
                            for item in intent["candidates"]))
        authorization = self.base / "relocated-authorization.private.json"
        private_json(authorization, {
            "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUTHORIZATION",
            "authorization": "AUTHORIZE_ONCE", "intentSha256": sha(self.intent),
            "commandsSha256": intent["commandsSha256"],
            "paths": [item["path"] for item in intent["candidates"]],
        })
        receipt = self.base / "receipts/relocated-lifecycle"
        receipt.parent.mkdir(mode=0o700)
        with mock.patch.multiple(
                execute_module, **common), \
                mock.patch.object(execute_module, "_proc_targets", return_value=scan()):
            result = execute_module.execute_intent(
                self.intent, sha(self.intent), authorization, sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertTrue(all(not path.exists() for path in fixture["paths"]))
        self.assertTrue(all(Path(entry["authority"]).exists()
                            for entry in fixture["entries"]))

    def test_manifest_disposition_relocated_binding_remains_closed(self):
        fixture = self.manifest_disposition_fixture("relocated-binding-negative")
        audit_root = self.preparations / "phase-audit-negative" / "control"
        audit_manifest = audit_root / "config/disposition.json"
        audit_manifest.parent.mkdir(parents=True)
        audit_manifest.write_bytes(fixture["manifest"].read_bytes())
        audit_manifest.chmod(0o600)
        binding = {"path": str(audit_manifest), "sha256": sha(audit_manifest)}
        current_root = self.preparations / "phase-current-negative" / "control"
        current_manifest = current_root / "config/disposition.json"
        with mock.patch.multiple(
                MODULE, ROOT=current_root, PREPARATIONS_ROOT=self.preparations,
                DISPOSITION_MANIFEST_PATH=current_manifest,
                DISPOSITION_MANIFEST_SHA256=sha(audit_manifest)):
            with self.assertRaisesRegex(
                    MODULE.Denied, "DISPOSITION_MANIFEST_FIXED_BINDING"):
                MODULE._disposition_manifest(
                    {**binding, "path": str(current_manifest)},
                    sealed_binding=binding)
            for changed in (
                    {**binding, "sha256": "0" * 64},
                    {**binding, "path": str(audit_root / "config/other.json")},
                    {**binding, "path": str(self.base / "control/config/disposition.json")},
            ):
                with self.subTest(binding=changed), \
                        self.assertRaisesRegex(
                            MODULE.Denied, "DISPOSITION_MANIFEST_FIXED_BINDING"):
                    MODULE._disposition_manifest(changed, sealed_binding=changed)

    def test_manifest_disposition_partial_execution_never_repeats_completed_unlink(self):
        fixture = self.manifest_disposition_fixture("partial")
        patch_values, authorization = self._seal_manifest_disposition(fixture)
        receipt = self.base / "receipts/disposition-partial"; receipt.parent.mkdir(mode=0o700)
        first_path = Path(json.loads(self.intent.read_text())["commands"][0][-1])
        effects = []
        def runner(argv, **_kwargs):
            if argv[-1] == "jlist":
                return SimpleNamespace(returncode=0, stdout="[]\n", stderr="")
            effects.append(list(argv))
            if len(effects) == 1:
                os.unlink(argv[-1])
                return SimpleNamespace(returncode=0)
            return SimpleNamespace(returncode=9)
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch(), \
                mock.patch.object(MODULE.subprocess, "run", side_effect=runner), \
                self.assertRaises(SystemExit):
            MODULE.execute_intent(self.intent, sha(self.intent), authorization,
                                  sha(authorization), receipt)
        self.assertFalse(first_path.exists())
        self.assertEqual(sum(command[-1] == str(first_path) for command in effects), 1)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual((result["attemptedCommands"], result["completedCommands"]), (2, 1))

    def test_hybrid_b9_duplicate_paths_pass_with_exact_authority(self):
        authority, paths, candidates = self.b9_duplicate_candidates()
        for path, candidate in zip(paths, candidates):
            with self.subTest(path=path):
                observed = self.authenticate_archive(candidate)
                self.assertEqual(observed["proof"]["kind"], "DUPLICATE_COPY")
                self.assertEqual(observed["proof"]["authoritativeCopy"]["path"],
                                 str(authority))
                self.assertEqual(observed["identity"]["nlink"], 1)

    def test_hybrid_b9_versioned_record_is_denied(self):
        _authority, paths, _candidates = self.b9_duplicate_candidates()
        candidate = self.archive_candidate(paths[0])
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_PROOF_KIND"):
            self.authenticate_archive(candidate)

    def test_hybrid_b9_authority_must_be_distinct_present_exact_and_single_link(self):
        authority, _paths, candidates = self.b9_duplicate_candidates()
        same = json.loads(json.dumps(candidates[0]))
        same["proof"]["authoritativeCopy"] = {
            "path": same["path"], "sha256": same["sha256"],
        }
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_AUTHORITY_SCOPE"):
            self.authenticate_archive(same)

        authority.unlink()
        with self.assertRaisesRegex(MODULE.Denied, "FILE_READ"):
            self.authenticate_archive(candidates[0])

        authority.write_bytes(b"divergent"); authority.chmod(0o600)
        divergent = json.loads(json.dumps(candidates[0]))
        divergent["proof"]["authoritativeCopy"]["sha256"] = sha(authority)
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_AUTHORITY_DIVERGED"):
            self.authenticate_archive(divergent)

        authority.write_bytes(self.archive.read_bytes()); authority.chmod(0o600)
        authority_link = authority.with_name("worker-minimal-b9-v3.authority-link.tar.gz")
        os.link(authority, authority_link)
        linked = json.loads(json.dumps(candidates[0]))
        linked["proof"]["authoritativeCopy"]["sha256"] = sha(authority)
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_AUTHORITY_DIVERGED"):
            self.authenticate_archive(linked)

    def test_hybrid_b9_candidate_identity_scope_and_structure_are_closed(self):
        _authority, paths, candidates = self.b9_duplicate_candidates()
        wrong_sha = json.loads(json.dumps(candidates[0])); wrong_sha["sha256"] = "0" * 64
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            self.authenticate_archive(wrong_sha)

        symlink_window = self.preparations / "hybrid-b9-symlink" / "window"
        symlink_window.mkdir(parents=True, mode=0o700)
        symlink_window.parent.chmod(0o700); symlink_window.chmod(0o700)
        link = symlink_window / "worker-minimal-b9-v3.tar.gz"
        link.symlink_to(paths[0])
        symlink = json.loads(json.dumps(candidates[0])); symlink["path"] = str(link)
        with self.assertRaisesRegex(MODULE.Denied, "FILE_TYPE"):
            self.authenticate_archive(symlink)

        outside = self.base / "worker-minimal-b9-v3.tar.gz"
        outside.write_bytes(paths[0].read_bytes()); outside.chmod(0o600)
        escaped = json.loads(json.dumps(candidates[0])); escaped.update(
            path=str(outside), sha256=sha(outside))
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_SCOPE"):
            self.authenticate_archive(escaped)

        wrong_layout = self.preparation / "worker-minimal-b9-v3.tar.gz"
        wrong_layout.write_bytes(paths[0].read_bytes()); wrong_layout.chmod(0o600)
        misplaced = json.loads(json.dumps(candidates[0])); misplaced.update(
            path=str(wrong_layout), sha256=sha(wrong_layout))
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_SCOPE"):
            self.authenticate_archive(misplaced)

        with tarfile.open(paths[0], "w:gz") as archive:
            payload = b"protected"
            item = tarfile.TarInfo("runtime-data/session.json")
            item.size = len(payload); archive.addfile(item, io.BytesIO(payload))
        paths[0].chmod(0o600)
        protected = json.loads(json.dumps(candidates[0])); protected["sha256"] = sha(paths[0])
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_PROTECTED_MATERIAL"):
            self.authenticate_archive(protected)

    def test_original_return_archive_basenames_still_pass(self):
        for basename in ("api-frontend-return.private.tar.gz",
                         "worker-return.private.tar.gz"):
            selected = self.preparation / basename
            if selected != self.archive:
                selected.write_bytes(self.archive.read_bytes()); selected.chmod(0o600)
            self.write_archive_record(selected)
            with self.subTest(basename=basename):
                observed = self.authenticate_archive(self.archive_candidate(selected))
                self.assertEqual(observed["proof"]["kind"],
                                 "VERSIONED_PREPARATION_RECORD")

    def test_default_identity_schema_matches_privileged_observer_protocol(self):
        observer_spec = importlib.util.spec_from_file_location(
            "capacity_proc_observer_identity_parity", TOOL.with_name("capacity-proc-observer.py"))
        observer = importlib.util.module_from_spec(observer_spec)
        assert observer_spec.loader is not None
        observer_spec.loader.exec_module(observer)
        info = self.archive.lstat()
        self.assertEqual(MODULE.stat_identity(info), observer.identity(info))
        self.assertNotIn("nlink", MODULE.stat_identity(info))
        self.assertEqual(MODULE.stat_identity(info, include_nlink=True)["nlink"], 1)

    def test_closed_preparation_archive_symlink_is_denied(self):
        link = self.preparation / "worker-return.private.tar.gz"
        link.symlink_to(self.archive)
        candidate = self.archive_candidate(self.archive)
        candidate.update(path=str(link), sha256=sha(self.archive))
        candidate["proof"]["recordEntry"] = link.name
        with self.assertRaisesRegex(MODULE.Denied, "FILE_TYPE"):
            self.authenticate_archive(candidate)

    def test_closed_preparation_archive_hardlink_is_denied(self):
        link = self.preparation / "worker-return.private.tar.gz"
        os.link(self.archive, link)
        self.write_archive_record(link)
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_HARDLINK"):
            self.authenticate_archive(self.archive_candidate(link))

    def test_closed_preparation_archive_hash_or_inode_change_is_denied(self):
        candidate = self.archive_candidate()
        candidate["sha256"] = "0" * 64
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            self.authenticate_archive(candidate)
        candidate = self.archive_candidate()
        original = MODULE._archive_structure
        def replace_during_scan(path, identity):
            replacement = path.with_suffix(".replacement")
            replacement.write_bytes(path.read_bytes())
            replacement.chmod(0o600)
            replacement.replace(path)
            return original(path, identity)
        with mock.patch.object(MODULE, "_archive_structure", side_effect=replace_during_scan), \
                self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_CHANGED"):
            self.authenticate_archive(candidate)

    def test_closed_preparation_archive_escape_reference_and_authority_are_denied(self):
        outside = self.base / "api-frontend-return.private.tar.gz"
        outside.write_bytes(self.archive.read_bytes()); outside.chmod(0o600)
        candidate = self.archive_candidate(self.archive)
        candidate.update(path=str(outside), sha256=sha(outside))
        with self.assertRaisesRegex(MODULE.Denied, "PREPARATION_ARCHIVE_SCOPE"):
            self.authenticate_archive(candidate)
        operational = json.loads(self.operational.read_text())
        operational["openTransactionPaths"] = [str(self.archive)]
        with self.assertRaisesRegex(MODULE.Denied, "REFERENCED_OR_PROTECTED"):
            self.authenticate_archive(operational=operational)
        missing = self.docs / "AUTOMATION_RELEASE_PREPARATION_2026-09-29.md.missing"
        candidate = self.archive_candidate()
        candidate["proof"]["record"]["path"] = str(missing)
        with self.assertRaisesRegex(MODULE.Denied, "RECORD_SCOPE"):
            self.authenticate_archive(candidate)
        self.archive_record.unlink()
        candidate = {"class": "CLOSED_PREPARATION_DERIVED_ARCHIVE",
                     "path": str(self.archive), "sha256": sha(self.archive), "proof": {
                         "kind": "VERSIONED_PREPARATION_RECORD",
                         "record": {"path": str(self.archive_record), "sha256": "0" * 64},
                         "recordEntry": self.archive.name,
                     }}
        with self.assertRaisesRegex(MODULE.Denied, "FILE_READ"):
            self.authenticate_archive(candidate)

    def test_closed_preparation_archive_duplicate_authority_is_preserved_or_denied(self):
        authority_dir = self.preparations / "authoritative-20260929T220203Z"
        authority_dir.mkdir(mode=0o700)
        authority = authority_dir / self.archive.name
        authority.write_bytes(self.archive.read_bytes()); authority.chmod(0o600)
        candidate = {"class": "CLOSED_PREPARATION_DERIVED_ARCHIVE",
                     "path": str(self.archive), "sha256": sha(self.archive), "proof": {
                         "kind": "DUPLICATE_COPY",
                         "authoritativeCopy": {"path": str(authority), "sha256": sha(authority)},
                     }}
        observed = self.authenticate_archive(candidate)
        self.assertEqual(observed["proof"]["kind"], "DUPLICATE_COPY")
        authority.unlink()
        with self.assertRaisesRegex(MODULE.Denied, "FILE_READ"):
            self.authenticate_archive(candidate)

    def test_closed_preparation_archive_protected_names_and_material_are_denied(self):
        protected = self.preparation / "content.private.tar.gz"
        protected.write_bytes(self.archive.read_bytes()); protected.chmod(0o600)
        candidate = self.archive_candidate(self.archive)
        candidate.update(path=str(protected), sha256=sha(protected))
        with self.assertRaisesRegex(MODULE.Denied, "PROTECTED_NAME"):
            self.authenticate_archive(candidate)
        with tarfile.open(self.archive, "w:gz") as archive:
            payload = b"tenant data"
            item = tarfile.TarInfo("apps/whatsapp-agent/.data/tenants.json")
            item.size = len(payload); archive.addfile(item, io.BytesIO(payload))
        self.archive.chmod(0o600)
        self.write_archive_record(self.archive)
        with self.assertRaisesRegex(MODULE.Denied, "PROTECTED_MATERIAL"):
            self.authenticate_archive(self.archive_candidate())

    def test_incremental_batch_can_pass_below_final_target(self):
        value = self.request_value([self.archive_candidate()], minimum=1)
        value.update(schemaVersion=3, procObserver={"path": str(self.base / "observer"),
                     "sha256": "1" * 64}, incrementalBatch=True,
                     targetAvailableBytes=2**62)
        private_json(self.request, value)
        observation = {"mechanism": "privileged", "phase": "audit"}
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                mock.patch.object(MODULE, "_validate_proc_observer_binding"), \
                mock.patch.object(MODULE, "_privileged_proc_targets",
                                  return_value=(scan(), observation)):
            result = MODULE.audit_request(self.request, sha(self.request), self.plan)
        self.assertEqual(result["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
        self.assertTrue(result["minimumRecoverySatisfied"])
        self.assertFalse(result["targetAvailableSatisfied"])
        self.assertEqual(result["commands"], [["/usr/bin/unlink", "--", str(self.archive)]])

    def test_process_target_containment_excludes_generic_ancestors(self):
        self.assertFalse(MODULE.process_target_references_candidate(str(self.cache), "/"))
        self.assertFalse(MODULE.process_target_references_candidate(
            str(self.cache), str(self.cache_parent)))
        self.assertTrue(MODULE.process_target_references_candidate(
            str(self.cache), str(self.cache)))
        self.assertTrue(MODULE.process_target_references_candidate(
            str(self.cache), str(self.cache / "content-v2" / "sha512")))

    def test_cache_process_ancestor_targets_do_not_deny(self):
        candidate = self.npm_candidate()
        targets = [(10, 100, "root", "/"),
                   (11, 101, "cwd", str(self.cache_parent))]
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]):
            observed = MODULE.authenticate_npm(candidate, scan(targets=targets))
        self.assertEqual(observed["references"], [])

    def test_cache_operational_ancestor_does_not_deny(self):
        operational = json.loads(self.operational.read_text())
        operational["pm2LivePaths"] = [str(self.cache_parent)]
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]):
            observed = MODULE.authenticate_npm(
                self.npm_candidate(), scan(), operational)
        self.assertEqual(observed["references"], [])

    def test_cache_exact_operational_reference_is_denied(self):
        operational = json.loads(self.operational.read_text())
        operational["pm2LivePaths"] = [str(self.cache)]
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_OPERATIONALLY_REFERENCED"):
            MODULE.authenticate_npm(self.npm_candidate(), scan(), operational)

    def test_cache_root_group_writable_is_denied(self):
        self.cache.chmod(0o775)
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_MODE"):
            MODULE.authenticate_npm(self.npm_candidate(), scan())

    def test_cache_group_principals_cannot_be_supplied_by_request(self):
        candidate = self.npm_candidate()
        candidate["expectedDeployGroupPrincipals"] = ["deploy", "unexpected"]
        with self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_SCHEMA"):
            MODULE.authenticate_npm(candidate, scan())

    def test_operational_state_without_live_sources_is_denied(self):
        legacy = {"schemaVersion": 1, "currentPaths": [], "pm2LivePaths": [],
                  "pm2DumpPaths": [], "openTransactionPaths": [],
                  "protectedGraphPaths": [], "deploymentLock": str(self.deployment_lock),
                  "writerLock": str(self.writer_lock)}
        with self.assertRaisesRegex(MODULE.Denied, "OPERATIONAL_STATE_SCHEMA"):
            MODULE.validate_operational(json.dumps(legacy).encode())

    def test_eight_observed_legacy_directories_are_classified_closed(self):
        self.real_legacy_transaction_layouts()
        operational = MODULE.validate_operational(self.operational.read_bytes())
        fresh, evidence = MODULE.capture_live_operational(operational)
        self.assertEqual(len(evidence["transactions"]), 8)
        formats = [item["format"] for item in evidence["transactions"]]
        self.assertEqual(formats.count("FRONTEND_WINDOW_STATE"), 5)
        self.assertEqual(formats.count("LEGACY_ROLLBACK_SENTINELS"), 1)
        self.assertEqual(formats.count("LEGACY_PRE_CANONICAL_PROTECTED"), 1)
        self.assertEqual(formats.count("LEGACY_EMPTY_PREFLIGHT"), 1)
        self.assertEqual(fresh["openTransactionPaths"], [
            "/opt/re7online/releases/immutable-f5028de1-20261020T181603Z",
        ])

    def test_fixed_current_and_frontend_window_formats_coexist(self):
        fixed = self.transactions / "fixed-current"
        fixed.mkdir(mode=0o700)
        private_json(fixed / "transaction.v1.private.json", {
            "schemaVersion": 1, "state": "AWAITING_ACCEPTANCE",
            "candidate": "/opt/re7online/releases/immutable-fixed",
        })
        self.window_transaction("frontend-window", "AWAITING_ACCEPTANCE", 0)
        private_json(self.transactions / "frontend-window" / "binding.private.json", {
            "candidate": "/opt/re7online/releases/immutable-frontend",
        })
        operational = MODULE.validate_operational(self.operational.read_bytes())
        fresh, evidence = MODULE.capture_live_operational(operational)
        self.assertEqual(
            [item["format"] for item in evidence["transactions"]],
            ["FIXED_CURRENT_V1", "FRONTEND_WINDOW_STATE"],
        )
        self.assertEqual(fresh["openTransactionPaths"], [
            "/opt/re7online/releases/immutable-fixed",
            "/opt/re7online/releases/immutable-frontend",
        ])

    def test_unknown_transaction_layout_is_denied(self):
        unknown = self.transactions / "unknown-layout"
        unknown.mkdir(mode=0o700)
        (unknown / "unrecognized.private.txt").write_text("state\n")
        (unknown / "unrecognized.private.txt").chmod(0o600)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_TRANSACTION_LAYOUT_UNKNOWN"):
            MODULE.capture_live_operational(operational)

    def test_unknown_fixed_current_state_is_denied(self):
        transaction = self.transactions / "fixed-current"
        transaction.mkdir(mode=0o700)
        private_json(transaction / "transaction.v1.private.json", {
            "schemaVersion": 1, "state": "UNKNOWN",
        })
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_TRANSACTION_JOURNAL"):
            MODULE.capture_live_operational(operational)

    def test_unknown_window_state_or_wrong_save_count_is_denied(self):
        transaction = self.window_transaction("frontend-window", "UNKNOWN", 0)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_WINDOW_STATE_CONTRACT"):
            MODULE.capture_live_operational(operational)

    def test_frontend_window_schema_is_closed(self):
        transaction = self.window_transaction("frontend-window", "DEPLOYED_SANITIZED", 1)
        value = self.window_value("DEPLOYED_SANITIZED", 1)
        value["invented"] = True
        private_json(transaction / "window-state.private.json", value)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_WINDOW_STATE_CONTRACT"):
            MODULE.capture_live_operational(operational)
        private_json(transaction / "window-state.private.json",
                     self.window_value("AWAITING_ACCEPTANCE", 1))
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_WINDOW_STATE_CONTRACT"):
            MODULE.capture_live_operational(operational)

    def test_legacy_rollback_sentinel_drift_is_denied(self):
        rollback = self.transactions / "immutable-legacy-frontend-once"
        rollback.mkdir(mode=0o700)
        for name, raw in MODULE.LEGACY_ROLLBACK_SENTINELS.items():
            path = rollback / name
            path.write_bytes(raw)
            path.chmod(0o600)
        (rollback / "rollback-result.private.txt").write_text("FAILED\n")
        (rollback / "rollback-result.private.txt").chmod(0o600)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_LEGACY_ROLLBACK_CONTRACT"):
            MODULE.capture_live_operational(operational)

    def test_empty_unknown_directory_is_not_silently_accepted(self):
        (self.transactions / "empty-but-unknown").mkdir(mode=0o700)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_TRANSACTION_LAYOUT_UNKNOWN"):
            MODULE.capture_live_operational(operational)

    def test_both_canonical_state_files_are_ambiguous(self):
        transaction = self.window_transaction("ambiguous", "DEPLOYED", 1)
        private_json(transaction / "transaction.v1.private.json", {
            "schemaVersion": 1, "state": "DEPLOYED_SANITIZED",
        })
        operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_TRANSACTION_LAYOUT_AMBIGUOUS"):
            MODULE.capture_live_operational(operational)

    def test_cache_symlink_and_owner_divergence_are_denied(self):
        link = self.cache_parent / "linked-cache"
        link.symlink_to(self.cache)
        linked = {"class": "NPM_CACHE_MAINTENANCE", "path": str(link)}
        with mock.patch.object(MODULE, "NPM_CACHE", link), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_IDENTITY"):
            MODULE.authenticate_npm(linked, scan())
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid() + 1, os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_PARENT_IDENTITY"):
            MODULE.authenticate_npm(self.npm_candidate(), scan())

    def test_cache_other_path_symlink_owner_writer_and_group_are_denied(self):
        other = self.base / "other-cache"; other.mkdir()
        link = self.cache_parent / "linked"; link.symlink_to(self.cache)
        cases = [
            (self.npm_candidate(other), scan(), ["deploy"], "NPM_CACHE_PATH"),
            (self.npm_candidate(link), scan(), ["deploy"], "NPM_CACHE_PATH"),
            (self.npm_candidate(), scan(writers=[{"pid": 2}]), ["deploy"], "NPM_OR_BUILD_ACTIVE"),
            (self.npm_candidate(), scan(), ["deploy", "unexpected"], "NPM_CACHE_GROUP_PRINCIPAL_UNEXPECTED"),
        ]
        for candidate, process, principals, predicate in cases:
            with self.subTest(predicate=predicate), \
                    mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                    mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                    mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                    mock.patch.object(MODULE, "deploy_group_principals", return_value=principals):
                with self.assertRaisesRegex(MODULE.Denied, predicate):
                    MODULE.authenticate_npm(candidate, process)

    def test_cache_identity_change_between_prepare_and_execute_is_denied(self):
        self.audit([self.npm_candidate()]); self.prepare()
        old = self.cache_parent / "old-cache"
        self.cache.rename(old); self.cache.mkdir(mode=0o755); (self.cache / "cache.bin").write_bytes(b"cache")
        plan = json.loads(self.plan.read_text())
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            _, errors, _ = MODULE.revalidate_plan(plan)
        self.assertTrue(any("CANDIDATE_CHANGED" in item for item in errors))

    def test_node_npm_cli_owned_by_deploy_is_active(self):
        proc_root = self.base / "proc"
        self.fake_process(proc_root, 42, os.geteuid(),
                          ["/usr/bin/node", "/usr/lib/node_modules/npm/bin/npm-cli.js", "ci"])
        targets, writers, complete, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertTrue(writers)
        self.assertTrue(complete)
        self.assertTrue(targets)
        self.assertEqual(summary["identityFailures"], 0)

    def test_transient_fd_close_is_recorded_without_incomplete_scan(self):
        proc_root = self.base / "proc-transient-fd"
        process = self.fake_process(
            proc_root, 49, os.geteuid(), ["/usr/bin/node", "service.js"])
        fd_entry = process / "fd" / "9"
        fd_entry.symlink_to(self.cache)
        real_readlink = os.readlink

        def closing_fd(path):
            if Path(path) == fd_entry:
                fd_entry.unlink()
                raise FileNotFoundError(str(path))
            return real_readlink(path)

        with mock.patch.object(MODULE.os, "readlink", side_effect=closing_fd):
            _, _, complete, summary = MODULE._proc_targets(
                proc_root, deploy_uid=os.geteuid())
        self.assertTrue(complete)
        self.assertEqual(summary["transientFdClosures"], 1)
        self.assertEqual(summary["referenceReadFailures"], 0)
        self.assertEqual(summary["transientFdClosureDetails"], [{
            "pid": 49, "startTicks": 100,
            "uids": {"real": os.geteuid(), "effective": os.geteuid(),
                     "saved": os.geteuid(), "fs": os.geteuid()},
            "operation": "readlink:fd/9", "errno": 2, "errnoName": "ENOENT",
        }])

    def test_deploy_process_inaccessible_is_denied(self):
        proc_root = self.base / "proc-deploy-deny"
        self.fake_process(proc_root, 43, os.geteuid(), [], inaccessible_cmdline=True)
        _, _, complete, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertFalse(complete)
        self.assertEqual(summary["identityFailures"], 1)

    def test_unrelated_root_process_inaccessible_does_not_block(self):
        proc_root = self.base / "proc-root-allowed"
        other_uid = 0 if os.geteuid() != 0 else 1
        self.fake_process(proc_root, 44, other_uid, [], inaccessible_cmdline=True)
        _, writers, complete, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertTrue(complete)
        self.assertEqual(writers, [])
        self.assertEqual(summary["permissionLimitedOtherProcesses"], 1)

    def test_other_uid_readable_cache_reference_still_denies(self):
        proc_root = self.base / "proc-other-reference"
        other_uid = 0 if os.geteuid() != 0 else 1
        self.fake_process(proc_root, 48, other_uid, ["/usr/bin/cat", str(self.cache / "entry")])
        process_scan = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "NPM_CACHE_REFERENCED"):
            MODULE.authenticate_npm(self.npm_candidate(), process_scan)

    def test_kernel_thread_is_ignored_nominally(self):
        proc_root = self.base / "proc-kernel"
        self.fake_process(proc_root, 45, 0, [], flags=MODULE.PF_KTHREAD)
        _, _, complete, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertTrue(complete)
        self.assertEqual(summary["kernelThreadsIgnored"], 1)

    def test_empty_cmdline_deploy_process_references_are_inspected(self):
        proc_root = self.base / "proc-empty-user"
        process = self.fake_process(proc_root, 451, os.geteuid(), [])
        (process / "fd" / "9").symlink_to(self.cache / "entry")
        (process / "maps").write_text(
            f"0000-1000 r--p 0 00:00 0 {self.cache / 'mapped'}\n")
        targets, _, complete, summary = MODULE._proc_targets(
            proc_root, deploy_uid=os.geteuid())
        self.assertTrue(complete)
        self.assertEqual(summary["emptyCmdlineProcessesInspected"], 1)
        self.assertTrue(any(target[2] == "fd/9" for target in targets))
        self.assertTrue(any(target[2] == "maps" for target in targets))

    def test_recycled_pid_is_denied(self):
        proc_root = self.base / "proc-recycled"
        self.fake_process(proc_root, 46, os.geteuid(), ["/usr/bin/node", "service.js"])
        with mock.patch.object(MODULE, "_read_proc_identity", side_effect=[(0, 100), (0, 101)]):
            targets, writers, complete, summary = MODULE._proc_targets(
                proc_root, deploy_uid=os.geteuid())
        self.assertFalse(complete)
        self.assertEqual(targets, [])
        self.assertEqual(writers, [])
        self.assertEqual(summary["identityFailures"], 1)

    def test_deploy_fd_or_maps_incomplete_is_denied(self):
        proc_root = self.base / "proc-incomplete"
        self.fake_process(proc_root, 47, os.geteuid(), ["/usr/bin/node", "service.js"],
                          include_maps=False)
        _, _, complete, _ = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertFalse(complete)
        _, _, _, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertGreater(summary["referenceReadFailures"], 0)
        self.assertEqual(summary["referenceReadFailureDetails"], [{
            "pid": 47, "startTicks": 100,
            "uids": {"real": os.geteuid(), "effective": os.geteuid(),
                     "saved": os.geteuid(), "fs": os.geteuid()},
            "operation": "read:maps", "errno": 2, "errnoName": "ENOENT",
        }])

    def test_deploy_fd_permission_denied_is_fail_closed_and_recorded(self):
        proc_root = self.base / "proc-permission-denied"
        process = self.fake_process(
            proc_root, 50, os.geteuid(), ["/usr/bin/sshd", "session"])
        fd_entry = process / "fd" / "9"
        fd_entry.symlink_to(self.cache)
        real_readlink = os.readlink

        def denied_fd(path):
            if Path(path) == fd_entry:
                raise PermissionError(13, "Permission denied", str(path))
            return real_readlink(path)

        with mock.patch.object(MODULE.os, "readlink", side_effect=denied_fd):
            _, _, complete, summary = MODULE._proc_targets(
                proc_root, deploy_uid=os.geteuid())
        self.assertFalse(complete)
        self.assertEqual(summary["referenceReadFailures"], 1)
        self.assertEqual(summary["referenceReadFailureDetails"], [{
            "pid": 50, "startTicks": 100,
            "uids": {"real": os.geteuid(), "effective": os.geteuid(),
                     "saved": os.geteuid(), "fs": os.geteuid()},
            "operation": "readlink:fd/9", "errno": 13, "errnoName": "EACCES",
        }])

    def test_audit_denial_preserves_sanitized_process_failure_details(self):
        detail = {
            "pid": 777, "startTicks": 12345,
            "uids": {"real": os.geteuid(), "effective": os.geteuid(),
                     "saved": os.geteuid(), "fs": os.geteuid()},
            "operation": "read:maps", "errno": 13, "errnoName": "EACCES",
        }
        private_json(self.request, self.request_value([self.npm_candidate()]))
        process = scan(complete=False, referenceReadFailures=1,
                       referenceReadFailureDetails=[detail])
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                mock.patch.object(MODULE, "_proc_targets", return_value=process):
            plan = MODULE.audit_request(self.request, sha(self.request), self.plan)
        candidate_error = next(item for item in plan["errors"] if item["ordinal"] == 1)
        self.assertEqual(candidate_error["predicate"], "PROCESS_REFERENCE_SCAN_INCOMPLETE")
        self.assertEqual(candidate_error["processScan"]["referenceReadFailureDetails"], [detail])
        self.assertNotIn("cmdline", json.dumps(candidate_error))

    def test_schema_two_consumer_invokes_authenticated_observer_for_audit_and_prepare(self):
        value = self.request_value([self.npm_candidate()])
        value["schemaVersion"] = 2
        value["procObserver"] = {"path": str(MODULE.PROC_OBSERVER_PATH), "sha256": "a" * 64}
        private_json(self.request, value)
        phases = []
        def privileged(_binding, paths, phase):
            phases.append((phase, paths))
            return scan(), {"phase": phase, "responseSha256": phase[0] * 64}
        patches = (
            mock.patch.object(MODULE, "NPM_CACHE", self.cache),
            mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent),
            mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())),
            mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]),
            mock.patch.object(MODULE, "_privileged_proc_targets", side_effect=privileged),
        )
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            plan = MODULE.audit_request(self.request, sha(self.request), self.plan)
            self.assertEqual(plan["schemaVersion"], 2)
            MODULE.prepare_plan(self.plan, sha(self.plan), self.intent,
                                self.commands, self.seal_manifest)
        intent = json.loads(self.intent.read_text())
        self.assertEqual(intent["procObserver"], value["procObserver"])
        self.assertEqual([item[0] for item in phases], ["audit", "prepare"])

    def test_execute_recaptures_new_open_transaction_reference_after_locks(self):
        intent_sha, authorization = self.seal_and_authorize()
        transaction = self.transactions / "new-window"
        transaction.mkdir(mode=0o700)
        private_json(transaction / "transaction.v1.private.json", {
            "schemaVersion": 1, "state": "AWAITING_ACCEPTANCE",
            "runtimePath": str(self.runtime),
        })
        receipt = self.base / "receipts" / "live-recapture"; receipt.parent.mkdir(mode=0o700)
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            with self.assertRaises(SystemExit):
                MODULE.execute_intent(self.intent, intent_sha, authorization, sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual(result["attemptedCommands"], 0)
        self.assertIn("DERIVED_OUTPUT_REFERENCED_OR_PROTECTED", result["failurePredicate"])
        self.assertTrue(self.cache.exists())
        self.assertTrue(self.runtime.exists())

    def test_live_current_pm2_dump_and_graph_are_reopened(self):
        current = self.base / "current-api"
        current.symlink_to(self.release)
        value = json.loads(self.operational.read_text())
        value["liveObservations"]["currentLinks"] = [
            {"path": str(current), "target": str(self.release)}]
        private_json(self.operational, value)
        operational = MODULE.validate_operational(self.operational.read_bytes())
        MODULE.capture_live_operational(operational)

        other = self.base / "other-release"; other.mkdir()
        current.unlink(); current.symlink_to(other)
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_CURRENT_LINK"):
            MODULE.capture_live_operational(operational)
        current.unlink(); current.symlink_to(self.release)

        original_pm2 = self.pm2.read_bytes()
        self.pm2.chmod(0o700)
        self.pm2.write_bytes(original_pm2 + b"# drift\n"); self.pm2.chmod(0o500)
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            MODULE.capture_live_operational(operational)
        self.pm2.chmod(0o700); self.pm2.write_bytes(original_pm2); self.pm2.chmod(0o500)

        self.dump.write_text('[{"pm_cwd":"/new/reference"}]\n'); self.dump.chmod(0o600)
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            MODULE.capture_live_operational(operational)
        private_json(self.dump, [])

        private_json(self.release_graph, {
            "schemaVersion": 1, "protectedGraphPaths": ["/new/reference"]})
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            MODULE.capture_live_operational(operational)

    def test_versioned_release_projection_authenticates_rich_graph_provenance(self):
        release_id = self.release.name
        rich_keys = {"activeReleases": [release_id], "rollbackReleases": [release_id],
                     "transitiveReturnReleases": [], "candidateReleases": [],
                     "installedVerifiedReleases": [release_id],
                     "supersededCandidates": [],
                     "immediateRollbackReleases": {
                         "api": release_id, "frontend": release_id}}
        source = self.base / "source-rich-graph.private.json"
        successor = self.base / "successor-rich-graph.private.json"
        private_json(source, rich_keys); private_json(successor, rich_keys)
        reconciliation_operational = self.base / "reconciliation-operational.private.json"
        private_json(reconciliation_operational, {"currentPaths": [], "pm2LivePaths": [],
            "pm2DumpPaths": [], "dependencies": []})
        runtime_manifest = self.base / "activation-runtime-manifest.private.json"
        private_json(runtime_manifest, {"rollbackReleases": {
            "api": {"releaseId": release_id},
            "frontend": {"releaseId": release_id}}})
        transaction = self.base / "activation-transaction.private.json"
        private_json(transaction, {"components": ["api", "frontend"],
            "binding": {"release": release_id, "components": ["api", "frontend"],
                        "runtimeManifestSha256": sha(runtime_manifest)},
            "preflight": {"selections": {
                "api": {"releaseId": release_id},
                "frontend": {"releaseId": release_id}}},
            "previous": {"releases": {"api": release_id, "frontend": release_id}}})
        receipt = self.base / "reconciliation-receipt.private.json"
        private_json(receipt, {"schemaVersion": 2, "state": "RECONCILED_NO_EFFECT",
            "reconciliationId": "fixture", "requestSha256": "a" * 64,
            "releaseRoot": str(self.release.parent),
            "sourceGraph": {"path": str(source), "sha256": sha(source)},
            "operationalState": {"path": str(reconciliation_operational),
                                 "sha256": sha(reconciliation_operational)},
            "successorGraph": {"path": str(successor), "sha256": sha(successor)},
            "privateDataParents": [], "activationEvidence": {
                component: {
                    "runtimeManifest": {"path": str(runtime_manifest),
                                        "sha256": sha(runtime_manifest)},
                    "transactionJournal": {"path": str(transaction),
                                           "sha256": sha(transaction)},
                    "selectedRelease": release_id,
                    "immediateRollback": release_id}
                for component in ("api", "frontend")}, "results": [],
            "originalsModified": False, "destructiveCommands": 0,
            "freshRecaptureRequiredBeforeRetirement": True})
        private_json(self.release_graph, {"schemaVersion": 2,
            "sourceGraph": {"path": str(source), "sha256": sha(source)},
            "successorGraph": {"path": str(successor), "sha256": sha(successor)},
            "reconciliationReceipt": {"path": str(receipt), "sha256": sha(receipt)},
            "protectedGraphPaths": [str(self.release)],
            "inventoryPaths": [str(self.release)]})
        self.write_operational()
        operational = MODULE.validate_operational(self.operational.read_bytes())
        captured, evidence = MODULE.capture_live_operational(operational)
        self.assertIn(str(self.release), captured["protectedGraphPaths"])
        self.assertEqual(evidence["releaseGraphSha256"], sha(self.release_graph))

        omitted = json.loads(self.release_graph.read_text())
        omitted["protectedGraphPaths"] = []
        private_json(self.release_graph, omitted)
        self.write_operational()
        omitted_operational = MODULE.validate_operational(self.operational.read_bytes())
        with self.assertRaisesRegex(MODULE.Denied, "LIVE_RELEASE_GRAPH_PROJECTION_DIVERGENCE"):
            MODULE.capture_live_operational(omitted_operational)
        omitted["protectedGraphPaths"] = [str(self.release)]
        private_json(self.release_graph, omitted)
        self.write_operational()
        operational = MODULE.validate_operational(self.operational.read_bytes())

        successor_value = json.loads(successor.read_text())
        successor_value["activeReleases"] = []
        private_json(successor, successor_value)
        with self.assertRaisesRegex(MODULE.Denied, "FILE_SHA256"):
            MODULE.capture_live_operational(operational)

    def test_runtime_outside_build_output_is_denied(self):
        outside = self.base / "outside"; outside.mkdir()
        with self.process_patch(), self.assertRaisesRegex(MODULE.Denied, "DERIVED_OUTPUT_OUTSIDE_ROOT"):
            MODULE.authenticate_output(self.output_candidate(outside), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_runtime_process_root_ancestor_does_not_deny(self):
        observed = MODULE.authenticate_output(
            self.output_candidate(), json.loads(self.policy.read_text()),
            json.loads(self.operational.read_text()),
            scan(targets=[(12, 102, "root", "/")]))
        self.assertEqual(observed["path"], str(self.runtime))

    def test_runtime_process_descendant_reference_is_denied(self):
        with self.assertRaisesRegex(MODULE.Denied, "DERIVED_OUTPUT_PROCESS_REFERENCE"):
            MODULE.authenticate_output(
                self.output_candidate(), json.loads(self.policy.read_text()),
                json.loads(self.operational.read_text()),
                scan(targets=[(13, 103, "fd/9", str(self.runtime / "app.js"))]))

    def test_runtime_reference_or_protected_graph_is_denied(self):
        self.write_operational(protectedGraphPaths=[str(self.runtime)])
        with self.assertRaisesRegex(MODULE.Denied, "DERIVED_OUTPUT_REFERENCED_OR_PROTECTED"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_incomplete_equivalence_is_denied(self):
        (self.release / "api-runtime" / "app.js").write_bytes(b"drift")
        with self.assertRaisesRegex(MODULE.Denied, "DERIVED_OUTPUT_EQUIVALENCE_INCOMPLETE"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def _add_runtime_symlink(self, target="app.js"):
        output_link = self.runtime / "app-link"
        release_link = self.release / "api-runtime" / "app-link"
        output_link.symlink_to(target)
        release_link.symlink_to(target)
        value = json.loads(self.index.read_text())
        value["entries"].append({"path": "api-runtime/app-link", "type": "symlink",
                                 "mode": "0777", "target": target})
        private_json(self.index, value)
        contract = json.loads(self.contract.read_text())
        index_artifact = next(item for item in contract["artifacts"]
                              if item["path"] == str(self.index))
        index_artifact["digest"] = {"sha256": sha(self.index)}
        private_json(self.contract, contract)
        return output_link, release_link

    def test_index_comparison_matches_producer_symlink_contract(self):
        self._add_runtime_symlink()
        observed = MODULE.authenticate_output(
            self.output_candidate(), json.loads(self.policy.read_text()),
            json.loads(self.operational.read_text()), scan())
        self.assertEqual(observed["equivalence"]["indexEntryCount"], 3)

    def test_index_comparison_accepts_current_producer_inventory_for_both_runtimes(self):
        output_root = self.base / "producer-parity-output"
        release_root = self.base / "producer-parity-release"
        for root in (output_root, release_root):
            for runtime in PRODUCER.RUNTIMES:
                runtime_root = root / runtime
                runtime_root.mkdir(parents=True)
                (runtime_root / "entry.js").write_bytes(b"producer parity")
                (runtime_root / "entry.js").chmod(0o644)
                (runtime_root / "entry-link").symlink_to("entry.js")
        entries, overlay = PRODUCER.scan_runtime(output_root)
        self.assertIsNone(overlay)
        index = {"schemaVersion": 1, "scope": list(PRODUCER.RUNTIMES),
                 "entries": entries}
        for relative in PRODUCER.RUNTIMES:
            observed = MODULE.compare_index(
                output_root / relative, release_root, relative, index, set())
            expected = len([entry for entry in index["entries"]
                            if entry["path"] == relative or
                            entry["path"].startswith(relative + "/")])
            self.assertEqual(observed["indexEntryCount"], expected)

    def test_index_comparison_denies_symlink_target_drift(self):
        _, release_link = self._add_runtime_symlink()
        (release_link.parent / "other.js").write_bytes(b"other")
        release_link.unlink()
        release_link.symlink_to("other.js")
        with self.assertRaisesRegex(MODULE.Denied, "release:symlink_target:api-runtime/app-link"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_index_comparison_denies_broken_symlink(self):
        _, release_link = self._add_runtime_symlink()
        release_link.unlink()
        release_link.symlink_to("missing.js")
        with self.assertRaisesRegex(MODULE.Denied, "release:symlink_broken:api-runtime/app-link"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_index_comparison_denies_symlink_escape(self):
        outside = self.base / "outside.js"
        outside.write_bytes(b"outside")
        output_link, release_link = self._add_runtime_symlink(str(outside))
        value = json.loads(self.index.read_text())
        value["entries"][-1]["target"] = str(outside)
        private_json(self.index, value)
        contract = json.loads(self.contract.read_text())
        next(item for item in contract["artifacts"]
             if item["path"] == str(self.index))["digest"] = {"sha256": sha(self.index)}
        private_json(self.contract, contract)
        self.assertTrue(output_link.is_symlink() and release_link.is_symlink())
        with self.assertRaisesRegex(MODULE.Denied, "output:symlink_escape:api-runtime/app-link"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_index_comparison_denies_symlink_mode_contract_drift(self):
        self._add_runtime_symlink()
        value = json.loads(self.index.read_text())
        value["entries"][-1]["mode"] = "0755"
        private_json(self.index, value)
        contract = json.loads(self.contract.read_text())
        next(item for item in contract["artifacts"]
             if item["path"] == str(self.index))["digest"] = {"sha256": sha(self.index)}
        private_json(self.contract, contract)
        with self.assertRaisesRegex(MODULE.Denied, "output:identity:api-runtime/app-link"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())

    def test_index_comparison_denies_unindexed_entry_and_allows_declared_release_extra(self):
        unexpected = self.runtime / "unexpected"
        unexpected.write_bytes(b"unexpected")
        with self.assertRaisesRegex(MODULE.Denied, "output:entry_set"):
            MODULE.authenticate_output(self.output_candidate(), json.loads(self.policy.read_text()),
                                       json.loads(self.operational.read_text()), scan())
        unexpected.unlink()
        private_data = self.release / "api-runtime" / ".data"
        private_data.mkdir()
        (private_data / "mutable").write_bytes(b"allowed")
        observed = MODULE.authenticate_output(
            self.output_candidate(), json.loads(self.policy.read_text()),
            json.loads(self.operational.read_text()), scan())
        self.assertEqual(observed["equivalence"]["allowedReleaseExtras"], [".data"])

    def changing_process_patch(self, **_kwargs):
        return mock.patch.object(MODULE, "_proc_targets", side_effect=lambda: scan(
            processesObserved=next(self.process_counts)))

    def run_lifecycle_with_changing_telemetry(self, schema2=False):
        self.process_counts = iter((8, 9, 10))
        self.process_patch = self.changing_process_patch
        if schema2:
            original_request = self.request_value
            self.request_value = lambda *args, **kwargs: {
                **original_request(*args, **kwargs), "schemaVersion": 2,
                "procObserver": {"path": str(MODULE.PROC_OBSERVER_PATH), "sha256": "a" * 64}}

        def privileged(_binding, _paths, phase):
            count = next(self.process_counts)
            return scan(processesObserved=count), {"phase": phase, "processesObserved": count}

        with mock.patch.object(MODULE, "_privileged_proc_targets", side_effect=privileged):
            intent_sha, authorization = self.seal_and_authorize()
            intent = json.loads(self.intent.read_text())
            self.assertEqual(intent["candidates"][0]["processScan"]["processesObserved"], 9)
            receipt = self.base / "receipts" / "changing-telemetry"
            receipt.parent.mkdir(mode=0o700)
            with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                    mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                    mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                    mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                    self.process_patch():
                result = MODULE.execute_intent(
                    self.intent, intent_sha, authorization, sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertEqual(result["completedCommands"], 2)
        self.assertFalse(self.cache.exists())
        self.assertFalse(self.runtime.exists())
        self.assertTrue(self.release.exists())
        self.assertTrue(self.package.exists())
        recapture = json.loads((receipt / "pre-attempt-recapture.private.json").read_text())
        self.assertEqual(recapture["candidates"][0]["processScan"]["processesObserved"], 10)

    def test_legacy_lifecycle_accepts_fresh_safe_telemetry_at_every_phase(self):
        self.run_lifecycle_with_changing_telemetry()

    def test_schema2_lifecycle_accepts_fresh_safe_telemetry_at_every_phase(self):
        self.run_lifecycle_with_changing_telemetry(schema2=True)

    def assert_schema2_execute_rejects_fresh_unsafe_state(self, *, unsafe_scan=None,
                                                        mutation=None, predicate):
        original_request = self.request_value
        self.request_value = lambda *args, **kwargs: {
            **original_request(*args, **kwargs), "schemaVersion": 2,
            "procObserver": {"path": str(MODULE.PROC_OBSERVER_PATH), "sha256": "a" * 64}}

        def privileged(_binding, _paths, phase):
            process = unsafe_scan if phase == "execute" and unsafe_scan is not None else scan(
                processesObserved={"audit": 8, "prepare": 9, "execute": 10}[phase])
            return process, {"phase": phase, "summary": process[3]}

        with mock.patch.object(MODULE, "_privileged_proc_targets", side_effect=privileged):
            intent_sha, authorization = self.seal_and_authorize()
            if mutation is not None:
                mutation()
            receipt = self.base / "receipts" / "unsafe-recapture"
            receipt.parent.mkdir(mode=0o700)
            with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                    mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                    mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                    mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                    self.assertRaises(SystemExit):
                MODULE.execute_intent(self.intent, intent_sha, authorization, sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual(result["attemptedCommands"], 0)
        self.assertIn(predicate, result["failurePredicate"])
        self.assertTrue(self.cache.exists())
        self.assertTrue(self.runtime.exists())
        recapture = json.loads((receipt / "pre-attempt-recapture.private.json").read_text())
        self.assertEqual(recapture["event"], "RECAPTURE_DENY")
        self.assertEqual(recapture["processObservation"]["phase"], "execute")

    def test_schema2_telemetry_projection_still_denies_new_process_reference(self):
        self.assert_schema2_execute_rejects_fresh_unsafe_state(
            unsafe_scan=scan(targets=[(77, 88, "fd/9", str(self.cache / "cache.bin"))],
                             processesObserved=10), predicate="NPM_CACHE_REFERENCED")

    def test_schema2_telemetry_projection_still_denies_active_writer(self):
        self.assert_schema2_execute_rejects_fresh_unsafe_state(
            unsafe_scan=scan(writers=[{"pid": 77}], processesObserved=10),
            predicate="NPM_OR_BUILD_ACTIVE")

    def test_schema2_telemetry_projection_still_denies_incomplete_scan(self):
        self.assert_schema2_execute_rejects_fresh_unsafe_state(
            unsafe_scan=scan(complete=False, processesObserved=10, referenceReadFailures=1),
            predicate="PROCESS_REFERENCE_SCAN_INCOMPLETE")

    def test_schema2_telemetry_projection_still_denies_artifact_identity_change(self):
        self.assert_schema2_execute_rejects_fresh_unsafe_state(
            mutation=lambda: self.cache.chmod(0o750), predicate="CANDIDATE_CHANGED")

    def test_schema2_telemetry_projection_still_denies_file_content_change(self):
        self.assert_schema2_execute_rejects_fresh_unsafe_state(
            mutation=lambda: (self.runtime / "app.js").write_bytes(b"same runtimf"),
            predicate="DERIVED_OUTPUT_EQUIVALENCE_INCOMPLETE")

    def test_prepare_denial_reports_changed_fields_and_fresh_process_evidence(self):
        self.audit()
        self.cache.chmod(0o750)
        self.process_patch = lambda **_kwargs: mock.patch.object(
            MODULE, "_proc_targets", return_value=scan(processesObserved=11))
        output = io.StringIO()
        with mock.patch("sys.stdout", output), self.assertRaises(SystemExit):
            self.prepare()
        denial = json.loads(output.getvalue())
        comparisons = denial["processObservation"]["candidateComparisons"]
        cache = next(item for item in comparisons if item["path"] == str(self.cache))
        self.assertIn("identity", cache["changedFields"])
        self.assertEqual(cache["currentProcessScan"]["processesObserved"], 11)
        self.assertFalse(self.intent.exists())

    def test_valid_plan_revalidates_and_seals_prepare_outputs_without_effects(self):
        self.audit()
        candidates_before = [self.cache.exists(), self.runtime.exists()]
        manifest = self.prepare()
        intent = json.loads(self.intent.read_text())
        commands = self.commands.read_text().splitlines()
        sealed = json.loads(self.seal_manifest.read_text())
        self.assertEqual(manifest, sealed)
        self.assertEqual(intent["state"], "SEALED_FOR_EXPLICIT_AUTHORIZATION")
        self.assertEqual(sealed["state"], "SEALED_FOR_EXPLICIT_AUTHORIZATION")
        self.assertEqual(sealed["planSha256"], sha(self.plan))
        self.assertEqual(sealed["intentSha256"], sha(self.intent))
        self.assertEqual(sealed["commandsSha256"], sha(self.commands))
        self.assertEqual(len(commands), 2)
        self.assertEqual([self.cache.exists(), self.runtime.exists()], candidates_before)

    def seal_and_authorize(self, candidates=None):
        self.audit(candidates); self.prepare()
        intent_sha = sha(self.intent)
        intent = json.loads(self.intent.read_text())
        authorization = self.base / "authorization.private.json"
        private_json(authorization, {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUTHORIZATION",
                    "authorization": "AUTHORIZE_ONCE", "intentSha256": intent_sha,
                    "commandsSha256": intent["commandsSha256"],
                    "paths": [item["path"] for item in intent["candidates"]]})
        return intent_sha, authorization

    def test_closed_preparation_archive_executes_literal_unlink_and_measures_actual_gain(self):
        intent_sha, authorization = self.seal_and_authorize([self.archive_candidate()])
        receipt = self.base / "receipts" / "archive-once"
        receipt.parent.mkdir(mode=0o700)
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                self.process_patch():
            result = MODULE.execute_intent(
                self.intent, intent_sha, authorization, sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertFalse(self.archive.exists())
        self.assertTrue(self.archive_record.exists())
        self.assertIsInstance(result["availableBytesBefore"], int)
        self.assertIsInstance(result["availableBytesAfter"], int)
        events = [json.loads(line) for line in
                  (receipt / "command-journal.private.jsonl").read_text().splitlines()]
        self.assertEqual(events[0]["argv"], ["/usr/bin/unlink", "--", str(self.archive)])

    def test_closed_preparation_archive_execute_recapture_denies_new_live_reference(self):
        intent_sha, authorization = self.seal_and_authorize([self.archive_candidate()])
        receipt = self.base / "receipts" / "archive-reference-once"
        receipt.parent.mkdir(mode=0o700)
        live_reference = scan(targets=[(72, 901, "fd/9", str(self.archive))])
        with mock.patch.object(MODULE, "PREPARATIONS_ROOT", self.preparations), \
                mock.patch.object(MODULE, "_proc_targets", return_value=live_reference), \
                self.assertRaises(SystemExit):
            MODULE.execute_intent(
                self.intent, intent_sha, authorization, sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual(result["attemptedCommands"], 0)
        self.assertIn("PREPARATION_ARCHIVE_PROCESS_REFERENCE", result["failurePredicate"])
        self.assertTrue(self.archive.exists())
        evidence = SUPERVISOR.execution_effect_evidence(
            receipt, self.intent, intent_sha, sha(authorization))
        self.assertEqual(evidence["state"], "FAILED_RECONCILED")
        self.assertEqual((evidence["attemptedCommands"],
                          evidence["completedCommands"]), (0, 0))

    def test_execute_stops_first_failure_and_preserves_sources(self):
        intent_sha, authorization = self.seal_and_authorize()
        receipt = self.base / "receipts" / "once"; receipt.parent.mkdir(mode=0o700)
        def simulated_run(argv, **_kwargs):
            if argv[-1] == "jlist":
                return SimpleNamespace(returncode=0, stdout="[]\n", stderr="")
            return SimpleNamespace(returncode=9)
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch(), mock.patch.object(MODULE.subprocess, "run", side_effect=simulated_run) as runner:
            with self.assertRaises(SystemExit):
                MODULE.execute_intent(self.intent, intent_sha, authorization, sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual((result["attemptedCommands"], result["completedCommands"]), (1, 0))
        self.assertEqual(runner.call_count, 2)  # authenticated PM2 jlist, then first rm only
        self.assertTrue(self.package.exists())
        self.assertTrue(self.release.exists())

    def test_execute_has_literal_paths_durable_journal_and_no_source_mutation(self):
        intent_sha, authorization = self.seal_and_authorize()
        receipt = self.base / "receipts" / "once"; receipt.parent.mkdir(mode=0o700)
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            result = MODULE.execute_intent(self.intent, intent_sha, authorization, sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertFalse(self.cache.exists()); self.assertFalse(self.runtime.exists())
        self.assertTrue(self.package.exists()); self.assertTrue(self.manifest.exists())
        self.assertTrue(self.index.exists()); self.assertTrue(self.release.exists())
        events = [json.loads(line) for line in (receipt / "command-journal.private.jsonl").read_text().splitlines()]
        self.assertEqual([item["event"] for item in events],
                         ["ATTEMPT", "RESULT", "VERIFIED", "ATTEMPT", "RESULT", "VERIFIED"])
        self.assertTrue(all(item.get("argv", ["/usr/bin/rm"])[0] == "/usr/bin/rm" for item in events))
        self.assertEqual(stat.S_IMODE((receipt / "execution-receipt.private.json").stat().st_mode), 0o600)

    def test_commands_are_literal_without_expansion(self):
        plan = self.audit()
        for command, candidate in zip(plan["commands"], plan["candidates"]):
            self.assertEqual(command, ["/usr/bin/rm", "-r", "--", candidate["observation"]["path"]])
            self.assertNotRegex(command[-1], r"[*?\[\]{}]")

    def test_manifest_archive_streams_hash_tar_and_authority_without_whole_reader(self):
        fixture = self.manifest_disposition_fixture("streaming")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())
        real_read = MODULE.os.read
        requested = []

        def bounded_read(fd, size):
            requested.append(size)
            self.assertLessEqual(size, 1024 * 1024)
            return real_read(fd, size)

        with fixture["patches"], \
                mock.patch.object(MODULE, "stable_regular",
                                  side_effect=AssertionError("whole reader forbidden")), \
                mock.patch.object(MODULE.os, "read", side_effect=bounded_read):
            observed = MODULE._authenticate_disposition_archive(
                Path(entry["path"]), entry, manifest)
        self.assertEqual(observed["memberCount"], 1)
        self.assertTrue(requested)

    def test_manifest_archive_root_directory_member_terminates_and_is_deterministic(self):
        fixture = self.manifest_disposition_fixture("root-directory-member")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())
        candidate = Path(entry["path"])
        authority = Path(entry["authority"])
        authority_before = MODULE.stat_identity(
            authority.lstat(), include_nlink=True)
        leaf_before = sha(authority / "dist/app.js")

        with tarfile.open(candidate, "w:gz") as archive:
            root = tarfile.TarInfo(".")
            root.type = tarfile.DIRTYPE
            archive.addfile(root)
            payload = (authority / "dist/app.js").read_bytes()
            leaf = tarfile.TarInfo("dist/app.js")
            leaf.size = len(payload)
            archive.addfile(leaf, io.BytesIO(payload))
        candidate.chmod(0o600)
        info = candidate.lstat()
        entry["sha256"] = sha(candidate)
        entry["identity"] = {
            "device": info.st_dev, "inode": info.st_ino, "nlink": info.st_nlink,
            "uid": info.st_uid, "gid": info.st_gid,
            "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        }

        started = time.monotonic()
        with fixture["patches"]:
            first = MODULE._authenticate_disposition_archive(candidate, entry, manifest)
            second = MODULE._authenticate_disposition_archive(candidate, entry, manifest)
        self.assertLess(time.monotonic() - started, 2.0)
        self.assertEqual(first["memberCount"], 2)
        self.assertEqual(first["relationSha256"], second["relationSha256"])
        self.assertEqual(MODULE.stat_identity(authority.lstat(), include_nlink=True),
                         authority_before)
        self.assertEqual(sha(authority / "dist/app.js"), leaf_before)

    def test_archive_root_aliases_descendants_and_confinement_are_explicit(self):
        for value in (".", "./.", "./"):
            self.assertEqual(MODULE._normalized_archive_member(value).as_posix(), ".")

        root = self.base / "authority-confinement"
        child = root / "child"
        child.mkdir(parents=True, mode=0o755)
        leaf, ancestors = MODULE._authority_leaf(root, root.stat(), "child/file.js")
        self.assertEqual(leaf, child / "file.js")
        self.assertEqual([row["path"] for row in ancestors], [str(child)])

        for relative in ("../outside", "/", "child/../../outside"):
            with self.assertRaisesRegex(MODULE.Denied,
                                        "DISPOSITION_AUTHORITY_CONFINEMENT"):
                MODULE._authority_leaf(root, root.stat(), relative)
        with self.assertRaisesRegex(MODULE.Denied,
                                    "DISPOSITION_AUTHORITY_CONFINEMENT"):
            MODULE._authority_leaf(Path("/"), Path("/").stat(), ".")
        with self.assertRaisesRegex(MODULE.Denied,
                                    "DISPOSITION_ARCHIVE_MEMBER_PATH"):
            MODULE._normalized_archive_member("../outside")

    def test_archive_root_alias_duplicate_and_non_directory_are_denied(self):
        fixture = self.manifest_disposition_fixture("root-alias-negative")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())
        candidate = Path(entry["path"])

        def bind_candidate():
            candidate.chmod(0o600)
            info = candidate.lstat()
            entry["sha256"] = sha(candidate)
            entry["identity"] = {
                "device": info.st_dev, "inode": info.st_ino,
                "nlink": info.st_nlink, "uid": info.st_uid, "gid": info.st_gid,
                "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
            }

        with tarfile.open(candidate, "w:gz") as archive:
            for name in (".", "./."):
                item = tarfile.TarInfo(name)
                item.type = tarfile.DIRTYPE
                archive.addfile(item)
        bind_candidate()
        with fixture["patches"], self.assertRaisesRegex(
                MODULE.Denied, "DISPOSITION_ARCHIVE_MEMBER_DUPLICATE"):
            MODULE._authenticate_disposition_archive(candidate, entry, manifest)

        with tarfile.open(candidate, "w:gz") as archive:
            item = tarfile.TarInfo("./")
            item.type = tarfile.REGTYPE
            item.size = 0
            archive.addfile(item, io.BytesIO(b""))
        bind_candidate()
        with fixture["patches"], self.assertRaisesRegex(
                MODULE.Denied, "DISPOSITION_ARCHIVE_ROOT_MEMBER"):
            MODULE._authenticate_disposition_archive(candidate, entry, manifest)

    def test_long_archive_comparison_emits_bounded_temporal_progress(self):
        fixture = self.manifest_disposition_fixture("temporal-progress")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())
        telemetry_path = self.base / "temporal-progress.jsonl"
        with fixture["patches"], \
                mock.patch.object(MODULE, "TAR_PROGRESS_TIME_INTERVAL_SECONDS", 0), \
                mock.patch.object(MODULE, "TAR_PROGRESS_EVENT_LIMIT", 8):
            MODULE._TELEMETRY = MODULE.Telemetry(telemetry_path)
            try:
                MODULE._authenticate_disposition_archive(
                    Path(entry["path"]), entry, manifest)
            finally:
                MODULE._TELEMETRY.close()
                MODULE._TELEMETRY = None
        rows = [json.loads(line) for line in telemetry_path.read_text().splitlines()]
        progress = [row for row in rows if row["phase"] == "tar_scan_progress"]
        self.assertLessEqual(len(progress), 8)
        self.assertIn("archive_hash", {row.get("progressKind") for row in progress})
        self.assertIn("archive_payload", {row.get("progressKind") for row in progress})
        self.assertIn("authority_leaf", {row.get("progressKind") for row in progress})
        self.assertTrue(all(isinstance(row.get("progressBytes"), int) for row in progress))
        serialized = telemetry_path.read_text()
        self.assertNotIn("representative-payload", serialized)
        self.assertNotIn("environment", serialized)

    def test_incremental_relation_digest_is_framed_and_deterministic(self):
        rows = [{"path": "a", "size": 1}, {"path": "bc", "size": 2}]
        first = MODULE.FramedRelationDigest()
        second = MODULE.FramedRelationDigest()
        for row in rows:
            first.add(row); second.add(dict(reversed(list(row.items()))))
        self.assertEqual(first.hexdigest(), second.hexdigest())
        self.assertEqual(first.count, 2)
        ambiguous = MODULE.FramedRelationDigest()
        ambiguous.add({"path": "a\n"}); ambiguous.add({"path": "b"})
        self.assertNotEqual(first.hexdigest(), ambiguous.hexdigest())

    def test_exact_name_registry_is_binary_bounded_and_cleans_on_failure(self):
        existing = set(self.base.glob(".capacity-name-registry-*"))
        with self.assertRaisesRegex(MODULE.Denied,
                                    "DISPOSITION_ARCHIVE_MEMBER_DUPLICATE"):
            with MODULE.ExactNameRegistry(self.base) as names:
                self.assertEqual(names.connection.execute(
                    "PRAGMA cache_size").fetchone()[0], -MODULE.NAME_REGISTRY_CACHE_KIB)
                names.add("case/Name")
                names.add("case/name")
                names.add("café")
                names.add("café")
                names.add("case/Name")
        self.assertEqual(set(self.base.glob(".capacity-name-registry-*")), existing)

        with self.assertRaisesRegex(MODULE.Denied,
                                    "DISPOSITION_NAME_REGISTRY_SPACE"):
            with MODULE.ExactNameRegistry(self.base, max_bytes=8192,
                                          cache_kib=64) as names:
                for index in range(100):
                    names.add(f"{index:04d}-" + "x" * 4096)
        self.assertEqual(set(self.base.glob(".capacity-name-registry-*")), existing)

    def test_registry_substitution_preserves_relation_digest(self):
        fixture = self.manifest_disposition_fixture("relation-compatible")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())

        class InMemoryExactRegistry:
            def __init__(self, *_args, **_kwargs):
                self.values = set()
                self.peak_physical_bytes = 0
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def add(self, value):
                encoded = value.encode("utf-8", "surrogatepass")
                if encoded in self.values:
                    raise MODULE.Denied("DISPOSITION_ARCHIVE_MEMBER_DUPLICATE")
                self.values.add(encoded)
            def measure(self):
                return 0
            def finalize(self):
                return {}

        with fixture["patches"], mock.patch.object(
                MODULE, "ExactNameRegistry", InMemoryExactRegistry):
            reference = MODULE._authenticate_disposition_archive(
                Path(entry["path"]), entry, manifest)
        with fixture["patches"]:
            bounded = MODULE._authenticate_disposition_archive(
                Path(entry["path"]), entry, manifest)
        self.assertEqual(bounded["relationSha256"], reference["relationSha256"])
        self.assertEqual(bounded["memberCount"], reference["memberCount"])

    def test_distant_normalized_duplicate_still_denies(self):
        root = self.base / "distant-duplicate"
        root.mkdir(mode=0o700)
        authority = root / "authority"
        authority.mkdir(mode=0o755)
        archive_path = root / "candidate.tar.gz"
        with tarfile.open(archive_path, "w:gz", compresslevel=1) as output:
            for index in range(5000):
                item = tarfile.TarInfo(f"tree/{index:05d}/")
                item.type = tarfile.DIRTYPE
                output.addfile(item)
            duplicate = tarfile.TarInfo("./tree/00001/")
            duplicate.type = tarfile.DIRTYPE
            output.addfile(duplicate)
        archive_path.chmod(0o600)
        info = archive_path.lstat()
        authority_info = authority.stat()
        entry = {
            "sha256": sha(archive_path),
            "identity": {"device": info.st_dev, "inode": info.st_ino, "nlink": 1,
                         "uid": info.st_uid, "gid": info.st_gid,
                         "mode": f"0{stat.S_IMODE(info.st_mode):03o}"},
            "authority": str(authority), "authorityState": "PRESENT",
            "authorityIdentity": MODULE._directory_identity(authority_info),
            "protectedMemberExceptions": [],
        }
        with mock.patch.object(MODULE, "_authority_leaf",
                               return_value=(authority, [])), \
                self.assertRaisesRegex(MODULE.Denied,
                                       "DISPOSITION_ARCHIVE_MEMBER_DUPLICATE"):
            MODULE._authenticate_disposition_archive(
                archive_path, entry, {"versionedEnvExample": {"sha256": "0" * 64}})

    def test_high_cardinality_tar_members_and_name_memory_are_bounded(self):
        root = self.base / "cardinality"
        root.mkdir(mode=0o700)
        authority = root / "authority"
        authority.mkdir(mode=0o755)
        authority_tree = authority / "tree"
        authority_tree.mkdir(mode=0o755)

        long_component = "representative-long-name-" + ("x" * 96)

        def member_spec(index):
            if index % 10000 == 7:
                return ("symlink", f"tree/link-{index:06d}",
                        f"target-{index:06d}", b"")
            if index % 4096 == 3:
                name = f"tree/files/{long_component}-{index:06d}.txt"
                return ("file", name, None,
                        f"representative-payload-{index:06d}\n".encode())
            if index % 97 == 0:
                return ("directory", f"tree/{long_component}-{index:06d}",
                        None, b"")
            return ("directory", f"tree/{index:06d}", None, b"")

        for index in range(60000):
            kind, relative, target, payload = member_spec(index)
            authoritative = authority / relative
            authoritative.parent.mkdir(parents=True, exist_ok=True)
            if kind == "directory":
                authoritative.mkdir(mode=0o755)
            elif kind == "file":
                authoritative.write_bytes(payload)
            else:
                authoritative.symlink_to(target)

        def create_archive(count):
            path = root / f"candidate-{count}.tar.gz"
            with tarfile.open(path, "w:gz", compresslevel=1) as output:
                for index in range(count):
                    kind, relative, target, payload = member_spec(index)
                    item = tarfile.TarInfo(relative + ("/" if kind == "directory" else ""))
                    if kind == "directory":
                        item.type = tarfile.DIRTYPE
                        output.addfile(item)
                    elif kind == "file":
                        item.type = tarfile.REGTYPE
                        item.size = len(payload)
                        output.addfile(item, io.BytesIO(payload))
                    else:
                        item.type = tarfile.SYMTYPE
                        item.linkname = target
                        output.addfile(item)
            path.chmod(0o600)
            return path

        archives = [create_archive(30000), create_archive(60000)]
        fixture_counts = {}
        for count in (30000, 60000):
            kinds = {"directory": 0, "file": 0, "symlink": 0, "longName": 0}
            for index in range(count):
                kind, relative, _target, _payload = member_spec(index)
                kinds[kind] += 1
                kinds["longName"] += int(long_component in relative)
            fixture_counts[count] = kinds
            self.assertGreater(kinds["directory"], 0)
            self.assertGreater(kinds["file"], 0)
            self.assertGreater(kinds["symlink"], 0)
            self.assertGreater(kinds["longName"], 0)
        old_code = r'''
import json,resource,sys,tarfile
with tarfile.open(sys.argv[1],"r|gz") as archive:
    for _member in archive:pass
    count=len(archive.members)
print(json.dumps({"membersRetained":count,"rssPeak":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024},sort_keys=True))
'''

        code = r'''
import importlib.util,json,resource,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("capacity",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=Path(sys.argv[2]);a=Path(sys.argv[3]);t=Path(sys.argv[4]);s=p.lstat();q=a.stat()
entry={"sha256":sys.argv[5],"identity":{"device":s.st_dev,"inode":s.st_ino,"nlink":1,"uid":s.st_uid,"gid":s.st_gid,"mode":f"0{s.st_mode & 0o777:03o}"},"authority":str(a),"authorityState":"PRESENT","authorityIdentity":m._directory_identity(q),"protectedMemberExceptions":[]}
m._TELEMETRY=m.Telemetry(t)
try:r=m._authenticate_disposition_archive(p,entry,{"versionedEnvExample":{"sha256":"0"*64}})
finally:m._TELEMETRY.close();m._TELEMETRY=None
print(json.dumps({"result":r,"rssPeak":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024},sort_keys=True))
'''

        def limit_memory():
            maximum = 256 * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (maximum, maximum))

        old_observations = []
        observations = []
        for archive_path in archives:
            old = subprocess.run(
                [sys.executable, "-B", "-c", old_code, str(archive_path)],
                capture_output=True, text=True, preexec_fn=limit_memory,
                timeout=180, check=False)
            self.assertEqual(old.returncode, 0, old.stderr)
            old_observations.append(json.loads(old.stdout))
            telemetry_path = root / f"{archive_path.stem}.telemetry.jsonl"
            completed = subprocess.run(
                [sys.executable, "-B", "-c", code, str(TOOL), str(archive_path),
                 str(authority), str(telemetry_path), sha(archive_path)],
                capture_output=True, text=True, preexec_fn=limit_memory,
                timeout=180, check=False)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            observation = json.loads(completed.stdout)
            events = [json.loads(line) for line in telemetry_path.read_text().splitlines()]
            observation["sampledPeak"] = max(
                event["rssPeakBytes"] for event in events
                if event["rssPeakBytes"] is not None)
            observation["progressEvents"] = sum(
                event["phase"] == "tar_scan_progress" for event in events)
            final_scan = next(event for event in events
                              if event["phase"] == "after_tar_scan")
            observation["maxTarMembersRetained"] = final_scan["tarMembersRetained"]
            observation["nameRegistryPeakPhysicalBytes"] = final_scan[
                "temporaryDiskBytes"]
            observation["nameRegistry"] = final_scan["nameRegistry"]
            observations.append(observation)

        for count, old, observation in zip((30000, 60000), old_observations,
                                            observations):
            self.assertEqual(old["membersRetained"], count)
            result = observation["result"]
            self.assertEqual(result["memberCount"], count)
            self.assertLessEqual(observation["maxTarMembersRetained"], 1)
            self.assertLessEqual(observation["nameRegistryPeakPhysicalBytes"],
                                 MODULE.NAME_REGISTRY_MAX_BYTES)
            registry = observation["nameRegistry"]
            self.assertEqual(registry["distinctNames"], count)
            self.assertEqual(registry["uniquenessChecks"], count)
            self.assertEqual(registry["journalMode"], "off")
            self.assertEqual(registry["cacheSizeKiB"], MODULE.NAME_REGISTRY_CACHE_KIB)
            self.assertEqual(registry["configuredDatabaseLimitBytes"],
                             registry["pageSize"] * registry["maxPageCount"])
            self.assertLessEqual(registry["configuredDatabaseLimitBytes"],
                                 MODULE.NAME_REGISTRY_MAX_BYTES)
            self.assertEqual([item["kind"] for item in registry["files"]], ["database"])
            self.assertLessEqual(observation["progressEvents"],
                                 MODULE.TAR_PROGRESS_EVENT_LIMIT)
            self.assertLess(observation["rssPeak"], 256 * 1024 * 1024)
        self.assertLess(observations[1]["rssPeak"] - observations[0]["rssPeak"],
                        24 * 1024 * 1024)
        print("CARDINALITY_MEASUREMENTS=" + json.dumps({
            "prior": old_observations, "bounded": observations,
            "fixture": {"longNames": True, "regularFilesWithPhysicalAuthority": True,
                        "admittedSymlinks": True, "directories": True,
                        "counts": fixture_counts},
        }, sort_keys=True))

    def test_sigterm_leaves_bounded_registry_residue(self):
        root = self.base / "signal-registry"
        root.mkdir(mode=0o700)
        scratch = root / "scratch"
        scratch.mkdir(mode=0o700)
        ready = root / "ready.json"
        child_source = r'''
import importlib.util,json,os,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location("capacity",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
parent=Path(sys.argv[2]);ready=Path(sys.argv[3])
with m.ExactNameRegistry(parent) as registry:
    for index in range(4096):registry.add(f"representative/{index:06d}")
    physical=registry.measure();info=registry.directory.lstat()
    ready.write_text(json.dumps({"path":str(registry.directory),"device":info.st_dev,"inode":info.st_ino,"mode":oct(info.st_mode & 0o777),"physicalBytes":physical,"distinctNames":registry.count},sort_keys=True))
    time.sleep(60)
'''
        process = subprocess.Popen([
            sys.executable, "-B", "-c", child_source,
            str(TOOL), str(scratch), str(ready),
        ])
        deadline = time.monotonic() + 15
        while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(ready.exists(), f"child failed before readiness: {process.poll()}")
        process.send_signal(signal.SIGTERM)
        process.wait(timeout=15)

        residue = json.loads(ready.read_text())
        residue_path = Path(residue["path"])
        self.assertTrue(residue_path.is_dir())
        self.assertEqual(residue_path.parent, scratch)
        self.assertRegex(residue_path.name, r"^\.capacity-name-registry-[0-9a-f]{32}$")
        self.assertEqual(residue["mode"], "0o700")
        self.assertEqual(residue["distinctNames"], 4096)
        self.assertEqual(sorted(item.name for item in residue_path.iterdir()),
                         [MODULE.ExactNameRegistry.DATABASE_NAME])
        database = residue_path / MODULE.ExactNameRegistry.DATABASE_NAME
        database_info = database.lstat()
        self.assertTrue(stat.S_ISREG(database_info.st_mode))
        self.assertEqual(stat.S_IMODE(database_info.st_mode), 0o600)
        self.assertLessEqual(database_info.st_blocks * 512,
                             MODULE.NAME_REGISTRY_MAX_BYTES)

        self.assertEqual(process.returncode, -signal.SIGTERM)
        print("SIGNAL_REGISTRY_RESIDUE=" + json.dumps({
            "childExitCode": process.returncode,
            "childSignal": signal.SIGTERM,
            "directoryMode": residue["mode"],
            "databaseMode": oct(stat.S_IMODE(database_info.st_mode)),
            "databaseLogicalBytes": database_info.st_size,
            "databasePhysicalBytes": database_info.st_blocks * 512,
            "distinctNames": residue["distinctNames"],
            "boundedByBytes": MODULE.NAME_REGISTRY_MAX_BYTES,
        }, sort_keys=True))

        # Test-only cleanup is confined to the exact identity published by the child.
        current = residue_path.lstat()
        self.assertEqual((current.st_dev, current.st_ino),
                         (residue["device"], residue["inode"]))
        database.unlink()
        residue_path.rmdir()

    def test_streaming_archive_identity_and_authority_drift_still_deny(self):
        fixture = self.manifest_disposition_fixture("streaming-drift")
        entry = fixture["entries"][0]
        manifest = json.loads(fixture["manifest"].read_text())
        authority = Path(entry["authority"]) / "dist/app.js"
        authority.write_bytes(b"changed")
        with fixture["patches"], self.assertRaisesRegex(
                MODULE.Denied, "FILE_(SIZE|SHA256)"):
            MODULE._authenticate_disposition_archive(Path(entry["path"]), entry, manifest)

    def test_telemetry_is_jsonl_fsynced_and_remains_valid_after_interruption(self):
        path = self.base / "interrupted.telemetry.private.jsonl"
        trace = MODULE.Telemetry(path)
        try:
            trace.emit("before_tar_scan", candidate="sanitized-candidate", member_count=7)
            raise RuntimeError("simulated interruption")
        except RuntimeError:
            pass
        finally:
            trace.close()
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        self.assertEqual([row["phase"] for row in rows],
                         ["telemetry_started", "before_tar_scan"])
        self.assertEqual(rows[-1]["memberCount"], 7)
        self.assertIn("memoryEventsBaseline", rows[0])
        self.assertNotIn("environment", path.read_text())

    def test_every_cli_phase_requires_an_exclusive_telemetry_destination(self):
        invocations = {
            "audit": ["--request", "/request", "--request-sha256", "a" * 64,
                      "--plan-output", "/plan"],
            "prepare": ["--plan", "/plan", "--plan-sha256", "a" * 64,
                        "--intent-output", "/intent", "--commands-output", "/commands",
                        "--manifest-output", "/manifest"],
            "execute": ["--intent", "/intent", "--intent-sha256", "a" * 64,
                        "--authorization", "/authorization", "--authorization-sha256",
                        "b" * 64, "--receipt-root", "/receipt"],
        }
        for action, arguments in invocations.items():
            with self.subTest(action=action), \
                    mock.patch.object(sys, "argv", [str(TOOL), action, *arguments]), \
                    self.assertRaises(SystemExit) as stopped:
                MODULE.parse_args()
            self.assertEqual(stopped.exception.code, 2)

    def test_streaming_archive_passes_under_explicit_address_space_limit(self):
        root = self.base / "memory-limit"
        authority = root / "authority"
        authority.mkdir(parents=True)
        payload = authority / "payload.bin"
        with payload.open("wb") as stream:
            for _ in range(24):
                stream.write(os.urandom(1024 * 1024))
        payload.chmod(0o644)
        archive = root / "candidate.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            output.add(payload, arcname="payload.bin")
        archive.chmod(0o600)
        info = archive.lstat()
        code = """
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('capacity',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=Path(sys.argv[2]);a=Path(sys.argv[3]);s=p.lstat()
entry={'sha256':sys.argv[4],'identity':{'device':s.st_dev,'inode':s.st_ino,'nlink':1,'uid':s.st_uid,'gid':s.st_gid,'mode':f'0{s.st_mode & 0o777:03o}'},'authority':str(a),'authorityState':'PRESENT','authorityIdentity':{'device':a.stat().st_dev,'inode':a.stat().st_ino,'uid':a.stat().st_uid,'gid':a.stat().st_gid,'mode':f'0{a.stat().st_mode & 0o777:03o}'},'protectedMemberExceptions':[]}
print(m._authenticate_disposition_archive(p,entry,{'versionedEnvExample':{'sha256':'0'*64}})['memberCount'])
"""

        def limit_memory():
            maximum = 72 * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (maximum, maximum))

        completed = subprocess.run(
            [sys.executable, "-B", "-c", code, str(TOOL), str(archive),
             str(authority), sha(archive)], capture_output=True, text=True,
            preexec_fn=limit_memory, timeout=30, check=False)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "1")

    def ef7_fixture(self, name="ef7"):
        base = self.base / name
        repository = base / "repository"
        worktree = base / "ef7db111-prep"
        repository.mkdir(parents=True)
        subprocess.run(["/usr/bin/git", "init", "-q", str(repository)], check=True)
        subprocess.run(["/usr/bin/git", "-C", str(repository), "config", "user.name", "Fixture"], check=True)
        subprocess.run(["/usr/bin/git", "-C", str(repository), "config", "user.email", "fixture@example.invalid"], check=True)
        tracked = {
            ".gitignore": "/node_modules/\n/.next/\n/apps/whatsapp-agent/node_modules/\napps/whatsapp-agent/dist/\n",
            "package.json": "{}\n", "package-lock.json": "{}\n",
            "src/app.ts": "export {}\n", "public/index.txt": "public\n",
            "docs/readme.md": "docs\n", "scripts/check.py": "pass\n",
            "apps/whatsapp-agent/package.json": "{}\n",
            "apps/whatsapp-agent/package-lock.json": "{}\n",
            "apps/whatsapp-agent/src/index.ts": "export {}\n",
            "apps/whatsapp-agent/prisma/schema.prisma": "generator client {}\n",
            "apps/whatsapp-web-worker/src/index.ts": "export {}\n",
        }
        for relative, content in tracked.items():
            target = repository / relative; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        subprocess.run(["/usr/bin/git", "-C", str(repository), "add", "."], check=True)
        subprocess.run(["/usr/bin/git", "-C", str(repository), "commit", "-qm", "fixture"], check=True)
        commit = subprocess.check_output(
            ["/usr/bin/git", "-C", str(repository), "rev-parse", "HEAD"], text=True).strip()
        subprocess.run(["/usr/bin/git", "-C", str(repository), "worktree", "add", "-q",
                        "--detach", str(worktree), commit], check=True)
        worktree.chmod(0o775)
        candidates = [
            worktree / "node_modules",
            worktree / "apps/whatsapp-agent/node_modules",
            worktree / ".next",
            worktree / "apps/whatsapp-agent/dist",
        ]
        for path in candidates: path.mkdir(parents=True, mode=0o755); path.chmod(0o755)
        (candidates[0] / "pkg").mkdir(); (candidates[0] / "pkg/index.js").write_text("package\n")
        (candidates[0] / ".bin").mkdir(); (candidates[0] / ".bin/tool").symlink_to("../pkg/index.js")
        library = candidates[1] / "openai/resources/uploads"; library.mkdir(parents=True)
        (library / "index.js").write_text("library code\n")
        hardlinks = candidates[1] / "pkg"; hardlinks.mkdir()
        (hardlinks / "a.js").write_text("shared\n"); os.link(hardlinks / "a.js", hardlinks / "b.js")
        (candidates[2] / "cache").mkdir(); (candidates[2] / "cache/build.bin").write_bytes(b"build")
        (candidates[3] / "db").mkdir(); (candidates[3] / "db/persist.js").write_text("compiled code\n")
        for root, dirs, files in os.walk(worktree):
            root_path = Path(root)
            if root_path == worktree: continue
            root_path.chmod(0o755)
            for filename in files:
                target = root_path / filename
                if not target.is_symlink(): target.chmod(0o644)
        git_file = worktree / ".git"
        git_dir = Path(git_file.read_text().strip().removeprefix("gitdir: "))
        control = base / "control"; manifest = control / "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json"
        manifest.parent.mkdir(parents=True)
        preserved = ["package.json", "package-lock.json", "src", "public", "docs", "scripts",
                     "apps/whatsapp-agent/package.json", "apps/whatsapp-agent/package-lock.json",
                     "apps/whatsapp-agent/src", "apps/whatsapp-agent/prisma",
                     "apps/whatsapp-web-worker"]
        derivations = [
            ["package.json", "package-lock.json"],
            ["apps/whatsapp-agent/package.json", "apps/whatsapp-agent/package-lock.json",
             "apps/whatsapp-agent/prisma"],
            ["package.json", "package-lock.json", "src", "public"],
            ["apps/whatsapp-agent/package.json", "apps/whatsapp-agent/package-lock.json",
             "apps/whatsapp-agent/src", "apps/whatsapp-agent/prisma"],
        ]
        entries = []
        for path, derivation in zip(candidates, derivations):
            info = path.lstat()
            entries.append({"path": str(path), "relativePath": path.relative_to(worktree).as_posix(),
                "kind": "DEPENDENCY_TREE" if path.name == "node_modules" else "COMPILED_TREE",
                "physicalBytes": MODULE.physical_usage([path])[str(path)]["allocatedBytes"],
                "identity": MODULE._directory_identity(info),
                "derivationTrackedPaths": derivation})
        private_json(manifest, {"schemaVersion": 1,
            "kind": "CLOSED_DEPLOY_CONTROL_DERIVED_DISPOSITION",
            "dispositionId": "fixture-ef7-v1",
            "worktree": {"root": str(worktree), "commit": commit, "gitDir": str(git_dir),
                "gitFileSha256": sha(git_file), "identity": MODULE._directory_identity(worktree.lstat()),
                "preservedTrackedPaths": preserved}, "entries": entries})
        binding = {"path": str(manifest), "sha256": sha(manifest)}
        requested = [{"class": "CLOSED_DEPLOY_CONTROL_DERIVED_TREE", "path": str(path),
                      "dispositionManifest": binding} for path in candidates]
        patches = dict(ROOT=control, DEPLOY_CONTROL_ROOT=worktree,
            DEPLOY_CONTROL_GITDIR=git_dir, DEPLOY_CONTROL_PATHS=tuple(candidates),
            DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH=manifest,
            DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256=sha(manifest),
            DEPLOY_CONTROL_DISPOSITION_ID="fixture-ef7-v1")
        return {"base": base, "repository": repository, "worktree": worktree,
                "gitDir": git_dir, "commit": commit, "candidates": candidates,
                "manifest": manifest, "requested": requested, "patches": patches,
                "preserved": preserved}

    def ef7_cardinality_fixture(self, name="ef7-cardinality"):
        fixture = self.ef7_fixture(name)
        target_counts = (
            (2326, 21808, 31), (710, 6934, 10),
            (284, 1650, 0), (58, 483, 0),
        )
        def counts(root):
            directories = regular = links = 0
            for current, names, leaves in os.walk(root, followlinks=False):
                directories += len(names)
                for leaf in leaves:
                    info = (Path(current) / leaf).lstat()
                    if stat.S_ISLNK(info.st_mode): links += 1
                    elif stat.S_ISREG(info.st_mode): regular += 1
            return directories, regular, links
        for candidate, expected in zip(fixture["candidates"], target_counts):
            directories, regular, links = counts(candidate)
            for index in range(expected[0] - directories):
                path = candidate / f"cardinality-directory-{index:05d}"
                path.mkdir(mode=0o755)
            for index in range(expected[1] - regular):
                path = candidate / f"cardinality-file-{index:05d}-representative-name.js"
                path.write_bytes(b""); path.chmod(0o644)
            target = next(path for path in candidate.rglob("*") if path.is_file())
            for index in range(expected[2] - links):
                link = candidate / f"cardinality-link-{index:03d}"
                link.symlink_to(os.path.relpath(target, link.parent))
            self.assertEqual(counts(candidate), expected)
        value = json.loads(fixture["manifest"].read_text())
        for entry, candidate in zip(value["entries"], fixture["candidates"]):
            entry["physicalBytes"] = MODULE.physical_usage([candidate])[str(candidate)][
                "allocatedBytes"]
        fixture["manifest"].write_bytes(MODULE.canonical(value)); fixture["manifest"].chmod(0o600)
        binding = {"path": str(fixture["manifest"]), "sha256": sha(fixture["manifest"])}
        fixture["requested"] = [
            {"class": "CLOSED_DEPLOY_CONTROL_DERIVED_TREE", "path": str(path),
             "dispositionManifest": binding} for path in fixture["candidates"]]
        fixture["patches"]["DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256"] = binding["sha256"]
        fixture["expectedEffects"] = sum(sum(item) for item in target_counts) + 4
        return fixture

    def test_ef7_materialized_consumer_complete_lifecycle_preserves_worktree(self):
        fixture = self.ef7_fixture("ef7-materialized")
        external = fixture["base"] / "custody/control"
        (external / "scripts").mkdir(parents=True)
        (external / "config/capacity-recovery").mkdir(parents=True)
        shutil.copy2(TOOL, external / "scripts/capacity-recovery.py")
        shutil.copy2(fixture["manifest"],
                     external / "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json")
        spec = importlib.util.spec_from_file_location(
            "ef7_materialized_consumer", external / "scripts/capacity-recovery.py")
        consumer = importlib.util.module_from_spec(spec); assert spec.loader is not None
        spec.loader.exec_module(consumer)
        manifest = external / "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json"
        patches = {**fixture["patches"], "ROOT": external,
            "DEPLOY_CONTROL_DISPOSITION_MANIFEST_PATH": manifest,
            "DEPLOY_CONTROL_DISPOSITION_MANIFEST_SHA256": sha(manifest)}
        binding = {"path": str(manifest), "sha256": sha(manifest)}
        candidates = [{**item, "dispositionManifest": binding} for item in fixture["requested"]]
        custody = external.parent
        request = custody / "audit.private.json"
        plan = custody / "plan.private.json"
        intent = custody / "intent.private.json"
        commands = custody / "commands.private.txt"
        seal = custody / "seal.private.json"
        private_json(request, self.request_value(candidates))
        with mock.patch.multiple(consumer, **patches), \
                mock.patch.object(consumer, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(consumer, "deploy_group_principals", return_value=["deploy"]), \
                mock.patch.object(consumer, "_proc_targets", return_value=scan()):
            plan_value = consumer.audit_request(request, sha(request), plan)
            self.assertEqual(plan_value["state"], "P00_CAPACITY_RECOVERY_AUDIT_PASS")
            consumer.prepare_plan(plan, sha(plan), intent, commands, seal)
            sealed = json.loads(intent.read_text())
            authorization = fixture["base"] / "authorization.private.json"
            private_json(authorization, {"schemaVersion": 1,
                "kind": "CAPACITY_RECOVERY_AUTHORIZATION", "authorization": "AUTHORIZE_ONCE",
                "intentSha256": sha(intent), "commandsSha256": sealed["commandsSha256"],
                "paths": [item["path"] for item in sealed["candidates"]]})
            receipt = fixture["base"] / "receipts/once"; receipt.parent.mkdir(mode=0o700)
            result = consumer.execute_intent(intent, sha(intent), authorization,
                                             sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertTrue(fixture["worktree"].is_dir())
        self.assertEqual(subprocess.check_output(
            ["/usr/bin/git", "-C", str(fixture["worktree"]), "rev-parse", "HEAD"],
            text=True).strip(), fixture["commit"])
        for relative in fixture["preserved"]:
            self.assertTrue((fixture["worktree"] / relative).exists())
        self.assertTrue(all(not path.exists() for path in fixture["candidates"]))
        self.assertTrue(all(str(fixture["worktree"]) != line.strip()
                            for line in commands.read_text().splitlines()))

    def test_ef7_exact_scope_references_drift_and_protected_material_deny(self):
        for source in ("cwd", "fd/9", "maps"):
            fixture = self.ef7_fixture("ef7-ref-" + source.replace("/", "-"))
            with self.subTest(source=source), mock.patch.multiple(MODULE, **fixture["patches"]), \
                    mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                    mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                    self.assertRaisesRegex(MODULE.Denied, "DISPOSITION_PROCESS_REFERENCE"):
                MODULE.authenticate_deploy_control(
                    fixture["requested"][0], json.loads(self.operational.read_text()),
                    scan(targets=[(77, 101, source, str(fixture["candidates"][0] / "pkg"))]))
        fixture = self.ef7_fixture("ef7-protected")
        (fixture["candidates"][0] / ".env").write_text("forbidden")
        with mock.patch.multiple(MODULE, **fixture["patches"]), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "DEPLOY_CONTROL_PROTECTED_MATERIAL"):
            MODULE.authenticate_deploy_control(
                fixture["requested"][0], json.loads(self.operational.read_text()), scan())

    def test_ef7_symlink_external_hardlink_and_paths_outside_closed_set_deny(self):
        fixture = self.ef7_fixture("ef7-unsafe")
        outside = fixture["base"] / "outside.bin"; outside.write_bytes(b"shared"); outside.chmod(0o644)
        os.link(outside, fixture["candidates"][0] / "external-hardlink")
        with mock.patch.multiple(MODULE, **fixture["patches"]), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "DEPLOY_CONTROL_TREE_EXTERNAL_HARDLINK"):
            MODULE.authenticate_deploy_control(
                fixture["requested"][0], json.loads(self.operational.read_text()), scan())
        outside.unlink(); (fixture["candidates"][0] / "external-hardlink").unlink()
        (fixture["candidates"][0] / "escape").symlink_to("../../outside")
        with mock.patch.multiple(MODULE, **fixture["patches"]), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.assertRaisesRegex(MODULE.Denied, "DEPLOY_CONTROL_TREE_SYMLINK_ESCAPE"):
            MODULE.authenticate_deploy_control(
                fixture["requested"][0], json.loads(self.operational.read_text()), scan())
        root_candidate = {**fixture["requested"][0], "path": str(fixture["worktree"])}
        with mock.patch.multiple(MODULE, **fixture["patches"]), \
                self.assertRaisesRegex(MODULE.Denied, "DEPLOY_CONTROL_EXACT_BATCH"):
            MODULE.validate_audit_request(self.request_value([root_candidate]))

    def test_ef7_partial_execution_is_terminal_without_replay(self):
        fixture = self.ef7_fixture("ef7-partial")
        request = fixture["base"] / "request.private.json"
        plan = fixture["base"] / "plan.private.json"
        intent_path = fixture["base"] / "intent.private.json"
        commands = fixture["base"] / "commands.private.txt"
        seal = fixture["base"] / "seal.private.json"
        private_json(request, self.request_value(fixture["requested"]))
        patches = fixture["patches"]
        with mock.patch.multiple(MODULE, **patches), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            MODULE.audit_request(request, sha(request), plan)
            MODULE.prepare_plan(plan, sha(plan), intent_path, commands, seal)
        intent = json.loads(intent_path.read_text())
        authorization = fixture["base"] / "authorization.private.json"
        private_json(authorization, {"schemaVersion": 1,
            "kind": "CAPACITY_RECOVERY_AUTHORIZATION", "authorization": "AUTHORIZE_ONCE",
            "intentSha256": sha(intent_path), "commandsSha256": intent["commandsSha256"],
            "paths": [item["path"] for item in intent["candidates"]]})
        receipt = fixture["base"] / "receipts/partial"; receipt.parent.mkdir(mode=0o700)
        real_run = subprocess.run; effects = []
        def interrupt_after_one(argv, **kwargs):
            if argv[0] == "/usr/bin/git" or argv[-1] == "jlist":
                return real_run(argv, **kwargs)
            effects.append(list(argv))
            if len(effects) == 1:
                return real_run(argv, **kwargs)
            return SimpleNamespace(returncode=9)
        with mock.patch.multiple(MODULE, **patches), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch(), mock.patch.object(MODULE.subprocess, "run", side_effect=interrupt_after_one), \
                self.assertRaises(SystemExit):
            MODULE.execute_intent(intent_path, sha(intent_path), authorization,
                                  sha(authorization), receipt)
        result = json.loads((receipt / "execution-receipt.private.json").read_text())
        self.assertEqual((result["attemptedCommands"], result["completedCommands"]), (2, 1))
        first = Path(effects[0][-1]); self.assertFalse(first.exists())
        with self.assertRaisesRegex(MODULE.Denied, "RECEIPT_ROOT_EXISTS"):
            MODULE.execute_intent(intent_path, sha(intent_path), authorization,
                                  sha(authorization), receipt)

    def test_ef7_production_cardinality_reconciles_complete_and_partial_bounded(self):
        measurements = []
        for suffix, partial in (("partial", True), ("complete", False)):
            fixture = self.ef7_cardinality_fixture("ef7-cardinality-" + suffix)
            request = fixture["base"] / "request.private.json"
            plan = fixture["base"] / "plan.private.json"
            intent_path = fixture["base"] / "intent.private.json"
            commands = fixture["base"] / "commands.private.txt"
            seal = fixture["base"] / "seal.private.json"
            private_json(request, self.request_value(fixture["requested"]))
            with mock.patch.multiple(MODULE, **fixture["patches"]), \
                    mock.patch.object(MODULE, "deploy_identity",
                                      return_value=(os.geteuid(), os.getegid())), \
                    mock.patch.object(MODULE, "deploy_group_principals",
                                      return_value=["deploy"]), self.process_patch():
                MODULE.audit_request(request, sha(request), plan)
                MODULE.prepare_plan(plan, sha(plan), intent_path, commands, seal)
            intent = json.loads(intent_path.read_text())
            self.assertEqual(len(intent["commands"]), fixture["expectedEffects"])
            authorization = fixture["base"] / "authorization.private.json"
            private_json(authorization, {"schemaVersion": 1,
                "kind": "CAPACITY_RECOVERY_AUTHORIZATION", "authorization": "AUTHORIZE_ONCE",
                "intentSha256": sha(intent_path), "commandsSha256": intent["commandsSha256"],
                "paths": [item["path"] for item in intent["candidates"]]})
            receipt = fixture["base"] / "receipts" / suffix
            receipt.parent.mkdir(mode=0o700)
            pid = os.fork()
            if pid == 0:
                code = 0
                try:
                    with mock.patch.multiple(MODULE, **fixture["patches"]), \
                            mock.patch.object(MODULE, "deploy_identity",
                                              return_value=(os.geteuid(), os.getegid())), \
                            mock.patch.object(MODULE, "deploy_group_principals",
                                              return_value=["deploy"]), self.process_patch():
                        if partial:
                            real_run = subprocess.run; effect_count = [0]
                            def fail_second_effect(argv, **kwargs):
                                if argv[0] == "/usr/bin/git" or argv[-1] == "jlist":
                                    return real_run(argv, **kwargs)
                                effect_count[0] += 1
                                if effect_count[0] == 1:
                                    return real_run(argv, **kwargs)
                                return SimpleNamespace(returncode=9)
                            with mock.patch.object(MODULE.subprocess, "run",
                                                   side_effect=fail_second_effect):
                                MODULE.execute_intent(
                                    intent_path, sha(intent_path), authorization,
                                    sha(authorization), receipt)
                        else:
                            MODULE.execute_intent(intent_path, sha(intent_path), authorization,
                                                  sha(authorization), receipt)
                except SystemExit:
                    code = 0 if partial else 1
                except BaseException:
                    code = 1
                os._exit(code)
            _pid, status, executor_usage = os.wait4(pid, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            supervisor_result = fixture["base"] / f"supervisor-{suffix}.json"
            pid = os.fork()
            if pid == 0:
                evidence = SUPERVISOR.execution_effect_evidence(
                    receipt, intent_path, sha(intent_path), sha(authorization))
                supervisor_result.write_text(json.dumps(evidence, sort_keys=True))
                supervisor_result.chmod(0o600)
                os._exit(0)
            _pid, status, supervisor_usage = os.wait4(pid, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            evidence = json.loads(supervisor_result.read_text())
            expected_state = "FAILED_RECONCILED" if partial else "COMPLETED_RECONCILED"
            self.assertEqual(evidence["state"], expected_state)
            if partial:
                self.assertEqual((evidence["attemptedCommands"],
                                  evidence["completedCommands"]), (2, 1))
            else:
                self.assertEqual(evidence["attemptedCommands"], fixture["expectedEffects"])
                self.assertEqual(evidence["completedCommands"], fixture["expectedEffects"])
                self.assertTrue(all(not path.exists() for path in fixture["candidates"]))
            journal = receipt / "command-journal.private.jsonl"
            receipt_file = receipt / "execution-receipt.private.json"
            evidence_logical = sum(path.stat().st_size for path in receipt.iterdir()
                                   if path.is_file())
            evidence_physical = sum(path.stat().st_blocks * 512 for path in receipt.iterdir()
                                    if path.is_file())
            self.assertLessEqual(journal.stat().st_size,
                                 SUPERVISOR.EXECUTION_JOURNAL_MAX_BYTES)
            self.assertLessEqual(receipt_file.stat().st_size,
                                 SUPERVISOR.EXECUTION_RECEIPT_MAX_BYTES)
            executor_peak = executor_usage.ru_maxrss * 1024
            supervisor_peak = supervisor_usage.ru_maxrss * 1024
            self.assertLess(executor_peak, 512 * 1024 * 1024)
            self.assertLess(supervisor_peak, 512 * 1024 * 1024)
            measurements.append({"state": expected_state,
                "effects": fixture["expectedEffects"],
                "journalBytes": journal.stat().st_size,
                "receiptBytes": receipt_file.stat().st_size,
                "evidenceLogicalBytes": evidence_logical,
                "evidencePhysicalBytes": evidence_physical,
                "executorPeakBytes": executor_peak,
                "supervisorPeakBytes": supervisor_peak})
        print("EF7_CARDINALITY_MEASUREMENTS=" + json.dumps(measurements, sort_keys=True))

    def test_ef7_prepare_denies_tree_drift_after_audit(self):
        fixture = self.ef7_fixture("ef7-drift")
        request = fixture["base"] / "request.private.json"
        plan = fixture["base"] / "plan.private.json"
        private_json(request, self.request_value(fixture["requested"]))
        with mock.patch.multiple(MODULE, **fixture["patches"]), \
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            MODULE.audit_request(request, sha(request), plan)
            changed = fixture["candidates"][3] / "drift.js"
            changed.write_text("late drift\n"); changed.chmod(0o644)
            with self.assertRaises(SystemExit):
                MODULE.prepare_plan(
                    plan, sha(plan), fixture["base"] / "intent.private.json",
                    fixture["base"] / "commands.private.txt",
                    fixture["base"] / "seal.private.json")

    def test_ef7_production_manifest_is_exact_and_closed(self):
        manifest = Path(__file__).resolve().parents[2] / (
            "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json")
        self.assertEqual(sha(manifest),
                         "5d08f0a07e0c6eab2638772f0d6bd65f65fb0df2f965e644ae4d1374131143c0")
        value = json.loads(manifest.read_text())
        self.assertEqual(value["dispositionId"],
                         "p00-ef7db111-deploy-control-derived-v1")
        self.assertEqual(value["worktree"]["root"],
                         "/opt/re7online/deploy-control/ef7db111-prep")
        self.assertEqual(value["worktree"]["commit"],
                         "ef7db11179a1be14160e0f7ceec9f01a8aaf0ece")
        self.assertEqual(
            {entry["path"]: entry["physicalBytes"] for entry in value["entries"]}, {
                "/opt/re7online/deploy-control/ef7db111-prep/node_modules": 593416192,
                "/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/node_modules": 316493824,
                "/opt/re7online/deploy-control/ef7db111-prep/.next": 29827072,
                "/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/dist": 9404416,
            })
        self.assertEqual(sum(item["physicalBytes"] for item in value["entries"]),
                         949141504)


if __name__ == "__main__":
    unittest.main(verbosity=2)
