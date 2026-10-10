"""Fixed unprivileged commands; private stdout/stderr/exit, one intent per start."""
import json
from pathlib import Path
import subprocess
import sys
import time

P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z')
PM='/home/deploy/.npm-global/bin/pm2'

def execute(stage, root=P, pm=PM):
    if stage in ['stop','delete','start-candidate','start-return','enable-supervision-candidate','enable-supervision-return']:
        if (root/'execution-authorized').read_text().strip()!='true':
            raise RuntimeError('execution_not_authorized')
    checks=['supervised-candidate','supervised-return','enable-supervision-candidate','enable-supervision-return','before','exited','init-candidate','init-return','capture-current','candidate','return','candidate-exited','return-exited','ready-candidate','ready-return']
    if stage in checks: cmd=['/usr/bin/python3',str(root/'frontend-check.py'),stage]
    elif stage=='stop':cmd=[pm,'stop','re7-admin-front']
    elif stage=='delete':cmd=[pm,'delete','re7-admin-front']
    elif stage in ['start-candidate','start-return']:
        label=stage.removeprefix('start-');cmd=[pm,'start',str(root/(label+'.tracked.config.cjs')),'--only','re7-admin-front']
        with (root/(stage+'.intent')).open('x') as f:f.write(json.dumps({'command':cmd,'at':time.time()}))
    else:raise RuntimeError('unknown_stage')
    # Each log is preserved; a diagnostic read can be repeated with a new numbered file.
    folder=root/'command-output-private';folder.mkdir(mode=0o700,exist_ok=True)
    out=folder/(stage+'-'+str(time.time_ns())+'.json')
    budget=40 if stage.startswith('ready-') else 15
    try:
        v=subprocess.run(cmd,text=True,capture_output=True,timeout=budget)
        data={'stage':stage,'stdout':v.stdout,'stderr':v.stderr,'exitCode':v.returncode,'timeout':False}
    except subprocess.TimeoutExpired as e:
        data={'stage':stage,'stdout':(e.stdout or b'').decode() if isinstance(e.stdout,bytes) else e.stdout,'stderr':(e.stderr or b'').decode() if isinstance(e.stderr,bytes) else e.stderr,'exitCode':None,'timeout':True}
    out.write_text(json.dumps(data,indent=2));out.chmod(0o600)
    print(json.dumps({'stage':stage,'result':'PASS' if data['exitCode']==0 else 'DENY','exitCode':data['exitCode'],'timeout':data['timeout'],'privateRecord':out.name}))
    return 0 if data['exitCode']==0 else 1

if __name__=='__main__':raise SystemExit(execute(sys.argv[1]))
