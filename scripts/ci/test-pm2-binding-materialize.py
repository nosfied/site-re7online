#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/pm2-binding-materialize.py"
REAL_CONTROL = ROOT / "scripts/pm2-definition-control.py"
SPEC = importlib.util.spec_from_file_location("pm2_binding_materialize", SOURCE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value):
    path.write_bytes(MODULE.canonical(value))
    path.chmod(0o600)


WORKER_KEYS = [
    "APP_AUTH_SECRET", "CHANNEL_ACCOUNT_SECRET_KEY", "DATABASE_URL", "NODE_ENV",
    "SMTP_FROM", "SMTP_HOST", "SMTP_PASS", "SMTP_PORT", "SMTP_USER",
    "WEB_PUSH_SUBJECT", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_SESSION_MEDIA_ROOT", "WHATSAPP_WEB_WORKER_CONTROL_HOST",
    "WHATSAPP_WEB_WORKER_CONTROL_PORT", "WHATSAPP_WEB_WORKER_CONTROL_TOKEN",
    "WHATSAPP_WEB_WORKER_CONTROL_URL",
]


class Fixture:
    def __init__(self, role="candidate"):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.role = role
        self.target = "a" * 40
        self.release_id = f"immutable-{role}-release"
        self.release = self.root / self.release_id
        runtime = self.release / "frontend-runtime"
        entry = runtime / "node_modules/next/dist/bin/next"
        entry.parent.mkdir(parents=True)
        entry.write_bytes(b"next-entry")
        (runtime / ".next").mkdir()
        (runtime / ".next/BUILD_ID").write_text(f"{role}-build\n", encoding="ascii")
        entries = [
            {"path": "frontend-runtime", "type": "directory", "mode": 493},
            {"path": "frontend-runtime/.next", "type": "directory", "mode": 493},
            {"path": "frontend-runtime/.next/BUILD_ID", "type": "file", "mode": 420,
             "size": len(f"{role}-build\n"), "sha256": sha(runtime / ".next/BUILD_ID")},
            {"path": "frontend-runtime/node_modules/next/dist/bin/next", "type": "file",
             "mode": 420, "size": 10, "sha256": sha(entry)},
        ]
        index = {"schemaVersion": 1, "scope": ["api-runtime", "frontend-runtime"], "entries": entries}
        index_raw = MODULE.canonical(index)
        (self.release / "index.sha256").write_bytes(index_raw)
        manifest = {
            "releaseId": self.release_id, "targetCommit": self.target,
            "components": ["api", "frontend"],
            "indexSha256": hashlib.sha256(index_raw).hexdigest(),
        }
        (self.release / "manifest.json").write_bytes(MODULE.canonical(manifest))
        self.producer = self.root / "producer.py"
        self.producer.write_text(
            "import json,sys\n"
            "release=sys.argv[sys.argv.index('--release-id')+1]\n"
            "target=sys.argv[sys.argv.index('--target')+1]\n"
            "print(json.dumps({'result':'RELEASE VERIFIED','releaseId':release,'targetCommit':target}))\n"
        )
        self.control = self.root / "control.py"; self.control.write_text("control\n")
        self.request = self.root / "request.json"
        private_json(self.request, {
            "schemaVersion": 2, "scope": "production", "role": role,
            "component": "frontend",
            "sourceKind": "canonical-private-config" if role == "candidate" else "authenticated-proven-definition",
            "environmentKeys": ["BUILD_ID"],
        })
        self.definition = {
            "apps": [{
                "name": "re7-admin-front", "script": "/opt/re7online/current/frontend/node_modules/next/dist/bin/next",
                "args": ["start", "-p", "3000"], "cwd": "/opt/re7online/current/frontend",
                "interpreter": "/usr/bin/node", "exec_mode": "fork_mode", "instances": 1,
                "namespace": "default", "autorestart": True, "restart_delay": 1000,
                "kill_timeout": 5000, "listen_timeout": 10000, "wait_ready": False,
                "node_args": [], "env": {"BUILD_ID": "historical"},
            }]
        }
        self.source = self.root / "source.json"
        private_json(self.source, {
            "schemaVersion": 1, "role": role, "component": "frontend",
            "sourceKind": "canonical-private-config" if role == "candidate" else "authenticated-proven-definition",
            "provenance": {
                "authority": "new-release-config" if role == "candidate" else "proven-production-definition",
                "evidenceSha256": "b" * 64,
            },
            "releaseIdentity": {
                "releaseId": "immutable-historical", "releaseManifestSha256": "c" * 64,
                "componentTreeSha256": "d" * 64, "frontendBuildId": "historical",
                "frontendEntrySha256": "e" * 64,
            },
            "definition": self.definition,
        })
        self.output = self.root / "output"

    def args(self):
        return MODULE.argparse.Namespace(
            role=self.role, component="frontend", target=self.target, release_id=self.release_id,
            release_root=self.release, deployed_marker_sha256=None,
            producer=self.producer, producer_sha256=sha(self.producer),
            control=self.control, control_sha256=sha(self.control),
            template_request=self.request, template_request_sha256=sha(self.request),
            template_source=self.source, template_source_sha256=sha(self.source),
            template_source_identity=None, output=self.output,
        )

    def close(self):
        self.temp.cleanup()


