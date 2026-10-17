"""Focused source-interface regressions. Never contacts a host or installs policy.

Optional --custody uses the pinned preserved JSONL ONLY. No raw is emitted.
The public synthetic model tests are not production authority/certification.
"""
import argparse
import ast
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from scripts.crm_csv_predecessor import sources as s
from scripts.crm_csv_predecessor import runtime as r
RAW = None
CAPTURE = '931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529'
PREP = '/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-synthetic-review'
NAMES = ('re7-whatsapp-agent', 're7-whatsapp-web-worker', 're7-admin-front')


def synthetic():
    cfg = {n: {'cwd': '/opt/re7online/releases/synthetic/' + n,
               'script': '/opt/re7online/releases/synthetic/' + n + '/dist/index.js',
               'sha256': 'a' * 64} for n in NAMES[:2]}
    fence = b'synthetic fence, not executable'
    return {'preparation': PREP, 'fenceB64': base64.b64encode(fence).decode(),
            'fenceSha256': s.digest(fence), 'cronBeforeB64': 'YQ==', 'cronWindowB64': 'Yg==',
            'sourceProcesses': {n: {'pid': 100 + i, 'ticks': str(200 + i)} for i, n in enumerate(NAMES)},
            'pm2Daemon': {'pid': 99, 'ticks': '199'},
            'targetProcesses': {'switch': copy.deepcopy(cfg), 'return': copy.deepcopy(cfg)},
            'savedPaths': {'pm2': '/home/deploy/.pm2/synthetic.dump',
                           'fallback': '/opt/re7online/backups/converta-persistent/synthetic.dump'}}


def module(name, raw):
    m = types.ModuleType(name)
    exec(compile(raw, name, 'exec'), m.__dict__)
    return m


def stored(path):
    # Reuse accepted bounded no-follow/stability reader (no CLI) for custody.
    from scripts.crm_csv_diagnostic.editable_sources import LAUNCH, LAUNCH_SHA
    reader = module('custody_reader_library', s.pinned(LAUNCH, LAUNCH_SHA))
    raw = reader.read(Path(path))
    if s.digest(raw) != CAPTURE:
        raise RuntimeError('custody_capture_hash')
    result = []
    for line in raw.splitlines():
        row = json.loads(line)
        if 'stdoutBase64' not in row:
            continue
        output = base64.b64decode(row['stdoutBase64'], validate=True)
        if len(output) != row['stdoutBytes'] or s.digest(output) != row['stdoutSha256']:
            raise RuntimeError('custody_command_bytes')
        for target in json.loads(output)['targets']:
            if target['path'] == r.POLICY_PATH:
                value = base64.b64decode(target['bytesBase64'], validate=True)
                if len(value) != target['bytes'] or target['sha256'] != s.digest(value):
                    raise RuntimeError('custody_target_bytes')
                result.append(value)
    if len(result) != 1:
        raise RuntimeError('custody_target_population')
    s.predecessor(result[0])
    return result[0]


class Public(unittest.TestCase):
    def test_canonical_model_valid(self):
        v = synthetic(); got = s.canonical_model(json.dumps(v).encode())
        self.assertEqual(got['policySha256'], s.digest(json.dumps(v).encode()))
        self.assertEqual(got['sourceProcesses'], v['sourceProcesses'])

    def test_model_and_action_shape(self):
        for change in ('model', 'actions', 'missing_return', 'unknown_process', 'bad_fence', 'bad_saved'):
            v = synthetic()
            if change in ('model', 'actions'): v[change] = 'synthetic'
            if change == 'missing_return': del v['targetProcesses']['return']
            if change == 'unknown_process': v['sourceProcesses']['other'] = {'pid': 1, 'ticks': '1'}
            if change == 'bad_fence': v['fenceSha256'] = '0' * 64
            if change == 'bad_saved': v['savedPaths']['pm2'] = '/tmp/not-canonical'
            with self.subTest(case=change), self.assertRaises(RuntimeError):
                s.canonical_model(json.dumps(v).encode())

    def test_missing_and_tampered_source(self):
        for raw in (None, b'', json.dumps(synthetic()).encode()):
            with self.assertRaisesRegex(RuntimeError, 'predecessor_bytes_missing_or_drift'):
                s.sources(raw)

    def test_future_identity_and_targets(self):
        v = synthetic(); raw = json.dumps(v).encode()
        self.assertEqual(s.validate_future(raw, PREP, v['sourceProcesses'], v['targetProcesses']), s.digest(raw))
        for field in ('preparation', 'sourceProcesses', 'targetProcesses'):
            bad = copy.deepcopy(v)
            if field == 'preparation': bad[field] += '-other'
            if field == 'sourceProcesses': bad[field][NAMES[0]]['ticks'] = '999'
            if field == 'targetProcesses': bad[field]['switch'][NAMES[0]]['sha256'] = 'b' * 64
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                s.validate_future(json.dumps(bad).encode(), PREP, v['sourceProcesses'], v['targetProcesses'])

    def test_root_consumer_disagreement(self):
        good = {'result': 'CSV_ROOT_SOURCE_PASS', 'mutation': False,
                'files': [{'path': k, 'sha256': v} for k, v in r.ROOT_FILES.items()]}
        r.root_evidence(good)
        for key in r.ROOT_FILES:
            bad = copy.deepcopy(good)
            next(v for v in bad['files'] if v['path'] == key)['sha256'] = '0' * 64
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, 'root_source_evidence'):
                r.root_evidence(bad)
        with self.assertRaises(RuntimeError): r.require_contract({'sourcePolicySha256': s.OLD})


