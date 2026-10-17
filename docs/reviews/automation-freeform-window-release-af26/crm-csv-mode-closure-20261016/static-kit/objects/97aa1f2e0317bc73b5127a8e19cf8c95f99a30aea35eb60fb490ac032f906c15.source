"""Future root-owned bootstrap, executed AS DEPLOY. Never installed by this file.
The launcher path and root-owned library are the OS/install trust anchor, not argv.
"""
import base64
import json
from pathlib import Path
import sys
import types

LIBRARY=Path('/usr/local/libexec/re7')

def trusted_library(name):
    # This bootstrap itself is root-owned and launched with /usr/bin/python3 -I -S.
    # No preparation import is performed here. Root library owner/canonical chain
    # follows the same trust model as the installed helper.
    import os,stat
    path=LIBRARY/(name+'.py')
    for parent in path.parents:
        s=parent.lstat()
        if not(stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022):
            raise RuntimeError('bootstrap_library_chain')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not(stat.S_ISREG(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022 and s.st_nlink==1):
            raise RuntimeError('bootstrap_library_file')
        with os.fdopen(fd,'rb',closefd=False)as stream:raw=stream.read()
    finally:os.close(fd)
    module=types.ModuleType(name);module.__file__=str(path);sys.modules[name]=module
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module

def main(argv):
    trusted_library('privileged_output')
    authority=trusted_library('authority');trusted_library('verified_loader')
    transport=trusted_library('child_transport')
    from verified_loader import Loader
    authority.require(len(argv)>=2 and argv[0]in('python','node-snapshot'),'bootstrap_arguments')
    authority.require(len(argv)>=4 and argv[2]=='--diagnostic-window', 'bootstrap_diagnostic_window_required')
    context=authority.Context(diagnostic_window=argv[3])
    entry=argv[1]; rest=list(argv[4:])
    correlated = rest[:1]==['--authority-correlation']
    if correlated:
        authority.require(len(rest)>=3 and rest[2]=='--', 'bootstrap_correlation_arguments')
        context.accept_correlation(json.loads(rest[1]))
        rest=rest[3:]
    scope=context.bundle['manifest']['entries'].get(entry)
    authority.require(scope != 'forward' or correlated, 'bootstrap_forward_lineage_required')
    loader=Loader(context,entry,trusted_modules={"authority":authority,"child_transport":transport})
    if argv[0]=='python':
        authority.require(context.bundle['manifest']['files'][entry]['language']=='python','bootstrap_language')
        loader.execute(rest)
        return None
    authority.require(context.bundle['manifest']['files'][entry]['language']=='commonjs','bootstrap_language')
    return {'root':str(context.root),'identity':list(context.identity),'correlation':context.correlation(),'entry':entry,
        'manifest':context.bundle['manifest'],
        'files':{p:base64.b64encode(v).decode()for p,v in loader.raw.items()}}

if __name__=='__main__':
    result=main(sys.argv[1:])
    if result is not None:print(json.dumps(result,sort_keys=True))
