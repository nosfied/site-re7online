"""Full candidate proof planning/validators; no production renewal or backup."""
import contextlib,copy,datetime,importlib.util,io,json,shutil,subprocess,sys,tempfile
from pathlib import Path
from unittest.mock import patch
import refresh_proofs
P=Path(sys.argv[1]);HERE=Path(__file__).resolve().parent;C=HERE.parent/'cipher-v13-execution-20261015/renew_proofs.py'
receipt=json.loads(Path('local-evidence/cipher-v13-authorized-20261015/backup-result.private.json').read_text());now=datetime.datetime.fromisoformat(receipt['startedUtc'])+datetime.timedelta(seconds=30)
class Clock(datetime.datetime):
 @classmethod
 def now(cls,tz=None):return now
try:refresh_proofs.plan(P,receipt,C);raise AssertionError('expired RPO admitted')
except RuntimeError as e:assert str(e)=='actual_backup_RPO_expired'
with patch.object(datetime,'datetime',Clock):
 data=refresh_proofs.plan(P,receipt,C)
 bad=copy.deepcopy(receipt);bad['schemaDigest']='0'*64
 try:refresh_proofs.plan(P,bad,C);raise AssertionError('frontier drift admitted')
 except RuntimeError as e:assert str(e)=='backup_restore_frontier_drift'
with tempfile.TemporaryDirectory()as tmp:
 p=Path(tmp)/P.name;shutil.copytree(P,p)
 for n,raw in data.items():(p/n).write_bytes(raw)
 sys.path[:0]=[str(p/'window'),str(HERE.parent/'controls-prisma-integration-20261015')]
 import restore_contract
 from prepare_future import verify_files
 verify_files(p)
 for m in ('switch','return','return-partial','return-before-commit'):assert restore_contract.validate(p/m)['labState']=='CERTIFIED_RETAINED_STOPPED'
 h=refresh_proofs.sha(p/'preparation-review.sha256');assert "REVIEW='"+h+"'"in(p/'conductor/admit_gates.py').read_text()
 assert(p/'window/privileged-policy.private.json').read_bytes()==(P/'window/privileged-policy.private.json').read_bytes()
 assert(p/'install-api-window-policy.sh').read_bytes()==(P/'install-api-window-policy.sh').read_bytes()
with tempfile.TemporaryDirectory()as tmp:
 p=Path(tmp)/P.name;shutil.copytree(P,p);q=Path(tmp)/'renewal'
 original=Path('local-evidence/cipher-v13-authorized-20261015')
 real_sha=refresh_proofs.sha
 def observed_sha(path):
  if str(path)==receipt['remoteDirectory']+'/database.dump':return real_sha(original/'backup/database.dump')
  return real_sha(path)
 def checker(args,**kw):
  assert args==['python3','-B',str(p/'verify-package.py')]
  # Only the external host checker process is replaced; full manifests and the
  # real shared restore validator still execute on the exact renewed files.
  verify_files(p)
  for mode in ('switch','return','return-partial','return-before-commit'):restore_contract.validate(p/mode)
  return subprocess.CompletedProcess(args,0)
 with patch.object(datetime,'datetime',Clock),patch.object(refresh_proofs,'sha',observed_sha),patch.object(refresh_proofs.subprocess,'run',checker),contextlib.redirect_stdout(io.StringIO()):
  refresh_proofs.apply(p,original/'backup-result.private.json',original/'custody-ack.private.json',C,real_sha(C),q)
 assert(q/'renewal.intent.private.json').exists()and(q/'renewal.receipt.private.json').exists()
 index=json.loads((p/'package-index.private.json').read_text())
 assert all(real_sha(p/n)==h for n,h in index['filesSha256'].items())
 assert(p/'execution-authorized').read_text().strip()=='false'
 assert all(x is False for x in json.loads((p/'window/execution-gates.private.json').read_text()).values())
print(json.dumps({'result':'V14_PROOF_RENEWAL_LOCAL_PASS','cases':4,'validRpoClockSimulated':True,'oldRestoreRetainedStopped':True,'fourModesAndAdmissionCoherent':True,'actualApplyOnIsolatedCopy':True,'externalCheckerProcessSimulated':True,'productionEffects':False}))
