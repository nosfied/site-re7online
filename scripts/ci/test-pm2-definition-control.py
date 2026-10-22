#!/usr/bin/env python3
"""Regression tests for PM2 definition source provenance and namespace safety."""

import argparse
import copy
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

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/pm2-definition-control.py"
SPEC = importlib.util.spec_from_file_location("pm2_definition_control", MODULE_PATH)
assert SPEC and SPEC.loader
CONTROL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL)
ISOLATED_PATH = ROOT / "scripts/ci/verify-pm2-definition-isolated.py"
ISOLATED_SPEC = importlib.util.spec_from_file_location("verify_pm2_definition_isolated", ISOLATED_PATH)
assert ISOLATED_SPEC and ISOLATED_SPEC.loader
ISOLATED = importlib.util.module_from_spec(ISOLATED_SPEC)
ISOLATED_SPEC.loader.exec_module(ISOLATED)
SURFACE_FIXTURE = ROOT / "scripts/ci/fixtures/pm2-production-env-surface.sanitized.json"
API_RUNTIME_SURFACE_FIXTURE = ROOT / "scripts/ci/fixtures/pm2-api-runtime-env-surface.sanitized.json"


def request(role="candidate", component="frontend"):
    return {
        "schemaVersion": 2,
        "scope": "isolated-test",
        "role": role,
        "component": component,
        "sourceKind": CONTROL.SOURCE_KINDS[role],
        "environmentKeys": ["BUILD_ID", "NODE_ENV", "PORT"] if component == "frontend" else ["NODE_ENV", "PORT"],
    }


def definition(tag="candidate", port="43101", component="frontend"):
    args = ["start", "-p", port] if component == "frontend" else []
    env = {"NODE_ENV": "production", "PORT": port}
    if component == "frontend":
        env["BUILD_ID"] = f"{tag}-build-id"
    return {
        "apps": [{
            "name": f"isolated-{component}",
            "script": f"/fixture/{tag}/server.js",
            "args": args,
            "cwd": f"/fixture/{tag}",
            "interpreter": "/usr/bin/node",
            "exec_mode": "fork_mode",
            "instances": 1,
            "namespace": "re7-isolated-proof",
            "autorestart": True,
            "restart_delay": 1000,
            "kill_timeout": 5000,
            "listen_timeout": 10000,
            "wait_ready": False,
            "node_args": ["--enable-source-maps"],
            "out_file": f"/fixture/{tag}/out.log",
            "error_file": f"/fixture/{tag}/error.log",
            "merge_logs": True,
            "watch": False,
            "env": env,
        }]
    }


def release_identity(role="candidate"):
    return {
        "releaseId": f"immutable-{role}-release",
        "releaseManifestSha256": hashlib.sha256(f"{role}-manifest".encode()).hexdigest(),
        "componentTreeSha256": hashlib.sha256(f"{role}-tree".encode()).hexdigest(),
        "frontendBuildId": f"{role}-build-id",
        "frontendEntrySha256": hashlib.sha256(f"{role}-entry".encode()).hexdigest(),
    }


def source(role="candidate", tag="stable-current", evidence=None):
    evidence = evidence or hashlib.sha256(f"{role}-evidence".encode()).hexdigest()
    return {
        "schemaVersion": 1,
        "role": role,
        "component": "frontend",
        "sourceKind": CONTROL.SOURCE_KINDS[role],
        "provenance": {
            "authority": CONTROL.SOURCE_AUTHORITIES[role],
            "evidenceSha256": evidence,
        },
        "releaseIdentity": release_identity(role),
        "definition": definition(tag),
    }


