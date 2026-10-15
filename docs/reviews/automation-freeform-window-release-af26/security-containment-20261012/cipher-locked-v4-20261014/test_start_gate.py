import unittest,sys
from pathlib import Path
root=Path.cwd()
base=root/'docs/reviews/automation-freeform-window-release-af26/security-containment-20261012'
for path in [root/'docs/reviews/automation-freeform-window-release-af26/v4-sequencer',base,base/'remaining-v3-20261014',base/'remaining-v2-20261014',base/'cipher-volatile-protocol-20261014']:sys.path.insert(0,str(path))
from pathlib import Path
from unittest.mock import patch
import cipher_start_gate as g
class Boundary:
 def __init__(self):self.new=False;self.old=False
 def may_start_successor(self):return self.new
 def may_start_original_return(self):return self.old
class Driver:
 def __init__(self):self.boundary=Boundary();self.state='ORIGINAL_VERIFIED';self.present=True
 def prior(self):return ({},'hash',self.boundary)if self.present else None
 def check_scope(self):return True
 def classify(self,*_):return self.state
 def verify_current_verified(self,*_):return 'VERIFIED_CURRENT_NEW_EPOCH'if self.state=='VERIFIED'else'DENY'
class Tests(unittest.TestCase):
 def setUp(self):self.d=Driver();self.b=type('B',(),{'window':Path('/tmp/no-synthetic-intent')})();self.patches=[patch.object(g,'Bridge',lambda _:self.b),patch.object(g,'Driver',lambda _:self.d)];[p.start()for p in self.patches]
 def tearDown(self):[p.stop()for p in self.patches]
 def test_old_forbidden_after_verified_even_direct_start(self):
  self.d.boundary.new=True;self.d.state='VERIFIED'
  with self.assertRaisesRegex(RuntimeError,'old_cipher'):g.authorize_start(Path('/tmp/p/return-before-commit'))
 def test_uncertain_denies_all_successors(self):
  for mode in ['switch','return','return-partial','return-before-commit']:
   with self.subTest(mode=mode),self.assertRaises(RuntimeError):g.authorize_start(Path('/tmp/p')/mode)
 def test_original_inspected_and_new_verified_paths(self):
  self.d.boundary.old=True;g.authorize_start(Path('/tmp/p/return-before-commit'));self.d.boundary.old=False;self.d.boundary.new=True;self.d.state='VERIFIED'
  for mode in ['switch','return','return-partial']:g.authorize_start(Path('/tmp/p')/mode)
if __name__=='__main__':unittest.main()
