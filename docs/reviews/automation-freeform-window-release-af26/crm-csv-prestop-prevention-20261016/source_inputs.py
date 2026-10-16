"""Hash-checked delivered excerpts and exact versioned source inputs. No VPS."""
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROVENANCE = json.loads((HERE / 'SOURCE_PROVENANCE.json').read_text())


def read_source(name):
    if name in PROVENANCE['versioned']:
        ref = PROVENANCE['versioned'][name]
        staged = HERE / 'versioned-inputs' / name
        if (HERE / 'ISOLATED_DELIVERY').exists():
            raw = staged.read_bytes()  # No fallback to Git or external evidence.
        else:
            raw = subprocess.check_output(['git', 'show', ref['commit'] + ':' + ref['path']], cwd=HERE)
        digest = ref['sha256']
    else:
        ref = PROVENANCE['retainedExtracts'][name]
        raw = (HERE / 'reference_sources' / name).read_bytes()
        digest = ref['deliveredSha256']
    if hashlib.sha256(raw).hexdigest() != digest:
        raise RuntimeError('consumer_source_hash_mismatch:' + name)
    return raw.decode()
