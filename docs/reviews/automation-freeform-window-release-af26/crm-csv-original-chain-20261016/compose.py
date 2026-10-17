"""Reuse exact previous/B4 pipeline. No operational data or permits in kit."""
import hashlib,json,subprocess,sys,types
from pathlib import Path
import delta
HERE=Path(__file__).resolve().parent;REVIEW=HERE.parent;REPO=HERE.parents[3]
BASE='d999ad969e66aa020a06593faba334a30d5eb292'

def source(name):
 p=REVIEW/'crm-csv-mode-closure-20261016'/name
 raw=subprocess.check_output(['git','show',BASE+':'+str(p.relative_to(REPO))],cwd=REPO)
 if p.read_bytes()!=raw:raise RuntimeError('prior_source_drift:'+name)
 return p,raw

def compose():
 ip,ir=source('integration.py');i=types.ModuleType('prior_delta');exec(compile(ir,str(ip),'exec'),i.__dict__)
 cp,cr=source('compose.py');old=sys.modules.get('integration');sys.modules['integration']=i
 try:
  c=types.ModuleType('prior_composition');c.__file__=str(cp);exec(compile(cr,str(cp),'exec'),c.__dict__)
 finally:
  if old is None:sys.modules.pop('integration',None)
  else:sys.modules['integration']=old
 def combined(code,origins):i.apply(code,origins);delta.apply(code,origins)
 c.integration=types.SimpleNamespace(apply=combined,replace=i.replace)
 # Same prior composer interface, exact B4 pipeline; new transform before scan.
 plan,objects=c.compose()
 plan['compositionBase']=BASE
 plan['integrationBlocks']=[]
 plan['certification']='DENY_OPERATIONAL_INPUTS'
 plan['originalClosureCriterion']='Executable candidate code absent; sealed four-mode data and switch exit evidence retained. Synthetic complete-chain proof required, not operational certification.'
 plan['transformInputs'][str((HERE/'delta.py').relative_to(REPO))]={'commit':None,'sha256':hashlib.sha256((HERE/'delta.py').read_bytes()).hexdigest(),'authority':'review only, not phase authority'}
 return plan,objects

def write(out):
 out=Path(out)
 if out.exists():raise RuntimeError('new_static_destination_required')
 plan,objects=compose();out.mkdir();(out/'objects').mkdir()
 for h,raw in objects.items():(out/'objects'/(h+'.source')).write_bytes(raw)
 for name,v in [('COMPOSITION.json',plan),('MISSING_INPUTS.json',{'result':plan['certification'],'inputs':plan['missingInputs'],'integrationBlocks':plan['integrationBlocks']})]:
  (out/name).write_text(json.dumps(v,sort_keys=True,indent=2)+'\n')
 return plan
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();v=write(a.out);print(v['paths'],v['uniqueContents'])
