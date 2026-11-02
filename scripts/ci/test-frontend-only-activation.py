#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
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
SANITIZED_PM2_DUMP_FIXTURE = ROOT / "scripts/ci/fixtures/pm2-dump-6.0.14-top-level-env.sanitized.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_embedded_dump_comparator(live: list[dict], dump: list[dict]):
    source = SOURCE.read_text()
    match = re.search(
        r'/usr/bin/python3 - "\$live_file" "\$DUMP" "\$dump_validation" <<\'PY\'\n'
        r'(?P<body>.*?)\nPY\n',
        source,
        re.DOTALL,
    )
    if match is None:
        raise AssertionError("embedded dump comparator not found")
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
        live_path = root / "live.json"
        dump_path = root / "dump.json"
        output_path = root / "validation.json"
        comparator = root / "comparator.py"
        live_path.write_text(json.dumps(live) + "\n")
        dump_path.write_text(json.dumps(dump) + "\n")
        comparator.write_text(match.group("body") + "\n")
        result = subprocess.run(
            ["python3", "-B", str(comparator), str(live_path), str(dump_path), str(output_path)],
            text=True,
            capture_output=True,
        )
        output = json.loads(output_path.read_text()) if output_path.exists() else None
        return result, output


def pm2_row(name: str) -> dict:
    return {
        "name": name,
        "pid": 100,
        "pm2_env": {
            "pm_cwd": f"/{name}",
            "pm_exec_path": f"/{name}/index.js",
            "args": None,
            "node_args": [],
            "namespace": "default",
            "out_file": f"/logs/{name}.out",
            "error_file": f"/logs/{name}.err",
            "exec_mode": "fork_mode",
            "instances": 1,
        },
    }


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
p=argparse.ArgumentParser();p.add_argument('command')
for key in ('component','process-name','expected-cwd','expected-script','expected-interpreter','release-id','entry-sha256','build-id','pm2','stable-path','release-root','port','local-health','public-health','deadline-seconds','poll-seconds','report'): p.add_argument('--'+key,required=True)
a=p.parse_args();role='candidate' if 'candidate' in a.release_id else 'rollback';mode=os.environ.get('FAKE_READINESS','pass') if role=='candidate' else 'pass'
if mode=='delayed': time.sleep(.2);mode='pass'
if mode=='guard-drift':
 g=pathlib.Path(os.environ['FAKE_GUARD']);value=json.loads(g.read_text());value['generation']+=1;g.write_text(json.dumps(value)+'\\n');mode='pass'
