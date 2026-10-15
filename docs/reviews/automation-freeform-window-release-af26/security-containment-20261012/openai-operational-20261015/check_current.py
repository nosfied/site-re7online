"""Current non-mutating canonical predicates shared by preflight, B and closure."""
import datetime,json,os,stat,subprocess,sys,urllib.request
from pathlib import Path
from openai_contract import check,read,require,sha

def check_current(p,phase='before'):
 p=Path(p);check(p,live=True)
 from sequencer import Bridge
 from scheduled_controls import ScheduledControls
 b=Bridge(p);ScheduledControls(p/'window',lambda args:subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=10)).verify('before')
 cfg=b.expected_config('switch','return.config.private.json'if phase=='before'else'candidate.config.private.json');apps=b.apps();policy=read(p/'window/privileged-policy.private.json');require(set(apps)==set(cfg),'process_population')
 for n,a in apps.items():
  require(b.app_matches(n,cfg),'active_config_drift')
  if phase=='before':require(a['pid']==policy['sourceProcesses'][n]['pid']and b.identity(a['pid'])['ticks']==policy['sourceProcesses'][n]['ticks'],'source_identity_drift')
 front=policy['sourceProcesses']['re7-admin-front'];require(apps['re7-admin-front']['pid']==front['pid']and b.identity(front['pid'])['ticks']==front['ticks'],'frontend_identity_drift')
 for n in ('dump.pm2','dump.pm2.bak'):
  f=Path('/home/deploy/.pm2')/n;s=f.lstat();require(stat.S_ISREG(s.st_mode)and not f.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'saved_fallback600')
  if phase=='before':require(json.loads(f.read_text())==read(p/'window'/('saved-'+n+'.private.json')),'saved_fallback_content_drift')
  else:
   saved=json.loads(f.read_text());wanted={x['name']:x for x in cfg.values()};require({a['name']for a in saved}==set(wanted),'saved_population')
   for a in saved:
    expected=wanted[a['name']];require(a['pm_cwd']==expected['cwd']and a['pm_exec_path']==expected['script']and all(a.get(k,a.get('env',{}).get(k))==v for k,v in expected['env'].items()),'saved_target_drift')
 g=b.guard();require(not g['open']and g['generation']==38 and not g['tasks']and not g.get('ledgerFault'),'guard38_drift')
 require(subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)==read(p/'window/initial.private.json')['supervision'],'supervision_drift')
 code="const p=process.argv[1],b=require(p+'/switch/preparation-bindings.cjs'),cp=require('child_process');const q=JSON.parse(cp.execFileSync('docker',['exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY;SET LOCAL statement_timeout=8000;'+b.sql+';ROLLBACK;',encoding:'utf8'}));b.noWork(q);for(const m of ['switch','return','return-partial','return-before-commit']){b.baseline(p+'/'+m,q);b.proofs(p+'/'+m);}process.stdout.write('SQL_FOUR_MODES_PASS');"
 require(subprocess.check_output(['node','-e',code,str(p)],text=True,stderr=subprocess.PIPE,timeout=25)=='SQL_FOUR_MODES_PASS','sql_baselines')
 import ops
 ops.System().proxy_socket_inventory(sha(p/'switch/db_owner_set_observer.py'))
 health=json.load(urllib.request.urlopen('http://127.0.0.1:3001/health',timeout=5));require(health['ok']and health['db']=='ok','health_db')
 v=os.statvfs(p);pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3]);minimum=min(pg,v.f_bavail*v.f_frsize);require(minimum>=read(p/'window/openai-contract.private.json')['minimumCapacityBytes'],'capacity_denied')
 wal=int(subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c','BEGIN READ ONLY;SELECT coalesce(sum(size),0)FROM pg_ls_waldir();ROLLBACK;'],text=True).strip())
 return {'result':'OPENAI_CANONICAL_CURRENT_PASS','phase':phase,'minimumAvailableBytes':minimum,'walBytes':wal,'bothCronsVerified':True,'guard38Closed':True,'healthDb':True,'providerFunctionalityCertified':False,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
if __name__=='__main__':
 try:print(json.dumps(check_current(Path(sys.argv[1]),sys.argv[2]if len(sys.argv)>2 else'before')))
 except Exception as e:print(json.dumps({'result':'CURRENT_STATE_DENY','errorClass':type(e).__name__}));sys.exit(1)
