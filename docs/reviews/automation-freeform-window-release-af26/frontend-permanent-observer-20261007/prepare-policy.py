"""Generate private proposal/binding and literal installer locally; never install.
Arguments: corrected extraction, 9f extraction, NEW private output.
"""
import hashlib,json,sys
from pathlib import Path
here=Path(__file__).resolve().parent;candidate,ret,out=[Path(x).resolve() for x in sys.argv[1:]]
assert not out.exists();out.mkdir(mode=0o700)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
roles={}
for label,root,remote,build in [('source',ret,'/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front','LFcdEK9gXZsBhf4_c5r8G'),('candidate',candidate,'/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8','wBXX8kmp5RuCHCYt_ot8X'),('return',ret,'/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front','LFcdEK9gXZsBhf4_c5r8G')]:
 assert (root/'.next/BUILD_ID').read_text().strip()==build
 roles[label]={'release':remote,'entry':remote+'/node_modules/next/dist/bin/next','entrySha256':sha(root/'node_modules/next/dist/bin/next'),'buildId':build}
v={'version':1,'readerSha256':'93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385','frontendPort':3000,'pm2':{'pidfile':'/home/deploy/.pm2/pm2.pid','uid':1000,'exe':'/usr/bin/node','exeSha256':'d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e','cmdline':'PM2 v6.0.14: God Daemon (/home/deploy/.pm2)'},'roles':roles}
p=out/'policy.private.json';p.write_text(json.dumps(v,indent=2)+'\n');p.chmod(0o600)
hash=sha(here/'permanent-observer.py');binding={'policy':v,'policySha256':sha(p),'helperSha256':hash}
p=out/'permanent-observer-binding.private.json';p.write_text(json.dumps(binding,indent=2)+'\n');p.chmod(0o600)
rule='deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-permanent-observer.py\n'
p=out/'re7-frontend-permanent-observer.sudoers.proposed';p.write_text(rule);p.chmod(0o600)
installer='''#!/bin/bash
set -euo pipefail
# REVIEW ONLY. Requires specific approval; no process/config/window changes.
# Transfer reviewed files into a NEW proposal directory before any execution.
P=$(cd -- "$(dirname -- "$0")" && pwd -P)
H=/usr/local/libexec/re7/frontend-permanent-observer.py
Q=/usr/local/libexec/re7/frontend-permanent-observer-policy.json
S=/etc/sudoers.d/re7-frontend-permanent-observer
sudo test ! -e "$H" && sudo test ! -L "$H"
sudo test ! -e "$Q" && sudo test ! -L "$Q"
sudo test ! -e "$S" && sudo test ! -L "$S"
sudo test ! -e /usr/local/libexec/re7/frontend-permanent-no-capture.json
sudo test ! -L /usr/local/libexec/re7/frontend-permanent-no-capture.json
test "$(sha256sum "$P/permanent-observer.py" | cut -d' ' -f1)" = @HELPER@
test "$(sha256sum "$P/policy.private.json" | cut -d' ' -f1)" = @POLICY@
test "$(sha256sum "$P/re7-frontend-permanent-observer.sudoers.proposed" | cut -d' ' -f1)" = @RULE@
test "$(sha256sum /usr/local/libexec/re7/frontend-socket-observer.py | cut -d' ' -f1)" = @READER@
sudo visudo -cf "$P/re7-frontend-permanent-observer.sudoers.proposed"
sudo install -o root -g root -m 0644 "$P/permanent-observer.py" "$H"
sudo install -o root -g root -m 0600 "$P/policy.private.json" "$Q"
sudo /usr/bin/python3 -I -S - "$H" "$Q" <<'CHECK'
import pathlib,stat,sys
for f in sys.argv[1:]:
 p=pathlib.Path(f)
 for n in (p,*p.parents):
  s=n.lstat()
  assert s.st_uid==0 and not s.st_mode&0o022 and not n.is_symlink()
  assert stat.S_ISREG(s.st_mode) if n==p else stat.S_ISDIR(s.st_mode)
CHECK
test "$(sha256sum "$H" | cut -d' ' -f1)" = @HELPER@
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = @POLICY@
sudo install -o root -g root -m 0440 "$P/re7-frontend-permanent-observer.sudoers.proposed" "$S"
sudo cmp "$P/re7-frontend-permanent-observer.sudoers.proposed" "$S"
sudo visudo -c
sudo stat -c '%U %G %a %n' "$H" "$Q" "$S"
sudo -n /usr/bin/python3 -I -S "$H" > "$P/installed-read.private.json"
chmod 600 "$P/installed-read.private.json"
printf 'PERMANENT_READER_INSTALLED_ONLY_NO_WINDOW_NO_START\\n'
'''.replace('@HELPER@',hash).replace('@POLICY@',binding['policySha256']).replace('@RULE@',sha(p)).replace('@READER@',v['readerSha256'])
# These substitutions occur only on exact all-uppercase placeholders, not paths.
(out/'install.sh').write_text(installer);(out/'install.sh').chmod(0o600)
(out/'permanent-observer.py').write_bytes((here/'permanent-observer.py').read_bytes())
(out/'manifest.private.json').write_text(json.dumps({'helper':hash,'policy':binding['policySha256'],'sudoers':sha(p),'installer':sha(out/'install.sh')},indent=2)+'\n')
print(json.dumps({'helper':hash,'policy':binding['policySha256'],'sudoers':sha(p)}))
