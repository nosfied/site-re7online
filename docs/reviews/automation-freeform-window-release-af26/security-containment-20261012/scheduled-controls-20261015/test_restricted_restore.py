"""Exact reviewed recovery driver, complete canonical crontab bytes, system effects only fake."""
import contextlib,io,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
import restore_deploy_cron as m

SOURCE=Path(sys.argv[1]).resolve(); w=SOURCE/'window'
before=(w/'deploy.crontab.before').read_bytes();current=(w/'deploy.crontab.window').read_bytes()
plan={'beforeHex':before.hex(),'currentHex':current.hex(),'beforeSha256':m.sha(before),'currentSha256':m.sha(current)}
cases=[]
for variant,value,valid in [('five_false',{k:False for k in m.GATES},True),('empty',{},False),('missing',{k:False for k in m.GATES if k!='restoreVerified'},False),('extra',{**{k:False for k in m.GATES},'unexpected':False},False),('true',{**{k:False for k in m.GATES},'restoreVerified':True},False),('string',{**{k:False for k in m.GATES},'restoreVerified':'false'},False),('list',[],False)]:
    try:m.closed_gates(value);passed=True
    except RuntimeError:passed=False
    assert passed==valid
    cases.append({'variant':'exact gate contract '+variant,'accepted':valid,'installCalls':0})
class Host:
    def __init__(self,variant):self.variant=variant;self.current=current;self.installs=0;self.observations=0
    def observe(self,plan):
        self.observations+=1
        if self.variant=='precondition' or(self.variant=='postcondition'and self.observations>1):raise RuntimeError('simulated_precondition_drift')
        return {'guard38Closed':True,'systemCronBefore':True}
    def run(self,args,text=None):
        if args==['crontab','-l']:
            if self.variant=='CAS':return (current+b'\n# third state\n').decode()
            return self.current.decode()
        assert args==['crontab','-'];self.installs+=1
        if self.variant=='before_install':raise RuntimeError('install_failed')
        self.current=text.encode()
        if self.variant=='response_lost':raise TimeoutError('response_lost')
        if self.variant=='partial':self.current=b'unknown partial state\n'
        return ''
for variant in ('success','CAS','precondition','before_install','response_lost','partial','postcondition'):
    with tempfile.TemporaryDirectory()as tmp,patch.object(m,'P',SOURCE):
        q=Path(tmp);h=Host(variant)
        try:r=m.perform(plan,'a'*64,q,h,True);passed=True
        except (RuntimeError,TimeoutError):passed=False
        assert passed==(variant=='success'),variant
        assert h.installs== (0 if variant in ('CAS','precondition') else 1)
        assert(q/'restore.receipt.private.json').exists()==passed
        if variant in ('before_install','response_lost','partial','postcondition'):
            assert(q/'partial.private.json').exists()and(q/'after.private.json').exists()
            assert h.installs==1
        if variant=='response_lost':assert json.loads((q/'after.private.json').read_text())['classification']=='RESTORED'
        if variant=='success':
            assert h.current==before
            try:m.perform(plan,'a'*64,q,h,True);raise AssertionError('replay accepted')
            except (RuntimeError,FileExistsError):pass
            assert h.installs==1
        cases.append({'variant':variant,'accepted':passed,'installCalls':h.installs,'automaticRetry':False})
with tempfile.TemporaryDirectory()as tmp,patch.object(m,'P',SOURCE):
    q=Path(tmp);h=Host('success');r=m.perform(plan,'a'*64,q,h,False)
    assert r['result']=='RESTRICTED_CRON_CHECK_PASS_NO_APPLY'and h.installs==0
    cases.append({'variant':'check','installCalls':0,'accepted':True})
