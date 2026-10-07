"""System-read-only frontend gates; writes private controls/evidence, never PM2 control."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import secrets
import time
import urllib.request

P = Path('/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z')
FRONT = 're7-admin-front'
TARGET = '/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front'
PM = '/home/deploy/.npm-global/bin/pm2'
PM_PID = Path('/home/deploy/.pm2/pm2.pid')
PORT = 3000

def require(value, code):
    if not value:
        raise RuntimeError(code)

def proc(pid, require_alive=True):
    text = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    if require_alive:
        require(text[0] not in ['Z', 'X', 'x'], 'dead_process')
    return {'pid': pid, 'ticks': text[19], 'parent': int(text[1]), 'state': text[0], 'group': int(text[2])}

def rows(timeout=3):
    return json.loads(subprocess.check_output([PM, 'jlist'], env={**os.environ, 'PATH': '/usr/bin:/bin:' + os.environ.get('PATH', '')}, timeout=timeout))

def same(expected, row):
    e = row['pm2_env']
    require(row['pid'] == expected['pid'], 'pid_drift:' + expected['name'])
    require(proc(row['pid'])['ticks'] == expected['startTicks'], 'ticks_drift:' + expected['name'])
    for key in ['status', 'pm_cwd', 'pm_exec_path', 'exec_interpreter', 'restart_time', 'exec_mode']:
        require(e.get(key) == expected[key], 'process_field:' + key)

def core(v, rs):
    daemon = json.loads((P / 'daemon.private.json').read_text())
    require(int(PM_PID.read_text()) == daemon['pid'], 'daemon_pid')
    require(proc(daemon['pid'])['ticks'] == daemon['ticks'], 'daemon_ticks')
    for expected in v['processes']:
        matches = [r for r in rs if r['name'] == expected['name']]
        if expected['name'] != FRONT:
            require(len(matches) == 1, 'core_duplicate_or_missing'); same(expected, matches[0])

def tree(pid):
    result = {pid: proc(pid)}
    while True:
        added = False
        for f in Path('/proc').iterdir():
            if not f.name.isdigit() or int(f.name) in result:
                continue
            try:
                q = proc(int(f.name), require_alive=False)
            except (FileNotFoundError, ProcessLookupError):
                continue
            if q['parent'] in result:
                require(q['state'] not in ['Z', 'X', 'x'], 'dead_descendant')
                result[q['pid']] = q; added = True
        if not added:
            return list(result.values())

def sockets(ps):
    result = set()
    for q in ps:
        require(proc(q['pid'])['ticks'] == q['ticks'], 'capture_process_changed')
        for f in Path(f'/proc/{q["pid"]}/fd').iterdir():
            try:
                link = os.readlink(f)
            except FileNotFoundError:
                continue
            if link.startswith('socket:['):
                result.add(link[8:-1])
    return sorted(result)

def net():
    result = set(); listener = False
    for kind in ['tcp', 'tcp6']:
        for line in Path('/proc/net/' + kind).read_text().splitlines()[1:]:
            f = line.split(); result.add(f[9])
            if int(f[1].split(':')[-1], 16) == PORT and f[3] == '0A': listener = True
    for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
        result.add(line.split()[6])
    return result, listener

def run_from(label):
    r = json.loads((P / (label + '.run.private.json')).read_text())
    require(r['release'] == (TARGET if label == 'candidate' else next(x['pm_cwd'] for x in json.loads((P/'runtime.private.json').read_text())['processes'] if x['name']==FRONT)), 'run_release')
    return r

def init_run(label):
    rbase = json.loads((P / (label + '.ecosystem.config.cjs')).read_text().split('module.exports = ',1)[1].rstrip(';\n'))
    app = rbase['apps'][0]; release = app['cwd']
    entry = app['script']; require(Path(entry).is_file(), 'entry_missing')
    record = {'nonce':secrets.token_hex(32), 'release':release, 'entry':entry,
              'entrySha256':hashlib.sha256(Path(entry).read_bytes()).hexdigest(),
              'buildId':Path(release,'.next/BUILD_ID').read_text().strip(),
              'args':app['args'], 'journal':str(P/(label+'.startup.private.jsonl')),
              'preExisting':{f.name:proc(int(f.name),require_alive=False)['ticks'] for f in Path('/proc').iterdir() if f.name.isdigit() and f.stat().st_uid==os.getuid()}}
    out = P/(label+'.run.private.json'); require(not out.exists(), 'run_already_exists')
    require(not Path(record['journal']).exists(), 'startup_already_exists')
    out.write_text(json.dumps(record)); out.chmod(0o600)
    app['script']=str(P/'launcher.cjs'); app['args']=[]
    app['env'].update(RE7_FRONT_CONTROL=str(out),RE7_FRONT_RUN=record['nonce'])
    cfg=P/(label+'.tracked.config.cjs'); cfg.write_text('module.exports = '+json.dumps(rbase)+';\n'); cfg.chmod(0o600)

def journal(label):
    r=run_from(label); p=Path(r['journal']); require(p.exists(), 'startup_identity_missing')
    js=[json.loads(x) for x in p.read_text().splitlines()]
    require(js and all(x['nonce']==r['nonce'] for x in js), 'journal_nonce')
    require(sum(x['event']=='parent' for x in js)==1, 'parent_ledger')
    require(sum(x['event']=='application_identity' for x in js)==1, 'application_ledger')
    require(sum(x['event']=='application_released' for x in js)==1, 'single_submission')
    return r,js

def inventory(r,js):
    # Full same-UID inventory. No generic exclusion by process name/IP/port.
    groups={x['group'] for x in js if x['event'] in ['parent','application_identity']}
    result=[]
    for f in Path('/proc').iterdir():
        if not f.name.isdigit(): continue
        try:
            if f.stat().st_uid!=os.getuid(): continue
            q=proc(int(f.name),require_alive=False)
            env=(f/'environ').read_bytes().split(b'\0'); cwd=os.readlink(f/'cwd')
            cmd=(f/'cmdline').read_bytes()
        except PermissionError:
            # Exact identity present before launch cannot be a new descendant.
            # No exemption by name/UID/count: changed or new unreadable PID denies.
            q=proc(int(f.name),require_alive=False)
            require(r['preExisting'].get(f.name)==q['ticks'] and int(q['ticks'])<min(int(x['ticks']) for x in js if x['event']=='parent') and q['group'] not in groups, 'unreadable_new_or_changed_process')
            continue
        except (FileNotFoundError,ProcessLookupError):
            require(not f.exists() or r['preExisting'].get(f.name)==proc(int(f.name),require_alive=False)['ticks'], 'incomplete_new_process')
            continue
        # Unreadable new identities deny; a closed port is never the absence proof.
        relevant=(('RE7_FRONT_RUN='+r['nonce']).encode() in env or cwd==r['release'] or r['entry'].encode() in cmd or int((f/'stat').read_text().rsplit(') ',1)[1].split()[2]) in groups)
        if relevant: result.append(q)
    return sorted(result,key=lambda x:x['pid'])

def tracked_live(label, budget=3):
    v=json.loads((P/'runtime.private.json').read_text()); rs=rows(timeout=min(3,budget)); core(v,rs)
    r=run_from(label); jp=Path(r['journal']); require(jp.exists(),'startup_pending'); js=[json.loads(x) for x in jp.read_text().splitlines()]; require(js and all(x['nonce']==r['nonce'] for x in js),'journal_nonce'); matches=[x for x in rs if x['name']==FRONT]; require(len(matches)==1,'frontend_duplicate_or_missing')
    row=matches[0];e=row['pm2_env']; parent=next(x for x in js if x['event']=='parent')
    require(e['pm_cwd']==r['release'] and e['pm_exec_path']==str(P/'launcher.cjs'), 'frontend_release')
    require(e.get('RE7_FRONT_RUN')==r['nonce'], 'pm2_nonce')
    require(e['status']=='online' and e['restart_time']==0 and e.get('watch') is False, 'frontend_health_identity')
    require(row['pid']==parent['pid'] and proc(parent['pid'])['ticks']==parent['ticks'], 'parent_identity')
    require(not any(x['event'] in ['application_exit','child_error'] for x in js), 'application_ended')
    children=[x for x in js if x['event']=='application_identity'];require(len(children)==1,'startup_pending' if not children else 'application_ledger'); child=children[0]
    require(sum(x['event']=='application_released' for x in js)==1,'single_submission')
    require(proc(child['pid'])['ticks']==child['ticks'], 'application_identity')
    require(hashlib.sha256(Path(r['entry']).read_bytes()).hexdigest()==r['entrySha256'], 'entry_binding')
    require(Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'], 'build_id')
    return r,js

def tracked_absent(label):
    r,js=journal(label)
    # A saved late capture is supplementary, never required to prove early exit.
    for x in js:
        if x['event'] in ['parent','application_identity']:
            require(not Path(f'/proc/{x["pid"]}').exists(), 'survivor_or_pid_reused')
    a=inventory(r,js); b=inventory(r,js)
    require(a==b,'absence_observation_changed');require(not a,'executor_survived')
    ns,listening=net(); require(not listening,'frontend_listener_survived')
    for kind in ['tcp','tcp6']:
        # Non-listening sockets are also inventoried through owning processes above.
        require(Path('/proc/net/'+kind).exists(),'socket_observation_missing')
    cap=P/('candidate-tree.private.json' if label=='candidate' else 'return-tree.private.json')
    if cap.exists(): require(not ns.intersection(json.loads(cap.read_text())['sockets']),'frontend_socket_survived')
    require(not any(x['name']==FRONT and x['pid'] for x in rows()),'pm2_frontend_alive')

def ready(label, deadline_seconds=30, attempts=30, interval=1):
    end=time.monotonic()+deadline_seconds;log=P/(label+'.readiness.private.jsonl')
    require(not log.exists(),'readiness_already_attempted')
    for attempt in range(1,attempts+1):
        result={'attempt':attempt,'elapsedBudget':deadline_seconds-max(0,end-time.monotonic())}
        try:
            budget=end-time.monotonic(); require(budget>0,'readiness_deadline');tracked_live(label,budget=budget) # identity/exit refusal is immediate
        except Exception as e:
            result.update(result='WAIT' if str(e)=='startup_pending' else 'DENY',reason=str(e));log.open('a').write(json.dumps(result)+'\n');log.chmod(0o600)
            if str(e)!='startup_pending':raise
            if time.monotonic()>=end or attempt==attempts:break
            time.sleep(min(interval,max(0,end-time.monotonic())));continue
        successful=False
        try:
            budget=end-time.monotonic();require(budget>0,'readiness_deadline')
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/app/login',timeout=min(1,budget)) as response:
                require(response.status==200,'readiness_http'); response.read(1024)
            successful=True
        except (OSError,urllib.error.URLError,RuntimeError) as e:
            result.update(result='WAIT',reason=str(e));log.open('a').write(json.dumps(result)+'\n');log.chmod(0o600)
        if successful:
            try:
                budget=end-time.monotonic();require(budget>0,'readiness_deadline');tracked_live(label,budget=budget)
            except Exception as e:
                result.update(result='DENY',reason=str(e));log.open('a').write(json.dumps(result)+'\n');log.chmod(0o600);raise
            result['result']='PASS';log.open('a').write(json.dumps(result)+'\n');log.chmod(0o600);return
        if time.monotonic()>=end or attempt==attempts:break
        time.sleep(min(interval,max(0,end-time.monotonic())))
    raise RuntimeError('readiness_deadline_or_attempt_limit')

def main(action):
    v = json.loads((P / 'runtime.private.json').read_text())
    # Never let a diagnostic PM2 CLI bootstrap an absent daemon.
    d = json.loads((P / 'daemon.private.json').read_text())
    require(int(PM_PID.read_text()) == d['pid'], 'daemon_pid')
    require(proc(d['pid'])['ticks'] == d['ticks'], 'daemon_ticks')
    rs = rows(); core(v, rs)
    if action.startswith('init-'):
        init_run(action.removeprefix('init-'))
    elif action.startswith('ready-'):
        ready(action.removeprefix('ready-'))
    elif action in ['before', 'capture-current']:
        matching = [r for r in rs if r['name'] == FRONT]; require(len(matching) == 1, 'frontend_duplicate_or_missing')
        if action == 'before':
            expected = next(x for x in v['processes'] if x['name'] == FRONT); same(expected, matching[0])
        else:
            tracked_live('candidate')
        t = tree(matching[0]['pid']); s = sockets(t)
        out = P / ('source-tree.private.json' if action == 'before' else 'candidate-tree.private.json')
        require(not out.exists(), 'capture_already_exists')
        out.write_text(json.dumps({'tree': t, 'sockets': s})); out.chmod(0o600)
    elif action in ['exited', 'candidate-exited', 'return-exited']:
        if action in ['candidate-exited','return-exited']:
            tracked_absent(action.removesuffix('-exited')); print(action+':PASS');return
        capture = json.loads((P / 'source-tree.private.json').read_text())
        for q in capture['tree']:
            require(not Path(f'/proc/{q["pid"]}').exists(), 'survivor_or_pid_reused')
        ns, listening = net()
        require(not listening, 'frontend_listener_survived')
        require(not ns.intersection(capture['sockets']), 'frontend_socket_survived')
        require(not any(r['name'] == FRONT and r['pid'] for r in rs), 'pm2_frontend_alive')
    elif action in ['candidate', 'return']:
        tracked_live(action)
    else:
        raise RuntimeError('unknown_gate')
    print(action + ':PASS')

if __name__ == '__main__':
    main(sys.argv[1])
