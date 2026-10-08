"""Post-acknowledgement read-only capture; never authorizes a window or opening."""
import argparse,hashlib,json,pathlib,subprocess,urllib.parse
parser=argparse.ArgumentParser();parser.add_argument('preparation');args=parser.parse_args()
p=pathlib.Path(args.preparation).resolve();out=p/'window/waiting-work.private.json'
assert not out.exists() and not out.is_symlink(),'waiting_capture_exists_preserve_history'
proof=subprocess.run(['python3',str(p/'run-offline.py'),'--mode=verify-receipt'],check=True,capture_output=True,text=True,timeout=40)
records=[json.loads(line)for line in proof.stdout.splitlines()if line.startswith('{')]
assert len(records)==1 and records[0]['terminal'] is True,'reconciliation_receipt_not_verified'
a=json.loads((p/'source.config.private.json').read_text())['apps'];api=next(x for x in a if x['name']=='re7-whatsapp-agent')
gfile=pathlib.Path(api['CAMPAIGN_OPERATIONS_FILE']);first=json.loads(gfile.read_text())
assert first['version']==1 and first['open'] is False and type(first['tasks']) is dict and not first['tasks'],'waiting_guard_not_drained_closed'
url=urllib.parse.urlparse(api['DATABASE_URL']);script="process.stdout.write(require(process.argv[1]).sql)"
node=json.loads((p/'candidate-manifest.private.json').read_text())['node']
sql=subprocess.check_output([node,'-e',script,str(p/'waiting-work.cjs')],text=True,timeout=10)
q=json.loads(subprocess.check_output(['docker','exec','11aaba5181fa','psql','-X','-U',urllib.parse.unquote(url.username),'-d',url.path.lstrip('/'),'-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY; SET LOCAL statement_timeout=10000; "+sql+'; ROLLBACK;'],text=True,timeout=15))
ids=json.loads((p/'planned-waiting-ids.json').read_text())
assert len(q['jobs'])==1 and q['jobs'][0]['id']==ids['jobId'] and q['jobs'][0]['clientId']==ids['clientId'],'unclassified_waiting_job'
assert len(q['groups'])==1 and q['groups'][0]['id']==ids['batchId'] and q['groups'][0]['clientId']==ids['clientId'],'unclassified_waiting_group'
assert len(q['sendingScheduled'])==1 and q['sendingScheduled'][0]['id']==ids['campaignId'] and q['sendingScheduled'][0]['clientId']==ids['clientId'],'unclassified_waiting_campaign'
expected={k:q[k]for k in ('jobs','groups','leases','sendingScheduled')}|{'version':1,'guardMustRemainClosed':True,'capturedGeneration':first['generation'],'receiptId':records[0]['receiptId']}
subprocess.run([node,'-e',"const fs=require('fs'),b=require(process.argv[1]),v=JSON.parse(fs.readFileSync(0,'utf8'));b.noWork(v,v)",str(p/'waiting-work.cjs')],input=json.dumps(expected),text=True,check=True,timeout=10)
assert json.loads(gfile.read_text())==first,'waiting_guard_changed_during_capture'
out.parent.mkdir(exist_ok=True)
with out.open('x')as f:__import__('os').chmod(out,0o600);json.dump(expected,f,sort_keys=True)
print(json.dumps({'waitingCaptureSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'generation':first['generation'],'jobs':1,'guardRemainsClosed':True}))
