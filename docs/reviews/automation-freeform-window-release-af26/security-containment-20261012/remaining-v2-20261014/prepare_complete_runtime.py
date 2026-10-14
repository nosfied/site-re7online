"""Future local API composition using the existing retention coordinator gates.
Copies only after source/identity/budget/reference gates. No production transport.
"""
import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile

ROOT=Path(__file__).resolve().parents[5]
spec=importlib.util.spec_from_file_location('future_preparers',ROOT/'scripts/operational_preparers_v3.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);c=m.c
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(p):return c.private_capture(str(p))[0]
def write(p,v):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w')as f:json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def round_up(n):return ((n+1048575)//1048576)*1048576

def prepare(captures,base,overlay,out,capture_sha,dependency_sha,verify_existing=False):
    directory=c.reporter.private_output_directory(out)
    try:
        c.require(verify_existing or not list(out.iterdir()),'output_not_empty')
        raw=read(captures/'capture.private.json');observed=json.loads(raw)
        c.require(sha(raw)==c.sha(capture_sha),'canonical_capture_hash_drift')
        at=datetime.datetime.fromisoformat(observed['atUtc']);now=datetime.datetime.now(datetime.timezone.utc)
        c.require(0<=(now-at).total_seconds()<3600,'canonical_capture_stale')
        c.require(observed['result']=='SECURITY_PREPARATION_READONLY_CAPTURE' and observed['guardGeneration']==38 and observed['newAuthNewDbUnchanged'] and observed['savedFallback600'],'canonical_identity_incomplete')
        original=ROOT/'local-evidence/retention-third-authorized-20261014T105622Z/current-postbank-source.config.private.json'
        config_raw=read(original);c.require(sha(config_raw)==observed['configurationSha256'],'configuration_source_drift')
        reference_raw=read(captures/'dependency-reference.private.json');deps=json.loads(reference_raw)
        c.require(sha(reference_raw)==c.sha(dependency_sha),'dependency_capture_hash_drift')
        c.require(0<=(now-datetime.datetime.fromisoformat(deps['atUtc'])).total_seconds()<3600,'dependency_capture_stale')
        c.require(deps['dependencyBinding']['entries']==6944,'dependency_inventory_drift')
        for filename,field in [('package.json','packageJsonSha256'),('package-lock.json','packageLockSha256')]:
            c.require(c.artifact_hash(base/filename)==deps[field],'active_package_source_drift')
        for n in ['saved.private.json','fallback.private.json']:
            c.require(sha(read(captures/n))=='3ddec68385ba02fd39d5592baf33e413d92e9b102dbdf6051afebe64aba427c1','saved_fallback_source_drift')
        expected_processes=copy.deepcopy(observed['contextObservation']['samples'][0]['processes'])
        expected_ids={'re7-whatsapp-agent':(410272,'2170884687'),'re7-whatsapp-web-worker':(410428,'2170885045'),'re7-admin-front':(188897,'2161347676')}
        configured={a['name']:a for a in json.loads(config_raw)['apps']}
        c.require(set(expected_processes)==set(expected_ids),'context_membership_drift')
        for name,(pid,ticks)in expected_ids.items():
            c.require(expected_processes[name]['pid']==pid and expected_processes[name]['ticks']==ticks and expected_processes[name]['configSha256']==sha(json.dumps(configured[name],sort_keys=True).encode()),'sealed_process_or_configuration_drift')
        expected={'uid':1000,'processes':expected_processes}
        context=c.context_review(observed['contextObservation'],expected)
        manifest=json.loads(read(overlay/'manifest.sanitized.json'))
        base_index=[(str(p.relative_to(base)),sha(p.read_bytes()))for p in sorted((base/'dist').rglob('*'))if p.is_file()and not p.is_symlink()]
        c.require(sha(json.dumps(base_index).encode())==manifest['baseCompiledIndexSha256'],'base_source_drift')
        for change in manifest['changes']:
            c.require(c.artifact_hash(overlay/change['path'])==change['candidateSha256'],'scoped_overlay_source_drift')
        request={'expected':{'sha256':sha(read(overlay/'manifest.sanitized.json')),'runtime':'Node20.20.0','dependenciesSha256':sha(reference_raw),'contract':'active-base-plus-sealed-seed-overlay'},'existing':[],'reusePermitted':True,'newCopyAllocatedBytes':0,'newLinks':[]}
        request['existing']=[dict(request['expected'],path=str(overlay/'manifest.sanitized.json'),dependenciesCapturePath=str(captures/'dependency-reference.private.json'))]
        reuse=c.reuse_decision(request)
        db=max(s['metrics']['databaseBytes']for s in observed['capacity'])
        dump=round_up(db*4+64*1048576);restore=round_up(db*2+512*1048576)
        budget={'root':{'phase':'decoder-epoch-and-channel-local-review','reserveSource':'retained operational floor2131755008 plus explicit new independent rubrics; this is a proposal, not a window gate',
         'canonicalReserveBytes':2131755008,'stagingBytes':64*1048576,'returnBytes':4*1048576,
         'backupBytes':dump+restore,'walGrowthBytes':1073741824,'evidenceBytes':256*1048576,'nonOverlappingRubrics':True}}
        samples=[]
        for e,k in [('deploy','deployAvailableBytes'),('postgres','postgresAvailableBytes')]:
            samples.append({'filesystem':'root','executor':e,'availableBytes':min(s[k]for s in observed['capacity']),'complete':True,'freshForReview':True,'walAndGrowthReviewed':all(s['metrics']['slots']==0 and s['metrics']['archiveMode']=='off'for s in observed['capacity']),'writeErrors':observed['recentWriteErrors'],'atUtc':observed['atUtc']})
        capacity=c.capacity_review(samples,budget)
        # Exact exported package/dependency sources form this local package graph.
        # Operational/global reference closure is a separate final-window gate.
        c.require(sha(json.dumps(deps['files'],sort_keys=True).encode())==deps['dependencyBinding']['indexSha256'],'dependency_index_integrity_denied')
        # A dependency index's relative member paths are rooted at its captured
        # resolvedTarget, not at the off-host JSON's directory. Preserve raw
        # capture hash and normalize that explicit schema before graph resolution.
        dep_root=deps['dependencyBinding']['resolvedTarget'];dep_members=[os.path.normpath(dep_root+'/'+f['path'])for f in deps['files']]
        c.require(all(p.startswith(dep_root+'/')for p in dep_members),'dependency_member_escape')
        links=[f for f in deps['files']if 'link'in f]
        link_targets=[os.path.normpath(f['link']if f['link'].startswith('/')else os.path.dirname(dep_root+'/'+f['path'])+'/'+f['link'])for f in links]
        c.require(all(t in dep_members for t in link_targets),'dependency_link_unresolved')
        graph_path=out/'reference-graph.private.json';empty=out/'leaf-metadata.private.json'
        graph={'sourceCaptureSha256':sha(reference_raw),'dependencyRoot':dep_root,'members':dep_members,'dependencyIndexSha256':deps['dependencyBinding']['indexSha256']}
        if verify_existing:
            c.require(json.loads(read(graph_path))==graph and json.loads(read(empty))=={},'existing_reference_graph_drift')
        else:
            write(graph_path,graph);write(empty,{})
        sources=[{'path':str(graph_path),'capturePath':str(graph_path),'sha256':sha(read(graph_path))}]
        sources += [{'path':n,'capturePath':str(empty),'sha256':sha(read(empty))}for n in [dep_root,*dep_members]]
        refs=c.reference_review([str(graph_path),dep_root,*dep_members],sources,[str(graph_path)])
        c.require(os.statvfs(out).f_bavail*os.statvfs(out).f_frsize>=budget['root']['stagingBytes'],'local_staging_space_insufficient')
        gate={'context':context,'capacity':capacity,'artifactReuse':reuse,'references':refs,'originalCaptureSha256':sha(raw),'dependenciesCaptureSha256':sha(reference_raw),'budget':budget,'dumpBoundBytes':dump,'restoreBoundBytes':restore,'referenceScope':'local compiled/dependency package provenance only, no global production reference certificate','executionAuthorized':False}
        if verify_existing:
            manifest=json.loads(read(out/'runtime-manifest.private.json'))
            c.require(c.artifact_hash(out/'api-seed-epoch.tar')==manifest['artifactSha256'],'existing_runtime_tar_drift')
            for item in manifest['index']:
                c.require(c.artifact_hash(out/'candidate'/item['path'])==c.artifact_hash(out/'extracted'/item['path'])==item['sha256'],'existing_runtime_member_drift')
            proof={'result':'SEALED_CAPTURES_SOURCE_IDENTITY_BUDGET_DEPENDENCIES_AND_EXISTING_ARTIFACT_PASS','dependencyLinksClosed':len(links),'artifactSha256':manifest['artifactSha256'],'artifactCopiedAgain':False,'capacity':capacity,'executionAuthorized':False}
            write(out/'sealed-gate-verification.sanitized.json',proof);print(json.dumps(proof));return
        write(out/'before.private.json',gate)
        # Gate above is complete before first copy/compile/tar. Historical
        # preparations and the reused overlay are never modified.
        candidate=out/'candidate';candidate.mkdir(mode=0o700)
        changed={e['path']:overlay/e['path']for e in manifest['changes']}
        files={name:base/name for name,_ in base_index};files.update(changed)
        files.update({n:base/n for n in ['package.json','package-lock.json']})
        for name,source in files.items():
            target=candidate/name;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            before=c.artifact_hash(source);target.write_bytes(source.read_bytes());target.chmod(0o600)
            c.require(before==c.artifact_hash(source)==c.artifact_hash(target),'copy_source_or_output_drift')
        node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
        c.require(subprocess.check_output([str(node),'-p','process.versions.node'],text=True).strip()=='20.20.0','runtime_version_drift')
        compiler=ROOT/'apps/whatsapp-agent/node_modules/typescript/lib/typescript.js'
        compile_js="const fs=require('fs'),ts=require(process.argv[1]);process.stdout.write(ts.transpileModule(fs.readFileSync(0,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020,esModuleInterop:true}}).outputText)"
        for name in ['campaignSeedEpoch','campaignSeedPrivacy']:
            source=ROOT/f'apps/whatsapp-agent/src/campaigns/{name}.ts'
            code=subprocess.check_output([str(node),'-e',compile_js,str(compiler)],input=source.read_text(),text=True)
            target=candidate/f'dist/campaigns/{name}.js';target.write_text(code);target.chmod(0o600)
        index=[{'path':str(p.relative_to(candidate)),'sha256':c.artifact_hash(p),'bytes':p.stat().st_size}for p in sorted(candidate.rglob('*'))if p.is_file()]
        artifact=out/'api-seed-epoch.tar'
        with tarfile.open(artifact,'x',format=tarfile.PAX_FORMAT)as archive:
            for entry in index:archive.add(candidate/entry['path'],arcname=entry['path'],recursive=False)
        artifact.chmod(0o600)
        # Isolated extraction proves member set/content and rejects links.
        extracted=out/'extracted';extracted.mkdir(mode=0o700)
        with tarfile.open(artifact)as archive:
            members=archive.getmembers();c.require(all(t.isfile()and not Path(t.name).is_absolute()and '..'not in Path(t.name).parts for t in members),'tar_member_contract_denied')
            archive.extractall(extracted,filter='data')
        for e in index:c.require(c.artifact_hash(extracted/e['path'])==e['sha256'],'isolated_extract_hash_drift')
        measurement=c.reporter.inventory([str(candidate),str(extracted)])
        c.require(measurement['metadataCompleteWithinBudget'] and not measurement['errors'],'allocated_inventory_incomplete')
        allocated=measurement['uniqueAllocatedBytes']+artifact.stat().st_blocks*512
        c.require(allocated<=budget['root']['stagingBytes'],'complete_staging_budget_exceeded')
        result={'result':'COMPLETE_COMPILED_API_AND_SHARED_COMPATIBLE_RETURN_LOCAL_PASS','artifactSha256':c.artifact_hash(artifact),'files':len(index),'allocatedStagingBytes':allocated,'dependenciesIndexSha256':deps['dependencyBinding']['indexSha256'],'dependencyEntries':6944,
          'return':'same immutable compiled artifact, separately bound return configuration; no second executable copy','budget':budget,'dumpBoundBytes':dump,'restoreBoundBytes':restore,'capacity':capacity,'productionWindowReady':False,'gatesFalse':True,'workerChanged':False,'frontendChanged':False}
        write(out/'runtime-manifest.private.json',dict(result,index=index,dependencyBinding=deps['dependencyBinding']))
        write(out/'result.sanitized.json',result)
        sidecar={'generation':out.name,'purpose':'local decoder/epoch and compatible return composition','state':'REVIEW','responsible':'Deifson Oliveira','lastReview':'2026-10-14','nextReview':'2026-10-21','allocatedBytes':allocated,'custodyPending':True,'classifications':c.classify('REVIEW',[{'path':str(artifact),'kind':'package','neededOnHost':True}],{str(artifact)}),'historicalPreparationsChanged':False,'executionAuthorized':False}
        write(out/'lifecycle.private.json',sidecar)
        print(json.dumps(result))
    finally:os.close(directory)

if __name__=='__main__':
    import sys
    try:prepare(*(Path(p).absolute()for p in sys.argv[1:5]),sys.argv[5],sys.argv[6],verify_existing='--verify-existing'in sys.argv[7:])
    except Exception as e:
        print(json.dumps({'result':'COMPLETE_RUNTIME_PREPARATION_DENY','errorClass':type(e).__name__,'reason':str(e)if isinstance(e,ValueError)else'private_diagnostic_required','automaticRetry':False}));raise SystemExit(1)
