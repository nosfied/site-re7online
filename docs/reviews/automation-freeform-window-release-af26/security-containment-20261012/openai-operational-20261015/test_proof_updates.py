"""Unchanged canonical updater composed with actual new four-mode files; clock is injected."""
import copy,datetime,importlib.util,json,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();sys.path.insert(0,str(P/'window'));from openai_contract import check
spec=importlib.util.spec_from_file_location('canonical_updates_test',P/'window/canonical_renew_proofs.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=json.loads((P/'window/backup-compatibility.private.json').read_text());when=datetime.datetime.fromisoformat(base['startedUtc'])+datetime.timedelta(seconds=1)
class Clock(datetime.datetime):
 @classmethod
 def now(cls,tz=None):return when
cases=[]
for case in ('four_modes','expired','schema','catalog'):
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p);r=copy.deepcopy(base)
  if case=='schema':r['schemaDigest']='0'*64
  elif case=='catalog':r['catalogObjects']+=1
  elif case=='expired':r['startedUtc']=(when-datetime.timedelta(seconds=3601)).isoformat()
  with patch.object(m.datetime,'datetime',Clock):
   try:
    updates=m.updates(p,r);assert case=='four_modes'
    for n,data in updates.items():(p/n).write_bytes(data)
    check(p,live=False)
   except RuntimeError:assert case!='four_modes'
  cases.append({'case':case,'passed':True})
print(json.dumps({'result':'FOUR_MODE_CANONICAL_PROOF_UPDATE_COMPOSITION_PASS','caseCount':len(cases),'cases':cases,'clockInjectedNotFreshRpo':True,'newBackupExecuted':False,'productionEffects':False}))
