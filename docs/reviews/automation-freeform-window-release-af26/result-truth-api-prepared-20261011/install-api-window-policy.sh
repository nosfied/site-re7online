#!/bin/bash
set -euo pipefail
umask 077
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
A=/usr/local/libexec/re7/incident-6683-window-policy.pre-result-truth-2ed9dccc-184000.json
exec 9>"$P/../.incident-6683-window.lock"
flock -n 9
test "$(cat "$P/execution-authorized")" = false
python3 "$P/verify-package.py"
python3 "$P/window/ecosystem_contract.py" validate "$P"
python3 "$P/window/baseline_contract.py" "$P"
for mode in switch return return-partial; do (cd "$P/$mode" && sha256sum -c scripts.sha256); done
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = 620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = d3bd2043dfe56354165938075f03f6f180bf085b139b34f9c5abfd42adb4b6f7
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = d3bd2043dfe56354165938075f03f6f180bf085b139b34f9c5abfd42adb4b6f7
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
python3 - "$P" <<'CHECK'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);sys.path.insert(0,str(p/'window'))
from sequencer import Bridge
v=json.loads(Bridge(p).privileged('inspect'))
assert v=={'policySha256':'620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f','phase':None,'sourceProcessesAlive':True}
g=json.loads((p/'window/execution-gates.private.json').read_text());assert len(g)==5 and all(x is False for x in g.values())
print('POLICY_ONLY_BASELINES_INSPECT_PASS_GATES_FALSE')
CHECK
