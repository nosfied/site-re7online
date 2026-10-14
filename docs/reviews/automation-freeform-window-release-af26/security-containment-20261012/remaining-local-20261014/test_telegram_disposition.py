import copy
import hashlib
import json
import unittest
from verify_telegram_disposition import verify

class DispositionBinding(unittest.TestCase):
    def test_drift_is_denied_and_unreadable_row_is_preserved(self):
        row={'id':'synthetic-secret','channelAccountId':'synthetic-account','secretCiphertext':'unreadable-synthetic'}
        snapshot={'data':{'groups':[{'model':'channelAccountSecret','rows':[row]}],'accounts':[{'id':'synthetic-account','clientId':'synthetic-tenant','channel':'TELEGRAM'}]}}
        binding={'ownerDeclaredFutureUnused':True,'botFatherRequiredNow':False,'originalAccountReference':'synthetic-account','tenantReference':'synthetic-tenant','preserveOriginalRowSha256':hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()}
        before=json.dumps(snapshot)
        self.assertFalse(verify(snapshot,binding)['fullCipherPlanPass']);self.assertEqual(json.dumps(snapshot),before)
        for field,value in [('originalAccountReference','other'),('tenantReference','other'),('preserveOriginalRowSha256','0'*64)]:
            invalid=copy.deepcopy(binding);invalid[field]=value
            with self.assertRaises(AssertionError):verify(snapshot,invalid)
        invalid=copy.deepcopy(snapshot);invalid['data']['groups'][0]['rows'].append(row)
        with self.assertRaises(AssertionError):verify(invalid,binding)

if __name__=='__main__':unittest.main()
