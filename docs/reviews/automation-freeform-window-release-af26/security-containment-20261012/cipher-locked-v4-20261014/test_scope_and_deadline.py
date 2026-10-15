import copy,datetime,json,sys,unittest,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'cipher-volatile-protocol-20261014'))
from locked_phase import scope_check,run
class Tests(unittest.TestCase):
 def setUp(self):
  self.a={'rows':[dict(id='s',channelAccountId='a',secretKind='baileysAuthState.v1',secretHash='h',secretCiphertext='old',createdAt='2026-10-01T00:00:00.000Z',updatedAt='2026-10-01T00:00:00.000Z'),dict(id='o',channelAccountId='t',secretKind='telegramBotToken',secretHash='h',secretCiphertext='opaque',createdAt='2026-10-01T00:00:00.000Z',updatedAt='2026-10-01T00:00:00.000Z')],'accounts':[dict(id='a',provider='web_session',metadata={'webSession':{'reconnectCount':0}},createdAt='2026-10-01T00:00:00.000Z',updatedAt='2026-10-01T00:00:00.000Z'),dict(id='t',provider='telegram',metadata={},createdAt='2026-10-01T00:00:00.000Z',updatedAt='2026-10-01T00:00:00.000Z')],'opaqueId':'o','mfa':0,'webhook':0}
 def test_timestamp_format_exact_precision(self):
  v=copy.deepcopy(self.a)
  for group in ('rows','accounts'):
   for r in v[group]:r['createdAt']='2026-10-01T00:00:00';r['updatedAt']='2026-10-01T00:00:00'
  self.assertTrue(scope_check(self.a,v));v['rows'][0]['createdAt']='2026-10-01T00:00:00.000001'
  with self.assertRaises(RuntimeError):scope_check(self.a,v)
 def test_non_web_cipher_renewal_denied(self):
  v=copy.deepcopy(self.a);v['rows'][1]['secretCiphertext']='new'
  with self.assertRaises(RuntimeError):scope_check(self.a,v)
 def test_real_deadline_and_cleanup(self):
  with tempfile.TemporaryDirectory()as path:
   p=Path(path);p.chmod(0o700);calls=[]
   def q(sql):
    calls.append(sql)
    if sql.startswith('BEGIN'):time.sleep(.2)
    return '{}'
   proof=dict(allWritersExited=True,dbOwnershipProven=True,fenceActive=True,approvedRenewal=True,unknownWriters=[],observationIncomplete=[],guardGeneration=38,authDb='NEWauth+NEWDB',certificateHashes={'test':'sealed'})
   start=time.monotonic()
   with self.assertRaisesRegex(RuntimeError,'PRECOMMIT_DENY'):run(q,self.a,proof,p,'test',lambda v:{},lambda p,h:'',budget=.05)
   self.assertLess(time.monotonic()-start,.2);self.assertIn('ROLLBACK;',calls);self.assertFalse((p/'intent.private.json').exists())
if __name__=='__main__':unittest.main()
