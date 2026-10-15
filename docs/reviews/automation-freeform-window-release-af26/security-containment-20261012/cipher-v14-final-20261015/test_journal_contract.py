import copy,importlib.util,json,shutil,sys,tempfile
from pathlib import Path
import refresh_v2
source=Path(sys.argv[1]);observed=Path(sys.argv[2]);count=0
with tempfile.TemporaryDirectory()as tmp:
 p=Path(tmp)/source.name;shutil.copytree(source,p)
 idx=json.loads((p/'package-index.private.json').read_text())
 for n in refresh_v2.JOURNALS:shutil.copy2(observed/Path(n).name,p/n)
 result=refresh_v2.validate_source(p,idx,source);assert all(x['appendRecords']==1 for x in result);count+=1
 for path,kind in [('window/sequencer.journal.jsonl','prefix'),('window/sequencer.journal.jsonl','partial'),('switch/ops.py','code'),('window/sequencer.journal.jsonl','foreign_action')]:
  f=p/path;raw=f.read_bytes();f.write_bytes(b'corrupt\n'+raw if kind=='prefix'else raw+b'{'if kind=='partial'else raw+b'{"event":"privileged_result","action":"start","exitCode":0}\n'if kind=='foreign_action'else raw+b'\n')
  try:refresh_v2.validate_source(p,idx,source);raise AssertionError('drift admitted')
  except(AssertionError,ValueError)as e:assert str(e)!='drift admitted'
  f.write_bytes(raw);count+=1
print(json.dumps({'result':'EXACT_JOURNAL_PREFIX_AND_IMMUTABLE_NEGATIVES_PASS','cases':count,'productionEffects':False}))
