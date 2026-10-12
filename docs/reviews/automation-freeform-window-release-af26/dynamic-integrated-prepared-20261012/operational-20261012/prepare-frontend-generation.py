import hashlib,importlib.util,json,os,subprocess,sys,tarfile,time
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z')
T=Path('/opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z')
SHA='74a2ac2fcf93b32623fa2e0dfa857d1792cfd503e1f46cee09e6f94f3ca2216f';M='e0c66407d0b56748547d0d03f7a2b1b88d63a75cadde22f8cc8bbd03bac4054b'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,v):
 p=P/n;assert not p.exists() and not p.is_symlink(),'existing:'+n
 p.write_text(json.dumps(v,indent=2)+'\n');p.chmod(0o600)
os.umask(0o077)
O=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z')
assert not P.exists()and not P.is_symlink(),'generation_exists'
lock=(P.parent/'.incident-6683-window.lock').open('a+')
import fcntl
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (O/'execution-authorized').read_text().strip()=='false'
P.mkdir(mode=0o700);(P/'receipts-private').mkdir(mode=0o700)
for line in(O/'scripts.sha256').read_text().splitlines():
 digest,name=line.split('  ',1);assert h(O/name)==digest,'source_script_drift:'+name
 if name not in['install-observer-window-policy.sh','WINDOW-STEPS.txt']:(P/name).write_bytes((O/name).read_bytes().replace(str(O).encode(),str(P).encode()))
# The active manifest is the approved 3227 return; unknown non-cache additions still deny.
s=(P/'verify-return.py').read_text().replace("fa60f0f6443f3e0a129dc707021cffdc408af817","3227b2d752110873f0eff4ee5253a6f06ca51549");(P/'verify-return.py').write_text(s)
# Fixed public artifact checker for the newly validated tar; no verification weakened.
(P/'verify-package.py').write_bytes(Path('/opt/re7online/backups/converta-persistent/preparations/dynamic-integrated-input-5b3cf3af-20261012T170000Z/verify-frontend.py').read_bytes())
x=P/'frontend-check.py';x.write_text(x.read_text().replace("TARGET = '/opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front'","TARGET = '"+str(T)+"'"))
(P/'execution-authorized').write_text('false\n')
sys.path.insert(0,str(P));spec=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
rows=g.rows();assert len(rows)==3
front=next(x for x in rows if x['name']==g.FRONT);run,child=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front)
assert run['release']=='/opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front'
for row in rows:row['startTicks']=g.proc(row['pid'])['ticks']
live=json.loads((O/'live.private.json').read_text());live.update(bootId=g.BOOT_ID.read_text().strip(),daemon=g.proc(int(g.PM_PID.read_text())),runtime=rows,activeControl=front['pm2_env']['RE7_FRONT_CONTROL'],activeRun=run,activeChild=child,guard=json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text()),saved=json.loads(Path('/home/deploy/.pm2/dump.pm2').read_text()),fallback=json.loads(Path('/home/deploy/.pm2/dump.pm2.bak').read_text()),savedSha256=h('/home/deploy/.pm2/dump.pm2'),fallbackSha256=h('/home/deploy/.pm2/dump.pm2.bak'),backupCronSha256=h('/etc/cron.d/re7-converta-backup'),crontab=subprocess.check_output(['crontab','-l'],text=True),boot=subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True),activeManifestSha256='32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60')
assert live['guard']['open']is False and live['guard']['generation']==38 and live['guard']['tasks']=={}
live['activePolicyBinding']=json.loads((O/'socket-observer-binding.private.json').read_text());assert live['activePolicyBinding']['policySha256']=='7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472'
write('live.private.json',live)
base=json.loads((O/'candidate.tracked.config.cjs').read_text().split('module.exports = ',1)[1].rstrip(';\n'));a=base['apps'][0];a['script']=run['entry'];a['args']=run['args'];a['stop_exit_codes']=[];a['env'].pop('RE7_FRONT_CONTROL',None);a['env'].pop('RE7_FRONT_RUN',None)
(P/'active-base.config.private.cjs').write_text('module.exports = '+json.dumps(base)+';\n')
permanent=json.loads((O/'permanent-installed-binding.private.json').read_text());assert permanent['policySha256']=='3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391';write('permanent-installed-binding.private.json',permanent)

assert h(Path('/opt/re7online/backups/converta-persistent/preparations/dynamic-integrated-input-5b3cf3af-20261012T170000Z/frontend-dynamic-integrated.tar.gz'))==SHA
assert not T.exists() and not T.is_symlink(),'candidate_release_exists_preserve'
T.mkdir(mode=0o755)
with tarfile.open(Path('/opt/re7online/backups/converta-persistent/preparations/dynamic-integrated-input-5b3cf3af-20261012T170000Z/frontend-dynamic-integrated.tar.gz')) as f:f.extractall(T,filter='data')
verify=json.loads(subprocess.check_output(['python3',str(P/'verify-package.py'),str(T),M],text=True,timeout=60))
assert subprocess.check_output(['/usr/bin/node','--version'],text=True).strip()=='v20.20.0'
sys.path.insert(0,str(P));spec=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
old=json.loads((P/'live.private.json').read_text());daemon=g.proc(int(g.PM_PID.read_text()));assert daemon['pid']==old['daemon']['pid'] and daemon['ticks']==old['daemon']['ticks']
rows=g.rows();assert len(rows)==3
fields=['status','pm_cwd','pm_exec_path','exec_interpreter','restart_time','exec_mode']
expect=[]
for before in old['runtime']:
 a=[r for r in rows if r['name']==before['name']];assert len(a)==1
 a=a[0];assert a['pid']==before['pid']
 assert all(a['pm2_env'].get(k)==before['pm2_env'].get(k) for k in fields),'identity_config_drift'
 ident=g.proc(a['pid']);expected={'name':a['name'],'pid':a['pid'],'startTicks':ident['ticks'],**{k:a['pm2_env'].get(k) for k in fields}};expect.append(expected)
