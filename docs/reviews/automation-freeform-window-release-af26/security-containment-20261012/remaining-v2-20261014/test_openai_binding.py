import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
from openai_binding import verify
from openai_readonly_challenge import run

class Binding(unittest.TestCase):
    def test_metadata_does_not_replace_full_original_issuance(self):
        source={'issuanceKind':'original-console-creation-custody',**{r:{'sha256':'a'*64,'source':'synthetic-original'}for r in ['configuration','issuance','projectRecord']}}
        issuance={'projectId':'synthetic-project','api_key':{'id':'synthetic-key','value':'synthetic-full-value'}}
        record={'projectId':'synthetic-project','api_key':{'id':'synthetic-key'},'revoked':False}
        self.assertIn('PASS',verify('synthetic-full-value',issuance,record,source)['result'])
        for bad in ['suffix','other-full-value']:
            with self.assertRaises(ValueError):verify(bad,issuance,record,source)
        for field in ['projectId','api_key']:
            bad=copy.deepcopy(record);bad[field]='different'if field=='projectId'else{'id':'different'}
            with self.assertRaises(ValueError):verify('synthetic-full-value',issuance,bad,source)
        source['issuanceKind']='owner-reported-metadata'
        with self.assertRaises(ValueError):verify('synthetic-full-value',issuance,record,source)

    def test_challenge_denies_before_network_without_authorization(self):
        with tempfile.TemporaryDirectory()as p:
            opener=Mock()
            with self.assertRaisesRegex(ValueError,'authorization_required'):run('/missing','a'*64,Path(p),False,opener)
            opener.assert_not_called();self.assertEqual(list(Path(p).iterdir()),[])

    def test_mocked_readonly_request_never_serializes_secret_or_body(self):
        with tempfile.TemporaryDirectory()as tmp:
            base=Path(tmp);source=base/'source.private.json';secret='synthetic-private-full-token'
            raw=json.dumps({'apps':[{'name':'re7-whatsapp-agent','env':{'OPENAI_API_KEY':secret}}]}).encode();source.write_bytes(raw);source.chmod(0o600)
            out=base/'out';out.mkdir(mode=0o700)
            class Response:
                status=200;headers={'x-request-id':'synthetic-request'}
                def __enter__(self):return self
                def __exit__(self,*a):pass
                def read(self,n):return b'body-not-for-custody'
            opener=Mock();opener.open.return_value=Response()
            result=run(source,hashlib.sha256(raw).hexdigest(),out,True,opener)
            self.assertFalse(result['apiKeyIdAttested']);self.assertFalse(result['revocationAuthorized'])
            for p in out.iterdir():
                self.assertEqual(p.stat().st_mode&0o777,0o600);self.assertNotIn(secret,p.read_text());self.assertNotIn('body-not-for-custody',p.read_text())
            request=opener.open.call_args.args[0];self.assertEqual(request.get_method(),'GET');self.assertEqual(request.full_url,'https://api.openai.com/v1/models')

if __name__=='__main__':unittest.main()
