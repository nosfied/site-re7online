"""Reviewed entry: snapshot manifest and files once; execute those bytes, never import paths."""
import hashlib,json,os,stat,sys
from pathlib import Path

def metadata(s):
    return tuple(getattr(s,'st_'+k)for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))

def read(path,limit=8*1024*1024):
    path=Path(path)
    for p in (path,*path.parents):
        if p.is_symlink():raise RuntimeError('source_symlink')
    s=path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>limit:raise RuntimeError('source_type_size')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        if metadata(os.fstat(fd))!=metadata(s):raise RuntimeError('source_replaced')
        with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(limit+1)
        if len(raw)>limit or metadata(os.fstat(fd))!=metadata(s) or metadata(path.lstat())!=metadata(s):raise RuntimeError('source_changed')
        return raw
    finally:os.close(fd)

def execute():
    root=Path(sys.argv[1]);expected=sys.argv[2];action=sys.argv[3]
    raw=read(root/'MANIFEST.json')
    if hashlib.sha256(raw).hexdigest()!=expected:raise RuntimeError('review_manifest_drift')
    manifest=json.loads(raw);blobs={}
    for name,entry in manifest['files'].items():
        if Path(name).is_absolute() or '..' in Path(name).parts:raise RuntimeError('manifest_path')
        if not entry.get('bootstrap',False):continue
        source=Path(entry['source'])
        if not source.is_absolute():source=root/entry['relativeSource']
        value=read(source)
        if len(value)!=entry['bytes'] or hashlib.sha256(value).hexdigest()!=entry['sha256']:raise RuntimeError('review_source_drift:'+name)
        blobs[name]=value
    scope={'__name__':'reviewed_driver','__file__':'<verified driver>', 'BLOBS':blobs,'MANIFEST':manifest,
           'MANIFEST_RAW':raw,'MANIFEST_SHA':expected,'READ':read}
    exec(compile(blobs['driver.py'],'<verified driver>','exec'),scope)
    return scope['main'](action)
def main():
    import base64,contextlib,datetime,io
    root=Path(sys.argv[1]);action=sys.argv[3]
    if action not in ('materialize','collect'):raise RuntimeError('action_denied')
    # Independent, already approved canonical writer before source/manifest checks.
    writer_raw=read(root.parent/'crm-csv-r2-directed-20261017/privileged_output.source')
    if hashlib.sha256(writer_raw).hexdigest()!='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a':raise RuntimeError('canonical_writer_unavailable')
    module={'__name__':'canonical_private_library','__file__':'<pinned writer>'}
    exec(compile(writer_raw,'<pinned writer>','exec'),module)
    parent=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody');m=parent.lstat()
    if not stat.S_ISDIR(m.st_mode)or m.st_uid!=os.getuid()or stat.S_IMODE(m.st_mode)!=0o700:raise RuntimeError('custody_parent_contract')
    for q in (parent,*parent.parents):
        if q.is_symlink():raise RuntimeError('custody_parent_symlink')
    folder=parent/('csv-toolchain-launcher-20261017-v1-'+action);folder.mkdir(mode=0o700)
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();out=io.StringIO();err=io.StringIO();code=1;error=None
    try:
        with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):code=execute()
    except Exception as e:error=e;err.write(type(e).__name__)
    row={'event':'reviewed_local_launcher','argv':sys.argv,'startedUtc':started,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':code,
         'errorClass':None if error is None else type(error).__name__,'errno':getattr(error,'errno',None),'writerSha256':hashlib.sha256(writer_raw).hexdigest()}
    for key,raw in [('stdout',out.getvalue().encode()),('stderr',err.getvalue().encode())]:
        fd=os.open(folder/(key+'.private'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
        row.update({key+'Bytes':len(raw),key+'Sha256':hashlib.sha256(raw).hexdigest(),key+'Base64':base64.b64encode(raw).decode()})
    module['private_record'](folder,'privileged-output.private.jsonl',row)
    print(out.getvalue(),end='')
    if code!=0:print('LAUNCHER_DENY_PRIVATE_DIAGNOSTIC_PRESERVED_NO_RETRY')
    return code

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:
        print(json.dumps({'result':'LOCAL_PACKAGE_DENY_NO_RETRY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None)}));sys.exit(1)
