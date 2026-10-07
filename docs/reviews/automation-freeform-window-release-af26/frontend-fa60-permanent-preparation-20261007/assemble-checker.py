"""Reconstruct review bytes; no bindings, authorization or installation."""
import hashlib,subprocess,sys
from pathlib import Path
here=Path(__file__).resolve().parent;out=Path(sys.argv[1]).resolve()
subprocess.run([sys.executable,str(here.parent/'frontend-layout-audit-20261007/assemble-checker.py'),str(out)],check=True)
with (here/'boot-binding.patch').open() as f:subprocess.run(['patch','--batch','--fuzz=0','-p1'],cwd=out,stdin=f,check=True)
assert hashlib.sha256((out/'frontend-check.py').read_bytes()).hexdigest()=='e0793d24b883f0958ef1f2a5dfa98c93dd87989f574339e9788cdea53c476920'
print('FINAL_REVIEW_BYTES_PASS')
