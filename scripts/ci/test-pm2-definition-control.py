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


def source(role="candidate", tag=None, evidence=None):
    tag = tag or role
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

    def test_candidate_derived_rollback_configuration_is_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair = PrivatePair(root)
            rollback = source("rollback")
            rollback["definition"] = copy.deepcopy(source("candidate")["definition"])
            write_private(pair.rollback_source, rollback)
            write_private(pair.rollback_definition, rollback["definition"])
            args = pair.pair_args()
            with self.assertRaisesRegex(CONTROL.Denied, "pair_configuration_digest_equal"):
                CONTROL.command_validate_pair(args)

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
                with self.assertRaisesRegex(CONTROL.Denied, f"pair_operational_{field}"):
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
