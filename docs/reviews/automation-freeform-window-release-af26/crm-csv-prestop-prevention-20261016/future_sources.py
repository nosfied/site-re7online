"""Pure source delta for future consumers, not an operational package producer.

No copy, manifests, profiles, bindings, namespace, installer or CLI is generated.
Unknown/changed source anchors deny. Historical files are inputs only.
"""
import ast


def once(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('future_consumer_source_contract_changed')
    return source.replace(before, after, 1)


def operations(source):
    tree = ast.parse(source)
    classes = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'System']
    if len(classes) != 1:
        raise RuntimeError('operations_binding_consumer_missing_or_ambiguous')
    methods = [n for n in classes[0].body if isinstance(n, ast.FunctionDef) and n.name == 'validate_bindings']
    if len(methods) != 1:
        raise RuntimeError('operations_binding_consumer_missing_or_ambiguous')
    method = methods[0]
    expected = '''def validate_bindings(self, window, config):
        bindings = json.loads((window / 'path-bindings.private.json').read_text())
        for app in config.values():
            require(Path(app['cwd']).is_dir() and Path(app['script']).is_file(), 'release_path_missing')
            data = bindings.get(app['cwd'] + '/.data')
            if data:
                require(Path(app['cwd'], '.data').is_symlink() and str(Path(app['cwd'], '.data').resolve()) == data, 'auth_binding_drift')'''
    if ast.dump(method, include_attributes=False) != ast.dump(ast.parse(expected).body[0], include_attributes=False):
        raise RuntimeError('operations_binding_predicate_changed')
    lines = source.splitlines(keepends=True)
    lines[method.lineno - 1:method.end_lineno] = [
        '    def validate_bindings(self, window, config):\n',
        '        from prestop_contract import path_bindings\n',
        '        return path_bindings(window, config)\n',
    ]
    return ''.join(lines)


def event_overlay(source):
    return once(source,
        "    for parent in target.parents:require(parent.is_dir()and not parent.is_symlink()and not(parent.stat().st_mode&0o022),'event_source_parent')",
        '    from prestop_contract import event_parents\n    event_parents(target)')


def csv_cli(source):
    source = once(source,
        'def execute(p):\n    p=Path(p);w=p/\'window\';check(p,live=True)',
        "def execute(p):\n    from prestop_contract import validate_pre_stop\n    p=Path(p);validate_pre_stop(p);w=p/'window';check(p,live=True)")
    return once(source,
        "            s.close_then_preflight();s.controls_enter();s.action('switch','stop-pair');s.verify_stopped('switch')",
        "            validate_pre_stop(p)\n            s.close_then_preflight();s.controls_enter();s.action('switch','stop-pair');s.verify_stopped('switch')")


def check_current(source):
    # This consumer is already used by pre_install/admission and execute.
    return once(source,
        " p=Path(p);check(p,live=True)",
        " from prestop_contract import validate_pre_stop\n p=Path(p);validate_pre_stop(p);check(p,live=True)")
