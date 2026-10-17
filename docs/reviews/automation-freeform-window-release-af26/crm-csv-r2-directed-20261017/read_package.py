"""Directed R2 proc/tool-path observation using the existing R1/R2 private custody.
Unprivileged directed mode; no executable captured code is imported or run. Every journal uses canonical private_record.
Production invocation must load these exact reviewed bytes (see COMMANDS.md).
"""
import base64
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import stat
import subprocess
import sys
import time

REMOTE = '/dev/shm/re7-csv-r2-directed-read-20261017-v1'
LOCAL = '/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r2-directed-read-20261017-v1'
HOST = 'deploy@admin.re7online.com'
WRITER_SHA = '93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a'
CONTENT = {'/proc/sys/kernel/random/boot_id'}
JOURNAL = 'privileged-output.private.jsonl'
LIMIT = 8 * 1024 * 1024
BOOT_ID = '/proc/sys/kernel/random/boot_id'
BOOT_LIMIT = 64
ORIGINAL_PATH = Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r1r2-read-20261016-v1/original-capture.private.jsonl')
ORIGIN = {
    'authorizedCommit':'ad7e866c374555bd85d3c4a2d3f1b6a45d7c7840',
    'sha256':'931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529',
    'bytes':87778,
    'readerSha256':'d01961f5388fc49b65130ac4beace468327ac3faae22d3bb6a6599005d3a73e8',
    'rootStdoutSha256':'953df83c1c270595fb5f7b8c3ed80cb576979511c7f5e23a446e8ecd0ed25692',
    'rootStartedUtc':'2026-10-17T01:22:00.199522+00:00',
    'rootFinishedUtc':'2026-10-17T01:22:00.349350+00:00',
    'observations':18,
    'state':'RAW_READS_DENY',
}


def boot_format(raw):
    require(type(raw)is bytes and re.fullmatch(
        rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n',raw)is not None,
        'boot_id_format')


def verify_origin(path=ORIGINAL_PATH):
    """Only local, read-only reuse. Never promote the original DENY to COMPLETE."""
    path=Path(path);directory(path.parent);raw,metadata=stable_file(path)
    require(metadata['uid']==os.getuid() and stat.S_IMODE(metadata['mode'])==0o600,'origin_permissions')
    require(len(raw)==ORIGIN['bytes'] and sha(raw)==ORIGIN['sha256'],'origin_bytes')
    rows=[json.loads(x)for x in raw.splitlines()]
    require(len(rows)==3 and rows[0]['event']=='r1r2_begin' and
            rows[0]['readerSha256']==ORIGIN['readerSha256'] and
            rows[-1]['event']=='r1r2_end' and rows[-1]['result']==ORIGIN['state'],'origin_deny')
    command=rows[1]
    require(command['event']=='r1r2_command' and command['id']=='root-inventory' and
            command['exitCode']==1 and command['accepted']is False,'origin_command')
    payload=base64.b64decode(command['stdoutBase64'],validate=True)
    require(sha(payload)==ORIGIN['rootStdoutSha256'] and command['stdoutSha256']==sha(payload) and
            command['stdoutBytes']==len(payload),'origin_stdout')
    require((command['startedUtc'],command['finishedUtc'])==
            (ORIGIN['rootStartedUtc'],ORIGIN['rootFinishedUtc']),'origin_times')
    value=json.loads(payload)
    require(value['result']=='RAW_INVENTORY_DENY' and len(value['targets'])==ORIGIN['observations'] and
            len({x['path']for x in value['targets']})==ORIGIN['observations'] and
            len(value['errors'])==1 and value['errors'][0]['path']==BOOT_ID,'origin_observations')
    return dict(ORIGIN)  # reference only; neither copy nor re-date the 18 observations


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def meta(s):
    return {k:getattr(s,'st_'+k) for k in
            ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns')}


def directory(path):
    p=Path(path);s=p.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and
            stat.S_IMODE(s.st_mode)==0o700,'private_directory_contract')
    for q in p.parents:
        require(not q.is_symlink(),'private_ancestor_symlink')
    return p


def new_directory(path):
    p=Path(path)
    # Existing custody parent must be owner700. /dev/shm is the documented tmpfs.
    if p.parent != Path('/dev/shm'):
        directory(p.parent)
    p.mkdir(mode=0o700)  # no parents=True, no exist_ok, no chmod/repair
    return directory(p)


def stable_file(path, limit=LIMIT):
    p=Path(path);before=p.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink==1,'file_type_or_links')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        first=os.fstat(fd);require(meta(first)==meta(before),'file_replaced_before_open')
        require(first.st_size<=limit,'file_size_bound')
        with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(limit+1)
        require(len(raw)<=limit and meta(os.fstat(fd))==meta(first) and
                meta(p.lstat())==meta(first),'file_changed_during_read')
        return raw,meta(first)
    finally:
        os.close(fd)


