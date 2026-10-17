"""Materialize one reviewed STATIC data input and an owner-only identity listing.
No operational generation, owner approval, global activity, exit or authority claim.
"""
import copy,json,os,subprocess
from pathlib import Path
from scripts.crm_csv_delivery import integrated_audit as audit
from scripts.crm_csv_delivery import link_known_activity as link
from scripts.crm_csv_predecessor.pre_authority import compile_library
BASE='62809ecca47c02e93abea9949f77d05633309d79'
DEST=audit.SOURCE.parent.parent/'csv-static-activity-input-20261017-v1'
RESULT='ACTIVITY_MATERIALIZATION.json'


def published(path):
    lib=link.prior.reader();raw,_=lib['stable_file'](path)
    lib['require'](raw==subprocess.check_output(['git','show',BASE+':'+str(path.relative_to(audit.ROOT))],cwd=audit.ROOT),'materialization_published_drift')
    return raw


def inputs():
    lib=link.prior.reader();blobs,sources,_=link.existing()
    receipt=json.loads(published(audit.D/link.RESULT));raw,m=lib['stable_file'](link.DEST/'link.private.json')
    lib['require'](audit.sha(raw)==receipt['linkSha256']and len(raw)==receipt['linkBytes']and m['uid']==os.getuid()and m['mode']&0o777==0o600,'materialization_documentary_link_drift')
    value=json.loads(raw)
    lib['require'](value['sources']==sources and value['findings']['humanScope']=='OWN_IMPORTS_KNOWN_TO_OWNER_ONLY','materialization_link_sources')
    # Pin prior technical-review evidence; no replay of accepted tests/SQL/derive.
    proofs={n:audit.sha(published(audit.D/n))for n in ('KNOWN_ACTIVITY_REVIEW_PROOFS.json','ACTIVITY_LINK_PROOFS.json')}
    return blobs,sources,receipt,proofs


def make_scope(inventory,draft,statement,link_sha,proofs):
    link.relationships(inventory,draft,statement)
    scope=copy.deepcopy(draft)
    scope.update(kind='STATIC_TECHNICALLY_REVIEWED_KNOWN_ACTIVITY_INPUT',base=BASE,
      reviewedAgainstAuditAndKnownActivity=True,consumableAsOperationalScope=False,observationComplete=False,
      technicalReview={'actor':'CODEX_TECHNICAL_REVIEW_NOT_OWNER_APPROVAL','sourceInventorySha256':link.prior.INVENTORY_SHA,
        'documentaryLinkSha256':link_sha,'proofs':proofs,'scope':'20 tenant+UUID audit operations compared with available known activity; not a global completeness assertion'},
      humanDeclaration={'statementSha256':audit.sha(audit.encode(statement)),'scope':'OWN_IMPORTS_KNOWN_TO_OWNER_ONLY',
        'statement':statement['statement'],'receivedUtc':statement['receivedUtc'],'operationalApproval':False},
      pending=['New operational preparation: bound profiles/paths, canonical contract and manifests; no identity/phase data inferred',
        'Fresh executor exit/ownership/current audit under fence only at authorized window point; no global completeness inferred'],
      sourceDraftSha256='0dff7eaa50f1fb46dc658a8242a774de18c452ef85c305ae30c109ab8346dbae')
    # A technical-review flag does not fill or authorize any operational frontier.
    scope.pop('ownerResidualQuestion')
    return scope


def owner_listing(inventory,sources,link_sha):
    tenants=sorted({op['tenantId']for op in inventory['operations']})
    lines=['# Identificação privada — tenants e operações CSV auditados','',
      'Somente os identificadores exatos do inventário preservado; nenhum nome de pessoa/empresa foi inferido.',
      'Este arquivo não pede reconhecimento de UUIDs nem certificação das ações dos tenants.',
      'Resumo terminal legado não é ledger durável, garantia de cada linha ou prova de atividade completa.',
      'As duas tentativas reportadas do arquivo993 seguem sem vínculo de identidade.','',
      'Inventário SHA256: '+sources['inventory']['sha256'],
      'Vínculo documental SHA256: '+link_sha,
      'Intervalo original UTC: '+inventory['commandStartedUtc']+' → '+inventory['commandFinishedUtc'],
      'Nenhuma nova observação/SQL.','']
    for tenant in tenants:
        lines.extend(['## Tenant: `'+tenant+'`','',
          '| UUID da operação | Terminal auditado | Referências de evidência | Base |','| --- | --- | ---: | --- |'])
        for op in inventory['operations']:
            if op['tenantId']==tenant:lines.append('| `'+op['operationId']+'` | '+op['state']+' | '+str(len(op['evidence']))+' | '+op['correlationBasis']+' |')
        lines.append('')
    lines.extend(['A declaração do owner continua limitada às próprias importações conhecidas.',
      'Original, evidências Event:id/hash e exclusões estão nos arquivos privados referenciados pelo vínculo; não enviar este arquivo ao Git/chat.'])
    return ('\n'.join(lines)+'\n').encode()


