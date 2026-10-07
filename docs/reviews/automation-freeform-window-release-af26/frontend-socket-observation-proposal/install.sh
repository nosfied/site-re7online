#!/bin/bash
# REVIEW ONLY: run only after specific installation authorization. No window actions.
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
R=/etc/sudoers.d/re7-frontend-socket-observer
A="$P/re7-frontend-socket-observer.sudoers.proposed"
(cd "$P" && sha256sum -c scripts.sha256)
test "$(sha256sum "$P/observer.py" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
test "$(sha256sum "$P/policy.private.json" | cut -d' ' -f1)" = b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0
test "$(sha256sum "$A" | cut -d' ' -f1)" = 118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12
# Existing destinations, including a dangling link, block: nothing is overwritten.
sudo test ! -e "$H" && sudo test ! -L "$H"
sudo test ! -e "$Q" && sudo test ! -L "$Q"
sudo test ! -e "$R" && sudo test ! -L "$R"
sudo /usr/bin/python3 -I -S - <<'DIRS'
import pathlib,stat
p=pathlib.Path('/usr/local/libexec/re7')
for n in (p,*p.parents):
 s=n.lstat()
 assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and s.st_gid==0 and not s.st_mode&0o022,'parent_path_denied'
p=pathlib.Path('/etc/sudoers.d')
for n in (p,*p.parents):
 s=n.lstat()
 assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and s.st_gid==0 and not s.st_mode&0o022,'sudoers_parent_denied'
print('EXISTING_PARENT_CHAINS_PASS')
DIRS
/usr/bin/python3 -I -S -c 'import hashlib,json,os,pathlib,secrets,sys,time'
sudo /usr/sbin/visudo -c
sudo /usr/sbin/visudo -cf "$A"
sudo install -o root -g root -m 0644 "$P/observer.py" "$H"
sudo install -o root -g root -m 0600 "$P/policy.private.json" "$Q"
# Verify root-owned helper/policy before enabling any NOPASSWD command.
sudo /usr/bin/python3 -I -S - "$H" "$Q" <<'HASHES'
import hashlib,pathlib,stat,sys
for f,h,mode in zip(sys.argv[1:],['93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385','b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0'],[0o644,0o600]):
 p=pathlib.Path(f);s=p.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_gid==0 and stat.S_IMODE(s.st_mode)==mode
 assert hashlib.sha256(p.read_bytes()).hexdigest()==h
print('ROOT_HELPER_POLICY_HASH_PASS')
HASHES
sudo install -o root -g root -m 0440 "$A" "$R"
bash "$P/check-installation.sh"
printf 'RESTRICTED_INSTALLATION_COMPLETE_NO_WINDOW
'
