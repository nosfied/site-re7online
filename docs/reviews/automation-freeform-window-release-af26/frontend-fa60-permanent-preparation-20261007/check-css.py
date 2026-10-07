"""Read-only static asset guard; browser computed-style proof remains separate.
Usage: python3 check-css.py EXTRACTED_PACKAGE
No start, provider, network or write.
"""
import hashlib,json,re,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve();refs=root/'.next/server/app/app/campaigns/page_client-reference-manifest.js'
paths=sorted(set(re.findall(r'static/css/[a-zA-Z0-9._-]+\.css',refs.read_text())))
assert paths,'campaign_stylesheet_reference_missing'
rows=[]
for name in paths:
 path=root/'.next'/name;assert path.is_file() and not path.is_symlink(),'stylesheet_missing'
 raw=path.read_bytes();text=raw.decode();assert not re.search(r'@tailwind\s+(base|components|utilities)\b',text),'tailwind_not_expanded'
 for pattern in [r'\.flex\{display:flex\}',r'\.gap-6\{gap:1\.5rem\}',r'\.p-6\{padding:1\.5rem\}']:assert re.search(pattern,text),'layout_utility_missing'
 rows.append({'path':name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
print(json.dumps({'result':'PASS','referencedStylesheets':rows,'scope':'static evidence; computed browser styles already validated on exact tar'}))
