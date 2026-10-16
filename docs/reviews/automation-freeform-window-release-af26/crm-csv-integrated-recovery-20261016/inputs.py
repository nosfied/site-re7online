"""Pinned code inputs; isolated runs have no Git/private-evidence fallback."""
import hashlib
import json
import subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
SPEC=json.loads((HERE/'SOURCE_PROVENANCE.json').read_text())


def source(name):
    if name in SPEC['versioned']:
        ref=SPEC['versioned'][name]
        if (HERE/'ISOLATED_DELIVERY').exists():
            raw=(HERE/'versioned-inputs'/name).read_bytes()
        else:
            raw=subprocess.check_output(['git','show',ref['commit']+':'+ref['path']],cwd=HERE)
        digest=ref['sha256']
    else:
        ref=SPEC['excerpts'][name];raw=(HERE/'reference_sources'/name).read_bytes()
        digest=ref['deliveredSha256']
    if hashlib.sha256(raw).hexdigest()!=digest:raise RuntimeError('source_input_hash_drift:'+name)
    return raw.decode()
