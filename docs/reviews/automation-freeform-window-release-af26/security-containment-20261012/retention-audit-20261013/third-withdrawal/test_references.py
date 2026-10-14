import importlib.util,json,unittest
from pathlib import Path
S=importlib.util.spec_from_file_location('refs',Path(__file__).with_name('references.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class References(unittest.TestCase):
 def setUp(self):self.p='/opt/re7online/backups/converta-persistent/preparations/current/window/policy.json';self.a='/opt/re7online/backups/converta-persistent/preparations/old/window/content.private.tar.gz';self.b='/opt/re7online/backups/converta-persistent/preparations/current/window/content.private.tar.gz';self.nodes={self.a,self.b}
 def test_namespace_not_dependency(self):self.assertEqual(m.edges(self.p,"assert root.parent == Path('/opt/re7online/backups/converta-persistent/preparations')",self.nodes)['targets'],[])
 def test_explicit_file_binding(self):self.assertEqual(m.edges(self.p,json.dumps({'archivePath':self.a}),self.nodes)['targets'],[self.a])
 def test_directory_binding_expands_only_bound_generation(self):self.assertEqual(m.edges(self.p,json.dumps({'preparation':'/opt/re7online/backups/converta-persistent/preparations/current'}),self.nodes)['targets'],[self.b])
 def test_manifest_relative(self):self.assertEqual(m.edges(self.p,'a'*64+'  content.private.tar.gz',self.nodes)['targets'],[self.b])
 def test_generic_name_not_all_copies(self):
  r=m.edges(self.p,"name='content.private.tar.gz'",self.nodes);self.assertEqual(r['targets'],[]);self.assertEqual(r['genericNames'],['content.private.tar.gz'])
 def test_relative_json_binding(self):self.assertEqual(m.edges(self.p,json.dumps({'file':'content.private.tar.gz'}),self.nodes)['targets'],[self.b])
 def test_symlink_directory_dependency(self):self.assertEqual(m.edges(self.p,'',self.nodes,link='/opt/re7online/backups/converta-persistent/preparations/old')['targets'],[self.a])
if __name__=='__main__':unittest.main()
