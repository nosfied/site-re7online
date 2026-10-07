"""Installation/read validation only: no launch, control or policy mutation."""
import hashlib,importlib.util,json,os,subprocess,sys,time
from pathlib import Path
p=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-permanent-observer-installed-20261007T232640Z')
sys.path.insert(0,str(p));import permanent_observation_client as client
before=json.loads((p/'before.private.json').read_text());run=before['activeRun'];control=Path(before['activeControl']);active=control.parent
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
def require(v,why):
 if not v:raise RuntimeError(why)
def proc(pid):
 s=Path('/proc',str(pid),'stat').read_text().rsplit(') ',1)[1].split();require(s[0] not in ['Z','X','x'],'current_process_dead');return {'pid':pid,'ticks':s[19]}
def unchanged():
 require(Path('/proc/sys/kernel/random/boot_id').read_text().strip()==before['bootId'],'boot_changed_since_staging')
 require(int(Path('/home/deploy/.pm2/pm2.pid').read_text())==before['daemon']['pid'] and proc(before['daemon']['pid'])==before['daemon'],'daemon_changed_since_staging')
 rows=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist'],text=True,timeout=10))
 for old in before['rows']:
  found=[q for q in rows if q['name']==old['name']];require(len(found)==1,'process_missing_or_duplicate');now=found[0]
  require(proc(now['pid'])==before['identities'][old['name']],'process_identity_changed')
  for k in ['status','restart_time','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','RE7_FRONT_CONTROL','RE7_FRONT_RUN']:
   require(now['pm2_env'].get(k)==old['pm2_env'].get(k),'process_configuration_changed:'+k)
 require(sha(control)==before['activeControlSha256'],'active_control_changed')
 for n,h in before['activeScripts'].items():require(sha(active/n)==h,'active_script_changed:'+n)
 for n,h in before['windowHelpers'].items():require(sha(n)==h,'window_helper_changed')
 for file,key in [('dump.pm2','savedSha256'),('dump.pm2.bak','fallbackSha256')]:require(sha(Path('/home/deploy/.pm2',file))==before[key],'saved_or_fallback_changed')
 require((p/'window-sudoers.before.sha256').read_bytes()==(p/'window-sudoers.after.sha256').read_bytes(),'window_sudoers_changed')
 require((p/'execution-authorized').read_text().strip()=='false','execution_gate_changed')
 return rows
# Existing active checker used for read-only tree and socket inventory only.
spec=importlib.util.spec_from_file_location('active_fixed_checker',active/'frontend-check.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
rows=unchanged();front=next(q for q in rows if q['name']=='re7-admin-front');tree=g.tree(front['pid']);sockets=g.sockets(tree);expected={(q['pid'],q['ticks']) for q in tree}
# One actual new literal invocation. Failures retain client's private diagnostics.
value=client.read(p,run)
require(value['version']==1 and type(value['observationId']) is str and len(value['observationId'])==64,'observation_id_schema')
require(all(ch in '0123456789abcdef' for ch in value['observationId']),'observation_id_hex')
require(value['bootId']==before['bootId'] and value['effectivePolicy']['daemon']==before['daemon'],'observed_boot_daemon')
for sample in value['samples']:
 q=sample['processes'];require(type(q) is list and q and len({v['pid'] for v in q})==len(q),'incomplete_or_duplicate_process_inventory')
 for row in q:
  require(set(row)=={'pid','ticks','parent','group','state','roles'} and type(row['pid']) is int and type(row['parent']) is int and type(row['group']) is int and type(row['ticks']) is str and row['ticks'].isdecimal() and type(row['roles']) is list,'process_schema')
 actual={(v['pid'],v['ticks']) for v in q if v['roles']};require(actual==expected,'unexpected_or_missing_frontend_executor')
 require(not any(v['state'] in ['Z','X','x'] for v in q if v['roles']),'frontend_dead_executor')
 require(sample['captures']=={'source':None,'candidate':None,'return':None},'historical_capture_consumed')
 require(sample['listeners'] and set(sample['listeners']).issubset(set(sockets)),'frontend_listener_not_owned_by_active_tree')
 fd=sample['daemonFd0']
 if fd.startswith('socket:['):
  inode=fd[8:-1];require(sample['network'][inode]=={'kind':'unix','state':'03','type':'0001','flags':'00000000'},'shared_socket_type')
  for owner in sample['owners'][inode]:
   require((owner['pid'],owner['ticks']) in (expected|{(before['daemon']['pid'],before['daemon']['ticks'])}) and owner['fd']=='0' and owner['state'] not in ['Z','X','x'],'shared_socket_unexplained_owner')
 require(sample['daemon']==before['daemon'],'sample_daemon_changed')
# Signature checks relevant identities/owners/listener, never scheduling R/S.
spec=importlib.util.spec_from_file_location('reviewed_root_reader','/usr/local/libexec/re7/frontend-socket-observer.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
require(reader.stable_signature(value['samples'][0])==reader.stable_signature(value['samples'][1]),'samples_changed')
current=g.tree(front['pid']);require(all(q['state'] not in ['Z','X','x'] for q in current),'live_tree_dead')
require([{k:v for k,v in q.items() if k!='state'} for q in current]==[{k:v for k,v in q.items() if k!='state'} for q in tree],'live_tree_changed')
unchanged()
record=p/('validated-read-'+str(time.time_ns())+'.private.json');record.write_text(json.dumps(value,indent=2)+'\n');record.chmod(0o600)
summary={'status':'INSTALLED VERIFIED / LIVE PERMANENT READ PASS / NO WINDOW','bootId':value['bootId'],'daemon':value['effectivePolicy']['daemon'],'policySha256':value['policySha256'],'helperSha256':value['helperSha256'],'sampleProcessCounts':[len(s['processes']) for s in value['samples']],'samples':2,'durationSeconds':value['finishedMonotonic']-value['startedMonotonic'],'activeFrontend':'9f4cbe0f','apiWorker':'afbb7455','identitiesPreserved':True,'activeScriptsPreserved':True,'windowHelpersSudoersPreserved':True,'savedFallbackPreserved':True,'historicalCapturesRead':False,'executionAuthorized':False}
file=p/'validated-summary.json';require(not file.exists(),'summary_already_exists');file.write_text(json.dumps(summary,indent=2)+'\n');file.chmod(0o600);print(json.dumps(summary))
