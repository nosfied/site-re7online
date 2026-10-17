"""CSV release boundaries. No network, process, import or retention effect."""
import hashlib,json,os,stat
from pathlib import Path
API='re7-whatsapp-agent'
MODES=('switch','return','return-partial','return-before-commit')
EVENTS={'crm.contact.import.'+x for x in ('started','classified','row','finished','uncertain')}
def require(value,reason):
    if not value: raise RuntimeError(reason)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def private(p):
    p=Path(p); s=p.lstat()
    require(stat.S_ISREG(s.st_mode) and not p.is_symlink() and s.st_nlink==1 and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o600,'private_object')
    return json.loads(p.read_text())
def profile_delta(before,after,target):
    import copy
    b=copy.deepcopy(before); a=copy.deepcopy(after)
    require(set(a)==set(b)=={'apps'} and len(a['apps'])==len(b['apps'])==3,'profile_population')
    old=next(x for x in b['apps'] if x['name']==API); new=next(x for x in a['apps'] if x['name']==API)
    require(new['cwd']==target and new['script']==target+'/dist/index.js','candidate_runtime')
    new['cwd']=old['cwd'];new['script']=old['script']
    require(a==b,'credentials_or_unrelated_profile_changed')
def imports(rows):
    """Evidence already correlated by canonical audit reader; silence is never terminal."""
    seen=set();result=[]
    for r in rows:
        key=(r['tenantId'],r['operationId']);require(all(type(x)is str and x for x in key) and key not in seen,'operation_correlation');seen.add(key)
        require(type(r['evidence'])is list and bool(r['evidence']),'operation_evidence_missing')
        state=r['state'];require(state in ('PROCESSING','COMPLETED','PROVEN_FAILED','UNKNOWN'),'operation_state')
        require(all(set(e)>={'source','sha256'} and len(e['sha256'])==64 for e in r['evidence']),'operation_evidence_binding')
        if state in ('COMPLETED','PROVEN_FAILED'):require(r.get('terminalProofMatchesOperation')is True,'terminal_not_correlated')
        require(state not in ('PROCESSING','UNKNOWN'),'import_not_proven_terminal')
        result.append(key)
    return result
def exit_and_imports(exit_proof,evidence):
    require(exit_proof.get('oldExitConfirmed')is True and exit_proof.get('ownershipComplete')is True and exit_proof.get('sqlZero')is True,'canonical_exit_required')
    require(evidence['scopeComplete']is True and evidence['observationComplete']is True and evidence['underFence']is True,'import_inventory_incomplete')
    # Empty rows are allowed only with a complete scoped audit, never HTTP count/absence.
    require(evidence['basis']=='AUDIT_AND_EXECUTOR_EXIT' and evidence['exitCertificateSha256']==exit_proof['sha256'],'import_exit_binding')
    return imports(evidence['operations'])
def event_policy(source,expected):
    require(sha(source)==expected,'event_tool_policy_drift')
    raw=Path(source).read_text()
    require(all(e in raw for e in EVENTS),'critical_csv_event_missing')
def event_consumers(binding,live=False):
    require(binding['referenceScanComplete']is True and binding['unknownConsumers']==[],'event_reference_inventory_incomplete')
    rows=binding['consumers'];names={'events-retention.ts','storage-report.ts'}
    require(len(rows)==2 and {Path(r['path']).name for r in rows}==names,'event_consumer_population')
    for r in rows:
        require(r['path']=='/opt/re7online/site-re7online/apps/whatsapp-agent/scripts/'+Path(r['path']).name and r['importsCanonicalPolicy']is True and len(r['sha256'])==64,'event_consumer_binding')
        if live:
            p=Path(r['path']);s=p.lstat();require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_uid==r['uid']and stat.S_IMODE(s.st_mode)==r['mode']and sha(p)==r['sha256'],'event_consumer_live_drift')
            require('../src/events/eventRetentionPolicy.js'in p.read_text(),'event_consumer_import_drift')
def stage_boundary(p,mode):
    p=Path(p);selected=p/'window/csv-selection.receipt.private.json'
    require(mode in MODES,'mode')
    if mode=='return-before-commit':
        require(not selected.exists() and not (p/'window/csv-selection.intent.private.json').exists(),'old_backend_after_selection')
        require(not any(list((p/m).glob('start-intent-*.json'))for m in MODES if m!=mode),'old_backend_after_start_intent')
    else:
        require(selected.exists(),'candidate_selection_absent')
        r=private(selected);require(r['result']=='CSV_CANDIDATE_SELECTED' and r['targetProfileSha256']==sha(p/'window/target.profile.private.json') and r['intentSha256']==sha(p/'window/csv-selection.intent.private.json'),'selection_unproven')
    return True
