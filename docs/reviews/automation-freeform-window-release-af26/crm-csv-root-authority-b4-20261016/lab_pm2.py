"""Full local PM2 CLI/daemon/IPC/children proof, synthetic isolated namespace.
No production access, ports, credentials, SQL or application/runtime package.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import types

HERE=Path(__file__).resolve().parent
B3=HERE.parent/'crm-csv-root-authority-b3-20261016'


def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def run(toolchain):
    toolchain=Path(toolchain).resolve();pm=toolchain/'node_modules/pm2/bin/pm2'
    node=shutil.which('node');assert node and pm.is_file(),'LOCAL_TOOLCHAIN_UNAVAILABLE'
    # Real npm PM2 package + its transitive modules, no source stubs.
    assert json.loads((pm.parents[1]/'package.json').read_text())['version']=='6.0.14'
    with tempfile.TemporaryDirectory(prefix='re7-b4-pm2-isolated-')as td:
        lab=Path(td);home=lab/'pm2-home';home.mkdir(mode=0o700)
        env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','HOME':str(lab),'PM2_HOME':str(home),
             'PM2_DISABLE_VERSION_CHECK':'true','PM2_SILENT':'true','LANG':'C.UTF-8'}
        cli=lambda args,**kw:subprocess.check_output([str(pm),*args],env=env,stderr=subprocess.PIPE,text=True,timeout=35,**kw)
        app=lab/'app.cjs'
        app.write_text("const fs=require('fs');fs.writeFileSync(process.env.LAB_REPORT,JSON.stringify({pid:process.pid,cwd:process.cwd(),execPath:process.execPath,name:process.env.LAB_NAME,token:process.env.SYNTHETIC_VALUE}));setInterval(()=>{},1000);\n")
        parser=types.ModuleType('parser');exec((B3.parent/'v4-sequencer/ecosystem_contract.py').read_text(),parser.__dict__)
        helper=types.ModuleType('pm2_input');helper.__file__=str(B3/'pm2_input.py')
        # Import dependency is real canonical parser; production Context is NOT
        # claimed here. We test the B3 sealed FD function and complete PM2 chain.
        import sys
        prior=sys.modules.get('ecosystem_contract');sys.modules['ecosystem_contract']=parser
        try:exec(compile((B3/'pm2_input.py').read_bytes(),str(B3/'pm2_input.py'),'exec'),helper.__dict__)
        finally:
            if prior is None:sys.modules.pop('ecosystem_contract',None)
            else:sys.modules['ecosystem_contract']=prior
        alias=lab/'pm2-input.json';alias.symlink_to('/proc/self/fd')
        names=['re7-whatsapp-agent','re7-whatsapp-web-worker']
        apps=[]
        for name in names:
            cwd=lab/name;cwd.mkdir()
            apps.append({'name':name,'cwd':str(cwd),'script':str(app),'interpreter':node,'watch':False,
                'autorestart':False,'env':{'LAB_REPORT':str(lab/(name+'.json')),'LAB_NAME':name,
                    'SYNTHETIC_VALUE':'synthetic-'+name},'out_file':str(lab/(name+'.out')),
                    'error_file':str(lab/(name+'.err'))})
        config={'apps':apps};data=json.dumps(config).encode();source=lab/'replaceable.config.cjs';source.write_text('module.exports='+json.dumps(config)+';')
        effects=[];pids=[];daemon=None
        try:
            cli(['ping']);daemon=int((home/'pm2.pid').read_text())
            for name in names:
                fd=helper.sealed_fd(data)
                try:
                    # Alter origin BEFORE the actual CLI, shebang and full parser.
                    source.write_text('throw Error("mutable ecosystem must not execute");')
                    cli(['start',str(alias/str(fd)),'--only',name],pass_fds=(fd,))
                finally:os.close(fd)
                deadline=time.monotonic()+10;report=lab/(name+'.json')
                while not report.exists()and time.monotonic()<deadline:time.sleep(0.05)
                observed=json.loads(report.read_text());pids.append(observed['pid'])
                wanted=next(a for a in apps if a['name']==name)
                assert observed['cwd']==wanted['cwd']and observed['execPath']==node
                assert observed['name']==name and observed['token']=='synthetic-'+name
                effects.append(name)
            listing=json.loads(cli(['jlist']));assert {a['name']for a in listing}==set(names)
            for a in listing:
                wanted=next(x for x in apps if x['name']==a['name']);m=a['pm2_env']
                assert m['status']=='online'and m['pm_cwd']==wanted['cwd']and m['pm_exec_path']==str(app)
                assert m['exec_interpreter']==node and m['watch']is False and m['autorestart']is False
                assert m['SYNTHETIC_VALUE']==wanted['env']['SYNTHETIC_VALUE']
            cli(['save']);assert (home/'dump.pm2').is_file()
            result={'result':'FULL_PM2_CLI_DAEMON_IPC_CHILDREN_PASS','pm2':'6.0.14',
                'node':subprocess.check_output([node,'--version'],text=True).strip(),'selectedOrder':effects,
                'FDInheritanceReal':True,'replacedCjsExecuted':False,'normalizationIPCAndChildrenReal':True,
                'actualAuthorityQuery':False,'rootAliasMetadataReal':False,'productionEffects':False,
                'toolchainFiles':{str(p.relative_to(toolchain)):sha(p)for p in sorted((toolchain/'node_modules').rglob('*'))if p.is_file()and not p.is_symlink()},
                'packageLockSha256':sha(toolchain/'package-lock.json')}
        finally:
            # Exact namespace only. Even a lost ping response may leave a PID.
            if daemon is None and (home/'pm2.pid').exists():daemon=int((home/'pm2.pid').read_text())
            if daemon is not None:
                cli(['kill'])
                for pid in [daemon,*pids]:
                    deadline=time.monotonic()+5
                    while time.monotonic()<deadline:
                        try:
                            state=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[0]
                        except FileNotFoundError:break
                        if state=='Z':break
                        time.sleep(0.05)
                    else:raise RuntimeError('LAB_NAMESPACE_PROCESS_NOT_EXITED')
        result['namespaceShutdownConfirmed']=not(home/'pm2.pid').exists()
        result['daemonAndChildrenExitObserved']=True
        assert result['namespaceShutdownConfirmed']
        return result

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--toolchain',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    value=run(a.toolchain);Path(a.output).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
    print(json.dumps({k:v for k,v in value.items()if k!='toolchainFiles'},sort_keys=True))
