#!/usr/bin/env python3
"""Local-only source build. Never starts worker/API, migrates DB or reads runtime env."""
import argparse, hashlib, io, json, os, pathlib, subprocess, tarfile
ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--output',required=True)
a=ap.parse_args();repo=pathlib.Path(a.repo).resolve();out=pathlib.Path(a.output).resolve();here=pathlib.Path(__file__).resolve().parent
manifest=json.loads((here/'manifest.json').read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
assert sha((here/'worker-persistence.patch').read_bytes())==manifest['patchSha256']
assert not out.exists(), 'Output must be new; never overwrite a release or evidence'
out.mkdir(parents=True);root=out/'source';root.mkdir();(out/'home').mkdir()
env={'PATH':os.environ['PATH'],'HOME':str(out/'home'),'npm_config_cache':str(out/'npm-cache'),'DATABASE_URL':'postgresql://synthetic:synthetic@127.0.0.1:1/never_connect','PRISMA_SKIP_POSTINSTALL_GENERATE':'1','GIT_CEILING_DIRECTORIES':str(out)}
for program,expected in [('node','v'+manifest['toolchain']['node']),('npm',manifest['toolchain']['npm'])]:
 assert subprocess.check_output([program,'--version'],env=env,text=True).strip()==expected, 'Use pinned '+program
paths=['apps/whatsapp-agent/src','apps/whatsapp-agent/package.json','apps/whatsapp-agent/package-lock.json','apps/whatsapp-agent/tsconfig.json','apps/whatsapp-agent/prisma/schema.prisma','apps/whatsapp-web-worker/src','apps/whatsapp-web-worker/package.json','apps/whatsapp-web-worker/package-lock.json','apps/whatsapp-web-worker/tsconfig.json','apps/whatsapp-web-worker/scripts/copy-prisma-client.mjs']
archive=subprocess.check_output(['git','-C',str(repo),'archive',manifest['sourceBase'],*paths]);
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(root,filter='data')
subprocess.run(['git','apply',str(here/'worker-persistence.patch')],cwd=root,env=env,check=True)
for name,expected in manifest['sourceFiles'].items():
 assert sha((root/'apps/whatsapp-agent/src'/name).read_bytes())==expected['sha256'],name
schema=manifest['prismaSchema'];data=subprocess.check_output(['git','-C',str(repo),'show',schema['revision']+':'+schema['path']]);assert sha(data)==schema['sha256'];(root/schema['path']).write_bytes(data)
with (out/'build.log').open('w') as log:
 def run(cmd,cwd):subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 for app in ['whatsapp-agent','whatsapp-web-worker']:
  cwd=root/'apps'/app;assert sha((cwd/'package-lock.json').read_bytes())==manifest['lockedPackages'][app]['lockSha256']
  run(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],cwd)
 agent=root/'apps/whatsapp-agent';worker=root/'apps/whatsapp-web-worker'
 run(['./node_modules/.bin/prisma','generate','--schema','prisma/schema.prisma'],agent)
 run(['node','scripts/copy-prisma-client.mjs'],worker)
 run(['npm','run','build'],worker)
actual={str(f.relative_to(worker)):sha(f.read_bytes()) for f in (worker/'dist').rglob('*') if f.is_file()}
expected={k:v for k,v in manifest['files'].items() if k.startswith('dist/')}
assert actual==expected, 'Compiled manifest differs; inspect locally, do not publish or deploy'
# Deterministic code artifact, no node_modules, runtime configuration or private evidence.
with tarfile.open(out/'worker-code.tar','w') as tar:
 for name in sorted([*actual,'package.json','package-lock.json','tsconfig.json']):
  data=(worker/name).read_bytes();info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
report={'sourceBase':manifest['sourceBase'],'sourcePatch':manifest['patchSha256'],'compiledFiles':len(actual),'exactCompiledManifest':True,'artifactSha256':sha((out/'worker-code.tar').read_bytes()),'productionReady':False,'prismaGeneratedVersion':'6.19.2','workerPrismaWrapperVersion':'6.19.3','runtimeNode20Validation':'pending','noApplicationStarted':True}
(out/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
