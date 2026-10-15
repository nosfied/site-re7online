"""Read-only SQL aggregate and private source capture. Never calls a retention CLI/dry-run."""
import datetime,hashlib,json,os,stat,subprocess,sys
from pathlib import Path
APP=Path('/opt/re7online/site-re7online/apps/whatsapp-agent')
SOURCES=['scripts/run-retention.ts','src/privacy/privacyRetentionService.ts','src/config/env.ts','src/db.ts','package.json','prisma/schema.prisma']
def main():
 os.umask(0o077);q=Path(sys.argv[1]);q.mkdir(mode=0o700)
 source=[]
 for n in SOURCES+['.env']:
  p=APP/n;s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()
  raw=p.read_bytes();target=q/('source-'+n.replace('/','_')+'.private');target.write_bytes(raw)
  source.append({'path':str(p),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'evidence':target.name})
 actual=next(v for v in source if v['path'].endswith('/src/privacy/privacyRetentionService.ts'))
 assert actual['sha256']=='33d36d97e189442baa65a357544ef274d6ac31ce5cdf5a7b0ccd21cb72c14740','effective_retention_source_changed'
 sql=Path(sys.argv[2]).read_bytes()
 with(q/'sql.stdout.private').open('xb')as out,(q/'sql.stderr.private').open('xb')as err:
  r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=sql,stdout=out,stderr=err,timeout=25)
 assert r.returncode==0,'readonly_sql_failed'
 value=json.loads((q/'sql.stdout.private').read_text());assert value['readOnly']=='on'
 (q/'audit.private.json').write_text(json.dumps({'result':'PRISMA_POLICY_READ_ONLY_AUDIT','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':source,'sqlSha256':hashlib.sha256(sql).hexdigest(),'sqlReadOnly':True,'retentionFunctionExecuted':False,'dotenvSourced':False,'mutations':False},indent=2))
 print(json.dumps({'result':'PRISMA_POLICY_READ_ONLY_AUDIT','tenants':len(value['tenants']),'sqlReadOnly':True,'retentionExecuted':False,'dotenvChanged':False}))
if __name__=='__main__':main()
