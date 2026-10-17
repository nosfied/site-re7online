"""Future root-owned authority storage; no import of a deploy-owned preparation.
Owner APIs are NOT delegated by sudoers. Query has no write/renewal path.
"""
import datetime
import fcntl
from contextlib import contextmanager
import json
import os
from pathlib import Path
from authority import canonical, digest, hexhash, protected_bytes, protected_directory, require, validate_dag

STORE = Path('/var/lib/re7/recovery-authority')
LOCK = Path('/var/lib/re7/incident-6683-v4-control.lock')

class Store:
    def __init__(self, folder=STORE, *, read=protected_bytes, now=None, lock_path=LOCK, directory_check=protected_directory):
        self.folder = Path(folder); self.read = read; self.lock_path=Path(lock_path); self.directory_check=directory_check
        self.now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))

    def _path(self, policy_hash):
        require(hexhash(policy_hash), 'authority_policy_hash')
        return self.folder / policy_hash

    @contextmanager
    def _owner_lock(self):
        require(os.geteuid()==0, 'authority_owner_required')
        import stat
        fd=os.open(self.lock_path, os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW, 0o600)
        try:
            s=os.fstat(fd)
            require(stat.S_ISREG(s.st_mode) and s.st_uid==os.geteuid() and not s.st_mode&0o077, 'authority_owner_lock')
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            yield
        finally:os.close(fd)

    def install_owner_once(self, *args, **kw):
        with self._owner_lock():return self._install_owner_once(*args, **kw)

    def issue_owner_once(self, *args, **kw):
        with self._owner_lock():return self._issue_owner_once(*args, **kw)

    def _install_owner_once(self, anchor_raw, manifest_raw, expected_anchor, expected_manifest, *, owner_action=False):
        require(os.geteuid() == 0 and owner_action is True, 'authority_owner_install_required')
        require(digest(anchor_raw) == expected_anchor and digest(manifest_raw) == expected_manifest,
                'authority_reviewed_bytes')
        a = json.loads(anchor_raw); m = json.loads(manifest_raw)
        require(canonical(a) == anchor_raw and canonical(m) == manifest_raw,
                'authority_canonical_bytes')
        require(a['codeManifestSha256'] == expected_manifest, 'authority_manifest_pin')
        validate_dag(m)
        self.directory_check(self.folder)
        folder = self._path(a['policySha256'])
        # Only the privileged owner installer may create these records. The
        # caller must hold the same canonical lock, as in owner_locked below.
        require(not os.path.lexists(folder), 'authority_install_consumed')
        folder.mkdir(mode=0o700)
        self._put(folder/'install.intent.json', canonical({'expectedAnchor': expected_anchor,
                    'expectedManifest': expected_manifest, 'automaticRetry': False}))
        self._put(folder/'anchor.json', anchor_raw)
        self._put(folder/'manifest.json', manifest_raw)
        self._put(folder/'install.receipt.json', canonical({'result':'ROOT_AUTHORITY_STATIC_INSTALLED',
                    'anchorSha256':expected_anchor,'manifestSha256':expected_manifest}))

    def _put(self, path, raw):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(raw); out.flush(); os.fsync(out.fileno())
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)

    def _issue_owner_once(self, helper, decision, expected_execution, *, owner_action=False):
        require(os.geteuid() == 0 and owner_action is True, 'authority_owner_issue_required')
        require(decision in ('ORIGINAL','CANDIDATE') and hexhash(expected_execution),
                'authority_owner_decision')
        value=helper.policy_from(); phase=helper.phase_read()
        require(phase and phase['stage']=='fenced' and phase['policySha256']==value['policySha256'],
                'authority_issue_phase')
        helper.guard_closed(); helper.nft_present()
        folder=self._path(value['policySha256'])
        a=json.loads(self.read(folder/'anchor.json'))
        self.read(folder/'install.receipt.json')
        require(a['policySha256']==value['policySha256'] and a['preparation']==value['preparation'],
                'authority_issue_policy')
        # Root reads data only. No evaluation/import of the preparation.
        p=Path(a['preparation']); raw=(p/'window/csv-execution.intent.private.json').read_bytes()
        require(digest(raw)==expected_execution and
                digest((p/'window/recovery-contract.private.json').read_bytes())==a['contractSha256'],
                'authority_issue_execution')
        require(not os.path.lexists(folder/'issue.intent.json'), 'authority_issue_consumed')
        self._put(folder/'issue.intent.json',canonical({'decision':decision,
                    'executionIntentSha256':expected_execution,'automaticRetry':False}))
        permit={'anchorSha256':digest(canonical(a)), 'preparation':a['preparation'],
            'contractSha256':a['contractSha256'],'policySha256':a['policySha256'],
            'decision':decision,'targetProfileSha256':a['profileSha256'][decision],
            'executionIntentSha256':expected_execution,'phase':'fenced',
            'capturedUtc':self.now().isoformat()}
        self._put(folder/'permit.json',canonical(permit))
        self._put(folder/'issue.receipt.json',canonical({'result':'ROOT_RECOVERY_PERMIT_ISSUED',
                    'permitSha256':digest(canonical(permit))}))
        return canonical(permit)  # byte-exact custody export; never reserialize an ack

    def query_locked(self, helper):
        """Called ONLY inside canonical helper.main's existing root flock."""
        value=helper.policy_from(); phase=helper.phase_read()
        folder=self._path(value['policySha256'])
        a_raw=self.read(folder/'anchor.json'); m_raw=self.read(folder/'manifest.json')
        a=json.loads(a_raw); m=json.loads(m_raw)
        receipt=json.loads(self.read(folder/'install.receipt.json'))
        require(receipt['result']=='ROOT_AUTHORITY_STATIC_INSTALLED' and
                receipt['anchorSha256']==digest(a_raw) and receipt['manifestSha256']==digest(m_raw) and
                canonical(a)==a_raw and canonical(m)==m_raw and
                a['policySha256']==value['policySha256'] and a['preparation']==value['preparation'] and
                a['codeManifestSha256']==digest(m_raw), 'authority_static_record_drift')
        require(phase is None or phase['policySha256']==value['policySha256'], 'authority_root_phase_drift')
        permit=None; permit_hash=None
        present={name:os.path.lexists(folder/name) for name in ('issue.intent.json','permit.json','issue.receipt.json')}
        require(not any(present.values()) or all(present.values()), 'authority_issue_incomplete')
        # Intent without receipt is a denial, never an invitation to issue again.
        if os.path.lexists(folder/'issue.intent.json'):
            raw=self.read(folder/'permit.json');permit=json.loads(raw)
            ack=json.loads(self.read(folder/'issue.receipt.json'))
            require(ack['result']=='ROOT_RECOVERY_PERMIT_ISSUED' and
                    ack['permitSha256']==digest(raw) and canonical(permit)==raw,
                    'authority_issue_incomplete')
            permit_hash=digest(raw)
        return canonical({'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,
            'anchor':a,'anchorSha256':digest(a_raw),'manifest':m,'permit':permit,
            'permitSha256':permit_hash,'livePolicySha256':value['policySha256'],
            'livePhase':None if phase is None else phase['stage']})

