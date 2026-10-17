"""Shared read-only predicates for future consumers. No repair or entrypoint."""
import json
import stat
from pathlib import Path

EVENT_SOURCE = '/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts'
MODES = ('switch', 'return', 'return-partial', 'return-before-commit')
# Compatibility name for local tests: the original require raises RuntimeError.
ContractDeny = RuntimeError

def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


class Filesystem:
    def lstat(self, path):
        return Path(path).lstat()


FS = Filesystem()


def event_parents(target, fs=FS):
    """Preserve the final Event parent predicate; unreadable parents deny."""
    require(str(target) == EVENT_SOURCE, 'event_literal')
    for parent in Path(target).parents:
        try:
            mode = fs.lstat(parent).st_mode
        except OSError:
            raise ContractDeny('event_source_parent_unreadable') from None
        require(stat.S_ISDIR(mode) and not (mode & 0o022), 'event_source_parent')


def path_bindings(window, config):
    """Exact original System.validate_bindings body, including None return/errors."""
    bindings = json.loads((window / 'path-bindings.private.json').read_text())
    for app in config.values():
        require(Path(app['cwd']).is_dir() and Path(app['script']).is_file(), 'release_path_missing')
        data = bindings.get(app['cwd'] + '/.data')
        if data:
            require(Path(app['cwd'], '.data').is_symlink() and str(Path(app['cwd'], '.data').resolve()) == data, 'auth_binding_drift')


def validate_pre_stop(root):
    root = Path(root)
    event = json.loads((root / 'window/event-consumer-binding.private.json').read_text())
    event_parents(event['path'])
    for mode in MODES:
        for name in ('return.config.private.json', 'candidate.config.private.json'):
            # Same profile loading semantics as Operations.__init__; no extra schema.
            profile = json.loads((root / mode / name).read_text())
            config = {a['name']: a for a in profile['apps']}
            path_bindings(root / 'window', config)
    return {'result': 'CSV_PRESTOP_FILESYSTEM_CONTRACT_PASS', 'modes': len(MODES),
            'profiles': len(MODES) * 2, 'readOnly': True}
