import copy,datetime,hashlib,importlib.util,json,os,unittest
from pathlib import Path
import prepare_restricted as m
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=Path(os.environ['ATTESTED_OPENAI_PROFILE']).read_bytes();assert m.sha(cls.raw)==m.SOURCE_SHA
  p=Path(__file__).parent.parent/'remaining-v3-20261014/openai_substitute.py';spec=importlib.util.spec_from_file_location('canonical',p);cls.adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.adapter)
 def setUp(self):
  self.key=b'synthetic-new-key-not-real\n';self.owner={'items':[{'slot':'OPENAI_API_KEY','ownerConfirmedIssuanceContext':{'organizationId':'org-synthetic','projectId':'proj-synthetic'},'confirmedNewIssuance':{'organizationId':'org-synthetic','projectId':'proj-synthetic','previousDefaultProjectId':'proj-synthetic','projectRelationship':'SAME_ID_RENAMED','permissions':'All','custodiedFileSha256':m.sha(self.key),'keyId':'key-synthetic','createdUtc':'2026-10-15T10:00:00+00:00','recordCheckedUtc':'2026-10-15T11:00:00+00:00','originalCreationCopyAttestedByOwner':True}}]}
 def invoke(self):return m.prepare(self.raw,self.owner,self.key,self.adapter)
 def test_concrete_full_profile_only_one_variable(self):
  p,a,b=self.invoke();self.assertTrue(a==b,'post-activation return mismatch');self.assertTrue(p['protectedAllOtherFields']);self.assertEqual(p['configuredConsumers'],[m.API]);restored=copy.deepcopy(a);old=json.loads(self.raw);next(x for x in restored['apps']if x['name']==m.API)['env']['OPENAI_API_KEY']=next(x for x in old['apps']if x['name']==m.API)['env']['OPENAI_API_KEY'];self.assertTrue(restored==old,'unrelated configuration changed')
 def test_project_mismatch_denied(self):
  self.owner['items'][0]['confirmedNewIssuance']['projectId']='proj-wrong'
  with self.assertRaisesRegex(AssertionError,'approved_project_mismatch'):self.invoke()
 def test_new_project_requires_review(self):
  self.owner['items'][0]['confirmedNewIssuance']['previousDefaultProjectId']='proj-other'
  with self.assertRaisesRegex(AssertionError,'project_change_requires'):self.invoke()
 def test_value_or_permissions_drift_denied(self):
  self.key=b'synthetic-other-key\n'
  with self.assertRaisesRegex(AssertionError,'registered_value_changed'):self.invoke()
  self.setUp();self.owner['items'][0]['confirmedNewIssuance']['permissions']='Restricted'
  with self.assertRaisesRegex(AssertionError,'changed_permissions_require'):self.invoke()
 def test_original_copy_and_source_required(self):
  self.owner['items'][0]['confirmedNewIssuance']['originalCreationCopyAttestedByOwner']=False
  with self.assertRaisesRegex(AssertionError,'original_value_provenance_missing'):self.invoke()
  with self.assertRaisesRegex(AssertionError,'attested_source_profile_drift'):m.prepare(self.raw+b' ',self.owner,self.key,self.adapter)
 def test_date_only_no_invented_timestamp(self):
  r=self.owner['items'][0]['confirmedNewIssuance'];r.update(createdUtc=None,createdDate='2026-10-15',creationTimezone=None,creationPrecision='date_only');self.invoke()
  r['createdUtc']='2026-10-15T00:00:00Z'
  with self.assertRaisesRegex(AssertionError,'invented_issuance_time'):self.invoke()
if __name__=='__main__':unittest.main()
