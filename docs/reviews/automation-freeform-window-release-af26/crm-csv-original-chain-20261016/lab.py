"""Synthetic-only laboratory. No operational inputs/authority are emitted.
Reuse historical Fixture + restore/closure fixture producer; all execution uses
current composed consumers. System calls, root, PM2, DB, /proc and HTTP are fakes.
"""
import base64,copy,datetime,fcntl,hashlib,importlib.util,io,json,os,shutil,socket,stat,subprocess,sys,tempfile,types
from contextlib import ExitStack,redirect_stdout
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent;REVIEW=HERE.parent
PRIOR=REVIEW/'crm-csv-mode-closure-20261016';KIT=PRIOR/'static-kit'
BASE='d999ad969e66aa020a06593faba334a30d5eb292'
ORIGINAL='return-before-commit';API='re7-whatsapp-agent';WORKER='re7-whatsapp-web-worker';FRONT='re7-admin-front'
MODES=('switch','return','return-partial',ORIGINAL)

def sha(x):return hashlib.sha256(x).hexdigest()
def load(name,raw):
 m=types.ModuleType(name);m.__file__=name;sys.modules[name]=m;exec(compile(raw,name,'exec'),m.__dict__);return m

ACTIVE=[]
def audit(event,args):
 if event=='exec'and args:
  name=getattr(args[0],'co_filename','')
  for lab in ACTIVE:
   if str(name).startswith(str(lab.root)+'/'):
    relative=str(Path(name).relative_to(lab.root));lab.executed.append(relative)
    if relative.split('/')[0]in ('switch','return','return-partial'):raise RuntimeError('CANDIDATE_EXEC_FORBIDDEN')
sys.addaudithook(audit)

def pinned(path):
 path=Path(path);repo=HERE.parents[3]
 raw=subprocess.check_output(['git','show',BASE+':'+str(path.relative_to(repo))],cwd=repo)
 if raw!=path.read_bytes():raise RuntimeError('fixture_source_drift:'+path.name)
 return raw

def helpers():
 accepted=REVIEW/'crm-csv-integrated-recovery-20261016'
 for name in ('test_recovery.py','inputs.py','future_sources.py','recovery_contract.py','recovery.py','recovery_bridge.py','recovery_start.py','policy_proposal.py','original_checks.py','SOURCE_PROVENANCE.json'):pinned(accepted/name)
 for name in ('test_closure.py','compose.py','integration.py','lab_bootstrap.py'):pinned(PRIOR/name)
 sys.path.insert(0,str(accepted));import test_recovery as t
 sys.path.insert(0,str(PRIOR));import test_closure as prior
 return t,prior

