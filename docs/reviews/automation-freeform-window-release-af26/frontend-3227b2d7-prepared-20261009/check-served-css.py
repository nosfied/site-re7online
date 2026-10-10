"""Read-only HTTP/CSS integrity probe of exact candidate; no session or send."""
import hashlib,re,urllib.request
CSS='/_next/static/chunks/64ec3d62bdaa41ef.css'
SHA='1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64'
def verify(base='http://127.0.0.1:3000'):
 with urllib.request.urlopen(base+'/app/login',timeout=3) as r:
  assert r.status==200;html=r.read().decode()
  assert CSS in html,'served_css_not_referenced'
 with urllib.request.urlopen(base+CSS,timeout=3) as r:
  assert r.status==200 and r.headers.get_content_type()=='text/css','served_css_http_or_mime'
  data=r.read();assert hashlib.sha256(data).hexdigest()==SHA,'served_css_bytes'
  assert not re.search(rb'@tailwind\s+(base|components|utilities)\b',data),'unprocessed_css'
 print('ACTUAL_SERVED_CSS_HTTP_MIME_HASH_PASS')
if __name__=='__main__':verify()
