"""Run as deploy by stdin. Reads only; stdout must be captured privately off-host.
Uses no PM2 CLI, provider, application entrypoint or recovery code.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import time

def h(b):return hashlib.sha256(b).hexdigest()
def require(ok,why):
    if not ok:raise ValueError(why)
def sql(query):
    q="BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';"+query+';ROLLBACK;'
    result=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',q],text=True,timeout=15)
    return json.loads(result)
try:
    require(os.geteuid()==1000,'deploy_context_required')
    P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-database-final-v4-20261013T140000Z');W=P/'window'
    config_raw=(P/'switch/candidate.config.private.json').read_bytes();cfg={a['name']:a for a in json.loads(config_raw)['apps']}
    expected={'re7-whatsapp-agent':(410272,'2170884687'),'re7-whatsapp-web-worker':(410428,'2170885045'),'re7-admin-front':(188897,'2161347676')}
    snapshots=[];samples=[]
    for _ in range(2):
        processes={}
        for name,(pid,ticks) in expected.items():
            proc=Path('/proc')/str(pid);before=(proc/'stat').read_bytes();s=before.decode().rsplit(')',1)[1].split()
            require(s[19]==ticks and s[0] not in ('Z','X','x'),'process_identity_drift')
            require(os.readlink(proc/'cwd')==cfg[name]['cwd'] and os.readlink(proc/'exe')==cfg[name]['interpreter'],'runtime_drift')
            envraw=(proc/'environ').read_bytes();env=dict(q.split(b'=',1) for q in envraw.split(b'\0') if b'=' in q)
            require(all(env.get(k.encode())==str(v).encode() for k,v in cfg[name]['env'].items()),'environment_drift')
            require((proc/'stat').read_text().rsplit(')',1)[1].split()[19]==ticks,'process_changed_during_capture')
            processes[name]={'pid':pid,'ticks':ticks,'configSha256':h(json.dumps(cfg[name],sort_keys=True).encode()),'envSha256':h(envraw)}
        snapshots.append({'complete':True,'incomplete':[],'processes':processes})
        deploy=os.statvfs(P);pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10).splitlines()[-1].split()[3])
        metrics=sql("SELECT json_build_object('databaseBytes',pg_database_size(current_database()),'walBytes',(SELECT sum(size)FROM pg_ls_waldir()),'walLsn',pg_current_wal_lsn(),'slots',(SELECT count(*)FROM pg_replication_slots),'archiveMode',current_setting('archive_mode'))")
        samples.append({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployAvailableBytes':deploy.f_bavail*deploy.f_frsize,'postgresAvailableBytes':pg,'metrics':metrics});time.sleep(2)
    for n in ['dump.pm2','dump.pm2.bak']:
        p=Path('/home/deploy/.pm2')/n;s=p.lstat();require(stat.S_ISREG(s.st_mode) and s.st_uid==1000 and stat.S_IMODE(s.st_mode)==0o600,'saved_fallback_owner_mode')
        require(h(p.read_bytes())=='3ddec68385ba02fd39d5592baf33e413d92e9b102dbdf6051afebe64aba427c1','saved_fallback_drift')
    g=Path('/var/lib/re7/campaign-operations/state.json');guard=json.loads(g.read_text());require(guard['generation']==38 and guard['open'] is False and not guard['tasks'],'guard_drift')
    require(not any(os.path.lexists(str(g)+s) for s in ['.lock','.uncertain']),'guard_marker')
    receipt_raw=(W/'credential-commit.receipt.private.json').read_bytes();receipt=json.loads(receipt_raw)
    require(h(receipt_raw)=='a86aa233abdb055a90ca717aa9633d3f2767065e09c687b7a317816a263a53c0','database_receipt_drift')
    require(receipt['verification']=={'oldCredentialReactivation':False,'result':'VERIFIED','usesNewCredentials':True},'database_verified_receipt_drift')
    health=json.loads(subprocess.check_output(['curl','--fail','--max-time','5','--silent','--show-error','http://127.0.0.1:3001/health'],text=True,timeout=8))
    logs=subprocess.run(['docker','logs','--since','30m','wa-agent-postgres'],capture_output=True,text=True,timeout=15);require(logs.returncode==0,'log_read_failed')
    import re
    errors=len(re.findall(r'No space left|could not write|write failed|PANIC',logs.stdout+logs.stderr,re.I));require(errors==0,'storage_write_error')
    require(snapshots[0]==snapshots[1],'context_changed_between_samples')
    key=cfg['re7-whatsapp-agent']['env']['OPENAI_API_KEY']
    result={'result':'SECURITY_PREPARATION_READONLY_CAPTURE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'contextObservation':{'pm2CaptureUid':os.geteuid(),'captureMethod':'deploy canonical configuration+kernel; no PM2 CLI','samples':snapshots},
            'capacity':samples,'configurationSha256':h(config_raw),'configuredOpenaiSha256':h(key.encode()),
            'databaseReceiptSha256':h((W/'credential-commit.receipt.private.json').read_bytes()),'guardGeneration':38,
            'savedFallback600':True,'newAuthNewDbUnchanged':True,'health':health,'recentWriteErrors':errors,
            'limits':'Two short samples, no drain/ownership/window certificate. No external credential binding attested.'}
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'result':'SECURITY_READONLY_CAPTURE_DENY','errorClass':type(e).__name__,'reason':str(e) if isinstance(e,ValueError) else 'private_diagnostic_required'}));raise SystemExit(1)
