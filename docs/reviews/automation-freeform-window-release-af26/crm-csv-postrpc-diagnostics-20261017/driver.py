"""Offline assembly and single-attempt transport; canonical private_record only."""
import base64,hashlib,json,os,stat,subprocess
from pathlib import Path

BASE=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926')
NAME='crm-csv-postrpc-diagnostics-20261017'
PREFIX='docs/reviews/automation-freeform-window-release-af26/'
MATERIAL=Path('/dev/shm/re7-csv-postrpc-material-20261017-v1')
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
TOOLS='/dev/shm/re7-csv-postrpc-tools-20261017-v1'
OUTPUT='/dev/shm/re7-csv-postrpc-read-20261017-v1'
HOST='deploy@admin.re7online.com'
JOURNAL='privileged-output.private.jsonl'

def libload(name,blobs=None):
    scope={'__name__':'reviewed_library_only','__file__':'<verified '+name+'>'}
    exec(compile((BLOBS if blobs is None else blobs)[name],scope['__file__'],'exec'),scope);return scope

def libraries(blobs=None):return libload('read_package.py',blobs),libload('privileged_output.source',blobs)['private_record']

def pack(blobs):return {'manifestSha256':MANIFEST_SHA,'manifest':base64.b64encode(MANIFEST_RAW).decode(),
                        'files':{k:base64.b64encode(v).decode()for k,v in blobs.items()}}

def verify(frame):
    raw=base64.b64decode(frame['manifest'],validate=True)
    if hashlib.sha256(raw).hexdigest()!=MANIFEST_SHA:raise RuntimeError('remote_manifest_drift')
    mf=json.loads(raw);blobs={k:base64.b64decode(v,validate=True)for k,v in frame['files'].items()}
    if set(blobs)!=set(mf['files']):raise RuntimeError('remote_file_set')
    for k,v in blobs.items():
        if len(v)!=mf['files'][k]['bytes']or hashlib.sha256(v).hexdigest()!=mf['files'][k]['sha256']:raise RuntimeError('remote_source_drift')
    return blobs