@unittest.skipUnless(RAW is not None, 'requires explicitly supplied, pinned private custody; no substitute')
class Preserved(unittest.TestCase):
    def test_actual_preserved_bytes_and_no_forward_grant(self):
        v = s.predecessor(RAW)
        self.assertEqual(v['policySha256'], r.POLICY_SOURCE)
        with self.assertRaisesRegex(RuntimeError, 'predecessor_is_not_forward_policy'):
            s.validate_future(RAW, PREP, v['sourceProcesses'], v['targetProcesses'])
        with self.assertRaises(RuntimeError): s.predecessor(RAW + b' ')

    def test_producer_preserves_immutables_and_historical_input(self):
        prior = {'sourcePolicySha256': s.OLD, 'immutable': [
            {'path': '/synthetic/sealed-reference', 'uid': 0, 'mode': 0o644, 'sha256': '1' * 64}]}
        before = copy.deepcopy(prior); v = s.produce_contract(prior, RAW)
        self.assertEqual(before, prior); self.assertEqual(v['immutable'], prior['immutable'])
        self.assertEqual(v['sourcePolicySha256'], r.POLICY_SOURCE)
        prior['immutable'].append({'path': r.POLICY_PATH, 'uid': 0, 'mode': 0o600, 'sha256': s.OLD})
        self.assertEqual(s.produce_contract(prior, RAW)['immutable'][-1]['sha256'], r.POLICY_SOURCE)
        prior['immutable'][-1]['sha256'] = '0' * 64
        with self.assertRaises(RuntimeError): s.produce_contract(prior, RAW)

    def test_concrete_checkers_source_then_immutable_gate(self):
        code = s.sources(RAW)
        boundary_path = s.REVIEW / 'crm-csv-operational-20261016/csv_boundary.py'
        boundary = module('csv_boundary', boundary_path.read_bytes())
        runtime = module('policy_predecessor', code['window/policy_predecessor.py'])
        with patch.dict(sys.modules, {'policy_predecessor': runtime, 'csv_boundary': boundary}):
            for name, fn in [('csv_contract', 'check'), ('original_checks', 'check_original')]:
                consumer = module(name, code['window/' + name + '.py'])
                # Real profiles/profile_delta and private-file reads, no checker approval mock.
                before = {'apps': [{'name': n, 'cwd': '/synthetic/' + n,
                                    'script': '/synthetic/' + n + '/dist/index.js'} for n in NAMES]}
                after = copy.deepcopy(before)
                after['apps'][0]['cwd'] = '/opt/re7online/releases/crm-csv-24e5857f-20261016/apps/whatsapp-agent'
                after['apps'][0]['script'] = after['apps'][0]['cwd'] + '/dist/index.js'
                with tempfile.TemporaryDirectory() as temp:
                    p = Path(temp); w = p / 'window'; w.mkdir(mode=0o700)
                    for n, v in [('source.profile.private.json', before), ('target.profile.private.json', after)]:
                        consumer.write(w/n, v)
                    c = {'sourcePolicySha256': r.POLICY_SOURCE, 'immutable': [],
                         'sourceProfileSha256': consumer.sha(w/'source.profile.private.json'),
                         'targetProfileSha256': consumer.sha(w/'target.profile.private.json')}
                    f = w/'csv-contract.private.json'; consumer.write(f, c)
                    for source, reason in [(s.OLD, 'source_policy_or_model_drift'),
                                           (r.POLICY_SOURCE, 'immutable_empty')]:
                        c['sourcePolicySha256'] = source; f.write_text(json.dumps(c))
                        with self.subTest(consumer=name, source=source), self.assertRaisesRegex(RuntimeError, reason):
                            getattr(consumer, fn)(p, live=False)

    def test_coherent_producer_bundle(self):
        v = synthetic(); prior = {'sourcePolicySha256': s.OLD, 'immutable': [
            {'path': '/synthetic/reference', 'uid': 0, 'mode': 0o644, 'sha256': 'f' * 64}]}
        code, contract = s.compose_inputs(RAW, prior, PREP,
            '/usr/local/libexec/re7/incident-6683-window-policy.pre-synthetic.json',
            json.dumps(v).encode(), v['sourceProcesses'], v['targetProcesses'])
        r.require_contract(contract)
        self.assertEqual(contract['immutable'], prior['immutable'])
        self.assertEqual(len(code), 7)
        self.assertIn(r.POLICY_SOURCE.encode(), code['install-api-window-policy.sh'])
        self.assertNotIn(s.OLD.encode(), b'\n'.join(code.values()))
        v['targetProcesses']['switch'][NAMES[0]]['sha256'] = 'c' * 64
        with self.assertRaises(RuntimeError):
            s.compose_inputs(RAW, prior, PREP,
                '/usr/local/libexec/re7/incident-6683-window-policy.pre-synthetic.json',
                json.dumps(v).encode(), synthetic()['sourceProcesses'], synthetic()['targetProcesses'])

    def test_unchanged_canonical_suffixes_and_consumer_calls(self):
        code = s.sources(RAW)
        for name in ('csv_contract', 'original_checks'):
            old = s.pinned(s.KIT/'objects'/(s.INPUTS['window/'+name+'.py']+'.source'), s.INPUTS['window/'+name+'.py']).decode()
            marker = " require(c['sourceProfileSha256']"
            self.assertEqual(old[old.index(marker):], code['window/'+name+'.py'].decode()[code['window/'+name+'.py'].decode().index(marker):])
        runtime = module('policy_predecessor', code['window/policy_predecessor.py'])
        with patch.dict(sys.modules, {'policy_predecessor': runtime}):
            root = module('root', code['window/root_readonly.py'])
            self.assertEqual(root.POLICY_SOURCE, r.POLICY_SOURCE)
        self.assertIn(b'root_evidence(root)', code['window/pre_install.py'])
        self.assertIn(b'require_contract(read(', code['window/admit_gates.py'])
        self.assertIn(b"sha(p/'window/privileged-policy.private.json')", code['window/admit_gates.py'])
        for name, raw in code.items(): compile(raw, name, 'exec')
        self.assertNotIn(s.OLD.encode(), b'\n'.join(code.values()))

    def test_installer_render_and_predecessor_change_before_cas(self):
        v = synthetic(); future = json.dumps(v).encode()
        raw = s.installer(RAW, PREP, '/usr/local/libexec/re7/incident-6683-window-policy.pre-synthetic.json',
                          future, v['sourceProcesses'], v['targetProcesses'])
        t = raw.decode(); self.assertNotIn(s.OLD, t)
        self.assertEqual(t.count(r.POLICY_SOURCE), 3)
        self.assertIn('flock -n 9', t)
        # Execute exact installer CAS segment with real bash, sha256sum and test.
        # sudo/visudo/install effects are SIMULATED; no full installation claim.
        start = t.index('sudo test ! -e "$A"'); end = t.index('sudo namei')
        fragment = t[start:end]
        for drift in (False, True):
            with tempfile.TemporaryDirectory() as temp:
                d = Path(temp); q = d/'policy'; a = d/'archive'; target = d/'future'; calls = d/'calls'
                q.write_bytes(RAW); target.write_bytes(future)
                # Shell function simulates only privileged commands. Original
                # test/hash commands execute, including the immediate CAS.
                prelude = '''set -euo pipefail
sudo() {
 if [ "$1" = visudo ]; then
  if [ "$DRIFT" = yes ]; then printf 'changed' > "$Q"; fi
 elif [ "$1" = install ]; then
  printf 'install\\n' >> "$CALLS"
  cp "${@: -2:1}" "${@: -1}"
 else "$@"; fi
}
'''
                # Sudoers hash is outside this CAS assertion; preceding canonical
                # helper/sudoers checks are retained in source, not certified here.
                fragment2 = '\n'.join(x for x in fragment.splitlines() if 'sha256sum "$S"' not in x)
                env = dict(os.environ, Q=str(q), A=str(a), P=str(d), CALLS=str(calls), DRIFT='yes' if drift else 'no')
                (d/'window').mkdir(); (d/'window/privileged-policy.private.json').write_bytes(future)
                run = subprocess.run(['bash', '-c', prelude + fragment2], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                self.assertEqual(run.returncode == 0, not drift)
                self.assertEqual(calls.exists(), not drift)
                if not drift: self.assertEqual(a.read_bytes(), RAW); self.assertEqual(q.read_bytes(), future)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(); parser.add_argument('--custody'); args, rest = parser.parse_known_args()
    if args.custody:
        RAW = stored(args.custody)
        # skipUnless was evaluated before parsing; enable ONLY with authenticated raw.
        Preserved.__unittest_skip__ = False
    unittest.main(argv=[sys.argv[0], *rest], verbosity=2)
