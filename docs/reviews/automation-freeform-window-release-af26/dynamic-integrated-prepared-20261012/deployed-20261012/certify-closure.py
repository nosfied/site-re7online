"""Read-only closure verification and certificate writer; never performs cancellation."""
from pathlib import Path
import json,hashlib,subprocess,os,fcntl,sys,datetime
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z');W=P/'window'
I=P.parent/'dynamic-integrated-input-5b3cf3af-20261012T170000Z';h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (P/'execution-authorized').read_text().strip()=='false'
assert all(v is False for v in json.loads((W/'execution-gates.private.json').read_text()).values())
assert not(W/'closure-verified.private.json').exists() and not(W/'closure-verified.private.json').is_symlink(),'closure_certificate_exists'
assert h(I/'capture-postdeploy-readonly.py')=='474616cb30217f81d82d32fdf2476adef04e6c70035f9c5c5f72723825c36978'
assert h('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z/admin/input.private.json')=='600ad3569fd28a9999adc2457f2f13e5f4201ebd985d232fcd94f669f8a6c0e2'
assert h(P/'admin/reader-v2.cjs')=='3abcbb95ac5a77d58b1f76d2e570a5b46b24a526e6014984bf628022b6818e13'
assert h(P/'admin/hash.mjs')=='a083d9c23ae243dab3c7a4f722cfc8f8335d61cda6683b428529da3f98a67b83'
query="process.env.RE7_CLOSE_STAGE='after';process.env.RE7_CLOSE_INPUT='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z/admin/input.private.json';process.env.RE7_HASH_MODULE='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z/admin/hash.mjs';require('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z/admin/reader-v2.cjs');"
record=W/('closure-observation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.private.json');err=record.with_suffix('.stderr')
with record.open('x')as out,err.open('x')as stderr:r=subprocess.run(['python3',str(I/'capture-postdeploy-readonly.py')],input=query,text=True,stdout=out,stderr=stderr,timeout=60)
record.chmod(0o600);err.chmod(0o600);assert r.returncode==0,'closure_reader_denied_preserved'
v=json.loads(record.read_text());assert v['queryExit']==0
for x in [v['atBefore'],v['atAfter']]:
 assert x['ledger']['consistent'] and not x['lockExists']and not x['uncertainExists'];g=x['ledger']['contents'];assert g['open']is False and g['generation']==38 and g['tasks']=={}
assert v['atBefore']['ledger']['sha256']==v['atAfter']['ledger']['sha256'],'closure_guard_drift'
data=v['data'];assert data['stage']=='VERIFY_AFTER_CANONICAL_CANCEL'and data['mode']=='READ_ONLY'and data['planHash']=='ce1afa3887e934bb505c385f0509c47c38dbd0468445be453cde000636e9194f'
# SQL is rechecked by every mode's noWork; this receipt cannot authorize a start.
sql=subprocess.check_output(['/usr/bin/node','-e','process.stdout.write(require(process.argv[1]).sql)',str(P/'switch/preparation-bindings.cjs')],text=True,timeout=10)
raw=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SET LOCAL TIME ZONE 'UTC';"+sql+';ROLLBACK;'],text=True,timeout=15)
subprocess.run(['/usr/bin/node','-e',"const fs=require('fs'),p=process.argv[2],q=JSON.parse(fs.readFileSync(0,'utf8'));require(p+'/waiting-work.cjs').closed(q,JSON.parse(fs.readFileSync(p+'/../window/waiting-work.private.json')),JSON.parse(fs.readFileSync(process.argv[3])).data);require(process.argv[1]).proofs(p);",str(P/'switch/preparation-bindings.cjs'),str(P/'switch'),str(record)],input=raw,text=True,check=True,timeout=15)
with(W/'closure-verified.private.json').open('x')as f:json.dump(data,f,sort_keys=True);f.write('\n')
(W/'closure-verified.private.json').chmod(0o600)
print('SPECIFIC_CLOSURE_SQL_RECEIPT_GLOBAL_INVENTORY_VERIFIED_GUARD38_GATES_FALSE')
