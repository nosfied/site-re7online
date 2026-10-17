"""Future child routing. Correlation does not replace fresh root authentication."""
from pathlib import Path
import json
from authority import BOOTSTRAP, require
NODE='/usr/local/libexec/re7/recovery-node-launch.cjs'

def command(context, args):
    if not args:return args
    name=Path(args[0]).name
    if name not in ('python','python3','node'):
        return args
    require(len(args)>=2 and Path(args[1]).is_absolute(), 'authority_child_bypass')
    target=str(Path(args[1]).relative_to(context.root))
    context.snapshot(target)  # fresh scope and transitive coverage before child
    if name=='node':
        return ['/usr/bin/env','-u','NODE_OPTIONS','-u','NODE_PATH','/usr/bin/node',NODE,target,'--diagnostic-window',str(context.root/'window'),'--authority-correlation',json.dumps(context.correlation()),'--',*args[2:]]
    return ['/usr/bin/python3','-I','-S',BOOTSTRAP,'python',target,'--diagnostic-window',str(context.root/'window'),
            '--authority-correlation',json.dumps(context.correlation()),'--',*args[2:]]
