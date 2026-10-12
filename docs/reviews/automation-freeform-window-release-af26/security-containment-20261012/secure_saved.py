"""Exact two PM2 files only. Default is read-only; production apply requires future owner decision."""
from pathlib import Path
import argparse,hashlib,json,os,stat
FILES=('/home/deploy/.pm2/dump.pm2','/home/deploy/.pm2/dump.pm2.bak')
def check(inventory):
 v=json.loads(Path(inventory).read_text());samples=v['permissionsSamples'];assert len(samples)==2 and samples[0]==samples[1]
 result=[]
 for p in samples[0]:
  assert p['path']in FILES;f=Path(p['path']);assert not f.is_symlink();s=f.stat();assert stat.S_ISREG(s.st_mode)and s.st_uid==os.getuid()==1000;assert hashlib.sha256(f.read_bytes()).hexdigest()==p['sha256'],'pm2_saved_content_drift'
  assert stat.S_IMODE(s.st_mode)in [0o600,0o664],'pm2_saved_mode_drift';result.append(f)
 return result
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--inventory',required=True);a.add_argument('--future-owner-authorized-apply',action='store_true');v=a.parse_args();files=check(v.inventory)
 for f in files:
  before=hashlib.sha256(f.read_bytes()).hexdigest()
  if v.future_owner_authorized_apply:os.chmod(f,0o600,follow_symlinks=False)
  assert hashlib.sha256(f.read_bytes()).hexdigest()==before
 print(json.dumps({'result':'PM2_EXACT_PERMISSIONS_VERIFIED','mode':'FUTURE_APPLY'if v.future_owner_authorized_apply else'READ_ONLY','files':2,'contentUnchanged':True,'requiresSaveWithUmask077':True}))
