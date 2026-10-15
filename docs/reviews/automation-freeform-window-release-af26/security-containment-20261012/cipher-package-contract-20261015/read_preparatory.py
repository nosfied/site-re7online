"""Complete non-mutating preparatory chain. No gates/install/fence/start/SQL writes."""
import datetime,hashlib,json,os,runpy,stat,subprocess,sys,urllib.request
from pathlib import Path
P=Path(sys.argv[1]);Q=Path(sys.argv[2]);Q.mkdir(mode=0o700);os.umask(0o077);sys.path.insert(0,str(P/'window'));sys.path.insert(0,str(P/'switch'))
from sequencer import Bridge
from locked_driver import Driver
from cipher_consumers import CipherConsumers
b=Bridge(P);d=Driver(b);passed=[];stage='complete_checker'
try:
 runpy.run_path(str(P/'verify-package.py'));passed.append(stage)
 stage='source_readability_scope_historical147';d.check_scope();passed.append(stage)
 stage='consumer_before_and_contained_contract_only';cp=CipherConsumers(P/'window',hashlib.sha256((P/'window/cipher-consumers.private.json').read_bytes()).hexdigest());cp.verify('before');cp.verify('contained');passed.append(stage)
 stage='active_config_identity';policy=json.loads((P/'window/privileged-policy.private.json').read_text());cfg=b.expected_config('switch','return.config.private.json');apps=b.apps();assert set(apps)==set(cfg)
 for n,a in apps.items():assert b.app_matches(n,cfg)and a['pid']==policy['sourceProcesses'][n]['pid']and b.identity(a['pid'])['ticks']==policy['sourceProcesses'][n]['ticks']
 passed.append(stage);stage='saved_fallback600'
 for n in ('dump.pm2','dump.pm2.bak'):
  f=Path('/home/deploy/.pm2')/n;s=f.lstat();assert stat.S_ISREG(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600 and json.loads(f.read_text())==json.loads((P/'window'/('saved-'+n+'.private.json')).read_text())
 passed.append(stage);stage='guard_supervision_false_gates';g=b.guard();assert not g['open']and g['generation']==38 and not g['tasks']and not g.get('ledgerFault')
 assert (P/'execution-authorized').read_text().strip()=='false'and all(v is False for v in json.loads((P/'window/execution-gates.private.json').read_text()).values())and not any((P/'window/seal-current').iterdir())
 assert subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)==json.loads((P/'window/initial.private.json').read_text())['supervision'];passed.append(stage)
 stage='frozen_sql_baselines_four_proof_bindings';code="const cp=require('child_process');const p=process.argv[1],b=require(p+'/switch/preparation-bindings.cjs');const q=JSON.parse(cp.execFileSync('docker',['exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY; '+b.sql+'; ROLLBACK;',encoding:'utf8'}));b.noWork(q);for(const m of ['switch','return','return-partial','return-before-commit']){b.baseline(p+'/'+m,q);b.proofs(p+'/'+m);}process.stdout.write(JSON.stringify(q));"
 with(Q/'frozen.private.json').open('x')as o,(Q/'frozen.private.stderr').open('x')as e:r=subprocess.run(['node','-e',code,str(P)],stdout=o,stderr=e,timeout=30)
 assert r.returncode==0;passed.append(stage);stage='capacity_wal_sql_inventory';v=os.statvfs(P);pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3]);minimum=min(pg,v.f_bavail*v.f_frsize);assert minimum>=8794583040
 c=d.connection('complete-preparatory')
 try:
  value=json.loads(c.query("BEGIN READ ONLY;SELECT json_build_object('migrationRows',(SELECT count(*)FROM \"_prisma_migrations\"),'completedNotRolledBack',(SELECT count(*)FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'walBytes',(SELECT coalesce(sum(size),0)FROM pg_ls_waldir()));ROLLBACK;"))
 finally:c.close()
 assert value['migrationRows']==66;passed.append(stage);stage='proxy_canonical_observer'
 import ops
 proxy=ops.System().proxy_socket_inventory(hashlib.sha256((P/'switch/db_owner_set_observer.py').read_bytes()).hexdigest());(Q/'proxy.private.json').write_text(json.dumps(proxy));passed.append(stage)
 stage='health_db';h=json.load(urllib.request.urlopen('http://127.0.0.1:3001/health',timeout=5));assert h['ok']and h['db']=='ok';passed.append(stage)
 result={'result':'PREPARATORY_CHAIN_PASS_NOT_EXECUTION_AUTHORIZED','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'gatesPassed':passed,'reviewManifestSha256':hashlib.sha256((P/'preparation-review.sha256').read_bytes()).hexdigest(),'checkerSha256':hashlib.sha256((P/'verify-package.py').read_bytes()).hexdigest(),'windowManifestSha256':hashlib.sha256((P/'window/sequencer-manifest.json').read_bytes()).hexdigest(),'minimumAvailableBytes':minimum,**value,'notExecuted':['root600_440_hash_reconfirmation','fresh_backup_RPO_renewal','installed_new_policy_inspect','fence_and_writer_exit','exclusive_DB_zero_after_exit','seal_current_CAS_SQL_commit','successor_start_and_postdeployment_validation'],'installation':False,'containment':False,'sqlMutation':False,'gatesRemainFalse':True}
 (Q/'result.private.json').write_text(json.dumps(result));print(json.dumps(result))
except BaseException as e:
 (Q/'denial.private.json').write_text(json.dumps({'stage':stage,'errorClass':type(e).__name__,'gatesPassed':passed}));print(json.dumps({'result':'DENY','stage':stage,'errorClass':type(e).__name__}));sys.exit(1)
