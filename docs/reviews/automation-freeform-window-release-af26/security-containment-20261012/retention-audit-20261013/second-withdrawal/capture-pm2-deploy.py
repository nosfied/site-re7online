"""Use the existing deploy PM2 reader; root invocation is forbidden."""
import os,json,time,subprocess
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/retention-second-nine-v2-20261013T214500Z')
def check_daemon():
 assert os.geteuid()==1000,'deploy_only_no_root_pm2'
 assert Path('/home/deploy/.pm2/pm2.pid').read_text().strip()=='18676','daemon_pid_drift'
 s=Path('/proc/18676/stat').read_text().rsplit(')',1)[1].split()
 assert s[19]=='222727' and s[0]not in ['Z','X','x'],'daemon_identity_drift'
def main():
 check_daemon();out=P/'pm2-deploy.private.json';assert not os.path.lexists(out),'snapshot_already_exists'
 clean={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/home/deploy','USER':'deploy','PM2_HOME':'/home/deploy/.pm2','LANG':'C.UTF-8'}
 r=subprocess.run(['/home/deploy/.npm-global/bin/pm2','jlist'],env=clean,capture_output=True,text=True,timeout=15,check=True)
 apps=json.loads(r.stdout);check_daemon()
 fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump({'capturedAt':time.time(),'daemon':{'pid':18676,'ticks':'222727'},'apps':apps},f);f.flush();os.fsync(f.fileno())
 print('DEPLOY_PM2_SNAPSHOT_PRIVATE_NO_ROOT_CLI')
if __name__=='__main__':main()
