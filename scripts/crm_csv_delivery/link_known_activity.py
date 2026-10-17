"""Offline documentary linkage and static handoff; never an operational binding.
Original inventory, draft, statement, journals and composition remain immutable.
"""
import json,os,subprocess
from pathlib import Path
from scripts.crm_csv_delivery import integrated_audit as audit
from scripts.crm_csv_delivery import review_known_activity as prior
from scripts.crm_csv_predecessor.pre_authority import compile_library
BASE='a953df2fed54bd8e7b358e6412c4a021d1f51027'
DEST=audit.SOURCE.parent.parent/'csv-known-activity-linked-20261017-v1'
RESULT='KNOWN_ACTIVITY_LINK_RESULT.json'
HANDOFF='STATIC_HANDOFF_FOR_REVIEW.json'

def published(path):
    lib=prior.reader();raw,_=lib['stable_file'](path)
    approved=subprocess.check_output(['git','show',BASE+':'+str(path.relative_to(audit.ROOT))],cwd=audit.ROOT)
    lib['require'](raw==approved,'link_published_source_drift')
    return raw

def relationships(inventory,draft,statement):
    require=prior.reader()['require']
    require(draft['inventorySha256']==prior.INVENTORY_SHA and statement['inventorySha256']==prior.INVENTORY_SHA,'link_inventory_reference')
    require(draft['operations']==inventory['operations'],'link_operations_drift')
    require(draft['captureSha256']==inventory['sourceCaptureSha256']==audit.SOURCE_SHA,'link_capture_reference')
    require(draft['compositionSha256']==inventory['compositionSha256']==audit.REVIEW_SHA,'link_composition_reference')
    require(all(inventory.get(k)is False for k in prior.FLAGS),'link_inventory_approval_claim')
    require(all(draft.get(k)is False for k in ('reviewedAgainstAuditAndKnownActivity','ownerReviewed','knownActivityScopeComplete','scopeComplete','underFence','executorExitCertified','ownershipComplete','phaseAuthorityIssued'))
            and draft['humanConfirmation']is None and draft['consumableAsOperationalScope']is False,'link_draft_approval_claim')
    require(statement['kind']=='OWNER_STATEMENT_LIMITED_TO_OWN_KNOWN_PENDING_IMPORTS'
            and statement['statement']=='Não tenho importação própria pendente conhecida'
            and statement['ownPendingImportsKnown']is False and statement['operationalScopeApproved']is False,'link_statement_scope')
    require(set(statement['doesNotCertify'])=={'all tenant actions','audit completeness','original993 identity link','executor exit','ownership','phase authority'},'link_statement_exclusions')
    require(len(draft['documentedOccurrences'])==2 and draft['unlinkedOccurrenceCount']==2
            and all(x['auditOperationIdentity']is None and x['auditLink']=='UNLINKED_IDENTITY_NOT_AVAILABLE_IN_REVIEWED_RECORD'for x in draft['documentedOccurrences']),'link_993_identity_claim')
    return {'technicalReviewReused':True,'documentaryLinkComplete':True,'ownerStatementReceived':True,
            'humanScope':'OWN_IMPORTS_KNOWN_TO_OWNER_ONLY','unlinked993Occurrences':2,
            'operationalScopeApproved':False,'scopeComplete':False,'executorExitCertified':False,
            'ownershipComplete':False,'phaseAuthorityIssued':False}

def existing():
    lib=prior.reader();receipt=json.loads(published(audit.D/'KNOWN_ACTIVITY_REVIEW_RESULT.json'))
    refs={'inventory':(audit.DEST/'inventory.private.json',prior.INVENTORY_SHA,317603)}
    for label,name in [('draft','knownActivityScope.review.private.json'),('statement','owner-statement.private.json'),('priorJournal','privileged-output.private.jsonl')]:
        row=receipt['custody'][name];refs[label]=(prior.DEST/name,row['sha256'],row['bytes'])
    blobs={};sources={}
    for label,(path,digest,size)in refs.items():
        raw,m=lib['stable_file'](path)
        lib['require'](audit.sha(raw)==digest and len(raw)==size and m['uid']==os.getuid()and m['mode']&0o777==0o600,'link_private_source_drift')
        blobs[label]=raw;sources[label]={'path':str(path),'sha256':digest,'bytes':size,'provenanceCommit':BASE}
    findings=relationships(*(json.loads(blobs[k])for k in ('inventory','draft','statement')))
    # This bounded reread checks continued identity/bytes; not an atomic snapshot.
    for label,(path,_,_)in refs.items():lib['require'](lib['stable_file'](path)[0]==blobs[label],'link_source_changed')
    return blobs,sources,findings

