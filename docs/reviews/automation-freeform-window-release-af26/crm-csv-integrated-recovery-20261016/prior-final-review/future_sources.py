"""Local future source deltas only. No historical edits or package materialization."""
import ast


def once(source, old, new):
    if source.count(old) != 1:
        raise RuntimeError('recovery_source_anchor_diverged')
    return source.replace(old, new, 1)


def function(source, name, replacement):
    tree = ast.parse(source)
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name]
    if len(nodes) != 1:
        raise RuntimeError('recovery_function_missing_or_ambiguous')
    n = nodes[0]; lines = source.splitlines(keepends=True)
    lines[n.lineno - 1:n.end_lineno] = [replacement + '\n']
    return ''.join(lines)


def csv_cli(prevented_source):
    source = function(prevented_source, 'inspect',
        'def inspect(p):\n    from recovery import inspect as recovery_inspect\n    return recovery_inspect(p)')
    source = function(source, 'recover',
        'def recover(p, decision):\n    from recovery import recover as explicit_recover\n    return explicit_recover(p, decision)')
    tree = ast.parse(source)
    entry = next(n for n in tree.body if isinstance(n, ast.If) and "__name__" in ast.unparse(n.test))
    source = ''.join(source.splitlines(keepends=True)[:entry.lineno - 1])
    return source + """def main(argv):
    require(len(argv) >= 2, 'exact_arguments_required')
    if len(argv)==2 and argv[1]=='--inspect-readonly':return inspect(Path(argv[0]))
    if len(argv)==3 and argv[1]=='--operator-recover':return recover(Path(argv[0]),argv[2])
    if len(argv)==2 and argv[1]=='--execute':return execute(Path(argv[0]))
    raise RuntimeError('exact_arguments_required')
if __name__=='__main__':
    os.umask(0o077)
    try:
        value=main(sys.argv[1:])
        if value is not None:print(json.dumps(value))
    except BaseException as error:
        print(json.dumps({'result':'CSV_OPERATION_DENY','errorClass':type(error).__name__,'noAutomaticRetry':True}));sys.exit(1)
"""



def operations(prevented_source, mode):
    if mode not in ('switch', 'return', 'return-partial', 'return-before-commit'):
        raise RuntimeError('recovery_operation_mode_missing')
    if mode != 'return-before-commit':
        return prevented_source
    return once(prevented_source, '        return path_bindings(window, config)\n',
                '        from recovery_bridge import original_bindings\n        return original_bindings(window, config)\n')


def start_gate(source):
    return function(source, 'authorize_start', '''def authorize_start(d):
 d=Path(d)
 if d.name=='return-before-commit':
  from recovery_start import authorize_original_start
  return authorize_original_start(d)
 check(d.parent,live=True);stage_boundary(d.parent,d.name)''')


def sequencer(source):
    # Reuse existing scheduled-control correction, expressed over the versioned source.
    source = once(source, '    def restore_guard(self, config_file):\n',
        "    def scheduled_controls(self):\n        from scheduled_controls import ScheduledControls\n        return ScheduledControls(self.window, lambda args, text=None: self.run(args, input_text=text))\n\n    def restore_guard(self, config_file):\n")
    source = once(source, "            self.b.privileged('abort-prestop')\n",
        "            scheduled = self.b.scheduled_controls()\n            scheduled.known()\n            self.b.privileged('abort-prestop')\n            scheduled.restore_deploy()\n")
    source = once(source, "        require(self.b.guard()['open'], 'guard_not_reopened')",
        "        guard = self.b.guard()\n        require(not guard['open'] and guard['generation'] == 38 and not guard['tasks'] and not guard.get('ledgerFault'), 'recovery_guard38_drift')")
    source = once(source, "        self.journal('complete', mode=mode, guardGeneration=self.b.guard()['generation'])",
        "        self.b.scheduled_controls().verify('before')\n        self.journal('complete', mode=mode, guardGeneration=self.b.guard()['generation'])")
    source = once(source, "require(mode in {'switch', 'return', 'return-partial'}, 'mode_denied')",
        "require(mode in {'switch', 'return', 'return-partial', 'return-before-commit'}, 'mode_denied')")
    source = once(source, "require(mode in {'switch', 'return', 'return-partial'} and",
        "require(mode in {'switch', 'return', 'return-partial', 'return-before-commit'} and")
    source = once(source, "from baseline_contract import validate_preparation, sequential",
        "from baseline_contract import validate_preparation, sequential\nfrom recovery_contract import root_mode")
    source = once(source, "policy['targetProcesses']['return' if mode == 'return-partial' else mode][WORKER]",
        "policy['targetProcesses'][root_mode(mode)][WORKER]")
    source = once(source, "self.root / ('return' if mode == 'return-partial' else mode) / 'worker-before-unfence.private.json'",
        "self.root / root_mode(mode) / 'worker-before-unfence.private.json'")
    source = once(source, "for mode in ('switch', 'return', 'return-partial'):",
        "for mode in ('switch', 'return', 'return-partial', 'return-before-commit'):")
    source = once(source, "require(guard.get('open') and not guard.get('tasks') and",
        "require(type(guard.get('open')) is bool and not guard.get('tasks') and")
    source = once(source, "self.baseline['guardGeneration'] + 1 and",
        "self.baseline['guardGeneration'] + int(validate_preparation(self.root)['guard']['open']) and")
    source = once(source, '    def close_then_preflight(self):\n',
        '    def close_then_preflight(self):\n        self.b.scheduled_controls().verify("before")\n        from restore_contract import validate\n        for mode in ("switch","return","return-partial","return-before-commit"): validate(self.root/mode)\n')
    # Only replace guard restoration in the new future closed-guard CSV flow.
    tree = ast.parse(source); bridge = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Bridge')
    method = next(n for n in bridge.body if isinstance(n, ast.FunctionDef) and n.name == 'restore_guard')
    lines = source.splitlines(keepends=True)
    lines[method.lineno - 1:method.end_lineno] = ["    def restore_guard(self, config_file):\n        g = self.guard()\n        require(not g['open'] and g['generation'] == 38 and not g['tasks'] and not g.get('ledgerFault'), 'closed_guard_restoration_drift')\n        return g\n"]
    return ''.join(lines)


def binding_source(contract_hash, policy_hash, root_export_hash):
    """Pure source for a future reviewed binding; no file/capture/package emitted."""
    for value in (contract_hash, policy_hash, root_export_hash):
        if type(value) is not str or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
            raise RuntimeError('explicit_recovery_binding_hash_required')
    return ("RECOVERY_CONTRACT_SHA256 = " + repr(contract_hash) + '\n' +
            "INSTALLED_POLICY_SHA256 = " + repr(policy_hash) + '\n' +
            "ROOT_POLICY_PERMIT_SHA256 = " + repr(root_export_hash) + '\n')
