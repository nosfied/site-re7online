#!/usr/bin/env python3
"""Run the canonical Phase 1 supervision actions with real fixture interfaces."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRODUCER = ROOT / "scripts/crm-contacts-phase1-state-producer.py"
CHECKER = ROOT / "scripts/release-assets/frontend-check.py"
LAUNCHER_SOURCE = ROOT / "docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/launcher.cjs"
BOOTSTRAP_SOURCE = ROOT / "docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/bootstrap.cjs"
POLICY_SHA = "10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a"
CHECKER_SHA = "ea3e6944667c2dd513ef54abc4a504fe3698451670b8d24b8f3de8d5c7243201"
BUILD_ID = "bt9-BI1dCQD7_gj8ktOvz"
EXECUTION_ID = "crm-contacts-final-fixture-20261020"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"module_import:{name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object, mode: int = 0o600) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(mode)


def process(name: str, pid: int, cwd: str, entry: str) -> dict[str, object]:
    return {"name": name, "pid": pid, "pm2_env": {"status": "online", "pm_cwd": cwd, "pm_exec_path": entry, "exec_interpreter": "/usr/bin/node", "restart_time": 0, "exec_mode": "fork_mode"}}


def assert_mode(path: Path) -> None:
    if stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise RuntimeError(f"mode_not_0600:{path.name}")


def wait_for_journal(path: Path) -> list[dict[str, object]]:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if path.exists():
            records = [json.loads(line) for line in path.read_text().splitlines()]
            if [row.get("event") for row in records[:3]] == ["parent", "application_identity", "application_released"]:
                return records
        time.sleep(0.02)
    raise RuntimeError("canonical_launcher_journal_timeout")


class HttpPass:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _size=-1):
        return b"ok"


PM2_SHIM_SOURCE = r'''#!/usr/bin/env python3
import json, sys
from pathlib import Path
state_path, log_path, action, *args = sys.argv[1:]
state = json.loads(Path(state_path).read_text())
entry = {"action": action, "args": args}
if action == "delete":
    state[args[0]] = None
elif action == "start":
    component, definition = args
    if not Path(definition).is_file(): raise SystemExit(41)
    state[component] = json.loads(Path(definition).read_text())["identity"]
elif action == "save":
    state["saveCalls"] += 1
else:
    raise SystemExit(42)
with Path(log_path).open("a") as stream:
    stream.write(json.dumps(entry, sort_keys=True) + "\n")
Path(state_path).write_text(json.dumps(state, sort_keys=True) + "\n")
'''


def make_pm2_shim(root: Path, initial: dict[str, object]) -> tuple[Path, Path, Path, str]:
    shim = root / "pm2-shim"
    shim.write_text(PM2_SHIM_SOURCE)
    shim.chmod(0o700)
    state = root / "pm2-shim-state.private.json"
    log = root / "pm2-shim-log.private.jsonl"
    write_json(state, initial)
    return shim, state, log, sha256(shim)


def run_shim(shim: Path, expected_sha: str, state: Path, log: Path, *args: str) -> None:
    if sha256(shim) != expected_sha or not stat.S_ISREG(shim.stat().st_mode):
        raise RuntimeError("pm2_shim_identity")
    subprocess.run([str(shim), str(state), str(log), *args], check=True, env={"PATH": "/usr/bin:/bin"})
    if sha256(shim) != expected_sha:
        raise RuntimeError("pm2_shim_changed")


def base_inputs(root: Path, producer):
    root.mkdir(mode=0o700)
    control_path = root / "candidate-v2.run.private.json"
    journal = root / "candidate-v2.startup.private.jsonl"
    release = root / "frontend-runtime"
    (release / ".next").mkdir(parents=True)
    (release / ".next/BUILD_ID").write_text(BUILD_ID)
    entry = release / "fixture-entry.cjs"
    entry.write_text("setInterval(() => {}, 1000);\n")
    launcher = root / "launcher.cjs"
    shutil.copyfile(LAUNCHER_SOURCE, launcher)
    shutil.copyfile(BOOTSTRAP_SOURCE, root / "bootstrap.cjs")
    control = {"release": str(release), "entry": str(entry), "entrySha256": sha256(entry), "buildId": BUILD_ID, "nonce": "phase1-reused-candidate-nonce", "journal": str(journal), "args": [], "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(), "preExisting": {}}
    write_json(control_path, control)
    policy_path = root / "permanent-policy.proposed.private.json"
    policy = {"roles": {"candidate": {key: control[key] for key in ("release", "entry", "entrySha256", "buildId")}}}
    write_json(policy_path, policy)
    api_report_path = root / "api-report.private.json"
    write_json(api_report_path, {"result": "API_CANDIDATE_STABLE", "candidateCapture": {"status": "PASS", "pid": 102, "startTicks": 1002}})
    ticks = {102: 1002, 201: 2001, 301: 3001, 401: 4001}
    rows = [process("re7-whatsapp-web-worker", 301, "/runtime/worker", "/runtime/worker/index.js"), process("re7-whatsapp-agent", 102, "/runtime/api-candidate", "/runtime/api-candidate/index.js"), process("re7-admin-front", 201, "/runtime/frontend-return", str(launcher))]
    return api_report_path, control_path, policy_path, ticks, rows, control, producer.sha256(policy_path), launcher, journal


def bind_checker(checker, root: Path, launcher: Path, control: dict[str, object], ticks: dict[int, int], rows: list[dict[str, object]], launcher_pid: int, child_pid: int):
    actual_proc = checker.proc

    def fixture_proc(pid: int, require_alive: bool = True):
        if pid in (launcher_pid, child_pid):
            return actual_proc(pid, require_alive=require_alive)
        if pid not in ticks:
            raise ProcessLookupError(pid)
        return {"pid": pid, "ticks": ticks[pid], "parent": 1, "state": "S", "group": pid}

    current = [rows[0], rows[1], process("re7-admin-front", launcher_pid, control["release"], str(launcher))]
    current[2]["pm2_env"].update(watch=False, autorestart=True, stop_exit_codes=[78], RE7_FRONT_CONTROL=str(root / "candidate-v2.run.private.json"), RE7_FRONT_RUN=control["nonce"])
    checker.P = root
    checker.RETURN_P = root / "return"
    checker.LAUNCHER = launcher
    checker.TARGET = control["release"]
    checker.PM_PID = root / "pm2.pid"
    checker.PM_PID.write_text("401\n")
    checker.proc = fixture_proc
    checker.rows = lambda timeout=3: current
    checker.urllib.request.urlopen = lambda *_args, **_kwargs: HttpPass()
    return current


def successful_path(base: Path, producer, checker) -> dict[str, object]:
    root = base / "success"
    api_report, control_path, policy_path, ticks, rows, control, policy_sha, launcher, journal = base_inputs(root, producer)
    outputs = [root / "runtime.private.json", root / "daemon.private.json", root / "phase1-state-binding.private.json", root / "candidate-v2.readiness.private.jsonl", root / "candidate-v2.readiness-binding.private.json", Path(str(control_path) + ".permanent")]
    if any(path.exists() for path in outputs):
        raise RuntimeError("outputs_not_initially_absent")
    binding = producer.capture(root, EXECUTION_ID, api_report, control_path, policy_path, policy_sha, rows=rows, daemon_pid=401, tick_reader=ticks.__getitem__)
    for path in outputs[:3]:
        assert_mode(path)
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node_unavailable")
    launcher_process = subprocess.Popen([node, str(launcher)], cwd=root, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "RE7_FRONT_CONTROL": str(control_path), "RE7_FRONT_RUN": control["nonce"]}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        records = wait_for_journal(journal)
        child_pid = int(next(row["pid"] for row in records if row["event"] == "application_identity"))
        bind_checker(checker, root, launcher, control, ticks, rows, launcher_process.pid, child_pid)
        checker.main("ready-candidate")
        readiness = root / "candidate-v2.readiness.private.jsonl"
        assert_mode(readiness)
        if json.loads(readiness.read_text().splitlines()[-1])["result"] != "PASS":
            raise RuntimeError("canonical_readiness_not_pass")
        sealed = producer.seal_readiness(root, EXECUTION_ID, rows=checker.rows(), tick_reader=lambda pid: checker.proc(pid)["ticks"])
        checker.main("enable-supervision-candidate")
        marker = Path(str(control_path) + ".permanent")
        assert_mode(marker)
        if marker.stat().st_mtime_ns < journal.stat().st_mtime_ns:
            raise RuntimeError("marker_before_journal")
        checker.main("supervised-candidate")
        acceptance = root / "manual-acceptance.private.json"
        producer.atomic_json(acceptance, {"executionId": EXECUTION_ID, "decision": "ACCEPTED", "api": binding["apiIdentity"], "frontend": sealed["frontendIdentity"], "buildId": BUILD_ID})
        shim, state, log, shim_sha = make_pm2_shim(root, {"api": "candidate", "frontend": "candidate", "worker": "preserved", "saveCalls": 0})
        run_shim(shim, shim_sha, state, log, "save")
        final_state = json.loads(state.read_text())
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        if final_state["saveCalls"] != 1 or calls != [{"action": "save", "args": []}]:
            raise RuntimeError("save_once_not_executed")
        return {"states": ["API_PASS", "PHASE1_CAPTURED", "FRONTEND_PASS", "READINESS_PASS", "JOURNAL_VALID", "ACTIVE_PERMANENT", "OWNER_ACCEPTED", "SAVED_ONCE"], "canonicalActions": ["ready-candidate", "seal-readiness", "enable-supervision-candidate", "supervised-candidate"], "saveCalls": final_state["saveCalls"], "pm2ShimSha256": shim_sha, "realPm2Calls": 0}
    finally:
        launcher_process.terminate()
        try:
            launcher_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            launcher_process.kill()
            launcher_process.wait(timeout=3)


def rollback_path(base: Path) -> dict[str, object]:
    root = base / "rollback"
    root.mkdir(mode=0o700)
    api_return = root / "api-return.private.json"
    frontend_return = root / "frontend-supervised-return.private.json"
    write_json(api_return, {"identity": "API_ORIGINAL"})
    write_json(frontend_return, {"identity": "FRONTEND_ACTIVE_PERMANENT"})
    shim, state, log, shim_sha = make_pm2_shim(root, {"api": "candidate", "frontend": "candidate", "worker": "preserved", "saveCalls": 0})
    run_shim(shim, shim_sha, state, log, "delete", "frontend")
    run_shim(shim, shim_sha, state, log, "start", "frontend", str(frontend_return))
    run_shim(shim, shim_sha, state, log, "delete", "api")
    run_shim(shim, shim_sha, state, log, "start", "api", str(api_return))
    final_state = json.loads(state.read_text())
    calls = [json.loads(line) for line in log.read_text().splitlines()]
    expected = [{"action": "delete", "args": ["frontend"]}, {"action": "start", "args": ["frontend", str(frontend_return)]}, {"action": "delete", "args": ["api"]}, {"action": "start", "args": ["api", str(api_return)]}]
    if calls != expected or final_state != {"api": "API_ORIGINAL", "frontend": "FRONTEND_ACTIVE_PERMANENT", "worker": "preserved", "saveCalls": 0}:
        raise RuntimeError("rollback_not_integral")
    return {"states": ["FRONTEND_DENIED", "ROLLBACK_INTEGRAL"], **final_state, "pm2ShimSha256": shim_sha, "realPm2Calls": 0}


def main() -> None:
    if sha256(CHECKER) != CHECKER_SHA:
        raise RuntimeError("canonical_checker_hash")
    producer = load_module("phase1_state_producer", PRODUCER)
    checker = load_module("canonical_frontend_checker", CHECKER)
    with tempfile.TemporaryDirectory(prefix="phase1-supervision-reuse-") as temporary:
        root = Path(temporary)
        success = successful_path(root, producer, checker)
        rollback = rollback_path(root)
    if success["realPm2Calls"] or rollback["realPm2Calls"]:
        raise RuntimeError("real_pm2_invocation")
    record = json.loads((ROOT / "docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_FINAL_SUPERVISION.json").read_text())
    if record["policySha256"] != POLICY_SHA or record["artifacts"]["stateProducer"]["sha256"] != producer.sha256(PRODUCER):
        raise RuntimeError("public_manifest_binding")
    if record["artifacts"]["frontendChecker"]["sha256"] != sha256(CHECKER):
        raise RuntimeError("public_checker_binding")
    if [item["initialState"] for item in record["singleUseOutputs"]] != ["ABSENT"] * len(record["singleUseOutputs"]):
        raise RuntimeError("single_use_initial_state")
    print(json.dumps({"result": "FINAL_SUPERVISION_PHASE1_REUSE_END_TO_END_PASS", "success": success, "rollback": rollback, "checkerSha256": sha256(CHECKER), "producerSha256": producer.sha256(PRODUCER), "productionChanged": False}, sort_keys=True))


if __name__ == "__main__":
    main()
