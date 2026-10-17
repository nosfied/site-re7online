"""Offline derivation into an exclusive review directory; no remote execution.
Existing output denies; never alter a consumed package.
"""
from pathlib import Path
import json,hashlib,ast,base64,os
if __name__!='__main__':raise RuntimeError('offline_composition_cli_only')
r=Path.cwd();rv=r/'docs/reviews/automation-freeform-window-release-af26';d=rv/'crm-csv-delivery-review-20261017';old=d/'directed-diagnostic';out=d/'sql-review-v2';h=lambda b:hashlib.sha256(b).hexdigest()
out.mkdir(exist_ok=False)
manifest=json.loads((old/'MANIFEST.json').read_bytes());assert h((old/'MANIFEST.json').read_bytes())=='1a0ac094b9276b5fdfa09e2716946210e08c73d9f0172548be73d39d8217ffa9'
def accepted(n):
 p=old/n;raw=p.read_bytes();assert h(raw)==manifest['files'][n]['sha256'];return raw
raw=accepted('runner.py');tree=ast.parse(raw);nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))and n.name in('load','Capture','DiagnosticDenied','checked')]
assert len(nodes)==4
source=r/'scripts/crm_csv_diagnostic/sql_execution.source';body=source.read_bytes()
assert h(body)=='faf73df1af85c73ff3c6e8b2a8d00f6d82f6b7e60b3397c77c61d01467e0ab32','accepted_libpq_source'
# The reviewed source is the exact prefix of the bytes sealed as runner.py.
runner=body.decode()+'\n'+ast.unparse(ast.Module(body=nodes,type_ignores=[]))+'\n'
# Names resolve at invocation, after all accepted definitions have loaded; no imports by mutable path.
(out/'runner.py').write_text(runner)
launch=accepted('launch.py').decode();driver=accepted('driver.py').decode()
for a,b in {
 're7-csv-directed-material-20261017-v1':'re7-csv-sql-material-20261017-v2',
 're7-csv-directed-tools-20261017-v1':'re7-csv-sql-tools-20261017-v2',
 're7-csv-directed-read-20261017-v1':'re7-csv-sql-read-20261017-v2',
 'csv-directed-diagnostic-20261017-v1':'csv-sql-read-20261017-v2',
 'csv-directed-launcher-20261017-v1':'csv-sql-launcher-20261017-v2',
 'crm-csv-delivery-review-20261017/directed-diagnostic':'crm-csv-delivery-review-20261017/sql-review-v2'}.items():launch=launch.replace(a,b);driver=driver.replace(a,b)
# Same canonical stable reader/format, explicit export bound for SQL journal selected before read.
oldlib="def libraries(blobs=None):return libload('read_package.py',blobs),libload('privileged_output.source',blobs)['private_record']"
newlib='''def libraries(blobs=None):
    lib=libload('read_package.py',blobs);original=lib['stable_file']
    def sql_journal_read(path,limit=8*1024*1024):
        return original(path,96*1024*1024 if Path(path).name==JOURNAL else limit)
    lib['stable_file']=sql_journal_read
    return lib,libload('privileged_output.source',blobs)['private_record']'''
