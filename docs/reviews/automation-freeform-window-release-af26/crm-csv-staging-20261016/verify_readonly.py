"""Concrete read-only preparatory chain. Does not call operational preflight/admission."""
import datetime,hashlib,json,os,subprocess,sys
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-csv-window-staged-20261016T092610Z')
I=P.parent/'csv-staging-incoming-20261016T092610Z'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    os.umask(0o077);receipt=json.loads((I/'staging.receipt.private.json').read_text());assert receipt['result']=='CSV_INACTIVE_STAGING_COMPLETE'
    d=I/'preparatory-readonly';d.mkdir(mode=0o700);cases=[]
    commands=[('concrete_package',['python3','-B',str(P/'verify-package.py')]),('ecosystems',['python3','-B',str(P/'window/ecosystem_contract.py'),'validate',str(P)]),('baselines',['python3','-B',str(P/'window/baseline_contract.py'),str(P)]),('current_cli',['python3','-B',str(P/'window/check_current.py'),str(P),'before'])]
    commands += [('restore_'+m,['python3','-B',str(P/'window/restore_contract.py'),str(P/m)])for m in ('switch','return','return-partial','return-before-commit')]
    for label,cmd in commands:
        with(d/(label+'.stdout.private')).open('x')as out,(d/(label+'.stderr.private')).open('x')as err:
            try:r=subprocess.run(cmd,stdout=out,stderr=err,timeout=120);code=r.returncode
            except subprocess.TimeoutExpired:code=124
        cases.append({'consumer':label,'exitCode':code,'stdoutSha256':sha(d/(label+'.stdout.private')),'stderrSha256':sha(d/(label+'.stderr.private'))})
    result={'result':'READONLY_PREPARATION_PASS'if all(c['exitCode']==0 for c in cases)else'READONLY_PREPARATION_DENY','cases':cases,'reviewSha256':sha(P/'preparation-review.sha256'),'backupRenewed':False,'rootShortCapture':False,'gates':json.loads((P/'window/execution-gates.private.json').read_text()),'executionAuthorized':(P/'execution-authorized').read_text().strip(),'policyInstalled':False,'processActions':0,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    f=d/'result.private.json';f.write_text(json.dumps(result,sort_keys=True)+'\n');f.chmod(0o600)
    print(json.dumps({k:v for k,v in result.items()if k not in ('cases','gates') }|{'checks':len(cases),'failed':[c['consumer']for c in cases if c['exitCode']],'gatesFalse':all(x is False for x in result['gates'].values())}))
if __name__=='__main__':main()
