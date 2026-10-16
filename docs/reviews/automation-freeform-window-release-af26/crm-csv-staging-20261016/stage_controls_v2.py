"""Stage only corrected new controls. Reuse already verified runtimes."""
import hashlib,json,os,tarfile
from pathlib import Path
os.umask(0o077)
i=Path('/opt/re7online/backups/converta-persistent/preparations/csv-staging-incoming-20261016T092610Z');name='incident-6683-v4-csv-staged-v2-20261016T094000Z';p=i.parent/name
assert not p.exists()and not p.is_symlink()
assert json.loads((i/'staging.receipt.private.json').read_text())['result']=='CSV_INACTIVE_STAGING_COMPLETE'
assert json.loads((i/'preparatory-readonly/result.private.json').read_text())['result']=='READONLY_PREPARATION_DENY'
a=i/'csv-canonical-v2-controls.private.tar';assert hashlib.sha256(a.read_bytes()).hexdigest()=='8d5ed9979c95ba247e3554b02e50a1ecfc7926a3c90791117b7e4f8402d1250b'
def write(file,data):
 fd=os.open(file,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w')as f:json.dump(data,f,sort_keys=True);f.flush();os.fsync(f.fileno())
write(i/'canonical-v2.intent.private.json',{'generation':name,'automaticRetry':False,'runtimeRetransfer':False})
with tarfile.open(a)as t:
 for m in t.getmembers():assert m.isfile()and m.name.startswith(name+'/')and'..'not in Path(m.name).parts
 t.extractall(i.parent,filter='data')
assert(p/'execution-authorized').read_text().strip()=='false'and all(v is False for v in json.loads((p/'window/execution-gates.private.json').read_text()).values())
write(i/'canonical-v2.receipt.private.json',{'result':'CANONICAL_CSV_CONTROLS_STAGED_RUNTIME_REUSED','generation':name,'reviewSha256':hashlib.sha256((p/'preparation-review.sha256').read_bytes()).hexdigest(),'runtimeRetransfer':False,'runtimeReextraction':False,'processActions':0})
print('CANONICAL_CSV_CONTROLS_STAGED_RUNTIME_REUSED')
