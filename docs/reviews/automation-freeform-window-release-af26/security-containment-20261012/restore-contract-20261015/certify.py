"""Review publication barrier: exact complete archive, canonical live-read receipt, actual Operations proofs."""
import hashlib,json,sys,tarfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from restore_contract import validate,MODES,sha
REQUIRED={'complete_checker','source_readability_scope_historical147','consumer_before_and_contained_contract_only','active_config_identity','saved_fallback600','guard_supervision_false_gates','frozen_sql_baselines_four_proof_bindings','capacity_wal_sql_inventory','proxy_canonical_observer','health_db'}
def certify(p,archive,read,proofs):
 p=Path(p);archive=Path(archive);r=json.loads(Path(read).read_text())
 assert r['result']=='PREPARATORY_CHAIN_PASS_NOT_EXECUTION_AUTHORIZED'and set(r['gatesPassed'])==REQUIRED
 assert all(r[k]is False for k in ('installation','containment','sqlMutation'))and r['gatesRemainFalse']is True
 for key,file in [('reviewManifestSha256','preparation-review.sha256'),('checkerSha256','verify-package.py'),('windowManifestSha256','window/sequencer-manifest.json')]:assert r[key]==sha(p/file),'read_receipt_bytes_differ'
 expected={'CONCRETE_OPERATIONS_RESTORE_PASS':64,'REAL_PRECONDITIONS_PASS':79,'REAL_DELEGATED_CLI_CONTROLS_PASS':24,'REAL_RECOVERY_BOUNDARY_OPERATIONS_PASS':3};seen={}
 for f in proofs:
  v=json.loads(Path(f).read_text());assert v['productionEffects']is False;assert len(v['cases'])==v['caseCount'];seen[v['result']]=v['caseCount']
 assert seen==expected,'affected_preconditions_proof_incomplete'
 for m in MODES:validate(p/m)
 # Compare every delivered file, not merely a list of expected code hashes.
 with tarfile.open(archive)as t:
  members=t.getmembers();names=set()
  for member in members:
   rel=Path(member.name).relative_to(p.name);assert '..'not in rel.parts and not(member.issym()or member.islnk())
   if member.isfile():
    assert member.mode==0o600 and t.extractfile(member).read()==(p/rel).read_bytes(),'archive_candidate_drift';names.add(str(rel))
   else:assert member.isdir()
  assert names=={str(f.relative_to(p))for f in p.rglob('*')if f.is_file()},'archive_membership_drift'
 assert (p/'execution-authorized').read_text().strip()=='false'and all(v is False for v in json.loads((p/'window/execution-gates.private.json').read_text()).values())
 assert not any((p/'window/seal-current').iterdir())
 return {'result':'EXACT_COMPLETE_PREPARATION_VALIDATED_FOR_REVIEW_NOT_INSTALLED_NOT_WINDOW_READY','generation':p.name,'archiveSha256':sha(archive),'archiveBytes':archive.stat().st_size,'reviewManifestSha256':r['reviewManifestSha256'],'windowManifestSha256':r['windowManifestSha256'],'policySha256':sha(p/'window/privileged-policy.private.json'),'installerSha256':sha(p/'install-api-window-policy.sh'),'installedSourcePolicySha256':'b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d','canonicalReadUtc':r['utc'],'minimumAvailableBytes':r['minimumAvailableBytes'],'walBytes':r['walBytes'],'gatesPassed':r['gatesPassed'],'localDirectedCases':sum(seen.values()),'notExecuted':r['notExecuted'],'newRuntimeBuild':False,'installation':False,'containment':False,'sqlMutation':False,'executionAuthorized':False}
if __name__=='__main__':print(json.dumps(certify(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4:]),indent=2,sort_keys=True))
