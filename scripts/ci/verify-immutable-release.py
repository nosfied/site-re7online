#!/usr/bin/env python3
"""Integration fixtures for the immutable release selector and rollback."""

from __future__ import annotations

import hashlib
import http.server
import json
import os
import socketserver
import stat
import subprocess
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXECUTOR = ROOT / "scripts/deploy-immutable-release.py"
SECRET = "fixture-private-value"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def index(root: Path) -> list[dict[str, object]]:
    rows = []
    for path in sorted(root.rglob("*")):
        mode = stat.S_IMODE(path.lstat().st_mode)
        rel = path.relative_to(root).as_posix()
        if path.is_dir(): rows.append({"path": rel, "type": "directory", "mode": mode})
        elif path.is_symlink(): rows.append({"path": rel, "type": "symlink", "target": os.readlink(path), "mode": mode})
        else: rows.append({"path": rel, "type": "file", "size": path.stat().st_size, "sha256": digest(path), "mode": mode})
    return rows


def index_digest(rows: list[dict[str, object]]) -> str:
    return hashlib.sha256((json.dumps(rows, sort_keys=True, separators=(",", ":")) + "\n").encode()).hexdigest()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        remaining = self.server.failures.get(self.path, 0)
        if remaining:
            self.server.failures[self.path] = remaining - 1
            self.send_response(503); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *args): pass


class Server:
    def __enter__(self):
        self.server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
        self.server.failures = {}
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/health"
        return self
    def __exit__(self, *args): self.server.shutdown(); self.server.server_close(); self.thread.join()


FAKE_PM2 = r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
root=Path(os.environ['FIXTURE_ROOT']);state=root/'pm2.json';control=root/'control.json';calls=root/'calls.log';proc=root/'proc'
apps=json.loads(state.read_text());ctl=json.loads(control.read_text())
def save(): state.write_text(json.dumps(apps));os.chmod(state,0o600)
def make_proc(app):
 p=proc/str(app['pid']);(p/'fd').mkdir(parents=True,exist_ok=True);(p/'net').mkdir(exist_ok=True)
 fields=['S']+['0']*40;fields[19]=str(app['pid']*10);(p/'stat').write_text(f"{app['pid']} (node) "+' '.join(fields))
 inode=str(app['pid']+90000);link=p/'fd/3'
 if link.exists()or link.is_symlink():link.unlink()
 link.symlink_to('socket:['+inode+']');(p/'net/tcp').write_text('sl local_address rem_address st tx_queue tr retrnsmt uid timeout inode\n0: 00000000:0BB9 00000000:0000 0A 0 0 0 0 0 '+inode+'\n');(p/'net/tcp6').write_text('sl local_address rem_address st tx_queue tr retrnsmt uid timeout inode\n')
args=sys.argv[1:];op=args[0]
with calls.open('a')as f:f.write(' '.join(args)+'\n')
key=op+(':'+args[1] if len(args)>1 else '')
if ctl.get('failOnce')==key:ctl['failOnce']=None;control.write_text(json.dumps(ctl));sys.exit(23)
if op=='jlist':print(json.dumps(apps));sys.exit(0)
if op=='delete':apps=[a for a in apps if a['name']!=args[1]];save();sys.exit(0)
if op=='start':
 d=json.loads(Path(args[1]).read_text());wanted=args[args.index('--only')+1];app=next(x for x in d['apps']if x['name']==wanted);counter=ctl.get('counter',2000)+1;ctl['counter']=counter;control.write_text(json.dumps(ctl))
 env={'status':'online','pm_cwd':app['cwd'],'pm_exec_path':app['script'],'exec_interpreter':app['interpreter'],'restart_time':0,'unstable_restarts':0,'env':app.get('env',{}),'args':app.get('args',[]),'autorestart':app.get('autorestart',True),'watch':app.get('watch',False),'out_file':app.get('out_file'),'error_file':app.get('error_file')}
 apps=[a for a in apps if a['name']!=wanted]+[{'name':wanted,'pid':counter,'pm2_env':env}];make_proc(apps[-1]);save();sys.exit(0)
if op=='save':
 dump=Path(os.environ['FIXTURE_DUMP']);dump.write_text(json.dumps(apps));os.chmod(dump,0o600);sys.exit(0)
