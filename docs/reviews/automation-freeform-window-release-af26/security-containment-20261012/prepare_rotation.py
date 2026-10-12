"""OFFLINE only. Generate private replacements/configs; never install/start/connect/revoke."""
import argparse,copy,hashlib,importlib.util,json,os,secrets,stat,sys
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,quote,unquote
LOCAL=('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET','WHATSAPP_VERIFY_TOKEN','CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY')
EXTERNAL=('META_APP_SECRET','META_INSTAGRAM_APP_SECRET','META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET','OPENAI_API_KEY','WHATSAPP_ACCESS_TOKEN')
PHASES={'auth':('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN'),'external':('META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET','WHATSAPP_VERIFY_TOKEN',*EXTERNAL),'database':('DATABASE_URL',),'cipher':('CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY')}
def require(ok,code):
 if not ok:raise ValueError(code)
def private_file(path):
 p=Path(path);s=p.lstat();require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_input_owner_mode_type');return json.loads(p.read_text())
def put(p,v):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(v,f,sort_keys=True,separators=(',',':'));f.write('\n');f.flush();os.fsync(f.fileno())
def changed_config(base,old,new,keys):
 result=copy.deepcopy(base);changes=[]
 for a in result['apps']:
  for k in keys:
   if k not in a['env']:continue
   require(a['env'][k]==old[k],'different_consumer_requires_separate_binding')
   require(isinstance(new[k],str)and len(new[k])>=32 and new[k]!=old[k],'new_secret_missing_weak_or_unchanged')
   a['env'][k]=new[k];changes.append([a['name'],k])
 require(next(a for a in result['apps']if a['name']=='re7-admin-front')==next(a for a in base['apps']if a['name']=='re7-admin-front'),'frontend_changed')
 return result,changes
def init(inventory,output,ecosystem):
 v=private_file(inventory);require(v['mode']=='READ_ONLY_PRIVATE_INVENTORY'and len(v['records'])==14,'attested_14_inventory_required')
 old={r['key']:r['value']for r in v['records']};require(len(old)==14,'duplicate_inventory_keys')
 p=Path(output);require(not p.exists()and not p.is_symlink(),'generation_exists');p.mkdir(mode=0o700)
 new={k:secrets.token_urlsafe(48)for k in LOCAL};parts=urlsplit(old['DATABASE_URL']);require(parts.hostname and parts.username and parts.password,'database_binding_invalid')
 dbpassword=secrets.token_urlsafe(48);host=parts.hostname
 if ':'in host:host='['+host+']'
 authority=quote(unquote(parts.username),safe='')+':'+quote(dbpassword,safe='')+'@'+host+(':'+str(parts.port)if parts.port else '')
 new['DATABASE_URL']=urlunsplit((parts.scheme,authority,parts.path,parts.query,parts.fragment));new.update({k:None for k in EXTERNAL})
 put(p/'original-values.private.json',old);put(p/'new-values.private.json',new);put(p/'source.config.private.json',v['sourceConfig'])
 put(p/'owner-input-required.private.json',{'values':{k:None for k in EXTERNAL},'proofs':{k:{'issuerConfirmed':False,'assetRef':None,'scope':None,'expiryOrNonExpiryEvidence':None,'replacementCreated':False,'oldRevocationState':None,'replacementMethod':None}for k in EXTERNAL},'appIdentifiers':v['appIdentifiers'],'noValuesInChat':True})
 put(p/'database-password.private.json',{'username':unquote(parts.username),'password':dbpassword,'oldPassword':unquote(parts.password),'host':parts.hostname,'port':parts.port,'database':parts.path.lstrip('/'),'noRolePrivilegeChange':True})
 spec=importlib.util.spec_from_file_location('canonical_ecosystem',ecosystem);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 cfg,changes=changed_config(v['sourceConfig'],old,new,PHASES['auth'])
 for mode in ('switch','return','return-partial'):
  d=p/mode;d.mkdir(mode=0o700)
  # Operational return keeps the NEW session/admin/control credentials, never re-enables exposed values.
  for variant in ('candidate','return'):
   bound=v['sourceConfig'] if mode=='switch' and variant=='return' else cfg
   put(d/(variant+'.config.private.json'),bound)
   fd=os.open(d/(variant+'.ecosystem.config.cjs'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'wb')as f:f.write(m.rendered(bound))
  m.validate_mode(d)
 put(p/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']})
 put(p/'rotation-plan.private.json',{'sourceConfigSha256':v['sourceConfigSha256'],'phase':'AUTH_LOCAL_CONFIG_COMPOSITION_ONLY_NOT_A_V4_WINDOW','changes':changes,'identities':v['identities'],'guard':v['guard'],'externalComplete':False,'cipherComplete':False,'databaseRoleChanged':False,'operationalBindingRequired':True,'safeReturn':'same functional bytes with new credentials; never old exposed authentication after cutover','expectedLogout':True})
 files=sorted(f for f in p.rglob('*')if f.is_file());put(p/'files.private.json',{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest()for f in files})
 print(json.dumps({'result':'LOCAL_AUTH_CONFIGS_READY_FOR_REVIEW_NOT_EXECUTABLE','files':len(files),'externalOwnerValuesRequired':5,'gatesFalse':True,'valuesPrinted':False}))
def import_owner(package,input_file):
 p=Path(package);v=private_file(input_file);old=private_file(p/'original-values.private.json');new=private_file(p/'new-values.private.json')
 require(set(v['values'])==set(EXTERNAL)and set(v['proofs'])==set(EXTERNAL),'owner_scope_invalid')
 for k in EXTERNAL:
  x=v['values'][k];e=v['proofs'][k];require(isinstance(x,str)and len(x)>=32 and x!=old[k],'replacement_missing_weak_or_old')
  require(e['issuerConfirmed']is True and e['replacementCreated']is True and e.get('oldRevocationState')in ['still_active','revoked_by_reset'] and e.get('replacementMethod')in ['issuance','reset'] and e.get('assetRef')and e.get('scope')and e.get('expiryOrNonExpiryEvidence'),'owner_issuer_scope_expiry_evidence_required');new[k]=x
 put(p/'external-values-complete.private.json',new);put(p/'owner-evidence.private.json',v['proofs']);print('OWNER_INPUT_IMPORTED_OFFLINE_NO_SUBMISSION_NO_REVOCATION')
if __name__=='__main__':
 a=argparse.ArgumentParser();sub=a.add_subparsers(dest='action',required=True)
 i=sub.add_parser('init');i.add_argument('--inventory',required=True);i.add_argument('--output',required=True);i.add_argument('--ecosystem-contract',required=True)
 i=sub.add_parser('import-owner');i.add_argument('--package',required=True);i.add_argument('--input',required=True)
 v=a.parse_args();os.umask(0o077)
 try:
  if v.action=='init':init(v.inventory,v.output,v.ecosystem_contract)
  else:import_owner(v.package,v.input)
 except Exception as e:
  print(json.dumps({'result':'OFFLINE_PREPARATION_DENIED','errorClass':type(e).__name__,'reason':'private_diagnostic_required','valuesPrinted':False}));raise SystemExit(1)
