"""Seal the reviewed file-only selection after off-host custody/extraction proof."""
import json,sys,os,stat,hashlib,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import withdraw as m
P=Path(__file__).parent
assert os.geteuid()==0,'owner_sudo_required'
assert not os.path.lexists(P/'input.private.json'),'input_exists'
a=json.loads((P/'audit.private.json').read_text());assert a['result']=='AUDIT_COMPLETE_NO_WITHDRAWAL'
c=json.loads((P/'offhost-custody-proof.private.json').read_text())
assert c['result']=='OFFHOST_CUSTODY_EXTRACTION_PASS'and c['productionRestore']is False,'offhost_proof_denied'
assert c['auditSha256']==m.digest(P/'audit.private.json'),'audit_provenance_drift'
assert c['indexSha256']==m.digest(P/'historical-index.private.json'),'custody_index_drift'
assert c['objectsVerified']==10 and c['originalPathsIndexed']==34,'custody_scope_drift'
literal=json.loads((P/'literal-files.json').read_text());assert literal['withdrawPaths']==a['withdrawCandidates'],'reviewed_selection_drift'
assert literal['preservePaths']==[q['path']for q in a['entries']if q['path']not in a['withdrawCandidates']],'principal_selection_drift'
selected=literal['withdrawPaths'];assert selected,'empty_allowlist'
m.ROOTS=tuple(selected);originalInventory=list(a['stateBindings']['referenceInventory']);plan=a['stateBindings'];plan['roots']=selected;plan['entries']=[q for q in a['entries']if q['path']in selected]
assert all(q['nlink']==1 and stat.S_ISREG(q['mode'])for q in plan['entries']),'single_link_regular_only'
# Reconfirm every archive's sealed original metadata. Do not adapt after drift.
for q in a['entries']:
 m.parents(q['path']);assert m.meta(q['path'])=={k:q[k]for k in m.FIELDS},'original_archive_metadata_drift'
 assert m.xattrs(q['path'])==q['xattrs'],'original_archive_xattrs_drift'
# Verify original-byte local graph sources against the live host again.
for path,h in a['graphSourceHashes'].items():assert m.digest(path)==h,'graph_source_drift'
# Preserve all principals and transitive controls by explicit current hashes.
for q in a['entries']:
 if q['path']not in selected:
  plan['references'].append({'path':q['path'],'uid':q['uid'],'mode':stat.S_IMODE(q['mode']),'sha256':q['sha256']})
for name in ['withdraw.py','ownership.py','references.py','literal-files.json','offhost-custody-proof.private.json','historical-index.private.json']:
 p=P/name;z=p.lstat();assert stat.S_ISREG(z.st_mode)and not p.is_symlink(),'administrative_source_type'
 plan['references'].append({'path':str(p),'uid':z.st_uid,'mode':stat.S_IMODE(z.st_mode),'sha256':m.digest(p)})
# Bind NEWauth+NEWDB and actual executable, without exposing values.
B=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-database-final-v4-20261013T140000Z')
cfg={q['name']:q for q in json.loads((B/'switch/candidate.config.private.json').read_text())['apps']}
for q in plan['processes']:
 q['exe']=os.readlink('/proc/'+str(q['pid'])+'/exe')
 match=next((v for v in cfg.values()if v['cwd']==q['cwd']),None)
 if match:
  assert q['exe']==match['interpreter'],'expected_executable_drift'
  env=dict(x.split(b'=',1)for x in Path('/proc',str(q['pid']),'environ').read_bytes().split(b'\0')if b'='in x)
  q['expectedEnvironment']={}
  for k,v in match['env'].items():
   assert env.get(k.encode())==str(v).encode(),'new_auth_db_environment_drift';q['expectedEnvironment'][k]=hashlib.sha256(str(v).encode()).hexdigest()
plan['custody']={'verified':True,'archiveSha256':c['archiveSha256'],'indexSha256':c['indexSha256'],'offhostProofSha256':m.digest(P/'offhost-custody-proof.private.json'),'proof':str(P/'offhost-custody-proof.private.json')};plan['approvedCustodyArchiveSha256']=c['archiveSha256'];plan['referenceInventory']=m.reference_paths(str(P));plan['evidenceDirectory']=str(P)
# Inventory additions are permitted only in the explicitly created audit drafts.
old=set(originalInventory);current=set(plan['referenceInventory'])
allowedDrafts=('/opt/re7online/backups/converta-persistent/preparations/retention-third-files-20261014T011000Z','/opt/re7online/backups/converta-persistent/preparations/retention-third-files-v2-20261014T014000Z','/opt/re7online/backups/converta-persistent/preparations/retention-third-files-v3-20261014T020000Z','/opt/re7online/backups/converta-persistent/preparations/retention-third-files-v4-20261014T023000Z','/opt/re7online/backups/converta-persistent/preparations/retention-third-files-v5-20261014T030000Z')
assert not(old-current),'reference_removed_since_graph'
assert all(any(m.under(path,d)for d in allowedDrafts)for path in current-old),'unexpected_new_reference_since_graph'
for path in sorted(current-old):
 p=Path(path);z=p.lstat()
 if stat.S_ISLNK(z.st_mode):plan['referenceLinks'].append({'path':path,'target':os.readlink(path)})
 else:
  assert stat.S_ISREG(z.st_mode),'new_reference_type';plan['references'].append({'path':path,'uid':z.st_uid,'mode':stat.S_IMODE(z.st_mode),'sha256':m.digest(p)})
plan['capturedAt']=time.time();m.validate_state(plan);m.validate_targets(plan)
m.exclusive_json(P/'input.private.json',plan);os.chown(P/'input.private.json',P.stat().st_uid,P.stat().st_gid)
print(json.dumps({'result':'THIRD_FILE_ONLY_INPUT_PREPARED_NO_REMOVAL','files':len(selected),'allocatedRecoverableBytes':sum(q['blocks']*512 for q in plan['entries']),'inputSha256':m.digest(P/'input.private.json'),'preservedOriginalPaths':len(literal['preservePaths']),'noRemoval':True}))
