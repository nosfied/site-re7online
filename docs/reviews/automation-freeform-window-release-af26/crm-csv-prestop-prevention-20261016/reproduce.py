"""Run only focused tests in an isolated delivered tree, without private evidence."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ('prestop_contract.py', 'future_sources.py', 'source_inputs.py',
         'test_prevention.py', 'SOURCE_PROVENANCE.json')


def run():
    spec = json.loads((HERE / 'SOURCE_PROVENANCE.json').read_text())
    with tempfile.TemporaryDirectory(prefix='re7-prestop-delivery-') as folder:
        dest = Path(folder)
        for name in FILES:
            shutil.copyfile(HERE / name, dest / name)
        (dest / 'reference_sources').mkdir()
        for name, ref in spec['retainedExtracts'].items():
            raw = (HERE / 'reference_sources' / name).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == ref['deliveredSha256'], 'excerpt_hash'
            (dest / 'reference_sources' / name).write_bytes(raw)
        (dest / 'versioned-inputs').mkdir()
        for name, ref in spec['versioned'].items():
            raw = subprocess.check_output(['git', 'show', ref['commit'] + ':' + ref['path']], cwd=HERE)
            assert hashlib.sha256(raw).hexdigest() == ref['sha256'], 'versioned_source_hash'
            (dest / 'versioned-inputs' / name).write_bytes(raw)
        (dest / 'ISOLATED_DELIVERY').write_text('No Git fallback or local-evidence permitted.\n')
        assert not (dest / 'local-evidence').exists()
        result = subprocess.run([sys.executable, '-B', str(dest / 'test_prevention.py')], cwd=dest,
                                env={'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'},
                                capture_output=True, text=True)
        sys.stderr.write(result.stderr)
        sys.stdout.write(result.stdout)
        return result.returncode


if __name__ == '__main__':
    sys.exit(run())
