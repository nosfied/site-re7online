"""Lab ONLY: external OS/process/route representations, never operationally distributed.
Runs published Bash literally. The SSH shim simulates the remote host; no network.
Canonical checkers and the closure26 RPC client remain real. No PASS callbacks.
"""
import base64,builtins,copy,hashlib,json,os,pathlib,socket,struct,subprocess,sys
from pathlib import Path
ROOT=Path(os.environ.get('RE7_LAB','/nonexistent'))
NODE=os.environ.get('RE7_LAB_NODE','/nonexistent')
RealPath=Path
CASE=os.environ.get('RE7_LAB_CASE','valid')


def remote(command,stdin):
    import shlex
    argv=shlex.split(command);sys.argv=['-c',*argv[-2:]]
    realexec=builtins.exec;realrun=subprocess.run;realsocket=socket.socket
    fake=ROOT/'fs'
    peer_calls=0;replacements=[]
    class LabPath(pathlib.PosixPath):
        def __init__(self,*args):
            p=RealPath(*args);s=str(p)
            if s.startswith(('/proc/','/home/deploy/','/opt/re7online/')):p=fake/s.lstrip('/')
            elif s=='/usr/bin/node':p=RealPath(NODE)
            super().__init__(p)
        def lstat(self,*a,**kw):
            s=super().lstat(*a,**kw)
            if CASE=='socket-atime'and peer_calls>=2 and str(self)==str(fake/'home/deploy/.pm2/rpc.sock'):
                values=list(s);values[7]+=2
                return os.stat_result(values,{'st_atime':s.st_atime+2,'st_atime_ns':s.st_atime_ns+2000000000,'st_mtime':s.st_mtime,'st_mtime_ns':s.st_mtime_ns,'st_ctime':s.st_ctime,'st_ctime_ns':s.st_ctime_ns})
            return s
    class LabSocket(realsocket):
        def getsockopt(self,level,opt,*args):
            nonlocal peer_calls
            raw=super().getsockopt(level,opt,*args)
            if (level,opt)==(socket.SOL_SOCKET,socket.SO_PEERCRED):
                pid,uid,gid=struct.unpack('3i',raw)
                if pid!=int(os.environ['RE7_LAB_SERVER']):raise RuntimeError('unexpected_lab_peer')
                peer_calls+=1
                if peer_calls==2:
                    endpoint=fake/'home/deploy/.pm2/rpc.sock'
                    if CASE=='socket-replaced':
                        endpoint.unlink();replacement=realsocket(socket.AF_UNIX);replacement.bind(str(endpoint));replacements.append(replacement)
                    if CASE=='pid-changed':(fake/'home/deploy/.pm2/pm2.pid').write_bytes(b'18677\n')
                    if CASE=='identity-absent':(fake/'proc/936386/stat').unlink()
                    if CASE=='ticks-changed':
                        p=fake/'proc/936386/stat';p.write_bytes(p.read_bytes().replace(b'2193413108',b'2193413109'))
                    ref=fake/'opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window/saved-dump.pm2.private.json'
                    if CASE=='reference-hash':ref.write_bytes(ref.read_bytes()+b' ')
                    if CASE=='reference-absent':ref.unlink()
                    if CASE=='canonical-env':(fake/'proc/936386/environ').write_bytes(b'DATABASE_URL=SYNTHETIC_PRIVATE_MARKER\0')
                return struct.pack('3i',18677 if CASE=='peer-wrong'else 18676,os.getuid(),gid)
            return raw
    socket.socket=LabSocket
    route=json.loads((ROOT/'route.json').read_text());docker_calls=0
    def run(args,*a,**kw):
        nonlocal docker_calls
        if args[0]=='/usr/bin/docker':
            docker_calls+=1
            if args[1]=='inspect':
                r=copy.deepcopy(route)
                if CASE=='route-changed':r['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']='6543'
                out=json.dumps(r).encode()
            elif args[-2:]==['-c','command -v psql']:out=b'/usr/local/bin/psql\n'
            elif args[-1]=='--version':out=b'psql (PostgreSQL) 16.6\n'
            else:
                # SQL transport is synthetic; statements/validators/classifier are real.
                sql=kw['input']
                if b'pg_control_system'in sql:out=(json.dumps({'database':'whatsapp_agent','sessionRole':'wa_agent','effectiveRole':'wa_agent','transactionReadOnly':'on','serverVersion':'160006'})+'\n'+json.dumps({'systemIdentifier':'SYNTHETIC_CLUSTER'})+'\n{}\n'+json.dumps({'allClientBackendsVisible':False})+'\n').encode()
                elif b'LIMIT 100001'in sql:out=b'{"rows":[]}\n'
                else:out=b'[]\n'
            return subprocess.CompletedProcess(args,0,out,b'')
        if args[0]=='/usr/bin/readelf':
            (ROOT/'readelf-called').write_text('UNEXPECTED_CALL')
            raise FileNotFoundError(2,'readelf unavailable in laboratory')
        return realrun(args,*a,**kw)
    subprocess.run=run
    def exec_hook(code,scope=None,local=None,**kw):
        answer=realexec(code,scope,local,**kw)
        if scope is not None and 'Path' in scope:scope['Path']=LabPath
        if getattr(code,'co_filename',None)=='<verified contracts.py>':scope['config_consumers'].__defaults__=(LabPath,scope['OPS'])
        if getattr(code,'co_filename',None)=='<verified runner>':
            scope['P']=LabPath(scope['P'])
            scope['BOOT_SHA']=hashlib.sha256((fake/'proc/sys/kernel/random/boot_id').read_bytes()).hexdigest()
            scope['NODE_SHA']=hashlib.sha256(RealPath(NODE).read_bytes()).hexdigest()
            scope['HISTORY']={k:hashlib.sha256((fake/'opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window'/k).read_bytes()).hexdigest()for k in scope['HISTORY']}
            if CASE=='snapshot-substitution':
                RealPath('/dev/shm/re7-csv-postrpc-tools-20261017-v1/pm2_rpc_fd.cjs').write_text("throw Error('MUTABLE_FILE_EXECUTED');")
        return answer
    builtins.exec=exec_hook
    if CASE=='partial-transfer':
        import io
        old=sys.stdout;sys.stdout=io.StringIO()
        try:realexec(compile(argv[5],'<SSH fixed bootstrap>','exec'),{'__name__':'__main__'})
        except SystemExit as e:code=e.code
        raw=sys.stdout.getvalue();sys.stdout=old;print(raw[:len(raw)//2],end='');return code
    realexec(compile(argv[5],'<SSH fixed bootstrap>','exec'),{'__name__':'__main__'})

SERVER=r'''
const net=require('net'),base=process.argv[1],rows=JSON.parse(process.argv[2]),endpoint=process.argv[3],kind=process.argv[4];
const Rep=require(base+'/pm2-axon/lib/sockets/rep.js'),Server=require(base+'/pm2-axon-rpc/lib/server.js');
let count=0;const listener=net.createServer(stream=>{
 const rep=new Rep();rep.addSocket(stream);
 new Server(rep).expose('getMonitorData',(opts,cb)=>{
  count++;if(kind==='reply-lost'){stream.destroy();return;}if(kind==='timeout')return;
  cb(null,rows);
 });
});
listener.listen(endpoint,()=>process.stdout.write('READY\n'));
process.on('SIGTERM',()=>{process.stdout.write('CALLS='+count+'\n');process.exit(0);});
'''

def fixture(root):
    def put(p,raw):
        p=root/'fs'/p.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_bytes(raw);return p
    before={'name':'re7-admin-front','pm_cwd':'/opt/synthetic-front','pm_exec_path':'/opt/synthetic-front/launcher.cjs','exec_interpreter':NODE,
            'args':[],'node_args':[],'namespace':'default','exec_mode':'fork_mode','watch':False,'autorestart':True,'stop_exit_codes':0,
            'env':{'DATABASE_URL':'postgresql://wa_agent:SYNTHETIC@127.0.0.1:5432/whatsapp_agent'},'axm_monitor':{'metric':1}}
    apps=[];configs=[]
    for name,pid,ticks in [('re7-whatsapp-agent',936386,'2193413108'),('re7-whatsapp-web-worker',936540,'2193413523'),('re7-admin-front',188897,'2161347676')]:
        b=copy.deepcopy(before);b['name']=name
        put('/proc/'+str(pid)+'/stat',(str(pid)+' (lab) S '+'0 '*18+ticks+'\n').encode())
        env=b'\0'.join((k+'='+v).encode()for k,v in b['env'].items())+b'\0';put('/proc/'+str(pid)+'/environ',env)
        for link,target in [('cwd',b['pm_cwd']),('exe',b['exec_interpreter'])]:(root/'fs/proc'/str(pid)/link).symlink_to(target)
        apps.append({'name':name,'pid':pid,'pm2_env':{**b,'status':'online','restart_time':0}})
        configs.append({'name':name,'cwd':b['pm_cwd'],'script':b['pm_exec_path'],'interpreter':b['exec_interpreter'],'env':b['env']})
    put('/proc/18676/stat',b'18676 (lab) S '+b'0 '*18+b'222727\n')
    put('/proc/sys/kernel/random/boot_id',b'00000000-0000-0000-0000-000000000001\n')
    put('/home/deploy/.pm2/pm2.pid',b'18676\n')
    dump=json.dumps([before]).encode()
    for n in ('dump.pm2','dump.pm2.bak'):put('/home/deploy/.pm2/'+n,dump)
    p='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window/'
    put(p+'saved-dump.pm2.private.json',dump);put(p+'source.profile.private.json',json.dumps({'apps':configs}).encode())
    put(p+'db-owner-bindings.private.json',b'{"containerId":"SYNTHETIC_ID","containerIp":"172.18.0.2","publishedPort":5432}')
    row={'Id':'SYNTHETIC_ID','Image':'sha256:SYNTHETIC_IMAGE','State':{'Running':True},'NetworkSettings':{'Networks':{'one':{'IPAddress':'172.18.0.2','GlobalIPv6Address':''}},'Ports':{'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'5432'}]}}}
    (root/'route.json').write_text(json.dumps(row));return apps
