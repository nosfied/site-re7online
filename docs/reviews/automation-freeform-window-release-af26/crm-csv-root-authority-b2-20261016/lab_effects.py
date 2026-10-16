"""Synthetic external System/restore for subprocess fixture, not runtime code.
No subprocess/network/SQL is allowed by this driver. Crons are READ in fixture.
"""
from pathlib import Path
import json
import os

def record(root,event):
    with (Path(root)/'window/effects.jsonl').open('a')as stream:
        stream.write(json.dumps({'event':event,'pid':os.getpid()})+'\n')

class Driver:
    def guard(self):return {'version':1,'generation':38,'open':False,'tasks':{},'audit':[],'ledgerFault':False}
    def run(self,args,text=None):
        root=__phase_authority__.root
        if args==['crontab','-l']:return (root/'window/deploy.crontab.before').read_text()
        if args==['cat','/etc/cron.d/re7-converta-backup']:return (root/'window/re7-converta-backup.before').read_text()
        raise RuntimeError('lab_external_effect_not_allowed:'+str(args))

def validate_restore(root):
    # Previously certified restore is explicitly injected, as in accepted tests.
    # No new restore/capture, no substitution presented as operational evidence.
    return {'result':'LAB_PREVIOUS_RESTORE_INJECTED'}
