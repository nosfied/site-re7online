import json,os,subprocess,sys,tempfile
from pathlib import Path
from pinned_transport import Pinned
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent;os.umask(0o077)
OUT=ROOT/'local-evidence/cipher-pinned-transport-proof-20261015';OUT.mkdir(mode=0o700);SOCK=Path('/tmp/re7-cipher-pinned-20261015');SOCK.mkdir(mode=0o700)
DATA=ROOT/'local-evidence/cipher-snapshot-vps-20261014/restore/data';BIN='/usr/lib/postgresql/16/bin/';log=(OUT/'harness.private.log').open('x')
def command(args):return subprocess.run(args,check=True,stdout=log,stderr=log,timeout=30)
command([BIN+'pg_ctl','-D',str(DATA),'-l',str(OUT/'postgres.private.log'),'-o',f"-k {SOCK} -p 56550 -h '' -c log_statement=none -c log_min_error_statement=panic",'start'])
try:
 sql="SELECT json_build_object('database',current_database(),'role',session_user,'databaseOid',(SELECT oid FROM pg_database WHERE datname=current_database()),'serverVersion',current_setting('server_version_num'),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()))"
 identity=json.loads(subprocess.check_output([BIN+'psql','-X','-h',str(SOCK),'-p','56550','-U','postgres','-d','postgres','-Atq','-c',sql],text=True))
 cfg={'apps':[{'name':'re7-whatsapp-agent','env':{'DATABASE_URL':'postgresql://postgres@localhost:56550/postgres?host='+str(SOCK)}},{'name':'re7-whatsapp-web-worker','cwd':str(ROOT/'apps/whatsapp-web-worker')}]};p=OUT/'configuration.private.json';p.write_text(json.dumps(cfg));p.chmod(0o600)
 node=str(ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node');client=Pinned(node,HERE/'locked_transport.cjs',p,identity,OUT/'transport.private.stderr')
 try:
  client.query('BEGIN READ ONLY;SET LOCAL statement_timeout=\'1s\';');first=json.loads(client.query('SELECT pg_backend_pid() AS pid'))
  value=json.loads(client.query("SELECT json_build_object('pid',pg_backend_pid(),'payload',repeat('x',524288))"));assert value['pid']==first and len(value['payload'])==524288
  client.query('ROLLBACK;')
 finally:client.close()
 try:Pinned(node,HERE/'locked_transport.cjs',p,{**identity,'role':'wrong'},OUT/'identity-denial.private.stderr');raise AssertionError('identity_drift_accepted')
 except RuntimeError:pass
 client=Pinned(node,HERE/'locked_transport.cjs',p,identity,OUT/'deadline.private.stderr',deadline=1)
 try:
  try:client.query('SELECT pg_sleep(2)');raise AssertionError('deadline_accepted')
  except TimeoutError:pass
 finally:client.close()
 result={'result':'PINNED_NODE20_PG16_PRIVATE_TRANSPORT_PASS','sameBackendAcrossQueries':True,'boundedLargeResponse':True,'identityDriftDenied':True,'deadlineDenied':True,'sourceRestoreReused':True,'productionConnections':0,'providers':0};(OUT/'result.sanitized.json').write_text(json.dumps(result));print(json.dumps(result))
finally:command([BIN+'pg_ctl','-D',str(DATA),'stop','-m','fast'])
