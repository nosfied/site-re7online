"""Local-only renderer: no SSH, subprocess, SQL, or mutation of existing files."""
import hashlib,json,os,re,stat,sys
from pathlib import Path
source=Path(__file__).resolve().parent
if len(sys.argv)!=3:raise SystemExit('usage: render-reviewed-drivers.py private-bindings.json new-output-directory')
binding=Path(sys.argv[1]);s=binding.lstat()
if not stat.S_ISREG(s.st_mode) or s.st_mode&0o077:raise SystemExit('private_binding_file_denied')
b=json.loads(binding.read_text());m=json.loads((source/'DRIVERS_MANIFEST.json').read_text())
expected={k for v in m.values() for k in v['bindingKeys']}
if not isinstance(b,dict) or set(b)!=expected or not all(isinstance(v,str)and v for v in b.values()):raise SystemExit('binding_shape_denied')
rendered={}
for name,v in m.items():
 raw=(source/v['template']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=v['templateSha256']:raise SystemExit('template_integrity_denied')
 text=raw.decode()
 for token in v['bindingKeys']:text=text.replace(token,b[token])
 if re.search(r'__PRIVATE_[A-Z_]+__',text):raise SystemExit('unresolved_binding_denied')
 raw=text.encode()
 if hashlib.sha256(raw).hexdigest()!=v['preparedSha256']:raise SystemExit('prepared_bytes_mismatch')
 rendered[name]=raw
out=Path(sys.argv[2]);out.mkdir(mode=0o700)
for n,raw in rendered.items():
 fd=os.open(out/n,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
print('RENDER_EXACT_PREPARED_BYTES_PASS_NO_EXECUTION')
