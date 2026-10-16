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
inspection={'result':'OWNER_ROOT_CAPTURE_DEFERRED','hashVerified':False}
import ops
proxy=ops.System().proxy_socket_inventory(sha(P/'switch/db_owner_set_observer.py'))
value=json.loads(run(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SELECT json_build_object('walBytes',(SELECT coalesce(sum(size),0)FROM pg_ls_waldir()),'migrationRows',(SELECT count(*)FROM \"_prisma_migrations\"));ROLLBACK;" ]).strip())
v=os.statvfs(P);pg=int(run(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data']).splitlines()[-1].split()[3])
assert {n:{'pid':a['pid'],'ticks':b.identity(a['pid'])['ticks']}for n,a in b.apps().items()}==identities,'capture_identity_changed'
assert all(file(p)['sha256']==e['metadata']['sha256']for p,e in zip(paths,saved)),'capture_saved_changed'
result={'result':'OPENAI_OPERATIONAL_CAPTURE_READONLY','capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceProfile':source,'sourceProfileSha256':sha(P/'switch/candidate.config.private.json'),'identities':identities,'pm2Daemon':{'pid':int(Path('/home/deploy/.pm2/pm2.pid').read_text()),'ticks':b.identity(int(Path('/home/deploy/.pm2/pm2.pid').read_text()))['ticks']},'initial':initial,'functional':functional,'sql':frozen,'proxy':proxy,'saved':saved,'deployCron':run(['crontab','-l']),'systemCron':Path('/etc/cron.d/re7-converta-backup').read_text(),'controls':controls,'immutable':immutable,'targets':{n:file(cfg[n]['script'])for n in cfg},'sourcePolicyInspection':inspection,'newCipherVerified':True,'cipherReceipt':file(P/'window/credential-commit.receipt.private.json'),'minimumAvailableBytes':min(pg,v.f_bavail*v.f_frsize),**value,'healthDb':True,'productionMutation':False,'providerCalled':False}


# Additional CSV-only reads. All stdout is captured privately by the transport.
import stat as st, time
from collections import Counter
policy=Path('/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts')
info=file(policy);assert info['nlink']==1
consumers=[]
for name in ('events-retention.ts','storage-report.ts'):
 p=policy.parents[2]/'scripts'/name;m=file(p);m['importsCanonicalPolicy']='../src/events/eventRetentionPolicy.js'in p.read_text();consumers.append(m)
references=[];incomplete=[];seen=0
for directory in (policy.parents[2]/'scripts',policy.parents[2]/'src'):
 for p in directory.rglob('*'):
  if p.is_symlink():continue
  if not p.is_file()or p.suffix not in ('.ts','.js','.cjs','.mjs'):continue
  seen+=1
  if seen>12000:raise RuntimeError('reference_scan_budget')
  if p.stat().st_size>4*1024*1024:incomplete.append(str(p));continue
  raw=p.read_text(errors='strict')
  if 'eventRetentionPolicy'in raw and p!=policy:references.append({'path':str(p),'sha256':sha(p),'testOnly':p.name.endswith(('.test.ts','.test.js'))})
unknown=[r['path']for r in references if not r['testOnly']and r['path']not in {x['path']for x in consumers}]
event={'path':str(policy),'beforeSha256':sha(policy),'targetSha256':'03791f05f68575a86bbeddd491a619adeddecf7102ed8d3000df51ceb217aad4','uid':info['uid'],'mode':info['mode'],'gid':policy.stat().st_gid,'xattrs':os.listxattr(policy,follow_symlinks=False),'consumers':consumers,'referenceScanComplete':not incomplete,'unknownConsumers':unknown,'references':references,'scannedFiles':seen,'capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def require(ok,reason):
 if not ok:raise RuntimeError(reason)
SQL='''BEGIN READ ONLY; SET LOCAL statement_timeout=15000;
WITH e AS (SELECT "id","clientId","requestId","eventName","payloadJson" FROM "Event"
 WHERE "eventName" LIKE 'crm.contact.import.%' OR
 ("eventName"='crm.contact.created' AND "payloadJson"->>'source'='crm_import')),
limited AS (SELECT * FROM e ORDER BY "id" LIMIT 100001)
SELECT json_build_object('rows',coalesce(json_agg(json_build_object(
 'id',"id",'tenant',"clientId",'request',"requestId",'event',"eventName",
 'status',"payloadJson"->>'status','operation',"payloadJson"->>'operationId')),'[]'::json)) FROM limited;
ROLLBACK;'''
def classify(rows):
    require(len(rows)<=100000,'audit_limit_exceeded_no_truncation_allowed')
    groups={}
    for r in rows:
        op=r['operation'] or r['request']
        if r['event']=='crm.contact.created':
            parts=(r['request']or'').split(':',2);require(len(parts)==3 and parts[0]=='crm.contact.created','legacy_creation_correlation_unknown');op=parts[2]
        elif r['event']=='crm.contact.import.row':
            require(r['operation'],'row_correlation_missing');op=r['operation']
        require(r['tenant']and op,'audit_identity_missing')
        groups.setdefault((r['tenant'],op),[]).append(r)
    result=[]
    for (tenant,op),events in groups.items():
        finished=[r for r in events if r['event']=='crm.contact.import.finished'];summary=[r for r in events if r['event']=='crm.contact.import.summary'];starts=[r for r in events if r['event']=='crm.contact.import.started']
        state='UNKNOWN'
        if len(finished)==1 and len(starts)==1 and finished[0]['status']in ('COMPLETED','FAILED'):state='COMPLETED'if finished[0]['status']=='COMPLETED'else'PROVEN_FAILED'
        elif not starts and not finished and len(summary)==1:state='COMPLETED' # Legacy summary, same request+tenant only.
        result.append({'tenantId':tenant,'operationId':op,'state':state,'terminalProofMatchesOperation':state!='UNKNOWN','evidence':[{'source':'Event:'+str(r['id']),'sha256':hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()}for r in events]})
    return result

raw=subprocess.check_output(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=SQL,text=True,stderr=subprocess.PIPE,timeout=25)
rows=json.loads(raw)['rows']
try:
 operations=classify(rows);classification={'result':'CLASSIFIED','operations':operations,'states':dict(Counter(r['state']for r in operations))}
except RuntimeError as error:
 classification={'result':'DENY','reason':str(error),'operations':[]}
processes=[];unreadable=[]
for path in Path('/proc').iterdir():
 if not path.name.isdigit():continue
 try:
  if path.stat().st_uid!=os.getuid():continue
  raw=(path/'cmdline').read_bytes();matches=[x for x in ('csv','import','retention','storage-report','events-retention','pm2','node','npm')if x.encode()in raw.lower()]
  if matches:processes.append({'pid':int(path.name),'identity':b.identity(int(path.name)),'cwd':os.readlink(path/'cwd'),'cmdlineSha256':hashlib.sha256(raw).hexdigest(),'categories':matches})
 except (FileNotFoundError,ProcessLookupError):pass
 except (PermissionError,OSError):unreadable.append(path.name)
result.update(result='CSV_STAGING_SOURCE_READONLY',eventBinding=event,importAudit={'rows':rows,**classification,'limitedAt':100001,'source':'Event tenant/request/status metadata; no import command','unobservedHistoryCertified':False},processReferences={'processes':processes,'unreadable':unreadable,'rootProcessesObserved':False},stagingTargets={str(p):{'exists':os.path.lexists(p)}for p in [Path('/opt/re7online/releases/crm-csv-24e5857f-20261016/apps/whatsapp-agent'),Path('/opt/re7online/releases/crm-csv-front-ea3d2788-20261016'),Path('/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016')]})
print(json.dumps(result,sort_keys=True))
