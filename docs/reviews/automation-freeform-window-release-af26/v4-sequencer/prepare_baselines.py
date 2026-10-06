"""Capture new baselines only; no guard, crontab, process, network policy mutation.

Uses the existing read-only SQL and private connection/observer bindings.
Refuses populated files, consumed attempts, false observations or enabled gates.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
from baseline_contract import capture_operational, capture_functional, require, validate_preparation


def write_baselines(root, initial, functional):
    from baseline_contract import operational, functional as valid_functional
    root = Path(root)
    operational(initial);valid_functional(functional)
    modes = ('switch', 'return', 'return-partial')
    paths = [root/'window/initial.private.json']+[root/m/'baseline.private.json'for m in modes]
    require(all(not p.exists() and not p.is_symlink() for p in paths), 'baseline_output_exists')
    gates=json.loads((root/'window/execution-gates.private.json').read_text())
    require(set(gates)=={'ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved'} and
            all(v is False for v in gates.values()), 'baseline_execution_gates_not_false')
    require(not any(list((root/m).glob(pattern)) for m in modes for pattern in
                    ('owner-*','start-intent-*','started-*','old-exit-*')), 'baseline_attempt_consumed')
    for mode in modes:
        for variant in ('candidate','return'):
            apps=json.loads((root/mode/(variant+'.config.private.json')).read_text())['apps']
            front=[a for a in apps if a['name']=='re7-admin-front']
            require(len(front)==1 and (Path(front[0]['cwd'])/'.next/BUILD_ID').read_text().strip()==functional['frontendBuild'],
                    'baseline_frontend_drift:'+mode)
    # All observations/consumer contracts validated before writing any output.
    for path, value in zip(paths,[initial]+[functional]*3):
        with path.open('x') as stream:
            os.chmod(path,0o600);json.dump(value,stream,sort_keys=True,separators=(',',':'));stream.write('\n')
    validate_preparation(root)
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths}


def main(root):
    root=Path(root).resolve()
    require(root.parent==Path('/opt/re7online/backups/converta-persistent/preparations') and
            root.name.startswith('incident-6683-v4-'), 'baseline_root_denied')
    guard=lambda:json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text())
    run=lambda args:subprocess.check_output(args,text=True,timeout=15)
    initial=capture_operational(guard,run)
    require(initial['guard']['open'], 'baseline_guard_not_open')
    apps=json.loads((root/'switch/return.config.private.json').read_text())['apps']
    api=next(a for a in apps if a['name']=='re7-whatsapp-agent')
    front=next(a for a in apps if a['name']=='re7-admin-front')
    binding=json.loads((root/'window/db-owner-bindings.private.json').read_text())
    parsed=urllib.parse.urlparse(api['env']['DATABASE_URL'])
    match=re.search(r'sql: `(.+?)`',(root/'switch/preparation-bindings.cjs').read_text(),re.S)
    require(match is not None and parsed.username and parsed.path.lstrip('/'), 'baseline_query_missing')
    sql="BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; "+match.group(1)+'; ROLLBACK;'
    counts=json.loads(run(['docker','exec',binding['containerId'],'psql','-X','-U',urllib.parse.unquote(parsed.username),
                          '-d',parsed.path.lstrip('/'),'-Atq','-v','ON_ERROR_STOP=1','-c',sql]).strip())
    require(all(type(counts.get(k))is int and counts[k]==0 for k in ('jobs','groups','leases','sendingScheduled')),
            'baseline_pending_work')
    functional=capture_functional(counts,front['cwd'])
    # Guard/systemd may change while SQL runs; reject rather than certify an incomplete sample.
    second=capture_operational(guard,run)
    require(all(initial[k]==second[k] for k in ('guard','supervision','observedGuardOpen')), 'baseline_observation_changed:controls')
    print(json.dumps({'status':'BASELINES_CAPTURED_GATES_FALSE','sha256':write_baselines(root,initial,functional)}))


if __name__=='__main__':
    os.umask(0o077);require(len(sys.argv)==2,'baseline_exact_argument_required');main(sys.argv[1])
