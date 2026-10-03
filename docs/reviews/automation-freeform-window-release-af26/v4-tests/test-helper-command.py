"""Focused checks for the fixed privileged command; no sudo is executed."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(os.environ['AF26_V4_PACKAGE']).resolve() / 'switch'))
import ops


class FakePart:
    def __init__(self, name, mode):
        self.name = name
        self.mode = mode
        self.parents = ()

    def __str__(self):
        return self.name

    def is_file(self):
        return stat.S_ISREG(self.mode)

    def is_symlink(self):
        return stat.S_ISLNK(self.mode)

    def lstat(self):
        return type('Stat', (), {'st_uid': 0, 'st_mode': self.mode})()

    def read_bytes(self):
        return b'fixed-observer'


class HelperCommand(unittest.TestCase):
    def parts(self, parent_mode=stat.S_IFDIR | 0o755):
        file = FakePart('/usr/local/libexec/re7/db-owner-set-observer.py',
                        stat.S_IFREG | 0o644)
        file.parents = (FakePart('/usr/local/libexec/re7', parent_mode),
                        FakePart('/usr/local/libexec', stat.S_IFDIR | 0o755),
                        FakePart('/usr/local', stat.S_IFDIR | 0o755),
                        FakePart('/usr', stat.S_IFDIR | 0o755),
                        FakePart('/', stat.S_IFDIR | 0o755))
        return file

    def test_fixed_isolated_python_invocation(self):
        file = self.parts()
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        with patch.object(ops, 'Path', return_value=file), \
             patch.object(ops.subprocess, 'check_output', return_value='{}') as call:
            self.assertEqual(ops.System().proxy_socket_inventory(digest), {})
        self.assertEqual(call.call_args.args[0],
                         ['sudo', '-n', '/usr/bin/python3', '-I', '-S', str(file)])

    def test_symlinked_or_writable_parent_denies_before_sudo(self):
        digest = hashlib.sha256(b'fixed-observer').hexdigest()
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFDIR | 0o775):
            with self.subTest(mode=mode), patch.object(ops, 'Path', return_value=self.parts(mode)), \
                 patch.object(ops.subprocess, 'check_output') as call:
                with self.assertRaisesRegex(RuntimeError, 'proxy_observer_not_root_owned'):
                    ops.System().proxy_socket_inventory(digest)
                call.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
