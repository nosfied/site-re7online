#!/bin/bash
set -euo pipefail
umask 077
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-auth-v2-20261012T223100Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
A=/usr/local/libexec/re7/incident-6683-window-policy.pre-security-auth-v2-20261012-223100.json
exec 9>"$P/../.incident-6683-window.lock"
flock -n 9
test "$(cat "$P/execution-authorized")" = false
python3 "$P/verify-package.py"
python3 "$P/verify-package.py"
python3 "$P/window/ecosystem_contract.py" validate "$P"
python3 "$P/window/baseline_contract.py" "$P"
for mode in switch return return-partial; do (cd "$P/$mode" && sha256sum -c scripts.sha256); done
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = 7234446434d016df8fca6b1d46ae071364fbdf944a0fcf0801d146abaa5a6a46
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 7234446434d016df8fca6b1d46ae071364fbdf944a0fcf0801d146abaa5a6a46
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = a2ffdb7783100ef34248a38bc732558c2bbe60a4f0b177c4e1ade7fede09433e
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
python3 - "$P" <<'CHECK'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);sys.path.insert(0,str(p/'window'))
from sequencer import Bridge
v=json.loads(Bridge(p).privileged('inspect'))
assert v=={'policySha256':'7234446434d016df8fca6b1d46ae071364fbdf944a0fcf0801d146abaa5a6a46','phase':None,'sourceProcessesAlive':True}
g=json.loads((p/'window/execution-gates.private.json').read_text());assert len(g)==5 and all(x is False for x in g.values())
print('POLICY_ONLY_BASELINES_INSPECT_PASS_GATES_FALSE')
CHECK
