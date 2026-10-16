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

B3=Path(__file__).resolve().parent
B1=B3.parent/'crm-csv-root-authority-b1-20261016'
B2=B1.parent/'crm-csv-root-authority-b2-20261016'
R3=B2.parent/'crm-csv-root-authority-r3-20261016'
HERE=R3.parent/'crm-csv-root-authority-local-20261016'
REVIEW=HERE.parent
ACCEPTED=REVIEW/'crm-csv-integrated-recovery-20261016'
BASE='bdb57f57601147632bb529895cbcd92b8b483c6c'
NEW=('authority.py','root_store.py','root_extension.py','verified_loader.py','bootstrap.py',
     'node_bootstrap.cjs','integration.py','child_transport.py','test_authority.py','test_connected.py')
OLD=('recovery.py','recovery_contract.py','recovery_bridge.py','recovery_start.py','policy_proposal.py',
     'future_sources.py','inputs.py','original_checks.py','test_recovery.py','SOURCE_PROVENANCE.json')
EXTRA=('v4-sequencer/privileged.py','v4-sequencer/render_sudoers.py','v4-sequencer/privileged_output.py',
       'v4-sequencer/sequencer.py','v4-sequencer/ecosystem_contract.py',
       'crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source',
       'crm-csv-review-publication-20261016/code-sources/execution-check.cjs.95aee8b54048.source',
       'crm-csv-review-publication-20261016/code-sources/delegated.py.8744ced356ca.source',
       'crm-csv-review-publication-20261016/code-sources/db_owner_set_gate.py.ca9b0bf8ece3.source',
       'crm-csv-review-publication-20261016/code-sources/db_owner_set_observer.py.ddbe29926e27.source')

def run():
    provenance=json.loads((B3/'SOURCE_PROVENANCE.json').read_bytes())
    repository=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=B3,text=True).strip())
    for ref in provenance['repositoryInputs']:
        raw=(repository/ref['path']).read_bytes()
        pinned=subprocess.check_output(['git','show',ref['commit']+':'+ref['path']],cwd=B3)
        assert raw==pinned and hashlib.sha256(raw).hexdigest()==ref['sha256'], 'B3_input_drift:'+ref['path']
    for name,ref in provenance['pm2']['excerpts'].items():
        assert hashlib.sha256((B3/'vendor'/name).read_bytes()).hexdigest()==ref['deliveredSha256'], 'B3_PM2_excerpt_drift'
    assert hashlib.sha256((B3/'vendor/PM2-LICENSE').read_bytes()).hexdigest()==provenance['pm2']['licenseSha256']
    spec=json.loads((ACCEPTED/'SOURCE_PROVENANCE.json').read_bytes())
    with tempfile.TemporaryDirectory(prefix='re7-root-authority-delivery-')as tmp:
        root=Path(tmp)/'reviews';dest=root/HERE.name;old=root/ACCEPTED.name
        dest.mkdir(parents=True);old.mkdir()
        for n in NEW:
            raw=subprocess.check_output(['git','show','2cc9a35058c25bfdd01e597564a29e8d952d69aa:docs/reviews/automation-freeform-window-release-af26/'+HERE.name+'/'+n],cwd=HERE)
            (dest/n).write_bytes(raw)
        shutil.copyfile(dest/'integration.py',dest/'integration_before_r3.py')
        for n in ('authority.py','integration.py','test_r3.py'):shutil.copyfile(R3/n,dest/n)
        for n in ('authority.py','integration.py','bootstrap.py','child_transport.py','node_bootstrap.cjs'):
            shutil.copyfile(dest/n,dest/('before_'+n))
            shutil.copyfile(B2/n,dest/n)
        for n in ('test_process.py','lab_shim.py','lab_effects.py'):
            shutil.copyfile(B2/n,dest/n)
        for n in ('authority.py','bootstrap.py','child_transport.py','node_bootstrap.cjs','privileged_output.py','lab_shim.py','lab_root_reply.py','test_diagnostics.py'):
            shutil.copyfile(B1/n,dest/n)
        # Fixture-only source adaptation: extra protected diagnostic library and
        # actual local sudo endpoint, no change to Bridge/delegated/baseline bodies.
        process=(dest/'test_process.py').read_text()
        process=process.replace("('authority.py','bootstrap.py','child_transport.py','node_bootstrap.cjs'):",
            "('authority.py','bootstrap.py','child_transport.py','node_bootstrap.cjs','privileged_output.py'):")
        process=process.replace("('authority','verified_loader','child_transport')", "('authority','verified_loader','child_transport','privileged_output')")
        process=process.replace("        shim=self.lab/'shim.py';node=self.lab/'node.cjs'", "        shutil.copyfile(HERE/'lab_root_reply.py',self.library/'lab_root_reply.py')\n        shim=self.lab/'shim.py';node=self.lab/'node.cjs'")
        (dest/'test_process.py').write_text(process)


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
        for n in ('pm2_input.py','test_pm2.py','pm2_boundary.cjs'):
            shutil.copyfile(B3/n,dest/n)
        shutil.copyfile(B3/'integration.py',dest/'b3_integration.py')
        shutil.copytree(B3/'vendor',dest/'vendor')
        shutil.copyfile(B3/'SOURCE_PROVENANCE.json',dest/'B3_PROVENANCE.json')
        node=shutil.which('node')
        if node is None:raise RuntimeError('LOCAL_NODE_TEST_TOOL_REQUIRED')
        test_path=str(Path(node).parent)+':/usr/bin:/bin'
        result=subprocess.run([sys.executable,'-B','-m','unittest','-v','test_pm2'],
            cwd=dest,capture_output=True,text=True,env={'PATH':test_path,'PYTHONDONTWRITEBYTECODE':'1'})
        sys.stdout.write(result.stdout);sys.stderr.write(result.stderr)
        return result.returncode

if __name__=='__main__':sys.exit(run())