def static_handoff(link_sha):
    # Reuse accepted concrete indices/objects. No composer, archive extraction,
    # build, runtime copy, current profile, path binding, permit or phase pin.
    raw,plan,objects=audit.composed_inputs()
    delivery=json.loads(published(audit.PACKAGE/'DELIVERY.json'))
    lib=prior.reader();lib['require'](plan['executionAuthorized']is False and plan['operationallyCertified']is False,'link_static_kind')
    refs={name:{'source':str((audit.PACKAGE/name).relative_to(audit.ROOT)),
                'sha256':audit.sha(published(audit.PACKAGE/name))}for name in ('CODE_COMPOSITION.json','CODE_OBJECTS.json','DELIVERY.json')}
    return {'kind':'STATIC_HANDOFF_FOR_REVIEW_NOT_OPERATIONAL_BINDINGS','base':BASE,
      'sourceIndices':refs,'privateDocumentaryLinkSha256':link_sha,
      'codePaths':len(plan['files']),'uniqueCodeObjects':len(objects),'newCodeObjects':0,'runtimeCopies':0,
      'runtimeReferences':delivery['runtimeReuse']['artifacts'],
      'runtimeVerification':'Existing certified archive/member proofs reused; runtime archives not reread or rebuilt in this delta',
      'preparedModes':delivery['preparedModes'],
      'knownActivityInput':{'target':'window/csv-known-imports.private.json','privateSourceSlot':'draft',
        'sourceSha256':'0dff7eaa50f1fb46dc658a8242a774de18c452ef85c305ae30c109ab8346dbae',
        'materialized':False,'operationsReferenceOnly':True},
      'requiredDecision':{'consumer':'window/capture_imports.py:capture','denial':'known_activity_scope_missing',
        'field':'reviewedAgainstAuditAndKnownActivity','current':False,'required':True,'decisionRecorded':False,
        'decision':'Approve the bounded audit/known-activity comparison for the20 audited tenant+UUID operations, using the separately linked limited owner statement; not global activity, exit, ownership or phase authority',
        'noRepeatedHumanStatementNeeded':True,'unlinked993OccurrencesRemainExcludedFromIdentityClaims':True},
      'remainingCanonicalInputs':delivery['notCertified'],
      'windowSequence':'Reviewed scope/data bindings and protected authority separately; only an expressly authorized future window admits gates, contains, certifies executor exit/ownership, reconciles current audit under fence, selects API then reviews frontend boundary',
      'postSelectionReturn':delivery['postSelectionReturn'],'originalCompatibility':delivery['originalCompatibility'],
      'operationalGenerationCreated':False,'executionAuthorized':False,'operationallyCertified':False,
      'status':'PREPARED LOCALLY / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}

def prepare():
    lib=prior.reader()
    # Pin and authenticate the existing private writer BEFORE creating the destination.
    raw,_=lib['stable_file'](audit.D.parent/'crm-csv-r2-directed-20261017/privileged_output.source')
    lib['require'](audit.sha(raw)=='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a','canonical_writer')
    record=compile_library('canonical_documentary_link_writer',raw).private_record
    blobs,sources,findings=existing()
    link={'kind':'DOCUMENTARY_LINK_ONLY_NOT_OPERATIONAL_SCOPE','base':BASE,'createdUtc':lib['utc'](),
          'sources':sources,'findings':findings,
          'sourceObservationIntervalPreserved':{k:json.loads(blobs['inventory'])[k]for k in ('commandStartedUtc','commandFinishedUtc')},
          'statementProvenance':{'source':json.loads(blobs['statement'])['source'],'receivedUtc':json.loads(blobs['statement'])['receivedUtc']},
          'notAtomicSnapshot':True,'precedence':'Limited statement supplied after draft; prior pending request for this statement is fulfilled only in this limited scope. Original draft/journal are not rewritten.'}
    link_raw=audit.encode(link);handoff=static_handoff(audit.sha(link_raw))
    for n in (RESULT,HANDOFF):lib['require'](not os.path.lexists(audit.D/n),'link_public_destination_exists')
    folder=lib['new_directory'](DEST)
    record(folder,'privileged-output.private.jsonl',{'event':'documentary_link_begin','utc':lib['utc'](),'base':BASE})
    lib['write_artifact'](folder/'link.private.json',link_raw)
    lib['require'](lib['stable_file'](folder/'link.private.json')[0]==link_raw,'link_custody_bytes')
    # Verify all original sources again after preserving the separate link.
    for k,row in sources.items():lib['require'](lib['stable_file'](row['path'])[0]==blobs[k],'link_original_changed')
    result={'result':'DOCUMENTARY_LINK_COMPLETE_STATIC_HANDOFF_PREPARED','base':BASE,**findings,
      'sourceHashes':{k:{'sha256':v['sha256'],'bytes':v['bytes']}for k,v in sources.items()},
      'linkSha256':audit.sha(link_raw),'linkBytes':len(link_raw),'privateDirectoryName':DEST.name,
      'originalsUnchanged':True,'operationalScopeIssued':False,'noNewHumanConfirmation':True,
      'staticHandoffSha256':audit.sha(audit.encode(handoff))}
    record(folder,'privileged-output.private.jsonl',{'event':'documentary_link_end','utc':lib['utc'](),**result})
    b,m=lib['stable_file'](folder/'privileged-output.private.jsonl');result['journal']={'sha256':audit.sha(b),'bytes':len(b),'mode600':m['mode']&0o777==0o600}
    for name,value in ((HANDOFF,handoff),(RESULT,result)):lib['write_artifact'](audit.D/name,audit.encode(value))
    return result

if __name__=='__main__':
    os.umask(0o077);r=prepare();print(json.dumps({'result':r['result'],'linkSha256':r['linkSha256'],'operationalScopeIssued':False}))
