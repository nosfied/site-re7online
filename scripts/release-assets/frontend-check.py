"""System-read-only frontend gates; writes private controls/evidence, never PM2 control."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import secrets
import time
import urllib.request

BOOT_ID = Path('/proc/sys/kernel/random/boot_id')
CANDIDATE_ROOT = RETURN_ROOT = LAUNCHER_PATH = TARGET_PATH = PM2_PID_PATH = None
BINDING_SHA256 = None
FIXTURE_SURFACE = None
BINDING_KEYS = {'schemaVersion','candidateRoot','returnRoot','launcher','target','pm2Pid'}

# Artifact bindings only. Predicates and decisions remain canonical.
def label_stem(label):
    return 'candidate-v2' if label == 'candidate' else label

def control_path(label):
    return (CANDIDATE_ROOT if label == 'candidate' else RETURN_ROOT) / (label_stem(label) + '.run.private.json')

def config_path(label):
    return (CANDIDATE_ROOT if label == 'candidate' else RETURN_ROOT) / (label_stem(label) + '.tracked.config.cjs')

def state_path(label, suffix):
    return CANDIDATE_ROOT / (label_stem(label) + suffix)

PERMANENT_CLIENT = None
PERMANENT_CLIENT_SHA256 = '34dae9ac861aeb89c6787871a27dd244ca931ca1038163423efd9af2996cb374'

def load_bound_module(name, path, expected_sha256):
    import types
    before = path.lstat()
    require(path.is_file() and not path.is_symlink() and before.st_size < 65536, 'bound_module_type_size')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'bound_module_replaced')
        raw = os.read(fd, 65536)
        require(not os.read(fd, 1), 'bound_module_too_large')
        after = os.fstat(fd)
    finally:
        os.close(fd)
    fields = ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
    require(tuple(getattr(before, k) for k in fields) == tuple(getattr(after, k) for k in fields), 'bound_module_changed')
    require(hashlib.sha256(raw).hexdigest() == expected_sha256, 'bound_module_hash')
    module = types.ModuleType(name); module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module
FRONT = 're7-admin-front'
PM = '/home/deploy/.npm-global/bin/pm2'
PORT = 3000

def require(value, code):
    if not value:
        raise RuntimeError(code)

def stable_private_json(path, expected_keys, code):
    path=Path(path);before=path.lstat()
    require(stat.S_ISREG(before.st_mode) and not path.is_symlink() and stat.S_IMODE(before.st_mode)==0o600 and before.st_nlink==1 and before.st_size<1048576,code+'_type_mode')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        opened=os.fstat(fd);require((opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino),code+'_replaced')
        raw=bytearray()
        while True:
            block=os.read(fd,65536)
            if not block:break
            raw.extend(block)
        after=os.fstat(fd)
    finally:os.close(fd)
    fields=('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
    require(tuple(getattr(opened,k) for k in fields)==tuple(getattr(after,k) for k in fields)==tuple(getattr(path.lstat(),k) for k in fields),code+'_changed')
    value=json.loads(raw);require(type(value) is dict and set(value)==expected_keys,code+'_schema')
    return value,hashlib.sha256(raw).hexdigest()

def absolute_path(value, code):
    require(type(value) is str and value.startswith('/') and str(Path(value))==value,code)
    return Path(value)

def configure(binding_path, expected_binding_sha256, fixture_surface_path=None):
    global CANDIDATE_ROOT,RETURN_ROOT,LAUNCHER_PATH,TARGET_PATH,PM2_PID_PATH,PERMANENT_CLIENT,BINDING_SHA256,FIXTURE_SURFACE
    binding,digest=stable_private_json(binding_path,BINDING_KEYS,'binding')
    require(type(expected_binding_sha256) is str and len(expected_binding_sha256)==64 and digest==expected_binding_sha256,'binding_hash')
    require(binding['schemaVersion']==1,'binding_version')
    candidate=absolute_path(binding['candidateRoot'],'binding_candidate_absolute')
    returned=absolute_path(binding['returnRoot'],'binding_return_absolute')
    launcher=absolute_path(binding['launcher'],'binding_launcher_absolute')
    target=absolute_path(binding['target'],'binding_target_absolute')
    pm2pid=absolute_path(binding['pm2Pid'],'binding_pm2_pid_absolute')
    require(candidate!=returned,'binding_root_alias')
    require(candidate.is_dir() and not candidate.is_symlink(),'binding_candidate_root')
    require(returned.is_dir() and not returned.is_symlink(),'binding_return_root')
    require(launcher.is_file() and not launcher.is_symlink(),'binding_launcher')
    require(target.is_dir() and not target.is_symlink(),'binding_target')
    require(pm2pid.is_file() and not pm2pid.is_symlink(),'binding_pm2_pid')
    CANDIDATE_ROOT,RETURN_ROOT,LAUNCHER_PATH,TARGET_PATH,PM2_PID_PATH=candidate,returned,launcher,str(target),pm2pid
    PERMANENT_CLIENT=RETURN_ROOT/'permanent_observation_client.py';BINDING_SHA256=digest
    if fixture_surface_path is not None:
        keys={'schemaVersion','pm2Rows','processes','httpStatus'}
        surface,_=stable_private_json(fixture_surface_path,keys,'fixture_surface')
        require(surface['schemaVersion']==1 and type(surface['pm2Rows']) is list and type(surface['processes']) is dict and surface['httpStatus']==200,'fixture_surface_value')
        FIXTURE_SURFACE=Path(fixture_surface_path)

def fixture_surface():
    require(FIXTURE_SURFACE is not None,'fixture_surface_unconfigured')
    return stable_private_json(FIXTURE_SURFACE,{'schemaVersion','pm2Rows','processes','httpStatus'},'fixture_surface')[0]

def proc(pid, require_alive=True):
    if FIXTURE_SURFACE is not None:
        value=fixture_surface()['processes'].get(str(pid));require(value is not None,'fixture_process_missing')
        result={'pid':pid,**value}
        if require_alive:require(result['state'] not in ['Z','X','x'],'dead_process')
        return result
    text = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    if require_alive:
        require(text[0] not in ['Z', 'X', 'x'], 'dead_process')
    return {'pid': pid, 'ticks': text[19], 'parent': int(text[1]), 'state': text[0], 'group': int(text[2])}

def rows(timeout=3):
    if FIXTURE_SURFACE is not None:return fixture_surface()['pm2Rows']
    return json.loads(subprocess.check_output([PM, 'jlist'], env={**os.environ, 'PATH': '/usr/bin:/bin:' + os.environ.get('PATH', '')}, timeout=timeout))

def health(url, timeout, code):
    if FIXTURE_SURFACE is not None:
        require(fixture_surface()['httpStatus']==200,code);return
    with urllib.request.urlopen(url,timeout=timeout) as response:
        require(response.status==200,code);response.read(1024)

def same(expected, row):
    e = row['pm2_env']
    require(row['pid'] == expected['pid'], 'pid_drift:' + expected['name'])
    require(proc(row['pid'])['ticks'] == expected['startTicks'], 'ticks_drift:' + expected['name'])
    for key in ['status', 'pm_cwd', 'pm_exec_path', 'exec_interpreter', 'restart_time', 'exec_mode']:
        require(e.get(key) == expected[key], 'process_field:' + key)

def core(v, rs):
    daemon = json.loads((CANDIDATE_ROOT / 'daemon.private.json').read_text())
    require(int(PM2_PID_PATH.read_text()) == daemon['pid'], 'daemon_pid')
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

# Historical helpers retained solely to reproduce 550b627c tests.
# No operational gate below calls these functions or the consumed certificate.
SOURCE_ROOT_OBSERVATION = Path('/run/re7-frontend-source-exit-20261007T173647Z.json')

def root_source_socket_observation(captured, remaining, daemon):
    # Fixed root-owned read certificate, only for this consumed source capture.
    path = SOURCE_ROOT_OBSERVATION
    for node in (path, *path.parents):
        st = node.lstat()
        require(st.st_uid == 0 and not st.st_mode & 0o022 and not node.is_symlink(), 'root_socket_observation_path')
    require(path.is_file(), 'root_socket_observation_type')
    record = json.loads(path.read_text())
    require(set(record) == {'at', 'bootId', 'sourceSha256', 'daemon', 'observations'}, 'root_socket_observation_schema')
    require(0 <= time.time() - record['at'] <= 120, 'root_socket_observation_expired')
    require(record['bootId'] == BOOT_ID.read_text().strip(), 'root_socket_observation_boot')
    require(record['sourceSha256'] == hashlib.sha256((CANDIDATE_ROOT/'source-tree.private.json').read_bytes()).hexdigest(), 'root_socket_observation_capture')
    require(record['daemon'] == {'pid': daemon['pid'], 'ticks': daemon['ticks']}, 'root_socket_observation_daemon')
    expected = {inode: [[daemon['pid'], daemon['ticks'], '0', False]] for inode in remaining}
    require(record['observations'] == [expected, expected], 'root_socket_observation_owners')
    require(proc(daemon['pid'])['ticks'] == daemon['ticks'], 'daemon_ticks')
    require(len(remaining) == 1 and os.readlink(f'/proc/{daemon["pid"]}/fd/0') == 'socket:[' + next(iter(remaining)) + ']', 'daemon_stdin_drift')
    require(net()[0].intersection(captured) == remaining, 'socket_owner_observation_churn')
    return set()

def remaining_source_sockets(captured):
    """Retain socket barrier; classify only the preserved daemon's connected Unix stdin.

    A PM2 child can inherit the daemon's fd0. Its continued existence is not
    evidence of a surviving application. No exclusion by name, UID or count.
    """
    remaining = net()[0].intersection(captured)
    if not remaining:
        return set()
    daemon = json.loads((CANDIDATE_ROOT / 'daemon.private.json').read_text())
    def observe():
        require(int(PM2_PID_PATH.read_text()) == daemon['pid'], 'daemon_pid')
        require(proc(daemon['pid'])['ticks'] == daemon['ticks'], 'daemon_ticks')
        fd0 = os.readlink(f'/proc/{daemon["pid"]}/fd/0')
        unix = {}
        for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
            fields = line.split()
            unix[fields[6]] = fields
        result = {}
        for inode in remaining:
            fields = unix.get(inode)
            require(fields is not None and fields[3:6] == ['00000000', '0001', '03'], 'frontend_socket_survived')
            require(fd0 == 'socket:[' + inode + ']', 'frontend_socket_survived')
            owners = []
            for folder in Path('/proc').iterdir():
                if not folder.name.isdigit():
                    continue
                try:
                    q = proc(int(folder.name), require_alive=False)
                    for fd in (folder / 'fd').iterdir():
                        try:
                            if os.readlink(fd) == 'socket:[' + inode + ']':
                                owners.append((q['pid'], q['ticks'], fd.name, q['state'] in ['Z', 'X', 'x']))
                        except FileNotFoundError:
                            # /proc/self/fd enumerates its own short-lived directory FD.
                            if q['pid'] != os.getpid():
                                raise RuntimeError('socket_owner_observation_incomplete')
                except (FileNotFoundError, ProcessLookupError):
                    raise RuntimeError('socket_owner_observation_incomplete')
                except PermissionError:
                    raise RuntimeError('socket_owner_observation_incomplete')
            require(owners == [(daemon['pid'], daemon['ticks'], '0', False)], 'frontend_socket_owner_ambiguous')
            result[inode] = owners
        require(proc(daemon['pid'])['ticks'] == daemon['ticks'], 'daemon_ticks')
        require(os.readlink(f'/proc/{daemon["pid"]}/fd/0') == fd0, 'daemon_stdin_drift')
        return result
    try:
        first = observe(); second = observe()
    except RuntimeError as error:
        if str(error) != 'socket_owner_observation_incomplete' or not SOURCE_ROOT_OBSERVATION.exists():
            raise
        return root_source_socket_observation(captured, remaining, daemon)
    require(first == second and net()[0].intersection(captured) == remaining, 'socket_owner_observation_churn')
    return remaining.difference(first)

def run_from(label):
    r = json.loads(control_path(label).read_text())
    require(r['release'] == (TARGET_PATH if label == 'candidate' else next(x['pm_cwd'] for x in json.loads((CANDIDATE_ROOT/'runtime.private.json').read_text())['processes'] if x['name']==FRONT)), 'run_release')
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
    rbase = json.loads(((CANDIDATE_ROOT if label == 'candidate' else RETURN_ROOT) / (label_stem(label) + '.ecosystem.config.cjs')).read_text().split('module.exports = ',1)[1].rstrip(';\n'))
    app = rbase['apps'][0]; release = app['cwd']
    entry = app['script']; require(Path(entry).is_file(), 'entry_missing')
    record = {'nonce':secrets.token_hex(32), 'release':release, 'entry':entry,
              'entrySha256':hashlib.sha256(Path(entry).read_bytes()).hexdigest(),
              'buildId':Path(release,'.next/BUILD_ID').read_text().strip(),
              'args':app['args'], 'bootId':BOOT_ID.read_text().strip(), 'journal':str(state_path(label, '.startup.private.jsonl')),
              'preExisting':pre_existing()}
    out = control_path(label); require(not out.exists(), 'run_already_exists')
    require(not Path(record['journal']).exists(), 'startup_already_exists')
    out.write_text(json.dumps(record)); out.chmod(0o600)
    require(app.get('autorestart') is True, 'permanent_autorestart_contract')
    require(not app.get('stop_exit_codes'), 'reserved_exit_code_conflict')
    app['stop_exit_codes']=[78] # fail closed during the window, no automatic second application
    app['script']=str(LAUNCHER_PATH); app['args']=[]
    app['env'].update(RE7_FRONT_CONTROL=str(out),RE7_FRONT_RUN=record['nonce'])
    cfg=config_path(label); cfg.write_text('module.exports = '+json.dumps(rbase)+';\n'); cfg.chmod(0o600)

def journal(label):
    r=run_from(label); p=Path(r['journal']); require(p.exists(), 'startup_identity_missing')
    js=[json.loads(x) for x in p.read_text().splitlines()]
    require(js and all(x['nonce']==r['nonce'] for x in js), 'journal_nonce')
    require(sum(x['event']=='parent' for x in js)==1, 'parent_ledger')
    require(sum(x['event']=='application_identity' for x in js)==1, 'application_ledger')
    require(sum(x['event']=='application_released' for x in js)==1, 'single_submission')
    return r,js

def unreadable_identity_observed(q, js, observation):
    require(observation is not None and len(observation['samples']) == 2, 'unreadable_new_or_changed_process')
    require(0 <= time.monotonic() - observation['finishedMonotonic'] <= 10, 'observation_expired')
    protected = {x['pid'] for x in js if x['event'] in ['parent', 'application_identity']}
    groups = {x['group'] for x in js if x['event'] in ['parent', 'application_identity']}
    require(q['pid'] not in protected and q['group'] not in groups and q['state'] not in ['Z','X','x'], 'unreadable_executor_identity')
    signatures=[]
    for sample in observation['samples']:
        rows=sample['processes']; by={x['pid']:x for x in rows}
        require(len(by)==len(rows), 'observation_duplicate_process')
        match=by.get(q['pid']); require(match is not None, 'unreadable_process_unobserved')
        require(all(match[k]==q[k] for k in ['pid','ticks','parent','group']), 'unreadable_observation_identity_drift')
        require(match['state'] not in ['Z','X','x'] and match['roles']==[], 'unreadable_observed_executor')
        chain=[tuple(match[k] for k in ['pid','ticks','parent','group'])]
        seen=set(); node=match
        while node['parent']:
            require(node['pid'] not in seen, 'unreadable_ancestor_cycle');seen.add(node['pid'])
            require(node['parent'] in by, 'unreadable_ancestor_incomplete');node=by[node['parent']]
            require(node['pid'] not in protected and node['group'] not in groups and node['roles']==[] and node['state'] not in ['Z','X','x'], 'unreadable_executor_ancestor')
            chain.append(tuple(node[k] for k in ['pid','ticks','parent','group']))
        signatures.append(chain)
    require(signatures[0]==signatures[1], 'unreadable_observation_changed')


def inventory(r,js,exclude=None,observation=None):
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
            prior = (r['preExisting'].get(f.name)==q['ticks'] and int(q['ticks'])<min(int(x['ticks']) for x in js if x['event']=='parent') and q['group'] not in groups)
            if not prior: unreadable_identity_observed(q,js,observation)
            continue
        except (FileNotFoundError,ProcessLookupError):
            require(not f.exists() or r['preExisting'].get(f.name)==proc(int(f.name),require_alive=False)['ticks'], 'incomplete_new_process')
            continue
        # Unreadable new identities deny; a closed port is never the absence proof.
        specific=(('RE7_FRONT_RUN='+r['nonce']).encode() in env or cwd==r['release'] or r['entry'].encode() in cmd)
        # Cluster workers share the daemon's group. An exact pre-existing identity
        # cannot become a new descendant merely by group membership. Explicit
        # nonce/release/entry matches still deny, even for a prior process.
        prior_identity=(r['preExisting'].get(f.name)==q['ticks'] and
                        int(q['ticks'])<min(int(x['ticks']) for x in js if x['event']=='parent'))
        relevant=specific or (q['group'] in groups and not prior_identity)
        if relevant: result.append(q)
    return sorted(result,key=lambda x:x['pid'])


PERMANENT_READER = None

def supervision_observation(control, run):
    # Permanent reader has static artifact/PM2 scope, no window boot/PID binding.
    root=Path(control).parent
    client=load_bound_module('frontend_permanent_client',PERMANENT_CLIENT,PERMANENT_CLIENT_SHA256)
    value=client.read(root,run,reader=PERMANENT_READER)
    d=value['effectivePolicy']['daemon']
    require(int(PM2_PID_PATH.read_text())==d['pid'] and proc(d['pid'])['ticks']==d['ticks'],'supervision_current_daemon')
    return value


def current_boot_observed(value, own, observer):
    # No prior boot PID/group/socket identity is reused. A fresh complete root
    # inventory must explain current executors before the first Next fork.
    require(0 <= time.monotonic()-value['finishedMonotonic'] <= 10,'observation_expired')
    d=value['effectivePolicy']['daemon']
    require(own['parent']==d['pid'],'supervision_launcher_daemon_parent')
    allowed={own['pid']:own,observer['pid']:observer}
    for sample in value['samples']:
        require(not sample['listeners'],'supervision_current_listener_survived')
        shared=sample['daemonFd0']
        if shared.startswith('socket:['):
            inode=shared[8:-1]
            require(sample['network'][inode]=={'kind':'unix','state':'03','type':'0001','flags':'00000000'},'supervision_shared_socket_type')
            for owner in sample['owners'][inode]:
                expected=d if owner['pid']==d['pid'] else allowed.get(owner['pid'])
                require(expected is not None and owner['ticks']==expected['ticks'] and owner['fd']=='0' and owner['state'] not in ['Z','X','x'],'supervision_additional_socket_owner')
            require(any(q['pid']==d['pid'] and q['fd']=='0' for q in sample['owners'][inode]),'supervision_daemon_socket_unobserved')
        rows=sample['processes'];by={q['pid']:q for q in rows}
        require(len(by)==len(rows),'observation_duplicate_process')
        for pid, expected in allowed.items():
            q=by.get(pid);require(q is not None,'supervision_observer_unobserved')
            require(all(q[k]==expected[k] for k in ['pid','ticks','parent','group']) and q['state'] not in ['Z','X','x'],'supervision_observer_identity_drift')
        for q in rows:
            require(not q['roles'] or q['pid'] in allowed,'supervision_current_executor_survived')
            # The read-only observer may have its own sudo reader descendants;
            # no second direct launcher child is allowed before the Next fork.
            require(q['parent']!=own['pid'] or q['pid']==observer['pid'],'supervision_launcher_descendant_survived')


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
            fresh_boot=supervision_observation(control,r)
            current_boot_observed(fresh_boot,own,observer)
            for prior in previous:
                require(prior['release']==r['release'] and prior['entrySha256']==r['entrySha256'] and prior['buildId']==r['buildId'],'prior_release_binding')
                # Reboot invalidates /proc PIDs/sockets; never use a previous boot's identity.
                if prior['bootId']!=boot:
                    if fresh_boot is None:
                        fresh_boot=supervision_observation(control,r)
                        current_boot_observed(fresh_boot,own,observer)
                    continue
                jp=Path(prior['journal']);require(jp.is_file(),'prior_journal_missing')
                js=[json.loads(x) for x in jp.read_text().splitlines()]
                require(js and all(x['nonce']==prior['nonce'] for x in js),'prior_journal_nonce')
                require(sum(x['event']=='parent' for x in js)==1,'prior_parent_missing')
                for x in js:
                    if x['event'] in ['parent','application_identity']:
                        require(not Path(f'/proc/{x["pid"]}').exists(),'prior_executor_or_reused_pid')
                try:
                    a=inventory(prior,js,exclude=[own,observer]);b=inventory(prior,js,exclude=[own,observer])
                except RuntimeError as error:
                    if str(error)!='unreadable_new_or_changed_process':raise
                    fresh=fresh_boot
                    a=inventory(prior,js,exclude=[own,observer],observation=fresh)
                    b=inventory(prior,js,exclude=[own,observer],observation=fresh)
                    require(0 <= time.monotonic()-fresh['finishedMonotonic'] <= 10,'observation_expired')
                require(a==b,'prior_inventory_churn');require(not a,'prior_executor_survived')
            if fresh_boot is not None:require(0 <= time.monotonic()-fresh_boot['finishedMonotonic'] <= 10,'observation_expired')
            observation('PASS',attempt);break
        except RuntimeError as e:
            observation('DENY',attempt,str(e))
            if str(e) not in ['unreadable_new_or_changed_process','prior_inventory_churn','incomplete_new_process','ownership_observation_changed','ownership_observation_incomplete','fd_observation_incomplete'] or attempt==3:
                raise
            # New complete observations, no sleep certificate or application fork.
    existing=pre_existing()
    return {'bootId':boot,'preExisting':existing}


def supervision_live(control, row):
    """Read-only permanent identity check, independent of consumed window baselines."""
    control=Path(control); original=json.loads(control.read_text());e=row['pm2_env']
    require(row['name']==FRONT and e['status']=='online' and e.get('watch') is False,'supervised_frontend_status')
    require(e['pm_exec_path']==str(LAUNCHER_PATH) and e['pm_cwd']==original['release'],'supervised_release')
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
    require((state_path(label, '.readiness.private.jsonl')).is_file(),'readiness_required')
    require(json.loads((state_path(label, '.readiness.private.jsonl')).read_text().splitlines()[-1])['result']=='PASS','readiness_not_passed')
    row=next(x for x in rows() if x['name']==FRONT)
    require(row['pm2_env'].get('autorestart') is True and window_stop_code(row['pm2_env'].get('stop_exit_codes')),'supervision_pm2_contract')
    out=Path(str(control_path(label))+'.permanent')
    with out.open('x') as f:
        f.write(json.dumps({'nonce':r['nonce'],'entrySha256':r['entrySha256'],'buildId':r['buildId']}))
    out.chmod(0o600)
    (CANDIDATE_ROOT/'execution-authorized').write_text('false\n') # promotion closes the window attempt
    # No start/restart and no replacement of the consumed window journal/config.

def tracked_live(label, budget=3):
    v=json.loads((CANDIDATE_ROOT/'runtime.private.json').read_text()); rs=rows(timeout=min(3,budget)); core(v,rs)
    r=run_from(label); jp=Path(r['journal']); require(jp.exists(),'startup_pending'); js=[json.loads(x) for x in jp.read_text().splitlines()]; require(js and all(x['nonce']==r['nonce'] for x in js),'journal_nonce'); matches=[x for x in rs if x['name']==FRONT]; require(len(matches)==1,'frontend_duplicate_or_missing')
    require(not any(x['event'] in ['application_exit','child_error'] for x in js), 'application_ended')
    row=matches[0];e=row['pm2_env']; parent=next(x for x in js if x['event']=='parent')
    require(e['pm_cwd']==r['release'] and e['pm_exec_path']==str(LAUNCHER_PATH), 'frontend_release')
    require(e.get('RE7_FRONT_RUN')==r['nonce'], 'pm2_nonce')
    require(e['status']=='online' and e['restart_time']==0 and e.get('watch') is False, 'frontend_health_identity')
    require(row['pid']==parent['pid'] and proc(parent['pid'])['ticks']==parent['ticks'], 'parent_identity')
    children=[x for x in js if x['event']=='application_identity'];require(len(children)==1,'startup_pending' if not children else 'application_ledger'); child=children[0]
    require(sum(x['event']=='application_released' for x in js)==1,'single_submission')
    require(proc(child['pid'])['ticks']==child['ticks'], 'application_identity')
    require(hashlib.sha256(Path(r['entry']).read_bytes()).hexdigest()==r['entrySha256'], 'entry_binding')
    require(Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'], 'build_id')
    return r,js

# Review-only dependency. No environment-controlled command, no historical root certificate.
OBSERVATION_READER = None

def socket_observation(stage):
    import socket_observation_client
    return socket_observation_client.read(CANDIDATE_ROOT, stage, reader=OBSERVATION_READER)

def socket_absence(role, ledger, capture):
    import socket_observation_contract
    observation, policy = socket_observation(role+'-exited')
    socket_observation_contract.absent(observation, policy, role, ledger, capture)

def tracked_absent(label):
    r,js=journal(label)
    # A saved late capture is supplementary. Permanent incarnations are evidence too.
    records=[(r,js)];root=Path(str(control_path(label))+'.runs')
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
    cap=state_path(label, '-tree.private.json')
    import socket_observation_contract
    observation, policy = socket_observation(label+'-exited')
    socket_observation_contract.absent(observation, policy, label, [x for _, previous in records for x in previous if x['event'] in ['parent', 'application_identity']], cap if cap.exists() else None)
    for prior,previous in records:
        for x in previous:
            if x['event'] in ['parent','application_identity']:
                require(not Path(f'/proc/{x["pid"]}').exists(), 'survivor_or_pid_reused')
        a=inventory(prior,previous,observation=observation);b=inventory(prior,previous,observation=observation)
        require(a==b,'absence_observation_changed');require(not a,'executor_survived')
    ns,listening=net(); require(not listening,'frontend_listener_survived')
    for kind in ['tcp','tcp6']:
        # Non-listening sockets are also inventoried through owning processes above.
        require(Path('/proc/net/'+kind).exists(),'socket_observation_missing')
    require(0 <= time.monotonic()-observation['finishedMonotonic'] <= 10, 'observation_expired')
    require(not any(x['name']==FRONT and x['pid'] for x in rows()),'pm2_frontend_alive')

def ready(label, deadline_seconds=30, attempts=30, interval=1):
    end=time.monotonic()+deadline_seconds;log=state_path(label, '.readiness.private.jsonl')
    require(not Path(str(control_path(label))+'.permanent').exists(),'candidate_root_consumed')
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
            health(f'http://127.0.0.1:{PORT}/app/login',min(1,budget),'readiness_http')
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
    require(CANDIDATE_ROOT is not None and RETURN_ROOT is not None and LAUNCHER_PATH is not None and TARGET_PATH is not None and PM2_PID_PATH is not None,'binding_required')
    if action.startswith('supervised-'):
        label=action.removeprefix('supervised-');control=control_path(label)
        daemon=proc(int(PM2_PID_PATH.read_text()));rs=rows()
        matches=[x for x in rs if x['name']==FRONT];require(len(matches)==1,'supervised_duplicate_or_missing')
        supervision_live(control,matches[0])
        health(f'http://127.0.0.1:{PORT}/app/login',1,'supervised_http')
        require(proc(int(PM2_PID_PATH.read_text()))['pid']==daemon['pid'] and proc(daemon['pid'])['ticks']==daemon['ticks'],'supervised_daemon_changed')
        print(action+':PASS');return
    v = json.loads((CANDIDATE_ROOT / 'runtime.private.json').read_text())
    # Never let a diagnostic PM2 CLI bootstrap an absent daemon.
    d = json.loads((CANDIDATE_ROOT / 'daemon.private.json').read_text())
    require(int(PM2_PID_PATH.read_text()) == d['pid'], 'daemon_pid')
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
        out = CANDIDATE_ROOT / ('source-tree.private.json' if action == 'before' else 'candidate-v2-tree.private.json')
        require(not out.exists(), 'capture_already_exists')
        out.write_text(json.dumps({'tree': t, 'sockets': s})); out.chmod(0o600)
        if action == 'before':
            import socket_observation_contract
            observation, policy = socket_observation('preflight')
            control = matching[0]['pm2_env'].get('RE7_FRONT_CONTROL')
            require(type(control) is str and control, 'source_control_missing')
            source_run, _ = supervision_live(Path(control), matching[0])
            require(source_run['nonce'] == policy['roles']['source']['nonce'] and
                    source_run['release'] == policy['roles']['source']['release'] and
                    source_run['entry'] == policy['roles']['source']['entry'], 'source_observer_binding')
            socket_observation_contract.preflight(observation, policy, out)
    elif action in ['exited', 'candidate-exited', 'return-exited']:
        if action in ['candidate-exited','return-exited']:
            tracked_absent(action.removesuffix('-exited')); print(action+':PASS');return
        capture = json.loads((CANDIDATE_ROOT / 'source-tree.private.json').read_text())
        for q in capture['tree']:
            require(not Path(f'/proc/{q["pid"]}').exists(), 'survivor_or_pid_reused')
        ns, listening = net()
        require(not listening, 'frontend_listener_survived')
        socket_absence('source', capture['tree'], CANDIDATE_ROOT/'source-tree.private.json')
        require(not any(r['name'] == FRONT and r['pid'] for r in rs), 'pm2_frontend_alive')
    elif action in ['candidate', 'return']:
        tracked_live(action)
    else:
        raise RuntimeError('unknown_gate')
    print(action + ':PASS')

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--binding',required=True,type=Path)
    parser.add_argument('--binding-sha256',required=True)
    parser.add_argument('--fixture-surface',type=Path)
    parser.add_argument('action')
    parser.add_argument('actionArgs',nargs='*')
    args=parser.parse_args()
    configure(args.binding,args.binding_sha256,args.fixture_surface)
    if args.action=='supervision-preflight':
        require(len(args.actionArgs)==2,'supervision_preflight_args')
        print(json.dumps(supervision_preflight(args.actionArgs[0],int(args.actionArgs[1]))))
    else:
        require(not args.actionArgs,'unexpected_action_args')
        main(args.action)
