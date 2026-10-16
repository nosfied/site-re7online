"""Concrete captured frontend baseline, synthetic successors, actual phase/action readers."""
import copy,importlib.util,json,os,subprocess,sys,tempfile,shutil
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path[:0]=[str(P/'window'),str(P/'frontend')]
from csv_boundary import imports,exit_and_imports,event_policy,profile_delta,sha
from capture_imports import classify
from frontend_phase_contract import validate
import bind_frontend
import csv_contract
def load(n,p):
    s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
cases=[]
def deny(fn,label):
    try:fn()
    except (RuntimeError,KeyError,FileNotFoundError):cases.append(label);return
    raise AssertionError('negative bypass:'+label)
before=json.loads((ROOT/'local-evidence/dynamic-integrated-20261012/authorized-window-20261012T180000Z/deployed-final/frontend-dynamic-5b3cf3af-20261012T170000Z/live.private.json').read_text())
after=copy.deepcopy(before);expected={a['name']:a for a in csv_contract.read(P/'window/target.profile.private.json')['apps']}
starts={}
for name in ('re7-whatsapp-agent','re7-whatsapp-web-worker'):
    r=next(r for r in after['runtime']if r['name']==name);r['pid']+=1000000;r['startTicks']=str(int(r['startTicks'])+1000000)
    r['pm2_env']['pm_cwd']=expected[name]['cwd'];r['pm2_env']['pm_exec_path']=expected[name]['script'];starts[name]={'pid':r['pid'],'identity':{'ticks':r['startTicks'],'state':'S'}}
for rows in (after['saved'],after['fallback']):
    for r in rows:r['pm_cwd']=expected[r['name']]['cwd'];r['pm_exec_path']=expected[r['name']]['script']
complete={'event':'complete','mode':'switch','guardGeneration':38};matches={n:True for n in expected}
validate(before,after,complete,starts,expected,matches);cases.append('canonical_phase_real_baseline_candidate_backend')
for key in ('crontab','backupCronSha256'):
    v=copy.deepcopy(after);v[key]+='drift';deny(lambda:validate(before,v,complete,starts,expected,matches),'phase_denies_'+key)
v=copy.deepcopy(starts);v['re7-whatsapp-agent']['identity']['ticks']='1';deny(lambda:validate(before,after,complete,v,expected,matches),'future_api_identity_drift')
deny(lambda:validate(before,after,{'event':'failed','mode':'switch','guardGeneration':38},starts,expected,matches),'api_failure_prevents_frontend')
with tempfile.TemporaryDirectory()as tmp:
    d=Path(tmp);d.chmod(0o700);captures=d/'capture';captures.mkdir(mode=0o700)
    for n,v in [('before',before),('after',after),('complete',complete),('starts',starts),('expected',expected),('matches',matches)]:
        f=captures/(n+'.private.json');f.write_text(json.dumps(v));f.chmod(0o600)
    bind_frontend.bind(captures,d/'phase.private.json');deny(lambda:bind_frontend.bind(captures,d/'phase.private.json'),'phase_receipt_no_overwrite')
    material=d/'materialized';shutil.copytree(P/'frontend',material);material.chmod(0o700)
    g=load('actual_front_reader_for_binding',material/'frontend-check.py');g.P=material
    real_text=Path.read_text;real_bytes=Path.read_bytes;real_isfile=Path.is_file
    restore=Path('/tmp/re7-csv-coordinated-restore-20261016T002700Z')
    def mapped(path):
        for release,tree in [(g.TARGET,'frontend-candidate'),(g.RETURN,'frontend-compatible-return')]:
            if str(path).startswith(release+'/'):return restore/tree/str(path)[len(release)+1:]
        return path
    with patch.object(g,'pre_existing',lambda:{'42':'4200'}),patch.object(g,'tree',lambda pid:{str(pid):{'ticks':'synthetic','state':'S'}}),patch.object(Path,'read_text',lambda p,*a,**k:real_text(mapped(p),*a,**k)),patch.object(Path,'read_bytes',lambda p:real_bytes(mapped(p))),patch.object(Path,'is_file',lambda p:real_isfile(mapped(p))):
        bind_frontend.materialize(captures,d/'phase.private.json',material,reader=g)
        assert g.run_from('candidate')['release']==g.TARGET and g.run_from('return')['release']==g.RETURN
    assert(material/'scripts.sha256').is_file()and(material/'bindings.sha256').is_file()
    assert(material/'execution-authorized').read_text().strip()=='false'
    cases.append('real_front_reader_materializes_configs_controls_policies_candidate_and_return')
    action=load('real_front_action',P/'frontend/frontend-action.py')
    (d/'execution-authorized').write_text('false\n')
    with patch.object(action.subprocess,'run',side_effect=AssertionError('unauthorized effect')):deny(lambda:action.execute('start-candidate',root=d),'frontend_gate_blocks_effect')
    (d/'execution-authorized').write_text('true\n')
    class Result:stdout='';stderr='';returncode=0
    with patch.object(action.subprocess,'run',return_value=Result())as run:
        assert action.execute('start-candidate',root=d)==0
        assert run.call_count==1 and 'candidate.tracked.config.cjs'in str(run.call_args)
        try:action.execute('start-candidate',root=d);raise AssertionError('replay')
        except FileExistsError:pass
    cases.append('actual_frontend_action_single_start_intent_OS_simulated')
ev=lambda event,req='op',status=None:{'id':event,'tenant':'synthetic-tenant','request':req,'event':event,'status':status,'operation':None}
rows=[ev('crm.contact.import.started'),ev('crm.contact.import.finished',status='COMPLETED')]
assert imports(classify(rows));cases.append('terminal_correlated_by_tenant_operation')
unknown=classify([ev('crm.contact.import.started')]);deny(lambda:imports(unknown),'HTTP_finish_or_exit_not_terminal')
wrong=copy.deepcopy(rows);wrong[1]['tenant']='other-tenant';deny(lambda:imports(classify(wrong)),'terminal_other_tenant_not_proof')
deny(lambda:classify([ev('crm.contact.created',req='unparseable')]),'legacy_unknown_correlation')
deny(lambda:exit_and_imports({'oldExitConfirmed':True,'ownershipComplete':False,'sqlZero':True,'sha256':'a'*64},{'operations':[]}), 'incomplete_executor_denies')
policy=P/'window/eventRetentionPolicy.ts';event_policy(policy,'03791f05f68575a86bbeddd491a619adeddecf7102ed8d3000df51ceb217aad4');cases.append('manual_event_source_exact_overlay')
node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
compiled=ROOT/'local-evidence/crm-csv-coordinated-20261015/api-candidate/dist/events/eventRetentionPolicy.js'
code="import {pathToFileURL} from 'node:url';const m=await import(pathToFileURL(process.argv[1]));for(const n of ['started','classified','row','finished','uncertain'])if(m.classifyEventRetentionPolicy('crm.contact.import.'+n)!=='CRITICAL')throw Error(n);"
subprocess.run([str(node),'--input-type=module','-e',code,str(compiled)],check=True,capture_output=True);cases.append('actual_compiled_classifier_five_controls_critical')
print(json.dumps({'result':'CSV_BOUNDARIES_LOCAL_PASS','caseCount':len(cases),'cases':cases,'syntheticSuccessorIdentities':True,'productionEffects':False,'frontendProcessEffectsSimulated':True}))
