import copy,hashlib,json,os,sys,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parent/'remaining-v3-20261014'));sys.path.insert(0,str(HERE.parent))
from package_contract import bind_observation,immutable_schema,MODES
from cipher_consumers import CipherConsumers
class Tests(unittest.TestCase):
 def setUp(self):
  os.umask(0o077);self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.w=self.root/'window';self.w.mkdir(mode=0o700);self.ref=self.root/'immutable';self.ref.write_text('isolated-reference');self.ref.chmod(0o600)
  self.entry=dict(path=str(self.ref),uid=os.getuid(),mode=0o600,sha256=hashlib.sha256(self.ref.read_bytes()).hexdigest());self.obs=dict(entries=[dict(self.entry,type='regular',nlink=1)]);self.source={'immutable':[{k:self.entry[k]for k in ('path','uid','sha256')}]}
  self.plan={'immutable':[self.entry],'before':[],'after':[],'modeBindings':{}}
  for group in ('before','after'):
   f=self.w/(group+'.json');f.write_text('{}');f.chmod(0o600);self.plan[group]=[{'name':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}]
  for mode in MODES:
   p=self.root/mode;p.mkdir();f=p/'candidate.config.private.json';f.write_text('{}');f.chmod(0o600);self.plan['modeBindings'][mode]=hashlib.sha256(f.read_bytes()).hexdigest()
 def tearDown(self):self.temp.cleanup()
 def verify(self):
  immutable_schema(self.plan['immutable']);f=self.w/'cipher-consumers.private.json';f.write_text(json.dumps(self.plan));f.chmod(0o600);return CipherConsumers(self.w,hashlib.sha256(f.read_bytes()).hexdigest()).verify('before')
 def test_canonical_nonempty_references(self):self.verify();self.assertEqual(bind_observation(self.source,self.obs),[self.entry])
 def test_missing_fields_deny_before_copy(self):
  for field in ('path','uid','mode','sha256'):
   obs=copy.deepcopy(self.obs);del obs['entries'][0][field]
   with self.assertRaises(RuntimeError):bind_observation(self.source,obs)
 def test_invalid_field_types(self):
  for field,value in [('mode','600'),('uid',True),('mode',True),('sha256','bad'),('path','relative')]:
   entries=[dict(self.entry,**{field:value})]
   with self.assertRaises(RuntimeError):immutable_schema(entries)
 def test_mode_drift(self):
  self.ref.chmod(0o640)
  with self.assertRaisesRegex(RuntimeError,'mode_drift'):self.verify()
 def test_owner_drift(self):
  self.plan['immutable'][0]['uid']+=1
  with self.assertRaisesRegex(RuntimeError,'owner_drift'):self.verify()
 def test_hash_drift(self):
  self.ref.write_text('drift')
  with self.assertRaisesRegex(RuntimeError,'reference_drift'):self.verify()
 def test_type_drift(self):
  self.ref.unlink();self.ref.mkdir()
  with self.assertRaisesRegex(RuntimeError,'type_drift'):self.verify()
 def test_symlink_drift(self):
  self.ref.unlink();self.ref.symlink_to(self.w/'before.json')
  with self.assertRaisesRegex(RuntimeError,'type_drift'):self.verify()
 def test_reference_missing(self):
  self.ref.unlink()
  with self.assertRaises(FileNotFoundError):self.verify()
 def test_bound_owner_hash_type_population(self):
  for change in [dict(uid=os.getuid()+1),dict(sha256='0'*64),dict(type='symlink'),dict(nlink=2),dict(path='/different')]:
   obs=copy.deepcopy(self.obs);obs['entries'][0].update(change)
   with self.assertRaises(RuntimeError):bind_observation(self.source,obs)
 def test_consumer_mode_binding_drift(self):
  self.plan['modeBindings']['return-before-commit']='0'*64
  with self.assertRaisesRegex(RuntimeError,'binding_drift'):self.verify()
 def test_profile_reference_escape(self):
  self.plan['after'][0]['name']='../immutable'
  with self.assertRaisesRegex(RuntimeError,'path_denied'):self.verify()
if __name__=='__main__':unittest.main()
