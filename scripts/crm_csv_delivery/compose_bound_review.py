"""New PRIVATE static review tree; canonical producers only, no window binding.
Never invoke historical compose/bind/install entrypoints or copy consumed intents.
"""
import ast,copy,hashlib,json,os,subprocess,types
from pathlib import Path
from scripts.crm_csv_delivery import integrated_audit as a
from scripts.crm_csv_delivery import materialize_activity as activity
from scripts.crm_csv_predecessor import sources
BASE='f8d8ea0bead5de7c71b913228cf9bd0225506ce7'
RV=a.D.parent;MODES=('switch','return','return-partial','return-before-commit')
STAGE=a.ROOT/'local-evidence/crm-csv-staging-20261016/incident-6683-v4-csv-staged-v2-20261016T094000Z'
CIPHER=a.ROOT/'local-evidence/cipher-v14-executed-20261015/re7-v14-authorized-execution-20261015T150800Z/verified-extraction/incident-6683-v4-security-cipher-controls-v14-20261015T130000Z'
DEST=a.SOURCE.parent.parent/'csv-bound-static-review-20261017-v1'
REMOTE='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-local-review-20261017-v1'
TARGET='/opt/re7online/releases/crm-csv-24e5857f-20261016/apps/whatsapp-agent'
RESULT='BOUND_STATIC_RESULT.json'

def require(v,r):
 if not v:raise RuntimeError(r)

def published(p):
 raw,_=activity.link.prior.reader()['stable_file'](p)
 require(raw==subprocess.check_output(['git','show',BASE+':'+str(p.relative_to(a.ROOT))],cwd=a.ROOT),'bound_published_drift')
 return raw

def sealed(root,review_sha):
 lib=activity.link.prior.reader();raw,_=lib['stable_file'](root/'preparation-review.sha256');require(a.sha(raw)==review_sha,'bound_historical_review_drift')
 refs={}
 for line in raw.decode().splitlines():
  h,n=line.split('  ',1);require(not Path(n).is_absolute()and '..'not in Path(n).parts,'bound_historical_reference');refs[n]=h
 def read(n):
  b,_=lib['stable_file'](root/n);require(n in refs and a.sha(b)==refs[n],'bound_historical_member_drift');return b
 wm=json.loads(read('window/sequencer-manifest.json'))
 def window(n):
  b,_=lib['stable_file'](root/'window'/n);require(a.sha(b)==wm['filesSha256'][n],'bound_historical_window_drift');return b
 return read,window

def producer():
 path=RV/'crm-csv-operational-20261016/compose.py';raw=published(path);tree=ast.parse(raw)
 funcs=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ('sha','put','seal')]
 require(len(funcs)==3,'bound_seal_producer_interface')
 ns={'Path':Path,'json':json,'hashlib':hashlib,'MODES':MODES,'REMOTE':REMOTE}
 exec(compile(ast.fix_missing_locations(ast.Module(body=funcs,type_ignores=[])),str(path)+'#seal','exec'),ns)
 body=next(n.body for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='compose')
 # Exact original profile construction statements, supplied authenticated source.
 first=next(i for i,n in enumerate(body)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='target'for t in n.targets))
 last=next(i for i,n in enumerate(body)if isinstance(n,ast.Expr)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Attribute)and n.value.func.attr=='profile_delta')
 profile_nodes=[n for n in body[first:last+1]if not(isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='boundary'for t in n.targets))]
 profile=compile(ast.fix_missing_locations(ast.Module(body=profile_nodes,type_ignores=[])),str(path)+'#profiles','exec')
 variants=next(n for n in ast.walk(tree)if isinstance(n,ast.For)and isinstance(n.target,ast.Tuple)and [getattr(t,'id',None)for t in n.target.elts]==['n','v']and isinstance(n.iter,ast.List))
 variant=compile(ast.Expression(variants.iter),str(path)+'#mode-profiles','eval')
 return ns,profile,variant,{'path':str(path.relative_to(a.ROOT)),'sha256':a.sha(raw),'functions':['sha','put','seal'],'profileStatements':'Original target copy/API cwd+script/profile_delta and mode expressions. Historical boundary path-import statement is excluded and supplied by authenticated composed bytes; no compose invocation'}

