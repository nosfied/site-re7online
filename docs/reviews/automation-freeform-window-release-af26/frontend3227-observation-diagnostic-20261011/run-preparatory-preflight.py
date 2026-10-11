"""Preparation only; existing bounded observer driver, no process/control mutation."""
import importlib.util,json,subprocess,sys
from pathlib import Path
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P))
import preflight
assert len(sys.argv)==1
subprocess.run(['python3',str(P/'check-preparation.py')],check=True,timeout=30)
s=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
r=preflight.run(g,P,json.loads((P/'origin.private.json').read_text()),json.loads((P/'observer-policy.private.json').read_text()))
if r['result']!='PASS':
 print('PREPARATORY_PREFLIGHT_DENY_DIAGNOSTICS_PRESERVED');raise SystemExit(1)
assert (P/'execution-authorized').read_text().strip()=='false'
a=P/'source-tree.preparatory.private.json';assert not a.exists() and not a.is_symlink()
(P/'source-tree.private.json').rename(a)
print('PREPARATORY_PREFLIGHT_PASS_ARCHIVED_GATES_FALSE')
