"""Preparation only: compatible API standby; no install/start/cancel/provider."""
from pathlib import Path
import os,json,hashlib,subprocess,shutil,fcntl,sys,datetime
os.umask(0o077)
BASE=Path('/opt/re7online/backups/converta-persistent/preparations')
O=BASE/'incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z';F=BASE/'frontend-dynamic-5b3cf3af-20261012T170000Z'
P=BASE/'incident-6683-v4-dynamic-compatible-20261012T184200Z';W=P/'window';I=BASE/'dynamic-integrated-input-5b3cf3af-20261012T170000Z'
COMPAT='/opt/re7online/releases/campaign-dynamic-compatible-return-5b3cf3af-20261012T170000Z/apps/whatsapp-agent'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 assert not p.exists() and not p.is_symlink(),'destination_exists:'+str(p)
 p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n');p.chmod(0o600)
lock=(BASE/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not P.exists() and not P.is_symlink(),'generation_exists'
assert (F/'execution-authorized').read_text().strip()=='false'
assert all(v is False for v in json.loads((O/'window/execution-gates.private.json').read_text()).values())
subprocess.run(['python3',str(F/'frontend-check.py'),'supervised-candidate'],check=True,stdout=subprocess.DEVNULL)
manifest=json.loads((O/'api-candidate-manifest.private.json').read_text());assert manifest['candidate']=='/opt/re7online/releases/campaign-dynamic-5b3cf3af-20261012T170000Z/apps/whatsapp-agent'
for f in manifest['files']:
 assert h(Path(manifest['candidate'])/f['path'])==f['sha256'] and h(Path(COMPAT)/f['path'])==f['sha256'],'compatible_bytes_drift'
for f in manifest['symlinks']:
 assert (Path(COMPAT)/f['path']).is_symlink() and (Path(COMPAT)/f['path']).resolve()==(Path(manifest['candidate'])/f['path']).resolve(),'compatible_link_drift'
free=os.statvfs(BASE).f_bavail*os.statvfs(BASE).f_frsize
pgfree=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True).splitlines()[-1].split()[3]);assert min(free,pgfree)-4194304>=2131755008,'standby_capacity_denied'
rows={r['name']:r for r in json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist']))};assert set(rows)=={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'}
source=json.loads((O/'switch/candidate.config.private.json').read_text())
sys.path.insert(0,str(I));from preserved_frontend_environment import capture
front=next(a for a in source['apps']if a['name']=='re7-admin-front');r=rows[front['name']];e=r['pm2_env']
front.update(cwd=e['pm_cwd'],script=e['pm_exec_path'],interpreter=e['exec_interpreter'],env=capture(r),args=e.get('args')or[],node_args=e.get('node_args')or[],instances=e['instances'],watch=e['watch'],namespace=e['namespace'],autorestart=e['autorestart'],stop_exit_codes=e.get('stop_exit_codes')or[])
assert front['cwd']=='/opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z' and front['script']==str(F/'launcher.cjs')
sys.path.insert(0,str(O/'switch'));import ops
for a in source['apps']:ops.Operations(O/'switch',ops.System()).config(rows[a['name']],a)
P.mkdir(mode=0o700);W.mkdir(mode=0o700)
wm=json.loads((O/'window/sequencer-manifest.json').read_text())
skip={'initial.private.json','privileged-policy.private.json','privileged-policy.sha256','mode-manifest-v4.json','preserved-frontend-config.private.json','path-bindings.private.json'}
for n,digest in wm['filesSha256'].items():
 assert h(O/'window'/n)==digest,'origin_manifest_drift:'+n
 if n not in skip:(W/n).write_bytes((O/'window'/n).read_bytes().replace(str(O).encode(),str(P).encode()))
assert h('/usr/local/libexec/re7/incident-6683-window-control.py')==h(W/'privileged.py')=='8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'
guard=json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text());assert guard['open']is False and guard['generation']==38 and guard['tasks']=={}
assert not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+s)for s in ['.lock','.uncertain'])
from baseline_contract import capture_operational,capture_functional,validate_preparation
from ecosystem_contract import generate_mode
initial=capture_operational(lambda:json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text()),lambda args:subprocess.check_output(args,text=True,timeout=15));put(W/'initial.private.json',initial)
stmt=subprocess.check_output(['/usr/bin/node','-e','process.stdout.write(require(process.argv[1]).sql)',str(O/'switch/preparation-bindings.cjs')],text=True)
raw=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SET LOCAL TIME ZONE 'UTC';"+stmt+';ROLLBACK;'],text=True,timeout=15);q=json.loads(raw)
subprocess.run(['/usr/bin/node','-e',"require(process.argv[1]).noWork(JSON.parse(require('fs').readFileSync(0,'utf8')))",str(O/'switch/preparation-bindings.cjs')],input=raw,text=True,check=True,timeout=15)
put(W/'observed-before-closure.private.json',q)
expected=json.loads((W/'waiting-work.private.json').read_text());(W/'waiting-work.private.json').rename(W/'waiting-work.before-closure.private.json')
expected.update(expectedLifecycle='after_approved_canonical_cancel',closurePlanHash='ce1afa3887e934bb505c385f0509c47c38dbd0468445be453cde000636e9194f')
s=expected['scope'];expected['jobs']=[x for x in expected['jobs']if x['id']!=s['jobId']];expected['groups']=[x for x in expected['groups']if x['id']!=s['batchId']];expected['sendingScheduled']=[x for x in expected['sendingScheduled']if x['id']not in s['campaignIds']]
put(W/'waiting-work.private.json',expected)
put(W/'preserved-frontend-config.private.json',front)
target=json.loads(json.dumps(source));a=next(a for a in target['apps']if a['name']=='re7-whatsapp-agent');a.update(cwd=COMPAT,script=COMPAT+'/dist/index.js')
paths={str(Path(a['cwd'])/'.data'):str((Path(a['cwd'])/'.data').resolve())for cfg in [source,target]for a in cfg['apps']if a['name']!='re7-admin-front'};assert all(Path(x).is_symlink()and Path(x).exists()for x in paths);put(W/'path-bindings.private.json',paths)
functional=capture_functional(q,front['cwd']);names=[x.split('  ',1)[1]for x in(O/'switch/scripts.sha256').read_text().splitlines()];assert len(names)==28
modefiles={}
for mode in ['switch','return','return-partial']:
 d=P/mode;d.mkdir(mode=0o700)
 for n in names:
  if n not in ['candidate.config.private.json','return.config.private.json','candidate.ecosystem.config.cjs','return.ecosystem.config.cjs','baseline.private.json','waiting-work.cjs']:(d/n).write_bytes((O/mode/n).read_bytes().replace(str(O).encode(),str(P).encode()))
 for variant,cfg in [('candidate',target if mode=='switch'else source),('return',source if mode=='switch'else target)]:put(d/(variant+'.config.private.json'),cfg)
 put(d/'baseline.private.json',functional)
 (d/'waiting-work-frozen.cjs').write_bytes((O/mode/'waiting-work.cjs').read_bytes());(d/'waiting-work.cjs').write_bytes((I/'closed-waiting-work.cjs').read_bytes())
 generate_mode(d);modefiles[mode]=names+['waiting-work-frozen.cjs']
 (d/'scripts.sha256').write_text(''.join(h(d/n)+'  '+n+'\n'for n in modefiles[mode]));subprocess.run(['sha256sum','-c','scripts.sha256'],cwd=d,check=True,stdout=subprocess.DEVNULL)
