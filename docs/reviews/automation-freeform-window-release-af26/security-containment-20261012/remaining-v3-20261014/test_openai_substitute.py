import json,unittest,copy
from openai_substitute import plan,sha
class Tests(unittest.TestCase):
    def setUp(self):
        self.source={'apps':[{'name':n,'env':{'OPENAI_API_KEY':'synthetic-old-secret','APP_AUTH_SECRET':'NEWauth','DATABASE_URL':'NEWDB'}}for n in ['re7-whatsapp-agent','re7-whatsapp-web-worker']]+[{'name':'re7-admin-front','env':{}}]}
        self.issue={'projectId':'synthetic-default-id','api_key':{'id':'synthetic-new-id','value':'synthetic-known-new-value'}};self.record={'projectId':'synthetic-default-id','api_key':{'id':'synthetic-new-id'},'revoked':False}
    def invoke(self):
        raw=[json.dumps(v).encode()for v in [self.source,self.issue,self.record]];p={'issuanceKind':'original-console-creation-custody',**{role:{'sha256':sha(b),'source':'synthetic-original-private'}for role,b in zip(['configuration','issuance','projectRecord'],raw)}}
        return plan(*raw,p,'synthetic-default-id')
    def test_prepare_and_return_without_old_key_id(self):
        before=copy.deepcopy(self.source);v,a,b=self.invoke();self.assertEqual(a,b);self.assertFalse(v['oldRevocationAuthorized']);self.assertEqual(a['apps'][-1],before['apps'][-1]);self.assertEqual(self.source,before)
        for x in a['apps'][:2]:self.assertEqual(x['env']['OPENAI_API_KEY'],'synthetic-known-new-value');self.assertEqual(x['env']['APP_AUTH_SECRET'],'NEWauth');self.assertEqual(x['env']['DATABASE_URL'],'NEWDB')
    def test_no_key_added_to_minimal_worker(self):
        del self.source['apps'][1]['env']['OPENAI_API_KEY'];before=copy.deepcopy(self.source['apps'][1]);v,a,b=self.invoke();self.assertEqual(v['configuredConsumers'],['re7-whatsapp-agent']);self.assertEqual(a['apps'][1],before);self.assertEqual(b['apps'][1],before)
    def test_wrong_project_denied(self):
        self.issue['projectId']='wrong'
        with self.assertRaises(ValueError):self.invoke()
    def test_wrong_id_or_revoked_denied(self):
        self.record['api_key']['id']='wrong'
        with self.assertRaises(ValueError):self.invoke()
        self.record['api_key']['id']='synthetic-new-id';self.record['revoked']=True
        with self.assertRaises(ValueError):self.invoke()
    def test_divergent_consumer_denied(self):
        self.source['apps'][1]['env']['OPENAI_API_KEY']='different-secret'
        with self.assertRaises(ValueError):self.invoke()
if __name__=='__main__':unittest.main()
