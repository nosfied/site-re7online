#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import signal
import socketserver
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/frontend-only-activation.sh"
BASELINE_SHA = "931900e7fb7229ffd5983b5bbbf8223191108d3b09110655452a43e42f71e2d4"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Handler(BaseHTTPRequestHandler):
    fail_path = None

    def do_GET(self):
        if self.path == self.fail_path:
            self.send_response(503); self.end_headers(); return
        if self.path.endswith("health"):
            body = b'{"ok":true,"db":"ok"}\n'
        elif self.path == "/_next/static/app.js":
            body = b"asset"
        else:
            body = b'<html><script src="/_next/static/app.js"></script></html>'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def log_message(self, *_):
        pass


class ExecutorFixture:
    def __init__(self, behavior="pass", fail_path=None, guard_open=True):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
        Handler.fail_path = fail_path
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.control = self.root / "control"
        (self.control / "scripts").mkdir(parents=True)
        producer = self.control / "scripts/converta-release.py"
        producer.write_text("#!/usr/bin/env python3\nprint('{\"result\":\"RELEASE VERIFIED\"}')\n")
        control = self.control / "scripts/pm2-definition-control.py"
        control.write_text("""#!/usr/bin/env python3
import argparse,json,os,pathlib,sys,time
if sys.argv[1]=='validate-pair': print('{"result":"PM2_DEFINITION_PAIR_VALID"}');raise SystemExit(0)
p=argparse.ArgumentParser();p.add_argument('command')
for key in ('request','source-artifact','source-sha256','definition','pm2','stable-path','release-root','port','local-health','public-health','deadline-seconds','poll-seconds','report'): p.add_argument('--'+key,required=True)
a=p.parse_args();role=json.loads(pathlib.Path(a.source_artifact).read_text())['role'];mode=os.environ.get('FAKE_READINESS','pass') if role=='candidate' else 'pass'
if mode=='delayed': time.sleep(.2);mode='pass'
if mode=='guard-drift':
 g=pathlib.Path(os.environ['FAKE_GUARD']);value=json.loads(g.read_text());value['generation']+=1;g.write_text(json.dumps(value)+'\\n');mode='pass'
if mode=='timeout': print('partial stdout',flush=True);print('partial stderr',file=sys.stderr,flush=True);time.sleep(5)
if mode=='missing': print('no report');raise SystemExit(2)
if mode=='deny': value={'result':'READINESS_DENY','component':'frontend','port':3000,'reason':'readiness_pm2_lexical_identity','sampleCount':0,'samples':[]};code=2
elif mode=='mismatch': value={'result':'READINESS_PASS','component':'api','port':3001,'releaseId':'wrong','stableSamples':3,'sampleCount':3,'samples':[]};code=0
else: value={'result':'READINESS_PASS','component':'frontend','port':3000,'releaseId':pathlib.Path(a.release_root).name,'stableSamples':3,'sampleCount':3,'samples':[1,2,3],'pid':123,'startTicks':456};code=0
pathlib.Path(a.report).write_text(json.dumps(value)+'\\n');print(json.dumps(value));raise SystemExit(code)
""")
        subprocess.run(["git", "init", "-q"], cwd=self.control, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.control, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.control, check=True)
        subprocess.run(["git", "add", "."], cwd=self.control, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.control, check=True)
        self.control_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.control, text=True).strip()

        self.release = self.root / "immutable-candidate"
        self.rollback = self.root / "immutable-rollback"
        for item, build in ((self.release, "candidate-build"), (self.rollback, "rollback-build")):
            (item / "frontend-runtime/.next").mkdir(parents=True)
            (item / "frontend-runtime/.next/BUILD_ID").write_text(build + "\n")
        self.current = self.root / "current"; self.current.mkdir(); (self.current / "frontend").symlink_to(self.rollback / "frontend-runtime")
        self.package = self.root / "package.tar.xz"; self.package.write_bytes(b"authenticated fixture package")
        self.guard = self.root / "guard.json"; self.guard.write_text(json.dumps({"version":1,"open":guard_open,"generation":41,"tasks":{},"audit":[]})+"\n")
        self.dump = self.root / "dump.pm2"; self.dump.write_text("saved dump\n"); self.dump.chmod(0o600)
        self.lock = self.root / "deployment-window.lock"; self.lock.write_text(""); self.lock.chmod(0o600)
        self.counter = self.root / "restarts"; self.counter.write_text("7")
        pid = os.getpid()
        self.pm2 = self.root / "pm2"
        self.pm2.write_text(f"""#!/usr/bin/env python3
import json,pathlib,sys
c=pathlib.Path({str(self.counter)!r})
if sys.argv[1]=='--version': print('6.0.14')
elif sys.argv[1]=='jlist':
 r=int(c.read_text());print(json.dumps([
 {{'name':'re7-whatsapp-agent','pid':{pid},'pm2_env':{{'status':'online','restart_time':2,'pm_cwd':'/api','pm_exec_path':'/api/index.js'}}}},
 {{'name':'re7-whatsapp-web-worker','pid':{pid},'pm2_env':{{'status':'online','restart_time':0,'pm_cwd':'/worker','pm_exec_path':'/worker/index.js'}}}},
 {{'name':'re7-admin-front','pid':{pid},'pm2_env':{{'status':'online','restart_time':r,'pm_cwd':'/current/frontend','pm_exec_path':'/current/frontend/server.js'}}}}]))
elif sys.argv[1]=='restart': c.write_text(str(int(c.read_text())+1));print('restarted')
else: raise SystemExit(2)
"""); self.pm2.chmod(0o700)
        self.request = self.root / "request.json"; self.request.write_text("{}\n")
        self.definition = self.root / "definition.json"; self.definition.write_text("{}\n")
        self.candidate_source = self.root / "candidate-source.json"; self.candidate_source.write_text('{"role":"candidate"}\n')
        self.rollback_source = self.root / "rollback-source.json"; self.rollback_source.write_text('{"role":"rollback"}\n')
        script = SOURCE.read_text()
        replacements = {
            "CONTROL_PLANE=f8a6f948a1daeef5d38e9c97445fcf9e9e647a1c": f"CONTROL_PLANE={self.control_sha}",
            "TARGET=d436239e13764b65642b37a4310082acd3a6a485": "TARGET=" + "a"*40,
            "RELEASE=immutable-d436239e-vps-20261026T131821Z": f"RELEASE={self.release.name}",
            "EXPECTED_PACKAGE=ed02ba8057cb5ef14f98cd715b81e2daf18e21a2826d7d4f8888f25a00e3d36b": f"EXPECTED_PACKAGE={digest(self.package)}",
            "EXPECTED_PRODUCER=d6b67fb0a1888f2e8e8f3ad828bd8e17725e89c47c2de3d4f4d4386def243cab": f"EXPECTED_PRODUCER={digest(producer)}",
            "EXPECTED_CONTROL=bdf8ac3731dd3b37d3c48b3a629ee7e166796f9fa2e27ee9148c67d674814564": f"EXPECTED_CONTROL={digest(control)}",
            "RETURN_RELEASE=immutable-a959129e-vps-20261026T023100Z": f"RETURN_RELEASE={self.rollback.name}",
            "/usr/bin/timeout --signal=TERM --kill-after=5s 45s": "/usr/bin/timeout --signal=TERM --kill-after=.1s .3s",
        }
        for old, new in replacements.items():
            if old not in script: raise AssertionError(old)
            script = script.replace(old, new)
        if behavior == "post-select-failure":
            needle = 'atomic_select "$FINAL/frontend-runtime"\ntest "$(/usr/bin/readlink -f "$CURRENT/frontend")" = "$FINAL/frontend-runtime"'
            replacement = 'atomic_select "$FINAL/frontend-runtime"\nfalse\ntest "$(/usr/bin/readlink -f "$CURRENT/frontend")" = "$FINAL/frontend-runtime"'
            if needle not in script: raise AssertionError(needle)
            script = script.replace(needle, replacement, 1)
        if behavior == "readiness-fsync-failure":
            needle = '/usr/bin/sync -f "$stdout_file" || {'
            if needle not in script: raise AssertionError(needle)
            script = script.replace(needle, 'false || {', 1)
        self.script = self.root / "executor.sh"; self.script.write_text(script); self.script.chmod(0o700)
        self.tx = self.root / "transaction"
        self.env = os.environ.copy(); self.env.update({
            "RE7_TRANSACTION_ROOT":str(self.tx), "RE7_CONTROL_ROOT":str(self.control), "RE7_PACKAGE":str(self.package),
            "RE7_RELEASE_ROOT":str(self.release), "RE7_RETURN_ROOT":str(self.rollback), "RE7_DEPLOYMENT_LOCK":str(self.lock),
            "RE7_PM2":str(self.pm2), "RE7_CURRENT_ROOT":str(self.current), "RE7_CAMPAIGN_GUARD":str(self.guard), "RE7_PM2_DUMP":str(self.dump),
            "RE7_API_LOCAL_HEALTH":self.base+"/health", "RE7_API_PUBLIC_HEALTH":self.base+"/health",
            "RE7_FRONTEND_LOCAL_BASE":self.base, "RE7_FRONTEND_PUBLIC_BASE":self.base,
            "RE7_CANDIDATE_REQUEST":str(self.request), "RE7_CANDIDATE_SOURCE_ARTIFACT":str(self.candidate_source), "RE7_CANDIDATE_SOURCE_SHA256":digest(self.candidate_source), "RE7_CANDIDATE_DEFINITION":str(self.definition),
            "RE7_ROLLBACK_REQUEST":str(self.request), "RE7_ROLLBACK_SOURCE_ARTIFACT":str(self.rollback_source), "RE7_ROLLBACK_SOURCE_SHA256":digest(self.rollback_source), "RE7_ROLLBACK_DEFINITION":str(self.definition),
            "FAKE_READINESS":behavior,
            "FAKE_GUARD":str(self.guard),
        })

    def run(self):
        return subprocess.run([str(self.script)], env=self.env, text=True, capture_output=True, timeout=12)

    def release_holder(self):
        holder_file = self.tx / "lock-holder.private.json"
        if not holder_file.exists(): return
        holder = json.loads(holder_file.read_text()); token=(self.tx/"lock-control-token.private.txt").read_text()
        Path(holder["controlPath"]).write_text(token)
        for _ in range(100):
            try: os.kill(holder["pid"], 0)
            except ProcessLookupError: return
            time.sleep(.01)

    def close(self):
        self.release_holder(); self.server.shutdown(); self.server.server_close(); self.temp.cleanup()


