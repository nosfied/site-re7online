"""Bounded LOCAL read-only audit. Emits field names, metadata and blob hashes only.
No raw output/config/auth token or per-secret hash is emitted. No network/write.
"""
import datetime,hashlib,json,re,sqlite3,stat,tomllib
from pathlib import Path
HOME=Path('/home/deifson-oliveira');CODEX=HOME/'.codex'
SESSION='01a0defe-3126-7dc2-8f24-a4b5c46fc43a'
ROLLOUT=CODEX/'sessions/2026/09/26'/('rollout-2026-09-26T15-33-15-'+SESSION+'.jsonl')
ITEM='exec-c291e4ac-6551-482b-b718-dc81bc1e8f5d'
KEYS=['ADMIN_TOKEN','APP_AUTH_SECRET','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL','CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY','META_APP_SECRET','META_INSTAGRAM_APP_SECRET','META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET','META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET','OPENAI_API_KEY','WHATSAPP_ACCESS_TOKEN','WHATSAPP_VERIFY_TOKEN']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def pairs(text):return {json.loads(a):json.loads(b)for a,b in re.findall(r'("[A-Z][A-Z0-9_]*")\s*:\s*("(?:[^"\\]|\\.)*")',text)}
def metadata(p):
 s=p.lstat();return {'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'gid':s.st_gid,'hardlinks':s.st_nlink,'symlink':p.is_symlink()}
def audit():
 lines={}
 for n,line in enumerate(ROLLOUT.open(),1):
  if n in (81765,81766,81768):lines[n]=line
  if n==81768:break
 call=json.loads(lines[81765]);out=json.loads(lines[81768]);visible=json.loads(out['payload']['output'][1]['text'])['output'];ui=json.loads(lines[81766])['payload']['item']['aggregated_output']
 with sqlite3.connect('file:'+str(CODEX/'thread_history_1.sqlite')+'?mode=ro',uri=True)as db:
  row=db.execute('SELECT item_json FROM thread_items WHERE item_id=? AND thread_id=?',(ITEM,SESSION)).fetchone()
 item=json.loads(row[0]);raw=item['aggregatedOutput'];old=pairs(raw);model=pairs(visible)
 assert raw==ui and all(k in old and old[k]for k in KEYS)
 gemini=HOME/'.config/Code/logs/20261012T120406/window1/exthost/output_logging_20261012T120408/3-Gemini Code Assist.log';line=gemini.read_text(errors='replace').splitlines()[8];payload=json.JSONDecoder().raw_decode(line[line.find('{'):])[0];env={}
 for text in payload['textDocument']['text'].splitlines():
  m=re.match(r'([A-Z][A-Z0-9_]*)\s*=\s*(.*)',text.strip())
  if m:env[m[1]]=m[2].strip().strip('\"\x27')
 config=tomllib.loads((CODEX/'config.toml').read_text());auth=json.loads((CODEX/'auth.json').read_text())
 source=Path(__file__).resolve().parents[5]/'local-evidence/openai-operational-20261015/incident-6683-v4-security-openai-v4-20261015T203000Z/window/source.profile.private.json';profile=json.loads(source.read_text());current=next(a for a in profile['apps']if a['name']=='re7-whatsapp-agent')['env']
 return {'result':'SANITIZED_LOCAL_EXPOSURE_SCOPE_AUDIT','observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sessionId':SESSION,'callId':call['payload']['call_id'],'callUtc':call['timestamp'],'outputUtc':out['timestamp'],'eventBlobSha256':{str(n):sha(v.encode())for n,v in lines.items()},'localFullOutput':{'bytes':len(raw.encode()),'sha256':sha(raw.encode()),'dbAndRolloutEqual':True,'slots':KEYS,'distinctOriginalSlotValues':len(set(old[k]for k in KEYS)),'additionalPrivateVapidFieldPresent':bool(old.get('WEB_PUSH_VAPID_PRIVATE_KEY'))},'modelToolOutput':{'bytes':len(visible.encode()),'sha256':sha(visible.encode()),'truncated':True,'completeMatchingSlots':[k for k in KEYS if model.get(k)==old[k]],'scope':'recorded_model_input_not_packet_capture'},'gemini':{'event':'textDocument/didOpen','localTimeFromLog':'2026-10-12T12:04:24.283524','line':9,'lineSha256':sha(line.encode()),'sourceFile':'apps/whatsapp-agent/.env','exactMatchingSlotNames':[k for k in KEYS if k in env and env[k]==old[k]],'otherCredentialFieldsPresent':['APP_AUTH_SECRET','DATABASE_URL'],'otherCredentialFieldsEqualPostCipherProfile':{k:env[k]==current[k]for k in ('APP_AUTH_SECRET','DATABASE_URL')},'remoteTransmissionProven':False},'retainedPostCipherProfileComparison':{'freshLiveCapture':False,'equalsOriginal':{k:current.get(k)==old.get(k)for k in KEYS+['WEB_PUSH_VAPID_PRIVATE_KEY']}},'currentConfig':{'model':config.get('model'),'customModelProvidersConfigured':bool(config.get('model_providers')),'customOtelConfigured':'otel'in config,'analyticsExplicitlyConfigured':'analytics'in config,'authApiKeyPresent':bool(auth.get('OPENAI_API_KEY')),'authOAuthTokenFieldsPresent':bool(auth.get('tokens'))},'permissionsCurrent':{'home':metadata(HOME),'codexDirectory':metadata(CODEX),'rollout':metadata(ROLLOUT),'historyDb':metadata(CODEX/'thread_history_1.sqlite'),'geminiLog':metadata(gemini)},'unauthorizedAccessProven':False,'absenceOfUnauthorizedAccessProven':False,'productionAccess':False,'configurationChanged':False,'historyDeleted':False}
if __name__=='__main__':print(json.dumps(audit(),sort_keys=True,indent=2))
