"""Private, unapplied proposals only. Does not source dotenv, connect DB or execute jobs."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(original,profile,expected_profile_sha,out):
 original=Path(original);profile=Path(profile);out=Path(out)
 if sha(profile)!=expected_profile_sha:raise RuntimeError('sealed_profile_hash_drift')
 if out.exists():raise RuntimeError('new_private_destination_required')
 apps=json.loads(profile.read_text())['apps'];api=next(a for a in apps if a['name']=='re7-whatsapp-agent');worker=next(a for a in apps if a['name']=='re7-whatsapp-web-worker')
 keys=['ADMIN_TOKEN','APP_AUTH_SECRET','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL']
 env=api['env'];assert all(type(env.get(k))is str and env[k]for k in keys)
 for k in ['APP_AUTH_SECRET','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL']:assert worker['env'][k]==env[k]
 spec=importlib.util.spec_from_file_location('renderer',HERE.parent/'cipher-volatile-protocol-20261014/env_selective_review.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 os.umask(0o077);out.mkdir(mode=0o700);raw=original.read_bytes();rows=[]
 for name,selected in [('auth-only',keys[:3]),('database-only',['DATABASE_URL'])]:
  proposed,effects=m.propose(raw,sha(original),{k:env[k]for k in selected},'legacy-api',True)
  dest=out/(name+'.env.private');dest.write_bytes(proposed);dest.chmod(0o600)
  rows.append({'proposal':dest.name,'sha256':sha(dest),'variables':selected,'applyAuthorized':False,'status':'BLOCKED_CONSUMER_EFFECT_REVIEW','reactivatesPrismaSQL':name=='database-only'})
 (out/'proposal-index.private.json').write_text(json.dumps({'sourceSha256':sha(original),'profileSha256':sha(profile),'proposals':rows,'preservedOtherLines':True,'mutations':False},indent=2))
 print(json.dumps({'result':'PRIVATE_ENV_PROPOSALS_NOT_APPLIED','proposals':2,'databaseReactivationBlocked':True,'credentialsPrinted':False}))
if __name__=='__main__':main(*sys.argv[1:])
