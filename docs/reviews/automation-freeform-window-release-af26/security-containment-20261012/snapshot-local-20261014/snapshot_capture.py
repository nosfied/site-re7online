"""Shared inventory/dump snapshot. Library only: no production entrypoint/credentials.
Caller supplies an attested canonical backup lock and exact connection identity.
No retry, retention deletion, provider, scheduler or writer fencing.
"""
import ctypes,ctypes.util,datetime,fcntl,hashlib,json,os,re,stat,subprocess,time
from pathlib import Path

class Denied(RuntimeError): pass

def require(v,reason):
    if not v: raise Denied(reason)
def private_directory(p):
    p=Path(p).absolute()
    for a in [p,*p.parents]: require(not a.is_symlink(),'output_symlink')
    s=p.lstat();require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o700,'output_type_owner_mode')
    return p

def write(p,v):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:json.dump(v,f);f.write('\n');f.flush();os.fsync(f.fileno())
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()

class Connection:
    def __init__(self,conninfo):
        self.lib=ctypes.CDLL(ctypes.util.find_library('pq'));l=self.lib
        for name,args,result in [('PQconnectdb',[ctypes.c_char_p],ctypes.c_void_p),('PQstatus',[ctypes.c_void_p],ctypes.c_int),('PQexec',[ctypes.c_void_p,ctypes.c_char_p],ctypes.c_void_p),('PQsendQuery',[ctypes.c_void_p,ctypes.c_char_p],ctypes.c_int),('PQgetResult',[ctypes.c_void_p],ctypes.c_void_p),('PQresultStatus',[ctypes.c_void_p],ctypes.c_int),('PQntuples',[ctypes.c_void_p],ctypes.c_int),('PQnfields',[ctypes.c_void_p],ctypes.c_int),('PQgetvalue',[ctypes.c_void_p,ctypes.c_int,ctypes.c_int],ctypes.c_char_p),('PQclear',[ctypes.c_void_p],None),('PQfinish',[ctypes.c_void_p],None)]:
            f=getattr(l,name);f.argtypes=args;f.restype=result
        self.handle=l.PQconnectdb(conninfo.encode())
        if not self.handle or l.PQstatus(self.handle)!=0:self.close();raise Denied('connection_failed')
    def query(self,q):
        require(self.lib.PQsendQuery(self.handle,q.encode())==1,'snapshot_query_send_failed')
        rows=[];failed=False
        while True:
            r=self.lib.PQgetResult(self.handle)
            if not r:break
            try:
                status=self.lib.PQresultStatus(r)
                if status not in (1,2):failed=True
                elif status==2:rows=[[self.lib.PQgetvalue(r,i,j).decode()for j in range(self.lib.PQnfields(r))]for i in range(self.lib.PQntuples(r))]
            finally:self.lib.PQclear(r)
        require(not failed,'snapshot_query_failed')
        return rows
    def close(self):
        if getattr(self,'handle',None):self.lib.PQfinish(self.handle);self.handle=None

IDENTITY_SQL="SELECT json_build_object('database',current_database(),'databaseOid',(SELECT oid FROM pg_database WHERE datname=current_database()),'user',session_user,'serverVersion',current_setting('server_version_num'),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()))::text"

def capture(*,out,lock_path,conninfo,dump_command,inventory_sql,expected_identity,timeout=180,after_inventory=None):
    """Exact commands are caller-owned sealed inputs. Holder and dump same identity.
    Hook exists for isolated concurrency/failure tests; never run a provider.
    """
    out=private_directory(out);require(not list(out.iterdir()),'output_not_empty')
    lock=None;holder=None;child=None;stage='lock';started=utc()
    try:
        lock=os.open(lock_path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        s=os.fstat(lock);require(stat.S_ISREG(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)in (0o600,0o640)and s.st_nlink==1,'lock_type_owner_mode')
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        stage='holder';holder=Connection(conninfo)
        holder.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='240s'; SET LOCAL TIME ZONE 'UTC'")
        identity=json.loads(holder.query(IDENTITY_SQL)[0][0]);require(identity==expected_identity,'source_identity_drift')
        snapshot=holder.query('SELECT pg_export_snapshot()')[0][0];require(re.fullmatch(r'[0-9A-F]+-[0-9A-F]+-[0-9]+',snapshot),'snapshot_format')
        stage='inventory';inventory=json.loads(holder.query(inventory_sql)[0][0]);write(out/'inventory.private.json',inventory)
        if after_inventory:after_inventory(holder,snapshot)
        stage='dump';env={k:v for k,v in os.environ.items()if not k.startswith('PG')and k!='DATABASE_URL'}
        env['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=180000 -c lock_timeout=5000'
        with (out/'database.dump').open('xb')as dump,(out/'dump.private.stderr').open('xb')as err:
            os.chmod(dump.name,0o600);os.chmod(err.name,0o600)
            child=subprocess.Popen([*dump_command,'--snapshot='+snapshot],stdout=dump,stderr=err,env=env,start_new_session=True)
            end=time.monotonic()+timeout
            while child.poll()is None:
                require(time.monotonic()<end,'dump_timeout')
                holder.query('SELECT 1') # actively verify exporter alive until dump finishes
                time.sleep(.05)
            require(child.returncode==0,'dump_failed');dump.flush();os.fsync(dump.fileno())
        stage='certify';holder.query('SELECT 1');require(json.loads(holder.query(IDENTITY_SQL)[0][0])==expected_identity,'source_identity_drift')
        receipt={'result':'SHARED_SNAPSHOT_CAPTURE_COMPLETE','startedUtc':started,'finishedUtc':utc(),'sourceIdentity':identity,'snapshot':snapshot,'inventorySha256':digest(out/'inventory.private.json'),'dumpSha256':digest(out/'database.dump'),'dumpBytes':(out/'database.dump').stat().st_size,'lockPath':str(lock_path),'readOnly':True,'holderAliveThroughCompletion':True,'automaticRetry':False}
        write(out/'receipt.private.json',receipt);return receipt
    except Exception as e:
        write(out/'denial.private.json',{'result':'DENY','stage':stage,'errorClass':type(e).__name__,'reason':str(e)if isinstance(e,Denied)else None,'startedUtc':started,'finishedUtc':utc(),'automaticRetry':False})
        raise
    finally:
        if child and child.poll()is None:
            os.killpg(child.pid,15)
            try:child.wait(timeout=3)
            except subprocess.TimeoutExpired:os.killpg(child.pid,9);child.wait()
        if holder:
            try:holder.query('ROLLBACK')
            except Exception:pass
            holder.close()
        if lock is not None:os.close(lock)
