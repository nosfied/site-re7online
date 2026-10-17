"""Review-only future owner-operated maintenance; no effects at import.
Reuse byte-pinned preflight transport libraries and canonical custody.
"""
import base64,datetime,hashlib,json,os,re,shlex,stat,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'scripts/crm_csv_delivery/event_mode_maintenance.source'
SOURCE_SHA='9b7e8f1af3952a1df86775f001eb5a52791f780cf792f939d32ad4f82b4d0052'
BOOT=ROOT/'scripts/crm_csv_delivery/preflight_xattr.py'
BOOT_SHA='1de0e5025c8f27d0dd12f0698eccc3b839748af142e014dc4275d11fb0587a21'
OBSERVED=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-xattr-preflight-20261017-v1')
OBSERVED_SHA='971d5d397de694e2aec5bb09690a7500d9001b3c393f879e38186639834f54d3'
REMOTE='/dev/shm/re7-csv-event-mode-maintenance-20261017-v1'
LOCAL=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody')
PREDICATE=ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-b4-20261016/static-kit/objects/208f2ef53e3ba5c208006022c85bbf537961ddf339fe8894c07553ce1b626c2b.source'
PREDICATE_SHA='208f2ef53e3ba5c208006022c85bbf537961ddf339fe8894c07553ce1b626c2b'

