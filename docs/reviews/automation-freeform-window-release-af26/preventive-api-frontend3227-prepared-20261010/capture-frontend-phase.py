"""New-preparation-only baseline renewal after exact V4 switch completion.
No policy install, provider, admission setter, process command or PM2 save.
"""
import fcntl,hashlib,importlib.util,json,os,subprocess,sys
from pathlib import Path
from frontend_phase_contract import validate,require
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-after-preventive-env-v2-20261011T002421Z')
A=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-preventive-env-v2-20261011T002421Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):
 with p.open('x')as f:json.dump(v,f,sort_keys=True);f.write('\n')
 p.chmod(0o600)
def main():
 os.umask(0o077);lock=(P/'window.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 require((P/'execution-authorized').read_text().strip()=='false','frontend_phase_gate_not_false')
 require(not any(P.glob('start-*.intent')) and not any(P.glob('*-tree.private.json')),'frontend_phase_attempt_consumed')
 require(not (P/'phase-after-api').exists(),'frontend_phase_already_attempted')
 for n in ['scripts.sha256','bindings.sha256']:subprocess.run(['sha256sum','-c',n],cwd=P,check=True,stdout=subprocess.DEVNULL)
 old=json.loads((P/'live.private.json').read_text());expected={a['name']:a for a in json.loads((A/'switch/candidate.config.private.json').read_text())['apps']}
 require((A/'window/sequencer.journal.jsonl').is_file(),'frontend_phase_api_not_complete')
 complete=json.loads((A/'window/sequencer.journal.jsonl').read_text().splitlines()[-1]);starts={n:json.loads((A/'switch'/('started-'+n+'.json')).read_text())for n in ['re7-whatsapp-agent','re7-whatsapp-web-worker']}
 sys.path.insert(0,str(P));s=importlib.util.spec_from_file_location('front_g',P/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
 s=importlib.util.spec_from_file_location('v4_ops',A/'switch/ops.py');ops=importlib.util.module_from_spec(s);sys.path.insert(0,str(A/'switch'));s.loader.exec_module(ops)
 def observe():
  v=json.loads(json.dumps(old));rows=g.rows();require(len(rows)==3,'frontend_phase_process_count');v['runtime']=rows
  matches={}
  for r in rows:
   q=g.proc(r['pid']);r['startTicks']=q['ticks'];matches[r['name']]=True
   ops.Operations(A/'switch',ops.System()).config(r,expected[r['name']])
  front=next(r for r in rows if r['name']==g.FRONT);v['activeRun'],v['activeChild']=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front);v['activeControl']=front['pm2_env']['RE7_FRONT_CONTROL']
  v['daemon']=g.proc(int(g.PM_PID.read_text()));v['bootId']=g.BOOT_ID.read_text().strip();v['guard']=json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text())
  require(not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+x)for x in ['.lock','.uncertain']),'frontend_phase_ledger_marker')
  v['saved']=json.loads(Path('/home/deploy/.pm2/dump.pm2').read_text());v['fallback']=json.loads(Path('/home/deploy/.pm2/dump.pm2.bak').read_text());v['savedSha256']=h('/home/deploy/.pm2/dump.pm2');v['fallbackSha256']=h('/home/deploy/.pm2/dump.pm2.bak');v['backupCronSha256']=h('/etc/cron.d/re7-converta-backup');v['crontab']=subprocess.check_output(['crontab','-l'],text=True);v['boot']=subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)
  validate(old,v,complete,starts,expected,matches);return v
 first=observe();second=observe()
 for k in ['savedSha256','fallbackSha256','guard','bootId','activeRun','activeChild']:require(first[k]==second[k],'frontend_phase_unstable:'+k)
 require([(r['name'],r['pid'],r['startTicks'])for r in first['runtime']]==[(r['name'],r['pid'],r['startTicks'])for r in second['runtime']],'frontend_phase_process_drift')
 # Read permanent observer; preserve full private output. No window exit certificate.
 read=subprocess.run(['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/frontend-permanent-observer.py'],capture_output=True,text=True,timeout=15)
 require(read.returncode==0,'frontend_phase_permanent_read_denied');value=json.loads(read.stdout);require(len(value['samples'])==2 and value['bootId']==second['bootId'],'frontend_phase_permanent_incomplete')
 folder=P/'phase-after-api';folder.mkdir(mode=0o700);write(folder/'observer.private.json',{'stdout':read.stdout,'stderr':read.stderr,'exitCode':read.returncode});write(folder/'live.private.json',second)
 fields=['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode'];write(folder/'runtime.private.json',{'processes':[{'name':r['name'],'pid':r['pid'],'startTicks':r['startTicks'],**{k:r['pm2_env'][k]for k in fields}}for r in second['runtime']]});write(folder/'daemon.private.json',{k:second['daemon'][k]for k in ['pid','ticks']});write(folder/'saved.preparation.private.json',second['saved']);write(folder/'fallback.preparation.private.json',second['fallback'])
 before=P/'phase-before-api';require(not before.exists(),'frontend_phase_archive_exists');before.mkdir(mode=0o700)
 names=['live.private.json','runtime.private.json','daemon.private.json','saved.preparation.private.json','fallback.preparation.private.json','bindings.sha256']
 for name in names:os.rename(P/name,before/name)
 for name in names[:-1]:
  data=(folder/name).read_bytes();fd=os.open(P/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb')as f:f.write(data)
 entries={n:h(P/n)for n in [l.split('  ',1)[1]for l in (before/'bindings.sha256').read_text().splitlines()]}
 (P/'bindings.sha256').write_text(''.join(x+'  '+n+'\n'for n,x in entries.items()));(P/'bindings.sha256').chmod(0o600)
 subprocess.run(['python3',str(P/'check-preparation.py')],check=True,timeout=30)
 write(P/'phase-after-api-complete.private.json',{'phase':'API_SWITCH_VERIFIED_FRONTEND_NOT_STARTED','v4CompletionSha256':h(A/'window/sequencer.journal.jsonl'),'oldBindingsSha256':h(before/'bindings.sha256'),'newBindingsSha256':h(P/'bindings.sha256'),'baselineSha256':h(P/'runtime.private.json'),'policyUnchanged':True,'executionAuthorized':False})
 print('FRONTEND_PHASE_AFTER_API_VERIFIED_GATES_FALSE')
if __name__=='__main__':main()
