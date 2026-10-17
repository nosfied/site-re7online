"""Directed discovery only. Reuses canonical Capture, reader and private_record.
Never executes Node, PM2, captured JS, env, ldd, SQL or an installer.
"""
import json,os,stat
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

def run(q,action):
    Capture=load('capture.source')['Capture'];cap=Capture(q);lib=cap.lib;require=lib['require']
    stage='begin';fds=[];ok=False;published={};total=0
    cap.event('begin',action=action,manifestSha256=MANIFEST_SHA,atomicSnapshot=False)
    try:
        stage='remote-budget'
        require(os.statvfs(q).f_bavail*os.statvfs(q).f_frsize>=512*1024*1024,'remote_budget_512MiB')
        images=lib['new_directory'](q/'images')
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
            row,raw=lib['file_chain'](path,128*1024*1024)
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
        stage='mapped-bytes'
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
        # Publish only ELF objects required by local readelf, once per digest.
        # Canonical write_artifact O_EXCL/no-follow and private_record, no new writer.
        def preserve(row,data,fd):
            nonlocal total
            require(lib['meta'](os.fstat(fd))==row['metadata'],'image_changed_before_preserve')
            if row['sha256'] in published:return
            require(data[:4]==b'\x7fELF','image_not_elf')
            require(len(published)<64,'object_count_bound')
            require(total+len(data)<=128*1024*1024,'raw_image_budget_128MiB')
            lib['write_artifact'](images/(row['sha256']+'.elf'),data)
            require(lib['meta'](os.fstat(fd))==row['metadata'],'image_changed_after_preserve')
            cap.event('image-published',sha256=row['sha256'],bytes=len(data),sourceMetadata=row,
                      startedUtc=lib['utc'](),finishedUtc=lib['utc'](),justification='ELF bytes absent from accepted local byte sources; needed for local readelf; no runtime tree copied')
            published[row['sha256']]=row;total+=len(data)
        row,noderaw=lib['file_chain'](nodepath,128*1024*1024)
        require(row==node,'node_changed_before_preserve');preserve(node,noderaw,nodefd)
        for i,path in enumerate(sorted(paths)):
            row,data=lib['file_chain'](path,128*1024*1024)
            cap.observe('mapped-'+str(i),lambda:row)
            if data[:4]!=b'\x7fELF':continue
            fd=opened(path,row);preserve(row,data,fd)
            require(lib['meta'](os.fstat(fd))==row['metadata'],'mapped_image_changed')
        stage='interval-after'
        require(lib['read_at'](folder,'maps',262144)==maps,'daemon_maps_changed')
        require(lib['proc_identity'](lib['read_at'](folder,'stat',65536))==before,'daemon_identity_changed')
        require(lib['executable'](folder,{})==image,'daemon_image_changed')
        require(lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)==(pidraw,pidmeta),'pm2_pid_changed')
        require(lib['observe'](lib['BOOT_ID'])==boot,'boot_changed')
        require(lib['meta'](os.fstat(nodefd))==node['metadata'] and lib['file_chain'](nodepath,128*1024*1024)[0]==node,'selected_node_changed')
        require(lib['file_chain'](PM,65536)[0]==pm,'pm2_entry_changed')
        cap.event('end',result='DISCOVERY_OBSERVED_NOT_CERTIFIED',elfClosureCertified=False,protectionCertified=False,
                  bytesPreserved=total,images=len(published),remaining='Analyze preserved bytes locally only; unobserved JS/transitive paths remain UNKNOWN')
        ok=True
    except Exception as e:
        cap.event('end',result='DENY_NO_RETRY',denialStage=stage,denialReason=stage+'_not_proven',errorClass=type(e).__name__,errno=getattr(e,'errno',None))
    finally:
        for fd in reversed(fds):os.close(fd)
    return ok,lib['export'](str(q))
