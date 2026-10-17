"""Reuse B4 pipeline, hook before dependency scanning. No operational generation."""
import hashlib,json,types
from pathlib import Path
import integration
HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
BASE='7ab912bf885b0b7e78fc723bcc1c1555170f259e'


def compositor():
    path=REVIEW/'crm-csv-root-authority-b4-20261016/compose_static.py'
    import subprocess
    raw=subprocess.check_output(['git','show',BASE+':'+str(path.relative_to(HERE.parents[3]))],cwd=HERE.parents[3])
    if raw!=path.read_bytes():raise RuntimeError('B4_compositor_source_drift')
    src=raw.decode()
    src=integration.replace(src,'    for name,raw in code.items():\n','    mode_delta(code,origins)\n    for name,raw in code.items():\n')
    src=integration.replace(src,"('fs','path','assert','crypto'","('fs','path','assert','assert/strict','crypto'")
    src=integration.replace(src,"target=str(Path(owner).parent/name)","target=__import__('posixpath').normpath(str(Path(owner).parent/name))")
    src=integration.replace(src,'    cycles=[]\n',"    imports['switch/preparation-bindings.cjs']['restore_contract.py']='window/restore_contract.py'\n    cycles=[]\n")
    begin=src.index('    integration_blocks=[');end=src.index('    # Same eight real inputs',begin)
    src=src[:begin]+'''    integration_blocks=[{'consumer':'ORIGINAL full directory absence', 'reason':
        'Canonical R2 Contract still requires sealed four-mode DATA and switch exit proof; code independence alone is not full-directory independence.'}]
'''+src[end:]
    m=types.ModuleType('b4_compositor_mode_closure');m.__file__=str(path);m.mode_delta=integration.apply
    exec(compile(src,str(path),'exec'),m.__dict__)
    return m


def compose():
    m=compositor();plan,objects=m.compose()
    plan['compositionBase']=BASE
    # Explicit child code edges; these do not replace runtime scope admission.
    plan['authenticatedChildLoads']=[{'caller':'window/check_current.py','entry':'window/current-sql.cjs','scope':'inspect','on':'explicit four-mode diagnostic only'}]
    plan['explicitChildEntriesRequired']={'window/restore_contract.py':'inspect'}
    plan['transformInputs'][str((HERE/'integration.py').relative_to(HERE.parents[3]))]={'commit':None,'sha256':hashlib.sha256((HERE/'integration.py').read_bytes()).hexdigest(),'authority':'review-only; not phase authority'}
    plan['explicitModeEntriesRequired']={mode+'/ops.py':'inspect' for mode in m.MODES}
    plan['explicitModeEntriesRequired']['window/current-sql.cjs']='inspect'
    plan['lateModeLoads']=[{'caller':'window/recovery_bridge.py','codeMode':'explicit code_mode','evidenceMode':'explicit mode'},
        {'caller':'window/sequencer.py','codeMode':'explicit mode'}, {'caller':'window/check_current.py','codeMode':'switch; four-mode diagnostic only'}]
    return plan,objects


def write(out):
    plan,objects=compose();out=Path(out)
    if out.exists():raise RuntimeError('new_static_destination_required')
    out.mkdir();(out/'objects').mkdir()
    for sha,raw in objects.items():(out/'objects'/(sha+'.source')).write_bytes(raw)
    for name,v in [('COMPOSITION.json',plan),('MISSING_INPUTS.json',{'result':plan['certification'],'inputs':plan['missingInputs'],'integrationBlocks':plan['integrationBlocks'],'entryRequirements':plan['explicitModeEntriesRequired']})]:
        (out/name).write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
    return plan

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args()
    v=write(a.out);print(json.dumps({k:v[k] for k in ('paths','uniqueContents','uniqueBytes','cycles','integrationBlocks')}))
