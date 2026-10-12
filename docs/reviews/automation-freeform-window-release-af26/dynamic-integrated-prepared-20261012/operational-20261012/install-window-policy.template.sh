#!/bin/bash
set -euo pipefail
# PREPARATION ONLY: execute only after specific policy-installation authorization.
P=/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
S=/etc/sudoers.d/re7-frontend-socket-observer
A=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-dynamic-5b3cf3af-170000.json
exec 9>"$P/window.lock"
flock -n 9
test "$(sha256sum "$H" | cut -d' ' -f1)" = c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = WINDOW_POLICY_HASH
(cd "$P" && sha256sum -c scripts.sha256 && sha256sum -c bindings.sha256)
test -f "$P/phase-after-api-complete.private.json"
python3 "$P/check-preparation.py"
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
test "$(sha256sum /usr/local/libexec/re7/frontend-permanent-observer.py | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
test "$(sudo sha256sum /usr/local/libexec/re7/frontend-permanent-observer-policy.json | cut -d' ' -f1)" = 3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = WINDOW_POLICY_HASH
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = 7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
sudo -l -- /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
python3 "$P/verify-package.py" /opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z e0c66407d0b56748547d0d03f7a2b1b88d63a75cadde22f8cc8bbd03bac4054b
python3 "$P/verify-return.py" /opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front 32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60
python3 "$P/check-css.py" /opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z
python3 "$P/run-preparatory-preflight.py"
