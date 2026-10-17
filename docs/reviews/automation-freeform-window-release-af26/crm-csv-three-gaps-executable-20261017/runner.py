"""Three gates, then separately authorized SELECTs. No root observer or PM2 CLI."""
import ast,base64,fcntl,hashlib,json,os,socket,stat,subprocess
from pathlib import Path
from urllib.parse import urlsplit

P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window')
HISTORY={'saved-dump.pm2.private.json':'c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3',
 'source.profile.private.json':'a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e',
 'db-owner-bindings.private.json':'1d67ff65fc300b7bb0fb165e31a69d415d9adb5d111d3b91e444137a3a8eaeeb'}
NODE_SHA='d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e'
BOOT_SHA='f9512be026ba35cb4662d4f5ac90cc0478f8d67e68ef95eb7d9793199b8d3ce7'
EXPECTED={'re7-whatsapp-agent':(936386,'2193413108'),'re7-whatsapp-web-worker':(936540,'2193413523'),'re7-admin-front':(188897,'2161347676')}

def load(name):
    scope={'__name__':'library_only','__file__':'<verified '+name+'>'}
    exec(compile(BLOBS[name],scope['__file__'],'exec'),scope);return scope

class Capture:
    def __init__(self,q):
        self.q=q;self.lib=load('read_package.py');self.record=load('privileged_output.source')['private_record']
    def event(self,event,**data):self.record(self.q,self.lib['JOURNAL'],{'event':event,'utc':self.lib['utc'](),**data})
    def bytes(self,ident,argv,start,end,code,out,err,error=None):
        row={'id':ident,'argv':argv,'startedUtc':start,'finishedUtc':end,'exitCode':code,
             'errorClass':None if error is None else type(error).__name__,'errno':getattr(error,'errno',None)}
        for key,raw in [('stdout',out),('stderr',err)]:
            self.lib['write_artifact'](self.q/(ident+'.'+key+'.private'),raw)
            row.update({key+'Bytes':len(raw),key+'Sha256':self.lib['sha'](raw),key+'Base64':base64.b64encode(raw).decode()})
        self.event('command',**row)
    def command(self,ident,argv,*,input=None,pass_fds=(),timeout=25):
        start=self.lib['utc']();code=None;out=err=b'';error=None
        try:
            r=subprocess.run(argv,input=input,pass_fds=pass_fds,capture_output=True,timeout=timeout,
                             env={'PATH':'/usr/bin:/bin','HOME':'/home/deploy','LANG':'C'})
            code,out,err=r.returncode,r.stdout,r.stderr
        except subprocess.TimeoutExpired as e:out,err=e.stdout or b'',e.stderr or b'';error=e
        except OSError as e:error=e;err=type(e).__name__.encode()
        self.bytes(ident,argv,start,self.lib['utc'](),code,out,err,error)
        self.event('command_input',id=ident,bytes=len(input or b''),sha256=self.lib['sha'](input or b''))
        self.lib['require'](code==0 and error is None,'command_denied:'+ident)
        return out
    def observe(self,ident,fn):
        start=self.lib['utc']()
        try:value=fn()
        except Exception as e:
            self.bytes(ident,['library',ident],start,self.lib['utc'](),1,b'',type(e).__name__.encode(),e);raise
        raw=json.dumps(value,sort_keys=True).encode()
        self.bytes(ident,['library',ident],start,self.lib['utc'](),0,raw,b'');return value

def consumers():
    # Exact method ASTs selected by the accepted extractor; read from verified memory.
    c=load('contracts.py')
    class BytesPath:
        def __init__(self,*args):pass
        def read_bytes(self):return BLOBS['ops.source']
    c['config_consumers'].__globals__['Path']=BytesPath
    System,Operations=c['config_consumers']()
    return c,System,Operations

