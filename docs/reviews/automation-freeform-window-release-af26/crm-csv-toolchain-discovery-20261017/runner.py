"""Directed discovery only. Reuses canonical Capture, reader and private_record.
Never executes Node, PM2, captured JS, env, ldd, SQL or an installer.
"""
import json,os,stat,subprocess,tempfile,resource
from pathlib import Path

PATHS=('/usr/local/sbin','/usr/local/bin','/usr/sbin','/usr/bin','/sbin','/bin')
PM='/home/deploy/.npm-global/bin/pm2'
PM_SHA='bbb586713050b21d86aa41bde704a3a4776aa300ddcbd9710e81fa7c0089256d'
NODE_SHA='d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e'
JOURNAL='privileged-output.private.jsonl'

def load(name):
    scope={'__name__':'verified_library','__file__':'<verified '+name+'>','BLOBS':BLOBS}
    exec(compile(BLOBS[name],scope['__file__'],'exec'),scope)
    return scope

def analyzer(cap,tool_fd,image_fd,label):
    """Execute the observed OS analysis tool FD, not the target image.
    Per-channel hard file limit and wall timeout; preserve partial channels.
    readelf/its own OS loader are observed tools, not certified toolchain.
    """
    limit=1024*1024
    argv=['/proc/self/fd/'+str(tool_fd),'--wide','--program-headers','--dynamic','/proc/self/fd/'+str(image_fd)]
    started=cap.lib['utc']();code=None;error=None
    def bounds():resource.setrlimit(resource.RLIMIT_FSIZE,(limit,limit))
    with tempfile.TemporaryFile(dir=cap.q) as out,tempfile.TemporaryFile(dir=cap.q) as err:
        try:
            r=subprocess.run(argv,stdout=out,stderr=err,pass_fds=(tool_fd,image_fd),timeout=15,
                             env={'PATH':'/usr/bin:/bin','LANG':'C'},preexec_fn=bounds,check=False)
            code=r.returncode
        except (OSError,subprocess.TimeoutExpired) as e:error=e
        out.seek(0);err.seek(0);a=out.read(limit+1);b=err.read(limit+1)
    cap.bytes(label,argv,started,cap.lib['utc'](),code,a,b,error)
    cap.lib['require'](code==0 and error is None and len(a)<limit and len(b)<limit,'elf_analysis_denied')
    return a

