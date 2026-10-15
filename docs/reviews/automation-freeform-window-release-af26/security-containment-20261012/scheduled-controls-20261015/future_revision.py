"""Exact source transformations for future preparers, never sealed generations in place.

Produces code deltas for review/tests, NOT a cipher generation, policy or deployable package.
Existing preparer must include this module in manifests and recertify before future use.
"""
import hashlib, json, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
MODES=('switch','return','return-partial','return-before-commit')

def once(text,old,new):
    if text.count(old)!=1:raise RuntimeError('scheduled_control_patch_source_diverged')
    return text.replace(old,new,1)

def changes(source):
    source=Path(source); out={}
    f=source/'window/sequencer.py'; s=f.read_text()
    s=once(s,'    def restore_guard(self, config_file):\n',
           "    def scheduled_controls(self):\n        from scheduled_controls import ScheduledControls\n        return ScheduledControls(self.window, lambda args, text=None: self.run(args, input_text=text))\n\n    def restore_guard(self, config_file):\n")
    s=once(s,'    def close_then_preflight(self):\n',
           "    def close_then_preflight(self):\n        self.b.scheduled_controls().verify('before')\n")
    s=once(s,"            self.b.privileged('abort-prestop')\n",
           "            scheduled = self.b.scheduled_controls()\n            scheduled.known()  # Deny unknown controls before the privileged recovery effect.\n            self.b.privileged('abort-prestop')\n            scheduled.restore_deploy()\n")
    s=once(s,"        self.journal('complete', mode=mode, guardGeneration=self.b.guard()['generation'])",
           "        self.b.scheduled_controls().verify('before')\n        self.journal('complete', mode=mode, guardGeneration=self.b.guard()['generation'])")
    out['window/sequencer.py']=s.encode()
    f=source/'read-preparatory.py';s=f.read_text()
    s=once(s,"try:\n runpy.run_path(str(P/'verify-package.py'));passed.append(stage)",
           "try:\n stage='scheduled_controls_before'\n from scheduled_controls import ScheduledControls\n ScheduledControls(P/'window', lambda args: subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=10)).verify('before');passed.append(stage)\n stage='complete_checker'\n runpy.run_path(str(P/'verify-package.py'));passed.append(stage)")
    out['read-preparatory.py']=s.encode()
    # Future conductor must require the new real live-control gate; original conductor stays untouched.
    f=HERE.parent/'cipher-v13-execution-20261015/admit_gates.py';s=f.read_text()
    s=once(s,"REQUIRED={'complete_checker',", "REQUIRED={'scheduled_controls_before','complete_checker',")
    out['conductor/admit_gates.py']=s.encode()
    for mode in MODES:
        f=source/mode/'ops.py';s=f.read_text()
        s=once(s,'    def enter(self):\n',"    def scheduled(self):\n        sys.path.insert(0, str(self.window))\n        from scheduled_controls import ScheduledControls\n        return ScheduledControls(self.window, self.d.run)\n\n    def enter(self):\n        self.scheduled().verify('before')\n")
        s=once(s,'    def finish(self):\n',"    def finish(self):\n        self.scheduled().verify('contained')\n")
        anchor="        require(self.d.run(['systemctl', 'show', 'pm2-deploy.service', '--property=ActiveState,UnitFileState']) == self.initial['supervision'], 'supervision_restore_failed')"
        s=once(s,anchor,anchor+"\n        self.scheduled().verify('before')")
        out[mode+'/ops.py']=s.encode()
        f=source/mode/'delegated.py';s=f.read_text()
        s=once(s,'    def prepare(self):\n',"    def prepare(self):\n        self.scheduled().verify('before')\n")
        # Actual preflight CLI path, not only outer sequencer admission.
        s=once(s,"    if action == 'preflight':\n        ops.require(not (root / 'old-exit-confirmed.json').exists()",
               "    if action == 'preflight':\n        ops.Controls(root, driver).scheduled().verify('before')\n        ops.require(not (root / 'old-exit-confirmed.json').exists()")
        s=once(s,"        if action == 'preflight':\n            pass  # Read-only absence proof; no backup/control/process mutation.",
               "        if action == 'preflight':\n            control.scheduled().verify('before')")
        # Delegated finish root helper has already restored system; deploy may still be window.
        s=once(s,'    def finish(self):\n',"    def finish(self):\n        self.scheduled().known()\n")
        old="        self.d.run(['crontab', '-'], (self.window / 'deploy.crontab.before').read_text())\n        ops.require(self.d.run(['crontab', '-l']).encode() ==\n                    (self.window / 'deploy.crontab.before').read_bytes(), 'cron_restore_failed')"
        s=once(s,old,"        self.scheduled().restore_deploy()")
        out[mode+'/delegated.py']=s.encode()
    out['window/scheduled_controls.py']=(HERE/'scheduled_controls.py').read_bytes()
    return out

def main():
    source=Path(sys.argv[1]).resolve();dest=Path(sys.argv[2]).resolve()
    if dest.exists() or source==dest:raise RuntimeError('new_code_output_required')
    result=changes(source);dest.mkdir(mode=0o700)
    entries=[]
    for name,raw in result.items():
        f=dest/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(raw);f.chmod(0o600)
        old=source/name
        if name=='conductor/admit_gates.py':old=HERE.parent/'cipher-v13-execution-20261015/admit_gates.py'
        entries.append({'path':name,'sourceSha256':hashlib.sha256(old.read_bytes()).hexdigest()if old.exists()else None,'sourceOrigin':'cipher-v13-execution-20261015/admit_gates.py'if name=='conductor/admit_gates.py'else name,'newSha256':hashlib.sha256(raw).hexdigest()})
    (dest/'CODE_DELTA.json').write_text(json.dumps({'status':'LOCAL_CODE_DELTA_NOT_OPERATIONAL_GENERATION','files':entries},indent=2))
    print(json.dumps({'result':'FUTURE_CONTROLS_CODE_DELTA_ONLY','files':len(entries),'productionMutation':False}))

if __name__=='__main__':main()