for variant in ('extra_line','wrong_schedule','changed_command','missing_entry'):
    a=before;b=current
    if variant=='extra_line':a+=b'0 5 * * * echo unapproved\n';b+=b'0 5 * * * echo unapproved\n'
    elif variant=='wrong_schedule':a=a.replace(b'15 3 * * *',b'15 5 * * *',1)
    elif variant=='changed_command':b=b.replace(b'backup-data.sh',b'unknown-job.sh',1)
    else:b=a
    try:m.restricted_delta(a,b);raise AssertionError('delta accepted')
    except RuntimeError:pass
    cases.append({'variant':variant,'accepted':False})
# Invoke the exact CLI check/apply/inspection switches. Local files are full canonical copies.
for operation in ('--check','--owner-authorized-restore','--inspect'):
    with tempfile.TemporaryDirectory()as tmp:
        root=Path(tmp);p=root/SOURCE.name;shutil.copytree(SOURCE,p);capsule=root/'capsule';capsule.mkdir(mode=0o700)
        full={**plan,'schema':1,'operation':'RESTORE_ONLY_SIX_ORIGINALLY_ACTIVE_DEPLOY_ENTRIES','checkEvidenceDirectory':'check-private','evidenceDirectory':'apply-private','inspectionEvidenceDirectory':'inspection-private'}
        path=capsule/'recovery-plan.private.json';path.write_text(json.dumps(full));path.chmod(0o600)
        name=full['checkEvidenceDirectory'if operation=='--check'else'evidenceDirectory'if operation=='--owner-authorized-restore'else'inspectionEvidenceDirectory'];h=Host('success')
        argv=['restore_deploy_cron.py','--plan',str(path),'--plan-sha256',m.sha(path.read_bytes()),'--evidence-dir',str(capsule/name),operation]
        with patch.object(sys,'argv',argv),patch.object(m,'P',p),patch.object(m,'Host',lambda:h),contextlib.redirect_stdout(io.StringIO()):m.main()
        assert h.installs==int(operation=='--owner-authorized-restore')
        cases.append({'variant':'exact CLI '+operation,'installCalls':h.installs,'accepted':True})
for variant in ('hash','plan_mode','owner','root_executor','output_mode','existing_output'):
    with tempfile.TemporaryDirectory()as tmp:
        root=Path(tmp);p=root/SOURCE.name;shutil.copytree(SOURCE,p);capsule=root/'capsule';capsule.mkdir(mode=0o700)
        full={**plan,'schema':1,'operation':'RESTORE_ONLY_SIX_ORIGINALLY_ACTIVE_DEPLOY_ENTRIES','checkEvidenceDirectory':'check-private','evidenceDirectory':'apply-private','inspectionEvidenceDirectory':'inspection-private'}
        path=capsule/'recovery-plan.private.json';path.write_text(json.dumps(full));path.chmod(0o600)
        h=Host('success');q=capsule/'apply-private';raw_hash=m.sha(path.read_bytes())
        if variant=='hash':raw_hash='0'*64
        if variant=='plan_mode':path.chmod(0o644)
        if variant=='output_mode':capsule.chmod(0o755)
        if variant=='existing_output':q.mkdir(mode=0o700)
        argv=['restore_deploy_cron.py','--plan',str(path),'--plan-sha256',raw_hash,'--evidence-dir',str(q),'--owner-authorized-restore']
        with contextlib.ExitStack()as stack:
            stack.enter_context(patch.object(sys,'argv',argv));stack.enter_context(patch.object(m,'P',p));stack.enter_context(patch.object(m,'Host',lambda:h));stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            if variant in ('owner','root_executor'):stack.enter_context(patch.object(m.os,'getuid',lambda:os.stat(path).st_uid+1 if variant=='owner'else 0))
            try:m.main();raise AssertionError('invalid CLI accepted')
            except (RuntimeError,FileExistsError,SystemExit):pass
        assert h.installs==0 and h.observations==0
        cases.append({'variant':'CLI negative '+variant,'accepted':False,'installCalls':0})
print(json.dumps({'result':'RESTRICTED_RESTORE_DRIVER_LOCAL_PASS','caseCount':len(cases),'cases':cases,'canonicalEntries':6,'completeOriginalLines':len(before.splitlines()),'productionEffects':False}))
