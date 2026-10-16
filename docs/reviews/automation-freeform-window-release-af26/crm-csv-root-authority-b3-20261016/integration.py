"""Pure B3 transforms; apply after accepted B2 Operations transform.
These anchors reject unexpected source changes. No historical file is edited.
"""
import ast


def once(source, old, new):
    if source.count(old) != 1:
        raise RuntimeError('b3_transform_anchor')
    return source.replace(old, new, 1)


def operations(source):
    # Preserve the daemon-presence check, all Operations.start barriers and child
    # transport. Only System's final config transport changes.
    source = once(source, '    def run(self, args, text=None):',
                  '    def run(self, args, text=None, *, pass_fds=()):')
    source = once(source, 'env=CLEAN, stderr=subprocess.PIPE)',
                  'env=CLEAN, stderr=subprocess.PIPE, pass_fds=pass_fds)')
    source = once(source,
        "        self.run([PM, 'start', str(root / 'candidate.ecosystem.config.cjs'), '--only', name])",
        "        from pm2_input import start\n        start(self, root, name, PM)")
    ast.parse(source)
    return source


def ecosystem(source):
    # Extract the original parser body exactly; no extra schema/default/predicate.
    source = once(source, 'def source(path):\n    path = Path(path)\n    require(path.is_file() and not path.is_symlink(), \'ecosystem_source_missing_or_symlink\')\n',
                  'def source_bytes(raw):\n')
    source = once(source, 'json.loads(path.read_text(),', "json.loads(raw.decode('utf-8') if isinstance(raw, bytes) else raw,")
    marker = '\n\ndef rendered(value):'
    wrapper = '''\n\ndef source(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), 'ecosystem_source_missing_or_symlink')
    return source_bytes(path.read_bytes())
'''
    source = once(source, marker, wrapper + marker)
    ast.parse(source)
    return source
