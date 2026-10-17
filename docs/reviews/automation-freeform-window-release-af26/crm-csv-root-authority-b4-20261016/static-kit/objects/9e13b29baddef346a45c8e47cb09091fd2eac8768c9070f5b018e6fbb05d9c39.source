"""One fail-closed contract for deploy AND system scheduled controls.

Future consumers only. No CLI, automatic repair, PM2, SQL, dotenv or provider calls.
The caller owns the canonical operation lock. Partial recovery has no retry here.
"""
import hashlib
import os
import stat
from pathlib import Path

SYSTEM_CRON = '/etc/cron.d/re7-converta-backup'

def require(value, reason):
    if not value:
        raise RuntimeError(reason)

def private_bytes(path):
    path=Path(path); st=path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and
            stat.S_IMODE(st.st_mode)==0o600 and st.st_nlink==1 and not path.is_symlink(),
            'scheduled_control_source_type_owner_mode')
    return path.read_bytes()

class ScheduledControls:
    def __init__(self, window, run):
        self.window=Path(window); self.run=run
        self.expected={kind:{phase:private_bytes(self.window/(prefix+'.'+suffix))
                            for phase,suffix in [('before','before'),('contained','window')]}
                       for kind,prefix in [('deploy','deploy.crontab'),('system','re7-converta-backup')]}

    def observe(self):
        # Separate reads and separate results: supervision or nft never substitute for either cron.
        return {'deploy':self.run(['crontab','-l']).encode(),
                'system':self.run(['cat',SYSTEM_CRON]).encode()}

    def known(self):
        actual=self.observe()
        for kind in ('deploy','system'):
            require(actual[kind] in self.expected[kind].values(), kind+'_cron_unknown_state')
        return actual

    def verify(self, phase):
        require(phase in ('before','contained'), 'scheduled_control_phase_invalid')
        actual=self.observe()
        for kind in ('deploy','system'):
            require(actual[kind]==self.expected[kind][phase], kind+'_cron_'+phase+'_drift')
        return {kind:hashlib.sha256(actual[kind]).hexdigest() for kind in ('deploy','system')}

    def restore_deploy(self):
        # Root helper must restore system cron first. Never re-enable a third/unknown crontab.
        actual=self.known()
        require(actual['system']==self.expected['system']['before'], 'system_cron_not_restored')
        if actual['deploy']!=self.expected['deploy']['before']:
            self.run(['crontab','-'],self.expected['deploy']['before'].decode())
        # A failed install or failed read propagates; no success receipt/journal may precede this.
        return self.verify('before')