class FrontendExecutorTest(unittest.TestCase):
    def run_case(self, behavior="pass", **kwargs):
        fixture=ExecutorFixture(behavior, **kwargs)
        try: return fixture, fixture.run()
        except Exception: fixture.close(); raise

    def test_baseline_v7_is_explicitly_bound(self):
        self.assertEqual((ROOT/"scripts/ci/fixtures/a959-activation-v7.sha256").read_text().split()[0], BASELINE_SHA)
        self.assertIn(f"BASELINE_V7_SHA256={BASELINE_SHA}", SOURCE.read_text())

    def test_pass_and_delayed_listener_preserve_frontend_only_contract(self):
        for behavior in ("pass", "delayed"):
            f,r=self.run_case(behavior)
            try:
                self.assertEqual(r.returncode,0,(r.stdout,r.stderr));self.assertIn("AWAITING_ACCEPTANCE",r.stdout)
                state=json.loads((f.tx/"window-state.private.json").read_text());self.assertEqual(state["saveCount"],0)
                self.assertTrue(state["api"]["preserved"] and state["worker"]["preserved"] and state["guard"]["preserved"])
                for suffix in ("report.private.json","stdout.private.txt","stderr.private.txt"): self.assertTrue((f.tx/f"candidate-readiness.{suffix}").is_file())
            finally:f.close()

    def test_pre_sample_predicate_mismatch_missing_and_timeout_all_rollback(self):
        expected={"deny":"readiness_pm2_lexical_identity","mismatch":"READINESS_OBSERVABILITY_DEFECT","missing":"READINESS_OBSERVABILITY_DEFECT","timeout":"READINESS_OBSERVABILITY_DEFECT","readiness-fsync-failure":"READINESS_OBSERVABILITY_DEFECT:candidate-readiness:stdout_fsync_failed","guard-drift":"final_preservation"}
        for behavior,predicate in expected.items():
            f,r=self.run_case(behavior)
            try:
                self.assertNotEqual(r.returncode,0);state=json.loads((f.tx/"window-state.private.json").read_text())
                incomplete = behavior in {"guard-drift", "readiness-fsync-failure"}
                self.assertEqual(state["state"],"ROLLBACK_INCOMPLETE" if incomplete else "ROLLED_BACK");self.assertIn(predicate,state["failurePredicate"])
                self.assertEqual((f.current/"frontend").resolve(),f.rollback/"frontend-runtime")
                if behavior=="timeout":
                    self.assertIn("partial stdout",(f.tx/"candidate-readiness.stdout.private.txt").read_text())
                    self.assertIn("partial stderr",(f.tx/"candidate-readiness.stderr.private.txt").read_text())
            finally:f.close()

    def test_failure_after_atomic_replace_uses_observed_state_and_rolls_back(self):
        f,r=self.run_case("post-select-failure")
        try:
            self.assertNotEqual(r.returncode,0)
            state=json.loads((f.tx/"window-state.private.json").read_text())
            self.assertEqual(state["state"],"ROLLED_BACK")
            self.assertNotEqual(state["state"],"DENIED_BEFORE_MUTATION")
            self.assertEqual((f.current/"frontend").resolve(),f.rollback/"frontend-runtime")
            self.assertEqual(int(f.counter.read_text()),8)
        finally:f.close()

    def test_guard_api_page_and_stable_path_denials_publish_receipts(self):
        cases=[{"guard_open":False},{"fail_path":"/health"},{"fail_path":"/app/inbox"}]
        for kwargs in cases:
            f,r=self.run_case(**kwargs)
            try:
                self.assertNotEqual(r.returncode,0);state=json.loads((f.tx/"window-state.private.json").read_text())
                self.assertIn(state["state"],{"DENIED_BEFORE_MUTATION","ROLLED_BACK"})
            finally:f.close()
        for mutation in ("tasks", "fault"):
            f=ExecutorFixture()
            if mutation=="tasks":
                value=json.loads(f.guard.read_text());value["tasks"]={"synthetic":{}};f.guard.write_text(json.dumps(value)+"\n")
            else:
                Path(str(f.guard)+".uncertain").write_text("fault\n")
            try:
                r=f.run();self.assertNotEqual(r.returncode,0);self.assertEqual(json.loads((f.tx/"window-state.private.json").read_text())["state"],"DENIED_BEFORE_MUTATION")
            finally:f.close()
        f=ExecutorFixture();(f.current/"frontend").unlink();(f.current/"frontend").write_text("not a symlink")
        try:
            r=f.run();self.assertNotEqual(r.returncode,0)
            state=json.loads((f.tx/"window-state.private.json").read_text())
            self.assertEqual(state["state"],"ROLLBACK_INCOMPLETE")
            self.assertTrue((f.tx/"lock-holder.private.json").is_file())
        finally:f.close()

    def test_absent_or_symlink_lock_denies_before_any_transaction(self):
        for symlink in (False,True):
            f=ExecutorFixture();f.lock.unlink()
            if symlink: f.lock.symlink_to(f.dump)
            try:
                r=f.run();self.assertNotEqual(r.returncode,0);self.assertFalse(f.tx.exists())
            finally:f.close()

    def test_control_or_verifier_tamper_denies_before_selection(self):
        for name in ("pm2-definition-control.py","converta-release.py"):
            f=ExecutorFixture();(f.control/"scripts"/name).write_text("tampered\n")
            try:
                r=f.run();self.assertNotEqual(r.returncode,0);self.assertEqual((f.current/"frontend").resolve(),f.rollback/"frontend-runtime")
                self.assertEqual(json.loads((f.tx/"window-state.private.json").read_text())["state"],"DENIED_BEFORE_MUTATION")
            finally:f.close()


if __name__=="__main__": unittest.main()
