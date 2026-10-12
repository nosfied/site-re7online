from pathlib import Path
import hashlib,json,shutil,subprocess,fcntl,os
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-compatible-20261012T184200Z');W=P/'window';I=P.parent/'dynamic-integrated-input-5b3cf3af-20261012T170000Z';O=P.parent/'incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z'
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
lock=(P.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (P/'execution-authorized').read_text().strip()=='false'and all(x is False for x in json.loads((W/'execution-gates.private.json').read_text()).values())
assert not list((P/'switch').glob('start-intent-*'))
A=P/'admin';assert not A.exists();A.mkdir(mode=0o700)
S=Path('/dev/shm/re7-dynamic-integrated-audit-20261012T133000Z');files={'input.private.json':'600ad3569fd28a9999adc2457f2f13e5f4201ebd985d232fcd94f669f8a6c0e2','reader-v2.cjs':'3abcbb95ac5a77d58b1f76d2e570a5b46b24a526e6014984bf628022b6818e13','hash.mjs':'a083d9c23ae243dab3c7a4f722cfc8f8335d61cda6683b428529da3f98a67b83'}
for n,d in files.items():assert h(S/n)==d,'original_admin_source_drift';shutil.copyfile(S/n,A/n);(A/n).chmod(0o600)
assert not(P/'certify-closure.py').exists();shutil.copyfile(I/'certify-closure.py',P/'certify-closure.py');(P/'certify-closure.py').chmod(0o600)
manifest=json.loads((O/'api-candidate-manifest.private.json').read_text());m=json.loads((P/'compatible-artifact.private.json').read_text());a=P/'artifact-check-before-full-inventory.private.json';assert not a.exists();shutil.copyfile(P/'compatible-artifact.private.json',a);m['dependencies']=manifest['dependencies'];(P/'compatible-artifact.private.json').write_text(json.dumps(m,sort_keys=True)+'\n')
old=P/'verify-package.before-full-inventory.py';assert not old.exists();shutil.copyfile(P/'verify-package.py',old)
(P/'verify-package.py').write_bytes((I/'verify-compatible-package.py').read_bytes())
subprocess.run(['python3',str(P/'verify-package.py')],check=True)
v=json.loads((P/'prepared-result.private.json').read_text());v.update(certificateDriverSha256=h(P/'certify-closure.py'),verifyPackageSha256=h(P/'verify-package.py'),adminSourceSha256=files,compatibleArtifactSha256=h(P/'compatible-artifact.private.json'),sourcePolicySha256='11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c')
(P/'prepared-result.private.json').write_text(json.dumps(v,sort_keys=True)+'\n')
print('COMPATIBLE_STANDBY_ADMIN_PROVENANCE_FULL_INVENTORY_PASS_NOT_INSTALLED')
