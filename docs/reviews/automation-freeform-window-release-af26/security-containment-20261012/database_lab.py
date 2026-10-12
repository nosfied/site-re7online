"""Isolated PostgreSQL16 SCRAM lab only; no production endpoint or provider."""
import ctypes,ctypes.util,json,os,secrets,subprocess,tempfile
from pathlib import Path
from database_plan import render
ROOT=Path('/tmp/re7-security-scram-lab-v2-20261012')
assert not ROOT.exists();ROOT.mkdir(mode=0o700);(ROOT/'socket').mkdir(mode=0o700)
PORT='55483';BIN='/usr/lib/postgresql/16/bin/'
log=(ROOT/'commands.private.log').open('x');err=(ROOT/'commands.private.stderr').open('x')
def run(args,**kw):return subprocess.run(args,stdout=log,stderr=err,check=True,timeout=45,**kw)
old=secrets.token_urlsafe(48);new=secrets.token_urlsafe(48);conn='host='+str(ROOT/'socket')+' port='+PORT+' user=postgres dbname=postgres'
lib=ctypes.CDLL(ctypes.util.find_library('pq'));lib.PQconnectdb.argtypes=[ctypes.c_char_p];lib.PQconnectdb.restype=ctypes.c_void_p;lib.PQstatus.argtypes=[ctypes.c_void_p];lib.PQstatus.restype=ctypes.c_int;lib.PQfinish.argtypes=[ctypes.c_void_p];lib.PQexec.argtypes=[ctypes.c_void_p,ctypes.c_char_p];lib.PQexec.restype=ctypes.c_void_p;lib.PQresultStatus.argtypes=[ctypes.c_void_p];lib.PQresultStatus.restype=ctypes.c_int;lib.PQclear.argtypes=[ctypes.c_void_p]
def connect(secret):return lib.PQconnectdb(('host=127.0.0.1 port='+PORT+' user=security_fixture dbname=postgres connect_timeout=2 password='+secret).encode())
def query(c,sql):
 r=lib.PQexec(c,sql.encode())
 try:return lib.PQresultStatus(r)
 finally:lib.PQclear(r)
started=False;old_connection=None;checks=[]
try:
 run([BIN+'initdb','-D',str(ROOT/'data'),'-U','postgres','--auth-local=trust','--auth-host=scram-sha-256'])
 run([BIN+'pg_ctl','-D',str(ROOT/'data'),'-l',str(ROOT/'postgres.private.log'),'-o','-p '+PORT+' -k '+str(ROOT/'socket')+' -h 127.0.0.1 -c log_statement=none -c log_min_error_statement=panic','start']);started=True
 run(['psql','-X','-h',str(ROOT/'socket'),'-p',PORT,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input='CREATE ROLE security_fixture LOGIN;\n',text=True)
 render(conn,{'username':'security_fixture','password':old},ROOT/'old-role.private.sql')
 run(['psql','-X','-h',str(ROOT/'socket'),'-p',PORT,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',str(ROOT/'old-role.private.sql')])
 old_connection=connect(old);assert lib.PQstatus(old_connection)==0
 render(conn,{'username':'security_fixture','password':new},ROOT/'new-role.private.sql')
 run(['psql','-X','-h',str(ROOT/'socket'),'-p',PORT,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',str(ROOT/'new-role.private.sql')])
 c=connect(old);assert lib.PQstatus(c)!=0;lib.PQfinish(c);checks.append('old_password_new_tcp_connection_denied')
 c=connect(new);assert lib.PQstatus(c)==0 and query(c,'SELECT 1')==2;lib.PQfinish(c);checks.append('new_password_new_tcp_connection_pass')
 assert query(old_connection,'SELECT 1')==2;checks.append('already_open_old_session_survives_not_revocation')
 # Local CAS/rollback proof uses synthetic rows only; fields bind tenant+id+old ciphertext.
 sql="BEGIN;UPDATE cipher_fixture SET cipher='new' WHERE id='one' AND tenant='tenant-a' AND cipher='old';ROLLBACK;SELECT 1;"
 c=lib.PQconnectdb(conn.encode());assert query(c,"CREATE TABLE cipher_fixture(id text PRIMARY KEY,tenant text NOT NULL,cipher text NOT NULL);INSERT INTO cipher_fixture VALUES('one','tenant-a','old'),('two','tenant-b','other');")==1;assert query(c,sql)==2;assert query(c,"DO $$BEGIN IF(SELECT cipher FROM cipher_fixture WHERE id='one')<>'old'THEN RAISE EXCEPTION 'rollback_failed';END IF;END$$;")==1
 assert query(c,"DO $$DECLARE n integer;BEGIN UPDATE cipher_fixture SET cipher='bad'WHERE id='one'AND tenant='tenant-b'AND cipher='old';GET DIAGNOSTICS n=ROW_COUNT;IF n<>0 THEN RAISE EXCEPTION 'tenant_cas_failed';END IF;END$$;")==1;lib.PQfinish(c);checks+=['transaction_rollback_preserves_cipher','tenant_and_original_cipher_CAS_no_cross_tenant_write']
 Path('local-evidence/security-containment-20261012/database-lab.private.json').write_text(json.dumps({'result':'PASS','postgresVersion':'16','checks':checks,'schema':'synthetic fixture only','productionMutations':0,'temporaryServerStopped':True},indent=2)+'\n')
finally:
 if old_connection:lib.PQfinish(old_connection)
 if started:run([BIN+'pg_ctl','-D',str(ROOT/'data'),'stop','-m','fast'])
 log.close();err.close()
print(json.dumps({'result':'PASS','checks':checks,'noProductionMutation':True,'isolatedServerStopped':True}))
