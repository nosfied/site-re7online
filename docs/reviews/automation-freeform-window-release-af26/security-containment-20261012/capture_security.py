"""Read-only crypto collector with exact keys from the live API; stdout is private."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
rows=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist'],env={**os.environ,'PATH':'/usr/bin:/bin'},text=True,timeout=5))
r=next(x for x in rows if x['name']=='re7-whatsapp-agent');source=r['pm2_env'];cwd=source['pm_cwd']
assert r['pid']==186864 and cwd=='/opt/re7online/releases/campaign-dynamic-5b3cf3af-20261012T170000Z/apps/whatsapp-agent'
keys=('DATABASE_URL','CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY','META_APP_SECRET','APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_ACCESS_TOKEN')
e={k:v for k,v in os.environ.items()if not any(word in k.upper()for word in ['SECRET','TOKEN','DATABASE_URL','API_KEY','PASSWORD'])}
for k in keys:
 v=source.get(k)
 assert isinstance(v,str)and v,'legitimate_crypto_source_missing_before_connection'
 e[k]=v
e['RE7_API_CWD']=cwd;e['PATH']='/usr/bin:/bin'
g=Path('/var/lib/re7/campaign-operations/state.json');before=g.read_bytes();v=json.loads(before);assert v['open']is False and v['generation']==38 and v['tasks']=={} and not any(os.path.lexists(str(g)+x)for x in ['.lock','.uncertain'])
r=subprocess.run(['/usr/bin/node','-e',sys.stdin.read()],env=e,capture_output=True,text=True,timeout=45)
assert g.read_bytes()==before,'ledger_changed_during_crypto_observation'
if r.returncode:
 sys.stderr.write(r.stderr);raise SystemExit(r.returncode)
print(json.dumps({'mode':'PRIVATE_CRYPTO_READ_ONLY','data':json.loads(r.stdout),'guardSha256':hashlib.sha256(before).hexdigest(),'keysFromLegitimateApi':True}))
