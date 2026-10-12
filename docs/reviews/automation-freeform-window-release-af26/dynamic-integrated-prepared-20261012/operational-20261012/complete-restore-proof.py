from pathlib import Path
import json,hashlib,subprocess,os,fcntl,shutil
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z');W=P/'window';B=Path('/opt/re7online/releases/campaign-result-truth-2ed9dccc-20261011T184000Z/apps/whatsapp-agent')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert all(x is False for x in json.loads((W/'execution-gates.private.json').read_text()).values())
sql='BEGIN READ ONLY;SET LOCAL statement_timeout=5000;SET LOCAL lock_timeout=1000;SELECT coalesce(json_agg(json_build_object(\'name\',migration_name,\'checksum\',checksum)),\'[]\') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;ROLLBACK;'
raw=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-c',sql],text=True,timeout=10);rows=json.loads(raw)
errors=[r['name']for r in rows if not(B/'prisma/migrations'/r['name']/'migration.sql').is_file()or h(B/'prisma/migrations'/r['name']/'migration.sql')!=r['checksum']]
assert not errors,'migration_checksum_divergence'
archive=P/'restore-proof-original-preserved';assert not archive.exists();archive.mkdir(mode=0o700)
for n in ['restore-result.json','mode-manifest-v4.json','sequencer-manifest.json']:shutil.copyfile(W/n,archive/n)
r=json.loads((W/'restore-result.json').read_text());assert r['result']=='PASS'and r['temporaryDatabaseRemoved']and r['providerCalls']==0
r.update(applicationStarted=False,migrationChecksumMismatches=errors,migrationChecksumsVerified=len(rows))
(W/'restore-result.json').write_text(json.dumps(r,indent=2)+'\n')
for m in ['switch','return','return-partial']:
 d=P/m;ad=archive/m;ad.mkdir();shutil.copyfile(d/'proof-bindings.private.json',ad/'proof-bindings.private.json');shutil.copyfile(d/'scripts.sha256',ad/'scripts.sha256')
 b=json.loads((d/'proof-bindings.private.json').read_text());b['restoreResultSha256']=h(W/'restore-result.json');(d/'proof-bindings.private.json').write_text(json.dumps(b,sort_keys=True,separators=(',',':'))+'\n')
 names=[l.split('  ',1)[1]for l in (d/'scripts.sha256').read_text().splitlines()];(d/'scripts.sha256').write_text(''.join(h(d/n)+'  '+n+'\n'for n in names))
v=json.loads((W/'mode-manifest-v4.json').read_text());v['modeManifests']={m:h(P/m/'scripts.sha256')for m in v['modeManifests']};v['modeFiles']={m:{n:h(P/m/n)for n in ns}for m,ns in json.loads((W/'mode-names.private.json').read_text()).items()};(W/'mode-manifest-v4.json').write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n')
v=json.loads((W/'sequencer-manifest.json').read_text());v['filesSha256']={n:h(W/n)for n in v['filesSha256']};(W/'sequencer-manifest.json').write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n')
x=json.loads((P/'prepared-result.private.json').read_text());x.update(restoreResultSha256=h(W/'restore-result.json'),sequencerManifestSha256=h(W/'sequencer-manifest.json'),modeManifests={m:h(P/m/'scripts.sha256')for m in ['switch','return','return-partial']},modeFiles=json.loads((W/'mode-manifest-v4.json').read_text())['modeFiles']);(archive/'prepared-result.before-proof.json').write_bytes((P/'prepared-result.private.json').read_bytes());(P/'prepared-result.private.json').write_text(json.dumps(x,sort_keys=True,separators=(',',':'))+'\n')
print('RESTORE_PROOF_COMPLETE_MIGRATION_CHECKSUMS_PASS')