assert driver.count(oldlib)==1;driver=driver.replace(oldlib,newlib)
derive='''
def channel_snapshot():
    folder=CUSTODY/'csv-directed-diagnostic-20261017-v1'
    lib,_=libraries();lib['directory'](folder)
    raw,metadata=lib['stable_file'](folder/'capture.private.jsonl')
    if metadata['uid']!=os.getuid()or stat.S_IMODE(metadata['mode'])!=0o600:raise RuntimeError('pinned_channel_permissions')
    if len(raw)!=499893 or hashlib.sha256(raw).hexdigest()!='f6873eb97f5a70709675ad16b8b4879ff1a1953dc58464c704a80e735b5af8d5':raise RuntimeError('pinned_channel_capture_drift')
    rows=[json.loads(x)for x in raw.splitlines()]
    if rows[-1]['result']!='GATES_1_3_AND_CONTROLS_OBSERVED':raise RuntimeError('pinned_channel_not_complete')
    def command(ident):
        selected=[x for x in rows if x.get('event')=='command'and x.get('id')==ident]
        if len(selected)!=1 or selected[0]['exitCode']!=0:raise RuntimeError('pinned_channel_command')
        row=selected[0];b=base64.b64decode(row['stdoutBase64'],validate=True)
        if len(b)!=row['stdoutBytes']or hashlib.sha256(b).hexdigest()!=row['stdoutSha256']:raise RuntimeError('pinned_channel_bytes')
        return b
    value={'captureSha256':hashlib.sha256(raw).hexdigest(),'intervalUtc':[next(x['utc']for x in rows if x['event']=='begin'),rows[-1]['utc']],
        'route':json.loads(command('db-route')),'clientPathBase64':base64.b64encode(command('sql-client-path')).decode(),
        'clientVersionBase64':base64.b64encode(command('sql-client-version')).decode()}
    return json.dumps(value,sort_keys=True).encode()
'''
where=driver.index('\ndef materialize():');driver=driver[:where]+derive+driver[where:]
assert driver.count('try:raw=READ(source)')==1;driver=driver.replace('try:raw=READ(source)',"try:raw=channel_snapshot()if name=='channel.private.json'else READ(source)")
(out/'launch.py').write_text(launch);(out/'driver.py').write_text(driver)
# Derive the small private channel in memory only; never write it to Git or stdout.
scope={'__name__':'local_derivation_only','__file__':str(out/'driver.py')};exec(compile(driver,str(out/'driver.py'),'exec'),scope)
def read(p,limit=8*1024*1024):
 ns={'__name__':'accepted_reader','__file__':str(old/'launch.py')};exec(compile(accepted('launch.py'),str(old/'launch.py'),'exec'),ns);return ns['read'](p,limit)
bootstrap={}
for n in('read_package.py','privileged_output.source'):
 e=manifest['files'][n];p=r/e['source'];raw=p.read_bytes();assert h(raw)==e['sha256'];bootstrap[n]=raw
scope.update(BLOBS=bootstrap,READ=read);channel=scope['channel_snapshot']()
files={}
def add(n,p,boot=False):
 b=p.read_bytes();files[n]={'source':str(p.relative_to(r))if p.is_relative_to(r)else str(p),'relativeSource':os.path.relpath(p,out),'bytes':len(b),'sha256':h(b),'bootstrap':boot}
for n in('launch.py','driver.py','runner.py'):add(n,out/n,True)
for n in('read_package.py','privileged_output.source','ops.source','contracts.py'):
 e=manifest['files'][n];p=Path(e['source']);add(n,p if p.is_absolute()else r/p,e['bootstrap'])
for n in('identity.sql','ownership.sql','imports.sql'):add(n,rv/'crm-csv-three-gaps-procedure-20261017'/n)
add('capture_imports.source',rv/'crm-csv-operational-20261016/capture_imports.py')
files['channel.private.json']={'source':'derived-from-pinned-private-capture','relativeSource':'not-a-path-derived-in-memory','bytes':len(channel),'sha256':h(channel),'bootstrap':False,
 'derivedFrom':{'captureSha256':'f6873eb97f5a70709675ad16b8b4879ff1a1953dc58464c704a80e735b5af8d5','commandIds':['db-route','sql-client-path','sql-client-version']}}
(out/'MANIFEST.json').write_text(json.dumps({'base':'c5b6dbc4acbd09d609a0bc71beb1f925b6bcb91e','editableRunnerSourceSha256':h(body),'scope':'review-only three pinned SQLs; no trio/control refresh, no operational authority','files':files,'journalReadLimit':96*1024*1024},indent=2,sort_keys=True)+'\n')
print('SQL_REVIEW_COMPOSED_12_INPUTS_PRIVATE_CHANNEL_NOT_PUBLISHED')
