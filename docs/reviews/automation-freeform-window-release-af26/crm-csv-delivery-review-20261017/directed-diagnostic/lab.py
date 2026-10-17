"""Laboratory only: reuse accepted fixture/SSH shim; never in remote manifest."""
import hashlib,os
from pathlib import Path
P=Path(__file__).resolve().parents[2]/'crm-csv-postrpc-diagnostics-20261017/lab.py'
raw=P.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='dbedfda1b6b19f4804d9d1ad3cc09b120eb541c5ca546d560c2fa84b6f002985','accepted_lab_source'
s=raw.decode().replace("('/proc/','/home/deploy/','/opt/re7online/')", "('/proc/','/home/deploy/','/opt/re7online/','/etc/cron.d/')")
s=s.replace("        if args[0]=='/usr/bin/docker':", """        if args[0]in('/usr/bin/crontab','/usr/bin/systemctl'):
            if CASE=='control-denied':raise PermissionError(13,'synthetic command access denied')
            out=b'# SYNTHETIC_CRON\\n'if args[0]=='/usr/bin/crontab'else b'ActiveState=inactive\\nUnitFileState=enabled\\n'
            return subprocess.CompletedProcess(args,0,out,b'')
        if args[0]=='/usr/bin/docker':""")
exec(compile(s,str(P),'exec'),globals())
accepted_fixture=fixture
def fixture(root):
    import json,copy
    apps=accepted_fixture(root);fake=root/'fs'
    window=fake/'opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window'
    front=next(a for a in apps if a['name']=='re7-admin-front');before=copy.deepcopy(front['pm2_env']);before.pop('status');before.pop('restart_time')
    before['env']={'APP_ONLY':'SYNTHETIC_APP','PATH':'/synthetic/app'}
    front['pm2_env'].update(copy.deepcopy(before))
    osenv={'OS_ONLY':'SYNTHETIC_OS','PATH':'/synthetic/daemon','pm2_env':json.dumps(before,sort_keys=True)}
    (fake/'proc/188897/environ').write_bytes(b''.join((k+'='+v).encode()+b'\0'for k,v in osenv.items()))
    profile=json.loads((window/'source.profile.private.json').read_bytes());next(c for c in profile['apps']if c['name']=='re7-admin-front')['env']=osenv
    (window/'source.profile.private.json').write_text(json.dumps(profile))
    (window/'saved-dump.pm2.private.json').write_text(json.dumps([before]))
    for n in('dump.pm2','dump.pm2.bak'):(fake/'home/deploy/.pm2'/n).write_text(json.dumps([before]))
    for n in('deploy.crontab.before','re7-converta-backup.before'):(window/n).write_bytes(b'# SYNTHETIC_CRON\n')
    (window/'initial.private.json').write_text(json.dumps({'supervision':'ActiveState=inactive\nUnitFileState=enabled\n'}))
    (window/'execution-gates.private.json').write_text(json.dumps({k:False for k in('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')}))
    (window.parent/'execution-authorized').write_text('false\n')
    cron=fake/'etc/cron.d/re7-converta-backup';cron.parent.mkdir(parents=True);cron.write_bytes(b'# SYNTHETIC_CRON\n')
    return apps
