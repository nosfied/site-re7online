import os,json,time,datetime
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/retention-second-nine-20261013T211000Z')
v={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected':[],'rootPm2':None,'inputExists':os.path.lexists(P/'input.private.json'),'removalIntentExists':os.path.lexists(P/'withdrawal.intent.private.json')}
for pid,ticks in [(410272,'2170884687'),(410428,'2170885045'),(188897,'2161347676'),(18676,'222727')]:
 p=Path('/proc',str(pid));s=(p/'stat').read_text().split(') ',1)[1].split();v['protected'].append({'pid':pid,'ticksMatch':s[19]==ticks,'state':s[0]})
p=Path('/root/.pm2/pm2.pid')
if p.exists():
 pid=int(p.read_text());q=Path('/proc',str(pid));s=(q/'stat').read_text().split(') ',1)[1].split();env=dict(x.split(b'=',1)for x in(q/'environ').read_bytes().split(b'\0')if b'='in x);btime=int(next(x.split()[1]for x in Path('/proc/stat').read_text().splitlines()if x.startswith('btime ')))
 v['rootPm2']={'pid':pid,'ticks':s[19],'startedUtc':datetime.datetime.fromtimestamp(btime+int(s[19])/os.sysconf('SC_CLK_TCK'),datetime.timezone.utc).isoformat(),'uid':q.stat().st_uid,'cwd':os.readlink(q/'cwd'),'pm2HomeIsRoot':env.get(b'PM2_HOME')==b'/root/.pm2','pidFileMtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),'appPidFiles':[x.name for x in Path('/root/.pm2/pids').iterdir()]}
out=P/'context-observation.private.json';fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w')as f:json.dump(v,f)
print(json.dumps({'protectedIdentitiesMatch':all(q['ticksMatch']for q in v['protected']),'rootPm2Present':v['rootPm2']is not None,'inputExists':v['inputExists'],'removalIntentExists':v['removalIntentExists'],'noProcessAction':True}))
