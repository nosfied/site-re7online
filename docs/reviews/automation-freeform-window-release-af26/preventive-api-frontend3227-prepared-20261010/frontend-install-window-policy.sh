#!/bin/bash
set -euo pipefail
# PREPARATION ONLY: execute only after specific policy-installation authorization.
P=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-after-preventive-env-v2-20261011T002421Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
S=/etc/sudoers.d/re7-frontend-socket-observer
A=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-preventive-3227-002421.json
exec 9>"$P/window.lock"
flock -n 9
test "$(sha256sum "$H" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121
(cd "$P" && sha256sum -c scripts.sha256 && sha256sum -c bindings.sha256)
python3 "$P/check-preparation.py"
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 6087f980ed58f084294f77dbca688c5cba9b39229d3c2b10daa35732ff74f7d4
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
test "$(sha256sum /usr/local/libexec/re7/frontend-permanent-observer.py | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
test "$(sudo sha256sum /usr/local/libexec/re7/frontend-permanent-observer-policy.json | cut -d' ' -f1)" = 24a78e7ebb6e92b56a6719a7234631ed11b8e93b657665817b6905a16a00add3
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = 6087f980ed58f084294f77dbca688c5cba9b39229d3c2b10daa35732ff74f7d4
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
sudo -l -- /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
python3 "$P/verify-package.py" /opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front 32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60
python3 "$P/verify-return.py" /opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8 378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf
python3 "$P/check-css.py" /opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front
python3 "$P/frontend-action.py" before
test "$(cat "$P/execution-authorized")" = false
test ! -e "$P/source-tree.preparatory.private.json" && test ! -L "$P/source-tree.preparatory.private.json"
mv -T "$P/source-tree.private.json" "$P/source-tree.preparatory.private.json"
printf 'POLICY_INSTALLATION_AND_PREPARATORY_PREFLIGHT_PASS_NO_WINDOW\n'
