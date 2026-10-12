"""Render private SCRAM ALTER ROLE through libpq; rendering never mutates SQL. Input/output must be private."""
import argparse,ctypes,ctypes.util,hashlib,json,os,stat
from pathlib import Path
from urllib.parse import urlsplit,parse_qsl,urlencode,urlunsplit
def read_private(path):
 p=Path(path);s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_input_unsafe';return json.loads(p.read_text())
def render(connection,values,output):
 lib=ctypes.CDLL(ctypes.util.find_library('pq'));lib.PQconnectdb.argtypes=[ctypes.c_char_p];lib.PQconnectdb.restype=ctypes.c_void_p;lib.PQstatus.argtypes=[ctypes.c_void_p];lib.PQstatus.restype=ctypes.c_int;lib.PQfinish.argtypes=[ctypes.c_void_p];lib.PQencryptPasswordConn.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_char_p,ctypes.c_char_p];lib.PQencryptPasswordConn.restype=ctypes.c_void_p;lib.PQfreemem.argtypes=[ctypes.c_void_p]
 if connection.startswith(('postgresql://','postgres://')):
  p=urlsplit(connection);q=[(k,v)for k,v in parse_qsl(p.query)if k not in ['schema','connection_limit','pool_timeout','pgbouncer','statement_cache_size']];connection=urlunsplit((p.scheme,p.netloc,p.path,urlencode(q),p.fragment))
 c=lib.PQconnectdb(connection.encode())
 try:
  assert lib.PQstatus(c)==0,'management_connection_denied'
  assert values['password']and len(values['password'])>=32,'new_password_missing_or_weak'
  p=lib.PQencryptPasswordConn(c,values['password'].encode(),values['username'].encode(),b'scram-sha-256');assert p,'libpq_password_encryption_failed'
  try:verifier=ctypes.string_at(p).decode()
  finally:lib.PQfreemem(p)
  assert verifier.startswith('SCRAM-SHA-256$')
  role='"'+values['username'].replace('"','""')+'"';text='ALTER ROLE '+role+" PASSWORD '"+verifier.replace("'","''")+"';\n"
  assert values['password']not in text,'plaintext_password_in_sql'
  fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w')as f:f.write(text)
  return {'result':'PRIVATE_SCRAM_ROLE_SQL_RENDERED_NOT_APPLIED','sqlSha256':hashlib.sha256(text.encode()).hexdigest(),'plaintextInSql':False,'rolePrivilegesChanged':False}
 finally:lib.PQfinish(c)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--management-connection-file',required=True);a.add_argument('--password-file',required=True);a.add_argument('--output',required=True);v=a.parse_args();os.umask(0o077)
 try:print(json.dumps(render(read_private(v.management_connection_file)['connection'],read_private(v.password_file),v.output)))
 except Exception as e:print(json.dumps({'result':'DATABASE_RENDER_DENIED','errorClass':type(e).__name__,'valuesPrinted':False}));raise SystemExit(1)
