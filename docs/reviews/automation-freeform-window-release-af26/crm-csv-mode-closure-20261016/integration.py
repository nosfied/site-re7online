"""Pure future-source transforms. Historical sources are inputs, never edited.
Explicit code mode and evidence mode are deliberately distinct for old-exit proof.
"""
from pathlib import Path


def replace(text, old, new, count=1):
    if text.count(old)!=count:raise RuntimeError('transform_anchor:'+old[:100])
    return text.replace(old,new)


def loader(text):
    return text+'''
    def mode_module(self, mode):
        # Read-only library load; this does not authorize start/intent/effects.
        # The same Context retains root identity AND B2 execution correlation.
        from authority import MODES
        require(mode in MODES, 'authority_mode_scope')
        self.authority.revalidate()
        entry=mode+'/ops.py'
        require(self.authority.bundle['manifest']['entries'].get(entry)=='inspect',
                'authority_mode_inspect_entry_required')
        if self.authority.bundle['permit'] is not None:
            # An ORIGINAL permit cannot load CANDIDATE/switch code, or vice versa.
            self.authority.start_mode(self.authority.root/mode, purpose='closure')
        scoped=type(self)(self.authority,entry,trusted_modules=self.trusted_modules)
        return scoped.module(entry)
'''


def authority(text):
    # Reuse the SAME mode/decision mapping for inspection after unfence. Default
    # start semantics and every existing start caller stay unchanged.
    text=replace(text,'def start_mode(self, directory):',"def start_mode(self, directory, *, purpose='start'):")
    text=replace(text,'        directory = Path(directory)\n',"        require(purpose in ('start','closure'), 'authority_mode_purpose')\n        directory = Path(directory)\n")
    return replace(text,"else 'CANDIDATE', 'start')","else 'CANDIDATE', purpose)")


def sequencer(text):
    text=replace(text,'def app_matches(self, name, config):','def app_matches(self, mode, name, config):')
    text=replace(text,"module = __phase_loader__.local_module(self.switch / 'ops.py')","module = __phase_loader__.mode_module(mode)",2)
    text=replace(text,'module.Operations(self.switch, module.System())','module.Operations(self.root / mode, module.System())')
    for old,new in [
        ('self.app_matches(name, config)','self.app_matches(mode, name, config)'),
        ('self.app_matches(n, targets)','self.app_matches(mode, n, targets)'),
        ('self.b.app_matches(n, source) for n in apps), \'source_config_drift\'','self.b.app_matches(\'switch\', n, source) for n in apps), \'source_config_drift\''),
        ('self.b.app_matches(name, config)','self.b.app_matches(mode, name, config)'),
        ('self.b.app_matches(API, new)',"self.b.app_matches('switch', API, new)"),
        ('self.b.app_matches(WORKER, new)',"self.b.app_matches('switch', WORKER, new)"),
        ('self.b.app_matches(n, source)','self.b.app_matches(mode, n, source)')]:
        text=replace(text,old,new)
    return text


def bridge(text):
    text=replace(text,'def verify_recovery_exit(self, mode):','def verify_recovery_exit(self, mode, *, code_mode):')
    return replace(text,'        import ops\n', '        ops = __phase_loader__.mode_module(code_mode)\n')


def contract(text):
    text=replace(text,'self.b.app_matches(name, config)','self.b.app_matches(ORIGINAL, name, config)')
    text=replace(text,"self.b.verify_recovery_exit('switch')","self.b.verify_recovery_exit('switch', code_mode=ORIGINAL)")
    return replace(text,'self.b.app_matches(n, cfg)','self.b.app_matches(ORIGINAL if prestop else mode, n, cfg)')


def recovery(text):
    return replace(text,'self.b.verify_recovery_exit(mode)','self.b.verify_recovery_exit(mode, code_mode=mode)')


def current(text):
    # Extract the existing SQL/noWork/baseline/proofs body byte-for-byte. Only
    # its root and import mechanism change; no alternate SQL/checker/parser.
    import ast
    tree=ast.parse(text)
    node=next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and
              any(isinstance(t,ast.Name)and t.id=='code' for t in n.targets))
    js=ast.literal_eval(node.value)
    js=replace(js,"const p=process.argv[1],b=require(p+'/switch/preparation-bindings.cjs')",
               "const p=globalThis.__re7Authority.root,b=require('../switch/preparation-bindings.cjs')")
    line=text.splitlines()[node.lineno-1]
    text=replace(text,line,' from child_transport import command\n command_line=command(__phase_authority__,[\'node\',str(p/\'window/current-sql.cjs\')])')
    text=replace(text,"['node','-e',code,str(p)]",'command_line')
    text=replace(text,'b.app_matches(n,cfg)',"b.app_matches('switch',n,cfg)")
    text=replace(text,' import ops\n'," ops=__phase_loader__.mode_module('switch')\n")
    return text,js+'\n'


def apply(code,origins):
    transforms={'window/sequencer.py':sequencer,'window/recovery_bridge.py':bridge,
                'window/recovery_contract.py':contract,'window/recovery.py':recovery,
                'protected/verified_loader.py':loader,'protected/authority.py':authority}
    for name,fn in transforms.items():
        code[name]=fn(code[name].decode()).encode();origins[name]['stages'].append('EXPLICIT_AUTHENTICATED_MODE')
    code['window/check_current.py'],js=current(code['window/check_current.py'].decode())
    code['window/check_current.py']=code['window/check_current.py'].encode()
    origins['window/check_current.py']['stages'].append('EXPLICIT_AUTHENTICATED_MODE_AND_NODE')
    code['window/current-sql.cjs']=js.encode()
    origins['window/current-sql.cjs']={'input':'window/check_current.py:existing inline SQL body',
                                    'stages':['EXTRACT_EXISTING_SQL_BODY_AUTHENTICATED_NODE']}
    name='protected/recovery-node-launch.cjs'
    code[name]=replace(code[name].decode(),"['fs','path','assert','crypto'","['fs','path','assert','assert/strict','crypto'").encode()
    code[name]=replace(code[name].decode(),"      if(allowedBuiltins.has(core))return", "      deny(core!=='assert/strict'||name==='node:assert/strict','node_import_undeclared:'+name);\n      if(allowedBuiltins.has(core))return").encode()
    origins[name]['stages'].append('STRICT_ASSERT_BUILTIN_ONLY')
    # preparation-bindings.proofs uses this exact canonical isolated invocation.
    # Preserve direct baseline form too; arbitrary flags remain denied.
    code[name]=replace(code[name].decode(),
        "      if (command === '/usr/bin/python3' && Array.isArray(argv) && argv[0].startsWith(snap.root + '/') && argv[0].endsWith('.py')) {",
        "      const pyargs=Array.isArray(argv)&&argv.slice(0,3).join(' ')==='-B -I -S'?argv.slice(3):argv;\n"
        "      if (command === '/usr/bin/python3' && Array.isArray(pyargs) && typeof pyargs[0]==='string' && pyargs[0].startsWith(snap.root + '/') && pyargs[0].endsWith('.py')) {").encode()
    code[name]=replace(code[name].decode(),"path.relative(snap.root,argv[0])","path.relative(snap.root,pyargs[0])").encode()
    code[name]=replace(code[name].decode(),"...argv.slice(1)],options)","...pyargs.slice(1)],options)").encode()
    origins[name]['stages'].append('CANONICAL_RESTORE_CHILD_FLAGS')
