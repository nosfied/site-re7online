"""Lab transport/host projection only. No production observations.
OS file reads, readelf FD execution, launcher/export/custody are real.
SSH, selected image reference and proc identity/maps are explicit fixtures.
"""
import builtins,hashlib,json,os,pathlib,shlex,subprocess,sys
from pathlib import Path

def remote(command,stdin):
    root=Path(os.environ['RE7_DISCOVERY_LAB']);case=os.environ['RE7_DISCOVERY_CASE'];fs=root/'fs'
    argv=shlex.split(command);sys.argv=['-c',*argv[-2:]]
    realexec=builtins.exec;realopen=os.open;realstat=os.lstat;realstat2=os.stat;realaccess=os.access;realrun=subprocess.run
    def mapped(path):
        s=os.fsdecode(path)
        if s.startswith(('/home/deploy/','/proc/999987','/usr/local/','/usr/sbin/','/usr/bin/node','/sbin/','/bin/node')):return str(fs/s.lstrip('/'))
        return path
    replaced=False;selected=False
    def opened(path,*a,**kw):
        nonlocal replaced
        s=os.fsdecode(path)if isinstance(path,(str,bytes,os.PathLike))else ''
        if case=='replacement' and s==str(fs/'usr/bin/node') and not replaced:
            # Between canonical snapshot and opened(row). Earlier stable_file open
            # uses this same path too; trigger only after analysis selection flag.
            if selected:
                replacement=fs/'usr/bin/other';replacement.write_bytes((fs/'usr/bin/node').read_bytes());os.replace(replacement,fs/'usr/bin/node');replaced=True
        return realopen(mapped(path)if s else path,*a,**kw)
    os.open=opened
    os.lstat=lambda p,*a,**kw:realstat(mapped(p),*a,**kw)
    os.stat=lambda p,*a,**kw:realstat2(mapped(p),*a,**kw)
    os.access=lambda p,*a,**kw:realaccess(mapped(p),*a,**kw)
    def run(args,*a,**kw):
        if args[0].startswith('/proc/self/fd/'):
            raw=os.readlink(args[0]);assert 'readelf' in raw,'target_code_must_never_execute'
            with (root/'analysis-calls').open('a')as f:f.write('readelf\n')
        return realrun(args,*a,**kw)
    subprocess.run=run
    def execute(code,scope=None,*a,**kw):
        result=realexec(code,scope,*a,**kw)
        if isinstance(scope,dict):
            if scope.get('__name__')=='reviewed_runner':
                scope['NODE_SHA']=hashlib.sha256((fs/'usr/bin/node').read_bytes()).hexdigest()
            if scope.get('__file__')=='<verified read_package.py>':
                chain=scope['file_chain'];observe=scope['observe'];meta=scope['meta']
                def host_meta(s):
                    value=meta(s)
                    if value['uid']==65534:value['uid']=0;value['gid']=0 # host root outside user namespace
                    return value
                scope['meta']=host_meta
                def file_chain(path,limit=8*1024*1024):
                    nonlocal selected
                    if path=='/usr/bin/readelf' and case=='missing-tool':raise FileNotFoundError(2,'synthetic tool absent')
                    if path=='/usr/bin/readelf' and case=='denied-tool':raise PermissionError(13,'synthetic access denied')
                    row,raw=chain(mapped(path),limit);row['path']=path
                    if path=='/usr/bin/node':selected=True
                    return row,raw
                scope['file_chain']=file_chain
                scope['observe']=lambda path:observe(path,root=fs)if path==scope['BOOT_ID']else observe(path)
        return result
    builtins.exec=execute
    # Execute the unchanged authenticated remote launcher program received by SSH.
    exec(argv[argv.index('-c')+1],{'__name__':'__main__','__file__':'<lab remote>'})

def fixture(root):
    import shutil
    fs=root/'fs'
    (root/'analysis-calls').write_text('')
    def put(name,raw):
        p=fs/name.lstrip('/');p.parent.mkdir(mode=0o700,parents=True,exist_ok=True);p.write_bytes(raw);return p
    package=Path('/tmp/re7-b4-toolchain-20261016/node_modules/pm2')
    for n in ('bin/pm2','lib/binaries/CLI.js','package.json'):
        put('/home/deploy/.npm-global/lib/node_modules/pm2/'+n,(package/n).read_bytes())
    alias=fs/'home/deploy/.npm-global/bin/pm2';alias.parent.mkdir(parents=True);alias.symlink_to('../lib/node_modules/pm2/bin/pm2')
    node=put('/usr/bin/node',Path('/usr/bin/true').read_bytes());node.chmod(0o700) # new synthetic image only, never executed
    put('/home/deploy/.pm2/pm2.pid',b'999987\n')
    put('/proc/999987/stat',b'999987 (lab daemon) S '+b'0 '*18+b'12345\n')
    put('/proc/999987/maps',b'1000-2000 r-xp 00000000 00:00 1 /usr/bin/node\n')
    (fs/'proc/999987/exe').symlink_to(node)
    put('/proc/sys/kernel/random/boot_id',b'00000000-0000-0000-0000-000000000001\n')
