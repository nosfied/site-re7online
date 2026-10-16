"""Pure original-only policy delta. No installer, root effect or new helper action."""
import copy
import hashlib
import json
from recovery_contract import API, WORKER, ORIGINAL, require


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def propose(policy, source_profile, original_targets, inspection):
    require(inspection.get('classification') == 'STOPPED_UNSELECTED' and
            inspection.get('options') == ['ORIGINAL'] and inspection.get('mode') == ORIGINAL,
            'original_policy_state_denied')
    source = {a['name']: a for a in source_profile['apps']}
    require(set(original_targets) == {API, WORKER}, 'original_policy_population')
    for n, cfg in original_targets.items():
        require(set(cfg) == {'cwd', 'script', 'sha256'} and cfg['cwd'] == source[n]['cwd']
                and cfg['script'] == source[n]['script'] and len(cfg['sha256']) == 64
                and all(c in '0123456789abcdef' for c in cfg['sha256']), 'original_policy_target')
    new = copy.deepcopy(policy)
    new['targetProcesses']['return'] = copy.deepcopy(original_targets)
    before = copy.deepcopy(policy); after = copy.deepcopy(new)
    before['targetProcesses'].pop('return'); after['targetProcesses'].pop('return')
    require(before == after, 'original_policy_nonrestricted_delta')
    return {'status': 'LOCAL_POLICY_PROPOSAL_NOT_INSTALLED', 'policy': new,
            'executionMode': ORIGINAL, 'rootAction': 'authorize-return', 'rootMode': 'return',
            'sourcePolicyDigest': digest(policy), 'proposedPolicyDigest': digest(new),
            'newPrivilegedActions': [], 'selectionAllowed': False,
            'requiresExplicitPolicyReviewAndFreshFencedPhase': True}
