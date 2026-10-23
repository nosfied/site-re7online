#!/usr/bin/env python3
"""Behavioral tests for the minimal deploy coordinator; no production I/O."""

from __future__ import annotations

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
    for runtime in deploy.RUNTIME_DIR.values():
        base = root / runtime
        for path in [base, *sorted(base.rglob("*"))]:
            info = path.lstat()
            item: dict[str, Any] = {"path": path.relative_to(root).as_posix(),
                                    "mode": stat.S_IMODE(info.st_mode)}
            if path.is_symlink(): item.update(type="symlink", target=os.readlink(path))
            elif path.is_dir(): item["type"] = "directory"
            else: item.update(type="file", size=info.st_size, sha256=sha(path))
            entries.append(item)
    return {"schemaVersion": 1, "scope": list(deploy.RUNTIME_DIR.values()), "entries": entries}


class FakeHost(deploy.Host):
    def __init__(self, control_plane: str):
        self.control_plane = control_plane
        self.rows: dict[str, dict[str, Any]] = {}
        self.events: list[str] = []
        self.wait_fail: str | None = None
        self.wait_relation = "DIRECT"
        self.wait_family = "IPv4"
        self.wait_delay = 0.0
        self.pid = 100
        self.dump: Path | None = None
        self.external_calls = 0
        self.save_calls = 0

    def run(self, command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
        if command[:4] == ["git", "-C", str(ROOT), "rev-parse"]:
            return subprocess.CompletedProcess(command, 0, self.control_plane + "\n", "")
        if command[:4] == ["git", "-C", str(ROOT), "status"]:
            return subprocess.CompletedProcess(command, 0, "", "")
        if command[-1:] == ["--version"]:
            return subprocess.CompletedProcess(command, 0, "6.0.14\n", "")
        return subprocess.run(command, text=True, capture_output=True, timeout=timeout, check=False)

    def get(self, url: str, timeout: float = 10) -> int:
        self.events.append("get:" + url)
        if not (url.startswith("http://127.0.0.1:") or url.startswith("https://converta.re7online.com/")):
            self.external_calls += 1
        return 200

    def pm2_rows(self, pm2: Path) -> list[dict[str, Any]]:
        return list(self.rows.values())

    def pm2_mutate(self, pm2: Path, args: list[str]) -> None:
        self.events.append("pm2:" + ":".join(args[:2]))
        if args[0] == "delete":
            self.rows.pop(args[1], None)
        elif args[0] == "start":
            definition = json.loads(Path(args[1]).read_text())["apps"][0]
            self.pid += 1
            self.rows[definition["name"]] = {
                "name": definition["name"], "pid": self.pid,
                "pm2_env": {"status": "online", "pm_cwd": definition["cwd"],
                            "pm_exec_path": definition["script"], "restart_time": 0,
                            **definition},
            }
        elif args == ["save"]:
            assert self.dump is not None
            self.save_calls += 1
            self.dump.write_text(json.dumps(list(self.rows.values()), sort_keys=True) + "\n")
            self.dump.chmod(0o600)
            self.events.append("dump:saved")

    def control(self, root: Path, args: list[str]) -> dict[str, Any]:
        if args[0] != "wait-readiness":
            return super().control(root, args)
        request = Path(args[args.index("--request") + 1])
        component = request.name.split("-", 1)[0]
        role = "rollback" if "-rollback." in request.name else "candidate"
        self.events.append(f"wait:{component}:{role}")
        if self.wait_fail == component and role == "candidate":
            raise deploy.Denied(f"READINESS_TIMEOUT:{component}:{deploy.PORT[component]}")
        row = self.rows[component]
        return {
            "result": "READINESS_PASS", "component": component,
            "pid": row["pid"], "startTicks": row["pid"] * 100,
            "stableSamples": 3, "totalSamples": 3, "stabilityResets": 0,
            "elapsedSeconds": self.wait_delay, "socketFamily": self.wait_family,
            "socketOwnerRelation": self.wait_relation,
            "healthStartedMonotonic": 5.0, "socketStableMonotonic": 4.0,
        }


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
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.config = self.base / "config"
        self.config.mkdir(mode=0o700)
        self.transaction = self.base / "transaction"
        self.releases = self.base / "releases"
        self.current = self.base / "current"
        self.current.mkdir()
        self.candidate = "immutable-candidate"
        self.rollback = "immutable-rollback"
        self.target = "a" * 40
        self.control_plane = "b" * 40
        self.pm2 = self.base / "pm2"
        self.pm2.write_text("fixture\n"); self.pm2.chmod(0o700)
        self.dump = self.base / "dump.pm2"
        self.dump.write_text("[]\n"); self.dump.chmod(0o600)
        self.lock = self.base / "deploy.lock"
        self.stable = {"api": self.current / "api", "frontend": self.current / "frontend"}
        self.host = FakeHost(self.control_plane); self.host.dump = self.dump
        self._release(self.rollback, "rollback-build", "c" * 40)
        candidate_manifest_sha = self._release(self.candidate, "candidate-build", self.target)
        for component in deploy.COMPONENTS:
            os.symlink(self.releases / self.rollback / deploy.RUNTIME_DIR[component], self.stable[component])
            self._bindings(component, candidate_manifest_sha)
        files = {}
        for path in self.config.iterdir():
            if path.name != "manifest.private.json": files[path.name] = sha(path)
        put(self.config / "manifest.private.json", {"schemaVersion": 1, "files": files})
        self.config_manifest_sha = sha(self.config / "manifest.private.json")
        self.host.rows = {
            "api": self._row("api", 11), "frontend": self._row("frontend", 12),
            "re7-whatsapp-web-worker": self._row("re7-whatsapp-web-worker", 13),
        }
        self.inputs = deploy.Inputs(self.candidate, self.target, self.control_plane,
                                    deploy.COMPONENTS, self.config, self.transaction,
                                    self.config_manifest_sha)
        self.driver = FixtureDriver(self.inputs, host=self.host, repo=ROOT,
                                    releases=self.releases, stable=self.stable,
                                    lock=self.lock, dump=self.dump, pm2=self.pm2,
                                    clock=lambda: 1234567890.0)
        self.driver.failpoints = set()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _release(self, release: str, build_id: str, target: str) -> str:
        root = self.releases / release
        for component in deploy.COMPONENTS:
            runtime = root / deploy.RUNTIME_DIR[component]
            runtime.mkdir(parents=True)
            (runtime / "dist").mkdir(exist_ok=True)
            (runtime / "dist/index.js").write_text("api\n")
            (runtime / "node_modules/next/dist/bin").mkdir(parents=True, exist_ok=True)
            (runtime / "node_modules/next/dist/bin/next").write_text("next\n")
            (runtime / ".next").mkdir(exist_ok=True)
            (runtime / ".next/BUILD_ID").write_text(build_id + "\n")
            (runtime / ".next/static/chunks").mkdir(parents=True, exist_ok=True)
            (runtime / ".next/static/chunks/app.js").write_text("asset\n")
        put(root / "index.sha256", release_index(root), 0o444)
        put(root / "manifest.json", {"targetCommit": target, "components": ["api", "frontend"],
                                     "indexSha256": sha(root / "index.sha256")}, 0o444)
        return sha(root / "manifest.json")

    def _definition(self, component: str) -> dict[str, Any]:
        cwd = self.stable[component]
        script = cwd / ("dist/index.js" if component == "api" else "node_modules/next/dist/bin/next")
        return {"apps": [{
            "name": component, "script": str(script),
            "args": [] if component == "api" else ["start", "-p", "3000"],
            "cwd": str(cwd), "interpreter": "/usr/bin/node", "exec_mode": "fork_mode",
            "instances": 1, "namespace": "converta", "autorestart": True,
            "restart_delay": 0, "kill_timeout": 5000, "listen_timeout": 10000,
            "wait_ready": False, "node_args": [], "merge_logs": True, "watch": False,
            "out_file": str(self.base / f"{component}.out.log"),
            "error_file": str(self.base / f"{component}.err.log"), "env": {},
        }]}

    def _bindings(self, component: str, candidate_manifest_sha: str) -> None:
        definition = self._definition(component)
        for role, release, manifest_sha, evidence in (
            ("candidate", self.candidate, candidate_manifest_sha, "1" * 64),
            ("rollback", self.rollback, "2" * 64, "3" * 64),
        ):
            source_kind = "canonical-private-config" if role == "candidate" else "authenticated-proven-definition"
            authority = "new-release-config" if role == "candidate" else "proven-production-definition"
            request = {"schemaVersion": 2, "scope": "production", "role": role,
                       "component": component, "sourceKind": source_kind, "environmentKeys": []}
            identity = {"releaseId": release, "releaseManifestSha256": manifest_sha,
                        "componentTreeSha256": ("4" if role == "candidate" else "5") * 64}
            if component == "api": identity["apiEntrySha256"] = "6" * 64
            else:
                identity["frontendBuildId"] = "candidate-build" if role == "candidate" else "rollback-build"
                identity["frontendEntrySha256"] = "7" * 64
            source = {"schemaVersion": 1, "role": role, "component": component,
                      "sourceKind": source_kind, "provenance": {"authority": authority, "evidenceSha256": evidence},
                      "releaseIdentity": identity, "definition": definition}
            put(self.config / f"{component}-{role}.request.private.json", request)
            put(self.config / f"{component}-{role}.source.private.json", source)
            put(self.config / f"{component}-{role}.pm2.private.json", definition)

    def _row(self, name: str, pid: int) -> dict[str, Any]:
        if name in self.stable:
            definition = self._definition(name)["apps"][0]
            cwd, script = definition["cwd"], definition["script"]
        else:
            cwd, script = str(self.base / "worker"), str(self.base / "worker/index.js")
        env: dict[str, Any] = {"status": "online", "pm_cwd": cwd,
                               "pm_exec_path": script, "restart_time": 0}
        if name in self.stable: env.update(self._definition(name)["apps"][0])
        return {"name": name, "pid": pid, "pm2_env": env}

    def acceptance(self) -> None:
        self.driver.acceptance.write_text("ACEITE TÉCNICO PASS\n")
        self.driver.acceptance.chmod(0o600)


class DriverTests(DeployFixture):
    def test_happy_path_delayed_ipv6_direct_save_once_and_marker_after_dump(self) -> None:
        self.host.wait_delay = 4.1; self.host.wait_family = "IPv6"; self.host.wait_relation = "DIRECT"
        self.driver.preflight(); self.assertEqual(self.driver._journal_read()["state"], "PREFLIGHT_PASS")
        self.driver.activate(); self.assertEqual(self.driver._journal_read()["state"], "AWAITING_ACCEPTANCE")
        self.assertNotIn("pm2:save", self.host.events); self.assertFalse((self.driver.release_root / "DEPLOYED").exists())
        self.assertTrue(any("/_next/static/" in event for event in self.host.events))
        self.acceptance(); self.driver.finalize()
        journal = self.driver._journal_read()
        self.assertEqual(journal["state"], "DEPLOYED"); self.assertEqual(journal["saveCount"], 1)
        self.assertEqual(self.host.events.count("pm2:save"), 1)
        marker = self.driver.release_root / "DEPLOYED"
        self.assertLess(self.host.events.index("dump:saved"), len(self.host.events))
        self.assertTrue(marker.is_file())
        self.assertEqual(json.loads(marker.read_text())["dumpSha256"], sha(self.dump))
        self.assertFalse(self.lock.exists()); self.assertEqual(self.host.external_calls, 0)

    def test_descendant_socket_contract_is_forwarded_without_early_save(self) -> None:
        self.host.wait_relation = "DESCENDANT"
        self.driver.preflight(); self.driver.activate()
        readiness = self.driver._journal_read()["candidate"]["readiness"]
        self.assertEqual(readiness["api"]["socketOwnerRelation"], "DESCENDANT")
        self.assertEqual(readiness["frontend"]["socketOwnerRelation"], "DESCENDANT")
        self.assertEqual(self.host.events.count("pm2:save"), 0)

    def test_api_timeout_rolls_back_integrally_without_save(self) -> None:
        original = {key: path.resolve() for key, path in self.stable.items()}
        self.host.wait_fail = "api"; self.driver.preflight()
        with self.assertRaises(deploy.Denied): self.driver.activate()
        self.assertEqual(self.driver._journal_read()["state"], "ROLLED_BACK")
        self.assertEqual({key: path.resolve() for key, path in self.stable.items()}, original)
        self.assertEqual(self.host.events.count("pm2:save"), 0)

    def test_frontend_timeout_after_api_rolls_back_both_without_save(self) -> None:
        original = {key: path.resolve() for key, path in self.stable.items()}
        self.host.wait_fail = "frontend"; self.driver.preflight()
        with self.assertRaises(deploy.Denied): self.driver.activate()
        self.assertEqual({key: path.resolve() for key, path in self.stable.items()}, original)
        self.assertIn("wait:api:candidate", self.host.events)
        self.assertIn("wait:frontend:rollback", self.host.events)
        self.assertEqual(self.host.events.count("pm2:save"), 0)

    def test_worker_change_denies_and_fails_closed_without_save(self) -> None:
        self.driver.preflight()
        original_select = self.driver._select
        def select(component: str, role: str):
            result = original_select(component, role)
            if component == "frontend" and role == "candidate": self.host.rows["re7-whatsapp-web-worker"]["pid"] += 1
            return result
        self.driver._select = select  # type: ignore[method-assign]
        with self.assertRaises(deploy.Denied): self.driver.activate()
        self.assertEqual(self.driver._journal_read()["state"], "FAILED")
        self.assertEqual(self.host.events.count("pm2:save"), 0)

    def test_finalize_replay_and_binding_drift_are_denied(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance(); self.driver.finalize()
        with self.assertRaises(deploy.Denied): self.driver.finalize()
        other = deploy.Inputs("other-release", self.target, self.control_plane, deploy.COMPONENTS,
                              self.config, self.transaction, self.config_manifest_sha)
        with self.assertRaises(deploy.Denied): FixtureDriver(other, host=self.host, repo=ROOT,
            releases=self.releases, stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2).status()
        self.assertEqual(self.host.events.count("pm2:save"), 1)

    def test_finalize_denies_pid_change_without_save_or_marker(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        self.host.rows["api"]["pid"] += 1000
        with self.assertRaisesRegex(deploy.Denied, "finalize_identity_changed:api:pid"):
            self.driver.finalize()
        self.assertEqual(self.host.events.count("pm2:save"), 0)
        self.assertFalse((self.driver.release_root / "DEPLOYED").exists())

    def test_finalize_requires_exact_private_acceptance(self) -> None:
        self.driver.preflight(); self.driver.activate()
        self.driver.acceptance.write_text("ACEITE TÉCNICO PENDENTE\n")
        self.driver.acceptance.chmod(0o600)
        with self.assertRaisesRegex(deploy.Denied, "technical_acceptance"):
            self.driver.finalize()
        self.assertEqual(self.host.events.count("pm2:save"), 0)
        self.assertFalse((self.driver.release_root / "DEPLOYED").exists())

    def test_preflight_does_not_request_candidate_asset(self) -> None:
        self.driver.preflight()
        self.assertFalse(any("/_next/static/" in event for event in self.host.events))

    def test_manual_rollback_restores_and_never_saves(self) -> None:
        original = {key: path.resolve() for key, path in self.stable.items()}
        self.driver.preflight(); self.driver.activate(); self.driver.rollback()
        self.assertEqual({key: path.resolve() for key, path in self.stable.items()}, original)
        self.assertEqual(self.driver._journal_read()["state"], "ROLLED_BACK")
        self.assertEqual(self.host.events.count("pm2:save"), 0)

    def test_pid_churn_is_delegated_to_versioned_readiness(self) -> None:
        self.driver.preflight(); self.driver.activate()
        waits = [event for event in self.host.events if event.startswith("wait:")]
        self.assertEqual(waits, ["wait:api:candidate", "wait:frontend:candidate"])
        control = (ROOT / "scripts/pm2-definition-control.py").read_text()
        self.assertIn("resets += 1", control)
        self.assertIn("READINESS_TIMEOUT:{component}:{port}", control)

    def test_private_journal_no_environment_and_no_production_port_listener(self) -> None:
        self.driver.preflight(); self.driver.activate()
        text = self.driver.journal.read_text()
        self.assertNotIn('"env"', text); self.assertNotIn("token", text.lower())
        self.assertNotIn("cookie", text.lower()); self.assertEqual(self.host.external_calls, 0)
        self.assertFalse(any(event.startswith("listen:") for event in self.host.events))
        self.assertEqual(stat.S_IMODE(self.driver.journal.stat().st_mode), 0o600)

    def test_external_manifest_digest_authenticates_config_and_binding(self) -> None:
        self.driver.preflight()
        source = self.config / "api-candidate.source.private.json"
        source.write_text(source.read_text() + " ")
        manifest = read_json_fixture(self.config / "manifest.private.json")
        manifest["files"][source.name] = sha(source)
        put(self.config / "manifest.private.json", manifest)
        with self.assertRaisesRegex(deploy.Denied, "config_manifest_sha256_mismatch"):
            self.driver.activate()
        drift = deploy.Inputs(self.candidate, self.target, self.control_plane, deploy.COMPONENTS,
                              self.config, self.transaction, "f" * 64)
        with self.assertRaisesRegex(deploy.Denied, "transaction_binding"):
            FixtureDriver(drift, host=self.host, repo=ROOT, releases=self.releases,
                          stable=self.stable, lock=self.lock, dump=self.dump, pm2=self.pm2).status()

    def test_release_index_denies_mutation_and_extra_entry(self) -> None:
        target = self.driver.release_root / "api-runtime/dist/index.js"
        target.write_text("changed\n")
        with self.assertRaisesRegex(deploy.Denied, "release_index_mismatch"):
            self.driver.preflight()

    def test_release_index_denies_unindexed_entry(self) -> None:
        (self.driver.release_root / "frontend-runtime/unexpected.txt").write_text("x")
        with self.assertRaisesRegex(deploy.Denied, "release_index_inventory"):
            self.driver.preflight()

    def test_release_index_denies_mode_drift_and_symlink_escape(self) -> None:
        target = self.driver.release_root / "api-runtime/dist/index.js"
        target.chmod(0o755)
        with self.assertRaisesRegex(deploy.Denied, "release_index_mismatch"):
            self.driver.preflight()
        target.unlink(); os.symlink(self.base / "outside", target)
        (self.base / "outside").write_text("outside")
        with self.assertRaisesRegex(deploy.Denied, "release_symlink_escape"):
            self.driver.preflight()

    def _finalize_fault(self, point: str) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        self.driver.failpoints.add(point)
        with self.assertRaisesRegex(deploy.Denied, f"injected:{point}"):
            self.driver.finalize()
        failed = self.driver._journal_read()
        self.assertEqual(failed["state"], "FAILED")
        self.assertNotEqual(failed["state"], "DEPLOYED")
        self.driver.finalize()
        final = self.driver._journal_read()
        self.assertEqual(final["state"], "DEPLOYED")
        self.assertEqual(self.host.save_calls, 1)
        self.assertFalse(self.lock.exists())
        self.assertTrue((self.driver.release_root / "DEPLOYED").is_file())
        self.assertEqual(final["finalDumpSha256"], sha(self.dump))

    def test_finalize_resumes_before_save(self) -> None: self._finalize_fault("before_save")
    def test_finalize_resumes_immediately_after_save(self) -> None: self._finalize_fault("after_save")
    def test_finalize_resumes_during_dump_validation(self) -> None: self._finalize_fault("dump_validation")
    def test_finalize_resumes_during_marker_rename(self) -> None: self._finalize_fault("marker_rename")
    def test_finalize_resumes_during_lock_release(self) -> None: self._finalize_fault("lock_release")
    def test_finalize_resumes_during_final_journal(self) -> None: self._finalize_fault("final_journal")

    def _rollback_fault(self, component: str) -> None:
        original = {key: path.resolve() for key, path in self.stable.items()}
        self.driver.preflight(); self.driver.activate()
        self.driver.failpoints.add(f"rollback_after_{component}")
        with self.assertRaisesRegex(deploy.Denied, f"injected:rollback_after_{component}"):
            self.driver.rollback()
        failed = self.driver._journal_read()
        self.assertEqual(failed["state"], "FAILED")
        self.assertEqual(failed["recoveryAction"], "rollback")
        self.assertTrue(self.lock.exists())
        self.driver.rollback()
        self.assertEqual(self.driver._journal_read()["state"], "ROLLED_BACK")
        self.assertEqual({key: path.resolve() for key, path in self.stable.items()}, original)
        self.assertEqual(self.host.save_calls, 0)
        self.assertFalse(self.lock.exists())

    def test_rollback_resumes_after_frontend(self) -> None: self._rollback_fault("frontend")
    def test_rollback_resumes_after_api(self) -> None: self._rollback_fault("api")

    def test_common_rollback_denied_after_candidate_dump_persisted(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        self.driver.failpoints.add("after_save")
        with self.assertRaises(deploy.Denied): self.driver.finalize()
        with self.assertRaisesRegex(deploy.Denied, "rollback_failed_state_owner"):
            self.driver.rollback()
        self.assertEqual(self.host.save_calls, 1)

    def test_rollback_detects_candidate_dump_even_without_save_checkpoint(self) -> None:
        self.driver.preflight(); self.driver.activate()
        self.host.pm2_mutate(self.pm2, ["save"])
        with self.assertRaisesRegex(deploy.Denied, "rollback_after_candidate_dump"):
            self.driver.rollback()
        self.assertTrue(self.lock.exists())

    def test_preexisting_marker_is_denied_before_save(self) -> None:
        self.driver.preflight(); self.driver.activate(); self.acceptance()
        (self.driver.release_root / "DEPLOYED").write_text("preexisting\n")
        with self.assertRaisesRegex(deploy.Denied, "deployed_marker_exists"):
            self.driver.finalize()
        self.assertEqual(self.host.save_calls, 0)
        self.assertEqual(self.driver._journal_read()["state"], "FAILED")


def read_json_fixture(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    assert isinstance(value, dict)
    return value


if __name__ == "__main__":
    unittest.main(verbosity=2)
