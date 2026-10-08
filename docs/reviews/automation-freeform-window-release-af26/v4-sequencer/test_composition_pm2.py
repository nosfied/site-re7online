"""Real Node20/PM2/socket driver. Only nft/cron/phase operations are simulated.
Uses System.tree from the preserved private operational package, not a fake.
"""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from unittest.mock import patch
import privileged as gate
import sequencer as seq
from test_absent_worker_pm2 import run, wait_apps, expect_deny

WORKER_JS = r'''
const http=require('http'),net=require('net'),fs=require('fs'),cp=require('child_process');
let clients=[],child;
const sink=net.createServer(s=>s.on('error',()=>{}));
sink.listen(0,'127.0.0.1',()=>{
const server=http.createServer((req,res)=>{
if(req.url==='/open') { const s=net.connect(sink.address().port,'127.0.0.1');
 s.on('error',()=>{});s.once('connect',()=>{clients.push(s);res.end('ok');});return; }
if(req.url==='/close') {for(const s of clients)s.destroy();clients=[];setImmediate(()=>res.end('ok'));return;}
if(req.url==='/detached-child') {child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});child.unref();res.end(String(child.pid));return;}
if(req.url==='/child') {child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});res.end(String(child.pid));return;}
res.setHeader('content-type','application/json');res.end('{"ok":true}');
});server.listen(0,'127.0.0.1',()=>fs.writeFileSync('port',String(server.address().port)));
});
'''

class LabBridge(seq.Bridge):
    def __init__(self, base, node, cli, env):
        self.root=base;self.window=base/'window';self.switch=base/'switch'
        self.node=node;self.cli=cli;self.env=env;self.hook=None;self.samples=0;self.before_unfence=None
    def apps(self):return {a['name']:a for a in json.loads(run(self.node,self.cli,self.env,'jlist'))}
    def guard(self):return seq.guard_state(json.loads((self.window/'guard.json').read_text()))
    def app_matches(self,name,configs):
        a=self.apps()[name];c=configs[name];e=a['pm2_env']
        return e['status']=='online'and e['watch']is False and e['pm_cwd']==c['cwd']and e['pm_exec_path']==c['script']
    def privileged(self,action):
        if action=='unfence'and self.before_unfence:self.before_unfence()
        return super().privileged(action)
    def worker_capture_observation(self,*args):
        result=super().worker_capture_observation(*args);self.samples+=1
        if self.hook:self.hook(self.samples)
        return result