class WorkerFixture(Fixture):
    def __init__(self, role="candidate"):
        super().__init__(role)
        runtime = self.release / "worker-runtime"
        entry = runtime / "dist/whatsapp-web-worker/src/index.js"
        entry.parent.mkdir(parents=True)
        entry.write_text("worker-entry\n")
        index = json.loads((self.release / "index.sha256").read_text())
        index["scope"] = ["api-runtime", "frontend-runtime", "worker-runtime"]
        index["entries"].extend([
            {"path": "worker-runtime", "type": "directory", "mode": 493},
            {"path": "worker-runtime/dist/whatsapp-web-worker/src/index.js", "type": "file",
             "mode": 420, "size": entry.stat().st_size, "sha256": sha(entry)},
        ])
        (self.release / "index.sha256").write_bytes(MODULE.canonical(index))
        manifest = json.loads((self.release / "manifest.json").read_text())
        manifest["components"] = ["api", "frontend", "worker"]
        manifest["indexSha256"] = sha(self.release / "index.sha256")
        (self.release / "manifest.json").write_bytes(MODULE.canonical(manifest))
        private_json(self.request, {
            "schemaVersion": 2, "scope": "production", "role": role,
            "component": "worker", "sourceKind": (
                "canonical-private-config" if role == "candidate" else
                "authenticated-proven-definition"),
            "environmentKeys": WORKER_KEYS,
        })
        environment = {key: f"private-{key}" for key in WORKER_KEYS}
        environment.update({
            "HOME": "/home/deploy", "LANG": "C.UTF-8", "PATH": "/usr/bin",
            "PM2_HOME": "/home/deploy/.pm2", "PM2_JSON_PROCESSING": "true",
            "PM2_USAGE": "CLI", "PWD": "/historical/runtime", "USER": "deploy",
            "re7-whatsapp-web-worker": "{}", "unique_id": "fixture-id",
        })
        self.raw_definition = {"apps": [{
            "name": "re7-whatsapp-web-worker",
            "script": "/historical/runtime/dist/whatsapp-web-worker/src/index.js",
            "args": [], "cwd": "/historical/runtime", "interpreter": "/usr/bin/node",
            "exec_mode": "fork_mode", "instances": 1, "autorestart": True,
            "out_file": "/var/log/re7-worker-out.log",
            "error_file": "/var/log/re7-worker-error.log", "merge_logs": False,
            "watch": False, "env": environment,
        }]}
        private_json(self.source, self.raw_definition)

    def args(self):
        value = super().args()
        value.component = "worker"
        value.template_source_identity = MODULE.physical_identity_literal(
            MODULE.physical_identity(self.source))
        return value


