"""Offline verifier; metadata/redaction is never sufficient to attest a secret.

Requires a privately preserved original issuer receipt containing full value and
record ID/project, plus an independently preserved authoritative project record.
No API, provider request, creation or revocation is performed.
"""
import hashlib
import hmac
import json
from pathlib import Path
import sys

def verify(configured, issuance, record, provenance):
    if provenance.get('issuanceKind') not in ('original-console-creation-custody','original-service-account-response'):
        raise ValueError('original_issuance_provenance_missing')
    for role in ('configuration','issuance','projectRecord'):
        if not provenance.get(role,{}).get('sha256') or not provenance[role].get('source'):
            raise ValueError('source_provenance_missing')
    key=issuance['api_key']
    if not isinstance(key.get('value'),str) or not key['value'] or not hmac.compare_digest(configured.encode(),key['value'].encode()):
        raise ValueError('full_secret_comparison_failed')
    if issuance['projectId']!=record['projectId'] or key['id']!=record['api_key']['id']:
        raise ValueError('project_or_key_id_mismatch')
    if record.get('revoked') is not False:
        raise ValueError('revocation_state_not_attested')
    return {'result':'OFFLINE_FULL_VALUE_ISSUANCE_PROJECT_RECORD_BINDING_PASS',
            'secretPrinted':False,'providerCalled':False,'limits':'Preserved evidence only; live state requires fresh authoritative read.'}

if __name__=='__main__':
    try:
        paths=[Path(p) for p in sys.argv[1:5]]
        raw=[]
        for p in paths:
            if p.is_symlink() or not p.is_file() or p.stat().st_mode&0o777!=0o600:
                raise ValueError('private_input_invalid')
            raw.append(p.read_bytes())
        cfg,issuance,record,provenance=map(json.loads,raw)
        for role,b in zip(('configuration','issuance','projectRecord'),raw[:3]):
            if provenance[role]['sha256']!=hashlib.sha256(b).hexdigest():raise ValueError('private_source_hash_drift')
        print(json.dumps(verify(cfg['OPENAI_API_KEY'],issuance,record,provenance)))
    except Exception as e:
        print(json.dumps({'result':'OPENAI_BINDING_DENY','errorClass':type(e).__name__,'reason':str(e) if isinstance(e,ValueError) else 'private_evidence_missing_or_invalid','revocationAuthorized':False}));sys.exit(1)
