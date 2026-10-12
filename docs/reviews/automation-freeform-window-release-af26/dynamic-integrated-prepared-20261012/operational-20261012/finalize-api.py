from pathlib import Path
import json,hashlib,shutil,subprocess,sys,os,fcntl,datetime
os.umask(0o077)
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z');W=P/'window'
OLD=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z');IN=Path('/opt/re7online/backups/converta-persistent/preparations/dynamic-integrated-input-5b3cf3af-20261012T170000Z')
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
put=lambda p,v:p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n')
assert all(x is False for x in json.loads((W/'execution-gates.private.json').read_text()).values())
assert not any(list((P/m).glob(p))for m in ['switch','return','return-partial']for p in ['owner-*','start-intent-*','started-*','old-exit-*'])
for n in ['backup-manifest.private.json','restore-result.json']:assert not(W/n).exists();shutil.copyfile(IN/n,W/n)
b=json.loads((W/'backup-manifest.private.json').read_text());r=json.loads((W/'restore-result.json').read_text());assert r['result']=='PASS'and r['temporaryDatabaseRemoved']and r['dumpSha256']==b['files']['database.dump']['sha256'] and r['providerCalls']==0
proof={'backupManifestSha256':h(W/'backup-manifest.private.json'),'restoreResultSha256':h(W/'restore-result.json'),'dumpSha256':r['dumpSha256'],'dumpBytes':r['dumpBytes'],'catalogObjects':b['catalogObjects']}
modefiles=json.loads((W/'mode-names.private.json').read_text());modehashes={};filehashes={}
for mode,names in modefiles.items():
 d=P/mode;assert not(d/'backup-manifest.json').exists()and not(d/'proof-bindings.private.json').exists();shutil.copyfile(W/'backup-manifest.private.json',d/'backup-manifest.json');put(d/'proof-bindings.private.json',proof)
 (d/'scripts.sha256').write_text(''.join(h(d/n)+'  '+n+'\n'for n in names));subprocess.run(['sha256sum','-c','scripts.sha256'],cwd=d,check=True,stdout=subprocess.DEVNULL);modehashes[mode]=h(d/'scripts.sha256');filehashes[mode]={n:h(d/n)for n in names}
put(W/'mode-manifest-v4.json',{'modeFiles':filehashes,'modeManifests':modehashes,'preparation':P.name})
put(W/'sequencer-manifest.json',{'preparation':str(P),'status':'PREPARED_GATES_FALSE_NOT_INSTALLED','filesSha256':{p.name:h(p)for p in W.iterdir()if p.is_file()and p.name not in ['execution-gates.private.json','sequencer-manifest.json','mode-names.private.json']}})
sys.path.insert(0,str(W));from baseline_contract import validate_preparation
validate_preparation(P)
subprocess.run(['python3',str(W/'prepare_policy.py'),str(P)],check=True,stdout=subprocess.DEVNULL)
policyhash=(W/'privileged-policy.sha256').read_text().strip();assert h(W/'privileged.py')==h('/usr/local/libexec/re7/incident-6683-window-control.py')=='8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'
# Root policy is unchanged in this preparation. Future installer reconfirms its
# full bytes using owner sudo; deploy cannot independently read root600/sudoers.
installed=(OLD/'window/privileged-policy.sha256').read_text().strip();assert installed=='620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f'
archive='/usr/local/libexec/re7/incident-6683-window-policy.pre-dynamic-5b3cf3af-170000.json'
s=(OLD/'install-api-window-policy.sh').read_text().replace(str(OLD),str(P)).replace('620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f',policyhash).replace('d3bd2043dfe56354165938075f03f6f180bf085b139b34f9c5abfd42adb4b6f7',installed).replace('/usr/local/libexec/re7/incident-6683-window-policy.pre-result-truth-2ed9dccc-184000.json',archive)
s=s.replace('exec 9>"$P/preparation-install.lock"','exec 9>"$P/../.incident-6683-window.lock"')
s=s.replace('test "$(cat "$P/execution-authorized")" = false','test "$(cat "$P/execution-authorized")" = false\npython3 "$P/verify-package.py"')
(P/'install-api-window-policy.sh').write_text(s)
post=(OLD/'install-post-unfence-return-policy.sh').read_text().replace(str(OLD),str(P)).replace(installed,policyhash).replace('incident-6683-v4-return-result-truth-20261011T184000Z','incident-6683-v4-return-dynamic-20261012T170000Z').replace('incident-6683-window-policy.failed-result-truth-2ed9dccc-184000.json','incident-6683-window-policy.failed-dynamic-5b3cf3af-170000.json');(P/'install-post-unfence-return-policy.sh').write_text(post)
shutil.copyfile(IN/'verify-api-package.py',P/'verify-package.py');(P/'api-candidate-manifest.sha256').write_text(h(P/'api-candidate-manifest.private.json')+'\n')
subprocess.run(['python3',str(P/'verify-package.py')],check=True)
# Include generated policy and refreshed manifests as inputs, never journal/proofs.
sm=json.loads((W/'sequencer-manifest.json').read_text());sm['filesSha256'].update({n:h(W/n)for n in ['privileged-policy.private.json','privileged-policy.sha256']});put(W/'sequencer-manifest.json',sm)
meta={'preparation':str(P),'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PREPARED_FOR_REVIEW_NOT_INSTALLED_NOT_DEPLOYED','policySha256':policyhash,'sourceInstalledPolicyExpectedSha256':installed,'installedPolicyCurrentHashRequiresOwnerSudo':True,'helperSha256':h(W/'privileged.py'),'sequencerSha256':h(W/'sequencer.py'),'sequencerManifestSha256':h(W/'sequencer-manifest.json'),'modeManifests':modehashes,'modeFiles':filehashes,'installApiPolicySha256':h(P/'install-api-window-policy.sh'),'postUnfenceInstallerSha256':h(P/'install-post-unfence-return-policy.sh'),'apiManifestSha256':h(P/'api-candidate-manifest.private.json'),'verifyPackageSha256':h(P/'verify-package.py'),'backupManifestSha256':h(W/'backup-manifest.private.json'),'restoreResultSha256':h(W/'restore-result.json'),'gatesFalse':True,'noIntentsOrCertificates':True}
put(P/'prepared-result.private.json',meta)
for d,ds,ns in os.walk(P):
 for n in ns:
  f=Path(d)/n
  if not f.is_symlink():f.chmod(0o600)
print(json.dumps({k:v for k,v in meta.items()if k!='modeFiles'}))
