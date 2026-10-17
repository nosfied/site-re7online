"""Future source-only delta; never edits or runs the consumed v2 package.
Inputs are pinned Git sources. No destination/manifest/commands are issued here.
Future review must supply exclusive roots and reseal ALL derived sources.
"""
import ast
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
P=ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017'
MANIFEST_SHA='707726e11f30ada8ef9f80f2fc7b6f84a1a737eca1b614738cf57f99c14f7dfa'
BOUNDS_SHA='668786cf7812661ffa4269ec59fc8ef38516186be68ab93ae4d065e6d9b7392a'

def replace(text,old,new):
    if text.count(old)!=1:raise RuntimeError('source_transform_count')
    return text.replace(old,new)

def function(text,name,new):
    tree=ast.parse(text);node=next(x for x in tree.body if isinstance(x,(ast.FunctionDef,ast.ClassDef)) and x.name==name)
    rows=text.splitlines(True)
    return ''.join(rows[:node.lineno-1])+new+'\n'+''.join(rows[node.end_lineno:])

def source_inputs(destinations):
    raw=(P/'MANIFEST.json').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=MANIFEST_SHA:raise RuntimeError('source_manifest_drift')
    # Canonical stable/no-follow snapshot read, library-only; never launcher.main.
    launch=(P/'launch.py').read_bytes();entry=json.loads(raw)['files']['launch.py']
    if hashlib.sha256(launch).hexdigest()!=entry['sha256']:raise RuntimeError('reader_source_drift')
    scope={'__name__':'review_source_reader'};exec(compile(launch,'<pinned launcher>','exec'),scope)
    sources={}
    for name,entry in json.loads(raw)['files'].items():
        data=scope['read'](ROOT/entry['source'])
        if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('source_digest')
        sources[name]=data.decode()
    bounds=scope['read'](Path(__file__).with_name('storage_bounds.py'))
    if hashlib.sha256(bounds).hexdigest()!=BOUNDS_SHA:raise RuntimeError('bounds_source_digest')
    # Every snapshot loader passes the same reviewed roots, including remote/child.
    for name in ('driver.py','runner.py','capture.source'):
        sources[name]=sources[name].replace("'__file__':", "'STORAGE_ROOTS':STORAGE_ROOTS,'BLOBS':BLOBS,'__file__':")
    d=sources['driver.py']
    d=d.replace("s={'__name__':'reviewed_remote'","STORAGE_ROOTS=m['storageRoots']\ns={'__name__':'reviewed_remote'")
    d=d.replace("'MANIFEST_RAW':raw,'MANIFEST_SHA':sys.argv[1]", "'MANIFEST_RAW':raw,'MANIFEST_SHA':sys.argv[1],'STORAGE_ROOTS':m['storageRoots']")
    d=d.replace("'MANIFEST_SHA':MANIFEST_SHA}","'MANIFEST_SHA':MANIFEST_SHA,'STORAGE_ROOTS':STORAGE_ROOTS}")
    # Attach guards to the SAME canonical writer/reader, not a parallel journal.
    attach="""\n_guard_scope={'__name__':'reviewed_storage_library'}
exec(compile(BLOBS['storage_bounds.py'],'<verified storage bounds>','exec'),_guard_scope)
_guard=_guard_scope['Guard'](STORAGE_ROOTS)
"""
    sources['read_package.py']+=attach+'write_artifact=_guard.artifact(write_artifact)\n'
    sources['privileged_output.source']+=attach+'private_record=_guard.record(private_record)\n'
    # Source preflight must see budgets before writing material too.
    d=replace(d,"r=subprocess.run(argv,input=frame_raw,capture_output=True,timeout=180,check=False)","r=libload('storage_bounds.py')['bounded_run'](argv,input=frame_raw,temporary_dir=folder,channel_limit=12*1024**2,stderr_limit=1024**2,timeout=180,check=False)")
    # Always preserve an OSError's already captured prefix as well.
    d=replace(d,"except Exception as e:error=e;err=type(e).__name__.encode()", "except Exception as e:error=e;out=getattr(e,'stdout',None) or b'';err=getattr(e,'stderr',None) or type(e).__name__.encode()")
    sources['driver.py']=d
    c=sources['capture.source']
    c=replace(c,"self.q=q;self.lib=load('read_package.py');self.record=load('privileged_output.source')['private_record']", "self.q=q;self.lib=load('read_package.py');self.record=load('privileged_output.source')['private_record'];self.bounds=load('storage_bounds.py')")
    c=replace(c,"r=subprocess.run(argv,input=input,pass_fds=pass_fds,capture_output=True,timeout=timeout,", "r=self.bounds['bounded_run'](argv,input=input,pass_fds=pass_fds,temporary_dir=self.q,channel_limit=1024**2,timeout=timeout,check=False,")
    c=replace(c,"except OSError as e:error=e;err=type(e).__name__.encode()", "except OSError as e:error=e;out=getattr(e,'stdout',None) or b'';err=getattr(e,'stderr',None) or type(e).__name__.encode()")
    sources['capture.source']=c
    e=sources['local_elf.py']
    a=e.index("        argv=['scp'");b=e.index("        stage='image-integrity'",a)
    e=e[:a]+"        driver['libload']('storage_bounds.py')['receive_images'](refs,incoming,driver,cap)\n"+e[b:]
    sources['local_elf.py']=e
    l=sources['launch.py']
    l=replace(l,"'MANIFEST_RAW':raw,'MANIFEST_SHA':expected,'READ':read", "'MANIFEST_RAW':raw,'MANIFEST_SHA':expected,'READ':read,'STORAGE_ROOTS':manifest['storageRoots']")
    # Launcher has its own pre-manifest canonical diagnostics, with bounded channels.
    # This source embeds the exact reviewed storage module, not an untrusted import.
    pre="\n_bounds={'__name__':'reviewed_storage_library'}\nexec(compile("+repr(bounds)+",'<reviewed storage bounds>','exec'),_bounds)\n"
    l=pre+l
    l=replace(l,"out=io.StringIO();err=io.StringIO()", "out=_bounds['LimitedText']();err=_bounds['LimitedText']()")
    l=replace(l,"module['private_record'](folder,'privileged-output.private.jsonl',row)", "_bounds['Guard']({folder:'launcher'}).record(module['private_record'])(folder,'privileged-output.private.jsonl',row)")
    l=replace(l,"except Exception as e:error=e;err.write(type(e).__name__)","except Exception as e:error=e  # static errorClass in receipt; bounded stderr prefix untouched")
    sources['launch.py']=l
    # Source composition only, requiring explicit NEW roots even in a lab.
    required={'MATERIAL','CUSTODY','TOOLS','OUTPUT','DISCOVERY_NAME','ANALYSIS_NAME','LAUNCHER_PREFIX'}
    if set(destinations)!=required:raise RuntimeError('future_destinations_unbound')
    for name in ('MATERIAL','CUSTODY','TOOLS','OUTPUT'):
        if not Path(destinations[name]).is_absolute():raise RuntimeError('future_destination_absolute')
    for value in destinations.values():
        if '20261017-v2' in str(value):raise RuntimeError('consumed_destination')
    for name,text in list(sources.items()):
        if name not in ('driver.py','local_elf.py','launch.py'):continue
        pairs={
            '/dev/shm/re7-csv-toolchain-material-20261017-v2':destinations['MATERIAL'],
            '/dev/shm/re7-csv-toolchain-tools-20261017-v2':destinations['TOOLS'],
            '/dev/shm/re7-csv-toolchain-read-20261017-v2':destinations['OUTPUT'],
            '/home/deifson-oliveira/DEIFSON/re7-private-retention-custody':destinations['CUSTODY'],
            'csv-toolchain-discovery-20261017-v2':destinations['DISCOVERY_NAME'],
            'csv-toolchain-analysis-20261017-v2':destinations['ANALYSIS_NAME'],
            'csv-toolchain-launcher-20261017-v2-':destinations['LAUNCHER_PREFIX']}
        for old,new in pairs.items():text=text.replace(old,str(new))
        sources[name]=text
    sources['storage_bounds.py']=bounds.decode()
    for name,text in sources.items():compile(text,'<future '+name+'>','exec')
    return {name:text.encode() for name,text in sources.items()}
