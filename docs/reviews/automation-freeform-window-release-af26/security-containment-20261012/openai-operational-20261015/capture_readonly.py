"""Deploy-only capture: SELECT and filesystem reads, no gates/provider/PM2 mutation."""
import datetime,hashlib,json,os,stat,subprocess,sys,urllib.request
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-controls-v14-20261015T130000Z')
sys.path[:0]=[str(P/'window'),str(P/'switch')]
from sequencer import Bridge
from locked_driver import Driver
from baseline_contract import capture_operational,capture_functional
from scheduled_controls import ScheduledControls
b=Bridge(P)
def run(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=20)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def file(p):
 p=Path(p);s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink(),'capture_regular_required'
 return {'path':str(p),'sha256':sha(p),'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode),'nlink':s.st_nlink,'bytes':s.st_size,'allocatedBytes':s.st_blocks*512}
source=json.loads((P/'switch/candidate.config.private.json').read_text());cfg={a['name']:a for a in source['apps']};apps=b.apps();assert set(apps)==set(cfg)
for name in apps:assert b.app_matches(name,cfg),'active_config_drift'
identities={n:{'pid':a['pid'],'ticks':b.identity(a['pid'])['ticks']}for n,a in apps.items()}
controls=ScheduledControls(P/'window',run).verify('before')
initial=capture_operational(b.guard,run);assert initial['guard']['generation']==38 and not initial['guard']['open']
d=Driver(b);prior=d.prior();assert prior is not None
plan,h,boundary=prior;assert boundary.may_start_successor()and d.verify_current_verified(plan,h)=='VERIFIED_CURRENT_NEW_EPOCH'
code="const p=process.argv[1];const b=require(p+'/switch/preparation-bindings.cjs');const cp=require('child_process');const q=JSON.parse(cp.execFileSync('docker',['exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY;SET LOCAL statement_timeout=8000; '+b.sql+';ROLLBACK;',encoding:'utf8'}));b.noWork(q);process.stdout.write(JSON.stringify(q));"
frozen=json.loads(run(['node','-e',code,str(P)]));front=cfg['re7-admin-front'];functional=capture_functional(frozen,front['cwd'])
paths=[Path('/home/deploy/.pm2/dump.pm2'),Path('/home/deploy/.pm2/dump.pm2.bak')]
saved=[]
for p in paths:
 info=file(p);assert info['uid']==os.getuid()and info['mode']==0o600 and info['nlink']==1
 saved.append({'metadata':info,'content':json.loads(p.read_text())})
immutable=json.loads((P/'window/cipher-consumers.private.json').read_text())['immutable']
for e in immutable:
 s=file(e['path']);assert all(s[k]==e[k]for k in ('uid','mode','sha256'))
health=json.load(urllib.request.urlopen('http://127.0.0.1:3001/health',timeout=5));assert health['ok']and health['db']=='ok'
try:
 inspection=json.loads(b.privileged('inspect'));assert inspection['policySha256']=='fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251'
except RuntimeError:
 inspection={'result':'CONSUMED_POLICY_INSPECT_DENIED_FRESH_ROOT_REQUIRED','hashVerified':False}
import ops
proxy=ops.System().proxy_socket_inventory(sha(P/'switch/db_owner_set_observer.py'))
value=json.loads(run(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SELECT json_build_object('walBytes',(SELECT coalesce(sum(size),0)FROM pg_ls_waldir()),'migrationRows',(SELECT count(*)FROM \"_prisma_migrations\"));ROLLBACK;" ]).strip())
v=os.statvfs(P);pg=int(run(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data']).splitlines()[-1].split()[3])
assert {n:{'pid':a['pid'],'ticks':b.identity(a['pid'])['ticks']}for n,a in b.apps().items()}==identities,'capture_identity_changed'
assert all(file(p)['sha256']==e['metadata']['sha256']for p,e in zip(paths,saved)),'capture_saved_changed'
result={'result':'OPENAI_OPERATIONAL_CAPTURE_READONLY','capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceProfile':source,'sourceProfileSha256':sha(P/'switch/candidate.config.private.json'),'identities':identities,'pm2Daemon':{'pid':int(Path('/home/deploy/.pm2/pm2.pid').read_text()),'ticks':b.identity(int(Path('/home/deploy/.pm2/pm2.pid').read_text()))['ticks']},'initial':initial,'functional':functional,'sql':frozen,'proxy':proxy,'saved':saved,'deployCron':run(['crontab','-l']),'systemCron':Path('/etc/cron.d/re7-converta-backup').read_text(),'controls':controls,'immutable':immutable,'targets':{n:file(cfg[n]['script'])for n in cfg},'sourcePolicyInspection':inspection,'newCipherVerified':True,'cipherReceipt':file(P/'window/credential-commit.receipt.private.json'),'minimumAvailableBytes':min(pg,v.f_bavail*v.f_frsize),**value,'healthDb':True,'productionMutation':False,'providerCalled':False}
print(json.dumps(result,sort_keys=True))
