"""Future one-use paid probes, explicit decision only. Never invoked by preparation."""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
from openai_contract import check,write,read,require,sha

def run(p,phase,decision):
 p=Path(p);require(decision=='--owner-authorized-synthetic-provider-validation','provider_validation_not_authorized');check(p,live=True)
 q=p/'window'/('provider-'+phase);require(not q.exists(),'provider_probe_consumed_no_retry');q.mkdir(mode=0o700)
 write(q/'intent.private.json',{'phase':phase,'contractSha256':sha(p/'window/openai-contract.private.json'),'plannedRequests':2,'maximumSdkHttpAttempts':4,'sdkRetriesUnchanged':True,'automaticRetry':False,'messageSend':False})
 cfg=read(p/'window/target.profile.private.json');api=next(a for a in cfg['apps']if a['name']=='re7-whatsapp-agent')
 node=api.get('interpreter','/usr/bin/node');node='/usr/bin/node'if node=='node'else node
 env={k:v for k,v in os.environ.items()if k in ('PATH','HOME','LANG','LC_ALL','TMPDIR')};env['NODE_ENV']='production'
 with(q/'stdout.private').open('x')as out,(q/'stderr.private').open('x')as err:r=subprocess.run([node,str(p/'window/provider_probe.cjs'),str(p),phase],stdout=out,stderr=err,env=env,timeout=150)
 require(r.returncode==0,'functional_provider_denied_inspect_only');v=json.loads((q/'stdout.private').read_text());require(v['result']=='OPENAI_FUNCTIONAL_ENDPOINTS_PASS'and v['phase']==phase,'provider_schema_invalid')
 write(q/'receipt.private.json',{'result':'OPENAI_FUNCTIONAL_ENDPOINTS_PASS','phase':phase,'intentSha256':sha(q/'intent.private.json'),'contractSha256':sha(p/'window/openai-contract.private.json'),'targetProfileSha256':sha(p/'window/target.profile.private.json'),'providerResult':v});print(json.dumps(v))
if __name__=='__main__':
 os.umask(0o077)
 try:run(*sys.argv[1:])
 except BaseException as e:print(json.dumps({'result':'PROVIDER_VALIDATION_DENY','errorClass':type(e).__name__,'noAutomaticRetry':True}));sys.exit(1)
