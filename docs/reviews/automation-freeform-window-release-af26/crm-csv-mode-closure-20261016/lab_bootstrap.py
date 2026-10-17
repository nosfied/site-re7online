"""TEST ONLY: real bootstrap/Loader; root metadata/query/sudo replaced by lab reply.
No root install/emission. Called in real isolated local Python subprocesses.
"""
import hashlib,json,sys,types
from pathlib import Path

def main(state_path,args):
    state=json.loads(Path(state_path).read_text());library=Path(state['library'])
    modules={}
    def trusted(name):
        raw=(library/(name+'.py')).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==state['libraries'][name]
        m=types.ModuleType(name);m.__file__=str(library/(name+'.py'));sys.modules[name]=m
        exec(compile(raw,m.__file__,'exec'),m.__dict__);modules[name]=m
        if name=='authority':
            original=m.Context
            class LabContext(original):
                def __init__(self,**kw):
                    # Same real Context validation; root reply is explicitly synthetic.
                    super().__init__(lambda:json.dumps(json.loads(Path(state_path).read_text())['bundle']))
            m.Context=LabContext
        return m
    b=types.ModuleType('real_bootstrap')
    raw=(library/'bootstrap.py').read_bytes()
    assert hashlib.sha256(raw).hexdigest()==state['libraries']['bootstrap']
    exec(compile(raw,str(library/'bootstrap.py'),'exec'),b.__dict__)
    b.trusted_library=trusted
    result=b.main(args)
    if result is not None:print(json.dumps(result,sort_keys=True))
if __name__=='__main__':main(sys.argv[1],sys.argv[2:])
