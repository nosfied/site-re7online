"""Preserve newly built review artifacts only; not a backup renewal or production action."""
import argparse,hashlib,json,os,shutil,stat
from pathlib import Path
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def preserve(generation,destination):
 src=Path(generation).resolve();dst=Path(destination);s=dst.parent.lstat()
 assert stat.S_ISDIR(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not dst.parent.is_symlink()
 assert not dst.exists()and not dst.is_symlink();os.umask(0o077);dst.mkdir(mode=0o700)
 names=['api-candidate.tar','api-candidate.manifest.private.json','frontend-candidate.tar.gz','frontend-candidate.manifest.private.json','frontend-compatible-return.tar.gz','frontend-compatible-return.manifest.private.json','source-plan.private.json','compiled-proof.sanitized.json']
 index={}
 for name in names:
  p=src/name;m=p.lstat();assert stat.S_ISREG(m.st_mode)and not p.is_symlink()
  target=dst/name
  with p.open('rb')as r,target.open('xb')as w:shutil.copyfileobj(r,w);w.flush();os.fsync(w.fileno())
  target.chmod(0o600);assert sha(target)==sha(p);index[name]={'sha256':sha(target),'bytes':m.st_size}
 with(dst/'INDEX.private.json').open('x')as f:json.dump(index,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 receipt={'result':'NEW_REVIEW_ARTIFACTS_PRIVATE_CUSTODY_PASS','files':len(index),'valuesPrinted':False,'backupRenewed':False,'independentPhysicalReplica':False,'indexSha256':sha(dst/'INDEX.private.json')}
 with(src/'custody-receipt.sanitized.json').open('x')as f:json.dump(receipt,f,indent=2)
 print(json.dumps(receipt))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--generation',required=True);a.add_argument('--destination',required=True);v=a.parse_args();preserve(v.generation,v.destination)
