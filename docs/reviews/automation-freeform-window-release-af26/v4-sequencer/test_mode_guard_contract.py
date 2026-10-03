"""Exercise the patched private V4 mode against synthetic persisted guard state.

Set RE7_PATCHED_MODE_DIR to a copy of one mode after applying guard-contract-v4.patch.
No application, provider, nft, cron or systemd command is started.
"""
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


MODE = os.environ.get('RE7_PATCHED_MODE_DIR')


@unittest.skipUnless(MODE, 'set RE7_PATCHED_MODE_DIR to a patched private mode')
class ModeGuardContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name in ('db_owner_set_gate', 'db_owner_set_observer'):
            sys.modules.setdefault(name, types.ModuleType(name))
        sys.path.insert(0, MODE)
        cls.ops = importlib.import_module('ops')
        cls.delegated = importlib.import_module('delegated')

    @classmethod
    def tearDownClass(cls):
        if MODE:
            sys.path.remove(MODE)
            for name in ('ops', 'delegated'):
                sys.modules.pop(name, None)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state.json'
        self.guard = {'version': 1, 'open': False, 'generation': 18,
                      'tasks': {}, 'audit': []}
        (self.root / 'plan.private.json').write_text('{"direction":"switch"}')
        (self.root / 'candidate.config.private.json').write_text('{"apps":[]}')

    def tearDown(self):
        self.tmp.cleanup()

    def system_guard(self):
        self.state.write_text(json.dumps(self.guard))
        real_path = Path
        def path(value, *args):
            if value == '/var/lib/re7/campaign-operations/state.json':
                return self.state
            return real_path(value, *args)
        with patch.object(self.ops, 'Path', side_effect=path):
            return self.ops.System().guard()

    def test_persisted_object_passes_all_mode_gates(self):
        observed = self.system_guard()
        self.assertEqual(observed['tasks'], {})
        operation = types.SimpleNamespace(d=types.SimpleNamespace(guard=lambda: observed))
        self.assertEqual(self.ops.Operations.guard(operation), observed)
        binding = self.delegated.bindings(self.root, 'preflight', observed)
        self.assertEqual(binding['guardGeneration'], 18)

    def test_invalid_or_active_guard_denies_all_mode_gates(self):
        cases = ({'tasks': {'job': {}}}, {'tasks': None}, {'tasks': False},
                 {'tasks': ''}, {'tasks': []}, {'open': True},
                 {'version': False}, {'generation': False}, {'audit': None})
        for change in cases:
            with self.subTest(change=change):
                self.guard.update(change)
                with self.assertRaises(RuntimeError):
                    self.ops.Operations.guard(types.SimpleNamespace(
                        d=types.SimpleNamespace(guard=lambda: self.guard)))
                if change != {'tasks': {'job': {}}} and change != {'open': True}:
                    with self.assertRaises(RuntimeError):
                        self.system_guard()
                    with self.assertRaises(RuntimeError):
                        self.delegated.bindings(self.root, 'preflight', self.guard)
                self.guard = {'version': 1, 'open': False, 'generation': 18,
                              'tasks': {}, 'audit': []}
        del self.guard['tasks']
        with self.assertRaises(RuntimeError):
            self.system_guard()
        with self.assertRaises(RuntimeError):
            self.delegated.bindings(self.root, 'preflight', self.guard)


if __name__ == '__main__':
    unittest.main()
