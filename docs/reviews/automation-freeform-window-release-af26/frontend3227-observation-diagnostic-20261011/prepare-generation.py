from pathlib import Path
import json,hashlib,subprocess,importlib.util,sys,os,time,fcntl,stat
def ensure_receipts_directory(root, expected_uid=None):
 """Create only the fixed receipt directory; never repair an existing divergence."""
 uid=os.geteuid() if expected_uid is None else expected_uid
 parent=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  try:os.mkdir('receipts-private',mode=0o700,dir_fd=parent)
  except FileExistsError:pass
  before=os.stat('receipts-private',dir_fd=parent,follow_symlinks=False)
  if not stat.S_ISDIR(before.st_mode):raise RuntimeError('receipts_not_directory_or_symlink')
  if before.st_uid!=uid:raise RuntimeError('receipts_owner_drift')
  if stat.S_IMODE(before.st_mode)!=0o700:raise RuntimeError('receipts_mode_drift')
  child=os.open('receipts-private',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:
   after=os.fstat(child)
   if (after.st_dev,after.st_ino,after.st_uid,after.st_mode)!=(before.st_dev,before.st_ino,before.st_uid,before.st_mode):raise RuntimeError('receipts_identity_drift')
  finally:os.close(child)
 finally:os.close(parent)

P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z')
O=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-after-preventive-env-v2-20261011T002421Z')
T=Path('/opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front')
# Root upgrade is NOT executed here. The proposed bytes arrive in a new incoming directory.
I=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-incoming-20261011T101500Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
os.umask(0o077)
assert not P.exists() and not P.is_symlink();assert (O/'execution-authorized').read_text().strip()=='false'
lock=(O/'window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert os.statvfs(O).f_bavail*os.statvfs(O).f_frsize>=2131755008+1048576,'capacity_before_staging'
for line in (O/'scripts.sha256').read_text().splitlines():
 sha,name=line.split('  ');assert h(O/name)==sha,'origin_script_drift:'+name
for line in (I/'incoming.sha256').read_text().splitlines():
 sha,name=line.split('  ');assert h(I/name)==sha,'incoming_script_drift:'+name
assert h('/usr/local/libexec/re7/frontend-socket-observer.py')=='93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385'
P.mkdir(mode=0o700)
ensure_receipts_directory(P)
def write(n,value):
 p=P/n;assert not p.exists();p.write_text(json.dumps(value,sort_keys=True)+'\n');p.chmod(0o600)
skip={'install-window-policy.sh','install-permanent-policy.sh','WINDOW-STEPS.txt','capture-frontend-phase.py','frontend_phase_contract.py'}
for line in (O/'scripts.sha256').read_text().splitlines():
 sha,name=line.split('  ')
 if name in skip:continue
 b=(O/name).read_bytes().replace(str(O).encode(),str(P).encode());(P/name).write_bytes(b);(P/name).chmod(0o600)
for line in (I/'incoming.sha256').read_text().splitlines():
 sha,name=line.split('  ');(P/name).write_bytes((I/name).read_bytes());(P/name).chmod(0o600)
permanent=json.loads((O/'permanent-observer-binding.private.json').read_text());assert permanent['policySha256']=='ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83'
write('permanent-observer-binding.private.json',permanent);write('permanent-installed-binding.private.json',permanent)
sys.path.insert(0,str(P));s=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
def capture():
 rows=g.rows();assert len(rows)==3;front=next(a for a in rows if a['name']==g.FRONT);run,child=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front)
 for a in rows:a['startTicks']=g.proc(a['pid'])['ticks']
 return {'runtime':rows,'front':front,'run':run,'child':child,'guard':json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text()),'daemon':g.proc(int(g.PM_PID.read_text())),'savedSha256':h('/home/deploy/.pm2/dump.pm2'),'fallbackSha256':h('/home/deploy/.pm2/dump.pm2.bak'),'cronSha256':h('/etc/cron.d/re7-converta-backup'),'boot':subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True),'crontab':subprocess.check_output(['crontab','-l'],text=True)}
