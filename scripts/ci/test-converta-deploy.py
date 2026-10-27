#!/usr/bin/env python3
"""Behavioral regression suite for the fixed-current API/frontend driver."""

from __future__ import annotations

import dataclasses
import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("converta_deploy", ROOT / "scripts/converta-deploy.py")
assert SPEC and SPEC.loader
deploy = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = deploy
SPEC.loader.exec_module(deploy)


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

    def run(self, command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
        if command[:4] == ["git", "-C", str(ROOT), "rev-parse"]:
            return subprocess.CompletedProcess(command, 0, self.control_plane + "\n", "")
        if command[:4] == ["git", "-C", str(ROOT), "status"]:
            return subprocess.CompletedProcess(command, 0, "", "")
        if command[-1:] == ["--version"]:
            return subprocess.CompletedProcess(command, 0, "6.0.14\n", "")
        if len(command) > 3 and command[2] == "execute" and "--intent" in command:
            self.retirement_calls += 1
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
        self.temporary.cleanup()

    def _driver(self) -> FixtureDriver:
        driver = FixtureDriver(
            self.inputs, host=self.host, repo=ROOT, releases=self.releases,
            stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2,
            clock=lambda: 1234567890.0,
        )
        driver.failpoints = set()
        return driver

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


class DriverTests(DeployFixture):
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
