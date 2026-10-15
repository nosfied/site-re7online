"""Real patched Sequencer.recover + admission and DelegatedControls on the full v13.
Only host commands, process observations, HTTP and root effects are simulated.
Does not run a production CLI or rewrite a historical generation.
"""
import base64,contextlib,hashlib,importlib.util,io,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
from future_revision import changes, MODES

SOURCE=Path(sys.argv[1]).resolve(); HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
cases=[]
with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp)/SOURCE.name;shutil.copytree(SOURCE,p)
    for name,raw in changes(SOURCE).items():
        f=p/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(raw);f.chmod(0o600)
    sys.path[:0]=[str(p/'window'),str(p/'switch')]
    seq=load('sequencer',p/'window/sequencer.py')
    contract=load('scheduled_controls',p/'window/scheduled_controls.py')
    cfg=json.loads((p/'switch/return.config.private.json').read_text())['apps']
    policy=json.loads((p/'window/privileged-policy.private.json').read_text())
    privileged=load('scheduled_root_consumer',p/'window/privileged.py')
    assert hashlib.sha256((p/'window/privileged.py').read_bytes()).hexdigest()=='8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'
    root_policy={**policy,'policySha256':hashlib.sha256((p/'window/privileged-policy.private.json').read_bytes()).hexdigest(),
                 'cronBefore':base64.b64decode(policy['cronBeforeB64']),'cronWindow':base64.b64decode(policy['cronWindowB64'])}
    initial=json.loads((p/'window/initial.private.json').read_text())
    w=p/'window'
    expected={k:{ph:(w/(prefix+'.'+suffix)).read_text() for ph,suffix in [('before','before'),('contained','window')]}
              for k,prefix in [('deploy','deploy.crontab'),('system','re7-converta-backup')]}
    class Effects:
        def __init__(self,deploy='contained',system='contained',failure=None):
            self.values={k:expected[k].get(ph,ph) for k,ph in [('deploy',deploy),('system',system)]}
            self.calls=[];self.failure=failure;self.live={}
            for c in cfg:
                n=c['name'];v=policy['sourceProcesses'][n]
                self.live[n]={'name':n,'pid':v['pid'],'cfg':c,'pm2_env':{'status':'online','watch':False,'restart_time':0}}
        def run(self,args,text=None):
            self.calls.append(tuple(args))
            if args==['crontab','-l']:return self.values['deploy']
            if args==['cat',contract.SYSTEM_CRON]:return self.values['system']
            if args==['crontab','-']:
                if self.failure=='install_before':raise RuntimeError('simulated_install_failure')
                self.values['deploy']=text
                if self.failure=='response_lost':raise TimeoutError('simulated_response_lost')
                if self.failure=='readback':self.values['deploy']+='\n# concurrent-change\n'
                return ''
            if args[0]=='systemctl':return initial['supervision']
            raise AssertionError('unexpected system effect')
        def privileged(self,action):
            assert action=='abort-prestop';self.calls.append(('privileged',action))
            # Execute the unchanged, exact installed helper's real abort-prestop branch.
            # Replace only root/proc/command I/O, not that branch or its predicates.
            nft={'present':True};boot={'state':'disabled'};phases=[]
            original_text=Path.read_text;original_bytes=Path.read_bytes
            def proc_text(path,*a,**kw):
                if path.parent.parent==Path('/proc')and path.name=='stat':
                    pid=int(path.parent.name);v=next(v for v in policy['sourceProcesses'].values()if v['pid']==pid)
                    fields=['S',str(policy['pm2Daemon']['pid'])]+['0']*17+[v['ticks']]
                    return str(pid)+' (node) '+' '.join(fields)
                return original_text(path,*a,**kw)
            def root_bytes(path,*a,**kw):
                return self.values['system'].encode()if str(path)==contract.SYSTEM_CRON else original_bytes(path,*a,**kw)
            def write_cron(raw):
                if self.failure=='root':raise RuntimeError('simulated_root_install_failure')
                self.values['system']=raw.decode()
            def root_command(args,**kw):
                if args[0]=='/usr/bin/systemctl':
                    if args[1]=='enable':boot['state']='enabled';return b''
                    return ('ActiveState=inactive\nUnitFileState='+boot['state']+'\n').encode()
                if args[:3]==['/usr/sbin/nft','delete','table']:nft['present']=False;return b''
                if args[:4]==['/usr/sbin/nft','-j','list','tables']:return b'{"nftables":[]}'
                assert args[:4]==['/usr/sbin/nft','-j','list','table']
                name=privileged.TABLE
                return json.dumps({'nftables':[{'table':{'family':'inet','name':name}},
                    {'chain':{'family':'inet','table':name,'name':'api_input','type':'filter','hook':'input','prio':-10,'policy':'accept'}},
                    {'rule':{'family':'inet','table':name,'chain':'api_input','expr':[{'match':{'op':'==','left':{'payload':{'protocol':'tcp','field':'dport'}},'right':{'set':[3000,3001]}}},{'reject':{'type':'tcp reset'}}]}}]}).encode()
            with patch.object(Path,'read_text',proc_text),patch.object(Path,'read_bytes',root_bytes),patch.object(privileged,'process_identity',lambda pid:{'ticks':policy['pm2Daemon']['ticks'],'state':'S'}),patch.object(privileged,'phase_read',lambda:{'stage':'fenced','policySha256':root_policy['policySha256']}),patch.object(privileged,'phase_write',lambda *a:phases.append(a)),patch.object(privileged,'write_cron',write_cron),patch.object(privileged,'system',root_command):
                privileged.act(action,root_policy)
            assert phases==[('aborted',root_policy['policySha256'])]and not nft['present']and boot['state']=='enabled'
        def apps(self):return self.live
        def identity(self,pid):
            v=next(x for x in policy['sourceProcesses'].values()if x['pid']==pid)
            return {'ticks':v['ticks'],'state':'S'}
    def bridge(e):
        b=seq.Bridge.__new__(seq.Bridge);b.root=p;b.window=w;b.switch=p/'switch'
        b.run=lambda args,*,input_text=None,**kw:e.run(args,input_text)
        b.apps=e.apps;b.identity=e.identity;b.privileged=e.privileged
        b.restore_guard=lambda mode:e.calls.append(('restore-guard',mode))
        return b
    for deploy,system,failure in [('contained','contained',None),('before','before',None),('contained','before',None),('before','contained',None),('unknown','contained',None),('contained','unknown',None),('contained','contained','root'),('contained','contained','install_before'),('contained','contained','response_lost'),('contained','contained','readback')]:
        journal=w/'sequencer.journal.jsonl';journal.unlink(missing_ok=True)
        e=Effects(deploy,system,failure);b=bridge(e);s=seq.Sequencer(b)
        s.baseline={'apps':{n:{'pid':v['pid'],'identity':e.identity(v['pid'])}for n,v in e.live.items()}}
        valid=deploy!='unknown'and system!='unknown'and failure is None
        try:s.recover();passed=True
        except (RuntimeError,TimeoutError):passed=False
        assert passed==valid,(deploy,system,failure)
        events=[json.loads(x)['event']for x in journal.read_text().splitlines()]
        assert ('prestop_restored'in events)==valid
        if 'unknown'in(deploy,system):assert not any(x[0]=='privileged'for x in e.calls)
        assert sum(x==('crontab','-')for x in e.calls)<=1
        assert not any(x[0]in('start','delete','SQL')for x in e.calls)
        cases.append({'consumer':'Sequencer.recover(prestop)','deploy':deploy,'system':system,'failure':failure,'accepted':valid})
    # Admission refusal is before guard close/node/SQL effects, including independent cron divergence.
    for deploy,system in [('contained','before'),('before','contained'),('unknown','before'),('before','unknown')]:
        e=Effects(deploy,system);s=seq.Sequencer(bridge(e))
        try:s.close_then_preflight();raise AssertionError('admission drift accepted')
        except RuntimeError as ex:assert 'cron'in str(ex)
        assert not any(x[0]=='privileged'for x in e.calls)
        cases.append({'consumer':'Sequencer.close_then_preflight','deploy':deploy,'system':system,'accepted':False})
    # Full preparatory entrypoint reaches static checker only after separate live cron checks.
    import runpy,subprocess
    for index,(deploy,system)in enumerate([('before','before'),('contained','before'),('before','contained'),('unknown','before'),('before','unknown')]):
        e=Effects(deploy,system);q=Path(tmp)/('preparatory-observation-'+str(index))
        def command(args,**kw):return e.run(args)
        def checker_stop(*a,**kw):raise RuntimeError('stop_at_unchanged_static_checker')
        with patch.object(seq,'PREPARATIONS',p.parent),patch.object(sys,'argv',['read-preparatory.py',str(p),str(q)]),patch.object(subprocess,'check_output',command),patch.object(runpy,'run_path',checker_stop),contextlib.redirect_stdout(io.StringIO()):
            try:exec(compile((p/'read-preparatory.py').read_text(),str(p/'read-preparatory.py'),'exec'),{'__name__':'local_test'})
            except SystemExit:pass
        denial=json.loads((q/'denial.private.json').read_text())
        assert denial['stage']==('complete_checker'if deploy==system=='before'else'scheduled_controls_before')
        assert all(x[0]in('crontab','cat')for x in e.calls)
        cases.append({'consumer':'read-preparatory entrypoint','deploy':deploy,'system':system,'reachedUnchangedChecker':deploy==system=='before'})
    # Full real delegated preparation and finish; configuration checks use complete three-app configs.
    read_bytes=Path.read_bytes
    for mode in MODES:
        ops=load('ops',p/mode/'ops.py');delegated=load('delegated',p/mode/'delegated.py')
        for which,deploy,system in [('prepare','before','before'),('prepare','contained','before'),('prepare','before','contained'),('finish','contained','before'),('finish','contained','contained'),('finish','unknown','before')]:
            e=Effects(deploy,system)
            target=json.loads((p/mode/'candidate.config.private.json').read_text())['apps']
            if which=='finish':
                for c in target:e.live[c['name']]['cfg']=c
                validation={'workerHealth':True,'health':[{'ok':True,'db':'ok'}],
                            'guard':{'build':target[0]['env']['CAMPAIGN_BUILD_ID']}}
                (p/mode/'after-unfence.json').write_text(json.dumps(validation))
            class System:
                run=staticmethod(e.run)
                proof=staticmethod(lambda:None) # root nonce observation is a system effect
                guard=staticmethod(lambda:{'version':1,'open':False,'tasks':{},'generation':38,'audit':[]})
                apps=staticmethod(lambda:list(e.live.values()))
                @staticmethod
                def check_config(app,c):assert app['cfg']==c
            def bytes_effect(path,*a,**kw):
                return e.values['system'].encode()if str(path)==contract.SYSTEM_CRON else read_bytes(path,*a,**kw)
            valid=(which=='prepare'and deploy==system=='before')or(which=='finish'and deploy=='contained'and system=='before')
            with patch.object(Path,'read_bytes',bytes_effect):
                c=delegated.DelegatedControls(p/mode,System())
                try:getattr(c,which)();passed=True
                except RuntimeError:passed=False
            assert passed==valid,(mode,which,deploy,system)
            if valid and which=='finish':assert e.values['deploy']==expected['deploy']['before']
            cases.append({'consumer':'DelegatedControls.'+which,'mode':mode,'deploy':deploy,'system':system,'accepted':valid})
    # Source/proof type and incomplete source fail before a cron write.
    f=w/'deploy.crontab.before';old=f.read_bytes()
    for variant in ('mode','absent','symlink'):
        if variant=='mode':f.chmod(0o644)
        elif variant=='absent':f.unlink()
        else:f.unlink();f.symlink_to(w/'deploy.crontab.window')
        e=Effects()
        try:contract.ScheduledControls(w,e.run);raise AssertionError('bad source accepted')
        except (RuntimeError,FileNotFoundError):pass
        assert e.calls==[]
        if f.is_symlink():f.unlink()
        f.write_bytes(old);f.chmod(0o600)
        cases.append({'consumer':'ScheduledControls source','variant':variant,'accepted':False})
print(json.dumps({'result':'REAL_SCHEDULED_CONTROL_CONSUMERS_PASS','caseCount':len(cases),'cases':cases,'completeCandidate':True,'installedHelper8deAbortBranchExecutedLocally':True,'productionEffects':False}))
