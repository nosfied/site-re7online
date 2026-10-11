from pathlib import Path
import hashlib,json,time,subprocess,fcntl
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert (P/'staging-result.private.json').exists()
lock=(P/'window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (P/'execution-authorized').read_text().strip()=='false'
newh=h(P/'observer.py');newq=h(P/'observer-policy.private.json')
installer='''#!/bin/bash
set -euo pipefail
umask 077
P=__P__
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
S=/etc/sudoers.d/re7-frontend-socket-observer
HA=/usr/local/libexec/re7/frontend-socket-observer.pre-observation-v2-101500.py
QA=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-observation-v2-101500.json
exec 9>"$P/window.lock"
flock -n 9
(cd "$P" && sha256sum -c scripts.sha256 && sha256sum -c bindings.sha256)
python3 "$P/check-preparation.py" --proposed-observer
test "$(sha256sum "$P/observer.py" | cut -d' ' -f1)" = __H__
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = __Q__
sudo test ! -e "$HA" && sudo test ! -L "$HA"
sudo test ! -e "$QA" && sudo test ! -L "$QA"
sudo test "$(sudo sha256sum "$H" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121
sudo test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
sudo test "$(sudo sha256sum /usr/local/libexec/re7/frontend-permanent-observer-policy.json | cut -d' ' -f1)" = ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83
sudo /usr/bin/python3 -I -S - <<'CHECK'
import os,stat
from pathlib import Path
for name in ['/usr/local/libexec/re7/frontend-socket-observer.py','/usr/local/libexec/re7/frontend-socket-observer-policy.json','/etc/sudoers.d/re7-frontend-socket-observer']:
 p=Path(name)
 for x in [p,*p.parents]:
  s=x.lstat();assert s.st_uid==0 and not stat.S_ISLNK(s.st_mode) and not s.st_mode&0o022,'unsafe_chain'
 expected=0o440 if name.startswith('/etc/') else 0o600 if name.endswith('.json') else 0o644
 assert stat.S_IMODE(p.stat().st_mode)==expected,'mode_drift'
CHECK
sudo visudo -c
sudo install -o root -g root -m 0644 "$H" "$HA"
sudo install -o root -g root -m 0600 "$Q" "$QA"
sudo install -o root -g root -m 0644 "$P/observer.py" "$H"
sudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"
sudo test "$(sudo sha256sum "$H" | cut -d' ' -f1)" = __H__
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = __Q__
sudo test "$(sudo sha256sum "$HA" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
sudo test "$(sudo sha256sum "$QA" | cut -d' ' -f1)" = c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121
sudo test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
sudo stat -c '%U %G %a %n' "$H" "$Q" "$HA" "$QA" "$S"
sudo namei -l "$H" "$Q"
sudo visudo -c
sudo -l -- /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
python3 "$P/check-preparation.py"
python3 "$P/run-preparatory-preflight.py"
printf 'DIAGNOSTIC_HELPER_POLICY_INSTALLED_PREFLIGHT_PASS_GATES_FALSE\\n'
'''.replace('__P__',str(P)).replace('__H__',newh).replace('__Q__',newq)
f=P/'install-observer-window-policy.sh';assert not f.exists();f.write_text(installer);f.chmod(0o600)
# Preserve operational configuration bytes off-host; no production dump mutation.
for n,s in [('saved-operational.private.json','/home/deploy/.pm2/dump.pm2'),('fallback-operational.private.json','/home/deploy/.pm2/dump.pm2.bak')]:
 f=P/n;assert not f.exists();f.write_bytes(Path(s).read_bytes());f.chmod(0o600)
scripts=sorted(f for f in P.iterdir()if f.is_file()and (f.suffix in ['.py','.cjs','.sh'] or f.name=='WINDOW-STEPS.txt') and '.private.' not in f.name and '.ecosystem.' not in f.name and '.tracked.' not in f.name)
bindings=sorted(f for f in P.iterdir()if f.is_file()and ('.private.' in f.name or '.ecosystem.' in f.name or '.tracked.' in f.name or f.name=='execution-authorized')and f.name not in ['normal-preflight-installation-required.private.json','baseline-two-samples.private.json','staging-result.private.json'])
for name,fs in [('scripts.sha256',scripts),('bindings.sha256',bindings)]:
 f=P/name;assert not f.exists();f.write_text(''.join(h(x)+'  '+x.name+'\n'for x in fs));f.chmod(0o600)
subprocess.run(['bash','-n',str(P/'install-observer-window-policy.sh')],check=True)
subprocess.run(['python3',str(P/'check-preparation.py'),'--proposed-observer'],check=True,timeout=30)
print(json.dumps({'result':'STAGING_FINALIZED_NO_INSTALLATION','at':time.time(),'helperSha256':newh,'windowPolicySha256':newq,'installerSha256':h(P/'install-observer-window-policy.sh'),'scriptsSha256':h(P/'scripts.sha256'),'bindingsSha256':h(P/'bindings.sha256'),'executionAuthorized':False}))
