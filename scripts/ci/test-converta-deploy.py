#!/usr/bin/env python3
"""Behavioral regression suite for the fixed-current API/frontend driver."""

from __future__ import annotations

import dataclasses
import fcntl
import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from typing import Any
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("converta_deploy", ROOT / "scripts/converta-deploy.py")
assert SPEC and SPEC.loader
deploy = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = deploy
SPEC.loader.exec_module(deploy)

RETIREMENT_SPEC = importlib.util.spec_from_file_location(
    "generation_retirement_lock_consumer", ROOT / "scripts/generation-retirement.py")
assert RETIREMENT_SPEC and RETIREMENT_SPEC.loader
retirement = importlib.util.module_from_spec(RETIREMENT_SPEC)
RETIREMENT_SPEC.loader.exec_module(retirement)

CAPACITY_SPEC = importlib.util.spec_from_file_location(
    "capacity_recovery_lock_consumer", ROOT / "scripts/capacity-recovery.py")
assert CAPACITY_SPEC and CAPACITY_SPEC.loader
capacity = importlib.util.module_from_spec(CAPACITY_SPEC)
CAPACITY_SPEC.loader.exec_module(capacity)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def put(path: Path, value: Any, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(mode)


def release_index(root: Path) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for runtime_name in deploy.RUNTIME_DIR.values():
        runtime = root / runtime_name
        for path in (runtime, *sorted(runtime.rglob("*"))):
            info = path.lstat()
            item: dict[str, Any] = {
                "path": path.relative_to(root).as_posix(),
                "mode": stat.S_IMODE(info.st_mode),
            }
            if path.is_symlink():
                item.update(type="symlink", target=os.readlink(path))
            elif path.is_dir():
                item["type"] = "directory"
            else:
                item.update(type="file", size=info.st_size, sha256=sha(path))
            entries.append(item)
    return {"schemaVersion": 1, "scope": list(deploy.RUNTIME_DIR.values()), "entries": entries}


class FakeHost(deploy.Host):
    def __init__(self, control_plane: str, node: Path):
        self.control_plane = control_plane
        self.node = node.resolve()
        self.rows: dict[str, dict[str, Any]] = {}
        self.process_cwds: dict[int, Path] = {}
        self.events: list[str] = []
        self.dump: Path | None = None
        self.next_pid = 100
        self.wait_fail: str | None = None
        self.wait_samples = 3
        self.restart_drift: tuple[str, str] | None = None
        self.worker_drift = False
        self.save_calls = 0
        self.retirement_calls = 0
        self.retirement_pass_fds: tuple[int, ...] = ()
        self.retirement_environment: dict[str, str] | None = None
        self.retirement_command: list[str] = []

    def run(self, command: list[str], *, timeout: float = 40,
            pass_fds: tuple[int, ...] = (),
            env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        if command[:4] == ["git", "-C", str(ROOT), "rev-parse"]:
            return subprocess.CompletedProcess(command, 0, self.control_plane + "\n", "")
        if command[:4] == ["git", "-C", str(ROOT), "status"]:
            return subprocess.CompletedProcess(command, 0, "", "")
        if command[-1:] == ["--version"]:
            return subprocess.CompletedProcess(command, 0, "6.0.14\n", "")
        if len(command) > 3 and command[2] == "execute" and "--intent" in command:
            self.retirement_calls += 1
            self.retirement_pass_fds = pass_fds
            self.retirement_environment = env
            self.retirement_command = list(command)
            receipt_root = Path(command[command.index("--receipt-root") + 1])
            receipt_root.mkdir(mode=0o700)
            receipt = receipt_root / "execution-receipt.private.json"
            intent_sha = command[command.index("--intent-sha256") + 1]
            put(receipt, {"state": "DEPLOYED_SANITIZED", "intentSha256": intent_sha})
            return subprocess.CompletedProcess(command, 0, json.dumps({
                "result": "DEPLOYED_SANITIZED", "receiptSha256": sha(receipt),
            }) + "\n", "")
        return subprocess.CompletedProcess(command, 0, "", "")

    def get(self, url: str, timeout: float = 10) -> int:
        self.events.append("GET:" + url)
        return 200

    def api_health(self, url: str, timeout: float = 10) -> tuple[int, str, dict[str, Any]]:
        self.events.append("HEALTH:" + url)
        return 200, "application/json", {"ok": True, "db": "ok"}

    def pm2_rows(self, pm2: Path) -> list[dict[str, Any]]:
        return list(self.rows.values())

    def pm2_mutate(self, pm2: Path, args: list[str]) -> None:
        self.events.append("PM2:" + " ".join(args))
        if args == ["save"]:
            assert self.dump is not None
            self.save_calls += 1
            put(self.dump, list(self.rows.values()))
            self.events.append("DUMP:SAVED")
            return
        if len(args) != 2 or args[0] != "restart" or "--update-env" in args:
            raise AssertionError(f"unexpected PM2 mutation: {args}")
        name = args[1]
        row = self.rows[name]
        old_pid = row["pid"]
        self.next_pid += 1
        row["pid"] = self.next_pid
        row["pm2_env"]["restart_time"] += 1
        self.process_cwds.pop(old_pid, None)
        stable = Path(row["pm2_env"]["pm_cwd"])
        self.process_cwds[self.next_pid] = stable.resolve()
        if self.restart_drift and self.restart_drift[0] == name:
            field = self.restart_drift[1]
            if field == "env":
                row["pm2_env"]["NODE_ENV"] = "drift"
            elif field == "cwd":
                row["pm2_env"]["pm_cwd"] = str(stable.parent)
            elif field == "script":
                row["pm2_env"]["pm_exec_path"] = str(stable / "unexpected.js")
            else:
                row["pm2_env"][field] = ["drift"]
        if self.worker_drift:
            worker = self.rows[deploy.PROCESS_NAMES["worker"]]
            worker["pm2_env"]["restart_time"] += 1

    def process_cwd(self, pid: int) -> Path:
        return self.process_cwds[pid]

    def process_exe(self, pid: int) -> Path:
        return self.node

    def control_evidence(self, root: Path, args: list[str], *, report: Path,
                         stdout: Path, stderr: Path) -> dict[str, Any]:
        assert args[0] == "wait-existing-readiness"
        component = args[args.index("--component") + 1]
        release_id = args[args.index("--release-id") + 1]
        phase = report.name.removesuffix(".report.private.json")
        self.events.append(f"WAIT:{phase}:{component}:{release_id}")
        row = self.rows[deploy.PROCESS_NAMES[component]]
        samples = [{"ordinal": number + 1, "result": "stable"}
                   for number in range(self.wait_samples)]
        if self.wait_fail == component and phase.startswith("activate-"):
            value = {"result": "READINESS_DENY", "component": component,
                     "reason": f"READINESS_TIMEOUT:{component}:{deploy.PORT[component]}",
                     "sampleCount": len(samples), "samples": samples}
            put(report, value)
            deploy.atomic_private_bytes(stdout, b"")
            deploy.atomic_private_bytes(stderr, value["reason"].encode() + b"\n")
            raise deploy.Denied(value["reason"])
        value = {"result": "READINESS_PASS", "component": component,
                 "pid": row["pid"], "startTicks": row["pid"] * 100,
                 "restartCount": row["pm2_env"]["restart_time"],
                 "stableSamples": 3, "sampleCount": len(samples), "samples": samples,
                 "socketOwnerRelation": "DIRECT", "releaseId": release_id}
        put(report, value)
        deploy.atomic_private_bytes(stdout, (json.dumps(value) + "\n").encode())
        deploy.atomic_private_bytes(stderr, b"")
        return value


class FixtureDriver(deploy.Driver):
    failpoints: set[str]

    def _ticks(self, pid: int) -> int:
        return pid * 100

    def _failpoint(self, name: str) -> None:
        if name in self.failpoints:
            self.failpoints.remove(name)
            raise deploy.Denied(f"injected:{name}")


class DeployFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.releases = self.base / "releases"
        self.current = self.base / "current"
        self.current.mkdir()
        self.transaction = self.base / "transaction"
        self.candidate = "immutable-candidate"
        self.rollback = "immutable-rollback"
        self.target = "a" * 40
        self.control_plane = "b" * 40
        self.node = self.base / "node"
        self.node.write_text("node\n"); self.node.chmod(0o755)
        self.pm2 = self.base / "pm2"
        self.pm2.write_text("pm2\n"); self.pm2.chmod(0o755)
        self.dump = self.base / "dump.pm2"
        self.lock = self.base / "deploy.lock"
        self.stable = {component: self.current / component for component in deploy.COMPONENTS}
        self._release(self.rollback, "rollback-build", "c" * 40)
        self._release(self.candidate, "candidate-build", self.target)
        for component in deploy.COMPONENTS:
            os.symlink(self.releases / self.rollback / deploy.RUNTIME_DIR[component], self.stable[component])
        self.worker = self.base / "worker"
        self.worker.mkdir()
        (self.worker / "index.js").write_text("worker\n")
        self.host = FakeHost(self.control_plane, self.node)
        self.host.dump = self.dump
        self.host.rows = {
            deploy.PROCESS_NAMES["api"]: self._row("api", 11),
            deploy.PROCESS_NAMES["frontend"]: self._row("frontend", 12),
            deploy.PROCESS_NAMES["worker"]: self._row("worker", 13),
        }
        self.host.process_cwds = {
            row["pid"]: Path(row["pm2_env"]["pm_cwd"]).resolve()
            for row in self.host.rows.values()
        }
        put(self.dump, list(self.host.rows.values()))
        self.runtime_manifest = self.base / "runtime-manifest.private.json"
        rollback_root = self.releases / self.rollback
        rollback_common = {
            "releaseId": self.rollback,
            "manifestSha256": sha(rollback_root / "manifest.json"),
            "indexSha256": sha(rollback_root / "index.sha256"),
        }
        put(self.runtime_manifest, {
            "schemaVersion": 1,
            "mode": "fixed-current-existing-pm2",
            "controlPlaneSha": self.control_plane,
            "pm2Version": "6.0.14",
            "environmentAllowlistSha256": sha(ROOT / "scripts/pm2-definition-env-allowlist.v1.json"),
            "processes": deploy.PROCESS_NAMES,
            "rollbackReleases": {
                "api": {**rollback_common,
                        "entrySha256": sha(rollback_root / "api-runtime/dist/index.js")},
                "frontend": {**rollback_common,
                             "entrySha256": sha(rollback_root / "frontend-runtime/node_modules/next/dist/bin/next"),
                             "buildId": "rollback-build"},
            },
        })
        retirement_paths: dict[str, Path] = {}
        for name in ("tool", "intent", "authorization", "operational", "policy"):
            path = self.base / f"{name}.private.json"
            put(path, {"name": name}, 0o644 if name == "policy" else 0o600)
            retirement_paths[name] = path
        self.generation_contract = self.base / "generation-artifacts.private.json"
        put(self.generation_contract, {
            "schemaVersion": 1, "generationId": self.candidate,
            "releaseId": self.candidate, "targetCommit": self.target, "state": "COMPLETE",
            "writerLockPath": str(self.base / ".generation-build.lock"),
            "classes": ["PRIVATE_DATA_NEVER_RETIRE"], "artifacts": [],
            "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE",
            "privateDataOverlay": {
                "path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
                "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
            },
        })
        put(retirement_paths["intent"], {"contractSha256": sha(self.generation_contract)})
        put(retirement_paths["operational"], {
            "observations": {
                "currentLinks": [{"path": str(path), "target": str(path.resolve())}
                                 for path in self.stable.values()],
                "pm2": {"fingerprintSha256": FixtureDriver._retirement_pm2_fingerprint(
                    list(self.host.rows.values()))},
                "dump": {"path": str(self.dump), "sha256": sha(self.dump)},
                "releaseGraph": {"path": str(self.dump), "sha256": sha(self.dump)},
            },
            "activeReleases": [self.rollback], "rollbackReleases": [],
            "transitiveReturnReleases": [], "candidateReleases": [self.candidate],
            "installedVerifiedReleases": [self.candidate], "supersededCandidates": [],
        })
        self.retirement = deploy.RetirementBinding(
            retirement_paths["tool"], sha(retirement_paths["tool"]),
            retirement_paths["intent"], sha(retirement_paths["intent"]),
            retirement_paths["authorization"], sha(retirement_paths["authorization"]),
            retirement_paths["operational"], sha(retirement_paths["operational"]),
            retirement_paths["policy"], sha(retirement_paths["policy"]),
            self.base / "retirement-receipt", self.base / "generation-review.private.json", self.lock,
        )
        self.inputs = deploy.Inputs(
            self.candidate, self.target, self.control_plane, deploy.COMPONENTS,
            self.runtime_manifest, self.transaction, sha(self.runtime_manifest), self.retirement,
        )
        self.driver = self._driver()

    def tearDown(self) -> None:
        try:
            os.close(deploy.EXTERNAL_LOCK_FD)
        except OSError:
            pass
        self.temporary.cleanup()

    def _driver(self) -> FixtureDriver:
        driver = FixtureDriver(
            self.inputs, host=self.host, repo=ROOT, releases=self.releases,
            stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2,
            clock=lambda: 1234567890.0,
        )
        driver.failpoints = set()
        return driver

    def terminal_retirement_sentinel(self) -> tuple[Path, bytes]:
        """Bind a real canonical closure to a removed synthetic release sentinel."""
        control = self.base / "retirement-control"
        control.mkdir()
        tool = control / "generation-retirement.py"
        dependency = control / "preparation_artifact_lifecycle.py"
        tool.write_bytes((ROOT / "scripts/generation-retirement.py").read_bytes())
        dependency.write_bytes((ROOT / "scripts/preparation_artifact_lifecycle.py").read_bytes())
        tool.chmod(0o600); dependency.chmod(0o600)
        release = "immutable-retired-sentinel"
        target = "d" * 40
        removed = self.releases / release
        contract = self.base / "retired-generation-artifacts.private.json"
        lifecycle = self.base / "retired-generation-lifecycle.private.json"
        intent = self.base / "retired-intent.private.json"
        journal = self.base / "retired-journal.private.jsonl"
        receipt = self.base / "retired-receipt.private.json"
        review = self.base / "retired-review.private.json"
        put(contract, {"schemaVersion": 1, "generationId": release,
                       "releaseId": release, "targetCommit": target})
        put(lifecycle, {"schemaVersion": 1, "generationId": release,
                        "targetCommit": target, "state": "COMPLETE"})
        command = {"ordinal": 1, "path": str(removed),
                   "argv": ["/usr/bin/rm", "-r", "--", str(removed)]}
        put(intent, {"schemaVersion": 3, "generationId": release,
                     "releaseId": release, "targetCommit": target,
                     "contractSha256": sha(contract), "lifecycleSha256": sha(lifecycle),
                     "reconciliation": {"chain": [], "completed": [],
                                        "subordinateAbsences": []},
                     "artifacts": [], "commands": [command]})
        events = [
            {"event": "ATTEMPT", "ordinal": 1, "path": str(removed),
             "argv": command["argv"]},
            {"event": "RESULT", "ordinal": 1, "exitCode": 0},
            {"event": "VERIFIED", "ordinal": 1, "absent": True},
        ]
        journal.write_text("".join(json.dumps(event, sort_keys=True,
                                                separators=(",", ":")) + "\n"
                                   for event in events))
        journal.chmod(0o600)
        put(receipt, {"state": "SANITIZED", "intentSha256": sha(intent),
                      "commandLogSha256": sha(journal), "attemptedCommands": 1,
                      "completedCommands": 1, "removedPaths": [str(removed)],
                      "subordinateAbsences": []})
        put(review, {"schemaVersion": 2, "generationId": release,
                     "lifecycleSha256": sha(lifecycle), "state": "SANITIZED",
                     "evidenceSha256": sha(receipt)})
        closure = {"kind": "CANONICAL_RETIREMENT", "chain": [{
            "intent": {"path": str(intent), "sha256": sha(intent)},
            "receipt": {"path": str(receipt), "sha256": sha(receipt)},
            "journal": {"path": str(journal), "sha256": sha(journal)},
        }]}
        manifest = self.base / "retirement-sentinel-closure.private.json"
        put(manifest, {
            "schemaVersion": 1, "kind": "TERMINAL_GENERATION_RETIREMENT_SENTINEL_V1",
            "releaseId": release, "targetCommit": target, "removedPath": str(removed),
            "sentinelIntentSha256": sha(intent),
            "contract": {"path": str(contract), "sha256": sha(contract)},
            "lifecycle": {"path": str(lifecycle), "sha256": sha(lifecycle)},
            "review": {"path": str(review), "sha256": sha(review)},
            "closure": closure,
        })
        retirement_binding = dataclasses.replace(
            self.retirement, tool=tool, tool_sha256=sha(tool))
        self.inputs = dataclasses.replace(
            self.inputs, retirement=retirement_binding,
            retirement_sentinel_closure=deploy.RetirementSentinelClosureBinding(
                manifest, sha(manifest)))
        self.retirement = retirement_binding
        self.driver = self._driver()
        sentinel = (sha(intent) + "\n").encode()
        self.lock.write_bytes(sentinel); self.lock.chmod(0o600)
        return manifest, sentinel

    def _release(self, release: str, build_id: str, target: str) -> None:
        root = self.releases / release
        api = root / "api-runtime"
        frontend = root / "frontend-runtime"
        (api / "dist").mkdir(parents=True)
        (api / "dist/index.js").write_text("api\n")
        (frontend / "node_modules/next/dist/bin").mkdir(parents=True)
        (frontend / "node_modules/next/dist/bin/next").write_text("next\n")
        (frontend / ".next/static/chunks").mkdir(parents=True)
        (frontend / ".next/BUILD_ID").write_text(build_id + "\n")
        (frontend / ".next/static/chunks/app.js").write_text("asset\n")
        put(root / "index.sha256", release_index(root), 0o444)
        put(root / "manifest.json", {
            "targetCommit": target, "components": ["api", "frontend"],
            "indexSha256": sha(root / "index.sha256"),
            "runtimes": {
                "api": {"entrySha256": sha(api / "dist/index.js")},
                "frontend": {"buildId": build_id},
            },
        }, 0o444)

    def _row(self, component: str, pid: int) -> dict[str, Any]:
        if component == "worker":
            name = deploy.PROCESS_NAMES[component]
            cwd = self.worker
            script = cwd / "index.js"
            args: list[str] = []
        else:
            name = deploy.PROCESS_NAMES[component]
            cwd = self.stable[component]
            relative = "dist/index.js" if component == "api" else "node_modules/next/dist/bin/next"
            script = cwd / relative
            args = [] if component == "api" else ["start", "-p", "3000"]
        env = {
            "status": "online", "pm_cwd": str(cwd), "pm_exec_path": str(script),
            "exec_interpreter": str(self.node), "args": args, "node_args": [],
            "exec_mode": "fork_mode", "instances": 1, "namespace": "converta",
            "out_file": str(self.base / f"{component}.out.log"),
            "error_file": str(self.base / f"{component}.err.log"),
            "merge_logs": True, "restart_time": 0, "NODE_ENV": "production",
        }
        return {"name": name, "pid": pid, "pm2_env": env}

    def acceptance(self) -> None:
        self.driver.acceptance.write_text("ACEITE TÉCNICO PASS\n")
        self.driver.acceptance.chmod(0o600)

    def api_only(self) -> FixtureDriver:
        self.inputs = dataclasses.replace(self.inputs, components=("api",))
        self.driver = self._driver()
        return self.driver

    def external_lock(self, path: Path | None = None, *, held: bool = True) -> int:
        source = path or self.lock
        fd = os.open(source, os.O_RDWR | os.O_NOFOLLOW)
        if held:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if fd != deploy.EXTERNAL_LOCK_FD:
            os.dup2(fd, deploy.EXTERNAL_LOCK_FD, inheritable=True)
            os.close(fd)
        else:
            os.set_inheritable(fd, True)
        return deploy.EXTERNAL_LOCK_FD

    def legacy_overlay_finalize(self) -> tuple[FixtureDriver, Path, dict[str, Any]]:
        overlay = self.releases / self.candidate / "api-runtime/.data"
        overlay.mkdir(mode=0o755)
        (overlay / "state.json").write_text("before\n")
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        acceptance_sha = sha(driver.acceptance)

        contract = json.loads(self.generation_contract.read_text())
        contract.pop("privateDataOverlay")
        put(self.generation_contract, contract)
        contract_sha = sha(self.generation_contract)
        put(self.retirement.intent, {"contractSha256": contract_sha})
        self.retirement = replace(self.retirement, intent_sha256=sha(self.retirement.intent))
        self.inputs = replace(self.inputs, retirement=self.retirement)

        journal = json.loads(driver.journal.read_text())
        journal["binding"] = self.inputs.binding()
        journal["preflight"]["release"].pop("privateDataOverlay", None)
        journal["state"] = "FAILED"
        journal["failure"] = "private_data_contract_overlay_missing"
        journal["recoveryAction"] = "finalize"
        journal["saveCount"] = 0
        put(driver.journal, journal)

        info = overlay.lstat()
        manifest = self.base / "private-data-reconciliation.private.json"
        put(manifest, {
            "schemaVersion": 1,
            "kind": deploy.PRIVATE_DATA_RECONCILIATION_KIND,
            "releaseId": self.candidate,
            "targetCommit": self.target,
            "contractSha256": contract_sha,
            "retirementIntentSha256": self.retirement.intent_sha256,
            "transactionRoot": str(self.transaction),
            "overlay": {
                "path": "api-runtime/.data",
                "classification": "PRIVATE_DATA_NEVER_RETIRE",
                "state": "ACTIVE_DEPENDENCY",
                "rootIdentity": {"device": info.st_dev, "inode": info.st_ino},
                "ownerUid": info.st_uid, "groupGid": info.st_gid,
                "mode": stat.S_IMODE(info.st_mode),
            },
            "requiredContinuation": {
                "state": "FAILED", "recoveryAction": "finalize",
                "acceptanceSha256": acceptance_sha, "saveCount": 0,
            },
        })
        self.inputs = replace(
            self.inputs, private_data_reconciliation=manifest,
            private_data_reconciliation_sha256=sha(manifest),
        )
        self.driver = self._driver()
        constants = {
            "LEGACY_0FDEC_RELEASE": self.candidate,
            "LEGACY_0FDEC_TARGET": self.target,
            "LEGACY_0FDEC_CONTRACT_SHA256": contract_sha,
            "LEGACY_0FDEC_RETIREMENT_INTENT_SHA256": self.retirement.intent_sha256,
            "LEGACY_0FDEC_TRANSACTION": self.transaction,
        }
        return self.driver, manifest, constants


class DriverTests(DeployFixture):
    def test_existing_empty_free_lock_is_adopted_and_terminally_released(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        original = self.lock.stat()
        self.driver.preflight()
        self.driver.activate()
        adopted = self.lock.stat()
        self.assertEqual((adopted.st_dev, adopted.st_ino),
                         (original.st_dev, original.st_ino))
        expected = deploy.FIXED_CURRENT_LOCK_PREFIX + hashlib.sha256(json.dumps(
            self.driver._journal_read()["binding"], sort_keys=True).encode()).hexdigest().encode() + b"\n"
        self.assertEqual(self.lock.read_bytes(), expected)
        self.assertEqual(self.driver._journal_read()["lockDigest"], sha(self.lock))
        self.acceptance()
        self.driver.finalize()
        self.assertEqual(self.driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertFalse(self.lock.exists())

    def test_existing_empty_occupied_lock_denies_before_operational_effects(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        fd = os.open(self.lock, os.O_RDWR | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            self.driver.preflight()
            with self.assertRaisesRegex(deploy.Denied, "global_lock_active"):
                self.driver.activate()
        finally:
            os.close(fd)
        self.assertEqual(self.lock.read_bytes(), b"")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_existing_empty_lock_inode_replacement_denies_before_operational_effects(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        self.driver.preflight()
        replacement = self.base / "replacement.lock"
        replacement.write_bytes(b"")
        replacement.chmod(0o600)

        def replace_after_observation(name: str) -> None:
            if name == "existing_empty_lock_observed":
                os.replace(replacement, self.lock)

        with patch.object(self.driver, "_failpoint", side_effect=replace_after_observation):
            with self.assertRaisesRegex(deploy.Denied, "global_lock_changed"):
                self.driver.activate()
        self.assertEqual(self.lock.read_bytes(), b"")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_retirement_sentinel_is_authenticated_and_adopted_in_place(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        original = self.lock.stat()
        self.driver.preflight()
        authenticate = self.driver._authenticate_retirement_sentinel_closure

        def prove_flock_scope(raw: bytes) -> dict[str, Any]:
            probe = os.open(self.lock, os.O_RDWR | os.O_NOFOLLOW)
            try:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(probe)
            return authenticate(raw)

        with patch.object(self.driver, "_authenticate_retirement_sentinel_closure",
                          side_effect=prove_flock_scope):
            self.driver.activate()
        adopted = self.lock.stat()
        self.assertEqual((adopted.st_dev, adopted.st_ino),
                         (original.st_dev, original.st_ino))
        self.assertNotEqual(self.lock.read_bytes(), sentinel)
        self.assertTrue(self.lock.read_bytes().startswith(deploy.FIXED_CURRENT_LOCK_PREFIX))
        transition = self.driver._journal_read()["lockTransition"]
        self.assertEqual(transition["state"], "BOUND")
        self.assertEqual(transition["adoptedRetirementSentinel"]["sentinelIntentSha256"],
                         sentinel.decode().strip())

    def test_interrupted_terminal_sentinel_adoption_restores_same_inode_and_bytes(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        original = self.lock.stat()
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_binding_fsync")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_binding_fsync"):
            self.driver.activate()
        self.assertNotEqual(self.lock.read_bytes(), sentinel)
        self.driver.failpoints.clear()
        self.driver.rollback()
        restored = self.lock.stat()
        self.assertEqual((restored.st_dev, restored.st_ino),
                         (original.st_dev, original.st_ino))
        self.assertEqual(self.lock.read_bytes(), sentinel)
        journal = self.driver._journal_read()
        self.assertEqual(journal["rollback"]["result"], "RETIREMENT_SENTINEL_RESTORED")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_sentinel_recovers_pending_before_first_write(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        original = self.lock.stat()
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_transition_pending")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_transition_pending"):
            self.driver.activate()
        pending = self.driver._journal_read()
        self.assertEqual(pending["lockTransition"]["state"], "PENDING")
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.driver.failpoints.clear()
        self.driver.rollback()
        restored = self.lock.stat()
        self.assertEqual((restored.st_dev, restored.st_ino),
                         (original.st_dev, original.st_ino))
        self.assertEqual(self.lock.read_bytes(), sentinel)
        recovered = self.driver._journal_read()
        self.assertEqual(recovered["lockTransition"]["state"], "ROLLED_BACK")
        self.assertEqual(recovered["rollback"]["result"], "RETIREMENT_SENTINEL_RESTORED")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_sentinel_recovers_interrupted_restoration(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        original = self.lock.stat()
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_binding_fsync")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_binding_fsync"):
            self.driver.activate()
        self.driver.failpoints.clear()
        self.driver.failpoints.add("after_lock_sentinel_restore_fsync")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_sentinel_restore_fsync"):
            self.driver.rollback()
        interrupted = self.lock.stat()
        self.assertEqual((interrupted.st_dev, interrupted.st_ino),
                         (original.st_dev, original.st_ino))
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.assertNotEqual(self.driver._journal_read()["lockTransition"]["state"], "ROLLED_BACK")
        self.driver.failpoints.clear()
        self.driver.rollback()
        recovered = self.driver._journal_read()
        self.assertEqual(recovered["lockTransition"]["state"], "ROLLED_BACK")
        self.assertEqual(recovered["rollback"]["result"], "RETIREMENT_SENTINEL_RESTORED")
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.assertEqual((self.lock.stat().st_dev, self.lock.stat().st_ino),
                         (original.st_dev, original.st_ino))
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_sentinel_pending_recovery_rejects_unknown_content(self) -> None:
        self.terminal_retirement_sentinel()
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_transition_pending")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_transition_pending"):
            self.driver.activate()
        self.lock.write_bytes(b"unknown-retirement-sentinel\n")
        self.driver.failpoints.clear()
        with self.assertRaisesRegex(deploy.Denied, "global_lock_recovery_content"):
            self.driver.rollback()
        self.assertEqual(self.lock.read_bytes(), b"unknown-retirement-sentinel\n")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_retirement_sentinel_drift_denies_before_operational_effects(self) -> None:
        manifest, sentinel = self.terminal_retirement_sentinel()
        original = self.lock.stat()
        value = json.loads(manifest.read_text())
        receipt = Path(value["closure"]["chain"][-1]["receipt"]["path"])
        receipt.write_bytes(receipt.read_bytes() + b"\n")
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "retirement_sentinel_closure"):
            self.driver.activate()
        current = self.lock.stat()
        self.assertEqual((current.st_dev, current.st_ino),
                         (original.st_dev, original.st_ino))
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_retirement_sentinel_without_binding_denies(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        self.inputs = dataclasses.replace(self.inputs, retirement_sentinel_closure=None)
        self.driver = self._driver()
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "retirement_sentinel_closure_required"):
            self.driver.activate()
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_terminal_retirement_sentinel_occupied_or_crossed_closure_denies(self) -> None:
        _, sentinel = self.terminal_retirement_sentinel()
        self.driver.preflight()
        fd = os.open(self.lock, os.O_RDWR | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with self.assertRaisesRegex(deploy.Denied, "global_lock_active"):
                self.driver.activate()
        finally:
            os.close(fd)
        self.assertEqual(self.lock.read_bytes(), sentinel)
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

        # A different terminal intent cannot consume the authenticated closure.
        self.transaction.unlink(missing_ok=True) if self.transaction.is_file() else None
        if self.transaction.is_dir():
            for child in self.transaction.iterdir():
                child.unlink()
            self.transaction.rmdir()
        self.lock.write_bytes(("e" * 64 + "\n").encode())
        self.driver = self._driver()
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "retirement_sentinel_content"):
            self.driver.activate()
        self.assertEqual(self.lock.read_bytes(), ("e" * 64 + "\n").encode())
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_existing_lock_with_unexpected_content_denies_before_operational_effects(self) -> None:
        self.lock.write_text("unexpected\n")
        self.lock.chmod(0o600)
        original = self.lock.read_bytes()
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "global_lock_active"):
            self.driver.activate()
        self.assertEqual(self.lock.read_bytes(), original)
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_adopted_lock_excludes_second_driver_acquisition_during_acceptance_window(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        self.driver.preflight()
        self.driver.activate()
        restarts = [event for event in self.host.events if event.startswith("PM2:")]
        second_inputs = dataclasses.replace(
            self.inputs, transaction_root=self.base / "second-transaction")
        second = FixtureDriver(
            second_inputs, host=self.host, repo=ROOT, releases=self.releases,
            stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2,
            clock=lambda: 1234567890.0,
        )
        second.failpoints = set()
        with self.assertRaisesRegex(deploy.Denied, "global_lock_active"):
            second._acquire_lock({"binding": second.inputs.binding()})
        with self.assertRaisesRegex(retirement.Denied, "lock_bound_fixed_current"):
            retirement.acquire_existing_lock(self.lock)
        with self.assertRaisesRegex(capacity.Denied, "LOCK_BOUND_FIXED_CURRENT"):
            capacity.acquire_lock(self.lock)
        self.assertEqual([event for event in self.host.events if event.startswith("PM2:")],
                         restarts)
        self.assertEqual(self.driver._journal_read()["state"], "AWAITING_ACCEPTANCE")

    def test_failure_after_adoption_has_durable_zero_effect_rollback(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        original = self.lock.stat()
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_binding_fsync")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_binding_fsync"):
            self.driver.activate()
        current = self.lock.stat()
        self.assertEqual((current.st_dev, current.st_ino),
                         (original.st_dev, original.st_ino))
        expected = deploy.FIXED_CURRENT_LOCK_PREFIX + hashlib.sha256(json.dumps(
            self.driver._journal_read()["binding"], sort_keys=True).encode()).hexdigest().encode() + b"\n"
        self.assertEqual(self.lock.read_bytes(), expected)
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "ACTIVATING")
        self.assertEqual(journal["lockTransition"]["state"], "PENDING")
        self.assertEqual(journal["lockDigest"], sha(self.lock))
        with self.assertRaisesRegex(deploy.Denied, "activate_state"):
            self.driver.activate()
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))
        self.driver.failpoints.clear()
        self.driver.rollback()
        recovered = self.driver._journal_read()
        self.assertEqual(recovered["state"], "ROLLED_BACK")
        self.assertEqual(recovered["lockTransition"]["state"], "ROLLED_BACK")
        self.assertEqual(recovered["rollback"]["result"], "EMPTY_SENTINEL_RESTORED")
        self.assertEqual(self.lock.read_bytes(), b"")
        self.assertEqual((self.lock.stat().st_dev, self.lock.stat().st_ino),
                         (original.st_dev, original.st_ino))

    def test_adoption_recovery_denies_replaced_lock_identity(self) -> None:
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        self.driver.preflight()
        self.driver.failpoints.add("after_lock_binding_fsync")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_lock_binding_fsync"):
            self.driver.activate()
        original = self.lock
        replacement = self.base / "replacement-bound.lock"
        replacement.write_bytes(original.read_bytes())
        replacement.chmod(0o600)
        os.replace(replacement, original)
        replacement_identity = (original.stat().st_dev, original.stat().st_ino)
        self.driver.failpoints.clear()
        with self.assertRaisesRegex(deploy.Denied, "global_lock_recovery_identity"):
            self.driver.rollback()
        self.assertEqual((original.stat().st_dev, original.stat().st_ino),
                         replacement_identity)
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "FAILED")
        self.assertEqual(journal["recoveryAction"], "rollback")
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))

    def test_api_only_passes_and_preserves_frontend_and_worker(self) -> None:
        driver = self.api_only()
        frontend_before = driver._process_snapshot(
            self.host.rows[deploy.PROCESS_NAMES["frontend"]], "frontend",
            self.stable["frontend"].resolve())
        worker_before = driver._worker(list(self.host.rows.values()))
        frontend_target = os.readlink(self.stable["frontend"])
        driver.preflight(); driver.activate()
        mutations = [event for event in self.host.events if event.startswith("PM2:")]
        self.assertEqual(mutations, ["PM2:restart re7-whatsapp-agent"])
        self.assertEqual(os.readlink(self.stable["frontend"]), frontend_target)
        journal = driver._journal_read()
        self.assertEqual(journal["candidate"]["processes"]["frontend"], frontend_before)
        self.assertEqual(journal["candidate"]["worker"], worker_before)
        self.assertEqual(journal["state"], "AWAITING_ACCEPTANCE")
        self.assertEqual(journal["saveCount"], 0)
        self.assertFalse((driver.release_root / "DEPLOYED").exists())

    def test_api_only_denies_frontend_pid_restart_symlink_or_listener_drift(self) -> None:
        for drift in ("pid", "restart", "symlink", "listener"):
            with self.subTest(drift=drift):
                self.tearDown(); self.setUp()
                driver = self.api_only(); driver.preflight()
                frontend = self.host.rows[deploy.PROCESS_NAMES["frontend"]]
                if drift == "pid":
                    old_pid = frontend["pid"]
                    frontend["pid"] = 98
                    self.host.process_cwds[98] = self.host.process_cwds.pop(old_pid)
                elif drift == "restart":
                    frontend["pm2_env"]["restart_time"] += 1
                elif drift == "symlink":
                    self.stable["frontend"].unlink()
                    os.symlink(self.releases / self.candidate / deploy.RUNTIME_DIR["frontend"],
                               self.stable["frontend"])
                else:
                    self.host.wait_fail = "frontend"
                with self.assertRaises(deploy.Denied):
                    driver.activate()
                self.assertFalse(any("re7-admin-front" in event
                                     for event in self.host.events if event.startswith("PM2:")))
                self.assertEqual(self.host.save_calls, 0)

    def test_api_only_denies_worker_drift_without_restarting_preserved_processes(self) -> None:
        driver = self.api_only(); driver.preflight()
        self.host.rows[deploy.PROCESS_NAMES["worker"]]["pm2_env"]["restart_time"] += 1
        with self.assertRaisesRegex(deploy.Denied, "pre_activation_worker_drift"):
            driver.activate()
        self.assertFalse(any(name in event for event in self.host.events
                             for name in ("re7-admin-front", "re7-whatsapp-web-worker")))

    def test_api_only_delayed_api_listener_passes_after_three_samples(self) -> None:
        driver = self.api_only(); self.host.wait_samples = 7
        driver.preflight(); driver.activate()
        report = json.loads((self.transaction / "activate-api.report.private.json").read_text())
        self.assertEqual(report["stableSamples"], 3)
        self.assertEqual(report["sampleCount"], 7)

    def test_api_only_readiness_failure_rolls_back_only_api(self) -> None:
        driver = self.api_only(); self.host.wait_fail = "api"
        driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "READINESS_TIMEOUT:api:3001"):
            driver.activate()
        mutations = [event for event in self.host.events if event.startswith("PM2:")]
        self.assertEqual(mutations, ["PM2:restart re7-whatsapp-agent",
                                     "PM2:restart re7-whatsapp-agent"])
        self.assertFalse(any("re7-admin-front" in event for event in mutations))
        self.assertEqual(driver._journal_read()["state"], "ROLLED_BACK")

    def test_api_only_finalize_saves_once_validates_all_processes_and_retires(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        driver.finalize()
        journal = driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(journal["components"], ["api"])
        self.assertEqual(journal["saveCount"], 1)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        marker = deploy.read_json(driver.release_root / "DEPLOYED")
        self.assertEqual(marker["components"], ["api"])

    def test_api_only_release_roles_preserve_unaffected_frontend(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate()
        journal = driver._journal_read()
        frontend_release = "immutable-frontend-preserved"
        journal["previous"]["releases"]["frontend"] = frontend_release
        operational = deploy.read_json(self.retirement.operational_state)
        operational["activeReleases"] = [self.rollback, frontend_release]
        put(self.retirement.operational_state, operational)
        binding = dataclasses.replace(
            self.retirement,
            operational_state_sha256=sha(self.retirement.operational_state),
        )
        final_path, _ = driver._retirement_final_operational(binding, journal)
        final = deploy.read_json(final_path)
        self.assertEqual(final["activeReleases"],
                         sorted([self.candidate, frontend_release]))
        self.assertIn(self.rollback, final["rollbackReleases"])
        self.assertNotIn(frontend_release, final["rollbackReleases"])

    def test_external_lock_finalize_passes_fd_to_retirement_and_preserves_lock_file(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        restarts = [event for event in self.host.events if event.startswith("PM2:restart")]
        self.external_lock()
        with patch.dict(os.environ, {deploy.EXTERNAL_LOCK_ENV: "1"}):
            driver.finalize()
        self.assertEqual(driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        self.assertEqual(self.host.retirement_pass_fds, (deploy.EXTERNAL_LOCK_FD,))
        self.assertEqual(self.host.retirement_environment[deploy.EXTERNAL_LOCK_ENV], "1")
        index = self.host.retirement_command.index("--deployment-lock-fd")
        self.assertEqual(self.host.retirement_command[index + 1], str(deploy.EXTERNAL_LOCK_FD))
        self.assertTrue(self.lock.is_file())
        self.assertEqual([event for event in self.host.events if event.startswith("PM2:restart")], restarts)

    def test_external_lock_flag_without_fd_denies_before_save(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        try:
            os.close(deploy.EXTERNAL_LOCK_FD)
        except OSError:
            pass
        with patch.dict(os.environ, {deploy.EXTERNAL_LOCK_ENV: "1"}):
            with self.assertRaisesRegex(deploy.Denied, "external_lock_fd"):
                driver.finalize()
        self.assertEqual(driver._journal_read()["saveCount"], 0)
        self.assertEqual(self.host.save_calls, 0)

    def test_fd9_without_flag_keeps_historical_driver_behavior(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        self.external_lock()
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(deploy.EXTERNAL_LOCK_ENV, None)
            driver.finalize()
        self.assertEqual(driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(self.host.save_calls, 1)
        self.assertFalse(self.lock.exists())

    def test_external_lock_inode_or_unlocked_fd_denies(self) -> None:
        for variant in ("inode", "unlocked"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
                if variant == "inode":
                    other = self.base / "other.lock"; other.write_text(""); other.chmod(0o600)
                    self.external_lock(other)
                    predicate = "external_lock_identity"
                else:
                    self.external_lock(held=False)
                    predicate = "external_lock_not_held"
                with patch.dict(os.environ, {deploy.EXTERNAL_LOCK_ENV: "1"}):
                    with self.assertRaisesRegex(deploy.Denied, predicate):
                        driver.finalize()
                self.assertEqual(driver._journal_read()["saveCount"], 0)
                self.assertEqual(self.host.save_calls, 0)

    def test_external_lock_resume_after_save_does_not_repeat_save(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        self.external_lock(); driver.failpoints.add("after_save")
        with patch.dict(os.environ, {deploy.EXTERNAL_LOCK_ENV: "1"}):
            with self.assertRaisesRegex(deploy.Denied, "injected:after_save"):
                driver.finalize()
            driver.finalize()
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        self.assertTrue(self.lock.is_file())

    def test_contract_without_overlay_is_denied_without_reconciliation(self) -> None:
        contract = json.loads(self.generation_contract.read_text())
        contract.pop("privateDataOverlay")
        put(self.generation_contract, contract)
        put(self.retirement.intent, {"contractSha256": sha(self.generation_contract)})
        self.retirement = replace(self.retirement, intent_sha256=sha(self.retirement.intent))
        self.inputs = replace(self.inputs, retirement=self.retirement)
        with self.assertRaisesRegex(deploy.Denied, "private_data_contract_overlay_missing"):
            self.api_only().preflight()
        reconciliation = self.base / "not-authorized-for-preflight.private.json"
        put(reconciliation, {"schemaVersion": 1})
        self.inputs = replace(
            self.inputs, private_data_reconciliation=reconciliation,
            private_data_reconciliation_sha256=sha(reconciliation),
        )
        self.driver = self._driver()
        with self.assertRaisesRegex(deploy.Denied, "private_data_contract_overlay_missing"):
            self.driver.preflight()
        self.assertEqual(self.host.save_calls, 0)

    def test_0fdec_reconciliation_resumes_finalize_without_repeating_acceptance_or_restart(self) -> None:
        driver, _, constants = self.legacy_overlay_finalize()
        acceptance_sha = sha(driver.acceptance)
        overlay = self.releases / self.candidate / "api-runtime/.data"
        (overlay / "state.json").write_text("after\n")
        restarts = [item for item in self.host.events if item.startswith("PM2:restart")]
        with patch.multiple(deploy, **constants):
            driver.finalize()
        self.assertEqual(sha(driver.acceptance), acceptance_sha)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual([item for item in self.host.events if item.startswith("PM2:restart")], restarts)
        self.assertEqual(driver._journal_read()["state"], "DEPLOYED_SANITIZED")

    def test_0fdec_reconciliation_denies_release_target_contract_or_transaction_drift(self) -> None:
        for field, value in (
                ("releaseId", "immutable-other"),
                ("targetCommit", "f" * 40),
                ("contractSha256", "f" * 64),
                ("transactionRoot", str(self.base / "other-transaction"))):
            with self.subTest(field=field):
                self.tearDown(); self.setUp()
                driver, manifest, constants = self.legacy_overlay_finalize()
                payload = json.loads(manifest.read_text()); payload[field] = value; put(manifest, payload)
                self.inputs = replace(self.inputs, private_data_reconciliation_sha256=sha(manifest))
                driver = self._driver()
                with patch.multiple(deploy, **constants):
                    with self.assertRaisesRegex(deploy.Denied, "private_data_reconciliation_binding"):
                        driver.finalize()
                self.assertEqual(self.host.save_calls, 0)

    def test_0fdec_reconciliation_allows_content_change_but_denies_overlay_identity_change(self) -> None:
        driver, _, constants = self.legacy_overlay_finalize()
        overlay = self.releases / self.candidate / "api-runtime/.data"
        overlay.rename(self.base / "preserved-old-overlay")
        overlay.mkdir(mode=0o755)
        with patch.multiple(deploy, **constants):
            with self.assertRaisesRegex(deploy.Denied, "private_data_reconciliation_overlay_drift"):
                driver.finalize()
        self.assertEqual(self.host.save_calls, 0)

    def test_0fdec_reconciliation_constants_are_closed_to_the_open_transaction(self) -> None:
        self.assertEqual(deploy.LEGACY_0FDEC_RELEASE,
                         "immutable-0fdec8b0-vps-20261028T224726Z")
        self.assertEqual(deploy.LEGACY_0FDEC_TARGET,
                         "0fdec8b026b28acb42c2d95e1fe473b49b6b0a20")
        self.assertEqual(deploy.LEGACY_0FDEC_CONTRACT_SHA256,
                         "f3188049ea87c6f9e9ece01c4698d6e49994a13fe682cc828a0b0fc34e020c0a")
        self.assertEqual(deploy.LEGACY_0FDEC_RETIREMENT_INTENT_SHA256,
                         "edd0eedf0561c3634e369d605d8f94092e95e6e1726625df350a5378cf1b33c3")
        self.assertEqual(str(deploy.LEGACY_0FDEC_TRANSACTION),
                         "/opt/re7online/backups/converta-persistent/deploy-transactions/"
                         "immutable-0fdec8b0-vps-20261028T224726Z-api-only-a23aded8-v1-once")

    def test_private_data_overlay_is_fail_closed_without_relaxing_other_inventory(self) -> None:
        for drift, predicate in (("extra", "release_index_inventory"),
                                 ("symlink", "private_data_overlay_identity"),
                                 ("writable", "private_data_overlay_identity")):
            with self.subTest(drift=drift):
                self.tearDown(); self.setUp()
                root = self.releases / self.candidate
                overlay = root / "api-runtime/.data"
                if drift == "extra":
                    (root / "api-runtime/unindexed.txt").write_text("extra\n")
                elif drift == "symlink":
                    target = root / "api-runtime/private-target"; target.mkdir()
                    overlay.symlink_to(target)
                else:
                    overlay.mkdir(mode=0o775); overlay.chmod(0o775)
                with self.assertRaisesRegex(deploy.Denied, predicate):
                    self.api_only().preflight()
                self.assertEqual(self.host.save_calls, 0)
    def test_api_only_finalize_resume_never_repeats_save_or_retirement(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        driver.failpoints.add("after_save")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_save"):
            driver.finalize()
        driver.finalize()
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)

    def test_api_only_partial_retirement_is_terminal_without_retry(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        original = self.host.run

        def fail_retirement(command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
            if len(command) > 3 and command[2] == "execute" and "--intent" in command:
                self.host.retirement_calls += 1
                return subprocess.CompletedProcess(command, 2, "partial\n", "RETENTION_DENY\n")
            return original(command, timeout=timeout)

        self.host.run = fail_retirement  # type: ignore[method-assign]
        driver.finalize()
        self.assertEqual(driver._journal_read()["state"], "DEPLOYED_RETENTION_INCOMPLETE")
        self.assertEqual(self.host.retirement_calls, 1)

    def test_only_exact_supported_component_sets_are_accepted(self) -> None:
        for components in ((), ("frontend",), ("worker",), ("frontend", "api"),
                           ("api", "worker"), ("api", "frontend", "worker")):
            with self.subTest(components=components):
                self.tearDown(); self.setUp()
                self.inputs = dataclasses.replace(self.inputs, components=components)
                with self.assertRaisesRegex(deploy.Denied, "components_must_be_api_or_api_frontend"):
                    self._driver().preflight()

    def test_preflight_without_bindings_passes_and_authenticates_existing_records(self) -> None:
        self.driver.preflight()
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "PREFLIGHT_PASS")
        self.assertEqual(set(journal["preflight"]["processes"]), {"api", "frontend"})
        self.assertNotIn("definition", self.runtime_manifest.read_text())
        self.assertEqual(len([event for event in self.host.events if event.startswith("WAIT:preflight")]), 2)

    def test_activation_restarts_api_before_frontend_without_delete_start_or_update_env(self) -> None:
        self.driver.preflight(); self.driver.activate()
        mutations = [event for event in self.host.events if event.startswith("PM2:")]
        self.assertEqual(mutations, ["PM2:restart re7-whatsapp-agent",
                                     "PM2:restart re7-admin-front"])
        self.assertFalse(any(event.startswith(("PM2:delete ", "PM2:start "))
                             or "--update-env" in event for event in mutations))
        self.assertEqual(self.driver._journal_read()["state"], "AWAITING_ACCEPTANCE")

    def test_drift_of_args_environment_cwd_or_script_is_denied(self) -> None:
        for field in ("args", "env", "cwd", "script"):
            with self.subTest(field=field):
                self.tearDown(); self.setUp()
                self.host.restart_drift = (deploy.PROCESS_NAMES["api"], field)
                self.driver.preflight()
                with self.assertRaises(deploy.Denied):
                    self.driver.activate()
                self.assertEqual(self.host.save_calls, 0)

    def test_delayed_listener_passes_only_after_three_stable_samples(self) -> None:
        self.host.wait_samples = 6
        self.driver.preflight(); self.driver.activate()
        report = json.loads((self.transaction / "activate-api.report.private.json").read_text())
        self.assertEqual(report["stableSamples"], 3)
        self.assertEqual(report["sampleCount"], 6)

    def test_api_failure_prevents_frontend_and_rolls_back_without_save(self) -> None:
        self.host.wait_fail = "api"
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "READINESS_TIMEOUT:api:3001"):
            self.driver.activate()
        mutations = [event for event in self.host.events if event.startswith("PM2:")]
        self.assertEqual(mutations, ["PM2:restart re7-whatsapp-agent",
                                     "PM2:restart re7-whatsapp-agent"])
        self.assertFalse(any("re7-admin-front" in event for event in mutations))
        self.assertEqual(self.driver._journal_read()["state"], "ROLLED_BACK")

    def test_frontend_failure_rolls_back_frontend_before_api(self) -> None:
        self.host.wait_fail = "frontend"
        self.driver.preflight()
        with self.assertRaisesRegex(deploy.Denied, "READINESS_TIMEOUT:frontend:3000"):
            self.driver.activate()
        mutations = [event for event in self.host.events if event.startswith("PM2:")]
        self.assertEqual(mutations[-2:], ["PM2:restart re7-admin-front",
                                         "PM2:restart re7-whatsapp-agent"])
        self.assertEqual(self.driver._journal_read()["state"], "ROLLED_BACK")

    def test_worker_drift_is_denied_and_never_restarted_or_saved(self) -> None:
        self.host.worker_drift = True
        self.driver.preflight()
        with self.assertRaises(deploy.Denied):
            self.driver.activate()
        self.assertFalse(any("re7-whatsapp-web-worker" in event for event in self.host.events))
        self.assertEqual(self.host.save_calls, 0)

    def test_release_inventory_mutation_is_denied(self) -> None:
        (self.driver.release_root / "api-runtime/dist/index.js").write_text("drift\n")
        with self.assertRaisesRegex(deploy.Denied, "release_index_mismatch"):
            self.driver.preflight()

    def test_runtime_manifest_drift_is_denied(self) -> None:
        value = json.loads(self.runtime_manifest.read_text())
        value["processes"]["api"] = "other"
        put(self.runtime_manifest, value)
        self.inputs = deploy.Inputs(
            self.candidate, self.target, self.control_plane, deploy.COMPONENTS,
            self.runtime_manifest, self.transaction, sha(self.runtime_manifest), self.retirement,
        )
        with self.assertRaisesRegex(deploy.Denied, "runtime_manifest_processes"):
            self._driver().preflight()

    def test_rollback_manifest_index_entry_and_build_id_are_authenticated(self) -> None:
        value = json.loads(self.runtime_manifest.read_text())
        value["rollbackReleases"]["api"]["entrySha256"] = "f" * 64
        put(self.runtime_manifest, value)
        self.inputs = deploy.Inputs(
            self.candidate, self.target, self.control_plane, deploy.COMPONENTS,
            self.runtime_manifest, self.transaction, sha(self.runtime_manifest), self.retirement,
        )
        with self.assertRaisesRegex(deploy.Denied, "rollback_entry:api"):
            self._driver().preflight()

    def test_finalize_saves_once_validates_instances_equivalence_and_retires(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        self.driver.finalize()
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(journal["saveCount"], 1)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        self.assertTrue((self.driver.release_root / "DEPLOYED").is_file())
        self.assertNotIn("components", deploy.read_json(self.driver.release_root / "DEPLOYED"))
        self.assertNotIn("components", journal)
        self.assertFalse(self.lock.exists())

    def test_dump_instances_missing_is_only_equivalent_for_single_fork_process(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        original = self.host.pm2_mutate
        def save_without_instances(pm2: Path, args: list[str]) -> None:
            original(pm2, args)
            if args == ["save"]:
                rows = json.loads(self.dump.read_text())
                for row in rows:
                    row["pm2_env"].pop("instances", None)
                put(self.dump, rows)
        self.host.pm2_mutate = save_without_instances  # type: ignore[method-assign]
        self.driver.finalize()
        self.assertEqual(self.driver._journal_read()["saveCount"], 1)

    def test_dump_top_level_pm2_6014_representation_matches_live_configuration(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        original = self.host.pm2_mutate

        def save_with_top_level_configuration(pm2: Path, args: list[str]) -> None:
            original(pm2, args)
            if args != ["save"]:
                return
            rows = json.loads(self.dump.read_text())
            for row in rows:
                env = row["pm2_env"]
                for key in (
                    "pm_cwd", "pm_exec_path", "exec_interpreter", "args", "node_args",
                    "exec_mode", "instances", "namespace", "out_file", "error_file",
                    "merge_logs",
                ):
                    if key in env:
                        row[key] = env[key]
                        env[key] = None
                component = next(
                    key for key, process_name in deploy.PROCESS_NAMES.items()
                    if process_name == row["name"]
                )
                for key in self.driver._environment_keys(component):
                    if key in env:
                        row[key] = env[key]
                        env[key] = None
            put(self.dump, rows)

        self.host.pm2_mutate = save_with_top_level_configuration  # type: ignore[method-assign]
        self.driver.finalize()
        self.assertEqual(self.driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(self.host.save_calls, 1)

    def test_preflight_denies_missing_retirement_receipt_parent(self) -> None:
        binding = dataclasses.replace(
            self.retirement,
            receipt_root=self.base / "missing-parent" / "receipt",
        )
        inputs = dataclasses.replace(self.inputs, retirement=binding)
        with self.assertRaisesRegex(deploy.Denied, "generation_retirement_receipt_parent_missing"):
            FixtureDriver(
                inputs, host=self.host, repo=ROOT, releases=self.releases,
                stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2,
                clock=lambda: 1234567890.0,
            ).preflight()

    def test_retirement_failure_persists_complete_stdout_stderr_and_exit(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        original = self.host.run

        def fail_retirement(command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
            if len(command) > 3 and command[2] == "execute" and "--intent" in command:
                self.host.retirement_calls += 1
                return subprocess.CompletedProcess(
                    command, 2, "retirement-out\n",
                    "GENERATION_RETIREMENT_DENY:fixture_predicate\n",
                )
            return original(command, timeout=timeout)

        self.host.run = fail_retirement  # type: ignore[method-assign]
        self.driver.finalize()
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED_RETENTION_INCOMPLETE")
        evidence = journal["generationRetirement"]
        self.assertEqual(evidence["failurePredicate"], "GENERATION_RETIREMENT_DENY:fixture_predicate")
        self.assertEqual(Path(evidence["stdoutPath"]).read_text(), "retirement-out\n")
        self.assertEqual(
            Path(evidence["stderrPath"]).read_text(),
            "GENERATION_RETIREMENT_DENY:fixture_predicate\n",
        )
        self.assertEqual(Path(evidence["exitPath"]).read_text(), "2\n")
        self.assertEqual(self.host.save_calls, 1)

    def test_finalize_resume_never_repeats_save_or_retirement(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        self.driver.failpoints.add("after_save")
        with self.assertRaisesRegex(deploy.Denied, "injected:after_save"):
            self.driver.finalize()
        self.driver.finalize()
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)

    def test_rollback_resume_never_repeats_completed_restart(self) -> None:
        self.driver.preflight(); self.driver.activate()
        self.driver.failpoints.add("rollback_after_frontend")
        with self.assertRaisesRegex(deploy.Denied, "injected:rollback_after_frontend"):
            self.driver.rollback()
        before = self.host.events.count("PM2:restart re7-admin-front")
        self.driver.rollback()
        self.assertEqual(self.host.events.count("PM2:restart re7-admin-front"), before)
        self.assertEqual(self.host.save_calls, 0)

    def test_readiness_evidence_is_private_and_sanitized(self) -> None:
        self.driver.preflight(); self.driver.activate()
        for path in self.transaction.glob("*.private.*"):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        journal = self.driver.journal.read_text()
        self.assertNotIn("DATABASE_URL", journal)
        self.assertNotIn("token", journal.lower())

    def test_control_timeout_preserves_streams_and_denies_missing_report(self) -> None:
        class TimeoutHost(deploy.Host):
            def run(self, command: list[str], *, timeout: float = 40):
                raise subprocess.TimeoutExpired(command, timeout, output=b"partial-out",
                                                stderr=b"partial-error")

        evidence = self.base / "timeout-evidence"
        evidence.mkdir(mode=0o700)
        report = evidence / "report.private.json"
        stdout = evidence / "stdout.private.txt"
        stderr = evidence / "stderr.private.txt"
        with self.assertRaisesRegex(deploy.Denied, "READINESS_OBSERVABILITY_DEFECT"):
            TimeoutHost().control_evidence(
                ROOT, ["wait-existing-readiness"], report=report,
                stdout=stdout, stderr=stderr)
        self.assertEqual(stdout.read_bytes(), b"partial-out")
        self.assertEqual(stderr.read_bytes(), b"partial-error")
        self.assertFalse(report.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
