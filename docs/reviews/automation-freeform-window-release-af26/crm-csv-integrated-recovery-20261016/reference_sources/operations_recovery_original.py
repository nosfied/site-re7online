"""Unchanged minimal recovery consumer excerpts. No System effects or CLI."""
from pathlib import Path
import hashlib,json,os,sys
API='re7-whatsapp-agent'
WORKER='re7-whatsapp-web-worker'
FRONT='re7-admin-front'
NAMES={API,WORKER,FRONT}
PM='/home/deploy/.npm-global/bin/pm2'
def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def guard_state(value):
    require(type(value) is dict and type(value.get('version')) is int and
            value['version'] == 1 and type(value.get('open')) is bool and
            type(value.get('generation')) is int and value['generation'] >= 0 and
            type(value.get('tasks')) is dict and type(value.get('audit')) is list,
            'guard_schema_invalid')
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def same_process(saved, current):
    """PID is checked by callers; Linux R/S state is not process identity."""
    return bool(saved and current and saved['ticks'] == current['ticks'] and current['state'] != 'Z')


class Operations:
    def __init__(self, root, driver):
        self.root = Path(root)
        self.d = driver
        self.plan = json.loads((self.root / 'plan.private.json').read_text())
        self.source = {a['name']: a for a in json.loads((self.root / 'return.config.private.json').read_text())['apps']}
        self.target = {a['name']: a for a in json.loads((self.root / 'candidate.config.private.json').read_text())['apps']}
        self.window = self.root.parent / 'window'

    def write_once(self, name, data):
        with (self.root / name).open('x') as f:
            json.dump(data, f, indent=2)

    def guard(self):
        g = guard_state(self.d.guard())
        require(not g['open'] and not g['tasks'] and not g.get('ledgerFault'), 'guard_not_closed_drained')
        return g

    def config(self, app, cfg, fresh=False):
        require(app['pm2_env']['status'] == 'online' and app['pm2_env']['watch'] is False, 'process_not_stable')
        if fresh:
            require(app['pm2_env']['restart_time'] == 0, 'successor_restarted')
        self.d.check_config(app, cfg)
        require(self.d.identity(app['pid']) is not None, 'process_missing')

    def old_absent(self, report):
        for tree in report['trees'].values():
            self.tree_absent(tree)
        require(not self.d.sockets_present(report['sockets']), 'old_socket_alive')

    def tree_absent(self, tree):
        for pid, old in tree.items():
            now = self.d.identity(int(pid))
            require(not (old and now and old['ticks'] == now['ticks'] and now['state'] != 'Z'), 'old_executor_alive')

    def stop(self, frontend=False, recovery=False):
        require(not frontend, 'frontend_preserved_no_stop')
        self.guard()
        self.d.containment(self.window)
        self.restore_proof()
        apps = {a['name']: a for a in self.d.apps()}
        require(set(apps) <= NAMES, 'unknown_pm2_process')
        front_missing = recovery and self.plan.get('frontendAbsentAtRecovery', False)
        require(FRONT in apps or front_missing, 'frontend_missing')
        # Missing pair members are accepted only in explicitly bound recovery mode.
        require(set(apps) == NAMES or (recovery and self.plan['recovery']), 'unexpected_partial_composition')
        if frontend:
            self.certificate('old-exit-confirmed.json', FRONT)
        for name, app in apps.items():
            cfg = self.source[name]
            if frontend and name != FRONT:
                cfg = self.target[name]
            self.config(app, cfg)
        if recovery:
            require(self.plan['recovery'], 'recovery_not_bound')
            prior = json.loads((self.root.parent / 'switch' / 'stop-start.json').read_text())
            self.old_absent(prior)
            if front_missing:
                prior_front = json.loads((self.root.parent / 'switch' / 'front-stop-start.json').read_text())
                self.old_absent(prior_front)
        selected = {FRONT} if frontend else {API, WORKER}
        prefix = 'front' if frontend else 'pair'
        trees = {n: self.d.tree(a['pid']) for n, a in apps.items() if n in selected}
        report = {'direction': self.plan['direction'], 'selected': sorted(selected), 'trees': trees,
                  'sockets': self.d.socket_ids(trees.values()), 'generation': self.guard()['generation'],
                  'configHash': digest(self.target), 'frontend': {'pid': apps[FRONT]['pid'], 'identity': self.d.identity(apps[FRONT]['pid'])} if FRONT in apps else None}
        # Old one-use marker remains required and cannot be deleted on retry.
        self.write_once(prefix + '-stop-start.json', report)
        if not frontend:
            self.write_once('stop-start.json', report)
        for name in [API, WORKER, FRONT]:
            if name in selected and name in apps:
                self.guard()
                self.d.delete(name)
                # Historical ordering: prove this process/tree exited before
                # stopping the next process; never proceed after a survivor.
                for _ in range(25):
                    try:
                        self.tree_absent(trees[name])
                        break
                    except RuntimeError:
                        self.d.wait()
                self.tree_absent(trees[name])
                require(not any(a['name'] == name for a in self.d.apps()), 'executor_respawned')
        for _ in range(25):
            try:
                self.old_absent(report)
                break
            except RuntimeError:
                self.d.wait()
        self.old_absent(report)
        live = {a['name']: a for a in self.d.apps()}
        require(not (selected & live.keys()), 'executor_respawned')
        require(set(live) == NAMES - selected - ({FRONT} if front_missing else set()), 'unexpected_owner_after_stop')
        if not frontend:
            if not front_missing:
                require(live[FRONT]['pid'] == report['frontend']['pid'] and same_process(report['frontend']['identity'], self.d.identity(live[FRONT]['pid'])), 'frontend_identity_changed')
            require(self.d.db_zero() == {'otherClientBackends': 0, 'advisoryLocks': 0}, 'unknown_db_owner')
            self.d.capture_auth(self.root, apps)
        self.guard()
        self.d.containment(self.window)
        self.write_once('frontend-exit-confirmed.json' if frontend else 'old-exit-confirmed.json', report)
        if front_missing:
            # New certificate proves the missing frontend's OLD identity is gone.
            prior_front['direction'] = self.plan['direction']
            prior_front['configHash'] = digest(self.target)
            prior_front['generation'] = report['generation']
            self.write_once('frontend-exit-confirmed.json', prior_front)

    def certificate(self, name, successor):
        r = json.loads((self.root / name).read_text())
        require(r['direction'] == self.plan['direction'] and r['configHash'] == digest(self.target), 'stale_or_wrong_certificate')
        require(r['generation'] == self.guard()['generation'], 'guard_generation_changed')
        self.old_absent(r)
        return r

    def db_gate_for_start(self, name, live, *, binding_proof=None):
        if name == API:
            require(self.d.db_zero() == {'otherClientBackends': 0, 'advisoryLocks': 0},
                    'unknown_db_owner')
        elif name == WORKER:
            api = live[API]
            marker = json.loads((self.root / ('started-' + API + '.json')).read_text())
            require(marker['pid'] == api['pid'] and
                    same_process(marker['identity'], self.d.identity(api['pid'])),
                    'successor_identity_changed')
            binding_bytes = (self.window / 'db-owner-bindings.private.json').read_bytes()
            if binding_proof is not None or hasattr(self.d, 'proof'):
                proof = binding_proof if binding_proof is not None else self.d.proof()
                require(isinstance(proof, dict) and isinstance(proof.get('request'), dict),
                        'db_owner_binding_proof_invalid')
                require(proof['request'].get('dbOwnerBindingsHash') ==
                        hashlib.sha256(binding_bytes).hexdigest(), 'db_owner_binding_drift')
            bindings = json.loads(binding_bytes)
            require(bindings['apiHttpPort'] == int(self.target[API]['env']['PORT']),
                    'api_http_port_binding_drift')
            self.d.db_only_successor_api(api['pid'], marker['identity'],
                                         self.target[API]['env']['DATABASE_URL'], bindings)

    def restore_proof(self):
        sys.path.insert(0, str(self.window))
        from restore_contract import validate
        return validate(self.root)

    def start(self, name):
        self.restore_proof()
        import sys
        sys.path.insert(0, str(self.window))
        from csv_start_gate import authorize_start
        authorize_start(self.root)
        require(name in {API, WORKER}, 'frontend_preserved_no_start')
        self.guard()
        self.d.containment(self.window)
        self.certificate('frontend-exit-confirmed.json' if name == FRONT else 'old-exit-confirmed.json', name)
        expected = {API: {FRONT}, WORKER: {FRONT, API}, FRONT: {API, WORKER}}[name]
        if self.plan.get('frontendAbsentAtRecovery') and name != FRONT:
            expected.discard(FRONT)
        live = {a['name']: a for a in self.d.apps()}
        require(set(live) == expected, 'successor_order_or_owner_conflict')
        if FRONT in expected and not (self.root / ('started-' + FRONT + '.json')).exists():
            prior = self.certificate('old-exit-confirmed.json', name)['frontend']
            require(prior and live[FRONT]['pid'] == prior['pid'] and
                    same_process(prior['identity'], self.d.identity(live[FRONT]['pid'])),
                    'frontend_identity_changed')
        for n in expected:
            self.config(live[n], self.source[n] if n == FRONT else self.target[n])
            marker = self.root / ('started-' + n + '.json')
            if marker.exists():
                saved = json.loads(marker.read_text())
                require(saved['pid'] == live[n]['pid'] and same_process(saved['identity'], self.d.identity(live[n]['pid'])), 'successor_identity_changed')
        require(self.d.path_exists(self.target[name]['script']), 'successor_artifact_missing')
        self.d.validate_bindings(self.window, {name: self.target[name]})
        self.db_gate_for_start(name, live)
        self.write_once('start-intent-' + name + '.json', {'direction': self.plan['direction']})
        self.d.start(self.root, name)
        last_error = None
        for _ in range(25):
            try:
                after = {a['name']: a for a in self.d.apps()}
                require(set(after) == expected | {name}, 'unexpected_process_after_start')
                self.config(after[name], self.target[name], fresh=True)
                self.write_once('started-' + name + '.json', {'pid': after[name]['pid'], 'identity': self.d.identity(after[name]['pid'])})
                return
            except RuntimeError as e:
                last_error = e
                self.d.wait()
        raise last_error


class Controls:
    def unfence(self):
        Operations(self.root, self.d).restore_proof()
        self.d.containment(self.window)
        operation = Operations(self.root, self.d)
        operation.guard()
        operation.certificate('old-exit-confirmed.json', API)
        current = {a['name']: a for a in self.d.apps()}
        require(set(current) == NAMES, 'incomplete_process_set')
        for name, cfg in operation.target.items():
            operation.config(current[name], cfg, fresh=True)
        self.d.validate_bindings(self.window, operation.target)
        if operation.source[FRONT] != operation.target[FRONT]:
            operation.certificate('frontend-exit-confirmed.json', FRONT)
        # Save only the complete compatible process set; no intermediate save.
        self.d.run([PM, 'save'])
        self.d.run(['install', '-m', '600', '/home/deploy/.pm2/dump.pm2', '/home/deploy/.pm2/dump.pm2.bak'])
        self.d.run(['cmp', '/home/deploy/.pm2/dump.pm2', '/home/deploy/.pm2/dump.pm2.bak'])
        self.d.run(['sudo', '-n', 'nft', 'delete', 'table', 'inet', 're7_campaign_transition'])

