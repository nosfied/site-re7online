#!/bin/bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
R=/etc/sudoers.d/re7-frontend-socket-observer
sudo /usr/bin/python3 -I -S - "$H" "$Q" "$R" <<'VERIFY'
import ast, hashlib, pathlib, stat, sys
expected = [('93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385',0o644),('b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0',0o600),('118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12',0o440)]
for value,(digest,mode) in zip(sys.argv[1:],expected):
 p=pathlib.Path(value)
 for node in (p,*p.parents):
  s=node.lstat()
  assert s.st_uid==0 and s.st_gid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'root_path_denied'
  assert stat.S_ISREG(s.st_mode) if node==p else stat.S_ISDIR(s.st_mode),'path_type_denied'
 assert stat.S_IMODE(p.stat().st_mode)==mode,'file_mode_denied'
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,'installed_hash_denied'
p=pathlib.Path(sys.argv[1]);t=ast.parse(p.read_text())
imports={a.name for n in ast.walk(t) if isinstance(n,ast.Import) for a in n.names}
froms=[(n.module,[(a.name,a.asname) for a in n.names],n.level) for n in ast.walk(t) if isinstance(n,ast.ImportFrom)]
assert imports=={'hashlib','json','os','secrets','sys','time'} and froms==[('pathlib',[('Path',None)],0)],'helper_imports_denied'
print('INSTALLED_BYTES_PATH_IMPORTS_PASS')
VERIFY
sudo /usr/sbin/visudo -c
sudo namei -l "$H" "$Q" "$R"
sudo stat -c '%U %G %a %n' "$H" "$Q" "$R"
sudo -l -- /usr/bin/python3 -I -S "$H"
printf 'INSTALLATION_CHECK_PASS
'
