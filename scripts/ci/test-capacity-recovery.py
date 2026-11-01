#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import resource
import signal
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
        control = self.base / f"disposition-control-{suffix}"
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
        package_raw = f"{sha(tree / 'dist/worker.js')}  dist/worker.js\n"
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

    def request_value(self, candidates=None, minimum=1):
        return {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUDIT_REQUEST",
                "minimumRecoveryBytes": minimum, "targetAvailableBytes": minimum,
                "rootPolicy": {"path": str(self.policy), "sha256": sha(self.policy)},
                "operationalState": {"path": str(self.operational), "sha256": sha(self.operational)},
                "candidates": candidates or [self.npm_candidate(), self.output_candidate()]}

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
        parsed, parsed_entries = MODULE._disposition_manifest({
            "path": str(manifest_path), "sha256": MODULE.DISPOSITION_MANIFEST_SHA256,
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
        self.assertEqual(observed["detail"]["leafCount"], 2)

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
        patch_values = dict(
            ROOT=fixture["control"], PREPARATIONS_ROOT=self.preparations,
            RELEASES_ROOT=self.releases,
            DISPOSITION_MANIFEST_PATH=fixture["manifest"],
            DISPOSITION_MANIFEST_SHA256=sha(fixture["manifest"]),
            DISPOSITION_ID="fixture-disposition-v1")
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch():
            MODULE.audit_request(self.request, sha(self.request), self.plan)
            MODULE.prepare_plan(self.plan, sha(self.plan), self.intent,
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
        with mock.patch.multiple(MODULE, **patch_values), self.process_patch():
            result = MODULE.execute_intent(self.intent, sha(self.intent), authorization,
                                           sha(authorization), receipt)
        self.assertEqual(result["state"], "COMPLETED")
        self.assertTrue(all(not path.exists() for path in fixture["paths"]))
        self.assertTrue(all(Path(entry["authority"]).exists() for entry in fixture["entries"]))
        events = [json.loads(line) for line in
                  (receipt / "command-journal.private.jsonl").read_text().splitlines()]
        self.assertEqual(sum(item["event"] == "VERIFIED" for item in events),
                         result["completedCommands"])

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

    def test_sigterm_leaves_bounded_registry_residue_and_supervisor_records_terminal(self):
        root = self.base / "signal-registry"
        root.mkdir(mode=0o700)
        scratch = root / "scratch"
        scratch.mkdir(mode=0o700)
        ready = root / "ready.json"
        supervisor = TOOL.with_name("capacity-recovery-supervisor.py")

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
        harness = root / "supervisor-harness.py"
        harness.write_text(r'''
import importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("supervisor",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
child=[sys.executable,"-B","-c",sys.argv[2],sys.argv[3],sys.argv[4],sys.argv[5]]
m.executor_argv=lambda _args:child
sys.argv=["supervisor","--stdout-output",sys.argv[6],"--stderr-output",sys.argv[7],"--terminal-output",sys.argv[8],"--telemetry-output",sys.argv[9],"--supervisor-telemetry-output",sys.argv[10],"prepare","--plan","/synthetic-plan","--plan-sha256","0"*64,"--intent-output","/synthetic-intent","--commands-output","/synthetic-commands","--manifest-output","/synthetic-manifest"]
m.main()
''')
        stdout = root / "stdout"
        stderr = root / "stderr"
        terminal = root / "terminal.json"
        child_telemetry = root / "child.jsonl"
        supervisor_telemetry = root / "supervisor.jsonl"
        process = subprocess.Popen([
            sys.executable, "-B", str(harness), str(supervisor), child_source,
            str(TOOL), str(scratch), str(ready), str(stdout), str(stderr),
            str(terminal), str(child_telemetry), str(supervisor_telemetry),
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

        terminal_row = json.loads(terminal.read_text())
        supervisor_rows = [json.loads(line) for line in supervisor_telemetry.read_text().splitlines()]
        self.assertEqual(terminal_row["state"], "TERMINAL")
        self.assertEqual(terminal_row["exitCode"], -signal.SIGTERM)
        self.assertEqual(terminal_row["signal"], signal.SIGTERM)
        self.assertEqual([row["phase"] for row in supervisor_rows],
                         ["before_child", "signal_received", "after_child"])
        self.assertGreater(terminal_row["childRssPeakBytes"], 0)
        print("SIGNAL_REGISTRY_RESIDUE=" + json.dumps({
            "supervisorExitCode": process.returncode,
            "childExitCode": terminal_row["exitCode"],
            "childSignal": terminal_row["signal"],
            "directoryMode": residue["mode"],
            "databaseMode": oct(stat.S_IMODE(database_info.st_mode)),
            "databaseLogicalBytes": database_info.st_size,
            "databasePhysicalBytes": database_info.st_blocks * 512,
            "distinctNames": residue["distinctNames"],
            "boundedByBytes": MODULE.NAME_REGISTRY_MAX_BYTES,
            "supervisorPhases": [row["phase"] for row in supervisor_rows],
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
