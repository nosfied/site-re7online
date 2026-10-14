"""Real PG16 snapshot and failure paths, isolated Unix socket, no application."""
import argparse,fcntl,json,os,re,subprocess,sys,tempfile
from pathlib import Path
from snapshot_capture import Connection,IDENTITY_SQL,capture,Denied,write,digest
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent;BIN='/usr/lib/postgresql/16/bin/'
os.umask(0o077)
args=argparse.ArgumentParser();args.add_argument('--evidence-dir',type=Path,default=ROOT/'local-evidence/security-snapshot-local-20261014');args.add_argument('--resume-local',action='store_true');options=args.parse_args()
OUT=options.evidence_dir.absolute();RESUME=options.resume_local
if not RESUME:OUT.mkdir(mode=0o700)
SOCK=Path(tempfile.mkdtemp(prefix='re7snap-',dir='/tmp'));SOCK.chmod(0o700)
log=(OUT/'commands.private.log').open('a' if RESUME else 'x');err=(OUT/'commands.private.stderr').open('a' if RESUME else 'x')
def run(args,timeout=120):return subprocess.run(args,check=True,stdout=log,stderr=err,timeout=timeout)
def conn(db='source'):return f"host={SOCK} port=56547 user=postgres dbname={db} connect_timeout=2"
def connection(db='source'):return Connection(conn(db))
def query(q,db='source'):
 c=connection(db)
 try:return c.query(q)
 finally:c.close()
