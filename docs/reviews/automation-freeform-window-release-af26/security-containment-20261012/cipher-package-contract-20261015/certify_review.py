"""Publication barrier: exact candidate bytes + complete canonical read receipt required.
This certifies REVIEW only, never grants installation or execution authority.
"""
import hashlib,json,sys
from pathlib import Path
REQUIRED={'complete_checker','source_readability_scope_historical147','consumer_before_and_contained_contract_only','active_config_identity','saved_fallback600','guard_supervision_false_gates','frozen_sql_baselines_four_proof_bindings','capacity_wal_sql_inventory','proxy_canonical_observer','health_db'}
def certify(p,archive,receipt):
 p=Path(p);archive=Path(archive);r=json.loads(Path(receipt).read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
 if r['result']!='PREPARATORY_CHAIN_PASS_NOT_EXECUTION_AUTHORIZED'or set(r['gatesPassed'])!=REQUIRED:raise RuntimeError('complete_read_receipt_required_before_publication')
 for key in ('installation','containment','sqlMutation'):
  if r[key]is not False:raise RuntimeError('nonmutating_review_boundary_required')
 if r['gatesRemainFalse']is not True:raise RuntimeError('review_gates_not_false')
 for field,file in [('reviewManifestSha256','preparation-review.sha256'),('checkerSha256','verify-package.py'),('windowManifestSha256','window/sequencer-manifest.json')]:
  if r[field]!=sha(p/file):raise RuntimeError('receipt_candidate_bytes_differ')
 if r['minimumAvailableBytes']<8776581120+2*archive.stat().st_size:raise RuntimeError('review_capacity_denied')
 return {'result':'EXACT_CANDIDATE_CERTIFIED_FOR_REVIEW_NOT_WINDOW_READY','generation':p.name,'archiveSha256':sha(archive),'archiveBytes':archive.stat().st_size,'reviewManifestSha256':r['reviewManifestSha256'],'checkerSha256':r['checkerSha256'],'windowManifestSha256':r['windowManifestSha256'],'observedUtc':r['utc'],'requiredBudgetBytes':8776581120+2*archive.stat().st_size,'executionAuthorized':False,'notExecuted':r['notExecuted']}
if __name__=='__main__':print(json.dumps(certify(*sys.argv[1:]),sort_keys=True))
