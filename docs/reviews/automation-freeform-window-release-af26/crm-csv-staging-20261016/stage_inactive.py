"""One-shot inactive staging only. No policy install, PM2, admission or data mutation."""
import datetime,hashlib,json,os,posixpath,stat,subprocess,tarfile
from pathlib import Path
I=Path('/opt/re7online/backups/converta-persistent/preparations/csv-staging-incoming-20261016T092610Z')
NAME='incident-csv-window-staged-20261016T092610Z';P=I.parent/NAME
TARGETS={'api-candidate':Path('/opt/re7online/releases/crm-csv-24e5857f-20261016/apps/whatsapp-agent'),'frontend-candidate':Path('/opt/re7online/releases/crm-csv-front-ea3d2788-20261016'),'frontend-compatible-return':Path('/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016')}
def require(v,r):
    if not v:raise RuntimeError(r)
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb')as f:
        for chunk in iter(lambda:f.read(1024**2),b''):h.update(chunk)
    return h.hexdigest()
def write(p,v):
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
def minimum():
    v=os.statvfs(I);pg=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,stderr=subprocess.PIPE,timeout=15).splitlines()[-1].split()[3]);return min(v.f_bavail*v.f_frsize,pg)
def extract_artifact(name,dest):
    manifest=json.loads((I/(name+'.manifest.private.json')).read_text());expected={e['path']:e for e in manifest['files']};archive=I/(name+('.tar'if name=='api-candidate'else'.tar.gz'))
    with tarfile.open(archive)as t:
        members=t.getmembers();require(len(members)==len(expected)and{m.name for m in members}==set(expected),'member_population')
        for m in members:
            require(not Path(m.name).is_absolute()and'..'not in Path(m.name).parts,'member_path');e=expected[m.name]
            if 'target'in e:
                require(m.issym()and m.linkname==e['target']and not m.linkname.startswith('/'),'link_contract');link=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname));require(not link.startswith('../')and link in expected,'external_archive_link')
            else:require(m.isfile()and hashlib.sha256(t.extractfile(m).read()).hexdigest()==e['sha256'],'member_hash')
        require(not os.path.lexists(dest),'staging_target_exists_no_overwrite');dest.mkdir(mode=0o700,parents=True);t.extractall(dest,filter='data')
    for rel,e in expected.items():
        f=dest/rel
        if 'target'in e:require(f.is_symlink()and os.readlink(f)==e['target'],'restored_link')
        else:require(f.is_file()and not f.is_symlink()and sha(f)==e['sha256'],'restored_member')
    if name=='api-candidate':
        for e in manifest['sharedLinks']:
            rel=e['path'];f=dest/rel;require(not os.path.lexists(f)and Path(e['target']).is_dir(),'shared_dependency');f.symlink_to(e['target'],target_is_directory=True)
    return {'files':len(expected),'allocatedUniqueBytes':sum(f.lstat().st_blocks*512 for f in dest.rglob('*')),'buildId':(dest/'.next/BUILD_ID').read_text().strip()if name!='api-candidate'else None}
def main():
    os.umask(0o077);s=I.lstat();require(stat.S_ISDIR(s.st_mode)and not I.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700,'private_incoming')
    require(not(P.exists()or P.is_symlink())and not(I/'staging.intent.private.json').exists(),'staging_consumed')
    require(sha(I/'incoming-index.private.json')=='7b26f0a8718a36df233263f403424e519630fd4c99821bbc770a6023c9a6adf3','sealed_incoming_index_drift')
    index=json.loads((I/'incoming-index.private.json').read_text());require(len(index)==9,'incoming_population')
    for name,e in index.items():
        f=I/name;s=f.lstat();require(Path(name).name==name and stat.S_ISREG(s.st_mode)and not f.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600 and sha(f)==e['sha256']and s.st_size==e['bytes'],'incoming_hash_type_owner_mode')
    before=minimum();require(before>=11235700736,'capacity_before_staging')
    for d in TARGETS.values():require(not os.path.lexists(d),'target_already_exists')
    write(I/'staging.intent.private.json',{'generation':NAME,'incomingIndexSha256':sha(I/'incoming-index.private.json'),'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'automaticRetry':False})
    with tarfile.open(I/'csv-staged-controls.private.tar')as t:
        for m in t.getmembers():require(m.isfile()and m.name.startswith(NAME+'/')and'..'not in Path(m.name).parts,'control_archive_scope')
        t.extractall(I.parent,filter='data')
    artifacts={n:extract_artifact(n,d)for n,d in TARGETS.items()}
    # Overlay is received/hashed only. NEVER extract/apply it over the source.
    require(all(x is False for x in json.loads((P/'window/execution-gates.private.json').read_text()).values())and(P/'execution-authorized').read_text().strip()=='false','gates_not_false')
    after=minimum();require(after>=11235700736,'capacity_after_staging')
    write(I/'staging.receipt.private.json',{'result':'CSV_INACTIVE_STAGING_COMPLETE','generation':NAME,'artifacts':artifacts,'minimumBeforeBytes':before,'minimumAfterBytes':after,'reviewSha256':sha(P/'preparation-review.sha256'),'policySha256':sha(P/'window/privileged-policy.private.json'),'installerSha256':sha(P/'install-api-window-policy.sh'),'eventOverlayApplied':False,'gatesAdmitted':False,'backupRenewed':False,'rootShortCapture':False,'processActions':0})
    print(json.dumps({'result':'CSV_INACTIVE_STAGING_COMPLETE','minimumAfterBytes':after,'artifacts':3,'eventOverlayApplied':False,'processActions':0}))
if __name__=='__main__':main()
