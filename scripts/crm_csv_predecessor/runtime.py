"""Reviewed predecessor identity only. This module grants no window/phase action."""
POLICY_SOURCE = 'e2a5ffab807f457b4179a6981e15cbf52800cbf975bce921c31ee3a9a989860b'
POLICY_PATH = '/usr/local/libexec/re7/incident-6683-window-policy.json'
ROOT_FILES = {
    POLICY_PATH: POLICY_SOURCE,
    '/usr/local/libexec/re7/incident-6683-window-control.py': '8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212',
    '/etc/sudoers.d/re7-incident-6683-window': '62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a',
}


def require_contract(value):
    if value['sourcePolicySha256'] != POLICY_SOURCE:
        raise RuntimeError('source_policy_or_model_drift')


def root_evidence(value):
    if not (value['result'] == 'CSV_ROOT_SOURCE_PASS' and value['mutation'] is False
            and len(value['files']) == 3
            and {v['path']: v['sha256'] for v in value['files']} == ROOT_FILES):
        raise RuntimeError('root_source_evidence')
