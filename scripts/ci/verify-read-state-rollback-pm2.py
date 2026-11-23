#!/usr/bin/env python3
"""Real PM2 6.0.14 delete -> start proof for the CB-compatible external root."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--pm2", required=True); parser.add_argument("--node", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="cb-read-state-pm2-") as raw:
        base = Path(raw); home = base / "pm2"; home.mkdir(mode=0o700)
        root = base / "runtime-data/inbox-read-state"; root.mkdir(parents=True, mode=0o700); root.chmod(0o700)
        app = base / "app.js"; ready = base / "ready.json"; state = root / "tenant-a/shared.json"
        app.write_text("""
const fs=require('fs'),path=require('path');
const root=process.env.INBOX_READ_STATE_ROOT;
if(!root||!path.isAbsolute(root)) process.exit(41);
const file=path.join(root,'tenant-a','shared.json');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
if(!fs.existsSync(file)){fs.writeFileSync(file,JSON.stringify({lastReadAtByConversationKey:{a:'2026-11-23T10:00:00.000Z'},manuallyUnreadByConversationKey:{}}),{mode:0o600});}
const value=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(process.env.READY_PATH,JSON.stringify({pid:process.pid,value}),{mode:0o600});
setInterval(()=>{},1000);
""")
        env = dict(os.environ, PM2_HOME=str(home), INBOX_READ_STATE_ROOT=str(root), READY_PATH=str(ready))
        def pm2(*items: str):
            result = subprocess.run([args.pm2, *items], env=env, text=True, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"pm2_command_failed:{items}:{result.stdout}:{result.stderr}")
            return result
        def wait_ready() -> dict:
            for _ in range(100):
                if ready.exists(): return json.loads(ready.read_text())
                time.sleep(0.05)
            raise RuntimeError("pm2_read_state_readiness_timeout")
        try:
            pm2("start", str(app), "--name", "cb-read-state-compat", "--interpreter", args.node, "--no-autorestart")
            first = wait_ready(); ready.unlink()
            pm2("delete", "cb-read-state-compat")
            pm2("start", str(app), "--name", "cb-read-state-compat", "--interpreter", args.node, "--no-autorestart")
            second = wait_ready()
            if first["pid"] == second["pid"] or first["value"] != second["value"]:
                raise RuntimeError("pm2_delete_start_state_mismatch")
            if stat.S_IMODE(state.stat().st_mode) != 0o600 or stat.S_IMODE(state.parent.stat().st_mode) != 0o700:
                raise RuntimeError("pm2_delete_start_storage_mode")
            print("CB_READ_STATE_PM2_DELETE_START_PASS")
        finally:
            subprocess.run([args.pm2, "delete", "all"], env=env, capture_output=True)
            subprocess.run([args.pm2, "kill"], env=env, capture_output=True)


if __name__ == "__main__": main()
