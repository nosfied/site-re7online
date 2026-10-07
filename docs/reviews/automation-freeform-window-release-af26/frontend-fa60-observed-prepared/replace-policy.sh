#!/bin/bash
# REVIEW ONLY. Requires specific policy replacement authorization before any window.
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
R=/etc/sudoers.d/re7-frontend-socket-observer
A=/usr/local/libexec/re7/frontend-socket-observer-policy.pre-fa60-194628.json
test "$(sha256sum "$H" | cut -d' ' -f1)" = 93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385
test "$(sha256sum "$P/observer-policy.private.json" | cut -d' ' -f1)" = eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213
sudo test ! -e "$A" && sudo test ! -L "$A"
sudo /usr/bin/python3 -I -S - "$H" "$Q" "$R" "$P" <<'VERIFY'
import hashlib,json,pathlib,stat,sys
h,q,r,p=map(pathlib.Path,sys.argv[1:])
for path,expected,mode in [(h,'93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385',0o644),(q,'b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0',0o600),(r,'118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12',0o440)]:
 for n in (path,*path.parents):
  s=n.lstat();assert s.st_uid==0 and s.st_gid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'root_chain_denied'
 assert stat.S_ISREG(path.lstat().st_mode) and stat.S_IMODE(path.stat().st_mode)==mode
 assert hashlib.sha256(path.read_bytes()).hexdigest()==expected,'installed_generation_drift'
old=json.loads(q.read_text());new=json.loads((p/'observer-policy.private.json').read_text())
assert {k:v for k,v in old.items() if k!='roles'}=={k:v for k,v in new.items() if k!='roles'}
assert set(new['roles'])=={'source','candidate','return'}
for role in ['source','candidate','return']:
 a=old['roles'][role];b=new['roles'][role];assert set(a)==set(b)=={'release','entry','nonce','capture'}
 assert a['release']==b['release'] and a['entry']==b['entry']
 assert b['capture']==str(p/(role+'-tree.private.json'))
 if role=='source':assert a['nonce']==b['nonce']
 else:
  control=json.loads((p/(role+'.run.private.json')).read_text())
  assert a['nonce']!=b['nonce'] and b['nonce']==control['nonce']
  assert b['release']==control['release'] and b['entry']==control['entry']
assert new['bootId']==pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
s=pathlib.Path('/proc',str(new['daemon']['pid']),'stat').read_text().rsplit(') ',1)[1].split()
assert s[19]==new['daemon']['ticks'] and s[0] not in ['Z','X','x']
print('EXACT_FIVE_FIELD_POLICY_DIFF_PASS')
VERIFY
sudo /usr/sbin/visudo -c
sudo install -o root -g root -m 0600 "$Q" "$A"
sudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"
sudo /usr/bin/python3 -I -S - "$Q" "$A" <<'AFTER'
import hashlib,pathlib,stat,sys
for name,digest in zip(sys.argv[1:],['eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213','b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0']):
 p=pathlib.Path(name);s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o600
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
print('NEW_POLICY_AND_ARCHIVE_PASS')
AFTER
sudo namei -l "$Q" "$A"
sudo /usr/sbin/visudo -c
printf 'POLICY_ONLY_REPLACED_HELPER_SUDOERS_PRESERVED
'
