"""Package complete corrected build; retain previous immutable static assets.
Usage: python3 package.py NEW_BUILD PREVIOUS_EXTRACTION NEW_OUTPUT NEW_EXTRACTION
No env/configuration/provider/production access. Manifest covers every runtime file.
"""
import hashlib,json,os,shutil,stat,tarfile,sys
from pathlib import Path
source,previous,base,clean=[Path(x).resolve() for x in sys.argv[1:5]];assert not base.exists() and not clean.exists();base.mkdir();root=base/'package';root.mkdir()
for name in ['.next','node_modules','public']:
 shutil.copytree(source/name,root/name,symlinks=True,ignore=shutil.ignore_patterns('cache') if name=='.next' else None)
for name in ['next.config.ts','package.json','package-lock.json','tsconfig.json','next-env.d.ts']:shutil.copy2(source/name,root/name)
old=previous/'.next/static';extra=0
for f in old.rglob('*'):
 if not f.is_file():continue
 out=root/'.next/static'/f.relative_to(old)
 if out.exists() and out.read_bytes()!=f.read_bytes():
  # Same executable chunk, only source-origin paths differ between builds.
  assert f.name.endswith('.js.map'),'static_collision:'+str(f.relative_to(old))
  a=json.loads(out.read_text());b=json.loads(f.read_text())
  assert {k:v for k,v in a.items() if k!='sources'}=={k:v for k,v in b.items() if k!='sources'},'source_map_semantics_collision'
  assert out.with_suffix('').read_bytes()==f.with_suffix('').read_bytes(),'source_map_js_collision'
  continue
 elif out.exists():pass
 else:out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out);extra+=1
for p in root.rglob('*'):
 if p.is_symlink():assert p.resolve(strict=True).is_relative_to(root.resolve())
 elif p.is_dir():p.chmod(0o755)
 else:p.chmod(0o755 if p.stat().st_mode & 0o111 else 0o644)
files=[];links=[]
for p in sorted(root.rglob('*')):
 rel=str(p.relative_to(root))
 if p.is_symlink():links.append({'path':rel,'target':os.readlink(p)})
 elif p.is_file():files.append({'path':rel,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mode':oct(p.stat().st_mode & 0o777)})
v={'candidate':'3227b2d752110873f0eff4ee5253a6f06ca51549','buildId':(root/'.next/BUILD_ID').read_text().strip(),'files':files,'symlinks':links,'preservedStaticFiles':extra,'node':'20.20.0','lockfileSha256':hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest()}
(root/'manifest.json').write_text(json.dumps(v,sort_keys=True,indent=2)+'\n');(root/'manifest.json').chmod(0o644)
tar=base/'frontend-3227b2d7.tar.gz'
with tarfile.open(tar,'w:gz') as t:
 for p in sorted(root.iterdir()):t.add(p,arcname=p.name)
info={'tarSha256':hashlib.sha256(tar.read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256((root/'manifest.json').read_bytes()).hexdigest(),'bytes':tar.stat().st_size,'buildId':v['buildId'],'files':len(files),'symlinks':len(links),'preservedStaticFiles':extra}
(base/'artifact-summary.json').write_text(json.dumps(info,indent=2)+'\n');print(json.dumps(info))
clean.mkdir()
with tarfile.open(tar) as t:t.extractall(clean,filter='data')
