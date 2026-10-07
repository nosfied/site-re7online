import copy,importlib.util,time,unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import os
spec=importlib.util.spec_from_file_location('gate',Path(__file__).with_name('frontend-check.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Recovery(unittest.TestCase):
 def setUp(self):
  self.q={'pid':50,'ticks':'123','parent':10,'group':10,'state':'S'}
  self.js=[{'event':'parent','pid':100,'ticks':'140','group':99},{'event':'application_identity','pid':101,'ticks':'141','group':99}]
  rows=[{**self.q,'roles':[]},{'pid':10,'ticks':'90','parent':1,'group':10,'state':'S','roles':[]},{'pid':1,'ticks':'1','parent':0,'group':1,'state':'S','roles':[]}]
  self.o={'samples':[{'processes':copy.deepcopy(rows)},{'processes':copy.deepcopy(rows)}],'finishedMonotonic':time.monotonic()}
 def call(self):g.unreadable_identity_observed(self.q,self.js,self.o)
 def test_full_read_permits(self):self.call()
 def test_rs_allows(self):self.o['samples'][1]['processes'][0]['state']='R';self.call()
 def test_missing(self):self.o=None;self.assertRaises(RuntimeError,self.call)
 def test_one_sample(self):self.o['samples'].pop();self.assertRaises(RuntimeError,self.call)
 def test_expired(self):self.o['finishedMonotonic']-=11;self.assertRaises(RuntimeError,self.call)
 def test_pid_changed(self):self.o['samples'][1]['processes'][0]['pid']=51;self.assertRaises(RuntimeError,self.call)
 def test_ticks(self):self.o['samples'][1]['processes'][0]['ticks']='124';self.assertRaises(RuntimeError,self.call)
 def test_zombie(self):self.o['samples'][1]['processes'][0]['state']='Z';self.assertRaises(RuntimeError,self.call)
 def test_role(self):self.o['samples'][1]['processes'][0]['roles']=['candidate'];self.assertRaises(RuntimeError,self.call)
 def test_group(self):self.q['group']=99;self.assertRaises(RuntimeError,self.call)
 def test_ancestor(self):self.o['samples'][1]['processes'][1]['roles']=['candidate'];self.assertRaises(RuntimeError,self.call)
 def test_ancestor_ticks(self):self.o['samples'][1]['processes'][1]['ticks']='91';self.assertRaises(RuntimeError,self.call)
 def test_incomplete(self):self.o['samples'][0]['processes'].pop();self.assertRaises(RuntimeError,self.call)
 def test_duplicate(self):self.o['samples'][0]['processes'].append(self.o['samples'][0]['processes'][0]);self.assertRaises(RuntimeError,self.call)
 def inventory_call(self, observation):
  q=self.q
  class Unreadable:
   def read_bytes(self):raise PermissionError('synthetic proc permission')
  class Folder:
   name='50'
   def stat(self):return SimpleNamespace(st_uid=os.getuid())
   def __truediv__(self,key):return Unreadable()
  class ProcRoot:
   def iterdir(self):return [Folder()]
  with patch.object(g,'Path',return_value=ProcRoot()),patch.object(g,'proc',return_value=q):
   return g.inventory({'preExisting':{}},self.js,observation=observation)
 def test_inventory_consumes_complete_observation(self):self.assertEqual(self.inventory_call(self.o),[])
 def test_inventory_missing_observation_denies(self):self.assertRaises(RuntimeError,self.inventory_call,None)
 def test_inventory_observed_role_denies(self):
  self.o['samples'][1]['processes'][0]['roles']=['candidate'];self.assertRaises(RuntimeError,self.inventory_call,self.o)
if __name__=='__main__':unittest.main()
