"""Test-only trace around the previous real-bootstrap laboratory adapter."""
import importlib.util,json,sys
from pathlib import Path

def main():
 state=Path(sys.argv[1]);v=json.loads(state.read_text());root=Path(v['bundle']['anchor']['preparation'])
 def audit(event,args):
  if event=='exec'and args:
   name=getattr(args[0],'co_filename','')
   if str(name).startswith(str(root)+'/'):
    relative=str(Path(name).relative_to(root))
    if relative.split('/')[0]in ('switch','return','return-partial'):raise RuntimeError('CANDIDATE_EXEC_FORBIDDEN')
    with Path(v['trace']).open('a')as f:f.write(json.dumps({'python':relative})+'\n')
 sys.addaudithook(audit)
 source=Path(__file__).resolve().parent.parent/'crm-csv-mode-closure-20261016/lab_bootstrap.py'
 spec=importlib.util.spec_from_file_location('previous_lab_bootstrap',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 module.main(str(state),sys.argv[2:])
if __name__=='__main__':main()
