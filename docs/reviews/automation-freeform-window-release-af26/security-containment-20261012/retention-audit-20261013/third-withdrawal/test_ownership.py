import importlib.util,os,stat,tempfile,unittest,mmap
from pathlib import Path
from unittest.mock import patch
S=importlib.util.spec_from_file_location('ownership',Path(__file__).with_name('ownership.py'));m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class Generation(unittest.TestCase):
 def setUp(self):
  self.old={'dev':1,'ino':2,'mode':stat.S_IFREG|0o600,'nlink':1,'birthNs':10,'ctimeNs':20};self.new=dict(self.old);self.paths={'/old'}
 def classify(self,target='/other'):return m.classify(self.old,self.new,target,self.paths)
 def test_type_proves_reuse(self):self.new['mode']=stat.S_IFDIR|0o700;self.assertEqual(self.classify(),'reused_type')
 def test_birth_proves_reuse(self):self.new['birthNs']=30;self.assertEqual(self.classify(),'reused_birth')
 def test_ctime_not_proof(self):self.new['ctimeNs']=30;self.assertEqual(self.classify(),'owner')
 def test_birth_unavailable(self):self.new['birthNs']=None;self.assertEqual(self.classify(),'owner')
 def test_original_birth_unavailable(self):self.old['birthNs']=None;self.new['birthNs']=30;self.assertEqual(self.classify(),'owner')
 def test_same_birth(self):self.assertEqual(self.classify(),'owner')
 def test_older_birth_is_not_reuse(self):self.new['birthNs']=5;self.assertEqual(self.classify(),'owner')
 def test_original_target_survives_even_new_birth(self):self.new['birthNs']=30;self.assertEqual(self.classify('/old'),'owner')
 def test_deleted_target_survives_even_type_difference(self):self.new['mode']=stat.S_IFDIR;self.assertEqual(self.classify('/other (deleted)'),'owner')
 def test_unlinked_fd_survives(self):self.new['nlink']=0;self.new['birthNs']=30;self.assertEqual(self.classify(),'owner')
 def test_real_statx_generation(self):
  with tempfile.TemporaryDirectory()as t:
   p=Path(t)/'a';p.write_bytes(b'abc');v=m.object_meta(p);self.assertEqual(v['ino'],p.stat().st_ino);self.assertEqual(v['birthNs'],m.birth_ns(p))
 def test_executor_open_fd_included(self):
  with tempfile.TemporaryDirectory()as t:
   p=Path(t)/'a';p.write_bytes(b'abc');e=dict(m.object_meta(p),path=str(p))
   with p.open('rb')as f:
    v=m.observe([e]);self.assertTrue(any(q['pid']==os.getpid()and q.get('fd')==str(f.fileno())for q in v['owners']))
 def test_deleted_still_open_detected(self):
  with tempfile.TemporaryDirectory()as t:
   p=Path(t)/'a';p.write_bytes(b'abc');e=dict(m.object_meta(p),path=str(p))
   with p.open('rb')as f:
    p.unlink();self.assertTrue(any(q['pid']==os.getpid()for q in m.observe([e])['owners']))
 def test_mapping_after_fd_closed_detected(self):
  with tempfile.TemporaryDirectory()as t:
   p=Path(t)/'a';p.write_bytes(b'abc');e=dict(m.object_meta(p),path=str(p))
   with p.open('rb')as f:mm=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
   try:self.assertTrue(any(q['pid']==os.getpid()and q['stage']=='mapping'for q in m.observe([e])['owners']))
   finally:mm.close()
 def test_permission_failure_preserves_stage(self):
  with tempfile.TemporaryDirectory()as t:
   proc=Path(t);p=proc/'123';p.mkdir();(p/'stat').write_text('123 (x) S '+' '.join(['0']*18+['456']))
   with patch.object(m.os,'readlink',side_effect=PermissionError(13,'denied')):
    v=m.observe([],proc);self.assertEqual(v['incomplete'][0]['stage'],'cwd');self.assertEqual(v['incomplete'][0]['ticks'],'456');self.assertEqual(v['incomplete'][0]['errno'],13)
 def test_directory_to_output_file_reuse(self):
  self.old['mode']=stat.S_IFDIR|0o700;self.assertEqual(self.classify(),'reused_type')
 def test_stat_identity_change_denied(self):
  with tempfile.TemporaryDirectory()as t:
   proc=Path(t);p=proc/'123';p.mkdir();(p/'fd').mkdir();(p/'maps').write_text('');(p/'cwd').symlink_to(proc,target_is_directory=True);(p/'exe').symlink_to('/usr/bin/python3');(p/'stat').write_text('123 (x) S '+' '.join(['0']*18+['456']))
   original=Path.read_text;count=[0]
   def read(q,*args,**kwargs):
    value=original(q,*args,**kwargs)
    if q==p/'stat':
     count[0]+=1
     if count[0]>1:return value.replace('456','789')
    return value
   with patch.object(Path,'read_text',read):
    v=m.observe([],proc);self.assertEqual(v['incomplete'][0]['stage'],'stat_after');self.assertEqual(v['incomplete'][0]['reason'],'process_identity_changed')
 def test_fd_error_records_fd_and_ticks(self):
  with tempfile.TemporaryDirectory()as t:
   proc=Path(t);p=proc/'123';p.mkdir();(p/'fd').mkdir();(p/'fd'/'7').symlink_to('/missing-object');(p/'maps').write_text('');(p/'cwd').symlink_to(proc,target_is_directory=True);(p/'exe').symlink_to('/usr/bin/python3');(p/'stat').write_text('123 (x) S '+' '.join(['0']*18+['456']))
   v=m.observe([],proc);self.assertTrue(any(q['stage']=='fd'and q['fd']=='7'and q['ticks']=='456'and q['errno']==2 for q in v['incomplete']))
if __name__=='__main__':unittest.main()
