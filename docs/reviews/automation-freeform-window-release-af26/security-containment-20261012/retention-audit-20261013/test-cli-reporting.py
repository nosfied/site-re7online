"""Reproduce reporting only using the exact published CLI AST.
No production, SSH, provider, or withdrawal execution. The runner output is
synthetic; the CLI/receipt writer are real. Existing withdrawal proofs retained.
"""
import ast,hashlib,importlib.util,json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
SOURCE=pathlib.Path(__file__).with_name('withdraw-reviewed.py')
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='0f85b527c819a24663913855a402319e9eca647fcd1b638bdcb0213abda27c01'
spec=importlib.util.spec_from_file_location('reviewed',SOURCE)
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
main=ast.parse(SOURCE.read_text()).body[-1]
code=compile(ast.Module(body=[main],type_ignores=[]),str(SOURCE),'exec')
class Reporting(unittest.TestCase):
 def invoke(self,folder,result,apply=False):
  p=folder/'input.json';p.write_text('{}');h=hashlib.sha256(p.read_bytes()).hexdigest()
  argv=[str(SOURCE),'--plan',str(p),'--plan-sha256',h]+(['--owner-authorized-apply']if apply else[])
  ns=dict(vars(w),__name__='__main__',run=lambda *args:result)
  with patch.object(sys,'argv',argv),patch('builtins.print'):
   with self.assertRaises(SystemExit)as exit:exec(code,ns)
  return exit.exception.code
 def test_dry_pass_durable_before_reporting_failure(self):
  with tempfile.TemporaryDirectory()as d:
   p=pathlib.Path(d);p.chmod(0o700)
   r={'result':'DRY_RUN_PASS','removed':False,'observations':[{'owners':[],'incomplete':[]}]*2}
   self.assertEqual(self.invoke(p,r),1)
   self.assertEqual(json.loads((p/'dry-run.private.json').read_text()),r)
   self.assertEqual(json.loads((p/'denial.private.json').read_text())['errorClass'],'TypeError')
   self.assertFalse((p/'withdrawal.intent.private.json').exists())
 def test_apply_list_report_has_no_type_error(self):
  with tempfile.TemporaryDirectory()as d:
   p=pathlib.Path(d);p.chmod(0o700);r={'result':'WITHDRAWAL_COMPLETE','removed':['synthetic']}
   self.assertEqual(self.invoke(p,r,True),0)
   self.assertEqual(json.loads((p/'apply-result.private.json').read_text()),r)
   self.assertFalse((p/'denial.private.json').exists())
if __name__=='__main__':unittest.main()
