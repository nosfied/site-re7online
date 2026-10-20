#!/usr/bin/env python3
"""Exercise the relocatable canonical checker through its subprocess CLI."""

from __future__ import annotations

import ast
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
SCHEMA = ROOT / "docs/saas/releases/FRONTEND_CHECKER_BINDING_V1.schema.json"
LAUNCHER_SOURCE = ROOT / "docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/launcher.cjs"
BOOTSTRAP_SOURCE = ROOT / "docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/bootstrap.cjs"
BUILD_ID = "bt9-BI1dCQD7_gj8ktOvz"
PREDICATE_BASELINE = "49adff02f54f318e01345977d336483624741600"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_producer():
    spec = importlib.util.spec_from_file_location("phase1_state_producer", PRODUCER)
    if spec is None or spec.loader is None:
        raise RuntimeError("producer_import")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def compare_predicates() -> dict[str, object]:
    previous = subprocess.check_output(["git", "show", f"{PREDICATE_BASELINE}:scripts/release-assets/frontend-check.py"], text=True, cwd=ROOT)
    current = CHECKER.read_text()

    class NormalizeBindings(ast.NodeTransformer):
        names = {"CANDIDATE_ROOT": "P", "RETURN_ROOT": "RETURN_P", "LAUNCHER_PATH": "LAUNCHER", "TARGET_PATH": "TARGET", "PM2_PID_PATH": "PM_PID"}

        def visit_Name(self, node):
            node.id = self.names.get(node.id, node.id)
            return node

    def functions(source: str):
        return {node.name: node for node in ast.parse(source).body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}

    old = functions(previous)
    new = functions(current)
    binding_surface = {"proc", "rows", "ready", "main"}
    compared = sorted((set(old) & set(new)) - binding_surface)
    for name in compared:
        before = ast.dump(NormalizeBindings().visit(ast.fix_missing_locations(old[name])), include_attributes=False)
        after = ast.dump(NormalizeBindings().visit(ast.fix_missing_locations(new[name])), include_attributes=False)
        if before != after:
            raise RuntimeError(f"predicate_changed:{name}")
    def require_codes(source: str):
        result = set()
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "require" and len(node.args) > 1 and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str):
                result.add(node.args[1].value)
        return result

    old_codes = require_codes(previous)
    new_codes = {node.value for node in ast.walk(ast.parse(current)) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
    if not old_codes.issubset(new_codes):
        raise RuntimeError("predicate_code_removed")
    return {"baseline": PREDICATE_BASELINE, "unchangedFunctions": len(compared), "removedFunctions": sorted(set(old) - set(new)), "addedBindingFunctions": sorted(set(new) - set(old))}


def write_json(path: Path, value: object, mode: int = 0o600) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    path.chmod(mode)


def process(name: str, pid: int, cwd: str, entry: str) -> dict[str, object]:
    return {"name": name, "pid": pid, "pm2_env": {"status": "online", "pm_cwd": cwd, "pm_exec_path": entry, "exec_interpreter": "/usr/bin/node", "restart_time": 0, "exec_mode": "fork_mode"}}


def proc_identity(pid: int) -> dict[str, object]:
    fields = Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()
    return {"ticks": int(fields[19]), "parent": int(fields[1]), "state": fields[0], "group": int(fields[2])}


def verify_ticks_type_contract(producer) -> dict[str, object]:
    pid = os.getpid()
    producer_ticks = producer.proc_ticks(pid)
    fixture_ticks = proc_identity(pid)["ticks"]
    probe = (
        "import importlib.util,json,os,sys;"
        "p=sys.argv[1];"
        "s=importlib.util.spec_from_file_location('frontend_checker_ticks_probe',p);"
        "m=importlib.util.module_from_spec(s);"
        "s.loader.exec_module(m);"
        "v=m.proc(int(sys.argv[2]))['ticks'];"
        "print(json.dumps({'type':type(v).__name__,'value':v}))"
    )
    result = subprocess.run(
        [sys.executable, "-B", "-c", probe, str(CHECKER), str(pid)],
        text=True,
        capture_output=True,
        check=True,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")},
    )
    checker = json.loads(result.stdout)
    if type(producer_ticks) is not int or type(fixture_ticks) is not int or checker["type"] != "int":
        raise RuntimeError("ticks_type_contract")
    if producer_ticks != fixture_ticks or producer_ticks != checker["value"]:
        raise RuntimeError("ticks_value_contract")
    return {"producer": "int", "checkerRealProc": "int", "fixtureSurface": "int", "sameObservedValue": True}


def wait_for_journal(path: Path) -> list[dict[str, object]]:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if path.exists():
            records = [json.loads(line) for line in path.read_text().splitlines()]
            if [row.get("event") for row in records[:3]] == ["parent", "application_identity", "application_released"]:
                return records
        time.sleep(0.02)
    raise RuntimeError("canonical_launcher_journal_timeout")


PM2_SHIM_SOURCE = r'''#!/usr/bin/env python3
import json, sys
from pathlib import Path
state_path, log_path, action, *args = sys.argv[1:]
state = json.loads(Path(state_path).read_text())
if action == "delete": state[args[0]] = None
elif action == "start":
    component, definition = args
    state[component] = json.loads(Path(definition).read_text())["identity"]
elif action == "save": state["saveCalls"] += 1
else: raise SystemExit(42)
with Path(log_path).open("a") as stream: stream.write(json.dumps({"action":action,"args":args},sort_keys=True)+"\n")
Path(state_path).write_text(json.dumps(state,sort_keys=True)+"\n")
'''


def make_shim(root: Path, initial: dict[str, object]):
    shim = root / "pm2-shim"
    shim.write_text(PM2_SHIM_SOURCE)
    shim.chmod(0o700)
    state = root / "pm2-state.private.json"
    log = root / "pm2-log.private.jsonl"
    write_json(state, initial)
    return shim, state, log, sha256(shim)


def shim_call(shim: Path, digest: str, state: Path, log: Path, *args: str) -> None:
    if sha256(shim) != digest or not stat.S_ISREG(shim.stat().st_mode):
        raise RuntimeError("pm2_shim_identity")
    subprocess.run([str(shim), str(state), str(log), *args], check=True, env={"PATH": "/usr/bin:/bin"})
    if sha256(shim) != digest:
        raise RuntimeError("pm2_shim_changed")


def checker_call(binding: Path, surface: Path, action: str, *, expected: str | None = None, binding_sha: str | None = None) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, "-B", str(CHECKER), "--binding", str(binding), "--binding-sha256", binding_sha or sha256(binding), "--fixture-surface", str(surface), action]
    result = subprocess.run(command, text=True, capture_output=True, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")})
    if expected is not None:
        if result.returncode or expected not in result.stdout:
            raise RuntimeError(f"checker_cli:{action}:{result.returncode}:{result.stderr[-300:]}")
    return result


def prepare_attempt(base: Path, name: str, producer):
    attempt = base / name
    candidate = attempt / "candidate"
    returned = attempt / "return"
    target = candidate / "frontend-runtime"
    attempt.mkdir(mode=0o700)
    candidate.mkdir(mode=0o700)
    target.mkdir()
    (target / ".next").mkdir()
    returned.mkdir(mode=0o700)
    (target / ".next/BUILD_ID").write_text(BUILD_ID)
    entry = target / "fixture-entry.cjs"
    entry.write_text("setInterval(() => {}, 1000);\n")
    launcher = returned / "launcher.cjs"
    shutil.copyfile(LAUNCHER_SOURCE, launcher)
    shutil.copyfile(BOOTSTRAP_SOURCE, returned / "bootstrap.cjs")
    control_path = candidate / "candidate-v2.run.private.json"
    journal = candidate / "candidate-v2.startup.private.jsonl"
    control = {"release": str(target), "entry": str(entry), "entrySha256": sha256(entry), "buildId": BUILD_ID, "nonce": f"{name}-candidate-nonce", "journal": str(journal), "args": [], "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(), "preExisting": {}}
    write_json(control_path, control)
    policy = candidate / "policy.private.json"
    write_json(policy, {"roles": {"candidate": {key: control[key] for key in ("release", "entry", "entrySha256", "buildId")}}})
    report = candidate / "api-report.private.json"
    write_json(report, {"result": "API_CANDIDATE_STABLE", "candidateCapture": {"status": "PASS", "pid": 102, "startTicks": 1002}})
    ticks = {102: 1002, 201: 2001, 301: 3001, 401: 4001}
    before_rows = [process("re7-whatsapp-web-worker", 301, "/runtime/worker", "/runtime/worker/index.js"), process("re7-whatsapp-agent", 102, "/runtime/api-candidate", "/runtime/api-candidate/index.js"), process("re7-admin-front", 201, "/runtime/frontend-return", str(launcher))]
    execution_id = f"crm-contacts-{name}-20261020"
    producer.capture(candidate, execution_id, report, control_path, policy, sha256(policy), rows=before_rows, daemon_pid=401, tick_reader=ticks.__getitem__)
    pm2_pid = candidate / "pm2.pid"
    pm2_pid.write_text("401\n")
    binding = attempt / "frontend-check.binding.private.json"
    write_json(binding, {"schemaVersion": 1, "candidateRoot": str(candidate), "returnRoot": str(returned), "launcher": str(launcher), "target": str(target), "pm2Pid": str(pm2_pid)})
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node_unavailable")
    launch = subprocess.Popen([node, str(launcher)], cwd=returned, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "RE7_FRONT_CONTROL": str(control_path), "RE7_FRONT_RUN": control["nonce"]}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    records = wait_for_journal(journal)
    for record in records:
        if "ticks" in record:
            record["ticks"] = int(record["ticks"])
    journal.write_text("".join(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n" for record in records))
    child = int(next(row["pid"] for row in records if row["event"] == "application_identity"))
    current_rows = [before_rows[0], before_rows[1], process("re7-admin-front", launch.pid, str(target), str(launcher))]
    current_rows[2]["pm2_env"].update(watch=False, autorestart=True, stop_exit_codes=[78], RE7_FRONT_CONTROL=str(control_path), RE7_FRONT_RUN=control["nonce"])
    processes = {str(pid): {"ticks": value, "parent": 1, "state": "S", "group": pid} for pid, value in ticks.items()}
    processes[str(launch.pid)] = proc_identity(launch.pid)
    processes[str(child)] = proc_identity(child)
    surface = attempt / "checker-surface.private.json"
    write_json(surface, {"schemaVersion": 1, "pm2Rows": current_rows, "processes": processes, "httpStatus": 200})
    return {"attempt": attempt, "candidate": candidate, "return": returned, "binding": binding, "surface": surface, "control": control_path, "journal": journal, "launch": launch, "rows": current_rows, "ticks": ticks, "executionId": execution_id}


def exercise(attempt: dict[str, object], producer) -> dict[str, object]:
    binding = attempt["binding"]
    surface = attempt["surface"]
    checker_call(binding, surface, "ready-candidate", expected="ready-candidate:PASS")
    sealed = producer.seal_readiness(attempt["candidate"], attempt["executionId"], rows=attempt["rows"], tick_reader=lambda pid: int(json.loads(surface.read_text())["processes"][str(pid)]["ticks"]))
    checker_call(binding, surface, "enable-supervision-candidate", expected="enable-supervision-candidate:PASS")
    checker_call(binding, surface, "supervised-candidate", expected="supervised-candidate:PASS")
    marker = Path(str(attempt["control"]) + ".permanent")
    if marker.stat().st_mtime_ns < attempt["journal"].stat().st_mtime_ns or sealed["result"] != "PHASE1_READINESS_BOUND_PASS":
        raise RuntimeError("supervision_order")
    replay = checker_call(binding, surface, "ready-candidate")
    if replay.returncode == 0 or "candidate_root_consumed" not in replay.stderr:
        raise RuntimeError("consumed_root_replay_allowed")
    return {"root": str(attempt["candidate"]), "bindingSha256": sha256(binding), "markerProducer": "enable-supervision-candidate"}


def negative_bindings(attempt: dict[str, object]) -> None:
    binding = attempt["binding"]
    surface = attempt["surface"]
    no_binding = subprocess.run([sys.executable, "-B", str(CHECKER), "ready-candidate"], text=True, capture_output=True)
    if no_binding.returncode == 0:
        raise RuntimeError("missing_binding_allowed")
    altered = binding.with_name("altered-binding.private.json")
    shutil.copyfile(binding, altered);altered.chmod(0o600)
    original_sha = sha256(altered)
    altered.write_text(altered.read_text() + "\n")
    if checker_call(altered, surface, "ready-candidate", binding_sha=original_sha).returncode == 0:
        raise RuntimeError("altered_binding_allowed")
    symlink = binding.with_name("binding-link.private.json")
    symlink.symlink_to(binding)
    if checker_call(symlink, surface, "ready-candidate", binding_sha=sha256(binding)).returncode == 0:
        raise RuntimeError("binding_symlink_allowed")
    for label, transform in (
        ("relative", lambda value: {**value, "candidateRoot": "relative"}),
        ("extra", lambda value: {**value, "argv": []}),
    ):
        path = binding.with_name(f"{label}-binding.private.json")
        transform_value = transform(json.loads(binding.read_text()))
        write_json(path, transform_value)
        if checker_call(path, surface, "ready-candidate").returncode == 0:
            raise RuntimeError(f"invalid_binding_allowed:{label}")


def finish_success(attempt: dict[str, object]) -> dict[str, object]:
    shim, state, log, digest = make_shim(attempt["attempt"], {"api": "candidate", "frontend": "candidate", "worker": "preserved", "saveCalls": 0})
    shim_call(shim, digest, state, log, "save")
    value = json.loads(state.read_text())
    if value["saveCalls"] != 1 or len(log.read_text().splitlines()) != 1:
        raise RuntimeError("save_once")
    return {"saveCalls": 1, "pm2ShimSha256": digest}


def finish_rollback(attempt: dict[str, object]) -> dict[str, object]:
    api_return = attempt["attempt"] / "api-return.private.json"
    frontend_return = attempt["attempt"] / "frontend-return.private.json"
    write_json(api_return, {"identity": "API_ORIGINAL"})
    write_json(frontend_return, {"identity": "FRONTEND_ACTIVE_PERMANENT"})
    shim, state, log, digest = make_shim(attempt["attempt"], {"api": "candidate", "frontend": "candidate", "worker": "preserved", "saveCalls": 0})
    for args in (("delete", "frontend"), ("start", "frontend", str(frontend_return)), ("delete", "api"), ("start", "api", str(api_return))):
        shim_call(shim, digest, state, log, *args)
    value = json.loads(state.read_text())
    if value != {"api": "API_ORIGINAL", "frontend": "FRONTEND_ACTIVE_PERMANENT", "worker": "preserved", "saveCalls": 0}:
        raise RuntimeError("rollback_not_integral")
    return {"saveCalls": 0, "pm2ShimSha256": digest, "state": value}


def stop(attempt: dict[str, object]) -> None:
    process = attempt["launch"]
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill();process.wait(timeout=3)


def main() -> None:
    source = Path(__file__).read_text()
    forbidden = ("bind"+"_checker", *("checker."+name+" =" for name in ("P","RETURN_P","LAUNCHER","TARGET","PM_PID","proc","rows")), "checker."+"urllib")
    if any(value in source for value in forbidden):
        raise RuntimeError("checker_monkeypatch_present")
    producer = load_producer()
    ticks_type_contract = verify_ticks_type_contract(producer)
    predicate_comparison = compare_predicates()
    schema = json.loads(SCHEMA.read_text())
    if schema["additionalProperties"] is not False or set(schema["required"]) != {"schemaVersion", "candidateRoot", "returnRoot", "launcher", "target", "pm2Pid"}:
        raise RuntimeError("binding_schema")
    with tempfile.TemporaryDirectory(prefix="relocatable-checker-cli-") as temporary:
        base = Path(temporary)
        first = prepare_attempt(base, "exclusive-one", producer)
        second = prepare_attempt(base, "exclusive-two", producer)
        try:
            negative_bindings(first)
            first_result = exercise(first, producer)
            first_result.update(finish_success(first))
            second_result = exercise(second, producer)
            second_result.update(finish_rollback(second))
        finally:
            stop(first);stop(second)
    if first_result["root"] == second_result["root"]:
        raise RuntimeError("exclusive_roots_alias")
    print(json.dumps({"result": "RELOCATABLE_CHECKER_CLI_END_TO_END_PASS", "checkerSha256": sha256(CHECKER), "bindingSchemaSha256": sha256(SCHEMA), "predicateComparison": predicate_comparison, "ticksTypeContract": ticks_type_contract, "monkeypatch": False, "exclusiveRoots": 2, "first": first_result, "second": second_result, "realPm2Invocations": 0, "productionChanged": False}, sort_keys=True))


if __name__ == "__main__":
    main()