def writer(package):
    raw,_=stable_file(Path(package)/'privileged_output.source')
    require(sha(raw)==WRITER_SHA,'canonical_writer_hash')
    module={'__name__':'canonical_private_output','__file__':'<pinned canonical writer>'}
    exec(compile(raw,'<pinned canonical writer>','exec'),module)
    return module['private_record']


def write_artifact(path, raw):
    """Byte-preserved transport artifact, never a replacement journal writer."""
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(raw);f.flush();os.fsync(f.fileno())


def observe(path, root=Path('/')):
    """No-follow, anchored directory FDs; metadata is NOT an atomic filesystem snapshot."""
    is_boot=path==BOOT_ID
    read_limit=BOOT_LIMIT if is_boot else LIMIT  # selected before any read; no fallback
    parts=Path(path).parts[1:];fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    chains=[];opened=[]
    try:
        chains.append({'path':'/','metadata':meta(os.fstat(fd))})
        for ix,part in enumerate(parts[:-1]):
            try:s=os.stat(part,dir_fd=fd,follow_symlinks=False)
            except FileNotFoundError:
                return {'path':path,'kind':'absent','missingAncestor':'/'+ '/'.join(parts[:ix+1]),'chains':chains}
            require(stat.S_ISDIR(s.st_mode),'ancestor_type_or_symlink')
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            if meta(os.fstat(child))!=meta(s):
                os.close(child);raise RuntimeError('ancestor_replaced')
            opened.append((fd,part,meta(s)));fd=child
            chains.append({'path':'/'+ '/'.join(parts[:ix+1]),'metadata':meta(s)})
        leaf=parts[-1]
        try:s=os.stat(leaf,dir_fd=fd,follow_symlinks=False)
        except FileNotFoundError:
            return {'path':path,'kind':'absent','chains':chains}
        info={'path':path,'metadata':meta(s),'chains':chains}
        if is_boot:require(stat.S_ISREG(s.st_mode),'boot_id_not_regular')
        if stat.S_ISLNK(s.st_mode):
            info.update(kind='symlink',target=os.readlink(leaf,dir_fd=fd))
        elif stat.S_ISDIR(s.st_mode):info['kind']='directory'
        elif stat.S_ISREG(s.st_mode):
            f=os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
            try:
                require(meta(os.fstat(f))==meta(s),'leaf_replaced_before_read')
                require(s.st_size<=read_limit,'target_size_bound')
                if is_boot:
                    raw=os.read(f,read_limit)  # one bounded syscall, no buffered large read
                    boot_format(raw)
                    info['bootIdFormatVerified']=True
                else:
                    with os.fdopen(f,'rb',closefd=False) as stream:raw=stream.read(LIMIT+1)
                require(len(raw)<=read_limit and meta(os.fstat(f))==meta(s),'leaf_changed_during_read')
                info.update(kind='file',bytes=len(raw),sha256=sha(raw))
                if path in CONTENT:info['bytesBase64']=base64.b64encode(raw).decode()
            finally:os.close(f)
        else:info['kind']='other'  # discovery, never approved type
        require(meta(os.stat(leaf,dir_fd=fd,follow_symlinks=False))==meta(s),'leaf_changed_after_read')
        for parent,name,old in opened:
            require(meta(os.stat(name,dir_fd=parent,follow_symlinks=False))==old,'ancestor_changed')
        return info
    finally:
        os.close(fd)
        for parent,_,_ in reversed(opened):os.close(parent)


HISTORICAL_CANDIDATES = {'daemon': {'pid': 18676, 'historicalTicks': '222727'}, 'api': {'pid': 936386, 'historicalTicks': '2193413108', 'cwd': '/opt/re7online/releases/security-epoch-v3-36f51ebe-20261015T001500Z/apps/whatsapp-agent', 'script': '/opt/re7online/releases/security-epoch-v3-36f51ebe-20261015T001500Z/apps/whatsapp-agent/dist/index.js'}, 'worker': {'pid': 936540, 'historicalTicks': '2193413523', 'cwd': '/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified/apps/whatsapp-web-worker', 'script': '/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified/apps/whatsapp-web-worker/dist/whatsapp-web-worker/src/index.js'}, 'frontend': {'pid': 188897, 'historicalTicks': '2161347676', 'cwd': '/opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z', 'script': '/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z/launcher.cjs'}}

