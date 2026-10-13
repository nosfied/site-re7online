"""Fresh READ ONLY post-withdrawal inspection, including DENY/partial/timeout.
Never invokes the withdrawal runner; preserves its intent and diagnostics.
"""
import importlib.util,pathlib,json,argparse,hashlib,os,time,subprocess
spec=importlib.util.spec_from_file_location('w',pathlib.Path(__file__).with_name('withdraw-reviewed.py'));w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
a=argparse.ArgumentParser();a.add_argument('--plan',required=True);a.add_argument('--plan-sha256',required=True);v=a.parse_args();p=pathlib.Path(v.plan);raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==v.plan_sha256,'input_drift';plan=json.loads(raw);assert os.geteuid()==0,'root_read_required'
out={'at':time.time(),'removalExecutedByThisReader':False,'paths':[]}
try:
 w.validate_state(plan);out['principalSha256']=w.digest(plan['main']['path']);assert out['principalSha256']==plan['main']['sha256'],'principal_drift'
 for x in plan['archives']:out['paths'].append({'path':x,'exists':os.path.lexists(x)})
 cache=w.cache_inventory(w.CACHE);out['cacheRootPreserved']=w.CACHE in cache;out['cacheEntries']=len(cache);out['samples']=[w.owners(plan),w.owners(plan)];out['minimumAvailableBytes']=w.capacity()
 r=subprocess.run(['curl','--fail','--max-time','5','--silent','--show-error','http://127.0.0.1:3001/health'],capture_output=True,timeout=10);out['healthCode']=r.returncode;out['healthSha256']=hashlib.sha256(r.stdout).hexdigest()
 out['result']='POST_READ_COMPLETE'if all(not x['owners']and not x['incomplete']for x in out['samples'])and r.returncode==0 else'POST_DENY'
 out['capacityPass']=out['minimumAvailableBytes']>=plan['requiredPostFreeBytes'];out['withdrawalComplete']=all(not x['exists']for x in out['paths'])and out['cacheEntries']==1
except Exception as e:out.update(result='POST_DENY',errorClass=type(e).__name__)
w.exclusive_json(p.parent/'post-readonly.private.json',out)
print(json.dumps({k:out.get(k)for k in ('result','withdrawalComplete','capacityPass','minimumAvailableBytes','cacheRootPreserved','removalExecutedByThisReader')}));raise SystemExit(0 if out['result']=='POST_READ_COMPLETE'else 1)
