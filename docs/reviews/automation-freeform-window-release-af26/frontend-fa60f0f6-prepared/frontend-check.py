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

BOOT_ID = Path('/proc/sys/kernel/random/boot_id')

P = Path('/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z')
FRONT = 're7-admin-front'
TARGET = '/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front'
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

def pre_existing():
    # Metadata for an exact pre-existing identity exemption, not an absence proof.
    result={}
    for f in Path('/proc').iterdir():
        if not f.name.isdigit():continue
        try:
            if f.stat().st_uid==os.getuid():result[f.name]=proc(int(f.name),require_alive=False)['ticks']
        except (FileNotFoundError,ProcessLookupError):
            # A vanished PID grants no exemption to a later identity.
            continue
    return result

def init_run(label):
    rbase = json.loads((P / (label + '.ecosystem.config.cjs')).read_text().split('module.exports = ',1)[1].rstrip(';\n'))
    app = rbase['apps'][0]; release = app['cwd']
    entry = app['script']; require(Path(entry).is_file(), 'entry_missing')
    record = {'nonce':secrets.token_hex(32), 'release':release, 'entry':entry,
              'entrySha256':hashlib.sha256(Path(entry).read_bytes()).hexdigest(),
              'buildId':Path(release,'.next/BUILD_ID').read_text().strip(),
              'args':app['args'], 'bootId':BOOT_ID.read_text().strip(), 'journal':str(P/(label+'.startup.private.jsonl')),
              'preExisting':pre_existing()}
    out = P/(label+'.run.private.json'); require(not out.exists(), 'run_already_exists')
    require(not Path(record['journal']).exists(), 'startup_already_exists')
    out.write_text(json.dumps(record)); out.chmod(0o600)
    require(app.get('autorestart') is True, 'permanent_autorestart_contract')
    require(not app.get('stop_exit_codes'), 'reserved_exit_code_conflict')
    app['stop_exit_codes']=[78] # fail closed during the window, no automatic second application
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

def inventory(r,js,exclude=None):
    # Full same-UID inventory. No generic exclusion by process name/IP/port.
    groups={x['group'] for x in js if x['event'] in ['parent','application_identity']}
    result=[]
    for f in Path('/proc').iterdir():
        if not f.name.isdigit(): continue
        try:
            if f.stat().st_uid!=os.getuid(): continue
            q=proc(int(f.name),require_alive=False)
            exempt=[x for x in (exclude or []) if q['pid']==x['pid']]
            if exempt:
                require(len(exempt)==1 and q['ticks']==exempt[0]['ticks'],'new_launcher_identity_drift')
                continue
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


def supervision_preflight(control, launcher_pid):
    """No PM2 start: deny surviving previous incarnations before the next fork."""
    control=Path(control); r=json.loads(control.read_text()); boot=BOOT_ID.read_text().strip()
    require(r['nonce'] and r['entrySha256'] and r['buildId'],'supervision_binding')
    marker=json.loads(Path(str(control)+'.permanent').read_text())
    require(marker=={'nonce':r['nonce'],'entrySha256':r['entrySha256'],'buildId':r['buildId']},'permanent_binding')
    previous=[r]
    runs=Path(str(control)+'.runs')
    if runs.exists():
        for d in runs.iterdir():
            require(d.is_dir() and not d.is_symlink(),'incarnation_directory')
            previous.append(json.loads((d/'control.json').read_text()))
    own=proc(launcher_pid);observer=proc(os.getpid())
    require(observer['parent']==own['pid'],'observer_parent_binding')
    log=Path(str(control)+'.observations.private.jsonl')
    def observation(status,attempt,reason=None):
        with log.open('a') as f:
            f.write(json.dumps({'launcherPid':own['pid'],'launcherTicks':own['ticks'],'attempt':attempt,'result':status,'reason':reason,'atMonotonic':time.monotonic()})+'\n')
        log.chmod(0o600)
    for attempt in range(1,4):
        try:
            require(proc(own['pid'])['ticks']==own['ticks'] and proc(observer['pid'])['ticks']==observer['ticks'],'observer_identity_drift')
            require(BOOT_ID.read_text().strip()==boot,'observer_boot_drift')
            for prior in previous:
                require(prior['release']==r['release'] and prior['entrySha256']==r['entrySha256'] and prior['buildId']==r['buildId'],'prior_release_binding')
                # Reboot invalidates /proc PIDs/sockets; never use a previous boot's identity.
                if prior['bootId']!=boot: continue
                jp=Path(prior['journal']);require(jp.is_file(),'prior_journal_missing')
                js=[json.loads(x) for x in jp.read_text().splitlines()]
                require(js and all(x['nonce']==prior['nonce'] for x in js),'prior_journal_nonce')
                require(sum(x['event']=='parent' for x in js)==1,'prior_parent_missing')
                for x in js:
                    if x['event'] in ['parent','application_identity']:
                        require(not Path(f'/proc/{x["pid"]}').exists(),'prior_executor_or_reused_pid')
                a=inventory(prior,js,exclude=[own,observer]);b=inventory(prior,js,exclude=[own,observer])
                require(a==b,'prior_inventory_churn');require(not a,'prior_executor_survived')
            observation('PASS',attempt);break
        except RuntimeError as e:
            observation('DENY',attempt,str(e))
            if str(e) not in ['unreadable_new_or_changed_process','prior_inventory_churn','incomplete_new_process'] or attempt==3:
                raise
            # New complete observations, no sleep certificate or application fork.
    existing=pre_existing()
    return {'bootId':boot,'preExisting':existing}


