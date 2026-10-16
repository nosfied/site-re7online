"""One-shot candidate backend transition; no import, cipher, SQL or provider mutation."""
import datetime,fcntl,json,os,sys
from pathlib import Path
from csv_contract import check,read,write,require,sha
from csv_boundary import stage_boundary,exit_and_imports
from sequencer import Bridge,Sequencer,API,WORKER,FRONT
from check_current import check_current

def reset(p):
    for f,v in [(p/'window/execution-gates.private.json',{k:False for k in read(p/'window/execution-gates.private.json')}),(p/'execution-authorized',False)]:
        t=f.with_name(f.name+'.close.tmp');fd=os.open(t,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w')as o:o.write(json.dumps(v)+'\n'if isinstance(v,dict)else'false\n');o.flush();os.fsync(o.fileno())
        os.replace(t,f)
def imports_proven(p,mode):
    f=p/mode/'old-exit-confirmed.json';require(f.is_file(),'exit_proof_missing')
    # verify_stopped/Operations already prove trees, sockets and DB zero. The
    # independent audit receipt must bind that exact certificate, not HTTP finish.
    receipt=p/'window'/('csv-imports-'+mode+'-after-exit.private.json')
    if not receipt.exists():
        from capture_imports import capture
        capture(p,mode)
    r=read(receipt)
    exit_and_imports({'oldExitConfirmed':True,'ownershipComplete':True,'sqlZero':True,'sha256':sha(f)},r)
    return sha(receipt)
def inspect(p):
    p=Path(p);check(p,live=True);b=Bridge(p);apps=b.apps();policy=read(p/'window/privileged-policy.private.json');front=policy['sourceProcesses'][FRONT]
    require(FRONT in apps and apps[FRONT]['pid']==front['pid'] and b.identity(front['pid'])['ticks']==front['ticks'],'frontend_identity_drift')
    for mode in ('switch','return','return-partial','return-before-commit'):
        for name in (API,WORKER):
            if (p/mode/('start-intent-'+name+'.json')).exists()and not(p/mode/('started-'+name+'.json')).exists():return {'classification':'UNCERTAIN_START','replayAuthorized':False}
    selected=(p/'window/csv-selection.receipt.private.json').exists()
    if not selected and(p/'window/csv-selection.intent.private.json').exists():return {'classification':'UNCERTAIN_SELECTION','replayAuthorized':False}
    s=Sequencer(b)
    if not selected:
        if(p/'switch/old-exit-confirmed.json').is_file():
            require(set(apps)=={FRONT},'unselected_pair_state_ambiguous');phase='STOPPED_UNSELECTED'
        else:
            require(s.recovery_mode()=='prestop','poststop_requires_candidate_decision');phase='PRESTOP'
    else:
        stage_boundary(p,'switch');phase=s.recovery_mode();require(phase in ('return','return-partial'),'candidate_state_ambiguous')
    return {'classification':phase,'replayAuthorized':False,'backendReturn':'CANDIDATE_ONLY'if selected else'PRESTOP_ONLY'}
def finish(s,mode):
    p=s.root;imports_proven(p,mode);s.finish(mode);current=check_current(p,'after');reset(p)
    write(p/'window/csv-complete.receipt.private.json',{'result':'CSV_API_COMPLETE_CANDIDATE_PRESERVED','mode':mode,'current':current,'gatesFalse':True,'targetProfileSha256':sha(p/'window/target.profile.private.json')})
def execute(p):
    p=Path(p);w=p/'window';check(p,live=True)
    with(p.parent/'.incident-6683-window.lock').open('a+')as lock,(w/'sequencer.lock').open('a+')as inner:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(inner.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        require(not(w/'csv-execution.intent.private.json').exists(),'execution_consumed_inspection_only')
        a=read(w/'csv-admission.receipt.private.json');require(a['result']=='FIVE_GATES_ADMITTED'and a['reviewSha256']==sha(p/'preparation-review.sha256'),'admission_required')
        now=datetime.datetime.now(datetime.timezone.utc)
        for key,age in [('rootCapturedUtc',600),('backupCapturedUtc',3600)]:require(0<=(now-datetime.datetime.fromisoformat(a[key])).total_seconds()<age,'admission_expired')
        check_current(p);s=Sequencer(Bridge(p));s.eligible();s.capture_baseline();write(w/'csv-baseline.private.json',s.baseline)
        write(w/'csv-execution.intent.private.json',{'admissionSha256':sha(w/'csv-admission.receipt.private.json'),'automaticRetry':False})
        try:
            s.close_then_preflight();s.controls_enter();s.action('switch','stop-pair');s.verify_stopped('switch')
            imports_proven(p,'switch')
            from event_overlay import apply
            apply(p)
            write(w/'csv-selection.intent.private.json',{'targetProfileSha256':sha(w/'target.profile.private.json'),'automaticRetry':False})
            write(w/'csv-selection.receipt.private.json',{'result':'CSV_CANDIDATE_SELECTED','targetProfileSha256':sha(w/'target.profile.private.json'),'intentSha256':sha(w/'csv-selection.intent.private.json')})
            s.start_pair('switch');finish(s,'switch')
        except BaseException as e:
            s.journal('csv_failure_inspection_only',errorClass=type(e).__name__);raise
def recover(p,decision):
    p=Path(p);w=p/'window'
    with(p.parent/'.incident-6683-window.lock').open('a+')as lock,(w/'sequencer.lock').open('a+')as inner:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(inner.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        v=inspect(p);require(not(w/'csv-recovery.intent.private.json').exists(),'recovery_consumed')
        require((w/'csv-execution.intent.private.json').exists(),'execution_baseline_required')
        allowed={'PRESTOP':{'PRESTOP'},'CANDIDATE':{'return','return-partial','STOPPED_UNSELECTED'}}
        require(decision in allowed and v['classification']in allowed[decision],'explicit_decision_or_state_denied')
        s=Sequencer(Bridge(p));s.baseline=read(w/'csv-baseline.private.json')
        write(w/'csv-recovery.intent.private.json',{'decision':decision,'inspection':v,'automaticRetry':False})
        if decision=='PRESTOP':
            s.recover();s.b.scheduled_controls().verify('before');s.b.privileged('check-absent');check_current(p);reset(p)
            write(w/'csv-abort.receipt.private.json',{'result':'CSV_PRESTOP_CONTROLS_RESTORED','gatesFalse':True});return
        mode='return-partial'if v['classification']=='STOPPED_UNSELECTED'else v['classification'];s.b.privileged('check-present');s.action(mode,'stop-pair'if mode=='return'else'recover-partial');s.verify_stopped(mode)
        if v['classification']=='STOPPED_UNSELECTED':
            imports_proven(p,mode)
            write(w/'csv-selection.intent.private.json',{'targetProfileSha256':sha(w/'target.profile.private.json'),'automaticRetry':False})
            write(w/'csv-selection.receipt.private.json',{'result':'CSV_CANDIDATE_SELECTED','targetProfileSha256':sha(w/'target.profile.private.json'),'intentSha256':sha(w/'csv-selection.intent.private.json')})
        imports_proven(p,mode)
        from event_overlay import apply
        apply(p)
        s.start_pair(mode);finish(s,mode)
if __name__=='__main__':
    os.umask(0o077)
    try:
        if len(sys.argv)==3 and sys.argv[2]=='--execute':execute(Path(sys.argv[1]))
        elif len(sys.argv)==3 and sys.argv[2]=='--inspect-readonly':print(json.dumps(inspect(Path(sys.argv[1]))))
        elif len(sys.argv)==4 and sys.argv[2]=='--operator-recover':recover(Path(sys.argv[1]),sys.argv[3])
        else:raise RuntimeError('exact_arguments_required')
    except BaseException as e:print(json.dumps({'result':'CSV_OPERATION_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));sys.exit(1)