def sealed(raw):
    fd=os.memfd_create('reviewed-rpc-snapshot',os.MFD_ALLOW_SEALING)
    try:
        with os.fdopen(fd,'wb',closefd=False) as f:f.write(raw);f.flush()
        os.lseek(fd,0,0)
        fcntl.fcntl(fd,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
        return fd
    except BaseException:os.close(fd);raise

def frontend(cap,node_fd):
    lib=cap.lib;require=lib['require'];c,System,Operations=consumers();system=System();op=Operations();op.d=system
    boot=cap.observe('boot-before',lambda:lib['observe'](lib['BOOT_ID']));require(boot['sha256']==BOOT_SHA,'boot_drift')
    pidraw,pm=lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)
    require(pm['uid']==os.getuid() and int(pidraw)==18676,'daemon_pid')
    endpoint=Path('/home/deploy/.pm2/rpc.sock');meta=endpoint.lstat()
    require(stat.S_ISSOCK(meta.st_mode) and meta.st_uid==os.getuid(),'daemon_socket')
    cap.observe('daemon-before',lambda:{'identity':system.identity(18676),'socket':lib['meta'](meta),'pidSha256':lib['sha'](pidraw)})
    with socket.socket(socket.AF_UNIX) as s:
        s.settimeout(1);s.connect(str(endpoint))
        cap.observe('peer-before',lambda:c['verify_peer'](s,system,18676,'222727',os.getuid()))
        files={'/snapshot/pm2_rpc_fd.cjs':BLOBS['pm2_rpc_fd.cjs'].decode()}
        files.update({'/snapshot/'+k:v.decode() for k,v in BLOBS.items()if k.startswith('rpc/')})
        fd=sealed(json.dumps({'files':files,'socketFd':s.fileno()}).encode())
        try:
            raw=cap.command('pm2-rpc',['/proc/self/fd/'+str(node_fd),'-e',BLOBS['node_snapshot.cjs'].decode(),str(fd)],pass_fds=(s.fileno(),fd,node_fd),timeout=8)
        finally:os.close(fd)
        cap.observe('peer-after',lambda:c['verify_peer'](s,system,18676,'222727',os.getuid()))
        require(endpoint.lstat()==meta and lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)[0]==pidraw,'daemon_changed')
    apps=json.loads(raw);by={a['name']:a for a in apps}
    require(len(apps)==len(by)==3 and set(by)==set(EXPECTED),'application_population')
    for name,(pid,ticks) in EXPECTED.items():
        identity=system.identity(pid)
        require(by[name]['pid']==pid and identity and identity['ticks']==ticks and identity['state']not in ('Z','X'),'application_identity')
    def historical(name):
        raw,m=lib['stable_file'](P/name);require(lib['sha'](raw)==HISTORY[name],'historical_drift')
        cap.observe('reference-'+name,lambda:{'sha256':lib['sha'](raw),'bytes':len(raw),'metadata':m})
        return json.loads(raw)
    saved=historical('saved-dump.pm2.private.json');profiles=historical('source.profile.private.json')
    before=next(a for a in saved if a['name']=='re7-admin-front')
    for cfg in profiles['apps']:
        if cfg['name']!='re7-admin-front':op.config(by[cfg['name']],cfg)
    cap.observe('frontend-contract',lambda:c['compare_frontend'](by['re7-admin-front'],before,op))
    for name in ('dump.pm2','dump.pm2.bak'):
        raw,m=lib['stable_file'](Path('/home/deploy/.pm2')/name)
        require(m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600,'saved_permissions')
        now=next(a for a in json.loads(raw)if a['name']=='re7-admin-front')
        cap.observe('saved-'+name,lambda:c['compare_saved'](now,before))
    for name,(pid,ticks) in EXPECTED.items():
        identity=system.identity(pid);require(identity and identity['ticks']==ticks and identity['state']not in ('Z','X'),'identity_after')
    require(lib['observe'](lib['BOOT_ID'])['sha256']==boot['sha256'],'boot_after')
    cap.event('GATE2_RPC_CONFIGURATION_PASS',atomicSnapshot=False)
    return by

INSPECT=['/usr/bin/docker','inspect','--format','{"Id":{{json .Id}},"State":{"Running":{{json .State.Running}}},"Image":{{json .Image}},"NetworkSettings":{{json .NetworkSettings}}}','wa-agent-postgres']

def route(cap,apps):
    lib=cap.lib;require=lib['require'];_,System,_=consumers();system=System()
    raw,m=lib['stable_file'](P/'db-owner-bindings.private.json');require(lib['sha'](raw)==HISTORY['db-owner-bindings.private.json'],'db_binding_hash')
    binding=json.loads(raw)
    cap.observe('db-binding',lambda:{'sha256':lib['sha'](raw),'bytes':len(raw),'metadata':m})
    row=json.loads(cap.command('db-route',INSPECT))
    system.run=lambda argv:json.dumps([row])if argv==['docker','inspect','wa-agent-postgres']else (_ for _ in ()).throw(RuntimeError('unexpected_argv'))
    observed=system.db_container()
    require(observed['id']==binding['containerId'] and observed['ip']==binding['containerIp'] and observed['published']==['127.0.0.1',binding['publishedPort']],'db_route_changed')
    # Environment source is live process/canonical PM2 config already checked, never .env.
    for name in ('re7-whatsapp-agent','re7-whatsapp-web-worker'):
        value=apps[name]['pm2_env']['env']['DATABASE_URL'];u=urlsplit(value)
        require(u.scheme in ('postgres','postgresql') and u.username=='wa_agent' and u.path=='/whatsapp_agent' and
                u.hostname in ('127.0.0.1','localhost') and u.port==binding['publishedPort'],'database_channel_mismatch')
    require(type(row['Image'])is str and row['Image'].startswith('sha256:'),'container_image_identity')
    cid=observed['id']
    path=cap.command('sql-client-path',['/usr/bin/docker','exec',cid,'/bin/sh','-c','command -v psql'])
    version=cap.command('sql-client-version',['/usr/bin/docker','exec',cid,'psql','--version'])
    require(path.startswith(b'/') and path.endswith(b'\n') and len(path.splitlines())==1,'psql_path')
    require(version.startswith(b'psql (PostgreSQL) 16.'),'client_restore_major')
    cap.event('GATE3_ROUTE_CLIENT_OBSERVED',image=row['Image'],containerId=cid,ownership='UNKNOWN',imageTrust='immutable Docker container ID matched to historical binding; no pristine image attestation')
    return row

