#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
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
            role=self.role, target=self.target, release_id=self.release_id,
            release_root=self.release, deployed_marker_sha256=None,
            producer=self.producer, producer_sha256=sha(self.producer),
            control=self.control, control_sha256=sha(self.control),
            template_request=self.request, template_request_sha256=sha(self.request),
            template_source=self.source, template_source_sha256=sha(self.source), output=self.output,
        )

    def close(self):
        self.temp.cleanup()


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
