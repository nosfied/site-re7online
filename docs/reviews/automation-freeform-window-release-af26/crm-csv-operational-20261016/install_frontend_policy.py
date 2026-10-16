"""Future owner-sudo CAS installer. One policy only; helpers/rules never written."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
ROOT_CODE=r'''
import hashlib,json,os,stat,sys
from pathlib import Path
kind,root,source,new,helper,rule=sys.argv[1:]
p=Path(root);prefix='frontend-socket-observer'if kind=='window'else'frontend-permanent-observer'
q=Path('/usr/local/libexec/re7/'+prefix+'-policy.json');h=q.with_name(prefix+'.py');s=Path('/etc/sudoers.d/re7-'+prefix)
sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest()
for f,mode,digest in [(q,0o600,source),(h,0o644,helper),(s,0o440,rule)]:
 t=f.lstat();assert stat.S_ISREG(t.st_mode)and not f.is_symlink()and t.st_uid==0 and stat.S_IMODE(t.st_mode)==mode and sha(f)==digest
 for a in f.parents:
  t=a.lstat();assert stat.S_ISDIR(t.st_mode)and not a.is_symlink()and t.st_uid==0 and not(t.st_mode&0o022)
candidate=p/('observer-policy.private.json'if kind=='window'else'permanent-policy.proposed.private.json');assert sha(candidate)==new
a=q.with_name(q.stem+'.pre-'+p.parent.name+'-'+kind+q.suffix);assert not a.exists()and not a.is_symlink()
def put(dest,raw):
 fd=os.open(dest,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb')as out:out.write(raw);out.flush();os.fsync(out.fileno())
put(a,q.read_bytes());tmp=q.with_name(q.name+'.'+p.parent.name+'.new');put(tmp,candidate.read_bytes());assert sha(tmp)==new and sha(q)==source;os.replace(tmp,q)
fd=os.open(q.parent,os.O_DIRECTORY|os.O_RDONLY);os.fsync(fd);os.close(fd)
assert sha(q)==new and sha(a)==source
print('FRONTEND_POLICY_ONLY_INSTALLED_NO_PROCESS_ACTION')
'''
def install(root,kind,decision):
    from frontend_phase_contract import require
    root=Path(root);require(kind in ('window','permanent')and decision=='--owner-authorized-policy-only','explicit_policy_decision')
    receipt=json.loads((root/'phase-binding.receipt.private.json').read_text());require(receipt['result']=='FRONTEND_DERIVED_BINDINGS_GATES_FALSE_REVIEW_REQUIRED','phase_binding_required')
    require((root/'execution-authorized').read_text().strip()=='false','gate_must_be_false')
    if kind=='permanent':
        accepted=json.loads((root/'candidate-accepted.private.json').read_text());require(accepted['phaseReceiptSha256']==hashlib.sha256((root/'phase-binding.receipt.private.json').read_bytes()).hexdigest()and accepted['ownerAcceptedReadOnlyScreens']is True,'candidate_acceptance_required_before_permanent_policy')
        import importlib.util,sys
        sys.path.insert(0,str(root));spec=importlib.util.spec_from_file_location('front_before_permanent',root/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
        rows=[r for r in g.rows()if r['name']==g.FRONT];require(len(rows)==1,'frontend_process_set');label=next((l for l in ('candidate','return')if rows[0]['pm2_env']['RE7_FRONT_CONTROL']==str(root/(l+'.run.private.json'))),None);require(label is not None,'new_frontend_not_live');g.tracked_live(label)
        ready=json.loads((root/(label+'.readiness.private.jsonl')).read_text().splitlines()[-1]);require(ready['result']=='PASS','frontend_readiness_required')
    expected=json.loads((root/'root-sources.private.json').read_text())[kind]
    file=root/('observer-policy.private.json'if kind=='window'else'permanent-policy.proposed.private.json');new=hashlib.sha256(file.read_bytes()).hexdigest()
    require(new==receipt['windowPolicySha256'if kind=='window'else'permanentPolicySha256'],'reviewed_policy_drift')
    intent=root/('install-'+kind+'.intent.private.json');fd=os.open(intent,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w')as f:json.dump({'policySha256':new,'sourcePolicySha256':expected['policySha256'],'automaticRetry':False},f);f.flush();os.fsync(f.fileno())
    subprocess.run(['sudo','-n','/usr/bin/python3','-I','-S','-',kind,str(root),expected['policySha256'],new,expected['helperSha256'],expected['sudoersSha256']],input=ROOT_CODE,text=True,check=True,timeout=30)
    out=root/('install-'+kind+'.receipt.private.json');fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w')as f:json.dump({'result':'FRONTEND_POLICY_ONLY_INSTALLED_NO_PROCESS_ACTION','intentSha256':hashlib.sha256(intent.read_bytes()).hexdigest(),'policySha256':new},f);f.flush();os.fsync(f.fileno())
if __name__=='__main__':
    os.umask(0o077);a=argparse.ArgumentParser();a.add_argument('root');a.add_argument('kind',choices=['window','permanent']);a.add_argument('--owner-authorized-policy-only',action='store_true');v=a.parse_args();install(v.root,v.kind,'--owner-authorized-policy-only'if v.owner_authorized_policy_only else'')
