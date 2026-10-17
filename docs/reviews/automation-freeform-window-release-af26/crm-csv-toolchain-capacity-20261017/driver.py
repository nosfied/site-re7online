"""Canonical snapshot/SSH/Capture/private_record transport, metadata-only remote.
Remote() never materializes tools/results or calls the private writer.
"""
import base64,hashlib,json,os,stat,subprocess,shlex
from pathlib import Path
HOST='deploy@admin.re7online.com'
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
def libload(name,blobs=None):
    scope={'__name__':'reviewed_library_only','__file__':'<verified '+name+'>','BLOBS':BLOBS if blobs is None else blobs}
    exec(compile((BLOBS if blobs is None else blobs)[name],scope['__file__'],'exec'),scope);return scope

def libraries(blobs=None):return libload('read_package.py',blobs),libload('privileged_output.source',blobs)['private_record']

def pack(blobs):return {'manifestSha256':MANIFEST_SHA,'manifest':base64.b64encode(MANIFEST_RAW).decode(),
                        'files':{k:base64.b64encode(v).decode()for k,v in blobs.items()}}

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
    if action!='collect':raise RuntimeError('metadata_read_only')
    lib,_=libraries()
    result=libload('capacity_read.py')['collect'](lib)
    raw=json.dumps({'manifestSha256':MANIFEST_SHA,'observation':result},sort_keys=True).encode()
    if len(raw)>65536:raise RuntimeError('metadata_response_bound')
    print(raw.decode())
    return 0 if result['result']=='CAPACITY_METADATA_OBSERVED_NOT_CERTIFIED'else 1

def main(action):
    if action!='collect':raise RuntimeError('metadata_read_only')
    lib,record=libraries();q=lib['new_directory'](CUSTODY/'csv-toolchain-capacity-20261017-v1')
    cap=libload('capture.source')['Capture'](q)
    cap.event('begin',manifestSha256=MANIFEST_SHA,action=action,remoteFilesWritten=False)
    started=lib['utc']();a=b=b'';code=None;error=None;argv=['source-verified-before-ssh'];frame_raw=b''
    try:
        frame_raw=json.dumps(pack(BLOBS),sort_keys=True).encode()
        command='/usr/bin/python3 -B -I -S -c '+shlex.quote(REMOTE_LAUNCH)+' '+shlex.quote(MANIFEST_SHA)+' collect'
        argv=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,command]
        r=subprocess.run(argv,input=frame_raw,capture_output=True,timeout=25,check=False);code,a,b=r.returncode,r.stdout,r.stderr
    except subprocess.TimeoutExpired as e:error=e;a=e.stdout or b'';b=e.stderr or b''
    except OSError as e:error=e;b=type(e).__name__.encode()
    cap.bytes('capacity-ssh',argv,started,lib['utc'](),code,a,b,error)
    cap.event('transport-input',bytes=len(frame_raw),sha256=lib['sha'](frame_raw))
    ok=False
    try:
        lib['require'](len(a)<=65536 and error is None,'metadata_transport')
        value=json.loads(a);lib['require'](value['manifestSha256']==MANIFEST_SHA,'metadata_manifest')
        v=value['observation'];lib['require'](v['target']=='/dev/shm/re7-csv-toolchain-read-20261017-v2' and v['statvfsCallCount']in (0,1),'metadata_scope')
        lib['require'](v['remoteFilesWritten']is False and v['imagesCreationAttempted']is False and v['fileContentsRead']is False,'metadata_effects')
        ok=code==0 and v['result']=='CAPACITY_METADATA_OBSERVED_NOT_CERTIFIED'
        # Original stdout remains byte-exact in the Capture artifacts/journal.
        record(q,'sequencer.journal.jsonl',{'event':'CAPACITY_CUSTODY_PRESERVED_NOT_CERTIFIED','utc':lib['utc'](),
               'manifestSha256':MANIFEST_SHA,'observationSha256':lib['sha'](a),'observationBytes':len(a),
               'readComplete':ok,'budgetSatisfied':v.get('statvfs',{}).get('comparison',{}).get('satisfied'),
               'oldDenyReclassified':False,'atomicSnapshot':False})
    except Exception as e:
        record(q,'sequencer.journal.jsonl',{'event':'CAPACITY_CUSTODY_DENY_PARTIAL_PRESERVED','utc':lib['utc'](),
               'errorClass':type(e).__name__,'errno':getattr(e,'errno',None),'oldDenyReclassified':False})
    print('CAPACITY_READ_CUSTODY_PRESERVED_NOT_CERTIFIED'if ok else'CAPACITY_DENY_PRIVATE_PRESERVED_NO_RETRY')
    return 0 if ok else 1