def write_private(path, value):
    path.write_bytes(CONTROL.canonical(value))
    path.chmod(0o600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PrivatePair:
    def __init__(self, root: Path):
        self.root = root
        self.candidate_request = root / "candidate-request.json"
        self.rollback_request = root / "rollback-request.json"
        self.candidate_source = root / "candidate-source.json"
        self.rollback_source = root / "rollback-source.json"
        self.candidate_definition = root / "candidate-definition.json"
        self.rollback_definition = root / "rollback-definition.json"
        write_private(self.candidate_request, request("candidate"))
        write_private(self.rollback_request, request("rollback"))
        write_private(self.candidate_source, source("candidate"))
        write_private(self.rollback_source, source("rollback"))
        self.build()

    def build(self):
        for role in ("candidate", "rollback"):
            args = argparse.Namespace(
                request=getattr(self, f"{role}_request"),
                source_artifact=getattr(self, f"{role}_source"),
                source_sha256=sha(getattr(self, f"{role}_source")),
                output=getattr(self, f"{role}_definition"),
            )
            CONTROL.command_build(args)

    def pair_args(self):
        return argparse.Namespace(
            candidate_request=self.candidate_request,
            candidate_source_artifact=self.candidate_source,
            candidate_source_sha256=sha(self.candidate_source),
            candidate_definition=self.candidate_definition,
            rollback_request=self.rollback_request,
            rollback_source_artifact=self.rollback_source,
            rollback_source_sha256=sha(self.rollback_source),
            rollback_definition=self.rollback_definition,
        )


class DefinitionControlTests(unittest.TestCase):
    def test_api_runtime_surface_is_statically_proven_and_role_minimal(self):
        fixture = json.loads(API_RUNTIME_SURFACE_FIXTURE.read_text())
        entries = fixture["entries"]
        self.assertEqual(fixture["schemaVersion"], 1)
        self.assertEqual(fixture["component"], "api")
        self.assertEqual(len(entries), 66)
        self.assertEqual([entry["key"] for entry in entries], sorted(entry["key"] for entry in entries))
        self.assertEqual(len({entry["key"] for entry in entries}), 66)
        api_allowlist = CONTROL.load_repository_allowlist()["api"]
        for entry in entries:
            self.assertEqual(
                set(entry),
                {"key", "consumer", "purpose", "applicability", "requirement", "lifecycle", "decision"},
            )
            self.assertEqual(entry["applicability"], "production")
            self.assertEqual(entry["decision"], "common")
            self.assertIn(entry["key"], api_allowlist["common"])
            self.assertNotIn(entry["key"], api_allowlist["candidate"])
            self.assertNotIn(entry["key"], api_allowlist["rollbackCompatibility"])
            consumer = ROOT / entry["consumer"]
            self.assertTrue(consumer.is_file(), entry["key"])
            self.assertIn(entry["key"], consumer.read_text(), entry["key"])

    def test_api_runtime_surface_candidate_and_exact_rollback_are_representable(self):
        fixture = json.loads(API_RUNTIME_SURFACE_FIXTURE.read_text())
        keys = sorted(entry["key"] for entry in fixture["entries"])

        def api_request(role):
            return {
                "schemaVersion": 2,
                "scope": "production",
                "role": role,
                "component": "api",
                "sourceKind": CONTROL.SOURCE_KINDS[role],
                "environmentKeys": keys,
            }

        def api_source(role):
            release = {
                "releaseId": f"immutable-{role}-api-fixture",
                "releaseManifestSha256": hashlib.sha256(f"{role}-api-manifest".encode()).hexdigest(),
                "componentTreeSha256": hashlib.sha256(f"{role}-api-tree".encode()).hexdigest(),
                "apiEntrySha256": hashlib.sha256(f"{role}-api-entry".encode()).hexdigest(),
            }
            source_value = {
                "schemaVersion": 1,
                "role": role,
                "component": "api",
                "sourceKind": CONTROL.SOURCE_KINDS[role],
                "provenance": {
                    "authority": CONTROL.SOURCE_AUTHORITIES[role],
                    "evidenceSha256": hashlib.sha256(f"{role}-api-evidence".encode()).hexdigest(),
                },
                "releaseIdentity": release,
                "definition": definition("stable-current", component="api"),
            }
            source_value["definition"]["apps"][0]["env"] = {
                key: f"synthetic-{role}-{index}" for index, key in enumerate(keys)
            }
            return source_value

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {}
            for role in ("candidate", "rollback"):
                paths[f"{role}_request"] = root / f"{role}-request.json"
                paths[f"{role}_source"] = root / f"{role}-source.json"
                paths[f"{role}_definition"] = root / f"{role}-definition.json"
                source_value = api_source(role)
                write_private(paths[f"{role}_request"], api_request(role))
                write_private(paths[f"{role}_source"], source_value)
                result = CONTROL.command_build(argparse.Namespace(
                    request=paths[f"{role}_request"],
                    source_artifact=paths[f"{role}_source"],
                    source_sha256=sha(paths[f"{role}_source"]),
                    output=paths[f"{role}_definition"],
                ))
                self.assertEqual(result["result"], "PM2_DEFINITION_BUILT")
                self.assertEqual(
                    paths[f"{role}_definition"].read_bytes(),
                    CONTROL.canonical(source_value["definition"]),
                )
                validated = CONTROL.command_validate(argparse.Namespace(
                    request=paths[f"{role}_request"],
                    source_artifact=paths[f"{role}_source"],
                    source_sha256=sha(paths[f"{role}_source"]),
                    definition=paths[f"{role}_definition"],
                ))
                self.assertEqual(validated["result"], "PM2_DEFINITION_VALID")
            pair = CONTROL.command_validate_pair(argparse.Namespace(
                candidate_request=paths["candidate_request"],
                candidate_source_artifact=paths["candidate_source"],
                candidate_source_sha256=sha(paths["candidate_source"]),
                candidate_definition=paths["candidate_definition"],
                rollback_request=paths["rollback_request"],
                rollback_source_artifact=paths["rollback_source"],
                rollback_source_sha256=sha(paths["rollback_source"]),
                rollback_definition=paths["rollback_definition"],
            ))
            self.assertEqual(pair["result"], "PM2_DEFINITION_PAIR_VALID")
            self.assertTrue(pair["sourceArtifactsCryptographicallyDistinct"])
            self.assertTrue(pair["releaseIdentitiesDistinct"])

    def test_production_test_hooks_unknown_and_pm2_fields_remain_denied(self):
        fixture = json.loads(API_RUNTIME_SURFACE_FIXTURE.read_text())
        for entry in fixture["deniedExamples"]:
            selected = request("candidate", "api")
            selected["scope"] = "production"
            selected["environmentKeys"] = [entry["key"]]
            with self.subTest(key=entry["key"], classification=entry["classification"]):
                with self.assertRaises(CONTROL.Denied):
                    CONTROL.validate_request(selected)

    def test_independent_pair_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            result = CONTROL.command_validate_pair(pair.pair_args())
            self.assertEqual(result["result"], "PM2_DEFINITION_PAIR_VALID")
            self.assertNotEqual(result["candidate"]["sourceArtifactSha256"], result["rollback"]["sourceArtifactSha256"])
            self.assertNotEqual(result["candidate"]["requestSha256"], result["rollback"]["requestSha256"])

    def test_build_reports_three_distinct_digest_meanings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            output = root / "additional-definition.json"
            result = CONTROL.command_build(argparse.Namespace(
                request=pair.candidate_request,
                source_artifact=pair.candidate_source,
                source_sha256=sha(pair.candidate_source),
                output=output,
            ))
            self.assertEqual(result["sourceArtifactSha256"], sha(pair.candidate_source))
            self.assertEqual(result["configurationSha256"], sha(output))
            self.assertEqual(result["requestSha256"], sha(pair.candidate_request))

    def test_same_physical_source_is_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            args = pair.pair_args()
            args.rollback_source_artifact = pair.candidate_source
            args.rollback_source_sha256 = sha(pair.candidate_source)
            with self.assertRaisesRegex(CONTROL.Denied, "source_artifact_role_mismatch"):
                CONTROL.command_validate_pair(args)

    def test_identical_pm2_configurations_are_allowed_for_distinct_releases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            rollback = source("rollback")
            rollback["definition"] = copy.deepcopy(source("candidate")["definition"])
            write_private(pair.rollback_source, rollback)
            write_private(pair.rollback_definition, rollback["definition"])
            result = CONTROL.command_validate_pair(pair.pair_args())
            self.assertTrue(result["configurationDigestsEqual"])
            self.assertTrue(result["releaseIdentitiesDistinct"])

    def test_same_release_identity_is_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            rollback = source("rollback")
            rollback["releaseIdentity"] = release_identity("candidate")
            write_private(pair.rollback_source, rollback)
            write_private(pair.rollback_definition, rollback["definition"])
            with self.assertRaisesRegex(CONTROL.Denied, "pair_release_identity_equal"):
                CONTROL.command_validate_pair(pair.pair_args())

    def test_swapping_only_role_or_kind_is_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            changed = request("candidate")
            changed["role"] = "rollback"
            changed["sourceKind"] = "authenticated-proven-definition"
            write_private(pair.candidate_request, changed)
            with self.assertRaisesRegex(CONTROL.Denied, "source_artifact_role_mismatch"):
                CONTROL.load_binding(pair.candidate_request, pair.candidate_source, sha(pair.candidate_source))

    def test_request_digest_cannot_authenticate_source(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            with self.assertRaisesRegex(CONTROL.Denied, "source_sha256_mismatch"):
                CONTROL.load_binding(pair.rollback_request, pair.rollback_source, sha(pair.rollback_request))
            self_declared = request("rollback")
            self_declared["identitySha256"] = sha(pair.rollback_request)
            write_private(pair.rollback_request, self_declared)
            with self.assertRaisesRegex(CONTROL.Denied, "request_keys"):
                CONTROL.load_binding(pair.rollback_request, pair.rollback_source, sha(pair.rollback_source))

    def test_source_symlink_wrong_mode_and_change_during_read_are_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            physical = root / "source.json"
            write_private(physical, source())
            alias = root / "alias.json"
            alias.symlink_to(physical)
            with self.assertRaises(OSError):
                CONTROL.read_private_json(alias)
            physical.chmod(0o644)
            with self.assertRaisesRegex(CONTROL.Denied, "private_file_identity"):
                CONTROL.read_private_json(physical)
            physical.chmod(0o600)
            def mutate(path):
                with path.open("ab") as handle:
                    handle.write(b" ")
            with self.assertRaisesRegex(CONTROL.Denied, "private_file_changed_during_read"):
                CONTROL.read_private_json(physical, mutate)

    def test_output_is_private_exclusive_and_byte_equal_to_source_definition(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            self.assertEqual(stat.S_IMODE(pair.candidate_definition.stat().st_mode), 0o600)
            expected = CONTROL.canonical(source("candidate")["definition"])
            self.assertEqual(pair.candidate_definition.read_bytes(), expected)
            with self.assertRaisesRegex(CONTROL.Denied, "output_exists"):
                pair.build()

    def test_source_definition_extra_pm2_fields_are_denied(self):
        for key in CONTROL.EXPLICITLY_DENIED_PM2_FIELDS:
            candidate_request = request()
            candidate_source = source()
            candidate_source["definition"]["apps"][0][key] = "unsafe"
            with self.subTest(key=key), self.assertRaisesRegex(CONTROL.Denied, "structure_keys"):
                CONTROL.validate_source_artifact(candidate_source, candidate_request)

    def test_pm2_fields_inside_environment_are_denied(self):
        for key in (*sorted(CONTROL.EXPLICITLY_DENIED_PM2_FIELDS), "args", "PM2_HOME", "Pm_ErR_LoG_PaTh"):
            candidate_request = request()
            candidate_request["environmentKeys"] = [key]
            with self.subTest(key=key), self.assertRaisesRegex(CONTROL.Denied, "structural_collision"):
                CONTROL.validate_request(candidate_request)

    def test_request_can_only_select_repository_allowlist_subset(self):
        candidate = request()
        candidate["environmentKeys"] = ["NOT_REPOSITORY_AUTHORIZED"]
        with self.assertRaisesRegex(CONTROL.Denied, "environment_key_not_repository_allowed"):
            CONTROL.validate_request(candidate)

    def test_role_scoped_real_environment_surface(self):
        fixture = json.loads(SURFACE_FIXTURE.read_text())
        self.assertEqual(fixture["schemaVersion"], 1)
        self.assertEqual(len(fixture["entries"]), 12)
        self.assertEqual(
            {entry["key"] for entry in fixture["entries"] if entry["component"] == "api"},
            {
                "ADMIN_TOKEN", "CAMPAIGN_OPERATIONS_FILE", "CAMPAIGN_OPERATIONS_HOST_ID",
                "CAMPAIGN_OPERATIONS_TOPOLOGY", "CHANNEL_ACCOUNT_SECRET_KEY",
                "META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET",
                "META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET", "MFA_SECRET_ENCRYPTION_KEY",
                "WEBHOOK_SECRET_ENCRYPTION_KEY",
            },
        )
        self.assertEqual(
            {entry["key"] for entry in fixture["entries"] if entry["component"] == "frontend"},
            {"NEXT_TELEMETRY_DISABLED", "RE7_FRONT_CONTROL", "RE7_FRONT_RUN"},
        )
        for entry in fixture["entries"]:
            self.assertEqual(
                set(entry),
                {"component", "key", "candidate", "rollback", "valueType", "consumer", "classification", "decision"},
            )
            self.assertEqual(entry["valueType"], "string")
            if entry["consumer"].startswith("apps/"):
                self.assertTrue((ROOT / entry["consumer"]).is_file())
            for role in ("candidate", "rollback"):
                selected = request(role, entry["component"])
                selected["environmentKeys"] = [entry["key"]]
                if entry["decision"] == "rollbackCompatibility" and role == "candidate":
                    with self.subTest(key=entry["key"], role=role), self.assertRaisesRegex(
                        CONTROL.Denied, "application_env_rollback_only"
                    ):
                        CONTROL.validate_request(selected)
                else:
                    with self.subTest(key=entry["key"], role=role):
                        CONTROL.validate_request(selected)
        for key in fixture["alwaysDenied"]:
            selected = request("rollback")
            selected["environmentKeys"] = [key]
            with self.subTest(key=key), self.assertRaisesRegex(CONTROL.Denied, "structural_collision"):
                CONTROL.validate_request(selected)

    def test_candidate_cannot_inherit_legacy_frontend_controls(self):
        for key in ("RE7_FRONT_CONTROL", "RE7_FRONT_RUN"):
            selected = request("candidate")
            selected["environmentKeys"] = [key]
            with self.subTest(key=key), self.assertRaisesRegex(CONTROL.Denied, "application_env_rollback_only"):
                CONTROL.validate_request(selected)

    def test_exact_rollback_can_preserve_legacy_frontend_controls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selected = request("rollback")
            selected["environmentKeys"] = ["NODE_ENV", "PORT", "RE7_FRONT_CONTROL", "RE7_FRONT_RUN"]
            rollback_source = source("rollback")
            rollback_source["definition"]["apps"][0]["env"] = {
                "NODE_ENV": "production",
                "PORT": "43101",
                "RE7_FRONT_CONTROL": "/private/proven-control.json",
                "RE7_FRONT_RUN": "proven-run",
            }
            request_path = root / "request.json"
            source_path = root / "source.json"
            output_path = root / "definition.json"
            write_private(request_path, selected)
            write_private(source_path, rollback_source)
            result = CONTROL.command_build(argparse.Namespace(
                request=request_path,
                source_artifact=source_path,
                source_sha256=sha(source_path),
                output=output_path,
            ))
            self.assertEqual(result["result"], "PM2_DEFINITION_BUILT")
            self.assertEqual(output_path.read_bytes(), CONTROL.canonical(rollback_source["definition"]))

    def test_candidate_and_rollback_may_use_distinct_environment_sets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            rollback_request = request("rollback")
            rollback_request["environmentKeys"] = ["BUILD_ID", "NODE_ENV", "PORT", "RE7_FRONT_CONTROL", "RE7_FRONT_RUN"]
            rollback_source = source("rollback")
            rollback_source["definition"]["apps"][0]["env"].update({
                "RE7_FRONT_CONTROL": "/private/proven-control.json",
                "RE7_FRONT_RUN": "proven-run",
            })
            write_private(pair.rollback_request, rollback_request)
            write_private(pair.rollback_source, rollback_source)
            pair.rollback_definition.unlink()
            CONTROL.command_build(argparse.Namespace(
                request=pair.rollback_request,
                source_artifact=pair.rollback_source,
                source_sha256=sha(pair.rollback_source),
                output=pair.rollback_definition,
            ))
            result = CONTROL.command_validate_pair(pair.pair_args())
            self.assertEqual(result["result"], "PM2_DEFINITION_PAIR_VALID")
            self.assertFalse(result["configurationDigestsEqual"])

    def test_worker_allowlist_contract_is_unchanged(self):
        common = CONTROL.load_repository_allowlist()["worker"]["common"]
        self.assertEqual(common, {
            "DATABASE_URL", "META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_VERSION",
            "NODE_ENV", "OPENAI_API_KEY", "TEMPLATE_MEDIA_ROOT", "TZ",
            "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID",
        })
        self.assertEqual(CONTROL.load_repository_allowlist()["worker"]["candidate"], set())
        self.assertEqual(CONTROL.load_repository_allowlist()["worker"]["rollbackCompatibility"], set())

    def test_nfkc_casefold_collision_is_denied(self):
        candidate = request()
        candidate["environmentKeys"] = ["Ｃｗｄ"]
        with self.assertRaisesRegex(CONTROL.Denied, "structural_collision"):
            CONTROL.validate_request(candidate)

    def test_definition_must_match_authenticated_source_bytes_semantically_and_serially(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            changed = json.loads(pair.candidate_definition.read_text())
            changed["apps"][0]["cwd"] = "/fixture/changed"
            write_private(pair.candidate_definition, changed)
            args = argparse.Namespace(
                request=pair.candidate_request,
                source_artifact=pair.candidate_source,
                source_sha256=sha(pair.candidate_source),
                definition=pair.candidate_definition,
            )
            with self.assertRaisesRegex(CONTROL.Denied, "definition_not_source_exact"):
                CONTROL.command_validate(args)

    def test_operational_name_namespace_and_port_mismatch_are_denied(self):
        cases = (("name", "other"), ("namespace", "other"), ("port", "43102"))
        for field, value in cases:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                pair = PrivatePair(root)
                rollback = source("rollback")
                if field == "port":
                    rollback["definition"]["apps"][0]["args"][2] = value
                    rollback["definition"]["apps"][0]["env"]["PORT"] = value
                else:
                    rollback["definition"]["apps"][0][field] = value
                write_private(pair.rollback_source, rollback)
                write_private(pair.rollback_definition, rollback["definition"])
                predicate = "pair_operational_args" if field == "port" else f"pair_operational_{field}"
                with self.assertRaisesRegex(CONTROL.Denied, predicate):
                    CONTROL.command_validate_pair(pair.pair_args())

    def test_pm2_6014_log_path_derivation(self):
        cases = (
            ("/logs/app.log", False, 0, "/logs/app-0.log"),
            ("/logs/app.log", False, 1, "/logs/app-1.log"),
            ("/logs/app", False, 2, "/logs/app"),
            ("/logs/app.log", True, 3, "/logs/app.log"),
            ("/logs/app", True, 4, "/logs/app"),
            ("/dev/null", False, 5, "/dev/null"),
            ("/dev/null", True, 6, "/dev/null"),
            ("/logs/frontend-2026.log", False, 0, "/logs/frontend-0.log"),
            ("/logs/frontend-0.log", False, 1, "/logs/frontend-1.log"),
            ("/logs/frontend-2026.log", True, 2, "/logs/frontend-2026.log"),
            ("/logs/frontend-0.log", True, 3, "/logs/frontend-0.log"),
        )
        for configured, merge_logs, pm_id, expected in cases:
            with self.subTest(configured=configured, merge_logs=merge_logs, pm_id=pm_id):
                self.assertEqual(CONTROL.expected_pm2_log_path(configured, merge_logs, pm_id), expected)

    def test_runtime_log_identity_accepts_only_exact_derived_paths(self):
        app = definition()["apps"][0]
        app["out_file"] = "/fixture/logs/out.log"
        app["error_file"] = "/fixture/logs/error.log"
        app["merge_logs"] = False
        valid = {
            "pm_id": 7,
            "pm_out_log_path": "/fixture/logs/out-7.log",
            "pm_err_log_path": "/fixture/logs/error-7.log",
        }
        self.assertEqual(len(CONTROL.validate_runtime_log_paths(app, valid)), 2)
        invalid = {
            "different_directory": ("pm_out_log_path", "/other/out-7.log"),
            "different_basename": ("pm_out_log_path", "/fixture/logs/changed-7.log"),
            "different_pm_id": ("pm_out_log_path", "/fixture/logs/out-6.log"),
            "arbitrary_suffix": ("pm_out_log_path", "/fixture/logs/out-extra-7.log"),
            "different_extension": ("pm_out_log_path", "/fixture/logs/out-7.txt"),
        }
        for label, (key, value) in invalid.items():
            changed = dict(valid)
            changed[key] = value
            with self.subTest(label=label), self.assertRaisesRegex(CONTROL.Denied, "runtime_out_log_path"):
                CONTROL.validate_runtime_log_paths(app, changed)

    def test_merge_logs_true_denies_instance_suffix(self):
        app = definition()["apps"][0]
        app["out_file"] = "/fixture/logs/out.log"
        app["error_file"] = "/fixture/logs/error.log"
        app["merge_logs"] = True
        loaded = {
            "pm_id": 3,
            "pm_out_log_path": "/fixture/logs/out-3.log",
            "pm_err_log_path": "/fixture/logs/error.log",
        }
        with self.assertRaisesRegex(CONTROL.Denied, "runtime_out_log_path"):
            CONTROL.validate_runtime_log_paths(app, loaded)

    def test_release_identity_schema_is_closed(self):
        candidate = source("candidate")
        candidate["releaseIdentity"]["freeForm"] = "not-allowed"
        with self.assertRaisesRegex(CONTROL.Denied, "release_identity_keys"):
            CONTROL.validate_source_artifact(candidate, request("candidate"))

    def physical_fixture(self, root):
        releases = root / "releases"
        current = root / "current"
        candidate = releases / "candidate"
        rollback = releases / "rollback"
        current.mkdir(parents=True)
        ISOLATED.create_runtime(candidate, "candidate-build-id")
        ISOLATED.create_runtime(rollback, "rollback-build-id")
        stable = current / "frontend"
        stable.symlink_to(candidate)
        app = definition("stable-current")["apps"][0]
        app["cwd"] = str(stable)
        app["script"] = str(stable / "server.js")
        app["interpreter"] = str(Path(sys.executable).resolve())
        identity = release_identity("candidate")
        identity["frontendBuildId"] = "candidate-build-id"
        identity["frontendEntrySha256"] = sha(candidate / "server.js")
        return releases, current, candidate, rollback, stable, app, identity

    def test_pm2_lexical_identity_denies_physical_definition_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            releases, _, candidate, _, stable, app, _ = self.physical_fixture(Path(directory))
            loaded = copy.deepcopy(app)
            loaded.update({
                "pm_cwd": str(candidate),
                "pm_exec_path": str(candidate / "server.js"),
                "exec_interpreter": app["interpreter"],
                "pm_id": 0,
            })
            with self.assertRaisesRegex(AssertionError, "loaded_cwd"):
                ISOLATED.validate_pm2_lexical_identity(loaded, app, stable)

    def test_physical_identity_denies_wrong_release_and_split_cwd_script(self):
        with tempfile.TemporaryDirectory() as directory:
            releases, _, candidate, rollback, _, app, identity = self.physical_fixture(Path(directory))
            with self.assertRaisesRegex(AssertionError, "process_script_wrong_release"):
                ISOLATED.validate_physical_identity(
                    app, rollback / "server.js", candidate, Path(sys.executable), candidate, releases, identity,
                )
            split = copy.deepcopy(app)
            split["script"] = str(rollback / "server.js")
            with self.assertRaisesRegex(AssertionError, "physical_script_wrong_release"):
                ISOLATED.validate_physical_identity(
                    split, rollback / "server.js", candidate, Path(sys.executable), candidate, releases, identity,
                )

    def test_symlink_identity_change_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            releases, _, candidate, rollback, stable, _, _ = self.physical_fixture(Path(directory))
            before = ISOLATED.capture_symlink_identity(stable, candidate, releases)
            ISOLATED.select_runtime(stable, rollback)
            after = ISOLATED.capture_symlink_identity(stable, rollback, releases)
            self.assertNotEqual(before, after)
            with self.assertRaisesRegex(AssertionError, "stable_symlink_changed"):
                ISOLATED.require_same_symlink_identity(before, after)
            with self.assertRaisesRegex(AssertionError, "stable_symlink_wrong_release"):
                ISOLATED.capture_symlink_identity(stable, candidate, releases)

    def test_physical_identity_denies_build_id_and_entrypoint_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            releases, _, candidate, _, _, app, identity = self.physical_fixture(Path(directory))
            wrong_build = dict(identity, frontendBuildId="wrong")
            with self.assertRaisesRegex(AssertionError, "build_id_file"):
                ISOLATED.validate_physical_identity(
                    app, candidate / "server.js", candidate, Path(sys.executable), candidate, releases, wrong_build,
                )
            wrong_hash = dict(identity, frontendEntrySha256="0" * 64)
            with self.assertRaisesRegex(AssertionError, "entrypoint_sha256"):
                ISOLATED.validate_physical_identity(
                    app, candidate / "server.js", candidate, Path(sys.executable), candidate, releases, wrong_hash,
                )

    def test_real_tree_ancestry_denies_textual_prefix_and_intermediate_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release = root / "releases" / "candidate"
            similar = root / "releases-evil" / "candidate"
            outside = root / "outside"
            release.mkdir(parents=True)
            similar.mkdir(parents=True)
            outside.mkdir()
            with self.assertRaisesRegex(AssertionError, "physical_path_outside_release"):
                ISOLATED.resolved_within(similar, root / "releases")
            (release / "escape").symlink_to(outside)
            with self.assertRaisesRegex(AssertionError, "physical_path_outside_release"):
                ISOLATED.resolved_within(release / "escape" / "..", release)

    def test_cli_validate_pair_uses_external_source_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            pair = PrivatePair(Path(directory))
            command = [
                sys.executable, str(MODULE_PATH), "validate-pair",
                "--candidate-request", str(pair.candidate_request),
                "--candidate-source-artifact", str(pair.candidate_source),
                "--candidate-source-sha256", sha(pair.candidate_source),
                "--candidate-definition", str(pair.candidate_definition),
                "--rollback-request", str(pair.rollback_request),
                "--rollback-source-artifact", str(pair.rollback_source),
                "--rollback-source-sha256", sha(pair.rollback_source),
                "--rollback-definition", str(pair.rollback_definition),
            ]
            completed = subprocess.run(command, text=True, capture_output=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(json.loads(completed.stdout)["result"], "PM2_DEFINITION_PAIR_VALID")

    def test_sanitized_incident_fixture_contains_no_values(self):
        fixture = json.loads((ROOT / "scripts/ci/fixtures/pm2-definition-contamination.sanitized.json").read_text())
        self.assertFalse(fixture["containsEnvironmentValues"])
        self.assertEqual(fixture["collision"]["key"], "args")


if __name__ == "__main__":
    unittest.main(verbosity=2)
