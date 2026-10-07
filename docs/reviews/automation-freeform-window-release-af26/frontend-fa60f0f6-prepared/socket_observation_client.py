"""Proposed fixed observation client. Every gate reads afresh; no cached certificate.

Missing binding/helper/sudo privilege denies preflight before any stop. Reader
injection is a direct Python testing argument, not an environment/CLI switch.
"""
import json
from pathlib import Path
import secrets
import subprocess
import time

COMMAND = ['sudo', '-n', '/usr/bin/python3', '-I', '-S', '/usr/local/libexec/re7/frontend-socket-observer.py']


def read(root, stage, reader=None):
    binding = json.loads((Path(root)/'socket-observer-binding.private.json').read_text())
    if set(binding) != {'policy', 'policySha256', 'helperSha256'}:
        raise RuntimeError('socket_observer_binding_schema')
    folder = Path(root)/'socket-observation-output-private';folder.mkdir(mode=0o700,exist_ok=True)
    out = folder/(stage+'-'+secrets.token_hex(16)+'.json')
    started = time.monotonic();record = {'stage':stage,'stdout':'','stderr':'','exitCode':None,'timeout':False}
    try:
        if reader is None:
            result = subprocess.run(COMMAND,text=True,capture_output=True,timeout=10)
            record.update(stdout=result.stdout,stderr=result.stderr,exitCode=result.returncode)
        else:
            # Same root observer/syscalls in the private lab namespace, no classifier stub.
            record.update(stdout=json.dumps(reader(binding['policy'])),exitCode=0)
    except subprocess.TimeoutExpired as error:
        record.update(stdout=str(error.stdout or ''),stderr=str(error.stderr or ''),timeout=True)
    except Exception as error:
        record['stderr']=str(error)
    finally:
        out.write_text(json.dumps(record));out.chmod(0o600)
    finished = time.monotonic()
    if record['exitCode'] != 0 or record['timeout']:
        raise RuntimeError('socket_observer_read_denied:'+out.name)
    value = json.loads(record['stdout'])
    if value.get('policySha256') != binding['policySha256'] or value.get('helperSha256') != binding['helperSha256']:
        raise RuntimeError('socket_observer_integrity_binding')
    if not (started <= value['startedMonotonic'] <= value['finishedMonotonic'] <= finished and finished-started <= 10):
        raise RuntimeError('socket_observer_stale_or_timeout')
    if value.get('bootId') != binding['policy']['bootId'] or len(value.get('samples',[])) != 2:
        raise RuntimeError('socket_observer_response_binding')
    observation_id = value.get('observationId')
    if type(observation_id) is not str or len(observation_id) != 64 or any(x not in '0123456789abcdef' for x in observation_id):
        raise RuntimeError('socket_observer_receipt_schema')
    # A duplicate response is a denial; receipts never authorize a later read/start.
    receipt = folder/(observation_id+'.receipt')
    with receipt.open('x') as file:file.write(stage+'\n')
    receipt.chmod(0o600)
    return value, binding['policy']
