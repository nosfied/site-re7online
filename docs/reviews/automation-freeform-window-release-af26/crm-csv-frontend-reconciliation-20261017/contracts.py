"""Offline procedure proofs; exact canonical methods, no operational entrypoint."""
import ast
import hashlib
import json
from pathlib import Path

REVIEW=Path(__file__).resolve().parent.parent
OPS=REVIEW/'crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source'
OPS_SHA='c84a5e059cbc75ee8114bbb36f90f92d7de7516f4433de4680cc46b592ae6d3e'


def require(ok,reason):
    if not ok:raise RuntimeError(reason)


def config_consumers(path_class=Path, source_path=OPS):
    raw=Path(source_path).read_bytes();require(hashlib.sha256(raw).hexdigest()==OPS_SHA,'canonical_source_drift')
    source=ast.parse(raw);classes=[]
    for name,methods in [('System',{'identity','check_config','db_container'}),('Operations',{'config'})]:
        cls=next(n for n in source.body if isinstance(n,ast.ClassDef)and n.name==name)
        # Exact AST method bodies; no module import, __init__, stop/start, CLI.
        cls=ast.ClassDef(name=name,bases=[],keywords=[],body=[n for n in cls.body
            if isinstance(n,ast.FunctionDef)and n.name in methods],decorator_list=[])
        require({n.name for n in cls.body}==methods,'canonical_method_missing');classes.append(cls)
    scope={'Path':path_class,'require':require,'json':json}
    exec(compile(ast.fix_missing_locations(ast.Module(body=classes,type_ignores=[])),str(OPS),'exec'),scope)
    return scope['System'],scope['Operations']


LIVE_FIELDS=('pm_cwd','pm_exec_path','exec_interpreter','args','node_args','namespace',
             'exec_mode','watch','autorestart','stop_exit_codes')


def frontend_expected(before,source_profile):
    require(before['name']=='re7-admin-front' and type(before['env'])is dict,'frontend_before_schema')
    require(all(isinstance(v,(str,int,float,bool)) for v in before['env'].values()),'frontend_environment_not_scalar')
    # source_profile is the independently sealed original OS preservation profile.
    # The caller must authenticate that reference; no fallback to a PM2 projection.
    require(type(source_profile)is dict and type(source_profile.get('apps'))is list,'frontend_source_profile_missing')
    fronts=[a for a in source_profile['apps']if type(a)is dict and a.get('name')==before['name']]
    require(len(fronts)==1,'frontend_source_profile_ambiguous')
    cfg=fronts[0]
    require(all(k in cfg for k in ('cwd','script','interpreter','env')) and type(cfg['env'])is dict,'frontend_source_profile_schema')
    require(all(isinstance(v,(str,int,float,bool)) for v in cfg['env'].values()),'frontend_os_environment_not_scalar')
    require(cfg['cwd']==before['pm_cwd'] and cfg['script']==before['pm_exec_path'] and cfg['interpreter']==before['exec_interpreter'],'frontend_source_profile_paths')
    return {'name':cfg['name'],'cwd':cfg['cwd'],'script':cfg['script'],
            'interpreter':cfg['interpreter'],'env':dict(cfg['env'])}


def compare_frontend(live,before,operations,source_profile):
    for field in LIVE_FIELDS:
        require(field in live['pm2_env'] and field in before and
                live['pm2_env'][field]==before[field],'frontend_live_field:'+field)
    # Retain the whole application projection separately; do not discard its fields.
    require(live['pm2_env'].get('env')==before['env'],'frontend_application_environment_drift')
    operations.config(live,frontend_expected(before,source_profile))
    return {'canonicalConfig':True,'source':'sealed OS preservation profile plus pre-window PM2 projection; recorded observations only'}


def compare_saved(current,before):
    require(set(current)==set(before),'saved_fields_changed')
    changed={k for k in before if current[k]!=before[k]}
    require(changed <= {'axm_monitor'},'saved_contract_changed')
    return {'onlyDynamicDifference':sorted(changed),'environmentEqual':current['env']==before['env']}


def verify_peer(connection,system,pid,ticks,uid):
    import socket,struct
    peer=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
    require(peer[0]==pid and peer[1]==uid,'pm2_rpc_peer_identity')
    identity=system.identity(pid)
    require(identity is not None and identity['ticks']==ticks and identity['state']not in ('Z','X'),
            'pm2_daemon_changed_no_respawn')
    return {'pid':pid,'ticks':ticks,'uid':uid}