def materialize():
    lib,record=libraries();out=lib['new_directory'](MATERIAL)
    record(out,JOURNAL,{'event':'materialize_begin','utc':lib['utc'](),'manifestSha256':MANIFEST_SHA})
    try:
        blobs=dict(BLOBS)
        for name,entry in MANIFEST['files'].items():
            if name in blobs:continue
            source=Path(entry['source'])
            if not source.is_absolute():source=BASE/source
            start=lib['utc']()
            try:raw=READ(source)
            except Exception as e:
                record(out,JOURNAL,{'event':'materialize_source','argv':['read',str(source)],'startedUtc':start,'finishedUtc':lib['utc'](),'exitCode':None,'accepted':False,'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
                raise
            accepted=len(raw)==entry['bytes']and hashlib.sha256(raw).hexdigest()==entry['sha256']
            record(out,JOURNAL,{'event':'materialize_source','argv':['read',str(source)],'startedUtc':start,'finishedUtc':lib['utc'](),'exitCode':0,'accepted':accepted,'stdoutBytes':len(raw),'stdoutSha256':lib['sha'](raw),'stdoutBase64':base64.b64encode(raw).decode(),'stderrBytes':0,'stderrSha256':lib['sha'](b''),'stderrBase64':''})
            if not accepted:raise RuntimeError('material_source_drift')
            blobs[name]=raw
        frame=pack(blobs);verify(frame)
        lib['write_artifact'](out/'bundle.private.json',json.dumps(frame,sort_keys=True).encode())
        record(out,JOURNAL,{'event':'materialize_end','utc':lib['utc'](),'result':'MATERIALIZED_INACTIVE','files':len(blobs)})
        print('MATERIALIZED_INACTIVE_NO_REMOTE');return 0
    except Exception as e:
        record(out,JOURNAL,{'event':'materialize_end','utc':lib['utc'](),'result':'DENY_NO_RETRY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None)});return 1

# This fixed program only decodes a reviewed byte snapshot. It does not import a transferred path.
REMOTE_LAUNCH=r'''import base64,hashlib,json,sys
frame=json.loads(sys.stdin.buffer.read(4*1024*1024+1))
raw=base64.b64decode(frame['manifest'],validate=True)
assert hashlib.sha256(raw).hexdigest()==sys.argv[1],'reviewed_manifest'
m=json.loads(raw);blobs={k:base64.b64decode(v,validate=True)for k,v in frame['files'].items()}
assert set(blobs)==set(m['files']),'file_set'
for k,v in blobs.items():
 assert len(v)==m['files'][k]['bytes'] and hashlib.sha256(v).hexdigest()==m['files'][k]['sha256'],'reviewed_source'
s={'__name__':'reviewed_remote','__file__':'<verified driver>','BLOBS':blobs,'MANIFEST':m,'MANIFEST_RAW':raw,'MANIFEST_SHA':sys.argv[1]}
exec(compile(blobs['driver.py'],'<verified driver>','exec'),s)
sys.exit(s['remote'](sys.argv[2]))
'''

def remote(action):
    os.umask(0o077)  # Newly created inactive subdirectories only; no chmod/repair.
    # No sources are imported from the newly materialized directory.
    lib,record=libraries();suffix=''if action=='collect'else'-sql'
    t=lib['new_directory'](TOOLS+suffix);q=lib['new_directory'](OUTPUT+suffix)
    record(q,JOURNAL,{'event':'transfer_inactive_begin','utc':lib['utc'](),'manifestSha256':MANIFEST_SHA,'action':action})
    ok=False
    try:
        for k,v in BLOBS.items():
            p=t/k
            # Only new subdirectories within this exclusive tree; no repair or overwrite.
            if not p.parent.exists():p.parent.mkdir(mode=0o700,parents=True)
            lib['write_artifact'](p,v)
            record(q,JOURNAL,{'event':'materialized_remote_source','argv':['write-inactive',k],'utc':lib['utc'](),'exitCode':0,'bytes':len(v),'sha256':lib['sha'](v)})
        lib['write_artifact'](t/'MANIFEST.json',MANIFEST_RAW)
        scope={'__name__':'reviewed_runner','__file__':'<verified runner>','BLOBS':BLOBS,'MANIFEST_SHA':MANIFEST_SHA}
        exec(compile(BLOBS['runner.py'],'<verified runner>','exec'),scope)
        ok,_=scope['run'](q,action)
    except Exception as e:record(q,JOURNAL,{'event':'remote_end','result':'DENY_NO_RETRY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None),'utc':lib['utc']()})
    # Even a gate DENY exports its bytes in the same response. No second remote attempt.
    print(json.dumps({'gateExitCode':0 if ok else 1,'manifestSha256':MANIFEST_SHA,'capture':lib['export'](q)},sort_keys=True))
    return 0 if ok else 1

def ingest(folder,stdout,stderr,code,started,finished,error=None,action='collect',argv=None,source_raw=b''):
    lib,record=libraries();suffix=''if action=='collect'else'-sql'
    lib['write_artifact'](folder/'transfer.stdout.private',stdout);lib['write_artifact'](folder/'transfer.stderr.private',stderr)
    row={'event':'transport','argv':argv,
         'startedUtc':started,'finishedUtc':finished,'stdinBytes':len(source_raw),'stdinSha256':lib['sha'](source_raw),'exitCode':code,'errorClass':None if error is None else type(error).__name__,'errno':getattr(error,'errno',None)}
    for k,v in [('stdout',stdout),('stderr',stderr)]:row.update({k+'Bytes':len(v),k+'Sha256':lib['sha'](v),k+'Base64':base64.b64encode(v).decode()})
    record(folder,JOURNAL,row)
    try:
        value=json.loads(stdout);lib['require'](value['manifestSha256']==MANIFEST_SHA,'custody_manifest')
        f=value['capture'];raw=base64.b64decode(f['bytesBase64'],validate=True);m=f['metadata']
        lib['require'](f['format']=='R2_DIRECTED_BYTE_EXACT_TRANSFER_V1' and f['source']==OUTPUT+suffix+'/'+JOURNAL,'custody_source')
        lib['require'](len(raw)==f['bytes']==m['size'] and lib['sha'](raw)==f['sha256'],'custody_bytes')
        lib['require'](stat.S_ISREG(m['mode']) and stat.S_IMODE(m['mode'])==0o600 and m['nlink']==1 and m['uid']==f['sourceUid'],'custody_metadata')
        lib['write_artifact'](folder/'capture.private.jsonl',raw)
        rows=[json.loads(x)for x in raw.splitlines()]
        for r in rows:
            if r['event']=='command':
                for k in ('stdout','stderr'):
                    v=base64.b64decode(r[k+'Base64'],validate=True)
                    lib['require'](len(v)==r[k+'Bytes']and lib['sha'](v)==r[k+'Sha256'],'custody_command_bytes')
            record(folder,JOURNAL,r)
        valid=code==0 and error is None and value['gateExitCode']==0
        record(folder,'sequencer.journal.jsonl',{'event':'THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED','utc':lib['utc'](),'sourceSha256':f['sha256'],'sourceBytes':len(raw),'manifestSha256':MANIFEST_SHA,'gatePass':valid,'atomicSnapshot':False,'ownership':'UNKNOWN'})
        print('CUSTODY_PRESERVED_GATES_PASS_NOT_CERTIFIED'if valid else'CUSTODY_PRESERVED_DENY_NO_RETRY');return 0 if valid else 1
    except Exception as e:
        record(folder,'sequencer.journal.jsonl',{'event':'THREE_GAPS_CUSTODY_DENY_NO_RETRY','utc':lib['utc'](),'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
        print('CUSTODY_DENY_PARTIAL_PRESERVED_NO_RETRY');return 1

def transport(action):
    import shlex
    lib,record=libraries();suffix=''if action=='collect'else'-sql'
    # Destination exists => no remote effects. Existing parent must already satisfy owner700.
    folder=lib['new_directory'](CUSTODY/('csv-postrpc-diagnostics-20261017-v1'+suffix))
    started=lib['utc']();out=err=b'';code=None;error=None;argv=['source-verify-before-ssh',action];frame_raw=b''
    try:
        frame_raw=READ(MATERIAL/'bundle.private.json',4*1024*1024);frame=json.loads(frame_raw);verify(frame)
        if action=='select':
            previous=CUSTODY/'csv-postrpc-diagnostics-20261017-v1'
            raw,_=lib['stable_file'](previous/'sequencer.journal.jsonl');receipt=json.loads(raw.splitlines()[-1])
            lib['require'](receipt['event']=='THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED'and receipt['gatePass']is True and receipt['manifestSha256']==MANIFEST_SHA,'previous_gates_not_passed')
        cmd='/usr/bin/python3 -B -I -S -c '+shlex.quote(REMOTE_LAUNCH)+' '+shlex.quote(MANIFEST_SHA)+' '+shlex.quote(action)
        argv=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,cmd]
        r=subprocess.run(argv,input=frame_raw,capture_output=True,timeout=180,check=False);code,out,err=r.returncode,r.stdout,r.stderr
    except subprocess.TimeoutExpired as e:out,err=e.stdout or b'',e.stderr or b'';error=e
    except Exception as e:error=e;err=type(e).__name__.encode()
    return ingest(folder,out,err,code,started,lib['utc'](),error,action,argv,frame_raw)

def main(action):
    if action=='materialize':return materialize()
    if action=='collect':return transport(action)
    if action=='select-owner-authorized':return transport('select')
    raise RuntimeError('action_not_authorized')
