"""Bounded scheduled-control audit. Never executes a job, sources dotenv or prints secrets."""
import datetime, hashlib, json, os, stat, subprocess, sys
from pathlib import Path

APP = Path('/opt/re7online/site-re7online/apps/whatsapp-agent')
GEN = Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-restore-v13-20261015T100500Z')
FILES = ['package.json','scripts/backup-data.sh','scripts/cleanup-local-media.mjs',
         'scripts/run-retention.ts','src/privacy/privacyRetentionService.ts',
         'scripts/backup-postgres.sh','scripts/backup-postgres-with-alert.sh',
         'scripts/postgres-backup-alert.ts']
LOGS = ['.backups/backup-cron.log','.data/logs/media-cleanup.log',
        '.data/logs/retention-global.log','backups/postgres/postgres-backup-cron.log',
        'backups/postgres/manifest.jsonl']

def main():
    os.umask(0o077)
    q=Path(sys.argv[1]); q.mkdir(mode=0o700)
    v={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[], 'logs':[], 'errors':[]}
    def command(name,args):
        r=subprocess.run(args,capture_output=True,timeout=25)
        (q/(name+'.stdout.private')).write_bytes(r.stdout)
        (q/(name+'.stderr.private')).write_bytes(r.stderr)
        v[name]={'exit':r.returncode,'bytes':len(r.stdout),'sha256':hashlib.sha256(r.stdout).hexdigest()}
    command('clock',['date','--iso-8601=seconds'])
    command('timezone',['timedatectl','show','--property=Timezone'])
    command('crontab',['crontab','-l'])
    command('cron_journal',['journalctl','-u','cron','--since','2026-10-15 08:50:00 UTC','--until',v['utc'],'--no-pager','--output=json'])
    for name in FILES+LOGS:
        p=APP/name
        try:
            st=p.stat(); meta={'path':str(p),'sha256':None,'bytes':st.st_size,'mtimeNs':st.st_mtime_ns,'uid':st.st_uid,'mode':stat.S_IMODE(st.st_mode),'realpath':str(p.resolve())}
            with p.open('rb')as f:
                if name in LOGS:f.seek(max(0,st.st_size-1048576))
                raw=f.read()
            meta['capturedBytes']=len(raw);meta['sha256']=hashlib.sha256(raw).hexdigest()
            dest=('log-'if name in LOGS else'source-')+name.replace('/','_')+'.private'
            (q/dest).write_bytes(raw);meta['evidence']=dest
            v['logs'if name in LOGS else'files'].append(meta)
        except OSError as e:v['errors'].append({'path':str(p),'errorClass':type(e).__name__})
    # Parse dotenv without importing an application or exporting variables. Compare only names/equality.
    js="""const fs=require('fs'),path=require('path');const a=process.argv[1],g=process.argv[2];
const dotenv=require(path.join(a,'node_modules/dotenv'));const raw=fs.readFileSync(path.join(a,'.env'));
const env=dotenv.parse(raw),profiles=JSON.parse(fs.readFileSync(path.join(g,'switch/return.config.private.json')));
const apps=profiles.apps||profiles,api=apps.find(x=>x.name==='re7-whatsapp-agent').env;
const keys=['ADMIN_TOKEN','APP_AUTH_SECRET','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL'];
process.stdout.write(JSON.stringify({source:path.join(a,'.env'),variables:keys.map(name=>({name,present:Object.hasOwn(env,name),matchesCurrentSealedAPI:env[name]!==undefined&&env[name]===api[name]})),
flags:['MEDIA_LOCAL_CLEANUP_ENABLED','PRIVACY_RETENTION_ENABLED'].map(name=>({name,present:Object.hasOwn(env,name)})),noValueOutput:true}));"""
    command('dotenv_comparison',['node','-e',js,str(APP),str(GEN)])
    # Canonical persistent backup logs are separate from the six deploy entries.
    command('system_cron',['cat','/etc/cron.d/re7-converta-backup'])
    v['mutations']=False
    (q/'audit.private.json').write_text(json.dumps(v,indent=2))
    print(json.dumps({'result':'SCHEDULED_CONTROL_READ_CAPTURED','files':len(v['files']),'logs':len(v['logs']),'errors':len(v['errors']),'mutations':False}))

if __name__=='__main__':main()
