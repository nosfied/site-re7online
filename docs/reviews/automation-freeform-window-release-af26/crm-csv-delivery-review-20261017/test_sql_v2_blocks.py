"""Literal v2 Bash/launcher/manifest/remote byte bootstrap through real local psql.
SSH/Docker/container env are explicit laboratory adapters. No network access.
"""
import base64,hashlib,importlib.util,json,os,re,shlex,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists())
CUSTODY=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
PACKAGE=P/'sql-review-v2';h=lambda b:hashlib.sha256(b).hexdigest()
CONFIG=Path('/dev/shm/lab-config.private.json')

def adapter(kind,args):
 c=json.loads(CONFIG.read_bytes());r=Path(c['lab']);material=r/'shm/re7-csv-sql-material-20261017-v2'
 frame=json.loads((material/'bundle.private.json').read_bytes())
 blobs={n:base64.b64decode(v,validate=True)for n,v in frame['files'].items()}
 if kind=='ssh':
  assert args[:-1]==['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy@admin.re7online.com']
  command=shlex.split(args[-1]);assert command[:5]==['/usr/bin/python3','-B','-I','-S','-c']
  assert command[-2:]==[frame['manifestSha256'],'collect']
  raw=sys.stdin.buffer.read();assert json.loads(raw)==frame
  with open(r/'ssh-calls','a')as f:f.write('1\n')
  # Execute exactly the fixed remote byte bootstrap carried in the delivered command.
  result=subprocess.run(command,input=raw,capture_output=True,timeout=45)
  out=result.stdout if c['case']!='partial'else result.stdout[:37]
  sys.stdout.buffer.write(out);sys.stderr.buffer.write(result.stderr)
  return result.returncode if c['case']!='partial'else 1
 expected=json.loads(blobs['channel.private.json'])
 if args[0]=='inspect':
  with open(r/'channel-calls','a')as f:f.write('route\n')
  sys.stdout.buffer.write(json.dumps(expected['route']).encode());return 0
 assert args[0]=='exec'
 if args[-2:]==['-c','command -v psql']:
  sys.stdout.buffer.write(base64.b64decode(expected['clientPathBase64']));return 0
 if args[-1]=='--version':
  sys.stdout.buffer.write(base64.b64decode(expected['clientVersionBase64']));return 0
 # Same exact Docker assignment semantics as the13 accepted tests. Do not rebuild psql argv.
 env={'PATH':'/usr/bin:/bin','HOME':str(r),'LANG':'C','PGSERVICE':'conflict',
      'PGHOST':'invalid.invalid','PGHOSTADDR':'192.0.2.1','PGPORT':'1',
      'PGDATABASE':'wrong_database','PGUSER':'wrong_role','PGOPTIONS':'-c transaction_read_only=off',
      'PGSSLMODE':'invalid','PGGSSENCMODE':'invalid','PGTARGETSESSIONATTRS':'read-write',
      'PGCLIENTENCODING':'invalid','PGDATESTYLE':'invalid','PGTZ':'invalid'}
 assert args[1]=='-i';i=2;overrides={}
 while args[i]=='-e':
  k,sep,v=args[i+1].partition('=');assert sep=='='and k not in overrides
  env[k]=v;overrides[k]=v;i+=2
 assert overrides=={'PGHOST':'','PGHOSTADDR':'','PGPORT':'5432','PGSERVICE':'','PGSERVICEFILE':'/dev/null','PGPASSFILE':'/dev/null','PGPASSWORD':'','PGOPTIONS':'','PGCONNECT_TIMEOUT':'3'}
 assert args[i]==expected['route']['Id'];tail=args[i+1:]
 assert tail[:3]==['/bin/sh','-c',tail[2]]and tail[2].startswith('unset PGSERVICE ')
 # Explicit lab-only endpoint mapping, ALL other environment options/tail remain intact.
 assert(env['PGHOST'],env['PGHOSTADDR'],env['PGPORT'])==('','','5432')
 env.update(PGHOST=c['socket'],PGPORT='56438')
 sql=sys.stdin.buffer.read();names=[n for n in('identity','ownership','imports')if blobs[n+'.sql']==sql];assert len(names)==1
 with open(r/'sql-calls','a')as f:f.write(names[0]+'\n')
 result=subprocess.run(tail,input=sql,env=env,capture_output=True,timeout=25)
 sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);return result.returncode

