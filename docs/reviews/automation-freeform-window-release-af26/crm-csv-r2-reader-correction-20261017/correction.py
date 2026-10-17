"""Future reader composition only. Hash-pinned consumed sources are never edited.
No import executes a collector or manufactures a configuration certificate.
"""
import ast
import hashlib
from pathlib import Path

BASE_SHA = '66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'
BASE = Path(__file__).resolve().parent.parent/'crm-csv-r2-directed-20261017/read_package.py'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('correction_anchor_count')
    return text.replace(old, new)


def function(text, name, body):
    node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == name)
    lines = text.splitlines(True)
    return ''.join(lines[:node.lineno-1]) + body.strip() + '\n' + ''.join(lines[node.end_lineno:])


FRONTEND = '''
FRONTEND_REFERENCE_SHA = 'e9a5dc97acc3b984f79670b33eed75167007137db64f012abfe9e768c67277e3'
FRONTEND_REFERENCE_PROVENANCE = {
    'approvedContext': 'crm-csv-staging-20261016/capture-context-v2.private.json',
    'reviewedComparisonCommit': '6889671ea5345c8771cdf2a438a64306b8d3e7b1',
    'sourceSha256': FRONTEND_REFERENCE_SHA,
    'selector': 'processReferences.processes[pid=188897]',
    'scope': 'historical representation only; not current configuration authority',
}
FRONTEND_SCRIPT_UNKNOWN = {
    'state': 'UNKNOWN', 'decision': 'DENY',
    'reason': 'canonical_frontend_configuration_proof_missing',
}


def frontend_reference(path):
    require(path is not None, 'frontend_reference_required')
    raw, metadata = stable_file(path)
    require(metadata['uid'] == os.getuid() and stat.S_IMODE(metadata['mode']) == 0o600,
            'frontend_reference_permissions')
    require(sha(raw) == FRONTEND_REFERENCE_SHA, 'frontend_reference_integrity')
    value = json.loads(raw)
    hint = HISTORICAL_CANDIDATES['frontend']
    rows = [r for r in value['processReferences']['processes'] if r['pid'] == hint['pid']]
    require(len(rows) == 1, 'frontend_reference_identity')
    profiles = [a for a in value['sourceProfile']['apps'] if a['name'] == 're7-admin-front']
    require(len(profiles) == 1 and profiles[0]['cwd'] == hint['cwd'] and
            profiles[0]['script'] == hint['script'], 'frontend_reference_profile')
    require(rows[0]['cwd'] == hint['cwd'] and re.fullmatch(r'[0-9a-f]{64}', rows[0]['cmdlineSha256'])
            is not None, 'frontend_reference_shape')
    return {'cmdlineSha256': rows[0]['cmdlineSha256'],
            'provenance': dict(FRONTEND_REFERENCE_PROVENANCE)}


def validate_frontend_observation(row, reference_path):
    reference = frontend_reference(reference_path)  # re-read authenticated source at use
    require(row['representation'] == {'state': 'HISTORICAL_MATCH',
            'cmdlineSha256': row['cmdlineSha256'], 'provenance': reference['provenance']} and
            row['cmdlineSha256'] == reference['cmdlineSha256'], 'frontend_representation_drift')
    # The historical title has no script marker. A distinct explicit environment
    # marker may be observed, but neither is a current configuration certificate.
    marker = row['selectedEnvironment'].get('pm_exec_path') == HISTORICAL_CANDIDATES['frontend']['script']
    require(row['scriptMarkerConfirmed'] is marker and
            row['scriptCertification'] == FRONTEND_SCRIPT_UNKNOWN,
            'frontend_script_certification_unproven')


def validate_frontend_certification(row):
    # No admissible current configuration proof source exists in this reader.
    # Do not accept a caller-supplied VERIFIED boolean or arbitrary new schema.
    require(False, 'canonical_frontend_configuration_proof_missing')
'''

