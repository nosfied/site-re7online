"""Local review-only revision; reuse consumed preflight as a pinned transport library.
New literal source and exclusive destination, no execution at import.
"""
import hashlib,os,stat
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TRANSPORT=ROOT/'scripts/crm_csv_delivery/preflight.py'
TRANSPORT_SHA='4447ecad371247b57b6f0007b719362e6f716339e0a6a792ae27a5b8f42516f7'
SOURCE=ROOT/'scripts/crm_csv_delivery/event_preflight_xattr.source'
SOURCE_SHA='98c7b32ff33d443267999723ee8da50d99dbb243ecf19d370c369d0a5d67ecbc'
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-xattr-preflight-20261017-v1')

def transport():
 for q in (TRANSPORT,*TRANSPORT.parents):assert not q.is_symlink(),'transport_symlink'
 s=TRANSPORT.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'transport_type_size'
 def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
 fd=os.open(TRANSPORT,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  assert meta(os.fstat(fd))==meta(s),'transport_replaced'
  raw=os.read(fd,65536)
  assert meta(os.fstat(fd))==meta(s)==meta(TRANSPORT.lstat()),'transport_changed'
 finally:os.close(fd)
 assert hashlib.sha256(raw).hexdigest()==TRANSPORT_SHA,'transport_digest'
 ns={'__name__':'reviewed_preflight_transport_library','__file__':str(TRANSPORT)}
 exec(compile(raw,str(TRANSPORT),'exec'),ns)
 # Explicit owner-reviewed context, not env/CLI fallback. Same transport/schema/custody.
 ns.update(SOURCE=SOURCE,SOURCE_SHA=SOURCE_SHA,CUSTODY=CUSTODY)
 return ns

def execute():return transport()['execute']()
