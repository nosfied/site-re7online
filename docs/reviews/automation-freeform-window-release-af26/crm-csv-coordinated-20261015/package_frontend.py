"""Stream two complete frontend runtimes; preserve union static assets for old tabs.
No config/secret copy, no network, no runtime execution, no generic prune.
"""
import argparse,hashlib,json,os,stat,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def index(root,prefix,skip_cache=False):
 result={}
 for p in sorted(root.rglob('*')):
  if skip_cache and 'cache' in p.relative_to(root).parts:continue
  if p.is_symlink()or p.is_file():result[prefix+str(p.relative_to(root))]=p
 return result
def compose(generation):
 out=Path(generation).resolve();os.umask(0o077)
 assert (out/'source-plan.private.json').is_file()and(out/'frontend-build/.next/BUILD_ID').is_file()
 assert not (out/'frontend-package.intent.private.json').exists()
 base=ROOT/'local-evidence/dynamic-integrated-20261012/post-reboot/frontend-artifact/package';new=out/'frontend-build'
 old_static=index(base/'.next/static','.next/static/');new_static=index(new/'.next/static','.next/static/')
 for name in old_static.keys()&new_static.keys():
  a,b=old_static[name],new_static[name]
  if sha(a)!=sha(b):
   assert name.endswith('.js.map'),'executable_static_collision'
   x,y=json.loads(a.read_text()),json.loads(b.read_text());assert {k:v for k,v in x.items()if k!='sources'}=={k:v for k,v in y.items()if k!='sources'}
   assert a.with_suffix('').read_bytes()==b.with_suffix('').read_bytes()
 common={**index(base/'node_modules','node_modules/'),**index(base/'public','public/')}
 for name in ['package.json','package-lock.json','next.config.ts','tsconfig.json','next-env.d.ts']:common[name]=base/name
 plans={}
 for direction,main,extra in [('frontend-candidate',new,old_static),('frontend-compatible-return',base,new_static)]:
  files={**common,**index(main/'.next','.next/',True)}
  for name,path in extra.items():files.setdefault(name,path)
  rows=[]
  for name,p in sorted(files.items()):
   assert not Path(name).is_absolute()and'..'not in Path(name).parts
   if p.is_symlink():
    assert p.resolve().is_relative_to(base),'external_link_denied'
    rows.append({'path':name,'target':os.readlink(p)})
   else:rows.append({'path':name,'sha256':sha(p),'bytes':p.stat().st_size,'allocatedBytes':p.stat().st_blocks*512,'mode':stat.S_IMODE(p.stat().st_mode)})
  plans[direction]=(files,rows)
 # Budget/contract checked before first archive write; no dependencies copied into another local staging tree.
 assert os.statvfs(out).f_bavail*os.statvfs(out).f_frsize>=2*1024**3
 with(out/'frontend-package.intent.private.json').open('x')as f:json.dump({'directions':list(plans),'newExternalLinks':False,'streamSharedDependencies':True,'copyReason':'new build and compatible old-server return with union assets; no source/dependency rebuild'},f)
 result={}
 for direction,(files,rows)in plans.items():
  artifact=out/(direction+'.tar.gz')
  with tarfile.open(artifact,'x:gz')as t:
   for name,p in sorted(files.items()):t.add(p,arcname=name,recursive=False)
  manifest={'files':rows,'buildId':(files['.next/BUILD_ID']).read_text().strip(),'tarSha256':sha(artifact),'tarBytes':artifact.stat().st_size,'filesCount':sum('sha256'in r for r in rows),'linksCount':sum('target'in r for r in rows),'uniqueStaticFiles':sum(n.startswith('.next/static/')for n in files),'unpackedAllocatedBytes':sum(r.get('allocatedBytes',4096)for r in rows),'configSource':'attested active frontend; no env values in manifest'}
  with(out/(direction+'.manifest.private.json')).open('x')as f:json.dump(manifest,f,indent=2)
  result[direction]={k:v for k,v in manifest.items()if k not in ['files','configSource']}
 with(out/'frontend-artifacts.sanitized.json').open('x')as f:json.dump(result,f,indent=2)
 print(json.dumps({'result':'FRONTEND_AND_COMPATIBLE_RETURN_PACKAGED_LOCAL','artifacts':result}))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--generation',required=True);v=a.parse_args();compose(v.generation)
