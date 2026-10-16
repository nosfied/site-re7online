"""Reproduce ONLY this delta in an isolated delivered tree. No private evidence.
No installed bootstrap/helper, live transport, historical operation or product build.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
ACCEPTED=REVIEW/'crm-csv-integrated-recovery-20261016'
BASE='bdb57f57601147632bb529895cbcd92b8b483c6c'
NEW=('authority.py','root_store.py','root_extension.py','verified_loader.py','bootstrap.py',
     'node_bootstrap.cjs','integration.py','child_transport.py','test_authority.py','test_connected.py')
OLD=('recovery.py','recovery_contract.py','recovery_bridge.py','recovery_start.py','policy_proposal.py',
     'future_sources.py','inputs.py','original_checks.py','test_recovery.py','SOURCE_PROVENANCE.json')
EXTRA=('v4-sequencer/privileged.py','v4-sequencer/render_sudoers.py','v4-sequencer/privileged_output.py',
       'v4-sequencer/sequencer.py',
       'crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source',
       'crm-csv-review-publication-20261016/code-sources/execution-check.cjs.95aee8b54048.source')

def run():
    spec=json.loads((ACCEPTED/'SOURCE_PROVENANCE.json').read_bytes())
    with tempfile.TemporaryDirectory(prefix='re7-root-authority-delivery-')as tmp:
        root=Path(tmp)/'reviews';dest=root/HERE.name;old=root/ACCEPTED.name
        dest.mkdir(parents=True);old.mkdir()
        for n in NEW:shutil.copyfile(HERE/n,dest/n)
        for n in OLD:shutil.copyfile(ACCEPTED/n,old/n)
        (old/'reference_sources').mkdir();(old/'versioned-inputs').mkdir()
        for n,r in spec['excerpts'].items():
            raw=(ACCEPTED/'reference_sources'/n).read_bytes();assert hashlib.sha256(raw).hexdigest()==r['deliveredSha256']
            (old/'reference_sources'/n).write_bytes(raw)
        for n,r in spec['versioned'].items():
            raw=subprocess.check_output(['git','show',r['commit']+':'+r['path']],cwd=HERE)
            assert hashlib.sha256(raw).hexdigest()==r['sha256'];(old/'versioned-inputs'/n).write_bytes(raw)
        (old/'ISOLATED_DELIVERY').write_text('Only delivered/pinned inputs; no Git or private fallback.\n')
        prefix='docs/reviews/automation-freeform-window-release-af26'
        for n in EXTRA:
            raw=subprocess.check_output(['git','show',BASE+':'+prefix+'/'+n],cwd=HERE)
            assert raw==(REVIEW/n).read_bytes(),'reference_changed:'+n
            file=root/n;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
        node=shutil.which('node')
        if node is None:raise RuntimeError('LOCAL_NODE_TEST_TOOL_REQUIRED')
        test_path=str(Path(node).parent)+':/usr/bin:/bin'
        result=subprocess.run([sys.executable,'-B','-m','unittest','-v','test_authority','test_connected'],
            cwd=dest,capture_output=True,text=True,env={'PATH':test_path,'PYTHONDONTWRITEBYTECODE':'1'})
        sys.stdout.write(result.stdout);sys.stderr.write(result.stderr)
        return result.returncode

if __name__=='__main__':sys.exit(run())
