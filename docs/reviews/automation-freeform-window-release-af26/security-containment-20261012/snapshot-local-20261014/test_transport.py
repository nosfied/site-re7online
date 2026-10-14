"""Targeted final transport regressions on already-owned local lab; no new dump."""
import fcntl,json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from snapshot_capture import Connection,Denied,private_directory,capture,IDENTITY_SQL
ROOT=Path.cwd();BIN='/usr/lib/postgresql/16/bin/';DATA=ROOT/'local-evidence/security-snapshot-local-20261014/data';SOCK=Path(tempfile.mkdtemp(prefix='re7snap-final-',dir='/tmp'));os.umask(0o077)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(prefix='re7snapshot-transport-',dir='/tmp');cls.out=Path(cls.tmp.name);cls.log=(cls.out/'commands.private').open('x')
  subprocess.run([BIN+'pg_ctl','-D',str(DATA),'-l',str(cls.out/'postgres.private.log'),'-o',f"-k {SOCK} -p 56547 -h '' -c log_statement=none -c log_min_error_statement=panic",'start'],check=True,stdout=cls.log,stderr=cls.log)
  cls.conn=f'host={SOCK} port=56547 user=postgres dbname=source connect_timeout=2'
  c=Connection(cls.conn);cls.identity=json.loads(c.query(IDENTITY_SQL)[0][0]);c.close()
 @classmethod
 def tearDownClass(cls):
  subprocess.run([BIN+'pg_ctl','-D',str(DATA),'stop','-m','fast'],check=True,stdout=cls.log,stderr=cls.log);cls.log.close();cls.tmp.cleanup()
 def test_multi_statement_readonly_select_retained(self):
  c=Connection(self.conn)
  try:self.assertEqual(c.query('BEGIN READ ONLY;SELECT 147;ROLLBACK;'),[['147']])
  finally:c.close()
 def test_readonly_mutation_denied_and_rollback(self):
  c=Connection(self.conn)
  try:
   with self.assertRaises(Denied):c.query('BEGIN READ ONLY; CREATE TABLE must_not_exist(id int); ROLLBACK;')
   c.query('ROLLBACK');self.assertEqual(c.query("SELECT to_regclass('must_not_exist')IS NULL"),[['t']])
  finally:c.close()
 def test_bad_destinations_before_connection(self):
  p=self.out/'regular';p.write_text('x');p.chmod(0o600)
  with self.assertRaises(Denied):private_directory(p)
  with self.assertRaises(FileNotFoundError):private_directory(self.out/'absent')
  p=self.out/'group-write';p.mkdir(mode=0o700);p.chmod(0o770)
  with self.assertRaises(Denied):private_directory(p)
  p.chmod(0o700);original=Path.lstat
  def wrong_owner(q):
   r=original(q)
   if q==p:r=os.stat_result([r.st_mode,r.st_ino,r.st_dev,r.st_nlink,r.st_uid+1,r.st_gid,r.st_size,r.st_atime,r.st_mtime,r.st_ctime])
   return r
  with patch.object(Path,'lstat',wrong_owner):
   with self.assertRaises(Denied):private_directory(p)
 def test_timeout_and_holder_death_release_resources(self):
  lock=self.out/'failure.lock';lock.touch(mode=0o600)
  sleeper=self.out/'sleeper.py';sleeper.write_text('import time; time.sleep(30)');sleeper.chmod(0o600)
  import sys
  def terminate(h,snapshot):
   pid=h.query('SELECT pg_backend_pid()')[0][0];c=Connection(self.conn)
   try:c.query('SELECT pg_terminate_backend('+pid+')')
   finally:c.close()
  for name,extra in [('timeout',{'dump_command':[sys.executable,str(sleeper)],'timeout':.1}),('holder-death',{'after_inventory':terminate})]:
   p=self.out/name;p.mkdir(mode=0o700)
   args=dict(out=p,lock_path=lock,conninfo=self.conn,dump_command=['/bin/false'],inventory_sql='SELECT 1',expected_identity=self.identity);args.update(extra)
   with self.assertRaises(Denied):capture(**args)
   with lock.open('r+')as f:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
 def test_failure_paths_cleanup_final_transport(self):
  lock=self.out/'backup.lock';lock.touch(mode=0o640)
  for name,overrides in [('inventory',{'inventory_sql':'SELECT absent_column'}),('dump',{'dump_command':['/bin/false']}),('identity',{'expected_identity':{}})]:
   p=self.out/name;p.mkdir(mode=0o700)
   args=dict(out=p,lock_path=lock,conninfo=self.conn,dump_command=['/bin/false'],inventory_sql='SELECT 1',expected_identity=self.identity);args.update(overrides)
   with self.assertRaises(Denied):capture(**args)
   self.assertTrue((p/'denial.private.json').is_file());self.assertFalse((p/'receipt.private.json').exists())
   with lock.open('r+')as f:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  c=Connection(self.conn)
  try:self.assertEqual(c.query("SELECT count(*)FROM pg_stat_activity WHERE datname='source' AND state='idle in transaction'"),[['0']])
  finally:c.close()
if __name__=='__main__':unittest.main()
