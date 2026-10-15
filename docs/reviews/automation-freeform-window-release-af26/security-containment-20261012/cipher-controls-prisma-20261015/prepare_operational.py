"""New inactive namespace/policy; no build, credential change, installation or containment."""
import hashlib,importlib.util,json,os,re,shutil,sys,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
GEN='incident-6683-v4-security-cipher-controls-v14-20261015T130000Z'
SOURCE_POLICY='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'
B6='b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d'
MODES=('switch','return','return-partial','return-before-commit')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n');p.chmod(0o600)
def load(n,p):
 spec=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def prepare(source,out):
 source=Path(source).resolve();out=Path(out).resolve();os.umask(0o077)
 require=lambda x,why:None if x else (_ for _ in()).throw(RuntimeError(why))
 require(out.name==GEN and not out.exists()and not out.is_symlink(),'new_namespace_required')
 prior=load('integrated_producer',HERE.parent/'controls-prisma-integration-20261015/prepare_future.py');prior.verify_files(source)
 index=json.loads((source/'composition-index.private.json').read_text())
 for n,h in index['filesSha256'].items():require(sha(source/n)==h,'integrated_source_changed')
 # Reuse canonical inventory/allocation gate. This gate is LOCAL staging only;
 # production min deploy/PostgreSQL and writers are separately required by read-preparatory.
 root=HERE.parents[4];coordinator=load('retention_coordinator',root/'scripts/operational_preparation_review.py')
 inventory=coordinator.reporter.inventory([str(source)])
 allocated=coordinator.allocation(inventory);block=os.statvfs(out.parent).f_frsize
 dense=sum(((p.stat().st_size+block-1)//block)*block for p in source.rglob('*')if p.is_file())
 require(os.statvfs(out.parent).f_bavail*block>=dense+64*1024*1024,'local_staging_capacity_denied')
 source_files={str(p.relative_to(source)):sha(p)for p in source.rglob('*')if p.is_file()}
 # Explicit copy justification: new operational namespace changes path-bound
 # profiles and manifests. Runtime/dependencies/dump are REUSED, never copied here.
 shutil.copytree(source,out,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
 old='/opt/re7online/backups/converta-persistent/preparations/'+source.name;new='/opt/re7online/backups/converta-persistent/preparations/'+GEN
 for p in out.rglob('*'):
  require(not p.is_symlink(),'unexpected_link')
  p.chmod(0o700 if p.is_dir()else 0o600)
  if p.is_file()and not any(s.startswith('proofs-before-')for s in p.relative_to(out).parts)and p.name not in ('composition-index.private.json','engineering-state.private.json'):
   raw=p.read_bytes()
   if old.encode()in raw:p.write_bytes(raw.replace(old.encode(),new.encode()))
 w=out/'window';hook=json.loads((w/'locked-hook.private.json').read_text());hook['phaseId']=GEN+'-seal-current-under-lock';write(w/'locked-hook.private.json',hook)
 # Post-unfence recipe is prepare-only; its new return MUST carry this shared module.
 f=w/'prepare_compatible_post_return.py';s=f.read_text();anchor="'restore_contract.py','restore-contract.private.json'";require(s.count(anchor)==1,'return_copy_anchor_drift');s=s.replace(anchor,"'scheduled_controls.py','restore_contract.py','restore-contract.private.json'").replace(B6,SOURCE_POLICY);f.write_text(s)
 cp=json.loads((w/'cipher-consumers.private.json').read_text());cp['modeBindings']={m:sha(out/m/'candidate.config.private.json')for m in MODES}
 for phase in ('before','after'):
  for e in cp[phase]:e['sha256']=sha(w/e['name'])
 write(w/'cipher-consumers.private.json',cp)
 policy=sha(w/'privileged-policy.private.json');(w/'privileged-policy.sha256').write_text(policy+'\n')
 f=out/'install-api-window-policy.sh';s=f.read_text();s=s.replace(SOURCE_POLICY,policy).replace(B6,SOURCE_POLICY).replace('pre-security-cipher-restore-v13-20261015T100500Z','pre-security-cipher-controls-v14-20261015T130000Z');f.write_text(s)
 f=out/'conductor/admit_gates.py';s=f.read_text();s=re.sub(r"(?m)^POLICY='[0-9a-f]{64}'$",'POLICY='+repr(policy),s)
 s=s.replace('import datetime,fcntl,','import re,datetime,fcntl,')
 s=s.replace(" assert type(APPROVAL_COMMIT)is str and len(APPROVAL_COMMIT)==40,'future_window_authorization_absent'", " assert re.fullmatch(r'--owner-authorized-future-controls:[0-9a-f]{40}',decision),'future_window_authorization_absent'\n approved_commit=decision.rsplit(':',1)[1]")
 s=s.replace("assert decision=='--owner-authorized-future-controls'", "assert decision.startswith('--owner-authorized-future-controls:')").replace("'approvedCommit':APPROVAL_COMMIT","'approvedCommit':approved_commit")
 f.write_text(s)
 wm=json.loads((w/'sequencer-manifest.json').read_text());wm['preparation']=new;wm['status']='INACTIVE_CONTROLS_INTEGRATED_FOR_REVIEW';write(w/'sequencer-manifest.json',wm)
 prior.manifests(out)
 f=out/'conductor/admit_gates.py';s=re.sub(r"(?m)^REVIEW='[0-9a-f]{64}'$",'REVIEW='+repr(sha(out/'preparation-review.sha256')),f.read_text());f.write_text(s)
 # Gate requires explicit future owner decision supplied as argument, validated
 # against this complete immutable package's full index by the review CLI.
 # No approval exists in this preparation; no gates are changed here.
 life={'generation':GEN,'state':'REVIEW','purpose':'decoder/cipher with integrated cron controls','responsible':'Deifson Oliveira','lastReview':'2026-10-15','nextReview':'2026-10-21','sourcePolicy':SOURCE_POLICY,'originGeneration':source.name,'originIndexSha256':sha(source/'composition-index.private.json'),'copyJustification':'new path-bound generation and policy; source remains immutable','sourceUniqueAllocatedBytes':allocated,'denseCopyBudgetBytes':dense,'runtimeAction':'REUSE','dumpAction':'REUSE_RESTORE_NOT_FRESH_RPO','dependencies':['active NEWauth+NEWDB','runtime-inventory.private.json','immutable references','certified retained stopped restore','new source policy15b'],'custody':'owner private index; archive pending until certification','executionAuthorized':False,'blockedForWindow':['fresh RPO/custody/root/writers/SQL/proxy/capacity','explicit owner decision','policy installation not authorized']}
 write(out/'lifecycle.private.json',life)
 # Historical engineering index is evidence, not this new generation's seal.
 prior.verify_files(out)
 for n,h in source_files.items():require(sha(source/n)==h,'source_modified')
 return {'generation':GEN,'policySha256':policy,'installerSha256':sha(out/'install-api-window-policy.sh'),'reviewSha256':sha(out/'preparation-review.sha256'),'executionAuthorized':False,'state':'INACTIVE_AWAITING_CONCRETE_VALIDATION'}
if __name__=='__main__':print(json.dumps(prepare(*sys.argv[1:])))
