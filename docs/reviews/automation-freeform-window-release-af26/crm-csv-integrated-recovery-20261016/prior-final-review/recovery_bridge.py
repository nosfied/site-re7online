"""Future canonical Bridge extension. Methods execute only on explicit recovery calls.

Tests substitute OS/HTTP/DB/root observations, never invoke this against a VPS.
"""
import datetime
import json
import os
import stat
from pathlib import Path
from sequencer import Bridge as CanonicalBridge
from recovery_contract import API, WORKER, FRONT, ORIGINAL, read, require, sha
from prestop_contract import path_bindings


ORIGINAL_ACTIONS = frozenset(('recover-partial', 'start:' + API, 'start:' + WORKER,
                              'unfence', 'verify-unfenced', 'restore-controls'))


def authorize_protocol(mode, action):
    if mode == ORIGINAL:
        require(action in ORIGINAL_ACTIONS, 'original_recovery_action_denied')


class Bridge(CanonicalBridge):
    SAVED_ROOT = Path('/home/deploy/.pm2')

    def __init__(self, root, policy_hash):
        super().__init__(root)
        self.recovery_policy_hash = policy_hash

    def protocol(self, mode, action):
        authorize_protocol(mode, action)
        return super().protocol(mode, action)

    def verify_recovery_admission(self):
        gates = read(self.window / 'execution-gates.private.json')
        require(set(gates) == {'ownerAuthorized', 'preflightReviewed', 'artifactsVerified',
                              'restoreVerified', 'discrepanciesResolved'} and
                all(v is True for v in gates.values()), 'recovery_admission_gates')
        require((self.root / 'execution-authorized').read_text().strip() == 'true', 'recovery_not_authorized')

    def verify_recovery_exit(self, mode):
        import ops
        op = ops.Operations(self.root / mode, ops.System())
        op.restore_proof(); op.guard()
        op.old_absent(read(self.root / mode / 'stop-start.json'))
        require(op.d.db_zero() == {'otherClientBackends': 0, 'advisoryLocks': 0}, 'unknown_db_owner')
        from csv_boundary import exit_and_imports
        exit_and_imports({'oldExitConfirmed': True, 'ownershipComplete': True, 'sqlZero': True,
                         'sha256': sha(self.root / mode / 'old-exit-confirmed.json')},
                        read(self.window / ('csv-imports-' + mode + '-after-exit.private.json')))

    def verify_no_candidate_admission(self):
        # Same scoped zero-Event check as the attested original-only recovery.
        sql = ('BEGIN READ ONLY;SET LOCAL statement_timeout=5000;SELECT count(*) FROM "Event" '
               'WHERE "eventName" IN (\'crm.contact.import.started\',\'crm.contact.import.classified\','
               '\'crm.contact.import.row\',\'crm.contact.import.finished\',\'crm.contact.import.uncertain\');ROLLBACK;')
        count = self.run(['docker', 'exec', '-i', 'wa-agent-postgres', 'psql', '-X', '-U', 'wa_agent',
                          '-d', 'whatsapp_agent', '-Atq', '-v', 'ON_ERROR_STOP=1'], input_text=sql).strip()
        require(count == '0', 'candidate_admission_not_proven_absent')

    def verify_original_artifact_and_bindings(self, source):
        original_bindings(self.window, {a['name']: a for a in source['apps']})
        seal = read(self.window / 'recovery-contract.private.json')
        require(sha(seal['eventSource']['path']) == seal['eventSource']['beforeSha256'], 'original_event_source_drift')
        for cfg in source['apps']:
            require(sha(cfg['script']) == seal['sourceScriptSha256'][cfg['name']], 'original_script_drift')

    def verify_recovery_policy(self, mode, profile):
        require(mode in (ORIGINAL, 'return', 'return-partial'), 'recovery_policy_mode')
        policy = read(self.window / 'privileged-policy.private.json')
        require(sha(self.window / 'privileged-policy.private.json') == self.recovery_policy_hash,
                'recovery_policy_bytes_drift')
        proof = self.window / 'recovery-policy-permit.private.json'
        meta = proof.lstat()
        require(stat.S_ISREG(meta.st_mode) and meta.st_uid == os.getuid() and stat.S_IMODE(meta.st_mode) == 0o600
                and meta.st_nlink == 1 and not proof.is_symlink(), 'recovery_root_permit_metadata')
        from recovery_binding import ROOT_POLICY_PERMIT_SHA256
        require(sha(proof) == ROOT_POLICY_PERMIT_SHA256, 'recovery_root_export_hash')
        receipt = read(proof)
        require(receipt['policySha256'] == self.recovery_policy_hash and receipt['phase'] == 'fenced'
                and receipt['targetProfileSha256'] == sha(self.window /
                    ('source.profile.private.json' if mode == ORIGINAL else 'target.profile.private.json')),
                'recovery_root_permit_drift')
        age = (datetime.datetime.now(datetime.timezone.utc) -
               datetime.datetime.fromisoformat(receipt['capturedUtc'])).total_seconds()
        require(0 <= age < 600, 'recovery_root_permit_stale')
        expected = {a['name']: {'cwd': a['cwd'], 'script': a['script'], 'sha256': sha(a['script'])}
                    for a in profile['apps'] if a['name'] in (API, WORKER)}
        require(policy['targetProcesses']['return'] == expected, 'recovery_root_return_target')
        self.privileged('check-present')

    def verify_recovery_closure(self, mode, config, *, prestop=False):
        # Existing validate.cjs checks remain; this independently checks final controls.
        for name in ('dump.pm2', 'dump.pm2.bak'):
            path = self.SAVED_ROOT / name; meta = path.lstat()
            require(stat.S_ISREG(meta.st_mode) and not path.is_symlink() and meta.st_uid == os.getuid()
                    and stat.S_IMODE(meta.st_mode) == 0o600, 'recovery_saved_fallback600')
            rows = read(path)
            require({a['name'] for a in rows} == set(config), 'recovery_saved_population')
            for app in rows:
                expected = config[app['name']]
                require(app['pm_cwd'] == expected['cwd'] and app['pm_exec_path'] == expected['script']
                        and all(app.get(k, app.get('env', {}).get(k)) == v for k, v in expected['env'].items()),
                        'recovery_saved_config')
        require((self.SAVED_ROOT / 'dump.pm2').read_bytes() ==
                (self.SAVED_ROOT / 'dump.pm2.bak').read_bytes(), 'recovery_saved_fallback_content')
        initial = read(self.window / 'initial.private.json')
        require(self.run(['systemctl', 'show', 'pm2-deploy.service', '--property=ActiveState,UnitFileState']) ==
                initial['supervision'], 'recovery_supervision')
        # HTTP checks only after release, never presented as under-fence health.
        self.node(mode if not prestop else 'return-before-commit', 'validate.cjs')

    def reset_recovery_gates(self):
        # Existing CSV atomic reset. Does not remove intents or touch credentials.
        from csv_cli import reset
        reset(self.root)

    def verify_recovery_gates_false(self):
        gates = read(self.window / 'execution-gates.private.json')
        require(set(gates) == {'ownerAuthorized', 'preflightReviewed', 'artifactsVerified',
                              'restoreVerified', 'discrepanciesResolved'} and
                all(v is False for v in gates.values()) and
                (self.root / 'execution-authorized').read_text().strip() == 'false', 'recovery_gates_not_false')


def original_bindings(window, config):
    """Same predicate; separate sealed original map, as in the proven dispatch adapter."""
    from recovery_binding import RECOVERY_CONTRACT_SHA256
    window = Path(window)
    require(sha(window / 'recovery-contract.private.json') == RECOVERY_CONTRACT_SHA256, 'original_bindings_contract')
    seal = read(window / 'recovery-contract.private.json')
    profile = window / 'source.profile.private.json'
    require(sha(profile) == seal['sourceProfileSha256'], 'original_binding_profile_drift')
    source = {a['name']: a for a in read(profile)['apps']}
    require(bool(config) and all(n in source and cfg == source[n] for n, cfg in config.items()),
            'original_binding_config_drift')
    folder = window / 'original-bindings'
    require(sha(folder / 'path-bindings.private.json') == seal['originalBindingsSha256'], 'original_binding_map_drift')
    return path_bindings(folder, config)
