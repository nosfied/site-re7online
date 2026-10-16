"""Pure future helper/sudoers/diagnostic deltas; never edits or runs installed files."""
import ast

def once(source, old, new):
    if source.count(old)!=1:raise RuntimeError('authority_source_anchor')
    return source.replace(old,new,1)

def helper(source):
    source=once(source,"'authorize-return'})","'authorize-return', 'inspect-recovery-authority'})")
    source=once(source,"    if action == 'inspect':\n",'''    if action == 'inspect-recovery-authority':
        # This module is installed root-owned alongside the helper; never deploy code.
        from root_store import Store
        return Store().query_locked(sys.modules[__name__])
    if action == 'inspect':
''')
    # -I -S removes the script directory: explicitly allow only the protected
    # root library directory, before importing the separately installed module.
    source=once(source,"        from root_store import Store\n",'''        library = Path('/usr/local/libexec/re7')
        root_regular(library / 'root_store.py')
        root_regular(library / 'authority.py')
        sys.path.insert(0, str(library))
        from root_store import Store
''')
    return source

def sudoers(source):
    return once(source,"'restore-controls', 'abort-prestop')","'restore-controls', 'abort-prestop', 'inspect-recovery-authority')")

def diagnostics(source):
    return once(source,"'restore-controls', 'abort-prestop', 'authorize-switch', 'authorize-return'}",
                       "'restore-controls', 'abort-prestop', 'authorize-switch', 'authorize-return', 'inspect-recovery-authority'}")
