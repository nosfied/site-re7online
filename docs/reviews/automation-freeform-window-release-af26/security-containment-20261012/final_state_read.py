"""READ ONLY final identity/guard/policies/capacity snapshot; no credential values emitted."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys
B=Path('/opt/re7online/backups/converta-persistent/preparations');C=B/'incident-6683-v4-dynamic-compatible-20261012T184200Z';A=B/'incident-6683-v4-security-auth-v2-20261012T223100Z'
sys.path.insert(0,str(C/'window'));from sequencer import Bridge
p=json.loads(Bridge(C).privileged('inspect'));assert p=={'policySha256':'a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e','phase':None,'sourceProcessesAlive':True}
assert(A/'execution-authorized').read_text().strip()=='false';assert all(x is False for x in json.loads((A/'window/execution-gates.private.json').read_text()).values())
assert not any(list((A/m).glob(x))for m in ['switch','return','return-partial']for x in ['start-intent-*','started-*','old-exit-*','owner-*'])
source=json.loads((C/'switch/return.config.private.json').read_text())['apps'];rows=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist'],env={**os.environ,'PATH':'/usr/bin:/bin'},text=True,timeout=5));assert len(rows)==3
sys.path.insert(0,str(C/'switch'));import ops
for a in source:ops.Operations(C/'switch',ops.System()).config(next(r for r in rows if r['name']==a['name']),a)
g=Path('/var/lib/re7/campaign-operations/state.json');v=json.loads(g.read_text());assert v['open']is False and v['generation']==38 and v['tasks']=={}and not any(os.path.lexists(str(g)+x)for x in ['.lock','.uncertain'])
health=json.loads(subprocess.check_output(['curl','--fail','--max-time','5','--silent','--show-error','http://127.0.0.1:3001/health'],text=True));assert health['ok']and health['db']=='ok'
free=os.statvfs(B).f_bavail*os.statvfs(B).f_frsize;pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3])
sql="BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SELECT json_build_object('walBytes',(SELECT sum(size)FROM pg_ls_waldir()),'slots',(SELECT count(*)FROM pg_replication_slots));ROLLBACK;"
wal=json.loads(subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',sql],text=True,timeout=15))
print(json.dumps({'result':'CURRENT_AUTH_UNCHANGED_PREPARATION_INACTIVE_READ_ONLY_PASS','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'guard':{'open':False,'generation':38,'tasks':{}},'installedPolicy':p,'authProposedPolicy':(A/'window/privileged-policy.sha256').read_text().strip(),'identities':[{'name':r['name'],'pid':r['pid'],'restarts':r['pm2_env']['restart_time']}for r in rows],'healthDbOk':True,'savedMatchesFallback':hashlib.sha256(Path('/home/deploy/.pm2/dump.pm2').read_bytes()).hexdigest()==hashlib.sha256(Path('/home/deploy/.pm2/dump.pm2.bak').read_bytes()).hexdigest(),'savedMode':oct(Path('/home/deploy/.pm2/dump.pm2').stat().st_mode&0o777),'fallbackMode':oct(Path('/home/deploy/.pm2/dump.pm2.bak').stat().st_mode&0o777),'minimumAvailableBytes':min(free,pg),'authAdditionalBudget':4194304,'authCapacityPass':min(free,pg)>=2131755008+4194304,'wal':wal,'gatesFalse':True,'starts':0,'rotationExecuted':False,'rootInstallExecuted':False}))
