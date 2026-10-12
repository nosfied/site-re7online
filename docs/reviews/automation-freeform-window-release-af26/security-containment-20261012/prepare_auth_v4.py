"""Preparation-only new V4 generation, same functional bytes, three new auth values. No installation/control."""
from pathlib import Path
import copy,datetime,fcntl,hashlib,json,os,shutil,subprocess,sys
from saved_reference_capture import capture_pair
os.umask(0o077)
BASE=Path('/opt/re7online/backups/converta-persistent/preparations')
O=BASE/'incident-6683-v4-dynamic-compatible-20261012T184200Z'
P=BASE/'incident-6683-v4-security-auth-v2-20261012T223100Z';W=P/'window'
INPUT=Path('/dev/shm/re7-security-auth-values-20261012.private.json')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True,separators=(',',':'));f.write('\n')
lock=(BASE/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not P.exists()and not P.is_symlink(),'generation_exists'
assert (O/'execution-authorized').read_text().strip()=='false'
assert all(x is False for x in json.loads((O/'window/execution-gates.private.json').read_text()).values())
sys.path.insert(0,str(O/'window'));from sequencer import Bridge
assert json.loads(Bridge(O).privileged('inspect'))=={'policySha256':'a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e','phase':None,'sourceProcessesAlive':True}
subprocess.run(['python3',str(O/'verify-package.py')],check=True,stdout=subprocess.DEVNULL)
new=json.loads(INPUT.read_text());keys=('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN');assert set(new)==set(keys)and all(isinstance(x,str)and len(x)>=32 for x in new.values())
source=json.loads((O/'switch/return.config.private.json').read_text());target=json.loads((O/'switch/candidate.config.private.json').read_text());old=next(a['env']for a in source['apps']if a['name']=='re7-whatsapp-agent')
returned=copy.deepcopy(source)
for config in [target,returned]:
 for a in config['apps']:
  for k in keys:
   if k in a['env']:
    assert a['env'][k]==old[k]and new[k]!=old[k],'auth_consumer_drift_or_old_value';a['env'][k]=new[k]
 assert next(a for a in config['apps']if a['name']=='re7-admin-front')==next(a for a in source['apps']if a['name']=='re7-admin-front')
P.mkdir(mode=0o700);W.mkdir(mode=0o700)
put(W/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']});(P/'execution-authorized').write_text('false\n')
wm=json.loads((O/'window/sequencer-manifest.json').read_text());skip={'initial.private.json','privileged-policy.private.json','privileged-policy.sha256','mode-manifest-v4.json','preserved-frontend-config.private.json','mode-names.private.json','execution-gates.private.json','sequencer-manifest.json'}
skip.update({'saved-dump.pm2.private.json','saved-dump.pm2.bak.private.json'})
for name,digest in wm['filesSha256'].items():
 f=O/'window'/name;assert h(f)==digest,'source_manifest_drift'
 if name not in skip:(W/name).write_bytes(f.read_bytes().replace(str(O).encode(),str(P).encode()))
# New generations must preserve real references; never repair an existing denied preparation.
capture_pair([Path('/home/deploy/.pm2/dump.pm2'),Path('/home/deploy/.pm2/dump.pm2.bak')],
             [W/'saved-dump.pm2.private.json',W/'saved-dump.pm2.bak.private.json'])
# The existing closure certificate is durable historical evidence, not an exit proof or nonce.
assert not (W/'closure-verified.private.json').exists();shutil.copyfile(O/'window/closure-verified.private.json',W/'closure-verified.private.json')
from baseline_contract import capture_operational,capture_functional,validate_preparation
from ecosystem_contract import generate_mode
initial=capture_operational(lambda:json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text()),lambda args:subprocess.check_output(args,text=True,timeout=15));assert initial['guard']['generation']==38 and initial['guard']['open']is False;put(W/'initial.private.json',initial)
query=subprocess.check_output(['/usr/bin/node','-e','process.stdout.write(require(process.argv[1]).sql)',str(O/'switch/preparation-bindings.cjs')],text=True,timeout=10)
raw=subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';SET LOCAL TIME ZONE 'UTC';"+query+';ROLLBACK;'],text=True,timeout=15)
subprocess.run(['/usr/bin/node','-e',"require(process.argv[1]).noWork(JSON.parse(require('fs').readFileSync(0,'utf8')))",str(O/'switch/preparation-bindings.cjs')],input=raw,text=True,check=True,timeout=15)
front=next(a for a in source['apps']if a['name']=='re7-admin-front');functional=capture_functional(json.loads(raw),front['cwd']);put(W/'preserved-frontend-config.private.json',front)
modefiles={}
for mode in ['switch','return','return-partial']:
 d=P/mode;d.mkdir(mode=0o700);names=[l.split('  ',1)[1]for l in(O/mode/'scripts.sha256').read_text().splitlines()];assert len(names)==29
 for n in names:
  if n not in ['baseline.private.json','candidate.config.private.json','return.config.private.json','candidate.ecosystem.config.cjs','return.ecosystem.config.cjs']:(d/n).write_bytes((O/mode/n).read_bytes().replace(str(O).encode(),str(P).encode()))
 put(d/'baseline.private.json',functional);put(d/'candidate.config.private.json',target if mode=='switch'else returned);put(d/'return.config.private.json',source if mode=='switch'else target);generate_mode(d)
 (d/'scripts.sha256').write_text(''.join(h(d/n)+'  '+n+'\n'for n in names));modefiles[mode]=names
put(W/'mode-names.private.json',modefiles);put(W/'mode-manifest-v4.json',{'modeFiles':{m:{n:h(P/m/n)for n in ns}for m,ns in modefiles.items()},'modeManifests':{m:h(P/m/'scripts.sha256')for m in modefiles}})
put(W/'sequencer-manifest.json',{'preparation':str(P),'status':'AUTH_ROTATION_PREPARED_FOR_REVIEW_ONLY_NOT_INSTALLED','filesSha256':{f.name:h(f)for f in W.iterdir()if f.is_file()and f.name not in ['execution-gates.private.json','mode-names.private.json']}})
for n in ['compatible-artifact.private.json','verify-package.py']:(P/n).write_bytes((O/n).read_bytes().replace(str(O).encode(),str(P).encode()))
validate_preparation(P);subprocess.run(['python3',str(W/'prepare_policy.py'),str(P)],stdout=subprocess.DEVNULL,check=True,timeout=30)
sha=(W/'privileged-policy.sha256').read_text().strip();m=json.loads((W/'sequencer-manifest.json').read_text());m['filesSha256'].update({n:h(W/n)for n in ['privileged-policy.private.json','privileged-policy.sha256']});(W/'sequencer-manifest.json').write_text(json.dumps(m,sort_keys=True)+'\n')
install=(O/'install-api-window-policy.sh').read_text().replace(str(O),str(P)).replace('a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e',sha).replace('11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c','a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e').replace('incident-6683-window-policy.pre-compatible-184200.json','incident-6683-window-policy.pre-security-auth-v2-20261012-223100.json');(P/'install-api-window-policy.sh').write_text(install)
for root,dirs,files in os.walk(P):
 for n in files:(Path(root)/n).chmod(0o600)
free=os.statvfs(BASE).f_bavail*os.statvfs(BASE).f_frsize;pgfree=int(subprocess.check_output(['docker','exec','--user','70','wa-agent-postgres','df','-B1','/var/lib/postgresql/data'],text=True,timeout=10).splitlines()[-1].split()[3]);assert min(free,pgfree)>2131755008+4194304,'auth_staging_capacity_denied'
result={'result':'AUTH_V4_PREPARED_NOT_INSTALLED_NOT_EXECUTED','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'preparation':str(P),'policySha256':sha,'installerSha256':h(P/'install-api-window-policy.sh'),'sourceInstalledPolicySha256':'a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e','modeManifests':{m:h(P/m/'scripts.sha256')for m in modefiles},'expectedLogout':True,'safeReturnUsesNewAuthValues':True,'helpersSudoersUnchanged':True,'frontendPreserved':True,'gatesFalse':True,'sourceIdentityBound':json.loads((W/'privileged-policy.private.json').read_text())['sourceProcesses'],'minimumAvailableBytes':min(free,pgfree),'backupFreshnessMustBeRenewedBeforeExecution':True,'changedRuntimeFiles':[],'pendingPhases':['external_owner_console','database_password','cipher_invalid_legacy_row']}
put(P/'prepared-security-result.private.json',result);print(json.dumps(result))
