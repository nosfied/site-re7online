"""Read-only verifier of this code-only review kit; never certifies a window."""
import hashlib
import json
from pathlib import Path
import stat


def verify(root,expected,require_operational=False):
    root=Path(root);p=root/'COMPOSITION.json';s=p.lstat()
    if not stat.S_ISREG(s.st_mode)or p.is_symlink():raise RuntimeError('static_manifest_type')
    raw=p.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected:raise RuntimeError('static_review_hash')
    v=json.loads(raw)
    if v['kind']!='STATIC_CODE_COMPOSITION_NOT_PHASE_AUTHORITY':raise RuntimeError('static_manifest_kind')
    seen=set()
    for name,row in v['files'].items():
        if row['object']!='objects/'+row['sha256']+'.source':raise RuntimeError('static_object_address')
        p=root/row['object'];s=p.lstat()
        if not stat.S_ISREG(s.st_mode)or p.is_symlink():raise RuntimeError('static_object_type')
        raw=p.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=row['sha256']or len(raw)!=row['bytes']:raise RuntimeError('static_object_hash')
        seen.add(row['sha256'])
    if len(seen)!=v['uniqueContents']:raise RuntimeError('static_unique_count')
    if require_operational:raise RuntimeError(v['certification'])
    return {'result':'STATIC_BYTES_VERIFIED_OPERATIONAL_CERTIFICATION_DENIED','paths':len(v['files']),
            'uniqueContents':len(seen),'missingInputs':len(v['missingInputs']),
            'integrationBlocks':v['integrationBlocks'],'executionAuthorized':False}

if __name__=='__main__':
    import argparse,sys
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--review-sha256',required=True);p.add_argument('--require-operational',action='store_true');a=p.parse_args()
    try:print(json.dumps(verify(a.root,a.review_sha256,a.require_operational),sort_keys=True))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
