"""Review-only phase: seal current values in one already-fenced SQL session.
No connection, process control, production CLI, automatic recovery or grant change.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import time

LOCK_SQL = '''BEGIN;
SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='10s';
SET LOCAL idle_in_transaction_session_timeout='30s';
LOCK TABLE "ChannelAccount","ChannelAccountSecret","MfaTotpSecret","WebhookEndpoint" IN SHARE ROW EXCLUSIVE MODE;
'''
READ_SQL = '''SELECT json_build_object('rows',(SELECT coalesce(json_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM "ChannelAccountSecret" s),'accounts',(SELECT coalesce(json_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM "ChannelAccount" a WHERE EXISTS(SELECT 1 FROM "ChannelAccountSecret" s WHERE s."channelAccountId"=a.id)),'mfa',(SELECT count(*) FROM "MfaTotpSecret"),'webhook',(SELECT count(*) FROM "WebhookEndpoint"));'''

def digest(v):
    return hashlib.sha256(json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def scope_check(approved,current):
    """Only ciphertext/hash/timestamps and Web metadata may be explicitly renewed.
    Full renewed rows/accounts remain mandatory SQL CAS inputs, never omitted.
    Opaque row/account cannot be renewed. Identity/control change denies.
    """
    if current['mfa'] or current['webhook']:raise RuntimeError('population_family_drift')
    old_rows={x['id']:x for x in approved['rows']}; rows={x['id']:x for x in current['rows']}
    old_accounts={x['id']:x for x in approved['accounts']}; accounts={x['id']:x for x in current['accounts']}
    if len(rows)!=len(current['rows']) or set(rows)!=set(old_rows) or len(accounts)!=len(current['accounts']) or set(accounts)!=set(old_accounts):raise RuntimeError('population_identity_drift')
    opaque=approved['opaqueId']
    for k,old in old_rows.items():
        new=rows[k]
        if set(new)!=set(old):raise RuntimeError('row_schema_drift')
        fixed=set(old)-{'secretCiphertext','updatedAt'}
        if old['secretKind'].startswith('baileysAuthState'):fixed-= {'secretHash'}
        if any(old[f]!=new[f] for f in fixed):raise RuntimeError('row_identity_control_drift')
        if k==opaque and old!=new:raise RuntimeError('opaque_row_drift')
    for k,old in old_accounts.items():
        new=accounts[k]
        if set(new)!=set(old):raise RuntimeError('account_schema_drift')
        # Only exact Web accounts admit a reviewed source-value renewal.
        mutable={'metadata','updatedAt'} if old['provider']=='web_session' else set()
        if any(old[f]!=new[f] for f in set(old)-mutable):raise RuntimeError('account_identity_control_drift')
        if old.get('metadata')!=new.get('metadata'):
            before=copy.deepcopy(old.get('metadata') or {});after=copy.deepcopy(new.get('metadata') or {})
            for value in (before,after):
                web=value.get('webSession')
                if not isinstance(web,dict):raise RuntimeError('web_metadata_shape_drift')
                for field in ('lastConnectedAt','lastDisconnectedAt','reconnectCount'):web.pop(field,None)
            if before!=after:raise RuntimeError('account_metadata_control_drift')
        if rows[opaque]['channelAccountId']==k and old!=new:raise RuntimeError('opaque_account_drift')
    return True

def private_directory(path):
    p=Path(path);m=p.lstat()
    if p.is_symlink() or not stat.S_ISDIR(m.st_mode) or m.st_uid!=os.geteuid() or stat.S_IMODE(m.st_mode)!=0o700:raise RuntimeError('private_output_denied')
    return p

def write_once(p,name,value):
    data=json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()
    fd=os.open(p/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        d=os.open(p,os.O_DIRECTORY);os.fsync(d);os.close(d)
    except BaseException:raise
    return hashlib.sha256(data).hexdigest()

def phase(query,approved,proof,out,phase_id,make_plan,render_body,budget_seconds=30):
    """query must use ONE pinned connection; caller owns commit inspection.
    No automatic retry. After COMMIT is issued, every error is uncertain.
    Source custody/plan/intent written once before the mutation in that session.
    """
    p=private_directory(out)
    if not proof.get('allWritersExited') or not proof.get('dbOwnershipProven') or not proof.get('fenceActive') or proof.get('unknownWriters') or proof.get('guardGeneration')!=38 or proof.get('authDb')!='NEWauth+NEWDB':raise RuntimeError('writer_coverage_denied')
    if not phase_id or '/' in phase_id or not proof.get('approvedRenewal'):raise RuntimeError('renewal_not_authorized')
    started=time.monotonic();commit_issued=False
    try:
        query(LOCK_SQL)
        current=json.loads(query(READ_SQL));scope_check(approved,current)
        source_hash=write_once(p,'source.private.json',current)
        plan=make_plan(copy.deepcopy(current));h=write_once(p,'plan.private.json',plan)
        if time.monotonic()-started>=budget_seconds:raise RuntimeError('phase_budget_denied')
        intent={'phaseId':phase_id,'approvedScopeHash':digest(approved),'sourceHash':source_hash,'planHash':h,'proofHash':digest(proof),'renewal':'EXPLICIT_LOCKED_CURRENT_SOURCE','state':'INTENT_NO_COMMIT'}
        write_once(p,'intent.private.json',intent)
        query(render_body(plan,h))
        if time.monotonic()-started>=budget_seconds:raise RuntimeError('phase_budget_denied')
        commit_issued=True
        query('COMMIT;')
        write_once(p,'commit-observed.private.json',{'state':'COMMIT_RESPONSE_OBSERVED_NOT_YET_VERIFIED','planHash':h})
        return plan,h,time.monotonic()-started
    except BaseException:
        if not commit_issued:
            try:query('ROLLBACK;')
            except BaseException:pass
        # Intent persists even after confirmed rollback. No successor/replay here.
        raise RuntimeError('COMMIT_UNCERTAIN_INSPECT_ONLY' if commit_issued else 'PRECOMMIT_DENY_INSPECT_ONLY') from None
