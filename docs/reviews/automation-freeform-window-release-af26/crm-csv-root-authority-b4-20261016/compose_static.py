"""Offline static composition over the accepted compositor's published index.
No profiles, observations, permits, runtime build or operational generation.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import types

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
REPO=HERE.parents[3]
BASE='67ce9076c489f025d7a24727eca7ccac093edf30'
MODES=('switch','return','return-partial','return-before-commit')
PREFIX='/usr/local/libexec/re7/'


def require(ok,why):
    if not ok:raise RuntimeError(why)


def digest(raw):return hashlib.sha256(raw).hexdigest()
def encoded(value):return (json.dumps(value,sort_keys=True,indent=2)+'\n').encode()


def pinned(path,commit=BASE):
    name=str(Path(path).relative_to(REPO))
    value=subprocess.check_output(['git','show',commit+':'+name],cwd=REPO)
    require(Path(path).read_bytes()==value,'published_source_drift:'+name)
    return value


def transform(folder,name='integration.py'):
    path=REVIEW/folder/name
    raw=pinned(path)
    # Only reviewed source transformations. No historical composer entrypoint.
    m=types.ModuleType(folder);exec(compile(raw,str(path),'exec'),m.__dict__)
    return m


def topo(graph):
    result=[];active=[];done=set()
    def visit(n):
        require(n in graph,'dependency_missing:'+n)
        require(n not in active,'dependency_cycle:'+' -> '.join(active+[n]))
        if n in done:return
        active.append(n)
        for child in sorted(graph[n]):visit(child)
        active.pop();done.add(n);result.append(n)
    for n in sorted(graph):visit(n)
    return result


def compose():
    idx=pinned(REVIEW/'crm-csv-review-publication-20261016/CODE_REVIEW_INDEX.json')
    spec=json.loads(idx);code={};origins={};inputs={}
    def record(path,raw,origin):
        require(path not in code,'output_collision')
        code[path]=raw;origins[path]=origin
    for name,row in sorted(spec['entries'].items()):
        ref=row['source'];path=REPO/ref['path']
        raw=pinned(path,ref.get('commit',BASE))
        require(digest(raw)==row['sha256'],'accepted_composition_hash:'+name)
        record(name.removeprefix('code/'),raw,{'input':ref,'inputSha256':digest(raw),'stages':['ACCEPT_LOCAL_COMPOSITION']})
        inputs[ref['path']]={'commit':ref.get('commit',BASE),'sha256':digest(raw)}
    integrated=transform('crm-csv-root-authority-b2-20261016') # includes accepted R3
    b3=transform('crm-csv-root-authority-b3-20261016')
    ext=transform('crm-csv-root-authority-local-20261016','root_extension.py')
    def apply(name,fn,label):
        before=code[name];code[name]=fn(before.decode()).encode();origins[name]['stages'].append(label)
    for name,fn in [('recovery.py',integrated.recovery),('recovery_bridge.py',integrated.bridge),
                    ('recovery_start.py',integrated.gate),('sequencer.py',integrated.sequencer)]:
        apply('window/'+name,fn,'AUTHORITY_R3_B2')
    # Window gate is already the accepted original-aware gate, no re-render.
    for mode in MODES:
        apply(mode+'/ops.py',integrated.operations,'AUTHORITY_R3_B2')
        apply(mode+'/ops.py',b3.operations,'B3_IMMUTABLE_PM2')
        apply(mode+'/delegated.py',integrated.delegated,'B2_CHILD_EXECUTION')
        apply(mode+'/execution-check.cjs',integrated.execution_check,'AUTHORITY_NODE_SCOPE')
        apply(mode+'/ecosystem_contract.py',b3.ecosystem,'B3_CANONICAL_PARSER')
        p=REVIEW/'crm-csv-root-authority-b3-20261016/pm2_input.py'
        record(mode+'/pm2_input.py',pinned(p),{'input':str(p.relative_to(REPO)),'stages':['B3_IMMUTABLE_PM2']})
    apply('window/ecosystem_contract.py',b3.ecosystem,'B3_CANONICAL_PARSER')
    # No need to ship the old proposal as an authority or a binding module.
    code.pop('proposal/policy_proposal.py',None);origins.pop('proposal/policy_proposal.py',None)
    protected={
        'authority.py':('crm-csv-root-authority-b1-20261016','authority.py'),
        'recovery-launch.py':('crm-csv-root-authority-b1-20261016','bootstrap.py'),
        'recovery-node-launch.cjs':('crm-csv-root-authority-b1-20261016','node_bootstrap.cjs'),
        'child_transport.py':('crm-csv-root-authority-b1-20261016','child_transport.py'),
        'privileged_output.py':('crm-csv-root-authority-b1-20261016','privileged_output.py'),
        'verified_loader.py':('crm-csv-root-authority-local-20261016','verified_loader.py'),
        'root_store.py':('crm-csv-root-authority-local-20261016','root_store.py')}
    for dest,(folder,source)in protected.items():
        p=REVIEW/folder/source
        record('protected/'+dest,pinned(p),{'input':str(p.relative_to(REPO)),'stages':['PROTECTED_ACCEPTED_LIBRARY']})
    # Same accepted literal query; no new sudo action, owner install/issue NOT delegated.
    helper=ext.helper(pinned(REVIEW/'v4-sequencer/privileged.py').decode())
    record('protected/incident-6683-window-control.py',helper.encode(),{'input':'v4-sequencer/privileged.py','stages':['ACCEPTED_QUERY_EXTENSION']})
    renderer=types.ModuleType('future_sudoers');exec(compile(ext.sudoers(pinned(REVIEW/'v4-sequencer/render_sudoers.py').decode()),'reviewed-sudoers','exec'),renderer.__dict__)
    record('protected/re7-incident-6683-window',renderer.render().encode(),{'input':'v4-sequencer/render_sudoers.py','stages':['ACCEPTED_QUERY_EXTENSION']})
    # All preparation diagnostic imports consume the exact same B1 collector.
    for name in list(code):
        if name.endswith('/privileged_output.py'):
            code[name]=code['protected/privileged_output.py'];origins[name]['stages'].append('B1_CANONICAL_DIAGNOSTIC')
    for name,raw in code.items():
        if name.endswith('.py'):ast.parse(raw,filename=name)
        public=raw.replace(b'/home/deploy/',b'').replace(b"'/home/deploy'",b'').replace(b'"/home/deploy"',b'')
        require(b'/home/'not in public,'private_path_in_code')
    graph={n:set()for n in code};imports={n:{}for n in code};missing=[];lazy=[]
    stdlib=sys.stdlib_module_names
    def resolve(owner,mod):
        folder=str(Path(owner).parent)
        for suffix in ('.py','.cjs'):
            for candidate in (folder+'/'+mod+suffix,'window/'+mod+suffix):
                if candidate in code:return candidate
        if mod in ('authority','child_transport'):
            return 'protected/'+mod+'.py'
        return None
    for owner,raw in code.items():
        if owner.endswith('.py'):
            tree=ast.parse(raw);parents={child:node for node in ast.walk(tree)for child in ast.iter_child_nodes(node)}
            for node in ast.walk(tree):
                names=[a.name for a in node.names]if isinstance(node,ast.Import)else([node.module]if isinstance(node,ast.ImportFrom)and node.module else[])
                for mod in names:
                    if mod.split('.')[0]in stdlib:continue
                    target=resolve(owner,mod)
                    if target is None:missing.append({'owner':owner,'kind':'import','name':mod});continue
                    imports[owner][mod]=target
                    # Runtime call edges are inventoried separately. Seal DAG
                    # contains eager imports; lazy back-calls are not self-pins.
                    parent=parents.get(node);inside=False
                    while parent:
                        inside |= isinstance(parent,(ast.FunctionDef,ast.AsyncFunctionDef))
                        parent=parents.get(parent)
                    if inside:lazy.append({'owner':owner,'target':target,'reason':'function import; authenticate on invocation'})
                    else:graph[owner].add(target)
        elif owner.endswith('.cjs'):
            import re
            for name in re.findall(r"require\(['\"]([^'\"]+)['\"]\)",raw.decode()):
                if name.removeprefix('node:')in ('fs','path','assert','crypto','child_process','os','util','url','buffer','http','https','vm'):continue
                target=str(Path(owner).parent/name)
                if target not in code:missing.append({'owner':owner,'kind':'require','name':name})
                else:imports[owner][name]=target;graph[owner].add(target)
    for mode in MODES:
        imports[mode+'/execution-check.cjs']['baseline_contract.py']=mode+'/baseline_contract.py'
    cycles=[]
    try:order=topo(graph)
    except RuntimeError as e:cycles.append(str(e));order=[]
    closure_graph={n:set(graph[n])|set(imports[n].values())for n in graph}
    closure_cycles=[]
    try:closure_order=topo(closure_graph)
    except RuntimeError as error:closure_cycles.append(str(error));closure_order=[]
    integration_blocks=[
        {'consumer':'recovery_bridge.Bridge.verify_recovery_exit','reason':'implicit import ops has no mode-specific authenticated map; must not map globally to switch for ORIGINAL'},
        {'consumer':'sequencer.Bridge.app_matches','reason':'accepted transform still requests self.switch/ops.py; ORIGINAL closure cannot silently include candidate code'},
        {'consumer':'check_current.check_current','reason':'implicit ops and inline node -e require of switch/preparation-bindings.cjs not routed through authenticated child bootstrap'},
        {'consumer':'node_bootstrap.checkedRequire','reason':'node:assert/strict is real Node builtin but absent from accepted allowedBuiltins; waiting-work consumers DENY'},
    ]
    # Same eight real inputs per mode from accepted composition, never fabricated.
    required=json.loads(pinned(REVIEW/'crm-csv-recovery-precert-20261016/prepared-kit/required-mode-inputs.json'))
    for mode,names in required.items():
        for n in names:missing.append({'owner':mode,'kind':'operational-data','name':mode+'/'+n})
    bindings=json.loads(pinned(REVIEW/'crm-csv-recovery-precert-20261016/BINDING_PLAN.json'))
    for n,row in bindings['inputs'].items():
        if n=='window/recovery_binding.py':continue # replaced by root Context, not an input
        missing.append({'owner':'window','kind':'operational-observation-or-contract','name':n,'source':row['source'],'rule':row['rule']})
    missing.extend({'owner':'root','kind':'owner-approved-data','name':n}for n in (
        'current protected-file/prior-target hashes and root chains','phase code manifest with actual uid/modes',
        'static anchor approved against policy/contract/profiles','decision-specific permit (recovery only)',
        'current PM2/Node executable + transitive toolchain integrity'))
    # Deduplicate by content, without hardlinks/symlinks or copying runtimes.
    objects={digest(raw):raw for raw in code.values()}
    files={n:{'sha256':digest(raw),'object':'objects/'+digest(raw)+'.source','bytes':len(raw),'origin':origins[n]}for n,raw in sorted(code.items())}
    result={'kind':'STATIC_CODE_COMPOSITION_NOT_PHASE_AUTHORITY','baseCommit':BASE,'executionAuthorized':False,
        'operationallyCertified':False,'files':files,'imports':imports,'eagerDependencies':{n:sorted(x)for n,x in graph.items()},
        'lazyCallEdges':lazy,'topologicalOrder':order,'cycles':cycles,'missingInputs':missing,
        'transitiveImportOrder':closure_order,'transitiveImportCycles':closure_cycles,'integrationBlocks':integration_blocks,
        'paths':len(code),'uniqueContents':len(objects),'uniqueBytes':sum(map(len,objects.values())),
        'certification':'DENY_INTEGRATION_AND_OPERATIONAL_INPUTS',
        'sealOrder':['static leaf objects + protected libraries','four mode code/data (data absent)','original-only immutable references/review','recovery contract (no self pin)','policy with current identities (absent)','phase code manifest DAG + metadata (absent)','owner-reviewed anchor (absent)','owner static install once','fresh classification + separate owner recovery permit once (when applicable)'],
        'provenanceInputs':inputs,
        'acceptedCompositionIndexSha256':digest(idx),
        'transformInputs':{str(p.relative_to(REPO)):{'commit':BASE,'sha256':digest(pinned(p))}for p in [
            REVIEW/'crm-csv-root-authority-b2-20261016/integration.py',
            REVIEW/'crm-csv-root-authority-b3-20261016/integration.py',
            REVIEW/'crm-csv-root-authority-b3-20261016/pm2_input.py',
            REVIEW/'crm-csv-root-authority-local-20261016/root_extension.py',
            REVIEW/'v4-sequencer/privileged.py',REVIEW/'v4-sequencer/render_sudoers.py',
            *(REVIEW/folder/name for folder,name in protected.values())]}}

    return result,objects


def write_kit(out):
    plan,objects=compose();out=Path(out)
    require(not os.path.lexists(out),'new_static_destination_required')
    out.mkdir();(out/'objects').mkdir()
    for key,raw in objects.items():(out/'objects'/(key+'.source')).write_bytes(raw)
    (out/'COMPOSITION.json').write_bytes(encoded(plan))
    (out/'MISSING_INPUTS.json').write_bytes(encoded({'result':plan['certification'],'inputs':plan['missingInputs'],'cycles':plan['cycles'],'transitiveImportCycles':plan['transitiveImportCycles'],'integrationBlocks':plan['integrationBlocks']}))
    return plan

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--out',required=True);args=p.parse_args()
    v=write_kit(args.out);print(json.dumps({k:v[k]for k in ('certification','paths','uniqueContents','uniqueBytes','cycles')}))