put(W/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']});(P/'execution-authorized').write_text('false\n')
put(W/'mode-names.private.json',modefiles);put(W/'mode-manifest-v4.json',{'modeFiles':{m:{n:h(P/m/n)for n in ns}for m,ns in modefiles.items()},'modeManifests':{m:h(P/m/'scripts.sha256')for m in modefiles}})
put(W/'sequencer-manifest.json',{'preparation':str(P),'status':'COMPATIBLE_POST_CLOSURE_STANDBY_GATES_FALSE_NOT_INSTALLED','filesSha256':{x.name:h(x)for x in W.iterdir()if x.is_file()and x.name not in ['execution-gates.private.json','mode-names.private.json']}})
validate_preparation(P)
subprocess.run(['python3',str(W/'prepare_policy.py'),str(P)],check=True,stdout=subprocess.DEVNULL)
sha=(W/'privileged-policy.sha256').read_text().strip()
x=json.loads((W/'sequencer-manifest.json').read_text());x['filesSha256'].update({n:h(W/n)for n in ['privileged-policy.private.json','privileged-policy.sha256']});(W/'sequencer-manifest.json').write_text(json.dumps(x,sort_keys=True,separators=(',',':'))+'\n')
installer=(O/'install-api-window-policy.sh').read_text().replace(str(O),str(P)).replace('11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c',sha).replace('620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f','11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c').replace('incident-6683-window-policy.pre-dynamic-5b3cf3af-170000.json','incident-6683-window-policy.pre-compatible-184200.json')
# Package checker is fully shared: all same bytes, plus current new frontend preserved.
(P/'verify-package.py').write_text("from pathlib import Path\nimport json,hashlib,os\nP=Path("+repr(str(P))+" )\nv=json.loads((P/'compatible-artifact.private.json').read_text());h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()\nfor root in v['roots']:\n for f in v['files']:assert h(Path(root)/f['path'])==f['sha256'],'compatible_byte_drift'\n for f in v['symlinks']:assert(Path(root)/f['path']).is_symlink()and str((Path(root)/f['path']).resolve())==f['resolved'],'compatible_link_drift'\nprint('COMPATIBLE_API_BYTES_PRESERVED')\n")
put(P/'compatible-artifact.private.json',{'roots':[manifest['candidate'],COMPAT],'files':manifest['files'],'symlinks':manifest['symlinks']})
(P/'install-api-window-policy.sh').write_text(installer)
put(P/'prepared-result.private.json',{'status':'POST_CLOSURE_STANDBY_PREPARED_NOT_INSTALLED_NOT_EXECUTABLE_BEFORE_VERIFIED_CLOSURE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'policySha256':sha,'helperSha256':h(W/'privileged.py'),'sequencerSha256':h(W/'sequencer.py'),'sequencerManifestSha256':h(W/'sequencer-manifest.json'),'modeManifests':{m:h(P/m/'scripts.sha256')for m in modefiles},'installSha256':h(P/'install-api-window-policy.sh'),'sourceInstalledPolicySha256':'11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c','sourceProcesses':json.loads((W/'privileged-policy.private.json').read_text())['sourceProcesses'],'sourceFrontend':front['cwd'],'targetCompatibleApi':COMPAT,'beforeClosureObservedFrozen':True,'requiresFreshClosureCertificate':True,'closurePlanHash':expected['closurePlanHash'],'gatesFalse':True,'intentCount':0,'started':False,'policyInstalled':False,'availableMinimumBytes':min(free,pgfree)})
for d,dirs,ns in os.walk(P):
 for n in ns:
  if not(Path(d)/n).is_symlink():(Path(d)/n).chmod(0o600)
print('COMPATIBLE_POLICY_CONFIG_MANIFESTS_SOURCE_IDENTITIES_PASS_GATES_FALSE_NO_INSTALL_NO_START')
