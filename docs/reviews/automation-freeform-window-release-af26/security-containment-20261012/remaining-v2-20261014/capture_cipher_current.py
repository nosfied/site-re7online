"""Builds a private SSH stdin program using the reviewed READ ONLY collector.
No old capture bindings are edited; no files are written on production.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root=Path.cwd();collector=root/'docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher_inventory_read.cjs'
policy=json.loads((root/'local-evidence/security-auth-v3-prepared-20261012T234100Z/canonical-seed-policy-final.private.json').read_text())
code=collector.read_text()
# Add only the exact original tenant/event pairs to the existing transaction.
pairs=sorted({(e['eventId'],e['clientId'])for e in policy['entries']})
seed_js="const seeds=await tx.event.findMany({where:{OR:"+json.dumps([{'id':i,'clientId':c}for i,c in pairs])+"},select:{id:true,clientId:true,payloadJson:true},take:127,orderBy:{id:'asc'}});assert.equal(seeds.length,126,'original_seed_membership_drift');"
if '--complete-seed-inventory' in sys.argv[2:]:
    predicate="jsonb_typeof(\"payloadJson\"->'recipientsCiphertext')='string' OR jsonb_typeof(\"payloadJson\"->'componentsByWaIdCiphertext')='string'"
    count_sql='SELECT count(*)::int AS n FROM "Event" WHERE '+predicate
    rows_sql='SELECT id,"clientId","payloadJson" FROM "Event" WHERE '+predicate+' ORDER BY id LIMIT 127'
    seed_js='const seedCount=await tx.$queryRawUnsafe('+json.dumps(count_sql)+");assert.equal(seedCount[0].n,126,'complete_seed_population_drift');const seeds=await tx.$queryRawUnsafe("+json.dumps(rows_sql)+");assert.equal(seeds.length,126,'complete_seed_membership_drift');"
code=code.replace('return{groups,externalRefs:refs,accounts};',seed_js+'return{groups,externalRefs:refs,accounts,seeds};')
program='''import os,json,subprocess,hashlib
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-database-final-v4-20261013T140000Z')
cfg=json.loads((P/'switch/candidate.config.private.json').read_text());api=next(a for a in cfg['apps']if a['name']=='re7-whatsapp-agent')
proc=Path('/proc/410272');assert proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]=='2170884687','api_identity_drift'
env=dict(q.split(b'=',1)for q in proc.joinpath('environ').read_bytes().split(b'\\0')if b'='in q)
required=['DATABASE_URL','CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY','META_APP_SECRET','APP_AUTH_SECRET']
assert all(isinstance(api['env'].get(k),str)and api['env'][k]and env.get(k.encode())==api['env'][k].encode()for k in required),'legitimate_keys_missing_before_connection'
clean={'PATH':'/usr/bin:/bin','HOME':'/home/deploy','USER':'deploy','LANG':'C.UTF-8','RE7_API_CWD':api['cwd']};clean.update({k:api['env'][k]for k in required})
g=Path('/var/lib/re7/campaign-operations/state.json');before=g.read_bytes();v=json.loads(before);assert v['open']is False and v['generation']==38 and v['tasks']=={}and not any(os.path.lexists(str(g)+s)for s in ['.lock','.uncertain'])
payload=PAYLOAD
r=subprocess.run([api['interpreter'],'-e',payload],env=clean,capture_output=True,text=True,timeout=45)
assert g.read_bytes()==before,'ledger_changed_during_capture'
assert r.returncode==0,'bounded_canonical_inventory_denied'
print(r.stdout,end='')
'''.replace('PAYLOAD',repr(code))
out=Path(sys.argv[1]);assert out.is_dir()and not out.is_symlink()and out.stat().st_mode&0o777==0o700
for name in ['cipher-current.private.json','cipher-current.private.stderr']:
    assert not (out/name).exists()
with (out/'cipher-current.private.json').open('x')as stdout,(out/'cipher-current.private.stderr').open('x')as stderr:
    (out/'cipher-current.private.json').chmod(0o600);(out/'cipher-current.private.stderr').chmod(0o600)
    result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','deploy@admin.re7online.com','/usr/bin/python3 -B -I -S -'],input=program,text=True,stdout=stdout,stderr=stderr,timeout=60)
if result.returncode:print(json.dumps({'result':'CURRENT_CIPHER_CAPTURE_DENY','exitCode':result.returncode,'noRetry':True}));raise SystemExit(1)
data=json.loads((out/'cipher-current.private.json').read_text())
actual=[]
for r in data['data']['seeds']:
 for field in ['recipientsCiphertext','componentsByWaIdCiphertext']:
  if r['payloadJson'].get(field):actual.append({'clientId':r['clientId'],'eventId':r['id'],'field':field,'payloadSha256':hashlib.sha256(json.dumps(r['payloadJson'],separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'ciphertextSha256':hashlib.sha256(r['payloadJson'][field].encode()).hexdigest()})
# JS JSON.stringify escaping differs on rare unicode; verify exact equality in
# Node before using this capture for a policy, never substitute a new hash.
summary={'result':'CURRENT_PRIVATE_CIPHER_INVENTORY_READONLY_CAPTURED','channelEncrypted':data['data']['groups'][0]['encrypted'],'channelFailed':data['data']['groups'][0]['decryptFailed'],'externalRefs':sum(x['count']for x in data['data']['externalRefs']),'seedEvents':len(data['data']['seeds']),'completeEncryptedSeedPopulationChecked':'--complete-seed-inventory'in sys.argv[2:],'providerCalls':data['providerCalls'],'collectorSourceSha256':hashlib.sha256(collector.read_bytes()).hexdigest(),'captureSha256':hashlib.sha256((out/'cipher-current.private.json').read_bytes()).hexdigest()}
(out/'cipher-current.sanitized.json').write_text(json.dumps(summary,indent=2)+'\n');(out/'cipher-current.sanitized.json').chmod(0o600);print(json.dumps(summary))
