import hashlib,unittest
from env_selective_review import propose
class Review(unittest.TestCase):
 def test_preserve_unknown_and_comments(self):
  b=b'# private fixture\r\nADMIN_TOKEN=old\r\nDATABASE_URL=old\r\nUNRELATED="preserve"\r\n';h=hashlib.sha256(b).hexdigest()
  new,info=propose(b,h,{'ADMIN_TOKEN':'synthetic-new'},'legacy-api',True)
  self.assertEqual(new,b.replace(b'ADMIN_TOKEN=old',b'ADMIN_TOKEN="synthetic-new"'));self.assertFalse(info['applyAuthorized'])
 def test_denials(self):
  for b,h,r,c,verified in [(b'ADMIN_TOKEN=old\n','bad',{'ADMIN_TOKEN':'new'},'legacy-api',True),(b'ADMIN_TOKEN=x\nADMIN_TOKEN=y\n',None,{'ADMIN_TOKEN':'new'},'legacy-api',True),(b'ADMIN_TOKEN=x\n',None,{'ADMIN_TOKEN':'new'},'legacy-worker',True),(b'ADMIN_TOKEN=x\n',None,{'ADMIN_TOKEN':'new'},'legacy-api',False),(b'ADMIN_TOKEN=x\n',None,{'ADMIN_TOKEN':'a\\b'},'legacy-api',True),(b'ADMIN_TOKEN=x\n',None,{'APP_AUTH_SECRET':'new'},'legacy-api',True),(b'ADMIN_TOKEN=x\n',None,{'ADMIN_TOKEN':'new'},'local-unknown',True)]:
   with self.subTest(case=c,verified=verified),self.assertRaises(RuntimeError):propose(b,h or hashlib.sha256(b).hexdigest(),r,c,verified)
if __name__=='__main__':unittest.main()