PROXY = '''
def proxy_arguments(raw):
    require(type(raw) is bytes and 0 < len(raw) <= 16384 and raw.endswith(b'\\0'), 'proxy_argv_shape')
    argv = raw[:-1].split(b'\\0')
    require(argv[0] == b'/usr/bin/docker-proxy', 'proxy_not_confirmed')
    require(len(argv) <= 12 and all(argv), 'proxy_argv_shape')
    valued = {b'-host-ip', b'-host-port', b'-container-ip', b'-container-port', b'-proto'}
    values = {}; flags = []; i = 1
    while i < len(argv):
        key = argv[i]
        if key == b'-use-listen-fd':
            require(not flags, 'proxy_flag_duplicate')
            flags.append('-use-listen-fd'); i += 1
        else:
            require(key in valued, 'proxy_flag_unknown')
            require(key.decode() not in values, 'proxy_flag_duplicate')
            require(i+1 < len(argv) and bool(argv[i+1]) and not argv[i+1].startswith(b'-'),
                    'proxy_value_missing')
            values[key.decode()] = argv[i+1].decode(); i += 2
    require(set(values) == {k.decode() for k in valued}, 'proxy_options_missing')
    require(values['-proto'] == 'tcp' and values['-host-port'] == '5432', 'proxy_endpoint_changed')
    return values, flags


def proxy_channel(procroot):
    root=os.open(procroot,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fd=None
    try:
        fd=os.open('177517',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        before=proc_identity(read_at(fd,'stat',4096))
        require(before['pid']==177517 and before['ticks']=='96580070' and os.fstat(fd).st_uid==0,
                'proxy_candidate_identity_changed')
        raw=read_at(fd,'cmdline',16384);values,flags=proxy_arguments(raw)
        after=proc_identity(read_at(fd,'stat',4096))
        require(all(before[k]==after[k] for k in ('pid','ppid','ticks')), 'proxy_identity_changed')
        require(read_at(fd,'cmdline',16384)==raw, 'proxy_representation_changed')
        return {'identity':before,'uid':os.fstat(fd).st_uid,'args':values,'flags':flags,
                'cmdlineSha256':sha(raw),
                'containerIdentity':'UNKNOWN; no Docker inspection/SQL executed'}
    finally:
        if fd is not None:os.close(fd)
        os.close(root)
'''


