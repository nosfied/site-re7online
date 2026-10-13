"""Bounded, locked preparation reads; no role alteration, process or provider entrypoint."""
from pathlib import Path
import argparse,fcntl,hashlib,json,os,subprocess,sys,datetime
A=argparse.ArgumentParser();A.add_argument('root');A.add_argument('--after-policy-installed',action='store_true');args=A.parse_args();P=Path(args.root).resolve();W=P/'window';sys.path.insert(0,str(W))
from credential_sequencer import DatabaseDriver
from database_consumers import verify_manifest
from sequencer import Bridge
from baseline_contract import validate_preparation
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert P.parent==Path('/opt/re7online/backups/converta-persistent/preparations')and P.name.startswith('incident-6683-v4-security-database-final-v4-')
with (P.parent/'.incident-6683-window.lock').open('a+')as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 validate_preparation(P,['switch','return','return-partial','return-before-commit']);b=Bridge(P)
 m=json.loads((W/'sequencer-manifest.json').read_text());assert all(h(W/n)==v for n,v in m['filesSha256'].items())
 modes=json.loads((W/'mode-manifest-v4.json').read_text())
 for mode,entries in modes['modeFiles'].items():
  assert len(entries)==29 and h(P/mode/'scripts.sha256')==modes['modeManifests'][mode]
  assert all(h(P/mode/n)==v for n,v in entries.items())
  for pattern in ['owner-*','start-intent-*','started-*','old-exit-*']:assert not list((P/mode).glob(pattern)),'consumed_preparation'
 source=b.expected_config('switch','return.config.private.json');live=b.apps();assert set(live)==set(source)and all(b.app_matches(n,source)for n in source)
 policy=json.loads((W/'privileged-policy.private.json').read_text())
 for n,v in policy['sourceProcesses'].items():assert live[n]['pid']==v['pid']and b.identity(v['pid'])['ticks']==v['ticks']and b.identity(v['pid'])['state']not in ['Z','X','x']
 assert int(Path('/home/deploy/.pm2/pm2.pid').read_text())==policy['pm2Daemon']['pid']and b.identity(policy['pm2Daemon']['pid'])['ticks']==policy['pm2Daemon']['ticks']
 g=b.guard();assert g['generation']==38 and not g['open']and not g['tasks']and not g.get('ledgerFault')
 assert not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+x)for x in ['.lock','.uncertain'])
 assert all(x is False for x in json.loads((W/'execution-gates.private.json').read_text()).values())and(P/'execution-authorized').read_text().strip()=='false'
 assert not os.path.lexists(W/'credential-commit.intent.private.json')
 for n in ['dump.pm2','dump.pm2.bak']:
  p=Path('/home/deploy/.pm2')/n;assert h(p)==h(W/('saved-'+n+'.private.json'))and p.stat().st_mode&0o777==0o600
 assert Path('/etc/cron.d/re7-converta-backup').read_bytes()==(W/'re7-converta-backup.before').read_bytes()
 assert subprocess.check_output(['crontab','-l'])==(W/'deploy.crontab.before').read_bytes()
 assert subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)==json.loads((W/'initial.private.json').read_text())['supervision']
 subprocess.run(['python3',str(P/'verify-package.py')],stdout=subprocess.DEVNULL,check=True,timeout=30)
 q=subprocess.check_output(['node','-e','process.stdout.write(require(process.argv[1]).sql)',str(P/'switch/preparation-bindings.cjs')],text=True,timeout=10)
 raw=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SET LOCAL TIME ZONE 'UTC';"+q+';ROLLBACK;'],text=True,timeout=15)
 subprocess.run(['node','-e',"const b=require(process.argv[1]),q=JSON.parse(require('fs').readFileSync(0,'utf8'));b.noWork(q);b.baseline(process.argv[2],q);b.proofs(process.argv[2])",str(P/'switch/preparation-bindings.cjs'),str(P/'switch')],input=raw,text=True,check=True,timeout=15,stdout=subprocess.DEVNULL)
 obs=json.loads(subprocess.check_output(['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/db-owner-set-observer.py'],timeout=20));bindings=json.loads((W/'db-owner-bindings.private.json').read_text());assert obs['identity']==bindings['proxyIdentity']and obs['exeSha256']==bindings['proxySha256']
 verify_manifest(W,W/'database-consumers.private.json')
 plan=json.loads((W/'credential-hook.private.json').read_text());new=b.expected_config('switch','candidate.config.private.json');driver=DatabaseDriver();assert driver.classify(plan,source['re7-whatsapp-agent']['env']['DATABASE_URL'],new['re7-whatsapp-agent']['env']['DATABASE_URL'])=='ORIGINAL_VERIFIED'
 available=min(os.statvfs(P).f_bavail*os.statvfs(P).f_frsize,int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10).splitlines()[-1].split()[3]));assert available>=2173698048,'database_budget_denied'
 b.privileged('check-absent')
 if args.after_policy_installed:assert json.loads(b.privileged('inspect'))=={'policySha256':(W/'privileged-policy.sha256').read_text().strip(),'phase':None,'sourceProcessesAlive':True}
 print(json.dumps({'result':'DATABASE_PREPARATION_READS_PASS_GATES_FALSE','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'minimumAvailableBytes':available,'budgetBytes':2173698048,'guardGeneration':38,'originalVerifierAndConnectionsProven':True,'proxyInventoryBaselinePreserved':True,'policyInstalledChecked':args.after_policy_installed,'limits':'Backup RPO/custody, capacity/WAL and fresh exit/ownership proofs must be reconfirmed for execution'}))
