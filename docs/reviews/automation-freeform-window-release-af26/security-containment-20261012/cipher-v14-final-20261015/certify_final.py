"""Certify every delivered archive byte, passive journal lineage and real READ ONLY proof.
External certificate: no writes inside the inactive generation, no execution admission.
"""
import datetime,hashlib,importlib.util,json,os,re,stat,sys,tarfile
from pathlib import Path

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load_module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def certify(p,archive,receipt,evidence):
 p=Path(p);e=Path(evidence);base=Path(__file__).parent.parent/'cipher-controls-prisma-20261015/certify_review.py'
 result=load_module('previous_certifier',base).certify(p,archive,receipt)
 index=json.loads((p/'package-index.private.json').read_text())
 journals=index['appendOnlyJournals'];expected={'window/privileged-output.private.jsonl','window/sequencer.journal.jsonl'}
 assert {j['path'] for j in journals}==expected and len(journals)==2
 for j in journals:
  assert j['allowedEvent']=='privileged_result' and j['allowedAction']=='db-owner-observe' and j['requiredExitCode']==0
  prefix=p/j['prefixPath'];assert sha(prefix)==j['prefixSha256']
  raw=prefix.read_bytes();current=(p/j['path']).read_bytes()
  assert current.startswith(raw) and (not raw or raw.endswith(b'\n')),'journal_prefix_drift'
  tail=current[len(raw):];assert not tail or tail.endswith(b'\n'),'journal_incomplete'
  assert all(type(r)is dict and r.get('event')=='privileged_result' and r.get('action')=='db-owner-observe' and r.get('exitCode')==0 for r in map(json.loads,tail.splitlines())),'journal_unapproved_event'
 files={str(f.relative_to(p)):sha(f)for f in p.rglob('*')if f.is_file()}
 for f in p.rglob('*'):
  assert not f.is_symlink(),'package_symlink'
  if f.is_file():assert f.stat().st_uid==os.getuid() and stat.S_IMODE(f.stat().st_mode)==0o600,'private_file_mode_owner'
 extras=set(files)-set(index['filesSha256'])-expected-{'package-index.private.json'}
 for n in extras:
  assert re.fullmatch(r'window/(?:complete-preparatory-[0-9a-f]{32}-[0-9a-f]{32}|scope-[0-9]+-[0-9a-f]{32})\.private\.stderr',n) and (p/n).stat().st_size==0,'unindexed_nonpassive_file'
 with tarfile.open(archive)as t:
  members={}
  for m in t:
   assert not m.issym() and not m.islnk() and '..'not in Path(m.name).parts,'unsafe_member'
   if m.isdir():continue
   assert m.isfile() and m.name.startswith(p.name+'/'),'foreign_member'
   n=m.name[len(p.name)+1:];assert n not in members,'duplicate_member'
   members[n]=hashlib.sha256(t.extractfile(m).read()).hexdigest()
  assert members==files,'full_archive_population_or_bytes_drift'
 backup=json.loads((e/'backup-result.private.json').read_text());ack=json.loads((e/'custody-ack.private.json').read_text());lab=json.loads((e/'lab-current.private.json').read_text())
 assert backup['backupLockHeld'] and not backup['newCipherPlanGenerated']
 assert ack['result']=='OFFHOST_CUSTODY_VERIFIED' and ack['receiptSha256']==sha(e/'backup-result.private.json')
 assert ack['dumpSha256']==backup['dumpSha256'] and ack['dumpBytes']==backup['dumpBytes']
 assert sha(e/'backup/database.dump')==backup['dumpSha256'] and (e/'backup/database.dump').stat().st_size==backup['dumpBytes']
 assert lab['temporaryDatabaseRemoved']is False and lab['dataDirectoryPreserved'] and lab['statusExit']==3 and ack['labObservedSha256']==sha(e/'lab-current.private.json')
 sys.path.insert(0,str(p/'conductor'))
 root=load_module('root_final',p/'conductor/check_root_capture.py').check(p,e/'root.private.json',e/'root-baseline.private.json')
 now=datetime.datetime.now(datetime.timezone.utc);start=datetime.datetime.fromisoformat(backup['startedUtc'])
 assert 0<=(now-start).total_seconds()<3600,'backup_RPO_expired'
 result.update(result='FINAL_BYTES_AND_REAL_PREPARATION_CERTIFIED_FOR_REVIEW_NOT_DEPLOYED',certifiedUtc=now.isoformat(),archiveFiles=len(files),passiveDiagnosticFiles=len(extras),root=root,rootFreshUntilUtc=(datetime.datetime.fromisoformat(root['capturedUtc'])+datetime.timedelta(seconds=600)).isoformat(),backupCapturedUtc=backup['startedUtc'],backupFreshUntilUtc=(start+datetime.timedelta(hours=1)).isoformat(),dumpSha256=backup['dumpSha256'],dumpBytes=backup['dumpBytes'],schemaDigest=backup['schemaDigest'],temporaryDatabaseRemoved=False,restoreReused=True,physicalIndependentReplica=ack['physicalIndependentReplica'])
 result['chainAtCaptureNotExecuted']=result['notExecuted']
 result['notExecuted']=[x for x in result['notExecuted']if x not in ('root600_440_hash_reconfirmation','fresh_backup_RPO_renewal')]
 (e/'FINAL_FILES_SHA256.private.json').write_text(json.dumps(files,sort_keys=True,indent=2)+'\n')
 return result
if __name__=='__main__':print(json.dumps(certify(*sys.argv[1:]),sort_keys=True,indent=2))
