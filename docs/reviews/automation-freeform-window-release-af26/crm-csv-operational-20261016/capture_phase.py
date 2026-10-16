"""Future deploy-only two-sample phase capture. No PM2 control or provider call."""
import argparse,datetime,hashlib,importlib.util,json,os,stat,subprocess,sys
from pathlib import Path
def capture(root,folder,phase):
    root=Path(root);folder=Path(folder);sys.path[:0]=[str(root/'window'),str(root/'switch'),str(root/'frontend')]
    from csv_contract import read,write,require,sha
    from sequencer import Bridge
    from scheduled_controls import ScheduledControls
    import ops
    spec=importlib.util.spec_from_file_location('csv_phase_front',root/'frontend/frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
    require(phase in ('before','after'),'phase');s=folder.lstat();require(s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not folder.is_symlink(),'private_phase_directory')
    cfg=read(root/'window'/('source.profile.private.json'if phase=='before'else'target.profile.private.json'));expected={a['name']:a for a in cfg['apps']}
    def run(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=15)
    def observe():
        rows=g.rows();require(len(rows)==3 and {r['name']for r in rows}==set(expected),'phase_process_set')
        for r in rows:r['startTicks']=g.proc(r['pid'])['ticks'];ops.System().check_config(r,expected[r['name']])
        front=next(r for r in rows if r['name']==g.FRONT);control=front['pm2_env']['RE7_FRONT_CONTROL'];active,child=g.supervision_live(control,front)
        state=Path('/var/lib/re7/campaign-operations/state.json');require(not any(os.path.lexists(str(state)+x)for x in ('.lock','.uncertain')),'guard_markers')
        guard=json.loads(state.read_text());require(guard['open']is False and guard['generation']==38 and guard['tasks']=={} and not guard.get('ledgerFault'),'guard38')
        ScheduledControls(root/'window',lambda args,text=None:run(args)).verify('before')
        saved=[]
        for n in ('dump.pm2','dump.pm2.bak'):
            p=Path('/home/deploy/.pm2')/n;s=p.lstat();require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'saved600');saved.append((json.loads(p.read_text()),sha(p)))
        return {'runtime':rows,'activeControl':control,'activeRun':active,'activeChild':child,'activeManifestSha256':sha(Path(active['release'])/'manifest.json'),'bootId':g.BOOT_ID.read_text().strip(),'daemon':g.proc(int(g.PM_PID.read_text())),'guard':guard,'saved':saved[0][0],'fallback':saved[1][0],'savedSha256':saved[0][1],'fallbackSha256':saved[1][1],'backupCronSha256':sha('/etc/cron.d/re7-converta-backup'),'crontab':run(['crontab','-l']),'boot':run(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'])}
    def signature(v):return {k:v[k]for k in ('activeControl','activeRun','activeChild','activeManifestSha256','bootId','guard','savedSha256','fallbackSha256','backupCronSha256','crontab','boot')}|{'processes':[(r['name'],r['pid'],r['startTicks'],r['pm2_env']['restart_time'])for r in v['runtime']],'daemon':{k:v['daemon'][k]for k in ('pid','ticks')}}
    first=observe();second=observe();require(signature(first)==signature(second),'phase_capture_churn');write(folder/(phase+'.private.json'),second)
    if phase=='after':
        receipt=read(root/'window/csv-complete.receipt.private.json');require(receipt['result']=='CSV_API_COMPLETE_CANDIDATE_PRESERVED'and receipt['gatesFalse']is True,'api_completion_required')
        complete=json.loads((root/'window/sequencer.journal.jsonl').read_text().splitlines()[-1]);require(complete['event']=='complete'and complete['mode']=='switch','api_complete_journal')
        write(folder/'complete.private.json',complete);write(folder/'starts.private.json',{n:read(root/'switch'/('started-'+n+'.json'))for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker')});write(folder/'expected.private.json',expected);write(folder/'matches.private.json',{n:True for n in expected})
    return {'result':'CSV_PHASE_CAPTURE_READONLY','phase':phase,'samples':2,'executionAuthorized':False}
if __name__=='__main__':
    os.umask(0o077);a=argparse.ArgumentParser();a.add_argument('root');a.add_argument('folder');a.add_argument('phase',choices=['before','after']);v=a.parse_args();print(json.dumps(capture(v.root,v.folder,v.phase)))