class ApiFixture(Fixture):
    def __init__(self, role="candidate"):
        super().__init__(role)
        runtime = self.release / "api-runtime"
        entry = runtime / "dist/index.js"
        entry.parent.mkdir(parents=True)
        entry.write_text("api-entry\n")
        index = json.loads((self.release / "index.sha256").read_text())
        index["entries"].extend([
            {"path": "api-runtime", "type": "directory", "mode": 493},
            {"path": "api-runtime/dist", "type": "directory", "mode": 493},
            {"path": "api-runtime/dist/index.js", "type": "file", "mode": 420,
             "size": entry.stat().st_size, "sha256": sha(entry)},
        ])
        (self.release / "index.sha256").write_bytes(MODULE.canonical(index))
        manifest = json.loads((self.release / "manifest.json").read_text())
        manifest["indexSha256"] = sha(self.release / "index.sha256")
        (self.release / "manifest.json").write_bytes(MODULE.canonical(manifest))
        self.control = REAL_CONTROL
        self.node = Path(shutil.which("node") or "/usr/bin/node").resolve()
        self.pm2 = self.root / "pm2"
        self.pm2.write_text("#!/bin/sh\nexit 99\n")
        self.pm2.chmod(0o700)
        self.historical_cwd = "/opt/re7online/current/api"
        self.historical_script = self.historical_cwd + "/dist/index.js"
        self.base_environment = {
            "APP_AUTH_SECRET": "fixture-private-secret",
            "NODE_ENV": "production",
        }
        self.config = self.root / "api-candidate.config.cjs"
        self.config.write_text(
            "module.exports=" + json.dumps({"apps": [{
                "name": MODULE.API_PROCESS, "script": self.historical_script,
                "args": [], "cwd": self.historical_cwd, "interpreter": "/usr/bin/node",
                "exec_mode": "fork", "instances": 1, "autorestart": True,
                "node_args": [], "out_file": str(self.root / "api-out.log"),
                "error_file": str(self.root / "api-error.log"),
                "stop_exit_codes": [78], "watch": False, "env": self.base_environment,
            }]}, sort_keys=True, separators=(",", ":")) + ";\n"
        )
        self.config.chmod(0o600)
        self.preparation = self.root / "rotation-preparation.private.json"
        private_json(self.preparation, {
            "result": "OBS2_PRIVATE_DEFINITIONS_READY",
            "files": {"candidate": str(self.config)},
            "onlyObs2Differs": True, "obs1Unchanged": True, "productionChanged": False,
        })
        self.execution = self.root / "rotation-execution.private.json"
        private_json(self.execution, {
            "result": "OBS2_PREVIOUS_VALUE_DESTROYED", "state": "API_STABLE",
            "finalChecks": {"apiOnline": True, "apiCwdPreserved": True},
        })
        self.closure = self.root / "rotation-closure.private.json"
        private_json(self.closure, {
            "result": "OBS2_PREVIOUS_VALUE_DESTROYED",
            "activeDefinitionsReferenceCurrentObs2": True, "inventory": [],
        })
        self.deployment_record = self.root / "template-media-deployment.json"
        self.deployment_record.write_bytes(MODULE.canonical({
            "schemaVersion": 5, "status": "DEPLOYED_VERIFIED",
            "persistentStorage": {
                "templateMediaRoot": "/opt/re7online/content/template-campaign-media"},
        }))
        self.origin = self.root / "api-origin.private.json"
        private_json(self.origin, {
            "schemaVersion": 1, "kind": MODULE.API_ORIGIN_KIND,
            "processName": MODULE.API_PROCESS,
            "canonicalConfig": {"path": str(self.config), "sha256": sha(self.config)},
            "rotation": {
                "preparation": {"path": str(self.preparation), "sha256": sha(self.preparation)},
                "execution": {"path": str(self.execution), "sha256": sha(self.execution)},
                "closure": {"path": str(self.closure), "sha256": sha(self.closure)},
            },
            "functionalOverlay": {
                "deploymentRecord": {"path": str(self.deployment_record),
                                     "sha256": sha(self.deployment_record)},
                "environment": {
                    "TEMPLATE_MEDIA_ROOT": "/opt/re7online/content/template-campaign-media"},
            },
            "persistentRoot": "/opt/re7online/runtime-data/inbox-read-state",
        })

    def pm2_row(self):
        return {"name": MODULE.API_PROCESS, "pm2_env": {
            "pm_cwd": self.historical_cwd, "pm_exec_path": self.historical_script,
            "exec_interpreter": "/usr/bin/node", "exec_mode": "fork_mode",
            "instances": 1, "namespace": "default", "autorestart": True,
            "kill_timeout": 1600, "listen_timeout": 3000, "merge_logs": True,
            "env": {**self.base_environment,
                    "TEMPLATE_MEDIA_ROOT": "/opt/re7online/content/template-campaign-media"},
        }}

    def args(self):
        value = super().args()
        value.component = "api"
        value.template_request = value.template_request_sha256 = None
        value.template_source = value.template_source_sha256 = None
        value.template_source_identity = None
        value.api_origin = self.origin
        value.api_origin_sha256 = sha(self.origin)
        value.persistent_root = Path("/opt/re7online/runtime-data/inbox-read-state")
        value.scope = "isolated-test"
        value.node = self.node
        value.pm2 = self.pm2
        value.pm2_home = self.root / "pm2-home"
        return value