def run(q,action):
    Capture=load('capture.source')['Capture'];cap=Capture(q);lib=cap.lib;require=lib['require']
    stage='begin';fds=[];ok=False
    cap.event('begin',action=action,manifestSha256=MANIFEST_SHA,atomicSnapshot=False)
    try:
        require(action=='collect','discovery_action_only')
        stage='pm2-shebang'
        pm,raw=lib['file_chain'](PM,65536)
        cap.observe('pm2-chain',lambda:pm)
        require(lib['sha'](raw)==PM_SHA and raw==b"#!/usr/bin/env node\n\nrequire('../lib/binaries/CLI.js');\n",'pm2_entry_drift')
        # Discover protection, never fix it. No captured script is executed.
        parent=str(Path(pm['resolved']).parent.parent)
        for ident,path in [('pm2-cli',parent+'/lib/binaries/CLI.js'),('pm2-package',parent+'/package.json'),('env-chain','/usr/bin/env')]:
            cap.observe(ident,lambda path=path:lib['file_chain'](path,lib['LIMIT'])[0])
        stage='path-selection';selected=None
        for index,folder in enumerate(PATHS):
            path=folder+'/node'
            try:os.lstat(path)
            except FileNotFoundError:
                cap.observe('path-'+str(index),lambda path=path:{'path':path,'absent':True});continue
            # Existing unreadable/broken/non-executable entries deny. Do not guess
            # env's skip semantics across an incomplete observation.
            row,raw=lib['file_chain'](path,lib['IMAGE_LIMIT'])
            cap.observe('path-'+str(index),lambda:row)
            require(os.access(path,os.X_OK),'path_entry_not_executable')
            selected=(path,row);break
        require(selected is not None,'node_path_absent')
        nodepath,node=selected
        require(node['sha256']==NODE_SHA,'selected_node_differs_from_historical_reference')
        def opened(path,row):
            fd=os.open(row['resolved'],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);fds.append(fd)
            require(lib['meta'](os.fstat(fd))==row['metadata'],'image_replaced_before_use')
            return fd
        nodefd=opened(nodepath,node)
        stage='analysis-tool'
        # Fixed tool chosen before access. ENOENT/EACCES => DENY, no fallback.
        tool,toolraw=lib['file_chain']('/usr/bin/readelf',lib['IMAGE_LIMIT'])
        require(toolraw[:4]==b'\x7fELF' and os.access('/usr/bin/readelf',os.X_OK),'analysis_tool_type_access')
        for part in tool['chains']:
            m=part['metadata']
            require(m['uid']==0 and (stat.S_ISLNK(m['mode']) or not(m['mode']&0o022)),'analysis_tool_path_unprotected')
        cap.observe('readelf-tool',lambda:tool);toolfd=opened('/usr/bin/readelf',tool)
        stage='selected-node-elf';analyzer(cap,toolfd,nodefd,'node-elf')
        # Binding running image to newly read pm2.pid is an interval, not a
        # promotion of old PIDs nor a certificate for the application's pair.
        stage='daemon-image'
        boot=lib['observe'](lib['BOOT_ID']);cap.observe('boot-before',lambda:boot)
        pidraw,pidmeta=lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)
        require(pidraw.strip().isdigit() and int(pidraw)>1 and pidmeta['uid']==os.getuid(),'pm2_pid_format_owner')
        pid=int(pidraw);folder=os.open('/proc/'+str(pid),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(folder)
        before=lib['proc_identity'](lib['read_at'](folder,'stat',65536))
        require(before['pid']==pid,'daemon_pid_identity')
        image=lib['executable'](folder,{})
        cap.observe('daemon-image',lambda:{'identity':before,'image':image})
        require(image['sha256']==node['sha256'],'running_selected_node_mismatch')
        stage='mapped-elf'
        maps=lib['read_at'](folder,'maps',262144)
        cap.bytes('daemon-maps',['read-fd','maps'],lib['utc'](),lib['utc'](),0,maps,b'')
        paths=set()
        for line in maps.decode('utf8').splitlines():
            fields=line.split(None,5)
            if len(fields)<6 or not fields[5].startswith('/'):continue
            path=fields[5]
            require(not path.endswith(' (deleted)') and '\\' not in path,'mapped_path_ambiguous')
            paths.add(path)
        require(len(paths)<=64,'mapped_file_count_bound')
        total=0
        for i,path in enumerate(sorted(paths)):
            row,raw=lib['file_chain'](path,lib['IMAGE_LIMIT']);total+=len(raw)
            require(total<=512*1024*1024,'mapped_total_bound')
            cap.observe('mapped-'+str(i),lambda:row)
            if raw[:4]!=b'\x7fELF':continue
            fd=opened(path,row)
            analyzer(cap,toolfd,fd,'mapped-elf-'+str(i))
            require(lib['meta'](os.fstat(fd))==row['metadata'],'mapped_image_changed')
        stage='interval-after'
        require(lib['read_at'](folder,'maps',262144)==maps,'daemon_maps_changed')
        require(lib['proc_identity'](lib['read_at'](folder,'stat',65536))==before,'daemon_identity_changed')
        require(lib['executable'](folder,{})==image,'daemon_image_changed')
        require(lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)==(pidraw,pidmeta),'pm2_pid_changed')
        require(lib['observe'](lib['BOOT_ID'])==boot,'boot_changed')
        require(lib['meta'](os.fstat(nodefd))==node['metadata'] and lib['file_chain'](nodepath,lib['IMAGE_LIMIT'])[0]==node,'selected_node_changed')
        require(lib['meta'](os.fstat(toolfd))==tool['metadata'] and lib['file_chain']('/usr/bin/readelf',lib['IMAGE_LIMIT'])[0]==tool,'analysis_tool_changed')
        require(lib['file_chain'](PM,65536)[0]==pm,'pm2_entry_changed')
        cap.event('end',result='DISCOVERY_OBSERVED_NOT_CERTIFIED',elfClosureCertified=False,protectionCertified=False,
                  remaining='Resolve DT_NEEDED/PT_INTERP/RPATH against mapped paths offline; unobserved JS/transitive paths remain UNKNOWN')
        ok=True
    except Exception as e:
        cap.event('end',result='DENY_NO_RETRY',denialStage=stage,denialReason=stage+'_not_proven',errorClass=type(e).__name__,errno=getattr(e,'errno',None))
    finally:
        for fd in reversed(fds):os.close(fd)
    return ok,lib['export'](str(q))
