"""Unchanged minimal real consumer excerpt; no operational entrypoint."""
from pathlib import Path
import json

def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


class System:
    def validate_bindings(self, window, config):
        bindings = json.loads((window / 'path-bindings.private.json').read_text())
        for app in config.values():
            require(Path(app['cwd']).is_dir() and Path(app['script']).is_file(), 'release_path_missing')
            data = bindings.get(app['cwd'] + '/.data')
            if data:
                require(Path(app['cwd'], '.data').is_symlink() and str(Path(app['cwd'], '.data').resolve()) == data, 'auth_binding_drift')
