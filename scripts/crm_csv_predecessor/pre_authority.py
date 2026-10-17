"""Owner-reviewed READ ONLY launch, before phase authority exists.

No Context query/anchor/permit. The owner reviews the literal program emitted by
owner_program (including its manifest digest and library bytes), independently of
the preparation. A package-supplied argv/env/digest is NOT authority. Programs for
real preparations must be published/reviewed before use; this module emits none
on import. Python/Node/OS toolchains remain separate protected prerequisites.
"""
import base64
import builtins
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import types

INITIAL = ('window/root_readonly.py', 'window/pre_install.py')
MODES = ('switch', 'return', 'return-partial', 'return-before-commit')


def require(ok, why):
    if not ok: raise RuntimeError(why)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def owner_program(runtime_raw, reader_raw, root, review_sha, *, entry=None, argv=(), broker=False):
    """Review material, not authorization by itself. No filesystem writes/effects.

    The emitted program must itself be authenticated by the owner's reviewed
    command (same canonical hash/compile-bytes mechanism). It embeds BOTH code
    blobs; it never hashes a launcher then imports it from disk.
    """
    if not broker: require(entry in INITIAL, 'owner_review_initial_entry')
    constants = repr((str(root), review_sha, entry, list(argv), broker))
    return ('''import base64,hashlib,json,sys
_RUNTIME=base64.b64decode(%r);_READER=base64.b64decode(%r)
assert hashlib.sha256(_RUNTIME).hexdigest()==%r,'review_runtime_bytes'
assert hashlib.sha256(_READER).hexdigest()==%r,'review_reader_bytes'
_r={'__name__':'canonical_review_reader'}
exec(compile(_READER,'<reviewed canonical reader>','exec'),_r)
_n={'__name__':'owner_review_runtime','REVIEW_READ':_r['read'],'RUNTIME_RAW':_RUNTIME,'READER_RAW':_READER}
exec(compile(_RUNTIME,'<reviewed pre-authority runtime>','exec'),_n)
_root,_review,_entry,_argv,_broker=%s
if _broker:
 _request=json.loads(sys.argv[1]);_n['broker'](_root,_review,_request)
else:_n['launch'](_root,_review,_entry,_argv)
''' % (base64.b64encode(runtime_raw).decode(), base64.b64encode(reader_raw).decode(),
       digest(runtime_raw), digest(reader_raw), constants)).encode()


def compile_library(name, raw, trusted=None):
    module = types.ModuleType(name)
    trusted = trusted or {}
    def importing(key, *args, **kwargs):
        if key in trusted: return trusted[key]
        require(key.split('.')[0] in sys.stdlib_module_names and key != '__main__',
                'authority_import_undeclared:'+key)
        return builtins.__import__(key, *args, **kwargs)
    module.__builtins__ = dict(vars(builtins), __import__=importing)
    exec(compile(raw, '<reviewed '+name+'>', 'exec'), module.__dict__)
    return module