PM2_PATH = '/home/deploy/.npm-global/bin/pm2'  # sequencer.Bridge.apps, read only
PROC_LIMIT = 262144
IMAGE_LIMIT = 256 * 1024 * 1024
SELECTED_ENV = ('NODE_ENV','PM2_HOME','PORT','WHATSAPP_WEB_WORKER_CONTROL_PORT',
                'name','pm_exec_path','pm_cwd','exec_interpreter')


def read_at(folder, name, limit):
    """Bound selected procfs files before reading, no-follow and one FD, no fallback."""
    require('/' not in name and name not in ('.','..'),'proc_leaf')
    fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=folder)
    try:
        first=os.fstat(fd);require(stat.S_ISREG(first.st_mode),'proc_file_type')
        parts=[];count=0
        while count<=limit:
            block=os.read(fd,min(65536,limit+1-count))
            if not block:break
            parts.append(block);count+=len(block)
        require(count<=limit,'proc_read_bound')
        require(meta(os.fstat(fd))==meta(first),'proc_file_changed')
        return b''.join(parts)
    finally:os.close(fd)


def proc_identity(raw):
    # comm can contain spaces and parentheses; fields after its final ')' are fixed.
    head,sep,tail=raw.decode().rpartition(')');require(bool(sep),'proc_stat_format')
    fields=tail.split();require(len(fields)>=20,'proc_stat_fields')
    require(fields[0] not in ('Z','X'),'proc_exited')
    return {'pid':int(head.split(' ',1)[0]),'state':fields[0],
            'ppid':int(fields[1]),'ticks':fields[19]}


def file_chain(path, limit=LIMIT):
    """Record links deliberately, hash regular target only; never execute/require it."""
    pending=list(Path(path).parts[1:]);resolved=[];links=0;chain=[]
    while pending:
        part=pending.pop(0)
        if part in ('','.'):continue
        if part=='..':
            require(bool(resolved),'chain_parent_escape');resolved.pop();continue
        current=Path('/',*resolved,part);st=current.lstat()
        row={'path':str(current),'metadata':meta(st)};chain.append(row)
        if stat.S_ISLNK(st.st_mode):
            links+=1;require(links<=16,'chain_symlink_bound')
            target=os.readlink(current);row['linkTarget']=target
            require(meta(current.lstat())==meta(st),'chain_link_changed')
            if target.startswith('/'):resolved=[]
            pending=list(Path(target).parts[1:]if target.startswith('/')else Path(target).parts)+pending
        else:
            require(stat.S_ISDIR(st.st_mode)or not pending,'chain_parent_type')
            resolved.append(part)
        require(len(chain)<=128,'chain_bound')
    target=Path('/',*resolved);raw,m=stable_file(target,limit)
    for row in chain:require(meta(Path(row['path']).lstat())==row['metadata'],'chain_changed')
    return {'path':path,'resolved':str(target),'chains':chain,'metadata':m,'bytes':len(raw),'sha256':sha(raw)},raw


def executable(folder, cache):
    # Intentional procfs magic link: open the actual running image, not a mutable
    # path target. Generic files retain O_NOFOLLOW; cwd/exe links are never run.
    link=os.readlink('exe',dir_fd=folder)
    fd=os.open('exe',os.O_RDONLY|os.O_NONBLOCK,dir_fd=folder)
    try:
        first=os.fstat(fd);require(stat.S_ISREG(first.st_mode)and first.st_size<=IMAGE_LIMIT,'image_bound_or_type')
        key=tuple(meta(first).values())
        if key not in cache:
            h=hashlib.sha256();size=0
            while True:
                block=os.read(fd,65536)
                if not block:break
                size+=len(block);require(size<=IMAGE_LIMIT,'image_read_bound');h.update(block)
            require(size==first.st_size,'image_short');cache[key]=h.hexdigest()
        require(meta(os.fstat(fd))==meta(first)and os.readlink('exe',dir_fd=folder)==link,'image_changed')
        return {'linkTarget':link,'metadata':meta(first),'sha256':cache[key]}
    finally:os.close(fd)