first=capture();second=capture()
def signature(v):
 return {'processes':[(a['name'],a['pid'],a['startTicks'],a['pm2_env']['restart_time'])for a in v['runtime']],'run':v['run'],'child':{k:x for k,x in v['child'].items()if k!='state'},'daemon':{k:x for k,x in v['daemon'].items()if k!='state'},'guard':v['guard'],'saved':v['savedSha256'],'fallback':v['fallbackSha256'],'cron':v['cronSha256'],'boot':v['boot'],'crontab':v['crontab']}
assert signature(first)==signature(second),'baseline_two_samples_changed'
rows=second['runtime'];front=second['front'];run=second['run'];child=second['child']
assert run['release']=='/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8'
assert second['guard']['open']is False and second['guard']['generation']==38 and second['guard']['tasks']=={}
assert second['savedSha256']==second['fallbackSha256'];assert not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+s)for s in ['.lock','.uncertain'])
old=json.loads((O/'live.private.json').read_text());installed=json.loads((O/'socket-observer-binding.private.json').read_text());assert installed['policySha256']=='c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121'
old.update(at=time.time(),bootId=g.BOOT_ID.read_text().strip(),daemon=second['daemon'],runtime=rows,activeControl=front['pm2_env']['RE7_FRONT_CONTROL'],activeRun=run,activeChild=child,activePolicyBinding=installed,guard=second['guard'],saved=json.loads(Path('/home/deploy/.pm2/dump.pm2').read_text()),fallback=json.loads(Path('/home/deploy/.pm2/dump.pm2.bak').read_text()),savedSha256=second['savedSha256'],fallbackSha256=second['fallbackSha256'],backupCronSha256=second['cronSha256'],boot=second['boot'],crontab=second['crontab'])
write('live.private.json',old);write('baseline-two-samples.private.json',{'first':signature(first),'second':signature(second),'at':time.time()})
(P/'active-base.config.private.cjs').write_bytes((O/'active-base.config.private.cjs').read_bytes());(P/'execution-authorized').write_text('false\n')
base=json.loads((P/'active-base.config.private.cjs').read_text().split('module.exports = ',1)[1].rstrip(';\n'));assert base['apps'][0]['cwd']==run['release'] and base['apps'][0]['script']==run['entry']
for label in ['candidate','return']:
 cfg=json.loads(json.dumps(base));app=cfg['apps'][0];app['cwd']=str(T)if label=='candidate'else run['release'];app['script']=app['cwd']+'/node_modules/next/dist/bin/next';(P/(label+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps(cfg)+';\n')
fields=['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode'];write('runtime.private.json',{'processes':[{'name':a['name'],'pid':a['pid'],'startTicks':a['startTicks'],**{k:a['pm2_env'][k]for k in fields}}for a in rows]});write('daemon.private.json',{k:second['daemon'][k]for k in ['pid','ticks']});write('saved.preparation.private.json',old['saved']);write('fallback.preparation.private.json',old['fallback'])
for label in ['candidate','return']:g.init_run(label)
policy=json.loads(json.dumps(installed['policy']));policy['bootId']=old['bootId'];policy['daemon']={k:second['daemon'][k]for k in ['pid','ticks']};policy['roles']={label:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(P/(label+'-tree.private.json'))}for label,r in [('source',run),('candidate',g.run_from('candidate')),('return',g.run_from('return'))]}
write('installed-policy-reference.private.json',installed);write('observer-policy.private.json',policy);write('socket-observer-binding.private.json',{'policy':policy,'policySha256':h(P/'observer-policy.private.json'),'helperSha256':h(P/'observer.py')})
(P/'permanent-policy.proposed.private.json').write_bytes((O/'permanent-policy.proposed.private.json').read_bytes());assert h(P/'permanent-policy.proposed.private.json')==permanent['policySha256']
# Permanent artifact bindings are unchanged; no permanent installation needed.
for label in ['source','candidate','return']:
 r=run if label=='source'else g.run_from(label);assert permanent['policy']['roles'][label]=={k:r[k]for k in ['release','entry','entrySha256','buildId']}