front=next(x for x in rows if x['name']==g.FRONT);run,child=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front)
assert run==old['activeRun'] and {k:v for k,v in child.items()if k!='state'}=={k:v for k,v in old['activeChild'].items()if k!='state'},'source_supervision_drift'
assert h('/home/deploy/.pm2/dump.pm2')==old['savedSha256'] and h('/home/deploy/.pm2/dump.pm2.bak')==old['fallbackSha256'],'saved_drift'
assert json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text())==old['guard'],'guard_drift'
assert h('/etc/cron.d/re7-converta-backup')==old['backupCronSha256'],'backup_cron_drift'
assert subprocess.check_output(['crontab','-l'],text=True)==old['crontab'],'crontab_drift'
assert subprocess.check_output(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'],text=True)==old['boot'],'boot_drift'
base=json.loads((P/'active-base.config.private.cjs').read_text().split('module.exports = ',1)[1].rstrip(';\n'))
assert base['apps'][0]['cwd']==run['release'] and base['apps'][0]['script']==run['entry'] and base['apps'][0]['args']==run['args'],'base_identity'
for label in ['candidate','return']:
 cfg=json.loads(json.dumps(base));a=cfg['apps'][0];release=str(T) if label=='candidate' else run['release'];a['cwd']=release;a['script']=str(Path(release)/'node_modules/next/dist/bin/next')
 c=P/(label+'.ecosystem.config.cjs');assert not c.exists();c.write_text('module.exports = '+json.dumps(cfg)+';\n');c.chmod(0o600)
write('runtime.private.json',{'processes':expect});write('daemon.private.json',{'pid':daemon['pid'],'ticks':daemon['ticks']})
write('saved.preparation.private.json',old['saved']);write('fallback.preparation.private.json',old['fallback'])
write('source-read.preparation.private.json',{'control':front['pm2_env']['RE7_FRONT_CONTROL'],'run':run,'child':child})
for label in ['candidate','return']:g.init_run(label)
windowOld=old['activePolicyBinding'];policy=json.loads(json.dumps(windowOld['policy']));policy['bootId']=g.BOOT_ID.read_text().strip();policy['daemon']={'pid':daemon['pid'],'ticks':daemon['ticks']}
policy['roles']={label:{'release':r['release'],'entry':r['entry'],'nonce':r['nonce'],'capture':str(P/(label+'-tree.private.json'))} for label,r in [('source',run),('candidate',g.run_from('candidate')),('return',g.run_from('return'))]}
write('installed-policy-reference.private.json',windowOld);write('observer-policy.private.json',policy)
write('socket-observer-binding.private.json',{'policy':policy,'policySha256':h(P/'observer-policy.private.json'),'helperSha256':windowOld['helperSha256']})
permanentOld=json.loads((P/'permanent-installed-binding.private.json').read_text());pv=json.loads(json.dumps(permanentOld['policy']))
pv['roles']={label:{k:r[k] for k in ['release','entry','entrySha256','buildId']} for label,r in [('source',run),('candidate',g.run_from('candidate')),('return',g.run_from('return'))]}
write('permanent-policy.proposed.private.json',pv);write('permanent-observer-binding.private.json',{'policy':pv,'policySha256':h(P/'permanent-policy.proposed.private.json'),'helperSha256':permanentOld['helperSha256']})
assert h('/usr/local/libexec/re7/frontend-socket-observer.py')==windowOld['helperSha256'];assert h('/usr/local/libexec/re7/frontend-permanent-observer.py')==permanentOld['helperSha256']
# Keep the installed reader/policies and active launcher's bindings intact.
# A future policy installation and live preflight are separate authorized steps.
write('preparation-result.private.json',{'at':time.time(),'package':verify,'tarSha256':SHA,'manifestSha256':M,'candidate':str(T),'return':run['release'],'controlPreserved':front['pm2_env']['RE7_FRONT_CONTROL'],'windowPolicySha256':h(P/'observer-policy.private.json'),'windowOldSha256':windowOld['policySha256'],'permanentPolicySha256':h(P/'permanent-policy.proposed.private.json'),'permanentOldSha256':permanentOld['policySha256'],'processes':expect,'guard':{k:old['guard'][k] for k in ['open','generation','tasks']},'executionAuthorized':False,'candidatesStarted':False,'policiesInstalled':False})
assert (P/'execution-authorized').read_text().strip()=='false'
assert not list(P.glob('start-*.intent')) and not list(P.glob('*-tree.private.json'))
for x in P.iterdir():
 if x.is_file() and x.name.endswith('.private.json'):x.chmod(0o600)
print('REMOTE_ARTIFACT_BINDINGS_AND_CONTROLS_PASS_GATES_FALSE')
