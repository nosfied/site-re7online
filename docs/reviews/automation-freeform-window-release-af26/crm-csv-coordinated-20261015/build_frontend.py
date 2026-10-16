"""Build only the locally composed source using the already attested public build inputs."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--generation',required=True);v=a.parse_args();out=Path(v.generation).resolve();build=out/'frontend-build'
 assert (out/'source-plan.private.json').is_file() and not (out/'frontend-build.intent.private.json').exists()
 source=ROOT/'local-evidence/cipher-controls-prisma-20261015/incident-6683-v4-security-cipher-controls-v14-20261015T130000Z/window/frontend-build-env.private.json'
 values=json.loads(source.read_text());assert all(k.startswith('NEXT_PUBLIC_')or k in ('NODE_ENV','NEXT_TELEMETRY_DISABLED')for k in values)
 assert not list(build.glob('.env*')) and not (build/'.next').exists()
 node=ROOT/'local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node'
 env={k:str(x)for k,x in values.items()};env.update(PATH=str(node.parent)+':/usr/bin:/bin',NEXT_TELEMETRY_DISABLED='1')
 intent={'buildInputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'environmentNamesOnly':sorted(env),'command':['node20','next','build','--webpack'],'runtimePublicInputsReused':True,'newSecrets':False,'testsExcludedFromProductionTypecheck':True}
 with(out/'frontend-build.intent.private.json').open('x')as f:json.dump(intent,f)
 with(out/'frontend-build.private.log').open('x')as log:
  r=subprocess.run([str(node),str(ROOT/'node_modules/next/dist/bin/next'),'build','--webpack'],cwd=build,env=env,stdout=log,stderr=log)
 assert r.returncode==0,'frontend_build_denied_inspect_private_log_no_retry'
 print(json.dumps({'result':'FRONTEND_BUILD_LOCAL_PASS','node':'20.20.0','buildId':(build/'.next/BUILD_ID').read_text().strip(),'environmentValuesPrinted':False}))
