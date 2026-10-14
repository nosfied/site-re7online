"""Offline provenance verification only. Does not decrypt, omit or update any row."""
import hashlib
import json
from pathlib import Path
import sys

def verify(snapshot, binding):
    assert binding['ownerDeclaredFutureUnused'] and not binding['botFatherRequiredNow'], 'future_scope_mismatch'
    rows=[r for g in snapshot['data']['groups'] if g['model']=='channelAccountSecret' for r in g['rows'] if r['channelAccountId']==binding['originalAccountReference']]
    assert len(rows)==1, 'secret_row_binding_not_unique'
    row=rows[0]
    # Original pending document used Python json.dumps(sort_keys=True), with its
    # default spaces. Do not silently replace that digest with JS JSON.stringify.
    digest=hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()
    assert digest==binding['preserveOriginalRowSha256'], 'original_row_digest_drift'
    accounts=[a for a in snapshot['data']['accounts'] if a['id']==row['channelAccountId']]
    assert len(accounts)==1 and accounts[0]['clientId']==binding['tenantReference'], 'tenant_account_binding_drift'
    assert accounts[0]['channel'].lower()=='telegram', 'channel_binding_drift'
    return {'result':'TELEGRAM_ORIGINAL_ROW_TENANT_ACCOUNT_PROVENANCE_PASS_NO_ACTION',
            'rowSha256':digest,'digestSerialization':'python-json-sort_keys-default-separators',
            'rows':1,'decryptionClaimed':False,'tokenCreated':False,'rowChanged':False,
            'dispositionApproved':False,'fullCipherPlanPass':False}

if __name__=='__main__':
    try:
        print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text()),json.loads(Path(sys.argv[2]).read_text()))))
    except Exception as e:
        print(json.dumps({'result':'TELEGRAM_PROVENANCE_DENIED','errorClass':type(e).__name__}));sys.exit(1)
