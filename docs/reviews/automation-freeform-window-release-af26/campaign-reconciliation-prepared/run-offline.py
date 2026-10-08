"""Fixed-preparation offline CLI. Never starts API, scheduler or provider."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=('dry-run', 'verify-receipt', 'apply-sql', 'ack-task'), default='dry-run')
parser.add_argument('--plan-hash')
parser.add_argument('--task-hash')
parser.add_argument('--actor')
args = parser.parse_args()
manifest = json.loads((root / 'candidate-manifest.private.json').read_text())
app = Path(manifest['candidateApp'])
cli = app / 'scripts/reconcile-campaign-accepted-failure.mjs'
assert hashlib.sha256(cli.read_bytes()).hexdigest() == manifest['cliSha256'], 'offline_cli_integrity_drift'
for entry in manifest['overlayFiles']:
    path = app / entry['compiled'].split('apps/whatsapp-agent/', 1)[1]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['compiledSha256'], 'offline_compiled_integrity_drift'
config = json.loads((root / 'source.config.private.json').read_text())
source = next(a for a in config['apps'] if a['name'] == 're7-whatsapp-agent')
environment = {**os.environ, **{k: str(v) for k, v in source.items() if isinstance(v, (str, int, float))}}
environment['CAMPAIGN_RECOVERY_ONLY'] = 'true'
command = [manifest['node'], str(cli), '--bindings=' + str(root / 'reconciliation-bindings.private.json'), '--mode=' + args.mode]
if args.mode in ('apply-sql', 'ack-task'):
    gates = json.loads((root / 'execution-gates.private.json').read_text())
    assert gates['reconciliationAuthorized'] is True, 'reconciliation_gate_not_authorized'
    command.append('--execute-authorized')
for name in ('plan_hash', 'task_hash', 'actor'):
    value = getattr(args, name)
    if value is not None:
        command.append('--' + name.replace('_', '-') + '=' + value)
result = subprocess.run(command, cwd=app, env=environment, capture_output=True, text=True, timeout=30)
record = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mode': args.mode,
          'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr,
          'bindingsSha256': hashlib.sha256((root / 'reconciliation-bindings.private.json').read_bytes()).hexdigest()}
path = root / ('offline-' + args.mode + '-' + uuid.uuid4().hex + '.private.json')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(record, stream)
print(result.stdout, end='')
print('privateRecord=' + path.name)
if result.returncode:
    print('offline_failed; preserve private stderr; no retry of submission')
raise SystemExit(result.returncode)
