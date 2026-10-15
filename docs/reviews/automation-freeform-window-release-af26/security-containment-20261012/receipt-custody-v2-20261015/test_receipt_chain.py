"""Local byte-chain proof. Original producer receipt/dump; no network or backup.
Runs the actual custody flow and refresh wrapper on a disposable concrete package.
Only transfer, remote/live inspection and historical clock are substituted.
"""
import argparse,ast,contextlib,datetime,hashlib,importlib.util,io,json,os,shutil,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
OLD=HERE.parent/'openai-operational-20261015'
P=ROOT/'local-evidence/openai-operational-20261015/incident-6683-v4-security-openai-v4-20261015T203000Z'
D=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/openai-operational-20261015')
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
custody=load('receipt_custody_v2',HERE/'custody_backup_local_v2.py')
refresh=load('original_refresh_wrapper',P/'refresh_proofs.py')
sys.path.insert(0,str(P/'window'))
import openai_contract as contract
sha=lambda b:hashlib.sha256(b).hexdigest()
class ReceiptTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.base.chmod(0o700)
  self.src=self.base/'receipt.json';self.raw=b'{ "z": 2, "a": 1 }\n';self.src.write_bytes(self.raw);self.src.chmod(0o600)
 def tearDown(self):self.tmp.cleanup()
 def test_exact_original_bytes(self):
  raw,value=custody.read_original_receipt(self.src,sha(self.raw));self.assertEqual(raw,self.raw);self.assertEqual(value,{'a':1,'z':2})
 def denied_before_output(self,expected=None):
  dest=self.base/'denied'
  with self.assertRaises((RuntimeError,OSError,ValueError,AssertionError)):
   custody.main(self.src,dest,expected or sha(self.raw))
  self.assertFalse(dest.exists())
 def test_semantically_equal_reserialization_denied(self):
  self.src.write_bytes((json.dumps(json.loads(self.raw),sort_keys=True)+'\n').encode());self.denied_before_output()
 def test_wrong_digest(self):self.denied_before_output('0'*64)
 def test_invalid_digest(self):self.denied_before_output('not-a-digest')
 def test_bad_file_mode(self):self.src.chmod(0o644);self.denied_before_output()
 def test_bad_parent_mode(self):self.base.chmod(0o755);self.denied_before_output()
 def test_wrong_owner(self):
  real=custody.os.fstat
  def wrong_owner(fd):
   s=real(fd)
   class DifferentOwner:
    def __getattr__(self,k):return s.st_uid+1 if k=='st_uid'else getattr(s,k)
   return DifferentOwner()
  with patch.object(custody.os,'fstat',side_effect=wrong_owner):self.denied_before_output()
 def test_unsafe_output_directory_before_transfer(self):
  srcdir=self.base/'source';srcdir.mkdir(mode=0o700);src=srcdir/'receipt.json';src.write_bytes(self.raw);src.chmod(0o600)
  bad=self.base/'unsafe';bad.mkdir(mode=0o755);bad.chmod(0o755)
  with patch.object(custody.subprocess,'run')as run:
   with self.assertRaisesRegex(RuntimeError,'private_directory_invalid'):custody.main(src,bad/'out',sha(self.raw))
   run.assert_not_called()
  self.assertFalse((bad/'out').exists())
 def test_symlink_receipt(self):
  real=self.base/'real';self.src.rename(real);self.src.symlink_to(real);self.denied_before_output()
 def test_hardlink_receipt(self):os.link(self.src,self.base/'link');self.denied_before_output()
 def test_invalid_json(self):self.src.write_bytes(b'{broken');self.denied_before_output(sha(b'{broken'))
 def test_non_object_json(self):self.src.write_bytes(b'[]');self.denied_before_output(sha(b'[]'))
 def test_oversized_receipt(self):
  self.src.write_bytes(b' '*1048577);self.denied_before_output(sha(b' '*1048577))
 def test_change_during_read(self):
  real=custody.os.fstat;count=0
  def observation(fd):
   nonlocal count
   s=real(fd);count+=1
   if count==2:
    class Changed:
     def __getattr__(self,k):return s.st_size+1 if k=='st_size'else getattr(s,k)
    return Changed()
   return s
  with patch.object(custody.os,'fstat',side_effect=observation):self.denied_before_output()
 def test_existing_output_not_overwritten(self):
  f=self.base/'existing';f.write_bytes(b'evidence')
  with self.assertRaises(FileExistsError):custody.put_bytes(f,b'changed')
  self.assertEqual(f.read_bytes(),b'evidence')
 def test_complete_concrete_historical_chain(self):
  receipt=D/'backup-result.new.private.json';raw=receipt.read_bytes();result=json.loads(raw)
  # Execute the exact producer serialization statement, not the backup effects.
  tree=ast.parse((OLD/'capture_backup.py').read_text());nodes=[n for n in ast.walk(tree)if isinstance(n,ast.Expr)and ast.unparse(n)=='print(json.dumps(result))'];self.assertEqual(len(nodes),1)
  stream=io.StringIO()
  with contextlib.redirect_stdout(stream):exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual_producer_serializer','exec'),{'json':json,'result':result})
  produced=stream.getvalue().encode();self.assertEqual(produced,raw)
  transfer=self.base/'transferred.private.json';transfer.write_bytes(produced);transfer.chmod(0o600)
  dump=D/'rpo-window-20261015/database.dump';self.assertEqual(sha(dump.read_bytes()),result['dumpSha256'])
  real_run=custody.subprocess.run;commands=[]
  def local_transport(args,**kw):
   commands.append(args[0])
   if args[0]=='scp':
    self.assertEqual(args[2],'deploy@admin.re7online.com:'+result['remoteDirectory']+'/database.dump');shutil.copyfile(dump,args[-1]);return __import__('subprocess').CompletedProcess(args,0)
   self.assertIn(args[0],('/usr/lib/postgresql/16/bin/pg_restore','/usr/lib/postgresql/16/bin/pg_ctl'));return real_run(args,**kw)
  dest=self.base/'new-custody'
  with patch.object(custody.subprocess,'run',side_effect=local_transport),contextlib.redirect_stdout(io.StringIO()):custody.main(transfer,dest,sha(produced))
  self.assertEqual((dest/'backup-result.private.json').read_bytes(),raw)
  self.assertEqual(json.loads((dest/'custody-ack.private.json').read_text())['receiptSha256'],sha(raw))
  # Preserve and reproduce the historical DENY, exclusively in a local clone.
  p=self.base/P.name;shutil.copytree(P,p)
  before={str(f.relative_to(p)):sha(f.read_bytes())for f in p.rglob('*')if f.is_file()}
  review=contract.sha(p/'preparation-review.sha256');real_check=contract.check;real_sha=contract.sha
  def local_check(target,live=False):return real_check(target,live=False)
  def local_sha(target):return real_sha(dest/'database.dump')if str(target)==result['remoteDirectory']+'/database.dump'else real_sha(target)
  when=datetime.datetime.fromisoformat(result['startedUtc'])+datetime.timedelta(seconds=1)
  class HistoricalClock(datetime.datetime):
   @classmethod
   def now(cls,tz=None):return when
  with patch.object(contract,'check',side_effect=local_check),patch.object(contract,'sha',side_effect=local_sha),patch('datetime.datetime',HistoricalClock):
   with self.assertRaisesRegex(RuntimeError,'custody_binding'):refresh.refresh(p,transfer,D/'rpo-window-20261015/custody-ack.private.json',self.base/'denied-renewal',review)
   self.assertFalse((self.base/'denied-renewal').exists())
   with contextlib.redirect_stdout(io.StringIO()):refresh.refresh(p,transfer,dest/'custody-ack.private.json',self.base/'local-renewal',review)
  real_check(p,live=False)
  allowed={'preparation-review.sha256'}|{'window/'+n for n in ('backup-manifest.private.json','restore-result.json','backup-compatibility.private.json','restore-contract.private.json','mode-manifest-v4.json','sequencer-manifest.json')}|{m+'/'+n for m in contract.MODES for n in ('backup-manifest.json','proof-bindings.private.json','scripts.sha256')}
  changed={n for n,h in before.items()if sha((p/n).read_bytes())!=h};self.assertTrue(changed);self.assertTrue(changed<=allowed)
  self.assertFalse(json.loads((p/'window/restore-result.json').read_text())['temporaryDatabaseRemoved'])
  for mode in contract.MODES:
   b=json.loads((p/mode/'proof-bindings.private.json').read_text());self.assertEqual(b['dumpSha256'],result['dumpSha256'])
  self.assertEqual(sha(receipt.read_bytes()),sha(raw));self.assertIn('/usr/lib/postgresql/16/bin/pg_restore',commands)
if __name__=='__main__':
 os.umask(0o077);suite=unittest.defaultTestLoader.loadTestsFromTestCase(ReceiptTests);result=unittest.TextTestRunner(verbosity=1).run(suite)
 print(json.dumps({'result':'LOCAL_RECEIPT_BYTE_CHAIN_PASS'if result.wasSuccessful()else'LOCAL_RECEIPT_BYTE_CHAIN_DENY','tests':result.testsRun,'historicalClockInjected':True,'transferSimulatedLocalOnly':True,'concreteFourModeUpdater':True,'catalogAndStoppedLabChecksReal':True,'newBackup':False,'networkCalls':0,'productionWrites':False,'deployed':False}))
 raise SystemExit(not result.wasSuccessful())
