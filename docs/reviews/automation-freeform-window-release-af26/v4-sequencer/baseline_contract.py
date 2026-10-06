"""Read-only baseline contracts. No defaults and no operational mutations."""
import datetime
import json
from pathlib import Path
import sys


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def timestamp(value, field):
    require(type(value) is str, 'baseline_invalid:' + field)
    try:
        parsed = datetime.datetime.fromisoformat(value)
    except ValueError:
        raise RuntimeError('baseline_invalid:' + field) from None
    require(parsed.tzinfo is not None, 'baseline_invalid:' + field)


def operational(value):
    require(type(value) is dict, 'baseline_invalid:operational')
    for key in ('guard', 'supervision', 'observedUtc', 'observedGuardOpen'):
        require(key in value, 'baseline_missing:operational.' + key)
    g = value['guard']
    require(type(g) is dict, 'baseline_invalid:operational.guard')
    for key in ('open', 'generation', 'tasks', 'ledgerFault'):
        require(key in g, 'baseline_missing:operational.guard.' + key)
    require(type(g['open']) is bool, 'baseline_invalid:operational.guard.open')
    require(type(g['generation']) is int and g['generation'] >= 0,
            'baseline_invalid:operational.guard.generation')
    # This baseline stores the observed count; persisted ledger tasks is a dict.
    require(type(g['tasks']) is int and g['tasks'] == 0,
            'baseline_invalid:operational.guard.tasks')
    require(g['ledgerFault'] is False, 'baseline_invalid:operational.guard.ledgerFault')
    require(value['supervision'] in (
        'ActiveState=inactive\nUnitFileState=enabled\n',
        'ActiveState=inactive\nUnitFileState=disabled\n'),
        'baseline_invalid:operational.supervision')
    require(type(value['observedGuardOpen']) is bool, 'baseline_invalid:operational.observedGuardOpen')
    timestamp(value['observedUtc'], 'operational.observedUtc')
    return value


def functional(value):
    require(type(value) is dict, 'baseline_invalid:functional')
    for key in ('auth', 'connected', 'flags', 'frontendBuild', 'observedAt'):
        require(key in value, 'baseline_missing:functional.' + key)
    for key in ('auth', 'connected', 'flags'):
        items = value[key]
        require(type(items) is list and all(type(x) is str and x for x in items),
                'baseline_invalid:functional.' + key)
        require(len(items) == len(set(items)), 'baseline_duplicate:functional.' + key)
    require(type(value['frontendBuild']) is str and bool(value['frontendBuild'].strip()),
            'baseline_invalid:functional.frontendBuild')
    timestamp(value['observedAt'], 'functional.observedAt')
    return value


def sequential(value, worker_absent=False):
    require(type(value) is dict and type(value.get('guardGeneration')) is int and
            value['guardGeneration'] >= 0, 'baseline_invalid:sequencer.guardGeneration')
    names={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'}
    require(type(value.get('apps')) is dict and set(value['apps']) == names,
            'baseline_invalid:sequencer.apps')
    for name, process in value['apps'].items():
        require(type(process) is dict and type(process.get('pid')) is int and process['pid'] > 0,
                'baseline_invalid:sequencer.pid:' + name)
        identity=process.get('identity')
        require(type(identity) is dict and type(identity.get('ticks')) is str and
                identity['ticks'].isascii() and identity['ticks'].isdigit() and int(identity['ticks']) > 0,
                'baseline_invalid:sequencer.ticks:' + name)
        allowed={'R','S','D','T','t','I','P','W'}
        if worker_absent and name=='re7-whatsapp-web-worker':allowed={'absent'}
        require(type(identity.get('state')) is str and identity['state'] in allowed, 'baseline_invalid:sequencer.state:' + name)
    return value


def capture_operational(guard_reader, runner, restore_open=None):
    """Capture actual ledger + systemd output. Return inherits only restoration intent."""
    before = guard_reader()
    require(type(before) is dict and type(before.get('version')) is int and before['version'] == 1 and
            type(before.get('open')) is bool and type(before.get('generation')) is int and
            before['generation'] >= 0 and type(before.get('audit')) is list and
            type(before.get('tasks')) is dict and not before['tasks'] and
            not before.get('ledgerFault'), 'baseline_observation_invalid:guard')
    supervision = runner(['systemctl', 'show', 'pm2-deploy.service',
                          '--property=ActiveState,UnitFileState'])
    require(guard_reader() == before, 'baseline_observation_changed:guard')
    require(restore_open is None or type(restore_open) is bool,
            'baseline_invalid:restore_open')
    return operational({
        'guard': {'open': before['open'] if restore_open is None else restore_open,
                  'generation': before['generation'], 'tasks': len(before['tasks']),
                  'ledgerFault': False},
        'observedGuardOpen': before['open'],
        'supervision': supervision,
        'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()})


def capture_functional(counts, frontend):
    # Counts come from the existing read-only SQL; no missing-field defaults.
    require(type(counts) is dict, 'baseline_observation_invalid:counts')
    for key in ('auth', 'connected', 'flags'):
        require(key in counts, 'baseline_missing:functional.' + key)
    return functional({k: counts[k] for k in ('auth', 'connected', 'flags')} | {
        'frontendBuild': (Path(frontend) / '.next/BUILD_ID').read_text().strip(),
        'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})


def read_json(path, label):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        raise RuntimeError('baseline_missing_file:' + label) from None
    except (json.JSONDecodeError, UnicodeError):
        raise RuntimeError('baseline_invalid_json:' + label) from None


def validate_preparation(root, modes=None):
    root = Path(root)
    initial = operational(read_json(root / 'window/initial.private.json', 'operational'))
    modes = modes or ('switch', 'return', 'return-partial')
    baselines = []
    for mode in modes:
        value = functional(read_json(root / mode / 'baseline.private.json', 'functional.' + mode))
        baselines.append(value)
        for name in ('candidate', 'return'):
            config = json.loads((root / mode / (name + '.config.private.json')).read_text())
            fronts = [a for a in config['apps'] if a['name'] == 're7-admin-front']
            require(len(fronts) == 1, 'baseline_frontend_ambiguous:' + mode)
            require((Path(fronts[0]['cwd']) / '.next/BUILD_ID').read_text().strip() ==
                    value['frontendBuild'], 'baseline_frontend_drift:' + mode)
    require(all(x == baselines[0] for x in baselines), 'baseline_modes_diverge')
    return initial


if __name__ == '__main__':
    require(len(sys.argv) in (2, 3), 'baseline_exact_arguments_required')
    validate_preparation(sys.argv[1], [sys.argv[2]] if len(sys.argv) == 3 else None)
    print('BASELINE_CONTRACT_PASS')
