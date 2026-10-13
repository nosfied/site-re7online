import importlib.util,unittest,ast
from pathlib import Path
from unittest.mock import patch
P=Path(__file__).parent
spec=importlib.util.spec_from_file_location('capture',P/'capture-pm2-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Context(unittest.TestCase):
 def test_root_denied_before_any_pm2_or_file_write(self):
  with patch.object(m.os,'geteuid',return_value=0),patch.object(m.subprocess,'run')as call,patch.object(m.os,'open')as write:
   with self.assertRaisesRegex(AssertionError,'deploy_only'):m.main()
   call.assert_not_called();write.assert_not_called()
 def test_preparer_has_no_pm2_calls(self):
  tree=ast.parse((P/'prepare-input.py').read_text())
  calls=[n for n in ast.walk(tree)if isinstance(n,ast.Call)]
  self.assertFalse(any(isinstance(n.func,ast.Attribute)and n.func.attr in ['apps','app_matches']for n in calls))
 def test_snapshot_collector_has_explicit_deploy_context(self):
  tree=ast.parse((P/'capture-pm2-deploy.py').read_text());dicts=[n for n in ast.walk(tree)if isinstance(n,ast.Dict)]
  clean=next(ast.literal_eval(n)for n in dicts if all(isinstance(x,ast.Constant)for x in n.values)and any(isinstance(k,ast.Constant)and k.value=='PM2_HOME'for k in n.keys))
  self.assertEqual(clean['HOME'],'/home/deploy');self.assertEqual(clean['PM2_HOME'],'/home/deploy/.pm2')
if __name__=='__main__':unittest.main()
