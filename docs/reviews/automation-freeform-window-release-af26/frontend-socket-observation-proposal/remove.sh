#!/bin/bash
# Only after confirming no active/pending operation depends on this observer.
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
R=/etc/sudoers.d/re7-frontend-socket-observer
printf 'Confirm absence of every active/pending switch or return depending on this observer. Type REMOVE-OBSERVER-ONLY: '
read -r CONFIRM
 test "$CONFIRM" = REMOVE-OBSERVER-ONLY
# Support partial installation, but validate every existing introduced file.
sudo /usr/bin/python3 -I -S - "$H" "$Q" "$R" <<'VERIFY'
import hashlib,pathlib,stat,sys
expected=[('93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385',0o644),('b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0',0o600),('118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12',0o440)]
present=0
for name,(digest,mode) in zip(sys.argv[1:],expected):
 p=pathlib.Path(name)
 try:s=p.lstat()
 except FileNotFoundError:continue
 present+=1
 for n in (p,*p.parents):
  t=n.lstat();assert t.st_uid==0 and t.st_gid==0 and not t.st_mode&0o022 and not stat.S_ISLNK(t.st_mode),'path_denied'
 assert stat.S_ISREG(s.st_mode) and stat.S_IMODE(s.st_mode)==mode,'file_mode_denied'
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,'later_or_unknown_generation_denied'
assert present,'nothing_introduced_to_remove'
print('EXISTING_INTRODUCED_BYTES_PASS')
VERIFY
# These hashes prevent removal of a later generation or pre-existing state.
# Preserve byte copies in this observation staging; no old generations are erased.
A="$P/removal-archive-private"
test ! -e "$A" && test ! -L "$A"
sudo install -d -o root -g root -m 0700 "$A"
if sudo test -e "$H"; then sudo install -o root -g root -m 0644 "$H" "$A/frontend-socket-observer.py"; fi
if sudo test -e "$Q"; then sudo install -o root -g root -m 0600 "$Q" "$A/policy.private.json"; fi
if sudo test -e "$R"; then sudo install -o root -g root -m 0440 "$R" "$A/re7-frontend-socket-observer.sudoers"; fi
if sudo test -e "$R"; then sudo rm -- "$R"; fi
sudo /usr/sbin/visudo -c
if sudo test -e "$H"; then sudo rm -- "$H"; fi
if sudo test -e "$Q"; then sudo rm -- "$Q"; fi
sudo test ! -e "$R" && sudo test ! -L "$R"
sudo test ! -e "$H" && sudo test ! -L "$H"
sudo test ! -e "$Q" && sudo test ! -L "$Q"
printf 'OBSERVER_ONLY_REMOVED_OTHER_DELEGATIONS_PRESERVED
'