def supervision_live(control, row):
    """Read-only permanent identity check, independent of consumed window baselines."""
    control=Path(control); original=json.loads(control.read_text());e=row['pm2_env']
    require(row['name']==FRONT and e['status']=='online' and e.get('watch') is False,'supervised_frontend_status')
    require(e['pm_exec_path']==str(control.parent/'launcher.cjs') and e['pm_cwd']==original['release'],'supervised_release')
    require(e.get('RE7_FRONT_CONTROL')==str(control) and e.get('RE7_FRONT_RUN')==original['nonce'],'supervised_pm2_binding')
    require(e.get('autorestart') is True and window_stop_code(e.get('stop_exit_codes')),'supervised_pm2_recovery')
    require(json.loads(Path(str(control)+'.permanent').read_text())=={'nonce':original['nonce'],'entrySha256':original['entrySha256'],'buildId':original['buildId']},'supervised_promotion_binding')
    tick=proc(row['pid'])['ticks'];found=[];records=[original]
    root=Path(str(control)+'.runs')
    if root.exists():
        for d in root.iterdir():
            require(d.is_dir() and not d.is_symlink(),'supervised_incarnation_directory')
            r=json.loads((d/'control.json').read_text())
            require(r['nonce']==d.name and r['nonce']!=original['nonce'],'supervised_new_nonce')
            records.append(r)
    for r in records:
        js=[json.loads(x) for x in Path(r['journal']).read_text().splitlines()]
        parents=[x for x in js if x['event']=='parent']
        require(len(parents)==1,'permanent_parent_record')
        if r['bootId']!=BOOT_ID.read_text().strip():continue
        if parents[0]['pid']==row['pid'] and parents[0]['ticks']==tick:
            # The initial process survives promotion unchanged; every later start has a new nonce.
            require(r is original or r['nonce']!=original['nonce'],'fresh_supervised_identity')
            require(r['release']==original['release'] and r['entrySha256']==original['entrySha256'] and r['buildId']==original['buildId'],'supervised_artifact')
            require(all(x['nonce']==r['nonce'] for x in js),'supervised_journal_nonce')
            require(not any(x['event'] in ['application_exit','child_error','launcher_error'] for x in js),'supervised_application_ended')
            children=[x for x in js if x['event']=='application_identity'];require(len(children)==1,'supervised_child_record')
            require(sum(x['event']=='application_released' for x in js)==1,'supervised_single_release')
            require(proc(children[0]['pid'])['ticks']==children[0]['ticks'],'supervised_child_identity')
            require(hashlib.sha256(Path(r['entry']).read_bytes()).hexdigest()==r['entrySha256'],'supervised_entry_hash')
            require(Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'],'supervised_build_id')
            found.append((r,children[0]))
    require(len(found)==1,'supervised_incarnation_missing_or_duplicate')
    return found[0]

def window_stop_code(value):
    # PM2 6.0.14 normalizes a singleton array to numeric78. No falsy/coercive acceptance.
    return (type(value) is int and value==78) or (type(value) is list and len(value)==1 and type(value[0]) is int and value[0]==78)

def enable_supervision(label):
    r,js=tracked_live(label)
    require((P/(label+'.readiness.private.jsonl')).is_file(),'readiness_required')
    require(json.loads((P/(label+'.readiness.private.jsonl')).read_text().splitlines()[-1])['result']=='PASS','readiness_not_passed')
    row=next(x for x in rows() if x['name']==FRONT)
    require(row['pm2_env'].get('autorestart') is True and window_stop_code(row['pm2_env'].get('stop_exit_codes')),'supervision_pm2_contract')
    out=P/(label+'.run.private.json.permanent')
    with out.open('x') as f:
        f.write(json.dumps({'nonce':r['nonce'],'entrySha256':r['entrySha256'],'buildId':r['buildId']}))
    out.chmod(0o600)
    (P/'execution-authorized').write_text('false\n') # promotion closes the window attempt
    # No start/restart and no replacement of the consumed window journal/config.

def tracked_live(label, budget=3):
    v=json.loads((P/'runtime.private.json').read_text()); rs=rows(timeout=min(3,budget)); core(v,rs)
    r=run_from(label); jp=Path(r['journal']); require(jp.exists(),'startup_pending'); js=[json.loads(x) for x in jp.read_text().splitlines()]; require(js and all(x['nonce']==r['nonce'] for x in js),'journal_nonce'); matches=[x for x in rs if x['name']==FRONT]; require(len(matches)==1,'frontend_duplicate_or_missing')
    require(not any(x['event'] in ['application_exit','child_error'] for x in js), 'application_ended')
    row=matches[0];e=row['pm2_env']; parent=next(x for x in js if x['event']=='parent')
    require(e['pm_cwd']==r['release'] and e['pm_exec_path']==str(P/'launcher.cjs'), 'frontend_release')
    require(e.get('RE7_FRONT_RUN')==r['nonce'], 'pm2_nonce')
    require(e['status']=='online' and e['restart_time']==0 and e.get('watch') is False, 'frontend_health_identity')
    require(row['pid']==parent['pid'] and proc(parent['pid'])['ticks']==parent['ticks'], 'parent_identity')
    children=[x for x in js if x['event']=='application_identity'];require(len(children)==1,'startup_pending' if not children else 'application_ledger'); child=children[0]
    require(sum(x['event']=='application_released' for x in js)==1,'single_submission')
    require(proc(child['pid'])['ticks']==child['ticks'], 'application_identity')
    require(hashlib.sha256(Path(r['entry']).read_bytes()).hexdigest()==r['entrySha256'], 'entry_binding')
    require(Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'], 'build_id')
    return r,js

def tracked_absent(label):
    r,js=journal(label)
    # A saved late capture is supplementary. Permanent incarnations are evidence too.
    records=[(r,js)];root=P/(label+'.run.private.json.runs')
    if root.exists():
        for d in root.iterdir():
            require(d.is_dir() and not d.is_symlink(),'absence_incarnation_directory')
            prior=json.loads((d/'control.json').read_text())
            require(prior['release']==r['release'] and prior['entrySha256']==r['entrySha256'] and prior['nonce']==d.name,'absence_incarnation_binding')
            require(prior['bootId']==BOOT_ID.read_text().strip(),'window_boot_changed')
            previous=[json.loads(x) for x in Path(prior['journal']).read_text().splitlines()]
            require(previous and all(x['nonce']==prior['nonce'] for x in previous),'absence_incarnation_journal')
            require(sum(x['event']=='parent' for x in previous)==1 and sum(x['event']=='application_identity' for x in previous)==1 and sum(x['event']=='application_released' for x in previous)==1,'absence_incarnation_incomplete')
            records.append((prior,previous))
    for prior,previous in records:
        for x in previous:
            if x['event'] in ['parent','application_identity']:
                require(not Path(f'/proc/{x["pid"]}').exists(), 'survivor_or_pid_reused')
        a=inventory(prior,previous);b=inventory(prior,previous)
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
    if action.startswith('supervised-'):
        label=action.removeprefix('supervised-');control=P/(label+'.run.private.json')
        daemon=proc(int(PM_PID.read_text()));rs=rows()
        matches=[x for x in rs if x['name']==FRONT];require(len(matches)==1,'supervised_duplicate_or_missing')
        supervision_live(control,matches[0])
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/app/login',timeout=1) as response:
            require(response.status==200,'supervised_http')
        require(proc(int(PM_PID.read_text()))['pid']==daemon['pid'] and proc(daemon['pid'])['ticks']==daemon['ticks'],'supervised_daemon_changed')
        print(action+':PASS');return
    v = json.loads((P / 'runtime.private.json').read_text())
    # Never let a diagnostic PM2 CLI bootstrap an absent daemon.
    d = json.loads((P / 'daemon.private.json').read_text())
    require(int(PM_PID.read_text()) == d['pid'], 'daemon_pid')
    require(proc(d['pid'])['ticks'] == d['ticks'], 'daemon_ticks')
    rs = rows(); core(v, rs)
    if action.startswith('enable-supervision-'):
        enable_supervision(action.removeprefix('enable-supervision-'))
    elif action.startswith('init-'):
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
    if sys.argv[1]=='supervision-preflight':
        print(json.dumps(supervision_preflight(sys.argv[2],int(sys.argv[3]))))
    else:
        main(sys.argv[1])
