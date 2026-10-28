#!/usr/bin/env python3
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/frontend-finalization-continuation.py"
SPEC = importlib.util.spec_from_file_location("continuation", MODULE_PATH)
CONTINUATION = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(CONTINUATION)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(0o600)


class Fixture:
    def __init__(self, root: Path):
        self.root = root
        self.tx = root / "transaction"
        self.tx.mkdir()
        self.lock = root / "deployment.lock"
        self.lock.write_text("")
        self.lock.chmod(0o600)
        self.dump = root / "dump.pm2"
        self.dump.write_text("[]\n")
        self.dump.chmod(0o600)
        self.marker = root / "release" / "DEPLOYED"
        self.marker.parent.mkdir()
        self.acceptance = self.tx / "technical-acceptance.private.json"
        private_json(self.acceptance, {
            "accepted": True, "target": "b" * 40, "release": "immutable-b96"
        })
        private_json(self.tx / "window-state.private.json", {
            "state": "AWAITING_ACCEPTANCE", "saveCount": 0,
            "target": "b" * 40, "release": "immutable-b96"
        })
        self.counter = root / "save-count.txt"
        self.executor = root / "executor.sh"
        self.executor.write_text("""#!/usr/bin/bash
set -eu
test "${RE7_DEPLOYMENT_LOCK_HELD:-}" = 1
test "$1" = finalize
count=0
test ! -f "$SAVE_COUNTER" || count=$(/usr/bin/cat "$SAVE_COUNTER")
count=$((count+1))
/usr/bin/printf '%s\\n' "$count" > "$SAVE_COUNTER"
/usr/bin/python3 - "$RE7_TRANSACTION_ROOT" "$RE7_MARKER" <<'PY'
import json,pathlib,sys
tx=pathlib.Path(sys.argv[1]);marker=pathlib.Path(sys.argv[2])
def put(path,value):
 path.write_text(json.dumps(value,sort_keys=True,separators=(",",":"))+"\\n");path.chmod(0o600)
put(tx/"pm2-save-intent.private.json",{"state":"PM2_SAVE_INTENT"})
put(tx/"pm2-save-execution.private.json",{"state":"PM2_SAVE_EXECUTED","exitCode":0,"saveCount":1})
put(tx/"pm2-dump-validation.private.json",{"result":"PM2_DUMP_VALID"})
put(tx/"frontend-finalization-receipt.private.json",{"state":"DEPLOYED_SANITIZED","saveCount":1})
put(tx/"window-state.private.json",{"state":"DEPLOYED_SANITIZED","saveCount":1})
put(marker,{"state":"DEPLOYED","saveCount":1})
PY
""")
        self.executor.chmod(0o600)
        self.request = {
            "schemaVersion": 1,
            "action": "finalize",
            "lockPath": str(self.lock),
            "transactionRoot": str(self.tx),
            "executor": str(self.executor),
            "executorSha256": digest(self.executor),
            "target": "b" * 40,
            "release": "immutable-b96",
            "acceptanceSha256": digest(self.acceptance),
            "dumpPath": str(self.dump),
            "dumpSha256": digest(self.dump),
            "markerPath": str(self.marker),
            "environment": {
                "RE7_TRANSACTION_ROOT": str(self.tx),
                "RE7_MARKER": str(self.marker),
                "SAVE_COUNTER": str(self.counter),
            },
            "terminalStates": ["DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"],
        }

    def acquire(self) -> int:
        ids = (os.getuid(), os.getgid())
        return CONTINUATION.acquire_lock(self.lock, ids)


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.fixture = Fixture(Path(self.temporary.name))

    def tearDown(self):
        try:
            os.close(9)
        except OSError:
            pass
        self.temporary.cleanup()

    def test_fd9_and_flag_pass(self):
        fd = self.fixture.acquire()
        CONTINUATION.validate_external_protocol(
            self.fixture.lock, fd, {"RE7_DEPLOYMENT_LOCK_HELD": "1"})

    def test_fd9_without_flag_denies(self):
        fd = self.fixture.acquire()
        with self.assertRaisesRegex(CONTINUATION.Denied, "external_lock_flag"):
            CONTINUATION.validate_external_protocol(self.fixture.lock, fd, {})

    def test_flag_without_fd9_flock_denies(self):
        fd = os.open(self.fixture.lock, os.O_RDWR)
        if fd != 9:
            os.dup2(fd, 9, inheritable=True)
            os.close(fd)
        with self.assertRaisesRegex(CONTINUATION.Denied, "external_lock_not_held"):
            CONTINUATION.validate_external_protocol(
                self.fixture.lock, 9, {"RE7_DEPLOYMENT_LOCK_HELD": "1"})

    def test_old_holder_absent_does_not_matter(self):
        self.assertNotIn("holder", json.dumps(self.fixture.request).lower())
        fd = self.fixture.acquire()
        CONTINUATION.validate_external_protocol(
            self.fixture.lock, fd, {"RE7_DEPLOYMENT_LOCK_HELD": "1"})

    def test_existing_acceptance_is_not_republished(self):
        before = self.fixture.acceptance.stat()
        before_raw = self.fixture.acceptance.read_bytes()
        CONTINUATION.validate_prefinal(self.fixture.request)
        after = self.fixture.acceptance.stat()
        self.assertEqual(before_raw, self.fixture.acceptance.read_bytes())
        self.assertEqual((before.st_ino, before.st_mtime_ns, before.st_ctime_ns),
                         (after.st_ino, after.st_mtime_ns, after.st_ctime_ns))

    def test_save_count_zero_executes_exactly_one_save(self):
        fd = self.fixture.acquire()
        CONTINUATION.run(self.fixture.request, fd)
        self.assertEqual(self.fixture.counter.read_text().strip(), "1")
        self.assertEqual(json.loads((self.fixture.tx / "window-state.private.json").read_text())["saveCount"], 1)

    def test_save_count_one_blocks_second_save(self):
        fd = self.fixture.acquire()
        CONTINUATION.run(self.fixture.request, fd)
        with self.assertRaisesRegex(CONTINUATION.Denied, "state_or_save_count"):
            CONTINUATION.validate_prefinal(self.fixture.request)
        self.assertEqual(self.fixture.counter.read_text().strip(), "1")


if __name__ == "__main__":
    unittest.main()
