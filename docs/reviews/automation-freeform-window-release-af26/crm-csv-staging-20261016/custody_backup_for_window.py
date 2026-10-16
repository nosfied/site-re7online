"""Local reviewed successor: preserve producer receipt bytes; not deployed.
Reuses the original dump/catalog/retained-lab flow. No provider or restart.
"""
import argparse,datetime,hashlib,json,os,re,stat,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
# Existing certified lab and approved post-v14 proof. Nothing is removed or restarted.
LAB=ROOT/'local-evidence/cipher-snapshot-vps-20261014/restore'
PROOF=ROOT/'local-evidence/openai-operational-20261015/incident-6683-v4-security-openai-v4-20261015T203000Z/window/original-restore-proof.private.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put_bytes(p,raw):
 fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
def put(p,v):put_bytes(p,(json.dumps(v,sort_keys=True)+'\n').encode())
def private_directory(p):
 s=p.lstat()
 if not stat.S_ISDIR(s.st_mode)or p.is_symlink()or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o700:raise RuntimeError('private_directory_invalid')
def read_original_receipt(p,expected):
 if re.fullmatch('[a-f0-9]{64}',expected)is None:raise RuntimeError('producer_digest_invalid')
 private_directory(p.parent)
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 with os.fdopen(fd,'rb')as f:
  before=os.fstat(f.fileno())
  if not stat.S_ISREG(before.st_mode)or before.st_uid!=os.getuid()or stat.S_IMODE(before.st_mode)!=0o600 or before.st_nlink!=1:raise RuntimeError('private_receipt_invalid')
  raw=f.read(1048577);after=os.fstat(f.fileno())
  attrs=('st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns','st_uid','st_gid','st_mode','st_nlink')
  if len(raw)>1048576 or any(getattr(before,k)!=getattr(after,k)for k in attrs)or len(raw)!=after.st_size:raise RuntimeError('receipt_changed_or_oversized')
 if hashlib.sha256(raw).hexdigest()!=expected:raise RuntimeError('producer_receipt_bytes_changed')
 value=json.loads(raw)
 if not isinstance(value,dict):raise RuntimeError('receipt_shape_invalid')
 return raw,value
def main(receipt,dest,receipt_sha256):
 raw,r=read_original_receipt(Path(receipt),receipt_sha256)
 dest=Path(dest);private_directory(dest.parent)
 assert not dest.exists()and not dest.is_symlink();assert r['result']=='FRESH_READONLY_BACKUP_PASS'and re.fullmatch('/opt/re7online/backups/converta-persistent/preparations/csv-rpo-[0-9]{8}T[0-9]{6}Z',r['remoteDirectory'])
 dest.mkdir(mode=0o700)
 with(dest/'transfer.stdout.private').open('x')as out,(dest/'transfer.stderr.private').open('x')as err:subprocess.run(['scp','-q','deploy@admin.re7online.com:'+r['remoteDirectory']+'/database.dump',str(dest/'database.dump')],stdout=out,stderr=err,check=True,timeout=180)
 f=dest/'database.dump';f.chmod(0o600);assert sha(f)==r['dumpSha256']and f.stat().st_size==r['dumpBytes']
 with(dest/'catalog.private.txt').open('x')as out,(dest/'catalog.private.stderr').open('x')as err:subprocess.run(['/usr/lib/postgresql/16/bin/pg_restore','--list',str(f)],stdout=out,stderr=err,check=True,timeout=30)
 assert sum(bool(re.match(r'^\d+;',line))for line in(dest/'catalog.private.txt').read_text().splitlines())==r['catalogObjects']==614
 proof=json.loads(PROOF.read_text());observed=json.loads((LAB/'result.sanitized.json').read_text());assert observed['result']=='ACTUAL_SHARED_PRODUCTION_SNAPSHOT_ISOLATED_RESTORE_CIPHER_PASS';assert all(proof[k]==v for k,v in observed.items()if k!='result'),'retained_lab_proof_changed'
 with(dest/'lab-status.private.stdout').open('x')as out,(dest/'lab-status.private.stderr').open('x')as err:status=subprocess.run(['/usr/lib/postgresql/16/bin/pg_ctl','-D',str(LAB/'data'),'status'],stdout=out,stderr=err,timeout=10)
 assert status.returncode==3 and (LAB/'data/PG_VERSION').read_text().strip()=='16'
 lab={'result':'CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED','observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dataDirectoryPreserved':True,'statusExit':status.returncode,'temporaryDatabaseRemoved':False,'proofSha256':sha(PROOF)};put(dest/'lab-current.private.json',lab)
 put_bytes(dest/'backup-result.private.json',raw);assert sha(dest/'backup-result.private.json')==receipt_sha256;put(dest/'custody-ack.private.json',{'result':'OFFHOST_CUSTODY_VERIFIED','dumpSha256':r['dumpSha256'],'dumpBytes':r['dumpBytes'],'receiptSha256':sha(dest/'backup-result.private.json'),'labObservedSha256':sha(dest/'lab-current.private.json'),'ownerAccessible':True,'physicalIndependentReplica':False})
 put(dest/'index.private.json',{f.name:sha(f)for f in dest.iterdir()if f.is_file()});print('OFFHOST_CUSTODY_AND_RETAINED_LAB_VERIFIED_NO_RESTORE_EXECUTED')
if __name__=='__main__':
 os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--receipt',required=True);p.add_argument('--out',required=True);p.add_argument('--receipt-sha256',required=True);a=p.parse_args()
 try:main(a.receipt,a.out,a.receipt_sha256)
 except Exception as e:print(json.dumps({'result':'CUSTODY_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));raise SystemExit(1)
