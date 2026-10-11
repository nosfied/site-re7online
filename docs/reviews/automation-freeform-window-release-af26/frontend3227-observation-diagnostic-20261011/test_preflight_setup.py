"""Reproduce the installed composition's missing parent before any observation.
No production call or change to the prepared/installed bytes.
"""
import importlib.util
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'frontend-fa60f0f6-prepared'))
import tempfile
import unittest
from unittest.mock import patch

source=Path(__file__).parents[1]/'frontend-socket-observation-proposal'/'preflight.py'
spec=importlib.util.spec_from_file_location('existing_preflight',source)
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class PreflightSetup(unittest.TestCase):
    def test_fresh_generation_missing_receipts_parent_denies_before_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(p,'attempt') as attempt:
                with self.assertRaises(FileNotFoundError):
                    p.run(None,root,{}, {})
                attempt.assert_not_called()
            self.assertFalse((root/'receipts-private').exists())

if __name__=='__main__':unittest.main()