def prepare():
    lib=link.prior.reader();blobs,sources,receipt,proofs=inputs()
    inventory,draft,statement=(json.loads(blobs[k])for k in ('inventory','draft','statement'))
    scope=make_scope(inventory,draft,statement,receipt['linkSha256'],proofs)
    _,plan,_=audit.composed_inputs()
    # Real composed terminal gate; no capture SQL/system/exit entrypoint executes.
    with audit.composed_loader()as(loader,root,_):
        boundary=loader.local_module(root/'window/csv_boundary.py');keys=boundary.imports(scope['operations']);loader.authority.revalidate()
    need=lib['require'];need(len(keys)==20 and len(set(keys))==20,'materialization_operation_population')
    writer,_=lib['stable_file'](audit.D.parent/'crm-csv-r2-directed-20261017/privileged_output.source')
    need(audit.sha(writer)=='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a','canonical_writer')
    record=compile_library('canonical_static_activity_writer',writer).private_record
    need(not os.path.lexists(audit.D/RESULT),'materialization_public_destination_exists')
    folder=lib['new_directory'](DEST);window=lib['new_directory'](folder/'window')
    record(folder,'privileged-output.private.jsonl',{'event':'static_activity_begin','utc':lib['utc'](),'base':BASE})
    artifacts={'window/csv-known-imports.private.json':audit.encode(scope),
               'OWNER_IDENTIFICATION.private.md':owner_listing(inventory,sources,receipt['linkSha256'])}
    for name,raw in artifacts.items():lib['write_artifact'](folder/name,raw)
    for name,raw in artifacts.items():need(lib['stable_file'](folder/name)[0]==raw,'materialization_custody_bytes')
    for k,row in sources.items():need(lib['stable_file'](row['path'])[0]==blobs[k],'materialization_original_drift')
    missing={
      'window/csv-contract.private.json':{'value':None,'consumer':'csv_contract.check','missing':'New preparation path, source/target profile hashes, immutable references, reviewed target policy binding'},
      'window/source.profile.private.json':{'value':None,'consumer':'csv_contract.check; check_current','missing':'Final source profile bound to chosen preparation and revalidated identities; historical observations are references'},
      'window/target.profile.private.json':{'value':None,'consumer':'csv_contract.profiles/profile_delta','missing':'Candidate path and profile derived from bound source; NEWauth/NEWDB/NEWcipher unchanged'},
      'window/path-bindings.private.json':{'value':None,'consumer':'prestop_contract.path_bindings; Operations','missing':'Actual source/target release paths and data bindings for four modes'},
      'window/binding-status.private.json':{'value':None,'consumer':'csv_contract.check(live=True)','missing':'Canonical WINDOW_BOUND certification after real bindings, not inferred from this static file'},
      'phaseAuthority':{'value':None,'consumer':'Context/Loader; start gate','missing':'Protected root installation and phase-specific authority; no issue/renewal here'},
      'executorExitOwnership':{'value':None,'consumer':'Sequencer.verify_stopped; csv_boundary.exit_and_imports','missing':'Fresh certified exit, ownership and current audit under fence at authorized window point only'}}
    result={'result':'STATIC_ACTIVITY_INPUT_MATERIALIZED_NOT_OPERATIONAL_PREPARATION','base':BASE,
      'privateDirectoryName':DEST.name,'operations':len(keys),'tenants':len({k[0]for k in keys}),
      'files':{n:{'sha256':audit.sha(b),'bytes':len(b)}for n,b in artifacts.items()},
      'sourceInventorySha256':link.prior.INVENTORY_SHA,'sourceDraftSha256':scope['sourceDraftSha256'],
      'documentaryLinkSha256':receipt['linkSha256'],'compositionSha256':audit.REVIEW_SHA,
      'classifierSha256':plan['files']['window/capture_imports.py']['sha256'],'codeObjectsChanged':0,'runtimeCopies':0,
      'reviewedAgainstAuditAndKnownActivity':True,'reviewActor':'CODEX_TECHNICAL_REVIEW',
      'ownerReviewed':False,'humanConfirmation':None,'ownerDeclarationNotExpanded':True,
      'scopeComplete':False,'observationComplete':False,'underFence':False,'ownershipComplete':False,
      'executorExitCertified':False,'phaseAuthorityIssued':False,'originalsUnchanged':True,
      'unlinked993Occurrences':2,'missingOperationalInputs':missing,'operationalGenerationCreated':False,
      'firstTechnicalBlocker':'csv_contract.check cannot bind four modes: new csv-contract/source-target profiles/path bindings and WINDOW_BOUND are absent; this is not a missing generic owner approval',
      'status':'PREPARED LOCALLY / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'}
    record(folder,'privileged-output.private.jsonl',{'event':'static_activity_end','utc':lib['utc'](),'result':result['result'],'files':result['files']})
    journal,m=lib['stable_file'](folder/'privileged-output.private.jsonl');result['journal']={'sha256':audit.sha(journal),'bytes':len(journal),'mode600':m['mode']&0o777==0o600}
    lib['write_artifact'](audit.D/RESULT,audit.encode(result))
    return result

if __name__=='__main__':
    os.umask(0o077);r=prepare();print(json.dumps({'result':r['result'],'tenants':r['tenants'],'operations':r['operations'],'noVpsOrSql':True}))
