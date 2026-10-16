"""Future read-only recovery authority. No candidate filesystem precheck/overlay."""
import hashlib
import json
import os
from pathlib import Path

API = 're7-whatsapp-agent'
WORKER = 're7-whatsapp-web-worker'
FRONT = 're7-admin-front'
MODES = ('switch', 'return', 'return-partial', 'return-before-commit')
ORIGINAL = 'return-before-commit'


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def same(saved, observed):
    return bool(saved and observed and saved['ticks'] == observed['ticks'] and observed['state'] != 'Z')


def present(path):
    return os.path.lexists(path)


def root_mode(mode):
    require(mode in MODES, 'root_capture_mode_denied')
    return 'switch' if mode == 'switch' else 'return'


class Contract:
    """New future seal is pinned by caller/manifest; existing sealed inputs unchanged.

    The factory passes the expected digest from its reviewed manifest, never from
    a writable sidecar beside this file. Tests supply that pin from synthetic data.
    """
    def __init__(self, root, bridge, expected_digest):
        self.root = Path(root)
        self.window = self.root / 'window'
        self.b = bridge
        file = self.window / 'recovery-contract.private.json'
        require(sha(file) == expected_digest, 'recovery_contract_hash_drift')
        self.seal = read(file)
        require(self.seal['version'] == 1, 'recovery_contract_version')
        required = {'window/source.profile.private.json', 'window/target.profile.private.json',
                    'window/csv-baseline.private.json', 'window/initial.private.json',
                    'window/mode-names.private.json', 'window/mode-manifest-v4.json',
                    'window/deploy.crontab.before', 'window/deploy.crontab.window',
                    'window/re7-converta-backup.before', 'window/re7-converta-backup.window'}
        required |= {m + '/' + n for m in MODES for n in
                     ('candidate.config.private.json', 'return.config.private.json', 'plan.private.json')}
        refs = self.seal['filesSha256']
        require(set(refs) == required, 'recovery_reference_coverage')
        for name, digest in refs.items():
            require(sha(self.root / name) == digest, 'recovery_reference_drift:' + name)
        names = read(self.window / 'mode-names.private.json')
        manifest = read(self.window / 'mode-manifest-v4.json')
        require(set(names) == set(manifest['modeFiles']) == set(manifest['modeManifests']) == set(MODES),
                'recovery_four_mode_manifest')
        original_files = manifest['modeFiles'][ORIGINAL]
        require(set(names[ORIGINAL]) == set(original_files) and
                {'ops.py'} <= set(original_files), 'original_mode_code_coverage')
        for name, digest in original_files.items():
            require(Path(name).name == name and sha(self.root / ORIGINAL / name) == digest,
                    'original_mode_code_hash')
        require(sha(self.root / ORIGINAL / 'scripts.sha256') == manifest['modeManifests'][ORIGINAL],
                'original_mode_manifest_hash')
        required_code = {'recovery.py', 'recovery_contract.py', 'recovery_bridge.py', 'recovery_start.py',
                         'csv_cli.py', 'csv_start_gate.py', 'csv_boundary.py', 'prestop_contract.py', 'sequencer.py',
                         'baseline_contract.py', 'scheduled_controls.py'}
        require(set(self.seal['codeSha256']) == required_code, 'recovery_common_code_coverage')
        for name, digest in self.seal['codeSha256'].items():
            require(sha(self.window / name) == digest, 'recovery_common_code_hash')
        self.source = read(self.window / 'source.profile.private.json')
        self.target = read(self.window / 'target.profile.private.json')
        require(self.seal['sourceProfileSha256'] == sha(self.window / 'source.profile.private.json')
                and self.seal['targetProfileSha256'] == sha(self.window / 'target.profile.private.json'),
                'recovery_profile_pin')
        from csv_boundary import profile_delta
        candidate = next(a for a in self.target['apps'] if a['name'] == API)
        profile_delta(self.source, self.target, candidate['cwd'])
        require(self.seal['preservedCredentials'] == ['NEWauth', 'NEWDB', 'NEWcipher'],
                'credential_epoch_contract')
        # Same mode profile relations as the canonical CSV contract.
        for mode in MODES:
            require(read(self.root / mode / 'plan.private.json')['mode'] == mode, 'recovery_mode_drift')
            require(read(self.root / mode / 'candidate.config.private.json') ==
                    (self.source if mode == ORIGINAL else self.target), 'recovery_mode_target')
            require(read(self.root / mode / 'return.config.private.json') ==
                    (self.source if mode in ('switch', ORIGINAL) else self.target), 'recovery_mode_source')
        self.baseline = read(self.window / 'csv-baseline.private.json')
        require(set(self.baseline['apps']) == {API, WORKER, FRONT}, 'recovery_baseline_population')
        guard = self.b.guard()
        require(not guard['open'] and guard['generation'] == 38 and not guard['tasks']
                and not guard.get('ledgerFault'), 'recovery_guard38')
        apps = self.b.apps()
        front = self.baseline['apps'][FRONT]
        require(FRONT in apps and apps[FRONT]['pid'] == front['pid']
                and same(front['identity'], self.b.identity(front['pid'])), 'recovery_frontend_identity')

    def source_live(self):
        apps = self.b.apps()
        require(set(apps) == {API, WORKER, FRONT}, 'prestop_process_population')
        config = {a['name']: a for a in self.source['apps']}
        for name in apps:
            old = self.baseline['apps'][name]
            require(apps[name]['pid'] == old['pid'] and same(old['identity'], self.b.identity(old['pid']))
                    and self.b.app_matches(name, config), 'prestop_original_identity')

    def original_allowed(self, sequencer):
        # Recover only the exact original configuration, independent of candidate Event parents.
        self.b.privileged('check-present')
        sequencer.verify_stopped('switch')
        self.b.verify_recovery_exit('switch')  # Existing Operations absence/DB/restore predicates.
        self.b.verify_no_candidate_admission()  # Fresh scoped SELECT, never HTTP silence.
        self.b.verify_original_artifact_and_bindings(self.source)
        self.b.scheduled_controls().verify('contained')

    def selected(self):
        from csv_boundary import stage_boundary
        stage_boundary(self.root, 'return')  # Exact canonical selection/intent hash checks.

    def policy(self, mode):
        return self.b.verify_recovery_policy(mode, self.source if mode == ORIGINAL else self.target)

    def closure(self, mode, *, prestop=False):
        cfg = {a['name']: a for a in (self.source if mode == ORIGINAL or prestop else self.target)['apps']}
        require(set(self.b.apps()) == set(cfg) and all(self.b.app_matches(n, cfg) for n in cfg),
                'recovery_closure_config')
        self.b.verify_recovery_closure(mode, cfg, prestop=prestop)
        self.b.scheduled_controls().verify('before')
        self.b.privileged('check-absent')
        g = self.b.guard()
        require(not g['open'] and g['generation'] == 38 and not g['tasks'] and not g.get('ledgerFault'),
                'recovery_closure_guard')
