"""CSV-only offline delivery composition. No build, extraction, VPS or phase authority.
Existing runtime archives stay at their certified locations; code objects are deduped.
"""
import argparse
import ast
import hashlib
import io
import tarfile
import json
import os
from pathlib import Path
import subprocess

from scripts.crm_csv_predecessor import composition, sources
from scripts.crm_csv_predecessor.test_predecessor import stored

ROOT=Path(__file__).resolve().parents[2]
REVIEW=ROOT/'docs/reviews/automation-freeform-window-release-af26'
BASE='a1f934c9ec2132cbf2087f903ed40c428a6f1b5b'
COORD=REVIEW/'crm-csv-coordinated-20261015'
HERE=Path(__file__).resolve().parent

def need(ok, reason):
    if not ok:raise RuntimeError(reason)

def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(v):return (json.dumps(v,sort_keys=True,indent=2)+'\n').encode()

def pinned(path):
    path=Path(path);name=str(path.relative_to(ROOT))
    raw=subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT)
    need(path.read_bytes()==raw,'accepted_input_drift')
    return raw

def reader():
    raw=pinned(REVIEW/'crm-csv-r2-directed-20261017/read_package.py')
    need(sha(raw)=='66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691','reader_pin')
    scope={'__name__':'canonical_read_only_library'}
    exec(compile(raw,'<canonical byte reader>','exec'),scope)
    return scope

def artifacts(material):
    lib=reader();summary=json.loads(pinned(COORD/'ARTIFACTS_SANITIZED.json'))
    rows={};cache={}
    expected=dict(summary['artifacts'])
    expected.update(summary['auxiliaryArtifacts'])
    for name,row in expected.items():
        path=Path(material)/row['file'];raw,m=lib['stable_file'](path,256*1024**2)
        need(len(raw)==row['bytes'] and sha(raw)==row['sha256'],'certified_artifact_drift')
        del raw
        cache[row['file']]=row['sha256']
        rows[name]={'file':row['file'],'sha256':row['sha256'],'bytes':row['bytes'],'verifiedLocally':True,
                    'runtimeFreshnessCertified':False,'copied':False,'rebuilt':False,'extracted':False}
        if 'manifestSha256' in row:
            mf=Path(material)/(Path(row['file']).name.split('.tar')[0]+'.manifest.private.json')
            data,_=lib['stable_file'](mf);need(sha(data)==row['manifestSha256'],'certified_manifest_drift')
            rows[name]['manifestSha256']=sha(data)
            if name=='api-candidate':api=json.loads(data)
    need(summary['apiReturnReuses']=='api-candidate','compatible_return_drift')
    # Bind the original member hashes to the approved ORIGINAL archive itself,
    # not to an unpinned local source-plan JSON. Read members in memory only.
    original,_=lib['stable_file'](ROOT/'local-evidence/security-v3-runtime-20261014/api-seed-epoch-v3.tar',256*1024**2)
    need(sha(original)==summary['activeApiSourceSha256'] and api['baseSha256']==summary['activeApiSourceSha256'],'original_runtime_archive_drift')
    with tarfile.open(fileobj=io.BytesIO(original),mode='r:') as archive:
        members=[m for m in archive.getmembers() if m.isfile()]
        need(len({m.name for m in members})==len(members),'original_runtime_duplicate_member')
        before={m.name:sha(archive.extractfile(m).read()) for m in members}
    del original
    after={x['path']:x['sha256'] for x in api['files']}
    need(len(before)==446 and len(after)==447 and len(api['sharedLinks'])==2,'runtime_population_drift')
    changed={n for n,h in before.items() if after.get(n)!=h}
    need(changed=={'dist/crm/crmContactUpsert.js','dist/crm/crmContactsReadModel.js','dist/events/eventRetentionPolicy.js','dist/http/routes.js'},'runtime_changed_outside_csv')
    need(set(after)-set(before)=={'dist/crm/crmCsvImportOperation.js'},'runtime_extra_module')
    need(sum(before[n]==after.get(n) for n in before)==442,'preserved_runtime_drift')
    overlay=json.loads(pinned(COORD/'EVENT_CONTROL_CONSUMERS.json'))
    need(overlay['sha256']==rows['events-control-policy-overlay']['sha256'],'overlay_binding_drift')
    need(sha(pinned(ROOT/overlay['files'][0]['path']))==overlay['files'][0]['sha256'],'overlay_source_drift')
    proof=json.loads(pinned(COORD/'COMPILED_PROOF_SANITIZED.json'))
    need(proof['getPreservedForReturn'] and proof['replayedWrites']==0 and proof['legacyPostDeniedBeforeAdmission'],'compiled_contract_evidence')
    return {'artifacts':rows,'preservedApiFiles':442,'candidateApiFiles':447,'workerChanged':False,
            'compatibleApiReturn':'api-candidate_after_selection','originalBeforeSelectionOnly':True,
            'newAuthNewDbNewCipher':'historical_runtime_members_preserved_current_profiles_pending',
            'compiledProofSha256':sha(pinned(COORD/'COMPILED_PROOF_SANITIZED.json')),
            'budgetReferenceSha256':sha(pinned(COORD/'CAPACITY_BUDGET.json')),
            'minimumDeployPostgresBytesReference':11235700736,'capacityFresh':False}

