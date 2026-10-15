"""Exact delegated CLI entrypoint, real source/modes/manifests, no production effects."""
import contextlib,importlib.util,io,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();sys.path[:0]=[str(P/'window'),str(P/'switch')]
import ops
cases=[]
def load(p):
 s=importlib.util.spec_from_file_location('concrete_delegated',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
for mode in ('switch','return','return-partial','return-before-commit'):
 for valid in (True,False):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/P.name;shutil.copytree(P,p);m=load(p/mode/'delegated.py')
   class System:
    def guard(self):return {'version':1,'open':False,'tasks':{},'audit':[],'generation':38}
   if not valid:(p/'window/restore-result.json').unlink()
   read=Path.read_text;build=json.loads((p/mode/'baseline.private.json').read_text())['frontendBuild'];cfg=json.loads((p/mode/'candidate.config.private.json').read_text())['apps'];front=next(a for a in cfg if a['name']=='re7-admin-front')['cwd']
   def fs_read(path,*a,**kw):
    if str(path)==front+'/.next/BUILD_ID':return build
    return read(path,*a,**kw)
   args=['delegated.py','request','preflight',str(p/mode)]
   with patch.object(Path,'read_text',fs_read),patch.object(m,'BOUND_PREPARATION',p),patch.object(m.ops,'System',System),patch.object(sys,'argv',args),contextlib.redirect_stdout(io.StringIO()):
    try:m.main();assert valid
    except FileNotFoundError:assert not valid
   assert (p/mode/'owner-request-preflight.json').exists()==valid
   cases.append({'consumer':'delegated.main request preflight','mode':mode,'validRestore':valid,'productionEffect':False})
 for method in ('prepare','enter','unfence','finish'):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/P.name;shutil.copytree(P,p);m=load(p/mode/'delegated.py');(p/'window/restore-result.json').unlink()
   class NoEffects:
    def __getattr__(self,name):raise AssertionError('system effect reached before proof: '+name)
   c=m.DelegatedControls(p/mode,NoEffects())
   try:getattr(c,method)();raise AssertionError('missing restore accepted')
   except FileNotFoundError:pass
   cases.append({'consumer':'DelegatedControls.'+method,'mode':mode,'validRestore':False,'effectsReached':False})
print(json.dumps({'result':'REAL_DELEGATED_CLI_CONTROLS_PASS','cases':cases,'caseCount':len(cases),'namespaceRelocatedOnlyForIsolatedTest':True,'productionEffects':False}))
