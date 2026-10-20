#!/usr/bin/env python3
"""End-to-end fixtures for Deploy V2 using only an inert command shim."""
from __future__ import annotations
import hashlib,json,os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
EXECUTOR=ROOT/'scripts/deploy-v2.py';ADAPTER=ROOT/'scripts/deploy-v2-pm2-adapter.py'
MANIFEST=ROOT/'docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_DEPLOY_V2.json'
ACTIONS=['capture','select_api','verify_api','select_frontend','verify_frontend','activate_frontend_supervision','verify_worker','verify_acceptance','save_pm2']
ROLLBACK=['rollback_frontend','rollback_api','verify_rollback']
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write_json(p,v):Path(p).write_text(json.dumps(v,sort_keys=True),encoding='utf-8')
def read_actions(p):return p.read_text().splitlines() if p.exists() else []
with tempfile.TemporaryDirectory(prefix='deploy-v2-fixture-') as temporary:
 t=Path(temporary);log=t/'commands.log';shim=t/'pm2-curl-supervision-shim.py'
 adapter_source=ADAPTER.read_text(encoding='utf-8')
 for forbidden in ('crm-contacts-list-recovery','f5028de1','bt9-BI1dCQD7_gj8ktOvz','a9966758','1601629'):
  assert forbidden not in adapter_source
 shim.write_text("""#!/usr/bin/env python3
import json,sys
from pathlib import Path
action,scenario,log=sys.argv[1:4]
with Path(log).open('a') as stream:stream.write(action+'\\n')
deny={'capture-deny':'capture','select-api-deny':'select_api','verify-api-deny':'verify_api','select-frontend-deny':'select_frontend','verify-frontend-deny':'verify_frontend','supervision-deny':'activate_frontend_supervision','worker-deny':'verify_worker','acceptance-deny':'verify_acceptance','rollback-critical':'verify_frontend'}.get(scenario)
if scenario=='rollback-critical' and action=='rollback_frontend':deny=action
failed=action==deny
print(json.dumps({'result':'DENY' if failed else 'PASS','reason':'FIXTURE_DENIAL' if failed else None}))
raise SystemExit(1 if failed else 0)
""",encoding='utf-8');shim.chmod(0o700);shim_sha=digest(shim)
 def binding(scenario,release='crm-contacts-list-recovery-f5028de1'):
  plans={a:[{'argv':[str(shim),a,scenario,str(log)],'executableSha256':shim_sha,'timeoutSeconds':10}] for a in ACTIONS+ROLLBACK}
  return {'schemaVersion':1,'releaseId':release,'processes':{'api':'fixture-api','frontend':'fixture-frontend','worker':'fixture-worker'},'staging':{'root':'/fixture/staging'},'api':{'candidateRuntime':'/fixture/api','entrypoint':'/fixture/api/index.js','entrypointSha256':'1'*64,'port':3001,'health':['http://127.0.0.1/health']},'frontend':{'candidateRuntime':'/fixture/frontend','buildId':'fixture','launcher':'/fixture/launcher','control':'/fixture/control','journal':'/fixture/journal','marker':'/fixture/marker'},'worker':{'identity':'captured'},'pm2':{'dump':'/fixture/dump','rollback':'/fixture/rollback'},'supervision':{'policy':'/fixture/policy','commands':['allowlisted']},'destinations':{'snapshot':'/fixture/snapshot','journal':'/fixture/events','report':'/fixture/report'},'acceptance':{'mode':'GET_ONLY_TENANT_SCOPED','forbidPost':True,'credentialReference':'/fixture/private-auth'},'actions':plans}
 def authorization(bp,decision='AUTHORIZED',**overrides):
  v={'schemaVersion':1,'decision':decision,'releaseId':'crm-contacts-list-recovery-f5028de1','manifestSha256':digest(MANIFEST),'executorSha256':digest(EXECUTOR),'adapterSha256':digest(ADAPTER),'bindingSha256':digest(bp),'notAfterUtc':'2099-01-01T00:00:00Z'};v.update(overrides)
  p=t/f"authorization-{len(list(t.glob('authorization-*.json')))}.json";write_json(p,v);return p
 def invoke(scenario,expected,binding_value=None,auth_overrides=None,decision='AUTHORIZED',arg_overrides=None):
  log.write_text('');bp=t/f"binding-{scenario}-{len(list(t.glob('binding-*.json')))}.json";write_json(bp,binding_value or binding(scenario));auth=authorization(bp,decision,**(auth_overrides or {}));root=t/f"run-{scenario}-{len(list(t.glob('run-*')))}"
  values={'adapter_sha':digest(ADAPTER),'binding_sha':digest(bp),'authorization_sha':digest(auth)};values.update(arg_overrides or {})
  cmd=[str(EXECUTOR),'--manifest',str(MANIFEST),'--execute','--adapter',str(ADAPTER),'--adapter-sha256',values['adapter_sha'],'--binding',str(bp),'--binding-sha256',values['binding_sha'],'--authorization',str(auth),'--authorization-sha256',values['authorization_sha'],'--work-dir',str(root)]
  result=subprocess.run(cmd,text=True,capture_output=True,check=False,env=os.environ.copy());assert result.returncode==expected,(scenario,result.stdout,result.stderr);return result,root,bp,auth
 plan=subprocess.run([str(EXECUTOR),'--manifest',str(MANIFEST)],text=True,capture_output=True,check=False);assert plan.returncode==0 and 'DEPLOY_V2_PLAN_OK' in plan.stdout and not log.exists()
 success,success_root,success_bp,success_auth=invoke('success',0);assert 'DEPLOY_V2_EXECUTION_PASS' in success.stdout and read_actions(log)==ACTIONS
 success_result=json.loads((success_root/'result.json').read_text());assert success_result['pm2SavedExactlyOnce'] is True and read_actions(log).count('save_pm2')==1
 before=log.read_text();replay=subprocess.run([str(EXECUTOR),'--manifest',str(MANIFEST),'--execute','--adapter',str(ADAPTER),'--adapter-sha256',digest(ADAPTER),'--binding',str(success_bp),'--binding-sha256',digest(success_bp),'--authorization',str(success_auth),'--authorization-sha256',digest(success_auth),'--work-dir',str(success_root)],text=True,capture_output=True,check=False);assert replay.returncode==64 and log.read_text()==before
 invoke('authorization-denied',64,decision='DENIED');assert not read_actions(log)
 for name,kwargs in [('manifest-sha',{'auth_overrides':{'manifestSha256':'0'*64}}),('executor-sha',{'auth_overrides':{'executorSha256':'0'*64}}),('adapter-auth-sha',{'auth_overrides':{'adapterSha256':'0'*64}}),('binding-auth-sha',{'auth_overrides':{'bindingSha256':'0'*64}}),('adapter-arg-sha',{'arg_overrides':{'adapter_sha':'0'*64}}),('binding-arg-sha',{'arg_overrides':{'binding_sha':'0'*64}})]:invoke(name,64,**kwargs);assert not read_actions(log)
 invoke('other-release',64,binding_value=binding('other-release','another-release'));assert not read_actions(log)
 bad_executable=binding('command-executable-sha');bad_executable['actions']['capture'][0]['executableSha256']='0'*64
 invoke('command-executable-sha',1,binding_value=bad_executable);assert not read_actions(log)
 expected={'capture-deny':['capture'],'select-api-deny':['capture','select_api','rollback_api','verify_rollback'],'verify-api-deny':['capture','select_api','verify_api','rollback_api','verify_rollback'],'select-frontend-deny':ACTIONS[:4]+ROLLBACK,'verify-frontend-deny':ACTIONS[:5]+ROLLBACK,'supervision-deny':ACTIONS[:6]+ROLLBACK,'worker-deny':ACTIONS[:7]+ROLLBACK,'acceptance-deny':ACTIONS[:8]+ROLLBACK}
 for scenario,calls in expected.items():
  _,root,_,_=invoke(scenario,1);assert read_actions(log)==calls and 'save_pm2' not in read_actions(log);assert json.loads((root/'result.json').read_text())['status']=='ROLLED_BACK'
 _,critical_root,_,_=invoke('rollback-critical',2);critical=json.loads((critical_root/'result.json').read_text());assert critical['status']=='ROLLBACK_CRITICAL' and 'save_pm2' not in read_actions(log)
print('DEPLOY_V2_PRODUCTION_ADAPTER_FIXTURES_PASS')
