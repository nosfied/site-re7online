"""Bounded reads only. Run before installation and again immediately before window."""
from pathlib import Path
import json,hashlib,fcntl,os,sys,subprocess,datetime
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z');W=P/'window';sys.path.insert(0,str(W))
from baseline_contract import validate_preparation
from sequencer import Bridge
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
validate_preparation(P);b=Bridge(P)
subprocess.run(['python3',str(P/'verify-package.py')],check=True)
for mode in ['switch','return','return-partial']:
 subprocess.run(['sha256sum','-c','scripts.sha256'],cwd=P/mode,check=True,stdout=subprocess.DEVNULL)
 assert not any(list((P/mode).glob(p))for p in ['owner-*','start-intent-*','started-*','old-exit-*']), 'consumed_attempt'
manifest=json.loads((W/'sequencer-manifest.json').read_text());assert all(h(W/n)==v for n,v in manifest['filesSha256'].items())
source=b.expected_config('switch','return.config.private.json');live=b.apps();assert set(live)==set(source)
assert all(b.app_matches(n,source)for n in live),'source_config_drift'
policy=json.loads((W/'privileged-policy.private.json').read_text())
for n,p in policy['sourceProcesses'].items():
 i=b.identity(p['pid']);assert live[n]['pid']==p['pid'] and i and i['ticks']==p['ticks'] and i['state']not in ['Z','X','x'],'source_identity_drift'
d=b.identity(policy['pm2Daemon']['pid']);assert d and d['ticks']==policy['pm2Daemon']['ticks'];assert int(Path('/home/deploy/.pm2/pm2.pid').read_text())==policy['pm2Daemon']['pid']
g=b.guard();assert g['open']is False and g['generation']==38 and g['tasks']=={} and not g.get('ledgerFault');assert not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+x)for x in ['.lock','.uncertain'])
for link,resolved in json.loads((W/'path-bindings.private.json').read_text()).items():assert Path(link).is_symlink()and str(Path(link).resolve())==resolved and Path(link).exists()
assert Path('/etc/cron.d/re7-converta-backup').read_bytes()==(W/'re7-converta-backup.before').read_bytes();assert subprocess.check_output(['crontab','-l'])==(W/'deploy.crontab.before').read_bytes();assert subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)==json.loads((W/'initial.private.json').read_text())['supervision']
for n in ['dump.pm2','dump.pm2.bak']:assert h('/home/deploy/.pm2/'+n)==h(W/('saved-'+n+'.private.json')),'saved_reference_drift'
sql=subprocess.check_output(['/usr/bin/node','-e','process.stdout.write(require(process.argv[1]).sql)',str(P/'switch/preparation-bindings.cjs')],text=True)
r=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='2s';SET LOCAL TIME ZONE 'UTC';"+sql+';ROLLBACK;'],text=True,timeout=20)
subprocess.run(['/usr/bin/node','-e',"const b=require(process.argv[1]),q=JSON.parse(require('fs').readFileSync(0,'utf8'));b.noWork(q);b.baseline(process.argv[2],q);b.proofs(process.argv[2])",str(P/'switch/preparation-bindings.cjs'),str(P/'switch')],input=r,text=True,timeout=15,check=True)
proxy=json.loads(b.privileged('check-absent')or'{}') # root validates installed policy and returns nft listing; does not inspect fresh proposed phase.
observation=subprocess.check_output(['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/db-owner-set-observer.py'],timeout=20)
v=json.loads(observation);expected=json.loads((W/'db-owner-bindings.private.json').read_text());assert v['identity']==expected['proxyIdentity']and v['exeSha256']==expected['proxySha256']
deployFree=os.statvfs(P).f_bavail*os.statvfs(P).f_frsize
pgFree=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10).splitlines()[-1].split()[3])
free=min(deployFree,pgFree);assert free>=2131755008,'capacity_floor_denied'
assert h('/usr/local/libexec/re7/incident-6683-window-control.py')=='8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'
if len(sys.argv)>1:
 assert sys.argv[1:]==['--after-policy-installed'];e=(W/'privileged-policy.sha256').read_text().strip();assert json.loads(b.privileged('inspect'))=={'policySha256':e,'phase':None,'sourceProcessesAlive':True}
print(json.dumps({'result':'IMMEDIATE_READS_PASS_GUARD38_PRESERVED','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'availableBytes':free,'policyInstalledChecked':len(sys.argv)>1,'gates':json.loads((W/'execution-gates.private.json').read_text()),'backupCapturedUtc':json.loads((W/'backup-manifest.private.json').read_text())['atUtc'],'limits':'Reconfirm backup freshness/capacity WAL before authorized future window; no drain/exit certificate generated'}))
