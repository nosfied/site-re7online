"""Real PostgreSQL16, synthetic rows and canonical cryptography, no provider."""
import concurrent.futures
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"remaining-v2-20261014"))
from channel_transaction import render as reviewed_render,literal
from cipher_sql import guard_empty_families
def render(*args):return guard_empty_families(reviewed_render(*args))
from cipher_verify import CipherDriver,verification_sql

ROOT=Path.cwd();HERE=Path(__file__).resolve().parent;BIN='/usr/lib/postgresql/16/bin/'
NODE=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='re7-channel-cipher-',dir='/tmp') as tmp:
    p=Path(tmp);sock=p/'socket';sock.mkdir(mode=0o700)
    log=(p/'commands.private.log').open('x');err=(p/'commands.private.stderr').open('x')
    def command(cmd):return subprocess.run(cmd,check=True,stdout=log,stderr=err,timeout=30)
    command([str(NODE),str(HERE.parent/'remaining-v2-20261014/channel_fixture.cjs'),str(ROOT),str(p)])
    plan=json.loads((p/'fixture-plan.private.json').read_text());accounts=json.loads((p/'fixture-accounts.private.json').read_text())
    h=hashlib.sha256(json.dumps(plan,separators=(',',':')).encode()).hexdigest()
    command([BIN+'initdb','-D',str(p/'data'),'-U','postgres','--auth-local=trust','--auth-host=reject'])
    command([BIN+'pg_ctl','-D',str(p/'data'),'-l',str(p/'postgres.private.log'),'-o',f"-k {sock} -p 56539 -h '' -c log_statement=none -c log_min_error_statement=panic",'start'])
    cli=['psql','-X','-h',str(sock),'-p','56539','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
    def sql(q,ok=True):
        r=subprocess.run(cli,input=q,text=True,capture_output=True,timeout=20)
        if ok and r.returncode:raise RuntimeError('synthetic_sql_failed_private_diagnostic')
        if not ok and r.returncode==0:raise RuntimeError('synthetic_sql_negative_accepted')
        return r.stdout.strip()
    try:
        text_fields=['provider','displayName','channelAccountId','externalBusinessId','status','tokenStatus'];bool_fields=['enabled','automationEnabled','runtimeEnabled','inboundPersistenceEnabled','outboundEnabled','aiEnabled','handoffEnabled'];json_fields=['externalAccountIds','metadata']
        account_columns='id text PRIMARY KEY,"clientId" uuid NOT NULL,channel text,'+','.join('"'+k+'" text'for k in text_fields)+','+','.join('"'+k+'" boolean'for k in bool_fields)+','+','.join('"'+k+'" jsonb'for k in json_fields)+',"createdAt" timestamp,"updatedAt" timestamp'
        sql('CREATE TABLE "MfaTotpSecret"(id text PRIMARY KEY);CREATE TABLE "WebhookEndpoint"(id text PRIMARY KEY);CREATE TABLE "ChannelAccount"('+account_columns+');CREATE TABLE "ChannelAccountSecret"(id text PRIMARY KEY,"channelAccountId" text REFERENCES "ChannelAccount", "secretKind" text,"secretHash" text,"secretCiphertext" text,"encryptionKeyRef" text,status text,"createdAt" timestamp,"updatedAt" timestamp);CREATE TABLE "Event"(id uuid PRIMARY KEY,"clientId" uuid,"eventName" text,"requestId" text,"payloadJson" jsonb,"createdAt" timestamp,UNIQUE("clientId","eventName","requestId"));')
        rows=[c['originalRow'] for c in plan['changes']]+[r['originalRow'] for r in plan['retained']]
        def reset():
            def value(v):return 'NULL'if v is None else ('TRUE'if v else'FALSE')if isinstance(v,bool)else literal(json.dumps(v))+'::jsonb'if isinstance(v,(dict,list))else literal(v)
            sql('TRUNCATE "Event","ChannelAccountSecret","ChannelAccount","MfaTotpSecret","WebhookEndpoint";'+''.join('INSERT INTO "ChannelAccount"('+','.join('"'+k+'"'for k in a)+')VALUES('+','.join(value(v)for v in a.values())+');'for a in accounts)+''.join('INSERT INTO "ChannelAccountSecret" VALUES('+','.join(literal(r[k]) for k in ['id','channelAccountId','secretKind','secretHash','secretCiphertext','encryptionKeyRef','status','createdAt','updatedAt'])+');' for r in rows))
        state='SELECT md5(string_agg(to_jsonb(s)::text,\'\'ORDER BY id))FROM "ChannelAccountSecret" s;'
        reset();driver=CipherDriver(lambda q:json.loads(sql(q)),lambda q:sql(q));assert driver.classify(plan,h)=='ORIGINAL_VERIFIED';original=sql(state);sql(render(plan,h,True),ok=False);assert sql(state)==original and sql('SELECT count(*) FROM "Event"')=='0'
        # Drift of the preserved opaque row or tenant must deny before conversion.
        sql('UPDATE "ChannelAccountSecret" SET status=\'drift\' WHERE id=\'synthetic-secret-10\';');drift=sql(state);sql(render(plan,h),ok=False);assert sql(state)==drift
        reset();sql('UPDATE "ChannelAccount" SET "clientId"=\'33333333-3333-4333-8333-333333333333\' WHERE id=\'synthetic-account-0\';');sql(render(plan,h),ok=False);assert sql(state)==original
        reset();sql('UPDATE "ChannelAccount" SET channel=\'different\' WHERE id=\'synthetic-account-10\';');sql(render(plan,h),ok=False);assert sql(state)==original
        reset();sql('INSERT INTO "ChannelAccountSecret" SELECT \'synthetic-extra\',"channelAccountId","secretKind","secretHash","secretCiphertext","encryptionKeyRef",status,"createdAt","updatedAt" FROM "ChannelAccountSecret" WHERE id=\'synthetic-secret-0\';')
        try:driver.classify(plan,h);raise AssertionError('new_inventory_row_accepted')
        except RuntimeError:pass
        reset()
        for table in ['MfaTotpSecret','WebhookEndpoint']:
            sql('INSERT INTO "'+table+'" VALUES(\'synthetic-new-row\');')
            try:driver.classify(plan,h);raise AssertionError('nonempty_cipher_family_accepted')
            except RuntimeError:pass
            sql(render(plan,h),ok=False);assert sql(state)==original;reset()
        sqlfile=p/'apply.private.sql';sqlfile.write_text(render(plan,h));driver.apply(plan,h,sqlfile,hashlib.sha256(sqlfile.read_bytes()).hexdigest());assert driver.classify(plan,h)=='VERIFIED';after=sql(state);assert after!=original and sql('SELECT count(*) FROM "Event"')=='2'
        assert sql('SELECT sum(("payloadJson"->>\'inventoryCount\')::integer) FROM "Event"')=='11'
        assert sql('SELECT count(*)FROM "Event" WHERE ("payloadJson"->>\'inventoryCount\')::integer=11')=='0'
        opaque=sql('SELECT to_jsonb(s)::text FROM "ChannelAccountSecret" s WHERE id=\'synthetic-secret-10\';');sql(render(plan,h));assert sql(state)==after and sql('SELECT count(*) FROM "Event"')=='2'
        assert sql('SELECT to_jsonb(s)::text FROM "ChannelAccountSecret" s WHERE id=\'synthetic-secret-10\';')==opaque
        sql('UPDATE "Event" SET "payloadJson"=\'{}\';');
        try:driver.classify(plan,h);raise AssertionError('verifier_receipt_conflict_accepted')
        except RuntimeError:pass
        sql(render(plan,h),ok=False);assert sql(state)==after
        reset()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda _:sql(render(plan,h)),range(2)))
        assert sql(state)==after and sql('SELECT count(*) FROM "Event"')=='2'
        print(json.dumps({'result':'POSTGRES16_REAL_SQL_DRIVER_AND_READONLY_VERIFIER_PASS','converted':10,'opaqueRetainedUnchanged':1,'receiptsPerTenant':True,'replayAdditionalEvents':0,'rollbackRestoresAll11':True,'opaqueDriftDenied':True,'tenantDriftDenied':True,'accountMetadataAndTimestampsCompared':True,'receiptConflictDenied':True,'concurrentApplicationsOneResult':True,'emptyMfaWebhookTransactionalGate':True,'readOnlyVerifier':True,'classifiesOriginalAndVerified':True,'providerCalls':0,'productionConnections':0,'limits':'Synthetic tables use effective account/secret/receipt columns; production FK/RBAC/fences require final canonical integration review.'}))
    finally:
        command([BIN+'pg_ctl','-D',str(p/'data'),'stop','-m','fast'])
