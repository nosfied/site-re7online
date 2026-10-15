import copy,importlib.util,json,os,tempfile,unittest
from pathlib import Path
import record_issuance as m
class Tests(unittest.TestCase):
 def setup_folder(self,root):
  root.chmod(0o700);v={'items':[{'slot':'OPENAI_API_KEY','futureSecretCustodyFile':'key.private.txt','newCredentialCreated':False,'ownerConfirmedIssuanceContext':{'organizationId':'org-synthetic','projectId':'proj-synthetic','organizationName':'synthetic org','projectName':'synthetic renamed'}},{'slot':'other','preserved':True}],'preserved':'unchanged'}
  for n,b in [('OWNER_ACTIONS.private.json',m.encode(v)),('key.private.txt',b'synthetic-never-real-secret\n')]:m.write_once(root/n,b)
  return v
 def invoke(self,root,project='proj-synthetic',previous='proj-synthetic'):
  answers=iter(['synthetic key','key-synthetic','2026-10-15T10:00:00Z','All','org-synthetic',project,previous,'CONFIRMO']);return m.collect(root,lambda _:next(answers))
 def test_rename_preserve_and_no_secret_in_receipt(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);before=self.setup_folder(p);r=self.invoke(p);self.assertEqual(r['projectRelationship'],'SAME_ID_RENAMED');after=json.loads((p/'OWNER_ACTIONS.private.json').read_text());self.assertEqual(after['items'][1],before['items'][1]);self.assertEqual(after['preserved'],before['preserved']);self.assertNotIn('synthetic-never-real-secret',next(p.glob('OPENAI_ISSUANCE*')).read_text())
 def test_other_project_classified(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);self.setup_folder(p);self.assertEqual(self.invoke(p,previous='proj-another')['projectRelationship'],'DIFFERENT_PROJECT')
 def test_wrong_approved_project_no_writes(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);self.setup_folder(p);original=(p/'OWNER_ACTIONS.private.json').read_bytes()
   with self.assertRaisesRegex(AssertionError,'approved_organization_project_mismatch'):self.invoke(p,project='proj-wrong')
   self.assertEqual((p/'OWNER_ACTIONS.private.json').read_bytes(),original);self.assertEqual(len(list(p.iterdir())),2)
if __name__=='__main__':unittest.main()