if __name__=='__main__'and len(sys.argv)>1 and sys.argv[1]in('--ssh','--docker'):
 raise SystemExit(adapter(sys.argv[1][2:],sys.argv[2:]))

# Reuse the accepted PG fixture only; do not run or rewrite its13 proofs.
f=P/'test_sql_libpq.py';raw=f.read_bytes();assert h(raw)=='95a97fce357bcff8749eb1007cee14669bb077c35193ad138cf8712cbe7d5831'
spec=importlib.util.spec_from_file_location('accepted_libpq_fixture',f);fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
class Blocks(fixture.LibpqCommand):
 def exercise_blocks(self,case):
  self.sql('TRUNCATE "Event";')
  self.sql("INSERT INTO \"Event\" VALUES(1,'T','R','crm.contact.import.started','{\"operationId\":\"O\"}'),(2,'T','R','crm.contact.import.finished','{\"operationId\":\"O\",\"status\":\"COMPLETED\"}');")
  old=os.umask(0o077)
  try:
   with tempfile.TemporaryDirectory(prefix='re7-sql-v2-blocks-')as td:
    r=Path(td)
    for n in('shm','custody','bin'):(r/n).mkdir(mode=0o700)
    # Original legitimate observation, unchanged bytes/time provenance; never an updated capture.
    source=r/'custody/csv-directed-diagnostic-20261017-v1';source.mkdir(mode=0o700)
    raw=(CUSTODY/'csv-directed-diagnostic-20261017-v1/capture.private.jsonl').read_bytes()
    self.assertEqual(h(raw),'f6873eb97f5a70709675ad16b8b4879ff1a1953dc58464c704a80e735b5af8d5')
    (source/'capture.private.jsonl').write_bytes(raw)
    (r/'shm/lab-config.private.json').write_text(json.dumps({'lab':td,'socket':str(self.sock),'case':case}))
    for name in('ssh','docker'):
     f=r/'bin'/name;f.write_text('#!/usr/bin/python3\nimport os,sys\nos.execv("/usr/bin/python3",["python3",'+repr(str(Path(__file__).resolve()))+',"--'+name+'",*sys.argv[1:]])\n');f.chmod(0o700)
    commands=re.findall(r'```bash\n(.*?)```',(P/'SQL_V2_COMMANDS_FOR_REVIEW.md').read_text(),re.S);self.assertEqual(len(commands),2)
    prefix=['bwrap','--die-with-parent','--unshare-user','--uid','1000','--gid','1000','--cap-drop','ALL','--unshare-net','--ro-bind','/','/','--bind',str(r),str(r),'--bind',str(r/'shm'),'/dev/shm','--bind',str(r/'custody'),str(CUSTODY),'--ro-bind',str(r/'bin/docker'),'/usr/bin/docker','--chdir',str(ROOT)]
    env=dict(os.environ,PATH=str(r/'bin')+':/usr/bin:/bin',PYTHONDONTWRITEBYTECODE='1')
    if case=='source':
     bad=r/'bad-runner';bad.write_text('ADULTERATED_SYNTHETIC_SOURCE');prefix+=['--ro-bind',str(bad),str(PACKAGE/'runner.py')]
    a=subprocess.run(prefix+['/bin/bash','-c',commands[0]],capture_output=True,env=env,timeout=25)
    launch=r/'custody/csv-sql-launcher-20261017-v2-materialize/privileged-output.private.jsonl'
    self.assertEqual(json.loads(launch.read_text())['exitCode'],a.returncode)
    if case=='source':
     self.assertNotEqual(a.returncode,0);self.assertFalse((r/'ssh-calls').exists())
     return {'case':case,'materializeExit':a.returncode,'collectNotInvoked':True,'noSsh':True}
    self.assertEqual(a.returncode,0,a.stdout.decode()+a.stderr.decode())
    bundle=r/'shm/re7-csv-sql-material-20261017-v2/bundle.private.json';frame=json.loads(bundle.read_bytes())
    packaged=base64.b64decode(frame['files']['runner.py']);self.assertEqual(packaged,(PACKAGE/'runner.py').read_bytes())
    self.assertTrue(packaged.startswith((ROOT/'scripts/crm_csv_diagnostic/sql_execution.source').read_bytes()))
    if case=='bundle':frame['files']['runner.py']='YWR1bHRlcmF0ZWQ=';bundle.write_text(json.dumps(frame))
    b=subprocess.run(prefix+['/bin/bash','-c',commands[1]],capture_output=True,env=env,timeout=55)
    folder=r/'custody/csv-sql-read-20261017-v2';rows=[json.loads(x)for x in(folder/'privileged-output.private.jsonl').read_text().splitlines()];receipt=json.loads((folder/'sequencer.journal.jsonl').read_text())
    self.assertEqual(json.loads((r/'custody/csv-sql-launcher-20261017-v2-collect/privileged-output.private.jsonl').read_text())['exitCode'],b.returncode)
    for k in('stdout','stderr'):
     data=(folder/('transfer.'+k+'.private')).read_bytes();self.assertEqual(h(data),rows[0][k+'Sha256']);self.assertEqual(len(data),rows[0][k+'Bytes'])
    if case=='valid':
     self.assertEqual(b.returncode,0,b.stdout.decode()+b.stderr.decode());self.assertTrue(receipt['gatePass'])
     captured=(folder/'capture.private.jsonl').read_bytes();self.assertEqual(captured,(r/'shm/re7-csv-sql-read-20261017-v2/privileged-output.private.jsonl').read_bytes())
     entries=[json.loads(x)for x in captured.splitlines()];self.assertEqual(entries[-1]['result'],'THREE_READONLY_SQLS_PRESERVED')
     self.assertEqual(len([x for x in entries if x['event']=='SQL_CHANNEL_REVALIDATED']),4)
     self.assertEqual((r/'sql-calls').read_text().splitlines(),['identity','ownership','imports'])
    else:
     self.assertNotEqual(b.returncode,0);self.assertFalse(receipt.get('gatePass',False));self.assertFalse((folder/'capture.private.jsonl').exists())
     if case=='bundle':self.assertFalse((r/'ssh-calls').exists())
     if case=='partial':self.assertEqual((r/'ssh-calls').read_text().splitlines(),['1']);self.assertEqual((folder/'transfer.stdout.private').stat().st_size,37)
    return {'case':case,'materializeExit':a.returncode,'collectExit':b.returncode,'literalBlocks':True,'manifestSha256':h((PACKAGE/'MANIFEST.json').read_bytes()),'runnerSha256':h(packaged),'custody':receipt['event'],'sshAttempts':len((r/'ssh-calls').read_text().splitlines())if(r/'ssh-calls').exists()else 0,'localNetworkNamespace':True}
  finally:os.umask(old)
 def test_v2_valid(self):RESULTS.append(self.exercise_blocks('valid'))
 def test_v2_source_denied(self):RESULTS.append(self.exercise_blocks('source'))
 def test_v2_bundle_denied(self):RESULTS.append(self.exercise_blocks('bundle'))
 def test_v2_partial_preserved(self):RESULTS.append(self.exercise_blocks('partial'))
RESULTS=[]
if __name__=='__main__':
 names=['test_v2_valid','test_v2_source_denied','test_v2_bundle_denied','test_v2_partial_preserved']
 result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(Blocks(n)for n in names))
 if result.wasSuccessful():(P/'SQL_V2_PROOFS.json').write_text(json.dumps({'base':'c5b6dbc4acbd09d609a0bc71beb1f925b6bcb91e','tests':result.testsRun,'cases':RESULTS,'reused':'13 unchanged SQL_LIBPQ_PROOFS.json cases, not rerun','real':'literal Bash blocks, launcher/manifest/full materialization, exact verified remote bootstrap/runner, /bin/sh/psql/PostgreSQL16, SQL validators, export/ingest/private_record, namespace UID1000','simulated':'SSH and Docker inspect/exec with recorded channel fixture; PGHOST/PGPORT endpoint mapping only; recorded psql path/version; partial-response injection','noVps':True,'ownership':'UNKNOWN','status':'LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY'},indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
