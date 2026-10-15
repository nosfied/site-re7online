"""Restricted credential contract. Validation only; no provider, SQL or PM2 effect."""
import copy,hashlib,json,os,re,stat
from pathlib import Path
MODES=('switch','return','return-partial','return-before-commit')
API='re7-whatsapp-agent'
POLICY_SOURCE='fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251'
def require(ok,why):
 if not ok:raise RuntimeError(why)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):
 p=Path(p);s=p.lstat();require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_object_invalid');return json.loads(p.read_text())
def write(p,v):
 p=Path(p);fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
def profiles(before,after):
 require(set(before)==set(after)=={'apps'},'profile_shape')
 for v in (before,after):require(len(v['apps'])==3 and {a['name']for a in v['apps']}=={API,'re7-whatsapp-web-worker','re7-admin-front'},'profile_population')
 a=copy.deepcopy(after);x=next(x for x in a['apps']if x['name']==API);old=next(x for x in before['apps']if x['name']==API)['env']['OPENAI_API_KEY'];require(x['env']['OPENAI_API_KEY']!=old,'replacement_not_distinct');x['env']['OPENAI_API_KEY']=old;require(a==before,'unrelated_profile_drift')
 require([x['name']for x in before['apps']if x['env'].get('OPENAI_API_KEY')]==[API],'consumer_population_drift')
def check(p,live=False):
 p=Path(p);w=p/'window';c=read(w/'openai-contract.private.json');before=read(w/'source.profile.private.json');after=read(w/'target.profile.private.json');profiles(before,after)
 require(c['sourcePolicySha256']==POLICY_SOURCE and c['models']=={'responses':'gpt-4.1-mini','audio':'gpt-4o-mini-transcribe'},'source_policy_or_model_drift')
 require(c['sourceProfileSha256']==sha(w/'source.profile.private.json')and c['targetProfileSha256']==sha(w/'target.profile.private.json'),'profile_hash_drift')
 refs=c['immutable'];require(type(refs)is list and bool(refs),'immutable_empty')
 for e in refs:
  require(set(e)>={'path','uid','mode','sha256'}and type(e['uid'])is int and type(e['mode'])is int and re.fullmatch('[a-f0-9]{64}',e['sha256'])is not None,'immutable_contract')
  if live:
   f=Path(e['path']);s=f.lstat();require(stat.S_ISREG(s.st_mode)and not f.is_symlink()and s.st_uid==e['uid']and stat.S_IMODE(s.st_mode)==e['mode']and sha(f)==e['sha256'],'immutable_live_drift')
 from ecosystem_contract import validate_all
 validate_all(p)
 names=read(w/'mode-names.private.json');mm=read(w/'mode-manifest-v4.json');require(set(names)==set(mm['modeFiles'])==set(mm['modeManifests'])==set(MODES),'four_modes_required')
 for mode in MODES:
  d=p/mode;plan=read(d/'plan.private.json');require(plan['mode']==mode,'explicit_mode_missing_or_drift')
  target=before if mode=='return-before-commit'else after
  require(read(d/'candidate.config.private.json')==target,'mode_target_drift')
  require(read(d/'return.config.private.json')==(before if mode in ('switch','return-before-commit')else after),'mode_source_drift')
  require(set(names[mode])==set(mm['modeFiles'][mode]),'mode_coverage')
  for n,h in mm['modeFiles'][mode].items():require(Path(n).name==n and sha(d/n)==h,'mode_hash_drift');read_permission(d/n)
  require(sha(d/'scripts.sha256')==mm['modeManifests'][mode],'mode_manifest_drift')
  from restore_contract import validate
  validate(d)
 wm=read(w/'sequencer-manifest.json');require(wm['preparation']==c['remotePreparation'],'remote_preparation_drift')
 for n,h in wm['filesSha256'].items():require(Path(n).name==n and sha(w/n)==h,'window_hash_drift');read_permission(w/n)
 for line in(p/'preparation-review.sha256').read_text().splitlines():
  h,n=line.split('  ',1);f=p/n;require(not Path(n).is_absolute()and '..'not in Path(n).parts and sha(f)==h,'review_hash_drift');read_permission(f)
 policy=read(w/'privileged-policy.private.json');require(policy['preparation']==c['remotePreparation']and set(policy['sourceProcesses'])=={a['name']for a in before['apps']},'policy_shape')
 require(sha(w/'privileged-policy.private.json')==(w/'privileged-policy.sha256').read_text().strip(),'policy_hash_drift')
 if live:
  require(str(p)==c['remotePreparation'],'live_path_drift')
  from baseline_contract import validate_preparation
  validate_preparation(p)
  inv=read(p/'runtime-inventory.private.json');r=Path(inv['runtimeRoot'])
  require(not(r/'.env').exists()and not(r/'.env').is_symlink(),'runtime_env')
  for e in inv['files']:require(sha(r/e['path'])==e['sha256']and not(r/e['path']).is_symlink(),'runtime_hash')
  for e in inv['links']:require((r/e['path']).is_symlink()and os.readlink(r/e['path'])==e['target'],'runtime_link')
 return {'result':'OPENAI_FOUR_MODE_CONTRACT_PASS','live':live,'immutableReferences':len(refs),'modes':4}
def read_permission(p):
 s=Path(p).lstat();require(stat.S_ISREG(s.st_mode)and not Path(p).is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'sealed_file_type_owner_mode')
def selected(p):
 p=Path(p);w=p/'window';receipt=w/'openai-selection.receipt.private.json';intent=w/'openai-selection.intent.private.json'
 if not receipt.exists():require(not intent.exists(),'selection_uncertain_inspection_only');return False
 r=read(receipt);c=read(w/'openai-contract.private.json');require(r=={'result':'NEW_OPENAI_SELECTED','intentSha256':sha(intent),'contractSha256':sha(w/'openai-contract.private.json'),'targetProfileSha256':c['targetProfileSha256']},'selection_receipt_drift');i=read(intent);require(i['contractSha256']==sha(w/'openai-contract.private.json')and i['automaticRetry']is False,'selection_intent_drift');return True
