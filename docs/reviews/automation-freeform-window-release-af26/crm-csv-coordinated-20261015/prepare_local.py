"""Offline composition on attested active bytes; never transports/installs/starts apps."""
import argparse, hashlib, importlib.util, json, os, shutil, subprocess, tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
BASE='7f79cee615c4bbfef342fef0084644b3d669712a'
API_SHA='36f51ebef7bf74f6efc90088254b1a806f427ee4f614ce9e0802b37d281a80cb'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 with Path(p).open('x')as f:json.dump(v,f,indent=2);f.write('\n')
 Path(p).chmod(0o600)
def prepare(out):
 spec=importlib.util.spec_from_file_location('canonical_review',ROOT/'scripts/operational_preparation_review.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
 out=Path(out).resolve();os.umask(0o077);fd=c.reporter.private_output_directory(out)
 try:
  c.require(not list(out.iterdir()),'generation_not_empty')
  api=ROOT/'local-evidence/security-v3-runtime-20261014/candidate'
  old_tar=api.parent/'api-seed-epoch-v3.tar';c.require(c.artifact_hash(old_tar)==API_SHA,'active_api_archive_drift')
  inv=json.loads((ROOT/'local-evidence/openai-operational-20261015/incident-6683-v4-security-openai-v4-20261015T203000Z/runtime-inventory.private.json').read_text())
  c.require(len(inv['files'])==446 and inv['artifactSha256']==API_SHA,'active_inventory_mismatch')
  for row in inv['files']:c.require(sha(api/row['path'])==row['sha256'],'active_member_drift')
  front=ROOT/'local-evidence/dynamic-integrated-20261012/post-reboot/frontend-source'
  package=front.parent/'frontend-artifact/package'
  summary=json.loads((front.parent/'frontend-artifact/artifact-summary.json').read_text())
  c.require(sha(front.parent/'frontend-artifact/frontend-dynamic-integrated.tar.gz')==summary['tarSha256'],'active_front_archive_drift')
  front_manifest=json.loads((package/'manifest.json').read_text())
  c.require((package/'.next/BUILD_ID').read_text().strip()==summary['buildId'],'active_front_build_drift')
  for row in front_manifest['files']:c.require(sha(package/row['path'])==row['sha256'],'active_front_member_drift')
  node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node';compiler=ROOT/'apps/whatsapp-agent/node_modules/typescript'
  emit="const fs=require('fs'),ts=require(process.argv[1]);if(process.versions.node!=='20.20.0')throw Error('node');process.stdout.write(ts.transpileModule(fs.readFileSync(0,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020,esModuleInterop:true}}).outputText)"
  def compile(raw):return subprocess.check_output([str(node),'-e',emit,str(compiler)],input=raw)
  modules=['crm/crmContactUpsert','crm/crmContactsReadModel','events/eventRetentionPolicy','http/routes'];original={}
  for module in modules:
   raw=subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':apps/whatsapp-agent/src/'+module+'.ts']);original[module]=raw
   c.require(compile(raw)==(api/('dist/'+module+'.js')).read_bytes(),'source_not_exact_active_module:'+module)
  # Verify every production frontend source against the attested build source. Tests are not runtime material.
  front_sources={}
  for name in subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'src'],text=True).splitlines():
   if name.endswith(('.test.ts','.test.tsx')):continue
   raw=subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name]);c.require((front/name).read_bytes()==raw,'frontend_source_drift:'+name);front_sources[name]=sha(front/name)
  inventory=c.reporter.inventory([str(api),str(package)]);allocated=c.allocation(inventory)
  local_budget=3*1024**3;vfs=os.statvfs(out);c.require(vfs.f_bavail*vfs.f_frsize>=local_budget,'local_capacity_denied')
  review=c.reuse_decision({'expected':{'sha256':API_SHA,'dependenciesSha256':sha(api/'package-lock.json'),'runtime':'active-cipher-v14','contract':'csv-operation-v1'},'existing':[],'reusePermitted':True,'newCopyAllocatedBytes':local_budget,'justification':'new CSV compiled modules and frontend build; complete compatible return, shared dependencies streamed, active artifacts reused and never rebuilt','newLinks':False})
  # No copy/build before all immutable/source/dependency/local-capacity checks above.
  for direction in ['api-candidate']:
   dst=out/direction;shutil.copytree(api,dst)
   selected=modules
   for module in selected:
    raw=(ROOT/'apps/whatsapp-agent/src'/f'{module}.ts').read_bytes()
    (dst/f'dist/{module}.js').write_bytes(compile(raw))
   (dst/'dist/crm/crmCsvImportOperation.js').write_bytes(compile((ROOT/'apps/whatsapp-agent/src/crm/crmCsvImportOperation.ts').read_bytes()))
   unchanged=sum(sha(dst/r['path'])==r['sha256']for r in inv['files']);c.require(unchanged==442,'unexpected_active_runtime_delta')
   files=[{'path':str(f.relative_to(dst)),'sha256':sha(f),'bytes':f.stat().st_size}for f in sorted(dst.rglob('*'))if f.is_file()];c.require(len(files)==447,'runtime_population')
   with tarfile.open(out/(direction+'.tar'),'x')as t:
    for f in files:t.add(dst/f['path'],arcname=f['path'],recursive=False)
   put(out/(direction+'.manifest.private.json'),{'files':files,'baseSha256':API_SHA,'preserved':unchanged,'node':'20.20.0','historicalReaderUnchanged':True,'newAuthNewDbNewCipherUnchanged':True,'sharedLinks':inv['links']})
  build=out/'frontend-build';build.mkdir(mode=0o700);shutil.copytree(front/'src',build/'src')
  for name in ['package.json','package-lock.json','next.config.ts','tsconfig.json','next-env.d.ts','postcss.config.mjs','tailwind.config.js']:
   shutil.copyfile(front/name,build/name)
  for name in ['src/app/app/crm/page.tsx','src/lib/appClientApi.ts','src/lib/crmImportRecovery.ts']:shutil.copyfile(ROOT/name,build/name)
  # Temporary build-only references; never added as external links to a sealed runtime package.
  (build/'node_modules').symlink_to((front/'node_modules').resolve(),target_is_directory=True);(build/'public').symlink_to(package/'public',target_is_directory=True)
  config=json.loads((build/'tsconfig.json').read_text());config['exclude']=['node_modules','apps/**','src/**/*.test.ts','src/**/*.test.tsx'];(build/'tsconfig.json').write_text(json.dumps(config,indent=2)+'\n')
  put(out/'source-plan.private.json',{'api':inv,'frontendSources':front_sources,'frontOriginal':summary,'coordinatorReview':review,'uniqueBaseAllocatedBytes':allocated,'localBudgetBytes':local_budget,'buildOnlyLinksReviewed':True,'sealedNewExternalLinks':False,'state':'REVIEW_NOT_WINDOW_READY','responsible':'Deifson','reviewDate':'2026-10-15','nextReview':'2026-10-21','renewalAuthorized':False,'custody':'local-evidence; future owner custody verification required'})
  print(json.dumps({'result':'ACTIVE_BYTES_AND_CSV_COMPOSITION_LOCAL_PASS','apiCandidateFiles':447,'apiCompatibleReturnReusesCandidate':True,'frontendSourcePrepared':True,'productionCertificateRenewed':False}))
 finally:os.close(fd)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--out',required=True);v=a.parse_args();prepare(v.out)
