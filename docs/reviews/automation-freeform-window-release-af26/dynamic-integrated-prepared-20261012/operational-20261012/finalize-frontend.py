from pathlib import Path
import hashlib,json,os,sys,subprocess,importlib.util,fcntl,time,shutil
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z');I=P.parent/'dynamic-integrated-input-5b3cf3af-20261012T170000Z'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (P/'execution-authorized').read_text().strip()=='false'
assert not list(P.glob('*intent*')) and not list(P.glob('*-tree.private.json'))
def write(n,v):
 with (P/n).open('x')as f:json.dump(v,f,indent=2);f.write('\n')
 (P/n).chmod(0o600)
spec=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
old=json.loads((P/'live.private.json').read_text());rows=g.rows();front=next(x for x in rows if x['name']==g.FRONT);run,child=g.supervision_live(front['pm2_env']['RE7_FRONT_CONTROL'],front)
assert run==old['activeRun'];g.core(json.loads((P/'runtime.private.json').read_text()),rows)
assert h('/home/deploy/.pm2/dump.pm2')==old['savedSha256'] and h('/home/deploy/.pm2/dump.pm2.bak')==old['fallbackSha256']
assert json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text())==old['guard']
write('origin.private.json',{'bootId':old['bootId'],'daemon':old['daemon'],'pid':front['pid'],'ticks':g.proc(front['pid'])['ticks'],'pm2ExecMode':front['pm2_env']['exec_mode'],'restartCount':front['pm2_env']['restart_time'],'sourceControl':front['pm2_env']['RE7_FRONT_CONTROL'],'sourceNonce':run['nonce'],'sourceRelease':run['release'],'sourceEntry':run['entry'],'entrySha256':run['entrySha256'],'buildId':run['buildId'],'tree':g.tree(front['pid'])})
for src,dest in [('capture-frontend-phase.py','capture-frontend-phase.py'),('frontend_phase_contract.py','frontend_phase_contract.py'),('frontend-WINDOW-STEPS.txt','WINDOW-STEPS.txt')]:shutil.copyfile(I/src,P/dest)
for name,token,policy in [('install-window-policy','WINDOW_POLICY_HASH','observer-policy.private.json'),('install-permanent-policy','PERMANENT_POLICY_HASH','permanent-policy.proposed.private.json')]:
 s=(I/(name+'.template.sh')).read_text().replace(token,h(P/policy));(P/(name+'.sh')).write_text(s)
# Never include prior captures, proofs or journals in reusable input manifests.
private=[x.name for x in P.iterdir()if x.is_file()and (x.name.endswith('.private.json')or x.name.endswith('.config.cjs')or x.name=='execution-authorized')]
scripts=[x.name for x in P.iterdir()if x.is_file()and x.suffix in ['.py','.cjs','.sh','.txt']and x.name not in private and 'before-target-fix' not in x.name]
for label,names in [('scripts',scripts),('bindings',private)]:
 with (P/(label+'.sha256')).open('x')as f:f.write(''.join(h(P/n)+'  '+n+'\n'for n in sorted(names)))
 subprocess.run(['sha256sum','-c',label+'.sha256'],cwd=P,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['python3',str(P/'check-preparation.py')],check=True)
write('prepared-result.private.json',{'at':time.time(),'gatesFalse':True,'started':False,'policiesInstalled':False,'needsPostApiPhaseCapture':True,'windowPolicySha256':h(P/'observer-policy.private.json'),'permanentPolicySha256':h(P/'permanent-policy.proposed.private.json'),'scriptsSha256':h(P/'scripts.sha256'),'bindingsSha256':h(P/'bindings.sha256'),'installWindowSha256':h(P/'install-window-policy.sh'),'installPermanentSha256':h(P/'install-permanent-policy.sh'),'checkerSha256':h(P/'frontend-check.py'),'tarSha256':'74a2ac2fcf93b32623fa2e0dfa857d1792cfd503e1f46cee09e6f94f3ca2216f','BUILD_ID':'dFvS6tFEaWQsSIIn3P702'})
for x in P.iterdir():
 if x.is_file():x.chmod(0o600)
print('FRONTEND_MANIFEST_CONFIG_POLICIES_PASS_GATES_FALSE_NO_START')