class Lab:
 def __init__(self,prestop=False,kit=None):
  self.temp=tempfile.TemporaryDirectory(prefix='re7-original-full-');self.lab=Path(self.temp.name)
  self.t,self.prior=helpers();self.fx=self.t.Fixture(self.lab)
  self.root=self.fx.root;self.w=self.fx.w;self.saved=self.fx.saved
  self.kit=Path(kit)if kit else HERE/'static-kit';self.plan=json.loads((self.kit/'COMPOSITION.json').read_text());self.loaded=[];self.executed=[];self.verifiers={};self.effects=[];self.failure=None;self.after_api=None
  self.now=datetime.datetime.now(datetime.timezone.utc);self.prestop=prestop;self.depth=0
  self.original_run=subprocess.run;self.patches=ExitStack()
  # Upgrade synthetic data, not product source. NEWDB is a non-secret local URL.
  for profile in (self.fx.source,self.fx.target):
   for app in profile['apps']:app['env']['DATABASE_URL']='postgresql://synthetic:synthetic@127.0.0.1:15432/synthetic'
  self.fx.d.live={};self.fx.d.proc={}
  for app in self.fx.source['apps']:self.fx.d.add(app)
  self.fx.d.guard=lambda:{'version':1,'open':False,'generation':38,'tasks':{},'audit':[{'synthetic':True}],'ledgerFault':False}
  self.fx.d.proc['900']={'state':'S','ticks':'9000'}
  self.fx.policy['pm2Daemon']={'pid':900,'ticks':'9000'}
  self.fx.policy['sourceProcesses']={n:{'pid':a['pid'],'ticks':self.fx.d.identity(a['pid'])['ticks']}for n,a in self.fx.d.live.items()}
  self.fx.install_policy(self.fx.source)
  self.write('window/source.profile.private.json',self.fx.source);self.write('window/target.profile.private.json',self.fx.target)
  baseline={'guardGeneration':38,'apps':{n:{'pid':a['pid'],'identity':self.fx.d.identity(a['pid'])}for n,a in self.fx.d.live.items()}}
  self.write('window/csv-baseline.private.json',baseline)
  for mode in MODES:
   self.write(mode+'/candidate.config.private.json',self.fx.source if mode==ORIGINAL else self.fx.target)
   self.write(mode+'/return.config.private.json',self.fx.source if mode in ('switch',ORIGINAL)else self.fx.target)
   for variant in ('candidate','return'):
    raw=(self.root/mode/(variant+'.config.private.json')).read_bytes()
    self.put(mode+'/'+variant+'.ecosystem.config.cjs',self.t.ecosystem.rendered(json.loads(raw)))
  # Shared producer from the previous accepted tests, not an approval callback.
  self.node_hook=self.prior.Tests.sql_fixture(self).replace('"audit": [{"synthetic": true}]','"audit": [{"synthetic": true}], "ledgerFault": false').replace("!o.input.startsWith('BEGIN READ ONLY;SET LOCAL statement_timeout=8000;')||!o.input.endsWith(';ROLLBACK;')","!o.input.startsWith('BEGIN READ ONLY; ')||!o.input.endsWith('; ROLLBACK;')")
  for mode in MODES:
   self.write(mode+'/baseline.private.json',{'flags':[],'connected':[],'auth':[],'frontendBuild':'synthetic-front','observedAt':'2026-10-16T00:00:00+00:00'})
  bindings={'apiHttpPort':3001,'publishedPort':15432,'containerId':'synthetic-container','containerIp':'172.18.0.2',
     'observerSha256':'a'*64,'proxyIdentity':{'pid':901,'ticks':'9010'},'proxySha256':'b'*64}
  self.write('window/db-owner-bindings.private.json',bindings)
  # Non-empty original map, with genuine synthetic .data symlinks. This is
  # fixture creation before any seal, not adding links to sealed preparations.
  original_map={}
  for app in self.fx.source['apps'][:2]:
   target=self.lab/('shared-'+app['name']);target.mkdir()
   link=Path(app['cwd'])/'.data';link.symlink_to(target,target_is_directory=True)
   original_map[str(link)]=str(target)
  self.write('window/original-bindings/path-bindings.private.json',original_map)
  self.files={}
  # ORIGINAL + shared code only. Non-original directories retain DATA evidence.
  for n,row in self.plan['files'].items():
   if n.startswith('window/') or n.startswith(ORIGINAL+'/'):
    self.put(n,(self.kit/row['object']).read_bytes());self.files[n]=row
  for mode in ('switch','return','return-partial'):
   for p in (self.root/mode).glob('*.py'):p.unlink() # disposable synthetic fixture only
  shutil.rmtree(self.lab/'candidate') # no candidate runtime needed by original checker
  self.seal_data()
  self.authority=load('authority',self.raw('protected/authority.py'))
  self.transport=load('child_transport',self.raw('protected/child_transport.py'))
  self.loader_module=load('chain_verified_loader',self.raw('protected/verified_loader.py'))
  self.manifest={'files':{},'dependencies':{},'entries':{},'imports':{}}
  # Closure includes late imports, but NEVER candidate-mode executable code.
  def collect(n):
   if n in self.manifest['files']:return
   assert n.split('/')[0]not in ('switch','return','return-partial'),n
   raw=self.raw(n);p=self.put(n,raw);lang='commonjs'if n.endswith('.cjs')else'python'
   self.manifest['files'][n]={'sha256':sha(raw),'uid':os.getuid(),'mode':0o600,'language':lang}
   self.manifest['dependencies'][n]=[];self.manifest['imports'][n]=self.plan['imports'][n]
   for child in self.plan['imports'][n].values():collect(child)
  for n in ('window/recovery.py',ORIGINAL+'/ops.py',ORIGINAL+'/delegated.py',ORIGINAL+'/validate.cjs',ORIGINAL+'/open.cjs'):
   collect(n);self.manifest['entries'][n]='inspect'
  self.manifest['entries']['window/restore_contract.py']='inspect'
  self.manifest['entries'][ORIGINAL+'/baseline_contract.py']='inspect'
  # Dynamic requires are actual literal keys at the consumer; no path fallback.
  cfg=ORIGINAL+'/candidate.ecosystem.config.cjs'
  data=self.root/cfg;self.manifest['files'][cfg]={'sha256':sha(data.read_bytes()),'uid':os.getuid(),'mode':0o600,'language':'commonjs'}
  j=ORIGINAL+'/candidate.config.private.json';self.manifest['files'][j]={'sha256':sha((self.root/j).read_bytes()),'uid':os.getuid(),'mode':0o600,'language':'json'}
  self.manifest['dependencies'][j]=[];self.manifest['imports'][j]={};self.manifest['imports'][cfg]={}
  self.manifest['dependencies'][cfg]=[j,ORIGINAL+'/ecosystem_contract.py'];self.manifest['entries'][cfg]='recovery'
  for n in (ORIGINAL+'/validate.cjs',ORIGINAL+'/open.cjs'):
   self.manifest['imports'][n][str(data)]=cfg
  self.manifest['imports'][ORIGINAL+'/preparation-bindings.cjs']['restore_contract.py']='window/restore_contract.py'
  self.context(prestop)
  original_module=self.loader_module.Loader.module
  lab=self
  def observed(loader,path,**kw):
   lab.loaded.append(path)
   assert path.split('/')[0]not in ('switch','return','return-partial'),'CANDIDATE_CODE_LOADED:'+path
   m=original_module(loader,path,**kw)
   if not getattr(m,'__lab_configured__',False):
    lab.configure(path,m);m.__lab_configured__=True
   return m
  self.patches.enter_context(patch.object(self.loader_module.Loader,'module',observed))
  ACTIVE.append(self)
  self.loader=self.loader_module.Loader(self.ctx,'window/recovery.py',trusted_modules={'authority':self.authority,'child_transport':self.transport})
  # Raw OS virtualization does not replace Contract/Operations/verifier methods.
  self.virtualize()
  watched={'check_original','validate','__init__','certificate','old_absent','path_bindings','authorize_original_start','db_gate_for_start','verify','proof','validate_nft','unfence','finish','verify_recovery_closure','restore_deploy','verify_recovery_gates_false'}
  previous=sys.getprofile()
  def profile(frame,event,arg):
   if event=='call'and frame.f_code.co_name in watched and frame.f_code.co_filename.startswith(str(self.root)+'/'):
    key=str(Path(frame.f_code.co_filename).relative_to(self.root))+':'+frame.f_code.co_name
    self.verifiers[key]=self.verifiers.get(key,0)+1
  sys.setprofile(profile);self.patches.callback(sys.setprofile,previous)
  self.recovery=self.loader.module('window/recovery.py')
  self.controller=self.recovery.build(self.root,self.ctx)
  self.sysmod=self.loader.mode_module(ORIGINAL)
  self.sysmod.Operations(self.root/'switch',self.sysmod.System()) # evidence directory, ORIGINAL code
  if not prestop:
   self.make_exit()
  else:self.fx.save({x['name']:x for x in self.fx.source['apps']})
 def raw(self,n):return (self.kit/self.plan['files'][n]['object']).read_bytes()
 def put(self,n,raw):
  p=self.root/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);p.chmod(0o600);return p
 def write(self,n,v):return self.put(n,(json.dumps(v)+'\n').encode())
 def seal_data(self):
  # New synthetic seals only, BEFORE Context. Keep required R2 data population.
  mm={'modeFiles':{},'modeManifests':{}};names={}
  data=['baseline.private.json','plan.private.json','candidate.config.private.json','return.config.private.json',
    'candidate.ecosystem.config.cjs','return.ecosystem.config.cjs','backup-manifest.json','proof-bindings.private.json']
  for mode in MODES:
   chosen=list(data)
   if mode==ORIGINAL:chosen+=sorted(p.name for p in (self.root/mode).iterdir() if p.suffix in ('.py','.cjs') and p.name not in chosen)
   names[mode]=chosen;mm['modeFiles'][mode]={n:sha((self.root/mode/n).read_bytes())for n in chosen}
   self.put(mode+'/scripts.sha256',''.join(h+'  '+n+'\n'for n,h in mm['modeFiles'][mode].items()).encode())
   mm['modeManifests'][mode]=sha((self.root/mode/'scripts.sha256').read_bytes())
  self.write('window/mode-names.private.json',names);self.write('window/mode-manifest-v4.json',mm)
  seal=self.t.c.read(self.w/'recovery-contract.private.json')
  seal['codeSha256']={n:sha((self.w/n).read_bytes())for n in seal['codeSha256']}
  seal['originalBindingsSha256']=sha((self.w/'original-bindings/path-bindings.private.json').read_bytes())
  seal['sourceProfileSha256']=sha((self.w/'source.profile.private.json').read_bytes());seal['targetProfileSha256']=sha((self.w/'target.profile.private.json').read_bytes())
  seal['filesSha256']={n:sha((self.root/n).read_bytes())for n in seal['filesSha256']}
  spec=self.t.c.read(self.w/'csv-contract.private.json');spec.update(sourceProfileSha256=seal['sourceProfileSha256'],targetProfileSha256=seal['targetProfileSha256'])
  self.write('window/csv-contract.private.json',spec)
  self.write('window/sequencer-manifest.json',{'preparation':str(self.root),'filesSha256':seal['codeSha256']})
  rows=set(seal['filesSha256'])|{'window/csv-contract.private.json','window/sequencer-manifest.json','window/original-bindings/path-bindings.private.json','window/db-owner-bindings.private.json','window/event-consumer-binding.private.json'}
  rows|={m+'/'+n for m,fs in mm['modeFiles'].items()for n in fs}|{m+'/scripts.sha256'for m in MODES}
  self.put('original-preparation-review.sha256',''.join(sha((self.root/n).read_bytes())+'  '+n+'\n'for n in sorted(rows)).encode())
  for n,key in [('csv-contract.private.json','originalCanonicalSha256'),('sequencer-manifest.json','originalSequencerManifestSha256')]:seal[key]=sha((self.w/n).read_bytes())
  seal['originalReviewSha256']=sha((self.root/'original-preparation-review.sha256').read_bytes())
  self.write('window/recovery-contract.private.json',seal)
 def context(self,prestop):
  a=self.authority;anchor={'version':1,'preparation':str(self.root),'contractSha256':sha((self.w/'recovery-contract.private.json').read_bytes()),
   'policySha256':self.fx.policy_hash,'codeManifestSha256':sha(a.canonical(self.manifest)),
   'profileSha256':{d:sha((self.w/(n+'.profile.private.json')).read_bytes())for d,n in [('ORIGINAL','source'),('CANDIDATE','target')]}}
  self.bundle={'result':'ROOT_RECOVERY_AUTHORITY_READ','queryOnly':True,'anchor':anchor,'anchorSha256':sha(a.canonical(anchor)),
    'permit':None,'permitSha256':None,'manifest':self.manifest,'livePolicySha256':self.fx.policy_hash,'livePhase':'fenced'}
  if not prestop:
   permit={'anchorSha256':self.bundle['anchorSha256'],'preparation':str(self.root),'contractSha256':anchor['contractSha256'],'policySha256':self.fx.policy_hash,
    'targetProfileSha256':anchor['profileSha256']['ORIGINAL'],'decision':'ORIGINAL','phase':'fenced','executionIntentSha256':sha((self.w/'csv-execution.intent.private.json').read_bytes()),'capturedUtc':self.now.isoformat()}
   self.bundle.update(permit=permit,permitSha256=sha(a.canonical(permit)))
   self.put('window/recovery-policy-permit.private.json',a.canonical(permit))
  self.ctx=a.Context(lambda:a.canonical(self.bundle),now=lambda:self.now);self.ctx.correlation()
 def configure(self,path,m):
  if path=='window/sequencer.py':
   def namespace(obj,root):
    assert Path(root)==self.root;obj.root=self.root;obj.window=self.w;obj.switch=self.root/'switch'
   m.Bridge.__init__=namespace # only mapping fixed productive namespace to lab
  if path=='window/recovery_bridge.py':m.Bridge.SAVED_ROOT=self.saved
  if path.endswith('/delegated.py'):m.BOUND_PREPARATION=self.root
  if path.endswith('/ops.py'):
   m.System.proxy_socket_inventory=lambda obj,expected:self.proxy()
   m.System.api_socket_inventory=lambda obj,pid:self.empty_sockets()
   m.System.capture_auth=lambda obj,*args:self.effects.append('synthetic-custody-after-exit')
   m.System.wait=lambda obj:None
  if path.endswith('/pm2_input.py'):
   alias=self.lab/'pm2-input.json'
   if not alias.exists():alias.symlink_to('/proc/self/fd')
   m.ALIAS=alias
 def empty_sockets(self):return {k:[]for k in ('tcp','tcp6','udp','udp6','unix')}
 def proxy(self):
  b=json.loads((self.w/'db-owner-bindings.private.json').read_text());s=self.empty_sockets();s['tcp']=[{'local':['127.0.0.1',15432],'peer':['0.0.0.0',0],'state':'0A','inode':'1'}]
  return {'identity':b['proxyIdentity'],'exeSha256':b['proxySha256'],'args':['/synthetic/docker-proxy','-proto','tcp','-host-ip','127.0.0.1','-host-port','15432','-container-ip','172.18.0.2','-container-port','5432'],'sockets':s}
 def make_exit(self):
  # Exact ORIGINAL Operations used even to create the synthetic prior exit.
  op=self.sysmod.Operations(self.root/'switch',self.sysmod.System());op.stop()
  self.exit_imports('switch')
 def exit_imports(self,mode):
  self.write('window/csv-imports-'+mode+'-after-exit.private.json',{'basis':'AUDIT_AND_EXECUTOR_EXIT','scopeComplete':True,'observationComplete':True,'underFence':True,'exitCertificateSha256':sha((self.root/mode/'old-exit-confirmed.json').read_bytes()),'operations':[]})
 def close(self):
  if getattr(self,'closed',False):return
  self.capture_summary();self.closed=True
  if self in ACTIVE:ACTIVE.remove(self)
  self.patches.close();self.temp.cleanup()
 def capture_summary(self):
  # Sanitized names/counts only; never archive fixture profiles or payloads.
  child=self.lab/'child-executed.jsonl'
  self.summary={'verifierCalls':dict(sorted(self.verifiers.items())),'pythonExecuted':sorted(set(self.executed)),'loaderPaths':sorted(set(self.loaded)),
   'childExecuted':sorted({next(iter(json.loads(x).values()))for x in child.read_text().splitlines()})if child.exists()else[],
   'startCalls':[x for x in self.fx.d.calls if x.startswith('start:')],
   'candidateCodeLoaded':any(n.split('/')[0]in ('switch','return','return-partial')for n in self.loaded+self.executed),
   'cronsRestored':self.fx.crons=={'deploy':'before-deploy','system':'before-system'},
   'supervisionRestored':self.fx.supervision=='ActiveState=inactive\nUnitFileState=enabled\n','barrierAbsent':not self.fx.fenced,
   'intentExists':(self.w/'csv-recovery.intent.private.json').exists(),'receiptExists':(self.w/'csv-recovery.receipt.private.json').exists(),
   'bindingEntries':len(json.loads((self.w/'original-bindings/path-bindings.private.json').read_text()))if(self.w/'original-bindings/path-bindings.private.json').exists()else 0,
   'dataEvidencePreserved':all((self.root/m/n).is_file()for m in MODES for n in ('plan.private.json','candidate.config.private.json','return.config.private.json','baseline.private.json','scripts.sha256'))}
 def virtualize(self):
  real_read=Path.read_text;real_bytes=Path.read_bytes;real_resolve=Path.resolve;real_isfile=Path.is_file;real_isdir=Path.is_dir;real_iter=Path.iterdir;real_stat=Path.stat;real_lstat=Path.lstat
  def virtual(p):
   s=str(p)
   if s=='/home/deploy/.pm2/pm2.pid':return '900'
   if s=='/etc/cron.d/re7-converta-backup':return self.fx.crons['system']
   if s=='/var/lib/re7/campaign-operations/state.json':return json.dumps(self.fx.d.guard())
   if s.startswith('/proc/net/'):return 'synthetic header\n'
   if s.startswith('/proc/'):
    bits=Path(s).parts;pid=bits[2];state=self.fx.d.proc.get(pid)
    if not state:raise FileNotFoundError(s)
    if bits[-1]=='stat':return pid+' (synthetic) '+state['state']+' '+'0 '*18+state['ticks']+'\n'
    if bits[-1]=='environ':
     app=next(a for a in self.fx.d.live.values()if str(a['pid'])==pid)
     return '\0'.join(k+'='+str(v)for k,v in app['cfg']['env'].items())
   return None
  def read(p,*args,**kw):
   v=virtual(p);return real_read(p,*args,**kw)if v is None else v
  def readbytes(p):
   v=virtual(p);return real_bytes(p)if v is None else v.encode()
  def resolve(p,*args,**kw):
   bits=p.parts
   if len(bits)==4 and bits[1]=='proc' and bits[-1]in ('cwd','exe'):
    app=next(a for a in self.fx.d.live.values()if str(a['pid'])==bits[2]);return Path(app['cfg']['cwd'if bits[-1]=='cwd'else'interpreter'])
   return real_resolve(p,*args,**kw)
  def isfile(p):return True if str(p)=='/home/deploy/.pm2/pm2.pid'else real_isfile(p)
  def isdir(p):return True if str(p).startswith('/proc/')else real_isdir(p)
  def iterdir(p):return iter(())if str(p).startswith('/proc/')and p.name=='fd'else real_iter(p)
  alias=self.lab/'pm2-input.json'
  def meta(p,*a,**k):
   if str(p).startswith('/proc/'):
    return types.SimpleNamespace(st_uid=os.getuid(),st_mode=stat.S_IFDIR|0o700)
   return real_stat(p,*a,**k)
  def lmeta(p,*a,**k):
   v=real_lstat(p,*a,**k)
   if p==alias or p in alias.parents:
    row=list(v);row[4]=0
    if p!=alias:row[0]=stat.S_IFDIR|0o755
    return os.stat_result(row)
   return v
  for name,fn in [('read_text',read),('read_bytes',readbytes),('resolve',resolve),('is_file',isfile),('is_dir',isdir),('iterdir',iterdir),('stat',meta),('lstat',lmeta)]:self.patches.enter_context(patch.object(Path,name,fn))
  self.patches.enter_context(patch.object(os,'getpgid',lambda pid:pid));self.patches.enter_context(patch.object(os,'getsid',lambda pid:pid))
  self.patches.enter_context(patch.object(socket,'create_connection',side_effect=ConnectionRefusedError('synthetic fence')))
  import urllib.request
  def response(req,*a,**k):
   assert req.full_url=='http://127.0.0.1:3500/health' and req.get_method()=='GET'
   value=io.BytesIO(b'{"ok":true}');value.status=200;return value
  self.patches.enter_context(patch.object(urllib.request,'urlopen',response))
  self.patches.enter_context(patch.object(subprocess,'run',self.run))
 def fence(self):
  return {'nftables':[{'table':{'family':'inet','name':'re7_campaign_transition'}},{'chain':{'family':'inet','table':'re7_campaign_transition','name':'api_input','type':'filter','hook':'input','prio':-10,'policy':'accept'}},{'rule':{'family':'inet','table':'re7_campaign_transition','chain':'api_input','expr':[{'match':{'op':'==','left':{'payload':{'protocol':'tcp','field':'dport'}},'right':{'set':[3000,3001]}}},{'reject':{'type':'tcp reset'}}]}}]}
 def external(self,args,text=None,pass_fds=()):
  d=self.fx.d;args=list(map(str,args));self.effects.append(args[0]+':'+(args[1]if len(args)>1 else''))
  if args==['crontab','-l']:return self.fx.crons['deploy']
  if args==['crontab','-']:self.fx.crons['deploy']=text;return ''
  if args==['cat','/etc/cron.d/re7-converta-backup']:return self.fx.crons['system']
  if args[0]=='systemctl':return self.fx.supervision if 'ActiveState,UnitFileState'in args[-1]else'UnitFileState=disabled\n'
  if args[:2]==['ps','-eo']:return '\n'.join(pid+' 1'for pid in d.proc)
  if args[0].endswith('/pm2'):
   if args[1]=='jlist':
    for app in d.live.values():app['pm2_env'].update(pm_cwd=app['cfg']['cwd'],pm_exec_path=app['cfg']['script'])
    return json.dumps(list(d.live.values()))
   if args[1]=='delete':d.delete(args[2]);return ''
   if args[1]=='save':self.fx.save({x['name']:x['cfg']for x in d.live.values()});return ''
   if args[1]=='start':
    assert len(pass_fds)==1;fd=pass_fds[0];assert Path(args[2]).name==str(fd)
    seals=fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL
    assert fcntl.fcntl(fd,fcntl.F_GET_SEALS)&seals==seals
    self.effects.append('sealed-FD-consumed')
    cfg=json.loads(os.pread(fd,os.fstat(fd).st_size,0));name=args[-1]
    d.calls.append('start:'+name);d.add(next(x for x in cfg['apps']if x['name']==name))
    if self.after_api and name==API:self.after_api()
    if self.failure=='start-lost':raise TimeoutError('synthetic PM2 response lost after effect')
    return ''
  if args[:3]==['install','-m','600']:(self.saved/'dump.pm2.bak').write_bytes((self.saved/'dump.pm2').read_bytes());return ''
  if args[0]=='cmp':assert (self.saved/'dump.pm2').read_bytes()==(self.saved/'dump.pm2.bak').read_bytes();return ''
  if args[0]=='docker':
   if args[1]=='inspect':return json.dumps([{'Id':'synthetic-container','State':{'Running':True},'NetworkSettings':{'Networks':{'lab':{'IPAddress':'172.18.0.2','GlobalIPv6Address':''}},'Ports':{'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'15432'}]}}}])
   if 'SELECT count(*) FROM "Event"'in(text or''):return str(self.fx.admissions)
   if 'backends'in(text or''):return json.dumps({'backends':[],'advisoryLocks':0})
   if 'otherClientBackends'in(text or''):return json.dumps(d.db)
   raise AssertionError('unmodeled SQL')
  if args[:1]==['sudo']:
   action=args[-1]
   if action in ('check-present','check-absent','abort-prestop','authorize-return','unfence','restore-controls'):
    if action=='check-present':assert self.fx.fenced
    if action=='check-absent':assert not self.fx.fenced
    if action in ('unfence','abort-prestop'):
     self.fx.fenced=False;self.bundle['livePhase']='unfenced'
     if self.failure=='unfence-lost':raise subprocess.TimeoutExpired(args,1)
    if action in ('restore-controls','abort-prestop'):
     self.fx.crons['system']='before-system';self.fx.supervision='ActiveState=inactive\nUnitFileState=enabled\n'
     self.bundle['livePhase']='complete'
    return json.dumps(self.fence()if self.fx.fenced else{'nftables':[]})
   if 'nft'in args:return json.dumps(self.fence())
  raise AssertionError('unmodeled external effect:'+str(args))
 def child(self,args,text):
  # Execute concrete delegated entry/main with actual nonce, locks and consumption.
  i=args.index('python');entry=args[i+1];rest=args[i+2:];corr=json.loads(rest[rest.index('--authority-correlation')+1]);argv=rest[rest.index('--')+1:]
  self.ctx.accept_correlation(corr)
  child=self.loader_module.Loader(self.ctx,entry,trusted_modules={'authority':self.authority,'child_transport':self.transport})
  m=child.module(entry);old=sys.argv;sys.argv=[str(self.root/entry),*argv]
  try:
   with redirect_stdout(io.StringIO())as out,patch.object(sys,'stdin',io.StringIO(text or'')),m.operation_lock(Path(argv[2])):m.main()
   if argv[0]=='execute'and argv[1]=='recover-partial':self.exit_imports(ORIGINAL)
   return out.getvalue()
  except Exception as error:
   self.last_error=repr(error);raise
  finally:sys.argv=old
 def run(self,args,*a,**kw):
  if isinstance(args,str):raise AssertionError('shell forbidden')
  if args[:1]==['/usr/bin/python3']and 'python'in args:return subprocess.CompletedProcess(args,0,self.child(args,kw.get('input')),'')
  if len(args)>5 and args[0]=='/usr/bin/env'and '/usr/local/libexec/re7/recovery-node-launch.cjs'in args:
   return self.node(args)
  text=self.external(args,kw.get('input'),kw.get('pass_fds',()))
  # subprocess.check_output relies on run's stdout type.
  if not kw.get('text')and not kw.get('encoding'):text=text.encode()
  return subprocess.CompletedProcess(args,0,text,''if isinstance(text,str)else b'')
 def node(self,args):
  library=self.lab/'library';library.mkdir(exist_ok=True)
  mapping={'authority':'authority.py','verified_loader':'verified_loader.py','child_transport':'child_transport.py','privileged_output':'privileged_output.py','bootstrap':'recovery-launch.py'}
  state={'bundle':self.bundle,'library':str(library),'libraries':{},'trace':str(self.lab/'child-executed.jsonl')}
  for name,file in mapping.items():
   raw=self.raw('protected/'+file);(library/(name+'.py')).write_bytes(raw);state['libraries'][name]=sha(raw)
  boot=library/'node.cjs';boot.write_bytes(self.raw('protected/recovery-node-launch.cjs'))
  state_path=self.lab/'node-state.json';state_path.write_text(json.dumps(state))
  i=args.index('/usr/local/libexec/re7/recovery-node-launch.cjs');entry=args[i+1];rest=args[i+2:]
  population=copy.deepcopy(list(self.fx.d.live.values()))
  for app in population:app['pm2_env'].update(pm_cwd=app['cfg']['cwd'],pm_exec_path=app['cfg']['script'])
  hook=self.node_hook+"\nconst fallback=cp.execFileSync;cp.execFileSync=function(c,a,o){if(c==='/home/deploy/.npm-global/bin/pm2'&&a.join(' ')==='jlist')return JSON.stringify("+json.dumps(population)+");return fallback(c,a,o)};\n"
  build=self.fx.source['apps'][0]['env']['CAMPAIGN_BUILD_ID']
  hook+="globalThis.fetch=async function(u,o={}){if((o.method||'GET')!=='GET')throw Error('LAB_MUTABLE_HTTP_FORBIDDEN');if(!['http://127.0.0.1:3001/health','https://converta.re7online.com/agent-api/health','https://api.re7online.com/health','http://127.0.0.1:3001/admin/ops/campaign-execution','http://127.0.0.1:3000/app/inbox','https://converta.re7online.com/app/inbox','https://converta.re7online.com/app/settings/inbox','http://127.0.0.1:3500/health'].includes(u))throw Error('LAB_HTTP_SCOPE');return {status:200,json:async()=>u.endsWith('/admin/ops/campaign-execution')?{available:true,open:false,drained:true,ledgerFault:false,tasks:[],generation:38,build:"+json.dumps(build)+"}:{ok:true,db:'ok'},text:async()=>'synthetic-front'}};\n"
  hook+="const vm=require('node:vm'),compile=vm.runInThisContext;vm.runInThisContext=function(code,o){if(o&&o.filename&&o.filename.startsWith("+json.dumps(str(self.root)+'/')+")){const n=o.filename.slice("+str(len(str(self.root))+1)+");if(['switch','return','return-partial'].includes(n.split('/')[0]))throw Error('CANDIDATE_EXEC_FORBIDDEN');fs.appendFileSync("+json.dumps(str(self.lab/'child-executed.jsonl'))+",JSON.stringify({node:n})+'\\n')}return compile.call(this,code,o)};\n"
  runner=self.lab/'node-runner.cjs'
  runner.write_text("const fs=require('node:fs'),cp=require('node:child_process');\n"+hook+"\nrequire("+json.dumps(str(boot))+").run("+json.dumps(entry)+","+json.dumps(rest)+",(c,o)=>cp.execFileSync('/usr/bin/python3',['-B','-I','-S',"+json.dumps(str(HERE/'node_child.py'))+","+json.dumps(str(state_path))+",...c],o));")
  r=self.original_run([shutil.which('node'),str(runner)],text=True,capture_output=True,timeout=30)
  self.effects.append('real-node:'+entry)
  if r.returncode:raise subprocess.CalledProcessError(r.returncode,args,output=r.stdout,stderr=r.stderr)
  return subprocess.CompletedProcess(args,0,r.stdout,r.stderr)
