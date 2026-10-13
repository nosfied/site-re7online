"""Readonly producer; writes only a new private input/evidence in this generation."""
import sys,json,os,stat,hashlib,re,datetime,time
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/retention-second-nine-v2-20261013T214500Z');sys.path.insert(0,str(P));import withdraw as m
B=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-database-final-v4-20261013T140000Z');W=B/'window';sys.path.insert(0,str(W));from sequencer import Bridge,API,WORKER,FRONT
assert os.geteuid()==0,'existing_sudo_required'
assert not os.path.lexists(P/'input.private.json'),'input_already_exists'
b=Bridge(B);target=b.expected_config('switch','candidate.config.private.json');daemon=int(Path('/home/deploy/.pm2/pm2.pid').read_text());assert daemon==18676 and b.identity(daemon)['ticks']=='222727'
# Never call Bridge.apps/app_matches as root: these invoke PM2 with inherited HOME.
snapshot=P/'pm2-deploy.private.json';z=snapshot.lstat()
assert stat.S_ISREG(z.st_mode)and z.st_uid==P.stat().st_uid and stat.S_IMODE(z.st_mode)==0o600,'snapshot_owner_type_mode'
v=json.loads(snapshot.read_text());assert 0<=time.time()-v['capturedAt']<=600,'snapshot_expired'
assert v['daemon']=={'pid':18676,'ticks':'222727'},'snapshot_daemon_drift'
apps={a['name']:a for a in v['apps']};assert len(apps)==len(v['apps']) and set(apps)=={API,WORKER,FRONT},'snapshot_composition'
sys.path.insert(0,str(B/'switch'));import ops
system=ops.System();operation=ops.Operations(B/'switch',system)
for n,a in apps.items():operation.config(a,target[n])

assert {n:a['pid']for n,a in apps.items()}=={API:410272,WORKER:410428,FRONT:188897}
processes=[{'pid':a['pid'],'ticks':b.identity(a['pid'])['ticks'],'cwd':os.readlink('/proc/'+str(a['pid'])+'/cwd')}for a in apps.values()];processes.append({'pid':daemon,'ticks':b.identity(daemon)['ticks'],'cwd':os.readlink('/proc/'+str(daemon)+'/cwd')})
g=Path(m.GUARD);raw=g.read_bytes();guard=json.loads(raw);assert guard['generation']==38 and guard['open']is False and not guard['tasks']and not guard.get('ledgerFault')
assert all(v is False for v in json.loads((W/'execution-gates.private.json').read_text()).values())and(B/'execution-authorized').read_text().strip()=='false'
old=json.loads((P/'audited-metadata.private.json').read_text());old={q['path']:q for q in old['metadata']};actual=m.inventory();assert set(old)==set(actual),'audited_membership_drift'
hashes={q['path']:q['sha256']for q in json.loads((P/'audited-hashes.private.json').read_text())};entries=[]
for path,z in actual.items():
 assert z=={k:old[path][k]for k in m.FIELDS},'audited_metadata_drift'
 q=dict(z,path=path)
 if stat.S_ISREG(z['mode']):q['sha256']=hashes[path]
 elif stat.S_ISLNK(z['mode']):q['target']=os.readlink(path);assert q['target']==old[path]['target'],'audited_symlink_drift'
 entries.append(q)