origin={'bootId':old['bootId'],'daemon':policy['daemon'],'pid':front['pid'],'ticks':front['startTicks'],'pm2ExecMode':front['pm2_env']['exec_mode'],'restartCount':front['pm2_env']['restart_time'],'sourceControl':old['activeControl'],'sourceNonce':run['nonce'],'sourceRelease':run['release'],'sourceEntry':run['entry'],'entrySha256':run['entrySha256'],'buildId':run['buildId'],'tree':g.tree(front['pid'])};write('origin.private.json',origin)
for n in ['candidate.run.private.json','return.run.private.json']:assert h(P/n)!=h(O/n),'control_reused'
# Explicit review-only mode validates proposed helper; normal mode remains strict.
c=(P/'check-preparation.py').read_text();anchor="need(sha('/usr/local/libexec/re7/frontend-socket-observer.py')==w['helperSha256'],'window_helper')";assert anchor in c
replacement="""if sys.argv[1:]==['--proposed-observer']:
 need(sha('/usr/local/libexec/re7/frontend-socket-observer.py')==json.loads((P/'installed-policy-reference.private.json').read_text())['helperSha256'],'installed_original_window_helper')
 need(sha(P/'observer.py')==w['helperSha256'],'proposed_window_helper')
else:
 need(not sys.argv[1:],'unknown_preparation_mode')
 need(sha('/usr/local/libexec/re7/frontend-socket-observer.py')==w['helperSha256'],'window_helper')"""
c=c.replace(anchor,replacement).replace("print('CONFIGURATIONS_POLICIES_IDENTITIES_AND_CONTROLS_PASS_GATES_FALSE')","print('PROPOSED_OBSERVER_COMPOSITION_PASS_NOT_INSTALLED_GATES_FALSE' if sys.argv[1:] else 'CONFIGURATIONS_POLICIES_IDENTITIES_AND_CONTROLS_PASS_GATES_FALSE')");(P/'check-preparation.py').write_text(c)
subprocess.run(['python3',str(P/'check-preparation.py'),'--proposed-observer'],check=True,timeout=30)
normal=subprocess.run(['python3',str(P/'check-preparation.py')],text=True,capture_output=True,timeout=30);assert normal.returncode!=0 and 'window_helper' in normal.stderr
write('normal-preflight-installation-required.private.json',{'exitCode':normal.returncode,'stdout':normal.stdout,'stderr':normal.stderr,'required':'install reviewed helper/policy before normal preflight'})
subprocess.run(['python3',str(P/'verify-package.py'),str(T),'32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60'],check=True,timeout=90)
subprocess.run(['python3',str(P/'verify-return.py'),run['release'],'378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf'],check=True,timeout=90)
subprocess.run(['python3',str(P/'check-css.py'),str(T)],check=True,timeout=20)
tar=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z/frontend-3227b2d7.tar.gz');assert h(tar)=='9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319'
write('staging-result.private.json',{'result':'PROPOSED_COMPOSITION_VERIFIED_NOT_INSTALLED','at':time.time(),'tarSha256':h(tar),'tarSource':str(tar),'windowPolicySha256':h(P/'observer-policy.private.json'),'helperSha256':h(P/'observer.py'),'permanentPolicyUnchanged':True,'permanentPolicySha256':permanent['policySha256'],'gateFalse':True,'newWindowObserverPreflight':'NOT_EXECUTED_INSTALLATION_REQUIRED','activeControlPreserved':old['activeControl']})
print(json.dumps({'result':'PROPOSED_COMPOSITION_VERIFIED_NOT_INSTALLED','newPreparation':str(P),'helperSha256':h(P/'observer.py'),'policySha256':h(P/'observer-policy.private.json'),'permanentPolicyUnchanged':True,'gateFalse':True}))
