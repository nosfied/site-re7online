"""Derive a new local review composition from the sealed446-file artifact.
No fresh production certificate is inferred from the historical capture.
"""
import hashlib,importlib.util,json,os,subprocess,sys,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[5]
spec=importlib.util.spec_from_file_location('retention_preparers',ROOT/'scripts/operational_preparers_v3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);c=m.c
SHA='06f136d77e136231face3d4eb5c422598978f7971a3c1ae32773a80540dcc7b5'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def compose(out):
    out=Path(out).absolute();fd=c.reporter.private_output_directory(out)
    try:
        c.require(not list(out.iterdir()),'output_not_empty')
        previous=ROOT/'local-evidence/security-complete-runtime-20261014'
        tar=previous/'api-seed-epoch.tar';c.require(c.artifact_hash(tar)==SHA,'sealed_runtime_drift')
        manifest=json.loads((previous/'runtime-manifest.private.json').read_text())
        c.require(len(manifest['index'])==446 and manifest['artifactSha256']==SHA,'complete_artifact_identity_missing')
        base=ROOT/'local-evidence/dynamic-integrated-20261012/post-reboot/api-exact-composition/apps/whatsapp-agent'
        deps=json.loads((ROOT/'local-evidence/security-complete-preparation-20261014/dependency-reference.private.json').read_text())
        c.require(deps['dependencyBinding']['entries']==6944,'dependency_binding_missing')
        c.require(sha((base/'package.json').read_bytes())==deps['packageJsonSha256']and sha((base/'package-lock.json').read_bytes())==deps['packageLockSha256'],'dependency_compatibility_drift')
        sources={n:ROOT/f'apps/whatsapp-agent/src/campaigns/{n}.ts'for n in ('campaignSeedEpoch','campaignSeedPrivacy')}
        source_sha={n:c.artifact_hash(p)for n,p in sources.items()}
        vfs=os.statvfs(out);c.require(vfs.f_bavail*vfs.f_frsize>=8776581120,'complete_local_budget_insufficient')
        with tarfile.open(tar)as a:
            members=a.getmembers();c.require(len(members)==446 and all(x.isfile()and '..'not in Path(x.name).parts and not Path(x.name).is_absolute()for x in members),'tar_member_contract_denied')
            for e in manifest['index']:c.require(sha(a.extractfile(e['path']).read())==e['sha256'],'sealed_member_drift')
            # All source/compatibility/budget gates precede the first copy.
            candidate=out/'candidate';candidate.mkdir(mode=0o700);a.extractall(candidate,filter='data')
        node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
        compiler=base/'node_modules/typescript'
        code="const fs=require('node:fs'),ts=require(process.argv[1]);if(process.versions.node!=='20.20.0')throw Error('node_version');process.stdout.write(ts.transpileModule(fs.readFileSync(0,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText)"
        for n,p in sources.items():
            compiled=subprocess.check_output([str(node),'-e',code,str(compiler)],input=p.read_text(),text=True)
            target=candidate/f'dist/campaigns/{n}.js';target.write_text(compiled);target.chmod(0o600)
        index=[{'path':str(p.relative_to(candidate)),'sha256':c.artifact_hash(p),'bytes':p.stat().st_size}for p in sorted(candidate.rglob('*'))if p.is_file()]
        unchanged=sum(c.artifact_hash(candidate/e['path'])==e['sha256']for e in manifest['index']);c.require(unchanged==444,'unexpected_runtime_delta')
        artifact=out/'api-seed-epoch-v3.tar'
        with tarfile.open(artifact,'x')as a:
            for e in index:a.add(candidate/e['path'],arcname=e['path'],recursive=False)
        artifact.chmod(0o600)
        extracted=out/'return-extracted';extracted.mkdir(mode=0o700)
        with tarfile.open(artifact)as a:a.extractall(extracted,filter='data')
        for e in index:c.require(c.artifact_hash(extracted/e['path'])==e['sha256'],'return_extraction_drift')
        allocated=c.reporter.inventory([str(candidate),str(extracted)])['uniqueAllocatedBytes']+artifact.stat().st_blocks*512
        c.require(allocated<=67108864,'staging_budget_exceeded')
        result={'result':'LOCAL_DERIVED_COMPLETE_COMPOSITION_PASS','artifactSha256':c.artifact_hash(artifact),'sourceArtifactSha256':SHA,'files':446,'preservedFromReviewedArtifact':444,'sourceSha256':source_sha,'allocatedBytes':allocated,'dependenciesReusedEntries':6944,'historicalCaptureIsCurrentCertificate':False,'executionAuthorized':False,'gatesFalse':True,'workerChanged':False,'frontendChanged':False}
        for name,v in [('manifest.private.json',dict(result,index=index)),('result.sanitized.json',result),('lifecycle.private.json',dict(state='REVIEW',responsible='Deifson Oliveira',lastReview='2026-10-14',nextReview='2026-10-21',purpose='separate historical grant from epoch and integrate cipher boundary',allocatedBytes=allocated,custodyPending=True,dependencies=['attested-active-node_modules'],classification='new review package; old generations retained off-host'))]:
            with(out/name).open('x')as f:json.dump(v,f,indent=2);f.write('\n')
            (out/name).chmod(0o600)
        print(json.dumps(result))
    finally:os.close(fd)
if __name__=='__main__':compose(sys.argv[1])
