"""Lab-only SSH shim: exact reviewed REMOTE_LAUNCH, real local metadata/statvfs.
No network and no production target. Enforces no remote writes/subprocess/content.
"""
import io,os,shlex,stat,subprocess,sys

def remote(command):
    argv=shlex.split(command);sys.argv=['-c',*argv[-2:]]
    realopen=os.open;realvfs=os.statvfs;calls=[]
    def opened(path,flags,*a,**kw):
        assert not flags&(os.O_CREAT|os.O_TRUNC|os.O_WRONLY|os.O_RDWR|os.O_APPEND),'remote_write_forbidden'
        assert flags&os.O_DIRECTORY,'only_directory_fds_permitted'
        return realopen(path,flags,*a,**kw)
    def vfs(fd):
        assert isinstance(fd,int);calls.append(fd);return realvfs(fd)
    os.open=opened;os.statvfs=vfs
    def denied(*a,**kw):raise AssertionError('remote_subprocess_forbidden')
    subprocess.run=denied
    output=sys.stdout
    if os.environ['RE7_CAPACITY_CASE']=='reply-lost':sys.stdout=io.StringIO()
    try:exec(argv[argv.index('-c')+1],{'__name__':'__main__'})
    finally:
        assert len(calls)==1,'exactly_one_statvfs'
        if os.environ['RE7_CAPACITY_CASE']=='reply-lost':
            raw=sys.stdout.getvalue();sys.stdout=output;print(raw[:23],end='')
