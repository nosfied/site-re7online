"""Pure future source transforms over accepted consumers. No historical edits.
All __phase_* globals are installed by the authenticated loader, not env or argv.
A raw execution therefore fails before operational effects.
"""
import ast
import textwrap


def once(source, old, new):
    if source.count(old)!=1:raise RuntimeError('authority_integration_anchor:'+old[:50])
    return source.replace(old,new,1)

def method(source, cls, name, replacement):
    tree=ast.parse(source)
    owner=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name==cls)
    node=next(n for n in owner.body if isinstance(n,ast.FunctionDef)and n.name==name)
    lines=source.splitlines(True);lines[node.lineno-1:node.end_lineno]=[textwrap.indent(textwrap.dedent(replacement).strip(),'    ')+'\n']
    return ''.join(lines)

def recovery(source):
    source=once(source,'def __init__(self, root, bridge, sequencer_class, contract_digest):',
        'def __init__(self, root, bridge, sequencer_class, contract_digest, authority):')
    source=once(source,'        self.root = Path(root); self.window = self.root / \'window\'\n',
        '        self.authority = authority\n        require(Path(root) == authority.root and contract_digest == authority.pin("contract"), "authority_recovery_root")\n        self.root = Path(root); self.window = self.root / \'window\'\n')
    source=once(source,'    def inspect(self):\n        c = Contract(self.root, self.b, self.digest)\n',
        '    def inspect(self):\n        self.authority.revalidate()\n        c = Contract(self.root, self.b, self.digest)\n')
    # This second occurrence belongs to recover inside the locks.
    source=once(source,"            require(decision in view['options'], 'explicit_decision_or_state_denied')\n",
        "            require(decision in view['options'], 'explicit_decision_or_state_denied')\n            if decision == 'PRESTOP': self.authority.revalidate('prestop')\n            else: self.authority.operation(decision)\n")
    source=once(source,"            self.b.reset_recovery_gates()\n",
        "            if decision != 'PRESTOP': self.authority.operation(decision, 'closure')\n            self.b.reset_recovery_gates()\n")
    start=source.index('def build(root):')
    return source[:start]+'''def build(root, authority):
    from recovery_bridge import Bridge
    from sequencer import Sequencer
    authority.revalidate()
    return Recovery(root, Bridge(root, authority), Sequencer, authority.pin('contract'), authority)
def inspect(root):
    return build(root, __phase_authority__).inspect()
def recover(root, decision):
    return build(root, __phase_authority__).recover(decision)
'''

def bridge(source):
    source=once(source,'    def __init__(self, root, policy_hash):','    def __init__(self, root, authority):')
    source=once(source,'        self.recovery_policy_hash = policy_hash',
        "        self.phase_authority = authority\n        self.recovery_policy_hash = authority.pin('policy')")
    source=once(source,'original_bindings(self.window, {a[\'name\']: a for a in source[\'apps\']})',
        'original_bindings(self.window, {a[\'name\']: a for a in source[\'apps\']}, self.phase_authority)')
    source=once(source,'        from recovery_binding import ROOT_POLICY_PERMIT_SHA256\n',
        "        decision = 'ORIGINAL' if mode == ORIGINAL else 'CANDIDATE'\n        self.phase_authority.operation(decision)\n        ROOT_POLICY_PERMIT_SHA256 = self.phase_authority.pin('permit')\n")
    source=once(source,'def original_bindings(window, config):','def original_bindings(window, config, authority):')
    source=once(source,'    from recovery_binding import RECOVERY_CONTRACT_SHA256\n',
        "    authority.revalidate()\n    RECOVERY_CONTRACT_SHA256 = authority.pin('contract')\n")
    return source

def gate(source):
    return once(source,'controller = build(root)', 'controller = build(root, __phase_authority__)')

def operations(source):
    if '    def run(self, args, text=None):' in source:
        source=once(source,'    def run(self, args, text=None):\n', '    def run(self, args, text=None):\n        from child_transport import command\n        args = command(__phase_authority__, args)\n')
    if 'return original_bindings(window, config)'in source:
        source=once(source,'return original_bindings(window, config)',
                    'return original_bindings(window, config, __phase_authority__)')
    source=once(source,'    def start(self, name):\n',
        "    def start(self, name):\n        authority = __phase_authority__\n        decision = 'ORIGINAL' if self.root.name == 'return-before-commit' else 'CANDIDATE'\n        authority.operation(decision, 'start')\n")
    source=once(source,'        self.d.start(self.root, name)\n',
        "        authority.operation(decision, 'start')\n        self.d.start(self.root, name)\n")
    return source

def sequencer(source):
    source=method(source,'Bridge','app_matches','''
        def app_matches(self, name, config):
            module = __phase_loader__.local_module(self.switch / 'ops.py')
            app = self.apps().get(name)
            if app is None: return False
            try: module.Operations(self.switch, module.System()).config(app, config[name])
            except (RuntimeError, KeyError): return False
            return True
    ''')
    source=once(source, "        import importlib.util\n        spec = importlib.util.spec_from_file_location('v4_capture_ops', self.switch / 'ops.py')\n        module = importlib.util.module_from_spec(spec)\n        sys.path.insert(0, str(self.switch))\n        spec.loader.exec_module(module)\n", "        module = __phase_loader__.local_module(self.switch / 'ops.py')\n")
    # One transport intercepts Python and Node children (including delegated.py).
    source=once(source,'        result = subprocess.run(args, input=input_text, text=True,',
        '        from child_transport import command\n        args = command(__phase_authority__, args)\n        result = subprocess.run(args, input=input_text, text=True,')
    return source

def delegated(source):
    return once(source,'    command, action, root = sys.argv[1:4]\n',
        '    __phase_authority__.revalidate()\n    command, action, root = sys.argv[1:4]\n')

def execution_check(source):
    # The former template namespace is now checked against authenticated root data.
    line=next(s for s in source.splitlines(True)if 'assert(__dirname.startsWith('in s)
    return once(source,line,
        "  assert(globalThis.__re7Authority && path.dirname(__dirname) === globalThis.__re7Authority.root, 'authority_node_scope');\n")
