"""New future wrapper of canonical READ ONLY backup; never executed in preparation.
Source SHA256 7408e3b983c8363191f369349963fcd33dcae95177e015496f1a0280370c5e3b; no cipher population capture.
"""
import datetime,fcntl,hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
os.umask(0o077)
P=Path(sys.argv[1]);assert P.name=='incident-6683-v4-security-openai-v4-20261015T203000Z'and P.parent==Path('/opt/re7online/backups/converta-persistent/preparations');sys.path.insert(0,str(P/'window'))
from openai_contract import check
from check_current import check_current
check(P,live=True);check_current(P)
windowlock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(windowlock,fcntl.LOCK_EX|fcntl.LOCK_NB)
base=Path('/opt/re7online/backups/converta-persistent/preparations');stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');q=base/('openai-rpo-'+stamp);q.mkdir(mode=0o700)
schema='BEGIN READ ONLY;\nSET LOCAL TIME ZONE \'UTC\';\nSELECT json_build_object(\'columns\',(SELECT json_agg(json_build_array(table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default)ORDER BY table_name,ordinal_position)FROM information_schema.columns WHERE table_schema=\'public\'),\'constraints\',(SELECT json_agg(json_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid))ORDER BY c.relname,k.conname)FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\'),\'migrations\',(SELECT json_agg(json_build_object(\'id\',id,\'checksum\',checksum,\'migration_name\',migration_name,\'started_at\',started_at,\'finished_at\',finished_at,\'rolled_back_at\',rolled_back_at,\'applied_steps_count\',applied_steps_count)ORDER BY id)FROM "_prisma_migrations"));\nROLLBACK;\n'
expected='142a2b61fd5a366bb770bd4274d6cdf7f0850808d26f4e03b7cdf4ffe7acd71d'
def sql(text):
 r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
 if r.returncode:raise RuntimeError('schema_read_failed')
 return json.loads(r.stdout)
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
with (base.parent/'backup.lock').open('a+')as lock:
 fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
 before=sql(schema);assert digest(before)==expected,'schema_frontier_drift'
 v=os.statvfs(base);pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3]);assert min(pg,v.f_bavail*v.f_frsize)>=json.loads((P/'window/openai-contract.private.json').read_text())['minimumCapacityBytes'],'capacity_denied'
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
 with(q/'database.dump').open('xb')as out,(q/'dump.private.stderr').open('x')as err:
  r=subprocess.run(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000','wa-agent-postgres','pg_dump','-U','wa_agent','-d','whatsapp_agent','-Fc'],stdout=out,stderr=err,timeout=120)
 assert r.returncode==0,'dump_failed'
 with(q/'catalog.private.txt').open('x')as out,(q/'catalog.private.stderr').open('x')as err:
  with(q/'database.dump').open('rb')as inp:r=subprocess.run(['docker','exec','-i','wa-agent-postgres','pg_restore','--list'],stdin=inp,stdout=out,stderr=err,timeout=30)
 assert r.returncode==0,'catalog_failed'
 after=sql(schema);assert before==after,'schema_changed_during_backup'
 catalog=sum(bool(re.match(r'^\d+;',l))for l in(q/'catalog.private.txt').read_text().splitlines());assert catalog==614,'catalog_frontier_drift'
 result={'result':'FRESH_READONLY_BACKUP_PASS','remoteDirectory':str(q),'startedUtc':started,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'durationSeconds':time.monotonic()-t,'dumpSha256':hashlib.sha256((q/'database.dump').read_bytes()).hexdigest(),'dumpBytes':(q/'database.dump').stat().st_size,'catalogObjects':catalog,'schemaDigest':expected,'backupLockHeld':True,'newCipherPlanGenerated':False}
 assert result['dumpBytes']<=134217728,'backup_phase_reserve_exceeded'
 (q/'capture-receipt.private.json').write_text(json.dumps(result));print(json.dumps(result))
