"""Bounded SELECT after canonical executor exit. Historical orphan controls DENY.

No CSV import, HTTP counter, SQL mutation or implicit disposition of unknown work.
"""
import hashlib,json,subprocess,re
from pathlib import Path
from csv_boundary import require,sha
SQL='''BEGIN READ ONLY; SET LOCAL statement_timeout=15000;
WITH e AS (SELECT "id","clientId","requestId","eventName","payloadJson" FROM "Event"
 WHERE "eventName" LIKE 'crm.contact.import.%' OR
 ("eventName"='crm.contact.created' AND "payloadJson"->>'source'='crm_import')),
limited AS (SELECT * FROM e ORDER BY "id" LIMIT 100001)
SELECT json_build_object('rows',coalesce(json_agg(json_build_object(
 'id',"id",'tenant',"clientId",'request',"requestId",'event',"eventName",
 'status',"payloadJson"->>'status','operation',"payloadJson"->>'operationId')),'[]'::json)) FROM limited;
ROLLBACK;'''
def classify(rows):
    require(len(rows)<=100000,'audit_limit_exceeded_no_truncation_allowed')
    groups={}
    for r in rows:
        op=r['operation'] or r['request']
        if r['event']=='crm.contact.import.summary' and (r['request']or'').startswith('crm.contact.import.summary:'):
            op=r['request'][len('crm.contact.import.summary:'):]
        if r['event']=='crm.contact.created':
            parts=(r['request']or'').split(':',2);require(len(parts)==3 and parts[0]=='crm.contact.created','legacy_creation_correlation_unknown')
            suffix=parts[2];m=re.fullmatch(r'([0-9a-fA-F-]{36}):([0-9a-f]{16})',suffix)
            op=m.group(1) if m else suffix # Invalid/unknown syntax stays separate, never guessed.
        elif r['event']=='crm.contact.import.row':
            require(r['operation'],'row_correlation_missing');op=r['operation']
        require(r['tenant']and op,'audit_identity_missing')
        groups.setdefault((r['tenant'],op),[]).append(r)
    result=[]
    for (tenant,op),events in groups.items():
        finished=[r for r in events if r['event']=='crm.contact.import.finished'];summary=[r for r in events if r['event']=='crm.contact.import.summary'];starts=[r for r in events if r['event']=='crm.contact.import.started']
        state='UNKNOWN'
        if len(finished)==1 and len(starts)==1 and finished[0]['status']in ('COMPLETED','FAILED'):state='COMPLETED'if finished[0]['status']=='COMPLETED'else'PROVEN_FAILED'
        elif not starts and not finished and len(summary)==1 and summary[0]['request']=='crm.contact.import.summary:'+op:state='COMPLETED' # Legacy summary, same request+tenant only.
        result.append({'tenantId':tenant,'operationId':op,'state':state,'terminalProofMatchesOperation':state!='UNKNOWN','evidence':[{'source':'Event:'+str(r['id']),'sha256':hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()}for r in events]})
    return result
def capture(p,mode,run=subprocess.check_output):
    from csv_contract import write,read
    from sequencer import Bridge,Sequencer
    p=Path(p);s=Sequencer(Bridge(p));s.baseline=read(p/'window/csv-baseline.private.json');s.verify_stopped(mode)
    # Exact old-exit certificate exists only after real tree/FD/socket/DB checks.
    exitfile=p/mode/'old-exit-confirmed.json';require(exitfile.is_file(),'exit_absent');s.b.privileged('check-present')
    raw=run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=SQL,text=True,stderr=subprocess.PIPE,timeout=25)
    rows=json.loads(raw)['rows'];operations=classify(rows)
    # Explicitly bounded to persisted audit: unknown legacy activity known to
    # the operator must remain listed in the separately sealed admission scope.
    scope=read(p/'window/csv-known-imports.private.json')
    require(scope['reviewedAgainstAuditAndKnownActivity']is True and type(scope['operations'])is list,'known_activity_scope_missing')
    keys={(r['tenantId'],r['operationId'])for r in operations}
    require(all((r['tenantId'],r['operationId'])in keys for r in scope['operations']),'known_activity_not_observed')
    path=p/'window'/('csv-imports-'+mode+'-after-exit.private.json')
    write(path,{'basis':'AUDIT_AND_EXECUTOR_EXIT','scopeComplete':True,'observationComplete':True,'underFence':True,'exitCertificateSha256':sha(exitfile),'operations':operations,'auditRows':len(rows),'knownScopeSha256':sha(p/'window/csv-known-imports.private.json'),'unobservedHistoryCertified':False})
    return path
