"""One future owner-reviewed preflight, reusing accepted transport and custody.
No action runs at import. Source/reader are loaded from the same verified bytes.
"""
import base64,hashlib,json,os,shlex,stat,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BOUNDARY=ROOT/'scripts/crm_csv_delivery/read_boundary.py'
BOUNDARY_SHA='f52cb151da109fcf1951882adc0273112c17fbc736576816d741c00ff884b306'
SOURCE=ROOT/'scripts/crm_csv_delivery/event_preflight.source'
SOURCE_SHA='5a0591cb0b19cec29c225f7154c70ed29e1649bcd0b32b7831e5d249e2abb6ac'
READER_SHA='66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-preflight-20261017-v1')

def boundary():
 # Same reviewed byte/FD bootstrap as the preceding read; no import from mutable path.
 p=BOUNDARY
 for q in (p,*p.parents):assert not q.is_symlink(),'boundary_symlink'
 s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'boundary_type_size'
 def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  assert meta(os.fstat(fd))==meta(s),'boundary_replaced'
  raw=os.read(fd,65536)
  assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'boundary_changed'
 finally:os.close(fd)
 assert hashlib.sha256(raw).hexdigest()==BOUNDARY_SHA,'boundary_digest'
 ns={'__name__':'reviewed_transport_library','__file__':str(p)};exec(compile(raw,str(p),'exec'),ns)
 return ns

def program(source,reader):
 assert hashlib.sha256(source).hexdigest()==SOURCE_SHA,'source_digest'
 assert hashlib.sha256(reader).hexdigest()==READER_SHA,'reader_digest'
 return '''import base64,hashlib
r=base64.b64decode(%r);assert hashlib.sha256(r).hexdigest()==%r
lib={'__name__':'canonical_reader_library'};exec(compile(r,'<pinned canonical reader>','exec'),lib)
b=base64.b64decode(%r);assert hashlib.sha256(b).hexdigest()==%r
s={'__name__':'reviewed_event_preflight','meta':lib['meta']};exec(compile(b,'<reviewed Event preflight>','exec'),s)
raise SystemExit(s['collect']())
'''%(base64.b64encode(reader).decode(),READER_SHA,base64.b64encode(source).decode(),SOURCE_SHA)

def execute():
 b=boundary();lib,Capture,record=b['libraries']()
 lib['directory'](CUSTODY.parent);folder=lib['new_directory'](CUSTODY);cap=Capture(folder)
 start=lib['utc']();argv=['local-preflight'];out=err=b'';code=None;error=None
 try:
  source,_=lib['stable_file'](SOURCE,65536)
  reader,_=lib['stable_file'](b['REVIEW']/'crm-csv-r2-directed-20261017/read_package.py')
  # Local prerequisites checked before the only SSH. Remote getfacl is a separate gate.
  assert Path('/usr/bin/ssh').is_file() and os.access('/usr/bin/ssh',os.X_OK),'ssh_unavailable'
  body=program(source,reader)
  argv=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',b['HOST'],
        '/usr/bin/python3 -B -I -S -c '+shlex.quote(body)]
  r=subprocess.run(argv,capture_output=True,timeout=25,check=False);code,out,err=r.returncode,r.stdout,r.stderr
 except subprocess.TimeoutExpired as e:error=e;out=e.stdout or b'';err=e.stderr or b''
 except Exception as e:error=e;err=type(e).__name__.encode()
 cap.bytes('csv-event-preflight',argv,start,lib['utc'](),code,out,err,error)
 complete=False
 try:
  v=json.loads(out)
  complete=(error is None and code==0 and v['result']=='EVENT_PREFLIGHT_OBSERVED_NOT_AUTHORIZED' and v['readComplete'] is True and len(v['observations'])==5 and v['mutations'] is False and v['applicationAuthorized'] is False)
 except Exception:pass
 record(folder,'sequencer.journal.jsonl',{'event':'CSV_EVENT_PREFLIGHT_CUSTODY_PRESERVED','utc':lib['utc'](),'sourceSha256':SOURCE_SHA,'sourceComplete':complete,'applicationAuthorized':False,'noAutomaticContinuation':True})
 print(json.dumps({'result':'EVENT_PREFLIGHT_PRESERVED_NOT_AUTHORIZED' if complete else 'EVENT_PREFLIGHT_DENY_NO_RETRY','custodyPreserved':True,'applicationAuthorized':False}))
 return 0 if complete else 1
