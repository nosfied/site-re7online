"""R1/R2 review-only observation/custody. No operational imports or actions.
Root mode only reads fixed paths. Every journal uses canonical private_record.
Production invocation must load these exact reviewed bytes (see COMMANDS.md).
"""
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

REMOTE = '/dev/shm/re7-csv-r1r2-read-20261016-v1'
LOCAL = '/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r1r2-read-20261016-v1'
HOST = 'deploy@admin.re7online.com'
WRITER_SHA = '93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a'
LIB = '/usr/local/libexec/re7/'
PROTECTED = tuple(LIB+n for n in ('authority.py','root_store.py','verified_loader.py',
    'child_transport.py','privileged_output.py','recovery-launch.py',
    'recovery-node-launch.cjs','incident-6683-window-control.py')) + (
    '/etc/sudoers.d/re7-incident-6683-window', LIB+'pm2-input.json')
EXTRA = (LIB+'incident-6683-window-policy.json','/etc/cron.d/re7-converta-backup',
    '/var/lib/re7/incident-6683-v4-control.lock',
    '/var/lib/re7/static-authority-installs',
    '/home/deploy/.pm2/pm2.pid','/home/deploy/.pm2/dump.pm2','/home/deploy/.pm2/dump.pm2.bak',
    '/proc/sys/kernel/random/boot_id',
    '/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts')
# Do not export secret-bearing saved dumps; their hashes/metadata suffice for discovery.
CONTENT = set(PROTECTED) - {LIB+'pm2-input.json'} | {
    LIB+'incident-6683-window-policy.json','/etc/cron.d/re7-converta-backup',
    '/home/deploy/.pm2/pm2.pid','/proc/sys/kernel/random/boot_id'}
JOURNAL = 'privileged-output.private.jsonl'
LIMIT = 8 * 1024 * 1024


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def meta(s):
    return {k:getattr(s,'st_'+k) for k in
            ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns')}


def directory(path):
    p=Path(path);s=p.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and
            stat.S_IMODE(s.st_mode)==0o700,'private_directory_contract')
    for q in p.parents:
        require(not q.is_symlink(),'private_ancestor_symlink')
    return p


def new_directory(path):
    p=Path(path)
    # Existing custody parent must be owner700. /dev/shm is the documented tmpfs.
    if p.parent != Path('/dev/shm'):
        directory(p.parent)
    p.mkdir(mode=0o700)  # no parents=True, no exist_ok, no chmod/repair
    return directory(p)


def stable_file(path, limit=LIMIT):
    p=Path(path);before=p.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink==1,'file_type_or_links')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        first=os.fstat(fd);require(meta(first)==meta(before),'file_replaced_before_open')
        require(first.st_size<=limit,'file_size_bound')
        with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(limit+1)
        require(len(raw)<=limit and meta(os.fstat(fd))==meta(first) and
                meta(p.lstat())==meta(first),'file_changed_during_read')
        return raw,meta(first)
    finally:
        os.close(fd)


def writer(package):
    raw,_=stable_file(Path(package)/'privileged_output.source')
    require(sha(raw)==WRITER_SHA,'canonical_writer_hash')
    module={'__name__':'canonical_private_output','__file__':'<pinned canonical writer>'}
    exec(compile(raw,'<pinned canonical writer>','exec'),module)
    return module['private_record']


def write_artifact(path, raw):
    """Byte-preserved transport artifact, never a replacement journal writer."""
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(raw);f.flush();os.fsync(f.fileno())


def observe(path, root=Path('/')):
    """No-follow, anchored directory FDs; metadata is NOT an atomic filesystem snapshot."""
    parts=Path(path).parts[1:];fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    chains=[];opened=[]
    try:
        chains.append({'path':'/','metadata':meta(os.fstat(fd))})
        for ix,part in enumerate(parts[:-1]):
            try:s=os.stat(part,dir_fd=fd,follow_symlinks=False)
            except FileNotFoundError:
                return {'path':path,'kind':'absent','missingAncestor':'/'+ '/'.join(parts[:ix+1]),'chains':chains}
            require(stat.S_ISDIR(s.st_mode),'ancestor_type_or_symlink')
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            if meta(os.fstat(child))!=meta(s):
                os.close(child);raise RuntimeError('ancestor_replaced')
            opened.append((fd,part,meta(s)));fd=child
            chains.append({'path':'/'+ '/'.join(parts[:ix+1]),'metadata':meta(s)})
        leaf=parts[-1]
        try:s=os.stat(leaf,dir_fd=fd,follow_symlinks=False)
        except FileNotFoundError:
            return {'path':path,'kind':'absent','chains':chains}
        info={'path':path,'metadata':meta(s),'chains':chains}
        if stat.S_ISLNK(s.st_mode):
            info.update(kind='symlink',target=os.readlink(leaf,dir_fd=fd))
        elif stat.S_ISDIR(s.st_mode):info['kind']='directory'
        elif stat.S_ISREG(s.st_mode):
            f=os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
            try:
                require(meta(os.fstat(f))==meta(s),'leaf_replaced_before_read')
                require(s.st_size<=LIMIT,'target_size_bound')
                with os.fdopen(f,'rb',closefd=False) as stream:raw=stream.read(LIMIT+1)
                require(len(raw)<=LIMIT and meta(os.fstat(f))==meta(s),'leaf_changed_during_read')
                info.update(kind='file',bytes=len(raw),sha256=sha(raw))
                if path in CONTENT:info['bytesBase64']=base64.b64encode(raw).decode()
            finally:os.close(f)
        else:info['kind']='other'  # discovery, never approved type
        require(meta(os.stat(leaf,dir_fd=fd,follow_symlinks=False))==meta(s),'leaf_changed_after_read')
        for parent,name,old in opened:
            require(meta(os.stat(name,dir_fd=parent,follow_symlinks=False))==old,'ancestor_changed')
        return info
    finally:
        os.close(fd)
        for parent,_,_ in reversed(opened):os.close(parent)


