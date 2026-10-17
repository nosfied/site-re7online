"""Pure future producer/transformations, not a package, installer or phase issuer.

Inputs are reviewed source bytes and preserved predecessor bytes. Outputs remain
in memory until a separately reviewed future compositor seals a NEW preparation.
No historical composer, installer, reader or consumed entrypoint is invoked.
"""
import ast
import copy
import hashlib
import json
import shlex
from pathlib import Path
from .runtime import POLICY_SOURCE, POLICY_PATH, require_contract

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / 'docs/reviews/automation-freeform-window-release-af26'
KIT = REVIEW / 'crm-csv-original-chain-20261016/static-kit'
OLD = 'fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251'
HELPER = '8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'
INPUTS = {
    'window/csv_contract.py': '9ca2208c5c18787aa2e3696636b17334c3362caa6991e3e4cd2bde2e363958eb',
    'window/original_checks.py': '8467c1ba1033f103598b2c6baaaf55ee6970af0e7bd225f64d90a5fe97733f82',
    'window/pre_install.py': '8e45c10319f298f69aa812df6996e950afbc0d2cdca5b06c25499b8bcd6f8f6d',
    'window/root_readonly.py': 'cb63a97fffe735fd52c80eed872751873593c23a3f8b3e3663b6c0fd741aa7ab',
    'window/admit_gates.py': '2681e63919b981291d376237975e7e8dd7379ccbc0f323a55f948487730705c6',
}
INSTALLER_SHA = 'b12603250d6d4acc5dc1b50fe94a1204631c7bbd4c6692b7ee8a47f4caa047ad'
OLD_PREPARATION = '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-openai-v4-20261015T203000Z'
OLD_TARGET = 'e2695c3dbfc318d56966cd5037f6bb036070f43bc9e355d4dacca088aa8925a4'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pinned(path, expected):
    raw = Path(path).read_bytes()
    if digest(raw) != expected:
        raise RuntimeError('reviewed_source_drift')
    return raw


def replace(text, old, new, count=1):
    if text.count(old) != count:
        raise RuntimeError('source_interface_drift')
    return text.replace(old, new)


def canonical_model(raw):
    # Reuse policy_from's EXACT body. Only its two IO statements are removed;
    # callers supply already authenticated bytes. No replacement schema/parser.
    src = pinned(KIT / 'objects' / (HELPER + '.source'), HELPER)
    tree = ast.parse(src)
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'policy_from')
    if [ast.unparse(n) for n in function.body[:2]] != ['root_regular(path)', 'raw = Path(path).read_bytes()']:
        raise RuntimeError('canonical_policy_interface_drift')
    function.name = 'parse'; function.args = ast.parse('def parse(raw): pass').body[0].args
    function.body = function.body[2:]
    # Compile only the canonical require and policy function: no helper entrypoint.
    req = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'require')
    namespace = {'Path': Path, 'json': json, 'hashlib': hashlib,
                 'base64': __import__('base64'),
                 'PREPARATIONS': Path('/opt/re7online/backups/converta-persistent/preparations')}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[req, function], type_ignores=[])), '<canonical-policy-model>', 'exec'), namespace)
    # The accepted e2 predecessor has no absentWorker. That branch would need
    # canonical external phase evidence; it is intentionally not synthesized.
    return namespace['parse'](raw)


def predecessor(raw):
    if type(raw) is not bytes or digest(raw) != POLICY_SOURCE:
        raise RuntimeError('predecessor_bytes_missing_or_drift')
    return canonical_model(raw)


def produce_contract(prior, raw):
    predecessor(raw)
    if prior['sourcePolicySha256'] != OLD:
        raise RuntimeError('producer_source_interface_drift')
    value = copy.deepcopy(prior)
    value['sourcePolicySha256'] = POLICY_SOURCE
    # Existing references are preserved. If a future input explicitly includes
    # this mutable install target as predecessor evidence, update only that row.
    for ref in value['immutable']:
        if ref['path'] == POLICY_PATH:
            if (ref['sha256'], ref['uid'], ref['mode']) != (OLD, 0, 0o600):
                raise RuntimeError('predecessor_reference_drift')
            ref['sha256'] = POLICY_SOURCE
    require_contract(value)
    return value


def validate_future(raw, preparation, source_processes, targets):
    if digest(raw) == POLICY_SOURCE:
        raise RuntimeError('predecessor_is_not_forward_policy')
    v = canonical_model(raw)
    if v['preparation'] != preparation or v['sourceProcesses'] != source_processes:
        raise RuntimeError('future_policy_source_identity')
    if v['targetProcesses'] != targets:
        raise RuntimeError('future_policy_target_actions')
    return digest(raw)


