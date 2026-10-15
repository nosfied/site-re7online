"""New version only. Capture-backed metadata and complete checker before publication."""
import contextlib,hashlib,importlib.util,io,json,os,shutil,stat,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'cipher-recovery-cli-20261014'
GEN='incident-6683-v4-security-cipher-contract-v10-20261015T021500Z'
def write(p,v):p.write_text(json.dumps(v,separators=(',',':'),ensure_ascii=False)+'\n');p.chmod(0o600)
def prepare(source,out,observation):
 from package_contract import bind_observation
 source=Path(source);out=Path(out);capture=Path(observation);metadata=capture.lstat()
 if capture.is_symlink()or not stat.S_ISREG(metadata.st_mode)or metadata.st_uid!=os.getuid()or stat.S_IMODE(metadata.st_mode)!=0o600 or metadata.st_nlink!=1:raise RuntimeError('private_observation_path_denied')
 obs=json.loads(capture.read_text())
 # Validate metadata before even creating/copying a candidate.
 donor_plan=json.loads((source/'window/cipher-consumers.private.json').read_text())
 references=bind_observation(donor_plan,obs)
 spec=importlib.util.spec_from_file_location('previous_review_builder',OLD/'prepare_generation.py');old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old);old.GEN=GEN
 with contextlib.redirect_stdout(io.StringIO()):old.prepare(source,out)
 w=out/'window';cp=json.loads((w/'cipher-consumers.private.json').read_text());cp['immutable']=references;write(w/'cipher-consumers.private.json',cp)
 wr=json.loads((w/'writer-consumers.private.json').read_text());wr['immutable']=references;write(w/'writer-consumers.private.json',wr)
 shutil.copyfile(HERE/'package_contract.py',w/'package_contract.py');(w/'package_contract.py').chmod(0o600)
 checker=out/'verify-package.py';s=checker.read_text();s=s.replace("print('LOCKED_CIPHER_FOUR_MODES_RUNTIME_REFERENCES_GATES_REVIEW_PASS')","from package_contract import check\ncheck(W,live=True)\nprint('LOCKED_CIPHER_COMPLETE_CONSUMERS_FOUR_MODES_PASS')");checker.write_text(s)
 installer=out/'install-api-window-policy.sh';s=installer.read_text().replace('pre-security-cipher-recovery-v9-20261015T025000Z','pre-security-cipher-contract-v10-20261015T021500Z');installer.write_text(s)
 # A fresh post-unfence return also carries the contract checker dependency.
 ret=w/'prepare_compatible_post_return.py';s=ret.read_text().replace("'recovery_actions.py']","'recovery_actions.py','package_contract.py']");ret.write_text(s)
 m=json.loads((w/'sequencer-manifest.json').read_text());m['filesSha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in w.iterdir()if p.is_file()and p.name not in ('sequencer-manifest.json','execution-gates.private.json','mode-names.private.json')};write(w/'sequencer-manifest.json',m)
 review=out/'preparation-review.sha256';names=[s.split('  ',1)[1]for s in review.read_text().splitlines()];review.write_text(''.join(hashlib.sha256((out/n).read_bytes()).hexdigest()+'  '+n+'\n'for n in names))
 print(json.dumps({'result':'CANDIDATE_UNPUBLISHED_AWAITING_CANONICAL_VPS_CHECK','generation':GEN,'references':len(references),'metadataSha256':hashlib.sha256(Path(observation).read_bytes()).hexdigest(),'noInstallation':True}))
if __name__=='__main__':prepare(*sys.argv[1:])
