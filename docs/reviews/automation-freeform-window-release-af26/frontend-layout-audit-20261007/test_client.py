"""Injected subprocess test: literal reader, neutral cwd, private diagnostics.
Not a sudo installation or OS permission test.
Usage: python3 test_client.py PATCHED_CLIENT
"""
import importlib.util,json,secrets,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('client',sys.argv[1]);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);sys.argv=sys.argv[:1]
class Client(unittest.TestCase):
 def test_fixed_command_and_neutral_directory(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);binding={'policy':{'bootId':'fixture'},'policySha256':'fixed-policy','helperSha256':'fixed-helper'};(p/'socket-observer-binding.private.json').write_text(json.dumps(binding))
   def result(command,**kw):
    self.assertEqual(command,c.COMMAND);self.assertEqual(kw,{'text':True,'capture_output':True,'timeout':10,'cwd':'/'})
    now=time.monotonic();return SimpleNamespace(returncode=0,stderr='',stdout=json.dumps({'policySha256':'fixed-policy','helperSha256':'fixed-helper','bootId':'fixture','samples':[{},{}],'observationId':secrets.token_hex(32),'startedMonotonic':now,'finishedMonotonic':now}))
   with patch.object(c.subprocess,'run',side_effect=result):c.read(p,'supervision')
   files=list((p/'socket-observation-output-private').glob('supervision-*.json'));self.assertEqual(len(files),1);self.assertEqual(files[0].stat().st_mode&0o777,0o600)
 def test_failure_retains_private_diagnostic(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'socket-observer-binding.private.json').write_text(json.dumps({'policy':{},'policySha256':'fixed-policy','helperSha256':'fixed-helper'}))
   with patch.object(c.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='fixture stdout',stderr='fixture denial')):
    with self.assertRaisesRegex(RuntimeError,'socket_observer_read_denied'):c.read(p,'supervision')
   v=json.loads(next((p/'socket-observation-output-private').glob('supervision-*.json')).read_text());self.assertEqual((v['exitCode'],v['stdout'],v['stderr']),(1,'fixture stdout','fixture denial'))
unittest.main()
