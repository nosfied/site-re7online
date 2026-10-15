"""Complete private profiles and actual affected post-return copy loop; no production effects."""
import ast,hashlib,json,shutil,sys,tempfile
from pathlib import Path
p=Path(sys.argv[1]);o=Path(sys.argv[2]);checks=0
for mode in ('switch','return','return-partial','return-before-commit'):
 for variant in ('candidate','return'):
  a=json.loads((p/mode/(variant+'.config.private.json')).read_text())['apps'];b=json.loads((o/mode/(variant+'.config.private.json')).read_text())['apps'];assert len(a)==len(b)==3
  for x,y in zip(a,b):
   for k in ['ADMIN_TOKEN','APP_AUTH_SECRET','DATABASE_URL','WHATSAPP_WEB_WORKER_CONTROL_TOKEN']:assert x['env'].get(k)==y['env'].get(k);checks+=1
   assert x['cwd']!='/opt/re7online/site-re7online/apps/whatsapp-agent'
assert (p/'runtime-inventory.private.json').read_bytes()==(o/'runtime-inventory.private.json').read_bytes()
for n in ['deploy.crontab.before','deploy.crontab.window','re7-converta-backup.before','re7-converta-backup.window']:assert(p/'window'/n).read_bytes()==(o/'window'/n).read_bytes()
t=ast.parse((p/'window/prepare_compatible_post_return.py').read_text());fn=next(n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='prepare');loop=next(n for n in fn.body if isinstance(n,ast.For)and isinstance(n.target,ast.Name)and n.target.id=='name')
with tempfile.TemporaryDirectory()as tmp:
 w=Path(tmp)/'window';w.mkdir(mode=0o700)
 exec(compile(ast.Module(body=[loop],type_ignores=[]),'<actual-post-return-copy-loop>','exec'),{'original':p,'window':w,'shutil':shutil})
 assert(w/'scheduled_controls.py').read_bytes()==(p/'window/scheduled_controls.py').read_bytes()
 assert all(f.stat().st_mode&0o777==0o600 for f in w.iterdir())
print(json.dumps({'result':'INDEPENDENCE_AND_POST_RETURN_DEPENDENCY_PASS','cases':2,'authDatabaseComparisons':checks,'runtimeInventoryUnchanged':True,'cronBytesUnchanged':True,'actualPostReturnCopyLoop':True,'fullPostUnfencePreparationNotExercised':True,'productionEffects':False}))
