#!/bin/bash
# REVIEW ONLY: fresh policy generated from observed post-unfence failure.
set -euo pipefail
umask 077
C=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-return-preventive-20261011T002421Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
ARCHIVE=/usr/local/libexec/re7/incident-6683-window-policy.failed-preventive-env-v2-002421.json
exec 9>"$C/policy-install.lock"
flock -n 9
python3 "$C/window/baseline_contract.py" "$C" return
(cd "$C/return" && sha256sum -c scripts.sha256)
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
python3 - "$C" <<'CHECK'
import hashlib,json,sys
from pathlib import Path
p=Path(sys.argv[1]);w=p/'window'
h=hashlib.sha256((w/'privileged-policy.private.json').read_bytes()).hexdigest()
assert h==(w/'privileged-policy.sha256').read_text().strip()
assert json.loads((w/'privileged-policy.private.json').read_text())['preparation']==str(p)
g=json.loads((w/'execution-gates.private.json').read_text())
assert len(g)==5 and all(v is False for v in g.values())
for n,h in json.loads((w/'sequencer-manifest.json').read_text())['filesSha256'].items():
 assert Path(n).name==n and hashlib.sha256((w/n).read_bytes()).hexdigest()==h
print('FRESH_RETURN_POLICY_HASH='+ (w/'privileged-policy.sha256').read_text().strip())
CHECK
sudo test ! -e "$ARCHIVE" && sudo test ! -L "$ARCHIVE"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = d3bd2043dfe56354165938075f03f6f180bf085b139b34f9c5abfd42adb4b6f7
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$ARCHIVE"
sudo install -o root -g root -m 0600 "$C/window/privileged-policy.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$(cat "$C/window/privileged-policy.sha256")"
sudo namei -l "$H" "$Q" "$ARCHIVE" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$ARCHIVE" "$S"
sudo visudo -c
python3 - "$C" <<'CHECK'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);sys.path.insert(0,str(p/'window'))
from sequencer import Bridge
v=json.loads(Bridge(p).privileged('inspect'))
assert v=={'policySha256':(p/'window/privileged-policy.sha256').read_text().strip(),'phase':None,'sourceProcessesAlive':True}
print('FRESH_RETURN_POLICY_INSPECT_PASS_GATES_FALSE')
CHECK
# absentWorker is permitted only by the reviewed explicit absence certificate.
