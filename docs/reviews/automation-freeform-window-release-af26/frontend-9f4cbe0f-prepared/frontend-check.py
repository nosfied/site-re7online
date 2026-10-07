"""Read-only frontend gates; capture writes only private evidence, never PM2 control."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

P = Path('/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z')
FRONT = 're7-admin-front'
TARGET = '/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front'
PM = '/home/deploy/.npm-global/bin/pm2'

def require(value, code):
    if not value:
        raise RuntimeError(code)

def proc(pid, require_alive=True):
    text = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    if require_alive:
        require(text[0] not in ['Z', 'X', 'x'], 'dead_process')
    return {'pid': pid, 'ticks': text[19], 'parent': int(text[1]), 'state': text[0]}

def rows():
    return json.loads(subprocess.check_output([PM, 'jlist'], env={**os.environ, 'PATH': '/usr/bin:/bin:' + os.environ.get('PATH', '')}))

def same(expected, row):
    e = row['pm2_env']
    require(row['pid'] == expected['pid'], 'pid_drift:' + expected['name'])
    require(proc(row['pid'])['ticks'] == expected['startTicks'], 'ticks_drift:' + expected['name'])
    for key in ['status', 'pm_cwd', 'pm_exec_path', 'exec_interpreter', 'restart_time', 'exec_mode']:
        require(e.get(key) == expected[key], 'process_field:' + key)

def core(v, rs):
    daemon = json.loads((P / 'daemon.private.json').read_text())
    require(int(Path('/home/deploy/.pm2/pm2.pid').read_text()) == daemon['pid'], 'daemon_pid')
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
            if int(f[1].split(':')[-1], 16) == 3000 and f[3] == '0A': listener = True
    for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
        result.add(line.split()[6])
    return result, listener

v = json.loads((P / 'runtime.private.json').read_text())
# Never let a diagnostic PM2 CLI bootstrap an absent daemon.
d = json.loads((P / 'daemon.private.json').read_text())
require(int(Path('/home/deploy/.pm2/pm2.pid').read_text()) == d['pid'], 'daemon_pid')
require(proc(d['pid'])['ticks'] == d['ticks'], 'daemon_ticks')
rs = rows(); core(v, rs)
action = sys.argv[1]
if action in ['before', 'capture-current']:
    matching = [r for r in rs if r['name'] == FRONT]; require(len(matching) == 1, 'frontend_duplicate_or_missing')
    if action == 'before':
        expected = next(x for x in v['processes'] if x['name'] == FRONT); same(expected, matching[0])
    else:
        require(matching[0]['pm2_env']['pm_cwd'] == TARGET, 'capture_wrong_release')
    t = tree(matching[0]['pid']); s = sockets(t)
    out = P / ('source-tree.private.json' if action == 'before' else 'candidate-tree.private.json')
    require(not out.exists(), 'capture_already_exists')
    out.write_text(json.dumps({'tree': t, 'sockets': s})); out.chmod(0o600)
elif action in ['exited', 'candidate-exited']:
    capture = json.loads((P / ('source-tree.private.json' if action == 'exited' else 'candidate-tree.private.json')).read_text())
    for q in capture['tree']:
        require(not Path(f'/proc/{q["pid"]}').exists(), 'survivor_or_pid_reused')
    ns, listening = net()
    require(not listening, 'frontend_listener_survived')
    require(not ns.intersection(capture['sockets']), 'frontend_socket_survived')
    require(not any(r['name'] == FRONT and r['pid'] for r in rs), 'pm2_frontend_alive')
elif action in ['candidate', 'return']:
    matching = [r for r in rs if r['name'] == FRONT]; require(len(matching) == 1, 'frontend_duplicate_or_missing')
    e = matching[0]['pm2_env']; expected = TARGET if action == 'candidate' else next(x['pm_cwd'] for x in v['processes'] if x['name'] == FRONT)
    require(e['pm_cwd'] == expected and e['pm_exec_path'] == expected + '/node_modules/next/dist/bin/next', 'frontend_release')
    require(e['status'] == 'online' and e['restart_time'] == 0 and e.get('watch') is False, 'frontend_health_identity')
    proc(matching[0]['pid'])
    require(Path(expected, '.next/BUILD_ID').read_text().strip() == ('LFcdEK9gXZsBhf4_c5r8G' if action == 'candidate' else v['buildId']), 'frontend_build_id')
else:
    raise RuntimeError('unknown_gate')
print(action + ':PASS')
