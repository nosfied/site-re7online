"""Reconstruct new supervision bytes; never generate state/install/start."""
import hashlib,subprocess,sys
from pathlib import Path
here=Path(__file__).resolve().parent;out=Path(sys.argv[1]).resolve()
subprocess.run([sys.executable,str(here.parent/'frontend-fa60-permanent-preparation-20261007/assemble-checker.py'),str(out)],check=True)
with (here/'permanent-supervision.patch').open() as f:subprocess.run(['patch','--batch','--fuzz=0','-p1'],cwd=out,stdin=f,check=True)
print(hashlib.sha256((out/'frontend-check.py').read_bytes()).hexdigest())