def fake_run_json(command, label):
    if label.startswith("release_verify"):
        release = command[command.index("--release-id") + 1]
        target = command[command.index("--target") + 1]
        return {"result": "RELEASE VERIFIED", "releaseId": release, "targetCommit": target}
    if label in {"template_binding_validation", "rebound_binding_build"}:
        output = Path(command[command.index("--output") + 1])
        source = json.loads(Path(command[command.index("--source-artifact") + 1]).read_text())
        output.write_bytes(MODULE.canonical(source["definition"])); output.chmod(0o600)
        return {"result": "PM2_DEFINITION_BUILT"}
    raise AssertionError(label)


class MaterializeTests(unittest.TestCase):
    def test_api_origin_produces_candidate_and_rollback_pair_without_copying_pm2(self):
        candidate, rollback = ApiFixture("candidate"), ApiFixture("rollback")
        try:
            for fixture in (candidate, rollback):
                with mock.patch.object(MODULE, "pm2_row", return_value=fixture.pm2_row()):
                    result = MODULE.materialize(fixture.args())
                self.assertEqual("PM2_DEFINITION_BUILT", result["controlResult"])
                source = json.loads((fixture.output / "source.private.json").read_text())
                app = source["definition"]["apps"][0]
                self.assertEqual("/opt/re7online/current/api", app["cwd"])
                self.assertEqual("/opt/re7online/current/api/dist/index.js", app["script"])
                self.assertEqual("/opt/re7online/runtime-data/inbox-read-state",
                                 app["env"]["INBOX_READ_STATE_ROOT"])
                self.assertEqual("/opt/re7online/content/template-campaign-media",
                                 app["env"]["TEMPLATE_MEDIA_ROOT"])
                for optional in ("APP_BASE_URL", "META_APP_ID", "META_APP_ID_FALLBACK_MODE",
                                 "META_GRAPH_API_VERSION", "PUBLIC_APP_BASE_URL",
                                 "SMTP_PASSWORD", "SMTP_SECURE", "TZ", "WHATSAPP_WABA_ID"):
                    self.assertNotIn(optional, app["env"])
                evidence = json.loads((fixture.output / "binding-evidence.private.json").read_text())
                self.assertTrue(evidence["pm2IntrospectionUsed"])
                self.assertEqual("comparison-only", evidence["pm2IntrospectionPurpose"])
            result = MODULE.run_json([
                "python3", str(REAL_CONTROL), "validate-pair",
                "--candidate-request", str(candidate.output / "request.private.json"),
                "--candidate-source-artifact", str(candidate.output / "source.private.json"),
                "--candidate-source-sha256", sha(candidate.output / "source.private.json"),
                "--candidate-definition", str(candidate.output / "definition.private.json"),
                "--rollback-request", str(rollback.output / "request.private.json"),
                "--rollback-source-artifact", str(rollback.output / "source.private.json"),
                "--rollback-source-sha256", sha(rollback.output / "source.private.json"),
                "--rollback-definition", str(rollback.output / "definition.private.json"),
            ], "api_pair")
            self.assertEqual("PM2_DEFINITION_PAIR_VALID", result["result"])
            self.assertEqual("api", result["component"])
        finally:
            candidate.close(); rollback.close()

    def test_api_origin_rejects_live_drift_tampering_and_removed_source(self):
        fixture = ApiFixture()
        try:
            drifted = fixture.pm2_row()
            drifted["pm2_env"]["env"]["APP_AUTH_SECRET"] = "divergent"
            with mock.patch.object(MODULE, "pm2_row", return_value=drifted):
                with self.assertRaisesRegex(MODULE.Denied, "api_pm2_functional_environment_drift"):
                    MODULE.materialize(fixture.args())
            args = fixture.args(); args.api_origin_sha256 = "0" * 64
            with self.assertRaisesRegex(MODULE.Denied, "api_origin_sha256_mismatch"):
                MODULE.materialize(args)
            closure = json.loads(fixture.closure.read_text())
            closure["inventory"] = [{"path": str(fixture.config),
                                      "finalDisposition": "REMOVED"}]
            private_json(fixture.closure, closure)
            origin = json.loads(fixture.origin.read_text())
            origin["rotation"]["closure"]["sha256"] = sha(fixture.closure)
            private_json(fixture.origin, origin)
            with self.assertRaisesRegex(MODULE.Denied, "api_rotation_closure_authority"):
                MODULE.materialize(fixture.args())
        finally:
            fixture.close()

    def test_api_origin_rejects_authorized_but_non_allowlisted_environment(self):
        fixture = ApiFixture()
        try:
            raw = fixture.config.read_text().strip()
            configuration = json.loads(raw.removeprefix("module.exports=").removesuffix(";"))
            configuration["apps"][0]["env"]["UNAUTHORIZED_VALUE"] = "denied"
            fixture.config.write_text(
                "module.exports=" + json.dumps(
                    configuration, sort_keys=True, separators=(",", ":")) + ";\n")
            origin = json.loads(fixture.origin.read_text())
            origin["canonicalConfig"]["sha256"] = sha(fixture.config)
            private_json(fixture.origin, origin)
            live = fixture.pm2_row()
            live["pm2_env"]["env"]["UNAUTHORIZED_VALUE"] = "denied"
            with mock.patch.object(MODULE, "pm2_row", return_value=live):
                with self.assertRaisesRegex(
                        MODULE.Denied, "api_configuration_environment_allowlist"):
                    MODULE.materialize(fixture.args())
        finally:
            fixture.close()

    def test_rebinds_exact_definition_to_verified_release_without_pm2(self):
        fixture = Fixture()
        try:
            with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                result = MODULE.materialize(fixture.args())
            self.assertEqual("PM2_BINDING_MATERIALIZED", result["result"])
            rebound = json.loads((fixture.output / "source.private.json").read_text())
            evidence = json.loads((fixture.output / "binding-evidence.private.json").read_text())
            self.assertEqual(fixture.definition, rebound["definition"])
            self.assertEqual(fixture.release_id, rebound["releaseIdentity"]["releaseId"])
            self.assertEqual("candidate-build", rebound["releaseIdentity"]["frontendBuildId"])
            self.assertNotEqual("immutable-historical", rebound["releaseIdentity"]["releaseId"])
            self.assertFalse(evidence["pm2IntrospectionUsed"])
            self.assertEqual(sha(fixture.output / "binding-evidence.private.json"),
                             rebound["provenance"]["evidenceSha256"])
            self.assertEqual(0o600, (fixture.output / "definition.private.json").stat().st_mode & 0o777)
        finally:
            fixture.close()

    def test_rejects_release_manifest_identity_mismatch(self):
        fixture = Fixture()
        try:
            manifest = json.loads((fixture.release / "manifest.json").read_text())
            manifest["releaseId"] = "immutable-wrong"
            (fixture.release / "manifest.json").write_bytes(MODULE.canonical(manifest))
            with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                with self.assertRaisesRegex(MODULE.Denied, "release_manifest_identity"):
                    MODULE.materialize(fixture.args())
            self.assertFalse(fixture.output.exists())
        finally:
            fixture.close()

    def test_rejects_template_digest_and_symlink(self):
        fixture = Fixture()
        try:
            args = fixture.args(); args.template_source_sha256 = "0" * 64
            with self.assertRaisesRegex(MODULE.Denied, "template_source_sha256_mismatch"):
                MODULE.materialize(args)
            link = fixture.root / "source-link.json"; link.symlink_to(fixture.source)
            args = fixture.args(); args.template_source = link
            with self.assertRaises(MODULE.Denied):
                MODULE.materialize(args)
        finally:
            fixture.close()

    def test_rejects_overwrite_and_release_drift(self):
        fixture = Fixture()
        try:
            fixture.output.mkdir()
            with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                with self.assertRaises(OSError):
                    MODULE.materialize(fixture.args())
            fixture.output.rmdir()
            calls = {"verify": 0}
            def drift(command, label):
                value = fake_run_json(command, label)
                if label.startswith("release_verify"):
                    calls["verify"] += 1
                    value["observation"] = calls["verify"]
                return value
            with mock.patch.object(MODULE, "run_json", side_effect=drift):
                with self.assertRaisesRegex(MODULE.Denied, "release_verification_drift"):
                    MODULE.materialize(fixture.args())
        finally:
            fixture.close()

    def test_candidate_and_rollback_evidence_are_distinct(self):
        first, second = Fixture("candidate"), Fixture("rollback")
        try:
            with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                a = MODULE.materialize(first.args()); b = MODULE.materialize(second.args())
            self.assertNotEqual(a["evidenceSha256"], b["evidenceSha256"])
            self.assertNotEqual(a["sourceSha256"], b["sourceSha256"])
        finally:
            first.close(); second.close()

    def test_rollback_accepts_only_an_explicit_authenticated_deployed_marker(self):
        fixture = Fixture("rollback")
        try:
            marker = fixture.release / "DEPLOYED"; marker.write_text('{"state":"DEPLOYED"}\n'); marker.chmod(0o600)
            with self.assertRaisesRegex(MODULE.Denied, "deployed_marker_sha256_required"):
                MODULE.materialize(fixture.args())
            args = fixture.args(); args.deployed_marker_sha256 = sha(marker)
            with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                result = MODULE.materialize(args)
            self.assertEqual("PM2_BINDING_MATERIALIZED", result["result"])
            candidate = Fixture("candidate")
            try:
                candidate_args = candidate.args(); candidate_args.deployed_marker_sha256 = "a" * 64
                with self.assertRaisesRegex(MODULE.Denied, "candidate_operational_marker_forbidden"):
                    MODULE.materialize(candidate_args)
            finally:
                candidate.close()
        finally:
            fixture.close()

    @unittest.skipUnless(REAL_CONTROL.exists(), "repository control plane unavailable")
    def test_generated_binding_is_accepted_by_real_control_plane(self):
        fixture = Fixture()
        try:
            fixture.control = REAL_CONTROL
            result = MODULE.materialize(fixture.args())
            self.assertEqual("PM2_DEFINITION_BUILT", result["controlResult"])
            self.assertEqual(MODULE.canonical(fixture.definition),
                             (fixture.output / "definition.private.json").read_bytes())
        finally:
            fixture.close()

    @unittest.skipUnless(REAL_CONTROL.exists(), "repository control plane unavailable")
    def test_worker_legacy_authority_is_projected_to_exact_closed_environment(self):
        fixture = WorkerFixture()
        try:
            fixture.control = REAL_CONTROL
            result = MODULE.materialize(fixture.args())
            self.assertEqual("worker", result["component"])
            source = json.loads((fixture.output / "source.private.json").read_text())
            app = source["definition"]["apps"][0]
            self.assertEqual(set(WORKER_KEYS), set(app["env"]))
            self.assertNotIn("PWD", app["env"])
            self.assertNotIn("PM2_HOME", app["env"])
            self.assertEqual([], app["args"])
            self.assertEqual("/opt/re7online/current/worker", app["cwd"])
            self.assertEqual(0, app["restart_delay"])
            self.assertEqual(1600, app["kill_timeout"])
            self.assertEqual(3000, app["listen_timeout"])
            self.assertEqual("PM2_DEFINITION_BUILT", result["controlResult"])
        finally:
            fixture.close()

    def test_worker_projection_rejects_extra_missing_and_changed_authority(self):
        for mutation, predicate in (
            (lambda env: env.__setitem__("UNAUTHENTICATED", "value"),
             "legacy_worker_environment_coverage"),
            (lambda env: env.pop("APP_AUTH_SECRET"),
             "legacy_worker_environment_coverage"),
        ):
            fixture = WorkerFixture()
            try:
                raw = json.loads(fixture.source.read_text())
                mutation(raw["apps"][0]["env"])
                private_json(fixture.source, raw)
                args = fixture.args(); args.template_source_sha256 = sha(fixture.source)
                with mock.patch.object(MODULE, "run_json", side_effect=fake_run_json):
                    with self.assertRaisesRegex(MODULE.Denied, predicate):
                        MODULE.materialize(args)
            finally:
                fixture.close()

        fixture = WorkerFixture()
        try:
            args = fixture.args(); args.template_source_sha256 = "0" * 64
            with self.assertRaisesRegex(MODULE.Denied, "template_source_sha256_mismatch"):
                MODULE.materialize(args)
        finally:
            fixture.close()

        fixture = WorkerFixture()
        try:
            args = fixture.args(); args.template_source_identity = "1:2:3:4:0600"
            with self.assertRaisesRegex(MODULE.Denied, "template_source_physical_identity"):
                MODULE.materialize(args)
        finally:
            fixture.close()

    @unittest.skipUnless(REAL_CONTROL.exists(), "repository control plane unavailable")
    def test_worker_candidate_and_rollback_materialize_and_validate_as_a_pair(self):
        candidate, rollback = WorkerFixture("candidate"), WorkerFixture("rollback")
        try:
            for fixture in (candidate, rollback):
                fixture.control = REAL_CONTROL
                MODULE.materialize(fixture.args())
            result = MODULE.run_json([
                "python3", str(REAL_CONTROL), "validate-pair",
                "--candidate-request", str(candidate.output / "request.private.json"),
                "--candidate-source-artifact", str(candidate.output / "source.private.json"),
                "--candidate-source-sha256", sha(candidate.output / "source.private.json"),
                "--candidate-definition", str(candidate.output / "definition.private.json"),
                "--rollback-request", str(rollback.output / "request.private.json"),
                "--rollback-source-artifact", str(rollback.output / "source.private.json"),
                "--rollback-source-sha256", sha(rollback.output / "source.private.json"),
                "--rollback-definition", str(rollback.output / "definition.private.json"),
            ], "worker_pair")
            self.assertEqual("PM2_DEFINITION_PAIR_VALID", result["result"])
            self.assertEqual("worker", result["component"])
        finally:
            candidate.close(); rollback.close()

    @unittest.skipUnless(REAL_CONTROL.exists(), "repository control plane unavailable")
    def test_worker_rollback_accepts_closed_legacy_release_authority(self):
        fixture = WorkerFixture("rollback")
        try:
            fixture.control = REAL_CONTROL
            modern_manifest = fixture.release / "manifest.json"
            modern_index = fixture.release / "index.sha256"
            index = json.loads(modern_index.read_text())
            legacy_index = fixture.release / "release-index.json"
            legacy_index.write_bytes(MODULE.canonical({
                "schemaVersion": 1, "targetCommit": fixture.target,
                "entries": index["entries"],
            }))
            entry = fixture.release / "worker-runtime/dist/whatsapp-web-worker/src/index.js"
            relative = "worker-runtime/dist/whatsapp-web-worker/src/index.js"
            legacy_manifest = fixture.release / "release-manifest.json"
            legacy_manifest.write_bytes(MODULE.canonical({
                "schemaVersion": 1, "releaseId": fixture.release_id,
                "targetCommit": fixture.target,
                "components": ["api", "frontend", "worker"],
                "runtimeIndexSha256": sha(legacy_index),
                "workerEntrypoint": relative, "workerEntrypointSha256": sha(entry),
            }))
            modern_manifest.unlink(); modern_index.unlink()
            marker = fixture.release / "DEPLOYED"; marker.write_text("DEPLOYED\n")
            args = fixture.args(); args.deployed_marker_sha256 = sha(marker)
            result = MODULE.materialize(args)
            evidence = json.loads((fixture.output / "binding-evidence.private.json").read_text())
            self.assertEqual("legacy-enumerated-release", evidence["releaseAuthorityKind"])
            self.assertEqual("release-manifest.json", evidence["releaseManifestName"])
            self.assertEqual("release-index.json", evidence["releaseIndexName"])
            self.assertEqual("PM2_DEFINITION_BUILT", result["controlResult"])
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