if mode=='timeout': print('partial stdout',flush=True);print('partial stderr',file=sys.stderr,flush=True);time.sleep(5)
if mode=='missing': print('no report');raise SystemExit(2)
if mode=='deny': value={'result':'READINESS_DENY','component':'frontend','port':3000,'reason':'readiness_pm2_lexical_identity','sampleCount':0,'samples':[]};code=2
elif mode=='mismatch': value={'result':'READINESS_PASS','component':'api','port':3001,'releaseId':'wrong','observationMode':'existing_pm2_registration','stableSamples':3,'sampleCount':3,'samples':[]};code=0
else: value={'result':'READINESS_PASS','component':'frontend','port':3000,'releaseId':a.release_id,'observationMode':'existing_pm2_registration','stableSamples':3,'sampleCount':3,'samples':[1,2,3],'pid':123,'startTicks':456};code=0
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
            entry = item / "frontend-runtime/node_modules/next/dist/bin"
            entry.mkdir(parents=True)
            (entry / "next").write_text("fixture next entry\n")
        self.current = self.root / "current"; self.current.mkdir(); (self.current / "frontend").symlink_to(self.rollback / "frontend-runtime")
        self.package = self.root / "package.tar.xz"; self.package.write_bytes(b"authenticated fixture package")
        self.guard = self.root / "guard.json"; self.guard.write_text(json.dumps({"version":1,"open":guard_open,"generation":41,"tasks":{},"audit":[]})+"\n")
        self.dump = self.root / "dump.pm2"
        self.lock = self.root / "deployment-window.lock"; self.lock.write_text(""); self.lock.chmod(0o600)
        self.counter = self.root / "restarts"; self.counter.write_text("7")
        self.save_counter = self.root / "saves"; self.save_counter.write_text("0")
        pid = os.getpid()
        def pm2_rows(restarts: int):
            def row(name, cwd, script, restart):
                return {'name': name, 'pid': pid, 'pm2_env': {'status': 'online', 'restart_time': restart,
                    'pm_cwd': cwd, 'pm_exec_path': script, 'exec_mode': 'fork_mode', 'instances': 1,
                    'args': None, 'node_args': None, 'namespace': None, 'out_file': None, 'error_file': None}}
            return [row('re7-whatsapp-agent','/api','/api/index.js',2),
                    row('re7-whatsapp-web-worker','/worker','/worker/index.js',0),
                    row('re7-admin-front',str(self.current/'frontend'),str(self.current/'frontend/node_modules/next/dist/bin/next'),restarts)]
        self.dump.write_text(json.dumps(pm2_rows(7))+"\n"); self.dump.chmod(0o600)
        self.pm2 = self.root / "pm2"
        self.pm2.write_text(f"""#!/usr/bin/env python3
import json,pathlib,sys
c=pathlib.Path({str(self.counter)!r})
s=pathlib.Path({str(self.save_counter)!r});dump=pathlib.Path({str(self.dump)!r})
def rows():
 r=int(c.read_text());return [
 {{'name':'re7-whatsapp-agent','pid':{pid},'pm2_env':{{'status':'online','restart_time':2,'pm_cwd':'/api','pm_exec_path':'/api/index.js','exec_mode':'fork_mode','instances':1,'args':None,'node_args':None,'namespace':None,'out_file':None,'error_file':None}}}},
 {{'name':'re7-whatsapp-web-worker','pid':{pid},'pm2_env':{{'status':'online','restart_time':0,'pm_cwd':'/worker','pm_exec_path':'/worker/index.js','exec_mode':'fork_mode','instances':1,'args':None,'node_args':None,'namespace':None,'out_file':None,'error_file':None}}}},
 {{'name':'re7-admin-front','pid':{pid},'pm2_env':{{'status':'online','restart_time':r,'pm_cwd':{str(self.current / "frontend")!r},'pm_exec_path':{str(self.current / "frontend/node_modules/next/dist/bin/next")!r},'exec_mode':'fork_mode','instances':1,'args':None,'node_args':None,'namespace':None,'out_file':None,'error_file':None}}}}]
if sys.argv[1]=='--version': print('6.0.14')
elif sys.argv[1]=='jlist': print(json.dumps(rows()))
elif sys.argv[1]=='restart': c.write_text(str(int(c.read_text())+1));print('restarted')
elif sys.argv[1]=='save': s.write_text(str(int(s.read_text())+1));dump.write_text(json.dumps(rows())+'\\n');print('saved')
else: raise SystemExit(2)
"""); self.pm2.chmod(0o700)
        self.request = self.root / "request.json"; self.request.write_text("{}\n")
        self.definition = self.root / "definition.json"; self.definition.write_text("{}\n")
        self.candidate_source = self.root / "candidate-source.json"; self.candidate_source.write_text('{"role":"candidate"}\n')
        self.rollback_source = self.root / "rollback-source.json"; self.rollback_source.write_text('{"role":"rollback"}\n')
        script = SOURCE.read_text()
        replacements = {
            "CONTROL_PLANE=b1689394feb27bb92487896dbee21f34e70b53d5": f"CONTROL_PLANE={self.control_sha}",
            "TARGET=ef3a212862c9a1fd2c46a420df7095327f3c9d7f": "TARGET=" + "a"*40,
            "RELEASE=immutable-ef3a2128-vps-20261028T001820Z": f"RELEASE={self.release.name}",
            "EXPECTED_PACKAGE=3665323dfbdbd4233fd4a87034b3520f4077c7c3a934506c4aee40981c829af7": f"EXPECTED_PACKAGE={digest(self.package)}",
            "EXPECTED_PRODUCER=d248b9128688b429beec37902e78cacb4b45af4a074e287eed253bdf05c8b065": f"EXPECTED_PRODUCER={digest(producer)}",
            "EXPECTED_CONTROL=a8f71a51ea09e3746db75dd952f581650ac2f43a02ceecdff1a6c4ae5c4b40e6": f"EXPECTED_CONTROL={digest(control)}",
            "RETURN_RELEASE=immutable-708f018c-vps-20261027T152109Z": f"RETURN_RELEASE={self.rollback.name}",
            "/usr/bin/timeout --signal=TERM --kill-after=5s 45s": "/usr/bin/timeout --signal=TERM --kill-after=.1s .3s",
        }
        for old, new in replacements.items():
            if old not in script: raise AssertionError(old)
            script = script.replace(old, new)
        self.generation_contract = self.root / "generation-artifacts.private.json"
        self.generation_contract.write_text(json.dumps({
            "schemaVersion": 1, "targetCommit": "a" * 40,
            "releaseId": self.release.name, "artifacts": [],
        }, sort_keys=True) + "\n")
        self.generation_contract.chmod(0o600)
        self.retirement_intent = self.root / "generation-retirement-intent.private.json"
        self.retirement_intent.write_text(json.dumps({
            "schemaVersion": 3, "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
            "authorizationGranted": False, "targetCommit": "a" * 40,
            "releaseId": self.release.name,
            "contractSha256": digest(self.generation_contract), "commands": [],
            "executionContract": {"stopOnFirstFailure": True, "automaticRetry": False},
        }, sort_keys=True) + "\n")
        self.retirement_intent.chmod(0o600)
        self.root_policy = self.root / "root-policy.private.json"
        self.root_policy.write_text('{"schemaVersion":1,"canonicalRoots":{}}\n'); self.root_policy.chmod(0o600)
        intent_value=json.loads(self.retirement_intent.read_text());intent_value["rootPolicySha256"]=digest(self.root_policy)
        self.retirement_intent.write_text(json.dumps(intent_value,sort_keys=True)+"\n");self.retirement_intent.chmod(0o600)
        self.retirement_tool = self.root / "generation-retirement.py"
        self.retirement_counter = self.root / "retirement-count"; self.retirement_counter.write_text("0")
        self.retirement_receipt = self.root / "retirement-receipt"
        self.retirement_tool.write_text(f"""#!/usr/bin/env python3
import hashlib,json,os,pathlib,sys
c=pathlib.Path({str(self.retirement_counter)!r});c.write_text(str(int(c.read_text())+1))
args=sys.argv;root=pathlib.Path(args[args.index('--receipt-root')+1]);root.mkdir()
state='DEPLOYED_RETENTION_INCOMPLETE' if os.environ.get('FAKE_RETIREMENT')=='fail' else 'DEPLOYED_SANITIZED'
receipt=root/'execution-receipt.private.json';receipt.write_text(json.dumps({{'state':state,'intentSha256':args[args.index('--intent-sha256')+1]}})+'\\n');receipt.chmod(0o600)
print(json.dumps({{'result':state,'receiptSha256':hashlib.sha256(receipt.read_bytes()).hexdigest()}}))
raise SystemExit(2 if os.environ.get('FAKE_RETIREMENT')=='fail' else 0)
"""); self.retirement_tool.chmod(0o600)
        self.retirement_authorization = self.root / "retirement-authorization.private.json"; self.retirement_authorization.write_text('{}\n'); self.retirement_authorization.chmod(0o600)
        self.retirement_operational = self.root / "retirement-operational.private.json"
        self.retirement_operational.write_text(json.dumps({
            "activeReleases":[self.rollback.name,"immutable-api-preserved"],"rollbackReleases":[],"transitiveReturnReleases":[],
            "candidateReleases":[self.release.name],"installedVerifiedReleases":[self.release.name],"supersededCandidates":[],
            "observations":{"currentLinks":[{"path":str(self.current/"frontend"),"target":str(self.rollback/"frontend-runtime")}],
                            "pm2":{"path":str(self.pm2),"sha256":digest(self.pm2),"fingerprintSha256":"0"*64},
                            "dump":{"path":str(self.dump),"sha256":digest(self.dump)},
                            "releaseGraph":{"path":str(self.dump),"sha256":digest(self.dump)}}
        },sort_keys=True)+"\n"); self.retirement_operational.chmod(0o600)
        self.retirement_review = self.root / "retirement-review.private.json"
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
            "RE7_GENERATION_CONTRACT":str(self.generation_contract),
            "RE7_GENERATION_CONTRACT_SHA256":digest(self.generation_contract),
            "RE7_RETIREMENT_INTENT":str(self.retirement_intent),
            "RE7_RETIREMENT_INTENT_SHA256":digest(self.retirement_intent),
            "RE7_ROOT_POLICY":str(self.root_policy), "RE7_ROOT_POLICY_SHA256":digest(self.root_policy),
            "RE7_RETIREMENT_TOOL":str(self.retirement_tool), "RE7_RETIREMENT_TOOL_SHA256":digest(self.retirement_tool),
            "RE7_RETIREMENT_AUTHORIZATION":str(self.retirement_authorization), "RE7_RETIREMENT_AUTHORIZATION_SHA256":digest(self.retirement_authorization),
            "RE7_RETIREMENT_OPERATIONAL_STATE":str(self.retirement_operational), "RE7_RETIREMENT_OPERATIONAL_STATE_SHA256":digest(self.retirement_operational),
            "RE7_RETIREMENT_RECEIPT_ROOT":str(self.retirement_receipt), "RE7_RETIREMENT_REVIEW_OUTPUT":str(self.retirement_review),
            "FAKE_READINESS":behavior,
            "FAKE_GUARD":str(self.guard),
        })

    def run(self):
        return subprocess.run([str(self.script)], env=self.env, text=True, capture_output=True, timeout=12)

    def finalize(self, retirement="pass"):
        acceptance=self.tx/"technical-acceptance.private.json"
        acceptance.write_text(json.dumps({"accepted":True,"target":"a"*40,"release":self.release.name})+"\n");acceptance.chmod(0o600)
        environment={**self.env,"FAKE_RETIREMENT":retirement}
        return subprocess.run([str(self.script),"finalize"],env=environment,text=True,capture_output=True,timeout=12)

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

    def test_pm2_dump_environment_uses_top_level_then_pm2_env_for_all_processes(self):
        names = ("re7-whatsapp-agent", "re7-admin-front", "re7-whatsapp-web-worker")
        live = [pm2_row(name) for name in names]
        dump = [pm2_row(name) for name in names]
        for index, (live_row, dump_row) in enumerate(zip(live, dump), 1):
            value = f"value-{index}"
            live_row["pm2_env"]["NODE_ENV"] = value
            dump_row["NODE_ENV"] = value
        result, output = run_embedded_dump_comparator(live, dump)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output["result"], "PM2_DUMP_VALID")
        self.assertEqual(set(output["processes"]), set(names))

    def test_pm2_dump_environment_preserves_false_empty_null_and_absence(self):
        names = ("re7-whatsapp-agent", "re7-admin-front", "re7-whatsapp-web-worker")
        live = [pm2_row(name) for name in names]
        dump = [pm2_row(name) for name in names]
        for live_row, dump_row in zip(live, dump):
            live_row.update(HOST=False, PORT="", META_APP_ID=None, ADMIN_TOKEN=0)
            live_row["pm2_env"].update(HOST=True, PORT="filled", META_APP_ID="filled", ADMIN_TOKEN=1)
            dump_row.update(HOST=False, PORT="", META_APP_ID=None, ADMIN_TOKEN=0)
            dump_row["pm2_env"].update(HOST="different", PORT="different", META_APP_ID="different", ADMIN_TOKEN=1)
            # CAMPAIGN_OPERATIONS_FILE is intentionally absent from both locations.
        result, output = run_embedded_dump_comparator(live, dump)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output["result"], "PM2_DUMP_VALID")

    def test_pm2_dump_environment_real_value_difference_is_denied_for_every_process(self):
        names = ("re7-whatsapp-agent", "re7-admin-front", "re7-whatsapp-web-worker")
        for name in names:
            with self.subTest(name=name):
                live = [pm2_row(item) for item in names]
                dump = [pm2_row(item) for item in names]
                live_row = next(item for item in live if item["name"] == name)
                dump_row = next(item for item in dump if item["name"] == name)
                live_row["pm2_env"]["NODE_ENV"] = "production"
                dump_row["NODE_ENV"] = "development"
                result, output = run_embedded_dump_comparator(live, dump)
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(output)
                self.assertIn(f"DUMP_ENVIRONMENT:{name}", result.stderr)

    def test_pm2_dump_environment_accepts_sanitized_incident_schema(self):
        fixture = json.loads(SANITIZED_PM2_DUMP_FIXTURE.read_text())
        self.assertEqual(fixture["incident"], "PREFINAL_DUMP_ENVIRONMENT:re7-admin-front")
        result, output = run_embedded_dump_comparator(fixture["live"], fixture["dump"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output["result"], "PM2_DUMP_VALID")
        self.assertEqual(
            set(output["processes"]),
            {"re7-whatsapp-agent", "re7-admin-front", "re7-whatsapp-web-worker"},
        )

    def test_release_bindings_reject_the_previous_generation(self):
        source = SOURCE.read_text()
        assignments = dict(
            line.split("=", 1)
            for line in source.splitlines()
            if line.split("=", 1)[0] in {
                "TARGET", "RELEASE", "EXPECTED_PACKAGE", "RETURN_RELEASE"
            }
        )
        current = {
            "TARGET": "ef3a212862c9a1fd2c46a420df7095327f3c9d7f",
            "RELEASE": "immutable-ef3a2128-vps-20261028T001820Z",
            "EXPECTED_PACKAGE": "3665323dfbdbd4233fd4a87034b3520f4077c7c3a934506c4aee40981c829af7",
            "RETURN_RELEASE": "immutable-708f018c-vps-20261027T152109Z",
        }
        previous = {
            "TARGET": "d436239e13764b65642b37a4310082acd3a6a485",
            "RELEASE": "immutable-d436239e-vps-20261026T131821Z",
            "EXPECTED_PACKAGE": "ed02ba8057cb5ef14f98cd715b81e2daf18e21a2826d7d4f8888f25a00e3d36b",
            "RETURN_RELEASE": "immutable-a959129e-vps-20261026T023100Z",
        }
        for name, value in current.items():
            self.assertEqual(assignments[name], value)
        for name, value in previous.items():
            self.assertNotEqual(assignments[name], value)

    def test_executor_has_no_private_binding_dependency(self):
        source = SOURCE.read_text()
        self.assertNotIn("RE7_CANDIDATE_REQUEST", source)
        self.assertNotIn("RE7_ROLLBACK_REQUEST", source)
        self.assertNotIn("validate-pair", source)
        self.assertIn("wait-existing-readiness", source)

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
                self.assertNotEqual(r.returncode,0,(behavior,r.stdout,r.stderr));state=json.loads((f.tx/"window-state.private.json").read_text())
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

    def test_generation_contract_or_retirement_intent_drift_denies_before_selection(self):
        for name in ("generation_contract", "retirement_intent"):
            f=ExecutorFixture();Path(getattr(f,name)).write_text('{"tampered":true}\n')
            try:
                r=f.run();self.assertNotEqual(r.returncode,0);self.assertEqual((f.current/"frontend").resolve(),f.rollback/"frontend-runtime")
                self.assertEqual(json.loads((f.tx/"window-state.private.json").read_text())["state"],"DENIED_BEFORE_MUTATION")
            finally:f.close()

    def test_finalize_success_runs_one_save_and_one_retirement(self):
        f,r=self.run_case()
        try:
            self.assertEqual(r.returncode,0,(r.stdout,r.stderr))
            result=f.finalize()
            self.assertEqual(result.returncode,0,(result.stdout,result.stderr))
            self.assertIn("DEPLOYED_SANITIZED",result.stdout)
            self.assertEqual(f.save_counter.read_text(),"1")
            self.assertEqual(f.retirement_counter.read_text(),"1")
            self.assertEqual(json.loads((f.tx/"window-state.private.json").read_text())["state"],"DEPLOYED_SANITIZED")
            operational=json.loads((f.tx/"generation-operational.final.private.json").read_text())
            self.assertIn("immutable-api-preserved",operational["activeReleases"])
            self.assertNotIn("immutable-api-preserved",operational["rollbackReleases"])
            self.assertEqual(int(f.counter.read_text()),8)
        finally:f.close()

    def test_finalize_retention_failure_is_deployed_incomplete(self):
        f,r=self.run_case()
        try:
            self.assertEqual(r.returncode,0,(r.stdout,r.stderr))
            result=f.finalize("fail")
            self.assertEqual(result.returncode,0,(result.stdout,result.stderr))
            self.assertIn("DEPLOYED_RETENTION_INCOMPLETE",result.stdout)
            self.assertEqual(f.save_counter.read_text(),"1")
            self.assertEqual(f.retirement_counter.read_text(),"1")
            self.assertEqual(int(f.counter.read_text()),8)
        finally:f.close()

    def test_finalize_resume_does_not_repeat_save_restart_or_retirement(self):
        f,r=self.run_case()
        try:
            self.assertEqual(r.returncode,0,(r.stdout,r.stderr))
            f.env["RE7_TEST_FAIL_AFTER_RETENTION"]="1"
            first=f.finalize()
            self.assertNotEqual(first.returncode,0)
            self.assertEqual(f.save_counter.read_text(),"1")
            self.assertEqual(f.retirement_counter.read_text(),"1")
            f.env.pop("RE7_TEST_FAIL_AFTER_RETENTION")
            second=f.finalize()
            self.assertEqual(second.returncode,0,(second.stdout,second.stderr))
            self.assertEqual(f.save_counter.read_text(),"1")
            self.assertEqual(f.retirement_counter.read_text(),"1")
            self.assertEqual(int(f.counter.read_text()),8)
            self.assertEqual(json.loads((f.tx/"window-state.private.json").read_text())["state"],"DEPLOYED_SANITIZED")
        finally:f.close()


if __name__=="__main__": unittest.main()
