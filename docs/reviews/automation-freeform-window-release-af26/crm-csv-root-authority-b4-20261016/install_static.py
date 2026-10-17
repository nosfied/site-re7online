"""Future owner-only static installer. Never emit anchor/permit or run a phase.
Production CLI has fixed destinations, canonical lock, no laboratory switch.
Tests inject a filesystem rooted in a disposable directory; no installed effect.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

LIB=Path('/usr/local/libexec/re7')
LOCK=Path('/var/lib/re7/incident-6683-v4-control.lock')
JOURNAL=Path('/var/lib/re7/static-authority-installs')
ALIAS=LIB/'pm2-input.json'
TARGETS={n:(LIB/n,0o644)for n in ('authority.py','root_store.py','verified_loader.py','child_transport.py',
    'privileged_output.py','recovery-launch.py','recovery-node-launch.cjs','incident-6683-window-control.py')}
TARGETS['re7-incident-6683-window']=(Path('/etc/sudoers.d/re7-incident-6683-window'),0o440)


def require(ok,reason):
    if not ok:raise RuntimeError(reason)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()


class Filesystem:
    uid=0
    def path(self,p):return Path(p)
    def chain(self,p):
        for parent in self.path(p).parents:
            s=parent.lstat()
            require(stat.S_ISDIR(s.st_mode)and s.st_uid==self.uid and not s.st_mode&0o022,'static_root_chain')
    def read(self,p):
        p=self.path(p);s=p.lstat()
        require(stat.S_ISREG(s.st_mode)and s.st_nlink==1 and not p.is_symlink(),'static_not_regular')
        return p.read_bytes()
    def visudo(self,p):
        subprocess.run(['/usr/sbin/visudo','-cf',str(self.path(p))],check=True,
            env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C'},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def put(self,p,raw,mode=0o600):
        p=self.path(p)
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
        with os.fdopen(fd,'wb')as out:
            os.fchmod(out.fileno(),mode);out.write(raw);out.flush();os.fsync(out.fileno())
        self.sync_dir(p.parent)
    def state(self,p):
        p=self.path(p)
        if not os.path.lexists(p):return {'kind':'absent'}
        s=p.lstat();meta={'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode)}
        if stat.S_ISREG(s.st_mode):return dict(meta,kind='file',sha256=sha(self.read(p)))
        if stat.S_ISLNK(s.st_mode):return dict(meta,kind='symlink',target=os.readlink(p))
        raise RuntimeError('static_existing_type_denied')
    def sync_dir(self,p):
        fd=os.open(self.path(p),os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)


def approved(package,expected):
    package=Path(package);raw=(package/'COMPOSITION.json').read_bytes()
    require(sha(raw)==expected,'static_review_hash')
    plan=json.loads(raw);result={}
    require(plan['kind']=='STATIC_CODE_COMPOSITION_NOT_PHASE_AUTHORITY' and plan['executionAuthorized']is False and plan['operationallyCertified']is False,'static_package_contract')
    for name in TARGETS:
        row=plan['files']['protected/'+name]
        require(row['object']=='objects/'+row['sha256']+'.source' and len(row['sha256'])==64,'static_object_address')
        p=package/row['object'];s=p.lstat()
        require(stat.S_ISREG(s.st_mode)and not p.is_symlink(),'static_payload_type')
        value=p.read_bytes();require(sha(value)==row['sha256'],'static_payload_hash')
        result[name]=value
    require('ROOT_RECOVERY_AUTHORITY_READ'in result['root_store.py'].decode(),'static_store_contract')
    return result


def inspect(package,expected,fs=None):
    fs=fs or Filesystem();payload=approved(package,expected);view={}
    for name,(path,mode)in TARGETS.items():
        current=fs.state(path)
        view[name]=current=={'kind':'file','uid':fs.uid,'mode':mode,'sha256':sha(payload[name])}
    view['alias']=fs.state(ALIAS)=={'kind':'symlink','uid':fs.uid,'mode':0o777,'target':'/proc/self/fd'}
    return {'result':'STATIC_INSTALL_COMPLETE'if all(view.values())else'STATIC_INSTALL_INCOMPLETE',
            'targets':view,'authorityIssued':False,'phasePolicyInstalled':False}


def install(package,expected,prior_raw,expected_prior,*,owner_action=False,fs=None):
    fs=fs or Filesystem()
    require(os.geteuid()==0 and owner_action is True,'static_owner_required')
    payload=approved(package,expected)
    require(sha(prior_raw)==expected_prior,'static_prior_review_hash')
    prior=json.loads(prior_raw)
    require(prior.get(str(ALIAS)) in ({'kind':'absent'},{'kind':'symlink','uid':fs.uid,'mode':0o777,'target':'/proc/self/fd'}),'static_alias_conflict')
    paths=[p for p,_ in TARGETS.values()]+[ALIAS]
    require(set(prior)=={str(p)for p in paths},'static_prior_coverage')
    for p in [*paths,LOCK,JOURNAL/'placeholder']:
        fs.chain(p)
    # All source/precondition checks precede intent or mutation.
    for p in paths:
        require(fs.state(p)==prior[str(p)],'static_prior_drift')
        old=prior[str(p)]
        if p!=ALIAS:
            require(old['kind']=='absent' or old['kind']=='file' and old['uid']==fs.uid and not old['mode']&0o022,'static_prior_metadata')
    lock=fs.path(LOCK)
    fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW) # existing canonical lock, no creation
    try:
        s=os.fstat(fd);require(stat.S_ISREG(s.st_mode)and s.st_uid==fs.uid and not s.st_mode&0o077,'static_lock_metadata')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        folder=JOURNAL/expected
        require(not os.path.lexists(fs.path(folder)),'static_install_consumed')
        for p in paths:require(fs.state(p)==prior[str(p)],'static_prior_drift_locked')
        # Syntax check sudoers BEFORE replacing ANY protected target.
        staged=LIB/('.b4-sudoers-'+expected)
        fs.put(staged,payload['re7-incident-6683-window'],0o440)
        try:fs.visudo(staged)
        finally:fs.path(staged).unlink()
        fs.path(folder).mkdir(mode=0o700);fs.sync_dir(JOURNAL)
        fs.put(folder/'intent.private.json',canonical({'packageSha256':expected,'priorSha256':expected_prior,'automaticRetry':False}))
        fs.put(folder/'prior.private.json',prior_raw)
        for name,(p,mode)in TARGETS.items():
            if prior[str(p)]['kind']=='file':fs.put(folder/(name+'.before.private'),fs.read(p))
            fs.chain(p);require(fs.state(p)==prior[str(p)],'static_prior_drift_per_file')
            tmp=p.with_name('.'+p.name+'.b4-'+expected)
            fs.put(tmp,payload[name],mode);os.replace(fs.path(tmp),fs.path(p));fs.sync_dir(p.parent)
        require(fs.state(ALIAS)==prior[str(ALIAS)],'static_alias_drift')
        # Do not reinterpret or repair a preexisting conflicting alias.
        if prior[str(ALIAS)]['kind']=='absent':os.symlink('/proc/self/fd',fs.path(ALIAS))
        else:require(prior[str(ALIAS)]=={'kind':'symlink','uid':fs.uid,'mode':0o777,'target':'/proc/self/fd'},'static_alias_conflict')
        fs.sync_dir(ALIAS.parent)
        result=inspect(package,expected,fs)
        require(result['result']=='STATIC_INSTALL_COMPLETE','static_post_denied')
        fs.visudo(TARGETS['re7-incident-6683-window'][0])
        fs.put(folder/'receipt.private.json',canonical(result));fs.sync_dir(folder)
        return result
    finally:os.close(fd)


def main(argv):
    # Both digests must be supplied by the owner from separately reviewed bytes;
    # CLI/env is not authority. Root ownership/explicit owner action is required.
    require(len(argv)==6 and argv[0]=='--owner-install-static','static_exact_arguments')
    package,review,prior_path,prior_hash,confirmation=argv[1:]
    require(confirmation=='INSTALL_STATIC_ONLY_NO_EMISSION','static_owner_confirmation')
    return install(package,review,Path(prior_path).read_bytes(),prior_hash,owner_action=True)

if __name__=='__main__':
    import sys
    try:print(json.dumps(main(sys.argv[1:]),sort_keys=True))
    except Exception:print('STATIC_INSTALL_DENY_INSPECT_NO_RETRY',file=sys.stderr);sys.exit(1)
