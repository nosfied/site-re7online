"""Local-only analysis of privately preserved, authenticated ELF bytes.
Never executes captured images or loaders. No remote tool dependency.
"""
import base64,hashlib,json,os,re,stat,subprocess,tempfile,resource
from pathlib import Path

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

def preflight(cap):
    lib=cap.lib;require=lib['require']
    row,raw=lib['file_chain']('/usr/bin/readelf',lib['IMAGE_LIMIT'])
    require(raw[:4]==b'\x7fELF' and os.access('/usr/bin/readelf',os.X_OK),'local_readelf_unavailable')
    for part in row['chains']:
        m=part['metadata'];require(m['uid']==0 and (stat.S_ISLNK(m['mode']) or not(m['mode']&0o022)),'local_readelf_path_unprotected')
    fd=os.open(row['resolved'],os.O_RDONLY|os.O_NOFOLLOW)
    try:
        require(lib['meta'](os.fstat(fd))==row['metadata'],'local_readelf_replaced')
        cap.command('local-readelf-version',['/proc/self/fd/'+str(fd),'--version'],pass_fds=(fd,),timeout=5)
        require(lib['meta'](os.fstat(fd))==row['metadata'] and lib['file_chain']('/usr/bin/readelf',lib['IMAGE_LIMIT'])[0]==row,'local_readelf_changed')
    finally:os.close(fd)
    cap.event('LOCAL_READELF_AVAILABLE',tool=row,remote=False)
    return row

def receive(driver):
    lib,record=driver['libraries']();Capture=driver['libload']('capture.source')['Capture']
    custody=driver['CUSTODY']/'csv-toolchain-discovery-20261017-v2'
    # Existing canonical custody must be legitimate; exclusive analysis directory.
    lib['directory'](custody)
    out=lib['new_directory'](driver['CUSTODY']/'csv-toolchain-analysis-20261017-v2');cap=Capture(out)
    stage='source-custody';ok=False;incoming=out/'images'
    try:
        require=lib['require'];raw,_=lib['stable_file'](custody/'capture.private.jsonl')
        rows=[json.loads(x)for x in raw.splitlines()]
        receipt_raw,_=lib['stable_file'](custody/'sequencer.journal.jsonl');receipt=json.loads(receipt_raw.splitlines()[-1])
        require(receipt['event']=='TOOLCHAIN_DISCOVERY_CUSTODY_PRESERVED_NOT_CERTIFIED' and receipt['manifestSha256']==driver['MANIFEST_SHA'] and receipt['sourceSha256']==lib['sha'](raw) and receipt['sourceBytes']==len(raw),'source_custody_receipt')
        require(rows[0]['event']=='transfer_inactive_begin' and rows[0]['manifestSha256']==driver['MANIFEST_SHA'],'source_manifest')
        refs=[x for x in rows if x['event']=='image-published']
        require(0<len(refs)<=64 and len({x['sha256']for x in refs})==len(refs),'image_set')
        require(all(type(x['sha256'])is str and re.fullmatch('[0-9a-f]{64}',x['sha256']) and type(x['bytes'])is int and 0<x['bytes']<=128*1024*1024 for x in refs),'image_reference_format')
        require(sum(x['bytes']for x in refs)<=128*1024*1024,'raw_budget')
        stage='local-tool';tool=preflight(cap)
        expected,_=lib['stable_file'](driver['MATERIAL']/'analyzer.private.json');require(json.loads(expected)==tool,'preflight_tool_changed')
        require(os.statvfs(out).f_bavail*os.statvfs(out).f_frsize>=2*1024**3,'local_budget_2GiB')
        incoming=out/'images';require(not incoming.exists() and not incoming.is_symlink(),'incoming_exists')
        require(lib['stable_file'](custody/'capture.private.jsonl')[0]==raw and lib['stable_file'](custody/'sequencer.journal.jsonl')[0]==receipt_raw,'source_changed_before_transfer')
        stage='transfer-images'
        argv=['scp','-p','-r','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',driver['HOST']+':'+driver['OUTPUT']+'/images',str(incoming)]
        started=lib['utc']();code=None;a=b=b'';error=None
        try:
            r=subprocess.run(argv,capture_output=True,timeout=240,check=False);code,a,b=r.returncode,r.stdout,r.stderr
        except (OSError,subprocess.TimeoutExpired)as e:error=e;a=getattr(e,'stdout',None)or b'';b=getattr(e,'stderr',None)or b''
        cap.bytes('image-transfer',argv,started,lib['utc'](),code,a,b,error)
        require(code==0 and error is None,'image_transfer_partial')
        stage='image-integrity';lib['directory'](incoming)
        require(set(os.listdir(incoming))=={x['sha256']+'.elf'for x in refs},'image_file_set')
        toolfd=os.open(tool['resolved'],os.O_RDONLY|os.O_NOFOLLOW)
        try:
            require(lib['meta'](os.fstat(toolfd))==tool['metadata'],'tool_replaced_before_analysis')
            for i,row in enumerate(refs):
                path=incoming/(row['sha256']+'.elf');data,m=lib['stable_file'](path,128*1024*1024)
                require(m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600 and len(data)==row['bytes'] and lib['sha'](data)==row['sha256'] and data[:4]==b'\x7fELF','transferred_image_drift')
                fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
                try:
                    require(lib['meta'](os.fstat(fd))==m,'image_replaced_before_analysis')
                    stage='local-elf';analyzer(cap,toolfd,fd,'local-elf-'+str(i))
                    require(lib['meta'](os.fstat(fd))==m and lib['meta'](path.lstat())==m,'image_changed_after_analysis')
                finally:os.close(fd)
                cap.event('LOCAL_ELF_ANALYZED',sha256=row['sha256'],bytes=row['bytes'],sourceMetadata=row['sourceMetadata'])
            require(lib['meta'](os.fstat(toolfd))==tool['metadata'] and lib['file_chain']('/usr/bin/readelf',lib['IMAGE_LIMIT'])[0]==tool,'tool_changed_after_analysis')
        finally:os.close(toolfd)
        require(lib['stable_file'](custody/'capture.private.jsonl')[0]==raw and lib['stable_file'](custody/'sequencer.journal.jsonl')[0]==receipt_raw,'source_changed_after_analysis')
        source_complete=any(x.get('result')=='DISCOVERY_OBSERVED_NOT_CERTIFIED' for x in rows)
        cap.event('end',result='LOCAL_ELF_ANALYZED_NOT_CERTIFIED',sourceComplete=source_complete,elfClosureCertified=False,protectionCertified=False,sourceCaptureSha256=lib['sha'](raw));ok=True
    except Exception as e:
        if incoming.exists():
            try:
                lib['directory'](incoming);names=os.listdir(incoming)
                lib['require'](len(names)<=64 and all(re.fullmatch('[0-9a-f]{64}[.]elf',n) for n in names),'partial_file_set')
                for i,name in enumerate(sorted(names)):
                    data,m=lib['stable_file'](incoming/name,128*1024*1024)
                    cap.observe('partial-image-'+str(i),lambda name=name,data=data,m=m:{'name':name,'bytes':len(data),'sha256':lib['sha'](data),'metadata':m,'certified':False})
            except Exception as partial:
                cap.event('partial-observation-denied',errorClass=type(partial).__name__,errno=getattr(partial,'errno',None))
        cap.event('end',result='DENY_NO_RETRY',denialStage=stage,denialReason=stage+'_not_proven',errorClass=type(e).__name__,errno=getattr(e,'errno',None))
    return 0 if ok else 1