class Review:
    """Static owner review adapter for the EXISTING Loader, not phase authority.

    No invented UID/modes, phase, anchor or permit. Existing canonical checkers
    still inspect actual data/metadata. Starting/containing is never authorized.
    """
    def __init__(self, root, review_sha):
        self.root = Path(root); self.expected = review_sha; self.raw = {}
        self.plan_raw = REVIEW_READ(self.root/'COMPOSITION.json')
        require(digest(self.plan_raw) == review_sha, 'owner_review_manifest_drift')
        self.plan = json.loads(self.plan_raw)
        require(self.plan['kind'] == 'STATIC_CODE_COMPOSITION_NOT_PHASE_AUTHORITY'
                and self.plan['executionAuthorized'] is False
                and self.plan['operationallyCertified'] is False, 'owner_review_kind')
        files = self.plan['files']; deps = self.plan['eagerDependencies']; imports = self.plan['imports']
        require(set(files) == set(deps) == set(imports), 'owner_review_dependency_coverage')
        for name in files:
            require(not Path(name).is_absolute() and '..' not in Path(name).parts
                    and str(Path(name)) == name, 'owner_review_path')
            require(set(deps[name]) <= set(files) and set(imports[name].values()) <= set(files),
                    'owner_review_dependency_missing')
        require(self.file('review/pre_authority.py') == RUNTIME_RAW
                and self.file('review/reader.py') == READER_RAW, 'owner_review_runtime_index_drift')
        # Use canonical topo/require extracted from the accepted compositor.
        graph = self.file('review/graph.py')
        self.raw.update({'review/pre_authority.py': RUNTIME_RAW,
                         'review/reader.py': READER_RAW, 'review/graph.py': graph})
        compile_library('canonical_graph', graph).topo(deps)
        entries = {n: 'inspect' for n in INITIAL}
        entries.update({m+'/ops.py': 'inspect' for m in MODES})
        entries.update({m+'/baseline_contract.py': 'inspect' for m in MODES})
        entries.update({'window/current-sql.cjs': 'inspect', 'window/restore_contract.py': 'inspect'})
        entries = {n: scope for n, scope in entries.items() if n in files}
        language = lambda n: 'python' if n.endswith('.py') else 'commonjs' if n.endswith('.cjs') else 'json' if n.endswith('.json') else 'data'
        self.manifest = {'files': {n: dict(row, language=language(n)) for n, row in files.items()},
                         'dependencies': deps, 'imports': imports, 'entries': entries}
        # permit=None expresses ABSENCE only, for Loader.mode_module's read-only
        # branch; no phase bundle or installation is manufactured.
        self.bundle = {'manifest': self.manifest, 'permit': None}
        self.revalidate()

    def file(self, name):
        require(name in self.plan['files'], 'owner_review_file_undeclared')
        raw = REVIEW_READ(self.root/name); row = self.plan['files'][name]
        require(len(raw) == row['bytes'] and digest(raw) == row['sha256'], 'owner_review_source_drift')
        return raw

    def revalidate(self, purpose='inspect', *args, **kwargs):
        require(purpose == 'inspect', 'owner_review_not_phase_authority')
        require(REVIEW_READ(self.root/'COMPOSITION.json') == self.plan_raw, 'owner_review_replaced')
        for name, raw in self.raw.items():
            require(self.file(name) == raw, 'owner_review_source_replaced')
        return self

    def start_mode(self, *args, **kwargs):
        raise RuntimeError('owner_review_no_start_authority')

    def snapshot(self, entry):
        require(entry in self.manifest['entries'], 'owner_review_entry_denied')
        result = {}
        def collect(name):
            if name in result: return
            result[name] = self.file(name)
            for child in set(self.manifest['dependencies'][name]) | set(self.manifest['imports'][name].values()):
                collect(child)
        collect(entry)
        if entry == 'window/pre_install.py':
            # check_current loads these explicit inspect libraries/children late.
            # Authenticate them all before the first pre-install instruction.
            for target in self.manifest['entries']:
                if target not in INITIAL:
                    collect(target)
        # Auth libraries are also captured before any preparation import.
        for name in ('protected/authority.py', 'protected/verified_loader.py',
                     'protected/recovery-node-launch.cjs'):
            collect(name)
        self.raw.update(result); self.revalidate()
        return result

    def child_command(self, args):
        if not args or Path(args[0]).name not in ('python', 'python3', 'node'): return args
        require(len(args) >= 2 and Path(args[1]).is_absolute(), 'authority_child_bypass')
        entry = str(Path(args[1]).relative_to(self.root)); self.snapshot(entry)
        request = ['python' if Path(args[0]).name != 'node' else 'node-snapshot', entry, list(args[2:])]
        program = owner_program(RUNTIME_RAW, READER_RAW, self.root, self.expected, broker=True)
        if request[0] == 'python':
            return ['/usr/bin/python3', '-I', '-S', '-c', program.decode(), json.dumps(request)]
        node = self.raw['protected/recovery-node-launch.cjs']
        # Same authenticated Node bootstrap, same Python broker on each freshness
        # query. No require() of a mutable preparation/bootstrap path.
        code = '''const cp=require('node:child_process'),vm=require('node:vm');
const program=%s,entry=%s,argv=%s,source=%s;
const m={exports:{}};vm.runInThisContext('(function(require,module,exports){'+source+'\\n})')(require,m,m.exports);
const transport=(command,options)=>{
 const cut=command.indexOf('--');const rest=cut<0?[]:command.slice(cut+1);
 return cp.execFileSync('/usr/bin/python3',['-I','-S','-c',program,JSON.stringify([command[0],command[1],rest])],options);
};m.exports.run(entry,['--diagnostic-window',%s,...argv],transport);
''' % (json.dumps(program.decode()), json.dumps(entry), json.dumps(args[2:]), json.dumps(node.decode()), json.dumps(str(self.root/'window')))
        return ['/usr/bin/env', '-u', 'NODE_OPTIONS', '-u', 'NODE_PATH', '/usr/bin/node', '-e', code]

    def loader(self, entry):
        self.snapshot(entry)
        authority = compile_library('canonical_authority', self.raw['protected/authority.py'])
        loader = compile_library('canonical_loader', self.raw['protected/verified_loader.py'], {'authority': authority})
        transport = types.ModuleType('review_child_transport'); transport.command = self.child_command
        return loader.Loader(self, entry, trusted_modules={'authority': authority, 'child_transport': transport})


def launch(root, review_sha, entry, argv=()):
    require(entry in INITIAL, 'owner_review_initial_entry')
    view = Review(root, review_sha)
    return view.loader(entry).execute(argv)


def broker(root, review_sha, request):
    require(type(request) is list and len(request) == 3, 'owner_review_child_request')
    action, entry, argv = request; view = Review(root, review_sha)
    require(action in ('python', 'node-snapshot') and type(argv) is list, 'owner_review_child_action')
    if action == 'python':
        require(entry in {m+'/baseline_contract.py' for m in MODES}, 'owner_review_python_child_denied')
    else:
        require(entry == 'window/current-sql.cjs', 'owner_review_node_child_denied')
    loader = view.loader(entry)
    if action == 'python': return loader.execute(argv)
    require(view.manifest['files'][entry]['language'] == 'commonjs', 'owner_review_child_language')
    # Explicit owner-review correlation, NOT a root-phase identity/permit.
    print(json.dumps({'root': str(view.root), 'entry': entry, 'identity': ['OWNER_REVIEW', review_sha],
          'correlation': {'ownerReviewSha256': review_sha}, 'manifest': view.manifest,
          'files': {n: base64.b64encode(raw).decode() for n, raw in loader.raw.items()}}))
