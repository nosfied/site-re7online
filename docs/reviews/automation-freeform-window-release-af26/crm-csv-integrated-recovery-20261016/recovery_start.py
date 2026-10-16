"""Original start gate: explicit decision, sealed original mode; no candidate checker."""
from pathlib import Path
from recovery_contract import ORIGINAL, MODES, Contract, present, read, require, sha
from recovery import build


def authorize_original_start(directory):
    directory = Path(directory); root = directory.parent
    require(directory.name == ORIGINAL, 'original_start_mode')
    controller = build(root)
    c = Contract(root, controller.b, controller.digest)
    intent = read(root / 'window/csv-recovery.intent.private.json')
    require(intent['decision'] == 'ORIGINAL' and intent['mode'] == ORIGINAL
            and intent['classification']['classification'] == 'STOPPED_UNSELECTED'
            and intent['contractSha256'] == controller.digest
            and intent['executionIntentSha256'] == sha(root / 'window/csv-execution.intent.private.json'),
            'original_start_explicit_decision_required')
    require(not present(root / 'window/csv-recovery.receipt.private.json'), 'recovery_already_complete')
    require(not any(present(root / 'window' / n) for n in
            ('csv-selection.intent.private.json', 'csv-selection.receipt.private.json',
             'event-overlay.intent.private.json', 'event-overlay.receipt.private.json')),
            'original_after_possible_selection')
    for mode in MODES:
        if mode != ORIGINAL:
            require(not list((root / mode).glob('start-intent-*.json')) and
                    not list((root / mode).glob('started-*.json')), 'original_after_possible_candidate_start')
    c.policy(ORIGINAL)
    # Existing Operations.start retains exit certificate, process order, DB ownership,
    # one-shot start-intent and binding revalidation. Do not classify/replay here.
    return None
