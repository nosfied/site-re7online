import importlib.util,unittest,copy
from pathlib import Path
S=importlib.util.spec_from_file_location('cert',Path(__file__).with_name('verify-result.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class Certificate(unittest.TestCase):
 def setUp(self):self.plan={'entries':[{'path':'/nonexistent/re7-local-proof-a'},{'path':'/nonexistent/re7-local-proof-b'}],'requiredPostFreeBytes':10};self.r={'result':'WITHDRAWAL_COMPLETE','planSha256':'expected','removedCount':2,'finishedAt':10};self.j=[{'path':q['path']}for q in self.plan['entries']];self.p={'result':'POST_READ_COMPLETE','remainingEntries':0,'nonDirectoryMetadataDrift':0,'receiptExists':True,'capacityPass':True,'minimumAvailableBytes':11,'observation':{'at':11,'owners':[],'incomplete':[]}}
 def run_verify(self):return m.verify(self.plan,'expected',self.r,self.j,self.p)
 def test_exact_pass(self):self.assertEqual(self.run_verify()['result'],'THIRD_WITHDRAWAL_CERTIFIED')
 def test_wrong_hash(self):
  self.r['planSha256']='other'
  with self.assertRaises(AssertionError):self.run_verify()
 def test_duplicate_journal(self):
  self.j[1]=self.j[0]
  with self.assertRaises(AssertionError):self.run_verify()
 def test_partial_receipt(self):
  self.r['result']='PARTIAL'
  with self.assertRaises(AssertionError):self.run_verify()
 def test_old_post(self):
  self.p['observation']['at']=9
  with self.assertRaises(AssertionError):self.run_verify()
 def test_owner(self):
  self.p['observation']['owners']=[{'pid':1}]
  with self.assertRaises(AssertionError):self.run_verify()
 def test_incomplete(self):
  self.p['observation']['incomplete']=[{'errno':13}]
  with self.assertRaises(AssertionError):self.run_verify()
if __name__=='__main__':unittest.main()
