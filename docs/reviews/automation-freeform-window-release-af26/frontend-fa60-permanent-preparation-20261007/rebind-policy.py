"""Prepare an EXPLICIT permanent-recovery policy proposal; never install/restart.
Usage: python3 rebind-policy.py CONTROL NEW_OUTPUT
Requires promoted control, closed execution gate, stable live PM2 daemon.
Only bootId and daemon may differ. Root policy replacement still needs owner.
"""
import hashlib,importlib.util,json,os,shlex,sys,time
from pathlib import Path

def require(ok,reason):
 if not ok:raise RuntimeError(reason)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def generate(control,output):
 control=Path(control).resolve();root=control.parent;out=Path(output).resolve();require(not out.exists(),'proposal_already_exists')
 spec=importlib.util.spec_from_file_location('fixed_gate',root/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
 r=json.loads(control.read_text());require((root/'execution-authorized').read_text().strip()=='false','window_still_authorized')
 require(json.loads(Path(str(control)+'.permanent').read_text())=={k:r[k] for k in ['nonce','entrySha256','buildId']},'promotion_binding')
 require(digest(r['entry'])==r['entrySha256'] and Path(r['release'],'.next/BUILD_ID').read_text().strip()==r['buildId'],'release_binding')
 old_binding_path=root/'socket-observer-binding.private.json';raw=old_binding_path.read_bytes();old=json.loads(raw)
 require(set(old)=={'policy','policySha256','helperSha256'},'binding_schema')
 require(any(x['release']==r['release'] and x['entry']==r['entry'] for x in old['policy']['roles'].values()),'policy_release_binding')
 # No pm2 query/start: pidfile and kernel identity only; these are checked again
 # by the actual root observer after the explicitly authorized installation.
 require(g.PM_PID.is_file() and not g.PM_PID.is_symlink(),'daemon_pidfile')
 pid_text=g.PM_PID.read_text().strip();require(pid_text.isdecimal() and int(pid_text)>0,'daemon_pidfile_schema')
 daemon=g.proc(int(pid_text));boot=g.BOOT_ID.read_text().strip();new=json.loads(json.dumps(old['policy']))
 new['bootId']=boot;new['daemon']={k:daemon[k] for k in ['pid','ticks']}
 require(all(new[k]==old['policy'][k] for k in new if k not in ['bootId','daemon']),'unapproved_policy_delta')
 require(new!=old['policy'],'no_rebinding_needed')
 require(g.PM_PID.read_text().strip()==pid_text and g.proc(daemon['pid'])['ticks']==daemon['ticks'] and g.BOOT_ID.read_text().strip()==boot,'proposal_identity_drift')
 out.mkdir(mode=0o700);policy=out/'observer-policy.private.json';policy.write_text(json.dumps(new,indent=2)+'\n');policy.chmod(0o600)
 binding={'policy':new,'policySha256':digest(policy),'helperSha256':old['helperSha256']}
 (out/'binding.private.json').write_text(json.dumps(binding,indent=2)+'\n');(out/'binding.private.json').chmod(0o600)
 (out/'prior-binding.private.json').write_bytes(raw);(out/'prior-binding.private.json').chmod(0o600)
 record={'at':time.time(),'control':str(control),'controlSha256':digest(control),'priorBindingSha256':hashlib.sha256(raw).hexdigest(),'priorPolicySha256':old['policySha256'],'policySha256':binding['policySha256'],'helperSha256':binding['helperSha256'],'bootId':boot,'daemon':new['daemon'],'delta':['bootId','daemon'],'automaticInstallation':False}
 (out/'proposal.private.json').write_text(json.dumps(record,indent=2)+'\n');(out/'proposal.private.json').chmod(0o600)
 # Fixed literal observer/sudoers unchanged. Script is proposal, not a delegation.
 q=shlex.quote;archive='/usr/local/libexec/re7/frontend-socket-observer-policy.pre-rebind-'+binding['policySha256'][:16]+'.json'
 script='''#!/bin/bash
set -euo pipefail
# REVIEW/OWNER AUTHORIZATION REQUIRED. No PM2 action in this installation.
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
'''
 script+='P='+q(str(out))+'\nB='+q(str(old_binding_path))+'\nA='+q(archive)+'\n'
 script+='test "$(sha256sum "$H" | cut -d\' \' -f1)" = '+old['helperSha256']+'\n'
 script+='test "$(sha256sum "$B" | cut -d\' \' -f1)" = '+record['priorBindingSha256']+'\n'
 script+='test "$(sha256sum "$P/observer-policy.private.json" | cut -d\' \' -f1)" = '+binding['policySha256']+'\n'
 script+='sudo test ! -e "$A" && sudo test ! -L "$A"\n'
 script+='test "$(sudo sha256sum "$Q" | cut -d\' \' -f1)" = '+old['policySha256']+'\n'
 script+='sudo visudo -c\nsudo install -o root -g root -m 0600 "$Q" "$A"\nsudo install -o root -g root -m 0600 "$P/observer-policy.private.json" "$Q"\n'
 script+='test "$(sudo sha256sum "$Q" | cut -d\' \' -f1)" = '+binding['policySha256']+'\n'
 script+='sudo namei -l "$H" "$Q" "$A"\nsudo stat -c \'%U %G %a %n\' "$H" "$Q" "$A"\nsudo visudo -c\n'
 script+='sudo -n /usr/bin/python3 -I -S "$H" > "$P/installed-observation.private.json"\nchmod 600 "$P/installed-observation.private.json"\n'
 script+='python3 '+q(str(root/'verify-rebinding.py'))+' "$P"\n'
 (out/'INSTALL-POLICY.sh').write_text(script);(out/'INSTALL-POLICY.sh').chmod(0o600)
 return record
if __name__=='__main__':
 v=generate(sys.argv[1],sys.argv[2]);print(json.dumps({k:v[k] for k in ['priorPolicySha256','policySha256','delta','automaticInstallation']}))
