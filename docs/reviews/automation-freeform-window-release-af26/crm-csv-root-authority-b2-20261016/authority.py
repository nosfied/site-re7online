"""Future shared authority reader. Root installation is required; no env/CLI pins.

Only the fixed root helper supplies authority. This module never imports a
binding. Test transports/metadata are injected explicitly, never via environment.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

HELPER = '/usr/local/libexec/re7/incident-6683-window-control.py'
BOOTSTRAP = '/usr/local/libexec/re7/recovery-launch.py'
QUERY = ['/usr/bin/sudo', '-n', '/usr/bin/python3', '-I', '-S', HELPER,
         'inspect-recovery-authority']
MODES = ('switch', 'return', 'return-partial', 'return-before-commit')

def require(ok, why):
    if not ok:
        raise RuntimeError(why)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()

def hexhash(value):
    return type(value) is str and len(value) == 64 and all(c in '0123456789abcdef' for c in value)

def protected_directory(path):
    path=Path(path)
    for node in (path,*path.parents):
        meta=node.lstat()
        require(stat.S_ISDIR(meta.st_mode) and meta.st_uid==0 and not meta.st_mode&0o022,
                'authority_root_directory')


def protected_bytes(path):
    """Root chains cannot be replaced by deploy; consume bytes of the opened FD."""
    path = Path(path)
    for parent in path.parents:
        s = parent.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022,
                'authority_root_chain')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and
                not s.st_mode & 0o022 and s.st_nlink == 1, 'authority_root_file')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            return stream.read()
    finally:
        os.close(fd)

def fixed_query():
    protected_bytes(HELPER)
    result = subprocess.run(QUERY, check=True, capture_output=True, timeout=15,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
    return result.stdout

def validate_dag(manifest):
    require(set(manifest) == {'files', 'dependencies', 'entries', 'imports'}, 'authority_manifest_shape')
    files = manifest['files']; deps = manifest['dependencies']
    require(type(files) is dict and files and set(deps) == set(files), 'authority_dependency_coverage')
    for name, row in files.items():
        p = Path(name)
        require(not p.is_absolute() and '..' not in p.parts and str(p) == name and
                row['language'] in ('python', 'commonjs', 'json', 'data') and hexhash(row['sha256']) and
                type(row['uid']) is int and type(row['mode']) is int,
                'authority_file_row')
        require(type(deps[name]) is list and len(set(deps[name])) == len(deps[name]) and
                set(deps[name]) <= set(files), 'authority_dependency_unknown')
    done = set(); active = set()
    def visit(name):
        require(name not in active, 'authority_dependency_cycle')
        if name in done:
            return
        active.add(name)
        for child in deps[name]:
            visit(child)
        active.remove(name); done.add(name)
    for name in files:
        visit(name)
    require(type(manifest['entries']) is dict and manifest['entries'] and
            set(manifest['entries']) <= set(files), 'authority_entry_coverage')
    for name, scope in manifest['entries'].items():
        require(scope in ('inspect', 'prestop', 'forward', 'recovery', 'closure'), 'authority_entry_scope')
    for owner, imports in manifest['imports'].items():
        require(owner in files and type(imports) is dict and
                set(imports.values()) <= set(files), 'authority_import_coverage')
    return done

class Context:
    """Explicit context; a selector/correlation digest is never its authority."""
    def __init__(self, query=fixed_query, *, now=None):
        self.query = query
        self.now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))
        self.bundle = self._read()
        self.identity = self._identity(self.bundle)
        self.root = Path(self.bundle['anchor']['preparation'])

    def _identity(self, bundle):
        return (bundle['anchorSha256'], bundle['permitSha256'])

    def _read(self):
        raw = self.query(); b = json.loads(raw)
        require(b['result'] == 'ROOT_RECOVERY_AUTHORITY_READ' and b['queryOnly'] is True,
                'authority_query_result')
        a = b['anchor']; p = b['permit']; m = b['manifest']
        require(a['version'] == 1 and Path(a['preparation']).is_absolute() and
                hexhash(a['contractSha256']) and hexhash(a['policySha256']) and
                hexhash(a['codeManifestSha256']), 'authority_anchor_shape')
        require(digest(canonical(a)) == b['anchorSha256'] and
                digest(canonical(m)) == a['codeManifestSha256'], 'authority_anchor_integrity')
        require(b['livePolicySha256'] == a['policySha256'], 'authority_live_policy_drift')
        require(b['livePhase'] in (None, 'fenced', 'ready', 'unfenced', 'complete', 'aborted'),
                'authority_phase_unknown')
        validate_dag(m)
        if p is None:
            require(b['permitSha256'] is None, 'authority_permit_missing')
        else:
            require(digest(canonical(p)) == b['permitSha256'], 'authority_permit_integrity')
            require(p['anchorSha256'] == b['anchorSha256'] and
                    p['preparation'] == a['preparation'] and
                    p['contractSha256'] == a['contractSha256'] and
                    p['policySha256'] == a['policySha256'] and p['phase'] == 'fenced' and
                    p['decision'] in ('ORIGINAL', 'CANDIDATE') and
                    p['targetProfileSha256'] == a['profileSha256'][p['decision']] and
                    hexhash(p['executionIntentSha256']), 'authority_permit_context')
            require(datetime.datetime.fromisoformat(p['capturedUtc']).utcoffset() is not None,
                    'authority_permit_timezone')
        return b

    def revalidate(self, purpose='inspect', decision=None, execution_hash=None):
        b = self._read()
        require(self._identity(b) == self.identity, 'authority_replaced')
        require(purpose in ('inspect', 'prestop', 'forward', 'recovery', 'start', 'closure'), 'authority_purpose')
        if purpose == 'prestop':
            require(b['livePhase'] in (None, 'fenced') and b['permit'] is None,
                    'authority_prestop_scope')
        elif purpose == 'forward':
            require(b['permit'] is None, 'authority_forward_recovery_conflict')
            require(b['livePhase'] == 'fenced', 'authority_forward_phase')
        elif purpose in ('recovery', 'start', 'closure'):
            p = b['permit']; require(p is not None, 'authority_permit_required')
            age = (self.now() - datetime.datetime.fromisoformat(p['capturedUtc'])).total_seconds()
            require(0 <= age < 600, 'authority_permit_expired')
            require(p['decision'] == decision and p['executionIntentSha256'] == execution_hash,
                    'authority_decision_or_execution')
            require(b['livePhase'] in (('fenced',) if purpose != 'closure' else
                    ('fenced', 'ready', 'unfenced', 'complete')), 'authority_live_phase_drift')
        self.bundle = b
        if hasattr(self, "_execution_expected"):
            self._check_execution(self._execution_expected)
        return self

    def pin(self, name):
        if name == 'contract':
            return self.bundle['anchor']['contractSha256']
        if name == 'policy':
            return self.bundle['anchor']['policySha256']
        require(name == 'permit' and self.bundle['permit'] is not None, 'authority_pin_unavailable')
        return self.bundle['permitSha256']

    def start_mode(self, directory):
        """Static reviewed authority for switch; one-shot permit only for recovery.

        This does not admit gates or select a candidate. Operations and its
        canonical start gate must still validate all dynamic preconditions.
        """
        directory = Path(directory)
        require(directory.parent == self.root and directory.name in MODES,
                'authority_start_mode_scope')
        if directory.name != 'switch':
            return self.operation('ORIGINAL' if directory.name == 'return-before-commit'
                                  else 'CANDIDATE', 'start')
        self.revalidate('forward')
        w = self.root / 'window'
        require(digest((w / 'recovery-contract.private.json').read_bytes()) == self.pin('contract'),
                'authority_forward_contract')
        require(digest((w / 'target.profile.private.json').read_bytes()) ==
                self.bundle['anchor']['profileSha256']['CANDIDATE'], 'authority_forward_profile')
        require(hexhash(self.execution_hash()), 'authority_forward_execution_required')
        # Recovery or closure already admitted is not a second forward attempt.
        require(not any(os.path.lexists(w / name) for name in
                ('csv-recovery.intent.private.json', 'csv-recovery.receipt.private.json',
                 'csv-abort.receipt.private.json', 'csv-complete.receipt.private.json')),
                'authority_forward_consumed_or_recovery')
        self.revalidate('forward')
        return self

    def _current_execution(self):
        path = self.root / 'window/csv-execution.intent.private.json'
        return digest(path.read_bytes()) if os.path.lexists(path) else None

    def _check_execution(self, expected):
        require(self._current_execution() == expected, 'authority_execution_changed')
        permit = self.bundle['permit']
        if permit is not None:
            require(expected == permit['executionIntentSha256'], 'authority_execution_permit')
        return expected

    def execution_hash(self):
        current = self._current_execution()
        if not hasattr(self, '_execution_expected') and current is not None:
            self._execution_expected = current
        return self._check_execution(getattr(self, '_execution_expected', current))

    def correlation(self):
        self.revalidate()
        return {'authority': list(self.identity), 'executionSha256': self.execution_hash()}

    def accept_correlation(self, value):
        # Parent lineage is a comparison obligation, not authority: Context has
        # already queried/validated root independently. Check BEFORE the Loader.
        require(type(value) is dict and set(value) == {'authority', 'executionSha256'},
                'authority_correlation_shape')
        require(tuple(value['authority']) == self.identity, 'bootstrap_authority_replaced')
        expected = value['executionSha256']
        require(expected is None or hexhash(expected), 'authority_execution_shape')
        self._check_execution(expected)
        if expected is not None:
            self._execution_expected = expected
        self.revalidate()
        return self

    def operation(self, decision, purpose='recovery'):
        execution = self.root / 'window/csv-execution.intent.private.json'
        return self.revalidate(purpose, decision, digest(execution.read_bytes()))

    def snapshot(self, entry):
        self.revalidate()
        m = self.bundle['manifest']; require(entry in m['entries'], 'authority_entry_denied')
        scope = m['entries'][entry]
        if scope == 'recovery':
            require(self.bundle['permit'] is not None, 'authority_permit_required')
            self.operation(self.bundle['permit']['decision'], 'start')
        elif scope == 'closure':
            require(self.bundle['permit'] is not None, 'authority_permit_required')
            self.operation(self.bundle['permit']['decision'], 'closure')
        elif scope == 'forward':
            self.start_mode(self.root / Path(entry).parts[0])
        elif scope == 'prestop':
            self.revalidate('prestop')
        result = {}
        def collect(name):
            if name in result:
                return
            file = self.root / name
            fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                s = os.fstat(fd)
                require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and
                        s.st_uid == m['files'][name]['uid'] and
                        stat.S_IMODE(s.st_mode) == m['files'][name]['mode'], 'authority_source_type')
                with os.fdopen(fd, 'rb', closefd=False) as stream:
                    value = stream.read()
            finally:
                os.close(fd)
            require(digest(value) == m['files'][name]['sha256'], 'authority_source_hash:' + name)
            result[name] = value
            for child in set(m['dependencies'][name]) | set(m['imports'].get(name, {}).values()):
                collect(child)
        collect(entry)
        self.revalidate()
        return result
