#!/bin/bash
set -euo pipefail
# PREPARATION ONLY: execute only after specific policy-installation authorization.
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-css-supervision-20261007T224500Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
S=/etc/sudoers.d/re7-frontend-socket-observer
A=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-css-supervision-224500.json
exec 9>"$P/window.lock"
flock -n 9
test "$(sha256sum "$H" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = 10fa212214393d10b5263889f6a54ea850aa489950af3cbfe8f72669728bbb51
(cd "$P" && sha256sum -c scripts.sha256 && sha256sum -c bindings.sha256)
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 10fa212214393d10b5263889f6a54ea850aa489950af3cbfe8f72669728bbb51
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
sudo -l -- /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
python3 "$P/verify-package.py" /opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8 378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf
python3 "$P/verify-return.py" /opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba
python3 "$P/check-css.py" /opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8
python3 "$P/frontend-action.py" before
test "$(cat "$P/execution-authorized")" = false
test ! -e "$P/source-tree.preparatory.private.json" && test ! -L "$P/source-tree.preparatory.private.json"
mv -T "$P/source-tree.private.json" "$P/source-tree.preparatory.private.json"
printf 'POLICY_INSTALLATION_AND_PREPARATORY_PREFLIGHT_PASS_NO_WINDOW\n'
