"""Render the literal no-password sudoers entries for owner review."""
import hashlib
import os
from pathlib import Path
import sys

HELPER = '/usr/local/libexec/re7/incident-6683-window-control.py'
ACTIONS = ('inspect', 'check-absent', 'check-present', 'enter',
           'authorize-switch', 'authorize-return', 'unfence',
           'restore-controls', 'abort-prestop')


def render():
    return ''.join('deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S '
                   + HELPER + ' ' + action + '\n' for action in ACTIONS)


def main(argv):
    if len(argv) != 2:
        raise SystemExit('output_path_required')
    path = Path(argv[1])
    os.umask(0o077)
    with path.open('x') as stream:
        stream.write(render())
        stream.flush()
        os.fsync(stream.fileno())
    print(hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == '__main__':
    main(sys.argv)