def sources(raw):
    """Single producer for checker/root/pre-A/admission bytes; no filesystem writes."""
    predecessor(raw)
    code = {n: pinned(KIT / 'objects' / (h + '.source'), h).decode() for n, h in INPUTS.items()}
    for n in ('window/csv_contract.py', 'window/original_checks.py'):
        t = replace(code[n], "POLICY_SOURCE='" + OLD + "'", 'from policy_predecessor import POLICY_SOURCE, require_contract')
        code[n] = replace(t, " require(c['sourcePolicySha256']==POLICY_SOURCE,'source_policy_or_model_drift')", ' require_contract(c)')
    t = code['window/root_readonly.py']
    t = replace(t, 'from pathlib import Path', 'from pathlib import Path\nfrom policy_predecessor import POLICY_SOURCE')
    code['window/root_readonly.py'] = replace(t, "'" + OLD + "'", 'POLICY_SOURCE')
    t = code['window/pre_install.py']
    t = replace(t, 'from check_current import check_current', 'from check_current import check_current\nfrom policy_predecessor import root_evidence')
    line = next(x for x in t.splitlines() if "'root_source_evidence')" in x)
    code['window/pre_install.py'] = replace(t, line, '    root_evidence(root)')
    t = code['window/admit_gates.py']
    t = replace(t, 'from check_current import check_current', 'from check_current import check_current\nfrom policy_predecessor import require_contract, root_evidence')
    line = next(x for x in t.splitlines() if "'root_source_drift')" in x)
    code['window/admit_gates.py'] = replace(t, line, "  require_contract(read(p/'window/csv-contract.private.json'));root_evidence(root)")
    code['window/policy_predecessor.py'] = Path(__file__).with_name('runtime.py').read_text()
    return {n: t.encode() for n, t in code.items()}


def installer(raw, preparation, archive, future_raw, source_processes, targets):
    """Render existing exclusive installer; predecessor CAS != future policy pin.

    No authority is inferred from these parameters: they must be sealed into the
    reviewed future package/owner installation, as in the existing trust model.
    This function itself cannot install, admit, issue, contain or start anything.
    """
    predecessor(raw)
    if not (Path(preparation).parent == Path(OLD_PREPARATION).parent
            and Path(preparation).name.startswith('incident-6683-v4-')
            and preparation != OLD_PREPARATION):
        raise RuntimeError('new_preparation_required')
    if not (Path(archive).parent == Path(POLICY_PATH).parent
            and Path(archive).name.startswith('incident-6683-window-policy.pre-')
            and archive != POLICY_PATH):
        raise RuntimeError('exclusive_archive_required')
    future_hash = validate_future(future_raw, preparation, source_processes, targets)
    t = pinned(Path(__file__).with_name('installer.source'), INSTALLER_SHA).decode()
    t = replace(t, 'P=' + OLD_PREPARATION, 'P=' + shlex.quote(preparation))
    old_archive = next(x for x in t.splitlines() if x.startswith('A='))
    t = replace(t, old_archive, 'A=' + shlex.quote(archive))
    t = replace(t, OLD_TARGET, future_hash, 3)
    t = replace(t, OLD, POLICY_SOURCE, 2)
    # Retain canonical shared lock, absent archive, helper/sudoers pins, validators,
    # backup and postchecks. Recheck predecessor after visudo, immediately before
    # first install, so a change during prechecks cannot be backed up/installed.
    cas = 'test "$(sudo sha256sum "$Q" | cut -d\' \' -f1)" = ' + POLICY_SOURCE
    t = replace(t, 'sudo install -o root -g root -m 0600 "$Q" "$A"', cas + '\nsudo install -o root -g root -m 0600 "$Q" "$A"')
    if t.count('python3 "$P/verify-package.py"') != 2:
        raise RuntimeError('installer_verifier_interface_drift')
    t = t.replace('python3 "$P/verify-package.py"', 'python3 "$P/verify-package.py"\npython3 -B "$P/window/pre_install.py" "$P"', 1)
    return t.encode()


def compose_inputs(raw, prior, preparation, archive, future_raw, source_processes, targets):
    """Mandatory coherent source bundle for a future compositor BEFORE sealing.

    Does not fill profiles, namespace identities, phase pins or permits. Those
    are explicit inputs of a separately reviewed future preparation, not outputs
    of this reconciliation. No generated package is written or certified here.
    """
    code = sources(raw)
    contract = produce_contract(prior, raw)
    code['install-api-window-policy.sh'] = installer(
        raw, preparation, archive, future_raw, source_processes, targets)
    return code, contract
