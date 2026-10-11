"""Stage only: new immutable-input V4 generation; never start/stop/install/open."""
from pathlib import Path
import os,json,hashlib,subprocess,shutil,tarfile,fcntl,datetime,sys
os.umask(0o077)
OLD=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-preventive-env-v2-20261011T002421Z')
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z')
R=Path('/opt/re7online/releases/campaign-result-truth-2ed9dccc-20261011T184000Z')
B=Path('/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z/apps/whatsapp-agent')
IN=Path('/dev/shm/re7-result-truth-input-20261011T184000Z')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
put=lambda p,v:p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n')
lock=(OLD.parent/'.incident-6683-window.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not P.exists() and not P.is_symlink() and not R.exists() and not R.is_symlink(),'generation_exists'
guard=Path('/var/lib/re7/campaign-operations/state.json').read_bytes();g=json.loads(guard);assert g['open'] is False and g['generation']==38 and g['tasks']=={} and not g.get('ledgerFault')
assert not any(os.path.lexists('/var/lib/re7/campaign-operations/state.json'+s)for s in ['.lock','.uncertain'])
for mode in ['switch','return','return-partial']:
 subprocess.run(['sha256sum','-c','scripts.sha256'],cwd=OLD/mode,check=True,stdout=subprocess.DEVNULL)
oldmanifest=json.loads((OLD/'api-candidate-manifest.private.json').read_text())
for f in oldmanifest['files']:assert h(Path('/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z')/f['path'])==f['sha256'],'active_file_drift:'+f['path']
for f in oldmanifest['symlinks']:assert str((Path('/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z')/f['path']).readlink())==f['target'],'active_link_drift'
m=json.loads((IN/'overlay-manifest.json').read_text());assert h(IN/'api-result-truth-overlay.tar')==m['tarSha256']=='af8406ad2bab480cf45be552eaab2817bfafd6939c34a8dca217107d27bf9637'
for f in m['files']:assert h(B/f['path'])==f['originSha256'],'origin_drift:'+f['path']
free=os.statvfs(B).f_bavail*os.statvfs(B).f_frsize
size=int(subprocess.check_output(['du','-s','-B1',str(B)],text=True).split()[0])-int(subprocess.check_output(['du','-s','-B1',str(B/'node_modules')],text=True).split()[0])
budget=size+m['tarBytes']+16*1024*1024;assert free-budget>=2131755008,'staging_capacity_denied'
P.mkdir(mode=0o700);W=P/'window';W.mkdir(mode=0o700);app=R/'apps/whatsapp-agent';app.parent.mkdir(parents=True,mode=0o700)
shutil.copytree(B,app,symlinks=True,ignore=lambda path,names:['node_modules']if Path(path)==B else [])
(app/'node_modules').symlink_to(B/'node_modules',target_is_directory=True)
with tarfile.open(IN/'api-result-truth-overlay.tar')as t:
 assert {x.name for x in t.getmembers()}=={'apps/whatsapp-agent/'+f['path']for f in m['files']};assert all(x.isfile()for x in t.getmembers());t.extractall(R,filter='data')
for name in ['api-result-truth-overlay.tar','overlay-manifest.json']:shutil.copyfile(IN/name,P/name)
files=[];links=[];comparison=[]
for d,ds,ns in os.walk(app,followlinks=False):
 for n in ds+ns:
  f=Path(d)/n;rel=str(f.relative_to(app));base=B/rel
  if f.is_symlink():
   assert f.exists();links.append({'path':rel,'target':str(f.readlink()),'resolved':str(f.resolve())})
   assert base.is_symlink() and (str(f.resolve())==str(base.resolve())or rel=='node_modules'),'shared_link_drift'
  elif f.is_file():
   digest=h(f);origin=h(base);files.append({'path':rel,'sha256':digest,'bytes':f.stat().st_size});comparison.append({'path':rel,'originSha256':origin,'candidateSha256':digest,'changed':origin!=digest})
assert {x['path']for x in comparison if x['changed']}=={'src/http/routes.ts','dist/http/routes.js'},'unexpected_delta'
for f in m['files']:assert h(app/f['path'])==f['sha256']
subprocess.run(['/usr/bin/node','--check',str(app/'dist/http/routes.js')],check=True)
assert subprocess.check_output(['/usr/bin/node','--version'],text=True).strip()=='v20.20.0'
for rel in ['package.json','package-lock.json','prisma/schema.prisma','node_modules/.prisma/client/schema.prisma']:assert h(app/rel)==h(B/rel)
put(P/'api-candidate-manifest.private.json',{'candidate':str(app),'return':str(B),'files':files,'symlinks':links,'comparison':comparison,'dependencies':oldmanifest['reusedDependencies'],'activeManifestSha256':h(OLD/'api-candidate-manifest.private.json'),'overlay':m,'capacityBefore':free,'budget':budget,'capacityAfter':os.statvfs(app).f_bavail*os.statvfs(app).f_frsize})
# Copy only manifest-listed protocol inputs, never old intents/captures/certificates.
wm=json.loads((OLD/'window/sequencer-manifest.json').read_text())
dynamic={'initial.private.json','db-owner-bindings.private.json','path-bindings.private.json','preserved-frontend-config.private.json','backup-manifest.private.json','restore-result.json','mode-manifest-v4.json'}
for n,digest in wm['filesSha256'].items():
 assert h(OLD/'window'/n)==digest,'window_origin_drift:'+n
 if n in dynamic:continue
 (W/n).write_bytes((OLD/'window'/n).read_bytes().replace(str(OLD).encode(),str(P).encode()))
rows=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist']));live={x['name']:x for x in rows};assert set(live)=={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'}
source=json.loads((OLD/'switch/candidate.config.private.json').read_text())
front=next(x for x in source['apps']if x['name']=='re7-admin-front');row=live[front['name']];e=row['pm2_env']
sys.path.insert(0,str(IN));from preserved_frontend_environment import capture
front.update(cwd=e['pm_cwd'],script=e['pm_exec_path'],interpreter=e['exec_interpreter'],env=capture(row),args=e.get('args')or[],node_args=e.get('node_args')or[],instances=e['instances'],watch=e['watch'],namespace=e['namespace'],autorestart=e['autorestart'],stop_exit_codes=e.get('stop_exit_codes')or[])
assert e['autorestart'] is True and (Path(e['pm_cwd'])/'.next/BUILD_ID').read_text().strip()=='8OqIZZxaW7_ogf6h7AVoe'
for a in source['apps']:
 r=live[a['name']];e=r['pm2_env'];assert e['pm_cwd']==a['cwd'] and e['pm_exec_path']==a['script'] and e['status']=='online' and e['watch'] is False
 if a['name']!='re7-admin-front':
  env=dict(x.split('=',1)for x in Path('/proc',str(r['pid']),'environ').read_bytes().decode().split('\0')if '='in x)
  assert all(env.get(k)==str(v)for k,v in a['env'].items()),'source_env_drift:'+a['name']
