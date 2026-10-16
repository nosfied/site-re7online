"""Append only the reviewed one-file source-policy overlay; keep original custody index immutable."""
import argparse,hashlib,json,os,shutil,stat
from pathlib import Path
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
a=argparse.ArgumentParser();a.add_argument('--generation',required=True);a.add_argument('--custody',required=True);v=a.parse_args();src=Path(v.generation).resolve();dst=Path(v.custody)
s=dst.lstat();assert stat.S_ISDIR(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not dst.is_symlink()
before=sha(dst/'INDEX.private.json');assert before=='e83ecb390d7c892c2a84e5e3d8883f28f8ab54fd12f81dc00d8fe12dc1bda031';os.umask(0o077)
index={}
for name in ['events-control-policy-overlay.tar','events-control-policy-overlay.manifest.private.json']:
 p=src/name;assert p.is_file()and not p.is_symlink()
 with p.open('rb')as r,(dst/name).open('xb')as w:shutil.copyfileobj(r,w);w.flush();os.fsync(w.fileno())
 assert sha(dst/name)==sha(p);index[name]={'sha256':sha(p),'bytes':p.stat().st_size}
with(dst/'INDEX_EVENT_CONTROL.private.json').open('x')as f:json.dump(index,f,indent=2);f.flush();os.fsync(f.fileno())
assert sha(dst/'INDEX.private.json')==before
receipt={'result':'AUXILIARY_EVENT_CONTROL_CUSTODY_PASS','files':2,'originalIndexUnchanged':True,'supplementIndexSha256':sha(dst/'INDEX_EVENT_CONTROL.private.json'),'retentionExecuted':False,'productionChanged':False}
with(src/'auxiliary-custody-receipt.sanitized.json').open('x')as f:json.dump(receipt,f,indent=2)
print(json.dumps(receipt))
