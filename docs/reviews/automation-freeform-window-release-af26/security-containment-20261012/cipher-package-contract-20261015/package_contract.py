"""Producer/checker shared contract. No defaults for missing reference metadata."""
import hashlib,json,os,re,stat
from pathlib import Path
MODES=('switch','return','return-partial','return-before-commit')
def require(v,why):
 if not v:raise RuntimeError(why)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def hash_value(v):return type(v)is str and re.fullmatch('[0-9a-f]{64}',v)is not None
def immutable_schema(entries):
 require(type(entries)is list and len(entries)>0,'immutable_references_empty')
 seen=set()
 for e in entries:
  require(type(e)is dict and {'path','uid','mode','sha256'}<=set(e),'immutable_required_field_missing')
  require(type(e['path'])is str and Path(e['path']).is_absolute()and '..'not in Path(e['path']).parts and e['path']not in seen,'immutable_reference_invalid');seen.add(e['path'])
  require(type(e['uid'])is int and e['uid']>=0,'immutable_owner_invalid')
  require(type(e['mode'])is int and 0<=e['mode']<=0o777,'immutable_mode_invalid')
  require(hash_value(e['sha256']),'immutable_hash_invalid')
 return entries

def bind_observation(plan,observation):
 # An explicit typed stat observation is mandatory; no 600/644 guessed defaults.
 entries=observation['entries'];immutable_schema(entries)
 require(len(entries)==len(plan['immutable']),'immutable_population_drift')
 by={e['path']:e for e in entries};result=[]
 for expected in plan['immutable']:
  require(expected['path']in by,'immutable_reference_missing');e=by[expected['path']]
  require(e['uid']==expected['uid']and e['sha256']==expected['sha256'],'immutable_source_identity_drift')
  require(e['type']=='regular'and type(e['nlink'])is int and e['nlink']==1,'immutable_source_type_drift')
  result.append({k:e[k]for k in ('path','uid','mode','sha256')})
 immutable_schema(result);return result

def check(window,live=True):
 w=Path(window);root=w.parent
 from database_consumers import safe_file
 from cipher_consumers import CipherConsumers
 safe_file(w/'cipher-consumers.private.json',os.getuid(),0o600)
 plan=json.loads((w/'cipher-consumers.private.json').read_text());immutable_schema(plan['immutable'])
 require(set(plan['modeBindings'])==set(MODES),'four_consumer_mode_bindings_required')
 for phase in ('before','after'):
  require(type(plan[phase])is list and len(plan[phase])==1,'consumer_profile_count_invalid')
  for e in plan[phase]:
   require(set(e)=={'name','sha256'}and type(e['name'])is str and Path(e['name']).name==e['name']and hash_value(e['sha256']),'consumer_profile_invalid')
   require(sha(w/e['name'])==e['sha256'],'consumer_profile_hash_drift')
 for mode in MODES:require(hash_value(plan['modeBindings'][mode])and sha(root/mode/'candidate.config.private.json')==plan['modeBindings'][mode],'consumer_mode_binding_drift')
 if live:CipherConsumers(w,sha(w/'cipher-consumers.private.json')).verify('before')
 manifest=json.loads((w/'sequencer-manifest.json').read_text())
 require(manifest['preparation']==str(root),'manifest_preparation_drift')
 for n,h in manifest['filesSha256'].items():
  require(type(n)is str and Path(n).name==n and hash_value(h),'manifest_entry_invalid');safe_file(w/n,os.getuid(),0o600);require(sha(w/n)==h,'manifest_file_drift')
 mm=json.loads((w/'mode-manifest-v4.json').read_text());require(set(mm['modeFiles'])==set(mm['modeManifests'])==set(MODES),'mode_manifest_population_drift')
 for mode in MODES:
  require(sha(root/mode/'scripts.sha256')==mm['modeManifests'][mode],'mode_manifest_hash_drift')
  for n,h in mm['modeFiles'][mode].items():
   require(Path(n).name==n and hash_value(h),'mode_file_reference_invalid');safe_file(root/mode/n,os.getuid(),0o600);require(sha(root/mode/n)==h,'mode_file_hash_drift')
 from ecosystem_contract import validate_all
 from locked_v4 import verify_configs
 from sequencer import Bridge
 from baseline_contract import validate_preparation
 validate_all(root,MODES);verify_configs(Bridge(root));validate_preparation(root,list(MODES))
 names=json.loads((w/'mode-names.private.json').read_text());require(set(names)==set(MODES),'mode_names_drift')
 for mode in MODES:
  require(set(names[mode])==set(mm['modeFiles'][mode]),'mode_manifest_coverage_drift')
  for variant in ('candidate','return'):
   cfg=json.loads((root/mode/(variant+'.config.private.json')).read_text());require(type(cfg)is dict and type(cfg['apps'])is list and len(cfg['apps'])==3,'profile_shape_invalid')
   for app in cfg['apps']:require({'name','cwd','script','env'}<=set(app)and type(app['env'])is dict,'profile_required_field_missing')
 before=json.loads((w/plan['before'][0]['name']).read_text());after=json.loads((w/plan['after'][0]['name']).read_text())
 require(before==json.loads((root/'return-before-commit/candidate.config.private.json').read_text()),'precommit_consumer_profile_drift')
 for mode in ('switch','return','return-partial'):require(after==json.loads((root/mode/'candidate.config.private.json').read_text()),'postcommit_consumer_profile_drift')
 writer=json.loads((w/'writer-consumers.private.json').read_text());immutable_schema(writer['immutable']);require(writer['immutable']==plan['immutable'],'writer_consumer_references_diverge')
 require(writer['knownCipherWriters']==['re7-whatsapp-agent','re7-whatsapp-web-worker']and writer['unknownScheduledCipherWriters']==[],'writer_population_drift')
 policy=json.loads((w/'privileged-policy.private.json').read_text());require(policy['preparation']==str(root)and sha(w/'privileged-policy.private.json')==(w/'privileged-policy.sha256').read_text().strip(),'policy_reference_drift')
 require(set(policy['sourceProcesses'])=={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'},'policy_source_population_invalid')
 for e in policy['sourceProcesses'].values():require(type(e['pid'])is int and e['pid']>0 and str(e['ticks']).isdigit(),'policy_source_identity_invalid')
 for mode in MODES:
  for phase in ('before','after'):
   cfg=json.loads((w/plan[phase][0]['name']).read_text());require(set(a['name']for a in cfg['apps'])==set(policy['sourceProcesses']),'consumer_config_population_invalid')
 return {'result':'COMPLETE_PACKAGE_CONTRACT_PASS','immutableReferences':len(plan['immutable']),'modes':len(MODES),'liveReferencesVerified':live}
