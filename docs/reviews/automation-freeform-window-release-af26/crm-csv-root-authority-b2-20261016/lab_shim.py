"""Synthetic root/sudo adapter for real local subprocess tests, never installed.
The test renders CONFIG as a literal into a temporary copy of this script.
"""
import json
import os
from pathlib import Path
import sys
import types
CONFIG = None

def log(event, **more):
    with (Path(CONFIG['lab'])/'processes.jsonl').open('a') as stream:
        stream.write(json.dumps(dict(event=event,pid=os.getpid(),ppid=os.getppid(),**more))+'\n')

def main(argv):
    import importlib.util
    import hashlib
    from unittest.mock import patch
    from contextlib import ExitStack
    library=Path(CONFIG['library']);state=Path(CONFIG['lab'])/'root-state.json'
    path=library/'bootstrap.py'
    spec=importlib.util.spec_from_file_location('lab_real_bootstrap',path)
    bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
    bootstrap.LIBRARY=library
    real_trusted=bootstrap.trusted_library
    original_lstat=Path.lstat;original_fstat=os.fstat
    def stat_root(s):
        values=list(s);values[0]=s.st_mode&~0o022;values[4]=0
        return os.stat_result(values)
    def trusted(name):
        source=library/(name+'.py')
        if hashlib.sha256(source.read_bytes()).hexdigest()!=CONFIG['sha256'][name]:
            raise RuntimeError('lab_protected_library_drift')
        # Only root library owner/chain metadata is simulated; original FD read,
        # source hash and source compilation are real. No installation or chmod.
        with patch.object(Path,'lstat',lambda p:stat_root(original_lstat(p))),patch.object(os,'fstat',lambda fd:stat_root(original_fstat(fd))):
            m=real_trusted(name)
        if name=='authority':
            def query():
                log('root_query')
                value=json.loads(state.read_text())
                if value.get('queryLost'):raise TimeoutError('lab root response lost')
                return m.canonical(value['bundle'])
            m.Context.__init__.__defaults__=(query,)
            import datetime
            def clock():
                v=json.loads(state.read_text()).get('clock')
                return datetime.datetime.fromisoformat(v) if v else datetime.datetime.now(datetime.timezone.utc)
            m.Context.__init__.__kwdefaults__['now']=clock
            m.BOOTSTRAP=CONFIG['shim']
        if name=='verified_loader':
            original=m.Loader.__init__
            def loader(self,context,entry,**kw):
                log('loader_constructor',entry=entry)
                return original(self,context,entry,**kw)
            m.Loader.__init__=loader
        if name=='child_transport':m.NODE=CONFIG['node']
        return m
    bootstrap.trusted_library=trusted
    log('bootstrap',kind=argv[0],entry=argv[1])
    result=bootstrap.main(argv)
    if result is not None:print(json.dumps(result,sort_keys=True))
    log('bootstrap_complete',kind=argv[0],entry=argv[1])

if __name__=='__main__':main(sys.argv[1:])
