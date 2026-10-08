"""Directed return adapter proof; real Node classifier, Docker read effect simulated.
Usage: python3 test_waiting_return.py ATTESTED_ORIGINAL_TEMPLATE PRODUCER_CAPTURE NODE20
PRODUCER_CAPTURE is waiting-work.private.json from the isolated scheduling proof.
"""
import hashlib, importlib.util, json, pathlib, shutil, subprocess, sys, tempfile
from unittest.mock import patch
here=pathlib.Path(__file__).resolve().parent
origin=pathlib.Path(sys.argv[1]);capture=pathlib.Path(sys.argv[2]);node=pathlib.Path(sys.argv[3]).resolve()
manifest=json.loads((here/'waiting-return-v4-manifest.json').read_text())
assert hashlib.sha256(origin.read_bytes()).hexdigest()==manifest['originSha256']
expected=json.loads(capture.read_text());assert expected['groups'][0]['status']=='scheduled' and expected['jobs'][0]['status']=='queued' and expected['jobs'][0]['attempt']==0
with tempfile.TemporaryDirectory(prefix='waiting-return-proof-') as tmp:
 root=pathlib.Path(tmp);(root/'window').mkdir();(root/'return').mkdir()
 target=root/'window/prepare_post_unfence_return.py';shutil.copyfile(origin,target)
 subprocess.run(['patch','--batch','-p1','-i',str(here/'waiting-return-v4.patch')],cwd=root,check=True,stdout=subprocess.DEVNULL)
 assert hashlib.sha256(target.read_bytes()).hexdigest()==manifest['resultSha256']
 for n in ('preparation-bindings.cjs','waiting-work.cjs'):shutil.copyfile(here/n,root/'return'/n)
 (root/'window/waiting-work.private.json').write_text(json.dumps(expected))
 sys.path.insert(0,str(here.parent/'v4-sequencer'))
 spec=importlib.util.spec_from_file_location('effective_return',target);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 assert 'waiting-work.cjs' in mod.STATIC
 original_output=subprocess.check_output;original_run=subprocess.run
 current={k:expected[k] for k in ('jobs','groups','leases','sendingScheduled')}|{'flags':[],'connected':[],'auth':[]}
 docker_calls=[]
 def output(cmd,*a,**kw):
  if cmd[0]=='docker':
   assert cmd[:3]==['docker','exec','synthetic-container'];assert 'BEGIN READ ONLY' in cmd[-1] and 'statement_timeout=10000' in cmd[-1] and '"CampaignExecutionJob"' in cmd[-1];docker_calls.append(cmd);return json.dumps(current)
  assert cmd[0]=='/usr/bin/node';return original_output([str(node),*cmd[1:]],*a,**kw)
 def run(cmd,*a,**kw):
  assert cmd[0] in ('/usr/bin/node',str(node))
  if 'stdout' not in kw:kw['capture_output']=True
  return original_run([str(node),*cmd[1:]],*a,**kw)
 with patch.object(mod.subprocess,'check_output',output),patch.object(mod.subprocess,'run',run):
  assert mod.read_waiting_inventory(root,'synthetic-container','synthetic','synthetic')==current
  for mutate in ('lease','running','unknown'):
   current=json.loads(json.dumps(current))
   if mutate=='lease':current['leases']=1
   elif mutate=='running':current['leases']=0;current['jobs'][0]['status']='running'
   else:current['jobs'][0]['status']='queued';current['jobs'][0]['clientId']='unknown'
   try:mod.read_waiting_inventory(root,'synthetic-container','synthetic','synthetic');raise AssertionError('negative_accepted')
   except subprocess.CalledProcessError:pass
 assert len(docker_calls)==4
 print(json.dumps({'result':'PASS','checks':4,'actual':'patched return reader + real Node20 SQL export/classifier + isolated producer capture','simulated':'Docker read command only','noStarts':True,'noProviders':True,'postUnfenceGenerationNotExecuted':True}))
