#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

TOOL = Path(__file__).resolve().parents[1] / "capacity-recovery.py"
SPEC = importlib.util.spec_from_file_location("capacity_recovery", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, sort_keys=True))
    path.chmod(0o600)


def scan(targets=None, writers=None, complete=True, **summary):
    counts = {"deployProcessesInspected": 0, "otherProcessesInspected": 0,
              "permissionLimitedOtherProcesses": 0, "kernelThreadsIgnored": 0,
              "vanishedProcesses": 0, "identityFailures": 0}
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

    def request_value(self, candidates=None, minimum=1):
        return {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUDIT_REQUEST",
                "minimumRecoveryBytes": minimum, "targetAvailableBytes": minimum,
                "rootPolicy": {"path": str(self.policy), "sha256": sha(self.policy)},
                "operationalState": {"path": str(self.operational), "sha256": sha(self.operational)},
                "candidates": candidates or [self.npm_candidate(), self.output_candidate()]}

    def process_patch(self, *, targets=None, writers=None, complete=True):
        return mock.patch.object(MODULE, "_proc_targets",
                                 return_value=scan(targets, writers, complete))

    def fake_process(self, proc_root, pid, uid, arguments, *, start_ticks=100,
                     inaccessible_cmdline=False, include_maps=True):
        process = proc_root / str(pid)
        (process / "fd").mkdir(parents=True)
        (process / "status").write_text(f"Name:\tfixture\nUid:\t{uid}\t{uid}\t{uid}\t{uid}\n")
        suffix = ["S", *("0" for _ in range(18)), str(start_ticks), "0"]
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
                mock.patch.object(MODULE, "deploy_identity", return_value=(os.geteuid(), os.getegid())), \
                mock.patch.object(MODULE, "deploy_group_principals", return_value=["deploy"]), \
                self.process_patch():
            return MODULE.audit_request(self.request, sha(self.request), self.plan)

    def prepare(self):
        with mock.patch.object(MODULE, "NPM_CACHE", self.cache), \
                mock.patch.object(MODULE, "NPM_PARENT", self.cache_parent), \
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
        other_uid = 0 if os.geteuid() != 0 else 1
        self.fake_process(proc_root, 45, other_uid, [])
        _, _, complete, summary = MODULE._proc_targets(proc_root, deploy_uid=os.geteuid())
        self.assertTrue(complete)
        self.assertEqual(summary["kernelThreadsIgnored"], 1)

    def test_recycled_pid_is_denied(self):
        proc_root = self.base / "proc-recycled"
        self.fake_process(proc_root, 46, os.geteuid(), ["/usr/bin/node", "service.js"])
        with mock.patch.object(MODULE, "_read_start_ticks", side_effect=[100, 101]):
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

    def seal_and_authorize(self):
        self.audit(); self.prepare()
        intent_sha = sha(self.intent)
        intent = json.loads(self.intent.read_text())
        authorization = self.base / "authorization.private.json"
        private_json(authorization, {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_AUTHORIZATION",
                    "authorization": "AUTHORIZE_ONCE", "intentSha256": intent_sha,
                    "commandsSha256": intent["commandsSha256"],
                    "paths": [item["path"] for item in intent["candidates"]]})
        return intent_sha, authorization

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
