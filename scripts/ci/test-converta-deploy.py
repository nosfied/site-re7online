#!/usr/bin/env python3
"""Behavioral regression suite for the fixed-current API/frontend driver."""

from __future__ import annotations

import dataclasses
import fcntl
import hashlib
import importlib.util
import json
import os
import shutil
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

CONTINUATION_SPEC = importlib.util.spec_from_file_location(
    "fixed_current_runtime_cache_continuation",
    ROOT / "scripts/fixed-current-finalization-continuation.py")
assert CONTINUATION_SPEC and CONTINUATION_SPEC.loader
continuation = importlib.util.module_from_spec(CONTINUATION_SPEC)
CONTINUATION_SPEC.loader.exec_module(continuation)

GENERATION_TEST_SPEC = importlib.util.spec_from_file_location(
    "generation_retirement_fixture",
    ROOT / "scripts/ci/test-generation-retirement.py")
assert GENERATION_TEST_SPEC and GENERATION_TEST_SPEC.loader
generation_fixture = importlib.util.module_from_spec(GENERATION_TEST_SPEC)
GENERATION_TEST_SPEC.loader.exec_module(generation_fixture)


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
        self.committed_driver: str | None = None

    def run(self, command: list[str], *, timeout: float = 40,
            pass_fds: tuple[int, ...] = (),
            env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        if command[:4] == ["git", "-C", str(ROOT), "rev-parse"]:
            return subprocess.CompletedProcess(command, 0, self.control_plane + "\n", "")
        if command[:4] == ["git", "-C", str(ROOT), "status"]:
            return subprocess.CompletedProcess(command, 0, "", "")
        if (command[:4] == ["git", "-C", str(ROOT), "ls-files"] and
                command[-1:] == ["scripts/converta-deploy.py"]):
            return subprocess.CompletedProcess(command, 0, "scripts/converta-deploy.py\n", "")
        if (command[:4] == ["git", "-C", str(ROOT), "show"] and
                command[-1].endswith(":scripts/converta-deploy.py")):
            return subprocess.CompletedProcess(
                command, 0, self.committed_driver if self.committed_driver is not None
                else (ROOT / "scripts/converta-deploy.py").read_text(), "")
        if command[-1:] == ["--version"]:
            return subprocess.CompletedProcess(command, 0, "6.0.14\n", "")
        if len(command) > 3 and command[2] == "execute" and "--intent" in command:
            self.retirement_calls += 1
            self.retirement_pass_fds = pass_fds
            self.retirement_environment = env
            self.retirement_command = list(command)
            receipt_root = Path(command[command.index("--receipt-root") + 1])
            receipt_root.mkdir(mode=0o700)
            intent_path = Path(command[command.index("--intent") + 1])
            intent = json.loads(intent_path.read_text())
            commands = intent.get("commands", [])
            journal = receipt_root / "execution-journal.private.jsonl"
            events: list[dict[str, Any]] = []
            for item in commands:
                events.extend((
                    {"event": "ATTEMPT", "ordinal": item["ordinal"],
                     "path": item["path"], "argv": item["argv"]},
                    {"event": "RESULT", "ordinal": item["ordinal"], "exitCode": 0},
                    {"event": "VERIFIED", "ordinal": item["ordinal"], "absent": True},
                ))
            journal.write_text("".join(json.dumps(event, sort_keys=True,
                                                   separators=(",", ":")) + "\n"
                                       for event in events))
            journal.chmod(0o600)
            receipt = receipt_root / "execution-receipt.private.json"
            intent_sha = command[command.index("--intent-sha256") + 1]
            put(receipt, {"state": "DEPLOYED_SANITIZED", "intentSha256": intent_sha,
                          "commandLogSha256": sha(journal),
                          "attemptedCommands": len(commands),
                          "completedCommands": len(commands),
                          "removedPaths": [item["path"] for item in commands]})
            review = Path(command[command.index("--review-output") + 1])
            put(review, {"schemaVersion": 2, "state": "SANITIZED",
                         "evidenceSha256": sha(receipt)})
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
            "activeReleases": [self.rollback], "rollbackReleases": [self.rollback],
            "immediateRollbackReleases": {
                "api": self.rollback, "frontend": self.rollback,
            },
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

    def _driver(self, repo: Path = ROOT) -> FixtureDriver:
        driver = FixtureDriver(
            self.inputs, host=self.host, repo=repo, releases=self.releases,
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

    def runtime_cache_finalize(self, *, repo: Path = ROOT, prepare_transaction: bool = True,
                               continuation_control_plane: str | None = None,
                               preserve_retirement: bool = False,
                               ) -> tuple[FixtureDriver, Path, dict[str, Any]]:
        driver = self.driver
        if prepare_transaction:
            driver.preflight(); driver.activate(); self.acceptance()
        root = self.releases / self.candidate
        paths = sorted(deploy.RUNTIME_CACHE_36B_EXTRAS)
        files = [path for path in paths if path.endswith(".webp")]
        for relative in paths:
            target = root / relative
            if relative in files:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(("cache:" + relative).encode())
                target.chmod(0o644)
            else:
                target.mkdir(parents=True, exist_ok=True)
                target.chmod(0o755)

        if not preserve_retirement:
            contract_sha = sha(self.generation_contract)
            commands = [
                {"ordinal": ordinal, "path": str(path),
                 "argv": ["/usr/bin/rm", "-r", "--", str(path)]}
                for ordinal, path in enumerate((
                    self.base / "build-worktree",
                    self.base / "derived-api-runtime",
                    self.base / "derived-frontend-runtime"), 1)
            ]
            put(self.retirement.intent, {"contractSha256": contract_sha, "commands": commands})
            self.retirement = replace(self.retirement, intent_sha256=sha(self.retirement.intent))
            self.inputs = replace(self.inputs, retirement=self.retirement)

        journal = json.loads(driver.journal.read_text())
        journal["binding"] = self.inputs.binding()
        journal["state"] = "FAILED"
        journal["failure"] = "release_index_inventory"
        journal["recoveryAction"] = "finalize"
        journal["saveCount"] = 0
        put(driver.journal, journal)
        negative = self.base / "negative-journal.authenticated.private.json"
        negative.write_bytes(driver.journal.read_bytes()); negative.chmod(0o600)

        entries: list[dict[str, Any]] = []
        for relative in paths:
            target = root / relative
            info = target.lstat()
            item: dict[str, Any] = {"path": relative, "mode": stat.S_IMODE(info.st_mode)}
            if target.is_dir():
                item["type"] = "directory"
            else:
                item.update(type="file", size=info.st_size, sha256=sha(target))
            entries.append(item)
        manifest = self.base / "runtime-cache-reconciliation.private.json"
        continuation_control_plane = continuation_control_plane or "d" * 40
        put(manifest, {
            "schemaVersion": 1, "kind": deploy.RUNTIME_CACHE_RECONCILIATION_KIND,
            "releaseId": self.candidate, "targetCommit": self.target,
            "transactionRoot": str(self.transaction),
            "indexSha256": sha(root / "index.sha256"),
            "manifestSha256": sha(root / "manifest.json"),
            "retirementIntentSha256": self.retirement.intent_sha256,
            "originalControlPlane": self.control_plane,
            "continuationControlPlane": continuation_control_plane,
            "continuationDriverSha256": sha(ROOT / "scripts/converta-deploy.py"),
            "negativeJournal": {"path": str(negative), "sha256": sha(negative)},
            "acceptanceSha256": sha(driver.acceptance), "lockSha256": sha(self.lock),
            "cacheEntries": entries,
        })
        self.inputs = replace(
            self.inputs, runtime_cache_reconciliation=manifest,
            runtime_cache_reconciliation_sha256=sha(manifest))
        self.driver = self._driver(repo)
        if repo == ROOT:
            self.host.control_plane = continuation_control_plane
        constants = {
            "RUNTIME_CACHE_36B_RELEASE": self.candidate,
            "RUNTIME_CACHE_36B_TARGET": self.target,
            "RUNTIME_CACHE_36B_TRANSACTION": self.transaction,
            "RUNTIME_CACHE_36B_INDEX_SHA256": sha(root / "index.sha256"),
            "RUNTIME_CACHE_36B_MANIFEST_SHA256": sha(root / "manifest.json"),
            "RUNTIME_CACHE_36B_INTENT_SHA256": self.retirement.intent_sha256,
            "RUNTIME_CACHE_36B_NEGATIVE_JOURNAL_SHA256": sha(negative),
            "RUNTIME_CACHE_36B_ACCEPTANCE_SHA256": sha(driver.acceptance),
            "RUNTIME_CACHE_36B_LOCK_SHA256": sha(self.lock),
            "RUNTIME_CACHE_36B_EXTRAS": {
                item["path"]: {key: value for key, value in item.items() if key != "path"}
                for item in entries
            },
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
        self.assertEqual(stat.S_IMODE((driver.release_root / "DEPLOYED").stat().st_mode), 0o600)
        graph = deploy.read_json(self.transaction / "generation-release-graph.final.private.json")
        self.assertEqual(graph["activeReleases"], sorted([self.candidate, self.rollback]))

    def test_api_only_external_retirement_rechecked_before_restart_and_save(self) -> None:
        intent = deploy.read_json(self.retirement.intent)
        put(self.retirement.intent, {**intent, "externalHandoff": {"path": "fixture", "sha256": "f" * 64}})
        self.retirement = dataclasses.replace(self.retirement, intent_sha256=sha(self.retirement.intent))
        self.inputs = dataclasses.replace(self.inputs, retirement=self.retirement)
        driver = self.api_only()
        actual_run = self.host.run
        checks = []
        admitted = False

        def run(command, **kwargs):
            if command[2:3] != ["check-external-retirement"]:
                return actual_run(command, **kwargs)
            checks.append(command)
            if not admitted:
                return subprocess.CompletedProcess(command, 2, "", "external proof missing")
            report = {"result": "EXTERNAL_RETIREMENT_READY", "releaseId": self.candidate,
                      "targetCommit": self.target, "intentSha256": sha(self.retirement.intent),
                      "installedPath": str(driver.release_root),
                      "manifestSha256": sha(driver.release_root / "manifest.json"),
                      "indexSha256": sha(driver.release_root / "index.sha256")}
            return subprocess.CompletedProcess(command, 0, json.dumps(report), "")

        self.host.run = run
        with self.assertRaisesRegex(deploy.Denied, "external_retirement_verification"):
            driver.preflight()
        self.assertFalse(self.transaction.exists())
        admitted = True
        driver.preflight()
        admitted = False
        with self.assertRaisesRegex(deploy.Denied, "external_retirement_verification"):
            driver.activate()
        self.assertFalse(self.lock.exists())
        self.assertFalse(any(event.startswith("PM2:") for event in self.host.events))
        admitted = True
        driver.activate(); self.acceptance()
        admitted = False
        with self.assertRaisesRegex(deploy.Denied, "external_retirement_verification"):
            driver.finalize()
        self.assertEqual(self.host.save_calls, 0)
        admitted = True
        driver.finalize()
        self.assertEqual(driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        self.assertEqual(len(checks), 6)

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

    def test_api_only_updates_only_authenticated_component_rollback(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate()
        journal = driver._journal_read()
        operational = deploy.read_json(self.retirement.operational_state)
        operational["rollbackReleases"] = ["immutable-api-old", "immutable-frontend-return"]
        operational["immediateRollbackReleases"] = {
            "api": "immutable-api-old", "frontend": "immutable-frontend-return"}
        put(self.retirement.operational_state, operational)
        binding = dataclasses.replace(
            self.retirement,
            operational_state_sha256=sha(self.retirement.operational_state),
        )
        final_path, _ = driver._retirement_final_operational(binding, journal)
        final = deploy.read_json(final_path)
        self.assertEqual(final["immediateRollbackReleases"], {
            "api": self.rollback, "frontend": "immutable-frontend-return"})
        self.assertIn("immutable-api-old", final["rollbackReleases"])
        self.assertIn("immutable-frontend-return", final["rollbackReleases"])

    def test_legacy_graph_denies_partial_activation_before_transaction(self) -> None:
        operational = deploy.read_json(self.retirement.operational_state)
        operational.pop("immediateRollbackReleases")
        put(self.retirement.operational_state, operational)
        binding = dataclasses.replace(
            self.retirement,
            operational_state_sha256=sha(self.retirement.operational_state),
        )
        driver = self.api_only()
        driver.inputs = dataclasses.replace(driver.inputs, retirement=binding)
        with self.assertRaisesRegex(deploy.Denied, "rollback_role_legacy_transition_required"):
            driver.preflight()
        self.assertFalse(driver.journal.exists())

    def test_component_binding_blocks_next_activation_until_old_roles_reconciled(self) -> None:
        operational = deploy.read_json(self.retirement.operational_state)
        operational["rollbackReleases"] = [
            self.rollback, "immutable-frontend-return", "immutable-historical"]
        operational["immediateRollbackReleases"] = {
            "api": self.rollback, "frontend": "immutable-frontend-return"}
        put(self.retirement.operational_state, operational)
        binding = dataclasses.replace(
            self.retirement,
            operational_state_sha256=sha(self.retirement.operational_state),
        )
        self.driver.inputs = dataclasses.replace(self.driver.inputs, retirement=binding)
        with self.assertRaisesRegex(deploy.Denied, "rollback_role_reconciliation_required"):
            self.driver.preflight()
        self.assertFalse(self.driver.journal.exists())

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

    def test_36b_runtime_cache_continuation_finishes_once_with_three_derivatives(self) -> None:
        driver, _, constants = self.runtime_cache_finalize()
        commands = json.loads(self.retirement.intent.read_text())["commands"]
        self.assertEqual(len(commands), 3)
        with patch.multiple(deploy, **constants):
            driver.finalize()
        journal = driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(journal["saveCount"], 1)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        receipt = self.base / "retirement-receipt/execution-receipt.private.json"
        receipt_value = json.loads(receipt.read_text())
        self.assertEqual(receipt_value["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(receipt_value["completedCommands"], 3)
        self.assertEqual(len(receipt_value["removedPaths"]), 3)
        events = (self.base / "retirement-receipt/execution-journal.private.jsonl").read_text().splitlines()
        self.assertEqual(len(events), 9)
        self.assertEqual(json.loads(self.retirement.review_output.read_text())["state"], "SANITIZED")

    def test_36b_runtime_cache_continuation_recovers_save_without_duplicate(self) -> None:
        driver, _, constants = self.runtime_cache_finalize()
        self.external_lock(); driver.failpoints.add("after_save")
        with patch.multiple(deploy, **constants), patch.dict(
                os.environ, {deploy.EXTERNAL_LOCK_ENV: "1"}):
            with self.assertRaisesRegex(deploy.Denied, "injected:after_save"):
                driver.finalize()
            self.assertEqual(driver._journal_read()["state"], "FAILED")
            self.assertEqual(driver._journal_read()["saveCount"], 0)
            driver.finalize()
        terminal_journal = driver._journal_read()
        self.assertEqual(terminal_journal["state"], "DEPLOYED_SANITIZED", terminal_journal)
        self.assertEqual(terminal_journal["saveCount"], 1)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)

    def test_36b_wrapper_recovers_after_save_across_real_control_plane_heads(self) -> None:
        control = self.base / "successor-control"
        scripts = control / "scripts"; scripts.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts/pm2-definition-env-allowlist.v1.json",
                        scripts / "pm2-definition-env-allowlist.v1.json")
        (scripts / "converta-deploy.py").write_text("# original control plane\n")
        subprocess.run(["git", "init", "-q", str(control)], check=True)
        subprocess.run(["git", "-C", str(control), "config", "user.email", "fixture@example.test"], check=True)
        subprocess.run(["git", "-C", str(control), "config", "user.name", "Fixture"], check=True)
        subprocess.run(["git", "-C", str(control), "add", "."], check=True)
        subprocess.run(["git", "-C", str(control), "commit", "-q", "-m", "original"], check=True)
        original_head = subprocess.run(
            ["git", "-C", str(control), "rev-parse", "HEAD"], check=True,
            capture_output=True, text=True).stdout.strip()

        real_retirement = generation_fixture.Fixture(release_id=self.candidate)
        self.addCleanup(real_retirement.close)
        contract = json.loads(real_retirement.contract.read_text())
        contract["artifacts"] = [
            item for item in contract["artifacts"] if item["class"] != "DERIVED_STAGING"
        ]
        generation_fixture.private_json(real_retirement.contract, contract)
        prepared = real_retirement.prepare()
        self.assertEqual(prepared.returncode, 0, (prepared.stdout, prepared.stderr))
        real_intent = json.loads(real_retirement.intent.read_text())
        self.assertEqual(len(real_intent["commands"]), 3)
        authorization = real_retirement.authorize("36b-runtime-cache-once")
        retirement_control = real_retirement.root / "retirement-control"
        retirement_control.mkdir(mode=0o700)
        real_tool = retirement_control / "generation-retirement.py"
        real_dependency = retirement_control / "preparation_artifact_lifecycle.py"
        shutil.copyfile(ROOT / "scripts/generation-retirement.py", real_tool)
        shutil.copyfile(ROOT / "scripts/preparation_artifact_lifecycle.py", real_dependency)
        real_tool.chmod(0o600); real_dependency.chmod(0o600)
        receipt_parent = real_retirement.evidence_root / "finalize-receipts"
        receipt_parent.mkdir(mode=0o700)
        self.retirement = deploy.RetirementBinding(
            real_tool, sha(real_tool), real_retirement.intent, sha(real_retirement.intent),
            authorization, sha(authorization), real_retirement.operational,
            sha(real_retirement.operational), real_retirement.policy,
            sha(real_retirement.policy), receipt_parent / "retirement-3-of-3",
            real_retirement.review, self.lock,
        )
        self.generation_contract = real_retirement.contract

        runtime = json.loads(self.runtime_manifest.read_text())
        runtime["controlPlaneSha"] = original_head
        put(self.runtime_manifest, runtime)
        self.control_plane = original_head
        self.inputs = replace(
            self.inputs, control_plane=original_head,
            runtime_manifest_sha256=sha(self.runtime_manifest), retirement=self.retirement)
        original_run = self.host.run

        def real_git(command: list[str], *, timeout: float = 40,
                     pass_fds: tuple[int, ...] = (), env: dict[str, str] | None = None
                     ) -> subprocess.CompletedProcess[str]:
            if command and command[0] == "git":
                return subprocess.run(command, timeout=timeout, text=True,
                                      capture_output=True, check=False)
            if (len(command) > 3 and Path(command[1]) == real_tool and
                    command[2] == "execute"):
                self.host.retirement_calls += 1
                return subprocess.run(command, timeout=timeout, text=True,
                                      capture_output=True, check=False,
                                      pass_fds=pass_fds, env=env)
            return original_run(command, timeout=timeout, pass_fds=pass_fds, env=env)

        self.host.run = real_git  # type: ignore[method-assign]
        self.driver = self._driver(control)
        self.driver.preflight(); self.driver.activate(); self.acceptance()

        shutil.copyfile(ROOT / "scripts/converta-deploy.py", scripts / "converta-deploy.py")
        subprocess.run(["git", "-C", str(control), "add", "."], check=True)
        subprocess.run(["git", "-C", str(control), "commit", "-q", "-m", "successor"], check=True)
        successor_head = subprocess.run(
            ["git", "-C", str(control), "rev-parse", "HEAD"], check=True,
            capture_output=True, text=True).stdout.strip()
        self.assertNotEqual(original_head, successor_head)
        driver, manifest, deploy_constants = self.runtime_cache_finalize(
            repo=control, prepare_transaction=False,
            continuation_control_plane=successor_head, preserve_retirement=True)
        real_retirement.pm2_state.write_text(json.dumps(list(self.host.rows.values())))

        custody = self.base / "continuation-custody"; custody.mkdir(mode=0o700)
        copied_driver = custody / "converta-deploy.py"
        shutil.copyfile(ROOT / "scripts/converta-deploy.py", copied_driver)
        copied_driver.chmod(0o600)
        copied_wrapper = custody / "fixed-current-finalization-continuation.py"
        shutil.copyfile(ROOT / "scripts/fixed-current-finalization-continuation.py", copied_wrapper)
        copied_wrapper.chmod(0o600)
        finalize_argv = [
            "/usr/bin/python3", "-B", str(copied_driver), "finalize",
            "--release", self.candidate, "--target", self.target,
            "--control-plane", original_head, "--components", "api,frontend",
            "--runtime-manifest", str(self.runtime_manifest),
            "--runtime-manifest-sha256", sha(self.runtime_manifest),
            "--transaction-root", str(self.transaction),
            "--generation-retirement-tool", str(self.retirement.tool),
            "--generation-retirement-tool-sha256", self.retirement.tool_sha256,
            "--generation-retirement-intent", str(self.retirement.intent),
            "--generation-retirement-intent-sha256", self.retirement.intent_sha256,
            "--generation-retirement-authorization", str(self.retirement.authorization),
            "--generation-retirement-authorization-sha256",
            self.retirement.authorization_sha256,
            "--generation-retirement-operational-state", str(self.retirement.operational_state),
            "--generation-retirement-operational-state-sha256",
            self.retirement.operational_state_sha256,
            "--generation-retirement-root-policy", str(self.retirement.root_policy),
            "--generation-retirement-root-policy-sha256", self.retirement.root_policy_sha256,
            "--generation-retirement-receipt-root", str(self.retirement.receipt_root),
            "--generation-retirement-review-output", str(self.retirement.review_output),
            "--generation-retirement-deployment-lock", str(self.retirement.deployment_lock),
            "--runtime-cache-reconciliation", str(manifest),
            "--runtime-cache-reconciliation-sha256", sha(manifest),
        ]
        failpoint = custody / "fail-after-save.once"
        failpoint.write_text("after_save\n"); failpoint.chmod(0o600)
        save_log = custody / "pm2-save.calls"
        fixture_config = custody / "subprocess-fixture.private.json"
        serialized_constants = {
            name: (str(value) if isinstance(value, Path) else value)
            for name, value in deploy_constants.items()
        }
        put(fixture_config, {
            "driver": str(copied_driver), "wrapper": str(copied_wrapper),
            "repo": str(control),
            "testModule": str(Path(__file__).resolve()),
            "controlPlane": successor_head, "node": str(self.node),
            "rows": list(self.host.rows.values()), "dump": str(self.dump),
            "pm2": str(self.pm2), "releases": str(self.releases),
            "stable": {name: str(path) for name, path in self.stable.items()},
            "lock": str(self.lock), "retirementTool": str(real_tool),
            "failpoint": str(failpoint), "saveLog": str(save_log),
            "constants": serialized_constants,
            "wrapperConstants": {
                "RUNTIME_CACHE_RELEASE": self.candidate,
                "RUNTIME_CACHE_TARGET": self.target,
                "RUNTIME_CACHE_TRANSACTION": str(self.transaction),
                "RUNTIME_CACHE_INTENT_SHA256": self.retirement.intent_sha256,
            },
        })
        fixture_python = custody / "fixture-python"
        fixture_python.mkdir(mode=0o700)
        (fixture_python / "sitecustomize.py").write_text("""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

config_path = os.environ.get("RE7_FINALIZE_SUBPROCESS_FIXTURE")
if config_path:
    config = json.loads(Path(config_path).read_text())

    def install_fixture(frame, event, argument):
        if event != "call" or frame.f_code.co_name != "main":
            return install_fixture
        executable = Path(frame.f_code.co_filename).resolve()
        if executable == Path(config["wrapper"]).resolve():
            sys.settrace(None)
            for name, value in config["wrapperConstants"].items():
                frame.f_globals[name] = Path(value) if name == "RUNTIME_CACHE_TRANSACTION" else value
            return None
        if executable != Path(config["driver"]).resolve():
            return install_fixture
        sys.settrace(None)
        globals_ = frame.f_globals
        spec = importlib.util.spec_from_file_location("deploy_subprocess_fixture", config["testModule"])
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        host = module.FakeHost(config["controlPlane"], Path(config["node"]))
        host.rows = {row["name"]: row for row in config["rows"]}
        host.process_cwds = {
            row["pid"]: Path(row["pm2_env"]["pm_cwd"]).resolve()
            for row in host.rows.values()
        }
        host.dump = Path(config["dump"])
        original_run = host.run

        def run(command, *, timeout=40, pass_fds=(), env=None):
            if command and command[0] == "git":
                return subprocess.run(command, timeout=timeout, text=True,
                                      capture_output=True, check=False)
            if (len(command) > 3 and Path(command[1]) == Path(config["retirementTool"]) and
                    command[2] == "execute"):
                return subprocess.run(command, timeout=timeout, text=True,
                                      capture_output=True, check=False,
                                      pass_fds=pass_fds, env=env)
            return original_run(command, timeout=timeout, pass_fds=pass_fds, env=env)

        host.run = run
        original_mutate = host.pm2_mutate

        def mutate(pm2, args):
            original_mutate(pm2, args)
            if args == ["save"]:
                with open(config["saveLog"], "a", encoding="utf-8") as stream:
                    stream.write("save\\n")

        host.pm2_mutate = mutate
        original_driver = globals_["Driver"]
        denied = globals_["Denied"]

        class SubprocessDriver(original_driver):
            def _ticks(self, pid):
                return pid * 100

            def _failpoint(self, name):
                marker = Path(config["failpoint"])
                if name == "after_save" and marker.exists():
                    marker.unlink()
                    raise denied("injected:after_save")

        def driver_factory(inputs):
            return SubprocessDriver(
                inputs, host=host, repo=Path(config["repo"]),
                releases=Path(config["releases"]),
                stable={name: Path(path) for name, path in config["stable"].items()},
                lock=Path(config["lock"]), dump=Path(config["dump"]),
                pm2=Path(config["pm2"]), clock=lambda: 1234567890.0)

        globals_["Driver"] = driver_factory
        for name, value in config["constants"].items():
            globals_[name] = Path(value) if name == "RUNTIME_CACHE_36B_TRANSACTION" else value
        return None

    sys.settrace(install_fixture)
""")
        def request_for(attempt: int) -> dict[str, Any]:
            return {
                "schemaVersion": 1, "action": "finalize_runtime_cache_continuation",
                "attemptOrdinal": attempt, "lockPath": str(self.lock),
                "transactionRoot": str(self.transaction), "driver": str(copied_driver),
                "driverSha256": sha(copied_driver),
                "evidenceOutputs": {
                    name: str(self.transaction /
                              f"runtime-cache-finalize-v1-attempt-{attempt:02d}.{name}.private.txt")
                    for name in ("stdout", "stderr", "exit")
                },
                "finalizeArgv": [
                    *finalize_argv,
                ],
            }

        def invoke(attempt: int) -> subprocess.CompletedProcess[str]:
            request = request_for(attempt)
            request_path = custody / f"attempt-{attempt:02d}.request.private.json"
            put(request_path, request)
            environment = dict(os.environ)
            environment.update(
                PYTHONPATH=str(fixture_python),
                RE7_FINALIZE_SUBPROCESS_FIXTURE=str(fixture_config))
            return subprocess.run([
                "/usr/bin/python3", "-B", str(copied_wrapper),
                "--request", str(request_path),
                "--request-sha256", sha(request_path),
            ], text=True, capture_output=True, check=False, env=environment)

        first = invoke(1)
        self.assertEqual(first.returncode, 2, (first.stdout, first.stderr))
        self.assertIn("finalize_exit:2", first.stderr)
        self.assertTrue(self.lock.is_file())
        second = invoke(2)
        self.assertEqual(second.returncode, 0, (second.stdout, second.stderr))
        self.assertFalse(self.lock.exists())
        self.assertEqual(save_log.read_text().splitlines(), ["save"])
        self.assertEqual((self.transaction /
            "runtime-cache-finalize-v1-attempt-01.exit.private.txt").read_text(), "2\n")
        self.assertEqual((self.transaction /
            "runtime-cache-finalize-v1-attempt-02.exit.private.txt").read_text(), "0\n")
        self.assertIn("DEPLOYED_SANITIZED", (self.transaction /
            "runtime-cache-finalize-v1-attempt-02.stdout.private.txt").read_text())
        terminal_journal = json.loads(driver.journal.read_text())
        self.assertEqual(terminal_journal["state"], "DEPLOYED_SANITIZED", terminal_journal)
        self.assertEqual(terminal_journal["saveCount"], 1)
        for attempt in (1, 2):
            for name in ("stdout", "stderr", "exit"):
                self.assertTrue((self.transaction /
                    f"runtime-cache-finalize-v1-attempt-{attempt:02d}.{name}.private.txt").is_file())
        for item in real_intent["commands"]:
            self.assertFalse(Path(item["path"]).exists())
        receipt_path = receipt_parent / "retirement-3-of-3/execution-receipt.private.json"
        receipt = json.loads(receipt_path.read_text())
        self.assertEqual(receipt["completedCommands"], 3)
        self.assertEqual(receipt["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(json.loads(real_retirement.review.read_text())["state"], "SANITIZED")

    def test_36b_runtime_cache_continuation_denies_inventory_and_crossed_evidence(self) -> None:
        variants = ("cache_altered", "extra", "symlink", "indexed_missing",
                    "indexed_divergent", "crossed_evidence", "successor_head",
                    "successor_driver", "successor_blob")
        for variant in variants:
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                driver, manifest, constants = self.runtime_cache_finalize()
                root = self.releases / self.candidate
                payload = json.loads(manifest.read_text())
                cache_files = [item for item in payload["cacheEntries"] if item["type"] == "file"]
                if variant == "cache_altered":
                    (root / cache_files[0]["path"]).write_text("altered\n")
                elif variant == "extra":
                    (root / "frontend-runtime/.next/cache/new-extra").write_text("extra\n")
                elif variant == "symlink":
                    path = root / cache_files[0]["path"]
                    path.unlink(); path.symlink_to(root / cache_files[1]["path"])
                elif variant == "indexed_missing":
                    (root / "api-runtime/dist/index.js").unlink()
                elif variant == "indexed_divergent":
                    (root / "api-runtime/dist/index.js").write_text("divergent\n")
                elif variant == "crossed_evidence":
                    negative = Path(payload["negativeJournal"]["path"])
                    crossed = json.loads(negative.read_text())
                    crossed["binding"]["target"] = "f" * 40
                    put(negative, crossed)
                    payload["negativeJournal"]["sha256"] = sha(negative)
                    put(manifest, payload)
                    self.inputs = replace(
                        self.inputs, runtime_cache_reconciliation_sha256=sha(manifest))
                    driver = self._driver()
                    constants["RUNTIME_CACHE_36B_NEGATIVE_JOURNAL_SHA256"] = sha(negative)
                elif variant == "successor_head":
                    payload["continuationControlPlane"] = "e" * 40
                    put(manifest, payload)
                    self.inputs = replace(
                        self.inputs, runtime_cache_reconciliation_sha256=sha(manifest))
                    driver = self._driver()
                elif variant == "successor_blob":
                    self.host.committed_driver = "# tracked worktree is clean; committed blob differs\n"
                else:
                    payload["continuationDriverSha256"] = "f" * 64
                    put(manifest, payload)
                    self.inputs = replace(
                        self.inputs, runtime_cache_reconciliation_sha256=sha(manifest))
                    driver = self._driver()
                with patch.multiple(deploy, **constants):
                    with self.assertRaises(deploy.Denied):
                        driver.finalize()
                self.assertEqual(self.host.save_calls, 0)
                self.assertEqual(self.host.retirement_calls, 0)

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

    def test_api_only_preserved_builder_closes_with_debt_and_releases_lock_once(self) -> None:
        driver = self.api_only(); driver.preflight(); driver.activate(); self.acceptance()
        original = self.host.run

        def preserve(command, **kwargs):
            result = original(command, **kwargs)
            if command[2:3] != ["execute"]:
                return result
            receipt_root = Path(command[command.index("--receipt-root") + 1])
            receipt = receipt_root / "execution-receipt.private.json"
            value = deploy.read_json(receipt)
            value["state"] = "DEPLOYED_RETENTION_INCOMPLETE"
            value["externalRetentionDebt"] = {
                "state": "PRESERVED_RETENTION_DEBT", "responsible": "fixture-owner",
                "retainedBytes": 1024, "expiresAtUtc": "2099-01-01T00:00:00Z",
                "preservedPaths": ["/builder/source", "/builder/api-runtime", "/builder/frontend-runtime"],
            }
            put(receipt, value)
            return subprocess.CompletedProcess(command, 0, json.dumps({
                "result": value["state"], "receiptSha256": sha(receipt),
            }), "")

        self.host.run = preserve
        driver.finalize()
        journal = driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED_RETENTION_INCOMPLETE")
        self.assertEqual(journal["saveCount"], 1)
        self.assertEqual(self.host.save_calls, 1)
        self.assertEqual(self.host.retirement_calls, 1)
        self.assertFalse(self.lock.exists())
        self.assertTrue((driver.release_root / "DEPLOYED").exists())
        self.assertEqual(self.stable["frontend"].resolve(),
                         self.releases / self.rollback / "frontend-runtime")
        with self.assertRaisesRegex(deploy.Denied, "finalize_state"):
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

    def test_sealed_acceptance_transport_readback_and_real_finalize(self) -> None:
        self.driver.preflight(); self.driver.activate()
        custody = self.base / "acceptance-custody"
        custody.mkdir(mode=0o700)
        materializer = custody / "fixed-current-acceptance-materialize.py"
        copied_driver = custody / "converta-deploy.py"
        copied_continuation = custody / "fixed-current-finalization-continuation.py"
        payload = custody / "acceptance.payload.private.txt"
        shutil.copyfile(ROOT / "scripts/fixed-current-acceptance-materialize.py", materializer)
        shutil.copyfile(ROOT / "scripts/converta-deploy.py", copied_driver)
        shutil.copyfile(ROOT / "scripts/fixed-current-finalization-continuation.py",
                        copied_continuation)
        materializer.chmod(0o600); copied_driver.chmod(0o600); copied_continuation.chmod(0o600)
        payload.write_bytes("ACEITE TÉCNICO PASS\n".encode("utf-8")); payload.chmod(0o600)
        binding = self.driver._journal_read()["binding"]
        request = custody / "acceptance-request.private.json"
        put(request, {
            "schemaVersion": 1, "action": "materialize_fixed_current_acceptance",
            "transactionRoot": str(self.transaction),
            "transactionJournal": str(self.transaction / "transaction.v1.private.json"),
            "acceptanceOutput": str(self.transaction / "acceptance.private.txt"),
            "acceptancePayload": str(payload), "acceptancePayloadSha256": sha(payload),
            "driver": str(copied_driver), "driverSha256": sha(copied_driver),
            "binding": {name: binding[name] for name in
                        ("release", "target", "controlPlane", "components")},
        })
        completed = subprocess.run(
            [sys.executable, "-B", str(materializer), "--request", str(request),
             "--request-sha256", sha(request)], check=True, capture_output=True, text=True)
        result = json.loads(completed.stdout)
        self.assertEqual(result["sha256"],
                         "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a")
        self.assertEqual(self.driver.acceptance.read_bytes(),
                         "ACEITE TÉCNICO PASS\n".encode("utf-8"))
        continuation_spec = importlib.util.spec_from_file_location(
            "copied_fixed_current_continuation", copied_continuation)
        assert continuation_spec and continuation_spec.loader
        continuation = importlib.util.module_from_spec(continuation_spec)
        continuation_spec.loader.exec_module(continuation)
        continuation_request = {
            "schemaVersion": 1, "action": "finalize", "lockPath": str(self.lock),
            "transactionRoot": str(self.transaction), "driver": str(copied_driver),
            "driverSha256": sha(copied_driver),
            "finalizeArgv": [sys.executable, "-B", str(copied_driver), "finalize",
                             "--release", self.candidate],
        }
        lock_fd = continuation.acquire_lock(self.lock)
        def run_real_consumer(argv, **kwargs):
            previous = os.environ.get(continuation.LOCK_ENV)
            os.environ[continuation.LOCK_ENV] = kwargs["env"][continuation.LOCK_ENV]
            try:
                self.driver.finalize()
            finally:
                if previous is None:
                    os.environ.pop(continuation.LOCK_ENV, None)
                else:
                    os.environ[continuation.LOCK_ENV] = previous
            return subprocess.CompletedProcess(argv, 0)
        try:
            self.assertEqual(continuation.run(
                continuation_request, lock_fd, runner=run_real_consumer), 0)
            continuation.release_terminal_lock(continuation_request, lock_fd)
        finally:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
            finally:
                os.close(lock_fd)
        self.assertEqual(self.driver._journal_read()["state"], "DEPLOYED_SANITIZED")
        self.assertEqual(self.host.save_calls, 1)

    def test_acceptance_materializer_denies_payload_journal_and_request_drift(self) -> None:
        for variant in ("payload", "journal", "request"):
            with self.subTest(variant=variant):
                self.tearDown(); self.setUp()
                self.driver.preflight(); self.driver.activate()
                custody = self.base / "acceptance-custody"; custody.mkdir(mode=0o700)
                materializer = custody / "fixed-current-acceptance-materialize.py"
                copied_driver = custody / "converta-deploy.py"
                payload = custody / "acceptance.payload.private.txt"
                shutil.copyfile(ROOT / "scripts/fixed-current-acceptance-materialize.py", materializer)
                shutil.copyfile(ROOT / "scripts/converta-deploy.py", copied_driver)
                materializer.chmod(0o600); copied_driver.chmod(0o600)
                payload.write_bytes("ACEITE TÉCNICO PASS\n".encode("utf-8")); payload.chmod(0o600)
                binding = self.driver._journal_read()["binding"]
                request = custody / "acceptance-request.private.json"
                value = {
                    "schemaVersion": 1, "action": "materialize_fixed_current_acceptance",
                    "transactionRoot": str(self.transaction),
                    "transactionJournal": str(self.transaction / "transaction.v1.private.json"),
                    "acceptanceOutput": str(self.transaction / "acceptance.private.txt"),
                    "acceptancePayload": str(payload), "acceptancePayloadSha256": sha(payload),
                    "driver": str(copied_driver), "driverSha256": sha(copied_driver),
                    "binding": {name: binding[name] for name in
                                ("release", "target", "controlPlane", "components")},
                }
                put(request, value); sealed = sha(request)
                if variant == "payload":
                    payload.write_bytes(b"wrong\n")
                elif variant == "journal":
                    journal = self.driver._journal_read(); journal["state"] = "PREFLIGHT_PASS"
                    put(self.transaction / "transaction.v1.private.json", journal)
                else:
                    value["binding"]["target"] = "0" * 40; put(request, value)
                completed = subprocess.run(
                    [sys.executable, "-B", str(materializer), "--request", str(request),
                     "--request-sha256", sealed], capture_output=True, text=True)
                self.assertEqual(completed.returncode, 2)
                self.assertFalse(self.driver.acceptance.exists())

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