def libraries():
 # Same byte/FD bootstrap; paths are literal, not env/CLI authority.
 for q in (BOOT,*BOOT.parents):assert not q.is_symlink(),'bootstrap_symlink'
 m=BOOT.lstat();assert stat.S_ISREG(m.st_mode) and m.st_nlink==1 and m.st_size<65536
 def meta(s):return tuple(getattr(s,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
 fd=os.open(BOOT,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  assert meta(os.fstat(fd))==meta(m);raw=os.read(fd,65536)
  assert meta(os.fstat(fd))==meta(m)==meta(BOOT.lstat())
 finally:os.close(fd)
 assert hashlib.sha256(raw).hexdigest()==BOOT_SHA
 ns={'__name__':'pinned_transport_library','__file__':str(BOOT)};exec(compile(raw,str(BOOT),'exec'),ns)
 b=ns['transport']()['boundary']();return b,b['libraries']()

def plan_from_custody(lib):
 lib['directory'](OBSERVED)
 blobs={}
 for name in ('csv-event-preflight.stdout.private','csv-event-preflight.stderr.private','privileged-output.private.jsonl','sequencer.journal.jsonl'):
  raw,m=lib['stable_file'](OBSERVED/name);assert m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600;blobs[name]=raw
 raw=blobs['csv-event-preflight.stdout.private'];assert hashlib.sha256(raw).hexdigest()==OBSERVED_SHA
 row=json.loads(blobs['privileged-output.private.jsonl']);receipt=json.loads(blobs['sequencer.journal.jsonl'])
 for key in ('stdout','stderr'):
  blob=blobs['csv-event-preflight.'+key+'.private'];assert base64.b64decode(row[key+'Base64'])==blob and row[key+'Sha256']==hashlib.sha256(blob).hexdigest() and row[key+'Bytes']==len(blob)
 assert row['exitCode']==0 and receipt['sourceComplete'] is True
 value=json.loads(raw);assert value['readComplete'] and len(value['observations'])==5
 for target in value['observations']:
  assert target['complete'] and len(target['attributes'])==2
  assert all(a['state']=='NO_DATA_ABSENT_OR_NOT_VISIBLE' and a['errno']==61 for a in target['attributes'])
 return {'sourceSha256':OBSERVED_SHA,'sourceStartedUtc':value['startedUtc'],'sourceFinishedUtc':value['finishedUtc'],
         'targets':[x['path'] for x in value['observations']], 'expected':{x['path']:x['metadata'] for x in value['chainObserved']}}

def owner_coordination(action):
 if action=='inspect':return None
 # Only future explicitly authorized invocation prompts the owner; current preparation never calls this.
 with open('/dev/tty','r') as tty:
  def ask(label):
   print(label,flush=True);s=tty.readline().strip();assert s,'coordination_empty';return s
  commit=ask('SHA completo da revisão cuja manutenção foi autorizada:');assert re.fullmatch('[0-9a-f]{40}',commit)
  maintainers=ask('Owner e mantenedores: nomes/UIDs/canais sob sua coordenação (sem segredos):')
  refs=ask('Sessões/jobs de Git/npm/checkout/staging suspensos ou concluídos: referências e responsáveis:')
  method=ask('Como cada mantenedor confirmou saída e bloqueio de novos lançamentos até liberação:')
  phrase='APLICAR_SOMENTE_GW_CINCO_PAIS' if action=='apply' else 'RETORNAR_SOMENTE_EFEITOS_COMPROVADOS'
  assert ask('Após conferir autorização e coordenação efetivas, digite '+phrase+':')==phrase,'owner_not_confirmed'
 return {'action':action,'owner':'Deifson','operatorUid':1000,'authorizedCommit':commit,'maintainers':maintainers,
  'sessionJobReferences':refs,'confirmationMethod':method,'allRelevantMaintainersAcknowledged':True,
  'noFilesystemMaintenanceInFlight':True,'noNewMaintenanceUntilRelease':True,
  'confirmedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}

def program(source,reader,writer,predicate,plan,coord,action):
 pins=[(source,SOURCE_SHA),(reader,'66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),(writer,'93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a'),(predicate,PREDICATE_SHA)]
 for raw,h in pins:assert hashlib.sha256(raw).hexdigest()==h,'source_digest'
 body='import base64,hashlib,json\nscopes=[]\n'
 for raw,h in pins:
  body+="raw=base64.b64decode(%r);assert hashlib.sha256(raw).hexdigest()==%r\ns={'__name__':'authenticated_library'};exec(compile(raw,'<reviewed library>','exec'),s);scopes.append(s)\n"%(base64.b64encode(raw).decode(),h)
 body+="s,lib,writer,pred=scopes\ns.update(meta=lib['meta'],lib_directory=lib['directory'],lib_new_directory=lib['new_directory'],lib_stable_file=lib['stable_file'],private_record=writer['private_record'],event_parents=pred['event_parents'],EVENT_SOURCE=pred['EVENT_SOURCE'],EXPECTED_CUSTODY_SHA=%r)\n"%OBSERVED_SHA
 body+="plan=json.loads(%r);coord=json.loads(%r)\nraise SystemExit(s['run'](%r,plan,coord,lib['Path'](%r)))\n"%(json.dumps(plan),json.dumps(coord),action,REMOTE)
 return body

def execute(action):
 assert action in ('apply','inspect','return')
 b,(lib,Capture,record)=libraries();plan=plan_from_custody(lib)
 folder=lib['new_directory'](LOCAL/('csv-event-mode-'+action+'-20261017-v1'));cap=Capture(folder)
 start=lib['utc']();out=err=b'';code=None;error=None;argv=['local-source-and-owner-preflight']
 try:
  coord=owner_coordination(action)
  source,_=lib['stable_file'](SOURCE);reader,_=lib['stable_file'](b['REVIEW']/'crm-csv-r2-directed-20261017/read_package.py')
  writer,_=lib['stable_file'](b['REVIEW']/'crm-csv-r2-directed-20261017/privileged_output.source');predicate,_=lib['stable_file'](PREDICATE)
  body=program(source,reader,writer,predicate,plan,coord,action)
  argv=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',b['HOST'],'/usr/bin/python3 -B -I -S -c '+shlex.quote(body)]
  result=subprocess.run(argv,capture_output=True,timeout=45,check=False);code,out,err=result.returncode,result.stdout,result.stderr
 except subprocess.TimeoutExpired as e:error=e;out=e.stdout or b'';err=e.stderr or b''
 except Exception as e:error=e;err=type(e).__name__.encode()
 cap.bytes('csv-event-mode-'+action,argv,start,lib['utc'](),code,out,err,error)
 print(json.dumps({'result':'EVENT_MODE_CHANNELS_PRESERVED','action':action,'exitCode':code,'errorClass':None if error is None else type(error).__name__,'automaticNextAction':False}))
 return 0 if code==0 and error is None else 1
