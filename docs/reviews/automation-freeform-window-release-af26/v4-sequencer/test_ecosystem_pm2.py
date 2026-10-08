"""Real PM2/Node process composition; only external protocol effects simulated.
No production DB/auth/provider; all app scripts are synthetic timers.
Usage: python3 test_ecosystem_pm2.py NODE20 PM2_CLI ATTESTED_OPS_DIR
"""
import copy, hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from unittest.mock import patch
from ecosystem_contract import generate_mode, validate_all, rendered, source
import sequencer as seq
from test_sequencer import FakeBridge
from baseline_contract import capture_operational


def run(node, cli, env, *args):
    return subprocess.check_output([node, cli, *args], env=env, text=True, stderr=subprocess.PIPE, timeout=20)


class RealBridge(FakeBridge):
    def __init__(self, base, node, cli, env, ops):
        super().__init__(base)
        self.node20, self.cli, self.env, self.ops = node, cli, env, ops
        self.starts = []
        self.g.update(open=False, generation=35)
        (self.window/'initial.private.json').write_text(json.dumps(capture_operational(self.guard, lambda _: 'ActiveState=inactive\nUnitFileState=enabled\n')))
        for version, mapping in [('source', self.old), ('candidate', self.new)]:
            for name, app in mapping.items():
                if version == 'candidate' and name == seq.FRONT:
                    continue
                d = base/version/name; d.mkdir(parents=True)
                script = d/'index.js'; script.write_text('setInterval(()=>{},1000);\n')
                app.update(cwd=str(d), script=str(script), interpreter=node, watch=False,
                           autorestart=False, exec_mode='fork', instances=1, env={'SYNTHETIC_BUILD':version})
        front = base/'source'/seq.FRONT/'.next'; front.mkdir(); (front/'BUILD_ID').write_text('synthetic-build')
        self.new[seq.FRONT] = copy.deepcopy(self.old[seq.FRONT])
        for mode in ('switch', 'return', 'return-partial'):
            d=base/mode
            src, dst = (self.old, self.new) if mode=='switch' else (self.new,self.old)
            for variant, value in [('return',src),('candidate',dst)]:
                (d/(variant+'.config.private.json')).write_text(json.dumps({'apps':list(value.values())}))
            for variant in ('candidate','return'):
                (d/(variant+'.ecosystem.config.cjs')).unlink()  # replace synthetic fixture only
            generate_mode(d)
        (base/'source/ecosystem.config.cjs').write_bytes(rendered({'apps':list(self.old.values())}))
        for name in (seq.FRONT,seq.API,seq.WORKER):
            run(node,cli,env,'start',str(base/'source/ecosystem.config.cjs'),'--only',name)
        self.wait_set({seq.FRONT,seq.API,seq.WORKER})

    def apps(self):
        return {a['name']:a for a in json.loads(run(self.node20,self.cli,self.env,'jlist'))}

    def identity(self,pid):
        return self.ops.System().identity(pid)

    def app_matches(self,name,expected):
        app=self.apps().get(name)
        if app is None:return False
        try:self.ops.System().check_config(app,expected[name])
        except RuntimeError:return False
        return app['pm2_env']['status']=='online' and app['pm2_env']['restart_time']==0

    def wait_set(self,names):
        for _ in range(60):
            apps=self.apps()
            if set(apps)==names and all(a['pid']>0 and a['pm2_env']['status']=='online' for a in apps.values()):return apps
            time.sleep(.05)
        raise RuntimeError('lab_pm2_readiness_timeout')

    def protocol(self,mode,action):
        # Same sequencer + config/baseline code. Delegated DB/nft/certificates are
        # simulated here; PM2 commands, /proc identity/config and tree are real.
        self.events.append(('protocol',mode,action,self.g['generation']))
        validate_all(self.root)
        if self.fail_action==mode+':'+action:
            self.fail_action=None
            raise RuntimeError('injected_'+action)
        d=self.root/mode
        if action in ('stop-pair','recover-partial'):
            trees=[]
            for name in (seq.API,seq.WORKER):
                apps=self.apps()
                if name in apps:
                    trees.append(self.ops.System().tree(apps[name]['pid']))
                    run(self.node20,self.cli,self.env,'delete',name)
            self.wait_set({seq.FRONT})
            assert all(self.identity(int(p)) is None for t in trees for p in t), 'lab_source_tree_survived'
            (d/'old-exit-confirmed.json').write_text('{}')
        elif action.startswith('start:'):
            name=action.split(':',1)[1]
            assert (mode,name) not in self.starts, 'lab_repeated_start'
            (d/('start-intent-'+name+'.json')).write_text('{}')
            self.starts.append((mode,name))
            run(self.node20,self.cli,self.env,'start',str(d/'candidate.ecosystem.config.cjs'),'--only',name)
            apps=self.wait_set({seq.FRONT,seq.API} if name==seq.API else {seq.FRONT,seq.API,seq.WORKER})
            assert self.app_matches(name,self.expected_config(mode,'candidate.config.private.json'))
            (d/('started-'+name+'.json')).write_text(json.dumps({'pid':apps[name]['pid'],'identity':self.identity(apps[name]['pid'])}))
        elif action=='unfence':(d/'owner-unfence-authorized.json').write_text('{}')

    def node(self,mode,script):
        self.events.append(('node',mode,script))
        if script=='close.cjs':(self.root/mode/'drain-result.json').write_text('{}')
        # Initial guard closed: open.cjs must preserve it, not open campaigns.
        assert self.g['open'] is False and self.g['generation']==35
        return ''


