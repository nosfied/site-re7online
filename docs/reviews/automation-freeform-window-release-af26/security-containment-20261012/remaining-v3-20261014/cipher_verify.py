"""Read-only verifier for the reviewed channel plan; no connections on import."""
import hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'remaining-v2-20261014'))
from channel_transaction import EVENT,literal

def digest(plan):return hashlib.sha256(json.dumps(plan,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def verification_sql(plan,expected):
    if digest(plan)!=expected:raise RuntimeError('cipher_plan_hash_drift')
    if plan['inventoryCount']!=11 or len(plan['changes'])!=10 or len(plan['retained'])!=1:raise RuntimeError('cipher_inventory_drift')
    inputs=[dict(oldRow=c['originalRow'],oldAccount=c['originalAccount'],clientId=c['clientId'],nextCipher=c['nextCiphertext'],retained=False)for c in plan['changes']]
    inputs +=[dict(oldRow=r['originalRow'],oldAccount=r['originalAccount'],clientId=r['clientId'],nextCipher=None,retained=True)for r in plan['retained']]
    receipts=[]
    for tenant in sorted({r['clientId']for r in inputs}):
        rows=[r['oldRow']for r in inputs if r['clientId']==tenant];opaque=sum(r['retained']for r in inputs if r['clientId']==tenant)
        receipts.append({'clientId':tenant,'payload':{'planHash':expected,'dispositionSeal':plan['retained'][0]['dispositionSeal']if opaque else None,'inventoryCount':len(rows),'converted':len(rows)-opaque,'opaquePreserved':opaque,'opaqueRecovered':False,'tenantSourceDigest':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()}})
    def match(alias,record):
        return f'(to_jsonb({alias})-ARRAY[\'createdAt\',\'updatedAt\'])=({record}-ARRAY[\'createdAt\',\'updatedAt\']) AND {alias}."createdAt"=({record}->>\'createdAt\')::timestamp AND {alias}."updatedAt"=({record}->>\'updatedAt\')::timestamp'
    before=match('s','p."oldRow"');new="CASE WHEN p.retained THEN p.\"oldRow\" ELSE p.\"oldRow\"||jsonb_build_object('secretCiphertext',p.\"nextCipher\") END";after=match('s','('+new+')')
    account=match('a','p."oldAccount"')
    q="BEGIN READ ONLY;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='1s';WITH p AS(SELECT * FROM jsonb_to_recordset("+literal(json.dumps(inputs,separators=(',',':')))+"::jsonb)AS x(\"oldRow\" jsonb,\"oldAccount\" jsonb,\"clientId\" uuid,\"nextCipher\" text,retained boolean)), r AS(SELECT * FROM jsonb_to_recordset("+literal(json.dumps(receipts))+"::jsonb)AS x(\"clientId\" uuid,payload jsonb)), observed AS(SELECT p.*, ("+before+")old_match,("+after+")new_match FROM p JOIN \"ChannelAccountSecret\" s ON s.id=p.\"oldRow\"->>'id' JOIN \"ChannelAccount\" a ON a.id=s.\"channelAccountId\" AND a.\"clientId\"=p.\"clientId\" WHERE "+account+")SELECT json_build_object( 'mfaCount',(SELECT count(*)FROM \"MfaTotpSecret\"),'webhookCount',(SELECT count(*)FROM \"WebhookEndpoint\"),'inventoryTotal',(SELECT count(*)FROM \"ChannelAccountSecret\"),'original',(SELECT count(*)FROM observed WHERE old_match),'current',(SELECT count(*)FROM observed WHERE new_match),'opaque',(SELECT count(*)FROM observed WHERE retained AND old_match AND new_match),'receiptCount',(SELECT count(*)FROM \"Event\" WHERE \"eventName\"="+literal(EVENT)+" AND \"requestId\"="+literal(expected)+"),'receiptsExact',(SELECT count(*)FROM r JOIN \"Event\" e ON e.\"clientId\"=r.\"clientId\" AND e.\"eventName\"="+literal(EVENT)+" AND e.\"requestId\"="+literal(expected)+" AND e.\"payloadJson\"=r.payload));ROLLBACK;"
    return q,len(receipts)

def classify(value,receipt_count):
    if value==dict(mfaCount=0,webhookCount=0,inventoryTotal=11,original=11,current=1,opaque=1,receiptCount=0,receiptsExact=0):return 'ORIGINAL_VERIFIED'
    if value==dict(mfaCount=0,webhookCount=0,inventoryTotal=11,original=1,current=11,opaque=1,receiptCount=receipt_count,receiptsExact=receipt_count):return 'VERIFIED'
    raise RuntimeError('cipher_state_divergence_inspect_only')

class CipherDriver:
    """Transport is injected and sealed by future generation. Never replay on timeout."""
    def __init__(self,query,apply_once):self.query=query;self.apply_once=apply_once
    def classify(self,plan,expected):
        q,n=verification_sql(plan,expected);return classify(self.query(q),n)
    def apply(self,plan,expected,sqlfile,sql_hash):
        # Reconfirm original state before SQL's own row/account CAS and locks.
        if self.classify(plan,expected)!='ORIGINAL_VERIFIED':raise RuntimeError('cipher_original_not_proven')
        if hashlib.sha256(sqlfile.read_bytes()).hexdigest()!=sql_hash:raise RuntimeError('cipher_sql_hash_drift')
        self.apply_once(sqlfile.read_text())
