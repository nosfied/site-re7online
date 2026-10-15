"""Directed deltas on complete composition and actual cron captures; no host effects."""
import copy,importlib.util,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
from prepare_future import verify_files
from cron_root_contract import verify_cron_capture,DEPLOY,SYSTEM
P=Path(sys.argv[1]).resolve();cases=[]
baseline=json.loads(Path('local-evidence/cipher-locked-preparation-v2-20261014T235000Z/root.private.json').read_text())['cron']
def deny(name,fn):
 try:fn()
 except (RuntimeError,KeyError,FileNotFoundError):cases.append(name);return
 raise AssertionError('negative admitted: '+name)
verify_cron_capture(P,baseline,baseline)
# Debian install timestamp header may change; the complete functional body cannot.
import hashlib
def alter(path,fn):
 v=copy.deepcopy(baseline);e=next(x for x in v if x['path']==path);e['rawPrivate']=fn(e['rawPrivate']);e['sha256']=hashlib.sha256(e['rawPrivate'].encode()).hexdigest();return v
header=alter(DEPLOY,lambda s:s.replace(' installed on ',' installed on later '))
verify_cron_capture(P,header,baseline);cases.append('generated_header_only_accepted')
for name,observed in [('deploy_body',alter(DEPLOY,lambda s:s+'# unexpected\n')),('system_body',alter(SYSTEM,lambda s:s+'# unexpected\n')),('deploy_absent',[x for x in baseline if x['path']!=DEPLOY]),('duplicate_source',baseline+[baseline[0]])]:
 deny(name,lambda v=observed:verify_cron_capture(P,v,baseline))
with tempfile.TemporaryDirectory()as t:
 q=Path(t)/'full';shutil.copytree(P,q)
 for path in ['switch/ops.py','return/delegated.py','return-partial/ops.py','return-before-commit/delegated.py','window/scheduled_controls.py']:
  f=q/path;raw=f.read_bytes();f.write_bytes(raw+b'\n# drift\n');deny(path,lambda:verify_files(q));f.write_bytes(raw)
 spec=importlib.util.spec_from_file_location('shared',q/'window/scheduled_controls.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 def run(args,text=None):
  return(q/'window'/('deploy.crontab.before'if args[0]=='crontab'else're7-converta-backup.before')).read_text()
 m.ScheduledControls(q/'window',run).verify('before')
 f=q/'window/deploy.crontab.before';f.chmod(0o644);deny('source_mode',lambda:m.ScheduledControls(q/'window',run));f.chmod(0o600)
 uid=os.getuid()
 with patch.object(m.os,'getuid',lambda:uid+1):deny('source_owner',lambda:m.ScheduledControls(q/'window',run))
 raw=f.read_bytes();f.unlink();f.symlink_to('deploy.crontab.window');deny('source_symlink',lambda:m.ScheduledControls(q/'window',run));f.unlink();f.write_bytes(raw);f.chmod(0o600)
 def partial(args,text=None):return(q/'window'/('deploy.crontab.before'if args[0]=='crontab'else're7-converta-backup.window')).read_text()
 deny('system_not_restored',lambda:m.ScheduledControls(q/'window',partial).restore_deploy())
print(json.dumps({'result':'DIRECTED_NEGATIVES_PASS','cases':cases,'caseCount':len(cases),'productionEffects':False}))