referenceInventory=m.reference_paths(str(P));references=[];links=[];mentions=[]
activePrefixes=[target[n]['cwd']for n in target]+[str(W),'/opt/re7online/backups/converta-persistent/preparations/frontend-dynamic-5b3cf3af-20261012T170000Z']
for path in referenceInventory:
 p=Path(path);z=p.lstat()
 if stat.S_ISLNK(z.st_mode):
  t=os.readlink(path);links.append({'path':path,'target':t});resolved=os.path.normpath(os.path.join(str(p.parent),t))if not os.path.isabs(t)else t
  if any(m.under(resolved,r)for r in m.ROOTS):mentions.append({'source':path,'targets':[resolved],'active':not '/preparations/'in path})
 else:
  data=p.read_bytes();after=p.lstat();assert(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'reference_race'
  references.append({'path':path,'uid':z.st_uid,'mode':stat.S_IMODE(z.st_mode),'sha256':hashlib.sha256(data).hexdigest()})
  hits=[r for r in m.ROOTS if r.encode()in data or Path(r).name.encode()in data]
  if hits:mentions.append({'source':path,'targets':hits,'active':any(m.under(path,p)for p in activePrefixes)or path.startswith(('/etc/','/home/deploy/.pm2/'))or(path.startswith('/usr/local/libexec/re7/')and'.pre-'not in path and'.aborted-'not in path and'.returned-'not in path and'.failed-'not in path)})
assert not any(q['active']for q in mentions),'active_reference_to_candidate'
# Check compiled current modules and dependency symlinks separately, without walking .data.
checkedRuntime=[];dependencyLinks=[]
for cfg in target.values():
 cwd=Path(cfg['cwd'])
 for folder,dirs,files in os.walk(cwd,followlinks=False,onerror=lambda e:(_ for _ in()).throw(e)):
  for name in dirs+files:
   q=Path(folder)/name
   if q.is_symlink():
    t=os.readlink(q);dependencyLinks.append({'path':str(q),'target':t})
    if name!='.data':assert not any(m.under(str(q.resolve()),r)for r in m.ROOTS),'active_dependency_to_candidate'
  dirs[:]=[d for d in dirs if d not in {'node_modules','.next','.git','src','public','.data'}]
  for name in files:
   q=Path(folder)/name
   if q.is_symlink()or q.suffix not in {'.js','.cjs','.mjs','.json','.env'}or q.stat().st_size>16*1024*1024:continue
   data=q.read_bytes();assert not any(r.encode()in data for r in m.ROOTS),'compiled_reference_to_candidate';checkedRuntime.append({'path':str(q),'sha256':hashlib.sha256(data).hexdigest()})
for path in [str(Path('/home/deploy/.pm2')/n)for n in ['dump.pm2','dump.pm2.bak']]:
 saved=json.loads(Path(path).read_text());saved={q['name']:q for q in saved}
 for n in [API,WORKER]:assert saved[n]['env']['DATABASE_URL']==target[n]['env']['DATABASE_URL']
 for n in saved:
  for field in ['pm_cwd','pm_exec_path']:
   v=saved[n].get(field,'');assert not any(m.under(v,r)for r in m.ROOTS),'saved_reference_to_candidate'
hook=json.loads((W/'credential-hook.private.json').read_text());receipt=W/'credential-commit.receipt.private.json';rv=json.loads(receipt.read_text());assert rv['verification']=={'result':'VERIFIED','usesNewCredentials':True,'oldCredentialReactivation':False}
plan={'roots':list(m.ROOTS),'executorUid':P.stat().st_uid,'evidenceDirectory':str(P),'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'guardSha256':hashlib.sha256(raw).hexdigest(),'guardUid':g.stat().st_uid,'guardMode':stat.S_IMODE(g.stat().st_mode),'processes':processes,'entries':entries,'references':references,'referenceLinks':links,'referenceInventory':referenceInventory,'minimumBeforeBytes':2173698048+268435456,'requiredPostFreeBytes':6468665344,'evidenceBudgetBytes':268435456,'database':{'receipt':str(receipt),'receiptSha256':m.digest(receipt),'intent':str(W/'credential-commit.intent.private.json'),'planSha256':rv['planSha256'],'policy':'/usr/local/libexec/re7/incident-6683-window-policy.json','policySha256':m.digest('/usr/local/libexec/re7/incident-6683-window-policy.json'),'expectedFullAttributes':hook['expectedFullAttributes'],'expectedVerifierSha256':hook['expectedVerifierSha256']},'custody':{'verified':True,'archiveSha256':'eaa1d3e711746b0bc3b2b0b1fb1b0d86f8eb0624162eacea02bf8749d15bf22e','indexSha256':'dd40e573610caf3ad39eac827ce1a1b428be7d2a74227f1bb39b55c5dfdfc55f','manifestSha256':'4fc6e2fa851d73f20843d683a67e46459edda7bdf349f0b0c875728c6ade2c23'}}
for q in checkedRuntime:
 p=Path(q['path']);z=p.lstat();plan['references'].append(dict(q,uid=z.st_uid,mode=stat.S_IMODE(z.st_mode)))
plan['referenceLinks']+=dependencyLinks
m.validate_state(plan)
m.exclusive_json(P/'input.private.json',plan);os.chown(P/'input.private.json',P.stat().st_uid,P.stat().st_gid);m.exclusive_json(P/'reference-analysis.private.json',{'mentions':mentions,'compiledChecked':len(checkedRuntime),'dependencyLinks':dependencyLinks,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
print(json.dumps({'result':'INPUT_PREPARED_READONLY_NO_REMOVAL','entries':len(entries),'references':len(references),'currentReferencesToCandidates':0,'compiledFilesChecked':len(checkedRuntime),'dependencyLinks':len(dependencyLinks),'planSha256':m.digest(P/'input.private.json')}))

secondary={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[],'errors':[],'deletionAllowed':False}
for root in ['/opt/re7online/backups/converta-persistent/snapshots','/var/log','/opt/re7online/backups/converta-persistent/preparations']:
 for folder,dirs,files in os.walk(root,followlinks=False,onerror=lambda e:secondary['errors'].append({'path':e.filename,'errno':e.errno})):
  dirs[:]=[d for d in dirs if d not in {'node_modules','.next','.git','.data'}and not m.under(os.path.join(folder,d),str(P))]
  for name in files:
   q=Path(folder)/name
   try:
    z=q.lstat()
    if stat.S_ISREG(z.st_mode):secondary['files'].append({'path':str(q),'dev':z.st_dev,'ino':z.st_ino,'nlink':z.st_nlink,'blocks':z.st_blocks,'bytes':z.st_size,'mtimeNs':z.st_mtime_ns,'uid':z.st_uid,'gid':z.st_gid,'mode':z.st_mode})
   except OSError as e:secondary['errors'].append({'path':str(q),'errno':e.errno})
m.exclusive_json(P/'secondary-audit.private.json',secondary)
