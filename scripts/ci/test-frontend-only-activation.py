#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import fcntl
import os
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("frontend_only_activation", ROOT / "scripts/frontend-only-activation.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class FrontendOnlyActivationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.candidate = self.root / "immutable-candidate"
        self.rollback = self.root / "immutable-rollback"
        for release, build_id in ((self.candidate, "candidate-build"), (self.rollback, "rollback-build")):
            (release / ".next").mkdir(parents=True)
            (release / ".next/BUILD_ID").write_text(build_id + "\n")
        self.current = self.root / "current"
        self.current.mkdir()
        (self.current / "frontend").symlink_to(self.rollback)
        self.package = self.root / "release.tar.xz"
        self.package.write_bytes(b"one authenticated package")
        self.guard = self.root / "guard.json"
        self.guard.write_text('{"generation":41,"open":true}\n')
        self.dump = self.root / "dump.pm2"
        self.dump.write_text("preserved dump\n")
        self.lock = self.root / "deployment-window.lock"
        self.lock.touch(mode=0o600)
        self.request = self.root / "request.json"
        self.request.write_text("{}\n")
        self.definition = self.root / "definition.json"
        self.definition.write_text("{}\n")
        self.control = self.root / "control.py"
        self.control.write_text("""#!/usr/bin/env python3
import argparse,json,pathlib,sys,time
if len(sys.argv)>1 and sys.argv[1]=='validate-pair':
 print('{"result":"PM2_DEFINITION_PAIR_VALID"}');raise SystemExit(0)
p=argparse.ArgumentParser();p.add_argument('command');
for name in ('request','source-artifact','source-sha256','definition','pm2','stable-path','release-root','port','local-health','public-health','deadline-seconds','poll-seconds','report'):
 p.add_argument('--'+name,required=True)
a=p.parse_args(); behavior=json.loads(pathlib.Path(a.source_artifact).read_text())
if behavior.get('delay'): time.sleep(behavior['delay'])
if behavior['mode']=='missing': print('missing report',file=sys.stderr);raise SystemExit(2)
release=pathlib.Path(a.release_root).name
if behavior['mode']=='mismatch':
 value={'result':'READINESS_PASS','component':'api','port':3001,'releaseId':release,'sampleCount':1,'samples':[]}
 code=0
elif behavior['mode']=='deny':
 value={'result':'READINESS_DENY','component':'frontend','port':3000,'reason':behavior['reason'],'sampleCount':behavior.get('samples',0),'samples':[]}
 code=2
else:
 value={'result':'READINESS_PASS','component':'frontend','port':3000,'releaseId':release,'pid':4242,'startTicks':9001,'sampleCount':3,'samples':[1,2,3]}
 code=0
pathlib.Path(a.report).write_text(json.dumps(value)+'\\n')
print(json.dumps(value));raise SystemExit(code)
""")
        self.control.chmod(0o700)
        self.verifier = self.root / "release-verifier.py"
        self.verifier.write_text("#!/usr/bin/env python3\nprint('RELEASE VERIFIED')\n")
        self.verifier.chmod(0o700)
        pid = os.getpid()
        self.pm2 = self.root / "pm2"
        self.restart_counter = self.root / "restart-count"
        self.restart_counter.write_text("7")
        self.pm2.write_text(f"""#!/usr/bin/env python3
import json,pathlib,sys
counter=pathlib.Path({str(self.restart_counter)!r})
if sys.argv[1]=='jlist':
 restarts=int(counter.read_text())
 print(json.dumps([
  {{'name':'re7-whatsapp-agent','pid':{pid},'pm2_env':{{'status':'online','restart_time':3,'pm_cwd':'/api','pm_exec_path':'/api/index.js'}}}},
  {{'name':'re7-whatsapp-web-worker','pid':{pid},'pm2_env':{{'status':'online','restart_time':0,'pm_cwd':'/worker','pm_exec_path':'/worker/index.js'}}}},
  {{'name':'re7-admin-front','pid':{pid},'pm2_env':{{'status':'online','restart_time':restarts,'pm_cwd':'/frontend','pm_exec_path':'/frontend/server.js'}}}}
 ]))
elif sys.argv[1]=='restart': counter.write_text(str(int(counter.read_text())+1));print('restarted')
else: raise SystemExit(2)
""")
        self.pm2.chmod(0o700)

    def tearDown(self):
        self.temporary.cleanup()

    def source(self, name: str, mode: str, **extra):
        path = self.root / f"{name}.source.json"
        path.write_text(json.dumps({"mode": mode, **extra}) + "\n")
        return path

    def make_plan(self, candidate_mode="pass", **behavior):
        candidate_source = self.source("candidate", candidate_mode, **behavior)
        rollback_source = self.source("rollback", "pass")
        binding = lambda source, release: {
            "request": str(self.request), "sourceArtifact": str(source),
            "sourceSha256": sha(source), "definition": str(self.definition),
            "releaseRoot": str(release),
        }
        plan = {
            "schemaVersion": 1,
            "target": "d436239e13764b65642b37a4310082acd3a6a485",
            "releaseId": self.candidate.name,
            "package": {"path": str(self.package), "sha256": sha(self.package)},
            "control": {"path": str(self.control), "sha256": sha(self.control)},
            "releaseVerifier": {"path": str(self.verifier), "sha256": sha(self.verifier)},
            "pm2": str(self.pm2), "lockPath": str(self.lock),
            "transactionRoot": str(self.root / "transaction"),
            "guardPath": str(self.guard), "dumpPath": str(self.dump),
            "preservedProcesses": ["re7-whatsapp-agent", "re7-whatsapp-web-worker"],
            "frontend": {
                "stablePath": str(self.current / "frontend"), "processName": "re7-admin-front",
                "port": 3000, "localHealth": "http://127.0.0.1:3000/app/login",
                "publicHealth": "https://example.invalid/app/login",
                "candidate": binding(candidate_source, self.candidate),
                "rollback": binding(rollback_source, self.rollback),
            },
        }
        plan_path = self.root / "plan.json"
        plan_path.write_text(json.dumps(plan, sort_keys=True) + "\n")
        return MODULE.load_plan(plan_path, sha(plan_path))

    def test_pass_preserves_api_worker_guard_and_all_readiness_artifacts(self):
        plan = self.make_plan()
        result = MODULE.activate(plan, handoff_lock=False)
        self.assertEqual(result["state"], "AWAITING_ACCEPTANCE")
        self.assertEqual((self.current / "frontend").resolve(), self.candidate)
        tx = Path(plan["transactionRoot"])
        for suffix in ("report.private.json", "stdout.private.txt", "stderr.private.txt"):
            self.assertTrue((tx / f"candidate-readiness.{suffix}").is_file())
        self.assertEqual(json.loads((tx / "preservation-before.private.json").read_text()), result["preserved"])

    def test_delayed_listener_is_polled_by_observer_and_passes(self):
        plan = self.make_plan(delay=0.2)
        started = time.monotonic()
        result = MODULE.activate(plan, handoff_lock=False)
        self.assertGreaterEqual(time.monotonic() - started, 0.18)
        self.assertEqual(result["state"], "AWAITING_ACCEPTANCE")

    def test_predicate_before_first_sample_is_preserved_and_rolls_back(self):
        plan = self.make_plan("deny", reason="readiness_pm2_lexical_identity", samples=0)
        with self.assertRaisesRegex(MODULE.Denied, "readiness_pm2_lexical_identity"):
            MODULE.activate(plan, handoff_lock=False)
        tx = Path(plan["transactionRoot"])
        state = json.loads((tx / "state.private.json").read_text())
        self.assertEqual(state["failurePredicate"], "readiness_pm2_lexical_identity")
        report = json.loads((tx / "candidate-readiness.report.private.json").read_text())
        self.assertEqual(report["sampleCount"], 0)
        self.assertEqual((self.current / "frontend").resolve(), self.rollback)

    def test_report_mismatch_is_observability_defect(self):
        plan = self.make_plan("mismatch")
        with self.assertRaisesRegex(MODULE.Denied, "READINESS_OBSERVABILITY_DEFECT:candidate-readiness:report_mismatch"):
            MODULE.activate(plan, handoff_lock=False)
        self.assertEqual((self.current / "frontend").resolve(), self.rollback)

    def test_missing_report_is_observability_defect(self):
        plan = self.make_plan("missing")
        with self.assertRaisesRegex(MODULE.Denied, "READINESS_OBSERVABILITY_DEFECT:candidate-readiness:report_missing"):
            MODULE.activate(plan, handoff_lock=False)
        tx = Path(plan["transactionRoot"])
        self.assertTrue((tx / "candidate-readiness.stdout.private.txt").exists())
        self.assertTrue((tx / "candidate-readiness.stderr.private.txt").exists())
        self.assertEqual((self.current / "frontend").resolve(), self.rollback)

    def test_rollback_has_its_own_canonical_readiness_evidence(self):
        plan = self.make_plan("deny", reason="READINESS_TIMEOUT:frontend:3000", samples=9)
        with self.assertRaises(MODULE.Denied):
            MODULE.activate(plan, handoff_lock=False)
        tx = Path(plan["transactionRoot"])
        rollback = json.loads((tx / "rollback-readiness.report.private.json").read_text())
        self.assertEqual(rollback["result"], "READINESS_PASS")
        self.assertEqual(json.loads((tx / "state.private.json").read_text())["state"], "ROLLED_BACK")

    def test_lock_handoff_rejects_wrong_token_and_releases_only_exact_token(self):
        tx = self.root / "lock-handoff"
        tx.mkdir()
        descriptor = os.open(self.lock, os.O_RDWR)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        holder = MODULE.handoff_lock_to_private_holder(descriptor, self.lock, tx)
        os.close(descriptor)
        probe = os.open(self.lock, os.O_RDWR)
        with self.assertRaises(BlockingIOError):
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fifo = Path(holder["controlPath"])
        fifo.write_text("WRONG\n")
        time.sleep(0.05)
        with self.assertRaises(BlockingIOError):
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        token = (tx / "lock-control-token.private.txt").read_text()
        fifo.write_text(token)
        os.waitpid(holder["pid"], 0)
        fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        os.close(probe)


if __name__ == "__main__":
    unittest.main()
