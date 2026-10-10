"""Effective environment/connection boundary; external process reads injected, no DB."""
import ast, io, os, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
source=Path(__file__).with_name('capture-readonly.py.in').read_text()
tree=ast.parse(source)
start=next(i for i,n in enumerate(tree.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='query' for t in n.targets))
end=next(i for i,n in enumerate(tree.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='result' for t in n.targets))
code=compile(ast.Module(body=tree.body[start:end+1],type_ignores=[]),'effective-capture-boundary','exec')
keys=('DATABASE_URL','CAMPAIGN_SEED_SECRET','CHANNEL_ACCOUNT_SECRET_KEY','APP_AUTH_SECRET')
class Reads:
 def __init__(self,raw):self.raw=raw
 def Path(self,*args):return SimpleNamespace(read_bytes=lambda:self.raw)
class Cases(unittest.TestCase):
 def invoke(self,live=None,pm=None):
  calls=[]
  live=live or {};pm=pm or {}
  raw=b'\0'.join((k+'='+v).encode() for k,v in live.items())
  ns={'os':os,'sys':SimpleNamespace(stdin=io.StringIO('SELECT READ ONLY')),'cwd':'/synthetic-api','api':{'pid':123,'pm2_env':pm},'pathlib':Reads(raw),'subprocess':SimpleNamespace(run=lambda *a,**kw:calls.append(kw))}
  with patch.dict(os.environ,{k:'inherited-external' for k in keys},clear=True):
   try:exec(code,ns)
   except AssertionError as e:return calls,str(e)
  return calls,None
 def test_missing_original_denies_external_url_before_connection(self):
  calls,error=self.invoke();self.assertEqual(error,'db_url_missing_no_config_fallback');self.assertEqual(calls,[])
 def test_empty_original_denies(self):self.assertEqual(self.invoke({'DATABASE_URL':''})[0],[])
 def test_live_values_only(self):
  calls,error=self.invoke({k:'original-'+k for k in keys});self.assertIsNone(error)
  self.assertEqual({k:calls[0]['env'][k] for k in keys},{k:'original-'+k for k in keys})
 def test_missing_auth_is_not_inherited(self):
  calls,error=self.invoke({'DATABASE_URL':'original-db'});self.assertIsNone(error)
  self.assertTrue(all(k not in calls[0]['env'] for k in keys[1:]))
 def test_original_pm2_configuration(self):
  calls,error=self.invoke(pm={'env':{'DATABASE_URL':'original-pm2'}});self.assertIsNone(error);self.assertEqual(calls[0]['env']['DATABASE_URL'],'original-pm2')
 def test_live_has_precedence(self):
  calls,error=self.invoke({'DATABASE_URL':'live'}, {'DATABASE_URL':'pm2'});self.assertIsNone(error);self.assertEqual(calls[0]['env']['DATABASE_URL'],'live')
if __name__=='__main__':unittest.main()
