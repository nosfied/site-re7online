#!/bin/bash
set -euo pipefail
umask 077
P=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
S=/etc/sudoers.d/re7-frontend-socket-observer
HA=/usr/local/libexec/re7/frontend-socket-observer.pre-observation-v2-101500.py
QA=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-observation-v2-101500.json
exec 9>"$P/window.lock"
flock -n 9
(cd "$P" && sha256sum -c scripts.sha256 && sha256sum -c bindings.sha256)
python3 "$P/check-preparation.py" --proposed-observer
test "$(sha256sum "$P/observer.py" | cut -d' ' -f1)" = c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = 7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472
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
sudo test "$(sudo sha256sum "$H" | cut -d' ' -f1)" = c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472
sudo test "$(sudo sha256sum "$HA" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
sudo test "$(sudo sha256sum "$QA" | cut -d' ' -f1)" = c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121
sudo test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
sudo stat -c '%U %G %a %n' "$H" "$Q" "$HA" "$QA" "$S"
sudo namei -l "$H" "$Q"
sudo visudo -c
sudo -l -- /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
python3 "$P/check-preparation.py"
python3 "$P/run-preparatory-preflight.py"
printf 'DIAGNOSTIC_HELPER_POLICY_INSTALLED_PREFLIGHT_PASS_GATES_FALSE\n'