def selects(cap,row):
    # Separate operator authorization; not called by collect. No root ownership claim.
    require=cap.lib['require']
    for kind in ('identity','ownership','imports'):
        now=json.loads(cap.command(kind+'-route-before',INSPECT));require(now==row,'sql_route_before_changed')
        argv=['/usr/bin/docker','exec','-i']
        for e in ('PGHOST=','PGHOSTADDR=','PGPORT=5432','PGSERVICE=','PGSERVICEFILE=/dev/null','PGPASSFILE=/dev/null','PGPASSWORD=','PGOPTIONS=','PGCONNECT_TIMEOUT=3'):argv+=['-e',e]
        argv += [row['Id'],'psql','-X','-w','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1']
        output=cap.command(kind,argv,input=BLOBS[kind+'.sql'])
        if kind=='identity':
            result=[json.loads(x)for x in output.splitlines()if x.strip()]
            require(len(result)==4 and result[0]['database']=='whatsapp_agent' and result[0]['sessionRole']=='wa_agent' and result[0]['effectiveRole']=='wa_agent' and result[0]['transactionReadOnly']=='on','sql_identity')
            require(int(result[0]['serverVersion'])//10000==16 and result[1]['systemIdentifier'],'sql_server_frontier')
            cap.event('SQL_IDENTITY_OBSERVED',allClientBackendsVisible=result[3]['allClientBackendsVisible'],ownership='UNKNOWN')
        if kind=='imports':
            tree=ast.parse(BLOBS['capture_imports.source'])
            method=next(x for x in tree.body if isinstance(x,ast.FunctionDef)and x.name=='classify')
            scope={'require':require,'hashlib':hashlib,'json':json}
            exec(compile(ast.fix_missing_locations(ast.Module(body=[method],type_ignores=[])),'<canonical classify>','exec'),scope)
            classified=scope['classify'](json.loads(output)['rows'])
            cap.observe('imports-classification',lambda:classified)
        require(json.loads(cap.command(kind+'-route-after',INSPECT))==row,'sql_route_after_changed')
    cap.event('SELECT_OUTPUTS_PRESERVED_NOT_OWNERSHIP_CERTIFICATE',ownership='UNKNOWN',importsClassification='PENDING_OFFLINE')

def run(q,action):
    cap=Capture(q);ok=False
    cap.event('begin',manifestSha256=MANIFEST_SHA,action=action,atomicSnapshot=False)
    try:
        cap.event('GATE1_VERIFIED_SNAPSHOT',files={k:{'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest()}for k,v in BLOBS.items()})
        node=cap.observe('node-chain',lambda:cap.lib['file_chain']('/usr/bin/node',cap.lib['IMAGE_LIMIT'])[0])
        cap.lib['require'](node['sha256']==NODE_SHA,'node_image_drift')
        cap.observe('docker-chain',lambda:cap.lib['file_chain']('/usr/bin/docker',cap.lib['IMAGE_LIMIT'])[0])
        cap.command('node-elf',['/usr/bin/readelf','--wide','--program-headers','--dynamic','/usr/bin/node'])
        node_fd=os.open(node['resolved'],os.O_RDONLY|os.O_NOFOLLOW)
        try:
            cap.lib['require'](cap.lib['meta'](os.fstat(node_fd))==node['metadata'],'node_replaced_before_exec')
            apps=frontend(cap,node_fd)
            cap.lib['require'](cap.lib['meta'](os.fstat(node_fd))==node['metadata'],'node_changed_after_exec')
        finally:os.close(node_fd)
        row=route(cap,apps)
        if action=='select':selects(cap,row)
        cap.event('end',result='GATES_1_3_PASS'if action=='collect'else'SELECTS_PRESERVED',ownership='UNKNOWN',operationalCertification=False);ok=True
    except Exception as e:
        cap.event('end',result='DENY_NO_RETRY',errorClass=type(e).__name__,errno=getattr(e,'errno',None),ownership='UNKNOWN')
    return ok,cap.lib['export'](str(q))
