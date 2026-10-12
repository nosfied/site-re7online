#!/bin/bash
set -euo pipefail
# REVIEW ONLY: after authorized owner screen confirmation, before promotion.
# The active generation retains its installed policy until this point.
P=/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z
H=/usr/local/libexec/re7/frontend-permanent-observer.py
Q=/usr/local/libexec/re7/frontend-permanent-observer-policy.json
S=/etc/sudoers.d/re7-frontend-permanent-observer
A=/usr/local/libexec/re7/frontend-permanent-observer-policy.pre-dynamic-5b3cf3af-170000.json
test "$(sha256sum "$H" | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
test "$(sha256sum "$P/permanent-policy.proposed.private.json" | cut -d' ' -f1)" = 5ee8622d9499a38aab740bec02aaed9fa2732d9981505f915215e39b2d9eae3e
sudo test ! -e "$A" && sudo test ! -L "$A"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391
test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = 2b3131648860b84dc3f131604347aaf400475b67c234378e791cf5cf454eda39
python3 - "$P" <<'CHECK'
import importlib.util,json,sys
from pathlib import Path
p=Path(sys.argv[1]);sys.path.insert(0,str(p));s=importlib.util.spec_from_file_location('g',p/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
front=[x for x in g.rows() if x['name']==g.FRONT];assert len(front)==1
control=front[0]['pm2_env']['RE7_FRONT_CONTROL'];labels=[k for k in ['candidate','return'] if control==str(p/(k+'.run.private.json'))];assert len(labels)==1,'new_generation_not_live'
label=labels[0];g.tracked_live(label)
assert json.loads((p/(label+'.readiness.private.jsonl')).read_text().splitlines()[-1])['result']=='PASS'
print('NEW_GENERATION_TECHNICAL_GATE_PASS')
CHECK
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/permanent-policy.proposed.private.json" "$Q"
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 5ee8622d9499a38aab740bec02aaed9fa2732d9981505f915215e39b2d9eae3e
test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = 3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391
sudo namei -l "$H" "$Q" "$A" "$S"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$A" "$S"
sudo visudo -c
python3 "$P/check-permanent-policy.py"
printf 'PERMANENT_POLICY_ONLY_INSTALLED_NO_PROMOTION\n'
