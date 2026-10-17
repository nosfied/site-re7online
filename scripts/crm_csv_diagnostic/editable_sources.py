"""Source-only integration for the existing diagnostic; no materialization or entrypoint.

Consumed snapshots stay immutable. Future composition must authenticate its complete
inputs again; these reviewed source pins are not installed operational authority.
"""
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
REVIEW=ROOT/'docs/reviews/automation-freeform-window-release-af26'
LAUNCH=REVIEW/'crm-csv-postrpc-diagnostics-20261017/launch.py'
LAUNCH_SHA='19389532ecdd9b8fc3360fb8c424dbf5bba1c17003c6f4a4f415799a6f7bd280'
FRONTIER=REVIEW/'crm-csv-postrpc-diagnostics-20261017/frontier.source'
FRONTIER_SHA='65f7e994770d4a69b02fb3d63b225e622b57be981ca7db2c1a5a6ad09908cb05'
ADAPTER=REVIEW/'crm-csv-frontend-reconciliation-20261017/contracts.py'
ADAPTER_SHA='53de3ac796228c908157930cd465993f6b2b8a14e1bc550607ff7e39f5970943'

def source_inputs():
    # Reuse the accepted bounded FD/no-follow/stability reader, without its CLI.
    raw=LAUNCH.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=LAUNCH_SHA:raise RuntimeError('source_reader_digest')
    library={'__name__':'source_reader_library','__file__':str(LAUNCH)}
    exec(compile(raw,str(LAUNCH),'exec'),library)
    def approved(path,digest):
        value=library['read'](path)
        if hashlib.sha256(value).hexdigest()!=digest:raise RuntimeError('editable_source_digest')
        return value
    frontier=approved(FRONTIER,FRONTIER_SHA).decode()
    adapter=approved(ADAPTER,ADAPTER_SHA)
    old="c['compare_frontend'](by['re7-admin-front'],before,op)"
    new="c['compare_frontend'](by['re7-admin-front'],before,op,profiles)"
    if frontier.count(old)!=1:raise RuntimeError('frontend_callsite_count')
    frontier=frontier.replace(old,new)
    reason=" 'frontend_environment_not_scalar':'HISTORICAL_FRONTEND_ENV_SCHEMA_INVALID',"
    if frontier.count(reason)!=1:raise RuntimeError('frontend_reason_count')
    frontier=frontier.replace(reason,reason+"\n 'frontend_application_environment_drift':'FRONTEND_APPLICATION_ENVIRONMENT_DRIFT',")
    # profiles is the very JSON value from historical(...), after stable_file/hash.
    # Never derive it from RPC, /proc, a dump, an environment variable or a fallback.
    return {'frontier.source':frontier.encode(),'contracts.py':adapter}