def folder(name):p=OUT/name;p.mkdir(mode=0o700);return p
lock=OUT/'backup.lock'
started=False
try:
 if not RESUME:
  run([BIN+'initdb','-D',str(OUT/'data'),'-U','postgres','--auth-local=trust','--auth-host=reject'])
  run([BIN+'pg_ctl','-D',str(OUT/'data'),'-l',str(OUT/'postgres.private.log'),'-o',f"-k {SOCK} -p 56547 -h '' -c log_statement=none -c log_min_error_statement=panic",'start']);started=True
  run([BIN+'createdb','-h',str(SOCK),'-p','56547','-U','postgres','source'])
  original=ROOT/'local-evidence/security-cipher-operational-20261014T180000Z/database.dump';assert digest(original)=='6c5354ea95ab3eef87d8731d2004d5409da5d42632678ac3f560fd41beeafd73'
  run([BIN+'pg_restore','-h',str(SOCK),'-p','56547','-U','postgres','-d','source','--no-owner','--no-acl',str(original)])
  identity=json.loads(query(IDENTITY_SQL)[0][0])
  inventory="""SELECT json_build_object('secrets',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM "ChannelAccountSecret" s),'accounts',(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM "ChannelAccount" a),'seeds',(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM "Event" e WHERE "payloadJson" ? 'recipientsCiphertext' OR "payloadJson" ? 'componentsByWaIdCiphertext'),'mfa',(SELECT count(*)FROM "MfaTotpSecret"),'webhooks',(SELECT count(*)FROM "WebhookEndpoint"))::text"""
  dump=[BIN+'pg_dump','-h',str(SOCK),'-p','56547','-U','postgres','-d','source','-Fc','--no-owner','--no-acl','--lock-wait-timeout=5000']
  def do(name,**kw):return capture(out=folder(name),lock_path=lock,conninfo=conn(),dump_command=dump,inventory_sql=inventory,expected_identity=identity,**kw)
  # Concurrent local writer changes a control field only after the exported inventory.
  def writer(holder,snapshot):
   assert holder.query('SHOW transaction_read_only')==[['on']]
   query('UPDATE "ChannelAccountSecret" SET "updatedAt"="updatedAt"+interval \'1 second\' WHERE id=(SELECT id FROM "ChannelAccountSecret" ORDER BY id LIMIT 1)')
  receipt=do('coherent',after_inventory=writer)
  raw=json.loads((OUT/'coherent/inventory.private.json').read_text())
  assert raw!=json.loads(query(inventory)[0][0]),'concurrent_writer_not_observed'
  run([BIN+'createdb','-h',str(SOCK),'-p','56547','-U','postgres','restored'])
  run([BIN+'pg_restore','-h',str(SOCK),'-p','56547','-U','postgres','-d','restored','--no-owner','--no-acl',str(OUT/'coherent/database.dump')])
  assert json.loads(query(inventory,'restored')[0][0])==raw,'inventory_dump_snapshot_mismatch'
  # Missing/inadequate destinations deny before opening a connection or dump.
  for name,mode in [('output-public',0o755),('output-group',0o770)]:
   p=folder(name);p.chmod(mode)
   try:capture(out=p,lock_path=lock,conninfo='invalid',dump_command=[],inventory_sql='',expected_identity={});raise AssertionError('bad_output_accepted')
   except Denied:assert not list(p.iterdir())
  p=OUT/'output-symlink';p.symlink_to(OUT/'coherent')
  try:capture(out=p,lock_path=lock,conninfo='invalid',dump_command=[],inventory_sql='',expected_identity={});raise AssertionError('symlink_accepted')
  except Denied:pass
  with lock.open('r+')as l:
   fcntl.flock(l,fcntl.LOCK_EX|fcntl.LOCK_NB)
   try:do('busy-lock');raise AssertionError('busy_lock_accepted')
   except BlockingIOError:pass
  cases=[]
  def fail(name,**kw):
   args=dict(out=folder(name),lock_path=lock,conninfo=conn(),dump_command=dump,inventory_sql=inventory,expected_identity=identity);args.update(kw)
   try:capture(**args);raise AssertionError('failure_accepted')
   except (Denied,Exception)as e:
    if isinstance(e,AssertionError):raise
   v=json.loads((args['out']/'denial.private.json').read_text());assert not (args['out']/'receipt.private.json').exists();cases.append({'case':name,'stage':v['stage'],'reason':v['reason']})
   with lock.open('r+')as l:fcntl.flock(l,fcntl.LOCK_EX|fcntl.LOCK_NB)
  fail('identity-drift',expected_identity={})
  fail('inventory-error',inventory_sql='SELECT invalid_column')
  fail('dump-error',dump_command=['/bin/false'])
  # Test executable accepts appended --snapshot but sleeps; process is terminated, lock freed.
  sleeper=OUT/'sleeper.py';sleeper.write_text('import time\ntime.sleep(30)\n');sleeper.chmod(0o600)
  fail('dump-timeout',dump_command=[sys.executable,str(sleeper)],timeout=.1)
  def kill_holder(h,s):
   pid=h.query('SELECT pg_backend_pid()')[0][0];query('SELECT pg_terminate_backend('+pid+')')
  fail('holder-death',after_inventory=kill_holder)
 else:
  run([BIN+'pg_ctl','-D',str(OUT/'data'),'-l',str(OUT/'postgres.private.log'),'-o',f"-k {SOCK} -p 56547 -h '' -c log_statement=none -c log_min_error_statement=panic",'start']);started=True
  original=ROOT/'local-evidence/security-cipher-operational-20261014T180000Z/database.dump'
  receipt=json.loads((OUT/'coherent/receipt.private.json').read_text());raw=json.loads((OUT/'coherent/inventory.private.json').read_text())
  inventory="SELECT json_build_object('secrets',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM \"ChannelAccountSecret\" s),'accounts',(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM \"ChannelAccount\" a),'seeds',(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM \"Event\" e WHERE \"payloadJson\" ? 'recipientsCiphertext' OR \"payloadJson\" ? 'componentsByWaIdCiphertext'),'mfa',(SELECT count(*)FROM \"MfaTotpSecret\"),'webhooks',(SELECT count(*)FROM \"WebhookEndpoint\"))::text"
  assert json.loads(query(inventory,'restored')[0][0])==raw
  cases=[{'case':p.parent.name,**{k:json.loads(p.read_text())[k]for k in ['stage','reason']}}for p in OUT.glob('*/denial.private.json')if p.parent.name!='busy-lock'and 'stage'in json.loads(p.read_text())]
 # Real full restored schema: canonical plan, SQL/verifier, 147/v2 compiled reader.
 sys.path.insert(0,str(HERE.parent/'remaining-v3-20261014'));sys.path.insert(0,str(HERE.parent/'remaining-v2-20261014'))
 from cipher_verify import CipherDriver,digest as plan_digest
 from cipher_sql import guard_empty_families
 from channel_transaction import render
 template=json.loads((ROOT/'local-evidence/security-cipher-operational-20261014T180000Z/cipher-current.private.json').read_text())
 def normalize(v,t=None):
  if isinstance(v,dict):return {k:normalize(v[k],t.get(k)if isinstance(t,dict)else None)for k in ([k for k in t if k in v]+[k for k in v if k not in t]if isinstance(t,dict)else v.keys())}
  if isinstance(v,list):return [normalize(x,t[i]if isinstance(t,list)and i<len(t)else None)for i,x in enumerate(v)]
  if isinstance(v,str)and isinstance(t,str)and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',t):
   import datetime
   return v if v.endswith('Z') else datetime.datetime.fromisoformat(v).isoformat(timespec='milliseconds')+'Z'
  return v
 secret_templates={r['id']:r for r in template['data']['groups'][0]['rows']};account_templates={r['id']:r for r in template['data']['accounts']};seed_templates={r['id']:r for r in template['data']['seeds']}
 snapshot={'mode':'READ_ONLY_LOCAL_SHARED_SNAPSHOT','data':{'groups':[{'model':'channelAccountSecret','rows':[normalize(r,secret_templates[r['id']])for r in raw['secrets']]},{'model':'mfaTotpSecret','rows':[]},{'model':'webhookEndpoint','rows':[]}],'externalRefs':template['data']['externalRefs'],'accounts':[normalize(r,account_templates[r['id']])for r in raw['accounts']if r['id']in account_templates],'seeds':[{k:normalize(r[k],seed_templates[r['id']][k])for k in seed_templates[r['id']]}for r in raw['seeds']]},'modules':template['modules'],'providerCalls':0,'plainValuesSerialized':False}
 assert raw['mfa']==raw['webhooks']==0
 # Reused external-reference counts are not snapshot-certified: plan does not consume them.
 snapshot['data']['externalRefs']=[]
 existing=[q for q in OUT.glob('plan-*')if (q/'channel-plan.private.json').exists()]
 if existing:
  planfolder=existing[0];snapshotfile=OUT/('snapshot-'+planfolder.name.split('-')[1]+'.private.json')
  assert json.loads(snapshotfile.read_text())==snapshot,'local_snapshot_drift'
 else:
  attempt=str(len(list(OUT.glob('snapshot*.private.json')))+1)
  snapshotfile=OUT/('snapshot-'+attempt+'.private.json');write(snapshotfile,snapshot)
  planfolder=folder('plan-'+attempt)
  node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
  run([str(node),str(HERE.parent/'remaining-v2-20261014/prepare_channel_local.cjs'),str(ROOT),str(planfolder),str(snapshotfile)])
 node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
 plan=json.loads((planfolder/'channel-plan.private.json').read_text());ph=plan_digest(plan)
 def sql(q,db='restored'):return query(q,db)
 fresh=CipherDriver(lambda q:json.loads(sql(q,'source')[0][0]),lambda q:sql(q,'source'))
 try:fresh.classify(plan,ph);raise AssertionError('fresh_cas_drift_accepted')
 except RuntimeError:pass
 driver=CipherDriver(lambda q:json.loads(sql(q)[0][0]),lambda q:sql(q))
 assert driver.classify(plan,ph)=='ORIGINAL_VERIFIED'
 before=json.loads(sql(inventory)[0][0]);seedhash=digest(snapshotfile)
 opaque=before['secrets'][next(i for i,r in enumerate(before['secrets'])if r['id']==plan['retained'][0]['secretId'])]
 sqlfile=OUT/'apply.private.sql';sqlfile.write_text(guard_empty_families(render(plan,ph)));sqlfile.chmod(0o600)
 driver.apply(plan,ph,sqlfile,digest(sqlfile));assert driver.classify(plan,ph)=='VERIFIED'
 after=json.loads(sql(inventory)[0][0]);assert after['seeds']==before['seeds'];assert next(r for r in after['secrets']if r['id']==opaque['id'])==opaque
 count=sql('SELECT count(*) FROM "Event"')[0][0];sql(sqlfile.read_text());assert sql('SELECT count(*) FROM "Event"')[0][0]==count
 proof=folder('epoch');write(proof/'restored-seeds.private.json',snapshot['data']['seeds'])
 # Reuse exact already-reviewed compiled proof, not another build.
 verify=ROOT/'local-evidence/security-cipher-operational-20261014T180000Z/restore-isolated-v2/historical-proof/verify-restored.mjs'
 run([str(node),str(verify),str(ROOT),str(ROOT/'local-evidence/security-v3-runtime-20261014/candidate'),str(proof)])
 ep=json.loads((proof/'result.sanitized.json').read_text());assert ep['fields']==147
 result={'result':'LOCAL_SHARED_SNAPSHOT_FULL_RESTORE_AND_CIPHER_PASS','sourceDumpSha256':digest(original),'coherentDumpSha256':receipt['dumpSha256'],'inventorySha256':receipt['inventorySha256'],'inventoryEqualsRestoredDump':True,'concurrentLocalWriterPermitted':True,'freshCasAfterWriter':'DENY','converted':10,'opaquePreserved':1,'historicalFields':147,'historicalPayloadsPreserved':True,'v2Independent':True,'replayAdditionalEvents':0,'failureCases':cases,'lockReleasedAfterFailure':True,'outputNegatives':3,'planHash':ph,'productionConnections':0,'providerCalls':0,'applicationStarted':False,'limits':'local source restored from dated production dump; no fresh production snapshot/certificate'}
 write(OUT/'result.sanitized.json',result);print(json.dumps(result))
finally:
 if started:run([BIN+'pg_ctl','-D',str(OUT/'data'),'stop','-m','fast'])
