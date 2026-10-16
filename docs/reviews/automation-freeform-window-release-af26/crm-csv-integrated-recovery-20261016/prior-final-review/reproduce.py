"""Only local synthetic rehearsal, isolated delivered sources. No operational package."""
import hashlib,json,shutil,subprocess,sys,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
FILES=('recovery.py','recovery_contract.py','recovery_bridge.py','recovery_start.py',
       'policy_proposal.py','future_sources.py','inputs.py','test_recovery.py','SOURCE_PROVENANCE.json')


def run():
    spec=json.loads((HERE/'SOURCE_PROVENANCE.json').read_text())
    with tempfile.TemporaryDirectory(prefix='re7-csv-recovery-delivery-') as tmp:
        dest=Path(tmp)
        for name in FILES:shutil.copyfile(HERE/name,dest/name)
        (dest/'reference_sources').mkdir()
        for name,ref in spec['excerpts'].items():
            raw=(HERE/'reference_sources'/name).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==ref['deliveredSha256'],'excerpt_hash'
            (dest/'reference_sources'/name).write_bytes(raw)
        (dest/'versioned-inputs').mkdir()
        for name,ref in spec['versioned'].items():
            raw=subprocess.check_output(['git','show',ref['commit']+':'+ref['path']],cwd=HERE)
            assert hashlib.sha256(raw).hexdigest()==ref['sha256'],'git_source_hash'
            (dest/'versioned-inputs'/name).write_bytes(raw)
        (dest/'ISOLATED_DELIVERY').write_text('No Git or private evidence fallback.\n')
        assert not (dest/'.git').exists() and not (dest/'local-evidence').exists()
        result=subprocess.run([sys.executable,'-B',str(dest/'test_recovery.py')],cwd=dest,
            env={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True)
        sys.stderr.write(result.stderr);sys.stdout.write(result.stdout)
        return result.returncode


if __name__=='__main__':sys.exit(run())
