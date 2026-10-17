"""Review an immutable derived inventory; prepare a separate private scope DRAFT.
Never calls derive(), queries SQL or declares owner/tenant knowledge complete.
"""
import hashlib,json,os,subprocess
from pathlib import Path
from scripts.crm_csv_delivery import integrated_audit as audit
from scripts.crm_csv_delivery.prepare_review import reader
from scripts.crm_csv_predecessor.pre_authority import compile_library
BASE='844cff09eddafcf0e508108f293f5add1c8ea5fb'
INVENTORY_SHA='fb346e00f5aeb219b14c43aad0669d4b392c7c1ebfa920ef4667615351c155bb'
RESPONSE_SHA='ac29fdc49adb68294b002d81e7a48bbf9224d802039267d2135c8dbb88bf1d2a'
DEST=audit.SOURCE.parent.parent/'csv-known-activity-scope-review-20261017-v1'
FLAGS=('ownerReviewed','reviewedAgainstAuditAndKnownActivity','knownActivityScopeComplete','scopeComplete','observationComplete','underFence','executorExitCertified','ownershipComplete','phaseAuthorityIssued')

def validate_inventory(value,expected,rows):
    lib=reader();require=lib['require'];operations=value['operations']
    require(all(value.get(k)is False for k in FLAGS),'review_approval_or_completeness_claim')
    require(operations==expected,'review_operation_or_evidence_drift')
    keys=[(op['tenantId'],op['operationId'])for op in operations]
    require(len(keys)==len(set(keys))==20,'review_population_duplicate_or_missing')
    by_id={str(row['id']):row for row in rows};require(len(by_id)==len(rows)==1784,'review_source_population')
    evidence=[];summaries=0
    for op in operations:
        require(op['state']=='COMPLETED'and op['terminalProofMatchesOperation']is True
                and op['correlationBasis']=='LEGACY_SUMMARY_EXACT_REQUEST_AND_TENANT','review_terminal_not_proven')
        group=[]
        for ref in op['evidence']:
            require(ref['source'].startswith('Event:'),'review_evidence_source')
            row=by_id.get(ref['source'][6:]);require(row is not None,'review_evidence_absent')
            require(audit.sha(json.dumps(row,sort_keys=True).encode())==ref['sha256']and row['tenant']==op['tenantId'],'review_evidence_hash_or_tenant')
            group.append(row);evidence.append((ref['source'],ref['sha256']))
        terminal=[x for x in group if x['event']=='crm.contact.import.summary']
        require(len(terminal)==1 and terminal[0]['request']=='crm.contact.import.summary:'+op['operationId'],'review_summary_identity')
        summaries+=len(terminal)
    original=[('Event:'+str(row['id']),audit.sha(json.dumps(row,sort_keys=True).encode()))for row in rows]
    require(sorted(evidence)==sorted(original),'review_evidence_population_loss_or_duplicate')
    return {'operations':20,'uniqueTenantUuidKeys':20,'evidencePairs':1784,'exactLegacyTerminals':summaries,
            'orphanEvidenceReferences':0,'inventoryRewritten':False,'terminalBasis':'LEGACY_SUMMARY_NOT_DURABLE_LEDGER_OR_ACTIVITY_COMPLETENESS'}

def occurrence_evidence():
    # Examine the exact previously published records, not counts as operation IDs.
    files=['docs/BACKLOG_TECH.md','docs/reviews/automation-freeform-window-release-af26/FUNCTIONAL_RESUMPTION_2026-10-15.md',
           'docs/saas/CRM_CSV_IMPORT_OPERATION_CONTRACT.md','docs/reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/REPORT.md',
           'docs/reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/BROWSER_REVIEW.md']
    sources={}
    for name in files:
        raw=subprocess.check_output(['git','show',BASE+':'+name],cwd=audit.ROOT)
        sources[name]={'commit':BASE,'bytes':len(raw),'sha256':audit.sha(raw)}
    backlog=subprocess.check_output(['git','show',BASE+':'+files[0]],cwd=audit.ROOT).decode()
    assert '993 linhas'in backlog and 'Segunda tentativa'in backlog and 'sem captura Network'in backlog
    # Labels identify documented occurrences, NOT API operation identifiers.
    occurrences=[{'occurrence':'OWNER_REPORTED_993_FIRST_CONFIRMATION','kind':'OWNER_REPORTED_PRODUCTION',
                  'source':files[0]+'#crm--importação-csv-com-resultado-desconhecido-na-interface-e-totais-ambíguos--10102026',
                  'reported':'993 lines;880 eligible;879 created+1 updated; interface failure reported',
                  'auditOperationIdentity':None,'auditLink':'UNLINKED_IDENTITY_NOT_AVAILABLE_IN_REVIEWED_RECORD',
                  'missing':'No requestId/operationId/Event binding or HTTP response trace supplied with the report',
                  'activeNow':'UNKNOWN_NOT_INFERRED_FROM_OLD_INTERFACE_FAILURE'},
                 {'occurrence':'OWNER_REPORTED_993_SECOND_CONFIRMATION','kind':'OWNER_REPORTED_PRODUCTION',
                  'source':files[0],'reported':'Same file;880 recognized without changes',
                  'auditOperationIdentity':None,'auditLink':'UNLINKED_IDENTITY_NOT_AVAILABLE_IN_REVIEWED_RECORD',
                  'missing':'No explicit request/operation/Event binding for the second confirmation',
                  'activeNow':'UNKNOWN_NOT_INFERRED_FROM_REPORTED_COUNTS'}]
    return sources,occurrences

