"""Exact admission against full package. External root/provider/install/current observations injected.
Clock injection tests expirations; no real freshness or external authority is claimed.
"""
import datetime,json,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();sys.path[:0]=[str(P/'window'),str(P/'switch')]
import admit_gates as a,openai_contract as c,sequencer
cases=[]
for case in ('pass','root_expired','RPO_expired','provider_absent','provider_wrong_target'):
 with tempfile.TemporaryDirectory()as tmp:
  base=Path(tmp);p=base/P.name;shutil.copytree(P,p);w=p/'window';i=base/'inputs';i.mkdir(mode=0o700);q=base/'admission'
  r=c.read(w/'backup-compatibility.private.json');when=datetime.datetime.fromisoformat(r['startedUtc'])+datetime.timedelta(seconds=60 if case!='RPO_expired'else 3700)
  class Clock(datetime.datetime):
   @classmethod
   def now(cls,tz=None):return when
  root={'result':'OPENAI_ROOT_SOURCE_PASS','mutation':False,'capturedUtc':(when-datetime.timedelta(seconds=601 if case=='root_expired'else 1)).isoformat(),'files':[{'path':'/usr/local/libexec/re7/incident-6683-window-policy.json','sha256':c.POLICY_SOURCE},{'path':'helper'},{'path':'sudoers'}]}
  c.write(i/'root.private.json',root);(i/'backup-result.private.json').write_bytes((w/'backup-compatibility.private.json').read_bytes());(i/'backup-result.private.json').chmod(0o600)
  lab={'result':'CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED','temporaryDatabaseRemoved':False,'proofSha256':c.sha(w/'original-restore-proof.private.json')};c.write(i/'lab-current.private.json',lab)
  c.write(i/'custody-ack.private.json',{'result':'OFFHOST_CUSTODY_VERIFIED','dumpSha256':r['dumpSha256'],'receiptSha256':c.sha(i/'backup-result.private.json'),'labObservedSha256':c.sha(i/'lab-current.private.json')})
  if case!='provider_absent':
   f=w/'provider-before';f.mkdir(mode=0o700);c.write(f/'receipt.private.json',{'result':'OPENAI_FUNCTIONAL_ENDPOINTS_PASS','phase':'before','targetProfileSha256':'0'*64 if case=='provider_wrong_target'else c.sha(w/'target.profile.private.json'),'contractSha256':c.sha(w/'openai-contract.private.json')})
  class B:
   def __init__(self,p):pass
   def privileged(self,action):return json.dumps({'policySha256':c.sha(w/'privileged-policy.private.json'),'phase':None,'sourceProcessesAlive':True})if action=='inspect'else'{}'
  realsha=c.sha
  def remote_sha(path):return r['dumpSha256']if str(path)==r['remoteDirectory']+'/database.dump'else realsha(path)
  with patch.object(a,'check',lambda root,live:c.check(root,live=False)),patch.object(a,'sha',remote_sha),patch.object(a.datetime,'datetime',Clock),patch.object(sequencer,'Bridge',B),patch.object(a,'check_current',lambda root:{'result':'INJECTED_CURRENT_OBSERVATION'}):
   try:a.admit(p,i,q,c.sha(p/'preparation-review.sha256'),'1'*40);assert case=='pass'
   except (RuntimeError,FileNotFoundError):assert case!='pass'
  if case!='pass':assert not q.exists()and all(v is False for v in c.read(w/'execution-gates.private.json').values())and(p/'execution-authorized').read_text().strip()=='false'
  else:assert set(c.read(w/'execution-gates.private.json'))==a.GATES and all(c.read(w/'execution-gates.private.json').values())
  cases.append({'case':case,'passed':True})
print(json.dumps({'result':'EXACT_ADMISSION_LOCAL_PASS','cases':cases,'caseCount':len(cases),'externalAuthorityInjectedNotCertified':True,'productionEffects':False}))
