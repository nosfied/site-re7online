"""Native stat_result vectors based on a real local socket, not production observations."""
import hashlib,json,os,socket,tempfile,unittest
from pathlib import Path
P=Path(__file__).resolve().parent;R=P.parent
raw=(R/'crm-csv-r2-directed-20261017/read_package.py').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'
lib={'__name__':'metadata_library','__file__':'<pinned canonical reader>'};exec(compile(raw,lib['__file__'],'exec'),lib)

def vector(s,field,value):
    seq=list(s);indices={'mode':0,'ino':1,'dev':2,'nlink':3,'uid':4,'gid':5,'size':6,'atime':7,'mtime':8,'ctime':9}
    extra={'st_atime':s.st_atime,'st_atime_ns':s.st_atime_ns,'st_mtime':s.st_mtime,'st_mtime_ns':s.st_mtime_ns,'st_ctime':s.st_ctime,'st_ctime_ns':s.st_ctime_ns}
    if field in indices:seq[indices[field]]=value
    if field in('atime','mtime','ctime'):extra['st_'+field]=value;extra['st_'+field+'_ns']=int(value*10**9)
    if field.endswith('_ns'):extra['st_'+field]=value
    return os.stat_result(seq,extra)

class StatContract(unittest.TestCase):
    def test_only_atime_full_tuple_denies_canonical_metadata_matches(self):
        with tempfile.TemporaryDirectory(prefix='re7-socket-stat-contract-')as td,socket.socket(socket.AF_UNIX)as sock:
            path=Path(td)/'socket';sock.bind(str(path));before=path.lstat();after=vector(before,'atime',before.st_atime+2)
            self.assertNotEqual(before,after);self.assertEqual(lib['meta'](before),lib['meta'](after))
            self.assertNotEqual(before.st_atime_ns,after.st_atime_ns)
            for name in('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'):self.assertEqual(getattr(before,'st_'+name),getattr(after,'st_'+name))
    def test_every_canonical_metadata_change_remains_a_denial(self):
        with tempfile.TemporaryDirectory(prefix='re7-socket-metadata-contract-')as td,socket.socket(socket.AF_UNIX)as sock:
            path=Path(td)/'socket';sock.bind(str(path));before=path.lstat()
            for name in('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'):
                with self.subTest(field=name):self.assertNotEqual(lib['meta'](before),lib['meta'](vector(before,name,getattr(before,'st_'+name)+1)))
            self.assertNotEqual(lib['meta'](before),lib['meta'](vector(before,'mode',0o100600)))
if __name__=='__main__':unittest.main(verbosity=2)
