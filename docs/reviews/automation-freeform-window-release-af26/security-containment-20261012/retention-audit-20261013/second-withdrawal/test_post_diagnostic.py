import importlib.util,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('final',Path(__file__).with_name('withdraw-final.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PostDiagnostics(unittest.TestCase):
 def test_incomplete_post_is_denied_with_original_observation(self):
  sample={'owners':[],'incomplete':[{'pid':123,'ticks':'456','fd':'7','errno':13}]}
  with tempfile.TemporaryDirectory()as d,patch.object(m,'validate_state'),patch.object(m,'observe',return_value=sample):
   with self.assertRaises(m.ObservationDenied)as e:m.post_read({'entries':[]},Path(d))
   self.assertEqual(e.exception.stage,'post_owner_or_incomplete');self.assertEqual(e.exception.observations,[sample])
 def test_owner_post_is_denied(self):
  sample={'owners':[{'pid':123,'ticks':'456','fd':'7'}],'incomplete':[]}
  with self.assertRaises(m.ObservationDenied):m.require_observation('root',[sample])
 def test_dry_negative_keeps_both_samples(self):
  samples=[{'owners':[],'incomplete':[]},{'owners':[],'incomplete':[{'errno':2}]}]
  with self.assertRaises(m.ObservationDenied)as e:m.require_observation('ownership_or_incomplete',samples)
  self.assertEqual(e.exception.observations,samples)
 def test_complete_post_still_reports_actual_members_and_capacity(self):
  with tempfile.TemporaryDirectory()as d,patch.object(m,'validate_state'),patch.object(m,'observe',return_value={'owners':[],'incomplete':[]}),patch.object(m,'capacity',return_value=100):
   r=m.post_read({'entries':[],'requiredPostFreeBytes':90},Path(d));self.assertEqual(r['result'],'POST_READ_COMPLETE');self.assertEqual(r['remainingEntries'],0);self.assertTrue(r['capacityPass'])
if __name__=='__main__':unittest.main()
