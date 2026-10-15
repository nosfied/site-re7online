"""Authorized backup proof refresh only. Immutable code/policy/cipher source unchanged.
Exclusive lock; archive originals first; interrupted/partial refresh is never replayed.
"""
import datetime,fcntl,hashlib,json,os,shutil,stat,subprocess,sys
from pathlib import Path
MODES=('switch','return','return-partial','return-before-commit')
ORIGINAL_REVIEW='3b8f4c77e4d7454321da33f09857ad46345474309ef9534a2a55ad34cf135fcd'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def encoded(v):return(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def read(p):
 s=p.lstat()
 if not stat.S_ISREG(s.st_mode)or p.is_symlink()or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:raise RuntimeError('private_path_drift')
 return json.loads(p.read_text())
def updates(p,r):
 w=p/'window';old=read(w/'restore-result.json');contract=read(w/'restore-contract.private.json')
 if r['result']!='FRESH_READONLY_BACKUP_PASS'or r['backupLockHeld']is not True or r['newCipherPlanGenerated']is not False:raise RuntimeError('backup_receipt_invalid')
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(r['startedUtc'])).total_seconds()
 if not 0<=age<3600:raise RuntimeError('actual_backup_RPO_expired')
 if r['schemaDigest']!=old['schemaDigest']or r['catalogObjects']!=614:raise RuntimeError('backup_restore_frontier_drift')
 if old['temporaryDatabaseRemoved']is not False or old['databaseRetainedStoppedForEvidence']is not True or old['reusedOriginalProof']!=read(w/'original-restore-proof.private.json'):raise RuntimeError('retained_restore_evidence_drift')
 manifest=read(p/'switch/backup-manifest.json');manifest.update(atUtc=r['startedUtc'],captureDurationSeconds=r['durationSeconds'],catalogObjects=r['catalogObjects'])
 manifest['files']['database.dump']={'sha256':r['dumpSha256'],'bytes':r['dumpBytes']}
 old.update(dumpSha256=r['dumpSha256'],dumpBytes=r['dumpBytes'])
 result={'window/backup-manifest.private.json':encoded(manifest),'window/restore-result.json':encoded(old),'window/backup-compatibility.private.json':encoded(r)}
 h=lambda data:hashlib.sha256(data).hexdigest()
 contract.update(currentBackupManifestSha256=h(encoded(manifest)),currentDumpSha256=r['dumpSha256'],compatibilityEvidenceSha256=h(encoded(r)))
 result['window/restore-contract.private.json']=encoded(contract)
 for mode in MODES:
  if read(p/mode/'backup-manifest.json')!=read(p/'switch/backup-manifest.json'):raise RuntimeError('four_original_manifests_diverge')
  b=read(p/mode/'proof-bindings.private.json');b.update(backupManifestSha256=h(encoded(manifest)),restoreResultSha256=h(encoded(old)),restoreContractSha256=h(encoded(contract)),dumpSha256=r['dumpSha256'],dumpBytes=r['dumpBytes'],catalogObjects=r['catalogObjects'])
  result[mode+'/backup-manifest.json']=encoded(manifest);result[mode+'/proof-bindings.private.json']=encoded(b)
 for mode in MODES:
  lines=[]
  for line in(p/mode/'scripts.sha256').read_text().splitlines():
   expected,n=line.split('  ',1);assert Path(n).name==n
   assert sha(p/mode/n)==expected,'source_mode_manifest_drift'
   lines.append(h(result.get(mode+'/'+n,(p/mode/n).read_bytes()))+'  '+n+'\n')
  result[mode+'/scripts.sha256']=''.join(lines).encode()
 mm=read(w/'mode-manifest-v4.json')
 for mode in MODES:
  for n in mm['modeFiles'][mode]:mm['modeFiles'][mode][n]=h(result.get(mode+'/'+n,(p/mode/n).read_bytes()))
  mm['modeManifests'][mode]=h(result[mode+'/scripts.sha256'])
 result['window/mode-manifest-v4.json']=encoded(mm)
 m=read(w/'sequencer-manifest.json')
 for n,expected in m['filesSha256'].items():
  assert sha(w/n)==expected,'source_window_manifest_drift'
  m['filesSha256'][n]=h(result.get('window/'+n,(w/n).read_bytes()))
 result['window/sequencer-manifest.json']=encoded(m)
 lines=[]
 for line in(p/'preparation-review.sha256').read_text().splitlines():
  expected,n=line.split('  ',1);assert sha(p/n)==expected,'source_review_drift'
  lines.append(h(result.get(n,(p/n).read_bytes()))+'  '+n+'\n')
 result['preparation-review.sha256']=''.join(lines).encode();return result

