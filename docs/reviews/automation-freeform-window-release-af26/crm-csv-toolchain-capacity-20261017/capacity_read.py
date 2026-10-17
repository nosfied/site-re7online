"""Metadata-only projection of the canonical FD/metadata reader.
No mkdir/write, no file-content read, no images, no subprocess. Up to ONE
os.statvfs call on the held target directory FD; unsafe/missing target denies.
"""
import os,stat
from pathlib import Path
TARGET='/dev/shm/re7-csv-toolchain-read-20261017-v2'
REQUIRED=512*1024*1024
FIELDS=('f_bsize','f_frsize','f_blocks','f_bfree','f_bavail','f_files','f_ffree','f_favail','f_flag','f_namemax')

def collect(lib,target=TARGET):
    meta=lib['meta'];require=lib['require'];fds=[];held=[];stage='parents';calls=0
    result={'result':'CAPACITY_READ_DENY','target':target,'startedUtc':lib['utc'](),
            'readerUid':os.getuid(),'readerGid':os.getgid(),
            'paths':[],'statvfs':{'calls':0,'executed':False},'imagesCreationAttempted':False,
            'fileContentsRead':False,'remoteFilesWritten':False,'atomicSnapshot':False}
    try:
        require(target.startswith('/') and '..'not in Path(target).parts,'target_path')
        fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(fd)
        m=meta(os.fstat(fd));held.append((None,None,fd,m))
        result['paths'].append({'path':'/','exists':True,'metadata':m})
        parts=Path(target).parts[1:]
        for i,name in enumerate(parts):
            path='/'+ '/'.join(parts[:i+1]);row={'path':path}
            try:s=os.stat(name,dir_fd=fd,follow_symlinks=False)
            except OSError as e:
                row.update(exists=False if isinstance(e,FileNotFoundError)else None,errorClass=type(e).__name__,errno=e.errno)
                result['paths'].append(row);raise
            m=meta(s);row.update(exists=True,metadata=m);result['paths'].append(row)
            require(stat.S_ISDIR(s.st_mode),'parent_or_target_not_directory')
            child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);fds.append(child)
            require(meta(os.fstat(child))==m,'directory_replaced')
            held.append((fd,name,child,m));fd=child
        # Leaf metadata ONLY: images is never opened or created.
        def images():
            try:return {'path':target+'/images','exists':True,'metadata':meta(os.stat('images',dir_fd=fd,follow_symlinks=False))}
            except FileNotFoundError:return {'path':target+'/images','exists':False}
        before=images();result['paths'].append(before)
        stage='canonical-directory-check'
        # Original read-only predicate, separate from capacity; never new_directory.
        try:
            lib['directory'](Path(target));result['canonicalDirectory']={'result':'PASS'}
        except Exception as e:
            result['canonicalDirectory']={'result':'DENY','errorClass':type(e).__name__,'errno':getattr(e,'errno',None)}
        stage='statvfs'
        result['statvfs']={'calls':1,'executed':True,'api':'os.statvfs',
                          'operand':{'kind':'directory_fd','fd':fd,'logicalPath':target,'metadata':meta(os.fstat(fd))},
                          'startedUtc':lib['utc']()};calls=1
        try:
            v=os.statvfs(fd) # One result; both operands below come from THIS value.
            numbers={k:getattr(v,k)for k in FIELDS}
            if type(getattr(v,'f_fsid',None))is int:numbers['f_fsid']=v.f_fsid
            available=v.f_bavail*v.f_frsize
            result['statvfs'].update(result=numbers,product={'leftField':'f_bavail','leftValue':v.f_bavail,
                  'rightField':'f_frsize','rightValue':v.f_frsize,'availableBytes':available},
                  comparison={'operator':'>=','requiredBytes':REQUIRED,'satisfied':available>=REQUIRED})
        except OSError as e:
            result['statvfs'].update(errorClass=type(e).__name__,errno=e.errno);raise
        finally:result['statvfs']['finishedUtc']=lib['utc']()
        stage='metadata-after'
        require(images()==before,'images_metadata_changed')
        for parent,name,child,m in held:
            require(meta(os.fstat(child))==m,'directory_fd_changed')
            if parent is not None:require(meta(os.stat(name,dir_fd=parent,follow_symlinks=False))==m,'directory_path_changed')
        result.update(result='CAPACITY_METADATA_OBSERVED_NOT_CERTIFIED',pathMetadataStable=True)
    except Exception as e:
        result.update(denialStage=stage,denialReason=stage+'_not_proven',errorClass=type(e).__name__,errno=getattr(e,'errno',None))
    finally:
        for fd in reversed(fds):os.close(fd)
    result.update(finishedUtc=lib['utc'](),statvfsCallCount=calls)
    return result
