"""READ ONLY operational consumers/capacity; raw stdout PRIVATE."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,urllib.parse
r=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist'],env={**os.environ,'PATH':'/usr/bin:/bin'},text=True,timeout=5));api=next(a for a in r if a['name']=='re7-whatsapp-agent');worker=next(a for a in r if a['name']=='re7-whatsapp-web-worker');u=urllib.parse.urlsplit(api['pm2_env']['DATABASE_URL'])
container=json.loads(subprocess.check_output(['docker','inspect','wa-agent-postgres'],text=True,timeout=10))[0];e=dict(x.split('=',1)for x in container['Config']['Env']if '='in x)
paths=[Path('/etc/cron.d/re7-converta-backup'),Path('/home/deploy/.npm-global/lib/node_modules/pm2/lib/API/Startup.js'),Path('/home/deploy/.npm-global/lib/node_modules/pm2/package.json')]
for a in r:
 for n in ['.env','.env.production']:
  p=Path(a['pm2_env']['pm_cwd'])/n
  if p.exists():paths.append(p)
contents={str(p):{'bytes':p.read_text(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in paths}
free=os.statvfs('/opt/re7online').f_bavail*os.statvfs('/opt/re7online').f_frsize
pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10).splitlines()[-1].split()[3])
script=Path(worker['pm2_env']['pm_cwd'])/ 'dist/whatsapp-web-worker/src/webSessionControlServer.js'
print(json.dumps({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'contents':contents,'dockerInitPasswordMatchesActiveRolePassword':e.get('POSTGRES_PASSWORD')==urllib.parse.unquote(u.password or''),'dbEndpoints':{'host':u.hostname,'port':u.port,'database':u.path,'containerPorts':container['NetworkSettings']['Ports']},'minimumBytes':min(free,pg),'deployBytes':free,'postgresBytes':pg,'workerControlModule':{'path':str(script),'exists':script.is_file(),'sha256':hashlib.sha256(script.read_bytes()).hexdigest()if script.is_file()else None},'crontab':subprocess.check_output(['crontab','-l'],text=True,timeout=5),'boot':subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True,timeout=5)}))
