"""Actual installer Python stages on synthetic files; root installation not simulated as real."""
import hashlib,json,re,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
SCRIPT=Path(__file__).with_name('install-permanent-reader-binding-for-review.sh')
STAGES=re.findall(r'python3 - "\$P" "\$I" <<\'PY\'\n(.*?)\nPY',SCRIPT.read_text(),re.S)
OLD='93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385'
NEW='c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30'
class Binding(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)/'p';self.i=Path(self.tmp.name)/'i';self.p.mkdir();self.i.mkdir()
  old={'readerSha256':OLD,'roles':{'source':'unchanged','candidate':'unchanged','return':'unchanged'},'pm2':'unchanged'};new=dict(old,readerSha256=NEW)
  self.write(self.p/'permanent-policy.proposed.private.json',old);self.write(self.i/'permanent-policy-reader-upgrade.private.json',new)
  b={'policy':new,'policySha256':self.sha(self.i/'permanent-policy-reader-upgrade.private.json')};self.write(self.i/'permanent-reader-upgrade-binding.private.json',b)
  for n in ['permanent-observer-binding.private.json','permanent-installed-binding.private.json']:self.write(self.p/n,{'policy':old})
  (self.p/'unrelated.private.json').write_bytes(b'preserved')
  (self.p/'execution-authorized').write_text('false\n')
  names=['permanent-policy.proposed.private.json','permanent-observer-binding.private.json','permanent-installed-binding.private.json','unrelated.private.json','execution-authorized']
  (self.p/'bindings.sha256').write_text(''.join(self.sha(self.p/n)+'  '+n+'\n'for n in names));(self.p/'execution-authorized').write_text('true\n')
 def tearDown(self):self.tmp.cleanup()
 def sha(self,p):return hashlib.sha256(p.read_bytes()).hexdigest()
 def write(self,p,v):p.write_text(json.dumps(v)+'\n')
 def stage(self,n):
  with patch.object(sys,'argv',['driver',str(self.p),str(self.i)]):exec(compile(STAGES[n],str(SCRIPT),'exec'),{})
 def test_single_field_and_binding_update_preserves_gate_and_archives(self):
  before=(self.p/'bindings.sha256').read_bytes();self.stage(0);self.stage(1)
  self.assertEqual((self.p/'bindings.sha256.before-reader-upgrade').read_bytes(),before)
  self.assertEqual((self.p/'execution-authorized').read_text(),'true\n');self.assertEqual((self.p/'unrelated.private.json').read_bytes(),b'preserved')
  self.assertEqual(json.loads((self.p/'permanent-policy.proposed.private.json').read_text())['readerSha256'],NEW)
  (self.p/'execution-authorized').write_text('false\n')
  for line in (self.p/'bindings.sha256').read_text().splitlines():h,n=line.split('  ');self.assertEqual(self.sha(self.p/n),h)
 def test_unrelated_binding_drift_denies_before_root_step(self):
  (self.p/'unrelated.private.json').write_bytes(b'drift')
  with self.assertRaisesRegex(AssertionError,'pre_mutation_binding_drift'):self.stage(0)
  self.assertFalse(list(self.p.glob('*.before-reader-upgrade')))
 def test_other_policy_field_change_denies(self):
  p=self.i/'permanent-policy-reader-upgrade.private.json';v=json.loads(p.read_text());v['pm2']='changed';self.write(p,v)
  with self.assertRaisesRegex(AssertionError,'not_single_field_delta'):self.stage(0)
 def test_archive_existing_denies_without_overwrite(self):
  self.stage(0);self.stage(1);old=(self.p/'bindings.sha256.before-reader-upgrade').read_bytes()
  with self.assertRaises(AssertionError):self.stage(0)
  self.assertEqual((self.p/'bindings.sha256.before-reader-upgrade').read_bytes(),old)
if __name__=='__main__':unittest.main()
