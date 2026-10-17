"""Private byte-exact diagnostics for the fixed control/observer sudo calls.
Runs as deploy; never installed/imported by the root helper.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

CONTROL = '/usr/local/libexec/re7/incident-6683-window-control.py'
OBSERVER = '/usr/local/libexec/re7/db-owner-set-observer.py'
ACTIONS = {'inspect', 'check-absent', 'check-present', 'enter', 'unfence',
           'restore-controls', 'abort-prestop', 'authorize-switch', 'authorize-return', 'inspect-recovery-authority'}

def require(ok, code):
    if not ok:
        raise RuntimeError(code)

def private_record(window, name, record):
    path = Path(window) / name
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
                'private_output_permissions')
        data = (json.dumps(record, sort_keys=True) + '\n').encode()
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def run_privileged(args, window, action, *, env=None, timeout=None):
    expected = ['sudo', '-n', '/usr/bin/python3', '-I', '-S']
    require((action in ACTIONS and args == expected + [CONTROL, action]) or
            (action == 'db-owner-observe' and args == expected + [OBSERVER]),
            'privileged_command_denied')
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                check=False, env=env, timeout=timeout)
        stdout, stderr, code = result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        stdout, stderr, code = error.stdout or b'', error.stderr or b'', None
    except OSError as error:
        stdout, stderr, code = b'', str(error).encode(), None
    # Full byte streams remain private, including success stderr. The public
    # journal contains only sizes, hashes, exit code and allowlisted reasons.
    reason = None
    match = re.search(rb'RuntimeError: ([a-z][a-z0-9_]+)\s*$', stderr)
    if match and match.group(1).decode() in {
            'worker_capture_sockets_drift', 'worker_capture_fd_changed',
            'worker_capture_tree_drift', 'worker_capture_identity_drift'}:
        reason = match.group(1).decode()
    summary = {'utc': time.time(), 'event': 'privileged_result', 'action': action,
               'exitCode': code, 'stdoutBytes': len(stdout), 'stderrBytes': len(stderr),
               'stdoutSha256': hashlib.sha256(stdout).hexdigest(),
               'stderrSha256': hashlib.sha256(stderr).hexdigest(), 'reason': reason}
    private_record(window, 'privileged-output.private.jsonl', {
        **summary, 'stdoutBase64': base64.b64encode(stdout).decode(),
        'stderrBase64': base64.b64encode(stderr).decode()})
    private_record(window, 'sequencer.journal.jsonl', summary)
    if code != 0:
        raise RuntimeError('privileged_failed:' + action + ':exit=' + str(code) +
                           (':' + reason if reason else '')) from None
    return stdout
