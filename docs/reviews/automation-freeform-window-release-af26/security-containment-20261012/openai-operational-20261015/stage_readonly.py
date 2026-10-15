"""Inactive extraction and actual read-only checks. No provider/policy/gates/control calls."""
import hashlib,json,os,stat,subprocess,tarfile
from pathlib import Path
os.umask(0o077)
Q=Path('/dev/shm/re7-openai-v4-inactive-20261015T203000Z')
GEN='incident-6683-v4-security-openai-v4-20261015T203000Z'
BASE=Path('/opt/re7online/backups/converta-persistent/preparations');P=BASE/GEN
assert hashlib.sha256((Q/'openai-v4.private.tar').read_bytes()).hexdigest()=='0e87d1e538fa9b351cc1da66d1f6e75e86f7d01b8c588a407fccbc512e7fa5ae'
assert hashlib.sha256((Q/'package-v4-index.private.json').read_bytes()).hexdigest()=='1e1a601b4f6212b24351bb89ad70ea7ca3bdfba763d1a5db2e02a7cc7ee626a6'
assert not P.exists()and not P.is_symlink(),'generation_already_exists'
index=json.loads((Q/'package-v4-index.private.json').read_text())
with tarfile.open(Q/'openai-v4.private.tar')as t:
 for m in t.getmembers():
  n=Path(m.name);assert not n.is_absolute()and '..'not in n.parts and n.parts[0]==GEN and(m.isfile()or m.isdir()),'archive_member_denied'
 t.extractall(BASE,filter='data')
actual={str(f.relative_to(P)):hashlib.sha256(f.read_bytes()).hexdigest()for f in P.rglob('*')if f.is_file()}
assert actual==index['files'],'extraction_bytes_or_population_drift'
for f in P.rglob('*'):
 s=f.lstat();assert not f.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==(0o700 if f.is_dir()else 0o600),'extraction_owner_mode'
with(Q/'checker.stdout.private').open('x')as out,(Q/'checker.stderr.private').open('x')as err:r=subprocess.run(['python3','-B',str(P/'verify-package.py')],stdout=out,stderr=err,timeout=60)
assert r.returncode==0,'concrete_live_checker_denied'
with(Q/'current.stdout.private').open('x')as out,(Q/'current.stderr.private').open('x')as err:r=subprocess.run(['python3','-B',str(P/'window/check_current.py'),str(P),'before'],stdout=out,stderr=err,timeout=90)
assert r.returncode==0,'current_readonly_chain_denied'
result=json.loads((Q/'current.stdout.private').read_text());result.update(inactiveExtractionVerifiedFiles=len(actual),actualLiveCheckerPassed=True,policyInstalled=False,gatesAdmitted=False,providerCalls=0,activation=False,credentialRevocation=False,restart=False)
(Q/'result.sanitized.json').write_text(json.dumps(result,sort_keys=True)+'\n');print(json.dumps(result,sort_keys=True))
