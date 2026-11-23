#!/usr/bin/env python3
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/materialize-read-state-rollback-compatibility.py"


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


class CompatibilityMaterializerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name); self.release = self.base / "releases/compat"
        store = self.release / "api-runtime/dist/inbox/readStateStore.js"
        store.parent.mkdir(parents=True); store.write_text("const INBOX_READ_STATE_ROOT='x';const inbox_read_state_root_required='y';\n")
        entry = self.release / "api-runtime/dist/index.js"; entry.write_text("entry\n")
        index = self.release / "index.sha256"; index.write_bytes(canonical({"schemaVersion": 1, "scope": ["api-runtime", "frontend-runtime"], "entries": []}))
        manifest = {"schemaVersion": 1, "producer": {"name": "converta-release.py", "formatVersion": 1}, "releaseId": "compat", "targetCommit": "a" * 40,
                    "components": ["api", "frontend"], "sourceDateEpoch": 1, "builtAt": "1970-01-01T00:00:01Z", "toolchain": {},
                    "runtimes": {"api": {"entrypoint": "api-runtime/dist/index.js", "entrySha256": hashlib.sha256(entry.read_bytes()).hexdigest()}, "frontend": {"buildId": "fixture"}},
                    "indexSha256": hashlib.sha256(index.read_bytes()).hexdigest(), "reproducibility": {"deterministic": True, "nonReproducibleFields": []}}
        (self.release / "manifest.json").write_bytes(canonical(manifest))
        self.output = self.base / "custody/compatibility.json"

    def invoke(self):
        return subprocess.run(["python3", str(SCRIPT), "--release-root", str(self.release), "--release-id", "compat", "--persistent-root", str(self.base / "runtime-data/inbox-read-state"), "--output", str(self.output)], text=True, capture_output=True)

    def test_seals_exact_driver_contract_and_replay(self):
        first = self.invoke(); self.assertEqual(first.returncode, 0, first.stderr)
        value = json.loads(self.output.read_text())
        self.assertEqual(value["kind"], "CONVERTA_DURABLE_READ_STATE_ROLLBACK_COMPATIBILITY_V1")
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        second = self.invoke(); self.assertEqual(second.returncode, 0, second.stderr)

    def test_denies_storage_without_effective_binding(self):
        (self.release / "api-runtime/dist/inbox/readStateStore.js").write_text("legacy local only\n")
        result = self.invoke(); self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback_compatibility_storage_behavior", result.stderr)
        self.assertFalse(self.output.exists())

    def test_denies_divergent_preexisting_contract(self):
        self.output.parent.mkdir(); self.output.write_text("{}\n"); self.output.chmod(0o600)
        result = self.invoke(); self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback_compatibility_publication_conflict", result.stderr)


if __name__ == "__main__": unittest.main()