def main(node,cli,ops_dir):
    node=str(Path(node).resolve());cli=str(Path(cli).resolve())
    assert subprocess.check_output([node,'--version'],text=True).strip()=='v20.20.0'
    assert json.loads((Path(cli).parents[1]/'package.json').read_text())['version']=='6.0.14'
    sys.path.insert(0,str(Path(ops_dir).resolve()))
    spec=importlib.util.spec_from_file_location('attested_ops',Path(ops_dir)/'ops.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
    checks=[]
    for scenario in ('switch','return','return-partial','drift'):
        with tempfile.TemporaryDirectory(prefix='re7-ecosystem-pm2-') as folder:
            base=Path(folder)/'incident-6683-v4-lab';env={**os.environ,'PM2_HOME':folder+'/pm2','PATH':str(Path(node).parent)+':'+os.environ['PATH']}
            try:
                b=RealBridge(base,node,cli,env,ops);s=seq.Sequencer(b);front=b.apps()[seq.FRONT]['pid']
                if scenario=='drift':
                    f=base/'return-partial/candidate.ecosystem.config.cjs'
                    f.write_text(f.read_text().replace('source','wrong-release'))
                    before={n:a['pid'] for n,a in b.apps().items()}
                    try:s.run();raise AssertionError('drift accepted')
                    except RuntimeError as e:assert str(e)=='ecosystem_json_drift:return-partial/candidate',str(e)
                    assert not b.events and not b.starts and b.g['generation']==35 and not b.fenced
                    assert before=={n:a['pid'] for n,a in b.apps().items()}
                    checks.append('JSON/ecosystem drift: denied before close/privileged/stop/start')
                else:
                    if scenario=='return':b.fail_action='switch:unfence'
                    if scenario=='return-partial':b.fail_action='switch:start:'+seq.WORKER
                    try:s.run();assert scenario=='switch'
                    except RuntimeError as e:assert scenario!='switch' and str(e)=='window_failed_returned_to_original',str(e)
                    assert s.mode==scenario and b.apps()[seq.FRONT]['pid']==front
                    assert not b.fenced and b.boot=='enabled' and b.system_cron=='before' and not b.g['open']
                    assert len(b.starts)==len(set(b.starts))
                    target=b.new if scenario=='switch' else b.old
                    assert all(b.app_matches(n,target)for n in target)
                    checks.append(scenario+': real Node20/PM2 composition + effective /proc config; frontend preserved; unique starts')
            finally:run(node,cli,env,'kill')
    print(json.dumps({'node':'20.20.0','pm2':'6.0.14','checks':checks,'limits':'Synthetic timers; real PM2, /proc identities/config/tree. DB, nft, cron, certificates and privileged calls simulated; capture root revalidation covered by separate existing evidence.'},indent=2))

if __name__=='__main__':main(*sys.argv[1:])