def selected_environment(raw):
    """Never persist the full environment or a DB password. Only explicit names."""
    from urllib.parse import urlsplit,parse_qsl,unquote
    pairs={}
    for item in raw.split(b'\0'):
        key,sep,value=item.partition(b'=')
        if sep and key.decode(errors='replace')in (*SELECTED_ENV,'DATABASE_URL'):
            k=key.decode();require(k not in pairs,'duplicate_selected_env');pairs[k]=value.decode()
    result={k:v for k,v in pairs.items()if k in SELECTED_ENV}
    if 'DATABASE_URL'in pairs:
        value=pairs['DATABASE_URL'];u=urlsplit(value)
        require(u.scheme in ('postgres','postgresql')and bool(u.hostname)and bool(u.path.strip('/')),'database_channel_format')
        query=dict(parse_qsl(u.query))
        result['DATABASE_CHANNEL']={'scheme':u.scheme,'host':u.hostname,'port':u.port or 5432,
            'database':unquote(u.path.lstrip('/')),'role':unquote(u.username)if u.username is not None else None,'passwordPresent':u.password is not None,
            'sslmode':query.get('sslmode'),'credentialSource':'existing NEWDB custody; no secret value captured'}
    return result


def process(role,hint,procroot,cache):
    pid=hint['pid'];proc=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    fd=None
    try:
        fd=os.open(str(pid),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=proc)
        before=proc_identity(read_at(fd,'stat',4096));require(before['pid']==pid,'proc_pid')
        require(os.fstat(fd).st_uid==os.getuid(),'proc_not_deploy_owned')
        require(before['ticks']==hint['historicalTicks'],'historical_candidate_ticks_drift')
        cwd=os.readlink('cwd',dir_fd=fd);image=executable(fd,cache)
        command=read_at(fd,'cmdline',16384)
        row={'role':role,'identity':before,'uid':os.fstat(fd).st_uid,'cwd':cwd,'executable':image,
             'cmdlineSha256':sha(command),'cmdlineBytes':len(command)}
        if role=='daemon':
            require(before['ppid']==1,'daemon_parent_drift')
            require(command.startswith(b'PM2 ')and b'/home/deploy/.pm2'in command,'daemon_title_unconfirmed')
            row['historicalTicksMatch']=before['ticks']==hint['historicalTicks']
            require(row['historicalTicksMatch'],'daemon_historical_ticks_drift')
        else:
            env=selected_environment(read_at(fd,'environ',PROC_LIMIT));row['selectedEnvironment']=env
            require(before['ppid']==HISTORICAL_CANDIDATES['daemon']['pid'],'process_parent')
            require(cwd==hint['cwd'],'process_cwd_drift')
            script_seen=hint['script'].encode()in command or env.get('pm_exec_path')==hint['script']
            require(script_seen,'process_script_unconfirmed');row['scriptMarkerConfirmed']=True
            if role in ('api','worker'):require('DATABASE_CHANNEL'in env,'database_channel_missing')
        # File descriptor links only; no reading sockets, pipes or captured scripts.
        fds=os.open('fd',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
        try:
            names=os.listdir(fds);require(len(names)<=4096,'proc_fd_bound');sockets=[]
            for name in names:
                link=os.readlink(name,dir_fd=fds)
                if re.fullmatch(r'socket:\[[0-9]+\]',link):sockets.append(link)
            row['sockets']=sorted(sockets)
        finally:os.close(fds)
        after=proc_identity(read_at(fd,'stat',4096))
        require((before['pid'],before['ppid'],before['ticks'])==(after['pid'],after['ppid'],after['ticks']),'process_identity_changed')
        require(cwd==os.readlink('cwd',dir_fd=fd),'process_cwd_changed')
        row['identityRechecked']=True
        return row
    finally:
        if fd is not None:os.close(fd)
        os.close(proc)


def descendant(procroot, cache):
    """One historically observed frontend child, not process-table discovery."""
    root=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    fd=None;parent=None;task=None;tasks=None
    try:
        parent=os.open('188897',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        tasks=os.open('task',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
        task=os.open('188897',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=tasks)
        children=[int(x)for x in read_at(task,'children',4096).split()]
        require(188910 in children,'frontend_child_not_confirmed')
        fd=os.open('188910',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        before=proc_identity(read_at(fd,'stat',4096))
        require(before['pid']==188910 and before['ppid']==188897 and os.fstat(fd).st_uid==os.getuid(),'frontend_child_identity')
        row={'identity':before,'parentChildren':children,'executable':executable(fd,cache)}
        row['sockets']=fd_sockets(fd)
        after=proc_identity(read_at(fd,'stat',4096))
        require((after['pid'],after['ppid'],after['ticks'])==(before['pid'],before['ppid'],before['ticks']),'frontend_child_changed')
        return row
    finally:
        for q in (fd,task,tasks,parent,root):
            if q is not None:os.close(q)


def fd_sockets(procfd):
    fds=os.open('fd',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=procfd)
    try:
        names=os.listdir(fds);require(len(names)<=4096,'proc_fd_bound');sockets=[]
        for name in names:
            link=os.readlink(name,dir_fd=fds)
            if re.fullmatch(r'socket:\[[0-9]+\]',link):sockets.append(link)
        return sorted(sockets)
    finally:os.close(fds)


def proxy_channel(procroot):
    root=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fd=None
    try:
        fd=os.open('177517',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        before=proc_identity(read_at(fd,'stat',4096));argv=read_at(fd,'cmdline',16384).rstrip(b'\0').split(b'\0')
        require(argv and argv[0]==b'/usr/bin/docker-proxy','proxy_not_confirmed')
        allowed={b'-host-ip',b'-host-port',b'-container-ip',b'-container-port',b'-proto'}
        require(len(argv)%2==1 and len(argv)<=17,'proxy_argv_shape')
        values={}
        for k,v in zip(argv[1::2],argv[2::2]):
            require(k in allowed and k.decode()not in values,'proxy_flag_unknown');values[k.decode()]=v.decode()
        require(values.get('-proto')=='tcp'and values.get('-host-port')=='5432','proxy_endpoint_changed')
        after=proc_identity(read_at(fd,'stat',4096));require(before['ticks']==after['ticks']and before['ppid']==after['ppid'],'proxy_identity_changed')
        return {'identity':before,'uid':os.fstat(fd).st_uid,'args':values,
                'containerIdentity':'UNKNOWN; no Docker inspection/SQL executed'}
    finally:
        if fd is not None:os.close(fd)
        os.close(root)


def tcp_tables(procroot):
    root=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);proc=None;net=None
    try:
        proc=os.open('18676',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        net=os.open('net',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=proc)
        rows=[]
        for name in ('tcp','tcp6'):
            raw=read_at(net,name,1024*1024)
            for line in raw.decode().splitlines()[1:]:
                parts=line.split();require(len(parts)>=10,'tcp_table_shape')
                local=int(parts[1].rsplit(':',1)[1],16);remote=int(parts[2].rsplit(':',1)[1],16)
                if local in (3000,3001,8787,5432)or remote==5432:
                    rows.append({'table':name,'local':parts[1],'remote':parts[2],'localPort':local,'remotePort':remote,'state':parts[3],'inode':parts[9]})
        return rows
    finally:
        for q in (net,proc,root):
            if q is not None:os.close(q)


def interval_checks(rows,procroot):
    by={x['label']:x['value']for x in rows}
    for role,hint in HISTORICAL_CANDIDATES.items():
        root=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fd=None
        try:
            fd=os.open(str(hint['pid']),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
            identity=proc_identity(read_at(fd,'stat',4096));old=by['process-'+role]
            require((identity['pid'],identity['ppid'],identity['ticks'])==
                    tuple(old['identity'][k]for k in ('pid','ppid','ticks')),'interval_identity_changed')
            require(os.readlink('cwd',dir_fd=fd)==old['cwd']and os.readlink('exe',dir_fd=fd)==old['executable']['linkTarget'],'interval_proc_links_changed')
        finally:
            if fd is not None:os.close(fd)
            os.close(root)
    for entry in by['pm2-pid-current']['chains']:
        require(meta(Path(entry['path']).lstat())==entry['metadata'],'pm2_pidfile_interval_changed')
    require(by['pm2-package']['entrypointSha256']==by['pm2-entrypoint']['sha256']and by['pm2-package']['entrypointResolved']==by['pm2-entrypoint']['resolved'],'pm2_entrypoint_changed_between_reads')
    for label in ('pm2-entrypoint','pm2-package','node-entrypoint'):
        for entry in by[label]['chains']:
            require(meta(Path(entry['path']).lstat())==entry['metadata'],'tool_chain_interval_changed')
    node=by['node-entrypoint']
    for role in HISTORICAL_CANDIDATES:
        require(by['process-'+role]['executable']['sha256']==node['sha256'],'node_image_different')
    ports={'api':3001,'worker':8787,'frontend-child':3000}
    for role,port in ports.items():
        row=by['frontend-child']if role=='frontend-child'else by['process-'+role]
        inodes={s[8:-1]for s in row['sockets']}
        require(any(r['state']=='0A'and r['localPort']==port and r['inode']in inodes for r in by['tcp-tables']),'listener_relation_unconfirmed')
    api=by['process-api']['selectedEnvironment']['DATABASE_CHANNEL']
    worker=by['process-worker']['selectedEnvironment']['DATABASE_CHANNEL']
    require(api==worker,'database_channels_differ')
    proxy=by['sql-proxy']['args']
    require(api['host']in ('127.0.0.1','localhost')and api['port']==int(proxy['-host-port']),'database_proxy_relation_unconfirmed')
    return {'freshProcTuplesRechecked':True,'listenerFdRelationsConfirmed':True,
            'databaseChannel':'configuration and TCP proxy only; server/database/role identity still requires future READ ONLY SQL'}


def current_pidfile():
    row,raw=file_chain('/home/deploy/.pm2/pm2.pid',64)
    require(re.fullmatch(rb'[0-9]+\n?',raw)is not None,'pm2_pidfile_format')
    require(int(raw)==HISTORICAL_CANDIDATES['daemon']['pid'],'pm2_pidfile_changed_candidate')
    require(row['metadata']['uid']==os.getuid(),'pm2_pidfile_owner')
    row['pid']=int(raw);return row


def directed_inventory(procroot=Path('/proc')):
    rows=[];errors=[];cache={};boot=None
    def attempt(label,fn):
        started=utc()
        try:
            value=fn();rows.append({'label':label,'startedUtc':started,'finishedUtc':utc(),'value':value});return value
        except Exception as e:
            errors.append({'label':label,'startedUtc':started,'finishedUtc':utc(),
                           'errorClass':type(e).__name__,'errno':getattr(e,'errno',None),
                           'reason':str(e)if type(e)is RuntimeError else None});return None
    # Both 64B boot reads are necessary to bind this NEW interval. Neither binds
    # any historical observation. No six-command replay or systemctl/ps/ss here.
    boot=attempt('boot-before',lambda:observe(BOOT_ID))
    attempt('pm2-pid-current',current_pidfile)
    for role,hint in HISTORICAL_CANDIDATES.items():
        value=attempt('process-'+role,lambda role=role,hint=hint:process(role,hint,procroot,cache))
        if value is not None and boot is not None:value['identity']['bootSha256']=boot['sha256']
    attempt('frontend-child',lambda:descendant(procroot,cache))
    attempt('sql-proxy',lambda:proxy_channel(procroot))
    attempt('tcp-tables',lambda:tcp_tables(procroot))
    attempt('pm2-entrypoint',lambda:file_chain(PM2_PATH)[0])
    def package_metadata():
        entry,_=file_chain(PM2_PATH);package=Path(entry['resolved']).parent.parent/'package.json'
        row,raw=file_chain(str(package));value=json.loads(raw)
        require(value.get('name')=='pm2','pm2_package_name');row['packageVersion']=value.get('version')
        row['entrypointSha256']=entry['sha256'];row['entrypointResolved']=entry['resolved'];return row
    attempt('pm2-package',package_metadata)
    attempt('node-entrypoint',lambda:file_chain('/usr/bin/node',IMAGE_LIMIT)[0])
    if not errors:attempt('interval-checks',lambda:interval_checks(rows,procroot))
    endboot=attempt('boot-after',lambda:observe(BOOT_ID))
    if boot is not None and endboot is not None and boot['sha256']!=endboot['sha256']:
        errors.append({'label':'boot-interval','errorClass':'RuntimeError','errno':None,'reason':'boot_changed'})
    return {'result':'DIRECTED_INVENTORY_COMPLETE'if not errors else'DIRECTED_INVENTORY_DENY',
            'utc':utc(),'targets':rows,'errors':errors,'atomicSnapshot':False,
            'operationalCertification':False,'sqlExecuted':False}


def validate_directed_inventory(value):
    require(value['result']=='DIRECTED_INVENTORY_COMPLETE'and not value['errors'],'directed_inventory_denied')
    expected=['boot-before','pm2-pid-current']+['process-'+role for role in HISTORICAL_CANDIDATES]+['frontend-child','sql-proxy','tcp-tables','pm2-entrypoint','pm2-package','node-entrypoint','interval-checks','boot-after']
    require([r['label']for r in value['targets']]==expected,'directed_inventory_targets')
    by={r['label']:r['value']for r in value['targets']}
    for name in ('boot-before','boot-after'):
        r=by[name];raw=base64.b64decode(r['bytesBase64'],validate=True);boot_format(raw)
        require(sha(raw)==r['sha256']and len(raw)==r['bytes'],'boot_bytes')
    require(by['boot-before']['sha256']==by['boot-after']['sha256'],'boot_changed')
    for role,hint in HISTORICAL_CANDIDATES.items():
        r=by['process-'+role];require(r['identity']['pid']==hint['pid']and r['identity']['ticks']==hint['historicalTicks']and r['identity']['bootSha256']==by['boot-before']['sha256']and r['identityRechecked']is True,'directed_process_binding')
        if role!='daemon':require(r['identity']['ppid']==HISTORICAL_CANDIDATES['daemon']['pid']and r['scriptMarkerConfirmed'],'directed_process_relation')
    require(value['operationalCertification']is False and value['sqlExecuted']is False,'not_operational_certificate')


def specs(raw):
    return [('directed-proc',['/usr/bin/python3','-B','-I','-S','-','directed'],raw)]


def collect(package, raw, target=REMOTE, run=subprocess.run):
    record=writer(package);folder=new_directory(target)
    record(folder,JOURNAL,{'event':'r2_directed_begin','utc':utc(),'readerSha256':sha(raw),'origin':dict(ORIGIN),
           'commandIds':[x[0]for x in specs(raw)],'certification':False})
    success=True
    for ident,args,stdin in specs(raw):
        started=utc();code=None;stdout=b'';stderr=b'';error=None;error_number=None
        try:
            result=run(args,input=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                       timeout=45 if ident=='directed-proc' else 10,check=False,
                       env={'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','LANG':'C','HOME':'/home/deploy'})
            code,stdout,stderr=result.returncode,result.stdout,result.stderr
        except subprocess.TimeoutExpired as e:
            stdout,stderr=e.stdout or b'',e.stderr or b'';error='TimeoutExpired'
        except OSError as e:
            stderr=str(e).encode();error=type(e).__name__;error_number=e.errno
        valid=code==0
        if valid and ident=='directed-proc':
            try:
                validate_directed_inventory(json.loads(stdout))
            except Exception:valid=False
        record(folder,JOURNAL,{'event':'r2_directed_command','id':ident,'argv':args,
          'stdinBytes':len(stdin or b''),'stdinSha256':sha(stdin or b''),
          'startedUtc':started,'finishedUtc':utc(),'exitCode':code,'errorClass':error,'errno':error_number,
          'accepted':valid,'stdoutBytes':len(stdout),'stderrBytes':len(stderr),
          'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),
          'stdoutBase64':base64.b64encode(stdout).decode(),'stderrBase64':base64.b64encode(stderr).decode()})
        if not valid:success=False;break
    record(folder,JOURNAL,{'event':'r2_directed_end','utc':utc(),'result':'DIRECTED_READS_COMPLETE'if success else'DIRECTED_READS_DENY','certification':False})
    return success


def export(target=REMOTE):
    folder=directory(target);raw,m=stable_file(folder/JOURNAL)
    require(m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600,'capture_permissions')
    return {'format':'R2_DIRECTED_BYTE_EXACT_TRANSFER_V1','source':str(folder/JOURNAL),
            'metadata':m,'sourceUid':os.getuid(),'bytes':len(raw),'sha256':sha(raw),
            'bytesBase64':base64.b64encode(raw).decode(),'atomicSnapshot':False}


def validate_capture(raw, reader_raw):
    reader_hash=sha(reader_raw)
    lines=[json.loads(x)for x in raw.splitlines()];require(len(lines)>=3,'capture_incomplete')
    begin,end=lines[0],lines[-1];expected=[x[0]for x in specs(b'')]
    require(begin['event']=='r2_directed_begin' and begin['readerSha256']==reader_hash and
            begin['commandIds']==expected and begin['origin']==ORIGIN,'capture_origin')
    commands=lines[1:-1]
    require(len(commands)==len(expected),'command_count')
    for row,ident in zip(commands,expected):
        require(row['event']=='r2_directed_command' and row['id']==ident,'command_identity')
        require(row['argv']==next(x[1]for x in specs(b'')if x[0]==ident),'command_argv')
        if ident!='directed-proc':
            require(row['stdinBytes']==0 and row['stdinSha256']==sha(b''),'unexpected_stdin')
        for channel in ('stdout','stderr'):
            data=base64.b64decode(row[channel+'Base64'],validate=True)
            require(len(data)==row[channel+'Bytes'] and sha(data)==row[channel+'Sha256'],'command_bytes')
        require(row['accepted']is True and row['exitCode']==0 and row['errorClass']is None,'command_denied')
        if ident=='directed-proc':
            require(row['stdinSha256']==reader_hash and row['stdinBytes']==len(reader_raw),'reader_stdin_binding')
            validate_directed_inventory(json.loads(base64.b64decode(row['stdoutBase64'])))
    require(end['event']=='r2_directed_end' and end['result']=='DIRECTED_READS_COMPLETE' and
            end['certification']is False,'capture_terminal_denied')
    return lines


def custody(package, raw, target=LOCAL, run=subprocess.run):
    record=writer(package);origin=verify_origin();folder=new_directory(target)
    args=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,
          '/usr/bin/python3','-B','-I','-S','-','export']
    code=None;stdout=b'';stderr=b'';error=None;error_number=None
    try:
        result=run(args,input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,check=False)
        code,stdout,stderr=result.returncode,result.stdout,result.stderr
    except subprocess.TimeoutExpired as e:stdout,stderr=e.stdout or b'',e.stderr or b'';error='TimeoutExpired'
    except OSError as e:stderr=str(e).encode();error=type(e).__name__;error_number=e.errno
    # Preserve incomplete/failed transport bytes as well; no overwrite or resume.
    write_artifact(folder/'transfer.stdout.private',stdout);write_artifact(folder/'transfer.stderr.private',stderr)
    record(folder,JOURNAL,{'event':'r1r2_transport','argv':args,'exitCode':code,'errorClass':error,'errno':error_number,
      'stdoutBytes':len(stdout),'stderrBytes':len(stderr),'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),'utc':utc()})
    try:
        require(code==0 and error is None,'transfer_failed')
        frame=json.loads(stdout);require(frame['format']=='R2_DIRECTED_BYTE_EXACT_TRANSFER_V1' and
          frame['source']==REMOTE+'/'+JOURNAL,'transfer_source')
        original=base64.b64decode(frame['bytesBase64'],validate=True)
        require(len(original)==frame['bytes'] and sha(original)==frame['sha256'],'transfer_bytes')
        require(stat.S_ISREG(frame['metadata']['mode']) and stat.S_IMODE(frame['metadata']['mode'])==0o600 and
                frame['metadata']['uid']==frame['sourceUid'] and frame['metadata']['nlink']==1 and frame['metadata']['size']==len(original),'transfer_source_metadata')
        write_artifact(folder/'complement-capture.private.jsonl',original)
        lines=validate_capture(original,raw)
        for row in lines:record(folder,JOURNAL,row)
        record(folder,'sequencer.journal.jsonl',{'event':'R2_DIRECTED_CUSTODY_COMPLETE_NOT_CERTIFIED','origin':origin,'originalCollectionCompleted':False,'atomicSnapshot':False,
          'sourceSha256':sha(original),'sourceBytes':len(original),'commands':len(lines)-2,
          'readerSha256':sha(raw),'utc':utc(),'certification':False})
        return True
    except Exception as e:
        record(folder,'sequencer.journal.jsonl',{'event':'R2_DIRECTED_CUSTODY_DENY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None),'utc':utc()})
        return False


def main():
    require(len(sys.argv)==2,'exact_action_required');action=sys.argv[1]
    if action=='directed':
        value=directed_inventory();print(json.dumps(value,sort_keys=True));return not value['errors']
    if action=='export':print(json.dumps(export(),sort_keys=True));return True
    if action=='check-origin':
        verify_origin();print('ORIGINAL_DENY_REFERENCE_VERIFIED_NO_WRITE');return True
    require(action in ('collect','custody'),'action_denied')
    # Launcher supplies already reviewed bytes, also used unchanged as stdin to directed/export.
    raw=globals().get('APPROVED_RAW');require(type(raw)is bytes,'reviewed_launcher_required')
    package=Path(__file__).resolve().parent
    ok=collect(package,raw)if action=='collect'else custody(package,raw)
    print('R2_DIRECTED_COLLECTION_COMPLETE_NOT_CERTIFIED'if ok and action=='collect'else
          'R2_DIRECTED_CUSTODY_COMPLETE_NOT_CERTIFIED'if ok else'R2_DIRECTED_DENY_PRESERVE_NO_RETRY')
    return ok

if __name__=='__main__':
    try:sys.exit(0 if main()else 1)
    except Exception as e:
        print(json.dumps({'result':'R2_DIRECTED_DENY_PRESERVE_NO_RETRY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None)}),file=sys.stderr);sys.exit(1)