def boundary_source(plan, objects):
    name='window/prestop_contract.py';row=plan['files'][name];raw=objects[row['sha256']]
    need(sha(raw)==row['sha256'] and len(raw)==row['bytes'],'prestop_source_drift')
    # The same complete accepted module, not a second permissive Event predicate.
    compile(raw,'<canonical prestop library>','exec')
    return raw

def compose(custody, material):
    predecessor=stored(custody)  # exact existing receipt/policy pins; no current authority inferred
    reuse=artifacts(material)
    plan,objects=composition.compose(predecessor)
    # Canonical seal DAG is eager. Accepted late call cycles stay inventoried,
    # not converted into a new prohibition or silently removed.
    need(not plan['cycles'] and not plan['integrationBlocks'],'accepted_composition_incomplete')
    need(plan['executionAuthorized'] is False and plan['operationallyCertified'] is False,'static_composition_kind')
    need(len(plan['files'])==127,'composition_population_drift')
    # Cover R1/R2/prevention/ORIGINAL and accepted deltas, not just a mode count.
    required={'window/recovery.py','window/original_checks.py','window/recovery_contract.py','window/prestop_contract.py',
              'window/policy_predecessor.py','window/csv_boundary.py','window/csv_cli.py','window/scheduled_controls.py',
              'protected/authority.py','protected/child_transport.py','protected/verified_loader.py'}
    need(required<=set(plan['files']),'canonical_consumer_missing')
    for mode in ('switch','return','return-partial','return-before-commit'):
        need(mode+'/ops.py' in plan['files'] and mode+'/pm2_input.py' in plan['files'],'mode_consumer_missing')
    return reuse,plan,objects

def references(plan,objects):
    known={}
    for folder in ('crm-csv-root-authority-b4-20261016','crm-csv-mode-closure-20261016','crm-csv-original-chain-20261016'):
        d=REVIEW/folder/'static-kit/objects'
        for h in objects:
            path=d/(h+'.source')
            if h not in known and path.is_file():
                raw=pinned(path);need(sha(raw)==h,'existing_object_drift');known[h]=str(path.relative_to(ROOT))
    # Reuse the prior published delivery objects rather than copying its seven
    # derived leaves again. The index and every referenced source are Git-pinned.
    prior=REVIEW/'crm-csv-delivery-review-20261017/CODE_OBJECTS.json'
    index=json.loads(pinned(prior))
    for digest,row in index['objects'].items():
        if digest in objects and digest not in known:
            value=pinned(ROOT/row['source'])
            need(sha(value)==digest and len(value)==row['bytes'],'prior_object_drift')
            known[digest]=row['source']
    # Reuse direct reviewed source leaves when byte-exact, too.
    for name in ('runtime.py','pre_authority.py'):
        path=ROOT/'scripts/crm_csv_predecessor'/name;raw=pinned(path);h=sha(raw)
        if h in objects:known.setdefault(h,str(path.relative_to(ROOT)))
    path=ROOT/'scripts/crm_csv_delivery/capture_imports.source';raw=pinned(path);digest=sha(raw)
    if digest in objects:known.setdefault(digest,str(path.relative_to(ROOT)))
    return known

