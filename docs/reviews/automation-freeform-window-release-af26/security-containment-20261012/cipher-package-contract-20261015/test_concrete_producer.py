"""Negative producer proofs with actual private capture/donor, not empty references."""
import copy,json,sys,tempfile
from pathlib import Path
from prepare_generation import prepare,GEN
source=Path(sys.argv[1]);obs=json.loads(Path(sys.argv[2]).read_text());cases=[]
for field,change in [('mode',None),('uid',None),('sha256',None),('path',None),('uid',99999),('sha256','0'*64),('path','/wrong-reference'),('type','symlink'),('nlink',2)]:
 bad=copy.deepcopy(obs)
 if change is None:del bad['entries'][0][field]
 else:bad['entries'][0][field]=change
 with tempfile.TemporaryDirectory()as d:
  d=Path(d);p=d/'capture.private.json';p.write_text(json.dumps(bad));p.chmod(0o600);target=d/GEN
  try:prepare(source,target,p);raise AssertionError('incomplete_candidate_accepted')
  except RuntimeError:assert not target.exists(),'copy_started_before_denial'
 cases.append(field+('_missing'if change is None else'_divergent'))
print(json.dumps({'result':'CONCRETE_PRODUCER_NEGATIVES_PASS','cases':cases,'candidateCopyStarted':False}))