def compose():
    raw = BASE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != BASE_SHA:
        raise RuntimeError('consumed_reader_source_integrity')
    text = raw.decode()
    text = text.replace('\ndef process(role,hint,procroot,cache):', FRONTEND + '\n\ndef process(role,hint,procroot,cache,frontend_reference_path=None):', 1)
    text = replace_once(text,
        "            require(script_seen,'process_script_unconfirmed');row['scriptMarkerConfirmed']=True",
        """            if role == 'frontend':
                reference = frontend_reference(frontend_reference_path)
                require(sha(command) == reference['cmdlineSha256'], 'frontend_representation_drift')
                row['representation'] = {'state':'HISTORICAL_MATCH', 'cmdlineSha256':sha(command),
                                         'provenance':reference['provenance']}
                row['scriptMarkerConfirmed'] = bool(script_seen)
                row['scriptCertification'] = dict(FRONTEND_SCRIPT_UNKNOWN)
                validate_frontend_observation(row, frontend_reference_path)
            else:
                require(script_seen,'process_script_unconfirmed');row['scriptMarkerConfirmed']=True""")
    text = replace_once(text, "        row['identityRechecked']=True", """        if role == 'frontend':
            require(read_at(fd,'cmdline',16384)==command, 'frontend_representation_changed')
            validate_frontend_observation(row, frontend_reference_path)
        row['identityRechecked']=True""")
    text = function(text, 'proxy_channel', PROXY)
    text = replace_once(text, 'def interval_checks(rows,procroot):', 'def interval_checks(rows,procroot,frontend_reference_path=None):')
    text = replace_once(text, "            require(os.readlink('cwd',dir_fd=fd)==old['cwd']", """            if role == 'frontend':
                validate_frontend_observation(old, frontend_reference_path)
                require(sha(read_at(fd,'cmdline',16384))==old['cmdlineSha256'], 'frontend_interval_representation_changed')
            require(os.readlink('cwd',dir_fd=fd)==old['cwd']""")
    text = replace_once(text, "    proxy=by['sql-proxy']['args']", """    proxy_now=proxy_channel(procroot)
    prior_proxy=by['sql-proxy']
    require(all(proxy_now['identity'][k]==prior_proxy['identity'][k] for k in ('pid','ppid','ticks')) and
            all(proxy_now[k]==prior_proxy[k] for k in ('uid','args','flags','cmdlineSha256')), 'proxy_interval_changed')
    proxy=by['sql-proxy']['args']""")
    text = replace_once(text, "    return {'freshProcTuplesRechecked':True", "    return {'frontendScriptCertification':dict(FRONTEND_SCRIPT_UNKNOWN), 'freshProcTuplesRechecked':True")
    text = replace_once(text, "def directed_inventory(procroot=Path('/proc')):", "def directed_inventory(procroot=Path('/proc'),frontend_reference_path=None):")
    text = replace_once(text, 'process(role,hint,procroot,cache))', 'process(role,hint,procroot,cache,frontend_reference_path))')
    text = replace_once(text, 'interval_checks(rows,procroot))', 'interval_checks(rows,procroot,frontend_reference_path))')
    text = replace_once(text, "    return {'result':'DIRECTED_INVENTORY_COMPLETE'", """    frontend=next((r['value'] for r in rows if r['label']=='process-frontend'),None)
    if frontend is not None:attempt('frontend-script-certification',lambda:validate_frontend_certification(frontend))
    return {'result':'DIRECTED_INVENTORY_COMPLETE'""")
    text = replace_once(text, 'def validate_directed_inventory(value):', 'def validate_directed_inventory(value,frontend_reference_path=None):')
    text = replace_once(text, "        if role!='daemon':require(", """        if role=='frontend':
            validate_frontend_observation(r,frontend_reference_path)
            validate_frontend_certification(r)
        if role!='daemon':require(""")
    text = replace_once(text, "        if role!='daemon':require(r['identity']['ppid']==HISTORICAL_CANDIDATES['daemon']['pid']and r['scriptMarkerConfirmed'],'directed_process_relation')", "        if role!='daemon':require(r['identity']['ppid']==HISTORICAL_CANDIDATES['daemon']['pid'],'directed_process_relation')\n        if role in ('api','worker'):require(r['scriptMarkerConfirmed'] is True,'directed_process_relation')")
    text = replace_once(text, 'def specs(raw):', 'def specs(raw,frontend_reference_path=None):')
    text = replace_once(text, "'-','directed'],raw)]", "'-','directed',str(frontend_reference_path)],raw)]")
    text = replace_once(text, 'def collect(package, raw, target=REMOTE, run=subprocess.run):', 'def collect(package, raw, target=REMOTE, run=subprocess.run, *, frontend_reference_path=None):')
    # These launch/custody interfaces propagate the authenticated reference path,
    # not authority from argv. frontend_reference checks its pinned bytes at use.
    text = text.replace('specs(raw)', 'specs(raw,frontend_reference_path)')
    text = text.replace('validate_directed_inventory(json.loads(stdout))', 'validate_directed_inventory(json.loads(stdout),frontend_reference_path)')
    text = replace_once(text, 'def validate_capture(raw, reader_raw):', 'def validate_capture(raw, reader_raw, *, frontend_reference_path=None):')
    text = text.replace("specs(b'')", "specs(b'',frontend_reference_path)")
    text = replace_once(text, "validate_directed_inventory(json.loads(base64.b64decode(row['stdoutBase64'])))", "validate_directed_inventory(json.loads(base64.b64decode(row['stdoutBase64'])),frontend_reference_path)")
    text = replace_once(text, 'def custody(package, raw, target=LOCAL, run=subprocess.run):', 'def custody(package, raw, target=LOCAL, run=subprocess.run, *, frontend_reference_path=None):')
    text = replace_once(text, 'lines=validate_capture(original,raw)', 'lines=validate_capture(original,raw,frontend_reference_path=frontend_reference_path)')
    text = replace_once(text, "    require(len(sys.argv)==2,'exact_action_required');action=sys.argv[1]", "    require(len(sys.argv) in (2,3),'exact_action_required');action=sys.argv[1]")
    text = replace_once(text, "value=directed_inventory();", "value=directed_inventory(frontend_reference_path=sys.argv[2] if len(sys.argv)==3 else None);")
    text = replace_once(text, "    ok=collect(package,raw)if action=='collect'else custody(package,raw)", "    reference=package/'frontend-reference.private.json'\n    ok=collect(package,raw,frontend_reference_path=reference)if action=='collect'else custody(package,raw,frontend_reference_path=reference)")
    compile(text, '<future R2 reader>', 'exec')
    return text.encode()