sys.exit(64)
'''


def app(name: str, pid: int, cwd: Path, entry: Path, extra: dict[str, str] | None = None) -> dict[str, object]:
    env = {"PRIVATE_REQUIRED": SECRET, **(extra or {})}
    return {"name": name, "pid": pid, "pm2_env": {"status": "online", "pm_cwd": str(cwd), "pm_exec_path": str(entry), "exec_interpreter": "/usr/bin/node", "restart_time": 0, "unstable_restarts": 0, "env": env, "args": [], "instances": 1, "exec_mode": "fork", "autorestart": True, "watch": False, "out_file": "/logs/shared.out", "error_file": "/logs/shared.err"}}


def make_proc(root: Path, apps: list[dict[str, object]]) -> None:
    for value in apps:
        pid = int(value["pid"]); path = root / str(pid); (path / "fd").mkdir(parents=True); (path / "net").mkdir()
        fields = ["S"] + ["0"] * 40; fields[19] = str(pid * 10)
        (path / "stat").write_text(f"{pid} (node) " + " ".join(fields))
        inode = str(pid + 90000); (path / "fd/3").symlink_to(f"socket:[{inode}]")
        (path / "net/tcp").write_text("sl local_address rem_address st tx_queue tr retrnsmt uid timeout inode\n0: 00000000:0BB9 00000000:0000 0A 0 0 0 0 0 " + inode + "\n")
        (path / "net/tcp6").write_text("sl local_address rem_address st tx_queue tr retrnsmt uid timeout inode\n")


def fixture(folder: Path, *, fail_once: str | None = None) -> tuple[Path, Path, dict[str, str]]:
    release = folder / "release"; runtime = release / "runtime"; api = runtime / "api"; front = runtime / "frontend"
    (api / "dist").mkdir(parents=True); (front / ".next").mkdir(parents=True); (front / "node_modules/next/dist/bin").mkdir(parents=True)
    (api / "dist/index.js").write_text("candidate api\n"); (front / "node_modules/next/dist/bin/next").write_text("candidate frontend\n"); (front / ".next/BUILD_ID").write_text("fixture-build\n")
    for path in sorted(runtime.rglob("*"), reverse=True):
        if not path.is_symlink(): os.chmod(path, 0o755 if path.is_dir() else 0o444)
    os.chmod(runtime, 0o755)
    rows = index(runtime); (release / "runtime-index.json").write_text(json.dumps(rows, indent=2, sort_keys=True) + "\n")
    manifest = {"schemaVersion": 2, "deploymentClass": "IMMUTABLE_RELEASE", "baseCommit": "a"*40, "targetCommit": "b"*40, "apiParallelProbe": {"allowed": False, "reason": "NO_PROVEN_SIDE_EFFECT_FREE_MODE"}, "components": {"api": {"changed": True, "runtime": "runtime/api", "entrypoint": "dist/index.js", "entrySha256": digest(api/"dist/index.js")}, "frontend": {"changed": True, "runtime": "runtime/frontend", "entrypoint": "node_modules/next/dist/bin/next", "entrySha256": digest(front/"node_modules/next/dist/bin/next"), "args": ["start","-p","3000"], "probeArgs": ["start","-p","3100"], "buildId": "fixture-build"}, "worker": {"changed": False}}, "runtimeIndexSha256": index_digest(rows), "pm2SavePolicy": "EXACTLY_ONCE_AFTER_ACCEPTANCE"}
    (release / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    old = folder / "old"; api_old=old/"api";front_old=old/"front";worker=old/"worker"
    for item in (api_old,front_old,worker):item.mkdir(parents=True)
    (api_old/".data").mkdir()
    for item in (api_old/"index.js",front_old/"launcher.js",worker/"worker.js"):item.write_text("old\n")
    apps=[app("re7-whatsapp-agent",1001,api_old,api_old/"index.js"),app("re7-admin-front",1002,front_old,front_old/"launcher.js",{"RE7_FRONT_CONTROL":"/private/original-control","RE7_FRONT_RUN":"original-run"}),app("re7-whatsapp-web-worker",1003,worker,worker/"worker.js")]
    (folder/"pm2.json").write_text(json.dumps(apps));(folder/"control.json").write_text(json.dumps({"counter":2000,"failOnce":fail_once}));make_proc(folder/"proc",apps)
    pm2=folder/"pm2";pm2.write_text(FAKE_PM2);pm2.chmod(0o755);dump=folder/"dump.pm2";dump.write_text(json.dumps(apps));dump.chmod(0o600)
    env={**os.environ,"FIXTURE_ROOT":str(folder),"FIXTURE_DUMP":str(dump)}
    return release,pm2,env


def invoke(arguments: list[str], env: dict[str,str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run([str(EXECUTOR),*arguments],text=True,capture_output=True,env=env)


def common(release:Path,pm2:Path,transaction:Path,dump:Path,server:Server,proc:Path)->list[str]:
    return ["--release",str(release),"--transaction",str(transaction),"--pm2",str(pm2),"--proc-root",str(proc),"--dump",str(dump),"--api-health-local",server.url,"--api-health-public",server.url,"--frontend-health-local",server.url,"--frontend-health-public",server.url,"--sample-delay","0"]


def main() -> None:
    assert "deploy-normal-release.sh" not in EXECUTOR.read_text()
    with Server() as server, tempfile.TemporaryDirectory(prefix="immutable-release-fixture-") as tmp:
        root=Path(tmp);release,pm2,env=fixture(root);tx=root/"transaction";dump=root/"dump.pm2"
        result=invoke(["promote",*common(release,pm2,tx,dump,server,root/"proc")],env);assert result.returncode==0,result.stderr;assert result.stdout.strip()=="AWAITING_ACCEPTANCE"
        state=json.loads((tx/"state.private.json").read_text());assert state["state"]=="AWAITING_ACCEPTANCE" and state["saveCount"]==0
        for role in ("api","frontend"):
            definition=json.loads(Path(state["definitions"][role]["path"]).read_text())["apps"][0];assert definition["env"]["PRIVATE_REQUIRED"]==SECRET;assert definition["interpreter"]=="/usr/bin/node";assert definition["out_file"]=="/logs/shared.out"
        acceptance=root/"acceptance.json";acceptance.write_text(json.dumps({"targetCommit":"b"*40,"decision":"ACCEPTED"}));acceptance.chmod(0o600)
        args=["commit","--transaction",str(tx),"--acceptance",str(acceptance),"--pm2",str(pm2),"--proc-root",str(root/"proc"),"--dump",str(dump),"--api-health-local",server.url,"--api-health-public",server.url,"--frontend-health-local",server.url,"--frontend-health-public",server.url,"--sample-delay","0"]
        result=invoke(args,env);assert result.returncode==0,result.stderr;assert result.stdout.strip()=="DEPLOYED";assert (root/"calls.log").read_text().splitlines().count("save")==1
        try:(release/"runtime/api/dist/index.js").write_text("mutation")
        except PermissionError:pass
        else:raise AssertionError("read-only payload accepted mutation")
    with Server() as server, tempfile.TemporaryDirectory(prefix="immutable-release-health-failure-") as tmp:
        root=Path(tmp);release,pm2,env=fixture(root);tx=root/"transaction";server.server.failures["/fail-six"]=6;bad=f"http://127.0.0.1:{server.server.server_address[1]}/fail-six"
        argv=common(release,pm2,tx,root/"dump.pm2",server,root/"proc");idx=argv.index("--frontend-health-local");argv[idx+1]=bad;idx=argv.index("--frontend-health-public");argv[idx+1]=bad
        result=invoke(["promote",*argv],env);assert result.returncode!=0;report=json.loads((tx/"rollback-report.private.json").read_text());assert report["result"]=="ROLLED_BACK";assert "save" not in (root/"calls.log").read_text().splitlines()
    with Server() as server, tempfile.TemporaryDirectory(prefix="immutable-release-start-failure-") as tmp:
        root=Path(tmp);release,pm2,env=fixture(root,fail_once="start:"+str(root/"transaction/candidate-frontend.private.json"));tx=root/"transaction"
        result=invoke(["promote",*common(release,pm2,tx,root/"dump.pm2",server,root/"proc")],env);assert result.returncode!=0;assert json.loads((tx/"rollback-report.private.json").read_text())["result"]=="ROLLED_BACK"
    with Server() as server, tempfile.TemporaryDirectory(prefix="immutable-release-rollback-failure-") as tmp:
        root=Path(tmp);release,pm2,env=fixture(root);tx=root/"transaction";control=root/"control.json";bad="http://127.0.0.1:1/fail"
        argv=common(release,pm2,tx,root/"dump.pm2",server,root/"proc");idx=argv.index("--api-health-local");argv[idx+1]=bad
        # API verification fails; make the first rollback start fail.
        ctl=json.loads(control.read_text());ctl["failOnce"]="start:"+str(tx/"return-api.private.json");control.write_text(json.dumps(ctl))
        result=invoke(["promote",*argv],env);assert result.returncode!=0;report=json.loads((tx/"rollback-report.private.json").read_text());assert report["result"]=="ROLLBACK_FAILED";assert "ROLLED_BACK" not in result.stdout
    print("IMMUTABLE_RELEASE_FIXTURES_PASS: promotion, full-fidelity rollback, read-only payload, injected start/health/rollback failures, no false DEPLOYED/ROLLED_BACK")


if __name__ == "__main__": main()
