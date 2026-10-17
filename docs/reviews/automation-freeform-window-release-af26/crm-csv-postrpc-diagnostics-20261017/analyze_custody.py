"""Read-only analysis of two pinned local custodial objects; never substitutes /proc."""
import ast,base64,hashlib,io,json,os,stat,tarfile
from pathlib import Path
P=Path(__file__).resolve().parent;R=P.parent
C=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
CAP=C/'csv-three-gaps-executable-noelf-20261017-v1/capture.private.jsonl'
ARCH=C/'crm-csv-staging-20261016/final-preparation-20261016T105404Z/original-recovery-complete-evidence.private.tar'
CAP_SHA='18add4ba10e9509cf1527241ff4a6e48e35205519d7bce70713bd07923b58b7d'
ARCH_SHA='32e0cb1de5dac716027fc8face5cc60f8b996ec0ca9de6b18363cbbb84b30076'

def pinned(path,digest):
    for p in(path,*path.parents):
        if p.is_symlink():raise RuntimeError('custody_symlink')
    s=path.lstat()
    if not stat.S_ISREG(s.st_mode)or s.st_uid!=os.getuid()or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1 or s.st_size>8*1024*1024:raise RuntimeError('custody_metadata')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        with os.fdopen(fd,'rb',closefd=False)as f:raw=f.read(8*1024*1024+1)
        meta=lambda t:tuple(getattr(t,'st_'+k)for k in('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
        if meta(s)!=meta(os.fstat(fd))or meta(s)!=meta(path.lstat()):raise RuntimeError('custody_changed')
    finally:os.close(fd)
    if hashlib.sha256(raw).hexdigest()!=digest:raise RuntimeError('custody_digest')
    return raw

def analyze():
    capture=pinned(CAP,CAP_SHA);archive=pinned(ARCH,ARCH_SHA)
    rows=[json.loads(x)for x in capture.splitlines()];rpc=next(x for x in rows if x.get('id')=='pm2-rpc'and x['event']=='command')
    raw=base64.b64decode(rpc['stdoutBase64'],validate=True)
    if len(raw)!=rpc['stdoutBytes']or hashlib.sha256(raw).hexdigest()!=rpc['stdoutSha256']:raise RuntimeError('rpc_bytes')
    apps=json.loads(raw);by={x['name']:x for x in apps}
    source=R/'crm-csv-three-gaps-noelf-20261017/runner.py'
    tree=ast.parse(source.read_bytes())
    constants={n.targets[0].id:ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id in('HISTORY','EXPECTED')}
    refs={};reference_index=[]
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:')as t:
        for name,digest in constants['HISTORY'].items():
            member=t.getmember('window/'+name)
            if not member.isfile()or member.size>8*1024*1024:raise RuntimeError('archive_member_type_size')
            b=t.extractfile(member).read(8*1024*1024+1)
            if len(b)!=member.size or hashlib.sha256(b).hexdigest()!=digest:raise RuntimeError('reference_hash')
            refs[name]=json.loads(b)
            reference_index.append({'member':'window/'+name,'bytes':len(b),'sha256':digest,'memberMtime':member.mtime,'matchesReviewedReference':True,'historicalNotCurrent':True})
    contract=R/'crm-csv-three-gaps-procedure-20261017/contracts.py';code=contract.read_bytes()
    expected_contract=json.loads((R/'crm-csv-three-gaps-noelf-20261017/MANIFEST.json').read_bytes())['files']['contracts.py']['sha256']
    if hashlib.sha256(code).hexdigest()!=expected_contract:raise RuntimeError('contract_source')
    c={'__name__':'pure_contract_analysis','__file__':str(contract)};exec(compile(code,str(contract),'exec'),c)
    front=next(x for x in refs['saved-dump.pm2.private.json']if x['name']=='re7-admin-front')
    per_app=[]
    configs={x['name']:x for x in refs['source.profile.private.json']['apps']}
    configs['re7-admin-front']=c['frontend_expected'](front)
    for name,(pid,ticks)in constants['EXPECTED'].items():
        row=by.get(name);e=row['pm2_env']if row else{};cfg=configs[name];env=e.get('env')
        per_app.append({'application':name,'returnedPidMatches':row is not None and row['pid']==pid,
         'pm2EnvIsObject':type(e)is dict,'requiredReturnedFieldsPresent':all(k in e for k in('pm_cwd','pm_exec_path','exec_interpreter','status','watch')),
         'pmCwdMatchesReference':e.get('pm_cwd')==cfg['cwd'],'pmExecPathMatchesReference':e.get('pm_exec_path')==cfg['script'],
         'returnedInterpreterMatchesReference':e.get('exec_interpreter')==cfg['interpreter'],'statusOnline':e.get('status')=='online','watchIsFalse':e.get('watch')is False,
         'envMirrorIsObject':type(env)is dict,'envMirrorExpectedSubsetEqual':type(env)is dict and all(k in env and str(env[k])==str(v)for k,v in cfg['env'].items()),
         'procIdentityObserved':False,'procCwdExeEnvironmentObserved':False,'canonicalConfigurationCertified':False})
    frontend_fields=[{'field':k,'presentInRpc':k in by['re7-admin-front']['pm2_env'],'presentInReference':k in front,
                     'sameValue':k in by['re7-admin-front']['pm2_env']and k in front and by['re7-admin-front']['pm2_env'][k]==front[k],
                     'returnedType':type(by['re7-admin-front']['pm2_env'].get(k)).__name__,'referenceType':type(front.get(k)).__name__}for k in c['LIVE_FIELDS']]
    return {'scope':'LOCAL_CUSTODY_ONLY_NO_PROC_SIMULATION','rpc':{'bytes':len(raw),'sha256':rpc['stdoutSha256'],'rowCount':len(apps),'uniqueNames':len(by),'namesMatch':set(by)==set(constants['EXPECTED'])},
     'perApplication':per_app,'frontendReturnedFields':frontend_fields,'references':reference_index,
     'sourceHashes':{'capture':CAP_SHA,'historicalArchive':ARCH_SHA,'contracts':hashlib.sha256(code).hexdigest(),'runner':hashlib.sha256(source.read_bytes()).hexdigest()},
     'firstCodeBoundaryAfterPeerAfter':'socket/pm2.pid post-query stability remains indeterminate',
     'firstReplayableBoundaryFromRecordedRpc':'JSON/population/returned PIDs and returned-field comparisons',
     'indeterminate':['socket stat_result before/after including atime','pm2.pid content/metadata after query','application kernel identities/start ticks/state','current /proc cwd/exe/environ','live historical reference bytes/metadata','current saved/fallback'],
     'retroactiveAtimeAttribution':False,'productionCertification':False}
if __name__=='__main__':
    try:print(json.dumps(analyze(),sort_keys=True,indent=2))
    except Exception as e:print(json.dumps({'result':'LOCAL_ANALYSIS_DENY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None)}));raise SystemExit(1)