def prepare(custody,material,out):
    out=Path(out).absolute();need(out.is_relative_to(ROOT),'review_destination_outside_checkout')
    need(not os.path.lexists(out),'exclusive_review_destination_required')
    reuse,plan,objects=compose(custody,material)
    refs=references(plan,objects);new={h:r for h,r in objects.items() if h not in refs}
    need(sum(map(len,new.values()))<1024**2,'new_review_code_budget')
    # All artifact and source checks precede new review files; no copied runtimes/data.
    out.mkdir(mode=0o700);(out/'objects').mkdir(mode=0o700)
    def write(name,raw):
        with (out/name).open('xb') as f:f.write(raw)
    for h,raw in new.items():write('objects/'+h+'.source',raw)
    for h in new:refs[h]=str((out/'objects'/(h+'.source')).relative_to(ROOT))
    write('CODE_COMPOSITION.json',encode(plan))
    write('CODE_OBJECTS.json',encode({'objects':{h:{'source':refs[h],'bytes':len(raw)} for h,raw in sorted(objects.items())},
        'reusedObjects':len(objects)-len(new),'newObjects':len(new),'newBytes':sum(map(len,new.values()))}))
    boundary=boundary_source(plan,objects)  # reuse canonical object; no duplicate source copy
    delivery={'base':BASE,'result':'CSV_LOCAL_COMPOSITION_COMPLETE_OPERATIONAL_INPUTS_DENIED','csvSuspended':True,
              'auxiliaryElfFront':'PAUSED_NO_NEW_EXECUTION_OR_GENERATION','runtimeReuse':reuse,
              'compositionSha256':sha(encode(plan)),'codeObjectsSha256':sha((out/'CODE_OBJECTS.json').read_bytes()),
              'prestopSourceSha256':sha(boundary),'prestopSource':refs[sha(boundary)],'preparedModes':['PRESTOP','ORIGINAL','CANDIDATE','DENY'],
              'phaseAuthorityInstalled':False,'legacyClassifierSha256':plan['files']['window/capture_imports.py']['sha256'],'sqlPreparatoryEvidence':'SQL_V2_RESULT.json:17:44 observation only, not ownership/executor exit','scopeReviewOwnerConfirmed':False,'operationalGenerationCreated':False,'currentInputsFabricated':False,
              'originalCompatibility':'Only unselected certified exit with full R1/R2, fresh identity/generation, explicit recovery authority; never after possible candidate admission',
              'postSelectionReturn':'candidate backend remains; frontend may return to certified compatible package; persistent backend failure needs another compatible version',
              'nextOperationalAct':'Owner review of derived private20-operation inventory and knownActivityScope; no new read, no M1 or SQL replay. Exit/ownership under containment belongs only to a separately authorized future window',
              'acceptedProofsReused':['R1/R2 correction32','prestop equivalence','authority R3/B2/B1/B3','ORIGINAL chain28','compiled CSV and operationalStatus','browser UUID/timeout/reentry','restore retained/stopped'],
              'notCertified':['current processes/config/saved/fallback','ownership and executor/import exit under future authorized containment','Event parents current/CAS','root protected code/toolchain/phase authority','fresh capacity/WAL/RPO','16 future path bindings','post-API frontend successors']}
    write('DELIVERY.json',encode(delivery))
    return delivery

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for n in ('custody','material','out'):p.add_argument('--'+n,required=True)
    a=p.parse_args();r=prepare(a.custody,a.material,a.out)
    print(json.dumps({'result':r['result'],'compositionSha256':r['compositionSha256'],'runtimeArchivesReused':4,'profilesIssued':False}))