def inputs():
 stage,window=sealed(STAGE,'06459884b2822c1fc1b252ced894f14b599d907133592173563aac6d7bb55819')
 source=window('source.profile.private.json');require(a.sha(source)=='a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e','bound_original_profile')
 _,cw=sealed(CIPHER,'c6c0eaab668c199d8ab8705ff9457776cebfea683efaa3941437ae2d624a5fe5')
 paths=cw('path-bindings.private.json')
 contract=window('csv-contract.private.json')
 prior=a.ROOT/'local-evidence/crm-csv-original-recovery-20261016/original-return-policy.private.json'
 predecessor,_=activity.link.prior.reader()['stable_file'](prior);sources.predecessor(predecessor)
 receipt=json.loads(published(a.D/activity.RESULT));scope,_=activity.link.prior.reader()['stable_file'](activity.DEST/'window/csv-known-imports.private.json')
 require(a.sha(scope)==receipt['files']['window/csv-known-imports.private.json']['sha256'],'bound_scope_drift')
 return stage,window,source,paths,contract,predecessor,scope

def compose(out):
 previous=os.umask(0o077)
 try:return _compose(out)
 finally:os.umask(previous)

def _compose(out):
 lib=activity.link.prior.reader();require(not os.path.lexists(out),'bound_destination_exists')
 stage,window,source_raw,paths_raw,prior_raw,pred,scope=inputs()
 raw,plan,objects=a.composed_inputs();ns,profile_code,variants,origin=producer()
 # Compile authenticated pure ecosystem/boundary functions, never execute a CJS/CLI.
 def module(name):
  b=objects[plan['files']['window/'+name+'.py']['sha256']]
  from scripts.crm_csv_predecessor.pre_authority import compile_library
  return compile_library('bound_'+name,b)
 boundary=module('csv_boundary');eco=module('ecosystem_contract')
 env={'source':json.loads(source_raw),'copy':copy,'TARGET':TARGET,'boundary':boundary}
 exec(profile_code,env);source,target=env['source'],env['target']
 oldpaths=json.loads(paths_raw);paths={}
 for app in source['apps']:
  key=app['cwd']+'/.data'
  if key in oldpaths:paths[key]=oldpaths[key]
 require(len(paths)==2,'bound_historical_data_coverage')
 # Same .data target as the certified API artifact, not a local resolve() guess.
 manifest_path=a.ROOT/'local-evidence/crm-csv-coordinated-20261015/api-candidate.manifest.private.json'
 mf,_=lib['stable_file'](manifest_path);delivery=json.loads(published(a.PACKAGE/'DELIVERY.json'))
 require(a.sha(mf)==delivery['runtimeReuse']['artifacts']['api-candidate']['manifestSha256'],'bound_api_manifest')
 links=json.loads(mf)['sharedLinks'];entry=next(x for x in links if x['path']=='.data')
 original_api=next(x for x in source['apps']if x['name']=='re7-whatsapp-agent')
 require(paths[original_api['cwd']+'/.data']==entry['target'],'bound_data_artifact_drift')
 paths[TARGET+'/.data']=entry['target']
 contract=sources.produce_contract(json.loads(prior_raw),pred)
 contract.update(remotePreparation=REMOTE,sourceProfileSha256=a.sha(a.encode(source)),targetProfileSha256=a.sha(a.encode(target)))
 data={'window/source.profile.private.json':a.encode(source),'window/target.profile.private.json':a.encode(target),
  'window/path-bindings.private.json':a.encode(paths),'window/csv-contract.private.json':a.encode(contract),
  'window/csv-known-imports.private.json':scope}
 for mode in MODES:
  for n,v in eval(variants,{'source':source,'target':target,'mode':mode}):data[mode+'/'+n]=a.encode(v)
  for n in ('plan.private.json','baseline.private.json','backup-manifest.json','proof-bindings.private.json'):
   data[mode+'/'+n]=stage(mode+'/'+n)
  require(json.loads(data[mode+'/plan.private.json'])['mode']==mode,'bound_mode_plan')
 # Retained original proofs remain byte-exact, with historical metadata unrefreshed.
 for n in ('restore-result.json','restore-contract.private.json','original-restore-proof.private.json','backup-compatibility.private.json','backup-manifest.private.json'):
  data['window/'+n]=window(n)
 policy=json.loads(window('privileged-policy.private.json'));policy['preparation']=REMOTE
 data['window/privileged-policy.private.json']=a.encode(policy);data['window/privileged-policy.sha256']=(a.sha(a.encode(policy))+'\n').encode()
 data['window/binding-status.private.json']=a.encode({'state':'TEMPLATE_NOT_ADMITTED','historicalIdentitiesOnly':True,'executionAuthorized':False,'freshness':None,'exit':None,'ownership':None,'phaseAuthority':None})
 data['window/execution-gates.private.json']=a.encode({n:False for n in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')})
 data['execution-authorized']=b'false\n';data['COMPOSITION.json']=raw
 names={mode:sorted({n.split('/',1)[1]for n in plan['files']if n.startswith(mode+'/')}|{n.split('/',1)[1]for n in data if n.startswith(mode+'/')}|{'candidate.ecosystem.config.cjs','return.ecosystem.config.cjs'})for mode in MODES}
 data['window/mode-names.private.json']=a.encode(names)
 size=sum(len(objects[r['sha256']])for r in plan['files'].values())+sum(map(len,data.values()))
 require(size<8*1024**2,'bound_static_budget')
 capacity=os.statvfs(Path(out).parent)
 require(capacity.f_bavail*capacity.f_frsize>=8*1024**2+64*1024**2,'bound_local_capacity')
 out=lib['new_directory'](out)
 for d in ('window','review','protected',*MODES):lib['new_directory'](out/d)
 for name,row in plan['files'].items():lib['write_artifact'](out/name,objects[row['sha256']])
 for name,b in data.items():lib['write_artifact'](out/name,b)
 for mode in MODES:eco.generate_mode(out/mode)
 ns['seal'](out) # Exact historical seal function, ONLY on this exclusive new tree.
 eco.validate_all(out);boundary.profile_delta(source,target,TARGET)
 require(all(json.loads((out/'window/execution-gates.private.json').read_bytes())[n]is False for n in json.loads((out/'window/execution-gates.private.json').read_bytes())),'bound_gates_not_false')
 return {'result':'FOUR_MODE_STATIC_DATA_COMPOSED_NOT_WINDOW_BOUND','producer':origin,'proposedRemotePreparation':REMOTE,'proposedApiTarget':TARGET,
  'profileSourceSha256':a.sha(source_raw),'sourceProfileMaterializedSha256':a.sha((out/'window/source.profile.private.json').read_bytes()),'targetProfileSha256':a.sha((out/'window/target.profile.private.json').read_bytes()),
  'pathBindingsSha256':a.sha((out/'window/path-bindings.private.json').read_bytes()),'historicalSourceBindings':2,'proposedCandidateBinding':1,
  'reviewSha256':a.sha((out/'preparation-review.sha256').read_bytes()),'modeManifestSha256':a.sha((out/'window/mode-manifest-v4.json').read_bytes()),'windowManifestSha256':a.sha((out/'window/sequencer-manifest.json').read_bytes()),
  'files':sum(f.is_file()for f in out.rglob('*')),'writtenBytes':sum(f.stat().st_size for f in out.rglob('*')if f.is_file()),'copyBudgetBytes':8*1024**2,'modeFiles':{mode:len(names[mode])for mode in MODES},'codeObjectsChanged':0,'runtimeCopies':0,
  'windowBound':False,'freshness':None,'executorExit':None,'ownership':None,'phaseAuthority':None,'historicalProofsRefreshed':False,
  'status':'PREPARED LOCALLY / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}


def composed_hashes(root):
 names=['window/csv-contract.private.json','window/source.profile.private.json','window/target.profile.private.json','window/path-bindings.private.json','window/privileged-policy.private.json','window/mode-manifest-v4.json','window/sequencer-manifest.json','preparation-review.sha256']
 names += [mode+'/'+n for mode in MODES for n in ('candidate.config.private.json','return.config.private.json','candidate.ecosystem.config.cjs','return.ecosystem.config.cjs','scripts.sha256')]
 return {n:a.sha((root/n).read_bytes())for n in names}

def input_coverage(plan,root):
 # missingInputs contains both literal paths and descriptive groups; never test
 # a phrase like "restore proofs and mode ..." as though it were a filename.
 literals=[r['name']for r in plan['missingInputs']if ' 'not in r['name']and r['name'].endswith(('.json','.sha256','.cjs'))]
 groups=[r['name']for r in plan['missingInputs']if r['name']not in literals]
 present=[n for n in literals if(root/n).is_file()];absent=[n for n in literals if not(root/n).is_file()]
 historical=[]
 restored='window/restore proofs and mode backup/baseline/proof-bindings'
 if restored in groups and all((root/'window'/n).is_file()for n in ('restore-result.json','restore-contract.private.json','original-restore-proof.private.json')):
  historical.append(restored);groups.remove(restored)
 partial=[]
 manifests='mode/window manifests and original-preparation-review.sha256'
 if manifests in groups:
  partial.append({'group':manifests,'supplied':['window/mode-manifest-v4.json','window/sequencer-manifest.json','four mode scripts.sha256'],'notSupplied':['original-preparation-review.sha256']})
  groups.remove(manifests)
 return {'requiredDataPresent':present,'requiredDataAbsent':absent,'historicalDataGroupsSupplied':historical,'partialRequirementGroups':partial,'remainingRequirementGroups':groups}

def prepare():
 from scripts.crm_csv_predecessor.pre_authority import compile_library
 lib=activity.link.prior.reader()
 require(not os.path.lexists(a.D/RESULT),'bound_public_destination_exists')
 writer,_=lib['stable_file'](RV/'crm-csv-r2-directed-20261017/privileged_output.source')
 require(a.sha(writer)=='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a','canonical_writer')
 record=compile_library('canonical_bound_static_writer',writer).private_record
 folder=lib['new_directory'](DEST)
 record(folder,'privileged-output.private.jsonl',{'event':'bound_static_begin','utc':lib['utc'](),'base':BASE})
 try:
  result=compose(folder/'preparation')
  with a.composed_loader()as(loader,root,plan):
   checker=loader.local_module(root/'window/csv_contract.py')
   result['canonicalOfflineCheck']=checker.check(folder/'preparation',live=False)
   result.update(input_coverage(plan,folder/'preparation'))
   loader.authority.revalidate()
  result['privateDirectoryName']=DEST.name
  result['composedHashes']=composed_hashes(folder/'preparation')
  result['firstOperationalBlocker']='binding-status is TEMPLATE_NOT_ADMITTED, not WINDOW_BOUND; historical source identities and immutable metadata need current canonical revalidation, protected phase installation/authority remains absent. No owner approval inferred.'
  result['sourceHistoricalReviewSha256']='06459884b2822c1fc1b252ced894f14b599d907133592173563aac6d7bb55819'
  result['cipherHistoricalReviewSha256']='c6c0eaab668c199d8ab8705ff9457776cebfea683efaa3941437ae2d624a5fe5'
  result['proposedPolicyInstalled']=False;result['authorityIssued']=False
  record(folder,'privileged-output.private.jsonl',{'event':'bound_static_end','utc':lib['utc'](),'result':result['result'],'reviewSha256':result['reviewSha256']})
  raw,_=lib['stable_file'](folder/'privileged-output.private.jsonl');result['journal']={'bytes':len(raw),'sha256':a.sha(raw)}
  lib['write_artifact'](a.D/RESULT,a.encode(result))
  return result
 except Exception as e:
  record(folder,'privileged-output.private.jsonl',{'event':'bound_static_deny_preserved_no_retry','utc':lib['utc'](),'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
  raise

if __name__=='__main__':
 os.umask(0o077);r=prepare();print(json.dumps({'result':r['result'],'check':r['canonicalOfflineCheck'],'windowBound':False,'runtimeCopies':0}))
