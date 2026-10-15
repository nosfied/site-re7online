"""New inactive namespace from sealed v7. No runtime build/copy, capture or production action."""
import hashlib,json,os,shutil,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
GEN='incident-6683-v4-security-cipher-recovery-v9-20261015T025000Z'
PREFIX='/opt/re7online/backups/converta-persistent/preparations/'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,separators=(',',':'),ensure_ascii=False)+'\n');p.chmod(0o600)
def prepare(source,out):
 source=Path(source);out=Path(out);w=source/'window';old=PREFIX+source.name;new=PREFIX+GEN
 if source.name!='incident-6683-v4-security-cipher-locked-v7-20261015T011500Z'or out.name!=GEN:raise RuntimeError('generation_namespace_denied')
 if out.exists()or out.is_symlink():raise RuntimeError('generation_exists')
 manifest=json.loads((w/'sequencer-manifest.json').read_text())
 for n,h in manifest['filesSha256'].items():
  if Path(n).name!=n or sha(w/n)!=h:raise RuntimeError('source_manifest_drift')
 if any((w/'seal-current').iterdir())or (source/'execution-authorized').read_text().strip()!='false':raise RuntimeError('source_consumed')
 os.umask(0o077);out.mkdir(mode=0o700)
 for p in source.rglob('*'):
  q=out/p.relative_to(source)
  if p.is_symlink():raise RuntimeError('generation_symlink_denied')
  if p.is_dir():q.mkdir(mode=0o700)
  elif p.is_file():q.write_bytes(p.read_bytes().replace(old.encode(),new.encode()));q.chmod(0o600)
 w=out/'window'
 for name in ('locked_cli.py','recovery_actions.py'):shutil.copyfile(HERE/name,w/name);(w/name).chmod(0o600)
 ret=w/'prepare_compatible_post_return.py';text=ret.read_text();anchor="'credential_boundary.py','cipher_start_gate.py'";assert text.count(anchor)==1
 ret.write_text(text.replace(anchor,"'credential_boundary.py','cipher_start_gate.py','recovery_actions.py'"))
 hook=json.loads((w/'locked-hook.private.json').read_text());hook['phaseId']=GEN+'-seal-current-under-lock';write(w/'locked-hook.private.json',hook)
 # Refresh only derived manifests of this new generation, never original bytes.
 modes=json.loads((w/'mode-names.private.json').read_text())
 for mode,names in modes.items():
  d=out/mode;(d/'scripts.sha256').write_text(''.join(sha(d/n)+'  '+n+'\n'for n in names))
 write(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(out/m/n)for n in ns}for m,ns in modes.items()},'modeManifests':{m:sha(out/m/'scripts.sha256')for m in modes}})
 cp=json.loads((w/'cipher-consumers.private.json').read_text());cp['modeBindings']={m:sha(out/m/'candidate.config.private.json')for m in modes}
 for phase in ('before','after'):
  for entry in cp[phase]:entry['sha256']=sha(w/entry['name'])
 write(w/'cipher-consumers.private.json',cp)
 policy=sha(w/'privileged-policy.private.json');(w/'privileged-policy.sha256').write_text(policy+'\n')
 installer=out/'install-api-window-policy.sh';text=installer.read_text().replace((source/'window/privileged-policy.sha256').read_text().strip(),policy)
 text=text.replace('pre-security-cipher-locked-v7-20261015T011500Z','pre-security-cipher-recovery-v9-20261015T025000Z');installer.write_text(text)
 life=json.loads((out/'lifecycle.private.json').read_text());life.update(state='REVIEW_NOT_INSTALLED',purpose='explicit mutually exclusive recovery CLI; runtime/grant/snapshot unchanged',originGeneration=source.name,originManifestSha256=sha(source/'window/sequencer-manifest.json'),custodyPending=True);write(out/'lifecycle.private.json',life)
 write(w/'sequencer-manifest.json',{'preparation':new,'status':'CIPHER_RECOVERY_PREPARED_GATES_FALSE','filesSha256':{p.name:sha(p)for p in w.iterdir()if p.is_file()and p.name not in ('sequencer-manifest.json','execution-gates.private.json','mode-names.private.json')}})
 # Hash top-level immutable artifacts as well as all four mode manifests.
 names=['install-api-window-policy.sh','verify-package.py','runtime-inventory.private.json','window/sequencer-manifest.json','window/mode-manifest-v4.json','window/privileged-policy.private.json','window/privileged-policy.sha256']+[m+'/scripts.sha256'for m in modes]
 (out/'preparation-review.sha256').write_text(''.join(sha(out/n)+'  '+n+'\n'for n in names));(out/'preparation-review.sha256').chmod(0o600)
 result={'result':'RECOVERY_V9_ASSEMBLED_GATES_FALSE','generation':GEN,'policySha256':policy,'installerSha256':sha(installer),'cliSha256':sha(w/'locked_cli.py'),'recoveryActionsSha256':sha(w/'recovery_actions.py'),'manifestSha256':sha(w/'sequencer-manifest.json'),'reviewSha256':sha(out/'preparation-review.sha256'),'runtimeRebuilt':False,'snapshotCaptured':False,'productionExecution':False}
 print(json.dumps(result,sort_keys=True))
if __name__=='__main__':prepare(sys.argv[1],sys.argv[2])