put(W/'preserved-frontend-config.private.json',front)
target=json.loads(json.dumps(source));a=next(x for x in target['apps']if x['name']=='re7-whatsapp-agent');a.update(cwd=str(app),script=str(app/'dist/index.js'));a['env']['CAMPAIGN_BUILD_ID']='2ed9dccc490ad1bb9501f387efb09eebe574fef3'
modefiles={}
for mode in ['switch','return','return-partial']:
 d=P/mode;d.mkdir(mode=0o700);names=[x.split('  ',1)[1]for x in (OLD/mode/'scripts.sha256').read_text().splitlines()];assert len(names)==28
 skip={'baseline.private.json','backup-manifest.json','proof-bindings.private.json','candidate.config.private.json','return.config.private.json','candidate.ecosystem.config.cjs','return.ecosystem.config.cjs'}
 for n in names:
  if n not in skip:(d/n).write_bytes((OLD/mode/n).read_bytes().replace(str(OLD).encode(),str(P).encode()))
 for variant,cfg in [('candidate',target if mode=='switch'else source),('return',source if mode=='switch'else target)]:put(d/(variant+'.config.private.json'),cfg)
 modefiles[mode]=names
sys.path.insert(0,str(W));from ecosystem_contract import generate_mode
for mode in modefiles:generate_mode(P/mode)
proxy=json.loads(subprocess.check_output(['sudo','-n','/usr/bin/python3','-I','-S','/usr/local/libexec/re7/db-owner-set-observer.py']))
binding=json.loads((OLD/'window/db-owner-bindings.private.json').read_text());assert proxy['identity']==binding['proxyIdentity'] and proxy['exeSha256']==binding['proxySha256']
put(W/'db-owner-bindings.private.json',binding)
paths={str(Path(a['cwd'])/'.data'):str((Path(a['cwd'])/'.data').resolve())for cfg in [source,target]for a in cfg['apps']if a['name']!='re7-admin-front'}
assert all(Path(x).is_symlink() and Path(x).exists()for x in paths);put(W/'path-bindings.private.json',paths)
for n in ['re7-converta-backup.before','deploy.crontab.before']:
 value=Path('/etc/cron.d/re7-converta-backup').read_bytes()if n.startswith('re7')else subprocess.check_output(['crontab','-l']);assert value==(OLD/'window'/n).read_bytes();(W/n).write_bytes(value)
put(W/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']});(P/'execution-authorized').write_text('false\n')
from baseline_contract import capture_operational,capture_functional
initial=capture_operational(lambda:json.loads(Path('/var/lib/re7/campaign-operations/state.json').read_text()),lambda args:subprocess.check_output(args,text=True,timeout=15))
sql=subprocess.check_output(['/usr/bin/node','-e','process.stdout.write(require(process.argv[1]).sql)',str(OLD/'switch/preparation-bindings.cjs')],text=True)
q=json.loads(subprocess.check_output(['docker','exec','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='2s';SET LOCAL TIME ZONE 'UTC';"+sql+';ROLLBACK;'],text=True,timeout=20))
subprocess.run(['/usr/bin/node','-e',"require(process.argv[1]).noWork(JSON.parse(require('fs').readFileSync(0,'utf8')))",str(OLD/'switch/preparation-bindings.cjs')],input=json.dumps(q),text=True,timeout=15,check=True)
functional=capture_functional(q,front['cwd']);put(W/'initial.private.json',initial)
for mode in modefiles:put(P/mode/'baseline.private.json',functional)
# Fresh bindings preserve the historical frozen constraints, not an old observation.
put(W/'observed-inventory.private.json',q);put(W/'mode-names.private.json',modefiles)
for n in ['dump.pm2','dump.pm2.bak']:shutil.copyfile('/home/deploy/.pm2/'+n,W/('saved-'+n+'.private.json'))
assert h(W/'saved-dump.pm2.private.json')==h(W/'saved-dump.pm2.bak.private.json')
assert Path('/var/lib/re7/campaign-operations/state.json').read_bytes()==guard
put(P/'staging-result.private.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':len(files),'symlinks':len(links),'changedFiles':[x for x in comparison if x['changed']],'capacityBefore':free,'budget':budget,'capacityAfter':os.statvfs(app).f_bavail*os.statvfs(app).f_frsize,'allGatesFalse':True,'noProcessesStarted':True,'waitingFor':'fresh backup/restore binding and final manifests/policy'})
print('STAGED_SOURCE_DIST_ONLY_GATES_FALSE_NO_START')