def apply(p,receipt,custody,q):
 p=Path(p);q=Path(q);r=read(Path(receipt));c=read(Path(custody));os.umask(0o077)
 q.mkdir(mode=0o700)
 with(p.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  assert sha(p/'preparation-review.sha256')==ORIGINAL_REVIEW,'original_review_changed'
  assert(p/'execution-authorized').read_text().strip()=='false'and all(x is False for x in read(p/'window/execution-gates.private.json').values())
  assert not any((p/'window/seal-current').iterdir())and not list(p.glob('*/owner-request-*.json'))and not list(p.glob('*/start-intent-*.json'))
  assert c['result']=='OFFHOST_CUSTODY_VERIFIED'and c['dumpSha256']==r['dumpSha256']and c['dumpBytes']==r['dumpBytes']and c['receiptSha256']==sha(Path(receipt))
  assert sha(Path(r['remoteDirectory'])/'database.dump')==r['dumpSha256'],'remote_dump_drift'
  data=updates(p,r);archive=p/'window'/('proofs-before-rpo-'+q.name);archive.mkdir(mode=0o700)
  (q/'renewal.intent.private.json').write_bytes(encoded({'sourceReviewSha256':ORIGINAL_REVIEW,'backupReceiptSha256':sha(Path(receipt)),'custodySha256':sha(Path(custody)),'automaticRetry':False}))
  index=[]
  for n in data:
   f=p/n;s=f.lstat();read(f)if f.suffix=='.json'else None
   dest=archive/n;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700);shutil.copy2(f,dest)
   index.append({'path':n,'sha256':sha(f),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'mtimeNs':s.st_mtime_ns})
  (archive/'index.private.json').write_bytes(encoded(index))
  protected={str(f.relative_to(p)):sha(f)for f in p.rglob('*')if f.is_file()and not archive in f.parents and str(f.relative_to(p))not in data}
  for n,v in data.items():
   f=p/n;temp=f.with_name(f.name+'.rpo-renewal.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb')as stream:stream.write(v);stream.flush();os.fsync(stream.fileno())
   os.replace(temp,f)
  assert all(sha(p/n)==h for n,h in protected.items()),'nonproof_bytes_changed'
  with(q/'checker.stdout.private').open('x')as out,(q/'checker.stderr.private').open('x')as err:subprocess.run(['python3','-B',str(p/'verify-package.py')],stdout=out,stderr=err,check=True,timeout=60)
  sys.path.insert(0,str(p/'window'));from restore_contract import validate
  for mode in MODES:validate(p/mode)
  result={'result':'FOUR_RESTORE_PROOF_BINDINGS_RENEWED_CODE_UNCHANGED','reviewManifestSha256':sha(p/'preparation-review.sha256'),'policySha256':sha(p/'window/privileged-policy.private.json'),'installerSha256':sha(p/'install-api-window-policy.sh'),'backupCapturedUtc':r['startedUtc'],'dumpSha256':r['dumpSha256'],'temporaryDatabaseRemoved':False,'originalsArchive':str(archive),'changedFiles':len(data),'noCipherPlanChanged':True,'protectedFiles':len(protected)}
  (q/'renewal.receipt.private.json').write_bytes(encoded(result));print(json.dumps(result))
if __name__=='__main__':apply(*sys.argv[1:])
