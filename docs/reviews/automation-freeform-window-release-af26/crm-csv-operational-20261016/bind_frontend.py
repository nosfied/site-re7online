"""Offline post-API phase verifier. Emits evidence, never authorizes frontend actions."""
import argparse,hashlib,json,os,stat
from pathlib import Path
from frontend_phase_contract import validate,require
def read(p):
    s=p.lstat();require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_input')
    return json.loads(p.read_text())
def bind(folder,out):
    folder=Path(folder);out=Path(out);s=out.parent.lstat()
    require(stat.S_ISDIR(s.st_mode)and not out.parent.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700,'private_output_parent')
    require(not out.exists()and not out.is_symlink(),'new_phase_receipt_required')
    before=read(folder/'before.private.json');after=read(folder/'after.private.json');complete=read(folder/'complete.private.json');starts=read(folder/'starts.private.json');expected=read(folder/'expected.private.json');matches=read(folder/'matches.private.json')
    validate(before,after,complete,starts,expected,matches)
    # Canonical phase contract checks system cron/crontab equality independently;
    # these hashes bind all consumed originals, including actual start receipts.
    evidence={f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in folder.iterdir()if f.name in ('before.private.json','after.private.json','complete.private.json','starts.private.json','expected.private.json','matches.private.json')}
    value={'result':'CSV_API_TO_FRONTEND_PHASE_VERIFIED','evidence':evidence,'successors':starts,'expected':expected,'executionAuthorized':False,'frontendSourceUnchanged':True,'bothCronsPreserved':True}
    fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w')as f:json.dump(value,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
    return {'result':value['result'],'executionAuthorized':False}
def materialize(folder,receipt,root,reader=None):
    import importlib.util,sys
    folder=Path(folder);root=Path(root);v=read(Path(receipt));after=read(folder/'after.private.json')
    require(v['result']=='CSV_API_TO_FRONTEND_PHASE_VERIFIED'and v['evidence']=={n:hashlib.sha256((folder/n).read_bytes()).hexdigest()for n in v['evidence']},'phase_receipt_drift')
    s=root.lstat();require(s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not root.is_symlink(),'private_frontend_root')
    require(not(root/'execution-authorized').exists()and not(root/'runtime.private.json').exists(),'frontend_binding_consumed')
    def put(name,value):
        p=root/name;fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w')as f:json.dump(value,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
    put('phase-binding.intent.private.json',{'phaseReceiptSha256':hashlib.sha256(Path(receipt).read_bytes()).hexdigest(),'automaticRetry':False})
    fields=['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']
    put('runtime.private.json',{'processes':[{'name':r['name'],'pid':r['pid'],'startTicks':r['startTicks'],**{k:r['pm2_env'][k]for k in fields}}for r in after['runtime']]})
    put('daemon.private.json',{k:after['daemon'][k]for k in ('pid','ticks')});put('live.private.json',after);put('saved.preparation.private.json',after['saved']);put('fallback.preparation.private.json',after['fallback'])
    (root/'execution-authorized').write_text('false\n');(root/'execution-authorized').chmod(0o600)
    if reader is None:
        spec=importlib.util.spec_from_file_location('csv_real_front_reader',root/'frontend-check.py');g=importlib.util.module_from_spec(spec);sys.path.insert(0,str(root));spec.loader.exec_module(g)
    else:g=reader # Local harness supplies only OS/path observations to the REAL reader.
    require(g.P==root,'frontend_remote_path_binding')
    for label in ('candidate','return'):g.init_run(label) # Only current /proc metadata + private controls, no PM2 command.
    runs={'source':after['activeRun'],**{l:g.run_from(l)for l in ('candidate','return')}}
    source=read(root/'root-sources.private.json');policy=read(root/'observer-policy.private.json.template')
    put('installed-policy-reference.private.json',{'policy':policy,'policySha256':source['window']['policySha256'],'helperSha256':source['window']['helperSha256']})
    policy.update(bootId=after['bootId'],daemon={k:after['daemon'][k]for k in ('pid','ticks')},roles={l:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(root/(l+'-tree.private.json'))}for l,r in runs.items()})
    put('observer-policy.private.json',policy);put('socket-observer-binding.private.json',{'policy':policy,'policySha256':hashlib.sha256((root/'observer-policy.private.json').read_bytes()).hexdigest(),'helperSha256':source['window']['helperSha256']})
    permanent=read(root/'permanent-policy.proposed.private.json.template');put('permanent-installed-binding.private.json',{'policy':permanent,'policySha256':source['permanent']['policySha256'],'helperSha256':source['permanent']['helperSha256']});permanent['roles']={l:{k:r[k]for k in ('release','entry','entrySha256','buildId')}for l,r in runs.items()};put('permanent-policy.proposed.private.json',permanent)
    pb={'policy':permanent,'policySha256':hashlib.sha256((root/'permanent-policy.proposed.private.json').read_bytes()).hexdigest(),'helperSha256':source['permanent']['helperSha256']};put('permanent-observer-binding.private.json',pb)
    front=next(r for r in after['runtime']if r['name']==g.FRONT);run=after['activeRun']
    put('origin.private.json',{'bootId':after['bootId'],'daemon':policy['daemon'],'pid':front['pid'],'ticks':front['startTicks'],'pm2ExecMode':front['pm2_env']['exec_mode'],'restartCount':front['pm2_env']['restart_time'],'sourceControl':after['activeControl'],'sourceNonce':run['nonce'],'sourceRelease':run['release'],'sourceEntry':run['entry'],'entrySha256':run['entrySha256'],'buildId':run['buildId'],'tree':g.tree(front['pid'])})
    put('phase-binding.receipt.private.json',{'result':'FRONTEND_DERIVED_BINDINGS_GATES_FALSE_REVIEW_REQUIRED','phaseSha256':hashlib.sha256(Path(receipt).read_bytes()).hexdigest(),'windowPolicySha256':hashlib.sha256((root/'observer-policy.private.json').read_bytes()).hexdigest(),'permanentPolicySha256':pb['policySha256'],'executionAuthorized':False})
    scripts=[f for f in root.iterdir()if f.is_file()and f.suffix in ('.py','.cjs')and '.config.'not in f.name]
    bindings=[f for f in root.iterdir()if f.is_file()and (f.suffix=='.json'or'.config.'in f.name or f.name=='execution-authorized')and not f.name.endswith('.template')]
    for name,files in [('scripts.sha256',scripts),('bindings.sha256',bindings)]:
        p=root/name;require(not p.exists(),'frontend_manifest_consumed');p.write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n'for f in sorted(files)));p.chmod(0o600)
    return {'result':'FRONTEND_DERIVED_BINDINGS_GATES_FALSE_REVIEW_REQUIRED'}
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--capture',required=True);a.add_argument('--receipt',required=True);a.add_argument('--materialize-root');v=a.parse_args()
    print(json.dumps(materialize(v.capture,v.receipt,v.materialize_root)if v.materialize_root else bind(v.capture,v.receipt)))
