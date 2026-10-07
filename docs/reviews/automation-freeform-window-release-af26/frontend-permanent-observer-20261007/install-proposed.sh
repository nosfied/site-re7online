#!/bin/bash
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
test "$(sha256sum "$P/permanent-observer.py" | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
test "$(sha256sum "$P/policy.private.json" | cut -d' ' -f1)" = 24a78e7ebb6e92b56a6719a7234631ed11b8e93b657665817b6905a16a00add3
test "$(sha256sum "$P/re7-frontend-permanent-observer.sudoers.proposed" | cut -d' ' -f1)" = 2b3131648860b84dc3f131604347aaf400475b67c234378e791cf5cf454eda39
test "$(sha256sum /usr/local/libexec/re7/frontend-socket-observer.py | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
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
test "$(sha256sum "$H" | cut -d' ' -f1)" = 976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d
test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 24a78e7ebb6e92b56a6719a7234631ed11b8e93b657665817b6905a16a00add3
sudo install -o root -g root -m 0440 "$P/re7-frontend-permanent-observer.sudoers.proposed" "$S"
sudo cmp "$P/re7-frontend-permanent-observer.sudoers.proposed" "$S"
sudo visudo -c
sudo stat -c '%U %G %a %n' "$H" "$Q" "$S"
sudo -n /usr/bin/python3 -I -S "$H" > "$P/installed-read.private.json"
chmod 600 "$P/installed-read.private.json"
printf 'PERMANENT_READER_INSTALLED_ONLY_NO_WINDOW_NO_START\n'
