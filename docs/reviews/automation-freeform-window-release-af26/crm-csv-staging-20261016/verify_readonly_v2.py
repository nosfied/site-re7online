"""Concrete read-only preparatory chain. Does not call operational preflight/admission."""
import datetime,hashlib,json,os,subprocess,sys
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z')
I=P.parent/'csv-staging-incoming-20261016T092610Z'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    os.umask(0o077);receipt=json.loads((I/'canonical-v2.receipt.private.json').read_text());assert receipt['result']=='CANONICAL_CSV_CONTROLS_STAGED_RUNTIME_REUSED'and receipt['generation']==P.name
    d=I/'preparatory-readonly-v2';d.mkdir(mode=0o700);cases=[]
    commands=[('concrete_package',['python3','-B',str(P/'verify-package.py')]),('ecosystems',['python3','-B',str(P/'window/ecosystem_contract.py'),'validate',str(P)]),('baselines',['python3','-B',str(P/'window/baseline_contract.py'),str(P)]),('current_cli',['python3','-B',str(P/'window/check_current.py'),str(P),'before'])]
    commands.append(('schema_frontier',['python3','-B','-c','import subprocess,json,hashlib;from pathlib import Path;p=Path(\'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z\');r=subprocess.check_output([\'docker\',\'exec\',\'-i\',\'wa-agent-postgres\',\'psql\',\'-X\',\'-U\',\'wa_agent\',\'-d\',\'whatsapp_agent\',\'-Atq\',\'-v\',\'ON_ERROR_STOP=1\'],input=\'BEGIN READ ONLY;\\nSET LOCAL TIME ZONE \\\'UTC\\\';\\nSELECT json_build_object(\\\'columns\\\',(SELECT json_agg(json_build_array(table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default)ORDER BY table_name,ordinal_position)FROM information_schema.columns WHERE table_schema=\\\'public\\\'),\\\'constraints\\\',(SELECT json_agg(json_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid))ORDER BY c.relname,k.conname)FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\\\'public\\\'),\\\'migrations\\\',(SELECT json_agg(json_build_object(\\\'id\\\',id,\\\'checksum\\\',checksum,\\\'migration_name\\\',migration_name,\\\'started_at\\\',started_at,\\\'finished_at\\\',finished_at,\\\'rolled_back_at\\\',rolled_back_at,\\\'applied_steps_count\\\',applied_steps_count)ORDER BY id)FROM "_prisma_migrations"));\\nROLLBACK;\\n\',text=True,timeout=30);v=json.loads(r);h=hashlib.sha256(json.dumps(v,sort_keys=True,separators=(\',\',\':\')).encode()).hexdigest();assert h==json.loads((p/\'window/restore-contract.private.json\').read_text())[\'schemaFrontierSha256\'],\'schema_frontier_drift\';print(json.dumps({\'result\':\'LIVE_SCHEMA_RESTORE_FRONTIER_MATCH\',\'schemaDigest\':h,\'backupExecuted\':False}))']))
    commands += [('restore_'+m,['python3','-B',str(P/'window/restore_contract.py'),str(P/m)])for m in ('switch','return','return-partial','return-before-commit')]
    for label,cmd in commands:
        with(d/(label+'.stdout.private')).open('x')as out,(d/(label+'.stderr.private')).open('x')as err:
            try:r=subprocess.run(cmd,stdout=out,stderr=err,timeout=120);code=r.returncode
            except subprocess.TimeoutExpired:code=124
        cases.append({'consumer':label,'exitCode':code,'stdoutSha256':sha(d/(label+'.stdout.private')),'stderrSha256':sha(d/(label+'.stderr.private'))})
    result={'result':'READONLY_PREPARATION_PASS'if all(c['exitCode']==0 for c in cases)else'READONLY_PREPARATION_DENY','cases':cases,'reviewSha256':sha(P/'preparation-review.sha256'),'backupRenewed':False,'rootShortCapture':False,'gates':json.loads((P/'window/execution-gates.private.json').read_text()),'executionAuthorized':(P/'execution-authorized').read_text().strip(),'policyInstalled':False,'processActions':0,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    f=d/'result.private.json';f.write_text(json.dumps(result,sort_keys=True)+'\n');f.chmod(0o600)
    print(json.dumps({k:v for k,v in result.items()if k not in ('cases','gates') }|{'checks':len(cases),'failed':[c['consumer']for c in cases if c['exitCode']],'gatesFalse':all(x is False for x in result['gates'].values())}))
if __name__=='__main__':main()