def main(node,cli,ops_dir,composition=None,modes=('switch','return','return-partial')):
    node=str(Path(node).resolve());cli=str(Path(cli).resolve());ops_dir=Path(ops_dir).resolve()
    assert subprocess.check_output([node,'--version'],text=True).strip()=='v20.20.0'
    assert json.loads((Path(cli).parents[1]/'package.json').read_text())['version']=='6.0.14'
    checks=[]
    with tempfile.TemporaryDirectory(prefix='re7-capture-refresh-real-')as folder:
        base=Path(folder);home=base/'pm2-home';env={**os.environ,'PM2_HOME':str(home),'PATH':str(Path(node).parent)+':'+os.environ['PATH']}
        (base/'window').mkdir();configs={}
        for label in ('source','switch','return','return-partial'):
            d=base/label;d.mkdir();apps=[]
            for name in (seq.API,seq.WORKER,seq.FRONT):
                if name==seq.FRONT and label!='source':cfg=configs['source'][name].copy()
                else:
                    ad=d/name;ad.mkdir();script=ad/'index.js';script.write_text(WORKER_JS if name==seq.WORKER else 'setInterval(()=>{},1000);')
                    cfg={'name':name,'cwd':str(ad),'script':str(script),'interpreter':node,'exec_mode':'fork','instances':1,'watch':False,'autorestart':False,'env':{}}
                apps.append(cfg)
            configs[label]={a['name']:a for a in apps}
            (d/'ecosystem.config.cjs').write_text('module.exports='+json.dumps({'apps':apps})+';')
            (d/'candidate.config.private.json').write_text(json.dumps({'apps':apps}))
        if composition:
            for mode in ('switch','return','return-partial'):
                for line in (composition/mode/'scripts.sha256').read_text().splitlines():
                    digest,name=line.split('  ',1)
                    assert hashlib.sha256((composition/mode/name).read_bytes()).hexdigest()==digest
                    if name.endswith('.py'):
                        shutil.copyfile(composition/mode/name,base/mode/name)
            for name in ('privileged_output.py','prepare_post_unfence_return.py','privileged.py','sequencer.py'):
                shutil.copyfile(composition/'window'/name,base/'window'/name)
        for file in ('ops.py','db_owner_set_gate.py','db_owner_set_observer.py'):
            shutil.copyfile(ops_dir/file,base/'switch'/file)
        sys.path.insert(0,str(base/'switch'))
        guard=base/'window/guard.json';guard.write_text(json.dumps({'version':1,'open':False,'generation':26,'tasks':{},'audit':[]}))
        b=LabBridge(base,node,cli,env)
        state={'fence':True,'phase':{'stage':'ready','mode':'switch','policySha256':'synthetic'},'deletes':0}
        value={}
        def root_result(args,**kwargs):
            # Capture actual helper exceptions through the real Bridge logger.
            try: out=gate.act(args[-1],value);return subprocess.CompletedProcess(args,0,out or b'',b'')
            except Exception:return subprocess.CompletedProcess(args,1,b'',traceback.format_exc().encode())
        original_run=subprocess.run
        def intercept(args,**kwargs):
            if args[:2]==['sudo','-n']:return root_result(args,**kwargs)
            return original_run(args,**kwargs)
        def nft_present():
            gate.require(state['fence'],'fence_absent');return b'{}'
        def root_system(args,**kwargs):
            if args[:3]==['/usr/sbin/nft','delete','table']:state['fence']=False;state['deletes']+=1
            return b''
        def phase_write(stage,hash,mode=None,worker_capture_hash=None):
            state['phase']={'stage':stage,'mode':mode,'policySha256':hash,'workerCaptureSha256':worker_capture_hash}
        def control(label,action):
            port=int((Path(configs[label][seq.WORKER]['cwd'])/'port').read_text())
            return urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/'+action,timeout=3).read().decode()
        try:
            for name in (seq.FRONT,seq.API,seq.WORKER):run(node,cli,env,'start',str(base/'source/ecosystem.config.cjs'),'--only',name)
            sources=wait_apps(node,cli,env,{seq.API,seq.WORKER,seq.FRONT})
            daemon_pid=int((home/'pm2.pid').read_text());daemon=gate.process_identity(daemon_pid)
            old={n:{'pid':a['pid'],'ticks':gate.process_identity(a['pid'])['ticks']}for n,a in sources.items()}
            with contextlib.ExitStack()as stack:
                stack.enter_context(patch.object(seq,'PM_PID',home/'pm2.pid'))
                stack.enter_context(patch.object(gate,'GUARD',guard))
                stack.enter_context(patch.object(gate,'phase_read',lambda:state['phase']))
                stack.enter_context(patch.object(gate,'phase_write',phase_write))
                stack.enter_context(patch.object(gate,'nft_present',nft_present))
                stack.enter_context(patch.object(gate,'nft_absent',lambda:b'{}'if not state['fence']else (_ for _ in()).throw(RuntimeError('fence_present'))))
                stack.enter_context(patch.object(gate,'system',root_system))
                stack.enter_context(patch('sequencer.subprocess.run',side_effect=intercept))
                for mode in modes:
                    for name in (seq.API,seq.WORKER):run(node,cli,env,'delete',name)
                    for name in (seq.API,seq.WORKER):run(node,cli,env,'start',str(base/mode/'ecosystem.config.cjs'),'--only',name)
                    apps=wait_apps(node,cli,env,{seq.API,seq.WORKER,seq.FRONT})
                    for _ in range(50):
                        if (Path(configs[mode][seq.WORKER]['cwd'])/'port').exists():break
                        time.sleep(.05)
                    for n in (seq.API,seq.WORKER):
                        (base/mode/('started-'+n+'.json')).write_text(json.dumps({'pid':apps[n]['pid'],'identity':gate.process_identity(apps[n]['pid'])}))
                    port=(Path(configs[mode][seq.WORKER]['cwd'])/'port').read_text()
                    configs[mode][seq.WORKER]['env']={'WHATSAPP_WEB_WORKER_CONTROL_HOST':'127.0.0.1','WHATSAPP_WEB_WORKER_CONTROL_PORT':port,'WHATSAPP_WEB_WORKER_CONTROL_TOKEN':'synthetic'}
                    (base/mode/'candidate.config.private.json').write_text(json.dumps({'apps':list(configs[mode].values())}))
                    run(node,cli,env,'save','--force');shutil.copyfile(home/'dump.pm2',home/'dump.pm2.bak')
                    capture_mode='return' if mode=='return-partial' else mode
                    value.clear();value.update({'preparation':str(base),'policySha256':'synthetic','pm2Daemon':{'pid':daemon_pid,'ticks':daemon['ticks']},'sourceProcesses':old,'targetProcesses':{capture_mode:{n:{'cwd':configs[mode][n]['cwd'],'script':configs[mode][n]['script'],'sha256':hashlib.sha256(Path(configs[mode][n]['script']).read_bytes()).hexdigest()}for n in (seq.API,seq.WORKER)}},'savedPaths':{'pm2':str(home/'dump.pm2'),'fallback':str(home/'dump.pm2.bak')}})
                    (base/'window/privileged-policy.private.json').write_text(json.dumps(value))
                    state.update(fence=True,phase={'stage':'ready','mode':capture_mode,'policySha256':'synthetic'})
                    # Opening/closing real local TCP sockets between the samples.
                    b.pre_unfence(mode);before=(base/capture_mode/'worker-before-unfence.private.json').read_bytes()
                    control(mode,'open');b.pre_unfence(mode)
                    archives=list((base/capture_mode).glob('worker-before-unfence.*.private.json'));assert any(a.read_bytes()==before for a in archives)
                    gate.validate_live_capture(value,capture_mode);checks.append(mode+':renew_open_sockets:PASS_REAL')
                    control(mode,'close');b.pre_unfence(mode);gate.validate_live_capture(value,capture_mode);checks.append(mode+':renew_close_sockets:PASS_REAL')
                    b.samples=0;b.hook=lambda i:control(mode,'open')if i%2==1 else None
                    expect_deny(lambda:b.pre_unfence(mode),'worker_capture_unstable_after_3_attempts');assert b.samples==6 and state['fence'];checks.append(mode+':persistent_churn:DENIED_REAL')
                    b.hook=None;b.pre_unfence(mode)
                    deletes=state['deletes'];b.before_unfence=lambda:control(mode,'open')
                    expect_deny(lambda:b.renewed_unfence(mode),'unfence_capture_unstable_after_3_attempts')
                    assert state['fence']and state['deletes']==deletes
                    b.before_unfence=None;checks.append(mode+':persistent_root_capture_race:DENIED_REAL')
                    b.pre_unfence(mode)
                    # Root denies a stale snapshot, renewal then succeeds without start.
                    control(mode,'open');expect_deny(lambda:b.privileged('unfence'),'worker_capture_sockets_drift');assert state['fence']
                    b.renewed_unfence(mode);assert not state['fence'];checks.append(mode+':root_revalidation_and_unfence:PASS_REAL_WITH_NFT_SIMULATED')
                    private=[json.loads(x)for x in (base/'window/privileged-output.private.jsonl').read_text().splitlines()]
                    failures=[x for x in private if x['exitCode']==1]
                    import base64
                    assert any(b'worker_capture_sockets_drift' in base64.b64decode(x['stderrBase64'])for x in failures)
                    state['fence']=True;state['phase']={'stage':'ready','mode':capture_mode,'policySha256':'synthetic'}
                    before_ids={n:(b.apps()[n]['pid'],b.apps()[n]['pm2_env']['restart_time'])for n in b.apps()}
                    root_calls=[0]
                    def transient():
                        root_calls[0]+=1
                        if root_calls[0]==1:control(mode,'open')
                    b.before_unfence=transient
                    b.renewed_unfence(mode)
                    b.before_unfence=None
                    assert root_calls[0]==2 and not state['fence']
                    assert before_ids=={n:(b.apps()[n]['pid'],b.apps()[n]['pm2_env']['restart_time'])for n in b.apps()}
                    checks.append(mode+':transient_root_refusal_private_error_no_repeated_start:PASS_REAL')
                    state['fence']=True;state['phase']={'stage':'ready','mode':capture_mode,'policySha256':'synthetic'}
                    marker=base/mode/('started-'+seq.WORKER+'.json');saved=marker.read_bytes();bad=json.loads(saved);bad['identity']['ticks']='0';marker.write_text(json.dumps(bad))
                    expect_deny(lambda:b.pre_unfence(mode),'worker_capture_identity_drift','successor_identity_or_config_drift');marker.write_bytes(saved);checks.append(mode+':identity_mismatch:DENIED_REAL_WITH_TICKS_INJECTED')
                    b.pre_unfence(mode)
                    child=int(control(mode,'child'))
                    try:
                        expect_deny(lambda:b.pre_unfence(mode),'worker_capture_identity_or_tree_drift');expect_deny(lambda:gate.validate_live_capture(value,capture_mode),'worker_capture_tree_drift');checks.append(mode+':surviving_descendant:DENIED_REAL')
                    finally:os.kill(child,15)
                    prior_pid=apps[seq.WORKER]['pid']
                    run(node,cli,env,'restart',seq.WORKER)
                    apps=wait_apps(node,cli,env,{seq.API,seq.WORKER,seq.FRONT});assert apps[seq.WORKER]['pid']!=prior_pid
                    expect_deny(lambda:b.pre_unfence(mode),'successor_identity_or_config_drift')
                    checks.append(mode+':real_worker_substitution:DENIED_REAL')
                    old={n:{'pid':apps[n]['pid'],'ticks':gate.process_identity(apps[n]['pid'])['ticks']}for n in apps}
                # A real captured descendant outlives its worker. No successor starts.
                apps=b.apps();parent=apps[seq.WORKER]['pid'];child=int(control(modes[-1],'detached-child'))
                parent_id=gate.process_identity(parent);child_id=gate.process_identity(child)
                prior={'status':'absent-proven','pid':parent,'ticks':parent_id['ticks'],
                       'pgid':os.getpgid(parent),'sid':os.getsid(parent),'uid':os.getuid(),
                       'tree':{str(parent):parent_id['ticks'],str(child):child_id['ticks']},
                       'socketIds':[], 'cwd':configs['return-partial'][seq.WORKER]['cwd'],
                       'script':configs['return-partial'][seq.WORKER]['script']}
                absence={**value,'absentWorker':prior,'sourceProcesses':{
                    n:{'pid':a['pid'],'ticks':gate.process_identity(a['pid'])['ticks']}for n,a in apps.items()}}
                try:
                    os.kill(parent,9)  # lab-only, to prove a surviving descendant
                    for _ in range(60):
                        if gate.process_identity(parent)is None:break
                        time.sleep(.05)
                    assert gate.process_identity(parent)is None
                    assert gate.process_identity(child)['ticks']==child_id['ticks']
                    expect_deny(lambda:gate.worker_absent(absence),'absent_worker_pid_present')
                    checks.append('return:worker_exited_descendant_survives:DENIED_REAL')
                finally:os.kill(child,15)
                # Same real PM2/socket runs; synthetic log payloads are covered separately.
                assert state['deletes']==len(modes)*(2 if composition else 1)
            return {'node':'20.20.0','pm2':'6.0.14','checks':checks,'operationsSha256':hashlib.sha256((ops_dir/'ops.py').read_bytes()).hexdigest(),'limits':'nft/phase effects simulated; no DB/providers; PID mismatch injected; processes/sockets/descendants real'}
        finally:
            run(node,cli,env,'kill')
if __name__=='__main__':
    assert len(sys.argv)==4,'usage: script NODE PM2_CLI COMPOSITION_DIR'
    composition=Path(sys.argv[3]).resolve()
    # Load the exact staged sequencer/helper/logger instead of repository imports.
    for name in ('privileged_output','privileged','sequencer'):
        spec=importlib.util.spec_from_file_location(name,composition/'window'/(name+'.py'))
        module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
        if name=='privileged':gate=module
        if name=='sequencer':seq=module
    LabBridge.__bases__=(seq.Bridge,)
    # Each mode is a fresh preparation; a return capture from another live
    # identity must never be cleared to make a partial return pass.
    print(json.dumps({'runs':[main(sys.argv[1],sys.argv[2],composition/'switch',composition,(mode,)) for mode in ('switch','return','return-partial')]},indent=2))
