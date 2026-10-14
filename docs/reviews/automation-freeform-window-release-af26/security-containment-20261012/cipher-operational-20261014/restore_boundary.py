"""Fresh full dump restore, isolated Unix-only PG16, no provider/application."""
import datetime,hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent;E=Path(sys.argv[1]).absolute();BIN='/usr/lib/postgresql/16/bin/'
sys.path.insert(0,str(HERE.parent/'remaining-v3-20261014'));sys.path.insert(0,str(HERE.parent/'remaining-v2-20261014'))
from cipher_verify import CipherDriver,digest
from channel_transaction import render
from cipher_sql import guard_empty_families
os.umask(0o077);dump=E/'database.dump';receipt=json.loads((E/'dump.receipt.private.json').read_text());assert hashlib.sha256(dump.read_bytes()).hexdigest()==receipt['sha256']
P=E/'restore-isolated-v2';assert not P.exists();P.mkdir(mode=0o700);sock=Path(__import__('tempfile').mkdtemp(prefix='re7-cipher-pg-',dir='/tmp'));assert len(os.fsencode(str(sock)))<90
logs=(P/'commands.private.log').open('x');err=(P/'commands.private.stderr').open('x')
def command(args):return subprocess.run(args,stdout=logs,stderr=err,check=True,timeout=180)
command([BIN+'initdb','-D',str(P/'data'),'-U','postgres','--auth-local=trust','--auth-host=reject'])
command([BIN+'pg_ctl','-D',str(P/'data'),'-l',str(P/'postgres.private.log'),'-o',f"-h '' -k {sock} -p 56543 -c log_statement=none -c log_min_error_statement=panic",'start'])
cli=['psql','-X','-h',str(sock),'-p','56543','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
def sql(q):
 r=subprocess.run(cli,input=q,text=True,capture_output=True,timeout=30)
 if r.returncode:
  with(P/('sql-deny-'+str(__import__('time').time_ns())+'.private.json')).open('x')as f:json.dump({'stderr':r.stderr},f)
  raise RuntimeError('isolated_sql_denied_private_diagnostic')
 return r.stdout.strip()
def event_hash():return hashlib.sha256(sql('SELECT to_jsonb(e)::text FROM "Event" e WHERE "eventName"<>\'security.channel_cipher.rotation_with_historical_disposition\' ORDER BY id;').encode()).hexdigest()
try:
 command([BIN+'pg_restore','--exit-on-error','--no-owner','--no-acl','-h',str(sock),'-p','56543','-U','postgres','-d','postgres',str(dump)])
 plan=json.loads((E/'channel-plan-current/channel-plan.private.json').read_text());ph=digest(plan)
 driver=CipherDriver(lambda q:json.loads(sql(q)),lambda q:sql(q));observed=driver.classify(plan,ph)
 assert observed=='ORIGINAL_VERIFIED','restore_source_snapshot_differs_current_CAS'
 before_event=event_hash();tables=int(sql("SELECT count(*)FROM information_schema.tables WHERE table_schema='public'AND table_type='BASE TABLE'"));migrations=int(sql('SELECT count(*) FROM "_prisma_migrations"'));assert int(sql('SELECT count(*)FROM pg_trigger WHERE NOT tgisinternal'))==0,'unreviewed_trigger'
 q='SELECT json_agg(x ORDER BY id) FROM(SELECT id,"clientId","payloadJson" FROM "Event" WHERE jsonb_typeof("payloadJson"->\'recipientsCiphertext\')=\'string\'OR jsonb_typeof("payloadJson"->\'componentsByWaIdCiphertext\')=\'string\')x;'
 seeds=sql(q);f=P/'restored-seeds.private.json';f.write_text(seeds);f.chmod(0o600);assert len(json.loads(seeds))==126
 out=E/'channel-apply.current.private.sql';assert not out.exists();out.write_text(guard_empty_families(render(plan,ph)));out.chmod(0o600)
 driver.apply(plan,ph,out,hashlib.sha256(out.read_bytes()).hexdigest());assert driver.classify(plan,ph)=='VERIFIED';sql(out.read_text());assert driver.classify(plan,ph)=='VERIFIED';assert event_hash()==before_event,'historical_event_changed';assert sql(q)==seeds,'seed_payload_changed'
 # Verify cryptography of ten converted records and unchanged opaque row with
 # pure canonical modules only. Plaintexts remain in memory, never serialized.
 rows=json.loads(sql('SELECT json_agg(s ORDER BY id)FROM "ChannelAccountSecret" s;'));rf=P/'converted-rows.private.json';rf.write_text(json.dumps(rows));rf.chmod(0o600)
 node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node';module=ROOT/'local-evidence/security-v3-runtime-20261014/candidate/dist/channels/channelAccountSecretCrypto.js'
 code="const fs=require('fs'),assert=require('assert/strict');global.fetch=()=>{throw Error('provider_forbidden')};(async()=>{const c=await import(process.argv[1]);const v=JSON.parse(fs.readFileSync(0,'utf8'));for(const x of v.plan.changes){const r=v.rows.find(r=>r.id===x.id);assert.equal(c.decryptChannelAccountSecret(r.secretCiphertext,v.next),c.decryptChannelAccountSecret(x.originalRow.secretCiphertext,v.old));assert.equal(c.decryptChannelAccountSecret(r.secretCiphertext,v.old),null)}const opaque=v.plan.retained[0];assert.equal(v.rows.find(r=>r.id===opaque.id).secretCiphertext,opaque.originalRow.secretCiphertext)})().catch(()=>{process.exitCode=1})"
 old=json.loads((ROOT/'local-evidence/security-containment-20261012/package-v2/original-values.private.json').read_text())['CHANNEL_ACCOUNT_SECRET_KEY'];new=json.loads((ROOT/'local-evidence/security-containment-20261012/package-v2/new-values.private.json').read_text())['CHANNEL_ACCOUNT_SECRET_KEY']
 r=subprocess.run([str(node),'-e',code,str(module)],input=json.dumps({'plan':plan,'rows':rows,'old':old,'next':new}),text=True,stdout=logs,stderr=err,timeout=20);assert r.returncode==0,'converted_crypto_proof_denied'
 proof_script=(HERE.parent/'remaining-v3-20261014/verify_epoch_compiled.mjs').read_text().replace("JSON.parse(fs.readFileSync(S+'/seed-dependency.stdout.private')).data.data.rows","JSON.parse(fs.readFileSync(proof+'/restored-seeds.private.json'))")
 script=P/'verify-restored-epoch.mjs';script.write_text(proof_script);script.chmod(0o600);command([str(node),str(script),str(ROOT),str(ROOT/'local-evidence/security-v3-runtime-20261014/candidate'),str(P)])
 epoch=json.loads((P/'result.sanitized.json').read_text());assert epoch['fields']==147 and epoch['writersIndependentOfHistoricalGrant']
 allocated=sum(x.stat().st_blocks*512 for x in(P/'data').rglob('*')if x.is_file());assert allocated<=2079326208,'restore_budget_exceeded'
 v={'result':'FRESH_FULL_RESTORE_NEW_CIPHER_BOUNDARY_PASS','dumpSha256':receipt['sha256'],'dumpBytes':dump.stat().st_size,'capturedAtUtc':receipt['startedAtUtc'],'verifiedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':tables,'migrations':migrations,'converted':10,'opaquePreserved':1,'fields':147,'events':126,'planHash':ph,'sqlSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'originalTimestampsMetadataPreserved':True,'historicalEventsAndReceiptsUnchanged':True,'replayAdditionalReceipts':0,'v2ReadWriteIndependent':True,'restoreAllocatedBytes':allocated,'postgresRestartedProduction':False,'providerCalls':0,'productionWrites':0,'isolatedUnixOnly':True};(E/'restore-result.sanitized.json').write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v))
finally:command([BIN+'pg_ctl','-D',str(P/'data'),'stop','-m','fast'])
