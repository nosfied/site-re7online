"""Offline replay of pinned custody only; no /proc, network, or production entrypoint."""
import base64,hashlib,io,json,os,stat,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
CAPTURE=CUSTODY/'csv-postrpc-diagnostics-20261017-v1/capture.private.jsonl'
CAPTURE_SHA='67d9a84669f7941d1783a3b917d9a26d568ee3e7e531e7b4c070f805ae810f5e'
ARCHIVE=CUSTODY/'crm-csv-staging-20261016/final-preparation-20261016T105404Z/original-recovery-complete-evidence.private.tar'
ARCHIVE_SHA='32e0cb1de5dac716027fc8face5cc60f8b996ec0ca9de6b18363cbbb84b30076'
SOURCES={
 'old_contract':('crm-csv-three-gaps-procedure-20261017/contracts.py','8b6fd62ccaf1a9e0c866908eee57041e464156d62dbe9b9031493ef55695d198'),
 'preserved_environment':('preventive-api-frontend3227-prepared-20261010/preserved_frontend_environment.py','5b4a0f2bdf741ce639c66a00c2e63c4e37c5ccfe2a643ef5355028d3db97deba'),
}

def require(ok,reason):
    if not ok:raise RuntimeError(reason)

def sha(raw):return hashlib.sha256(raw).hexdigest()

def pinned(path,digest):
    for p in(path,*path.parents):require(not p.is_symlink(),'evidence_symlink')
    s=path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1 and s.st_size<8*1024*1024,'evidence_metadata')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    def meta(s):return tuple(getattr(s,'st_'+k)for k in('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
    try:
        require(meta(os.fstat(fd))==meta(s),'evidence_replaced')
        with os.fdopen(fd,'rb',closefd=False)as f:raw=f.read(8*1024*1024+1)
        require(len(raw)==s.st_size and meta(os.fstat(fd))==meta(s)==meta(path.lstat()),'evidence_changed')
    finally:os.close(fd)
    require(sha(raw)==digest,'evidence_hash')
    return raw

def source(name):
    path,digest=SOURCES[name];raw=(REVIEW/path).read_bytes();require(sha(raw)==digest,'source_hash')
    module={'__name__':'offline_pinned_library','__file__':str(REVIEW/path)}
    exec(compile(raw,module['__file__'],'exec'),module)
    return module

def recorded():
    raw=pinned(CAPTURE,CAPTURE_SHA);archive=pinned(ARCHIVE,ARCHIVE_SHA)
    rows=[json.loads(x)for x in raw.splitlines()];commands={x['id']:x for x in rows if x['event']=='command'}
    def observed(name):
        r=commands[name];require(r['exitCode']==0,'recorded_observation_failed')
        value=base64.b64decode(r['stdoutBase64'],validate=True)
        require(len(value)==r['stdoutBytes'] and sha(value)==r['stdoutSha256'],'recorded_observation_hash')
        return json.loads(value)
    def reference(name,member,digest):
        value=observed(name);b=base64.b64decode(value['bytesBase64'],validate=True)
        require(sha(b)==digest==value['sha256'] and len(b)==value['bytes'],'reference_hash')
        with tarfile.open(fileobj=io.BytesIO(archive),mode='r:')as t:
            m=t.getmember(member);require(m.isfile() and m.size<8*1024*1024,'historical_member')
            prior=t.extractfile(m).read(8*1024*1024+1)
        require(prior==b,'reference_not_same_accepted_bytes')
        return json.loads(b)
    saved=reference('saved-reference-read','window/saved-dump.pm2.private.json','c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3')
    profile=reference('profile-reference-read','window/source.profile.private.json','a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e')
    before=next(x for x in saved if x['name']=='re7-admin-front')
    live=next(x for x in observed('pm2-rpc')if x['name']=='re7-admin-front')
    texts={
      ('read_text',f"/proc/{live['pid']}/stat"):observed('application-2-io-1'),
      ('resolve',f"/proc/{live['pid']}/cwd"):observed('frontend-config-io-1'),
      ('resolve',f"/proc/{live['pid']}/exe"):observed('frontend-config-io-2'),
      ('read_text',f"/proc/{live['pid']}/environ"):observed('frontend-config-io-3'),
    }
    class RecordedPath:
        def __init__(self,*args):self.path=str(Path(*args))
        def read_text(self):
            require(('read_text',self.path)in texts,'unobserved_read_denied')
            return texts[('read_text',self.path)]
        def resolve(self):
            require(('resolve',self.path)in texts,'unobserved_resolve_denied')
            return Path(texts[('resolve',self.path)])
    return {'before':before,'live':live,'profile':profile,'pathClass':RecordedPath,'texts':texts,
            'observedStartUtc':rows[0]['utc'],'observedEndUtc':rows[-1]['utc']}
