#!/bin/bash
# REVIEW ONLY: separate authorization required. No start/promotion/save.
set -euo pipefail
umask 077
P=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z
I=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-incoming-20261011T101500Z
Q=/usr/local/libexec/re7/frontend-permanent-observer-policy.json
A=/usr/local/libexec/re7/frontend-permanent-observer-policy.pre-reader-diagnostic-101500.json
exec 9>"$P/window.lock"
flock -n 9
python3 "$P/frontend-action.py" candidate
test -s "$I/window-owner-confirmation.private.json"
test "$(sha256sum "$I/permanent-policy-reader-upgrade.private.json" | cut -d' ' -f1)" = 3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391
test "$(sha256sum "$I/permanent-reader-upgrade-binding.private.json" | cut -d' ' -f1)" = c115243adfae88958c154b6d983adeee7e9eaf815ab82a8148b6d413654b3ca6
test "$(sha256sum /usr/local/libexec/re7/frontend-socket-observer.py | cut -d' ' -f1)" = c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30
test "$(sha256sum /usr/local/libexec/re7/frontend-permanent-observer.py | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
python3 - "$P" "$I" <<'PY'
import json,sys,hashlib
from pathlib import Path
p,i=map(Path,sys.argv[1:]);old=json.loads((p/'permanent-policy.proposed.private.json').read_text());new=json.loads((i/'permanent-policy-reader-upgrade.private.json').read_text());b=json.loads((i/'permanent-reader-upgrade-binding.private.json').read_text())
assert old['readerSha256']=='93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385'
assert new['readerSha256']=='c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30'
a=dict(old);a['readerSha256']=new['readerSha256'];assert a==new,'not_single_field_delta'
assert b['policy']==new and b['policySha256']==hashlib.sha256((i/'permanent-policy-reader-upgrade.private.json').read_bytes()).hexdigest()
assert (p/'execution-authorized').read_text().strip()=='true'
for line in (p/'bindings.sha256').read_text().splitlines():
 sha,n=line.split('  ')
 if n=='execution-authorized':continue
 assert hashlib.sha256((p/n).read_bytes()).hexdigest()==sha,'pre_mutation_binding_drift:'+n
for n in ['permanent-observer-binding.private.json','permanent-installed-binding.private.json','permanent-policy.proposed.private.json','bindings.sha256']:
 assert not (p/(n+'.before-reader-upgrade')).exists() and not (p/(n+'.before-reader-upgrade')).is_symlink()
print('EXACT_READER_HASH_FIELD_DIFF_PASS')
PY
sudo test ! -e "$A" && sudo test ! -L "$A"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83
sudo test "$(sudo sha256sum /etc/sudoers.d/re7-frontend-permanent-observer | cut -d' ' -f1)" = 2b3131648860b84dc3f131604347aaf400475b67c234378e791cf5cf454eda39
sudo visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$I/permanent-policy-reader-upgrade.private.json" "$Q"
sudo test "$(sudo sha256sum "$A" | cut -d' ' -f1)" = ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391
sudo stat -c '%U %G %a %n' "$Q" "$A"
sudo namei -l "$Q"
python3 - "$P" "$I" <<'PY'
from pathlib import Path
import sys,hashlib
p,i=map(Path,sys.argv[1:]);old=(p/'bindings.sha256').read_text().splitlines()
for n in ['permanent-observer-binding.private.json','permanent-installed-binding.private.json','permanent-policy.proposed.private.json','bindings.sha256']:
 with (p/(n+'.before-reader-upgrade')).open('xb')as f:f.write((p/n).read_bytes())
for n in ['permanent-observer-binding.private.json','permanent-installed-binding.private.json']:(p/n).write_bytes((i/'permanent-reader-upgrade-binding.private.json').read_bytes())
(p/'permanent-policy.proposed.private.json').write_bytes((i/'permanent-policy-reader-upgrade.private.json').read_bytes())
changed={'permanent-observer-binding.private.json','permanent-installed-binding.private.json','permanent-policy.proposed.private.json'}
lines=[]
for line in old:
 sha,n=line.split('  ')
 if n=='execution-authorized':
  # Window gate is intentionally true; preserve its original false hash for closure.
  assert (p/n).read_text().strip()=='true';lines.append(line+'\n');continue
 actual=hashlib.sha256((p/n).read_bytes()).hexdigest()
 assert n in changed or actual==sha,'unrelated_binding_drift:'+n
 lines.append(actual+'  '+n+'\n')
(p/'bindings.sha256').write_text(''.join(lines))
PY
python3 "$P/check-permanent-policy.py"
printf 'PERMANENT_READER_HASH_POLICY_UPDATED_LIVE_READ_PASS_NO_PROMOTION\n'
