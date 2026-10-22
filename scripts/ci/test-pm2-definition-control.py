#!/usr/bin/env python3
"""Regression tests for the versioned PM2 definition boundary."""

import importlib.util
import json
import os
import stat
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
    source_kind = "authenticated-proven-definition" if role == "rollback" else "canonical-private-config"
    value = {
        "schemaVersion": 1,
        "scope": "isolated-test",
        "role": role,
        "component": component,
        "source": {"kind": source_kind, "identitySha256": "0" * 64},
        "structure": {
            "name": "isolated-frontend",
            "script": "/fixture/next",
            "args": ["start", "-p", "43101"],
            "cwd": "/fixture/frontend",
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
            "out_file": "/fixture/logs/out.log",
            "error_file": "/fixture/logs/error.log",
            "merge_logs": True,
            "watch": False,
        },
        "applicationEnv": {
            "allowlist": ["NODE_ENV", "PORT"],
            "values": {"NODE_ENV": "production", "PORT": "43101"},
        },
    }
    value["source"]["identitySha256"] = CONTROL.configuration_identity(value)
    return value


class DefinitionControlTests(unittest.TestCase):
    def test_clean_definition_preserves_structural_args(self):
        value = CONTROL.render_definition(request())
        app = value["apps"][0]
        self.assertEqual(app["args"], ["start", "-p", "43101"])
        self.assertNotIn("args", app["env"])
        self.assertEqual(app["exec_mode"], "fork_mode")
        self.assertEqual(app["instances"], 1)

    def test_production_frontend_is_pinned_to_port_3000(self):
        value = request()
        value["scope"] = "production"
        value["structure"]["args"][2] = "3000"
        value["applicationEnv"]["values"]["PORT"] = "3000"
        value["source"]["identitySha256"] = CONTROL.configuration_identity(value)
        CONTROL.render_definition(value)
        value["structure"]["args"][2] = "3002"
        with self.assertRaisesRegex(CONTROL.Denied, "frontend_production_port"):
            CONTROL.render_definition(value)

    def test_candidate_and_rollback_sources_are_distinct(self):
        CONTROL.render_definition(request("candidate"))
        CONTROL.render_definition(request("rollback"))
        wrong = request("rollback")
        wrong["source"]["kind"] = "canonical-private-config"
        with self.assertRaisesRegex(CONTROL.Denied, "source_kind"):
            CONTROL.render_definition(wrong)

    def test_source_identity_binds_structure_and_allowlisted_environment(self):
        changed = request()
        changed["structure"]["args"][2] = "43102"
        with self.assertRaisesRegex(CONTROL.Denied, "source_identity_mismatch"):
            CONTROL.render_definition(changed)

    def test_private_io_is_exclusive_and_mode_0600(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "request.json"
            output = root / "definition.json"
            source.write_bytes(CONTROL.canonical(request()))
            source.chmod(0o600)
            result = CONTROL.command_build(type("Args", (), {"request": source, "output": output})())
            self.assertEqual(result["result"], "PM2_DEFINITION_BUILT")
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
            with self.assertRaisesRegex(CONTROL.Denied, "output_exists"):
                CONTROL.command_build(type("Args", (), {"request": source, "output": output})())

    def test_sanitized_incident_fixture_contains_no_values(self):
        fixture = json.loads((ROOT / "scripts/ci/fixtures/pm2-definition-contamination.sanitized.json").read_text())
        self.assertFalse(fixture["containsEnvironmentValues"])
        self.assertEqual(fixture["collision"]["key"], "args")
        self.assertEqual(fixture["composition"]["definitionsProduced"], ["candidate", "rollback"])


def collision_case(key, value):
    candidate = request()
    candidate["applicationEnv"] = {"allowlist": [key], "values": {key: value}}
    return candidate


def add_collision_test(key, value, suffix):
    def test(self):
        with self.assertRaisesRegex(CONTROL.Denied, "application_env_structural_collision"):
            CONTROL.render_definition(collision_case(key, value))
    setattr(DefinitionControlTests, f"test_collision_{suffix}", test)


for collision_key in (
    "args", "script", "cwd", "exec_mode", "instances", "interpreter", "node_args",
    "env", "watch", "autorestart", "pm_exec_path", "pm_cwd", "PM2_HOME",
    "NODE_APP_INSTANCE", "Pm_ErR_LoG_PaTh", "PM_CUSTOM_INTERNAL",
):
    add_collision_test(collision_key, "sanitized", collision_key.lower())

add_collision_test("ARGS", ["start"], "uppercase_array")
add_collision_test("Ｃｗｄ", {"nested": "value"}, "unicode_nested_object")
add_collision_test("Exec_Mode", {"nested": ["value"]}, "mixed_case_nested")


class AdditionalNegativeTests(unittest.TestCase):
    def test_nested_application_environment_is_denied(self):
        candidate = request()
        candidate["applicationEnv"]["values"]["PORT"] = {"nested": "value"}
        with self.assertRaisesRegex(CONTROL.Denied, "value_not_string"):
            CONTROL.render_definition(candidate)

    def test_contaminated_rollback_is_denied(self):
        candidate = collision_case("args", "start,-p,3000")
        candidate["role"] = "rollback"
        candidate["source"]["kind"] = "authenticated-proven-definition"
        with self.assertRaisesRegex(CONTROL.Denied, "structural_collision"):
            CONTROL.render_definition(candidate)

    def test_extra_and_relative_fields_are_denied(self):
        candidate = request()
        candidate["structure"]["pm_exec_path"] = "/unexpected"
        with self.assertRaisesRegex(CONTROL.Denied, "structure_keys"):
            CONTROL.render_definition(candidate)
        candidate = request()
        candidate["structure"]["cwd"] = "relative"
        with self.assertRaisesRegex(CONTROL.Denied, "not_absolute"):
            CONTROL.render_definition(candidate)

    def test_private_input_symlink_and_wrong_mode_are_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "request.json"
            source.write_bytes(CONTROL.canonical(request()))
            source.chmod(0o644)
            with self.assertRaisesRegex(CONTROL.Denied, "private_file_identity"):
                CONTROL.load_request(source)
            source.chmod(0o600)
            alias = root / "alias.json"
            alias.symlink_to(source)
            with self.assertRaises(OSError):
                CONTROL.load_request(alias)


if __name__ == "__main__":
    unittest.main(verbosity=2)
