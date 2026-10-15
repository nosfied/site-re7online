"""Refresh ONLY new OpenAI backup proofs; original evidence preserved, no replay."""
import fcntl,hashlib,importlib.util,json,os,shutil,sys
from pathlib import Path

def refresh(p,receipt,custody,out,review):
 p=Path(p);w=p/'window';q=Path(out);sys.path.insert(0,str(w));from openai_contract import read,write,check,require,sha
 check(p,live=True);r=read(Path(receipt));c=read(Path(custody));require(sha(p/'preparation-review.sha256')==review,'review_changed');require(not q.exists(),'renewal_output_exists')
 with(p.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);require((p/'execution-authorized').read_text().strip()=='false'and all(v is False for v in read(w/'execution-gates.private.json').values())and not(w/'openai-execution.intent.private.json').exists(),'generation_consumed')
  require(c['result']=='OFFHOST_CUSTODY_VERIFIED'and c['dumpSha256']==r['dumpSha256']and c['dumpBytes']==r['dumpBytes']and c['receiptSha256']==sha(Path(receipt)),'custody_binding');require(sha(Path(r['remoteDirectory'])/'database.dump')==r['dumpSha256'],'backup_changed')
  spec=importlib.util.spec_from_file_location('canonical_refresh',w/'canonical_renew_proofs.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);data=m.updates(p,r)
  q.mkdir(mode=0o700);write(q/'renewal.intent.private.json',{'sourceReviewSha256':review,'receiptSha256':sha(Path(receipt)),'automaticRetry':False});archive=q/'originals';archive.mkdir(mode=0o700)
  for n in data:
   f=archive/n;f.parent.mkdir(mode=0o700,parents=True,exist_ok=True);shutil.copyfile(p/n,f)
  for n,raw in data.items():
   f=p/n;t=f.with_name(f.name+'.proof-update.tmp');fd=os.open(t,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
   with os.fdopen(fd,'wb')as out:out.write(raw);out.flush();os.fsync(out.fileno())
   os.replace(t,f)
  check(p,live=True);write(q/'renewal.receipt.private.json',{'result':'OPENAI_FOUR_BACKUP_BINDINGS_REFRESHED','reviewSha256':sha(p/'preparation-review.sha256'),'policySha256':sha(w/'privileged-policy.private.json'),'installerSha256':sha(p/'install-api-window-policy.sh'),'temporaryDatabaseRemoved':False,'cipherOrKeyChanged':False});print('OPENAI_FOUR_BACKUP_BINDINGS_REFRESHED_REPUBLISH_REVIEW_HASH')
if __name__=='__main__':
 os.umask(0o077)
 try:refresh(*sys.argv[1:])
 except BaseException as e:print(json.dumps({'result':'PROOF_REFRESH_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));sys.exit(1)
