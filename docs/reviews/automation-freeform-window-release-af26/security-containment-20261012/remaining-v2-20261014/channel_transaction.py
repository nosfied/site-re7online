"""Local SQL review renderer using effective ChannelAccount/Secret and Event fields.
No connection, production apply CLI or schema migration is provided.
"""
import copy
import hashlib
import json
import uuid

EVENT='security.channel_cipher.rotation_with_historical_disposition'
def literal(v):return "'"+str(v).replace("'","''")+"'"
def predicate(row,client):
    value=copy.deepcopy(row);created=value.pop('createdAt');updated=value.pop('updatedAt')
    return ('s."id"='+literal(row['id'])+' AND a."id"=s."channelAccountId" AND a."clientId"='+literal(client)+'::uuid AND '
            '(to_jsonb(s)-ARRAY[\'createdAt\',\'updatedAt\'])='+literal(json.dumps(value))+'::jsonb AND '
            's."createdAt"='+literal(created)+'::timestamp AND s."updatedAt"='+literal(updated)+'::timestamp')
def render(plan,plan_hash,fail_after_updates=False):
    assert len(plan['retained'])==1 and plan['inventoryCount']==len(plan['changes'])+1
    assert hashlib.sha256(json.dumps(plan,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==plan_hash
    old=[(c['originalRow'],c['clientId']) for c in plan['changes']]+[(r['originalRow'],r['clientId']) for r in plan['retained']]
    new=[(dict(c['originalRow'],secretCiphertext=c['nextCiphertext']),c['clientId']) for c in plan['changes']]+[(r['originalRow'],r['clientId']) for r in plan['retained']]
    clients=sorted({client for _,client in old});seal=plan['retained'][0]['dispositionSeal']
    def payload(client):
        own=[row for row,tenant in old if tenant==client]
        converted=sum(c['clientId']==client for c in plan['changes'])
        opaque=sum(r['clientId']==client for r in plan['retained'])
        return {'planHash':plan_hash,'dispositionSeal':seal if opaque else None,
                'inventoryCount':len(own),'converted':converted,'opaquePreserved':opaque,
                'opaqueRecovered':False,'tenantSourceDigest':hashlib.sha256(json.dumps(own,sort_keys=True).encode()).hexdigest()}
    # Serialize each old/new ciphertext once into a temporary plan relation.
    # Do not repeat multi-megabyte Web state literals in every predicate.
    inputs=[{'oldRow':c['originalRow'],'oldAccount':c['originalAccount'],'clientId':c['clientId'],'nextCipher':c['nextCiphertext'],'retained':False}for c in plan['changes']]
    inputs += [{'oldRow':r['originalRow'],'oldAccount':r['originalAccount'],'clientId':r['clientId'],'nextCipher':None,'retained':True}for r in plan['retained']]
    def condition(new=False):
        record='p."oldRow"'
        if new:record="CASE WHEN p.retained THEN p.\"oldRow\" ELSE p.\"oldRow\"||jsonb_build_object('secretCiphertext',p.\"nextCipher\") END"
        return ('a.id=s."channelAccountId" AND a."clientId"=p."clientId" AND s.id=p."oldRow"->>\'id\' AND '
                '(to_jsonb(s)-ARRAY[\'createdAt\',\'updatedAt\'])=(('+record+')-ARRAY[\'createdAt\',\'updatedAt\']) AND '
                's."createdAt"=(p."oldRow"->>\'createdAt\')::timestamp AND s."updatedAt"=(p."oldRow"->>\'updatedAt\')::timestamp AND '
                '(to_jsonb(a)-ARRAY[\'createdAt\',\'updatedAt\'])=(p."oldAccount"-ARRAY[\'createdAt\',\'updatedAt\']) AND '
                '(NOT(p."oldAccount"?\'createdAt\')OR(to_jsonb(a)->>\'createdAt\')::timestamp=(p."oldAccount"->>\'createdAt\')::timestamp) AND '
                '(NOT(p."oldAccount"?\'updatedAt\')OR(to_jsonb(a)->>\'updatedAt\')::timestamp=(p."oldAccount"->>\'updatedAt\')::timestamp)')
    def checks(new=False):
        return ('IF (SELECT count(*) FROM cipher_review_input p JOIN "ChannelAccountSecret" s ON s.id=p."oldRow"->>\'id\' JOIN "ChannelAccount" a ON a.id=s."channelAccountId" WHERE '+condition(new)+')<>'+str(plan['inventoryCount'])+" THEN RAISE EXCEPTION 'row_or_tenant_CAS_denied'; END IF;\n")
    sql='BEGIN; SET LOCAL statement_timeout=\'10s\'; SET LOCAL lock_timeout=\'1s\';\n'
    sql+='CREATE TEMP TABLE cipher_review_input("oldRow" jsonb,"oldAccount" jsonb,"clientId" uuid,"nextCipher" text,retained boolean)ON COMMIT DROP;\n'
    sql+='INSERT INTO cipher_review_input SELECT * FROM jsonb_to_recordset('+literal(json.dumps(inputs,separators=(',',':')))+'::jsonb)AS x("oldRow" jsonb,"oldAccount" jsonb,"clientId" uuid,"nextCipher" text,retained boolean);\n'
    sql+='SELECT s.id FROM "ChannelAccountSecret" s JOIN "ChannelAccount" a ON a.id=s."channelAccountId" JOIN cipher_review_input p ON s.id=p."oldRow"->>\'id\' ORDER BY s.id FOR UPDATE OF s,a;\n'
    sql+='DO $cipher$ DECLARE receipts integer; changed integer; BEGIN\n'
    sql+='SELECT count(*) INTO receipts FROM "Event" WHERE "eventName"='+literal(EVENT)+' AND "requestId"='+literal(plan_hash)+';\n'
    sql+='IF receipts>0 THEN\nIF receipts<>'+str(len(clients))+" THEN RAISE EXCEPTION 'partial_receipt_denied'; END IF;\n"
    for client in clients:
        sql+='IF (SELECT count(*) FROM "Event" WHERE "clientId"='+literal(client)+'::uuid AND "eventName"='+literal(EVENT)+' AND "requestId"='+literal(plan_hash)+' AND "payloadJson"='+literal(json.dumps(payload(client)))+'::jsonb)<>1 THEN RAISE EXCEPTION \'receipt_divergence\'; END IF;\n'
    sql+=checks(True)+'\nELSE\n'+checks()+'\n'
    sql+='UPDATE "ChannelAccountSecret" s SET "secretCiphertext"=p."nextCipher" FROM "ChannelAccount" a,cipher_review_input p WHERE NOT p.retained AND '+condition()+';\nGET DIAGNOSTICS changed=ROW_COUNT; IF changed<>'+str(len(plan['changes']))+' THEN RAISE EXCEPTION \'update_CAS_denied\'; END IF;\n'
    if fail_after_updates:sql+="RAISE EXCEPTION 'synthetic_rollback_injection';\n"
    sql+=checks(True)+'\n'
    for client in clients:
        receipt=str(uuid.uuid5(uuid.NAMESPACE_URL,EVENT+plan_hash+client))
        sql+='INSERT INTO "Event"(id,"clientId","eventName","requestId","payloadJson","createdAt") VALUES('+literal(receipt)+'::uuid,'+literal(client)+'::uuid,'+literal(EVENT)+','+literal(plan_hash)+','+literal(json.dumps(payload(client)))+'::jsonb,now());\n'
    sql+='END IF; END $cipher$; COMMIT;\n'
    return sql
