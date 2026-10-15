"""Exact inactive archive and real canonical chain. Never certifies execution freshness."""
import hashlib,json,sys,tarfile
from pathlib import Path
MODES=('switch','return','return-partial','return-before-commit')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def certify(p,archive,receipt):
 p=Path(p);a=Path(archive);r=json.loads(Path(receipt).read_text());index=json.loads((p/'package-index.private.json').read_text())
 for n,h in index['filesSha256'].items():assert sha(p/n)==h,'package_index_drift'
 with tarfile.open(a)as t:
  for n,h in index['filesSha256'].items():assert hashlib.sha256(t.extractfile(p.name+'/'+n).read()).hexdigest()==h,'archive_file_drift'
 sys.path.insert(0,str(p/'conductor'));import importlib.util
 spec=importlib.util.spec_from_file_location('admission',p/'conductor/admit_gates.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 assert r['result']=='PREPARATORY_CHAIN_PASS_NOT_EXECUTION_AUTHORIZED'and set(r['gatesPassed'])==m.REQUIRED,'incomplete_actual_chain'
 for key,name in [('reviewManifestSha256','preparation-review.sha256'),('checkerSha256','verify-package.py'),('windowManifestSha256','window/sequencer-manifest.json')]:assert r[key]==sha(p/name),'receipt_bytes_drift'
 assert all(r[k]is False for k in ('installation','containment','sqlMutation'))and r['gatesRemainFalse']is True
 assert r['minimumAvailableBytes']>=8794603520,'capacity_denied'
 assert (p/'execution-authorized').read_text().strip()=='false'
 assert not any((p/'window/seal-current').iterdir())
 return {'result':'CONCRETE_GENERATION_CERTIFIED_FOR_REVIEW_NOT_WINDOW_READY','generation':p.name,'archiveSha256':sha(a),'indexSha256':sha(p/'package-index.private.json'),'reviewSha256':sha(p/'preparation-review.sha256'),'actualChainUtc':r['utc'],'realReadGates':r['gatesPassed'],'minimumAvailableBytes':r['minimumAvailableBytes'],'walBytes':r['walBytes'],'notExecuted':r['notExecuted'],'installation':False,'executionAuthorized':False}
if __name__=='__main__':print(json.dumps(certify(*sys.argv[1:])))