def root_inventory(root=Path('/')):
    rows=[];errors=[]
    for path in PROTECTED+EXTRA:
        started=utc()
        try:
            row=observe(path,root);row.update(startedUtc=started,finishedUtc=utc());rows.append(row)
        except Exception as e:errors.append({'path':path,'startedUtc':started,'finishedUtc':utc(),'errorClass':type(e).__name__})
    return {'result':'RAW_INVENTORY_COMPLETE'if not errors else'RAW_INVENTORY_DENY',
            'utc':utc(),'targets':rows,'errors':errors,'atomicSnapshot':False,
            'operationalCertification':False}


def specs(raw):
    return [('root-inventory',['sudo','-n','/usr/bin/python3','-B','-I','-S','-','root'],raw),
            ('deploy-cron',['crontab','-l'],None),
            ('supervision',['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],None),
            ('process-discovery',['ps','-eo','pid,ppid,uid,lstart,comm'],None),
            ('listener-discovery',['ss','-ltnp'],None),
            ('tool-path-discovery',['/bin/sh','-ec','for N in node pm2; do if P=$(command -v "$N"); then printf "%s=%s\\n" "$N" "$P"; else printf "%s=NOT_RESOLVED_IN_FIXED_PATH\\n" "$N"; fi; done'],None)]


def collect(package, raw, target=REMOTE, run=subprocess.run):
    record=writer(package);folder=new_directory(target)
    record(folder,JOURNAL,{'event':'r1r2_begin','utc':utc(),'readerSha256':sha(raw),
           'commandIds':[x[0]for x in specs(raw)],'certification':False})
    success=True
    for ident,args,stdin in specs(raw):
        started=utc();code=None;stdout=b'';stderr=b'';error=None
        try:
            result=run(args,input=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                       timeout=45 if ident=='root-inventory' else 10,check=False,
                       env={'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','LANG':'C','HOME':'/home/deploy'})
            code,stdout,stderr=result.returncode,result.stdout,result.stderr
        except subprocess.TimeoutExpired as e:
            stdout,stderr=e.stdout or b'',e.stderr or b'';error='TimeoutExpired'
        except OSError as e:
            stderr=str(e).encode();error=type(e).__name__
        valid=code==0
        if valid and ident=='root-inventory':
            try:
                inventory=json.loads(stdout);valid=inventory['result']=='RAW_INVENTORY_COMPLETE'
                require(len(inventory['targets'])==len(PROTECTED+EXTRA),'inventory_count')
                require([x['path']for x in inventory['targets']]==list(PROTECTED+EXTRA),'inventory_coverage')
            except Exception:valid=False
        record(folder,JOURNAL,{'event':'r1r2_command','id':ident,'argv':args,
          'stdinBytes':len(stdin or b''),'stdinSha256':sha(stdin or b''),
          'startedUtc':started,'finishedUtc':utc(),'exitCode':code,'errorClass':error,
          'accepted':valid,'stdoutBytes':len(stdout),'stderrBytes':len(stderr),
          'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),
          'stdoutBase64':base64.b64encode(stdout).decode(),'stderrBase64':base64.b64encode(stderr).decode()})
        if not valid:success=False;break
    record(folder,JOURNAL,{'event':'r1r2_end','utc':utc(),'result':'RAW_READS_COMPLETE'if success else'RAW_READS_DENY','certification':False})
    return success


def export(target=REMOTE):
    folder=directory(target);raw,m=stable_file(folder/JOURNAL)
    require(m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600,'capture_permissions')
    return {'format':'R1R2_BYTE_EXACT_TRANSFER_V1','source':str(folder/JOURNAL),
            'metadata':m,'sourceUid':os.getuid(),'bytes':len(raw),'sha256':sha(raw),
            'bytesBase64':base64.b64encode(raw).decode(),'atomicSnapshot':False}


def validate_capture(raw, reader_raw):
    reader_hash=sha(reader_raw)
    lines=[json.loads(x)for x in raw.splitlines()];require(len(lines)>=3,'capture_incomplete')
    begin,end=lines[0],lines[-1];expected=[x[0]for x in specs(b'')]
    require(begin['event']=='r1r2_begin' and begin['readerSha256']==reader_hash and
            begin['commandIds']==expected,'capture_origin')
    commands=lines[1:-1]
    require(len(commands)==len(expected),'command_count')
    for row,ident in zip(commands,expected):
        require(row['event']=='r1r2_command' and row['id']==ident,'command_identity')
        require(row['argv']==next(x[1]for x in specs(b'')if x[0]==ident),'command_argv')
        if ident!='root-inventory':
            require(row['stdinBytes']==0 and row['stdinSha256']==sha(b''),'unexpected_stdin')
        for channel in ('stdout','stderr'):
            data=base64.b64decode(row[channel+'Base64'],validate=True)
            require(len(data)==row[channel+'Bytes'] and sha(data)==row[channel+'Sha256'],'command_bytes')
        require(row['accepted']is True and row['exitCode']==0 and row['errorClass']is None,'command_denied')
        if ident=='root-inventory':
            require(row['stdinSha256']==reader_hash and row['stdinBytes']==len(reader_raw),'reader_stdin_binding')
            v=json.loads(base64.b64decode(row['stdoutBase64']))
            require(v['result']=='RAW_INVENTORY_COMPLETE' and not v['errors'] and
                    [x['path']for x in v['targets']]==list(PROTECTED+EXTRA),'inventory_coverage')
            for item in v['targets']:
                if 'bytesBase64'in item:
                    b=base64.b64decode(item['bytesBase64'],validate=True)
                    require(sha(b)==item['sha256'] and len(b)==item['bytes'],'target_bytes')
    require(end['event']=='r1r2_end' and end['result']=='RAW_READS_COMPLETE' and
            end['certification']is False,'capture_terminal_denied')
    return lines


def custody(package, raw, target=LOCAL, run=subprocess.run):
    record=writer(package);folder=new_directory(target)
    args=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,
          '/usr/bin/python3','-B','-I','-S','-','export']
    code=None;stdout=b'';stderr=b'';error=None
    try:
        result=run(args,input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,check=False)
        code,stdout,stderr=result.returncode,result.stdout,result.stderr
    except subprocess.TimeoutExpired as e:stdout,stderr=e.stdout or b'',e.stderr or b'';error='TimeoutExpired'
    except OSError as e:stderr=str(e).encode();error=type(e).__name__
    # Preserve incomplete/failed transport bytes as well; no overwrite or resume.
    write_artifact(folder/'transfer.stdout.private',stdout);write_artifact(folder/'transfer.stderr.private',stderr)
    record(folder,JOURNAL,{'event':'r1r2_transport','argv':args,'exitCode':code,'errorClass':error,
      'stdoutBytes':len(stdout),'stderrBytes':len(stderr),'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),'utc':utc()})
    try:
        require(code==0 and error is None,'transfer_failed')
        frame=json.loads(stdout);require(frame['format']=='R1R2_BYTE_EXACT_TRANSFER_V1' and
          frame['source']==REMOTE+'/'+JOURNAL,'transfer_source')
        original=base64.b64decode(frame['bytesBase64'],validate=True)
        require(len(original)==frame['bytes'] and sha(original)==frame['sha256'],'transfer_bytes')
        require(stat.S_ISREG(frame['metadata']['mode']) and stat.S_IMODE(frame['metadata']['mode'])==0o600 and
                frame['metadata']['uid']==frame['sourceUid'] and frame['metadata']['nlink']==1 and frame['metadata']['size']==len(original),'transfer_source_metadata')
        write_artifact(folder/'original-capture.private.jsonl',original)
        lines=validate_capture(original,raw)
        for row in lines:record(folder,JOURNAL,row)
        record(folder,'sequencer.journal.jsonl',{'event':'R1R2_CUSTODY_COMPLETE_NOT_CERTIFIED',
          'sourceSha256':sha(original),'sourceBytes':len(original),'commands':len(lines)-2,
          'readerSha256':sha(raw),'utc':utc(),'certification':False})
        return True
    except Exception as e:
        record(folder,'sequencer.journal.jsonl',{'event':'R1R2_CUSTODY_DENY','errorClass':type(e).__name__,'utc':utc()})
        return False


def main():
    require(len(sys.argv)==2,'exact_action_required');action=sys.argv[1]
    if action=='root':
        value=root_inventory();print(json.dumps(value,sort_keys=True));return not value['errors']
    if action=='export':print(json.dumps(export(),sort_keys=True));return True
    require(action in ('collect','custody'),'action_denied')
    # Launcher supplies already reviewed bytes, also used unchanged as stdin to root/export.
    raw=globals().get('APPROVED_RAW');require(type(raw)is bytes,'reviewed_launcher_required')
    package=Path(__file__).resolve().parent
    ok=collect(package,raw)if action=='collect'else custody(package,raw)
    print('R1R2_RAW_COLLECTION_COMPLETE_NOT_CERTIFIED'if ok and action=='collect'else
          'R1R2_CUSTODY_COMPLETE_NOT_CERTIFIED'if ok else'R1R2_DENY_PRESERVE_NO_RETRY')
    return ok

if __name__=='__main__':
    try:sys.exit(0 if main()else 1)
    except Exception:
        print('R1R2_DENY_PRESERVE_NO_RETRY',file=sys.stderr);sys.exit(1)
