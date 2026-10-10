"""Exercise the actual frontend preparation guard predicate; no VPS/preflight."""
import ast, copy, json, tempfile
from pathlib import Path
source = Path(__file__).resolve().parents[1] / "frontend-3227b2d7-prepared-20261009/check-preparation.py"
tree = ast.parse(source.read_text())
need = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "need")
predicate = next(n for n in tree.body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and any(isinstance(c, ast.Constant) and c.value == "guard_drift" for c in ast.walk(n)))
class LocalPath:
    def __new__(cls, path):
        assert path == "/var/lib/re7/campaign-operations/state.json"
        return fixture
with tempfile.TemporaryDirectory(prefix="re7-frontend-contract-") as tmp:
    fixture = Path(tmp) / "guard.json"
    baseline = {"open": False, "generation": 37, "tasks": {"synthetic-provider": {"kind": "provider", "phase": "persisting", "reference": {"messageId": "synthetic.6"}}}}
    env = {"Path": LocalPath, "json": json, "old": {"guard": baseline}}
    code = compile(ast.fix_missing_locations(ast.Module(body=[need, predicate], type_ignores=[])), str(source), "exec")
    fixture.write_text(json.dumps(baseline)); exec(code, env)
    for field, value in [("generation", 36), ("open", True), ("tasks", {})]:
        changed = copy.deepcopy(baseline); changed[field] = value; fixture.write_text(json.dumps(changed))
        try: exec(code, env)
        except (RuntimeError, AssertionError, SystemExit) as error:
            assert "guard_drift" in str(error)
        else: raise AssertionError("drift accepted: " + field)
print("FRONTEND_GUARD_PREDICATE_PASS: unchanged closed37/task allowed; generation/open/task drift denied; not a live preflight")