def inspect_existing():
    lib=reader();raw,meta=lib['stable_file'](audit.DEST/'inventory.private.json')
    lib['require'](audit.sha(raw)==INVENTORY_SHA and meta['uid']==os.getuid()and meta['mode']&0o777==0o600,'review_inventory_integrity')
    value=json.loads(raw);response,_=lib['stable_file'](audit.DEST/'imports-response.private.json')
    lib['require'](audit.sha(response)==RESPONSE_SHA and value['importsResponseSha256']==RESPONSE_SHA,'review_response_integrity')
    rows,payload,cmd=audit.captured_rows();lib['require'](response==payload,'review_response_source_bytes')
    with audit.composed_loader()as(loader,root,plan):
        consumer=loader.local_module(root/'window/capture_imports.py');gate=loader.local_module(root/'window/csv_boundary.py')
        # Comparison in memory only: the immutable inventory is never regenerated/written.
        expected=consumer.classify(rows);gate.imports(value['operations'])
        findings=validate_inventory(value,expected,rows);loader.authority.revalidate()
    lib['require'](lib['stable_file'](audit.DEST/'inventory.private.json')[0]==raw,'review_inventory_changed')
    sources,occurrences=occurrence_evidence()
    return value,findings,sources,occurrences

def prepare_scope():
    value,findings,sources,occurrences=inspect_existing();lib=reader()
    scope={'kind':'KNOWN_ACTIVITY_SCOPE_REVIEW_DRAFT_NOT_APPROVED','base':BASE,'operations':value['operations'],
           'inventorySource':str(audit.DEST/'inventory.private.json'),'inventorySha256':INVENTORY_SHA,
           'captureSha256':audit.SOURCE_SHA,'compositionSha256':audit.REVIEW_SHA,
           'reviewedAgainstAuditAndKnownActivity':False,'ownerReviewed':False,'humanConfirmation':None,
           'knownActivityScopeComplete':False,'scopeComplete':False,'underFence':False,
           'executorExitCertified':False,'ownershipComplete':False,'phaseAuthorityIssued':False,
           'documentedOccurrences':occurrences,'unlinkedOccurrenceCount':len(occurrences),
           'sources':sources,'syntheticCasesExcludedFromProductionScope':True,
           'pending':['Human statement limited to imports the owner initiated and considers unresolved; never all tenants',
                      'Original993 first/second reports remain without auditable operation identity; do not infer linkage from counts/time/phone',
                      'Formal known-activity scope review and future fresh under-fence reconciliation, with canonical executor exit/ownership and authority'],
           'ownerResidualQuestion':'Entre as importações que você mesmo iniciou, há alguma que ainda considera em andamento ou sem resultado? Não é necessário reconhecer UUIDs nem certificar ações de outros tenants.',
           'consumableAsOperationalScope':False}
    raw=audit.encode(scope);folder=lib['new_directory'](DEST)
    writer,_=lib['stable_file'](audit.D.parent/'crm-csv-r2-directed-20261017/privileged_output.source')
    lib['require'](audit.sha(writer)=='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a','canonical_writer')
    record=compile_library('canonical_scope_review_writer',writer).private_record
    record(folder,'privileged-output.private.jsonl',{'event':'scope_review_begin','utc':lib['utc'](),'inventorySha256':INVENTORY_SHA})
    lib['write_artifact'](folder/'knownActivityScope.review.private.json',raw)
    lib['require'](lib['stable_file'](folder/'knownActivityScope.review.private.json')[0]==raw,'scope_draft_custody_bytes')
    result={'result':'TECHNICAL_INVENTORY_REVIEW_PASS_SCOPE_DRAFT_PENDING','base':BASE,**findings,
            'inventorySha256':INVENTORY_SHA,'scopeDraftSha256':audit.sha(raw),'scopeDraftBytes':len(raw),
            'unlinkedDocumentedProductionOccurrences':2,'syntheticCasesAreNotProductionEvidence':True,
            'ownerReviewed':False,'humanConfirmation':None,'knownActivityScopeComplete':False,
            'executorExitCertified':False,'ownershipComplete':False,'phaseAuthorityIssued':False,
            'privateDirectoryName':DEST.name,'operationalScopeIssued':False,'sourceDocuments':sources,
            'noVpsOrSqlOrInventoryRegeneration':True}
    record(folder,'privileged-output.private.jsonl',dict(event='scope_review_end',utc=lib['utc'](),**result))
    return result

if __name__=='__main__':
    os.umask(0o077);print(json.dumps(prepare_scope(),sort_keys=True))
