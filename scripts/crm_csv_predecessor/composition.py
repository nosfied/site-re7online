"""Extension of the accepted compositor hook. In-memory code only, never a kit CLI."""
import ast
import hashlib
from pathlib import Path
import subprocess
import sys
import types
from . import sources

ROOT = sources.ROOT
REVIEW = sources.REVIEW
BASE = '6adfb37e7a4d4d7a03b6b92f878d78ff45b05487'
CHAIN = REVIEW / 'crm-csv-original-chain-20261016'


def reviewed(path):
    raw = subprocess.check_output(['git', 'show', BASE + ':' + str(path.relative_to(ROOT))], cwd=ROOT)
    if path.read_bytes() != raw:
        raise RuntimeError('accepted_compositor_source_drift')
    return raw


def library(name, raw, path):
    m = types.ModuleType(name); m.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), m.__dict__)
    return m


def selected_functions(path, names, imports=''):
    # Same accepted functions, not a second reader or graph validator.
    tree = ast.parse(reviewed(path))
    body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    if {n.name for n in body} != set(names):
        raise RuntimeError('canonical_library_interface_drift')
    return (imports + ast.unparse(ast.Module(body=body, type_ignores=[])) + '\n').encode()


def apply(code, origins, bundle):
    for name, expected in sources.INPUTS.items():
        if sources.digest(code[name]) != expected:
            raise RuntimeError('predecessor_consumer_interface_drift')
    for name, raw in bundle.items():
        code[name] = raw
        prior = origins.get(name)
        origins[name] = {'input': prior['input'] if prior else 'scripts/crm_csv_predecessor/runtime.py',
                         'inputSha256': sources.INPUTS.get(name, sources.RUNTIME_SHA),
                         'priorOrigin': prior, 'stages': ['PREDECESSOR_REVIEWED_SOURCE_EXTENSION'],
                         'transformation': {'path': 'scripts/crm_csv_predecessor/sources.py',
                             'sha256': sources.digest(Path(sources.__file__).read_bytes())}}

    # Extra launch libraries are review-only static sources, not installed authority.
    paths = {
        'review/pre_authority.py': Path(__file__).with_name('pre_authority.py').read_bytes(),
        'review/reader.py': selected_functions(REVIEW/'crm-csv-postrpc-diagnostics-20261017/launch.py',
            ['metadata', 'read'], 'import os,stat\nfrom pathlib import Path\n'),
        'review/graph.py': selected_functions(REVIEW/'crm-csv-root-authority-b4-20261016/compose_static.py',
            ['require', 'topo']),
    }
    for name, raw in paths.items():
        if name in code: raise RuntimeError('review_library_collision')
        inputs = {
            'review/pre_authority.py': ('scripts/crm_csv_predecessor/pre_authority.py', None),
            'review/reader.py': (str((REVIEW/'crm-csv-postrpc-diagnostics-20261017/launch.py').relative_to(ROOT)), ['metadata', 'read']),
            'review/graph.py': (str((REVIEW/'crm-csv-root-authority-b4-20261016/compose_static.py').relative_to(ROOT)), ['require', 'topo']),
        }
        source, selected = inputs[name]
        code[name] = raw; origins[name] = {'input': source,
            'inputSha256': sources.digest((ROOT/source).read_bytes()), 'selectedFunctions': selected,
            'stages': ['OWNER_REVIEW_ONLY_NOT_PHASE_AUTHORITY']}


def compose(predecessor_raw):
    # Explicit code-only call: no made-up profiles, future policy or installer bindings.
    bundle, contract = sources.compose_inputs(predecessor_raw, source_only=True)
    if contract is not None: raise RuntimeError('code_only_contract')
    dp = CHAIN/'delta.py'; delta = library('accepted_chain_delta', reviewed(dp), dp)
    def combined(code, origins):
        delta.apply(code, origins)
        apply(code, origins, bundle)
    replacement = types.SimpleNamespace(apply=combined)
    prior = sys.modules.get('delta'); sys.modules['delta'] = replacement
    cp = CHAIN/'compose.py'
    try: composer = library('future_predecessor_composition', reviewed(cp), cp)
    finally:
        if prior is None: sys.modules.pop('delta', None)
        else: sys.modules['delta'] = prior
    plan, objects = composer.compose()
    if plan['cycles']: raise RuntimeError('predecessor_seal_cycle')
    plan['compositionBase'] = BASE
    plan['certification'] = 'DENY_OPERATIONAL_INPUTS'
    plan['ownerReviewEntries'] = ['window/root_readonly.py', 'window/pre_install.py']
    for path in (Path(__file__), Path(sources.__file__), Path(__file__).with_name('pre_authority.py')):
        plan['transformInputs'][str(path.relative_to(ROOT))] = {
            'sha256': sources.digest(path.read_bytes()), 'authority': 'review source only'}
    return plan, objects


def owner_launch_program(plan, objects, root, review_sha, entry):
    """Render for INDEPENDENT owner review; never authorize or execute a launch.

    Uses only the libraries from this exact composition, not a second path import.
    The resulting literal program/hash still needs the canonical owner approval.
    No production program is rendered by compose() or by importing this module.
    """
    if sources.digest((__import__('json').dumps(plan, sort_keys=True, indent=2)+'\n').encode()) != review_sha:
        raise RuntimeError('owner_launch_review_index_mismatch')
    if entry not in plan['ownerReviewEntries']:
        raise RuntimeError('owner_launch_entry_denied')
    payloads = []
    for name in ('review/pre_authority.py', 'review/reader.py'):
        row = plan['files'][name]; raw = objects[row['sha256']]
        if len(raw) != row['bytes'] or sources.digest(raw) != row['sha256']:
            raise RuntimeError('owner_launch_library_drift')
        payloads.append(raw)
    runtime, reader = payloads
    module = library('reviewed_owner_program_renderer', runtime, Path('<reviewed-renderer>'))
    argv = [str(root)] if entry == 'window/pre_install.py' else []
    return module.owner_program(runtime, reader, root, review_sha, entry=entry, argv=argv)
