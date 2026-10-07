"""Injected contract negatives, not Linux permission/socket behavior."""
import copy,importlib.util,json,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('effective_checker',sys.argv[1]);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
d={'pid':10,'ticks':'1'};own={'pid':20,'ticks':'2','parent':10,'group':10,'state':'S'};reader={'pid':21,'ticks':'3','parent':20,'group':10,'state':'R'}
base={'finishedMonotonic':time.monotonic(),'effectivePolicy':{'daemon':d},'samples':[]}
for _ in range(2):base['samples'].append({'listeners':[],'daemonFd0':'socket:[123]','network':{'123':{'kind':'unix','state':'03','type':'0001','flags':'00000000'}},'owners':{'123':[{'pid':10,'ticks':'1','fd':'0','state':'S'},{'pid':20,'ticks':'2','fd':'0','state':'S'}]},'processes':[{**own,'roles':['candidate']},{**reader,'roles':['candidate']}]})
g.current_boot_observed(base,own,reader);results=[{'case':'current identities + daemon stdin sharing','result':'PASS','evidence':'synthetic fixture'}]
cases=[('additional owner','supervision_additional_socket_owner',lambda s:s['owners']['123'].append({'pid':99,'ticks':'9','fd':'0','state':'S'})),('listener','supervision_current_listener_survived',lambda s:s['listeners'].append('999')),('executor','supervision_current_executor_survived',lambda s:s['processes'].append({'pid':99,'ticks':'9','parent':10,'group':10,'state':'S','roles':['source']})),('descendant','supervision_launcher_descendant_survived',lambda s:s['processes'].append({'pid':99,'ticks':'9','parent':20,'group':99,'state':'S','roles':[]})),('missing reader','supervision_observer_unobserved',lambda s:s['processes'].pop()),('reused pid','supervision_observer_identity_drift',lambda s:s['processes'][0].update(ticks='1000')),('zombie','supervision_observer_identity_drift',lambda s:s['processes'][0].update(state='Z')),('duplicate','observation_duplicate_process',lambda s:s['processes'].append(s['processes'][0]))]
for label,reason,change in cases:
 v=copy.deepcopy(base);change(v['samples'][1])
 try:g.current_boot_observed(v,own,reader);raise AssertionError('negative admitted')
 except RuntimeError as e:assert str(e)==reason,str(e)
 results.append({'case':label,'result':'DENY','reason':reason,'evidence':'injected fixture; effective classifer'})
print(json.dumps(results,indent=2))
# A separate simulated subprocess test exercises the actual new client logger.
import tempfile,subprocess
spec=importlib.util.spec_from_file_location('effective_client',Path(__file__).parent/'permanent_observation_client.py');client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);(p/'permanent-observer-binding.private.json').write_text(json.dumps({'policy':{},'policySha256':'x','helperSha256':'y'}));calls=[]
 def denied(cmd,**kwargs):
  calls.append((cmd,kwargs));return subprocess.CompletedProcess(cmd,7,stdout='simulated stdout',stderr='simulated denial')
 client.subprocess.run=denied
 try:client.read(p,{});raise AssertionError('failed call admitted')
 except RuntimeError as e:assert str(e).startswith('permanent_reader_denied:')
 q=next((p/'permanent-observer-private').glob('*.json'));v=json.loads(q.read_text())
 assert q.stat().st_mode&0o777==0o600 and v=={'stdout':'simulated stdout','stderr':'simulated denial','exitCode':7,'timeout':False}
 assert calls[0][0]==['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/frontend-permanent-observer.py'] and calls[0][1]['cwd']=='/' and calls[0][1]['timeout']==10
 print(json.dumps({'case':'literal command + private diagnostic','result':'PASS','evidence':'subprocess simulation; actual client/logger'}))
