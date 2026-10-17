"""Exact NEXT CSV read for future owner approval; never runs on import.
No ELF discovery, phase entrypoint, sudo, mkdir/write on host or application code.
Reuses Capture/private_record and canonical reader for LOCAL diagnostic custody.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess

ROOT=Path(__file__).resolve().parents[2]
REVIEW=ROOT/'docs/reviews/automation-freeform-window-release-af26'
PRESTOP_SOURCE=ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-b4-20261016/static-kit/objects/208f2ef53e3ba5c208006022c85bbf537961ddf339fe8894c07553ce1b626c2b.source'
HOST='deploy@admin.re7online.com'
PRESTOP_SHA='208f2ef53e3ba5c208006022c85bbf537961ddf339fe8894c07553ce1b626c2b'
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-boundary-20261017-v1')

def digest(raw):return hashlib.sha256(raw).hexdigest()
def require(ok,reason):
    if not ok:raise RuntimeError(reason)

def program(raw,expected):
    require(digest(raw)==expected,'prestop_review_drift')
    return '''import base64,hashlib,json,stat,datetime
raw=base64.b64decode(%r);assert hashlib.sha256(raw).hexdigest()==%r,'reviewed_pre_stop_bytes'
s={'__name__':'canonical_predicate_library'};exec(compile(raw,'<reviewed prestop predicate>','exec'),s)
rows=[]
class Observed(s['Filesystem']):
 def lstat(self,path):
  m=super().lstat(path);rows.append({'path':str(path),'dev':m.st_dev,'inode':m.st_ino,'uid':m.st_uid,'gid':m.st_gid,'mode':m.st_mode,'mtimeNs':m.st_mtime_ns,'ctimeNs':m.st_ctime_ns});return m
start=datetime.datetime.now(datetime.timezone.utc).isoformat();passed=False;reason=None;error=None
try:s['event_parents'](s['EVENT_SOURCE'],Observed());passed=True
except Exception as e:
 error=type(e).__name__;reason='EVENT_PARENT_CONTRACT_NOT_SATISFIED'
result={'result':'CSV_EVENT_PARENT_BOUNDARY_OBSERVED','startedUtc':start,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readComplete':passed,'eventParentsPass':passed,'denialStage':None if passed else 'event-parent-contract','denialReason':reason,'errorClass':error,'observations':rows,'predicateSha256':%r,'atomicSnapshot':False,'mutations':False,'fullPrestopCertified':False}
print(json.dumps(result,sort_keys=True))
raise SystemExit(0 if passed else 1)
'''%(base64.b64encode(raw).decode(),expected,expected)

def libraries():
    pins={
      'read_package.py':(REVIEW/'crm-csv-r2-directed-20261017/read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),
      'privileged_output.source':(REVIEW/'crm-csv-r2-directed-20261017/privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a'),
      'capture.source':(REVIEW/'crm-csv-toolchain-discovery-20261017/capture.source','8e40c9683b1945a730d8010fb969b781661af2c7ecc9649fbcd6b9c6e972a781')}
    blobs={}
    for name,(path,h) in pins.items():
        raw=path.read_bytes();require(digest(raw)==h,'canonical_library_digest');blobs[name]=raw
    def load(name):
        ns={'__name__':'read_only_canonical_library','BLOBS':blobs};exec(compile(blobs[name],'<pinned '+name+'>','exec'),ns);return ns
    return load('read_package.py'),load('capture.source')['Capture'],load('privileged_output.source')['private_record']

def execute():
    # Exclusive local destination before the only SSH; no retries/second query.
    lib,Capture,record=libraries()
    lib['directory'](CUSTODY.parent)
    folder=lib['new_directory'](CUSTODY);cap=Capture(folder)
    start=lib['utc']();out=err=b'';code=None;error=None;argv=['local-source-preflight']
    try:
        raw,_=lib['stable_file'](PRESTOP_SOURCE)
        body=program(raw,PRESTOP_SHA)
        argv=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,
              '/usr/bin/python3 -B -I -S -c '+shlex.quote(body)]
        result=subprocess.run(argv,capture_output=True,timeout=25,check=False);code,out,err=result.returncode,result.stdout,result.stderr
    except subprocess.TimeoutExpired as e:error=e;out=e.stdout or b'';err=e.stderr or b''
    except Exception as e:error=e;err=type(e).__name__.encode()
    # Exact channels BEFORE parse; caller never prints private records/paths/config.
    cap.bytes('csv-event-boundary',argv,start,lib['utc'](),code,out,err,error)
    complete=False;passed=False
    try:
        v=json.loads(out);require(v['result']=='CSV_EVENT_PARENT_BOUNDARY_OBSERVED' and v['predicateSha256']==PRESTOP_SHA and v['mutations'] is False,'boundary_response')
        complete=error is None and code==0 and v['readComplete'] is True
        passed=complete and code==0 and v['eventParentsPass'] is True
    except Exception:pass
    record(folder,'sequencer.journal.jsonl',{'event':'CSV_EVENT_BOUNDARY_CUSTODY_PRESERVED','utc':lib['utc'](),'sourceComplete':complete,'eventParentsPass':passed,'fullPrestopCertified':False,'noAutomaticContinuation':True})
    print(json.dumps({'result':'CSV_EVENT_BOUNDARY_PASS_ONLY' if passed else 'CSV_EVENT_BOUNDARY_DENY_NO_RETRY','custodyPreserved':True,'fullPrestopCertified':False}))
    return 0 if passed else 1

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--owner-authorized-read',action='store_true');a=p.parse_args()
    require(a.owner_authorized_read,'owner_read_authorization_required')
    raise SystemExit(execute())
