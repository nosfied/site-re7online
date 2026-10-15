import hashlib,json,sys,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parent/'remaining-v3-20261014'));sys.path.insert(0,str(HERE.parent))
import test_cipher_v4 as previous
from locked_v4 import adapter,verify_configs
from credential_boundary import CredentialBoundary,VERIFIED
class Driver:
 def __init__(self,b):self.b=b;self.state='ORIGINAL_VERIFIED';self.calls=0;self.failure=None;self.boundary=None
 def check_scope(self):return True
 def classify(self,*_):return self.state
 def verify_current_verified(self,*_):return 'VERIFIED_CURRENT_NEW_EPOCH'if self.state=='VERIFIED'else'DENY'
 def prior(self):
  if self.boundary is None:return None
  return {},self.hash,self.boundary
 def seal(self,proof):
  assert proof['allWritersExited']and proof['dbOwnershipProven'];self.calls+=1;self.b.events.append(('seal_current_under_lock',));self.hash=hashlib.sha256(b'synthetic-new-plan').hexdigest();self.boundary=CredentialBoundary(self.b.window,self.hash)
  self.boundary.write(self.b.window/'credential-commit.intent.private.json',{'planSha256':self.hash,'automaticReplay':False})
  if self.failure=='before':raise RuntimeError('precommit_denied')
  self.state='VERIFIED'
  if self.failure=='uncertain':raise RuntimeError('commit_uncertain')
  self.boundary.write(self.b.window/'credential-commit.receipt.private.json',self.boundary.envelope(VERIFIED));return {},self.hash,self.boundary
class Tests(unittest.TestCase):
 def setUp(self):
  previous.Tests.setUp(self);self.driver=Driver(self.b);(self.b.window/'seal-current').mkdir(mode=0o700)
  self.proof={'allWritersExited':True,'dbOwnershipProven':True};self.coverage_failure=False
  def coverage(b):
   if self.coverage_failure:raise RuntimeError('unknown_writer')
   if set(b.apps())!={previous.FRONT}:raise RuntimeError('live_writer')
   return self.proof
  consumers=previous.CipherConsumers(self.b.window,previous.sha(self.b.window/'cipher-consumers.private.json'));self.s=adapter(previous.v4,self.driver,consumers,coverage)(self.b)
 def tearDown(self):previous.Tests.tearDown(self)
 def test_complete_closed_guard_new_cipher(self):
  self.s.run();self.assertEqual(self.driver.calls,1);self.assertFalse(self.b.guard()['open']);self.assertEqual(self.b.guard()['generation'],38);self.assertEqual(self.b.live[previous.API]['cfg']['env'][previous.KEYS[0]],'synthetic-new-'+previous.KEYS[0])
  e=self.b.events;self.assertLess(e.index(('seal_current_under_lock',)),next(i for i,x in enumerate(e)if x[:3]==('protocol','switch','start:'+previous.API)))
 def test_uncertain_no_successor_no_replay(self):
  self.driver.failure='uncertain'
  with self.assertRaises(RuntimeError):self.s.run()
  self.assertEqual(set(self.b.live),{previous.FRONT})
  with self.assertRaises(RuntimeError):self.s.recover()
  self.assertEqual(self.driver.calls,1)
 def test_original_return_only_after_inspection(self):
  self.driver.failure='before'
  with self.assertRaises(RuntimeError):self.s.run()
  with self.assertRaises(RuntimeError):self.s.recover()
  self.driver.boundary.record_original_observation(lambda:self.driver.state);self.s.recover();self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[previous.API]['cfg']['env'][previous.KEYS[0]],'synthetic-old-'+previous.KEYS[0])
 def test_failed_successor_safe_return(self):
  self.b.fail_action='switch:start:'+previous.API
  with self.assertRaises(RuntimeError):self.s.run()
  self.assertEqual(self.driver.calls,1);self.assertEqual(self.b.live[previous.API]['cfg']['env'][previous.KEYS[0]],'synthetic-new-'+previous.KEYS[0])
 def test_unknown_writer_before_intent(self):
  self.coverage_failure=True
  with self.assertRaises(RuntimeError):self.s.run()
  self.assertEqual(self.driver.calls,0);self.assertFalse((self.b.window/'credential-commit.intent.private.json').exists())
 def test_old_cipher_postcommit_return_denied(self):
  f=self.b.root/'return'/'candidate.config.private.json';v=json.loads(f.read_text());v['apps'][0]['env'][previous.KEYS[0]]='synthetic-old-'+previous.KEYS[0];previous.write(f,v)
  with self.assertRaises(RuntimeError):verify_configs(self.b)
 def test_five_false_gates(self):
  f=self.b.window/'execution-gates.private.json';previous.write(f,{k:False for k in json.loads(f.read_text())})
  with self.assertRaises(RuntimeError):self.s.run()
  self.assertEqual(self.driver.calls,0)
if __name__=='__main__':unittest.main()
