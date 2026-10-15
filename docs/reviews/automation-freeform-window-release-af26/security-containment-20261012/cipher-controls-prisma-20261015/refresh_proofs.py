"""Future v14 proof-only renewal; never runs backup, SQL mutation or controls.
Original v13 apply CLI is deliberately not reused: its source review is fixed.
Any interrupted intent is consumed; no automatic retry.
"""
import datetime,fcntl,hashlib,importlib.util,json,os,re,shutil,subprocess,sys
from pathlib import Path
CANONICAL_SHA='5884557a99057780dd45d67050935bd90cf1e7cb90f4839c46d0cc858db5e5e4'
SOURCE_REVIEW='181fd96666a72c2d80b84d9a6a56812cf6763a8867810755c0f78038d024deea'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def component(path):
 spec=importlib.util.spec_from_file_location('canonical_proof_renewal',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def plan(p,receipt,canonical):
 p=Path(p);m=component(canonical);assert sha(p/'preparation-review.sha256')==SOURCE_REVIEW,'source_review_drift'
 data=m.updates(p,receipt)
 review=hashlib.sha256(data['preparation-review.sha256']).hexdigest();raw=(p/'conductor/admit_gates.py').read_text()
 assert raw.count("REVIEW='"+SOURCE_REVIEW+"'")==1,'admission_review_not_bound'
 data['conductor/admit_gates.py']=raw.replace("REVIEW='"+SOURCE_REVIEW+"'","REVIEW='"+review+"'").encode()
 return data
def apply(p,receipt,custody,canonical,canonical_sha,q):
 p=Path(p).resolve();q=Path(q).absolute();os.umask(0o077);assert not q.is_relative_to(p),'output_inside_preparation';assert sha(canonical)==canonical_sha==CANONICAL_SHA,'canonical_component_drift';m=component(canonical)
 q.mkdir(mode=0o700)
 with(p.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  index=m.read(p/'package-index.private.json')
  for n,h in index['filesSha256'].items():assert sha(p/n)==h,'full_source_index_drift'
  assert(p/'execution-authorized').read_text().strip()=='false'and all(x is False for x in m.read(p/'window/execution-gates.private.json').values())
  assert not any((p/'window/seal-current').iterdir())and not list(p.glob('*/owner-request-*.json'))and not list(p.glob('*/start-intent-*.json'))
  assert not list(p.glob('window/proofs-v14-refresh-*')),'renewal_consumed'
  r=m.read(Path(receipt));c=m.read(Path(custody))
  assert c['result']=='OFFHOST_CUSTODY_VERIFIED'and c['dumpSha256']==r['dumpSha256']and c['dumpBytes']==r['dumpBytes']and c['receiptSha256']==sha(receipt)
  assert sha(Path(r['remoteDirectory'])/'database.dump')==r['dumpSha256'],'remote_dump_changed'
  data=plan(p,r,canonical);archive=p/'window'/('proofs-v14-refresh-'+q.name);archive.mkdir(mode=0o700)
  (q/'renewal.intent.private.json').write_bytes(m.encoded({'sourceReviewSha256':SOURCE_REVIEW,'sourceIndexSha256':sha(p/'package-index.private.json'),'receiptSha256':sha(receipt),'automaticRetry':False}))
  for n in list(data)+['package-index.private.json']:
   target=archive/n;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);shutil.copy2(p/n,target)
  protected={str(f.relative_to(p)):sha(f)for f in p.rglob('*')if f.is_file()and archive not in f.parents and str(f.relative_to(p))not in data and f.name!='package-index.private.json'}
  for n,raw in data.items():
   f=p/n;tmp=f.with_name(f.name+'.v14-proof.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb')as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
   os.replace(tmp,f)
  assert all(sha(p/n)==h for n,h in protected.items()),'nonproof_change'
  # Re-index conductor AND every archived original; archive/review recertification
  # is a mandatory next step, never a claim that old archive hashes remain valid.
  index['filesSha256']={str(f.relative_to(p)):sha(f)for f in p.rglob('*')if f.is_file()and f!=p/'package-index.private.json'}
  (p/'package-index.private.json').write_bytes(m.encoded(index))
  with(q/'checker.stdout.private').open('x')as o,(q/'checker.stderr.private').open('x')as e:subprocess.run(['python3','-B',str(p/'verify-package.py')],stdout=o,stderr=e,check=True,timeout=60)
  result={'result':'FOUR_MODE_PROOFS_AND_ADMISSION_REBOUND_REVIEW_REQUIRED','reviewSha256':sha(p/'preparation-review.sha256'),'indexSha256':sha(p/'package-index.private.json'),'policySha256':sha(p/'window/privileged-policy.private.json'),'installerSha256':sha(p/'install-api-window-policy.sh'),'temporaryDatabaseRemoved':False,'repackAndActualChainCertificationRequired':True,'executionAuthorized':False}
  (q/'renewal.receipt.private.json').write_bytes(m.encoded(result));print(json.dumps(result))
if __name__=='__main__':apply(*sys.argv[1:])
