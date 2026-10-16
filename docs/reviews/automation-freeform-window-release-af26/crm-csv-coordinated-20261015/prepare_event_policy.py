"""One literal source-policy overlay for manual Event tools; never runs a tool or updates .env."""
import argparse,hashlib,io,json,os,stat,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
LITERAL='apps/whatsapp-agent/src/events/eventRetentionPolicy.ts'
def wire():
 src=ROOT/LITERAL;s=src.lstat();assert stat.S_ISREG(s.st_mode)and not src.is_symlink()
 b=io.BytesIO()
 with tarfile.open(fileobj=b,mode='w')as t:t.add(src,arcname=LITERAL,recursive=False)
 return b.getvalue()
def prepare(out):
 out=Path(out);s=out.lstat();assert stat.S_ISDIR(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not out.is_symlink();os.umask(0o077)
 raw=wire();before=subprocess.check_output(['git','-C',str(ROOT),'show','7f79cee6:'+LITERAL])
 artifact=out/'events-control-policy-overlay.tar'
 with artifact.open('xb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
 manifest={'artifact':artifact.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'files':[{'path':LITERAL,'sha256':hashlib.sha256((ROOT/LITERAL).read_bytes()).hexdigest(),'bytes':(ROOT/LITERAL).stat().st_size}],'expectedOriginalSourceSha256':hashlib.sha256(before).hexdigest(),'sourceHashIsCurrentProductionProof':False,'onDrift':'DENY; no opportunistic before hash update','retentionExecuted':False,'envChanged':False}
 with(out/'events-control-policy-overlay.manifest.private.json').open('x')as f:json.dump(manifest,f,indent=2)
 print(json.dumps({'result':'ONE_LITERAL_EVENT_POLICY_OVERLAY_ONLY','sha256':manifest['sha256'],'files':1,'productionChanged':False}))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--out',required=True);v=a.parse_args();prepare(v.out)
