"""READ ONLY collector. Full stdout is PRIVATE: must run under private_command_capture."""
import datetime, hashlib, json, os, pwd, grp, stat, struct, subprocess
from pathlib import Path
BASE=Path('/opt/re7online/backups/converta-persistent/preparations')
SOURCE=BASE/'incident-6683-v4-dynamic-compatible-20261012T184200Z/switch/return.config.private.json'
KEYS={'DATABASE_URL':'database','APP_AUTH_SECRET':'session','CHANNEL_ACCOUNT_SECRET_KEY':'cipher','MFA_SECRET_ENCRYPTION_KEY':'cipher','WEBHOOK_SECRET_ENCRYPTION_KEY':'cipher','META_APP_SECRET':'external','META_INSTAGRAM_APP_SECRET':'external','META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET':'external','META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET':'oauth_state','OPENAI_API_KEY':'external','WHATSAPP_ACCESS_TOKEN':'external','WHATSAPP_VERIFY_TOKEN':'verification','ADMIN_TOKEN':'internal','WHATSAPP_WEB_WORKER_CONTROL_TOKEN':'internal'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def acl(path):
 try:raw=os.getxattr(path,'system.posix_acl_access')
 except OSError as e:
  if e.errno in [61,95]:return None
  raise
 if struct.unpack_from('<I',raw)[0]!=2:raise RuntimeError('acl_format_unknown')
 return [dict(zip(['tag','permissions','id'],struct.unpack_from('<HHI',raw,i)))for i in range(4,len(raw),8)]
def permissions(path,uid,gids):
 info=path.stat();a=acl(path)
 if uid==0:return 7
 if a:
  mask=next((e['permissions']for e in a if e['tag']==16),7)
  if uid==info.st_uid:return next(e['permissions']for e in a if e['tag']==1)
  named=[e['permissions']for e in a if e['tag']==2 and e['id']==uid]
  if named:return named[0]&mask
  matched=[e['permissions']for e in a if (e['tag']==4 and info.st_gid in gids)or(e['tag']==8 and e['id']in gids)]
  if matched:
   value=0
   for q in matched:value|=q
   return value&mask
  return next(e['permissions']for e in a if e['tag']==32)
 mode=stat.S_IMODE(info.st_mode)
 return (mode>>6)&7 if uid==info.st_uid else (mode>>3)&7 if info.st_gid in gids else mode&7
users=[]
for u in pwd.getpwall():
 gids={u.pw_gid}|{g.gr_gid for g in grp.getgrall()if u.pw_name in g.gr_mem}
 users.append({'uid':u.pw_uid,'name':u.pw_name,'gids':sorted(gids),'interactive':u.pw_shell not in ['/usr/sbin/nologin','/bin/false','/sbin/nologin']})
def observe():
 paths=[Path('/home/deploy/.pm2/dump.pm2'),Path('/home/deploy/.pm2/dump.pm2.bak')]
 result=[]
 for f in paths:
  chain=list(reversed(f.parents))+[f]
  for q in chain:
   if q.is_symlink():raise RuntimeError('permission_chain_symlink')
  owners=[]
  for u in users:
   if all(permissions(q,u['uid'],u['gids'])&1 for q in chain[:-1])and permissions(f,u['uid'],u['gids'])&4:owners.append(u)
  result.append({'path':str(f),'sha256':sha(f),'chain':[{'path':str(q),'uid':q.stat().st_uid,'gid':q.stat().st_gid,'mode':oct(stat.S_IMODE(q.stat().st_mode)),'acl':acl(q)}for q in chain],'readableBy':owners})
 return result
first=observe();second=observe()
if first!=second:raise RuntimeError('permission_observations_inconsistent')
base=json.loads(SOURCE.read_text());apps=base['apps'];rows=json.loads(subprocess.check_output(['/home/deploy/.npm-global/bin/pm2','jlist'],env={**os.environ,'PATH':'/usr/bin:/bin'},text=True,timeout=5))
original=next(a['env']for a in apps if a['name']=='re7-whatsapp-agent');live=next(r['pm2_env']for r in rows if r['name']=='re7-whatsapp-agent')
records=[]
for key,category in KEYS.items():
 value=original.get(key)
 if not isinstance(value,str)or not value or live.get(key)!=value:raise RuntimeError('required_original_live_secret_drift')
 records.append({'key':key,'category':category,'value':value,'configuredConsumers':[a['name']for a in apps if a.get('env',{}).get(key)==value],'otherConfiguredConsumers':[a['name']for a in apps if key in a.get('env',{})and a['env'][key]!=value]})
ledger=Path('/var/lib/re7/campaign-operations/state.json');g=json.loads(ledger.read_text())
assert g['open']is False and g['generation']==38 and g['tasks']=={} and not any(os.path.lexists(str(ledger)+suffix)for suffix in ['.lock','.uncertain'])
assert next(a['env']for a in apps if a['name']=='re7-whatsapp-agent')['WHATSAPP_WEB_WORKER_CONTROL_TOKEN']==next(a['env']for a in apps if a['name']=='re7-whatsapp-web-worker')['WHATSAPP_WEB_WORKER_CONTROL_TOKEN']
print(json.dumps({'mode':'READ_ONLY_PRIVATE_INVENTORY','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceConfigSha256':sha(SOURCE),'sourceConfig':base,'records':records,'appIdentifiers':{k:v for k,v in original.items()if k.endswith('APP_ID')},'permissionsSamples':[first,second],'guardSha256':sha(ledger),'guard':{'open':False,'generation':38,'tasks':{}},'identities':[{'name':r['name'],'pid':r['pid'],'restarts':r['pm2_env']['restart_time']}for r in rows],'providerQueried':False}))
